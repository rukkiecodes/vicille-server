/**
 * Adds ALL columns referenced by subscription.model.js to user_subscriptions.
 * Safe to run even if some columns already exist (uses ADD COLUMN IF NOT EXISTS).
 *
 * Usage (run from the server/ directory):
 *   node migrations/run-007.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sql = fs.readFileSync(
  path.join(__dirname, '007_user_subscriptions_full.sql'),
  'utf8'
);

const pool = new pg.Pool({
  host:     process.env.SUPERBASE_POOL_HOST,
  port:     parseInt(process.env.SUPERBASE_POOL_PORT, 10) || 5432,
  database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
  user:     process.env.SUPERBASE_POOL_USER,
  password: process.env.SUPERBASE_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('Running migration 007_user_subscriptions_full …');
    await client.query(sql);
    console.log('✅  Migration complete — all subscription columns added.');
    console.log('    billing, next_billing_date, current_cycle, payment_status,');
    console.log('    grace_period_ends, start_date, end_date, renewal_enabled, cancellation');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
