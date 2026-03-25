import { v2 as cloudinary } from 'cloudinary';
import config from '../../config/index.js';
import logger from '../../core/logger/index.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

/**
 * Upload file/image to Cloudinary
 */
export const uploadToCloudinary = async (fileStream, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || 'vicelle',
        resource_type: options.resource_type || 'auto',
        public_id: options.public_id,
        overwrite: options.overwrite || false,
        transformation: options.transformation,
        ...options,
      },
      (error, result) => {
        if (error) {
          logger.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          logger.info(`File uploaded to Cloudinary: ${result.public_id}`);
          resolve(result);
        }
      }
    );

    fileStream.pipe(uploadStream);
  });
};

/**
 * Upload profile picture
 */
export const uploadProfilePicture = async (fileStream, userId) => {
  return uploadToCloudinary(fileStream, {
    folder: 'vicelle/profiles',
    public_id: `user-${userId}-profile`,
    transformation: [
      { width: 500, height: 500, crop: 'fill' },
      { quality: 'auto' },
    ],
  });
};

/**
 * Upload order/measurement photos
 */
export const uploadOrderPhotos = async (fileStream, orderId) => {
  return uploadToCloudinary(fileStream, {
    folder: 'vicelle/orders',
    public_id: `order-${orderId}-${Date.now()}`,
    transformation: [
      { width: 1000, height: 1000, crop: 'fit' },
      { quality: 'auto' },
    ],
  });
};

/**
 * Upload tailor portfolio
 */
export const uploadPortfolioItem = async (fileStream, tailorId) => {
  return uploadToCloudinary(fileStream, {
    folder: 'vicelle/portfolio',
    public_id: `tailor-${tailorId}-portfolio-${Date.now()}`,
    transformation: [
      { width: 800, height: 800, crop: 'fill' },
      { quality: 'auto' },
    ],
  });
};

/**
 * Upload job proof photo (base64 data URI)
 */
export const uploadJobProofPhoto = async (base64DataUri, jobId, index) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      base64DataUri,
      {
        folder: 'vicelle/job-proofs',
        public_id: `job-${jobId}-proof-${index}-${Date.now()}`,
        transformation: [
          { width: 1500, height: 1500, crop: 'limit' },
          { quality: 'auto' },
        ],
      },
      (error, result) => {
        if (error) {
          logger.error('Cloudinary job proof upload error:', error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};

/**
 * Delete file from Cloudinary
 */
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info(`File deleted from Cloudinary: ${publicId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete file from Cloudinary: ${publicId}`, error);
    throw error;
  }
};

/**
 * Generate secure URL for private content
 */
export const generateSecureUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    secure: true,
    sign_url: true,
    type: 'authenticated',
    ...options,
  });
};

/**
 * Get file info from Cloudinary
 */
export const getFileInfo = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    logger.error(`Failed to get file info: ${publicId}`, error);
    throw error;
  }
};

export default {
  uploadToCloudinary,
  uploadProfilePicture,
  uploadOrderPhotos,
  uploadPortfolioItem,
  uploadJobProofPhoto,
  deleteFromCloudinary,
  generateSecureUrl,
  getFileInfo,
};
