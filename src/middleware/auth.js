const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set.');
  process.exit(1);
}

function sign(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '60d' });
}

// Requires a valid Bearer token; sets req.userId.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

// Optional gate. When REQUIRE_VERIFIED_EMAIL=true, blocks data routes until verified.
async function requireVerified(req, res, next) {
  if (process.env.REQUIRE_VERIFIED_EMAIL !== 'true') return next();
  try {
    const { rows } = await db.query('SELECT email_verified FROM users WHERE id = $1', [req.userId]);
    if (rows[0] && rows[0].email_verified) return next();
    return res.status(403).json({ error: 'Please verify your email to continue.', code: 'EMAIL_UNVERIFIED' });
  } catch (err) {
    console.error('requireVerified error', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}

// Resolve the caller's household + role. Sets req.householdId and req.role.
// Runs after requireAuth on all data routes.
async function loadHousehold(req, res, next) {
  try {
    const { rows } = await db.query('SELECT household_id, role FROM household_members WHERE user_id = $1', [req.userId]);
    if (!rows[0]) return res.status(403).json({ error: 'Your account isn\u2019t set up yet. Try signing in again.' });
    req.householdId = rows[0].household_id;
    req.role = rows[0].role;
    next();
  } catch (err) {
    console.error('loadHousehold error', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}

// Admin-only guard. Must run after loadHousehold.
function requireAdmin(req, res, next) {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Only the account admin can do this.', code: 'ADMIN_ONLY' });
  next();
}

module.exports = { sign, requireAuth, requireVerified, loadHousehold, requireAdmin, JWT_SECRET };
