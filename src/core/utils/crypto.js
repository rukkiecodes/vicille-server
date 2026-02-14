import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

/**
 * Hash a plain text password
 */
export const hashPassword = async (password) => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compare a plain text password with a hash
 */
export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

/**
 * Hash an activation code
 */
export const hashActivationCode = async (code) => {
  return bcrypt.hash(code, SALT_ROUNDS);
};

/**
 * Compare an activation code with a hash
 */
export const compareActivationCode = async (code, hash) => {
  return bcrypt.compare(code, hash);
};

/**
 * Generate a random hex string
 */
export const generateRandomHex = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate a random base64 string
 */
export const generateRandomBase64 = (length = 32) => {
  return crypto.randomBytes(length).toString('base64url');
};

/**
 * Create a hash of a string (SHA256)
 */
export const createHash = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Create an HMAC signature
 */
export const createHmac = (data, secret) => {
  return crypto.createHmac('sha512', secret).update(data).digest('hex');
};

/**
 * Verify HMAC signature
 */
export const verifyHmac = (data, signature, secret) => {
  const expectedSignature = createHmac(data, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

export default {
  hashPassword,
  comparePassword,
  hashActivationCode,
  compareActivationCode,
  generateRandomHex,
  generateRandomBase64,
  createHash,
  createHmac,
  verifyHmac,
};
