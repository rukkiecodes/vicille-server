/**
 * Adds all columns expected by vicelle-pay's payment.model.js that were
 * missing from the payments table (original schema used different names).
 *
 * Adds: transaction_reference, payment_type, provider_reference,
 *       provider_response, metadata, refund, paid_at, failed_at
 * Fixes: status CHECK to include 'success'
 *
 * Usage (run from the server/ directory):
 *   node migrations/run-009.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sql = fs.readFileSync(
  path.join(__dirname, '009_payments_full.sql'),
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
    console.log('Running migration 009_payments_full …');
    await client.query(sql);
    console.log('✅  Migration complete.');
    console.log('    transaction_reference, payment_type, provider_reference,');
    console.log('    provider_response, metadata, refund, paid_at, failed_at added.');
    console.log('    status CHECK now includes "success".');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
