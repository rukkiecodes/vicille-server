/**
 * Serverless entry point for Vercel deployment
 * This file exports the Express app for Vercel's Node.js runtime
 * 
 * Environment variables must be set in Vercel dashboard:
 * - NODE_ENV=production
 * - FIREBASE_SERVICE_ACCOUNT (JSON string)
 * - REDIS_URL
 * - JWT_SECRET
 * - Other required variables
 */

import { createServer } from 'http';
import app from '../src/app.js';
import config from '../src/config/index.js';
import { connectRedis } from '../src/infrastructure/database/redis.js';
import { initializeFirebase } from '../src/infrastructure/database/firebase.js';
import logger from '../src/core/logger/index.js';
import { setupGraphQL } from '../src/graphql/index.js';

// Initialize services on first request
let isInitialized = false;
let initPromise = null;

const initializeServices = async () => {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      logger.info('🚀 Initializing services for Vercel serverless environment...');
      logger.info(`Environment: ${config.env}`);

      // Validate critical environment variables
      if (!process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        logger.warn('⚠️  Warning: No Firebase service account found. Some operations may fail.');
      }

      if (!process.env.REDIS_URL) {
        logger.warn('⚠️  Warning: REDIS_URL not set. Cache operations will fail.');
      }

      // Initialize Firebase
      logger.info('📱 Initializing Firebase...');
      try {
        initializeFirebase();
        logger.info('✅ Firebase initialized');
      } catch (error) {
        logger.error('❌ Firebase initialization failed:', error.message);
        throw error;
      }

      // Connect to Redis
      logger.info('🔄 Connecting to Redis...');
      try {
        await connectRedis();
        logger.info('✅ Redis connected');
      } catch (error) {
        logger.warn('⚠️  Redis connection failed (non-critical for most operations):', error.message);
        // Don't throw - Redis is optional for basic operations
      }

      // Create HTTP server for GraphQL subscriptions
      logger.info('🔌 Setting up GraphQL...');
      try {
        const httpServer = createServer(app);
        await setupGraphQL(app, httpServer);
        logger.info('✅ GraphQL configured');
      } catch (error) {
        logger.error('❌ GraphQL setup failed:', error.message);
        throw error;
      }

      isInitialized = true;
      logger.info('✅ All services initialized successfully');
    } catch (error) {
      logger.error('❌ Critical initialization error:', error);
      throw new Error(`Service initialization failed: ${error.message}`);
    }
  })();

  return initPromise;
};

// Middleware to ensure services are initialized
app.use(async (req, res, next) => {
  try {
    await initializeServices();
    next();
  } catch (error) {
    logger.error('❌ Service initialization failed for request:', error);
    
    const errorResponse = {
      error: 'Internal Server Error',
      status: 500
    };
    
    // Include error details in development
    if (config.isDev) {
      errorResponse.details = error.message;
    }
    
    res.status(500).json(errorResponse);
  }
});

// Export for Vercel
export default app;

// Export for Vercel
export default app;
