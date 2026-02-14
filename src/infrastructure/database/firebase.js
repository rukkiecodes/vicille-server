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
      // Read the service account key file
      const serviceAccountKey = JSON.parse(
        fs.readFileSync(serviceAccountPath, 'utf8')
      );

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
