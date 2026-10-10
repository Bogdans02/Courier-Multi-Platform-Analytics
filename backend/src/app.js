import express from 'express';
import cors from 'cors';
import { frontendOrigin } from './config/env.js';
import healthRoutes from './routes/healthRoutes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createAuthRoutes } from './routes/authRoutes.js';

export function createApp(pool, jwtSecret) {
  const app = express();

  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());
  app.use('/api', healthRoutes);
  if (pool) app.use('/api/auth', createAuthRoutes(pool, jwtSecret));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();
