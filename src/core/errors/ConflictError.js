import AppError from './AppError.js';

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class DuplicateEntryError extends ConflictError {
  constructor(field, value) {
    super(`A record with ${field} "${value}" already exists`);
    this.code = 'DUPLICATE_ENTRY';
    this.field = field;
    this.value = value;
  }
}

export default ConflictError;
