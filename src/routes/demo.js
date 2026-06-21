const express = require('express');
const db = require('../db');
const { requireAuth, loadHousehold, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, loadHousehold, requireAdmin);

// Sample dataset. Surnames are already shortened to two letters to match how the
// app stores real names, and avatars use the same shape the builder produces.
const AV = (skin, hairColor, hair, glasses) => JSON.stringify({ skin: skin, hairColor: hairColor, hair: hair, glasses: glasses });

function birthdayParts(s) {
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const m = String(s).toLowerCase().match(/(\d{1,2})\s+([a-z]+)/);
  if (!m) return { month: null, day: null };
  const day = parseInt(m[1], 10);
  const month = months.indexOf(m[2]) + 1;
  return { month: month || null, day: day || null };
}

const CLUBS = [
  {
    name: 'Year 3 — Oakfield', sub: 'Class', color: 'blue',
    people: [
      { name: 'Amelia Wa', ptype: 'child', role: 'In Olivia\u2019s class', hooks: 'Olivia\u2019s best friend \u00b7 red bookbag \u00b7 sits by the window', birthday: '14 March',
        parents: [{ name: 'Priya Sh', label: 'mother' }, { name: 'Dan Wa', label: 'father' }], av: AV('#F1C9A5', '#6A4E42', 'long', 'none', 'none') },
      { name: 'Mohammed Al', ptype: 'child', role: '', hooks: 'Lives on Oak Street \u00b7 mad about dinosaurs', birthday: '2 September',
        parents: [{ name: 'Yusuf Al', label: 'father' }], av: AV('#C68642', '#2C1B18', 'short', 'none', 'none') },
      { name: 'Mr Ok', ptype: 'teacher', role: 'Class teacher', hooks: 'Tall \u00b7 square glasses \u00b7 always has a coffee', birthday: '',
        parents: [], av: AV('#8D5524', '#2C1B18', 'short', 'square', 'none') }
    ]
  },
  {
    name: 'Swimming — Tuesdays', sub: 'Club', color: 'teal',
    people: [
      { name: 'Tom', ptype: 'coach', role: 'Swim coach', hooks: 'Whistle \u00b7 always cheerful \u00b7 drives a yellow van', birthday: '',
        parents: [], av: AV('#E0AC8B', '#B55239', 'short', 'none', 'none') },
      { name: 'Sofia Me', ptype: 'child', role: '', hooks: 'Always first in the pool \u00b7 purple goggles', birthday: '30 June',
        parents: [{ name: 'Elena Co', label: 'mother' }, { name: 'Maria Co', label: 'mother' }], av: AV('#F1C9A5', '#2C1B18', 'curly', 'none', 'none') },
      { name: 'Jacob Re', ptype: 'child', role: '', hooks: 'Lane 3 \u00b7 giggly \u00b7 wears a hearing aid', birthday: '',
        parents: [{ name: 'Hannah Re', label: 'mother' }], av: AV('#FBD9B8', '#9AA0A6', 'short', 'round') }
    ]
  }
];

const PTEXT = { mother: 'Mother', father: 'Father', other: 'Other' };

// POST /api/demo/seed
router.post('/seed', async (req, res) => {
  try {
    const existing = await db.query('SELECT id FROM children WHERE household_id = $1 AND is_demo = true LIMIT 1', [req.householdId]);
    if (existing.rows[0]) return res.json({ ok: true, alreadyPresent: true });

    const ch = await db.query(
      'INSERT INTO children (household_id, user_id, name, is_demo) VALUES ($1, $2, $3, true) RETURNING id',
      [req.householdId, req.userId, 'Olivia']
    );
    const childId = ch.rows[0].id;

    for (const club of CLUBS) {
      const cl = await db.query(
        'INSERT INTO clubs (household_id, user_id, child_id, name, sub, color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [req.householdId, req.userId, childId, club.name, club.sub, club.color]
      );
      const clubId = cl.rows[0].id;
      for (const p of club.people) {
        const pjson = p.parents.length ? JSON.stringify(p.parents) : '';
        const ptext = p.parents.map(function (e) { return e.name + ' (' + PTEXT[e.label] + ')'; }).join(', ');
        const bd = birthdayParts(p.birthday);
        await db.query(
          `INSERT INTO people (household_id, user_id, club_id, name, role, parents, parents_list, hooks, birthday, birthday_month, birthday_day, avatar, ptype)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [req.householdId, req.userId, clubId, p.name, p.role, ptext, pjson, p.hooks, p.birthday, bd.month, bd.day, p.av, p.ptype]
        );
      }
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('demo seed error', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /api/demo/clear  — removes the sample child (cascades to its clubs + people)
router.post('/clear', async (req, res) => {
  try {
    await db.query('DELETE FROM children WHERE household_id = $1 AND is_demo = true', [req.householdId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('demo clear error', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
