import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createAnalyticsRepository } from '../repositories/analyticsRepository.js';
import { createAnalyticsService } from '../services/analyticsService.js';
import { createAnalyticsController } from '../controllers/analyticsController.js';

export function createAnalyticsRoutes(pool, jwtSecret) {
  const router = Router();
  const controller = createAnalyticsController(createAnalyticsService(createAnalyticsRepository(pool)));
  router.use(requireAuth(createUserRepository(pool), jwtSecret));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/summary', controller.summary);
  router.get('/details', controller.details);
  return router;
}
