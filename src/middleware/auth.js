const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set.');
  process.exit(1);
}

// Maximum number of devices signed in at once, per user.
const MAX_DEVICES = 2;

function sign(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '60d' });
}

// Create a tracked session (one per device) and return a token bound to it.
// Keeps only the newest MAX_DEVICES sessions per user; older ones are evicted
// (those devices are signed out on their next request).
async function issueSession(userId, req) {
  const jti = crypto.randomBytes(16).toString('hex');
  const ua = (((req && req.headers && req.headers['user-agent']) || '') + '').slice(0, 200);
  await db.query('INSERT INTO sessions (user_id, jti, user_agent) VALUES ($1, $2, $3)', [userId, jti, ua]);
  await db.query(
    'DELETE FROM sessions WHERE user_id = $1 AND id NOT IN (' +
    'SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2)',
    [userId, MAX_DEVICES]
  );
  return jwt.sign({ uid: userId, jti: jti }, JWT_SECRET, { expiresIn: '60d' });
}

// Requires a valid Bearer token; sets req.userId (and req.jti). When the token
// carries a session id, that session must still exist (device-limit enforcement).
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
  req.userId = payload.uid;
  req.jti = payload.jti || null;
  if (payload.jti) {
    try {
      const { rows } = await db.query('SELECT 1 FROM sessions WHERE jti = $1 AND user_id = $2', [payload.jti, payload.uid]);
      if (!rows[0]) return res.status(401).json({ error: 'Signed out on this device.', code: 'SESSION_REVOKED' });
    } catch (e) {
      console.error('session check error', e.message); // don't hard-fail auth if the check errors
    }
  }
  next();
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

module.exports = { sign, issueSession, requireAuth, requireVerified, loadHousehold, requireAdmin, JWT_SECRET };
