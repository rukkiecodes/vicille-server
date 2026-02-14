import { getRedisClient } from '../../infrastructure/database/redis.js';
import { NOTIFICATION_STATUS, NOTIFICATION_CHANNEL } from '../../core/constants/notificationTypes.js';

// Notification Entity class
class Model {
  // Get parsed recipient
  get recipientParsed() {
    return this.recipient ? JSON.parse(this.recipient) : null;
  }

  // Get parsed data
  get dataParsed() {
    return this.data ? JSON.parse(this.data) : null;
  }

  // Get parsed email details
  get emailDetailsParsed() {
    return this.emailDetails ? JSON.parse(this.emailDetails) : null;
  }

  // Get parsed push details
  get pushDetailsParsed() {
    return this.pushDetails ? JSON.parse(this.pushDetails) : null;
  }

  // Get parsed channel array
  get channelParsed() {
    return this.channel ? JSON.parse(this.channel) : [];
  }

  // Check if read
  get isRead() {
    return this.status === NOTIFICATION_STATUS.READ || !!this.readAt;
  }

  // Check if sent
  get isSent() {
    return this.status === NOTIFICATION_STATUS.SENT;
  }

  // Convert to safe JSON
  toSafeJSON() {
    return {
      id: this.entityId,
      recipient: this.recipientParsed,
      type: this.type,
      channel: this.channelParsed,
      title: this.title,
      message: this.message,
      data: this.dataParsed,
      order: this.order,
      payment: this.payment,
      job: this.job,
      status: this.status,
      sentAt: this.sentAt,
      readAt: this.readAt,
      failedAt: this.failedAt,
      failureReason: this.failureReason,
      emailDetails: this.emailDetailsParsed,
      pushDetails: this.pushDetailsParsed,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isRead: this.isRead,
      isSent: this.isSent,
    };
  }
}

// Notification Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods
const NotificationModel = {
  /**
   * Create a new notification
   */
  async create(notificationData) {
    const repo = await getNotificationRepository();

    const now = new Date();

    const notification = await repo.save({
      recipient: notificationData.recipient ? JSON.stringify(notificationData.recipient) : null,
      recipientId: notificationData.recipient?.id || notificationData.recipientId,
      type: notificationData.type,
      channel: notificationData.channel ? JSON.stringify(notificationData.channel) : '[]',
      title: notificationData.title,
      message: notificationData.message,
      data: notificationData.data ? JSON.stringify(notificationData.data) : null,
      order: notificationData.order,
      payment: notificationData.payment,
      job: notificationData.job,
      status: notificationData.status || NOTIFICATION_STATUS.PENDING,
      sentAt: notificationData.sentAt,
      readAt: notificationData.readAt,
      failedAt: notificationData.failedAt,
      failureReason: notificationData.failureReason,
      emailDetails: notificationData.emailDetails ? JSON.stringify(notificationData.emailDetails) : null,
      pushDetails: notificationData.pushDetails ? JSON.stringify(notificationData.pushDetails) : null,
      expiresAt: notificationData.expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    return notification;
  },

  /**
   * Find notification by ID
   */
  async findById(id) {
    const repo = await getNotificationRepository();
    const notification = await repo.fetch(id);
    if (!notification || !notification.type) return null;
    return notification;
  },

  /**
   * Find notifications by recipient
   */
  async findByRecipient(recipientId, options = {}) {
    const repo = await getNotificationRepository();
    let search = repo.search()
      .where('recipientId').equals(recipientId);

    if (options.unreadOnly) {
      search = search.where('status').not.equals(NOTIFICATION_STATUS.READ);
    }

    const limit = options.limit || 50;
    return search
      .sortBy('createdAt', 'DESC')
      .return.page(0, limit);
  },

  /**
   * Count unread notifications
   */
  async countUnread(recipientId) {
    const repo = await getNotificationRepository();
    const notifications = await repo.search()
      .where('recipientId').equals(recipientId)
      .return.all();

    return notifications.filter(n =>
      !n.readAt && n.status !== NOTIFICATION_STATUS.READ && n.status !== NOTIFICATION_STATUS.FAILED
    ).length;
  },

  /**
   * Mark notification as sent
   */
  async markAsSent(id) {
    const repo = await getNotificationRepository();
    const notification = await repo.fetch(id);
    if (!notification || !notification.type) return null;

    notification.status = NOTIFICATION_STATUS.SENT;
    notification.sentAt = new Date();
    notification.updatedAt = new Date();
    await repo.save(notification);

    return notification;
  },

  /**
   * Mark notification as read
   */
  async markAsRead(id) {
    const repo = await getNotificationRepository();
    const notification = await repo.fetch(id);
    if (!notification || !notification.type) return null;

    notification.status = NOTIFICATION_STATUS.READ;
    notification.readAt = new Date();
    notification.updatedAt = new Date();
    await repo.save(notification);

    return notification;
  },

  /**
   * Mark notification as failed
   */
  async markAsFailed(id, reason) {
    const repo = await getNotificationRepository();
    const notification = await repo.fetch(id);
    if (!notification || !notification.type) return null;

    notification.status = NOTIFICATION_STATUS.FAILED;
    notification.failedAt = new Date();
    notification.failureReason = reason;
    notification.updatedAt = new Date();
    await repo.save(notification);

    return notification;
  },

  /**
   * Mark all notifications as read for a recipient
   */
  async markAllAsRead(recipientId) {
    const repo = await getNotificationRepository();
    const notifications = await repo.search()
      .where('recipientId').equals(recipientId)
      .return.all();

    const unreadNotifications = notifications.filter(n => !n.readAt);
    const now = new Date();

    for (const notification of unreadNotifications) {
      notification.status = NOTIFICATION_STATUS.READ;
      notification.readAt = now;
      notification.updatedAt = now;
      await repo.save(notification);
    }

    return { modifiedCount: unreadNotifications.length };
  },

  /**
   * Find pending notifications
   */
  async findPending(limit = 100) {
    const repo = await getNotificationRepository();
    return repo.search()
      .where('status').equals(NOTIFICATION_STATUS.PENDING)
      .sortBy('createdAt', 'ASC')
      .return.page(0, limit);
  },

  /**
   * Update notification by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getNotificationRepository();
    const notification = await repo.fetch(id);
    if (!notification || !notification.type) return null;

    const jsonFields = ['recipient', 'channel', 'data', 'emailDetails', 'pushDetails'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update recipientId if recipient changes
    if (updateData.recipient) {
      const recipientObj = typeof updateData.recipient === 'string'
        ? JSON.parse(updateData.recipient)
        : updateData.recipient;
      updateData.recipientId = recipientObj.id;
    }

    Object.assign(notification, updateData, { updatedAt: new Date() });
    await repo.save(notification);

    return options.new !== false ? notification : null;
  },

  /**
   * Find notifications with filters
   */
  async find(query = {}, options = {}) {
    const repo = await getNotificationRepository();
    let search = repo.search();

    if (query.recipientId || query['recipient.id']) {
      search = search.where('recipientId').equals(query.recipientId || query['recipient.id']);
    }
    if (query.type) {
      search = search.where('type').equals(query.type);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    return search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);
  },

  /**
   * Count notifications
   */
  async countDocuments(query = {}) {
    const repo = await getNotificationRepository();
    let search = repo.search();

    if (query.recipientId || query['recipient.id']) {
      search = search.where('recipientId').equals(query.recipientId || query['recipient.id']);
    }
    if (query.type) {
      search = search.where('type').equals(query.type);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    return search.return.count();
  },

  /**
   * Delete notification
   */
  async delete(id) {
    const repo = await getNotificationRepository();
    await repo.remove(id);
  },
};

export default NotificationModel;
