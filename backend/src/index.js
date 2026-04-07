import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSecrets } from './config/secrets.js';
import authRoutes from './routes/auth.js';
import mastersRoutes from './routes/masters.js';
import jobsRoutes from './routes/jobs.js';
import { initializeS3Bucket } from './services/s3Service.js';
import { initializeQueue } from './services/queueService.js';
import { initializeWorker } from './workers/documentWorker.js';

dotenv.config();

// __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — only needed for the Worker container calling this backend internally.
// Browser requests are same-origin (served from this same Express server),
// so no CORS headers are required for those.
// If you have no internal service-to-service calls, you can remove cors entirely.
if (process.env.ALLOWED_ORIGINS) {
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS.split(','),
    credentials: true
  }));
}

// Increase body parser limits for large JSON payloads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// ── Health check ─────────────────────────────────────────────────
// Must be registered BEFORE static middleware so ALB health checks
// always reach Express and never try to serve a file called "health"
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ───────────────────────────────────────────────────
// Must be registered BEFORE express.static so /api/* requests are
// handled by Express and never fall through to the React catch-all
app.use('/api/auth', authRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/jobs', jobsRoutes);

// ── Serve React Frontend (Option A) ─────────────────────────────
// __dirname  = /app/src   (inside the container)
// dist lives = /app/frontend/dist
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');

// Serve static assets (JS, CSS, images, favicon, etc.)
app.use(express.static(FRONTEND_DIST));

// React Router catch-all — any route not matched above returns index.html
// IMPORTANT: this must be the LAST route registered
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});
// ─────────────────────────────────────────────────────────────────

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 4GB.' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Initialize and start
async function start() {
  try {
    // Load secrets from AWS Secrets Manager FIRST (production only)
    // In local/dev it skips this and uses .env file
    await loadSecrets();

    // Initialize Redis queue
    console.log('Initializing queue...');
    const queueResult = await initializeQueue();
    if (queueResult.useInMemory) {
      console.log('✓ Using in-memory queue');
    } else {
      console.log('✓ Redis queue initialized');
    }

    // Initialize S3 bucket structure
    await initializeS3Bucket();
    console.log('✓ S3 bucket initialized');

    // Initialize BullMQ worker
    await initializeWorker();
    console.log('✓ Document processing worker initialized');

    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Frontend:    ${FRONTEND_DIST}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
