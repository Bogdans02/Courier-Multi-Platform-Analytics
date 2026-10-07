import express from 'express';
import cors from 'cors';
import { frontendOrigin } from './config/env.js';
import healthRoutes from './routes/healthRoutes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());
app.use('/api', healthRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
