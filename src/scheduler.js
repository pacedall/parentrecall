// Daily birthday reminders. Runs in-process: a check shortly after boot, then
// every 24h. Emails each user a digest of birthdays in the next 7 days.
// A per-user/day row in reminder_log prevents duplicate sends across restarts.
//
// Good enough for a single instance. For multiple instances or precise timing,
// move this to a dedicated cron/worker.
const db = require('./db');
const { sendBirthdayDigest } = require('./mailer');

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
  setTimeout(function () { runBirthdayDigest().catch(function () {}); }, 30 * 1000);
  setInterval(function () { runBirthdayDigest().catch(function () {}); }, DAY_MS);
}

module.exports = { start, runBirthdayDigest };
