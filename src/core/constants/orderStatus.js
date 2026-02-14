export const ORDER_STATUS = {
  STYLING_IN_PROGRESS: 'styling_in_progress',
  PRODUCTION_IN_PROGRESS: 'production_in_progress',
  PACKAGE_READY_PAYMENT_REQUIRED: 'package_ready_payment_required',
  PACKAGE_READY_DELIVERY_IN_PROGRESS: 'package_ready_delivery_in_progress',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

// Valid state transitions
export const ORDER_STATUS_TRANSITIONS = {
  [ORDER_STATUS.STYLING_IN_PROGRESS]: [
    ORDER_STATUS.PRODUCTION_IN_PROGRESS,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PRODUCTION_IN_PROGRESS]: [
    ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED,
    ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS, // If already paid
  ],
  [ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED]: [
    ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS,
  ],
  [ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS]: [
    ORDER_STATUS.DELIVERED,
  ],
  [ORDER_STATUS.DELIVERED]: [],
  [ORDER_STATUS.CANCELLED]: [],
};

// Check if transition is valid
export const isValidTransition = (currentStatus, newStatus) => {
  const validTransitions = ORDER_STATUS_TRANSITIONS[currentStatus] || [];
  return validTransitions.includes(newStatus);
};

// Statuses where styling window is open
export const STYLING_WINDOW_OPEN_STATUSES = [ORDER_STATUS.STYLING_IN_PROGRESS];

// Statuses where order can be cancelled
export const CANCELLABLE_STATUSES = [ORDER_STATUS.STYLING_IN_PROGRESS];

// Statuses where accessories can be purchased
export const ACCESSORY_PURCHASE_STATUSES = [ORDER_STATUS.PRODUCTION_IN_PROGRESS];

// Order item statuses
export const ORDER_ITEM_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  QC_REVIEW: 'qc_review',
  QC_APPROVED: 'qc_approved',
  QC_REJECTED: 'qc_rejected',
};

export default {
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  isValidTransition,
  STYLING_WINDOW_OPEN_STATUSES,
  CANCELLABLE_STATUSES,
  ACCESSORY_PURCHASE_STATUSES,
  ORDER_ITEM_STATUS,
};
