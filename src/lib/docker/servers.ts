import { eq } from "drizzle-orm";
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
  LABEL_MANAGED,
  LABEL_SERVER_ID,
} from "./client";
import { withServerLock } from "./locks";
import { sendRcon } from "../rcon/client";

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

  db.delete(allocations).where(eq(allocations.serverId, serverId)).run();
  return allocatePorts(tpl, serverId, {
    ownerId: server.ownerId,
    preferred,
  });
}

export async function createServerContainer(serverId: string) {
  return withServerLock(serverId, async () => {
    const db = getDb();
    const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
    if (!server) throw new Error("Server not found");
    const tpl = getTemplate(server.templateId);
    if (!tpl) throw new Error("Template not found");

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
    }).catch(async () => {
      // image may already exist locally
      try {
        await docker.getImage(tpl.runtime.image).inspect();
      } catch {
        throw new Error(`Failed to pull image ${tpl.runtime.image}`);
      }
    });

    try {
      await docker.getImage(tpl.runtime.image).inspect();
    } catch {
      throw new Error(`Image not available: ${tpl.runtime.image}`);
    }

    const network = await ensureGameNetwork();
    const ExposedPorts: Record<string, object> = {};
    const PortBindings: Record<string, Array<{ HostPort: string }>> = {};
    for (const p of ports) {
      const key = `${p.containerPort}/${p.protocol}`;
      ExposedPorts[key] = {};
      PortBindings[key] = [{ HostPort: String(p.hostPort) }];
    }

    const volumeMount = tpl.runtime.volumes[0]?.container || "/data";
    const Env = Object.entries(applied.env).map(([k, v]) => `${k}=${v}`);
    // Images like Valheim drop privileges themselves via PUID/PGID — do not set Docker User
    // unless the template explicitly requests it (otherwise bootstrap fails with EPERM).
    Env.push(`PUID=${settings.puid}`, `PGID=${settings.pgid}`);
    if (applied.args.length) {
      Env.push(`ADDITIONAL_ARGS=${applied.args.join(" ")}`);
    }

    const createOpts: Parameters<typeof docker.createContainer>[0] = {
      name: `ophiussa-${serverId.slice(0, 8)}`,
      Image: tpl.runtime.image,
      Env,
      Labels: {
        [LABEL_MANAGED]: "true",
        [LABEL_SERVER_ID]: serverId,
      },
      ExposedPorts,
      HostConfig: {
        Binds: [`${bindHostPath}:${volumeMount}`],
        PortBindings,
        Memory: server.memoryMb * 1024 * 1024,
        NanoCpus: Math.round(server.cpuLimit * 1e9),
        RestartPolicy: {
          Name: (tpl.runtime.restartPolicy as "unless-stopped") || "unless-stopped",
        },
        NetworkMode: network,
      },
      StopTimeout: tpl.runtime.stopTimeout ?? 60,
    };
    if (tpl.runtime.user) {
      createOpts.User = tpl.runtime.user;
    }

    let container;
    try {
      container = await timeout(
        docker.createContainer(createOpts),
        60_000,
        "create container",
      );
    } catch (e) {
      // cleanup orphan if any
      try {
        const list = await docker.listContainers({
          all: true,
          filters: { label: [`${LABEL_SERVER_ID}=${serverId}`] },
        });
        for (const c of list) {
          await docker.getContainer(c.Id).remove({ force: true });
        }
      } catch {
        /* ignore */
      }
      throw e;
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
  });
}

export async function startServer(serverId: string) {
  return withServerLock(serverId, async () => {
    const db = getDb();
    const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
    if (!server) throw new Error("Server not found");
    if (!server.containerId) {
      await createServerContainer(serverId);
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
          await createServerContainer(serverId);
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

    const docker = getDocker();
    if (server.containerId) {
      try {
        const c = docker.getContainer(server.containerId);
        await c.stop({ t: 10 }).catch(() => undefined);
        await c.remove({ force: true }).catch(() => undefined);
      } catch {
        /* ignore */
      }
    }
    const orphans = await docker.listContainers({
      all: true,
      filters: { label: [`${LABEL_SERVER_ID}=${serverId}`] },
    });
    for (const c of orphans) {
      await docker.getContainer(c.Id).remove({ force: true }).catch(() => undefined);
    }

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
