import { limiters } from '../limiters/index.js';
import { rateLimit } from '../rateLimit.js';

const WINDOW_MS = 60_000;

function clientIdFrom(request) {
  return request.get('x-client-id') ?? request.ip;
}

function validateClientId(clientId, response) {
  if (!clientId || clientId.length > 128) {
    response.status(400).json({ error: 'Invalid x-client-id' });
    return false;
  }

  return true;
}

export function health(_request, response) {
  response.json({ status: 'ok' });
}

export function demo(redis) {
  return (request, response, next) => {
    const { algorithm } = request.params;
    if (!limiters[algorithm]) {
      return response.status(400).json({ error: 'Unknown rate limit algorithm' });
    }

    return rateLimit(algorithm, redis)(request, response, next);
  };
}

export function reset(redis) {
  return async (request, response, next) => {
    const clientId = clientIdFrom(request);
    if (!validateClientId(clientId, response)) return;

    try {
      const windowIndex = Math.floor(Date.now() / WINDOW_MS);
      await redis.del(
        `rl:fw:${clientId}:${windowIndex}`,
        `rl:sl:${clientId}`,
        `rl:tb:${clientId}`,
      );
      response.json({ reset: true });
    } catch (error) {
      next(error);
    }
  };
}

export function errorHandler(error, _request, response, _next) {
  console.error('Request failed:', error.message);
  response.status(503).json({ error: 'Rate limiter unavailable' });
}
