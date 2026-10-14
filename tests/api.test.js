import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import app from '../src/server.js';
import redis from '../src/redis.js';
import { randomUUID } from 'node:crypto';

describe('GET /api/health', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('health_is_live_without_redis_ping', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('rejects unknown algorithms without accessing Redis', async () => {
    const response = await fetch(`${baseUrl}/api/demo/no-such-algorithm`, { method: 'POST' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });

  it('sets quota headers and rejects the eleventh request', async () => {
    const clientId = randomUUID();
    let response;
    for (let request = 0; request < 11; request += 1) {
      response = await fetch(`${baseUrl}/api/demo/fixed-window`, {
        method: 'POST',
        headers: { 'x-client-id': clientId },
      });
    }

    expect(response.status).toBe(429);
    expect(response.headers.get('x-ratelimit-limit')).toBe('10');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({
      allowed: false,
      algorithm: 'fixed-window',
      limit: 10,
      remaining: 0,
    });
  });

  it('resets all algorithms for that client only', async () => {
    for (const algorithm of ['fixed-window', 'sliding-log', 'token-bucket']) {
      const clientA = randomUUID();
      const clientB = randomUUID();
      const url = `${baseUrl}/api/demo/${algorithm}`;
      await fetch(url, { method: 'POST', headers: { 'x-client-id': clientA } });
      await fetch(url, { method: 'POST', headers: { 'x-client-id': clientB } });
      await fetch(url, { method: 'POST', headers: { 'x-client-id': clientB } });
      const reset = await fetch(`${baseUrl}/api/reset`, {
        method: 'POST',
        headers: { 'x-client-id': clientA },
      });
      const nextA = await fetch(url, { method: 'POST', headers: { 'x-client-id': clientA } });
      const nextB = await fetch(url, { method: 'POST', headers: { 'x-client-id': clientB } });

      expect(reset.status).toBe(200);
      expect((await nextA.json()).remaining).toBe(9);
      expect((await nextB.json()).remaining).toBe(7);
    }
  });

  it('rejects empty or overlong client ids', async () => {
    for (const clientId of ['', 'x'.repeat(129)]) {
      const response = await fetch(`${baseUrl}/api/demo/fixed-window`, {
        method: 'POST',
        headers: { 'x-client-id': clientId },
      });
      expect(response.status).toBe(400);
    }
  });

  it('serves the demo page and static assets', async () => {
    const page = await fetch(baseUrl);
    const html = await page.text();
    const css = await fetch(`${baseUrl}/style.css`);
    const js = await fetch(`${baseUrl}/app.js`);

    expect(page.status).toBe(200);
    expect(html).toContain('Rate Limiter Demo');
    expect(html).toContain('Send 15 at once');
    expect(css.status).toBe(200);
    expect(js.status).toBe(200);
  });

  it('returns 503 when Redis is unavailable', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    redis.disconnect();
    const response = await fetch(`${baseUrl}/api/demo/fixed-window`, {
      method: 'POST',
      headers: { 'x-client-id': randomUUID() },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    errorSpy.mockRestore();
  });
});
