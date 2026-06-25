// Sends transactional email via Resend.
// If RESEND_API_KEY is not set (e.g. local dev), the email is NOT sent —
// instead its contents (including any link) are printed to the console so
// you can copy the link and test the flow without credentials.

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'ParentRecall <onboarding@resend.dev>';

async function sendMail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.log('\n──────── [mailer] RESEND_API_KEY not set — email not sent ────────');
    console.log('  to:      ' + to);
    console.log('  subject: ' + subject);
    if (text) console.log('  ' + text.replace(/\n/g, '\n  '));
    console.log('──────────────────────────────────────────────────────────────────\n');
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: MAIL_FROM, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[mailer] Resend error', res.status, body);
    throw new Error('Could not send email');
  }
  return res.json();
}

function shell(heading, intro, btnText, btnUrl, foot) {
  return `<!doctype html><html><body style="margin:0;background:#F4F6FB;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <div style="text-align:center;margin-bottom:20px">
      <span style="font-family:Georgia,serif;font-weight:800;font-size:24px;color:#18306C">Parent<span style="color:#F2641E">Recall</span></span>
    </div>
    <div style="background:#fff;border:1px solid #E7EBF3;border-radius:18px;padding:28px 26px">
      <h1 style="font-size:20px;color:#18306C;margin:0 0 12px">${heading}</h1>
      <p style="font-size:15px;line-height:1.6;color:#3A4566;margin:0 0 22px">${intro}</p>
      <a href="${btnUrl}" style="display:inline-block;background:#F2641E;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px">${btnText}</a>
      <p style="font-size:12.5px;line-height:1.6;color:#8A93AB;margin:22px 0 0">${foot}</p>
      <p style="font-size:12px;color:#A6AEC2;margin:14px 0 0;word-break:break-all">Or paste this link into your browser:<br>${btnUrl}</p>
    </div>
    <p style="text-align:center;font-size:11.5px;color:#A6AEC2;margin:18px 0 0">ParentRecall · your private memory aid</p>
  </div></body></html>`;
}

function sendVerificationEmail(to, link) {
  return sendMail({
    to,
    subject: 'Verify your email for ParentRecall',
    text: 'Confirm your email to finish setting up ParentRecall:\n' + link + '\nIf you didn\u2019t create an account, you can ignore this email.',
    html: shell(
      'Confirm your email',
      'You\u2019re almost set up. Tap the button below to confirm your email address and start remembering every name at the gate.',
      'Verify email',
      link,
      'If you didn\u2019t create a ParentRecall account, you can safely ignore this email.'
    ),
  });
}

function sendPasswordResetEmail(to, link) {
  return sendMail({
    to,
    subject: 'Reset your ParentRecall password',
    text: 'Reset your ParentRecall password (link expires in 1 hour):\n' + link + '\nIf you didn\u2019t request this, you can ignore this email.',
    html: shell(
      'Reset your password',
      'We got a request to reset your ParentRecall password. Tap below to choose a new one. This link expires in 1 hour and can only be used once.',
      'Reset password',
      link,
      'If you didn\u2019t request this, you can ignore this email — your password won\u2019t change.'
    ),
  });
}

function sendBirthdayDigest(to, items) {
  var rows = items.map(function (it) {
    return '<tr><td style="padding:6px 0;font-size:15px;color:#18306C"><b>' + it.name + '</b> <span style="color:#8A93AB">\u00b7 ' + it.club + '</span></td>' +
      '<td style="padding:6px 0;font-size:14px;color:#3A4566;text-align:right">' + it.when + '</td></tr>';
  }).join('');
  return sendMail({
    to: to,
    subject: 'Birthdays coming up on ParentRecall',
    text: 'Birthdays coming up:\n' + items.map(function (it) { return '- ' + it.name + ' (' + it.club + ') ' + it.when; }).join('\n'),
    html: '<!doctype html><html><body style="margin:0;background:#F4F6FB;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
      '<div style="max-width:480px;margin:0 auto;padding:32px 20px">' +
      '<div style="text-align:center;margin-bottom:20px"><span style="font-family:Georgia,serif;font-weight:800;font-size:24px;color:#18306C">Parent<span style="color:#F2641E">Recall</span></span></div>' +
      '<div style="background:#fff;border:1px solid #E7EBF3;border-radius:18px;padding:24px">' +
      '<h1 style="font-size:19px;color:#18306C;margin:0 0 14px">Birthdays this week \uD83C\uDF82</h1>' +
      '<table style="width:100%;border-collapse:collapse">' + rows + '</table>' +
      '<p style="font-size:12.5px;color:#8A93AB;margin:18px 0 0">A little nudge so you can say happy birthday at the gate.</p>' +
      '</div></div></body></html>',
  });
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; });
}

function sendWeeklyAdminDigest(to, d) {
  var url = (d.appUrl || 'https://parentrecall.com') + '/admin';
  var nw = d.newThisWeek || 0;
  var rows = (d.recent || []).map(function (r) {
    var when = '';
    try { when = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) {}
    return '<tr><td style="padding:6px 0;font-size:14px;color:#18306C">' + escHtml(r.email) + '</td>' +
      '<td style="padding:6px 0;font-size:13px;color:#3A4566;text-align:right;white-space:nowrap">' + when + (r.verified ? '' : ' &middot; pending') + '</td></tr>';
  }).join('');
  if (!rows) rows = '<tr><td style="padding:8px 0;font-size:14px;color:#8A93AB">No new sign-ups this week.</td></tr>';

  function stat(label, val) {
    return '<td style="padding:10px 8px;background:#F6F8FC;border-radius:12px;text-align:center">' +
      '<div style="font-size:22px;font-weight:800;color:#18306C">' + (val == null ? '\u2014' : val) + '</div>' +
      '<div style="font-size:11px;color:#8A93AB;text-transform:uppercase;letter-spacing:.03em;margin-top:2px">' + label + '</div></td>';
  }

  var textLines = [
    'ParentRecall weekly summary',
    '',
    'New sign-ups this week: ' + nw,
    'Total users: ' + (d.totalUsers == null ? '?' : d.totalUsers) + ' (' + (d.verifiedUsers == null ? '?' : d.verifiedUsers) + ' verified)',
    'Households: ' + d.households + ' | Children: ' + d.children + ' | Clubs: ' + d.clubs + ' | People saved: ' + d.people,
    '',
    'This week\u2019s sign-ups:',
  ].concat((d.recent || []).map(function (r) { return '- ' + r.email + (r.verified ? '' : ' (pending)'); }));
  if (!(d.recent || []).length) textLines.push('- none');
  textLines.push('', 'Full dashboard: ' + url);

  var html = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#F4F6FB;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
    '<div style="max-width:520px;margin:0 auto;padding:32px 20px">' +
    '<div style="text-align:center;margin-bottom:20px"><span style="font-family:Georgia,serif;font-weight:800;font-size:24px;color:#18306C">Parent<span style="color:#F2641E">Recall</span></span></div>' +
    '<div style="background:#fff;border:1px solid #E7EBF3;border-radius:18px;padding:26px">' +
    '<h1 style="font-size:19px;color:#18306C;margin:0 0 4px">Weekly summary</h1>' +
    '<p style="font-size:15px;line-height:1.6;color:#3A4566;margin:0 0 18px"><b style="color:#18306C">' + nw + '</b> new sign-up' + (nw === 1 ? '' : 's') + ' in the last 7 days.</p>' +
    '<table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin-bottom:18px"><tr>' +
    stat('Total', d.totalUsers) + stat('Verified', d.verifiedUsers) + stat('This week', nw) +
    '</tr></table>' +
    '<p style="font-size:12.5px;color:#8A93AB;margin:0 0 14px">Households ' + d.households + ' &middot; Children ' + d.children + ' &middot; Clubs ' + d.clubs + ' &middot; People saved ' + d.people + '</p>' +
    '<h2 style="font-size:14px;color:#18306C;margin:0 0 8px">New this week</h2>' +
    '<table style="width:100%;border-collapse:collapse">' + rows + '</table>' +
    '<div style="margin-top:22px"><a href="' + url + '" style="display:inline-block;background:#F2641E;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:12px">Open dashboard</a></div>' +
    '</div>' +
    '<p style="text-align:center;font-size:11.5px;color:#A6AEC2;margin:18px 0 0">ParentRecall admin digest</p>' +
    '</div></body></html>';

  return sendMail({
    to: to,
    subject: 'ParentRecall weekly \u2014 ' + nw + ' new sign-up' + (nw === 1 ? '' : 's'),
    text: textLines.join('\n'),
    html: html,
  });
}

module.exports = { sendMail, sendVerificationEmail, sendPasswordResetEmail, sendBirthdayDigest, sendWeeklyAdminDigest };
