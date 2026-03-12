/**
 * Runs all SQL migrations in ./migrations exactly once, in numeric order.
 *
 * Usage (run from the server/ directory):
 *   node migrations/seed.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new pg.Pool({
  host: process.env.SUPERBASE_POOL_HOST,
  port: parseInt(process.env.SUPERBASE_POOL_PORT, 10) || 5432,
  database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
  user: process.env.SUPERBASE_POOL_USER,
  password: process.env.SUPERBASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

function getSqlMigrations() {
  return fs
    .readdirSync(__dirname)
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .sort((a, b) => {
      const an = parseInt(a.split('_')[0], 10);
      const bn = parseInt(b.split('_')[0], 10);
      return an - bn;
    });
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function hasMigration(client, filename) {
  const result = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1',
    [filename]
  );
  return result.rowCount > 0;
}

async function recordMigration(client, filename) {
  await client.query(
    'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
    [filename]
  );
}

function isAlreadyAppliedError(message) {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('already exists') ||
    m.includes('duplicate key value') ||
    m.includes('duplicate column') ||
    m.includes('multiple primary keys') ||
    m.includes('constraint') && m.includes('already exists')
  );
}

async function run() {
  const client = await pool.connect();

  try {
    const files = getSqlMigrations();
    if (files.length === 0) {
      console.log('No SQL migration files found.');
      return;
    }

    await ensureMigrationTable(client);

    console.log(`Found ${files.length} SQL migration(s).`);

    for (const filename of files) {
      const alreadyApplied = await hasMigration(client, filename);
      if (alreadyApplied) {
        console.log(`⏭️  Skipping ${filename} (already applied)`);
        continue;
      }

      const fullPath = path.join(__dirname, filename);
      const sql = fs.readFileSync(fullPath, 'utf8');

      console.log(`Running ${filename} ...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await recordMigration(client, filename);
        await client.query('COMMIT');
        console.log(`✅  Applied ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        if (isAlreadyAppliedError(err.message)) {
          console.log(`⏭️  Skipping ${filename} (appears already applied: ${err.message})`);
          await recordMigration(client, filename);
          continue;
        }
        throw new Error(`${filename} failed: ${err.message}`);
      }
    }

    console.log('✅  All pending migrations completed.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('❌  Migration seed failed:', err.message);
  process.exitCode = 1;
});
