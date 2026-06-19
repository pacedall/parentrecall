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
  try {
    await db.query("ALTER TABLE people ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT ''");
  } catch (e) {
    // ignore
  }
  try {
    await db.query('ALTER TABLE people ADD COLUMN IF NOT EXISTS birthday_month INTEGER');
    await db.query('ALTER TABLE people ADD COLUMN IF NOT EXISTS birthday_day INTEGER');
  } catch (e) {
    // ignore
  }
  try {
    await db.query('ALTER TABLE children ADD COLUMN IF NOT EXISTS household_id INTEGER');
    await db.query('ALTER TABLE clubs ADD COLUMN IF NOT EXISTS household_id INTEGER');
    await db.query('ALTER TABLE people ADD COLUMN IF NOT EXISTS household_id INTEGER');
  } catch (e) {
    // ignore
  }
  try {
    await backfillHouseholds();
  } catch (e) {
    console.error('household backfill skipped:', e.message);
  }
  console.log('✓ Schema applied');
}

// Put every existing user into their own household as admin, and stamp their
// data with that household_id. Idempotent: users already in a household are skipped.
async function backfillHouseholds() {
  let users;
  try { users = (await db.query('SELECT id FROM users')).rows; } catch (e) { return; }
  for (const u of users) {
    let hid;
    const m = await db.query('SELECT household_id FROM household_members WHERE user_id = $1', [u.id]);
    if (m.rows[0]) {
      hid = m.rows[0].household_id;
    } else {
      const h = await db.query('INSERT INTO households (created_at) VALUES (now()) RETURNING id');
      hid = h.rows[0].id;
      await db.query('INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, $3)', [hid, u.id, 'admin']);
    }
    await db.query('UPDATE children SET household_id = $1 WHERE user_id = $2 AND household_id IS NULL', [hid, u.id]);
    await db.query('UPDATE clubs SET household_id = $1 WHERE user_id = $2 AND household_id IS NULL', [hid, u.id]);
    await db.query('UPDATE people SET household_id = $1 WHERE user_id = $2 AND household_id IS NULL', [hid, u.id]);
  }
}

module.exports = { migrate, backfillHouseholds };

// Allow running directly: `npm run migrate`
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
