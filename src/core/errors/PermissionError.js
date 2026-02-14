import AppError from './AppError.js';

class PermissionError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'PERMISSION_DENIED');
  }
}

export class InsufficientRoleError extends PermissionError {
  constructor(requiredRole, currentRole) {
    super(`This action requires ${requiredRole} role. Your current role: ${currentRole}`);
    this.code = 'INSUFFICIENT_ROLE';
    this.requiredRole = requiredRole;
    this.currentRole = currentRole;
  }
}

export default PermissionError;
