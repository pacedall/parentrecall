const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified, loadHousehold } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireVerified);
router.use(loadHousehold);

const FIELDS = ['name', 'role', 'parents', 'hooks', 'birthday'];

const HAIR_OK = ['none', 'short', 'curly', 'long', 'bun', 'afro', 'hijab'];
const GLASSES_OK = ['none', 'round', 'square'];
const ACC_OK = ['none', 'hearingaid'];
const HEX = /^#[0-9A-Fa-f]{6}$/;

function sanitizeAvatar(val) {
  if (!val) return '';
  let obj;
  try { obj = typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return ''; }
  if (!obj || typeof obj !== 'object') return '';
  const out = {};
  if (typeof obj.skin === 'string' && HEX.test(obj.skin)) out.skin = obj.skin;
  if (typeof obj.hairColor === 'string' && HEX.test(obj.hairColor)) out.hairColor = obj.hairColor;
  if (HAIR_OK.indexOf(obj.hair) >= 0) out.hair = obj.hair;
  if (GLASSES_OK.indexOf(obj.glasses) >= 0) out.glasses = obj.glasses;
  if (ACC_OK.indexOf(obj.acc) >= 0) out.acc = obj.acc;
  return Object.keys(out).length ? JSON.stringify(out) : '';
}

// Privacy: keep the first name in full, shorten every following word (surnames)
// to 2 letters. "John Smith" -> "John Sm".
function clampName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').split(' ')
    .map(function (w, i) { return i === 0 ? w : w.slice(0, 2); })
    .join(' ').trim().slice(0, 120);
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseBirthday(t) {
  if (!t) return { month: null, day: null };
  const s = String(t).trim().toLowerCase();
  let month = null, day = null;
  const mNum = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
  const mDM = s.match(/(\d{1,2})\s+([a-z]{3,})/);
  const mMD = s.match(/([a-z]{3,})\s+(\d{1,2})/);
  if (mNum) { day = parseInt(mNum[1], 10); month = parseInt(mNum[2], 10); }
  else if (mDM) { day = parseInt(mDM[1], 10); month = MONTHS[mDM[2].slice(0, 3)] || null; }
  else if (mMD) { month = MONTHS[mMD[1].slice(0, 3)] || null; day = parseInt(mMD[2], 10); }
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return { month: null, day: null };
  return { month: month, day: day };
}

// confirm a club belongs to the caller's household
async function ownClub(req, clubId) {
  const r = await db.query('SELECT 1 FROM clubs WHERE id = $1 AND household_id = $2', [clubId, req.householdId]);
  return !!r.rows[0];
}

// GET /api/people/search?q=...  — across the whole household
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 1) return res.json([]);
  const like = '%' + q.replace(/[%_]/g, '') + '%';
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.role, p.parents, p.hooks, p.avatar,
            p.club_id, cl.name AS club_name, cl.color AS club_color,
            cl.child_id, ch.name AS child_name
     FROM people p
     JOIN clubs cl ON cl.id = p.club_id
     JOIN children ch ON ch.id = cl.child_id
     WHERE p.household_id = $1
       AND (p.name ILIKE $2 OR p.role ILIKE $2 OR p.parents ILIKE $2 OR p.hooks ILIKE $2)
     ORDER BY p.name ASC
     LIMIT 50`,
    [req.householdId, like]
  );
  res.json(rows);
});

// GET /api/people?clubId=
router.get('/', async (req, res) => {
  const clubId = parseInt(req.query.clubId, 10);
  if (!clubId) return res.status(400).json({ error: 'clubId is required.' });
  if (!(await ownClub(req, clubId))) return res.status(404).json({ error: 'Club not found.' });
  const { rows } = await db.query(
    `SELECT id, club_id, name, role, parents, hooks, birthday, avatar
     FROM people WHERE household_id = $1 AND club_id = $2
     ORDER BY created_at ASC, id ASC`,
    [req.householdId, clubId]
  );
  res.json(rows);
});

// POST /api/people/bulk { clubId, names: [...] }
router.post('/bulk', async (req, res) => {
  const clubId = parseInt(req.body.clubId, 10);
  let names = Array.isArray(req.body.names) ? req.body.names : [];
  if (!clubId) return res.status(400).json({ error: 'clubId is required.' });
  const seen = {};
  names = names.map(function (n) { return clampName(typeof n === 'string' ? n : ''); })
    .filter(function (n) { if (!n) return false; const k = n.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true; })
    .slice(0, 200);
  if (!names.length) return res.status(400).json({ error: 'No names found to add.' });
  if (!(await ownClub(req, clubId))) return res.status(404).json({ error: 'Club not found.' });

  const values = [];
  const params = [];
  let i = 1;
  names.forEach(function (n) {
    values.push('($' + (i++) + ',$' + (i++) + ',$' + (i++) + ',$' + (i++) + ')');
    params.push(req.householdId, req.userId, clubId, n);
  });
  const { rows } = await db.query(
    'INSERT INTO people (household_id, user_id, club_id, name) VALUES ' + values.join(', ') +
    ' RETURNING id, club_id, name, role, parents, hooks, birthday, avatar',
    params
  );
  res.status(201).json({ added: rows.length, people: rows });
});

// POST /api/people/import { clubId, people: [...] }
router.post('/import', async (req, res) => {
  const clubId = parseInt(req.body.clubId, 10);
  let incoming = Array.isArray(req.body.people) ? req.body.people : [];
  if (!clubId) return res.status(400).json({ error: 'clubId is required.' });
  if (!(await ownClub(req, clubId))) return res.status(404).json({ error: 'Club not found.' });

  const existingRows = await db.query('SELECT name FROM people WHERE club_id = $1', [clubId]);
  const taken = {};
  existingRows.rows.forEach(function (r) { taken[String(r.name).trim().toLowerCase()] = true; });

  const seen = {};
  const clean = [];
  incoming.forEach(function (p) {
    const name = clampName(p && typeof p.name === 'string' ? p.name : '');
    if (!name) return;
    const k = name.toLowerCase();
    if (seen[k] || taken[k]) return;
    seen[k] = true;
    const birthday = String(p.birthday || '').trim().slice(0, 60);
    const bd = parseBirthday(birthday);
    clean.push({
      name: name,
      role: String(p.role || '').trim().slice(0, 300),
      parents: String(p.parents || '').trim().slice(0, 300),
      hooks: String(p.hooks || '').trim().slice(0, 2000),
      birthday: birthday, bmonth: bd.month, bday: bd.day,
    });
  });
  if (!clean.length) return res.json({ added: 0, people: [] });
  if (clean.length > 500) clean.length = 500;

  const values = [];
  const params = [];
  let i = 1;
  clean.forEach(function (p) {
    const ph = [];
    for (let n = 0; n < 10; n++) ph.push('$' + (i++));
    values.push('(' + ph.join(',') + ')');
    params.push(req.householdId, req.userId, clubId, p.name, p.role, p.parents, p.hooks, p.birthday, p.bmonth, p.bday);
  });
  const { rows } = await db.query(
    'INSERT INTO people (household_id, user_id, club_id, name, role, parents, hooks, birthday, birthday_month, birthday_day) VALUES ' +
    values.join(', ') + ' RETURNING id, club_id, name, role, parents, hooks, birthday, avatar',
    params
  );
  res.status(201).json({ added: rows.length, people: rows });
});

// POST /api/people  (both roles)
router.post('/', async (req, res) => {
  const clubId = parseInt(req.body.clubId, 10);
  const name = clampName(req.body.name || '');
  if (!clubId) return res.status(400).json({ error: 'clubId is required.' });
  if (!name) return res.status(400).json({ error: 'A name is needed.' });
  if (!(await ownClub(req, clubId))) return res.status(404).json({ error: 'Club not found.' });

  const birthday = (req.body.birthday || '').trim();
  const bd = parseBirthday(birthday);
  const v = {
    name,
    role: (req.body.role || '').trim(),
    parents: (req.body.parents || '').trim(),
    hooks: (req.body.hooks || '').trim(),
    birthday: birthday,
    avatar: sanitizeAvatar(req.body.avatar),
  };
  const { rows } = await db.query(
    `INSERT INTO people (household_id, user_id, club_id, name, role, parents, hooks, birthday, birthday_month, birthday_day, avatar)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, club_id, name, role, parents, hooks, birthday, avatar`,
    [req.householdId, req.userId, clubId, v.name, v.role, v.parents, v.hooks, v.birthday, bd.month, bd.day, v.avatar]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/people/:id  (both roles)
router.put('/:id', async (req, res) => {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of FIELDS) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(key === 'name' ? clampName(req.body[key]) : String(req.body[key]).trim());
    }
  }
  if (req.body.birthday !== undefined) {
    const bd = parseBirthday(String(req.body.birthday).trim());
    sets.push(`birthday_month = $${i++}`); vals.push(bd.month);
    sets.push(`birthday_day = $${i++}`); vals.push(bd.day);
  }
  if (req.body.avatar !== undefined) {
    sets.push(`avatar = $${i++}`);
    vals.push(sanitizeAvatar(req.body.avatar));
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id, req.householdId);
  const { rows } = await db.query(
    `UPDATE people SET ${sets.join(', ')} WHERE id = $${i++} AND household_id = $${i}
     RETURNING id, club_id, name, role, parents, hooks, birthday, avatar`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  res.json(rows[0]);
});

// DELETE /api/people/:id  (both roles)
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM people WHERE id = $1 AND household_id = $2', [req.params.id, req.householdId]);
  if (!rowCount) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
