const LIMIT = 10;
const WINDOW_MS = 60_000;

export async function check(redis, clientId) {
  const now = Date.now();
  const windowIndex = Math.floor(now / WINDOW_MS);
  const key = `rl:fw:${clientId}:${windowIndex}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.pexpire(key, Math.max(1, (windowIndex + 1) * WINDOW_MS - now));
  }

  const allowed = count <= LIMIT;
  return {
    allowed,
    limit: LIMIT,
    remaining: Math.max(0, LIMIT - count),
    ...(!allowed && { retryAfterSeconds: Math.max(1, Math.ceil(((windowIndex + 1) * WINDOW_MS - now) / 1000)) }),
  };
}
