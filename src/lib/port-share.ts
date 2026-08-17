/** When TCP+UDP share a container port, keep their host ports in sync. */
export function syncSharedHostPorts<
  T extends { key: string; container: number },
>(
  ports: T[],
  current: Record<string, number>,
  changedKey: string,
  value: number,
): Record<string, number> {
  const changed = ports.find((p) => p.key === changedKey);
  const next = { ...current, [changedKey]: value };
  if (!changed) return next;
  for (const p of ports) {
    if (p.container === changed.container) next[p.key] = value;
  }
  return next;
}
