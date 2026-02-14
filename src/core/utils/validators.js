/**
 * Check if value is a valid entity ID (Redis OM uses ULID format)
 * ULID: 26 characters, base32 encoded (Crockford's alphabet)
 */
export const isValidEntityId = (id) => {
  if (typeof id !== 'string') return false;
  // Redis OM generates 26-character ULID strings
  const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  return ulidRegex.test(id);
};

// Alias for backward compatibility
export const isValidObjectId = isValidEntityId;

/**
 * Check if email is valid
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Check if phone number is valid (Nigerian format)
 */
export const isValidNigerianPhone = (phone) => {
  // Nigerian phone: +234XXXXXXXXXX or 0XXXXXXXXXX
  const phoneRegex = /^(\+234|0)[789]\d{9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Check if phone number is valid (general format)
 */
export const isValidPhone = (phone) => {
  // General format: allows + and digits, 10-15 characters
  const phoneRegex = /^\+?\d{10,15}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ''));
};

/**
 * Normalize phone number (Nigerian)
 */
export const normalizeNigerianPhone = (phone) => {
  const cleaned = phone.replace(/[\s-]/g, '');
  if (cleaned.startsWith('0')) {
    return `+234${cleaned.substring(1)}`;
  }
  if (cleaned.startsWith('234')) {
    return `+${cleaned}`;
  }
  return cleaned;
};

/**
 * Check if string is not empty
 */
export const isNotEmpty = (value) => {
  if (typeof value !== 'string') {
    return false;
  }
  return value.trim().length > 0;
};

/**
 * Check if value is within range
 */
export const isInRange = (value, min, max) => {
  const num = parseFloat(value);
  return !isNaN(num) && num >= min && num <= max;
};

/**
 * Check if value is a positive number
 */
export const isPositiveNumber = (value) => {
  const num = parseFloat(value);
  return !isNaN(num) && num > 0;
};

/**
 * Check if value is a non-negative number
 */
export const isNonNegativeNumber = (value) => {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0;
};

/**
 * Check if array has items
 */
export const hasItems = (arr) => {
  return Array.isArray(arr) && arr.length > 0;
};

/**
 * Check if value is a valid date
 */
export const isValidDate = (date) => {
  const d = new Date(date);
  return d instanceof Date && !isNaN(d);
};

/**
 * Check if date is in the future
 */
export const isFutureDate = (date) => {
  return isValidDate(date) && new Date(date) > new Date();
};

/**
 * Check if date is in the past
 */
export const isPastDate = (date) => {
  return isValidDate(date) && new Date(date) < new Date();
};

/**
 * Check if value is a valid URL
 */
export const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if value is one of allowed values
 */
export const isOneOf = (value, allowedValues) => {
  return allowedValues.includes(value);
};

/**
 * Sanitize string (remove dangerous characters)
 */
export const sanitizeString = (str) => {
  if (typeof str !== 'string') {
    return str;
  }
  return str
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim();
};

/**
 * Sanitize object recursively
 */
export const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
};

export default {
  isValidEntityId,
  isValidObjectId,
  isValidEmail,
  isValidNigerianPhone,
  isValidPhone,
  normalizeNigerianPhone,
  isNotEmpty,
  isInRange,
  isPositiveNumber,
  isNonNegativeNumber,
  hasItems,
  isValidDate,
  isFutureDate,
  isPastDate,
  isValidUrl,
  isOneOf,
  sanitizeString,
  sanitizeObject,
};
