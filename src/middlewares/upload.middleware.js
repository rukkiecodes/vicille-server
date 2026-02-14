import multer from 'multer';
import path from 'path';
import { AppError } from '../core/errors/index.js';
import config from '../config/index.js';

// Allowed MIME types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const ALLOWED_DOCUMENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
];

// File filter for images
const imageFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
        400,
        'INVALID_FILE_TYPE'
      ),
      false
    );
  }
};

// File filter for documents (including PDFs)
const documentFilter = (req, file, cb) => {
  if (ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Invalid file type. Allowed types: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`,
        400,
        'INVALID_FILE_TYPE'
      ),
      false
    );
  }
};

// Memory storage (for direct upload to Cloudinary)
const memoryStorage = multer.memoryStorage();

// Multer configuration for images
export const uploadImage = multer({
  storage: memoryStorage,
  limits: {
    fileSize: config.cloudinary.maxFileSize,
    files: 1,
  },
  fileFilter: imageFilter,
});

// Multer configuration for multiple images
export const uploadImages = multer({
  storage: memoryStorage,
  limits: {
    fileSize: config.cloudinary.maxFileSize,
    files: 10,
  },
  fileFilter: imageFilter,
});

// Multer configuration for documents
export const uploadDocument = multer({
  storage: memoryStorage,
  limits: {
    fileSize: config.cloudinary.maxFileSize * 2, // Allow larger files for documents
    files: 1,
  },
  fileFilter: documentFilter,
});

// Single image upload middleware
export const singleImageUpload = uploadImage.single('image');

// Multiple images upload middleware
export const multipleImagesUpload = uploadImages.array('images', 10);

// Single document upload middleware
export const documentUploadMiddleware = uploadDocument.single('document');

// Profile photo upload
export const profilePhotoUpload = uploadImage.single('profilePhoto');

// Completion proof upload
export const completionProofUpload = uploadImages.array('proofImages', 5);

// KYC document upload
export const kycDocumentUpload = uploadDocument.single('kycDocument');

// Error handler for multer errors
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(
          `File too large. Maximum size is ${config.cloudinary.maxFileSize / 1024 / 1024}MB`,
          400,
          'FILE_TOO_LARGE'
        )
      );
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new AppError('Too many files', 400, 'TOO_MANY_FILES'));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError('Unexpected field name', 400, 'UNEXPECTED_FIELD'));
    }
    return next(new AppError(err.message, 400, 'UPLOAD_ERROR'));
  }
  next(err);
};

export default {
  uploadImage,
  uploadImages,
  uploadDocument,
  singleImageUpload,
  multipleImagesUpload,
  documentUploadMiddleware,
  profilePhotoUpload,
  completionProofUpload,
  kycDocumentUpload,
  handleMulterError,
};
