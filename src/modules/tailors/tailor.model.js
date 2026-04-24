import { query } from '../../infrastructure/database/postgres.js';
import { hashPassword, comparePassword } from '../../core/utils/crypto.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';
import logger from '../../core/logger/index.js';

const SESSION_PREFIX = 'session:tailor:';
const SESSION_TTL = 86400 * 7;

function format(row) {
  if (!row) return null;
  const t = {
    id:                     row.id,
    entityId:               row.id,
    fullName:               row.full_name,
    email:                  row.email,
    phone:                  row.phone,
    status:                 row.status,
    accountStatus:          row.status,
    verificationStatus:     row.status === 'active' ? 'verified' : row.status,
    specialties:            row.specialties || [],
    preferredPaymentMethod: row.preferred_payment_method,
    bankName:                 row.bank_name,
    accountNumber:            row.account_number,
    accountName:              row.account_name,
    expectedEarningPerJob:    row.expected_earning_per_job    != null ? Number(row.expected_earning_per_job)    : null,
    averageJobCompletionDays: row.average_job_completion_days != null ? Number(row.average_job_completion_days) : null,
    kycDocuments:           row.kyc_docs || [],
    profilePhoto:           row.profile_photo_url,
    // Capacity
    capacity: {
      preferredMaxPerDay:   row.capacity_per_day,
      preferredMaxPerWeek:  row.capacity_per_week,
      preferredMaxPerMonth: row.capacity_per_month,
      isActive:             !row.is_capacity_reduced,
    },
    isCapacityReduced:       row.is_capacity_reduced,
    capacityReducedUntil:    row.capacity_reduced_until,
    capacityReductionReason: row.capacity_reduction_reason,
    // Performance
    performance: {
      totalJobsCompleted:     row.total_jobs_completed,
      totalJobsAssigned:      row.total_jobs_assigned,
      missedDeadlines:        row.missed_deadlines,
      onTimeDeliveryRate:     row.on_time_delivery_rate,
      averageRating:          row.average_rating,
      consecutiveMissCount:   row.consecutive_miss_count,
      consecutiveOnTimeJobs:  row.consecutive_on_time_count,
      isProbation:            row.is_on_probation,
      probationJobsCompleted: row.probation_jobs_completed,
    },
    totalJobsCompleted:      row.total_jobs_completed,
    totalJobsAssigned:       row.total_jobs_assigned,
    missedDeadlines:         row.missed_deadlines,
    consecutiveMissCount:    row.consecutive_miss_count,
    consecutiveOnTimeCount:  row.consecutive_on_time_count,
    onTimeDeliveryRate:      row.on_time_delivery_rate,
    averageRating:           row.average_rating,
    isOnProbation:           row.is_on_probation,
    probationJobsCompleted:  row.probation_jobs_completed,
    advanceEligible:         row.advance_eligible,
    // Auth
    passwordHash:            row.password_hash,
    resetToken:              row.reset_token,
    resetTokenExpiresAt:     row.reset_token_expires_at,
    lastActiveAt:            row.last_login_at,
    lastLoginAt:             row.last_login_at,
    tailorType:              row.tailor_type || 'vicelle',
    isDeleted:               row.is_deleted,
    createdAt:               row.created_at,
    updatedAt:               row.updated_at,
  };

  Object.defineProperties(t, {
    isVerified:    { get() { return this.status === 'active' || this.status === 'verified'; } },
    completionRate:{ get() {
      if (!this.totalJobsAssigned) return 100;
      return Math.round((this.totalJobsCompleted / this.totalJobsAssigned) * 100);
    }},
    availability: { get() {
      return { workingDays: ['monday','tuesday','wednesday','thursday','friday'], workingHours: { start:'08:00', end:'18:00' }, isAvailable: !this.isCapacityReduced };
    }},
  });

  t.canAcceptJobs = () => t.status === 'active' && !t.isCapacityReduced;

  t.toSafeJSON = () => {
    const safe = { ...t };
    delete safe.passwordHash;
    delete safe.resetToken;
    delete safe.resetTokenExpiresAt;
    delete safe.toSafeJSON;
    return safe;
  };

  return t;
}

const colMap = {
  fullName:               'full_name',
  email:                  'email',
  phone:                  'phone',
  status:                 'status',
  accountStatus:          'status',
  specialties:            'specialties',
  profilePhotoUrl:        'profile_photo_url',
  preferredPaymentMethod: 'preferred_payment_method',
  bankName:                   'bank_name',
  accountNumber:              'account_number',
  accountName:                'account_name',
  expectedEarningPerJob:      'expected_earning_per_job',
  averageJobCompletionDays:   'average_job_completion_days',
  kycDocs:                'kyc_docs',
  kycDocuments:           'kyc_docs',
  capacityPerDay:         'capacity_per_day',
  capacityPerWeek:        'capacity_per_week',
  capacityPerMonth:       'capacity_per_month',
  isCapacityReduced:      'is_capacity_reduced',
  capacityReducedUntil:   'capacity_reduced_until',
  capacityReductionReason:'capacity_reduction_reason',
  totalJobsCompleted:     'total_jobs_completed',
  totalJobsAssigned:      'total_jobs_assigned',
  missedDeadlines:        'missed_deadlines',
  consecutiveMissCount:   'consecutive_miss_count',
  consecutiveOnTimeCount: 'consecutive_on_time_count',
  onTimeDeliveryRate:     'on_time_delivery_rate',
  averageRating:          'average_rating',
  isOnProbation:          'is_on_probation',
  probationJobsCompleted: 'probation_jobs_completed',
  advanceEligible:        'advance_eligible',
  tailorType:             'tailor_type',
  lastLoginAt:            'last_login_at',
  lastActiveAt:           'last_login_at',
  resetToken:             'reset_token',
  resetTokenExpiresAt:    'reset_token_expires_at',
  isDeleted:              'is_deleted',
  deletedAt:              'deleted_at',
};

const TailorModel = {
  async create(data) {
    const passwordHash = data.password ? await hashPassword(data.password) : null;
    const tailorType = data.tailorType === 'styleu' ? 'styleu' : 'vicelle';
    const { rows } = await query(
      `INSERT INTO tailors (full_name,email,phone,password_hash,status,specialties,tailor_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        data.fullName,
        data.email?.toLowerCase(),
        data.phone || null,
        passwordHash,
        data.status || 'pending',
        data.specialties || [],
        tailorType,
      ]
    );
    logger.info(`Tailor created: ${rows[0].email}`);
    return format(rows[0]);
  },

  async findById(id, options = {}) {
    const cond = options.includeDeleted ? '' : 'AND is_deleted=FALSE';
    const { rows } = await query(`SELECT * FROM tailors WHERE id=$1 ${cond}`, [id]);
    return format(rows[0] || null);
  },

  async findByEmail(email) {
    const { rows } = await query(
      'SELECT * FROM tailors WHERE email=$1 AND is_deleted=FALSE',
      [email.toLowerCase()]
    );
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates, options = {}) {
    const fields = [];
    const values = [];
    let i = 1;
    if (updates.password) {
      fields.push(`password_hash=$${i++}`);
      values.push(await hashPassword(updates.password));
    }
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) {
        fields.push(`${dbCol}=$${i++}`);
        values.push(updates[jsKey]);
      }
    }
    if (!fields.length) return this.findById(id, options);
    values.push(id);
    const { rows } = await query(
      `UPDATE tailors SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['is_deleted=FALSE'];
    const vals = [];
    let i = 1;
    if (filters.status) { conds.push(`status=$${i++}`); vals.push(filters.status); }
    if (filters.accountStatus) { conds.push(`status=$${i++}`); vals.push(filters.accountStatus); }
    const { rows } = await query(
      `SELECT * FROM tailors WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async findAvailable() {
    const { rows } = await query(
      `SELECT * FROM tailors WHERE is_deleted=FALSE AND status='active' AND is_capacity_reduced=FALSE`, []
    );
    return rows.map(format);
  },

  async findBySpecialty(category) {
    const { rows } = await query(
      `SELECT * FROM tailors WHERE is_deleted=FALSE AND status='active' AND $1=ANY(specialties) ORDER BY on_time_delivery_rate DESC`,
      [category]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['is_deleted=FALSE'];
    const vals = [];
    let i = 1;
    if (filters.status) { conds.push(`status=$${i++}`); vals.push(filters.status); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM tailors WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async comparePassword(tailor, candidatePassword) {
    if (!tailor.passwordHash) return false;
    return comparePassword(candidatePassword, tailor.passwordHash);
  },

  async emailExists(email) {
    return !!(await this.findByEmail(email));
  },

  async updatePerformanceOnCompletion(tailorId, wasOnTime, rating) {
    const t = await this.findById(tailorId);
    if (!t) return null;
    const completed = t.totalJobsCompleted + 1;
    const missed    = wasOnTime ? t.missedDeadlines : t.missedDeadlines + 1;
    const onTimeRate = Math.round(((completed - missed) / completed) * 100);
    let avgRating = t.averageRating;
    if (rating) avgRating = (t.averageRating * t.totalJobsCompleted + rating) / completed;
    let probJobs = t.probationJobsCompleted;
    let isOnProbation = t.isOnProbation;
    if (isOnProbation) { probJobs++; if (probJobs >= 5) isOnProbation = false; }
    return this.findByIdAndUpdate(tailorId, {
      totalJobsCompleted:     completed,
      missedDeadlines:        missed,
      consecutiveMissCount:   wasOnTime ? 0 : t.consecutiveMissCount + 1,
      consecutiveOnTimeCount: wasOnTime ? t.consecutiveOnTimeCount + 1 : 0,
      onTimeDeliveryRate:     onTimeRate,
      averageRating:          avgRating,
      isOnProbation,
      probationJobsCompleted: probJobs,
    });
  },

  async cacheAuthenticatedTailor(tailor) {
    try {
      const redis = getRedisClient();
      await redis.set(`${SESSION_PREFIX}${tailor.id}`, JSON.stringify(tailor.toSafeJSON()), { EX: SESSION_TTL });
    } catch { /* non-fatal */ }
  },

  async clearCachedTailor(tailorId) {
    try {
      const redis = getRedisClient();
      await redis.del(`${SESSION_PREFIX}${tailorId}`);
    } catch { /* non-fatal */ }
  },
};

export default TailorModel;
