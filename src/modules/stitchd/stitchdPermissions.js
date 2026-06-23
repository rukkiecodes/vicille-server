/**
 * Stitchd RBAC — roles + permission catalog + resolution (batch 16).
 *
 * A small fixed role set with a per-role default permission matrix; a member can carry an
 * override set (JSONB) that replaces the role defaults. The OWNER (the tailors account itself)
 * implicitly holds ALL permissions. Shared by the `requirePermission` guard and the
 * `stitchdMyPermissions` query so backend enforcement and UI gating never drift.
 */
export const ROLES = ['owner', 'manager', 'staff', 'viewer'];

/** The full permission catalog (grouped for the UI matrix). */
export const PERMISSIONS = {
  'customers:read':   'View customers',
  'customers:write':  'Add / edit customers',
  'customers:delete': 'Delete customers',
  'orders:read':      'View orders',
  'orders:write':     'Create / advance orders',
  'orders:delete':    'Delete orders',
  'measurements:write': 'Take measurements',
  'payments:read':    'View money',
  'payments:collect': 'Record / collect payments',
  'ai:use':           'Use AI tools',
  'messages:send':    'Send WhatsApp messages',
  'settings:billing': 'Manage billing',
  'team:manage':      'Manage team members',
  'analytics:view':   'View analytics',
};
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

/** UI groups (label → permission keys). */
export const PERMISSION_GROUPS = [
  { label: 'Customers', perms: ['customers:read', 'customers:write', 'customers:delete'] },
  { label: 'Orders', perms: ['orders:read', 'orders:write', 'orders:delete', 'measurements:write'] },
  { label: 'Money', perms: ['payments:read', 'payments:collect'] },
  { label: 'Tools', perms: ['ai:use', 'messages:send', 'analytics:view'] },
  { label: 'Admin', perms: ['settings:billing', 'team:manage'] },
];

/** Per-role default permissions. Owner = everything. */
const ROLE_PERMISSIONS = {
  owner: ALL_PERMISSIONS,
  manager: [
    'customers:read', 'customers:write', 'customers:delete',
    'orders:read', 'orders:write', 'orders:delete', 'measurements:write',
    'payments:read', 'payments:collect', 'ai:use', 'messages:send', 'analytics:view',
  ],
  staff: [
    'customers:read', 'customers:write',
    'orders:read', 'orders:write', 'measurements:write',
    'payments:read', 'payments:collect', 'ai:use', 'messages:send',
  ],
  viewer: ['customers:read', 'orders:read', 'payments:read', 'analytics:view'],
};

function normalizeRole(role) {
  return ROLES.includes(role) ? role : 'staff';
}

/**
 * Effective permission set for a (role, overrides). If `overrides` is a non-empty array it
 * REPLACES the role defaults (filtered to the catalog); otherwise role defaults apply.
 */
export function effectivePermissions(role, overrides = null) {
  if (Array.isArray(overrides) && overrides.length) {
    return overrides.filter((p) => ALL_PERMISSIONS.includes(p));
  }
  return ROLE_PERMISSIONS[normalizeRole(role)].slice();
}

/** Default permissions for a role (for the UI matrix's initial state). */
export function rolePermissions(role) {
  return ROLE_PERMISSIONS[normalizeRole(role)].slice();
}

export default { ROLES, PERMISSIONS, ALL_PERMISSIONS, PERMISSION_GROUPS, effectivePermissions, rolePermissions };
