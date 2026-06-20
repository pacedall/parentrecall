// Password policy + common-password screening (server-authoritative).
// Policy: >= 8 chars, at least one letter, at least one number, at least two symbols.
// Screening: reject common/guessable passwords, including leet-spelled variants
// (e.g. "P@ssw0rd!!" normalises to "password") and the user's own email.

// A curated set of very common passwords and base words. We check the password
// both as-typed (lowercased) and "de-leeted to letters" against this set, so a
// common base word can't sneak through with digit/symbol decoration.
const COMMON = new Set([
  'password','passwords','passw0rd','password1','password12','passwordone','pass','passcode',
  'qwerty','qwertyuiop','qwertyui','asdfgh','asdfghjkl','zxcvbn','zxcvbnm','qazwsx','qweasd','qwert',
  'iloveyou','letmein','welcome','welcomes','admin','administrator','root','login','logon','user','guest','test','testing',
  'monkey','dragon','master','shadow','superman','batman','michael','jordan','tigger','sunshine','princess','football',
  'baseball','soccer','hockey','basketball','starwars','pokemon','minecraft','computer','internet','samsung','google',
  'whatever','trustno','trustnoone','hello','hellothere','freedom','flower','butterfly','chocolate','cookie','secret',
  'changeme','default','temp','temporary','access','access14','letmein1','iloveu','loveyou','ihateyou','fuckyou','fuckoff',
  'abc','abcd','abcde','abcdef','abcdefg','abcdefgh','abc123','abcd1234','aaaa','aaaaaa','aaaaaaaa','aaaaaaaaa',
  'one','onetwo','onetwothree','onetwothreefour','onetwothreefourfive','twelve','qwer','asdf','zxcv','poiuy',
  'love','loveme','sex','god','money','life','family','happy','summer','winter','spring','autumn',
  'january','february','march','april','june','july','august','september','october','november','december',
  'monday','sunday','friday','superman1','batman1','ninja','killer','hunter','ranger','soldier','ginger','pepper',
  'cheese','banana','orange','apple','purple','yellow','silver','golden','diamond','dolphin','tiger','lion','eagle',
  'phoenix','viking','wizard','legend','champion','winner','player','gamer','master1','passw','welkom','contrasena',
  'motdepasse','mypassword','newpassword','mynewpassword','thisismypassword','parentrecall','pacedall',
  'qwerty123','password123','admin123','root123','letmein123','welcome123','iloveyou1','princess1','sunshine1',
  'football1','superman123','dragon123','monkey123','master123','shadow1','michael1','jordan23','michael23'
]);

// map common leet substitutions back to letters
function deleet(s) {
  return String(s).toLowerCase()
    .replace(/[@4]/g, 'a').replace(/0/g, 'o').replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/8/g, 'b').replace(/9/g, 'g');
}

// base words (>= 5 letters) we also screen for as a substring, so decoration
// like trailing digits/symbols or leet spelling can't disguise them.
const COMMON_BASE = [...COMMON].filter((w) => w.length >= 5 && /^[a-z]+$/.test(w));

function isCommonPassword(pw) {
  const lower = String(pw).toLowerCase();
  const lettersOnly = lower.replace(/[^a-z]/g, '');
  const lettersDeleet = deleet(pw).replace(/[^a-z]/g, '');
  if (COMMON.has(lower) || COMMON.has(lettersOnly) || COMMON.has(lettersDeleet)) return true;
  for (const base of COMMON_BASE) {
    if (lettersOnly.includes(base) || lettersDeleet.includes(base)) return true;
  }
  if (/^(.)\1+$/.test(lower)) return true;                 // "aaaaaaaa", "11111111"
  if (/(01234|12345|23456|34567|45678|56789|67890|abcde|qwert|asdfg|zxcvb)/.test(lower)) return true;
  return false;
}

// Returns an error string if invalid, or null if the password is acceptable.
function validatePassword(pw, email) {
  pw = pw == null ? '' : String(pw);
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (!/[A-Za-z]/.test(pw)) return 'Password must include at least one letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include at least one number.';
  const symbols = (pw.match(/[^A-Za-z0-9]/g) || []).length;
  if (symbols < 2) return 'Password must include at least two symbols (for example ! ? # $ @ %).';
  if (email) {
    const local = String(email).toLowerCase().split('@')[0];
    if (local.length >= 3 && pw.toLowerCase().includes(local)) return 'Please don\u2019t include your email address in your password.';
  }
  if (isCommonPassword(pw)) return 'That password is too common or guessable \u2014 please choose another.';
  return null;
}

module.exports = { validatePassword, isCommonPassword };
