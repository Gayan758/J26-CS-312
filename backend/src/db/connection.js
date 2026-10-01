const { Pool } = require("pg");
const logger = require("../utils/logger");

/**
 * PostgreSQL Connection Pool
 * Configured via standard DATABASE_URL. In development/testing without a live Postgres
 * container, the system falls back gracefully to authenticated JSON blockstore.
 */
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let pool = null;

if (databaseUrl) {
  const isProduction = process.env.NODE_ENV === "production";
  const isLocal = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: isProduction && !isLocal
      ? { rejectUnauthorized: true }
      : false,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 20
  });

  pool.on("error", (err) => {
    logger.error({ error: err.message }, "[PostgresPool] Unexpected client error on idle connection");
  });
}

async function query(text, params) {
  if (!pool) {
    throw new Error("[Database] PostgreSQL is not configured. DATABASE_URL is required.");
  }
  return pool.query(text, params);
}

async function healthCheck() {
  if (!pool) {
    return {
      configured: false,
      connected: false,
      message: "PostgreSQL is not configured. Operating in filesystem blockstore mode."
    };
  }

  const start = Date.now();
  try {
    const res = await pool.query("SELECT 1 AS alive, NOW() as server_time;");
    return {
      configured: true,
      connected: true,
      latencyMs: Date.now() - start,
      serverTime: res.rows[0].server_time
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      error: err.message
    };
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  pool,
  isConfigured: () => Boolean(pool),
  query,
  healthCheck,
  close
};
