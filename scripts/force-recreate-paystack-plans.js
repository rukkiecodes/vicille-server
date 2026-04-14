/**
 * Force-clears paystack_plan_code on ALL active subscription_plans,
 * then creates fresh Paystack plans and stores the new codes.
 *
 * Usage (run from backend/server):
 *   node scripts/force-recreate-paystack-plans.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = 'https://api.paystack.co';

if (!PAYSTACK_SECRET_KEY) {
  console.error('❌  PAYSTACK_SECRET_KEY is not set in .env');
  process.exit(1);
}

const pool = new pg.Pool({
  host:     process.env.SUPERBASE_POOL_HOST,
  port:     parseInt(process.env.SUPERBASE_POOL_PORT, 10) || 5432,
  database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
  user:     process.env.SUPERBASE_POOL_USER,
  password: process.env.SUPERBASE_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  max:      2,
});

async function createPaystackPlan(name, amountKobo) {
  const res = await fetch(`${BASE_URL}/plan`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, amount: Math.floor(amountKobo), interval: 'monthly' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status === false) throw new Error(data?.message || `Paystack ${res.status}`);
  return data?.data ?? data;
}

(async () => {
  const client = await pool.connect();
  try {
    // 1. Load all active plans
    const { rows: plans } = await client.query(
      `SELECT id, name, pricing FROM subscription_plans WHERE is_active = TRUE ORDER BY display_order ASC, created_at ASC`
    );
    console.log(`Found ${plans.length} active plan(s)\n`);

    // 2. Clear all existing plan codes first
    await client.query(`UPDATE subscription_plans SET paystack_plan_code = NULL WHERE is_active = TRUE`);
    console.log('Cleared all existing paystack_plan_code values\n');

    // 3. Recreate each plan on Paystack
    for (const p of plans) {
      const amountNgn  = p.pricing?.amount || 0;
      const amountKobo = Math.round(amountNgn * 100);

      if (amountKobo <= 0) {
        console.log(`⚠️  Skipping "${p.name}" — amount is 0`);
        continue;
      }

      try {
        const paystackPlan = await createPaystackPlan(p.name, amountKobo);
        const planCode = paystackPlan.plan_code;
        await client.query(
          'UPDATE subscription_plans SET paystack_plan_code = $1 WHERE id = $2',
          [planCode, p.id]
        );
        console.log(`✅  "${p.name}"  →  ${planCode}  (₦${amountNgn.toLocaleString()})`);
      } catch (err) {
        console.error(`❌  "${p.name}" failed: ${err.message}`);
      }
    }

    console.log('\nDone. All plans recreated on Paystack with fresh plan codes.');
  } finally {
    client.release();
    await pool.end();
  }
})();
