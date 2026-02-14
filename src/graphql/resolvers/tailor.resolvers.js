import { GraphQLError } from 'graphql';
import TailorModel from '../../modules/tailors/tailor.model.js';
import { requireAuth, requireAdmin, requireTailor, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import logger from '../../core/logger/index.js';

const tailorResolvers = {
  Query: {
    tailor: async (_, { id }, context) => {
      requireAuth(context);
      const tailor = await TailorModel.findById(id);
      if (!tailor) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(tailor);
    },

    tailors: async (_, { filter = {}, pagination = {} }, context) => {
      requireAdmin(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;

      const query = {};
      if (filter.accountStatus) {
        query.accountStatus = filter.accountStatus;
      }
      if (filter.verificationStatus) {
        query.verificationStatus = filter.verificationStatus;
      }

      const tailors = await TailorModel.find(query, { page, limit });
      const total = await TailorModel.countDocuments(query);

      return buildPaginatedResponse(entitiesToJSON(tailors), total, page, limit);
    },

    availableTailors: async (_, __, context) => {
      requireAuth(context);
      const tailors = await TailorModel.findAvailable();
      return entitiesToJSON(tailors);
    },

    tailorsBySpecialty: async (_, { category }, context) => {
      requireAuth(context);
      const tailors = await TailorModel.findBySpecialty(category);
      return entitiesToJSON(tailors);
    },
  },

  Mutation: {
    updateTailorProfile: async (_, { input }, context) => {
      const authUser = requireTailor(context);
      const updateData = {};

      if (input.fullName) {
        updateData.fullName = input.fullName;
      }
      if (input.phone) {
        updateData.phone = input.phone;
      }
      if (input.profilePhoto) {
        updateData.profilePhoto = input.profilePhoto;
      }
      if (input.specialties) {
        updateData.specialties = input.specialties;
      }

      const tailor = await TailorModel.findByIdAndUpdate(authUser.id, updateData, { new: true });
      if (!tailor) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(tailor);
    },

    updateTailorCapacity: async (_, { input }, context) => {
      const authUser = requireTailor(context);
      const tailor = await TailorModel.findById(authUser.id);
      if (!tailor) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const currentCapacity = tailor.capacityParsed;
      const updatedCapacity = { ...currentCapacity, ...input };

      const updated = await TailorModel.findByIdAndUpdate(
        authUser.id,
        { capacity: updatedCapacity },
        { new: true }
      );
      return entityToJSON(updated);
    },

    updateTailorAvailability: async (_, { input }, context) => {
      const authUser = requireTailor(context);
      const tailor = await TailorModel.findById(authUser.id);
      if (!tailor) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const currentAvailability = tailor.availabilityParsed;
      const updatedAvailability = {
        ...currentAvailability,
        workingDays: input.workingDays || currentAvailability.workingDays,
        workingHours: {
          start: input.workingHoursStart || currentAvailability.workingHours?.start,
          end: input.workingHoursEnd || currentAvailability.workingHours?.end,
        },
        isAvailable: input.isAvailable !== undefined ? input.isAvailable : currentAvailability.isAvailable,
      };

      const updated = await TailorModel.findByIdAndUpdate(
        authUser.id,
        { availability: updatedAvailability },
        { new: true }
      );
      return entityToJSON(updated);
    },

    updateTailorPaymentDetails: async (_, { input }, context) => {
      const authUser = requireTailor(context);
      const updated = await TailorModel.findByIdAndUpdate(
        authUser.id,
        { paymentDetails: input },
        { new: true }
      );
      if (!updated) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(updated);
    },

    verifyTailor: async (_, { id, score, notes }, context) => {
      requireAdmin(context);
      const updateData = {
        verificationStatus: 'verified',
        verifiedBy: context.user.id,
        verifiedAt: new Date(),
      };
      if (score !== undefined) {
        updateData.skillTestScore = score;
      }
      if (notes) {
        updateData.skillTestNotes = notes;
      }

      const tailor = await TailorModel.findByIdAndUpdate(id, updateData, { new: true });
      if (!tailor) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(tailor);
    },

    rejectTailor: async (_, { id, reason }, context) => {
      requireAdmin(context);
      const tailor = await TailorModel.findByIdAndUpdate(id, {
        verificationStatus: 'rejected',
        skillTestNotes: reason,
      }, { new: true });
      if (!tailor) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(tailor);
    },

    suspendTailor: async (_, { id, reason, until }, context) => {
      requireAdmin(context);
      const tailor = await TailorModel.findByIdAndUpdate(id, {
        accountStatus: 'suspended',
        suspensionReason: reason,
        suspendedUntil: until,
      }, { new: true });
      if (!tailor) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(tailor);
    },

    reactivateTailor: async (_, { id }, context) => {
      requireAdmin(context);
      const tailor = await TailorModel.findByIdAndUpdate(id, {
        accountStatus: 'active',
        suspensionReason: null,
        suspendedUntil: null,
      }, { new: true });
      if (!tailor) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(tailor);
    },
  },
};

export default tailorResolvers;
