import { query } from '../../infrastructure/database/postgres.js';

const ReferralSettingsModel = {
  async getSettings() {
    const { rows } = await query(
      'SELECT * FROM referral_settings ORDER BY updated_at DESC LIMIT 1'
    );
    return rows[0] || null;
  },

  async updateBaseAmount({ amount, updatedBy }) {
    const { rows } = await query(
      `UPDATE referral_settings
          SET base_amount = $1,
              updated_by  = $2,
              updated_at  = NOW()
        RETURNING *`,
      [amount, updatedBy || null]
    );
    return rows[0] || null;
  },
};

export default ReferralSettingsModel;
