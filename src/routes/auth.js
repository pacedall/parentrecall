const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sign, requireAuth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../mailer');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in a few minutes.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_TTL_MIN = 60 * 24;   // 24 hours
const RESET_TTL_MIN = 60;         // 1 hour

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, email_verified: !!row.email_verified };
}

function baseUrl(req) {
  const fromEnv = process.env.APP_URL;
  const base = fromEnv && fromEnv.trim() ? fromEnv.trim() : (req.protocol + '://' + req.get('host'));
  return base.replace(/\/+$/, '');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function createToken(userId, kind, ttlMin) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + ttlMin * 60000).toISOString();
  await db.query(
    'INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, kind, hashToken(raw), expires]
  );
  return raw;
}

// Look up a valid, unused, unexpired token and mark it used (single-use).
async function consumeToken(raw, kind) {
  if (!raw) return null;
  const { rows } = await db.query(
    `SELECT id, user_id FROM auth_tokens
     WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
     ORDER BY id DESC LIMIT 1`,
    [hashToken(raw), kind]
  );
  if (!rows[0]) return null;
  await db.query('UPDATE auth_tokens SET used_at = now() WHERE id = $1', [rows[0].id]);
  return rows[0].user_id;
}

async function issueVerification(req, userId, email) {
  try {
    const raw = await createToken(userId, 'verify', VERIFY_TTL_MIN);
    const link = baseUrl(req) + '/api/auth/verify?token=' + raw;
    await sendVerificationEmail(email, link);
  } catch (err) {
    console.error('verification email failed', err.message);
  }
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const name = (req.body.name || '').trim();

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, email_verified',
      [email, hash, name]
    );
    const user = rows[0];
    await issueVerification(req, user.id, user.email);
    return res.status(201).json({ token: sign(user.id), user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
    console.error('register error', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) return res.status(401).json({ error: 'Email or password is incorrect.' });
    return res.json({ token: sign(user.id), user: publicUser(user) });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
});

// GET /api/auth/me  — current user (used to refresh verified status)
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT id, email, name, email_verified FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  res.json({ user: publicUser(rows[0]) });
});

// GET /api/auth/verify?token=...  — clicked from the email; redirects back to the app
router.get('/verify', async (req, res) => {
  try {
    const userId = await consumeToken(req.query.token, 'verify');
    if (!userId) return res.redirect(baseUrl(req) + '/?verified=0');
    await db.query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
    return res.redirect(baseUrl(req) + '/?verified=1');
  } catch (err) {
    console.error('verify error', err);
    return res.redirect(baseUrl(req) + '/?verified=0');
  }
});

// POST /api/auth/resend-verification  (signed in)
router.post('/resend-verification', authLimiter, requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, email, email_verified FROM users WHERE id = $1', [req.userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Not found.' });
    if (user.email_verified) return res.json({ ok: true, already: true });
    await issueVerification(req, user.id, user.email);
    return res.json({ ok: true });
  } catch (err) {
    console.error('resend error', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /api/auth/forgot { email }  — always responds 200 (no account enumeration)
router.post('/forgot', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  try {
    if (EMAIL_RE.test(email)) {
      const { rows } = await db.query('SELECT id, email FROM users WHERE email = $1', [email]);
      const user = rows[0];
      if (user) {
        const raw = await createToken(user.id, 'reset', RESET_TTL_MIN);
        const link = baseUrl(req) + '/?reset=' + raw;
        try { await sendPasswordResetEmail(user.email, link); }
        catch (e) { console.error('reset email failed', e.message); }
      }
    }
  } catch (err) {
    console.error('forgot error', err);
  }
  return res.json({ ok: true });
});

// POST /api/auth/reset { token, password }
router.post('/reset', authLimiter, async (req, res) => {
  const raw = req.body.token || '';
  const password = req.body.password || '';
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const userId = await consumeToken(raw, 'reset');
    if (!userId) return res.status(400).json({ error: 'That reset link is invalid or has expired. Please request a new one.' });
    const hash = await bcrypt.hash(password, 12);
    // Resetting via an emailed link also proves ownership of the address.
    await db.query('UPDATE users SET password_hash = $1, email_verified = true WHERE id = $2', [hash, userId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('reset error', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
});

// GET /api/auth/export  — all of the user's data as JSON (GDPR-friendly)
router.get('/export', requireAuth, async (req, res) => {
  try {
    const u = await db.query('SELECT id, email, name, email_verified, created_at FROM users WHERE id = $1', [req.userId]);
    if (!u.rows[0]) return res.status(404).json({ error: 'Not found.' });
    const children = await db.query('SELECT id, name, created_at FROM children WHERE user_id = $1 ORDER BY id', [req.userId]);
    const clubs = await db.query('SELECT id, child_id, name, sub, color, created_at FROM clubs WHERE user_id = $1 ORDER BY id', [req.userId]);
    const people = await db.query('SELECT id, club_id, name, role, parents, hooks, birthday, created_at FROM people WHERE user_id = $1 ORDER BY id', [req.userId]);
    res.setHeader('Content-Disposition', 'attachment; filename="parentrecall-export.json"');
    res.json({
      exported_at: new Date().toISOString(),
      account: u.rows[0],
      children: children.rows,
      clubs: clubs.rows,
      people: people.rows,
    });
  } catch (err) {
    console.error('export error', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// DELETE /api/auth/account  — permanently delete the account and all its data
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [req.userId]);
    if (!rowCount) return res.status(404).json({ error: 'Not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete account error', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
