const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireVerified);

const FIELDS = ['name', 'role', 'parents', 'hooks', 'birthday'];

// GET /api/people?clubId=123
router.get('/', async (req, res) => {
  const clubId = parseInt(req.query.clubId, 10);
  if (!clubId) return res.status(400).json({ error: 'clubId is required.' });

  const owns = await db.query('SELECT 1 FROM clubs WHERE id = $1 AND user_id = $2', [clubId, req.userId]);
  if (!owns.rows[0]) return res.status(404).json({ error: 'Club not found.' });

  const { rows } = await db.query(
    `SELECT id, club_id, name, role, parents, hooks, birthday
     FROM people
     WHERE user_id = $1 AND club_id = $2
     ORDER BY created_at ASC, id ASC`,
    [req.userId, clubId]
  );
  res.json(rows);
});

// POST /api/people/bulk { clubId, names: [ ... ] }  — paste a class list
router.post('/bulk', async (req, res) => {
  const clubId = parseInt(req.body.clubId, 10);
  let names = Array.isArray(req.body.names) ? req.body.names : [];
  if (!clubId) return res.status(400).json({ error: 'clubId is required.' });

  // clean: trim, drop blanks, cap length, de-dupe (case-insensitive), limit count
  const seen = {};
  names = names
    .map(function (n) { return (typeof n === 'string' ? n : '').trim().slice(0, 120); })
    .filter(function (n) {
      if (!n) return false;
      const k = n.toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    })
    .slice(0, 200);

  if (!names.length) return res.status(400).json({ error: 'No names found to add.' });

  const owns = await db.query('SELECT 1 FROM clubs WHERE id = $1 AND user_id = $2', [clubId, req.userId]);
  if (!owns.rows[0]) return res.status(404).json({ error: 'Club not found.' });

  // one multi-row insert
  const values = [];
  const params = [];
  let i = 1;
  names.forEach(function (n) {
    values.push('($' + (i++) + ', $' + (i++) + ', $' + (i++) + ')');
    params.push(req.userId, clubId, n);
  });
  const { rows } = await db.query(
    'INSERT INTO people (user_id, club_id, name) VALUES ' + values.join(', ') +
    ' RETURNING id, club_id, name, role, parents, hooks, birthday',
    params
  );
  res.status(201).json({ added: rows.length, people: rows });
});

// POST /api/people/import { clubId, people: [ {name, role?, parents?, hooks?, birthday?} ] }
// For spreadsheet imports. Skips blank names, de-dupes within the payload,
// and skips names already present in the club.
router.post('/import', async (req, res) => {
  const clubId = parseInt(req.body.clubId, 10);
  let incoming = Array.isArray(req.body.people) ? req.body.people : [];
  if (!clubId) return res.status(400).json({ error: 'clubId is required.' });

  const owns = await db.query('SELECT 1 FROM clubs WHERE id = $1 AND user_id = $2', [clubId, req.userId]);
  if (!owns.rows[0]) return res.status(404).json({ error: 'Club not found.' });

  // names already in this club (so a re-import doesn't duplicate)
  const existingRows = await db.query('SELECT name FROM people WHERE club_id = $1', [clubId]);
  const taken = {};
  existingRows.rows.forEach(function (r) { taken[String(r.name).trim().toLowerCase()] = true; });

  const seen = {};
  const clean = [];
  incoming.forEach(function (p) {
    const name = (p && typeof p.name === 'string' ? p.name : '').trim().slice(0, 120);
    if (!name) return;
    const k = name.toLowerCase();
    if (seen[k] || taken[k]) return;
    seen[k] = true;
    clean.push({
      name: name,
      role: String(p.role || '').trim().slice(0, 300),
      parents: String(p.parents || '').trim().slice(0, 300),
      hooks: String(p.hooks || '').trim().slice(0, 2000),
      birthday: String(p.birthday || '').trim().slice(0, 60),
    });
  });
  if (!clean.length) return res.json({ added: 0, people: [] });
  if (clean.length > 500) clean.length = 500;

  const values = [];
  const params = [];
  let i = 1;
  clean.forEach(function (p) {
    values.push('($' + (i++) + ',$' + (i++) + ',$' + (i++) + ',$' + (i++) + ',$' + (i++) + ',$' + (i++) + ',$' + (i++) + ')');
    params.push(req.userId, clubId, p.name, p.role, p.parents, p.hooks, p.birthday);
  });
  const { rows } = await db.query(
    'INSERT INTO people (user_id, club_id, name, role, parents, hooks, birthday) VALUES ' + values.join(', ') +
    ' RETURNING id, club_id, name, role, parents, hooks, birthday',
    params
  );
  res.status(201).json({ added: rows.length, people: rows });
});

// POST /api/people { clubId, name, role?, parents?, hooks?, birthday? }
router.post('/', async (req, res) => {
  const clubId = parseInt(req.body.clubId, 10);
  const name = (req.body.name || '').trim();
  if (!clubId) return res.status(400).json({ error: 'clubId is required.' });
  if (!name) return res.status(400).json({ error: 'A name is needed.' });

  const owns = await db.query('SELECT 1 FROM clubs WHERE id = $1 AND user_id = $2', [clubId, req.userId]);
  if (!owns.rows[0]) return res.status(404).json({ error: 'Club not found.' });

  const v = {
    name,
    role: (req.body.role || '').trim(),
    parents: (req.body.parents || '').trim(),
    hooks: (req.body.hooks || '').trim(),
    birthday: (req.body.birthday || '').trim(),
  };

  const { rows } = await db.query(
    `INSERT INTO people (user_id, club_id, name, role, parents, hooks, birthday)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, club_id, name, role, parents, hooks, birthday`,
    [req.userId, clubId, v.name, v.role, v.parents, v.hooks, v.birthday]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/people/:id
router.put('/:id', async (req, res) => {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of FIELDS) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(String(req.body[key]).trim());
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id, req.userId);
  const { rows } = await db.query(
    `UPDATE people SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i}
     RETURNING id, club_id, name, role, parents, hooks, birthday`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  res.json(rows[0]);
});

// DELETE /api/people/:id
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM people WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rowCount) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
