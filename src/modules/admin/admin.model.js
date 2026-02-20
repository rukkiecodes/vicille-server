import { query } from '../../infrastructure/database/postgres.js';
import { hashPassword, comparePassword } from '../../core/utils/crypto.js';
import logger from '../../core/logger/index.js';

function format(row) {
  if (!row) return null;
  const a = {
    id:             row.id,
    entityId:       row.id,
    fullName:       row.full_name,
    email:          row.email,
    phone:          row.phone,
    role:           row.role,
    profilePhoto:   row.profile_photo_url,
    isActive:       row.is_active,
    passwordHash:   row.password_hash,
    createdBy:      row.created_by,
    lastLoginAt:    row.last_login_at,
    isDeleted:      row.is_deleted,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    get isSuperAdmin() { return this.role === 'super_admin'; },
    get accountStatus() { return this.isActive ? 'active' : 'inactive'; },
    get permissions() {
      // Role-to-permissions mapping kept simple here;
      // full mapping is in core/constants/roles.js
      return this.role === 'super_admin' ? ['*'] : [];
    },
  };

  a.toSafeJSON = () => {
    const safe = { ...a };
    delete safe.passwordHash;
    delete safe.toSafeJSON;
    return safe;
  };

  return a;
}

const AdminModel = {
  async create(data) {
    const passwordHash = data.password ? await hashPassword(data.password) : null;
    const { rows } = await query(
      `INSERT INTO admins (full_name,email,phone,password_hash,role,created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        data.fullName,
        data.email?.toLowerCase(),
        data.phone || null,
        passwordHash,
        data.role || 'admin',
        data.createdBy || null,
      ]
    );
    logger.info(`Admin created: ${rows[0].email} (${rows[0].role})`);
    return format(rows[0]);
  },

  async findById(id, options = {}) {
    const cond = options.includeDeleted ? '' : 'AND is_deleted=FALSE';
    const { rows } = await query(`SELECT * FROM admins WHERE id=$1 ${cond}`, [id]);
    return format(rows[0] || null);
  },

  async findByEmail(email) {
    const { rows } = await query(
      'SELECT * FROM admins WHERE email=$1 AND is_deleted=FALSE',
      [email.toLowerCase()]
    );
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      fullName:        'full_name',
      email:           'email',
      phone:           'phone',
      role:            'role',
      profilePhotoUrl: 'profile_photo_url',
      isActive:        'is_active',
      lastLoginAt:     'last_login_at',
      isDeleted:       'is_deleted',
    };
    const fields = [];
    const values = [];
    let i = 1;
    if (updates.password) {
      fields.push(`password_hash=$${i++}`);
      values.push(await hashPassword(updates.password));
    }
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) { fields.push(`${dbCol}=$${i++}`); values.push(updates[jsKey]); }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE admins SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['is_deleted=FALSE'];
    const vals = [];
    let i = 1;
    if (filters.role)     { conds.push(`role=$${i++}`);     vals.push(filters.role); }
    if (filters.isActive !== undefined) {
      conds.push(`is_active=$${i++}`); vals.push(filters.isActive);
    }
    const { rows } = await query(
      `SELECT * FROM admins WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['is_deleted=FALSE'];
    const vals = [];
    let i = 1;
    if (filters.role) { conds.push(`role=$${i++}`); vals.push(filters.role); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM admins WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async comparePassword(admin, candidatePassword) {
    if (!admin.passwordHash) return false;
    return comparePassword(candidatePassword, admin.passwordHash);
  },

  async emailExists(email) {
    return !!(await this.findByEmail(email));
  },

  async findByIdAndDelete(id) {
    // Soft-delete; admins are never hard-deleted
    return this.findByIdAndUpdate(id, { isDeleted: true });
  },
};

export default AdminModel;
