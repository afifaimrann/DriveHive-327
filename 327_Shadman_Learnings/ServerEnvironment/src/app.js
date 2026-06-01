import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js'; // Loading env validates variables immediately
import logger from './utils/logger.js';
import limiter from './middleware/rate-limit.js';
import errorHandler from './middleware/error.middleware.js';

// Route Imports
import authRoutes from './routes/auth.routes.js';
import oauthRoutes from './routes/oauth.routes.js';
import storageRoutes from './routes/storage.routes.js';
import healthRoutes from './routes/health.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure local temporary storage directories exist
const uploadsDir = path.join(__dirname, '../uploads');
const downloadsDir = path.join(__dirname, '../downloads');
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const app = express();

// Enable trust proxy if behind ngrok / reverse proxy for accurate rate limiting
app.set('trust proxy', 1);

// Security Middlewares
app.use(helmet());
app.use(cors({
  origin: '*', // Allow all for development; restrict in production
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'Content-Length'],
}));

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(limiter);

// Log requests
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url, ip: req.ip }, 'Incoming request');
  next();
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api', healthRoutes); // exposes GET /api/health

// Fallback route for 404
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler (must be registered last)
app.use(errorHandler);

// Start server
const PORT = env.port;
const server = app.listen(PORT, () => {
  logger.info(`Server running in ${env.nodeEnv} mode on port ${PORT}`);
});

export default app;
