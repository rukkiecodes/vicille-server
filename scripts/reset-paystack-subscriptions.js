/**
 * Reset Paystack Subscriptions & Plans
 *
 * What this does:
 *   1. Lists all Paystack subscriptions and disables each one
 *   2. Lists all Paystack plans (printed for reference — Paystack has no delete endpoint)
 *   3. Deletes ALL rows from user_subscriptions in the DB
 *   4. Clears paystack_plan_code from subscription_plans (keeps the plan rows, just unlinks Paystack)
 *
 * Usage (run from backend/server):
 *   node scripts/reset-paystack-subscriptions.js
 *
 * Dry-run (no writes, just print what would happen):
 *   DRY_RUN=true node scripts/reset-paystack-subscriptions.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DRY_RUN = process.env.DRY_RUN === 'true';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = 'https://api.paystack.co';

if (!PAYSTACK_SECRET_KEY) {
  console.error('❌  PAYSTACK_SECRET_KEY is not set in .env');
  process.exit(1);
}

if (DRY_RUN) console.log('🔍  DRY RUN — no changes will be made\n');

// ── Paystack helpers ───────────────────────────────────────────────────────

async function paystackGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Paystack GET ${path} failed: ${res.status}`);
  return data;
}

async function paystackPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Paystack POST ${path} failed: ${res.status}`);
  return data;
}

// Fetch all pages of a paginated Paystack list endpoint
async function fetchAllPages(endpoint, perPage = 100) {
  const items = [];
  let page = 1;
  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const data = await paystackGet(`${endpoint}${sep}perPage=${perPage}&page=${page}`);
    const batch = data?.data || [];
    items.push(...batch);
    const meta = data?.meta || {};
    const total = meta.total || 0;
    if (items.length >= total || batch.length === 0) break;
    page++;
  }
  return items;
}

// ── DB ─────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  host:     process.env.SUPERBASE_POOL_HOST,
  port:     parseInt(process.env.SUPERBASE_POOL_PORT, 10) || 5432,
  database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
  user:     process.env.SUPERBASE_POOL_USER,
  password: process.env.SUPERBASE_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  let client;
  try {
    // ── 1. Disable all Paystack subscriptions ──────────────────────────────
    console.log('Fetching all Paystack subscriptions…');
    const subscriptions = await fetchAllPages('/subscription');
    console.log(`  Found ${subscriptions.length} subscription(s) on Paystack`);

    const activeOrPending = subscriptions.filter(s => s.status === 'active' || s.status === 'non-renewing');
    console.log(`  ${activeOrPending.length} are active/non-renewing and will be disabled`);

    for (const sub of activeOrPending) {
      const code  = sub.subscription_code;
      const token = sub.email_token;
      if (!code || !token) {
        console.warn(`  ⚠️  Skipping ${code || '(no code)'} — missing email_token`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`  [dry] would disable ${code}`);
      } else {
        try {
          await paystackPost('/subscription/disable', { code, token });
          console.log(`  ✅  Disabled ${code}`);
        } catch (err) {
          console.warn(`  ⚠️  Could not disable ${code}: ${err.message}`);
        }
      }
    }

    // ── 2. List all Paystack plans (reference only) ────────────────────────
    console.log('\nFetching all Paystack plans…');
    const plans = await fetchAllPages('/plan');
    console.log(`  Found ${plans.length} plan(s) on Paystack:`);
    for (const p of plans) {
      console.log(`    ${p.plan_code}  ${p.name}  ₦${(p.amount / 100).toLocaleString()}  (${p.subscriptions_count ?? 0} subs)`);
    }
    console.log('  ℹ️  Paystack has no delete-plan endpoint. Plans are left as-is.');

    // ── 3. Delete all DB subscriptions ────────────────────────────────────
    console.log('\nConnecting to database…');
    client = await pool.connect();

    const { rows: subRows } = await client.query('SELECT COUNT(*) AS cnt FROM user_subscriptions');
    const subCount = parseInt(subRows[0].cnt, 10);
    console.log(`  Found ${subCount} row(s) in user_subscriptions`);

    if (DRY_RUN) {
      console.log('  [dry] would DELETE FROM user_subscriptions');
    } else {
      await client.query('DELETE FROM user_subscriptions');
      console.log(`  ✅  Deleted all ${subCount} subscription row(s)`);
    }

    // ── 4. Clear paystack_plan_code from subscription_plans ───────────────
    const { rows: planRows } = await client.query(
      'SELECT COUNT(*) AS cnt FROM subscription_plans WHERE paystack_plan_code IS NOT NULL'
    );
    const planCount = parseInt(planRows[0].cnt, 10);
    console.log(`\n  Found ${planCount} subscription_plan row(s) with a paystack_plan_code`);

    if (DRY_RUN) {
      console.log('  [dry] would UPDATE subscription_plans SET paystack_plan_code = NULL');
    } else {
      await client.query('UPDATE subscription_plans SET paystack_plan_code = NULL');
      console.log(`  ✅  Cleared paystack_plan_code on all subscription_plan rows`);
    }

    console.log('\n✅  Done. Run the backfill script next to re-create fresh Paystack plans:');
    console.log('    node scripts/backfill-paystack-plans.js\n');

  } catch (err) {
    console.error('\n❌  Error:', err.message);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
})();
