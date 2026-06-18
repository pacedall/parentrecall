// Applies db/schema.sql. Safe to run repeatedly (CREATE TABLE IF NOT EXISTS).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await db.query(sql);
  // Upgrade path for databases created before email verification existed.
  // Harmless on fresh databases (column already present) and on engines
  // that don't support IF NOT EXISTS (error is swallowed).
  try {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false');
  } catch (e) {
    // ignore — column already exists or engine lacks ADD COLUMN IF NOT EXISTS
  }
  console.log('✓ Schema applied');
}

module.exports = { migrate };

// Allow running directly: `npm run migrate`
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
