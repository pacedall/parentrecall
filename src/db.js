const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Railway's PRIVATE network (*.railway.internal) does NOT support SSL — forcing it breaks every query.
// Public/proxy hosts and other managed Postgres providers DO require SSL.
const _dbUrl = process.env.DATABASE_URL || '';
const _internal = /\.railway\.internal/i.test(_dbUrl);
const useSSL = process.env.PGSSL === 'true'
  || (!_internal && /rlwy\.net|\.proxy\.|amazonaws|render|supabase|heroku|\.railway\.app/i.test(_dbUrl));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
