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
      const offset = (page - 1) * limit;

      const filters = {};
      if (filter.accountStatus)      filters.accountStatus = filter.accountStatus;
      if (filter.verificationStatus) filters.verificationStatus = filter.verificationStatus;

      const tailors = await TailorModel.find(filters, { limit, offset });
      const total = await TailorModel.countDocuments(filters);

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

      if (input.fullName)    updateData.fullName = input.fullName;
      if (input.phone)       updateData.phone = input.phone;
      if (input.specialties) updateData.specialties = input.specialties;
      if (input.profilePhoto) updateData.profilePhotoUrl = input.profilePhoto.url;

      const tailor = await TailorModel.findByIdAndUpdate(authUser.id, updateData);
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

      const updateData = {};
      if (input.preferredMaxPerDay !== undefined)   updateData.capacityPerDay   = input.preferredMaxPerDay;
      if (input.preferredMaxPerWeek !== undefined)  updateData.capacityPerWeek  = input.preferredMaxPerWeek;
      if (input.preferredMaxPerMonth !== undefined) updateData.capacityPerMonth = input.preferredMaxPerMonth;
      if (input.isActive !== undefined)             updateData.isCapacityReduced = !input.isActive;

      const updated = await TailorModel.findByIdAndUpdate(authUser.id, updateData);
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

      const updateData = {};
      if (input.isAvailable !== undefined) updateData.isCapacityReduced = !input.isAvailable;

      const updated = await TailorModel.findByIdAndUpdate(authUser.id, updateData);
      return entityToJSON(updated);
    },

    updateTailorEarningsSettings: async (_, { input }, context) => {
      const authUser = requireTailor(context);
      const updated = await TailorModel.findByIdAndUpdate(authUser.id, {
        expectedEarningPerJob:    input.expectedEarningPerJob,
        averageJobCompletionDays: input.averageJobCompletionDays,
        bankName:                 input.bankName,
        accountNumber:            input.accountNumber,
        accountName:              input.accountName,
      });
      if (!updated) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(updated);
    },

    updateTailorPaymentDetails: async (_, { input }, context) => {
      const authUser = requireTailor(context);
      const updated = await TailorModel.findByIdAndUpdate(authUser.id, {
        bankName:      input.bankName,
        accountNumber: input.accountNumber,
        accountName:   input.accountName,
      });
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
        status:             'active',
        accountStatus:      'active',
      };
      if (score !== undefined) updateData.skillTestScore = score;
      if (notes)               updateData.skillTestNotes = notes;

      const tailor = await TailorModel.findByIdAndUpdate(id, updateData);
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
        skillTestNotes:     reason,
      });
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
        accountStatus:     'suspended',
        status:            'suspended',
        suspensionReason:  reason,
        suspendedUntil:    until,
      });
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
        accountStatus:    'active',
        status:           'active',
        suspensionReason: null,
        suspendedUntil:   null,
      });
      if (!tailor) {
        throw new GraphQLError('Tailor not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(tailor);
    },
  },

  Tailor: {
    profilePhoto: (parent) => parent.profilePhoto ? { url: parent.profilePhoto } : null,
    paymentDetails: (parent) => ({
      bankName:      parent.bankName      || null,
      accountNumber: parent.accountNumber || null,
      accountName:   parent.accountName   || null,
    }),
    availability: (parent) => ({
      workingDays:  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      workingHours: { start: '08:00', end: '18:00' },
      isAvailable:  !parent.isCapacityReduced,
    }),
    isVerified:     (parent) => parent.status === 'active' || parent.status === 'verified',
    completionRate: (parent) => {
      if (!parent.totalJobsAssigned) return 100;
      return Math.round((parent.totalJobsCompleted / parent.totalJobsAssigned) * 100);
    },
  },
};

export default tailorResolvers;
