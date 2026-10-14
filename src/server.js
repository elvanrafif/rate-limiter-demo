import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import express from 'express';
import redis from './redis.js';

const app = express();

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

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
