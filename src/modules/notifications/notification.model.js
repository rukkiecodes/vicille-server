import { query } from '../../infrastructure/database/postgres.js';
import { NOTIFICATION_STATUS } from '../../core/constants/notificationTypes.js';

function format(row) {
  if (!row) return null;
  const n = {
    id:             row.id,
    entityId:       row.id,
    recipient:      row.recipient,
    recipientId:    row.recipient_id,
    recipientRole:  row.recipient_role,
    type:           row.type,
    channel:        row.channel || [],
    title:          row.title,
    message:        row.message,
    data:           row.data,
    order:          row.order_id,
    payment:        row.payment_id,
    job:            row.job_id,
    status:         row.status,
    sentAt:         row.sent_at,
    readAt:         row.read_at,
    failedAt:       row.failed_at,
    failureReason:  row.failure_reason,
    emailDetails:   row.email_details,
    pushDetails:    row.push_details,
    expiresAt:      row.expires_at,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };

  Object.defineProperties(n, {
    isRead: { get() { return this.status === NOTIFICATION_STATUS.READ || !!this.readAt; }},
    isSent: { get() { return this.status === NOTIFICATION_STATUS.SENT; }},
  });

  n.toSafeJSON = () => ({ ...n, isRead: n.isRead, isSent: n.isSent });

  return n;
}

const NotificationModel = {
  async create(data) {
    const recipientId = data.recipient?.id || data.recipientId;
    const { rows } = await query(
      `INSERT INTO notifications
         (recipient_id, recipient_role, recipient, type, channel, title, message, data,
          order_id, payment_id, job_id, status, sent_at, read_at, failed_at, failure_reason,
          email_details, push_details, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [
        recipientId || null,
        data.recipientRole || (data.recipient?.role) || null,
        data.recipient || null,
        data.type,
        data.channel || [],
        data.title,
        data.message,
        data.data || null,
        data.order || null,
        data.payment || null,
        data.job || null,
        data.status || NOTIFICATION_STATUS.PENDING,
        data.sentAt || null,
        data.readAt || null,
        data.failedAt || null,
        data.failureReason || null,
        data.emailDetails || null,
        data.pushDetails || null,
        data.expiresAt || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM notifications WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByRecipient(recipientId, options = {}) {
    const limit = options.limit || 50;
    let sql = 'SELECT * FROM notifications WHERE recipient_id=$1';
    const vals = [recipientId];
    if (options.unreadOnly) { sql += ` AND status<>'${NOTIFICATION_STATUS.READ}'`; }
    sql += ' ORDER BY created_at DESC LIMIT $2';
    vals.push(limit);
    const { rows } = await query(sql, vals);
    return rows.map(format);
  },

  async countUnread(recipientId) {
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM notifications
       WHERE recipient_id=$1 AND read_at IS NULL
       AND status NOT IN ('${NOTIFICATION_STATUS.READ}','${NOTIFICATION_STATUS.FAILED}')`,
      [recipientId]
    );
    return parseInt(rows[0].cnt, 10);
  },

  async markAsSent(id) {
    const { rows } = await query(
      `UPDATE notifications SET status='${NOTIFICATION_STATUS.SENT}', sent_at=NOW() WHERE id=$1 RETURNING *`, [id]
    );
    return format(rows[0] || null);
  },

  async markAsRead(id) {
    const { rows } = await query(
      `UPDATE notifications SET status='${NOTIFICATION_STATUS.READ}', read_at=NOW() WHERE id=$1 RETURNING *`, [id]
    );
    return format(rows[0] || null);
  },

  async markAsFailed(id, reason) {
    const { rows } = await query(
      `UPDATE notifications SET status='${NOTIFICATION_STATUS.FAILED}', failed_at=NOW(), failure_reason=$1
       WHERE id=$2 RETURNING *`,
      [reason, id]
    );
    return format(rows[0] || null);
  },

  async markAllAsRead(recipientId) {
    const { rowCount } = await query(
      `UPDATE notifications SET status='${NOTIFICATION_STATUS.READ}', read_at=NOW()
       WHERE recipient_id=$1 AND read_at IS NULL`,
      [recipientId]
    );
    return { modifiedCount: rowCount };
  },

  async findPending(limit = 100) {
    const { rows } = await query(
      `SELECT * FROM notifications WHERE status='${NOTIFICATION_STATUS.PENDING}' ORDER BY created_at ASC LIMIT $1`,
      [limit]
    );
    return rows.map(format);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      status:        'status',
      sentAt:        'sent_at',
      readAt:        'read_at',
      failedAt:      'failed_at',
      failureReason: 'failure_reason',
      emailDetails:  'email_details',
      pushDetails:   'push_details',
    };
    const fields = [];
    const values = [];
    let i = 1;
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) { fields.push(`${dbCol}=$${i++}`); values.push(updates[jsKey]); }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE notifications SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async find(filters = {}, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    const rid = filters.recipientId || filters['recipient.id'];
    if (rid)           { conds.push(`recipient_id=$${i++}`); vals.push(rid); }
    if (filters.type)  { conds.push(`type=$${i++}`);         vals.push(filters.type); }
    if (filters.status){ conds.push(`status=$${i++}`);       vals.push(filters.status); }
    const { rows } = await query(
      `SELECT * FROM notifications WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    const rid = filters.recipientId || filters['recipient.id'];
    if (rid)           { conds.push(`recipient_id=$${i++}`); vals.push(rid); }
    if (filters.type)  { conds.push(`type=$${i++}`);         vals.push(filters.type); }
    if (filters.status){ conds.push(`status=$${i++}`);       vals.push(filters.status); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM notifications WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM notifications WHERE id=$1', [id]);
  },
};

export default NotificationModel;
