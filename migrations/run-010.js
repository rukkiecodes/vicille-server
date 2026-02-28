/**
 * Comprehensive fix for all vicelle-pay DB issues:
 *
 *  payments table:
 *    - type column gets DEFAULT 'subscription' (was NOT NULL with no default)
 *    - adds: transaction_reference, payment_type, provider_reference,
 *            provider_response, metadata, refund, paid_at, failed_at
 *    - status CHECK expanded to include 'success'
 *
 *  user_payment_methods table:
 *    - adds: authorization_status, bank_code, paystack_customer_code,
 *            mandate_reference, updated_at
 *    - adds UNIQUE index on paystack_authorization_code (needed for upsert)
 *    - adds updated_at trigger
 *
 * Usage (run from the server/ directory):
 *   node migrations/run-010.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sql = fs.readFileSync(
  path.join(__dirname, '010_vicelle_pay_full.sql'),
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
    console.log('Running migration 010_vicelle_pay_full …');
    await client.query(sql);
    console.log('✅  Migration complete.');
    console.log('    payments: type default set, all model columns added, status CHECK fixed.');
    console.log('    user_payment_methods: missing columns added, UNIQUE auth_code index created.');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
