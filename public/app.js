/* ParentRecall frontend — talks to the Express API. */
(function () {
  'use strict';

  var TOKEN_KEY = 'pr_token';
  var token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  function saveToken(t, persist) {
    token = t;
    if (persist === false) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {} localStorage.removeItem(TOKEN_KEY); }
    else { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} sessionStorage.removeItem(TOKEN_KEY); }
  }
  var me = null;
  var household = { role: null, isAdmin: false, partner: null, adminEmail: null };

  var PAL = ['blue', 'teal', 'navy', 'amber', 'red', 'orange'];
  var RAW = { teal: '#0CA8A8', blue: '#1890B4', navy: '#284C9E', amber: '#F5B72E', red: '#E5403A', orange: '#F2641E' };
  function raw(k) { return RAW[k] || k; }

  // working state + caches
  var state = { view: 'home', childId: null, clubId: null, personId: null };
  var children = [];
  var clubs = [];   // clubs of the current child
  var people = [];  // people of the current club

  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function attr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function silhouette(c) {
    return '<span class="silhouette" style="background:' + c + '24">' +
      '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="' + c + '"><circle cx="12" cy="8.2" r="4.2"/>' +
      '<path d="M3.5 22c0-4.7 3.8-7.6 8.5-7.6s8.5 2.9 8.5 7.6z"/></svg></span>';
  }

  /* ---------------- Avatars ---------------- */
  // Avataaars skin tones (hex from the avataaars palette)
  var SKIN = ['#ffdbb4', '#edb98a', '#fd9841', '#d08b5b', '#ae5d29', '#614335'];
  // Hair colours: black, dark brown, auburn, light brown, blonde, grey
  var HAIRCOL = ['#2c1b18', '#4a312c', '#a55728', '#b58143', '#d6b370', '#e8e1e1'];
  // Avataaars 'top' styles ('none' = bald); hijab + turban for inclusivity
  var HAIRSTYLE = ['none', 'shortFlat', 'shortCurly', 'shortWaved', 'theCaesar', 'straight01', 'bob', 'bun', 'longButNotTooLong', 'curly', 'bigHair', 'dreads', 'fro', 'hijab', 'turban'];
  var HAIRLABEL = { none: 'None', shortFlat: 'Short', shortCurly: 'Short curly', shortWaved: 'Short waved', theCaesar: 'Buzz', straight01: 'Straight', bob: 'Bob', bun: 'Bun', longButNotTooLong: 'Long', curly: 'Curly', bigHair: 'Big hair', dreads: 'Dreads', fro: 'Afro', hijab: 'Hijab', turban: 'Turban' };
  // Avataaars accessories (glasses)
  var GLASSES = ['none', 'round', 'prescription01', 'prescription02', 'wayfarers', 'sunglasses'];
  var GLASSLABEL = { none: 'None', round: 'Round', prescription01: 'Glasses', prescription02: 'Glasses 2', wayfarers: 'Wayfarer', sunglasses: 'Sunglasses' };
  // soft tints of the brand palette (orange, blue, teal, amber, periwinkle, coral)
  var BG = ['#F9CDA9', '#BFE3F2', '#B9E7E2', '#FBE6AE', '#CFD9F3', '#F8C6C0'];
  var PTYPE_LABEL = { child: 'Child', parent: 'Parent/Carer', teacher: 'Teacher', instructor: 'Instructor', coach: 'Coach', assistant: 'Assistant', other: 'Other' };
  function ptypeTag(p) { var t = p && p.ptype; return (t && PTYPE_LABEL[t]) ? '<span class="ptag">' + PTYPE_LABEL[t] + '</span>' : ''; }
  function parentsHtml(p) {
    if (p && p.parents_list) {
      try {
        var arr = JSON.parse(p.parents_list);
        if (arr && arr.length) {
          var L = { mother: 'Mother', father: 'Father', other: 'Other' };
          return arr.map(function (e) { return '<div class="prow2"><span class="plabel">' + (L[e.label] || 'Carer') + '</span>' + esc(e.name) + '</div>'; }).join('');
        }
      } catch (e) {}
    }
    return esc((p && p.parents) || '');
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function c(x) { return Math.max(0, Math.min(255, Math.round(x * (1 + amt)))); }
    return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
  }
  function deriveBg(cfg) {
    var s = (cfg.skin || '') + (cfg.hairColor || '') + (cfg.hair || '') + (cfg.glasses || '');
    var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return BG[h % BG.length];
  }
  var _avCache = {};
  function _strip(hex) { return String(hex || '').replace('#', ''); }
  var AV_FRIENDLY = { eyes: ['default', 'happy'], eyebrows: ['default', 'defaultNatural'], mouth: ['smile', 'twinkle'] };
  var OLD_SKIN = ['#FBD9B8', '#F4C7A0', '#E6AC80', '#CD9265', '#A6724C', '#7C5436'];
  var OLD_HAIRCOL = ['#2C2622', '#4A3526', '#8A5A30', '#D7A94B', '#9AA0A6', '#B9402E'];
  var HAIR_MIGRATE = { short: 'shortFlat', long: 'longButNotTooLong', curly: 'curly', afro: 'fro', bun: 'bun', bald: 'none', hijab: 'hijab' };
  var GLASS_MIGRATE = { square: 'prescription01', rectangle: 'prescription02', cateye: 'wayfarers' };
  function stableHash(cfg) { var s = (cfg.skin || '') + (cfg.hairColor || '') + (cfg.hair || '') + (cfg.glasses || '') + (cfg.bg || ''); var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h.toString(36); }
  function normalizeAvatar(cfg) {
    cfg = cfg || {};
    var hair = cfg.hair; if (HAIR_MIGRATE[hair]) hair = HAIR_MIGRATE[hair];
    if (hair !== 'none' && HAIRLABEL[hair] === undefined) hair = 'shortFlat';
    var glasses = cfg.glasses; if (GLASS_MIGRATE[glasses]) glasses = GLASS_MIGRATE[glasses];
    if (GLASSLABEL[glasses] === undefined) glasses = 'none';
    var skin = cfg.skin; var si = OLD_SKIN.indexOf(skin); if (si >= 0) skin = SKIN[si];
    var hcv = cfg.hairColor; var hi = OLD_HAIRCOL.indexOf(hcv); if (hi >= 0) hcv = HAIRCOL[hi];
    return { seed: cfg.seed || ('s' + stableHash(cfg)), skin: skin || SKIN[1], hairColor: hcv || HAIRCOL[1], hair: hair || 'shortFlat', glasses: glasses || 'none', bg: cfg.bg || deriveBg(cfg) };
  }
  function newAvatar() {
    function pk(a) { return a[Math.floor(Math.random() * a.length)]; }
    var hairChoices = ['shortFlat', 'shortCurly', 'shortWaved', 'theCaesar', 'straight01', 'bob', 'bun', 'longButNotTooLong', 'curly', 'bigHair', 'dreads', 'fro'];
    return { seed: Math.random().toString(36).slice(2, 10), skin: pk(SKIN), hairColor: pk(HAIRCOL), hair: pk(hairChoices), glasses: (Math.random() < 0.18 ? pk(['round', 'prescription01', 'prescription02', 'wayfarers']) : 'none'), bg: pk(BG) };
  }
  function buildAvatar(cfg, size) {
    cfg = normalizeAvatar(cfg); size = size || 48;
    var bg = cfg.bg;
    var key = JSON.stringify(cfg);
    var inner = _avCache[key];
    if (inner === undefined) {
      inner = '';
      try {
        if (window.DiceBear && window.DiceBear.createAvatar && window.DiceBear.avataaars) {
          var opt = {
            seed: cfg.seed,
            skinColor: [_strip(cfg.skin)],
            hairColor: [_strip(cfg.hairColor)],
            eyes: AV_FRIENDLY.eyes, eyebrows: AV_FRIENDLY.eyebrows, mouth: AV_FRIENDLY.mouth,
            facialHairProbability: 0,
            clothing: ['shirtCrewNeck'], clothesColor: ['e3e3e8'],
            accessoriesProbability: 0
          };
          if (cfg.hair && cfg.hair !== 'none') opt.top = [cfg.hair];
          else opt.topProbability = 0;
          if (cfg.glasses && cfg.glasses !== 'none') { opt.accessories = [cfg.glasses]; opt.accessoriesProbability = 100; }
          var rawSvg = window.DiceBear.createAvatar(window.DiceBear.avataaars, opt).toString();
          inner = rawSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
        }
      } catch (e) { inner = ''; }
      _avCache[key] = inner;
    }
    var uid = 'v' + Math.random().toString(36).slice(2, 8);
    var content = inner ? inner.replace(/viewboxMask/g, uid) : '';
    var ring = shade(bg, -0.12);
    var id = 'p' + Math.random().toString(36).slice(2, 8);
    var headshot = content ? '<svg x="0" y="0" width="200" height="200" viewBox="44 2 192 192" preserveAspectRatio="xMidYMid slice">' + content + '</svg>' : '';
    return '<svg viewBox="0 0 200 200" width="' + size + '" height="' + size + '" style="display:block" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><clipPath id="' + id + '"><circle cx="100" cy="100" r="100"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + ')">' +
      '<rect width="200" height="200" fill="' + bg + '"/>' +
      headshot +
      '<circle cx="100" cy="100" r="98" fill="none" stroke="' + ring + '" stroke-width="4"/>' +
      '</g></svg>';
  }
  // avatar if the person has one, else the neutral coloured silhouette
  function avatarFor(p, color, size) {
    if (p && p.avatar) {
      try { return '<span class="avatarbox" style="width:' + size + 'px;height:' + size + 'px">' + buildAvatar(JSON.parse(p.avatar), size) + '</span>'; }
      catch (e) { /* fall through */ }
    }
    return silhouette(color);
  }
  var ICON = {
    chev: '<svg aria-hidden="true" focusable="false" class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
    back: '<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
    plus: '<svg aria-hidden="true" focusable="false" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    eye: '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 3.6-.7"/></svg>',
    down: '<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
    shuffle: '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>',
    cake: '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 21h16M5 21v-7h14v7M8 14V8m4 6V7m4 7V8M12 7V3"/></svg>',
    edit: '<svg aria-hidden="true" focusable="false" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    gear: '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    sheet: '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
    search: '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    cards: '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="16" rx="2"/><path d="M7 5V3h14v16h-2"/></svg>',
    print: '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>'
  };

  /* ---------------- API ---------------- */
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (res.status === 401) { signOut(); throw new Error('Session expired'); }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        return data;
      });
    });
  }

  /* ---------------- Auth ---------------- */
  function leaveLanding() { document.body.classList.remove('landing'); }

  /* ---------------- Public landing page ---------------- */
  function renderLanding() {
    document.body.classList.add('landing');
    var heroFaces = [
      { skin: '#F0C39C', hair: 'short', hairColor: '#5A3825', glasses: 'round' },
      { skin: '#6B4423', hair: 'afro', hairColor: '#2B2520' },
      { skin: '#E0A878', hair: 'hijab', hairColor: '#0CA8A8' },
      { skin: '#F8D5B5', hair: 'long', hairColor: '#D7A94B' },
      { skin: '#A6724C', hair: 'curly', hairColor: '#2C2622' }
    ].map(function (c) { return '<span class="av">' + buildAvatar(c, 62) + '</span>'; }).join('');

    function feature(bg, color, glyph, title, body) {
      return '<div class="fcard"><div class="ic" style="background:' + bg + ';color:' + color + '">' + glyph + '</div>' +
        '<h3>' + title + '</h3><p>' + body + '</p></div>';
    }

    el('screen').innerHTML =
      '<div class="land">' +
        '<header class="lnav">' +
          '<span class="wordmark">Parent<span>Recall</span></span>' +
          '<button class="lnav-login" id="lNavLogin">Log in</button>' +
        '</header>' +

        '<section class="lhero">' +
          '<span class="leyebrow">Built for parents, by parents</span>' +
          '<h1>Never blank on a name at the school gate again.</h1>' +
          '<p class="sub">ParentRecall is your private memory aid for your children\u2019s classmates, their parents, and the coaches \u2014 the names, the faces, and the little details that bring them back.</p>' +
          '<div class="lcta">' +
            '<button class="btn-primary" id="lGet">Get started \u2014 it\u2019s free</button>' +
            '<button class="btn-ghost" id="lLogin">I already have an account</button>' +
          '</div>' +
          '<p class="lfree">Free to register and use \u2014 no card, no catch.</p>' +
          '<div class="lavatars">' + heroFaces + '</div>' +
          '<p class="ltrust">Private by design \u00b7 No photos of children, ever</p>' +
        '</section>' +

        '<section class="lband"><div class="lwrap">' +
          '<h2>You know the moment.</h2>' +
          '<p>A parent waves hello and you smile back, scrambling \u2014 is that Oscar\u2019s mum? The swim coach? The name is right there, just out of reach. ParentRecall keeps all of it in one private place, so it\u2019s ready before you need it.</p>' +
        '</div></section>' +

        '<section class="lsteps"><div class="lwrap">' +
          '<h2>How it works</h2>' +
          '<ol>' +
            '<li><div><div class="st">Add your child\u2019s clubs &amp; classes</div><div class="sd">Their class, swimming, football \u2014 whatever groups you need to remember people from.</div></div></li>' +
            '<li><div><div class="st">Add the people, with a face</div><div class="sd">Build a friendly cartoon avatar for each one \u2014 and jot the detail that jogs your memory.</div></div></li>' +
            '<li><div><div class="st">Find them fast, or practise</div><div class="sd">Search by name or a detail in a tap, or run quick flashcards until the names stick.</div></div></li>' +
          '</ol>' +
        '</div></section>' +

        '<section class="lfeatures"><div class="lwrap">' +
          '<h2>Everything you need to remember everyone</h2>' +
          '<div class="fgrid">' +
            feature('#FFEDE3', '#F2641E', '\uD83C\uDFA8', 'Cartoon avatars', 'Build a friendly face for everyone. No real photos of children, ever.') +
            feature('#E1F5F5', '#0CA8A8', '\uD83D\uDD0E', 'Find anyone', 'Blanking at the gate? Search by name \u2014 or a detail like \u201cred Audi\u201d.') +
            feature('#EAEFFB', '#18306C', '\uD83E\uDDE0', 'Practise mode', 'Flashcards that help a whole new class\u2019s names actually stick.') +
            feature('#FEF3DA', '#B07D11', '\uD83C\uDF82', 'Birthday reminders', 'A gentle nudge so you can say happy birthday at drop-off.') +
            feature('#EAEFFB', '#18306C', '\uD83D\uDC6A', 'Two parents, one account', 'Invite your partner so you\u2019re both covered, on the same lists.') +
            feature('#E1F5F5', '#0CA8A8', '\uD83D\uDCCB', 'Set up in minutes', 'Paste a class list or import a spreadsheet to add everyone at once.') +
          '</div>' +
        '</div></section>' +

        '<section class="lprivacy"><div class="lwrap">' +
          '<span class="peyebrow">Built private</span>' +
          '<h2>Your family\u2019s memory, and nobody else\u2019s.</h2>' +
          '<ul>' +
            '<li><span class="ck">\u2713</span><span>No photos of other people\u2019s children \u2014 ever. Faces are friendly cartoon avatars you build.</span></li>' +
            '<li><span class="ck">\u2713</span><span>Surnames are shortened automatically \u2014 \u201cJohn Smith\u201d becomes \u201cJohn Sm\u201d.</span></li>' +
            '<li><span class="ck">\u2713</span><span>No social feed, no sharing, no discovery. Your list is yours alone.</span></li>' +
            '<li><span class="ck">\u2713</span><span>Export or delete everything, whenever you like.</span></li>' +
          '</ul>' +
        '</div></section>' +

        '<section class="lfinal"><div class="lwrap">' +
          '<h2>Walk in already knowing.</h2>' +
          '<button class="btn-primary" id="lGet2">Get started \u2014 it\u2019s free</button>' +
          '<button class="btn-ghost-light" id="lLogin2">Log in</button>' +
        '</div></section>' +

        '<footer class="lfoot">' +
          '<span class="wordmark">Parent<span>Recall</span></span>' +
          '<div class="lfootlinks"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/cookies">Cookies</a><a href="/delete-account">Delete account</a><a href="#" id="lFeedback">Feedback</a><a href="mailto:team@parentrecall.com">Contact</a></div>' +
          '<p>A Pacedall Labs product. \u00a9 2026.</p>' +
        '</footer>' +
      '</div>';

    var get = function () { leaveLanding(); renderAuth('register'); };
    var login = function () { leaveLanding(); renderAuth('login'); };
    el('lGet').onclick = get;
    el('lGet2').onclick = get;
    el('lNavLogin').onclick = login;
    el('lLogin').onclick = login;
    el('lLogin2').onclick = login;
    var lfb = el('lFeedback'); if (lfb) lfb.onclick = function (e) { e.preventDefault(); sheetFeedback(); };
    window.scrollTo(0, 0);
  }

  // structural mirror of the server policy (the common-password screen is server-side)
  function clientPwError(pw) {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Za-z]/.test(pw)) return 'Password must include at least one letter.';
    if (!/[0-9]/.test(pw)) return 'Password must include at least one number.';
    if ((pw.match(/[^A-Za-z0-9]/g) || []).length < 2) return 'Password must include at least two symbols (e.g. ! ? # $ @).';
    return null;
  }

  function bindPwEyes() {
    Array.prototype.forEach.call(document.querySelectorAll('.pweye'), function (b) {
      b.onclick = function () {
        var inp = el(b.getAttribute('data-eye')); if (!inp) return;
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.innerHTML = show ? ICON.eyeOff : ICON.eye;
        b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      };
    });
  }

  function renderAuth(mode, errMsg) {
    leaveLanding();
    mode = mode || 'login';
    var screen = el('screen');
    var isLogin = mode === 'login';
    screen.innerHTML =
      '<div class="auth">' +
        '<img class="logo" src="/logo.png" alt="Parent Recall — Remember Everything"/>' +
        '<p class="blurb">' + (isLogin ? 'Welcome back. Sign in to your private list.' : 'Your private memory aid for every name at the school gate. Free, and yours alone.') + '</p>' +
        (errMsg ? '<div class="err">' + esc(errMsg) + '</div>' : '') +
        '<form id="authForm">' +
          (isLogin ? '' :
            '<label>Your name <span class="opt">optional</span></label>' +
            '<input class="f" id="a_name" placeholder="e.g. Sam" autocomplete="name"/>') +
          '<label>Email</label>' +
          '<input class="f" id="a_email" type="email" placeholder="you@example.com" autocomplete="email"/>' +
          '<label>Password</label>' +
          '<div class="pwwrap"><input class="f" id="a_pass" type="password" placeholder="' + (isLogin ? 'Your password' : '8+ characters') + '" autocomplete="' + (isLogin ? 'current-password' : 'new-password') + '"/><button type="button" class="pweye" data-eye="a_pass" aria-label="Show password" tabindex="-1">' + ICON.eye + '</button></div>' +
          (isLogin ? '' : '<p class="hint pwreq">Use 8 or more characters, with letters, at least one number, and at least two symbols.</p>') +
          (isLogin ? '<label class="keepme"><input type="checkbox" id="keepSignedIn" checked/><span>Keep me signed in on this device</span></label>' : '') +
          (isLogin ? '' : '<label class="agreebox"><input type="checkbox" id="a_agree"/><span>I have read and agree to the <a href="/terms" target="_blank" rel="noopener">Terms &amp; Conditions</a>, <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="/cookies" target="_blank" rel="noopener">Cookie Policy</a>.</span></label>') +
          '<button class="save" id="authBtn" type="submit">' + (isLogin ? 'Sign in' : 'Create account') + '</button>' +
        '</form>' +
        
        (isLogin ? '<div class="toggle" style="margin-top:14px"><button id="forgotLink" type="button">Forgot password?</button></div>' : '') +
        '<div class="toggle">' + (isLogin ? "New here? " : 'Already have an account? ') +
          '<button id="authToggle" type="button">' + (isLogin ? 'Create an account' : 'Sign in') + '</button>' +
        '</div>' +
        '<div class="toggle"><button id="authHome" type="button">\u2190 Back to home</button></div>' +
      '</div>';

    el('authToggle').onclick = function () { renderAuth(isLogin ? 'register' : 'login'); };
    el('authHome').onclick = function () { renderLanding(); };
    var agreeBox = el('a_agree');
    if (agreeBox) { el('authBtn').disabled = true; agreeBox.onchange = function () { el('authBtn').disabled = !agreeBox.checked; }; }
    var fl = el('forgotLink'); if (fl) fl.onclick = function () { renderForgot(el('a_email') ? el('a_email').value.trim() : ''); };
    el('authForm').onsubmit = function (e) {
      e.preventDefault();
      var btn = el('authBtn');
      var email = el('a_email').value.trim();
      var pass = el('a_pass').value;
      var name = isLogin ? '' : (el('a_name') ? el('a_name').value.trim() : '');
      var accepted = el('a_agree') ? el('a_agree').checked : true;
      if (!isLogin && !accepted) { return; }
      if (!isLogin) { var pe = clientPwError(pass); if (pe) { renderAuth(mode, pe); return; } }
      btn.disabled = true; btn.textContent = 'Please wait…';
      api(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', body: { email: email, password: pass, name: name, acceptedTerms: accepted } })
        .then(function (data) {
          token = data.token; me = data.user;
          var keep = el('keepSignedIn');
          saveToken(token, (isLogin && keep) ? keep.checked : true);
          boot();
        })
        .catch(function (err) { renderAuth(mode, err.message); });
    };
    bindPwEyes();
    setTimeout(function () { var f = el(isLogin ? 'a_email' : 'a_email'); if (f) f.focus(); }, 60);
  }

  function signOut() {
    token = null; me = null;
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    children = []; clubs = []; people = [];
    state = { view: 'home', childId: null, clubId: null, personId: null };
    renderLanding();
  }

  /* ---------------- Forgot / reset password ---------------- */
  function renderForgot(prefill, errMsg) {
    el('screen').innerHTML =
      '<div class="auth">' +
        '<img class="logo" src="/logo.png" alt="Parent Recall — Remember Everything"/>' +
        '<p class="blurb">Enter your email and we\u2019ll send you a link to reset your password.</p>' +
        (errMsg ? '<div class="err">' + esc(errMsg) + '</div>' : '') +
        '<form id="forgotForm">' +
          '<label>Email</label>' +
          '<input class="f" id="fp_email" type="email" placeholder="you@example.com" autocomplete="email" value="' + attr(prefill || '') + '"/>' +
          '<button class="save" id="fpBtn" type="submit">Send reset link</button>' +
        '</form>' +
        '<div class="toggle"><button id="fpBack" type="button">Back to sign in</button></div>' +
      '</div>';
    el('fpBack').onclick = function () { renderAuth('login'); };
    el('forgotForm').onsubmit = function (e) {
      e.preventDefault();
      var btn = el('fpBtn'); var email = el('fp_email').value.trim();
      btn.disabled = true; btn.textContent = 'Sending…';
      api('/auth/forgot', { method: 'POST', body: { email: email } })
        .then(function () { renderForgotSent(email); })
        .catch(function (err) { renderForgot(email, err.message); });
    };
    setTimeout(function () { var f = el('fp_email'); if (f) f.focus(); }, 60);
  }

  function renderForgotSent(email) {
    el('screen').innerHTML =
      '<div class="auth">' +
        '<img class="logo" src="/logo.png" alt="Parent Recall — Remember Everything"/>' +
        '<div style="font-family:Poppins;font-weight:800;font-size:20px;color:var(--navy);margin-bottom:8px">Check your email</div>' +
        '<p class="blurb">If an account exists for <b>' + esc(email) + '</b>, we\u2019ve sent a link to reset your password. It expires in 1 hour.</p>' +
        '<div class="toggle"><button id="fsBack" type="button">Back to sign in</button></div>' +
      '</div>';
    el('fsBack').onclick = function () { renderAuth('login'); };
  }

  function renderReset(resetToken, errMsg) {
    el('screen').innerHTML =
      '<div class="auth">' +
        '<img class="logo" src="/logo.png" alt="Parent Recall — Remember Everything"/>' +
        '<p class="blurb">Choose a new password for your account.</p>' +
        (errMsg ? '<div class="err">' + esc(errMsg) + '</div>' : '') +
        '<form id="resetForm">' +
          '<label>New password</label>' +
          '<div class="pwwrap"><input class="f" id="rp_pass" type="password" placeholder="8+ characters" autocomplete="new-password"/><button type="button" class="pweye" data-eye="rp_pass" aria-label="Show password" tabindex="-1">' + ICON.eye + '</button></div>' +
          '<p class="hint pwreq">Use 8 or more characters, with letters, at least one number, and at least two symbols.</p>' +
          '<button class="save" id="rpBtn" type="submit">Update password</button>' +
        '</form>' +
        '<div class="toggle"><button id="rpBack" type="button">Back to sign in</button></div>' +
      '</div>';
    el('rpBack').onclick = function () { renderAuth('login'); };
    el('resetForm').onsubmit = function (e) {
      e.preventDefault();
      var btn = el('rpBtn'); var pass = el('rp_pass').value;
      var pe = clientPwError(pass);
      if (pe) { renderReset(resetToken, pe); return; }
      btn.disabled = true; btn.textContent = 'Updating…';
      api('/auth/reset', { method: 'POST', body: { token: resetToken, password: pass } })
        .then(function () { renderAuth('login'); toast('Password updated — please sign in.'); })
        .catch(function (err) { renderReset(resetToken, err.message); });
    };
    bindPwEyes();
    setTimeout(function () { var f = el('rp_pass'); if (f) f.focus(); }, 60);
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; }, 3200);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3700);
  }

  function loadMe() {
    return api('/auth/me').then(function (d) {
      me = d.user;
      household = d.household || { role: null, isAdmin: false, partner: null, adminEmail: null };
      return d.user;
    });
  }
  function isAdmin() { return !household || household.isAdmin !== false; }

  /* ---------------- Data loaders ---------------- */
  function loadChildren() {
    return api('/children').then(function (rows) { children = rows; return rows; });
  }
  function loadClubs(childId) {
    if (!childId) { clubs = []; return Promise.resolve([]); }
    return api('/clubs?childId=' + childId).then(function (rows) { clubs = rows; return rows; });
  }
  function loadPeople(clubId) {
    return api('/people?clubId=' + clubId).then(function (rows) { people = rows; return rows; });
  }

  /* ---------------- Render ---------------- */
  function render() {
    leaveLanding();
    var screen = el('screen');
    if (state.view === 'find') screen.innerHTML = renderFind();
    else if (state.view === 'quiz') screen.innerHTML = renderQuiz();
    else if (state.view === 'profile') screen.innerHTML = renderProfile();
    else if (state.view === 'club') screen.innerHTML = renderClub();
    else screen.innerHTML = renderHome();
    bind();
  }

  function childById(id) { return children.find(function (c) { return c.id === id; }); }
  function clubById(id) { return clubs.find(function (c) { return c.id === id; }); }
  function personById(id) { return people.find(function (p) { return p.id === id; }); }

  function hasDemo() { return children.some(function (c) { return c.is_demo; }); }
  function seedDemo() { return api('/demo/seed', { method: 'POST' }).then(function () { boot(); }).catch(function (e) { alert(e.message); }); }
  function clearDemo() { return api('/demo/clear', { method: 'POST' }).then(function () { boot(); }).catch(function (e) { alert(e.message); }); }

  // First-run guidance: a 3-step "getting started" card shown until the user
  // has added their first person. Step 1 = child, 2 = clubs, 3 = people.
  function gettingStarted(step, ctx) {
    var labels = ['Add a child', 'Add clubs', 'Add people'];
    var head = {
      1: { h: 'Welcome' + (me && me.name ? ', ' + esc(me.name) : '') + ' \u2014 let\u2019s set you up', p: 'ParentRecall remembers the people around your child, so you don\u2019t have to. Three quick steps and you\u2019re away.', cta: 'Add your first child' },
      2: { h: 'Nice \u2014 now add a class or club', p: 'Add ' + (ctx ? esc(ctx) + '\u2019s' : 'their') + ' class, swimming, football \u2014 any group where you need to remember people.', cta: 'Add a club or class' },
      3: { h: 'Last step \u2014 add someone to remember', p: 'A first name is all you need. Build a quick cartoon face, and add the little details whenever they come back to you.', cta: 'Add the first person' }
    }[step];
    var track = '<div class="gstrack">' + labels.map(function (label, idx) {
      var n = idx + 1;
      var cls = n < step ? ' done' : (n === step ? ' now' : '');
      var inner = n < step ? '\u2713' : String(n);
      return '<div class="gstep' + cls + '"><span class="gsnum">' + inner + '</span><span class="gslabel">' + label + '</span></div>';
    }).join('<span class="gsbar"></span>') + '</div>';
    return '<div class="getstarted">' +
      '<div class="gseyebrow">Getting started</div>' +
      '<div class="gshead">' + head.h + '</div>' +
      '<p class="gssub">' + head.p + '</p>' +
      track +
      '<button class="save gscta" id="gsCta">' + head.cta + '</button>' +
      (step === 1 ? '<button class="gsdemo" id="gsDemo">Or explore with sample data first</button>' : '') +
    '</div>';
  }

  function renderHome() {
    var child = childById(state.childId) || children[0];
    var admin = isAdmin();
    var opts = children.map(function (c) {
      return '<option value="' + c.id + '"' + (child && c.id === child.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('') + (admin ? '<option value="__add">\u2795  Add a child\u2026</option>' : '');

    var rows;
    if (!children.length) {
      rows = admin
        ? gettingStarted(1)
        : '<div class="empty"><div class="big">Nothing here yet</div><p>Your account admin hasn\u2019t added a child yet. Once they do, their clubs and people will appear here for you too.</p></div>';
    } else if (!clubs.length) {
      rows = gettingStarted(2, child.name);
    } else {
      rows = clubs.map(function (c) {
        return '<button class="row" data-club="' + c.id + '">' +
          '<span class="dot" style="background:' + raw(c.color) + '">' + esc((c.name || '?').charAt(0)) + '</span>' +
          '<span class="meta"><span class="rname">' + esc(c.name) + '</span><span class="rsub">' + esc(c.sub || '') + '</span></span>' +
          '<span class="count">' + (c.people_count || 0) + '</span>' + ICON.chev +
        '</button>';
      }).join('');
    }

    var clubsBlock = children.length
      ? '<div class="eyebrow">' + esc(child.name) + '\u2019s clubs &amp; classes</div>' +
        '<div class="list">' + rows +
          '<button class="addtile" id="addClub"><span class="pl">' + ICON.plus + '</span>Add a club or class</button>' +
        '</div>'
      : '<div class="list" style="margin-top:8px">' + rows +
          (admin ? '<button class="addtile" id="addChildBtn"><span class="pl">' + ICON.plus + '</span>Add a child</button>' : '') +
        '</div>';

    var banner = (me && me.email_verified === false)
      ? '<div class="banner"><span>Verify your email — we sent a link to <b>' + esc(me.email) + '</b>.</span><button id="verifyResend">Resend</button></div>'
      : '';

    return '<div class="topbar"><span class="wordmark-sm">Parent<span>Recall</span></span>' +
        '<span style="display:flex;gap:8px">' +
          '<button class="iconbtn" id="findBtn" aria-label="Find anyone">' + ICON.search + '</button>' +
          '<button class="iconbtn" id="accountBtn" aria-label="Account">' + ICON.gear + '</button>' +
        '</span></div>' +
      '<header><img class="logo" src="/logo.png" alt="Parent Recall — Remember Everything"/></header>' +
      banner +
      (children.length ?
        '<div class="pick"><div class="lbl">Whose groups?</div><div class="selectpill">' +
          '<select id="childSel" aria-label="Choose which child’s groups to view">' + opts + '</select>' +
          '<span class="av">' + ICON.down + '</span></div>' +
          (admin ? '<button class="ministep" id="editChild">' + ICON.edit + 'Rename or remove ' + esc(child.name) + '</button>' : '') +
        '</div>' : '') +
      clubsBlock;
  }

  function renderClub() {
    var c = clubById(state.clubId);
    if (!c) { state.view = 'home'; return renderHome(); }
    var child = childById(c.child_id) || { name: 'Back' };
    var rows = people.length
      ? people.map(function (p) {
          var sub = p.parents ? esc(p.parents) + (p.role ? ' \u00b7 ' + esc(p.role) : '') : esc(p.role || 'Tap to add details');
          return '<button class="prow" data-person="' + p.id + '">' + avatarFor(p, raw(c.color), 46) +
            '<span class="meta"><span class="nm">' + esc(p.name) + ptypeTag(p) + (p.birthday ? '<span class="bdaydot"></span>' : '') + '</span>' +
            '<span class="who">' + sub + '</span></span>' + ICON.chev + '</button>';
        }).join('')
      : gettingStarted(3);

    return '<div class="topbar"><button class="back" id="back">' + ICON.back + esc(child.name) + '</button>' +
        '<button class="iconbtn" id="editClub" aria-label="Edit club">' + ICON.edit + '</button></div>' +
      '<div class="title"><h2>' + esc(c.name) + '</h2><p>' + (c.sub ? esc(c.sub) + ' · ' : '') +
        people.length + ' ' + (people.length === 1 ? 'person' : 'people') + '</p></div>' +
      (clubs.length > 1 ? '<div class="pick clubswitch"><div class="selectpill"><select id="clubSwitch" aria-label="Switch to another club or class">' +
        clubs.map(function (k) { return '<option value="' + k.id + '"' + (k.id === c.id ? ' selected' : '') + '>' + esc(k.name) + (k.sub ? ' \u2014 ' + esc(k.sub) : '') + '</option>'; }).join('') +
        '</select><span class="av">' + ICON.down + '</span></div></div>' : '') +
      '<div class="list">' + rows +
        '<button class="addtile" id="addPerson"><span class="pl">' + ICON.plus + '</span>Add someone</button>' +
        '<button class="ministep center" id="pasteList">' + ICON.plus + 'Paste a whole list at once</button>' +
        '<button class="ministep center" id="importList">' + ICON.sheet + 'Import from a spreadsheet</button>' +
        (people.length ? '<button class="ministep center" id="printBtn">' + ICON.print + 'Print / save as PDF' + '</button>' : '') +
      '</div>';
  }

  function renderProfile() {
    var p = personById(state.personId);
    var c = clubById(state.clubId);
    if (!p || !c) { state.view = 'club'; return renderClub(); }
    return '<div class="topbar"><button class="back" id="back">' + ICON.back + esc(c.name) + '</button>' +
        '<span class="wordmark-sm">Parent<span>Recall</span></span></div>' +
      '<div class="profile"><div class="phead">' + avatarFor(p, raw(c.color), 92) +
        '<h2>' + esc(p.name) + '</h2>' +
        (p.ptype ? '<div>' + ptypeTag(p) + '</div>' : '') +
        (p.role ? '<div class="role">' + esc(p.role) + '</div>' : '') +
        '<span class="pin" style="background:' + raw(c.color) + '">' + esc(c.name) + '</span></div>' +
      '<div class="pcardx"><div class="h">What jogs your memory</div><div class="b">' +
        (p.hooks ? esc(p.hooks) : 'Nothing yet \u2014 tap Edit to add the little details (the car, the job, where they sit) that bring the name back.') + '</div></div>' +
      ((p.parents_list || p.parents) ? '<div class="pcardx muted"><div class="h">Parents / carers</div><div class="b">' + parentsHtml(p) + '</div></div>' : '') +
      (p.birthday ? '<div class="bchip"><span class="ic">' + ICON.cake + '</span>Birthday · ' + esc(p.birthday) + '</div>' : '') +
      '<div class="profile-actions"><button class="btn-edit" id="editPerson">Edit details</button>' +
        '<button class="btn-del" id="delPerson">Delete</button></div>' +
      '</div>';
  }

  /* ---------------- Find (search across all clubs) ---------------- */
  var findResults = [];
  var findTimer = null;
  function renderFind() {
    return '<div class="topbar"><button class="back" id="back">' + ICON.back + 'Home</button>' +
        '<span class="wordmark-sm">Parent<span>Recall</span></span></div>' +
      '<div class="findbar"><div class="findinput">' +
        ICON.search +
        '<input id="findInput" aria-label="Find anyone by name or a detail" placeholder="Find anyone \u2014 a name or a detail\u2026" autocomplete="off" autofocus/>' +
      '</div></div>' +
      '<div id="findResults" class="results"></div>';
  }
  function runFind(q) {
    if (!q) { el('findResults').innerHTML = '<div class="empty"><p>Type a name, or a detail you do remember \u2014 \u201cred Audi\u201d, \u201cglasses\u201d, \u201cclass rep\u201d.</p></div>'; return; }
    api('/people/search?q=' + encodeURIComponent(q)).then(function (rows) {
      findResults = rows;
      if (!rows.length) { el('findResults').innerHTML = '<div class="empty"><div class="big">Nothing matches \u201c' + esc(q) + '\u201d</div></div>'; return; }
      el('findResults').innerHTML = rows.map(function (r) {
        var snippet = r.hooks || r.role || r.parents || '';
        return '<button class="rcard" data-find="' + r.id + '">' + avatarFor(r, raw(r.club_color), 46) +
          '<span style="flex:1;min-width:0">' +
            '<span class="rgtag" style="background:' + raw(r.club_color) + '">' + esc(r.child_name) + ' \u00b7 ' + esc(r.club_name) + '</span>' +
            '<div class="rname">' + esc(r.name) + '</div>' +
            (snippet ? '<div class="rhook">' + esc(snippet) + '</div>' : '') +
          '</span></button>';
      }).join('');
    }).catch(function () {});
  }
  function openFoundPerson(r) {
    state.childId = r.child_id;
    loadClubs(r.child_id)
      .then(function () { state.clubId = r.club_id; return loadPeople(r.club_id); })
      .then(function () { state.personId = r.id; state.view = 'profile'; render(); window.scrollTo(0, 0); });
  }

  /* ---------------- Practise (flashcards + light spaced repetition) ---------------- */
  var quiz = { list: [], idx: 0, show: false, got: 0, missed: [], color: 'blue' };
  function statKey(id) { return 'pr_stat_' + id; }
  function getStat(id) { try { return JSON.parse(localStorage.getItem(statKey(id))) || { seen: 0, missed: 0 }; } catch (e) { return { seen: 0, missed: 0 }; } }
  function setStat(id, s) { try { localStorage.setItem(statKey(id), JSON.stringify(s)); } catch (e) {} }
  function startQuiz(list, color) {
    // weight: previously-missed first, then new, with a little randomness
    var ordered = list.map(function (p) {
      var st = getStat(p.id);
      return { p: p, w: st.missed * 3 + (st.seen === 0 ? 2 : 0) + Math.random() };
    }).sort(function (a, b) { return b.w - a.w; }).map(function (x) { return x.p; });
    quiz = { list: ordered, idx: 0, show: false, got: 0, missed: [], color: color };
    state.view = 'quiz'; render(); window.scrollTo(0, 0);
  }
  function answerQuiz(knew) {
    var p = quiz.list[quiz.idx];
    var st = getStat(p.id); st.seen += 1; if (!knew) { st.missed += 1; quiz.missed.push(p); } else { st.missed = Math.max(0, st.missed - 1); quiz.got += 1; }
    setStat(p.id, st);
    quiz.idx += 1; quiz.show = false; render(); window.scrollTo(0, 0);
  }
  function renderQuiz() {
    if (quiz.idx >= quiz.list.length) {
      var total = quiz.list.length;
      return '<div class="topbar"><button class="back" id="back">' + ICON.back + 'Back</button><span class="wordmark-sm">Parent<span>Recall</span></span></div>' +
        '<div class="quizdone"><div class="qbig">' + quiz.got + ' / ' + total + '</div>' +
        '<p>' + (quiz.got === total ? 'Perfect \u2014 you know everyone!' : 'Nice work. Practice sticks \u2014 the ones you missed will come up first next time.') + '</p>' +
        (quiz.missed.length ? '<button class="save" id="quizMissed">Practise the ' + quiz.missed.length + ' you missed</button>' : '') +
        '<button class="cancel" id="quizDone">Done</button></div>';
    }
    var p = quiz.list[quiz.idx];
    var color = raw(quiz.color);
    return '<div class="topbar"><button class="back" id="back">' + ICON.back + 'Stop</button>' +
        '<span class="qprog">' + (quiz.idx + 1) + ' / ' + quiz.list.length + '</span></div>' +
      '<div class="quiz">' +
        '<div class="qcard">' +
          '<span class="qavatar">' + avatarFor(p, color, 150) + '</span>' +
          (quiz.show
            ? '<div class="qname">' + esc(p.name) + '</div>' + (p.role ? '<div class="qrole">' + esc(p.role) + '</div>' : '')
            : '<div class="qprompt">Who is this?</div>') +
        '</div>' +
        (quiz.show
          ? '<div class="qbtns"><button class="qmiss" id="qMiss">Didn\u2019t know</button><button class="qgot" id="qGot">Got it</button></div>'
          : '<button class="save" id="qReveal">Reveal name</button>') +
      '</div>';
  }

  /* ---------------- Print / save as PDF ---------------- */
  function printClub() {
    var c = clubById(state.clubId);
    var cells = people.map(function (p) {
      var face;
      try { face = p.avatar ? buildAvatar(JSON.parse(p.avatar), 110) : ''; } catch (e) { face = ''; }
      if (!face) face = '<span class="psil" style="background:' + raw(c.color) + '22"></span>';
      return '<div class="pcell">' + face + '<div class="pcn">' + esc(p.name) + '</div>' +
        (p.role ? '<div class="pcr">' + esc(p.role) + '</div>' : '') + '</div>';
    }).join('');
    el('printArea').innerHTML = '<h1>' + esc(c.name) + (c.sub ? ' \u00b7 ' + esc(c.sub) : '') + '</h1><div class="pgrid">' + cells + '</div>';
    window.print();
  }

  /* ---------------- Sheets ---------------- */
  function show() { el('scrim').classList.add('show'); }
  function hide() { el('scrim').classList.remove('show'); el('sheet').innerHTML = ''; }

  function sheetChild() {
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Add a child</h3>' +
      '<p class="lead">Just their name. They\u2019ll appear in the dropdown, ready for their clubs and classes.</p>' +
      '<label>Child\u2019s name <span class="req">·required</span></label>' +
      '<input class="f" id="f_cname" placeholder="e.g. Charlotte" autocomplete="off"/>' +
      '<button class="save" id="saveBtn" disabled>Add child</button>' +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show(); wireSheet('f_cname', function () {
      var name = el('f_cname').value.trim();
      return api('/children', { method: 'POST', body: { name: name } }).then(function (row) {
        return loadChildren().then(function () {
          state.childId = row.id; state.view = 'home';
          return loadClubs(row.id);
        });
      });
    });
  }

  function sheetClub() {
    var child = childById(state.childId);
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Add a club or class</h3>' +
      '<p class="lead">For <b>' + esc(child.name) + '</b>. A name is enough \u2014 add the day or place if it helps.</p>' +
      '<label>Name <span class="req">·required</span></label>' +
      '<input class="f" id="f_gname" placeholder="e.g. Swimming, Year 2, Beavers" autocomplete="off"/>' +
      '<label>When / where <span class="opt">optional</span></label>' +
      '<input class="f" id="f_gsub" placeholder="e.g. Tadpoles · Tue 5pm" autocomplete="off"/>' +
      '<button class="save" id="saveBtn" disabled>Add club</button>' +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show(); wireSheet('f_gname', function () {
      var body = { childId: state.childId, name: el('f_gname').value.trim(), sub: el('f_gsub').value.trim() };
      return api('/clubs', { method: 'POST', body: body }).then(function (row) {
        return loadClubs(state.childId).then(function () {
          state.view = 'club'; state.clubId = row.id;
          return loadPeople(row.id);
        });
      });
    });
  }

  function sheetPerson(edit) {
    var p = edit ? personById(state.personId) : null;
    // initial avatar config
    var cfg = newAvatar();
    if (p && p.avatar) { try { cfg = normalizeAvatar(JSON.parse(p.avatar)); } catch (e) {} }
    var ptype = (p && p.ptype) || '';
    var nm0 = (p && p.name) ? String(p.name).trim().replace(/\s+/g, ' ') : '';
    var nmSp = nm0.indexOf(' ');
    var firstVal = (nmSp >= 0 ? nm0.slice(0, nmSp) : nm0).slice(0, 15);
    var lastVal = nmSp >= 0 ? nm0.slice(nmSp + 1).slice(0, 3) : '';
    var PTYPES = [['child', 'Child'], ['parent', 'Parent/Carer'], ['teacher', 'Teacher'], ['instructor', 'Instructor'], ['coach', 'Coach'], ['assistant', 'Assistant'], ['other', 'Other']];
    var parentsInit = [];
    if (p) {
      if (p.parents_list) { try { parentsInit = JSON.parse(p.parents_list) || []; } catch (e) { parentsInit = []; } }
      if (!parentsInit.length && p.parents) parentsInit = [{ name: p.parents, label: '' }]; // legacy free-text into row 1
    }
    function parentRow(idx) {
      var e = parentsInit[idx] || { name: '', label: '' };
      var opts = [['', 'Relationship\u2026'], ['mother', 'Mother'], ['father', 'Father'], ['other', 'Other']]
        .map(function (o) { return '<option value="' + o[0] + '"' + (e.label === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
      return '<div class="parentrow">' +
        '<input class="f" id="f_par' + idx + '" maxlength="15" placeholder="Name" value="' + attr(e.name || '') + '" autocomplete="off"/>' +
        '<select class="f psel" id="f_parlabel' + idx + '">' + opts + '</select></div>';
    }

    function swatches(list, key, kind) {
      return list.map(function (v) {
        var sel = cfg[key] === v ? ' sel' : '';
        return '<button type="button" class="swatch' + sel + '" data-' + kind + '="' + v + '" style="background:' + v + '"></button>';
      }).join('');
    }
    function chips(list, key, kind, labels) {
      return list.map(function (v) {
        var sel = cfg[key] === v ? ' sel' : '';
        return '<button type="button" class="chip' + sel + '" data-' + kind + '="' + v + '">' + labels[v] + '</button>';
      }).join('');
    }

    el('sheet').innerHTML =
      '<div class="grab"></div><h3>' + (edit ? 'Edit details' : 'Add someone') + '</h3>' +
      '<div class="avbuilder">' +
        '<div class="avpreviewwrap"><span class="avpreview" id="avPreview">' + buildAvatar(cfg, 76) + '</span>' +
        '<button type="button" class="shuffle" id="avShuffle">' + ICON.shuffle + 'Shuffle</button></div>' +
        '<div class="avcontrols">' +
          '<div class="avlabel">Skin</div><div class="swatchrow" id="skinRow">' + swatches(SKIN, 'skin', 'skin') + '</div>' +
          '<div class="avlabel">Hair colour</div><div class="swatchrow" id="hcRow">' + swatches(HAIRCOL, 'hairColor', 'haircolor') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="avlabel">Hair style</div><div class="chiprow" id="hairRow">' + chips(HAIRSTYLE, 'hair', 'hair', HAIRLABEL) + '</div>' +
      '<div class="avlabel">Glasses</div><div class="chiprow" id="glassRow">' + chips(GLASSES, 'glasses', 'glasses', GLASSLABEL) + '</div>' +
      '<div class="avlabel">Background</div><div class="swatchrow" id="bgRow">' + swatches(BG, 'bg', 'bg') + '</div>' +
      '<label>First name <span class="req">·required</span></label>' +
      '<input class="f" id="f_fname" maxlength="15" placeholder="e.g. Oscar" value="' + attr(firstVal) + '" autocomplete="off"/>' +
      '<label>Last name <span class="opt">optional · first 3 letters only, for privacy</span></label>' +
      '<input class="f" id="f_lname" maxlength="3" placeholder="e.g. Smi" value="' + attr(lastVal) + '" autocomplete="off"/>' +
      '<div class="avlabel">Type <span class="opt" style="text-transform:none;letter-spacing:0">optional</span></div>' +
      '<div class="chiprow" id="ptypeRow">' + PTYPES.map(function (o) {
        return '<button type="button" class="chip' + (ptype === o[0] ? ' sel' : '') + '" data-ptype="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>' +
      '<label>Who are they? <span class="opt">optional</span></label>' +
      '<input class="f" id="f_role" placeholder="e.g. Charlotte\u2019s best friend / the coach" value="' + (p ? attr(p.role) : '') + '" autocomplete="off"/>' +
      '<label>Parents / carers <span class="opt">optional</span></label>' +
      parentRow(0) + parentRow(1) +
      '<label>What jogs your memory <span class="opt">optional</span></label>' +
      '<textarea class="f" id="f_hooks" rows="3" placeholder="Red Audi · always in running gear · sits front-left">' + (p ? esc(p.hooks) : '') + '</textarea>' +
      '<div class="chiprow hookchips" id="hookChips">' +
        ['Car', 'Job', 'Where they live', 'Looks like', 'Friends with'].map(function (l) { return '<button type="button" class="chip hookchip" data-hook="' + l + '">+ ' + l + '</button>'; }).join('') +
      '</div>' +
      '<p class="hint">Tap a prompt or just type \u2014 the car, the job, where they sit, who they\u2019re friends with.</p>' +
      '<label>Birthday <span class="opt">optional</span></label>' +
      '<input class="f" id="f_bday" placeholder="e.g. 12 March" value="' + (p ? attr(p.birthday) : '') + '" autocomplete="off"/>' +
      '<button class="save" id="saveBtn"' + (p ? '' : ' disabled') + '>' + (edit ? 'Save' : 'Add') + '</button>' +
      (edit ? '' : '<button class="save secondary" id="saveAnotherBtn" disabled>Save &amp; add another</button>') +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show();

    function refresh() { el('avPreview').innerHTML = buildAvatar(cfg, 76); }
    function pick(rowId, kind, key) {
      Array.prototype.forEach.call(el(rowId).querySelectorAll('[data-' + kind + ']'), function (b) {
        b.onclick = function () {
          cfg[key] = b.getAttribute('data-' + kind);
          Array.prototype.forEach.call(el(rowId).children, function (x) { x.classList.remove('sel'); });
          b.classList.add('sel');
          refresh();
        };
      });
    }
    pick('skinRow', 'skin', 'skin');
    pick('hcRow', 'haircolor', 'hairColor');
    pick('bgRow', 'bg', 'bg');
    pick('hairRow', 'hair', 'hair');
    pick('glassRow', 'glasses', 'glasses');
    function applySel() {
      [['skinRow', 'skin', 'skin'], ['hcRow', 'haircolor', 'hairColor'], ['bgRow', 'bg', 'bg'], ['hairRow', 'hair', 'hair'], ['glassRow', 'glasses', 'glasses']].forEach(function (r) {
        var row = el(r[0]); if (!row) return; var val = cfg[r[2]];
        Array.prototype.forEach.call(row.querySelectorAll('[data-' + r[1] + ']'), function (x) {
          if (x.getAttribute('data-' + r[1]) === val) x.classList.add('sel'); else x.classList.remove('sel');
        });
      });
    }
    var avShuffle = el('avShuffle');
    if (avShuffle) avShuffle.onclick = function () { var n = newAvatar(); cfg.seed = n.seed; cfg.skin = n.skin; cfg.hairColor = n.hairColor; cfg.hair = n.hair; cfg.glasses = n.glasses; cfg.bg = n.bg; applySel(); refresh(); };

    // person type chips (tap again to clear)
    Array.prototype.forEach.call(el('ptypeRow').querySelectorAll('[data-ptype]'), function (b) {
      b.onclick = function () {
        var v = b.getAttribute('data-ptype');
        ptype = (ptype === v) ? '' : v;
        Array.prototype.forEach.call(el('ptypeRow').children, function (x) { x.classList.remove('sel'); });
        if (ptype) b.classList.add('sel');
      };
    });

    // hook prompt chips: insert a labelled line into the notes box
    Array.prototype.forEach.call(el('hookChips').querySelectorAll('[data-hook]'), function (b) {
      b.onclick = function () {
        var ta = el('f_hooks'); var pre = ta.value.replace(/\s+$/, '');
        ta.value = (pre ? pre + '\n' : '') + b.getAttribute('data-hook') + ': ';
        ta.focus();
      };
    });

    function buildBody() {
      var parents = [];
      [0, 1].forEach(function (idx) {
        var nm = el('f_par' + idx).value.trim();
        if (nm) parents.push({ name: nm, label: el('f_parlabel' + idx).value || 'other' });
      });
      return {
        name: (function () { var fn = el('f_fname').value.trim().slice(0, 15); var ln = el('f_lname').value.trim().slice(0, 3); return fn + (ln ? ' ' + ln : ''); })(),
        role: el('f_role').value.trim(),
        parents_list: parents,
        hooks: el('f_hooks').value.trim(),
        birthday: el('f_bday').value.trim(),
        avatar: JSON.stringify(cfg),
        ptype: ptype
      };
    }

    wireSheet('f_fname', function () {
      var body = buildBody();
      if (edit) {
        return api('/people/' + p.id, { method: 'PUT', body: body }).then(function () {
          return loadPeople(state.clubId).then(function () { state.view = 'profile'; });
        });
      }
      body.clubId = state.clubId;
      return api('/people', { method: 'POST', body: body }).then(function () {
        return loadPeople(state.clubId).then(function () { return loadClubs(state.childId); }).then(function () { state.view = 'club'; });
      });
    });

    if (!edit) {
      var name = el('f_fname'), again = el('saveAnotherBtn');
      name.addEventListener('input', function () { again.disabled = !name.value.trim(); });
      again.onclick = function () {
        if (!name.value.trim()) return;
        again.disabled = true; again.textContent = 'Saving…';
        var body = buildBody(); body.clubId = state.clubId;
        api('/people', { method: 'POST', body: body })
          .then(function () { return loadPeople(state.clubId).then(function () { return loadClubs(state.childId); }); })
          .then(function () { toast('Added \u2014 next one'); sheetPerson(false); })
          .catch(function (err) { again.disabled = false; again.textContent = 'Save & add another'; alert(err.message); });
      };
    }
  }

  function sheetEditChild() {
    var child = childById(state.childId);
    if (!child) return;
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Edit ' + esc(child.name) + '</h3>' +
      '<p class="lead">Rename this child, or remove them and everything filed under them.</p>' +
      '<label>Child\u2019s name <span class="req">·required</span></label>' +
      '<input class="f" id="f_cname" value="' + attr(child.name) + '" autocomplete="off"/>' +
      '<button class="save" id="saveBtn">Save</button>' +
      '<button class="danger" id="delBtn">Delete ' + esc(child.name) + ' and all their clubs</button>' +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show();
    wireSheet('f_cname', function () {
      return api('/children/' + child.id, { method: 'PUT', body: { name: el('f_cname').value.trim() } })
        .then(function () { return loadChildren().then(function () { state.view = 'home'; }); });
    });
    el('delBtn').onclick = function () {
      if (!confirm('Delete ' + child.name + ' and every club and person under them? This can\u2019t be undone.')) return;
      api('/children/' + child.id, { method: 'DELETE' }).then(function () {
        return loadChildren().then(function () {
          state.childId = children.length ? children[0].id : null;
          return loadClubs(state.childId);
        }).then(function () { hide(); state.view = 'home'; render(); });
      }).catch(function (err) { alert(err.message); });
    };
  }

  function sheetEditClub() {
    var c = clubById(state.clubId);
    if (!c) return;
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Edit ' + esc(c.name) + '</h3>' +
      '<p class="lead">Rename this club, or remove it and everyone in it.</p>' +
      '<label>Name <span class="req">·required</span></label>' +
      '<input class="f" id="f_gname" value="' + attr(c.name) + '" autocomplete="off"/>' +
      '<label>When / where <span class="opt">optional</span></label>' +
      '<input class="f" id="f_gsub" value="' + attr(c.sub) + '" autocomplete="off"/>' +
      '<button class="save" id="saveBtn">Save</button>' +
      (isAdmin()
        ? '<button class="danger" id="delBtn">Delete this club and everyone in it</button>'
        : '<p class="hint" style="text-align:center">Only the account admin can delete a club.</p>') +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show();
    wireSheet('f_gname', function () {
      return api('/clubs/' + c.id, { method: 'PUT', body: { name: el('f_gname').value.trim(), sub: el('f_gsub').value.trim() } })
        .then(function () { return loadClubs(state.childId).then(function () { state.view = 'club'; }); });
    });
    var delBtn = el('delBtn');
    if (delBtn) delBtn.onclick = function () {
      if (!confirm('Delete ' + c.name + ' and everyone in it? This can\u2019t be undone.')) return;
      api('/clubs/' + c.id, { method: 'DELETE' }).then(function () {
        return loadClubs(state.childId).then(function () { hide(); state.view = 'home'; render(); window.scrollTo(0, 0); });
      }).catch(function (err) { alert(err.message); });
    };
  }

  function sheetPasteList() {
    var c = clubById(state.clubId);
    if (!c) return;
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Paste a list</h3>' +
      '<p class="lead">Adding lots of people to <b>' + esc(c.name) + '</b>? Paste their names \u2014 one per line, or separated by commas. You can fill in details later.</p>' +
      '<label>Names</label>' +
      '<textarea class="f" id="f_names" rows="7" placeholder="Oscar&#10;Maya&#10;Florence&#10;Reuben"></textarea>' +
      '<p class="hint">Names already in this club are skipped automatically.</p>' +
      '<button class="save" id="saveBtn" disabled>Add them</button>' +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show();
    var ta = el('f_names'), save = el('saveBtn'), cancel = el('cancelBtn');
    function parsed() {
      var existing = {};
      people.forEach(function (p) { existing[String(p.name).trim().toLowerCase()] = true; });
      var seen = {};
      return ta.value.split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(function (s) {
        if (!s) return false;
        var k = s.toLowerCase();
        if (existing[k] || seen[k]) return false;
        seen[k] = true; return true;
      });
    }
    ta.addEventListener('input', function () {
      var n = parsed().length;
      save.disabled = n === 0;
      save.textContent = n ? ('Add ' + n + ' ' + (n === 1 ? 'person' : 'people')) : 'Add them';
    });
    setTimeout(function () { ta.focus(); }, 60);
    save.onclick = function () {
      var names = parsed();
      if (!names.length) return;
      save.disabled = true; save.textContent = 'Adding…';
      api('/people/bulk', { method: 'POST', body: { clubId: c.id, names: names } })
        .then(function (res) {
          return loadPeople(c.id).then(function () { return loadClubs(state.childId); }).then(function () {
            hide(); render(); window.scrollTo(0, 0);
            toast('Added ' + res.added + ' ' + (res.added === 1 ? 'person' : 'people') + '.');
          });
        })
        .catch(function (err) { save.disabled = false; alert(err.message); });
    };
    cancel.onclick = hide;
  }

  function sheetFeedback() {
    var kinds = [['feedback', 'Feedback'], ['suggestion', 'Suggestion'], ['bug', 'Bug'], ['abuse', 'Report abuse']];
    var kind = 'feedback';
    var loggedIn = !!token;
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Send feedback</h3>' +
      '<p class="lead">We read everything. Tell us what\u2019s working, what isn\u2019t, or what you\u2019d love to see next.</p>' +
      '<div class="chiprow" id="fbKind">' + kinds.map(function (k) { return '<button type="button" class="chip' + (k[0] === 'feedback' ? ' sel' : '') + (k[0] === 'abuse' ? ' danger' : '') + '" data-k="' + k[0] + '">' + k[1] + '</button>'; }).join('') + '</div>' +
      '<label>Your message</label>' +
      '<textarea class="f" id="f_fb" rows="5" placeholder="What\u2019s on your mind?"></textarea>' +
      (loggedIn ? '' : '<label>Email <span class="opt">optional</span></label><input class="f" id="f_fbemail" type="email" placeholder="you@example.com \u2014 if you\u2019d like a reply" autocomplete="off"/>') +
      '<button class="save" id="fbSend" disabled>Send</button>' +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show();
    el('cancelBtn').onclick = hide;
    var ta = el('f_fb'), send = el('fbSend');
    ta.addEventListener('input', function () { send.disabled = ta.value.trim().length < 2; });
    Array.prototype.forEach.call(el('fbKind').querySelectorAll('[data-k]'), function (b) {
      b.onclick = function () { kind = b.getAttribute('data-k'); Array.prototype.forEach.call(el('fbKind').children, function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); el('f_fb').placeholder = (kind === 'abuse') ? 'Describe what happened \u2014 include any names, dates and details so we can look into it.' : 'What\u2019s on your mind?'; el('fbSend').textContent = (kind === 'abuse') ? 'Send report' : 'Send'; };
    });
    send.onclick = function () {
      var msg = ta.value.trim();
      if (msg.length < 2) return;
      send.disabled = true; send.textContent = 'Sending\u2026';
      var body = { message: msg, kind: kind };
      var emEl = el('f_fbemail');
      if (emEl && emEl.value.trim()) body.email = emEl.value.trim();
      api('/feedback', { method: 'POST', body: body })
        .then(function () { hide(); toast('Thank you \u2014 your feedback is on its way.'); })
        .catch(function (err) { send.disabled = false; send.textContent = 'Send'; alert(err.message); });
    };
    setTimeout(function () { ta.focus(); }, 60);
  }

  function sheetAccount() {
    var admin = isAdmin();
    var roleLine = household.role
      ? (admin
          ? (household.partner
              ? 'You\u2019re the <b>admin</b>. <b>' + esc(household.partner.email) + '</b> is on this account as your partner.'
              : 'You\u2019re the <b>admin</b> of this account.')
          : 'You\u2019re a <b>partner</b> on <b>' + esc(household.adminEmail || 'the admin') + '</b>\u2019s account.')
      : '';

    var partnerBlock;
    if (admin) {
      partnerBlock = household.partner
        ? '<button class="rowbtn" id="acRemovePartner">Remove partner (' + esc(household.partner.email) + ')</button>'
        : '<button class="rowbtn" id="acInvite">Invite my partner</button>';
    } else {
      partnerBlock = '<button class="rowbtn" id="acLeave">Leave this account</button>';
    }

    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Account</h3>' +
      '<p class="lead">Signed in as <b>' + esc(me ? me.email : '') + '</b>' + (me && me.email_verified ? '' : ' \u00b7 not yet verified') + '.</p>' +
      (roleLine ? '<p class="rolenote">' + roleLine + '</p>' : '') +
      partnerBlock +
      (admin ? '<button class="rowbtn" id="acExport">Export my data (JSON)</button>' : '') +
      (admin ? (hasDemo()
        ? '<button class="rowbtn" id="acDemo">Remove sample data</button>'
        : '<button class="rowbtn" id="acDemo">Load sample data</button>') : '') +
      '<button class="rowbtn" id="acFeedback">Send feedback or a suggestion</button>' +
      '<button class="rowbtn" id="acSignout">Sign out</button>' +
      (admin ? '<button class="danger" id="acDelete">Delete this account</button>' : '') +
      '<button class="cancel" id="cancelBtn">Close</button>' +
      '<p class="sheetlegal"><a href="/privacy" target="_blank" rel="noopener">Privacy</a> \u00b7 <a href="/terms" target="_blank" rel="noopener">Terms</a> \u00b7 <a href="/cookies" target="_blank" rel="noopener">Cookies</a> \u00b7 <a href="/delete-account" target="_blank" rel="noopener">Delete account</a> \u00b7 <a href="mailto:team@parentrecall.com">Contact</a></p>';
    show();
    el('cancelBtn').onclick = hide;
    el('acSignout').onclick = function () { hide(); signOut(); };
    el('acFeedback').onclick = sheetFeedback;
    var acDemo = el('acDemo'); if (acDemo) acDemo.onclick = function () {
      if (hasDemo()) { acDemo.disabled = true; acDemo.textContent = 'Removing\u2026'; hide(); clearDemo(); }
      else { acDemo.disabled = true; acDemo.textContent = 'Loading\u2026'; hide(); seedDemo(); }
    };

    var inviteBtn = el('acInvite');
    if (inviteBtn) inviteBtn.onclick = sheetInvitePartner;

    var removeBtn = el('acRemovePartner');
    if (removeBtn) removeBtn.onclick = function () {
      if (!confirm('Remove ' + household.partner.email + '? They\u2019ll lose access, but everything they added stays on the account.')) return;
      api('/auth/household/associate', { method: 'DELETE' }).then(function () {
        return loadMe().then(function () { toast('Partner removed.'); sheetAccount(); });
      }).catch(function (err) { alert(err.message); });
    };

    var leaveBtn = el('acLeave');
    if (leaveBtn) leaveBtn.onclick = function () {
      if (!confirm('Leave this account? You\u2019ll lose access to the family\u2019s lists. What you added stays with the admin.')) return;
      api('/auth/household/leave', { method: 'POST' }).then(function () {
        hide(); signOut(); toast('You\u2019ve left the account.');
      }).catch(function (err) { alert(err.message); });
    };

    var exportBtn = el('acExport');
    if (exportBtn) exportBtn.onclick = function () {
      api('/auth/export').then(function (data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'parentrecall-export.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Your data has been downloaded.');
      }).catch(function (err) { alert(err.message); });
    };

    var deleteBtn = el('acDelete');
    if (deleteBtn) deleteBtn.onclick = function () {
      var warn = household.partner
        ? 'Delete this account and ALL its data permanently? This also removes your partner\u2019s access. This cannot be undone.'
        : 'Delete your account and ALL your data permanently? This cannot be undone.';
      if (!confirm(warn)) return;
      if (!confirm('Are you absolutely sure? Everything will be erased.')) return;
      api('/auth/account', { method: 'DELETE' }).then(function () {
        hide(); signOut(); toast('Your account has been deleted.');
      }).catch(function (err) { alert(err.message); });
    };
  }

  function sheetInvitePartner() {
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Invite your partner</h3>' +
      '<p class="lead">Add one partner to share this account. They get their own sign-in and can add and edit people, hooks and clubs \u2014 but only you (the admin) can remove a child, delete a club, export, or delete the account.</p>' +
      '<label>Their email</label>' +
      '<input class="f" id="f_invite" type="email" placeholder="partner@example.com" autocomplete="off"/>' +
      '<p class="hint">We\u2019ll email them a link to set a password and join.</p>' +
      '<button class="save" id="saveBtn" disabled>Send invite</button>' +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show();
    var input = el('f_invite'), save = el('saveBtn');
    input.addEventListener('input', function () { save.disabled = !/^\S+@\S+\.\S+$/.test(input.value.trim()); });
    el('cancelBtn').onclick = sheetAccount;
    save.onclick = function () {
      var email = input.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return;
      save.disabled = true; save.textContent = 'Sending…';
      api('/auth/household/invite', { method: 'POST', body: { email: email } })
        .then(function () { return loadMe(); })
        .then(function () { toast('Invite sent to ' + email); sheetAccount(); })
        .catch(function (err) { save.disabled = false; save.textContent = 'Send invite'; alert(err.message); });
    };
    setTimeout(function () { input.focus(); }, 60);
  }

  function downloadTemplate() {
    if (typeof XLSX === 'undefined') { alert('Spreadsheet tools are still loading — try again in a moment.'); return; }
    var people = XLSX.utils.aoa_to_sheet([
      ['name', 'role', 'parents', 'hooks', 'birthday'],
      ['Oscar', "Charlotte's best friend", 'Priya (mum), Dan (dad)', 'Red Audi, always in running gear, sits front-left', '12 March'],
      ['Maya', 'In her class \u2014 wears glasses', 'Tom & Sarah', 'Identical twin (Mia has no glasses)', ''],
      ['Coach Dan', 'Swim coach', '', 'Very tall, loud whistle, calls everyone "champ"', ''],
      ['', '', '', '', '']
    ]);
    people['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 24 }, { wch: 44 }, { wch: 14 }];
    var info = XLSX.utils.aoa_to_sheet([
      ['ParentRecall \u2014 import template'],
      [''],
      ['Fill in one row per person on the "People" tab.'],
      ['Only "name" is required. Leave anything you don\u2019t know yet blank.'],
      [''],
      ['Column', 'What to put'],
      ['name', 'The person\u2019s name \u2014 a child, a parent, a coach\u2026'],
      ['role', 'Who they are, in a few words'],
      ['parents', 'Parents or carers'],
      ['hooks', 'The little details that jog your memory \u2014 the car, the job, where they sit'],
      ['birthday', 'Free text, e.g. "12 March"'],
      [''],
      ['Then in the app: open the club, tap "Import from a spreadsheet", and upload this file.']
    ]);
    info['!cols'] = [{ wch: 14 }, { wch: 72 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, people, 'People');
    XLSX.utils.book_append_sheet(wb, info, 'How to use');
    XLSX.writeFile(wb, 'parentrecall-template.xlsx');
  }

  // Map a sheet (array-of-arrays) to person objects, tolerant of column order/extra columns.
  function rowsToPeople(rows) {
    if (!rows || !rows.length) return [];
    var header = (rows[0] || []).map(function (h) { return String(h == null ? '' : h).trim().toLowerCase(); });
    var idx = {};
    ['name', 'role', 'parents', 'hooks', 'birthday'].forEach(function (f) { idx[f] = header.indexOf(f); });
    var hasHeader = idx.name >= 0 || header.indexOf('role') >= 0 || header.indexOf('hooks') >= 0;
    var start = hasHeader ? 1 : 0;
    var out = [];
    for (var i = start; i < rows.length; i++) {
      var r = rows[i] || [];
      function cell(f) { return idx[f] >= 0 ? String(r[idx[f]] == null ? '' : r[idx[f]]).trim() : ''; }
      var name = idx.name >= 0 ? cell('name') : String(r[0] == null ? '' : r[0]).trim();
      if (!name) continue;
      out.push({
        name: name.slice(0, 120),
        role: cell('role'),
        parents: cell('parents'),
        hooks: cell('hooks'),
        birthday: cell('birthday')
      });
    }
    return out;
  }

  function parseFile(file, cb, errCb) {
    if (typeof XLSX === 'undefined') { errCb('Spreadsheet tools are still loading — try again in a moment.'); return; }
    var isCsv = /\.csv$/i.test(file.name);
    var reader = new FileReader();
    reader.onerror = function () { errCb('Could not read that file.'); };
    reader.onload = function (e) {
      try {
        var wb = isCsv
          ? XLSX.read(e.target.result, { type: 'string' })
          : XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        cb(rowsToPeople(rows));
      } catch (err) {
        errCb('That file didn\u2019t look right. Try the template, or a .csv / .xlsx with a "name" column.');
      }
    };
    if (isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
  }

  function sheetImport() {
    var c = clubById(state.clubId);
    if (!c) return;
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Import from a spreadsheet</h3>' +
      '<p class="lead">Got a class list in Excel? Download the template, fill it in, and upload it to add everyone to <b>' + esc(c.name) + '</b> at once.</p>' +
      '<button class="rowbtn" id="tplBtn">\u2b07\ufe0e  Download the template (.xlsx)</button>' +
      '<label>Upload your file</label>' +
      '<input class="fileinput" id="f_file" type="file" accept=".xlsx,.xls,.csv"/>' +
      '<p class="hint">Accepts .xlsx or .csv. Names already in this club are skipped. Files are read on your device \u2014 only the names are sent.</p>' +
      '<div id="importPreview"></div>' +
      '<button class="save" id="saveBtn" disabled>Add them</button>' +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show();
    var save = el('saveBtn');
    var toAdd = [];

    el('tplBtn').onclick = downloadTemplate;
    el('cancelBtn').onclick = hide;

    el('f_file').onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      el('importPreview').innerHTML = '';
      save.disabled = true; toAdd = [];
      if (!file) return;
      parseFile(file, function (parsed) {
        // de-dupe within file + skip names already in this club
        var existing = {};
        people.forEach(function (p) { existing[String(p.name).trim().toLowerCase()] = true; });
        var seen = {};
        toAdd = parsed.filter(function (p) {
          var k = p.name.toLowerCase();
          if (existing[k] || seen[k]) return false;
          seen[k] = true; return true;
        });
        var skipped = parsed.length - toAdd.length;
        if (!toAdd.length) {
          el('importPreview').innerHTML = '<div class="impnote">No new names found' + (skipped ? ' (' + skipped + ' already in this club)' : '') + '.</div>';
          return;
        }
        var sample = toAdd.slice(0, 6).map(function (p) { return esc(p.name); }).join(', ');
        el('importPreview').innerHTML = '<div class="impnote"><b>' + toAdd.length + '</b> ' +
          (toAdd.length === 1 ? 'person' : 'people') + ' found' + (skipped ? ' · ' + skipped + ' skipped' : '') +
          '<br><span class="impnames">' + sample + (toAdd.length > 6 ? ', \u2026' : '') + '</span></div>';
        save.disabled = false;
        save.textContent = 'Add ' + toAdd.length + ' ' + (toAdd.length === 1 ? 'person' : 'people');
      }, function (msg) {
        el('importPreview').innerHTML = '<div class="impnote err">' + esc(msg) + '</div>';
      });
    };

    save.onclick = function () {
      if (!toAdd.length) return;
      save.disabled = true; save.textContent = 'Adding…';
      api('/people/import', { method: 'POST', body: { clubId: c.id, people: toAdd } })
        .then(function (res) {
          return loadPeople(c.id).then(function () { return loadClubs(state.childId); }).then(function () {
            hide(); render(); window.scrollTo(0, 0);
            toast('Imported ' + res.added + ' ' + (res.added === 1 ? 'person' : 'people') + '.');
          });
        })
        .catch(function (err) { save.disabled = false; alert(err.message); });
    };
  }

  // shared sheet wiring: required-field gating, save -> action -> close -> render
  function wireSheet(requiredId, action) {
    var input = el(requiredId), save = el('saveBtn'), cancel = el('cancelBtn');
    if (input) {
      input.addEventListener('input', function () { save.disabled = !input.value.trim(); });
      setTimeout(function () { input.focus(); }, 60);
    }
    save.onclick = function () {
      save.disabled = true; save.textContent = 'Saving…';
      Promise.resolve(action())
        .then(function () { hide(); render(); window.scrollTo(0, 0); })
        .catch(function (err) {
          save.disabled = false; save.textContent = 'Save';
          alert(err.message || 'Could not save.');
        });
    };
    cancel.onclick = hide;
  }

  /* ---------------- Bind ---------------- */
  function bind() {
    var sel = el('childSel');
    if (sel) sel.onchange = function (e) {
      if (e.target.value === '__add') { e.target.value = state.childId || ''; sheetChild(); return; }
      state.childId = parseInt(e.target.value, 10);
      loadClubs(state.childId).then(render);
    };
    var addChildBtn = el('addChildBtn'); if (addChildBtn) addChildBtn.onclick = sheetChild;
    var addClub = el('addClub'); if (addClub) addClub.onclick = sheetClub;
    var addPerson = el('addPerson'); if (addPerson) addPerson.onclick = function () { sheetPerson(false); };
    var gsCta = el('gsCta'); if (gsCta) gsCta.onclick = function () {
      if (!children.length) return sheetChild();
      if (!clubs.length) return sheetClub();
      return sheetPerson(false);
    };
    var gsDemo = el('gsDemo'); if (gsDemo) gsDemo.onclick = function () { gsDemo.disabled = true; gsDemo.textContent = 'Loading sample data\u2026'; seedDemo(); };
    var editPerson = el('editPerson'); if (editPerson) editPerson.onclick = function () { sheetPerson(true); };
    var delPerson = el('delPerson'); if (delPerson) delPerson.onclick = function () {
      var p = personById(state.personId);
      if (!confirm('Delete ' + (p ? p.name : 'this person') + '? This can\u2019t be undone.')) return;
      api('/people/' + state.personId, { method: 'DELETE' }).then(function () {
        return loadPeople(state.clubId).then(function () { state.view = 'club'; render(); });
      }).catch(function (err) { alert(err.message); });
    };
    var accountBtn = el('accountBtn'); if (accountBtn) accountBtn.onclick = sheetAccount;
    var findBtn = el('findBtn'); if (findBtn) findBtn.onclick = function () { state.view = 'find'; render(); };
    var editChild = el('editChild'); if (editChild) editChild.onclick = sheetEditChild;
    var editClub = el('editClub'); if (editClub) editClub.onclick = sheetEditClub;
    var clubSwitch = el('clubSwitch'); if (clubSwitch) clubSwitch.onchange = function () { var id = this.value; if (!id || id === state.clubId) return; state.clubId = id; loadPeople(id).then(function () { render(); window.scrollTo(0, 0); }); };
    bindPwEyes();
    var pasteList = el('pasteList'); if (pasteList) pasteList.onclick = sheetPasteList;
    var importList = el('importList'); if (importList) importList.onclick = sheetImport;
    var printBtn = el('printBtn'); if (printBtn) printBtn.onclick = printClub;

    // Find screen
    var findInput = el('findInput');
    if (findInput) {
      runFind('');
      findInput.oninput = function (e) {
        var q = e.target.value.trim();
        clearTimeout(findTimer);
        findTimer = setTimeout(function () { runFind(q); }, 180);
      };
      setTimeout(function () { findInput.focus(); }, 60);
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-find]'), function (b) {
      b.onclick = function () {
        var r = findResults.filter(function (x) { return String(x.id) === b.getAttribute('data-find'); })[0];
        if (r) openFoundPerson(r);
      };
    });

    // Quiz screen
    var qReveal = el('qReveal'); if (qReveal) qReveal.onclick = function () { quiz.show = true; render(); };
    var qGot = el('qGot'); if (qGot) qGot.onclick = function () { answerQuiz(true); };
    var qMiss = el('qMiss'); if (qMiss) qMiss.onclick = function () { answerQuiz(false); };
    var quizMissed = el('quizMissed'); if (quizMissed) quizMissed.onclick = function () { startQuiz(quiz.missed.slice(), quiz.color); };
    var quizDone = el('quizDone'); if (quizDone) quizDone.onclick = function () { state.view = 'club'; render(); window.scrollTo(0, 0); };
    var vr = el('verifyResend'); if (vr) vr.onclick = function () {
      vr.disabled = true; vr.textContent = 'Sending…';
      api('/auth/resend-verification', { method: 'POST' })
        .then(function (res) { toast(res.already ? 'Your email is already verified.' : 'Verification email sent.'); })
        .catch(function (err) { toast(err.message); vr.disabled = false; vr.textContent = 'Resend'; });
    };

    Array.prototype.forEach.call(document.querySelectorAll('[data-club]'), function (b) {
      b.onclick = function () {
        state.view = 'club'; state.clubId = parseInt(b.getAttribute('data-club'), 10);
        loadPeople(state.clubId).then(function () { render(); window.scrollTo(0, 0); });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-person]'), function (b) {
      b.onclick = function () {
        state.view = 'profile'; state.personId = parseInt(b.getAttribute('data-person'), 10);
        render(); window.scrollTo(0, 0);
      };
    });
    var back = el('back'); if (back) back.onclick = function () {
      if (state.view === 'profile') state.view = 'club';
      else if (state.view === 'quiz') state.view = 'club';
      else state.view = 'home';
      render(); window.scrollTo(0, 0);
    };
  }

  el('scrim').onclick = function (e) { if (e.target.id === 'scrim') hide(); };

  /* ---------------- Boot ---------------- */
  function boot(done) {
    loadMe()
      .then(loadChildren)
      .then(function () {
        if (children.length) {
          state.childId = children[0].id;
          return loadClubs(state.childId);
        }
      })
      .then(function () {
        state.view = 'home';
        render();
        if (typeof done === 'function') done();
      })
      .catch(function (err) {
        // If the only blocker is an unverified email (optional hard gate),
        // still show home so the banner + resend are reachable.
        if (me && me.email_verified === false) {
          state.view = 'home'; render();
          if (typeof done === 'function') done();
          return;
        }
        if (token) { console.error(err); signOut(); }
      });
  }

  /* ---------------- Entry ---------------- */
  (function init() {
    var params = new URLSearchParams(location.search);
    var resetToken = params.get('reset');
    var verified = params.get('verified');
    if (params.toString()) history.replaceState({}, document.title, location.pathname);

    if (resetToken) { renderReset(resetToken); return; }

    if (token) {
      leaveLanding();
      boot(function () {
        if (verified === '1') toast('Email verified — you\u2019re all set.');
        else if (verified === '0') toast('That link has expired. Tap \u201cResend\u201d for a new one.');
      });
    } else {
      renderLanding();
      if (verified === '1') toast('Email verified — please sign in.');
      else if (verified === '0') toast('That verification link has expired.');
    }
  })();
})();
