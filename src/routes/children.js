const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified, loadHousehold, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireVerified);
router.use(loadHousehold);

// GET /api/children  -> household's children with club counts (both roles)
router.get('/', async (req, res) => {
  const includeHidden = req.query.includeHidden === '1' || req.query.includeHidden === 'true';
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.is_demo, c.hidden, COUNT(cl.id)::int AS club_count
     FROM children c
     LEFT JOIN clubs cl ON cl.child_id = c.id AND cl.hidden = false
     WHERE c.household_id = $1 ${includeHidden ? '' : 'AND c.hidden = false'}
     GROUP BY c.id, c.name, c.is_demo, c.hidden, c.created_at, c.sort_order
     ORDER BY c.sort_order ASC NULLS LAST, c.created_at ASC, c.id ASC`,
    [req.householdId]
  );
  res.json(rows);
});

// Children are the household's structure: admin-only to add / rename / remove.
router.post('/', requireAdmin, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A name is needed.' });
  const { rows } = await db.query(
    'INSERT INTO children (household_id, user_id, name, sort_order) ' +
    'VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM children WHERE household_id = $1)) ' +
    'RETURNING id, name',
    [req.householdId, req.userId, name]
  );
  res.status(201).json(rows[0]);
});

// Reorder the household's children (admin only). Body: { order: [id, id, ...] }.
router.post('/reorder', requireAdmin, async (req, res) => {
  const order = Array.isArray(req.body.order) ? req.body.order : [];
  if (!order.length) return res.status(400).json({ error: 'An order is required.' });
  const { rows } = await db.query('SELECT id FROM children WHERE household_id = $1', [req.householdId]);
  const owned = new Set(rows.map(function (r) { return r.id; }));
  const ids = order.map(function (n) { return parseInt(n, 10); }).filter(function (n) { return owned.has(n); });
  if (!ids.length) return res.status(400).json({ error: 'No valid children to reorder.' });
  for (let i = 0; i < ids.length; i++) {
    await db.query('UPDATE children SET sort_order = $1 WHERE id = $2 AND household_id = $3', [i + 1, ids[i], req.householdId]);
  }
  res.json({ ok: true });
});

router.put('/:id', requireAdmin, async (req, res) => {
  // Toggle hidden without requiring a name
  if (req.body.hidden !== undefined && req.body.name === undefined) {
    const { rows: hr } = await db.query(
      'UPDATE children SET hidden = $1 WHERE id = $2 AND household_id = $3 RETURNING id, name, hidden',
      [!!req.body.hidden, req.params.id, req.householdId]
    );
    if (!hr[0]) return res.status(404).json({ error: 'Not found.' });
    return res.json(hr[0]);
  }
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A name is needed.' });
  const { rows } = await db.query(
    'UPDATE children SET name = $1' + (req.body.hidden !== undefined ? ', hidden = $4' : '') +
    ' WHERE id = $2 AND household_id = $3 RETURNING id, name, hidden',
    req.body.hidden !== undefined
      ? [name, req.params.id, req.householdId, !!req.body.hidden]
      : [name, req.params.id, req.householdId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  res.json(rows[0]);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM children WHERE id = $1 AND household_id = $2',
    [req.params.id, req.householdId]
  );
  if (!rowCount) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
