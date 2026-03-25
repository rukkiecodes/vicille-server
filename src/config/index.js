import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
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

  // Supabase / PostgreSQL (primary DB)
  database: {
    host: process.env.SUPERBASE_POOL_HOST,
    port: parseInt(process.env.SUPERBASE_POOL_PORT, 10) || 5432,
    database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
    user: process.env.SUPERBASE_POOL_USER,
    password: process.env.SUPERBASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false }, // required for Supabase
    max: parseInt(process.env.DB_POOL_MAX, 10) || 3,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 10) || 10000,
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS, 10) || 5000,
  },

  // Redis (caching only)
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

  // Activation Code (6-digit, admin-generated, open-ended)
  activationCode: {
    length: parseInt(process.env.ACTIVATION_CODE_LENGTH, 10) || 6,
  },

  // Tailor Reset Token
  resetToken: {
    expiryMinutes: 15,
  },

  // Email (SMTP)
  email: {
    host: process.env.SMTP_HOST || 'smtp.titan.email',
    port: parseInt(process.env.SMTP_PORT, 10) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.MAILING_EMAIL || process.env.SMTP_USER,
    password: process.env.MAILING_PASSWORD || process.env.SMTP_PASSWORD,
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
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5242880,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
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

  // Style Search
  styleSearch: {
    serpApiKey: process.env.SERP_API_KEY,
  },

  // Pagination
  pagination: {
    defaultLimit: parseInt(process.env.PAGINATION_DEFAULT_LIMIT, 10) || 20,
    maxLimit: parseInt(process.env.PAGINATION_MAX_LIMIT, 10) || 100,
  },

  // Session (Redis TTL)
  session: {
    timeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES, 10) || 60,
    ttlSeconds: 86400 * 7, // 7 days
  },

  // CORS — CORS_ORIGINS is a comma-separated list of allowed origins.
  // Falls back to SOCKET_CORS_ORIGIN for backwards compatibility.
  cors: {
    origins: (process.env.CORS_ORIGINS || process.env.SOCKET_CORS_ORIGIN || 'http://localhost:3000')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean),
    credentials: true,
  },
};

export const validateConfig = () => {
  const errors = [];

  if (config.isProd) {
    const required = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'REDIS_URL',
      'MAILING_EMAIL',
      'MAILING_PASSWORD',
      'SUPERBASE_DB_PASSWORD',
      'SUPERBASE_POOL_HOST',
      'SUPERBASE_POOL_USER',
    ];
    for (const v of required) {
      if (!process.env[v]) errors.push(`Missing required env var: ${v}`);
    }
  }

  // Always warn in dev if DB password is placeholder
  if (
    config.database.password === 'your-supabase-db-password-here' ||
    !config.database.password
  ) {
    console.warn(
      '\x1b[33m⚠️  SUPERBASE_DB_PASSWORD is not set. Update it in .env before connecting to the database.\x1b[0m'
    );
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
};

export default config;
