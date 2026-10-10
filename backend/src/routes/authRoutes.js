import { Router } from 'express';
import { createUserRepository } from '../repositories/userRepository.js';
import { createAuthService } from '../services/authService.js';
import { createAuthController } from '../controllers/authController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export function createAuthRoutes(pool, jwtSecret) {
  const router = Router();
  const users = createUserRepository(pool);
  const controller = createAuthController(createAuthService(users, jwtSecret));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/me', requireAuth(users, jwtSecret), controller.me);
  return router;
}
