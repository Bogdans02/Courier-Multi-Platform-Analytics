import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createExpenseRepository } from '../repositories/expenseRepository.js';
import { createExpenseService } from '../services/expenseService.js';
import { createExpenseController } from '../controllers/expenseController.js';

export function createExpenseRoutes(pool, jwtSecret) {
  const router = Router();
  const controller = createExpenseController(createExpenseService(createExpenseRepository(pool)));
  router.use(requireAuth(createUserRepository(pool), jwtSecret));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
