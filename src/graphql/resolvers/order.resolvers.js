import { GraphQLError } from 'graphql';
import { v2 as cloudinary } from 'cloudinary';
import OrderModel from '../../modules/orders/order.model.js';
import OrderItemModel from '../../modules/orders/orderItem.model.js';
import UserModel from '../../modules/users/user.model.js';
import JobModel from '../../modules/jobs/job.model.js';
import TailorModel from '../../modules/tailors/tailor.model.js';
import RatingModel from '../../modules/ratings/rating.model.js';
import { requireAuth, requireAdmin, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import { ORDER_STATUS } from '../../core/constants/orderStatus.js';
import { query as dbQuery } from '../../infrastructure/database/postgres.js';
import logger from '../../core/logger/index.js';
import { cloudinaryConfig } from '../../config/cloudinary.js';

const DEFAULT_PAGE_LIMIT = 20;

cloudinary.config(cloudinaryConfig);

function getMonthWindowBounds(year, monthIndex) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const opensAt = new Date(Date.UTC(year, monthIndex, Math.max(1, lastDay - 6), 0, 0, 0, 0));
  const closesAt = new Date(Date.UTC(year, monthIndex + 1, 7, 23, 59, 59, 999));
  return { opensAt, closesAt };
}

function buildWindowStatus(isOpen, opensAt, closesAt, source = 'computed') {
  const now = new Date();
  const countdownTarget = isOpen ? closesAt : opensAt;
  const countdownSeconds = Math.max(0, Math.floor((countdownTarget.getTime() - now.getTime()) / 1000));
  return {
    isOpen,
    opensAt,
    closesAt,
    source,
    countdownSeconds,
  };
}

function getComputedStylingWindowStatus(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const previousMonth = month === 0 ? 11 : month - 1;
  const previousYear = month === 0 ? year - 1 : year;

  const prevWindow = getMonthWindowBounds(previousYear, previousMonth);
  const currentWindow = getMonthWindowBounds(year, month);

  if (now >= prevWindow.opensAt && now <= prevWindow.closesAt) {
    return buildWindowStatus(true, prevWindow.opensAt, prevWindow.closesAt, 'computed');
  }

  if (now >= currentWindow.opensAt && now <= currentWindow.closesAt) {
    return buildWindowStatus(true, currentWindow.opensAt, currentWindow.closesAt, 'computed');
  }

  const nextWindow = now < currentWindow.opensAt
    ? currentWindow
    : getMonthWindowBounds(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1);

  return buildWindowStatus(false, nextWindow.opensAt, nextWindow.closesAt, 'computed');
}

function formatStylingWindowConfig(row) {
  if (!row) {
    return {
      overrideEnabled: false,
      forceIsOpen: null,
      overrideOpenAt: null,
      overrideCloseAt: null,
      notes: null,
      updatedBy: null,
      updatedAt: null,
    };
  }
  return {
    overrideEnabled: Boolean(row.override_enabled),
    forceIsOpen: row.force_is_open,
    overrideOpenAt: row.override_open_at,
    overrideCloseAt: row.override_close_at,
    notes: row.notes,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function formatQueueRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    user: row.user_id,
    measurement: row.measurement_id,
    orderType: row.order_type,
    category: row.category,
    styleTitle: row.style_title,
    styleDescription: row.style_description,
    styleImageUrl: row.style_image_url,
    stylePayload: row.style_payload,
    source: row.source,
    sourceUrl: row.source_url,
    notes: row.notes,
    status: row.status,
    linkedOrderId: row.linked_order_id,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveStylingWindowStatus() {
  const computed = getComputedStylingWindowStatus();
  const { rows } = await dbQuery('SELECT * FROM styling_window_config WHERE id = 1 LIMIT 1');
  const cfg = rows[0];

  if (!cfg?.override_enabled) {
    return computed;
  }

  if (cfg.force_is_open !== null && cfg.force_is_open !== undefined) {
    const opensAt = cfg.override_open_at || computed.opensAt;
    const closesAt = cfg.override_close_at || computed.closesAt;
    return buildWindowStatus(Boolean(cfg.force_is_open), opensAt, closesAt, 'admin_force');
  }

  if (cfg.override_open_at && cfg.override_close_at) {
    const now = new Date();
    const isOpen = now >= new Date(cfg.override_open_at) && now <= new Date(cfg.override_close_at);
    return buildWindowStatus(isOpen, new Date(cfg.override_open_at), new Date(cfg.override_close_at), 'admin_range');
  }

  return computed;
}

async function promoteQueueEntryToOrder(queueRow, options = {}) {
  const finalStatus = options.finalStatus || 'processed';
  const changedBy = options.changedBy || { id: queueRow.user_id, role: 'system' };

  if (!queueRow || queueRow.status !== 'queued') {
    return null;
  }

  const user = await UserModel.findById(queueRow.user_id);
  const deliveryDetails = await UserModel.findDeliveryDetails(queueRow.user_id);

  const createdOrder = await OrderModel.create({
    user: queueRow.user_id,
    measurement: queueRow.measurement_id,
    orderType: queueRow.order_type || 'special_request',
    customerName: user?.fullName || null,
    customerEmail: user?.email || null,
    customerPhone: deliveryDetails?.phone || user?.phone || null,
    deliveryAddress: deliveryDetails
      ? {
          address: deliveryDetails.address || null,
          phone: deliveryDetails.phone || user?.phone || null,
          landmark: deliveryDetails.landmark || null,
          nearestBusStop: deliveryDetails.nearestBusStop || null,
        }
      : null,
    notes: queueRow.notes || queueRow.style_description || null,
    createdBy: changedBy.id,
    createdByRole: changedBy.role,
  });

  await OrderItemModel.create({
    order: createdOrder.id,
    category: queueRow.category || 'custom',
    description: queueRow.style_description || queueRow.style_title,
    quantity: 1,
    customizations: {
      queueId: queueRow.id,
      title: queueRow.style_title,
      imageUrl: queueRow.style_image_url,
      source: queueRow.source,
      sourceUrl: queueRow.source_url,
      payload: queueRow.style_payload || {},
    },
    style: {
      title: queueRow.style_title,
      image: queueRow.style_image_url,
    },
    notes: queueRow.notes || null,
    itemStatus: 'pending',
  });

  await dbQuery(
    `UPDATE style_selection_queue
       SET status = $2,
           linked_order_id = $3,
           escalated_by = CASE WHEN $2='escalated' THEN $4::uuid ELSE escalated_by END,
           updated_at = NOW()
     WHERE id = $1`,
    [queueRow.id, finalStatus, createdOrder.id, changedBy.id || null]
  );

  return createdOrder;
}

async function processQueueIfWindowOpen() {
  const status = await resolveStylingWindowStatus();
  if (!status.isOpen) {
    return 0;
  }

  const { rows } = await dbQuery(
    `SELECT *
       FROM style_selection_queue
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 100`
  );

  let processedCount = 0;
  for (const row of rows) {
    try {
      await promoteQueueEntryToOrder(row, {
        finalStatus: 'processed',
        changedBy: { id: row.user_id, role: 'system' },
      });
      processedCount += 1;
    } catch (error) {
      logger.error('Failed promoting queued style to order', {
        queueId: row.id,
        error: error.message,
      });
    }
  }

  return processedCount;
}

const orderResolvers = {
  Order: {
    userDetails: async (order) => {
      if (!order.user) {
        return null;
      }
      try {
        const user = await UserModel.findById(order.user);
        return user ? entityToJSON(user) : null;
      } catch (error) {
        logger.error('Error resolving order.userDetails:', error);
        return null;
      }
    },
    items: async (order) => {
      try {
        const items = await OrderItemModel.findByOrder(order.id);
        return entitiesToJSON(items);
      } catch (error) {
        logger.error('Error resolving order.items:', error);
        return [];
      }
    },
    statusHistory: async (order) => {
      try {
        const { rows } = await dbQuery(
          `SELECT to_status, changed_by_role, changed_by_id, notes, created_at
           FROM order_status_history
           WHERE order_id=$1
           ORDER BY created_at ASC`,
          [order.id]
        );
        return rows.map((row) => ({
          status: row.to_status,
          changedBy: row.changed_by_role || row.changed_by_id,
          changedAt: row.created_at,
          notes: row.notes,
        }));
      } catch (error) {
        logger.error('Error resolving order.statusHistory:', error);
        return [];
      }
    },
    isStylingWindowOpen: (order) => order?.isStylingWindowOpen ?? order?.status === ORDER_STATUS.STYLING_IN_PROGRESS,
    canBeCancelled: (order) => order?.canBeCancelled ?? order?.status === ORDER_STATUS.STYLING_IN_PROGRESS,
    canPurchaseAccessories: (order) => order?.canPurchaseAccessories ?? order?.status === ORDER_STATUS.PRODUCTION_IN_PROGRESS,
    proofPhotos: async (order) => {
      try {
        const jobs = await JobModel.findByOrder(order.id);
        const job = jobs?.[0];
        return job?.completionProof?.photos ?? null;
      } catch {
        return null;
      }
    },
    proofNotes: async (order) => {
      try {
        const jobs = await JobModel.findByOrder(order.id);
        const job = jobs?.[0];
        return job?.completionProof?.notes ?? null;
      } catch {
        return null;
      }
    },
    jobStatus: async (order) => {
      try {
        const jobs = await JobModel.findByOrder(order.id);
        const job = jobs?.[0];
        return job?.status ?? null;
      } catch {
        return null;
      }
    },
    styleInfo: async (order) => {
      try {
        const { rows } = await dbQuery(
          `SELECT style_image_url, style_title, style_description, category
           FROM style_selection_queue WHERE linked_order_id=$1 LIMIT 1`,
          [order.id]
        );
        if (!rows[0]) return null;
        return {
          styleImageUrl:    rows[0].style_image_url   || null,
          styleTitle:       rows[0].style_title       || null,
          styleDescription: rows[0].style_description || null,
          category:         rows[0].category          || null,
        };
      } catch {
        return null;
      }
    },
    tailorDetails: async (order) => {
      try {
        const jobs = await JobModel.findByOrder(order.id);
        const job = jobs?.[0];
        if (!job?.tailor) return null;
        const tailor = await TailorModel.findById(job.tailor);
        if (!tailor) return null;
        const t = entityToJSON(tailor);
        return {
          id:       t.id,
          fullName: t.fullName,
          phone:    t.phone || null,
          email:    t.email || null,
          photoUrl: t.profilePhoto?.url || t.profilePhoto || null,
        };
      } catch {
        return null;
      }
    },
  },

  QueuedStyleSelection: {
    userDetails: async (entry) => {
      if (!entry?.user) {
        return null;
      }
      try {
        const user = await UserModel.findById(entry.user);
        return user ? entityToJSON(user) : null;
      } catch (error) {
        logger.error('Error resolving queue.userDetails:', error);
        return null;
      }
    },
    linkedOrder: async (entry) => {
      if (!entry?.linkedOrderId) {
        return null;
      }
      try {
        const order = await OrderModel.findById(entry.linkedOrderId);
        return order ? entityToJSON(order) : null;
      } catch (error) {
        logger.error('Error resolving queue.linkedOrder:', error);
        return null;
      }
    },
  },

  Query: {
    order: async (_, { id }, context) => {
      const authUser = requireAuth(context);
      const order = await OrderModel.findByIdFresh(id);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      const role = authUser.role || authUser.type;
      if (role !== 'admin' && order.user !== authUser.id) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(order);
    },

    orderByNumber: async (_, { orderNumber }, context) => {
      const authUser = requireAuth(context);
      const order = await OrderModel.findByOrderNumber(orderNumber);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      const role = authUser.role || authUser.type;
      if (role !== 'admin' && order.user !== authUser.id) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(order);
    },

    orders: async (_, { filter = {}, pagination = {} }, context) => {
      requireAdmin(context);
      await processQueueIfWindowOpen();
      const page = pagination.page || 1;
      const limit = pagination.limit || DEFAULT_PAGE_LIMIT;
      const offset = (page - 1) * limit;

      const query = {};
      if (filter.status) {
        query.status = filter.status;
      }
      if (filter.orderType) {
        query.orderType = filter.orderType;
      }
      if (filter.user) {
        query.user = filter.user;
      }
      if (filter.paymentStatus) {
        query.paymentStatus = filter.paymentStatus;
      }

      const result = await OrderModel.find(query, { limit, offset });
      const orders = result.data || [];
      const total = result.pagination?.total || 0;

      return buildPaginatedResponse(entitiesToJSON(orders), total, page, limit);
    },

    myOrders: async (_, { pagination = {} }, context) => {
      const authUser = requireAuth(context);
      await processQueueIfWindowOpen();
      const page = pagination.page || 1;
      const limit = pagination.limit || DEFAULT_PAGE_LIMIT;
      const offset = (page - 1) * limit;

      const result = await OrderModel.find({ user: authUser.id }, { limit, offset });
      const orders = result.data || [];
      const total = result.pagination?.total || 0;

      return buildPaginatedResponse(entitiesToJSON(orders), total, page, limit);
    },

    ordersByStatus: async (_, { status }, context) => {
      requireAuth(context);
      const orders = await OrderModel.findByStatus(status);
      return entitiesToJSON(orders);
    },

    stylingWindowStatus: async (_, __, context) => {
      requireAuth(context);
      const status = await resolveStylingWindowStatus();
      await processQueueIfWindowOpen();
      return status;
    },

    stylingWindowConfig: async (_, __, context) => {
      requireAdmin(context);
      const { rows } = await dbQuery('SELECT * FROM styling_window_config WHERE id = 1 LIMIT 1');
      return formatStylingWindowConfig(rows[0]);
    },

    myStyleQueue: async (_, __, context) => {
      const authUser = requireAuth(context);
      await processQueueIfWindowOpen();
      const { rows } = await dbQuery(
        `SELECT *
           FROM style_selection_queue
          WHERE user_id = $1
            AND status IN ('queued', 'processed', 'escalated')
          ORDER BY created_at DESC`,
        [authUser.id]
      );
      return rows.map(formatQueueRow);
    },

    styleQueue: async (_, { status }, context) => {
      requireAdmin(context);
      await processQueueIfWindowOpen();

      if (status) {
        const { rows } = await dbQuery(
          `SELECT *
             FROM style_selection_queue
            WHERE status = $1
            ORDER BY created_at DESC`,
          [status]
        );
        return rows.map(formatQueueRow);
      }

      const { rows } = await dbQuery(
        `SELECT *
           FROM style_selection_queue
          WHERE status IN ('queued', 'processed', 'escalated')
          ORDER BY created_at DESC`
      );
      return rows.map(formatQueueRow);
    },
  },

  Mutation: {
    createOrder: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const user = await UserModel.findById(authUser.id);
      const deliveryDetails = await UserModel.findDeliveryDetails(authUser.id);
      const order = await OrderModel.create({
        ...input,
        user: authUser.id,
        customerName: user?.fullName || null,
        customerEmail: user?.email || null,
        customerPhone: deliveryDetails?.phone || user?.phone || null,
        deliveryAddress: input.deliveryAddress || (deliveryDetails ? {
          address: deliveryDetails.address || null,
          phone: deliveryDetails.phone || user?.phone || null,
          landmark: deliveryDetails.landmark || null,
          nearestBusStop: deliveryDetails.nearestBusStop || null,
        } : null),
      });
      return entityToJSON(order);
    },

    updateOrder: async (_, { id, input }, context) => {
      const authUser = requireAuth(context);
      const order = await OrderModel.findById(id);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const role = authUser.role || authUser.type;
      const isAdmin = role === 'admin';
      if (!isAdmin && order.user !== authUser.id) {
        throw new GraphQLError('You do not have access to this order', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      if (!isAdmin && order.status !== ORDER_STATUS.STYLING_IN_PROGRESS) {
        throw new GraphQLError('This order can no longer be edited', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const updated = await OrderModel.findByIdAndUpdate(id, {
        orderType: input.orderType,
        deliveryAddress: input.deliveryAddress,
        deliveryMethod: input.deliveryMethod,
        notes: input.notes,
      });
      return entityToJSON(updated);
    },

    updateOrderStatus: async (_, { id, status, notes }, context) => {
      const authUser = requireAuth(context);
      const role = authUser.role || authUser.type || 'user';

      if (status === ORDER_STATUS.DELIVERED) {
        if (role !== 'admin' && role !== 'tailor') {
          throw new GraphQLError('Only admin or assigned tailor can mark an order as delivered', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        const order = await OrderModel.findByIdFresh(id);
        if (!order) {
          throw new GraphQLError('Order not found', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        if (order.status !== ORDER_STATUS.SHIPPED) {
          throw new GraphQLError('Order is not in shipped stage', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        if (role === 'tailor') {
          const jobs = await JobModel.findByOrder(order.id);
          const assignedJob = jobs?.[0];
          if (!assignedJob || assignedJob.tailor !== authUser.id) {
            throw new GraphQLError('Only the assigned tailor can mark this order as delivered', {
              extensions: { code: 'FORBIDDEN' },
            });
          }
        }
      }

      try {
        const order = await OrderModel.updateStatus(
          id,
          status,
          authUser.id,
          role,
          notes
        );
        return entityToJSON(order);
      } catch (error) {
        throw new GraphQLError(error.message, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
    },

    confirmDelivery: async (_, { id, input }, context) => {
      const authUser = requireAuth(context);
      const order = await OrderModel.findByIdFresh(id);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      if (order.user !== authUser.id) {
        throw new GraphQLError('Only the order owner can confirm delivery', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      const confirmableStatuses = new Set([
        ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS,
        ORDER_STATUS.SHIPPED,
        ORDER_STATUS.DELIVERED,
      ]);
      if (!confirmableStatuses.has(order.status)) {
        throw new GraphQLError('Order has not reached delivery stage yet', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const jobs = await JobModel.findByOrder(order.id);
      const linkedJob = jobs?.[0] || null;

      let receiptPhotoUrls = [];
      if (Array.isArray(input?.photos) && input.photos.length) {
        receiptPhotoUrls = await Promise.all(
          input.photos.map((p, i) => {
            const dataUri = `data:${p.mimeType || 'image/jpeg'};base64,${p.base64}`;
            return new Promise((resolve, reject) => {
              cloudinary.uploader.upload(
                dataUri,
                {
                  folder: 'vicelle/order-receipts',
                  public_id: `order-${order.id}-receipt-${i}-${Date.now()}`,
                  transformation: [
                    { width: 1600, height: 1600, crop: 'limit' },
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
      }

      try {
        let updated = order;
        if (order.status === ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS) {
          await OrderModel.updateStatus(
            id,
            ORDER_STATUS.SHIPPED,
            authUser.id,
            'user',
            'Delivery confirmation flow auto-advanced order to shipped'
          );
          updated = await OrderModel.findByIdFresh(id);
        }

        if (updated.status !== ORDER_STATUS.DELIVERED) {
          updated = await OrderModel.updateStatus(
            id,
            ORDER_STATUS.DELIVERED,
            authUser.id,
            'user',
            'Delivery confirmed by client'
          );
        }

        let refreshed = updated;

        if (receiptPhotoUrls.length || input?.note) {
          const existingProof = (updated?.deliveryProof && typeof updated.deliveryProof === 'object')
            ? updated.deliveryProof
            : {};

          const mergedProof = {
            ...existingProof,
            customerConfirmation: {
              confirmedAt: new Date().toISOString(),
              confirmedByUserId: authUser.id,
              photos: receiptPhotoUrls,
              note: input?.note || null,
            },
          };

          refreshed = await OrderModel.findByIdAndUpdate(id, {
            deliveryProofUrl: JSON.stringify(mergedProof),
          });
        }

        if (
          linkedJob &&
          linkedJob.tailor &&
          Number.isInteger(input?.reviewStars) &&
          input.reviewStars >= 1 &&
          input.reviewStars <= 5
        ) {
          try {
            await RatingModel.create({
              tailor: linkedJob.tailor,
              job: linkedJob.id,
              ratedBy: authUser.id,
              craftsmanship: input.reviewStars,
              accuracy: input.reviewStars,
              timeliness: input.reviewStars,
              communication: input.reviewStars,
              overallRating: input.reviewStars,
              comments: input.reviewComment || null,
              impactsPerformance: true,
            });

            const avg = await RatingModel.calculateTailorAverage(linkedJob.tailor);
            await TailorModel.findByIdAndUpdate(linkedJob.tailor, { averageRating: avg.avgOverall });
          } catch (ratingError) {
            logger.warn('confirmDelivery: rating save skipped', {
              orderId: id,
              jobId: linkedJob.id,
              userId: authUser.id,
              error: ratingError?.message || 'unknown',
            });
          }
        }

        if (input?.saveTailor && linkedJob?.tailor) {
          try {
            await dbQuery(
              `INSERT INTO user_saved_tailors (user_id, tailor_id)
               VALUES ($1,$2)
               ON CONFLICT (user_id, tailor_id) DO NOTHING`,
              [authUser.id, linkedJob.tailor]
            );
          } catch (saveTailorError) {
            logger.warn('confirmDelivery: saveTailor skipped', {
              orderId: id,
              tailorId: linkedJob.tailor,
              userId: authUser.id,
              error: saveTailorError?.message || 'unknown',
            });
          }
        }

        return entityToJSON(refreshed || updated);
      } catch (error) {
        throw new GraphQLError(error.message, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
    },

    cancelOrder: async (_, { id, reason }, context) => {
      const authUser = requireAuth(context);
      try {
        const order = await OrderModel.cancelOrder(id, reason, authUser.id);
        return entityToJSON(order);
      } catch (error) {
        throw new GraphQLError(error.message, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
    },

    updateOrderDelivery: async (_, { id, input }, context) => {
      requireAdmin(context);
      const order = await OrderModel.findByIdAndUpdate(id, input, { new: true });
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(order);
    },

    addOrderItem: async (_, { orderId, input }, context) => {
      const authUser = requireAuth(context);
      const order = await OrderModel.findById(orderId);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      const role = authUser.role || authUser.type;
      if (role !== 'admin' && order.user !== authUser.id) {
        throw new GraphQLError('You do not have access to this order', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      const derivedStyleName =
        input?.style?.title ||
        input?.style?.name ||
        input?.description ||
        input?.category ||
        'Custom style';

      const item = await OrderItemModel.create({
        ...input,
        order: orderId,
        styleName: derivedStyleName,
        name: derivedStyleName,
      });
      return entityToJSON(item);
    },

    removeOrderItem: async (_, { orderId: _orderId, itemId }, context) => {
      requireAuth(context);
      await OrderItemModel.delete(itemId);
      return { success: true, message: 'Order item removed' };
    },

    queueStyleSelection: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const windowStatus = await resolveStylingWindowStatus();

      if (windowStatus.isOpen) {
        const user = await UserModel.findById(authUser.id);
        const deliveryDetails = await UserModel.findDeliveryDetails(authUser.id);

        const order = await OrderModel.create({
          user: authUser.id,
          measurement: input.measurement,
          orderType: input.orderType || 'special_request',
          customerName: user?.fullName || null,
          customerEmail: user?.email || null,
          customerPhone: deliveryDetails?.phone || user?.phone || null,
          deliveryAddress: deliveryDetails
            ? {
                address: deliveryDetails.address || null,
                phone: deliveryDetails.phone || user?.phone || null,
                landmark: deliveryDetails.landmark || null,
                nearestBusStop: deliveryDetails.nearestBusStop || null,
              }
            : null,
          notes: input.notes || input.styleDescription || null,
          createdBy: authUser.id,
          createdByRole: authUser.role || authUser.type || 'user',
        });

        await OrderItemModel.create({
          order: order.id,
          category: input.category || 'custom',
          description: input.styleDescription || input.styleTitle,
          style: {
            title: input.styleTitle,
            image: input.styleImageUrl,
          },
          customizations: {
            payload: input.stylePayload || {},
            source: input.source,
            sourceUrl: input.sourceUrl,
          },
          notes: input.notes || null,
          quantity: 1,
          itemStatus: 'pending',
        });

        const styleId = (input.stylePayload?.styleId) || null;
        const { rows } = await dbQuery(
          `INSERT INTO style_selection_queue
            (user_id, measurement_id, order_type, category, style_title, style_description,
             style_image_url, style_payload, source, source_url, notes, status, linked_order_id, style_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'processed',$12,$13)
           RETURNING *`,
          [
            authUser.id,
            input.measurement || null,
            input.orderType || 'special_request',
            input.category || null,
            input.styleTitle,
            input.styleDescription || null,
            input.styleImageUrl || null,
            input.stylePayload ? JSON.stringify(input.stylePayload) : '{}',
            input.source || null,
            input.sourceUrl || null,
            input.notes || null,
            order.id,
            styleId,
          ]
        );
        return formatQueueRow(rows[0]);
      }

      const styleId = (input.stylePayload?.styleId) || null;
      const { rows } = await dbQuery(
        `INSERT INTO style_selection_queue
          (user_id, measurement_id, order_type, category, style_title, style_description,
           style_image_url, style_payload, source, source_url, notes, status, style_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'queued',$12)
         RETURNING *`,
        [
          authUser.id,
          input.measurement || null,
          input.orderType || 'special_request',
          input.category || null,
          input.styleTitle,
          input.styleDescription || null,
          input.styleImageUrl || null,
          input.stylePayload ? JSON.stringify(input.stylePayload) : '{}',
          input.source || null,
          input.sourceUrl || null,
          input.notes || null,
          styleId,
        ]
      );

      return formatQueueRow(rows[0]);
    },

    cancelQueuedStyle: async (_, { id, reason }, context) => {
      const authUser = requireAuth(context);
      const role = authUser.role || authUser.type;

      const { rows: foundRows } = await dbQuery('SELECT * FROM style_selection_queue WHERE id = $1 LIMIT 1', [id]);
      const row = foundRows[0];
      if (!row) {
        throw new GraphQLError('Queue item not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      if (row.status !== 'queued') {
        throw new GraphQLError('Only queued styles can be cancelled', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (role !== 'admin' && row.user_id !== authUser.id) {
        throw new GraphQLError('You do not have access to this queue item', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      const { rows } = await dbQuery(
        `UPDATE style_selection_queue
            SET status = 'cancelled',
                cancel_reason = $2,
                cancelled_by = $3,
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, reason || null, authUser.id]
      );

      return formatQueueRow(rows[0]);
    },

    escalateQueuedStyleToOrder: async (_, { id }, context) => {
      const admin = requireAdmin(context);
      const { rows } = await dbQuery('SELECT * FROM style_selection_queue WHERE id = $1 LIMIT 1', [id]);
      const row = rows[0];

      if (!row) {
        throw new GraphQLError('Queue item not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      if (row.status !== 'queued') {
        throw new GraphQLError('Only queued styles can be escalated', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      await promoteQueueEntryToOrder(row, {
        finalStatus: 'escalated',
        changedBy: { id: admin.id, role: 'admin' },
      });

      const { rows: updatedRows } = await dbQuery('SELECT * FROM style_selection_queue WHERE id = $1 LIMIT 1', [id]);
      return formatQueueRow(updatedRows[0]);
    },

    updateStylingWindowConfig: async (_, { input }, context) => {
      const admin = requireAdmin(context);
      const { rows } = await dbQuery(
        `UPDATE styling_window_config
            SET override_enabled = $1,
                force_is_open = $2,
                override_open_at = $3,
                override_close_at = $4,
                notes = $5,
                updated_by = $6,
                updated_at = NOW()
          WHERE id = 1
          RETURNING *`,
        [
          input.overrideEnabled,
          input.forceIsOpen !== undefined ? input.forceIsOpen : null,
          input.overrideOpenAt || null,
          input.overrideCloseAt || null,
          input.notes || null,
          admin.id,
        ]
      );

      return formatStylingWindowConfig(rows[0]);
    },
  },
};

export default orderResolvers;
