/**
 * Export PostgreSQL database state to a Markdown file.
 *
 * Usage (run from backend/server):
 *   node scripts/export-db-state.js
 *
 * Optional:
 *   DB_DUMP_SCHEMA=public node scripts/export-db-state.js
 *   DB_DUMP_OUTPUT=docs/db-state.md node scripts/export-db-state.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(projectRoot, '.env') });

const schemaName = process.env.DB_DUMP_SCHEMA || 'public';
const outputFile = process.env.DB_DUMP_OUTPUT || path.join(projectRoot, 'database-state.md');

const pool = new Pool({
  host: process.env.SUPERBASE_POOL_HOST,
  port: parseInt(process.env.SUPERBASE_POOL_PORT, 10) || 5432,
  database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
  user: process.env.SUPERBASE_POOL_USER,
  password: process.env.SUPERBASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

function mdEscape(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br/>');
}

function stringifyCell(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `<Buffer ${value.toString('hex').slice(0, 80)}...>`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Unserializable Object]';
    }
  }
  return String(value);
}

async function getTables(client, schema) {
  const { rows } = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC;
    `,
    [schema]
  );
  return rows.map((r) => r.table_name);
}

async function getColumns(client, schema, table) {
  const { rows } = await client.query(
    `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position ASC;
    `,
    [schema, table]
  );
  return rows;
}

async function getTableData(client, schema, table) {
  const safeSchema = `"${schema.replace(/"/g, '""')}"`;
  const safeTable = `"${table.replace(/"/g, '""')}"`;

  const countResult = await client.query(`SELECT COUNT(*)::bigint AS total FROM ${safeSchema}.${safeTable}`);
  const totalRows = Number(countResult.rows[0]?.total || 0);

  const dataResult = await client.query(`SELECT * FROM ${safeSchema}.${safeTable}`);
  return { totalRows, rows: dataResult.rows };
}

function renderColumnsTable(columns) {
  const header = '| # | Column | Type | Nullable | Default |';
  const divider = '|---:|---|---|---|---|';
  const rows = columns.map((col) => {
    const defaultVal = col.column_default == null ? '' : mdEscape(col.column_default);
    return `| ${col.ordinal_position} | ${mdEscape(col.column_name)} | ${mdEscape(col.data_type)} | ${col.is_nullable} | ${defaultVal} |`;
  });
  return [header, divider, ...rows].join('\n');
}

function renderDataTable(rows, columns) {
  if (!rows.length) {
    return '_No rows found._';
  }

  const colNames = columns.map((c) => c.column_name);
  const header = `| # | ${colNames.map((c) => mdEscape(c)).join(' | ')} |`;
  const divider = `|---:|${colNames.map(() => '---').join('|')}|`;

  const body = rows.map((row, idx) => {
    const cells = colNames.map((col) => mdEscape(stringifyCell(row[col])));
    return `| ${idx + 1} | ${cells.join(' | ')} |`;
  });

  return [header, divider, ...body].join('\n');
}

async function buildMarkdown() {
  const client = await pool.connect();
  try {
    const now = new Date().toISOString();
    const dbName = process.env.SUPERBASE_POOL_DATABASE || 'postgres';

    const lines = [];
    lines.push('# Database State Export');
    lines.push('');
    lines.push(`- Generated at: ${now}`);
    lines.push(`- Schema: ${schemaName}`);
    lines.push(`- Database: ${dbName}`);
    lines.push('');

    const tables = await getTables(client, schemaName);
    lines.push(`## Tables (${tables.length})`);
    lines.push('');

    if (!tables.length) {
      lines.push('_No tables found in this schema._');
      lines.push('');
      return lines.join('\n');
    }

    for (const table of tables) {
      const columns = await getColumns(client, schemaName, table);
      const { totalRows, rows } = await getTableData(client, schemaName, table);

      lines.push(`### ${table}`);
      lines.push('');
      lines.push(`- Rows: ${totalRows}`);
      lines.push(`- Columns: ${columns.length}`);
      lines.push('');

      lines.push('#### Columns');
      lines.push('');
      lines.push(renderColumnsTable(columns));
      lines.push('');

      lines.push('#### Data');
      lines.push('');
      lines.push(renderDataTable(rows, columns));
      lines.push('');
    }

    return lines.join('\n');
  } finally {
    client.release();
  }
}

(async () => {
  try {
    const markdown = await buildMarkdown();

    const outDir = path.dirname(outputFile);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, markdown, 'utf8');
    console.log(`Database state exported to ${outputFile}`);
  } catch (error) {
    console.error('Failed to export database state:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
