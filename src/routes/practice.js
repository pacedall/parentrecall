const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified, loadHousehold } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireVerified);
router.use(loadHousehold);

const MIN_PEOPLE = 4;          // enough for sensible multiple-choice
const SESSION_SIZE = 5;        // people per daily session
const BOX_DAYS = [0, 1, 3, 7, 16, 30]; // spaced-repetition intervals by box level

function todayStr() { return new Date().toISOString().slice(0, 10); }
function dayStr(d) { return d ? new Date(d).toISOString().slice(0, 10) : null; }
function yesterdayStr() { return new Date(Date.now() - 86400000).toISOString().slice(0, 10); }
function firstName(n) { return String(n || '').split(' ')[0]; }
function uniq(a) { var s = {}, o = []; a.forEach(function (x) { var k = String(x).toLowerCase(); if (x && !s[k]) { s[k] = 1; o.push(x); } }); return o; }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function sample(arr, n) { return shuffle(arr.slice()).slice(0, n); }
function parseParents(raw) {
  try { var a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.map(function (e) { return e && e.name; }).filter(Boolean) : []; }
  catch (e) { return []; }
}

async function loadPool(req) {
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.avatar, p.parents_list, p.hooks, p.role, p.club_id, cl.name AS club_name,
            s.box, s.seen, s.correct, s.last_practiced_at
       FROM people p
       JOIN clubs cl ON cl.id = p.club_id AND cl.hidden = false
       JOIN children ch ON ch.id = cl.child_id AND ch.hidden = false
       LEFT JOIN practice_stats s ON s.person_id = p.id AND s.user_id = $2
      WHERE p.household_id = $1`,
    [req.householdId, req.userId]
  );
  return rows;
}

async function streakFor(userId) {
  const u = (await db.query('SELECT practice_streak, practice_last_day FROM users WHERE id = $1', [userId])).rows[0] || {};
  const last = dayStr(u.practice_last_day);
  const live = (last === todayStr() || last === yesterdayStr()) ? (u.practice_streak || 0) : 0;
  return { streak: live, doneToday: last === todayStr() };
}

// GET /api/practice/status — for the home card
router.get('/status', async (req, res) => {
  const pool = await loadPool(req);
  const s = await streakFor(req.userId);
  const clubCount = uniq(pool.map(function (p) { return p.club_id; })).length;
  const anyCue = pool.some(function (p) { return p.avatar || p.hooks || p.role; });
  const anyParents = pool.some(function (p) { return parseParents(p.parents_list).length; });
  const ready = pool.length >= MIN_PEOPLE && (clubCount >= 2 || anyCue || anyParents);
  res.json({
    ready: ready,
    total: pool.length,
    need: Math.max(0, MIN_PEOPLE - pool.length),
    streak: s.streak,
    doneToday: s.doneToday,
  });
});

// GET /api/practice — build today's session
router.get('/', async (req, res) => {
  const pool = await loadPool(req);
  if (pool.length < MIN_PEOPLE) return res.json({ ready: false, need: MIN_PEOPLE - pool.length, questions: [] });

  const allNames = [], clubsById = {}, allParents = [];
  pool.forEach(function (p) {
    if (p.name) allNames.push(p.name);
    if (p.club_name) clubsById[p.club_id] = p.club_name;
    p._parents = parseParents(p.parents_list);
    p._parents.forEach(function (nm) { allParents.push(nm); });
  });
  const uniqNames = uniq(allNames);
  const clubNames = uniq(Object.keys(clubsById).map(function (k) { return clubsById[k]; }));
  const uniqParents = uniq(allParents);

  // Spaced repetition: never-seen first, then most overdue (by box interval).
  const now = Date.now();
  function overdue(p) {
    if (!p.last_practiced_at) return Number.MAX_SAFE_INTEGER;
    var box = Math.min(p.box || 0, 5);
    var dueAt = new Date(p.last_practiced_at).getTime() + BOX_DAYS[box] * 86400000;
    return now - dueAt;
  }
  pool.sort(function (a, b) { return overdue(b) - overdue(a); });
  const questions = [];
  for (var qi = 0; qi < pool.length && questions.length < SESSION_SIZE; qi++) {
    var q = buildQuestion(pool[qi], uniqNames, clubNames, clubsById, uniqParents);
    if (q) questions.push(q);
  }
  res.json({ ready: questions.length > 0, questions: questions });
});

function buildQuestion(p, uniqNames, clubNames, clubsById, uniqParents) {
  const hasCue = !!(p.avatar || p.hooks || p.role);
  const types = [];
  if (hasCue) types.push('name');
  if (clubNames.length >= 2) types.push('club');
  if (p._parents.length && uniqParents.length >= 3) types.push('parent');
  if (!types.length) return null;

  let type;
  if (types.indexOf('name') >= 0 && (types.length === 1 || Math.random() < 0.55)) type = 'name';
  else { const others = types.filter(function (t) { return t !== 'name'; }); type = others[Math.floor(Math.random() * others.length)]; }

  let answer, opool, prompt, showName = false;
  if (type === 'club') {
    answer = clubsById[p.club_id];
    opool = clubNames.filter(function (c) { return c.toLowerCase() !== String(answer).toLowerCase(); });
    prompt = 'Which group is ' + firstName(p.name) + ' in?';
    showName = true;
  } else if (type === 'parent') {
    answer = p._parents[Math.floor(Math.random() * p._parents.length)];
    const own = {}; p._parents.forEach(function (n) { own[n.toLowerCase()] = 1; });
    opool = uniqParents.filter(function (n) { return !own[n.toLowerCase()]; });
    prompt = 'Who\u2019s ' + firstName(p.name) + '\u2019s grown-up?';
    showName = true;
  } else {
    answer = p.name;
    opool = uniqNames.filter(function (n) { return n.toLowerCase() !== String(answer).toLowerCase(); });
    prompt = 'Who\u2019s this?';
    showName = false;
  }
  if (!answer) return null;
  const distractors = sample(opool, 3);
  if (!distractors.length) return null;
  const options = shuffle([answer].concat(distractors));
  return {
    personId: p.id, type: type, prompt: prompt, showName: showName,
    name: p.name, avatar: p.avatar || '', hooks: p.hooks || '', role: p.role || '',
    options: options, answer: answer,
  };
}

// POST /api/practice/complete { results: [{ personId, correct }] }
router.post('/complete', async (req, res) => {
  const results = Array.isArray(req.body.results) ? req.body.results : [];
  // only accept people in this household
  const owned = {};
  (await db.query('SELECT id FROM people WHERE household_id = $1', [req.householdId])).rows
    .forEach(function (r) { owned[r.id] = 1; });

  for (const r of results) {
    const pid = parseInt(r.personId, 10);
    if (!pid || !owned[pid]) continue;
    const correct = !!r.correct;
    const cur = (await db.query('SELECT box, seen, correct FROM practice_stats WHERE user_id = $1 AND person_id = $2', [req.userId, pid])).rows[0];
    const box = cur ? Math.max(0, Math.min(5, (cur.box || 0) + (correct ? 1 : -1))) : (correct ? 1 : 0);
    const seen = (cur ? cur.seen : 0) + 1;
    const cor = (cur ? cur.correct : 0) + (correct ? 1 : 0);
    await db.query(
      'INSERT INTO practice_stats (user_id, person_id, box, seen, correct, last_practiced_at) VALUES ($1,$2,$3,$4,$5, now()) ' +
      'ON CONFLICT (user_id, person_id) DO UPDATE SET box = $3, seen = $4, correct = $5, last_practiced_at = now()',
      [req.userId, pid, box, seen, cor]
    );
  }

  // Update the daily streak (once per day).
  const u = (await db.query('SELECT practice_streak, practice_last_day FROM users WHERE id = $1', [req.userId])).rows[0] || {};
  const last = dayStr(u.practice_last_day);
  let streak = u.practice_streak || 0;
  if (last !== todayStr()) streak = (last === yesterdayStr()) ? streak + 1 : 1;
  await db.query('UPDATE users SET practice_streak = $1, practice_last_day = $2 WHERE id = $3', [streak, todayStr(), req.userId]);

  res.json({ streak: streak, doneToday: true });
});

module.exports = router;
