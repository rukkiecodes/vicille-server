export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

export const PAYMENT_TYPE = {
  SUBSCRIPTION: 'subscription',
  SPECIAL_REQUEST: 'special_request',
  ACCESSORY: 'accessory',
  BALANCE: 'balance',
};

export const PAYMENT_METHOD_TYPE = {
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer',
  STANDING_ORDER: 'standing_order',
  USSD: 'ussd',
};

export const PAYMENT_ATTEMPT_TYPE = {
  INITIAL: 'initial',
  RETRY: 'retry',
  STANDING_ORDER_FALLBACK: 'standing_order_fallback',
};

export const PAYOUT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAID: 'paid',
  FAILED: 'failed',
};

export default {
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  PAYMENT_METHOD_TYPE,
  PAYMENT_ATTEMPT_TYPE,
  PAYOUT_STATUS,
};
