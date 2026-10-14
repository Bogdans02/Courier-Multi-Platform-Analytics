import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createSettingsRepository } from '../repositories/settingsRepository.js';
import { createSettingsService } from '../services/settingsService.js';
import { createSettingsController } from '../controllers/settingsController.js';

export function createSettingsRoutes(pool, jwtSecret) {
  const router = Router();
  const controller = createSettingsController(createSettingsService(createSettingsRepository(pool)));
  router.use(requireAuth(createUserRepository(pool), jwtSecret));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/', controller.get);
  router.put('/', controller.save);
  return router;
}
