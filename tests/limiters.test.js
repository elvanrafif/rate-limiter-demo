import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { limiters } from '../src/limiters/index.js';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
});
const clientIds = new Set();
const newClientId = () => {
  const clientId = `test-${randomUUID()}`;
  clientIds.add(clientId);
  return clientId;
};

beforeAll(async () => redis.ping());
afterAll(async () => {
  for (const clientId of clientIds) {
    const keys = await redis.keys(`rl:*:${clientId}*`);
    if (keys.length) await redis.del(...keys);
  }
  await redis.quit();
});

describe.each(Object.entries(limiters))('%s limiter', (algorithm, limiter) => {
  it('allows 10 requests and rejects the 11th', async () => {
    const clientId = newClientId();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => limiter.check(redis, clientId)),
    );
    const rejected = await limiter.check(redis, clientId);

    expect(results.every((result) => result.allowed)).toBe(true);
    expect(rejected).toMatchObject({ allowed: false, limit: 10, remaining: 0 });
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('allows traffic again after the window/refill', async () => {
    const clientId = newClientId();
    for (let request = 0; request < 10; request += 1) {
      await limiter.check(redis, clientId);
    }

    if (algorithm === 'fixed-window') {
      const keys = await redis.keys(`rl:fw:${clientId}:*`);
      await Promise.all(keys.map((key) => redis.pexpire(key, 1)));
      await new Promise((resolve) => setTimeout(resolve, 10));
    } else if (algorithm === 'sliding-log') {
      const key = `rl:sl:${clientId}`;
      const members = await redis.zrange(key, 0, -1);
      await redis.zadd(key, ...members.flatMap((member) => [0, member]));
    } else {
      await redis.hset(`rl:tb:${clientId}`, 'tokens', 0, 'updatedAt', 0);
    }

    expect((await limiter.check(redis, clientId)).allowed).toBe(true);
  });

  it('keeps 15 concurrent requests within the 10-request limit', async () => {
    const clientId = newClientId();
    const results = await Promise.all(
      Array.from({ length: 15 }, () => limiter.check(redis, clientId)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(5);
  });
});
