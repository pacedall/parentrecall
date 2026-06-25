const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// Returns: true (valid key), false (wrong key), or null (no ADMIN_KEY set = disabled)
function keyOk(req) {
  const expected = process.env.ADMIN_KEY || '';
  if (!expected) return null;
  const given = String(req.get('x-admin-key') || req.query.key || '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

router.get('/stats', async (req, res) => {
  const ok = keyOk(req);
  if (ok === null) return res.status(503).json({ error: 'Admin dashboard is disabled. Set an ADMIN_KEY environment variable to enable it.' });
  if (!ok) return res.status(401).json({ error: 'Invalid admin key.' });

  async function rows(sql, params) {
    try { const r = await db.query(sql, params || []); return r.rows; } catch (e) { return null; }
  }
  async function count(sql) {
    const r = await rows(sql);
    return r && r[0] ? Number(r[0].n) : null;
  }

  const stats = {};
  stats.totalUsers = await count('SELECT count(*) n FROM users');
  stats.verifiedUsers = await count('SELECT count(*) n FROM users WHERE email_verified');
  stats.last24h = await count("SELECT count(*) n FROM users WHERE created_at > now() - interval '1 day'");
  stats.last7d = await count("SELECT count(*) n FROM users WHERE created_at > now() - interval '7 days'");
  stats.last30d = await count("SELECT count(*) n FROM users WHERE created_at > now() - interval '30 days'");

  // engagement signals
  stats.households = await count('SELECT count(*) n FROM households');
  stats.children = await count('SELECT count(*) n FROM children');
  stats.clubs = await count('SELECT count(*) n FROM clubs');
  stats.people = await count('SELECT count(*) n FROM people');

  // signups per day, last 14 days
  const daily = await rows(
    "SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') d, count(*) n " +
    "FROM users WHERE created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1"
  );
  stats.daily = (daily || []).map(function (r) { return { d: r.d, n: Number(r.n) }; });

  // most recent signups
  const recent = await rows('SELECT email, email_verified, created_at FROM users ORDER BY created_at DESC LIMIT 50');
  stats.recent = (recent || []).map(function (r) {
    return { email: r.email, verified: !!r.email_verified, created_at: r.created_at };
  });

  stats.generatedAt = new Date().toISOString();
  res.json(stats);
});

module.exports = router;
