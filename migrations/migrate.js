/**
 * Auto migration runner.
 *
 * Discovers every `NNN_name.sql` file in this folder, tracks which have been applied in
 * the repo's existing `public.schema_migrations` table (keyed by filename), and runs the
 * pending ones in numeric order. Each migration runs inside a transaction (unless its SQL
 * uses CONCURRENTLY, which can't) and is recorded only on success — so the script is safe
 * to re-run and stops at the first failure without leaving a half-applied migration.
 *
 * Usage (from backend/server/):
 *   node migrations/migrate.js                 # run all UNRECORDED migrations, in order
 *   node migrations/migrate.js 038 039 045     # run only these (by number or filename)
 *   node migrations/migrate.js --list          # show applied vs pending, run nothing
 *   node migrations/migrate.js --baseline 037  # mark 001..037 as applied WITHOUT running
 *                                              #   (use once, for migrations already applied
 *                                              #    to the DB by the old run-NNN.js scripts)
 *   node migrations/migrate.js --force 044     # re-run even if already recorded
 *
 * Reads DB creds from ../.env (same vars the per-file runners use).
 * Tracking table (matches the repo's convention):
 *   public.schema_migrations (filename text, applied_at timestamptz)
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── CLI parsing ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
const baselineIdx = argv.indexOf('--baseline');
const baselineTo = baselineIdx !== -1 ? argv[baselineIdx + 1] : null;
const forceIdx = argv.indexOf('--force');
const forceTargets = forceIdx !== -1 ? argv.slice(forceIdx + 1).filter((a) => !a.startsWith('--')) : [];

const LIST_ONLY = flags.has('--list');

// ── Discover migration files ─────────────────────────────────────────────────────
/** All NNN_*.sql migrations, sorted by their numeric prefix. */
function discover() {
  return fs
    .readdirSync(__dirname)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .map((f) => ({ version: f.slice(0, 3), file: f }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/** Match a user token ("038" or "038_stitchd_tailor_profile.sql") to a migration. */
function matches(token, m) {
  return m.version === token || m.file === token || m.file === `${token}.sql`;
}

const pool = new pg.Pool({
  host: process.env.SUPERBASE_POOL_HOST,
  port: parseInt(process.env.SUPERBASE_POOL_PORT, 10) || 5432,
  database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
  user: process.env.SUPERBASE_POOL_USER,
  password: process.env.SUPERBASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function ensureTrackingTable(client) {
  // Matches the repo's existing public.schema_migrations (filename-keyed). CREATE IF NOT
  // EXISTS is a no-op when it already exists, preserving the historical rows.
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(client) {
  const { rows } = await client.query('SELECT filename FROM public.schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function record(client, file) {
  // No ON CONFLICT — the legacy table may lack a usable unique constraint; check-then-insert.
  const exists = await client.query('SELECT 1 FROM public.schema_migrations WHERE filename = $1', [file]);
  if (!exists.rowCount) {
    await client.query('INSERT INTO public.schema_migrations (filename, applied_at) VALUES ($1, now())', [file]);
  }
}

/** Run one migration file. Transactional unless the SQL needs to run outside one. */
async function runOne(client, m) {
  const sql = fs.readFileSync(path.join(__dirname, m.file), 'utf8');
  const transactional = !/\bCONCURRENTLY\b/i.test(sql);

  if (transactional) await client.query('BEGIN');
  try {
    await client.query(sql);
    await record(client, m.file);
    if (transactional) await client.query('COMMIT');
  } catch (err) {
    if (transactional) await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

(async () => {
  const client = await pool.connect();
  let failed = false;
  try {
    await ensureTrackingTable(client);
    const all = discover();
    const applied = await appliedFilenames(client);

    // ── --baseline N : record 001..N as applied, run nothing ──────────────────
    if (baselineTo) {
      const toMark = all.filter((m) => m.version <= baselineTo && !applied.has(m.file));
      for (const m of toMark) await record(client, m.file);
      console.log(`✅  Baselined ${toMark.length} migration(s) up to ${baselineTo} (recorded, not executed).`);
      if (toMark.length) console.log('   ' + toMark.map((m) => m.version).join(', '));
      return;
    }

    // ── --list : show status, run nothing ─────────────────────────────────────
    if (LIST_ONLY) {
      console.log('Migration status:\n');
      for (const m of all) console.log(`  ${applied.has(m.file) ? '✔ applied ' : '· pending '} ${m.file}`);
      return;
    }

    // ── Decide what to run ─────────────────────────────────────────────────────
    let toRun;
    if (forceTargets.length) {
      toRun = all.filter((m) => forceTargets.some((t) => matches(t, m)));
    } else if (positional.length) {
      toRun = all.filter((m) => positional.some((t) => matches(t, m)) && !applied.has(m.file));
      all
        .filter((m) => positional.some((t) => matches(t, m)) && applied.has(m.file))
        .forEach((m) => console.log(`↷  Skipping ${m.file} — already applied.`));
    } else {
      toRun = all.filter((m) => !applied.has(m.file));
    }

    if (!toRun.length) {
      console.log('✅  Nothing to run — all targeted migrations are already applied.');
      return;
    }

    console.log(`Running ${toRun.length} migration(s): ${toRun.map((m) => m.version).join(', ')}\n`);
    for (const m of toRun) {
      process.stdout.write(`→  ${m.file} … `);
      try {
        await runOne(client, m);
        console.log('done');
      } catch (err) {
        console.log('FAILED');
        console.error(`❌  ${m.file}: ${err.message}`);
        failed = true;
        break; // stop at first failure — don't apply later migrations on a broken state
      }
    }

    if (!failed) console.log('\n✅  All migrations applied.');
  } catch (err) {
    console.error('❌  Migration runner error:', err.message);
    failed = true;
  } finally {
    client.release();
    await pool.end();
    if (failed) process.exitCode = 1;
  }
})();
