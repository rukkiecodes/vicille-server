import { GraphQLError } from 'graphql';
import MeasurementModel from '../../modules/measurements/measurement.model.js';
import UserModel from '../../modules/users/user.model.js';
import { requireAuth, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import logger from '../../core/logger/index.js';

const measurementResolvers = {
  Measurement: {
    userDetails: async (measurement) => {
      if (!measurement.user) {
        return null;
      }
      try {
        const user = await UserModel.findById(measurement.user);
        return user ? entityToJSON(user) : null;
      } catch (error) {
        logger.error('Error resolving measurement.userDetails:', error);
        return null;
      }
    },
  },

  Query: {
    measurement: async (_, { id }, context) => {
      requireAuth(context);
      const measurement = await MeasurementModel.findById(id);
      if (!measurement) {
        throw new GraphQLError('Measurement not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(measurement);
    },

    measurements: async (_, { filter = {}, pagination = {} }, context) => {
      requireAuth(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;
      const offset = (page - 1) * limit;

      const query = {};
      if (filter.user) {
        query.user = filter.user;
      }
      if (filter.source) {
        query.source = filter.source;
      }
      if (filter.isActive !== undefined) {
        query.isActive = filter.isActive;
      }
      if (filter.queuedForCycle !== undefined) {
        query.queuedForCycle = filter.queuedForCycle;
      }

      const result = await MeasurementModel.find(query, { limit, offset });
      const measurements = result.data || [];
      const total = result.pagination?.total || 0;

      return buildPaginatedResponse(entitiesToJSON(measurements), total, page, limit);
    },

    activeMeasurement: async (_, { userId }, context) => {
      requireAuth(context);
      const measurement = await MeasurementModel.getActiveForUser(userId);
      return measurement ? entityToJSON(measurement) : null;
    },

    measurementHistory: async (_, { userId, limit = 10 }, context) => {
      requireAuth(context);
      const measurements = await MeasurementModel.getHistoryForUser(userId, limit);
      return entitiesToJSON(measurements);
    },
  },

  Mutation: {
    createMeasurement: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const measurement = await MeasurementModel.create({
        ...input,
        user: authUser.id,
      });

      // Newly submitted profile measurements should become the active set.
      const activeMeasurement = await MeasurementModel.makeActive(measurement.id);
      return entityToJSON(activeMeasurement || measurement);
    },

    updateMeasurement: async (_, { id, input }, context) => {
      requireAuth(context);
      const measurement = await MeasurementModel.findByIdAndUpdate(id, input, { new: true });
      if (!measurement) {
        throw new GraphQLError('Measurement not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(measurement);
    },

    activateMeasurement: async (_, { id }, context) => {
      requireAuth(context);
      const measurement = await MeasurementModel.makeActive(id);
      if (!measurement) {
        throw new GraphQLError('Measurement not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(measurement);
    },

    queueMeasurementForCycle: async (_, { id, cycleNumber }, context) => {
      requireAuth(context);
      const measurement = await MeasurementModel.queueForNextCycle(id, cycleNumber);
      if (!measurement) {
        throw new GraphQLError('Measurement not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(measurement);
    },

    deleteMeasurement: async (_, { id }, context) => {
      requireAuth(context);
      await MeasurementModel.delete(id);
      return { success: true, message: 'Measurement deleted' };
    },
  },
};

export default measurementResolvers;
