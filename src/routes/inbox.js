const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified, loadHousehold } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireVerified);
router.use(loadHousehold);

// Normalise up to 2 parent/carer names into a JSON array of { name }.
function cleanInboxParents(raw) {
  let arr = raw;
  if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { arr = null; } }
  if (!Array.isArray(arr)) return '';
  const out = [];
  for (const e of arr) {
    const name = String(e && e.name !== undefined ? e.name : e || '').trim().replace(/\s+/g, ' ').slice(0, 15);
    if (name) out.push({ name: name });
    if (out.length >= 2) break;
  }
  return out.length ? JSON.stringify(out) : '';
}

// GET /api/inbox  -> unallocated quick-capture items for the household
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, note, parents, created_at FROM inbox WHERE household_id = $1 ORDER BY created_at ASC, id ASC',
    [req.householdId]
  );
  res.json(rows);
});

// POST /api/inbox { name, parents:[..] }  -> jot a child + their grown-ups fast, sort later
router.post('/', async (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) return res.status(400).json({ error: 'A name is needed.' });
  const note = String(req.body.note || '').trim().slice(0, 280);
  const parents = cleanInboxParents(req.body.parents);
  const { rows } = await db.query(
    'INSERT INTO inbox (household_id, user_id, name, note, parents) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, note, parents, created_at',
    [req.householdId, req.userId, name, note, parents]
  );
  res.status(201).json(rows[0]);
});

// DELETE /api/inbox/:id  -> discard (or after it's been allocated to a club)
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM inbox WHERE id = $1 AND household_id = $2', [req.params.id, req.householdId]);
  if (!rowCount) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
