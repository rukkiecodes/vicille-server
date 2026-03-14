import config from './index.js';

export const cloudinaryConfig = {
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
};

export const uploadPresets = {
  profilePhoto: {
    folder: 'vicelle/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }],
  },
  orderImage: {
    folder: 'vicelle/orders',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
  },
  kycDocument: {
    folder: 'vicelle/kyc',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    resource_type: 'auto',
  },
  completionProof: {
    folder: 'vicelle/proofs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1500, height: 1500, crop: 'limit' }],
  },
  studioPhoto: {
    folder: 'vicelle/studio-photos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1024, crop: 'limit', quality: 'auto:good' }],
  },
  collectionImage: {
    folder: 'vicelle/collections',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 1600, crop: 'limit' }],
  },
  accessoryImage: {
    folder: 'vicelle/accessories',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
  },
  inspirationImage: {
    folder: 'vicelle/inspiration',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
  },
  qcIssuePhoto: {
    folder: 'vicelle/qc-issues',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
  },
};

export default cloudinaryConfig;
