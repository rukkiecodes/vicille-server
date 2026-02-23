import { GraphQLError } from 'graphql';
import { v2 as cloudinary } from 'cloudinary';
import UserModel from '../../modules/users/user.model.js';
import { requireAuth, requireAdmin, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import { cloudinaryConfig, uploadPresets } from '../../config/cloudinary.js';
import logger from '../../core/logger/index.js';

cloudinary.config(cloudinaryConfig);

const userResolvers = {
  Query: {
    onboardingStatus: async (_, __, context) => {
      const authUser = requireAuth(context);
      if (authUser.type !== 'user') {
        throw new GraphQLError('This query is for users only', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      const user = await UserModel.findById(authUser.id);
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return {
        completed: user.onboardingCompleted ?? false,
        step:      user.onboardingStep      ?? 0,
      };
    },

    me: async (_, __, context) => {
      const authUser = requireAuth(context);
      if (authUser.type !== 'user') {
        throw new GraphQLError('This query is for users only', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      const user = await UserModel.findById(authUser.id);
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(user);
    },

    user: async (_, { id }, context) => {
      requireAuth(context);
      const user = await UserModel.findById(id);
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(user);
    },

    users: async (_, { filter = {}, pagination = {} }, context) => {
      requireAdmin(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;
      const offset = (page - 1) * limit;

      const filters = {};
      if (filter.accountStatus)          filters.accountStatus = filter.accountStatus;
      if (filter.subscriptionStatus)     filters.subscriptionStatus = filter.subscriptionStatus;
      if (filter.isActivated !== undefined)         filters.isActivated = filter.isActivated;
      if (filter.onboardingCompleted !== undefined) filters.onboardingCompleted = filter.onboardingCompleted;

      const users = await UserModel.find(filters, { limit, offset });
      const total = await UserModel.countDocuments(filters);

      return buildPaginatedResponse(entitiesToJSON(users), total, page, limit);
    },
  },

  Mutation: {
    updateProfile: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const updateData = {};

      if (input.fullName)    updateData.fullName = input.fullName;
      if (input.phone)       updateData.phone = input.phone;
      if (input.dateOfBirth) updateData.dateOfBirth = input.dateOfBirth;
      if (input.gender)      updateData.gender = input.gender;

      if (input.height) {
        updateData.height       = input.height.value;
        updateData.heightSource = input.height.source || null;
      }

      if (input.profilePhoto) {
        updateData.profilePhotoUrl = input.profilePhoto.url;
      }

      const user = await UserModel.findByIdAndUpdate(authUser.id, updateData);
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(user);
    },

    updateDeliveryDetails: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const user = await UserModel.updateDeliveryDetails(authUser.id, input);
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(user);
    },

    updatePreferences: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const user = await UserModel.updatePreferences(authUser.id, input);
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(user);
    },

    completeOnboardingStep: async (_, { step }, context) => {
      const authUser = requireAuth(context);
      const user = await UserModel.findById(authUser.id);
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const updateData = { onboardingStep: step };
      if (step >= 4) updateData.onboardingCompleted = true;

      const updated = await UserModel.findByIdAndUpdate(authUser.id, updateData);
      return entityToJSON(updated);
    },

    uploadProfilePhoto: async (_, { base64, mimeType = 'image/jpeg' }, context) => {
      const authUser = requireAuth(context);
      if (authUser.type !== 'user') {
        throw new GraphQLError('This mutation is for users only', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      const dataURI = `data:${mimeType};base64,${base64}`;

      let uploadResult;
      try {
        uploadResult = await cloudinary.uploader.upload(dataURI, {
          ...uploadPresets.profilePhoto,
          public_id: `user_${authUser.id}`,
          overwrite:  true,
        });
      } catch (err) {
        logger.error('Cloudinary upload error:', err);
        throw new GraphQLError('Failed to upload image. Please try again.', {
          extensions: { code: 'UPLOAD_FAILED' },
        });
      }

      const user = await UserModel.findByIdAndUpdate(authUser.id, {
        profilePhotoUrl: uploadResult.secure_url,
      });

      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      return entityToJSON(user);
    },

    deactivateAccount: async (_, __, context) => {
      const authUser = requireAuth(context);
      await UserModel.findByIdAndDelete(authUser.id);
      return { success: true, message: 'Account deactivated successfully' };
    },
  },

  User: {
    profilePhoto: (parent) => parent.profilePhoto ? { url: parent.profilePhoto } : null,
    deliveryDetails: (parent) => UserModel.findDeliveryDetails(parent.id),
    preferences: (parent) => UserModel.findPreferences(parent.id),
  },
};

export default userResolvers;
