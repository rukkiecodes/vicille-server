import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import config from './config/index.js';
import routes from './routes/index.js';
import {
  requestLogger,
  apiLimiter,
  errorHandler,
  notFoundHandler,
  handleMulterError,
} from './middlewares/index.js';

// Create Express app
const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: config.isProd,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS — open to all origins; auth is enforced per-resolver
app.use(
  cors({
    origin: true,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200,
  })
);

// Compression
app.use(compression());

// Favicon handler (prevent 404 warnings)
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Body parsing - raw body for webhooks
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks')) {
    // Parse raw body for webhooks
    if (Buffer.isBuffer(req.body)) {
      req.body = JSON.parse(req.body.toString());
    }
  }
  next();
});

// Body parsing - JSON for all other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Rate limiting (skip for health checks)
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/ready' || req.path === '/live') {
    return next();
  }
  apiLimiter(req, res, next);
});

// API routes
app.use('/', routes);

// GraphQL will be mounted separately in server.js
// Skip 404 handler for /graphql path (handled by Apollo)

// Handle multer errors
app.use(handleMulterError);

// 404 handler (skip for GraphQL - handled by Apollo middleware in server.js)
app.use((req, res, next) => {
  if (req.path === '/graphql') {
    return next();
  }
  notFoundHandler(req, res, next);
});

// Global error handler
app.use(errorHandler);

export default app;
