/**
 * Phase E — Backfill Paystack Plans
 *
 * Creates a Paystack plan for every subscription_plan row that is active
 * but does not yet have a paystack_plan_code. Safe to run multiple times —
 * rows that already have a plan code are skipped.
 *
 * Usage (run from backend/server):
 *   node scripts/backfill-paystack-plans.js
 *
 * Dry-run (print what would be created, no Paystack calls):
 *   DRY_RUN=true node scripts/backfill-paystack-plans.js
 *
 * Requirements:
 *   - PAYSTACK_SECRET_KEY in .env
 *   - SUPERBASE_* DB vars in .env (same as main server)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pg;

const DRY_RUN = process.env.DRY_RUN === 'true';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = 'https://api.paystack.co';

if (!PAYSTACK_SECRET_KEY) {
  console.error('❌  PAYSTACK_SECRET_KEY is not set');
  process.exit(1);
}

const pool = new Pool({
  host:     process.env.SUPERBASE_POOL_HOST,
  port:     parseInt(process.env.SUPERBASE_POOL_PORT, 10) || 5432,
  database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
  user:     process.env.SUPERBASE_POOL_USER,
  password: process.env.SUPERBASE_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  max:      2,
});

// ── Paystack helper ────────────────────────────────────────────────────────────

async function createPaystackPlan(name, amountKobo) {
  const res = await fetch(`${BASE_URL}/plan`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      amount:   Math.floor(amountKobo),
      interval: 'monthly',
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.status === false) {
    throw new Error(data?.message || `Paystack error: ${res.status}`);
  }

  return data?.data ?? data;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function run() {
  console.log(DRY_RUN ? '🔍  DRY RUN — no Paystack calls will be made\n' : '🚀  Starting Paystack plan backfill\n');

  const client = await pool.connect();

  try {
    const { rows: plans } = await client.query(`
      SELECT id, name, pricing
        FROM subscription_plans
       WHERE is_active = TRUE
         AND paystack_plan_code IS NULL
       ORDER BY display_order ASC, created_at ASC
    `);

    if (plans.length === 0) {
      console.log('✅  No plans need backfilling — all active plans already have a paystack_plan_code.');
      return;
    }

    console.log(`Found ${plans.length} active plan(s) without a Paystack plan code:\n`);
    for (const p of plans) {
      const pricing     = p.pricing || {};
      const amountNgn   = pricing.amount || 0;
      const amountKobo  = Math.round(amountNgn * 100);
      const currency    = pricing.currency || 'NGN';

      console.log(`  • "${p.name}"  id=${p.id}  amount=${amountNgn} ${currency} (${amountKobo} kobo)`);

      if (amountKobo <= 0) {
        console.log(`    ⚠️  Skipping — amountKobo is ${amountKobo} (pricing.amount must be set)\n`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`    [DRY RUN] Would call POST /plan { name: "${p.name}", amount: ${amountKobo}, interval: "monthly" }\n`);
        continue;
      }

      try {
        const paystackPlan = await createPaystackPlan(p.name, amountKobo);
        const planCode = paystackPlan.plan_code;

        await client.query(
          'UPDATE subscription_plans SET paystack_plan_code = $1 WHERE id = $2',
          [planCode, p.id]
        );

        console.log(`    ✅  Created: ${planCode}\n`);
      } catch (err) {
        console.error(`    ❌  Failed: ${err.message}\n`);
        // Continue with remaining plans
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(DRY_RUN ? '\nDry run complete. Rerun without DRY_RUN=true to apply.' : '\nBackfill complete.');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
