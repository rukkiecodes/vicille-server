import { GraphQLError } from 'graphql';
import UserModel from '../../modules/users/user.model.js';
import { requireAuth, requireAdmin, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import logger from '../../core/logger/index.js';

const userResolvers = {
  Query: {
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

      const query = {};
      if (filter.accountStatus) {
        query.accountStatus = filter.accountStatus;
      }
      if (filter.subscriptionStatus) {
        query.subscriptionStatus = filter.subscriptionStatus;
      }
      if (filter.isActivated !== undefined) {
        query.isActivated = filter.isActivated;
      }
      if (filter.onboardingCompleted !== undefined) {
        query.onboardingCompleted = filter.onboardingCompleted;
      }

      const users = await UserModel.find(query, { page, limit });
      const total = await UserModel.countDocuments(query);

      return buildPaginatedResponse(entitiesToJSON(users), total, page, limit);
    },
  },

  Mutation: {
    updateProfile: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const updateData = {};

      if (input.fullName) {
        updateData.fullName = input.fullName;
      }
      if (input.phone) {
        updateData.phone = input.phone;
      }
      if (input.dateOfBirth) {
        updateData.dateOfBirth = input.dateOfBirth;
      }
      if (input.gender) {
        updateData.gender = input.gender;
      }
      if (input.height) {
        updateData.height = input.height;
      }
      if (input.profilePhoto) {
        updateData.profilePhoto = input.profilePhoto;
      }

      const user = await UserModel.findByIdAndUpdate(authUser.id, updateData, { new: true });
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(user);
    },

    updateDeliveryDetails: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const user = await UserModel.findByIdAndUpdate(
        authUser.id,
        { deliveryDetails: input },
        { new: true }
      );
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(user);
    },

    updatePreferences: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const user = await UserModel.findByIdAndUpdate(
        authUser.id,
        { preferences: input },
        { new: true }
      );
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(user);
    },

    completeOnboardingStep: async (_, { step, data }, context) => {
      const authUser = requireAuth(context);
      const user = await UserModel.findById(authUser.id);
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const updateData = {
        onboardingStep: step,
      };

      if (data) {
        const existingData = user.onboardingData
          ? (typeof user.onboardingData === 'string' ? JSON.parse(user.onboardingData) : user.onboardingData)
          : {};
        updateData.onboardingData = { ...existingData, [`step${step}`]: data };
      }

      // Check if onboarding is complete (4 steps in the app)
      if (step >= 4) {
        updateData.onboardingCompleted = true;
      }

      const updated = await UserModel.findByIdAndUpdate(authUser.id, updateData, { new: true });
      return entityToJSON(updated);
    },

    deactivateAccount: async (_, __, context) => {
      const authUser = requireAuth(context);
      await UserModel.findByIdAndDelete(authUser.id);
      return { success: true, message: 'Account deactivated successfully' };
    },
  },
};

export default userResolvers;
