export const NOTIFICATION_TYPE = {
  // Auth & Account
  WELCOME: 'welcome',
  ACTIVATION_CODE: 'activation_code',
  PASSWORD_RESET: 'password_reset',
  ACCOUNT_SUSPENDED: 'account_suspended',

  // Subscription
  SUBSCRIPTION_CREATED: 'subscription_created',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  PAYMENT_REMINDER: 'payment_reminder',

  // Orders
  ORDER_CREATED: 'order_created',
  ORDER_STATUS_UPDATE: 'order_status_update',
  STYLING_WINDOW_OPEN: 'styling_window_open',
  STYLING_WINDOW_CLOSING: 'styling_window_closing',
  STYLING_WINDOW_CLOSED: 'styling_window_closed',
  PRODUCTION_STARTED: 'production_started',
  ORDER_READY: 'order_ready',
  ORDER_DISPATCHED: 'order_dispatched',
  ORDER_DELIVERED: 'order_delivered',
  ORDER_CANCELLED: 'order_cancelled',

  // Payments
  PAYMENT_SUCCESSFUL: 'payment_successful',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_RETRY: 'payment_retry',
  REFUND_PROCESSED: 'refund_processed',

  // Special Requests
  SPECIAL_REQUEST_RECEIVED: 'special_request_received',
  SPECIAL_REQUEST_QUOTED: 'special_request_quoted',
  SPECIAL_REQUEST_APPROVED: 'special_request_approved',
  SPECIAL_REQUEST_IN_PROGRESS: 'special_request_in_progress',
  SPECIAL_REQUEST_COMPLETED: 'special_request_completed',

  // Tailor Notifications
  JOB_ASSIGNED: 'job_assigned',
  JOB_REASSIGNED: 'job_reassigned',
  MATERIALS_ISSUED: 'materials_issued',
  JOB_DEADLINE_REMINDER: 'job_deadline_reminder',
  QC_APPROVED: 'qc_approved',
  QC_REJECTED: 'qc_rejected',
  PAYOUT_PROCESSED: 'payout_processed',
  PERFORMANCE_WARNING: 'performance_warning',
  CAPACITY_ADJUSTED: 'capacity_adjusted',

  // Admin Notifications
  NEW_USER_REGISTRATION: 'new_user_registration',
  NEW_TAILOR_APPLICATION: 'new_tailor_application',
  NEW_SPECIAL_REQUEST: 'new_special_request',
  PAYMENT_VERIFICATION_NEEDED: 'payment_verification_needed',
  QC_REVIEW_NEEDED: 'qc_review_needed',
  LOW_INVENTORY_ALERT: 'low_inventory_alert',
  SYSTEM_ALERT: 'system_alert',
};

export const NOTIFICATION_CHANNEL = {
  EMAIL: 'email',
  PUSH: 'push',
  IN_APP: 'in_app',
  SMS: 'sms',
};

export const NOTIFICATION_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  READ: 'read',
};

export const NOTIFICATION_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

export default {
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATUS,
  NOTIFICATION_PRIORITY,
};
