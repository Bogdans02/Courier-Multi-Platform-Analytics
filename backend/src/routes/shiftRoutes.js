import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createShiftRepository } from '../repositories/shiftRepository.js';
import { createShiftService } from '../services/shiftService.js';
import { createShiftController } from '../controllers/shiftController.js';

export function createShiftRoutes(pool, jwtSecret) {
  const router = Router();
  const controller = createShiftController(createShiftService(createShiftRepository(pool)));
  router.use(requireAuth(createUserRepository(pool), jwtSecret));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/start', controller.start);
  router.get('/active', controller.active);
  router.get('/', controller.list);
  router.get('/:id', controller.details);
  router.post('/:id/finish', controller.finish);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
