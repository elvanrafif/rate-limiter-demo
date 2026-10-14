const LIMIT = 10;
const WINDOW_MS = 60_000;
const SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local values = redis.call('HMGET', key, 'tokens', 'updatedAt')
local tokens = tonumber(values[1]) or capacity
local updated = tonumber(values[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - updated) * capacity / window)
local allowed = 0
local retry = 0
if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
else
  retry = math.max(1, math.ceil((1 - tokens) * window / capacity / 1000))
end
redis.call('HSET', key, 'tokens', tokens, 'updatedAt', now)
redis.call('PEXPIRE', key, window * 2)
return {allowed, math.floor(tokens + 0.0000001), retry}
`;

export async function check(redis, clientId) {
  const [allowed, remaining, retryAfterSeconds] = await redis.eval(
    SCRIPT,
    1,
    `rl:tb:${clientId}`,
    LIMIT,
    WINDOW_MS,
  );

  return {
    allowed: allowed === 1,
    limit: LIMIT,
    remaining,
    ...(allowed === 0 && { retryAfterSeconds }),
  };
}
