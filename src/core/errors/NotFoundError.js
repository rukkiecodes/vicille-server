import AppError from './AppError.js';

class NotFoundError extends AppError {
  constructor(resource = 'Resource', identifier = '') {
    const message = identifier
      ? `${resource} with identifier "${identifier}" not found`
      : `${resource} not found`;

    super(message, 404, 'NOT_FOUND');
    this.resource = resource;
    this.identifier = identifier;
  }
}

export default NotFoundError;
