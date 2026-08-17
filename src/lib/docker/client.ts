import { existsSync } from "fs";
import Docker from "dockerode";

let client: Docker | null = null;
let resolvedSocket: string | null = null;

/**
 * Resolve which Docker engine to talk to.
 * Docker Desktop (desktop-linux) and the system Engine often differ — game
 * containers must go to the same daemon you inspect with `docker ps`.
 */
export function resolveDockerSocket(): string {
  if (process.env.DOCKER_SOCKET) return process.env.DOCKER_SOCKET;
  const candidates = [
    "/var/run/docker.sock",
    "/run/docker.sock",
    process.env.HOME ? `${process.env.HOME}/.docker/desktop/docker.sock` : "",
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "/var/run/docker.sock";
}

export function getDockerSocketPath() {
  if (!resolvedSocket) resolvedSocket = resolveDockerSocket();
  return resolvedSocket;
}

/** Docker Desktop's "host" network is the VM, not the LAN — ports never appear in the UI. */
export function isDockerDesktopEngine() {
  return /desktop/i.test(getDockerSocketPath());
}

export function getDocker() {
  if (client) return client;
  resolvedSocket = resolveDockerSocket();
  client = new Docker({ socketPath: resolvedSocket });
  console.info(`[docker] using socket ${resolvedSocket}`);
  return client;
}

export const LABEL_SERVER_ID = "ophiussa.server.id";
export const LABEL_MANAGED = "ophiussa.managed";
export const LABEL_TEMPLATE = "ophiussa.template";
export const LABEL_OWNER = "ophiussa.owner";
export const LABEL_SERVER_NAME = "ophiussa.server.name";
export const LABEL_NETWORK_MODE = "ophiussa.network.mode";
export const NETWORK_NAME = "ophiussa_games";

/** Public DNS so Steam/updater works even when host resolv.conf is broken inside the bridge. */
export const CONTAINER_DNS = ["1.1.1.1", "8.8.8.8"];

export function isDockerPortPublishError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /iptables|nftables|DNAT|external connectivity|RULE_APPEND|missing kernel module/i.test(
    msg,
  );
}

/**
 * Dedicated bridge for game servers — not the default `bridge` (where other
 * stacks like Redis often live). Outbound internet stays enabled (Steam updates);
 * ICC is off so game containers cannot talk to each other.
 */
export async function ensureGameNetwork() {
  const docker = getDocker();
  const networks = await docker.listNetworks({
    filters: { name: [NETWORK_NAME] },
  });
  const existing = networks.find((n) => n.Name === NETWORK_NAME);

  const create = () =>
    docker.createNetwork({
      Name: NETWORK_NAME,
      Driver: "bridge",
      Internal: false,
      CheckDuplicate: true,
      Labels: { [LABEL_MANAGED]: "true" },
      Options: {
        // Isolate game containers from each other on this network
        "com.docker.network.bridge.enable_icc": "false",
        // NAT outbound (Steam, updates) without joining the default bridge
        "com.docker.network.bridge.enable_ip_masquerade": "true",
        "com.docker.network.bridge.name": "br-ophiussa",
      },
    });

  if (!existing) {
    await create();
    return NETWORK_NAME;
  }

  // Recreate empty legacy networks so isolation options apply
  try {
    const info = await docker.getNetwork(existing.Id).inspect();
    const hasContainers = Object.keys(info.Containers || {}).length > 0;
    const icc =
      info.Options?.["com.docker.network.bridge.enable_icc"] ?? "true";
    if (!hasContainers && icc !== "false") {
      await docker.getNetwork(existing.Id).remove().catch(() => undefined);
      await create();
    }
  } catch {
    /* keep existing */
  }

  return NETWORK_NAME;
}

/** Ensure container is attached to the games network (fixes empty Networks={}). */
export async function connectContainerToGameNetwork(containerId: string) {
  const docker = getDocker();
  await ensureGameNetwork();
  const info = await docker.getContainer(containerId).inspect();
  const attached = Boolean(info.NetworkSettings?.Networks?.[NETWORK_NAME]);
  if (attached) return;
  try {
    await docker.getNetwork(NETWORK_NAME).connect({ Container: containerId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already") && !msg.toLowerCase().includes("endpoint")) {
      throw e;
    }
  }
}
