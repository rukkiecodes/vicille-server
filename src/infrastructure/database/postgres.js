import pg from 'pg';
import config from '../../config/index.js';
import logger from '../../core/logger/index.js';

const { Pool } = pg;

let pool = null;

/**
 * Get (or create) the singleton pg connection pool.
 * Uses the Supabase session-mode pooler for compatibility with prepared statements.
 */
export const getPool = () => {
  if (!pool) {
    pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl,
      max: config.database.max,
      idleTimeoutMillis: config.database.idleTimeoutMillis,
      connectionTimeoutMillis: config.database.connectionTimeoutMillis,
    });

    pool.on('error', (err) => {
      logger.error('PostgreSQL pool error:', err);
    });

    pool.on('connect', () => {
      logger.debug('New PostgreSQL client connected to pool');
    });
  }

  return pool;
};

/**
 * Test the database connection.
 */
export const connectPostgres = async () => {
  const p = getPool();
  const client = await p.connect();
  try {
    const result = await client.query('SELECT NOW() AS now');
    logger.info(`✅ PostgreSQL connected — server time: ${result.rows[0].now}`);
  } finally {
    client.release();
  }
  return p;
};

/**
 * Graceful shutdown — drain the pool.
 */
export const disconnectPostgres = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
};

/**
 * Convenience: run a query on the pool.
 * Usage: query('SELECT * FROM users WHERE id = $1', [id])
 */
export const query = (text, params) => {
  return getPool().query(text, params);
};

/**
 * Convenience: get a client for transactions.
 * Remember to release() the client when done.
 */
export const getClient = () => {
  return getPool().connect();
};

export default getPool;
