import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables (only if not already loaded)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  // Server
  server: {
    port: parseInt(process.env.PORT, 10) || 4000,
    host: process.env.HOST || 'localhost',
    apiVersion: process.env.API_VERSION || 'v1',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // Activation Code
  activationCode: {
    length: parseInt(process.env.ACTIVATION_CODE_LENGTH, 10) || 8,
    expiryDays: parseInt(process.env.ACTIVATION_CODE_EXPIRY_DAYS, 10) || 365,
  },

  // Email (SMTP)
  email: {
    host: process.env.SMTP_HOST || 'smtp.titan.email', // Will use Titan
    port: parseInt(process.env.SMTP_PORT, 10) || 465, // Will use 465
    secure: process.env.SMTP_SECURE === 'true', // Will be true
    user: process.env.MAILING_EMAIL || process.env.SMTP_USER, // Will use hello@vicelleclothing.com
    password: process.env.MAILING_PASSWORD || process.env.SMTP_PASSWORD, // Will use the Titan password
    from: process.env.EMAIL_FROM || 'Vicelle Clothing <hello@vicelleclothing.com>',
  },

  // Payment (Paystack)
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'paystack',
    paystack: {
      secretKey: process.env.PAYSTACK_SECRET_KEY,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY,
      webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
    },
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5242880, // 5MB
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  // Socket.io
  socket: {
    corsOrigin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:3000',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || 'logs/app.log',
  },

  // App URLs
  urls: {
    client: process.env.CLIENT_APP_URL || 'http://localhost:3000',
    admin: process.env.ADMIN_APP_URL || 'http://localhost:3001',
    website: process.env.WEBSITE_URL || 'http://localhost:3000',
  },

  // Subscription Settings
  subscription: {
    gracePeriodDays: parseInt(process.env.DEFAULT_GRACE_PERIOD_DAYS, 10) || 7,
    maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS, 10) || 3,
    retryIntervalHours: parseInt(process.env.RETRY_INTERVAL_HOURS, 10) || 24,
  },

  // Special Request Settings
  specialRequest: {
    depositPercentage: parseInt(process.env.SPECIAL_REQUEST_DEPOSIT_PERCENTAGE, 10) || 50,
    urgencyBaseFee: parseInt(process.env.URGENCY_BASE_FEE, 10) || 5000,
    deliveryBaseFee: parseInt(process.env.DELIVERY_BASE_FEE, 10) || 2000,
    serviceFeePercentage: parseInt(process.env.SERVICE_FEE_PERCENTAGE, 10) || 15,
  },

  // Tailor Settings
  tailor: {
    defaultCapacity: parseInt(process.env.TAILOR_DEFAULT_CAPACITY, 10) || 10,
    probationJobs: parseInt(process.env.TAILOR_PROBATION_JOBS, 10) || 5,
    payoutDay: process.env.TAILOR_PAYOUT_DAY || 'Friday',
    maxMissedDeadlines: parseInt(process.env.MAX_MISSED_DEADLINES, 10) || 3,
  },

  // Pagination
  pagination: {
    defaultLimit: parseInt(process.env.PAGINATION_DEFAULT_LIMIT, 10) || 20,
    maxLimit: parseInt(process.env.PAGINATION_MAX_LIMIT, 10) || 100,
  },

  // Session
  session: {
    timeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES, 10) || 60,
  },

  // CORS
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
};

// Validation function
export const validateConfig = () => {
  const requiredVars = [];
  const errors = [];

  // In production, require certain variables
  if (config.isProd) {
    requiredVars.push(
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'REDIS_URL',
      'MAILING_EMAIL',
      'MAILING_PASSWORD'
    );
  }

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
};

export default config;
