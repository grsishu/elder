import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { runMigrations } from './db.js';
import { authMiddleware } from './middleware/auth.js';
import { logServerError } from './errors.js';
import { executeCronTick, startCronWorker } from './cron.js';

// Route imports
import authRoutes from './routes/auth.js';
import elderRoutes from './routes/elder.js';
import diagnosticsRoutes from './routes/diagnostics.js';
import healthRoutes from './routes/health.js';
import geoRoutes from './routes/geo.js';
import reportRoutes from './routes/reports.js';
import locationRoutes from './routes/location.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security headers with relaxed CSP for inline audio & Leaflet tiles
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Global auth context extraction (cookie or Authorization header)
app.use(authMiddleware);

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/elder', elderRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/location', locationRoutes);

// Cron tick endpoint called by external pinger (cron-job.org) or internal worker
app.get('/api/cron/tick', async (req, res) => {
  const secret = req.query.secret || req.headers['x-cron-secret'] || req.headers.authorization?.replace(/^Bearer\s+/, '');
  if (config.nodeEnv === 'production' && config.cronSecret && secret !== config.cronSecret) {
    return res.status(401).json({ error: 'UNAUTHORIZED_CRON', message: 'Invalid or missing cron secret' });
  }

  try {
    const result = await executeCronTick();
    return res.json({ success: true, result });
  } catch (err) {
    logServerError({
      message: `Error in /api/cron/tick: ${err.message}`,
      route: '/api/cron/tick',
      statusCode: 500,
    });
    return res.status(500).json({ error: 'CRON_ERROR', message: err.message });
  }
});

// Push public key endpoint
app.get('/api/push/public-key', (req, res) => {
  return res.json({ publicKey: config.vapidPublicKey });
});

// Serve Vite production build if exists
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `API endpoint ${req.originalUrl} not found` });
});

// Centralized error handling
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  logServerError({
    message,
    stack: err.stack,
    route: req.originalUrl,
    statusCode: status,
  });

  console.error(`[Server Error] ${req.method} ${req.originalUrl}:`, err);
  res.status(status).json({
    error: err.code || 'SERVER_ERROR',
    message,
  });
});

// Startup sequence
async function start() {
  try {
    await runMigrations();
    startCronWorker();
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`[Server] Smriti Saathi server listening on http://localhost:${config.port}`);
      console.log(`[Server] Public Base URL: ${config.publicBaseUrl}`);
      console.log(`[Server] Environment: ${config.nodeEnv}, Demo Mode: ${config.demoMode}`);
    });
  } catch (err) {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}

export default app;
