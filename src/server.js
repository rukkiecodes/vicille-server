import { createServer } from 'http';
import app from './app.js';
import config, { validateConfig } from './config/index.js';
import { connectRedis, disconnectRedis } from './infrastructure/database/redis.js';
import { connectPostgres, disconnectPostgres } from './infrastructure/database/postgres.js';
import logger from './core/logger/index.js';
import { setupGraphQL } from './graphql/index.js';
import { initializeSocket } from './sockets/index.js';

// Validate configuration
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed:', error);
  process.exit(1);
}

// Create HTTP server
const httpServer = createServer(app);

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  httpServer.close(async () => {
    logger.info('HTTP server closed');

    try {
      await disconnectRedis();
      logger.info('Redis connection closed');

      await disconnectPostgres();
      logger.info('PostgreSQL connection closed');

      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Start server
const startServer = async () => {
  try {
    // Connect to PostgreSQL (Supabase)
    await connectPostgres();
    logger.info('Connected to Supabase PostgreSQL successfully');

    // Connect to Redis (caching)
    await connectRedis();
    logger.info('Connected to Redis successfully');

    // Setup GraphQL server
    await setupGraphQL(app, httpServer);

    // Initialize Socket.io
    initializeSocket(httpServer);
    logger.info('Socket.io initialized');

    // Start listening
    httpServer.listen(config.server.port, () => {
      logger.info(`
========================================
  Vicelle Backend Server Started
========================================
  Environment : ${config.env}
  Port        : ${config.server.port}
  Database    : Supabase PostgreSQL
  Cache       : Redis
  GraphQL     : http://${config.server.host}:${config.server.port}/graphql
  Health      : http://${config.server.host}:${config.server.port}/health
  Sockets     : /user  /tailor  /admin
========================================
      `);
    });

    // Shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default httpServer;
