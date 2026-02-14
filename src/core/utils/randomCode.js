import { nanoid, customAlphabet } from 'nanoid';
import config from '../../config/index.js';

// Custom alphabets
const NUMERIC = '0123456789';
const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHANUMERIC_LOWER = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Generate a numeric activation code
 */
export const generateActivationCode = (length = config.activationCode.length) => {
  const generator = customAlphabet(NUMERIC, length);
  return generator();
};

/**
 * Generate an alphanumeric code (uppercase)
 */
export const generateAlphanumericCode = (length = 8) => {
  const generator = customAlphabet(ALPHANUMERIC, length);
  return generator();
};

/**
 * Generate a unique order number
 * Format: VIC-YYYY-XXXXXX
 */
export const generateOrderNumber = () => {
  const year = new Date().getFullYear();
  const code = customAlphabet(NUMERIC, 6)();
  return `VIC-${year}-${code}`;
};

/**
 * Generate a unique job number
 * Format: JOB-YYYY-XXXXXX
 */
export const generateJobNumber = () => {
  const year = new Date().getFullYear();
  const code = customAlphabet(NUMERIC, 6)();
  return `JOB-${year}-${code}`;
};

/**
 * Generate a client tag for tracking
 * Format: CLT-XXXX-XXXX
 */
export const generateClientTag = () => {
  const part1 = customAlphabet(ALPHANUMERIC, 4)();
  const part2 = customAlphabet(ALPHANUMERIC, 4)();
  return `CLT-${part1}-${part2}`;
};

/**
 * Generate a payout number
 * Format: PO-YYYY-WXX-XXX
 */
export const generatePayoutNumber = (weekNumber) => {
  const year = new Date().getFullYear();
  const code = customAlphabet(NUMERIC, 3)();
  return `PO-${year}-W${String(weekNumber).padStart(2, '0')}-${code}`;
};

/**
 * Generate a transaction reference
 */
export const generateTransactionReference = () => {
  return `TXN-${nanoid(16)}`;
};

/**
 * Generate a special request number
 * Format: SR-YYYY-XXXXXX
 */
export const generateSpecialRequestNumber = () => {
  const year = new Date().getFullYear();
  const code = customAlphabet(NUMERIC, 6)();
  return `SR-${year}-${code}`;
};

/**
 * Generate a SKU
 * Format: SKU-XXXXXXXX
 */
export const generateSku = (prefix = 'SKU') => {
  const code = customAlphabet(ALPHANUMERIC, 8)();
  return `${prefix}-${code}`;
};

/**
 * Generate a unique session ID
 */
export const generateSessionId = () => {
  return nanoid(32);
};

/**
 * Generate a slug from text
 */
export const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
};

/**
 * Generate a unique slug with random suffix
 */
export const generateUniqueSlug = (text) => {
  const baseSlug = generateSlug(text);
  const suffix = customAlphabet(ALPHANUMERIC_LOWER, 6)();
  return `${baseSlug}-${suffix}`;
};

export default {
  generateActivationCode,
  generateAlphanumericCode,
  generateOrderNumber,
  generateJobNumber,
  generateClientTag,
  generatePayoutNumber,
  generateTransactionReference,
  generateSpecialRequestNumber,
  generateSku,
  generateSessionId,
  generateSlug,
  generateUniqueSlug,
};
