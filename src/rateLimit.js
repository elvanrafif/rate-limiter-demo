import { limiters } from './limiters/index.js';

export function rateLimit(algorithm, redis) {
  return async (req, res, next) => {
    const limiter = limiters[algorithm];
    if (!limiter) return res.status(400).json({ error: 'Unknown rate limit algorithm' });

    const headerClientId = req.get('x-client-id');
    const clientId = headerClientId === undefined ? req.ip : headerClientId;
    if (!clientId || clientId.length > 128) {
      return res.status(400).json({ error: 'Invalid x-client-id' });
    }

    try {
      const result = await limiter.check(redis, clientId);
      res.set('X-RateLimit-Limit', String(result.limit));
      res.set('X-RateLimit-Remaining', String(result.remaining));
      if (!result.allowed) res.set('Retry-After', String(result.retryAfterSeconds));
      return res.status(result.allowed ? 200 : 429).json({ allowed: result.allowed, algorithm, ...result });
    } catch (error) {
      return next(error);
    }
  };
}
