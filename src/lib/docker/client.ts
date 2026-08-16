import Docker from "dockerode";

let client: Docker | null = null;

export function getDocker() {
  if (client) return client;
  client = new Docker({
    socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
  });
  return client;
}

export const LABEL_SERVER_ID = "ophiussa.server.id";
export const LABEL_MANAGED = "ophiussa.managed";
export const NETWORK_NAME = "ophiussa_games";

export async function ensureGameNetwork() {
  const docker = getDocker();
  const networks = await docker.listNetworks({
    filters: { name: [NETWORK_NAME] },
  });
  if (networks.length > 0) return NETWORK_NAME;
  await docker.createNetwork({
    Name: NETWORK_NAME,
    Driver: "bridge",
    Labels: { [LABEL_MANAGED]: "true" },
  });
  return NETWORK_NAME;
}
