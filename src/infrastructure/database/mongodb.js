import mongoose from 'mongoose';
import databaseConfig from '../../config/database.js';
import logger from '../../core/logger/index.js';

class DatabaseConnection {
  constructor() {
    this.connection = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) {
      logger.info('MongoDB already connected');
      return this.connection;
    }

    try {
      mongoose.set('strictQuery', true);

      // Connection event handlers
      mongoose.connection.on('connected', () => {
        logger.info('MongoDB connected successfully');
        this.isConnected = true;
      });

      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        this.isConnected = false;
      });

      // Handle process termination
      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await this.disconnect();
        process.exit(0);
      });

      // Connect to MongoDB
      this.connection = await mongoose.connect(databaseConfig.uri, databaseConfig.options);

      logger.info(`MongoDB connected to: ${databaseConfig.uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

      return this.connection;
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.connection.close();
      this.isConnected = false;
      logger.info('MongoDB disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  getConnection() {
    return mongoose.connection;
  }

  isHealthy() {
    return mongoose.connection.readyState === 1;
  }

  async dropDatabase() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('dropDatabase can only be called in test environment');
    }
    await mongoose.connection.dropDatabase();
  }
}

// Create singleton instance
const database = new DatabaseConnection();

export default database;
