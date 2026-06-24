const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sendMail } = require('../mailer');

const router = express.Router();

// modest limit to deter abuse of the public endpoint
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

const KIND_OK = ['feedback', 'suggestion', 'bug', 'abuse'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// best-effort: identify the user if a valid token is present, else treat as anonymous
function optionalUser(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return null;
  try { return jwt.verify(t, process.env.JWT_SECRET).uid; } catch (e) { return null; }
}

// POST /api/feedback  { message, kind?, email? }  — works signed-in or anonymously
router.post('/', limiter, async (req, res) => {
  const message = String(req.body.message || '').trim();
  const kind = KIND_OK.indexOf(req.body.kind) >= 0 ? req.body.kind : 'feedback';
  let email = String(req.body.email || '').trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) email = '';
  if (message.length < 2) return res.status(400).json({ error: 'Please add a little more detail.' });
  if (message.length > 4000) return res.status(400).json({ error: 'That\u2019s a bit long \u2014 please shorten it.' });

  const uid = optionalUser(req);
  if (uid && !email) {
    try { const u = await db.query('SELECT email FROM users WHERE id = $1', [uid]); if (u.rows[0]) email = u.rows[0].email; } catch (e) {}
  }
  try {
    await db.query('INSERT INTO feedback (user_id, email, kind, message) VALUES ($1, $2, $3, $4)', [uid, email || null, kind, message.slice(0, 4000)]);
    sendMail({
      to: process.env.FEEDBACK_TO || 'team@parentrecall.com',
      subject: (kind === 'abuse' ? '\u26A0 ParentRecall ABUSE REPORT' : 'ParentRecall ' + kind) + (email ? ' from ' + email : ' (anonymous)'),
      text: message + '\n\n— ' + (email || 'anonymous') + (uid ? ' (user #' + uid + ')' : ''),
    }).catch(function () {});
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('feedback error', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
