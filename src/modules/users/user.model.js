import { query } from '../../infrastructure/database/postgres.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';
import logger from '../../core/logger/index.js';

const REDIS_SESSION_PREFIX = 'session:user:';
const SESSION_TTL = 86400 * 7;

function calculateAge(dob) {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function format(row) {
  if (!row) return null;
  const user = {
    id:                      row.id,
    entityId:                row.id,
    fullName:                row.full_name,
    email:                   row.email,
    phone:                   row.phone,
    activationCode:          row.activation_code,
    isActivated:             row.is_activated,
    activatedAt:             row.activated_at,
    status:                  row.status,
    accountStatus:           row.status, // resolver compatibility alias
    isOnboarded:             row.is_onboarded,
    onboardingCompleted:     row.is_onboarded,
    onboardingStep:          row.onboarding_step,
    dateOfBirth:             row.date_of_birth,
    height:                  row.height,
    heightSource:            row.height_source,
    gender:                  row.gender,
    profilePhoto:            row.profile_photo_url,
    birthdayPackageEligible: row.birthday_package_eligible,
    failedLoginAttempts:     row.failed_login_attempts,
    lastLoginAt:             row.last_login_at,
    createdByAdminId:        row.created_by_admin_id,
    isDeleted:               row.is_deleted,
    createdAt:               row.created_at,
    updatedAt:               row.updated_at,
    age:                     calculateAge(row.date_of_birth),
  };

  user.toSafeJSON = () => {
    const safe = { ...user };
    delete safe.activationCode;
    delete safe.failedLoginAttempts;
    delete safe.toSafeJSON;
    return safe;
  };

  return user;
}

const UserModel = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO users
         (full_name, email, phone, activation_code, status, created_by_admin_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        data.fullName,
        data.email?.toLowerCase(),
        data.phone || null,
        data.activationCode || null,
        data.status || 'inactive',
        data.createdByAdminId || null,
      ]
    );
    logger.info(`User created: ${rows[0].email}`);
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query(
      'SELECT * FROM users WHERE id=$1 AND is_deleted=FALSE', [id]
    );
    return format(rows[0] || null);
  },

  async findByEmail(email) {
    const { rows } = await query(
      'SELECT * FROM users WHERE email=$1 AND is_deleted=FALSE',
      [email.toLowerCase()]
    );
    return format(rows[0] || null);
  },

  async findByPhone(phone) {
    const { rows } = await query(
      'SELECT * FROM users WHERE phone=$1 AND is_deleted=FALSE', [phone]
    );
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      fullName:                'full_name',
      email:                   'email',
      phone:                   'phone',
      activationCode:          'activation_code',
      isActivated:             'is_activated',
      activatedAt:             'activated_at',
      status:                  'status',
      accountStatus:           'status',
      isOnboarded:             'is_onboarded',
      onboardingCompleted:     'is_onboarded',
      onboardingStep:          'onboarding_step',
      dateOfBirth:             'date_of_birth',
      height:                  'height',
      heightSource:            'height_source',
      gender:                  'gender',
      profilePhotoUrl:         'profile_photo_url',
      profilePhoto:            'profile_photo_url',
      birthdayPackageEligible: 'birthday_package_eligible',
      failedLoginAttempts:     'failed_login_attempts',
      lastLoginAt:             'last_login_at',
      isDeleted:               'is_deleted',
      deletedAt:               'deleted_at',
    };
    const fields = [];
    const values = [];
    let i = 1;
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) {
        fields.push(`${dbCol}=$${i++}`);
        values.push(updates[jsKey]);
      }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(',')} WHERE id=$${i} AND is_deleted=FALSE RETURNING *`,
      values
    );
    return format(rows[0] || null);
  },

  async find(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0 } = pagination;
    const conds = ['is_deleted=FALSE'];
    const vals = [];
    let i = 1;
    if (filters.status)        { conds.push(`status=$${i++}`);        vals.push(filters.status); }
    if (filters.accountStatus) { conds.push(`status=$${i++}`);        vals.push(filters.accountStatus); }
    const { rows } = await query(
      `SELECT * FROM users WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['is_deleted=FALSE'];
    const vals = [];
    let i = 1;
    if (filters.status)        { conds.push(`status=$${i++}`);        vals.push(filters.status); }
    if (filters.accountStatus) { conds.push(`status=$${i++}`);        vals.push(filters.accountStatus); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM users WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async compareActivationCode(user, code) {
    if (!user.activationCode) return false;
    return user.activationCode === code;
  },

  async incrementFailedAttempts(user) {
    return this.findByIdAndUpdate(user.entityId, {
      failedLoginAttempts: (user.failedLoginAttempts || 0) + 1,
    });
  },

  async resetFailedAttempts(user) {
    return this.findByIdAndUpdate(user.entityId, { failedLoginAttempts: 0 });
  },

  async findByActivationCode(passcode) {
    const { rows } = await query(
      "SELECT * FROM users WHERE activation_code=$1 AND is_deleted=FALSE AND status != 'deleted'",
      [passcode]
    );
    return format(rows[0] || null);
  },

  async emailExists(email) {
    return !!(await this.findByEmail(email));
  },

  async phoneExists(phone) {
    return !!(await this.findByPhone(phone));
  },

  async findByIdAndDelete(id) {
    return this.findByIdAndUpdate(id, { isDeleted: true, status: 'deleted', deletedAt: new Date() });
  },

  async updateDeliveryDetails(userId, input) {
    await query(
      `INSERT INTO user_delivery_details (user_id, address, phone, landmark, nearest_bus_stop)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET
         address=EXCLUDED.address,
         phone=EXCLUDED.phone,
         landmark=EXCLUDED.landmark,
         nearest_bus_stop=EXCLUDED.nearest_bus_stop,
         updated_at=NOW()`,
      [userId, input.address, input.phone, input.landmark || null, input.nearestBusStop || null]
    );
    return this.findById(userId);
  },

  async updatePreferences(userId, input) {
    await query(
      `INSERT INTO user_preferences (user_id, clothing_styles, colors, fabrics, lifestyle)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET
         clothing_styles=EXCLUDED.clothing_styles,
         colors=EXCLUDED.colors,
         fabrics=EXCLUDED.fabrics,
         lifestyle=EXCLUDED.lifestyle,
         updated_at=NOW()`,
      [
        userId,
        input.styles || [],
        input.colors || [],
        input.fabrics || [],
        input.lifestyle ? JSON.stringify({ value: input.lifestyle }) : '{}',
      ]
    );
    return this.findById(userId);
  },

  async findDeliveryDetails(userId) {
    const { rows } = await query(
      'SELECT * FROM user_delivery_details WHERE user_id=$1', [userId]
    );
    if (!rows[0]) return null;
    return {
      address: rows[0].address,
      phone: rows[0].phone,
      landmark: rows[0].landmark,
      nearestBusStop: rows[0].nearest_bus_stop,
    };
  },

  async findPreferences(userId) {
    const { rows } = await query(
      'SELECT * FROM user_preferences WHERE user_id=$1', [userId]
    );
    if (!rows[0]) return null;
    const lifestyle = rows[0].lifestyle;
    return {
      styles: rows[0].clothing_styles || [],
      colors: rows[0].colors || [],
      fabrics: rows[0].fabrics || [],
      lifestyle: typeof lifestyle === 'object' ? (lifestyle?.value || null) : lifestyle || null,
    };
  },

  // Redis session cache
  async cacheAuthenticatedUser(user) {
    try {
      const redis = getRedisClient();
      await redis.set(
        `${REDIS_SESSION_PREFIX}${user.id}`,
        JSON.stringify(user.toSafeJSON()),
        { EX: SESSION_TTL }
      );
    } catch { /* non-fatal */ }
  },

  async getCachedUser(userId) {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(`${REDIS_SESSION_PREFIX}${userId}`);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  },

  async clearCachedUser(userId) {
    try {
      const redis = getRedisClient();
      await redis.del(`${REDIS_SESSION_PREFIX}${userId}`);
    } catch { /* non-fatal */ }
  },
};

export default UserModel;
