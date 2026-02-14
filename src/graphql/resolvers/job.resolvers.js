import { GraphQLError } from 'graphql';
import JobModel from '../../modules/jobs/job.model.js';
import OrderModel from '../../modules/orders/order.model.js';
import TailorModel from '../../modules/tailors/tailor.model.js';
import UserModel from '../../modules/users/user.model.js';
import { requireAuth, requireAdmin, requireTailor, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import logger from '../../core/logger/index.js';

const jobResolvers = {
  Job: {
    orderDetails: async (job) => {
      if (!job.order) {
        return null;
      }
      try {
        const order = await OrderModel.findById(job.order);
        return order ? entityToJSON(order) : null;
      } catch (error) {
        logger.error('Error resolving job.orderDetails:', error);
        return null;
      }
    },
    tailorDetails: async (job) => {
      if (!job.tailor) {
        return null;
      }
      try {
        const tailor = await TailorModel.findById(job.tailor);
        return tailor ? entityToJSON(tailor) : null;
      } catch (error) {
        logger.error('Error resolving job.tailorDetails:', error);
        return null;
      }
    },
    userDetails: async (job) => {
      if (!job.user) {
        return null;
      }
      try {
        const user = await UserModel.findById(job.user);
        return user ? entityToJSON(user) : null;
      } catch (error) {
        logger.error('Error resolving job.userDetails:', error);
        return null;
      }
    },
  },

  Query: {
    job: async (_, { id }, context) => {
      requireAuth(context);
      const job = await JobModel.findById(id);
      if (!job) {
        throw new GraphQLError('Job not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(job);
    },

    jobs: async (_, { filter = {}, pagination = {} }, context) => {
      requireAuth(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;

      const query = {};
      if (filter.status) {
        query.status = filter.status;
      }
      if (filter.tailor) {
        query.tailor = filter.tailor;
      }
      if (filter.order) {
        query.order = filter.order;
      }

      const jobs = await JobModel.find(query, { page, limit });
      const total = await JobModel.countDocuments(query);

      return buildPaginatedResponse(entitiesToJSON(jobs), total, page, limit);
    },

    myJobs: async (_, { pagination = {} }, context) => {
      const authUser = requireTailor(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;

      const jobs = await JobModel.findByTailor(authUser.id);
      const total = await JobModel.countDocuments({ tailor: authUser.id });

      return buildPaginatedResponse(entitiesToJSON(jobs), total, page, limit);
    },

    overdueJobs: async (_, __, context) => {
      requireAdmin(context);
      const jobs = await JobModel.findOverdue();
      return entitiesToJSON(jobs);
    },
  },

  Mutation: {
    createJob: async (_, { input }, context) => {
      requireAdmin(context);
      const job = await JobModel.create({
        ...input,
        assignedBy: context.user.id,
      });
      return entityToJSON(job);
    },

    assignJob: async (_, { id, tailorId }, context) => {
      requireAdmin(context);
      const job = await JobModel.findByIdAndUpdate(id, {
        tailor: tailorId,
        assignedBy: context.user.id,
        assignmentType: 'manual',
      }, { new: true });
      if (!job) {
        throw new GraphQLError('Job not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(job);
    },

    startJob: async (_, { id }, context) => {
      const authUser = requireTailor(context);
      const job = await JobModel.findById(id);
      if (!job) {
        throw new GraphQLError('Job not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const updated = await JobModel.updateStatus(id, 'in_progress', 'Job started by tailor');
      return entityToJSON(updated);
    },

    completeJob: async (_, { id, proof }, context) => {
      const authUser = requireTailor(context);
      const job = await JobModel.findById(id);
      if (!job) {
        throw new GraphQLError('Job not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const updateData = {
        completedAt: new Date(),
      };
      if (proof) {
        updateData.completionProof = proof;
      }

      await JobModel.findByIdAndUpdate(id, updateData);
      const updated = await JobModel.updateStatus(id, 'completed', 'Job completed by tailor');
      return entityToJSON(updated);
    },

    reassignJob: async (_, { id, newTailorId, reason }, context) => {
      requireAdmin(context);
      const job = await JobModel.findById(id);
      if (!job) {
        throw new GraphQLError('Job not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const reassignments = job.reassignmentsParsed || [];
      reassignments.push({
        fromTailor: job.tailor,
        toTailor: newTailorId,
        reason,
        reassignedBy: context.user.id,
        reassignedAt: new Date().toISOString(),
      });

      const updated = await JobModel.findByIdAndUpdate(id, {
        tailor: newTailorId,
        assignmentType: 'reassigned',
        reassignments,
      }, { new: true });

      return entityToJSON(updated);
    },

    updateJobStatus: async (_, { id, status, notes }, context) => {
      requireAuth(context);
      const updated = await JobModel.updateStatus(id, status, notes);
      if (!updated) {
        throw new GraphQLError('Job not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(updated);
    },
  },
};

export default jobResolvers;
