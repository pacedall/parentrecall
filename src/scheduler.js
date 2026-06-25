// Daily birthday reminders. Runs in-process: a check shortly after boot, then
// every 24h. Emails each user a digest of birthdays in the next 7 days.
// A per-user/day row in reminder_log prevents duplicate sends across restarts.
//
// Good enough for a single instance. For multiple instances or precise timing,
// move this to a dedicated cron/worker.
const db = require('./db');
const { sendBirthdayDigest, sendWeeklyAdminDigest } = require('./mailer');

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function runBirthdayDigest() {
  if (process.env.REMINDERS_ENABLED === 'false') return;
  const today = new Date();
  const windowDays = [];
  for (let n = 0; n < 7; n++) {
    const d = new Date(today.getTime() + n * DAY_MS);
    windowDays.push({ m: d.getMonth() + 1, d: d.getDate(), label: n === 0 ? 'today' : (n === 1 ? 'tomorrow' : d.getDate() + ' ' + MONTH_NAMES[d.getMonth() + 1]) });
  }
  const ors = windowDays.map(function (_, i) { return '(p.birthday_month = $' + (i * 2 + 1) + ' AND p.birthday_day = $' + (i * 2 + 2) + ')'; }).join(' OR ');
  const params = [];
  windowDays.forEach(function (w) { params.push(w.m, w.d); });

  let rows;
  try {
    const r = await db.query(
      `SELECT p.household_id, p.name, p.birthday_month, p.birthday_day, c.name AS club
       FROM people p JOIN clubs c ON c.id = p.club_id
       WHERE p.birthday_month IS NOT NULL AND (${ors})`,
      params
    );
    rows = r.rows;
  } catch (err) {
    console.error('[reminders] query failed', err.message);
    return;
  }
  if (!rows.length) return;

  const byHousehold = {};
  rows.forEach(function (r) {
    const w = windowDays.find(function (x) { return x.m === r.birthday_month && x.d === r.birthday_day; });
    (byHousehold[r.household_id] = byHousehold[r.household_id] || []).push({ name: r.name, club: r.club, when: w ? w.label : '' });
  });

  const todayStr = today.toISOString().slice(0, 10);
  for (const hid of Object.keys(byHousehold)) {
    let members;
    try {
      members = (await db.query(
        'SELECT u.id AS user_id, u.email FROM household_members hm JOIN users u ON u.id = hm.user_id WHERE hm.household_id = $1',
        [hid]
      )).rows;
    } catch (e) { continue; }
    for (const m of members) {
      try {
        const seen = await db.query('SELECT 1 FROM reminder_log WHERE user_id = $1 AND sent_on = $2', [m.user_id, todayStr]);
        if (seen.rows[0]) continue; // already sent to this member today
        await db.query('INSERT INTO reminder_log (user_id, sent_on) VALUES ($1, $2)', [m.user_id, todayStr]);
        await sendBirthdayDigest(m.email, byHousehold[hid]);
      } catch (err) {
        console.error('[reminders] send failed for user', m.user_id, err.message);
      }
    }
  }
}

function start() {
  // first run a little after boot, then daily
  setTimeout(function () { runBirthdayDigest().catch(function () {}); maybeWeeklyDigest().catch(function () {}); }, 30 * 1000);
  setInterval(function () { runBirthdayDigest().catch(function () {}); maybeWeeklyDigest().catch(function () {}); }, DAY_MS);
}

// Weekly founder digest of new registrations, emailed to team@parentrecall.com.
// Sent at most once every 7 days; a marker in app_meta makes this safe across
// restarts and redeploys (it won't double-send within a week).
async function maybeWeeklyDigest() {
  if (process.env.WEEKLY_DIGEST === 'false') return;
  let last = null;
  try {
    const r = await db.query("SELECT value FROM app_meta WHERE key = 'last_weekly_digest'");
    if (r.rows[0] && r.rows[0].value) last = new Date(r.rows[0].value);
  } catch (e) { /* table may not exist on first boot; treat as never sent */ }
  const now = new Date();
  if (last && (now.getTime() - last.getTime()) < (7 * DAY_MS - 60 * 60 * 1000)) return;
  await runWeeklyAdminDigest();
  try {
    await db.query(
      "INSERT INTO app_meta (key, value, updated_at) VALUES ('last_weekly_digest', $1, now()) " +
      "ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()",
      [now.toISOString()]
    );
  } catch (e) { console.error('[weekly] could not record marker', e.message); }
}

async function runWeeklyAdminDigest() {
  const to = process.env.WEEKLY_DIGEST_TO || 'team@parentrecall.com';
  async function rows(sql) { try { return (await db.query(sql)).rows; } catch (e) { return null; } }
  async function count(sql) { const r = await rows(sql); return r && r[0] ? Number(r[0].n) : null; }

  const data = {};
  data.newThisWeek = await count("SELECT count(*) n FROM users WHERE created_at > now() - interval '7 days'");
  data.totalUsers = await count('SELECT count(*) n FROM users');
  data.verifiedUsers = await count('SELECT count(*) n FROM users WHERE email_verified');
  data.households = await count('SELECT count(*) n FROM households');
  data.children = await count('SELECT count(*) n FROM children');
  data.clubs = await count('SELECT count(*) n FROM clubs');
  data.people = await count('SELECT count(*) n FROM people');
  const list = await rows("SELECT email, email_verified, created_at FROM users WHERE created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 50");
  data.recent = (list || []).map(function (r) { return { email: r.email, verified: !!r.email_verified, created_at: r.created_at }; });
  data.appUrl = process.env.APP_URL || 'https://parentrecall.com';

  await sendWeeklyAdminDigest(to, data);
}

module.exports = { start, runBirthdayDigest, runWeeklyAdminDigest, maybeWeeklyDigest };
