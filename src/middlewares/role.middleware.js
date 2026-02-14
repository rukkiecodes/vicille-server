import { PermissionError, InsufficientRoleError } from '../core/errors/index.js';
import { ROLE_PERMISSIONS, ADMIN_ROLES } from '../core/constants/roles.js';

/**
 * Check if user has required role
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new PermissionError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new InsufficientRoleError(allowedRoles.join(' or '), req.user.role)
      );
    }

    next();
  };
};

/**
 * Check if user has required permission
 */
export const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new PermissionError('Authentication required'));
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];

    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return next(
        new PermissionError(
          `Missing required permissions: ${requiredPermissions.join(', ')}`
        )
      );
    }

    next();
  };
};

/**
 * Check if user has at least one of the required permissions
 */
export const requireAnyPermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new PermissionError('Authentication required'));
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];

    const hasAnyPermission = permissions.some((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasAnyPermission) {
      return next(
        new PermissionError(
          `Missing at least one of the required permissions: ${permissions.join(', ')}`
        )
      );
    }

    next();
  };
};

/**
 * Check if user is an admin (any admin role)
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new PermissionError('Authentication required'));
  }

  if (!ADMIN_ROLES.includes(req.user.role)) {
    return next(new PermissionError('Admin access required'));
  }

  next();
};

/**
 * Check if user owns the resource or is admin
 */
export const requireOwnerOrAdmin = (getResourceOwnerId) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new PermissionError('Authentication required'));
    }

    // Admins always have access
    if (ADMIN_ROLES.includes(req.user.role)) {
      return next();
    }

    try {
      const ownerId = await getResourceOwnerId(req);

      if (ownerId && ownerId.toString() === req.user.id) {
        return next();
      }

      next(new PermissionError('You do not have access to this resource'));
    } catch (error) {
      next(error);
    }
  };
};

export default {
  requireRole,
  requirePermission,
  requireAnyPermission,
  requireAdmin,
  requireOwnerOrAdmin,
};
