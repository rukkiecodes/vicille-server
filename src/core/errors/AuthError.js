import AppError from './AppError.js';

class AuthError extends AppError {
  constructor(message = 'Authentication failed', code = 'AUTH_ERROR') {
    super(message, 401, code);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message = 'Invalid credentials') {
    super(message, 'INVALID_CREDENTIALS');
  }
}

export class TokenExpiredError extends AuthError {
  constructor(message = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED');
  }
}

export class InvalidTokenError extends AuthError {
  constructor(message = 'Invalid token') {
    super(message, 'INVALID_TOKEN');
  }
}

export class AccountNotActivatedError extends AuthError {
  constructor(message = 'Account not activated') {
    super(message, 'ACCOUNT_NOT_ACTIVATED');
  }
}

export class AccountSuspendedError extends AuthError {
  constructor(message = 'Account has been suspended') {
    super(message, 'ACCOUNT_SUSPENDED');
    this.statusCode = 403;
  }
}

export default AuthError;
