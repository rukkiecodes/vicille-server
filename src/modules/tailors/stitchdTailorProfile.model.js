/**
 * StitchdTailorProfileModel — tenant-scoped data access for `stitchd_tailor_profile`.
 *
 * Tenant isolation (doc 01 §3, layer 2): EVERY method takes `tailorId` as its first
 * argument and scopes the query by it. There is intentionally NO "find all" method —
 * a Stitchd tailor can only ever read/write its own row. The tenant id is `tailors.id`
 * (what `requireTailor(context)` returns).
 *
 * Rows here are paired 1:1 with a `tailors` row whose `tailor_type='stitchd'`.
 */
import { query } from '../../infrastructure/database/postgres.js';

const TRIAL_DAYS = 30;

/**
 * Shape a raw DB row into the GraphQL `StitchdTailor` projection.
 * `phone` is supplied separately (it lives on the `tailors` row).
 */
function format(row, phone = null) {
  if (!row) return null;
  const businessName = row.business_name || null;
  const ownerName = row.owner_name || null;
  const locationCity = row.location_city || null;
  return {
    id:                 row.tailor_id,
    phone:              phone,
    businessName,
    ownerName,
    locationCity,
    locationArea:       row.location_area || null,
    specialties:        row.specialties || [],
    logoUrl:            row.logo_url || null,
    ownerPhotoUrl:      row.owner_photo_url || null,
    subscriptionStatus: row.subscription_status,
    tier:               row.tier,
    trialEndsAt:        row.trial_ends_at,
    weeklyCapacity:     row.weekly_capacity ?? null,
    workingHours:       row.working_hours ?? null,
    autoNotifyStatus:   Boolean(row.auto_notify_status),
    profileComplete:    Boolean(businessName && ownerName && locationCity),
    createdAt:          row.created_at,
  };
}

const StitchdTailorProfileModel = {
  TRIAL_DAYS,
  format,

  /**
   * Create the profile row for a freshly-created Stitchd tenant.
   * Stamps the 30-day trial. Scoped by (keyed to) tailorId.
   */
  async createForTailor(tailorId, data = {}) {
    const trialEndsAt =
      data.trialEndsAt || new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const { rows } = await query(
      `INSERT INTO stitchd_tailor_profile
         (tailor_id, business_name, owner_name, location_city, location_area,
          specialties, logo_url, owner_photo_url,
          subscription_status, tier, trial_ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (tailor_id) DO NOTHING
       RETURNING *`,
      [
        tailorId,
        data.businessName || null,
        data.ownerName || null,
        data.locationCity || null,
        data.locationArea || null,
        data.specialties || null,
        data.logoUrl || null,
        data.ownerPhotoUrl || null,
        data.subscriptionStatus || 'trial',
        data.tier || 'starter',
        trialEndsAt,
      ]
    );
    // If ON CONFLICT skipped the insert, fall back to the existing row.
    if (!rows[0]) return this.findRowByTailorId(tailorId);
    return rows[0];
  },

  /**
   * Fetch the raw profile row for a tailor — ALWAYS filtered by tailorId.
   */
  async findRowByTailorId(tailorId) {
    const { rows } = await query(
      'SELECT * FROM stitchd_tailor_profile WHERE tailor_id=$1',
      [tailorId]
    );
    return rows[0] || null;
  },

  /**
   * Tenant-scoped read: returns the formatted StitchdTailor for this tailor, or null.
   * Joins the phone from the `tailors` row. Filtered by tailorId on BOTH tables.
   */
  async findByTailorId(tailorId) {
    const { rows } = await query(
      `SELECT p.*, t.phone AS tailor_phone
         FROM stitchd_tailor_profile p
         JOIN tailors t ON t.id = p.tailor_id
        WHERE p.tailor_id = $1
          AND t.is_deleted = FALSE`,
      [tailorId]
    );
    const row = rows[0];
    if (!row) return null;
    return format(row, row.tailor_phone);
  },

  /**
   * Tenant-scoped update of the business profile fields. Filtered by tailorId in the
   * WHERE clause, so a caller can only ever mutate its own row. Only provided fields
   * are written. Always bumps updated_at. Ensures the trial is stamped if it wasn't.
   */
  async update(tailorId, data = {}) {
    const sets = [];
    const vals = [];
    let i = 1;

    const colMap = {
      businessName:  'business_name',
      ownerName:     'owner_name',
      locationCity:  'location_city',
      locationArea:  'location_area',
      specialties:   'specialties',
      logoUrl:       'logo_url',
      ownerPhotoUrl: 'owner_photo_url',
    };

    for (const [jsKey, col] of Object.entries(colMap)) {
      if (jsKey in data && data[jsKey] !== undefined) {
        sets.push(`${col}=$${i++}`);
        vals.push(data[jsKey]);
      }
    }

    // Availability / capacity settings (batch 13).
    if ('weeklyCapacity' in data && data.weeklyCapacity !== undefined) {
      sets.push(`weekly_capacity=$${i++}`);
      vals.push(data.weeklyCapacity);
    }
    if ('workingHours' in data && data.workingHours !== undefined) {
      sets.push(`working_hours=$${i++}::jsonb`);
      vals.push(JSON.stringify(data.workingHours));
    }
    if ('autoNotifyStatus' in data && data.autoNotifyStatus !== undefined) {
      sets.push(`auto_notify_status=$${i++}`);
      vals.push(Boolean(data.autoNotifyStatus));
    }

    // Ensure the trial is stamped (idempotent — only fills NULLs).
    sets.push(`subscription_status = COALESCE(subscription_status, 'trial')`);
    sets.push(
      `trial_ends_at = COALESCE(trial_ends_at, now() + INTERVAL '${TRIAL_DAYS} days')`
    );
    sets.push('updated_at = now()');

    vals.push(tailorId);
    const { rows } = await query(
      `UPDATE stitchd_tailor_profile
          SET ${sets.join(', ')}
        WHERE tailor_id = $${i}
        RETURNING *`,
      vals
    );
    return rows[0] || null;
  },
};

export default StitchdTailorProfileModel;
