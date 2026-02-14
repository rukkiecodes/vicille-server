import { createClient } from 'redis';
import config from '../../config/index.js';
import logger from '../../core/logger/logger.js';

let redisClient = null;

/**
 * Connect to Redis
 */
export const connectRedis = async () => {
  try {
    // Create the native Redis client
    redisClient = createClient({
      url: config.redis.url,
      socket: {
        reconnectStrategy: (retries) => {
          const delay = Math.min(retries * 50, 500);
          return delay;
        },
      },
    });

    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
    });

    // Connect the native client
    await redisClient.connect();

    logger.info('Redis client initialized successfully');

    return { redisClient };
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

/**
 * Disconnect from Redis
 */
export const disconnectRedis = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      logger.info('Disconnected from Redis');
    }
  } catch (error) {
    logger.error('Error disconnecting from Redis:', error);
    throw error;
  }
};

/**
 * Get the native Redis client
 */
export const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

/**
 * Check if Redis is connected
 */
export const isRedisConnected = () => {
  return redisClient !== null && redisClient.isOpen;
};

export default {
  connectRedis,
  disconnectRedis,
  getRedisClient,
  isRedisConnected,
};
