import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import express from 'express';
import redis from './redis.js';
import { limiters } from './limiters/index.js';
import { rateLimit } from './rateLimit.js';

const app = express();

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/demo/:algorithm', (req, res, next) => {
  if (!limiters[req.params.algorithm]) {
    return res.status(400).json({ error: 'Unknown rate limit algorithm' });
  }
  return rateLimit(req.params.algorithm, redis)(req, res, next);
});

app.post('/api/reset', async (req, res, next) => {
  const headerClientId = req.get('x-client-id');
  const clientId = headerClientId === undefined ? req.ip : headerClientId;
  if (!clientId || clientId.length > 128) {
    return res.status(400).json({ error: 'Invalid x-client-id' });
  }

  try {
    const windowIndex = Math.floor(Date.now() / 60_000);
    await redis.del(
      `rl:fw:${clientId}:${windowIndex}`,
      `rl:sl:${clientId}`,
      `rl:tb:${clientId}`,
    );
    return res.json({ reset: true });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error('Request failed:', error.message);
  res.status(503).json({ error: 'Rate limiter unavailable' });
});

app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));

export default app;

export function start() {
  const server = createServer(app);
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Rate limiter demo listening on ${port}`));

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => {
        redis.disconnect();
        process.exit(0);
      });
    });
  }

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}
