import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../core/logger/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to Firebase service account key
const serviceAccountPath = path.resolve(
  __dirname,
  '../../..',
  'vicelle-fashion-firebase-adminsdk-fbsvc-af0ced6697.json'
);

// Initialize Firebase Admin SDK
let firebaseApp;
let db;

export const initializeFirebase = () => {
  try {
    if (!firebaseApp) {
      let serviceAccountKey;

      // Try to load from file first (for local development)
      try {
        if (fs.existsSync(serviceAccountPath)) {
          logger.info('Loading Firebase credentials from file...');
          serviceAccountKey = JSON.parse(
            fs.readFileSync(serviceAccountPath, 'utf8')
          );
        } else {
          throw new Error('Service account file not found');
        }
      } catch (fileError) {
        // Fall back to environment variable (for Vercel)
        logger.info('Service account file not available, using environment variable...');
        
        if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
          throw new Error(
            'Firebase service account not found in file or FIREBASE_SERVICE_ACCOUNT env var'
          );
        }

        try {
          serviceAccountKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch (parseError) {
          throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT JSON: ${parseError.message}`);
        }
      }

      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccountKey),
      });

      db = admin.firestore();
      
      // Set Firestore settings
      db.settings({
        ignoreUndefinedProperties: true,
      });

      logger.info('✅ Firebase initialized successfully');
      logger.info('📊 Firestore database connected');
    }
    return { app: firebaseApp, db };
  } catch (error) {
    logger.error('Failed to initialize Firebase:', error);
    throw error;
  }
};

export const getFirebaseApp = () => {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return firebaseApp;
};

export const getFirestore = () => {
  if (!db) {
    initializeFirebase();
  }
  return db;
};

/**
 * Get Firebase Auth instance
 */
export const getAuth = () => {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.auth();
};

/**
 * Disconnect Firebase (graceful shutdown)
 */
export const disconnectFirebase = async () => {
  try {
    if (firebaseApp) {
      await firebaseApp.delete();
      firebaseApp = null;
      db = null;
      logger.info('Firebase disconnected');
    }
  } catch (error) {
    logger.error('Error disconnecting Firebase:', error);
    throw error;
  }
};

export default {
  initializeFirebase,
  getFirebaseApp,
  getFirestore,
  getAuth,
  disconnectFirebase,
};
