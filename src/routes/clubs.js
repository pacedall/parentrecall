const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireVerified);

const COLORS = ['blue', 'teal', 'navy', 'amber', 'red', 'orange'];

// GET /api/clubs?childId=123  -> clubs for a child, with people counts
router.get('/', async (req, res) => {
  const childId = parseInt(req.query.childId, 10);
  if (!childId) return res.status(400).json({ error: 'childId is required.' });

  // Ownership check on the child.
  const owns = await db.query('SELECT 1 FROM children WHERE id = $1 AND user_id = $2', [childId, req.userId]);
  if (!owns.rows[0]) return res.status(404).json({ error: 'Child not found.' });

  const { rows } = await db.query(
    `SELECT cl.id, cl.child_id, cl.name, cl.sub, cl.color, COUNT(p.id)::int AS people_count
     FROM clubs cl
     LEFT JOIN people p ON p.club_id = cl.id
     WHERE cl.user_id = $1 AND cl.child_id = $2
     GROUP BY cl.id, cl.child_id, cl.name, cl.sub, cl.color, cl.created_at
     ORDER BY cl.created_at ASC, cl.id ASC`,
    [req.userId, childId]
  );
  res.json(rows);
});

// POST /api/clubs { childId, name, sub?, color? }
router.post('/', async (req, res) => {
  const childId = parseInt(req.body.childId, 10);
  const name = (req.body.name || '').trim();
  const sub = (req.body.sub || '').trim();
  let color = (req.body.color || '').trim();
  if (!childId) return res.status(400).json({ error: 'childId is required.' });
  if (!name) return res.status(400).json({ error: 'A name is needed.' });

  const owns = await db.query('SELECT 1 FROM children WHERE id = $1 AND user_id = $2', [childId, req.userId]);
  if (!owns.rows[0]) return res.status(404).json({ error: 'Child not found.' });

  if (!COLORS.includes(color)) {
    // Auto-pick the next colour in rotation for this child.
    const { rows: cnt } = await db.query('SELECT COUNT(*)::int AS n FROM clubs WHERE child_id = $1', [childId]);
    color = COLORS[cnt[0].n % COLORS.length];
  }

  const { rows } = await db.query(
    `INSERT INTO clubs (user_id, child_id, name, sub, color)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, child_id, name, sub, color`,
    [req.userId, childId, name, sub, color]
  );
  res.status(201).json({ ...rows[0], people_count: 0 });
});

// PUT /api/clubs/:id { name?, sub?, color? }
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
  vals.push(req.params.id, req.userId);
  const { rows } = await db.query(
    `UPDATE clubs SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING id, child_id, name, sub, color`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  res.json(rows[0]);
});

// DELETE /api/clubs/:id  (cascades to people)
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM clubs WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rowCount) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
