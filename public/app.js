/* ParentRecall frontend — talks to the Express API. */
(function () {
  'use strict';

  var TOKEN_KEY = 'pr_token';
  var token = localStorage.getItem(TOKEN_KEY) || null;
  var me = null;

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
      '<svg viewBox="0 0 24 24" fill="' + c + '"><circle cx="12" cy="8.2" r="4.2"/>' +
      '<path d="M3.5 22c0-4.7 3.8-7.6 8.5-7.6s8.5 2.9 8.5 7.6z"/></svg></span>';
  }
  var ICON = {
    chev: '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
    plus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
    cake: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 21h16M5 21v-7h14v7M8 14V8m4 6V7m4 7V8M12 7V3"/></svg>',
    edit: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    sheet: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>'
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
  function renderAuth(mode, errMsg) {
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
          '<input class="f" id="a_pass" type="password" placeholder="' + (isLogin ? 'Your password' : 'At least 8 characters') + '" autocomplete="' + (isLogin ? 'current-password' : 'new-password') + '"/>' +
          '<button class="save" id="authBtn" type="submit">' + (isLogin ? 'Sign in' : 'Create account') + '</button>' +
        '</form>' +
        (isLogin ? '<div class="toggle" style="margin-top:14px"><button id="forgotLink" type="button">Forgot password?</button></div>' : '') +
        '<div class="toggle">' + (isLogin ? "New here? " : 'Already have an account? ') +
          '<button id="authToggle" type="button">' + (isLogin ? 'Create an account' : 'Sign in') + '</button>' +
        '</div>' +
      '</div>';

    el('authToggle').onclick = function () { renderAuth(isLogin ? 'register' : 'login'); };
    var fl = el('forgotLink'); if (fl) fl.onclick = function () { renderForgot(el('a_email') ? el('a_email').value.trim() : ''); };
    el('authForm').onsubmit = function (e) {
      e.preventDefault();
      var btn = el('authBtn');
      var email = el('a_email').value.trim();
      var pass = el('a_pass').value;
      var name = isLogin ? '' : (el('a_name') ? el('a_name').value.trim() : '');
      btn.disabled = true; btn.textContent = 'Please wait…';
      api(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', body: { email: email, password: pass, name: name } })
        .then(function (data) {
          token = data.token; me = data.user;
          localStorage.setItem(TOKEN_KEY, token);
          boot();
        })
        .catch(function (err) { renderAuth(mode, err.message); });
    };
    setTimeout(function () { var f = el(isLogin ? 'a_email' : 'a_email'); if (f) f.focus(); }, 60);
  }

  function signOut() {
    token = null; me = null;
    localStorage.removeItem(TOKEN_KEY);
    children = []; clubs = []; people = [];
    state = { view: 'home', childId: null, clubId: null, personId: null };
    renderAuth('login');
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
          '<input class="f" id="rp_pass" type="password" placeholder="At least 8 characters" autocomplete="new-password"/>' +
          '<button class="save" id="rpBtn" type="submit">Update password</button>' +
        '</form>' +
        '<div class="toggle"><button id="rpBack" type="button">Back to sign in</button></div>' +
      '</div>';
    el('rpBack').onclick = function () { renderAuth('login'); };
    el('resetForm').onsubmit = function (e) {
      e.preventDefault();
      var btn = el('rpBtn'); var pass = el('rp_pass').value;
      if (pass.length < 8) { renderReset(resetToken, 'Password must be at least 8 characters.'); return; }
      btn.disabled = true; btn.textContent = 'Updating…';
      api('/auth/reset', { method: 'POST', body: { token: resetToken, password: pass } })
        .then(function () { renderAuth('login'); toast('Password updated — please sign in.'); })
        .catch(function (err) { renderReset(resetToken, err.message); });
    };
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
    return api('/auth/me').then(function (d) { me = d.user; return d.user; });
  }

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
    var screen = el('screen');
    if (state.view === 'profile') screen.innerHTML = renderProfile();
    else if (state.view === 'club') screen.innerHTML = renderClub();
    else screen.innerHTML = renderHome();
    bind();
  }

  function childById(id) { return children.find(function (c) { return c.id === id; }); }
  function clubById(id) { return clubs.find(function (c) { return c.id === id; }); }
  function personById(id) { return people.find(function (p) { return p.id === id; }); }

  function renderHome() {
    var child = childById(state.childId) || children[0];
    var opts = children.map(function (c) {
      return '<option value="' + c.id + '"' + (child && c.id === child.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('') + '<option value="__add">➕  Add a child…</option>';

    var rows;
    if (!children.length) {
      rows = '<div class="empty"><div class="big">Let\u2019s add your first child</div><p>Add a child, then the clubs and classes you need to remember people from.</p></div>';
    } else if (!clubs.length) {
      rows = '<div class="empty"><div class="big">No clubs yet for ' + esc(child.name) + '</div><p>Add their class, swimming, football \u2014 whatever groups you need to remember people from.</p></div>';
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
          '<button class="addtile" id="addChildBtn"><span class="pl">' + ICON.plus + '</span>Add a child</button>' +
        '</div>';

    var banner = (me && me.email_verified === false)
      ? '<div class="banner"><span>Verify your email — we sent a link to <b>' + esc(me.email) + '</b>.</span><button id="verifyResend">Resend</button></div>'
      : '';

    return '<div class="topbar"><span class="wordmark-sm">Parent<span>Recall</span></span>' +
        '<button class="iconbtn" id="accountBtn" aria-label="Account">' + ICON.gear + '</button></div>' +
      '<header><img class="logo" src="/logo.png" alt="Parent Recall — Remember Everything"/></header>' +
      banner +
      (children.length ?
        '<div class="pick"><div class="lbl">Whose groups?</div><div class="selectpill">' +
          '<select id="childSel">' + opts + '</select>' +
          '<span class="av">' + ICON.down + '</span></div>' +
          '<button class="ministep" id="editChild">' + ICON.edit + 'Rename or remove ' + esc(child.name) + '</button>' +
        '</div>' : '') +
      clubsBlock;
  }

  function renderClub() {
    var c = clubById(state.clubId);
    if (!c) { state.view = 'home'; return renderHome(); }
    var child = childById(c.child_id) || { name: 'Back' };
    var rows = people.length
      ? people.map(function (p) {
          return '<button class="prow" data-person="' + p.id + '">' + silhouette(raw(c.color)) +
            '<span class="meta"><span class="nm">' + esc(p.name) + (p.birthday ? '<span class="bdaydot"></span>' : '') + '</span>' +
            '<span class="who">' + esc(p.role || 'Tap to add details') + '</span></span>' + ICON.chev + '</button>';
        }).join('')
      : '<div class="empty"><div class="big">No one here yet</div><p>Add the first name. A first name is all you need \u2014 fill in the rest whenever it comes back to you.</p></div>';

    return '<div class="topbar"><button class="back" id="back">' + ICON.back + esc(child.name) + '</button>' +
        '<button class="iconbtn" id="editClub" aria-label="Edit club">' + ICON.edit + '</button></div>' +
      '<div class="title"><h2>' + esc(c.name) + '</h2><p>' + (c.sub ? esc(c.sub) + ' · ' : '') +
        people.length + ' ' + (people.length === 1 ? 'person' : 'people') + '</p></div>' +
      '<div class="list">' + rows +
        '<button class="addtile" id="addPerson"><span class="pl">' + ICON.plus + '</span>Add someone</button>' +
        '<button class="ministep center" id="pasteList">' + ICON.plus + 'Paste a whole list at once</button>' +
        '<button class="ministep center" id="importList">' + ICON.sheet + 'Import from a spreadsheet</button>' +
      '</div>';
  }

  function renderProfile() {
    var p = personById(state.personId);
    var c = clubById(state.clubId);
    if (!p || !c) { state.view = 'club'; return renderClub(); }
    return '<div class="topbar"><button class="back" id="back">' + ICON.back + esc(c.name) + '</button>' +
        '<span class="wordmark-sm">Parent<span>Recall</span></span></div>' +
      '<div class="profile"><div class="phead">' + silhouette(raw(c.color)) +
        '<h2>' + esc(p.name) + '</h2>' +
        (p.role ? '<div class="role">' + esc(p.role) + '</div>' : '') +
        '<span class="pin" style="background:' + raw(c.color) + '">' + esc(c.name) + '</span></div>' +
      '<div class="pcardx"><div class="h">What jogs your memory</div><div class="b">' +
        (p.hooks ? esc(p.hooks) : 'Nothing yet \u2014 tap Edit to add the little details (the car, the job, where they sit) that bring the name back.') + '</div></div>' +
      (p.parents ? '<div class="pcardx muted"><div class="h">Parents / carers</div><div class="b">' + esc(p.parents) + '</div></div>' : '') +
      (p.birthday ? '<div class="bchip"><span class="ic">' + ICON.cake + '</span>Birthday · ' + esc(p.birthday) + '</div>' : '') +
      '<div class="profile-actions"><button class="btn-edit" id="editPerson">Edit details</button>' +
        '<button class="btn-del" id="delPerson">Delete</button></div>' +
      '</div>';
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
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>' + (edit ? 'Edit details' : 'Add someone') + '</h3>' +
      '<p class="lead">A first name is all you need now \u2014 everything else you can add the moment it comes back to you.</p>' +
      '<label>Name <span class="req">·required</span></label>' +
      '<input class="f" id="f_pname" placeholder="e.g. Oscar" value="' + (p ? attr(p.name) : '') + '" autocomplete="off"/>' +
      '<label>Who are they? <span class="opt">optional</span></label>' +
      '<input class="f" id="f_role" placeholder="e.g. Charlotte\u2019s best friend / the coach" value="' + (p ? attr(p.role) : '') + '" autocomplete="off"/>' +
      '<label>Parents / carers <span class="opt">optional</span></label>' +
      '<input class="f" id="f_parents" placeholder="e.g. Priya (mum), Dan (dad)" value="' + (p ? attr(p.parents) : '') + '" autocomplete="off"/>' +
      '<label>What jogs your memory <span class="opt">optional</span></label>' +
      '<textarea class="f" id="f_hooks" rows="3" placeholder="Red Audi · always in running gear · sits front-left">' + (p ? esc(p.hooks) : '') + '</textarea>' +
      '<p class="hint">This is the bit that actually helps \u2014 the car, the job, where they sit, who they\u2019re friends with.</p>' +
      '<label>Birthday <span class="opt">optional</span></label>' +
      '<input class="f" id="f_bday" placeholder="e.g. 12 March" value="' + (p ? attr(p.birthday) : '') + '" autocomplete="off"/>' +
      '<button class="save" id="saveBtn"' + (p ? '' : ' disabled') + '>' + (edit ? 'Save' : 'Add') + '</button>' +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show(); wireSheet('f_pname', function () {
      var body = {
        name: el('f_pname').value.trim(),
        role: el('f_role').value.trim(),
        parents: el('f_parents').value.trim(),
        hooks: el('f_hooks').value.trim(),
        birthday: el('f_bday').value.trim()
      };
      if (edit) {
        return api('/people/' + p.id, { method: 'PUT', body: body }).then(function () {
          return loadPeople(state.clubId).then(function () { state.view = 'profile'; });
        });
      }
      body.clubId = state.clubId;
      return api('/people', { method: 'POST', body: body }).then(function () {
        return loadPeople(state.clubId).then(function () { state.view = 'club'; });
      });
    });
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
      '<button class="danger" id="delBtn">Delete this club and everyone in it</button>' +
      '<button class="cancel" id="cancelBtn">Cancel</button>';
    show();
    wireSheet('f_gname', function () {
      return api('/clubs/' + c.id, { method: 'PUT', body: { name: el('f_gname').value.trim(), sub: el('f_gsub').value.trim() } })
        .then(function () { return loadClubs(state.childId).then(function () { state.view = 'club'; }); });
    });
    el('delBtn').onclick = function () {
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

  function sheetAccount() {
    el('sheet').innerHTML =
      '<div class="grab"></div><h3>Account</h3>' +
      '<p class="lead">Signed in as <b>' + esc(me ? me.email : '') + '</b>' + (me && me.email_verified ? '' : ' \u00b7 not yet verified') + '.</p>' +
      '<button class="rowbtn" id="acExport">Export my data (JSON)</button>' +
      '<button class="rowbtn" id="acSignout">Sign out</button>' +
      '<button class="danger" id="acDelete">Delete my account</button>' +
      '<button class="cancel" id="cancelBtn">Close</button>';
    show();
    el('cancelBtn').onclick = hide;
    el('acSignout').onclick = function () { hide(); signOut(); };
    el('acExport').onclick = function () {
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
    el('acDelete').onclick = function () {
      if (!confirm('Delete your account and ALL your data permanently? This cannot be undone.')) return;
      if (!confirm('Are you absolutely sure? Everything will be erased.')) return;
      api('/auth/account', { method: 'DELETE' }).then(function () {
        hide(); signOut(); toast('Your account has been deleted.');
      }).catch(function (err) { alert(err.message); });
    };
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
    var editPerson = el('editPerson'); if (editPerson) editPerson.onclick = function () { sheetPerson(true); };
    var delPerson = el('delPerson'); if (delPerson) delPerson.onclick = function () {
      var p = personById(state.personId);
      if (!confirm('Delete ' + (p ? p.name : 'this person') + '? This can\u2019t be undone.')) return;
      api('/people/' + state.personId, { method: 'DELETE' }).then(function () {
        return loadPeople(state.clubId).then(function () { state.view = 'club'; render(); });
      }).catch(function (err) { alert(err.message); });
    };
    var accountBtn = el('accountBtn'); if (accountBtn) accountBtn.onclick = sheetAccount;
    var editChild = el('editChild'); if (editChild) editChild.onclick = sheetEditChild;
    var editClub = el('editClub'); if (editClub) editClub.onclick = sheetEditClub;
    var pasteList = el('pasteList'); if (pasteList) pasteList.onclick = sheetPasteList;
    var importList = el('importList'); if (importList) importList.onclick = sheetImport;
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
      state.view = (state.view === 'profile') ? 'club' : 'home';
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
      boot(function () {
        if (verified === '1') toast('Email verified — you\u2019re all set.');
        else if (verified === '0') toast('That link has expired. Tap \u201cResend\u201d for a new one.');
      });
    } else {
      renderAuth('login');
      if (verified === '1') toast('Email verified — please sign in.');
      else if (verified === '0') toast('That verification link has expired.');
    }
  })();
})();
