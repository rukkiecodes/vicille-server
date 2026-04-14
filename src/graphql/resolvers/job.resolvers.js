import { GraphQLError } from 'graphql';
import { v2 as cloudinary } from 'cloudinary';
import JobModel from '../../modules/jobs/job.model.js';
import OrderModel from '../../modules/orders/order.model.js';
import TailorModel from '../../modules/tailors/tailor.model.js';
import UserModel from '../../modules/users/user.model.js';
import MeasurementModel from '../../modules/measurements/measurement.model.js';
import { query as dbQuery } from '../../infrastructure/database/postgres.js';
import { requireAuth, requireAdmin, requireTailor, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import emailService from '../../services/email.service.js';
import { cloudinaryConfig } from '../../config/cloudinary.js';
import logger from '../../core/logger/index.js';
import { ORDER_STATUS } from '../../core/constants/orderStatus.js';

cloudinary.config(cloudinaryConfig);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@vicelleclothing.com';

async function resolveJobForQC(idOrOrderId) {
  // User app passes order id, while admin tooling may pass job id.
  const directJob = await JobModel.findById(idOrOrderId);
  if (directJob) {
    return directJob;
  }

  const orderJobs = await JobModel.findByOrder(idOrOrderId);
  if (!orderJobs?.length) {
    return null;
  }

  const readyForQc = orderJobs.find((j) => j.status === 'ready_for_qc');
  return readyForQc || orderJobs[0];
}

const jobResolvers = {
  Job: {
    proofPhotos: (job) => job.completionProof?.photos ?? null,
    proofNotes:  (job) => job.completionProof?.notes  ?? null,

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

    clientInfo: async (job) => {
      try {
        const [user, delivery] = await Promise.all([
          job.user ? UserModel.findById(job.user) : null,
          job.user ? UserModel.findDeliveryDetails(job.user) : null,
        ]);

        // Prefer the measurement linked to the order (snapshot at order time)
        let measurement = null;
        if (job.order) {
          const { rows: orderRows } = await dbQuery(
            'SELECT measurement_id FROM orders WHERE id=$1 LIMIT 1',
            [job.order]
          );
          const measurementId = orderRows[0]?.measurement_id;
          if (measurementId) {
            measurement = await MeasurementModel.findById(measurementId);
          }
        }
        // Fall back to current active measurement
        if (!measurement && job.user) {
          measurement = await MeasurementModel.getActiveForUser(job.user);
        }

        let styleImageUrl = null;
        let styleTitle = null;
        let styleDescription = null;
        let styleCategory = null;
        if (job.order) {
          const { rows } = await dbQuery(
            `SELECT style_image_url, style_title, style_description, category
             FROM style_selection_queue WHERE linked_order_id=$1 LIMIT 1`,
            [job.order]
          );
          if (rows[0]) {
            styleImageUrl    = rows[0].style_image_url   || null;
            styleTitle       = rows[0].style_title       || null;
            styleDescription = rows[0].style_description || null;
            styleCategory    = rows[0].category          || null;
          }
        }

        return {
          clientName:       user?.fullName    || null,
          clientEmail:      user?.email       || null,
          clientPhone:      delivery?.phone   || user?.phone || null,
          clientPhotoUrl:   user?.profilePhoto || null,
          measurements:     measurement?.measurements || null,
          deliveryAddress:  delivery?.address || null,
          landmark:         delivery?.landmark || null,
          nearestBusStop:   delivery?.nearestBusStop || null,
          styleImageUrl,
          styleTitle,
          styleDescription,
          styleCategory,
        };
      } catch (error) {
        logger.error('Error resolving job.clientInfo:', error);
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
      const offset = (page - 1) * limit;

      const jobs = await JobModel.find({ tailor: authUser.id }, { limit, offset });
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

    acceptJob: async (_, { id }, context) => {
      const authUser = requireTailor(context);
      const job = await JobModel.findById(id);
      if (!job) {
        throw new GraphQLError('Job not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (job.tailor !== authUser.id) {
        throw new GraphQLError('This job is not assigned to you', { extensions: { code: 'FORBIDDEN' } });
      }

      const updated = await JobModel.updateStatus(id, 'in_progress', 'Job accepted by tailor');

      // Sync order status to production_in_progress
      if (job.order) {
        try {
          await OrderModel.findByIdAndUpdate(job.order, { status: 'production_in_progress' });
        } catch (e) {
          logger.warn('Failed to sync order status on job accept:', e);
        }
      }

      // Notify admin (fire-and-forget)
      const tailor = await TailorModel.findById(authUser.id);
      const order  = job.order ? await OrderModel.findById(job.order) : null;
      emailService.sendAdminJobResponseEmail(
        ADMIN_EMAIL,
        tailor?.fullName || 'Tailor',
        order?.orderNumber || job.order || id,
        true,
        null,
      ).catch(() => {});

      return entityToJSON(updated);
    },

    declineJob: async (_, { id, reason }, context) => {
      const authUser = requireTailor(context);
      const job = await JobModel.findById(id);
      if (!job) {
        throw new GraphQLError('Job not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (job.tailor !== authUser.id) {
        throw new GraphQLError('This job is not assigned to you', { extensions: { code: 'FORBIDDEN' } });
      }

      const updated = await JobModel.updateStatus(id, 'declined', reason || 'Declined by tailor');

      // Notify admin (fire-and-forget)
      const tailor = await TailorModel.findById(authUser.id);
      const order  = job.order ? await OrderModel.findById(job.order) : null;
      emailService.sendAdminJobResponseEmail(
        ADMIN_EMAIL,
        tailor?.fullName || 'Tailor',
        order?.orderNumber || job.order || id,
        false,
        reason || null,
      ).catch(() => {});

      return entityToJSON(updated);
    },

    startJob: async (_, { id }, context) => {
      requireTailor(context);
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
      requireTailor(context);
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

    submitJobProof: async (_, { id, photos, notes }, context) => {
      const authUser = requireTailor(context);
      const job = await JobModel.findById(id);
      if (!job) {
        throw new GraphQLError('Job not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (job.tailor !== authUser.id) {
        throw new GraphQLError('This job is not assigned to you', { extensions: { code: 'FORBIDDEN' } });
      }
      if (job.status !== 'in_progress') {
        throw new GraphQLError('Job must be in progress to submit proof', { extensions: { code: 'BAD_REQUEST' } });
      }

      // Upload each photo to Cloudinary
      const uploadedUrls = await Promise.all(
        photos.map((p, i) => {
          const dataUri = `data:${p.mimeType || 'image/jpeg'};base64,${p.base64}`;
          return new Promise((resolve, reject) => {
            cloudinary.uploader.upload(
              dataUri,
              {
                folder: 'vicelle/job-proofs',
                public_id: `job-${id}-proof-${i}-${Date.now()}`,
                transformation: [
                  { width: 1500, height: 1500, crop: 'limit' },
                  { quality: 'auto' },
                ],
              },
              (err, result) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result.secure_url);
                }
              }
            );
          });
        })
      );

      const proof = {
        photos: uploadedUrls,
        notes: notes || null,
        submittedAt: new Date().toISOString(),
      };

      const statusHistory = [...(job.statusHistory || []), {
        status: 'ready_for_qc',
        changedAt: new Date().toISOString(),
        notes: 'Proof submitted by tailor',
      }];

      const updated = await JobModel.findByIdAndUpdate(id, {
        completionProof: proof,
        status: 'ready_for_qc',
        statusHistory,
        revisionNotes: null,
      });

      return entityToJSON(updated);
    },

    approveQCProof: async (_, { id }, context) => {
      const authUser = requireAuth(context);
      const role = authUser.role || authUser.type || 'user';
      const job = await resolveJobForQC(id);
      if (!job) {
        throw new GraphQLError('Job not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (role !== 'admin') {
        if (!job.order) {
          throw new GraphQLError('No order is linked to this job', { extensions: { code: 'BAD_REQUEST' } });
        }
        const order = await OrderModel.findByIdFresh(job.order);
        if (!order) {
          throw new GraphQLError('Order not found', { extensions: { code: 'NOT_FOUND' } });
        }
        if (order.user !== authUser.id) {
          throw new GraphQLError('Insufficient permissions', { extensions: { code: 'FORBIDDEN' } });
        }
      }
      if (job.status !== 'ready_for_qc') {
        throw new GraphQLError('Job must be in ready_for_qc status to approve', { extensions: { code: 'BAD_REQUEST' } });
      }

      const statusHistory = [...(job.statusHistory || []), {
        status: 'qc_approved',
        changedAt: new Date().toISOString(),
        changedBy: authUser.id,
        notes: role === 'admin' ? 'Proof approved by admin' : 'Proof approved by client',
      }];

      const updated = await JobModel.findByIdAndUpdate(job.id, {
        status: 'qc_approved',
        statusHistory,
        revisionNotes: null,
      });

      if (!updated) {
        throw new GraphQLError('Failed to update job', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }

      // Once QC is approved, advance the linked order into a delivery-ready stage.
      if (job.order) {
        const linkedOrder = await OrderModel.findByIdFresh(job.order);
        if (linkedOrder?.status === ORDER_STATUS.PRODUCTION_IN_PROGRESS) {
          await OrderModel.updateStatus(
            linkedOrder.id,
            ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED,
            authUser.id,
            role,
            role === 'admin'
              ? 'QC approved — order moved to package ready'
              : 'QC approved by client — order moved to package ready'
          );
        }
      }

      return entityToJSON(updated);
    },

    rejectQCProof: async (_, { id, reason }, context) => {
      const authUser = requireAuth(context);
      const role = authUser.role || authUser.type || 'user';
      const job = await resolveJobForQC(id);
      if (!job) {
        throw new GraphQLError('Job not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (role !== 'admin') {
        if (!job.order) {
          throw new GraphQLError('No order is linked to this job', { extensions: { code: 'BAD_REQUEST' } });
        }
        const order = await OrderModel.findByIdFresh(job.order);
        if (!order) {
          throw new GraphQLError('Order not found', { extensions: { code: 'NOT_FOUND' } });
        }
        if (order.user !== authUser.id) {
          throw new GraphQLError('Insufficient permissions', { extensions: { code: 'FORBIDDEN' } });
        }
      }
      if (job.status !== 'ready_for_qc') {
        throw new GraphQLError('Job must be in ready_for_qc status to reject', { extensions: { code: 'BAD_REQUEST' } });
      }

      const statusHistory = [...(job.statusHistory || []), {
        status: 'in_progress',
        changedAt: new Date().toISOString(),
        changedBy: authUser.id,
        notes: role === 'admin' ? `Proof rejected: ${reason}` : `Proof rejected by client: ${reason}`,
      }];

      const updated = await JobModel.findByIdAndUpdate(job.id, {
        status: 'in_progress',
        statusHistory,
        revisionNotes: reason,
      });

      if (!updated) {
        throw new GraphQLError('Failed to update job', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }

      return entityToJSON(updated);
    },

    markJobOrderDispatched: async (_, { id, input }, context) => {
      const authUser = requireTailor(context);
      const job = await JobModel.findById(id);
      if (!job) {
        throw new GraphQLError('Job not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (job.tailor !== authUser.id) {
        throw new GraphQLError('This job is not assigned to you', { extensions: { code: 'FORBIDDEN' } });
      }
      if (!job.order) {
        throw new GraphQLError('No order is linked to this job', { extensions: { code: 'BAD_REQUEST' } });
      }

      const order = await OrderModel.findByIdFresh(job.order);
      if (!order) {
        throw new GraphQLError('Order not found', { extensions: { code: 'NOT_FOUND' } });
      }
      const deliveryAllowedStatuses = [
        ORDER_STATUS.PRODUCTION_IN_PROGRESS,
        ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS,
        ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED,
      ];
      if (!deliveryAllowedStatuses.includes(order.status)) {
        throw new GraphQLError('Order is not ready for delivery yet', { extensions: { code: 'BAD_REQUEST' } });
      }
      if (order.dispatchedAt) {
        throw new GraphQLError('Dispatch details have already been submitted', { extensions: { code: 'BAD_REQUEST' } });
      }

      const dispatchedAt = new Date();
      const dispatchRider = {
        name: input.name,
        phone: input.phone,
        company: input.company || null,
        tracking_number: input.trackingNumber || null,
        notes: input.notes || null,
        dispatched_at: dispatchedAt.toISOString(),
      };

      let currentStatus = order.status;

      // If QC is approved but order still sits in production, advance it to package-ready first.
      if (currentStatus === ORDER_STATUS.PRODUCTION_IN_PROGRESS) {
        await OrderModel.updateStatus(
          order.id,
          ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED,
          authUser.id,
          'tailor',
          'Tailor started delivery after QC approval — order moved to package ready'
        );
        currentStatus = ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED;
      }

      // If order is in payment_required stage, step it into delivery first.
      if (currentStatus === ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED) {
        await OrderModel.updateStatus(
          order.id,
          ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS,
          authUser.id,
          'tailor',
          'Tailor dispatched order — moved to delivery in progress'
        );
        currentStatus = ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS;
      }

      // Step order to shipped
      await OrderModel.updateStatus(
        order.id,
        ORDER_STATUS.SHIPPED,
        authUser.id,
        'tailor',
        `Order shipped via dispatch rider: ${input.name} (${input.phone})`
      );

      const updatedOrder = await OrderModel.findByIdAndUpdate(order.id, {
        dispatchedAt,
        trackingNumber: input.trackingNumber || order.trackingNumber || null,
        deliveryProofUrl: JSON.stringify({
          type: 'dispatch_rider',
          dispatchRider,
          submittedByTailorId: authUser.id,
        }),
      });

      return entityToJSON(updatedOrder);
    },

    markJobOrderDelivered: async (_, { id }, context) => {
      const authUser = requireTailor(context);
      const job = await JobModel.findById(id);
      if (!job) {
        throw new GraphQLError('Job not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (job.tailor !== authUser.id) {
        throw new GraphQLError('This job is not assigned to you', { extensions: { code: 'FORBIDDEN' } });
      }
      if (!job.order) {
        throw new GraphQLError('No order is linked to this job', { extensions: { code: 'BAD_REQUEST' } });
      }

      const order = await OrderModel.findByIdFresh(job.order);
      if (!order) {
        throw new GraphQLError('Order not found', { extensions: { code: 'NOT_FOUND' } });
      }

      const deliveryAllowedStatuses = [
        ORDER_STATUS.PRODUCTION_IN_PROGRESS,
        ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS,
        ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED,
      ];
      if (!deliveryAllowedStatuses.includes(order.status)) {
        throw new GraphQLError('Order is not ready for delivery yet', { extensions: { code: 'BAD_REQUEST' } });
      }

      try {
        let currentStatus = order.status;

        // If QC is approved but order still sits in production, advance it to package-ready first.
        if (currentStatus === ORDER_STATUS.PRODUCTION_IN_PROGRESS) {
          await OrderModel.updateStatus(
            order.id,
            ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED,
            authUser.id,
            'tailor',
            'Tailor started delivery after QC approval — order moved to package ready'
          );
          currentStatus = ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED;
        }

        // If order is still in payment_required stage, step it into delivery first.
        if (currentStatus === ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED) {
          await OrderModel.updateStatus(
            order.id,
            ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS,
            authUser.id,
            'tailor',
            'Tailor started delivery — order moved to delivery in progress'
          );
          currentStatus = ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS;
        }

        const updatedOrder = await OrderModel.updateStatus(
          order.id,
          ORDER_STATUS.SHIPPED,
          authUser.id,
          'tailor',
          'Order shipped — tailor delivering personally'
        );
        return entityToJSON(updatedOrder);
      } catch (error) {
        throw new GraphQLError(error.message || 'Failed to mark order as shipped', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
    },
  },
};

export default jobResolvers;
