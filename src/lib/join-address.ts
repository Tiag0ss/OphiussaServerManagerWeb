export type JoinPort = { key: string; hostPort: number };

/** Public IP from settings, or localhost when unset. */
export function connectionHost(publicIp?: string | null): string {
  const ip = publicIp?.trim();
  return ip || "localhost";
}

/** Prefer the game query port; fall back to the first allocation. */
export function joinPort(ports: JoinPort[]): number | null {
  const game = ports.find((p) => p.key === "game") ?? ports[0];
  return game?.hostPort ?? null;
}

export function joinAddress(
  publicIp: string | null | undefined,
  ports: JoinPort[],
): string | null {
  const port = joinPort(ports);
  if (port == null) return null;
  return `${connectionHost(publicIp)}:${port}`;
}
