/**
 * Serverless entry point for Vercel deployment
 * This file exports the Express app for Vercel's Node.js runtime
 */

import app from '../src/app.js';
import config from '../src/config/index.js';
import { connectRedis, disconnectRedis } from '../src/infrastructure/database/redis.js';
import { initializeFirebase } from '../src/infrastructure/database/firebase.js';
import logger from '../src/core/logger/index.js';
import { setupGraphQL } from '../src/graphql/index.js';

// Initialize services on first request
let isInitialized = false;
const initializeServices = async () => {
  if (isInitialized) return;

  try {
    logger.info('Initializing services for serverless environment...');

    // Initialize Firebase
    initializeFirebase();

    // Connect to Redis
    await connectRedis();
    logger.info('Connected to Redis');

    // Setup GraphQL
    const httpServer = require('http').createServer(app);
    await setupGraphQL(app, httpServer);

    isInitialized = true;
    logger.info('Services initialized successfully');
  } catch (error) {
    logger.error('Error initializing services:', error);
    throw error;
  }
};

// Middleware to ensure services are initialized
app.use(async (req, res, next) => {
  try {
    await initializeServices();
    next();
  } catch (error) {
    logger.error('Service initialization failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Export for Vercel
export default app;
