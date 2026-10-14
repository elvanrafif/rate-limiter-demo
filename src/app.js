import { fileURLToPath } from 'node:url';
import express from 'express';
import redis from './redis.js';
import { createApiRouter, errorHandler } from './routes/apiRoutes.js';

const app = express();

app.use('/api', createApiRouter(redis));
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
app.use(errorHandler);

export default app;
