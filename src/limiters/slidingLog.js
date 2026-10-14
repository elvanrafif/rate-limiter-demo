import { randomUUID } from 'node:crypto';

const LIMIT = 10;
const WINDOW_MS = 60_000;
const SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local cutoff = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', '(' .. cutoff)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = tonumber(redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2])
  local retry = math.max(1, math.ceil((oldest + window - now) / 1000))
  return {0, 0, retry}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, limit - count - 1, 0}
`;

export async function check(redis, clientId) {
  const [allowed, remaining, retryAfterSeconds] = await redis.eval(
    SCRIPT,
    1,
    `rl:sl:${clientId}`,
    LIMIT,
    WINDOW_MS,
    randomUUID(),
  );

  return {
    allowed: allowed === 1,
    limit: LIMIT,
    remaining,
    ...(allowed === 0 && { retryAfterSeconds }),
  };
}
