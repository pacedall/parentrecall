const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified, loadHousehold, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireVerified);
router.use(loadHousehold);

// GET /api/children  -> household's children with club counts (both roles)
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.is_demo, COUNT(cl.id)::int AS club_count
     FROM children c
     LEFT JOIN clubs cl ON cl.child_id = c.id
     WHERE c.household_id = $1
     GROUP BY c.id, c.name, c.is_demo, c.created_at
     ORDER BY c.created_at ASC, c.id ASC`,
    [req.householdId]
  );
  res.json(rows);
});

// Children are the household's structure: admin-only to add / rename / remove.
router.post('/', requireAdmin, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A name is needed.' });
  const { rows } = await db.query(
    'INSERT INTO children (household_id, user_id, name) VALUES ($1, $2, $3) RETURNING id, name',
    [req.householdId, req.userId, name]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A name is needed.' });
  const { rows } = await db.query(
    'UPDATE children SET name = $1 WHERE id = $2 AND household_id = $3 RETURNING id, name',
    [name, req.params.id, req.householdId]
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
