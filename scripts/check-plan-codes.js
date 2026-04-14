/**
 * Prints paystack_plan_code for all subscription_plans in the DB,
 * then lists plans from Paystack so you can compare.
 *
 * Usage (from backend/server):
 *   node scripts/check-plan-codes.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const pool = new pg.Pool({
  host:     process.env.SUPERBASE_POOL_HOST,
  port:     parseInt(process.env.SUPERBASE_POOL_PORT, 10) || 5432,
  database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
  user:     process.env.SUPERBASE_POOL_USER,
  password: process.env.SUPERBASE_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  max:      2,
});

async function listPaystackPlans() {
  const res = await fetch('https://api.paystack.co/plan?perPage=100&page=1&status=active', {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const data = await res.json().catch(() => ({}));
  return data?.data || [];
}

(async () => {
  const client = await pool.connect();
  try {
    console.log('Using Paystack key:', PAYSTACK_SECRET_KEY?.slice(0, 20) + '...\n');

    // 1. DB plans
    const { rows } = await client.query(
      `SELECT id, name, paystack_plan_code, is_active FROM subscription_plans ORDER BY display_order ASC`
    );
    console.log('=== DB subscription_plans ===');
    for (const r of rows) {
      console.log(`  ${r.name} | active=${r.is_active} | paystack_plan_code=${r.paystack_plan_code || '(none)'}`);
    }

    // 2. Paystack plans
    console.log('\n=== Paystack plans (using server .env key) ===');
    const paystackPlans = await listPaystackPlans();
    if (!paystackPlans.length) {
      console.log('  (no plans returned — check if key is correct)');
    }
    for (const p of paystackPlans) {
      console.log(`  ${p.name} | plan_code=${p.plan_code} | amount=${p.amount} | status=${p.status}`);
    }

    // 3. Match check
    console.log('\n=== Match check ===');
    const paystackCodes = new Set(paystackPlans.map(p => p.plan_code));
    for (const r of rows) {
      if (!r.paystack_plan_code) {
        console.log(`  ❌  "${r.name}" — no paystack_plan_code in DB`);
      } else if (!paystackCodes.has(r.paystack_plan_code)) {
        console.log(`  ⚠️  "${r.name}" — DB has ${r.paystack_plan_code} but NOT found on Paystack`);
      } else {
        console.log(`  ✅  "${r.name}" — ${r.paystack_plan_code} matches`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
})();
