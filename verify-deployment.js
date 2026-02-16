#!/usr/bin/env node

/**
 * Vercel Deployment Verification Script
 * 
 * Checks if all required environment variables and configurations are properly set
 * Run this before deploying to Vercel to catch issues early
 * 
 * Usage: node verify-deployment.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset}  ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ️${colors.reset}  ${msg}`),
  section: (msg) => console.log(`\n${colors.blue}${msg}${colors.reset}`),
};

let hasErrors = false;
let hasWarnings = false;

// Test 1: Check Node version
log.section('🔧 Node Version Check');
const nodeVersion = process.versions.node;
const [major, minor] = nodeVersion.split('.').map(Number);

if (major >= 18 && major < 21) {
  log.success(`Node ${nodeVersion} is compatible with Vercel`);
} else {
  log.warn(`Node ${nodeVersion} might not be optimal. Vercel recommends 18-20.x`);
  hasWarnings = true;
}

// Test 2: Check vercel.json
log.section('📋 Vercel Configuration Check');
try {
  const vercelConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8')
  );
  
  if (vercelConfig.builds?.[0]?.src === 'api/index.js') {
    log.success('vercel.json entry point is correct (api/index.js)');
  } else {
    log.error(`vercel.json entry point is wrong. Expected "api/index.js", got "${vercelConfig.builds?.[0]?.src}"`);
    hasErrors = true;
  }
} catch (error) {
  log.error(`Cannot read vercel.json: ${error.message}`);
  hasErrors = true;
}

// Test 3: Check api/index.js exists
log.section('📁 File Check');
const requiredFiles = [
  'api/index.js',
  'src/app.js',
  'src/server.js',
  'src/config/index.js',
  'src/infrastructure/database/firebase.js',
  'src/infrastructure/database/redis.js',
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    log.success(`${file} exists`);
  } else {
    log.error(`${file} missing`);
    hasErrors = true;
  }
});

// Test 4: Check environment variables
log.section('🔑 Environment Variables Check');

const requiredEnvVars = [
  { name: 'NODE_ENV', optional: false, description: 'Set to "production"' },
  { name: 'FIREBASE_SERVICE_ACCOUNT', optional: false, description: 'Firebase credentials JSON' },
  { name: 'REDIS_URL', optional: true, description: 'Redis connection URL' },
  { name: 'JWT_SECRET', optional: false, description: 'JWT signing secret' },
  { name: 'JWT_REFRESH_SECRET', optional: true, description: 'JWT refresh secret' },
  { name: 'MAILING_EMAIL', optional: true, description: 'Email for sending' },
  { name: 'MAILING_PASSWORD', optional: true, description: 'Email password/app password' },
  { name: 'PAYSTACK_SECRET_KEY', optional: true, description: 'Paystack secret key' },
  { name: 'PAYMENT_WEBHOOK_SECRET', optional: true, description: 'Webhook secret' },
  { name: 'CORS_ORIGIN', optional: true, description: 'CORS allowed origins' },
];

const missingRequired = [];
const missingOptional = [];

requiredEnvVars.forEach(({ name, optional, description }) => {
  const value = process.env[name];
  
  if (value) {
    // Mask sensitive values
    const displayValue = ['SECRET', 'PASSWORD', 'KEY'].some(word => name.includes(word))
      ? '****(hidden)'
      : value.substring(0, 20) + (value.length > 20 ? '...' : '');
    
    log.success(`${name} = ${displayValue}`);
  } else if (optional) {
    log.warn(`${name} not set (optional)`);
    missingOptional.push(name);
    hasWarnings = true;
  } else {
    log.error(`${name} not set (required)`);
    missingRequired.push(name);
    hasErrors = true;
  }
});

// Test 5: Validate Firebase JSON if present
log.section('🔐 Firebase Credentials Validation');
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const firebaseCreds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    const requiredFields = [
      'type', 'project_id', 'private_key', 'client_email'
    ];
    
    const missingFields = requiredFields.filter(field => !firebaseCreds[field]);
    
    if (missingFields.length === 0) {
      log.success('Firebase credentials JSON is valid');
      log.info(`Project: ${firebaseCreds.project_id}`);
      log.info(`Email: ${firebaseCreds.client_email}`);
    } else {
      log.error(`Firebase JSON missing fields: ${missingFields.join(', ')}`);
      hasErrors = true;
    }
  } catch (error) {
    log.error(`Firebase JSON is invalid: ${error.message}`);
    hasErrors = true;
  }
} else if (fs.existsSync(path.join(__dirname, '../vicelle-fashion-firebase-adminsdk-fbsvc-af0ced6697.json'))) {
  log.warn('Firebase JSON file found but FIREBASE_SERVICE_ACCOUNT env var not set');
  log.info('For Vercel, you must set FIREBASE_SERVICE_ACCOUNT environment variable');
  hasWarnings = true;
} else {
  log.warn('No Firebase credentials found');
}

// Test 6: Check Redis connection string
log.section('🔄 Redis Connection Check');
if (process.env.REDIS_URL) {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl.startsWith('redis://')) {
    log.success('REDIS_URL format is valid');
    
    // Try to parse it
    try {
      const url = new URL(redisUrl);
      log.info(`Host: ${url.hostname}`);
      log.info(`Port: ${url.port || 6379}`);
    } catch (error) {
      log.warn(`Could not parse REDIS_URL: ${error.message}`);
      hasWarnings = true;
    }
  } else {
    log.error('REDIS_URL format is invalid. Should start with redis://');
    hasErrors = true;
  }
} else {
  log.warn('REDIS_URL not set. Redis will not be available.');
  log.info('This may cause caching and session features to fail.');
  hasWarnings = true;
}

// Test 7: Check JWT secrets
log.section('🔐 JWT Secrets Check');
if (process.env.JWT_SECRET) {
  if (process.env.JWT_SECRET.length >= 32) {
    log.success(`JWT_SECRET is sufficiently long (${process.env.JWT_SECRET.length} chars)`);
  } else {
    log.warn(`JWT_SECRET should be at least 32 characters long (currently ${process.env.JWT_SECRET.length} chars)`);
    hasWarnings = true;
  }
} else {
  log.error('JWT_SECRET not set');
  hasErrors = true;
}

// Test 8: Summary
log.section('📊 Summary');

if (!hasErrors && !hasWarnings) {
  log.success('All checks passed! Ready for Vercel deployment.');
  log.info('Next steps:');
  log.info('1. git add .');
  log.info('2. git commit -m "Fix Vercel deployment issues"');
  log.info('3. git push');
  log.info('4. Your Vercel deployment should now succeed!');
} else if (hasErrors) {
  log.error(`${missingRequired.length} critical issue(s) found. Fix before deploying.`);
  log.info('\nMissing required variables:');
  missingRequired.forEach(v => log.info(`  - ${v}`));
  log.info('\n📝 To set environment variables in Vercel:');
  log.info('1. Go to your Vercel project dashboard');
  log.info('2. Click "Settings" → "Environment Variables"');
  log.info('3. Add each missing variable');
  log.info('4. Redeploy');
} else if (hasWarnings) {
  log.warn(`${missingOptional.length} optional setting(s) not configured.`);
  log.info('These features will be unavailable:');
  missingOptional.forEach(v => log.info(`  - ${v}`));
  log.info('\nYou can proceed with deployment, but some features may not work.');
}

log.section('');

// Exit with error code if there are critical errors
process.exit(hasErrors ? 1 : 0);
