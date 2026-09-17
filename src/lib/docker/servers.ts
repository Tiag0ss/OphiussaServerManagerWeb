import { and, eq } from "drizzle-orm";
import { rmSync, mkdirSync, existsSync } from "fs";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import {
  allocations,
  backups,
  schedules,
  serverMods,
  serverPermissions,
  servers,
  users,
} from "../db/schema";
import { getSettings } from "../settings";
import { applyBinds } from "../templates/apply-binds";
import {
  defaultConfigFromTemplate,
  getTemplate,
  mergeConfigWithDefaults,
} from "../templates/load";
import type { GameTemplate } from "../templates/types";
import { serverBackupDir, serverDataDir, hostServerDataDir } from "../paths";
import {
  ensureGameNetwork,
  getDocker,
  connectContainerToGameNetwork,
  CONTAINER_DNS,
  isDockerDesktopEngine,
  LABEL_MANAGED,
  LABEL_NETWORK_MODE,
  LABEL_OWNER,
  LABEL_SERVER_ID,
  LABEL_SERVER_NAME,
  LABEL_TEMPLATE,
  NETWORK_NAME,
} from "./client";
import { withServerLock } from "./locks";
import { sendRcon } from "../rcon/client";

/** Docker container names: [a-zA-Z0-9][a-zA-Z0-9_.-]* and typically ≤63 chars. */
function dockerSlug(value: string, max = 20): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return s || "x";
}

/**
 * Explicit name: ophiussa-{game}-{owner}-{server}-{id8}
 * e.g. ophiussa-valheim-tiago-viking-kgSoYsaQ
 */
export function buildContainerName(opts: {
  templateId: string;
  ownerName: string;
  serverName: string;
  serverId: string;
}): string {
  const id8 = opts.serverId.slice(0, 8);
  const parts = [
    "ophiussa",
    dockerSlug(opts.templateId, 16),
    dockerSlug(opts.ownerName, 16),
    dockerSlug(opts.serverName, 20),
    id8,
  ];
  let name = parts.join("-");
  if (name.length > 63) {
    name = [
      "ophiussa",
      dockerSlug(opts.templateId, 12),
      dockerSlug(opts.ownerName, 12),
      dockerSlug(opts.serverName, 12),
      id8,
    ].join("-");
  }
  return name.slice(0, 63);
}

/** Remove every managed container for this server (by label + legacy name). */
export async function removeServerContainers(serverId: string) {
  const docker = getDocker();
  const seen = new Set<string>();

  const byLabel = await docker
    .listContainers({
      all: true,
      filters: { label: [`${LABEL_SERVER_ID}=${serverId}`] },
    })
    .catch(() => []);

  for (const c of byLabel) {
    seen.add(c.Id);
    await docker.getContainer(c.Id).remove({ force: true }).catch(() => undefined);
  }

  // Legacy short name from earlier versions
  const legacy = `ophiussa-${serverId.slice(0, 8)}`;
  try {
    const info = await docker.getContainer(legacy).inspect();
    if (!seen.has(info.Id)) {
      await docker.getContainer(info.Id).remove({ force: true }).catch(() => undefined);
    }
  } catch {
    /* not found */
  }
}

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function allocatePorts(
  tpl: GameTemplate,
  serverId: string,
  opts?: {
    ownerId?: string;
    preferred?: Record<string, number>;
  },
) {
  const db = getDb();
  const server =
    opts?.ownerId
      ? null
      : db.select().from(servers).where(eq(servers.id, serverId)).get();
  const ownerId = opts?.ownerId || server?.ownerId;
  if (!ownerId) throw new Error("Server owner required for port allocation");

  const {
    getUserPortRange,
    getUsedHostPorts,
    resolveHostPorts,
  } = await import("../port-alloc");

  const range = getUserPortRange(ownerId);
  const used = getUsedHostPorts(serverId);
  const resolved = resolveHostPorts(tpl, range, used, opts?.preferred);
  const created = [];

  for (const p of resolved) {
    const row = {
      id: nanoid(),
      serverId,
      hostPort: p.hostPort,
      containerPort: p.container,
      protocol: p.protocol,
      key: p.key,
    };
    db.insert(allocations).values(row).run();
    created.push(row);
  }
  return created;
}

/** Replace all allocations for a server (used when editing ports). */
export async function reallocatePorts(
  serverId: string,
  preferred: Record<string, number>,
) {
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
  if (!server) throw new Error("Server not found");
  const tpl = getTemplate(server.templateId);
  if (!tpl) throw new Error("Template not found");

  // A manually-configured RCON port isn't part of the template's own port
  // list, so it would otherwise be dropped by the wholesale delete below.
  const manualRcon = server.rconEnabled
    ? db
        .select()
        .from(allocations)
        .where(and(eq(allocations.serverId, serverId), eq(allocations.key, "rcon")))
        .get()
    : null;

  db.delete(allocations).where(eq(allocations.serverId, serverId)).run();
  const created = await allocatePorts(tpl, serverId, {
    ownerId: server.ownerId,
    preferred,
  });
  if (manualRcon) {
    db.insert(allocations).values(manualRcon).run();
    created.push(manualRcon);
  }
  return created;
}

/**
 * Publish (or unpublish) a manually-configured RCON port for a server whose
 * template has no native RCON support (e.g. added via a mod). Reuses the
 * `allocations` table under the same "rcon" key the native RCON path uses,
 * so `sendRcon` needs no special-casing — host and container port are the
 * same value since we don't know the template's own port scheme.
 */
export async function setManualRconPort(serverId: string, port: number | null) {
  const db = getDb();
  db.delete(allocations)
    .where(and(eq(allocations.serverId, serverId), eq(allocations.key, "rcon")))
    .run();
  if (port != null) {
    db.insert(allocations)
      .values({
        id: nanoid(),
        serverId,
        hostPort: port,
        containerPort: port,
        protocol: "tcp",
        key: "rcon",
      })
      .run();
  }
}

export async function createServerContainer(serverId: string) {
  return withServerLock(serverId, () => createServerContainerUnlocked(serverId));
}

/** Must only be called while holding the server lock (or when no concurrent ops). */
async function createServerContainerUnlocked(serverId: string) {
    const db = getDb();
    const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
    if (!server) throw new Error("Server not found");
    const tpl = getTemplate(server.templateId);
    if (!tpl) throw new Error("Template not found");
    const owner = db.select().from(users).where(eq(users.id, server.ownerId)).get();
    const ownerLabel =
      owner?.name?.trim() ||
      owner?.email?.split("@")[0] ||
      server.ownerId.slice(0, 8);

    const settings = getSettings();
    const config = mergeConfigWithDefaults(
      tpl,
      JSON.parse(server.configJson) as Record<string, unknown>,
    );
    const dataDir = serverDataDir(serverId);
    mkdirSync(dataDir, { recursive: true });
    const applied = applyBinds(tpl, config, dataDir);
    const bindHostPath = hostServerDataDir(serverId);

    let ports = db
      .select()
      .from(allocations)
      .where(eq(allocations.serverId, serverId))
      .all();
    if (ports.length === 0) {
      ports = await allocatePorts(tpl, serverId);
    }

    const docker = getDocker();
    // Avoid "name already in use" / stale containerId after failed recreates
    await removeServerContainers(serverId);
    db.update(servers)
      .set({ containerId: null })
      .where(eq(servers.id, serverId))
      .run();

    await new Promise<void>((resolve, reject) => {
      docker.pull(
        tpl.runtime.image,
        (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (e: Error | null) =>
            e ? reject(e) : resolve(),
          );
        },
      );
    }).catch(async (pullErr: Error) => {
      // image may already exist locally
      try {
        await docker.getImage(tpl.runtime.image).inspect();
      } catch {
        console.error(`[docker] pull failed for ${tpl.runtime.image}:`, pullErr);
        throw new Error(
          `Failed to pull image ${tpl.runtime.image}: ${pullErr.message}`,
        );
      }
    });

    try {
      await docker.getImage(tpl.runtime.image).inspect();
    } catch {
      throw new Error(`Image not available: ${tpl.runtime.image}`);
    }

    const network = await ensureGameNetwork();
    const ExposedPorts: Record<string, object> = {};
    const PortBindings: Record<
      string,
      Array<{ HostIp: string; HostPort: string }>
    > = {};
    for (const p of ports) {
      const tplPort = tpl.runtime.ports.find((x) => x.key === p.key);
      const cPort = tplPort?.matchHost ? p.hostPort : p.containerPort;
      const key = `${cPort}/${p.protocol}`;
      ExposedPorts[key] = {};
      PortBindings[key] = [{ HostIp: "0.0.0.0", HostPort: String(p.hostPort) }];
    }

    const volumeMount = tpl.runtime.volumes[0]?.container || "/data";
    const envMap: Record<string, string> = { ...applied.env };
    // Images like Valheim drop privileges themselves via PUID/PGID — do not set Docker User
    // unless the template explicitly requests it (otherwise bootstrap fails with EPERM).
    envMap.PUID = String(settings.puid);
    envMap.PGID = String(settings.pgid);
    envMap.UID = String(settings.puid);
    envMap.GID = String(settings.pgid);
    if (settings.steamUsername && !envMap.USERNAME) {
      envMap.USERNAME = settings.steamUsername;
    }
    if (settings.steamPassword && !envMap.PASSWRD) {
      envMap.PASSWRD = settings.steamPassword;
    }
    if (applied.args.length) {
      envMap.ADDITIONAL_ARGS = applied.args.join(" ");
    }

    const containerName = buildContainerName({
      templateId: server.templateId,
      ownerName: ownerLabel,
      serverName: server.name,
      serverId,
    });

    const forceHost =
      !isDockerDesktopEngine() &&
      (process.env.DOCKER_NETWORK_MODE === "host" ||
        process.env.OPHIUSSA_NETWORK_MODE === "host");
    const forceBridge =
      isDockerDesktopEngine() ||
      process.env.DOCKER_NETWORK_MODE === "bridge" ||
      process.env.OPHIUSSA_NETWORK_MODE === "bridge";

    const applyListenPorts = (mode: "bridge" | "host") => {
      for (const tplPort of tpl.runtime.ports) {
        if (!tplPort.listenEnv) continue;
        if (mode === "bridge" && !tplPort.matchHost) continue;
        const alloc = ports.find((p) => p.key === tplPort.key);
        if (alloc) envMap[tplPort.listenEnv] = String(alloc.hostPort);
      }
    };

    const buildCreateOpts = (mode: "bridge" | "host") => {
      applyListenPorts(mode);
      const Env = Object.entries(envMap).map(([k, v]) => `${k}=${v}`);
      const opts: Parameters<typeof docker.createContainer>[0] = {
        name: containerName,
        Image: tpl.runtime.image,
        Env,
        Labels: {
          [LABEL_MANAGED]: "true",
          [LABEL_SERVER_ID]: serverId,
          [LABEL_TEMPLATE]: server.templateId,
          [LABEL_OWNER]: ownerLabel,
          [LABEL_SERVER_NAME]: server.name,
          [LABEL_NETWORK_MODE]: mode,
        },
        HostConfig: {
          Binds: [`${bindHostPath}:${volumeMount}`],
          Memory: server.memoryMb * 1024 * 1024,
          NanoCpus: Math.round(server.cpuLimit * 1e9),
          RestartPolicy: {
            Name:
              (tpl.runtime.restartPolicy as "unless-stopped") || "unless-stopped",
          },
          Dns: CONTAINER_DNS,
        },
        StopTimeout: tpl.runtime.stopTimeout ?? 60,
      };
      if (mode === "bridge") {
        opts.ExposedPorts = ExposedPorts;
        opts.HostConfig!.PortBindings = PortBindings;
        opts.HostConfig!.NetworkMode = network;
        opts.NetworkingConfig = {
          EndpointsConfig: {
            [network]: {
              Aliases: [serverId.slice(0, 8), dockerSlug(server.name, 24)],
            },
          },
        };
      } else {
        // Host netns: no Docker DNAT (works when host iptables/nft is broken).
        // Game must listen on allocated host ports via listenEnv.
        opts.HostConfig!.NetworkMode = "host";
      }
      if (tpl.runtime.user) opts.User = tpl.runtime.user;
      return opts;
    };

    const createOnce = async (mode: "bridge" | "host") => {
      const container = await timeout(
        docker.createContainer(buildCreateOpts(mode)),
        60_000,
        "create container",
      );
      if (mode === "bridge") {
        await connectContainerToGameNetwork(container.id).catch((e) => {
          console.warn("[docker] network connect:", e);
        });
        const info = await container.inspect();
        const attached = Boolean(
          info.NetworkSettings?.Networks?.[NETWORK_NAME],
        );
        if (!attached) {
          await container.remove({ force: true }).catch(() => undefined);
          throw new Error(
            "Container has no network endpoint (Docker port publish / iptables likely broken)",
          );
        }
      }
      return container;
    };

    let container;
    let usedMode: "bridge" | "host" = forceHost ? "host" : "bridge";
    try {
      if (forceHost) {
        container = await createOnce("host");
      } else {
        try {
          container = await createOnce("bridge");
          usedMode = "bridge";
        } catch (bridgeErr) {
          if (forceBridge) throw bridgeErr;
          console.warn(
            "[docker] bridge+ports failed, falling back to host network:",
            bridgeErr instanceof Error ? bridgeErr.message : bridgeErr,
          );
          usedMode = "host";
          container = await createOnce("host");
        }
      }
    } catch (e) {
      await removeServerContainers(serverId).catch(() => undefined);
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        msg.includes("Conflict") || msg.includes("already in use")
          ? `Container name conflict (${containerName}). Removed leftovers — try Recreate again.`
          : msg,
      );
    }

    if (usedMode === "host") {
      console.warn(
        `[docker] ${containerName} using host network (Docker port publishing unavailable on this host)`,
      );
    }

    db.update(servers)
      .set({
        containerId: container.id,
        status: "created",
        configJson: JSON.stringify(config),
        updatedAt: new Date(),
      })
      .where(eq(servers.id, serverId))
      .run();

    return container.id;
}

export async function startServer(serverId: string) {
  return withServerLock(serverId, async () => {
    const db = getDb();
    const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
    if (!server) throw new Error("Server not found");
    if (!server.containerId) {
      await createServerContainerUnlocked(serverId);
      const refreshed = db
        .select()
        .from(servers)
        .where(eq(servers.id, serverId))
        .get();
      if (!refreshed?.containerId) throw new Error("Failed to create container");
      await getDocker().getContainer(refreshed.containerId).start();
    } else {
      try {
        await getDocker().getContainer(server.containerId).start();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("no such container") || msg.includes("404")) {
          await createServerContainerUnlocked(serverId);
          const refreshed = db
            .select()
            .from(servers)
            .where(eq(servers.id, serverId))
            .get();
          if (!refreshed?.containerId) throw new Error("Failed to recreate");
          await getDocker().getContainer(refreshed.containerId).start();
        } else if (!msg.includes("already started")) {
          throw e;
        }
      }
    }
    db.update(servers)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(servers.id, serverId))
      .run();
  });
}

export async function stopServer(serverId: string, opts?: { kill?: boolean }) {
  return withServerLock(serverId, async () => {
    const db = getDb();
    const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
    if (!server?.containerId) return;
    const tpl = getTemplate(server.templateId);

    if (!opts?.kill && tpl?.rcon?.enabled && tpl.rcon.saveCommand) {
      try {
        await sendRcon(serverId, tpl.rcon.saveCommand);
        await new Promise((r) => setTimeout(r, 2000));
      } catch {
        /* continue with stop */
      }
    }

    const container = getDocker().getContainer(server.containerId);
    if (opts?.kill) {
      await container.kill().catch(() => undefined);
    } else {
      await container
        .stop({ t: tpl?.runtime.stopTimeout ?? 60 })
        .catch((e: Error) => {
          if (!String(e.message).includes("already stopped")) throw e;
        });
    }
    db.update(servers)
      .set({ status: "stopped", updatedAt: new Date() })
      .where(eq(servers.id, serverId))
      .run();
  });
}

export async function restartServer(serverId: string) {
  await stopServer(serverId);
  await startServer(serverId);
}

export async function deleteServerWipe(serverId: string) {
  return withServerLock(serverId, async () => {
    const db = getDb();
    const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
    if (!server) return;

    await removeServerContainers(serverId);

    const dataDir = serverDataDir(serverId);
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
    const bdir = serverBackupDir(serverId);
    if (existsSync(bdir)) rmSync(bdir, { recursive: true, force: true });

    db.delete(allocations).where(eq(allocations.serverId, serverId)).run();
    db.delete(backups).where(eq(backups.serverId, serverId)).run();
    db.delete(schedules).where(eq(schedules.serverId, serverId)).run();
    db.delete(serverMods).where(eq(serverMods.serverId, serverId)).run();
    db.delete(serverPermissions)
      .where(eq(serverPermissions.serverId, serverId))
      .run();
    db.delete(servers).where(eq(servers.id, serverId)).run();
  });
}

export async function getContainerStats(serverId: string) {
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
  if (!server?.containerId) return null;
  try {
    const stats = await getDocker()
      .getContainer(server.containerId)
      .stats({ stream: false });
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta =
      (stats.cpu_stats.system_cpu_usage || 0) -
      (stats.precpu_stats?.system_cpu_usage || 0);
    const cpuPercent =
      systemDelta > 0
        ? (cpuDelta / systemDelta) *
          (stats.cpu_stats.online_cpus || 1) *
          100
        : 0;
    const mem = stats.memory_stats.usage || 0;
    const memLimit = stats.memory_stats.limit || 1;
    return {
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      memoryMb: Math.round(mem / 1024 / 1024),
      memoryLimitMb: Math.round(memLimit / 1024 / 1024),
      memoryPercent: Math.round((mem / memLimit) * 1000) / 10,
    };
  } catch {
    return null;
  }
}

export async function pullLatestImage(serverId: string) {
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
  if (!server) throw new Error("Server not found");
  const tpl = getTemplate(server.templateId);
  if (!tpl) throw new Error("Template not found");
  const docker = getDocker();
  await new Promise<void>((resolve, reject) => {
    docker.pull(tpl.runtime.image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (pullErr: Error | null) => {
        if (pullErr) reject(pullErr);
        else resolve();
      });
    });
  });
}

export async function updateServerImage(serverId: string) {
  return withServerLock(serverId, async () => {
    await pullLatestImage(serverId);
    await stopServer(serverId).catch(() => undefined);
    await removeServerContainers(serverId);
    const db = getDb();
    db.update(servers)
      .set({ containerId: null, status: "stopped", updatedAt: new Date() })
      .where(eq(servers.id, serverId))
      .run();
    await createServerContainer(serverId);
    await startServer(serverId);
  });
}

export async function reconcileServers() {
  const db = getDb();
  const docker = getDocker();
  const all = db.select().from(servers).all();
  let containers: Awaited<ReturnType<typeof docker.listContainers>> = [];
  try {
    containers = await docker.listContainers({
      all: true,
      filters: { label: [`${LABEL_MANAGED}=true`] },
    });
  } catch {
    return;
  }

  const byServer = new Map<string, (typeof containers)[number]>();
  for (const c of containers) {
    const id = c.Labels?.[LABEL_SERVER_ID];
    if (id) byServer.set(id, c);
  }

  for (const server of all) {
    const info = byServer.get(server.id);
    if (!info) {
      if (server.status === "running") {
        db.update(servers)
          .set({ status: "stopped", updatedAt: new Date() })
          .where(eq(servers.id, server.id))
          .run();
      }
      continue;
    }
    const running = info.State === "running";
    const status = running ? "running" : "stopped";
    if (server.status !== status || server.containerId !== info.Id) {
      db.update(servers)
        .set({
          status,
          containerId: info.Id,
          updatedAt: new Date(),
        })
        .where(eq(servers.id, server.id))
        .run();
    }
  }
}

// Avoid unused import warning in some builds
void defaultConfigFromTemplate;
