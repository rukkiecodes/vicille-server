export const ERROR_CODES = {
  // General errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',

  // Authentication errors
  AUTH_ERROR: 'AUTH_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  ACCOUNT_NOT_ACTIVATED: 'ACCOUNT_NOT_ACTIVATED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',

  // Authorization errors
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',

  // Business logic errors
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  STYLING_WINDOW_CLOSED: 'STYLING_WINDOW_CLOSED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  SUBSCRIPTION_INACTIVE: 'SUBSCRIPTION_INACTIVE',
  CANCELLATION_NOT_ALLOWED: 'CANCELLATION_NOT_ALLOWED',

  // Payment errors
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  INVALID_PAYMENT_METHOD: 'INVALID_PAYMENT_METHOD',
  REFUND_FAILED: 'REFUND_FAILED',

  // File upload errors
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  UPLOAD_FAILED: 'UPLOAD_FAILED',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',

  // External service errors
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  SMS_SEND_FAILED: 'SMS_SEND_FAILED',
  PAYMENT_PROVIDER_ERROR: 'PAYMENT_PROVIDER_ERROR',
};

export const ERROR_MESSAGES = {
  [ERROR_CODES.INTERNAL_ERROR]: 'An internal error occurred. Please try again later.',
  [ERROR_CODES.VALIDATION_ERROR]: 'Invalid input data provided.',
  [ERROR_CODES.NOT_FOUND]: 'The requested resource was not found.',
  [ERROR_CODES.CONFLICT]: 'A conflict occurred with the current state of the resource.',
  [ERROR_CODES.DUPLICATE_ENTRY]: 'A record with this information already exists.',
  [ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid email or activation code.',
  [ERROR_CODES.TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [ERROR_CODES.INVALID_TOKEN]: 'Invalid authentication token.',
  [ERROR_CODES.ACCOUNT_NOT_ACTIVATED]: 'Your account has not been activated.',
  [ERROR_CODES.ACCOUNT_SUSPENDED]: 'Your account has been suspended.',
  [ERROR_CODES.ACCOUNT_LOCKED]: 'Your account is temporarily locked due to multiple failed login attempts.',
  [ERROR_CODES.PERMISSION_DENIED]: 'You do not have permission to perform this action.',
  [ERROR_CODES.INSUFFICIENT_ROLE]: 'Your role does not have the required permissions.',
  [ERROR_CODES.STYLING_WINDOW_CLOSED]: 'The styling window is closed and changes cannot be made.',
  [ERROR_CODES.SUBSCRIPTION_INACTIVE]: 'Your subscription is not active.',
  [ERROR_CODES.PAYMENT_FAILED]: 'Payment processing failed.',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later.',
};

export default { ERROR_CODES, ERROR_MESSAGES };
