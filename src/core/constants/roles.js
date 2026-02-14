export const ROLES = {
  USER: 'user',
  TAILOR: 'tailor',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  QC: 'qc',
  WAREHOUSE: 'warehouse',
  FINANCE: 'finance',
};

export const ADMIN_ROLES = [
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.QC,
  ROLES.WAREHOUSE,
  ROLES.FINANCE,
];

export const PERMISSIONS = {
  // User permissions
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  // Tailor permissions
  TAILOR_READ: 'tailor:read',
  TAILOR_CREATE: 'tailor:create',
  TAILOR_UPDATE: 'tailor:update',
  TAILOR_DELETE: 'tailor:delete',
  TAILOR_VERIFY: 'tailor:verify',
  TAILOR_ASSIGN_JOB: 'tailor:assign_job',

  // Order permissions
  ORDER_READ: 'order:read',
  ORDER_CREATE: 'order:create',
  ORDER_UPDATE: 'order:update',
  ORDER_DELETE: 'order:delete',
  ORDER_CANCEL: 'order:cancel',
  ORDER_STATUS_UPDATE: 'order:status_update',

  // Job permissions
  JOB_READ: 'job:read',
  JOB_ASSIGN: 'job:assign',
  JOB_REASSIGN: 'job:reassign',
  JOB_UPDATE: 'job:update',

  // Payment permissions
  PAYMENT_READ: 'payment:read',
  PAYMENT_PROCESS: 'payment:process',
  PAYMENT_REFUND: 'payment:refund',

  // Payout permissions
  PAYOUT_READ: 'payout:read',
  PAYOUT_PROCESS: 'payout:process',

  // QC permissions
  QC_REVIEW: 'qc:review',
  QC_APPROVE: 'qc:approve',
  QC_REJECT: 'qc:reject',

  // Inventory permissions
  INVENTORY_READ: 'inventory:read',
  INVENTORY_CREATE: 'inventory:create',
  INVENTORY_UPDATE: 'inventory:update',
  INVENTORY_ISSUE: 'inventory:issue',

  // Collection permissions
  COLLECTION_READ: 'collection:read',
  COLLECTION_CREATE: 'collection:create',
  COLLECTION_UPDATE: 'collection:update',
  COLLECTION_DELETE: 'collection:delete',

  // Analytics permissions
  ANALYTICS_READ: 'analytics:read',

  // Admin permissions
  ADMIN_CREATE: 'admin:create',
  ADMIN_UPDATE: 'admin:update',
  ADMIN_DELETE: 'admin:delete',

  // System permissions
  SYSTEM_CONFIG: 'system:config',
  AUDIT_READ: 'audit:read',
};

// Role-based permission mapping
export const ROLE_PERMISSIONS = {
  [ROLES.USER]: [],
  [ROLES.TAILOR]: [
    PERMISSIONS.JOB_READ,
    PERMISSIONS.JOB_UPDATE,
  ],
  [ROLES.QC]: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.JOB_READ,
    PERMISSIONS.QC_REVIEW,
    PERMISSIONS.QC_APPROVE,
    PERMISSIONS.QC_REJECT,
    PERMISSIONS.TAILOR_READ,
  ],
  [ROLES.WAREHOUSE]: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.JOB_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_CREATE,
    PERMISSIONS.INVENTORY_UPDATE,
    PERMISSIONS.INVENTORY_ISSUE,
  ],
  [ROLES.FINANCE]: [
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_PROCESS,
    PERMISSIONS.PAYMENT_REFUND,
    PERMISSIONS.PAYOUT_READ,
    PERMISSIONS.PAYOUT_PROCESS,
    PERMISSIONS.ANALYTICS_READ,
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.TAILOR_READ,
    PERMISSIONS.TAILOR_UPDATE,
    PERMISSIONS.TAILOR_VERIFY,
    PERMISSIONS.TAILOR_ASSIGN_JOB,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.ORDER_STATUS_UPDATE,
    PERMISSIONS.JOB_READ,
    PERMISSIONS.JOB_ASSIGN,
    PERMISSIONS.JOB_REASSIGN,
    PERMISSIONS.JOB_UPDATE,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYOUT_READ,
    PERMISSIONS.QC_REVIEW,
    PERMISSIONS.QC_APPROVE,
    PERMISSIONS.QC_REJECT,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_ISSUE,
    PERMISSIONS.COLLECTION_READ,
    PERMISSIONS.COLLECTION_CREATE,
    PERMISSIONS.COLLECTION_UPDATE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
};

export default { ROLES, ADMIN_ROLES, PERMISSIONS, ROLE_PERMISSIONS };
