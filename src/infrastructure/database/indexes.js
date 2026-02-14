import logger from '../../core/logger/index.js';

/**
 * Setup database indexes
 * This function is called after all models are registered
 */
export const setupIndexes = async () => {
  try {
    logger.info('Setting up database indexes...');

    // Indexes are defined in individual model files
    // This function ensures they are synced with the database

    // Import models to trigger index creation
    // const User = (await import('../../modules/users/user.model.js')).default;
    // const Tailor = (await import('../../modules/tailors/tailor.model.js')).default;
    // etc...

    // Sync indexes for all models
    // await User.syncIndexes();
    // await Tailor.syncIndexes();
    // etc...

    logger.info('Database indexes setup completed');
  } catch (error) {
    logger.error('Failed to setup database indexes:', error);
    throw error;
  }
};

/**
 * Verify indexes exist
 */
export const verifyIndexes = async () => {
  try {
    logger.info('Verifying database indexes...');

    // TODO: Add index verification logic

    logger.info('Index verification completed');
  } catch (error) {
    logger.error('Index verification failed:', error);
    throw error;
  }
};

export default { setupIndexes, verifyIndexes };
