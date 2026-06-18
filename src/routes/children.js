const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireVerified);

// GET /api/children  -> list with club counts
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id, c.name, COUNT(cl.id)::int AS club_count
     FROM children c
     LEFT JOIN clubs cl ON cl.child_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id, c.name, c.created_at
     ORDER BY c.created_at ASC, c.id ASC`,
    [req.userId]
  );
  res.json(rows);
});

// POST /api/children { name }
router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A name is needed.' });
  const { rows } = await db.query(
    'INSERT INTO children (user_id, name) VALUES ($1, $2) RETURNING id, name',
    [req.userId, name]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/children/:id { name }
router.put('/:id', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A name is needed.' });
  const { rows } = await db.query(
    'UPDATE children SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name',
    [name, req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  res.json(rows[0]);
});

// DELETE /api/children/:id  (cascades to clubs + people)
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM children WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (!rowCount) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
