/**
 * Firebase has been removed. All data is now stored in Supabase PostgreSQL.
 * This file is kept as a no-op stub so any remaining import references
 * don't crash the process during the transition.
 */
import logger from '../../core/logger/index.js';

export const initializeFirebase = () => {
  logger.info('Firebase removed — using Supabase PostgreSQL');
};

export const getFirebaseApp = () => null;
export const getFirestore = () => {
  throw new Error('Firestore removed. Use Supabase PostgreSQL (postgres.js).');
};
export const getAuth = () => {
  throw new Error('Firebase Auth removed. Use JWT-based auth.');
};
export const disconnectFirebase = async () => {};

export default {
  initializeFirebase,
  getFirebaseApp,
  getFirestore,
  getAuth,
  disconnectFirebase,
};
