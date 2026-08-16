const locks = new Map<string, Promise<unknown>>();

export async function withServerLock<T>(
  serverId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(serverId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = prev.then(() => gate);
  locks.set(serverId, current);

  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(serverId) === current) locks.delete(serverId);
  }
}
