/**
 * Fixes two schema issues in user_subscriptions:
 *   1. billing_type had no DEFAULT — now defaults to 'recurring'
 *   2. status CHECK constraint didn't include 'pending_payment' — now it does
 *
 * Usage (run from the server/ directory):
 *   node migrations/run-008.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sql = fs.readFileSync(
  path.join(__dirname, '008_user_subscriptions_constraints.sql'),
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
    console.log('Running migration 008_user_subscriptions_constraints …');
    await client.query(sql);
    console.log('✅  Migration complete.');
    console.log('    • billing_type now defaults to "recurring"');
    console.log('    • status CHECK now includes "pending_payment"');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
