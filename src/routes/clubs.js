const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified, loadHousehold, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireVerified);
router.use(loadHousehold);

const COLORS = ['blue', 'teal', 'navy', 'amber', 'red', 'orange'];

// GET /api/clubs?childId=  -> clubs for a child, with people counts (both roles)
router.get('/', async (req, res) => {
  const childId = parseInt(req.query.childId, 10);
  if (!childId) return res.status(400).json({ error: 'childId is required.' });

  const owns = await db.query('SELECT 1 FROM children WHERE id = $1 AND household_id = $2', [childId, req.householdId]);
  if (!owns.rows[0]) return res.status(404).json({ error: 'Child not found.' });

  const { rows } = await db.query(
    `SELECT cl.id, cl.child_id, cl.name, cl.sub, cl.color, COUNT(p.id)::int AS people_count
     FROM clubs cl
     LEFT JOIN people p ON p.club_id = cl.id
     WHERE cl.household_id = $1 AND cl.child_id = $2
     GROUP BY cl.id, cl.child_id, cl.name, cl.sub, cl.color, cl.created_at, cl.sort_order
     ORDER BY cl.sort_order ASC NULLS LAST, cl.created_at ASC, cl.id ASC`,
    [req.householdId, childId]
  );
  res.json(rows);
});

// Add a club (both roles)
router.post('/', async (req, res) => {
  const childId = parseInt(req.body.childId, 10);
  const name = (req.body.name || '').trim();
  const sub = (req.body.sub || '').trim();
  let color = (req.body.color || '').trim();
  if (!childId) return res.status(400).json({ error: 'childId is required.' });
  if (!name) return res.status(400).json({ error: 'A name is needed.' });

  const owns = await db.query('SELECT 1 FROM children WHERE id = $1 AND household_id = $2', [childId, req.householdId]);
  if (!owns.rows[0]) return res.status(404).json({ error: 'Child not found.' });

  if (!COLORS.includes(color)) {
    const { rows: cnt } = await db.query('SELECT COUNT(*)::int AS n FROM clubs WHERE child_id = $1', [childId]);
    color = COLORS[cnt[0].n % COLORS.length];
  }

  const { rows } = await db.query(
    `INSERT INTO clubs (household_id, user_id, child_id, name, sub, color, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM clubs WHERE child_id = $3))
     RETURNING id, child_id, name, sub, color`,
    [req.householdId, req.userId, childId, name, sub, color]
  );
  res.status(201).json({ ...rows[0], people_count: 0 });
});

// Reorder a child's clubs (both roles). Body: { childId, order: [id, id, ...] }.
router.post('/reorder', async (req, res) => {
  const childId = parseInt(req.body.childId, 10);
  const order = Array.isArray(req.body.order) ? req.body.order : [];
  if (!childId) return res.status(400).json({ error: 'childId is required.' });
  if (!order.length) return res.status(400).json({ error: 'An order is required.' });

  const owns = await db.query('SELECT 1 FROM children WHERE id = $1 AND household_id = $2', [childId, req.householdId]);
  if (!owns.rows[0]) return res.status(404).json({ error: 'Child not found.' });

  const { rows } = await db.query('SELECT id FROM clubs WHERE child_id = $1 AND household_id = $2', [childId, req.householdId]);
  const owned = new Set(rows.map(function (r) { return r.id; }));
  const ids = order.map(function (n) { return parseInt(n, 10); }).filter(function (n) { return owned.has(n); });
  if (!ids.length) return res.status(400).json({ error: 'No valid clubs to reorder.' });
  for (let i = 0; i < ids.length; i++) {
    await db.query('UPDATE clubs SET sort_order = $1 WHERE id = $2 AND household_id = $3', [i + 1, ids[i], req.householdId]);
  }
  res.json({ ok: true });
});

// Edit a club (both roles)
router.put('/:id', async (req, res) => {
  const fields = [];
  const vals = [];
  let i = 1;
  for (const key of ['name', 'sub', 'color']) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      vals.push(String(req.body[key]).trim());
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id, req.householdId);
  const { rows } = await db.query(
    `UPDATE clubs SET ${fields.join(', ')} WHERE id = $${i++} AND household_id = $${i} RETURNING id, child_id, name, sub, color`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  res.json(rows[0]);
});

// Deleting a club removes lots of shared data: admin-only.
router.delete('/:id', requireAdmin, async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM clubs WHERE id = $1 AND household_id = $2', [req.params.id, req.householdId]);
  if (!rowCount) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
