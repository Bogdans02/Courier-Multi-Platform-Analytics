import express from 'express';
import cors from 'cors';
import { frontendOrigin } from './config/env.js';
import healthRoutes from './routes/healthRoutes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createShiftRoutes } from './routes/shiftRoutes.js';
import { createAnalyticsRoutes } from './routes/analyticsRoutes.js';
import { createSettingsRoutes } from './routes/settingsRoutes.js';
import { createExpenseRoutes } from './routes/expenseRoutes.js';

export function createApp(pool, jwtSecret) {
  const app = express();

  // Capacitor serves bundled Android assets from this local HTTPS origin.
  app.use(cors({ origin: [frontendOrigin, 'https://localhost'] }));
  app.use(express.json());
  app.use('/api', healthRoutes);
  if (pool) {
    app.use('/api/auth', createAuthRoutes(pool, jwtSecret));
    app.use('/api/shifts', createShiftRoutes(pool, jwtSecret));
    app.use('/api/analytics', createAnalyticsRoutes(pool, jwtSecret));
    app.use('/api/settings', createSettingsRoutes(pool, jwtSecret));
    app.use('/api/expenses', createExpenseRoutes(pool, jwtSecret));
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();
