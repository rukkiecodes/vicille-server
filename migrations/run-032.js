/**
 * Usage (run from the server/ directory):
 *   node migrations/run-032.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sql = fs.readFileSync(
  path.join(__dirname, '032_wallet.sql'),
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
    console.log('Running migration 032_wallet …');
    await client.query(sql);
    console.log('✅  Migration complete — user_wallets, wallet_transactions, user_saved_cards tables created.');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
