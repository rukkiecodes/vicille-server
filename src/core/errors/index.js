import AppError from './AppError.js';
import ValidationError from './ValidationError.js';
import AuthError, {
  InvalidCredentialsError,
  TokenExpiredError,
  InvalidTokenError,
  AccountNotActivatedError,
  AccountSuspendedError,
} from './AuthError.js';
import PermissionError, { InsufficientRoleError } from './PermissionError.js';
import NotFoundError from './NotFoundError.js';
import ConflictError, { DuplicateEntryError } from './ConflictError.js';
import BusinessError, {
  InvalidStateTransitionError,
  StylingWindowClosedError,
  InsufficientBalanceError,
  PaymentRequiredError,
  SubscriptionInactiveError,
  CancellationNotAllowedError,
} from './BusinessError.js';

export {
  AppError,
  ValidationError,
  AuthError,
  InvalidCredentialsError,
  TokenExpiredError,
  InvalidTokenError,
  AccountNotActivatedError,
  AccountSuspendedError,
  PermissionError,
  InsufficientRoleError,
  NotFoundError,
  ConflictError,
  DuplicateEntryError,
  BusinessError,
  InvalidStateTransitionError,
  StylingWindowClosedError,
  InsufficientBalanceError,
  PaymentRequiredError,
  SubscriptionInactiveError,
  CancellationNotAllowedError,
};

export default {
  AppError,
  ValidationError,
  AuthError,
  InvalidCredentialsError,
  TokenExpiredError,
  InvalidTokenError,
  AccountNotActivatedError,
  AccountSuspendedError,
  PermissionError,
  InsufficientRoleError,
  NotFoundError,
  ConflictError,
  DuplicateEntryError,
  BusinessError,
  InvalidStateTransitionError,
  StylingWindowClosedError,
  InsufficientBalanceError,
  PaymentRequiredError,
  SubscriptionInactiveError,
  CancellationNotAllowedError,
};
