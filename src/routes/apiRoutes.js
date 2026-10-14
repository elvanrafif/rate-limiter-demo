import { Router } from 'express';
import { demo, errorHandler, health, reset } from '../controllers/apiController.js';

export function createApiRouter(redis) {
  const router = Router();

  router.get('/health', health);
  router.post('/demo/:algorithm', demo(redis));
  router.post('/reset', reset(redis));

  return router;
}

export { errorHandler };
