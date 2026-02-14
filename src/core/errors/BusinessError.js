import AppError from './AppError.js';

class BusinessError extends AppError {
  constructor(message, code = 'BUSINESS_RULE_VIOLATION') {
    super(message, 422, code);
  }
}

export class InvalidStateTransitionError extends BusinessError {
  constructor(currentState, targetState, entity = 'Entity') {
    super(`Cannot transition ${entity} from "${currentState}" to "${targetState}"`);
    this.code = 'INVALID_STATE_TRANSITION';
    this.currentState = currentState;
    this.targetState = targetState;
  }
}

export class StylingWindowClosedError extends BusinessError {
  constructor() {
    super('Styling window is closed. Changes cannot be made.');
    this.code = 'STYLING_WINDOW_CLOSED';
  }
}

export class InsufficientBalanceError extends BusinessError {
  constructor() {
    super('Insufficient balance to complete this transaction');
    this.code = 'INSUFFICIENT_BALANCE';
  }
}

export class PaymentRequiredError extends BusinessError {
  constructor() {
    super('Payment is required to proceed');
    this.code = 'PAYMENT_REQUIRED';
    this.statusCode = 402;
  }
}

export class SubscriptionInactiveError extends BusinessError {
  constructor() {
    super('Your subscription is not active');
    this.code = 'SUBSCRIPTION_INACTIVE';
  }
}

export class CancellationNotAllowedError extends BusinessError {
  constructor(reason) {
    super(`Cancellation is not allowed: ${reason}`);
    this.code = 'CANCELLATION_NOT_ALLOWED';
  }
}

export default BusinessError;
