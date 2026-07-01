require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { migrate } = require('./migrate');

const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy; needed for rate-limit + secure cookies later.

// Canonical host: send www.* -> apex so there is ONE origin (and therefore one
// login/session state). Without this, a token stored on parentrecall.com is not
// visible on www.parentrecall.com, so www shows the logged-out homepage.
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if (host.slice(0, 4) === 'www.') {
    return res.redirect(301, 'https://' + host.slice(4) + req.originalUrl);
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '100kb' }));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/children', require('./routes/children'));
app.use('/api/clubs', require('./routes/clubs'));
app.use('/api/people', require('./routes/people'));
app.use('/api/practice', require('./routes/practice'));
app.use('/api/inbox', require('./routes/inbox'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/demo', require('./routes/demo'));

// Static frontend
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Clean URLs for the legal pages
app.get('/privacy', (req, res) => res.sendFile(path.join(publicDir, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(publicDir, 'terms.html')));
app.get('/delete-account', (req, res) => res.sendFile(path.join(publicDir, 'delete-account.html')));
app.get('/cookies', (req, res) => res.sendFile(path.join(publicDir, 'cookies.html')));
app.get('/cookie-policy', (req, res) => res.sendFile(path.join(publicDir, 'cookies.html')));
app.get('/privacy-policy', (req, res) => res.sendFile(path.join(publicDir, 'privacy.html')));
app.get('/terms-and-conditions', (req, res) => res.sendFile(path.join(publicDir, 'terms.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.get('/data-deletion', (req, res) => res.sendFile(path.join(publicDir, 'delete-account.html')));
app.get('/support', (req, res) => res.sendFile(path.join(publicDir, 'support.html')));
app.get('/help', (req, res) => res.sendFile(path.join(publicDir, 'support.html')));
app.get('/child-safety', (req, res) => res.sendFile(path.join(publicDir, 'child-safety.html')));
app.get('/child-safety-standards', (req, res) => res.sendFile(path.join(publicDir, 'child-safety.html')));

app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await migrate(); // ensure tables exist on boot
  } catch (err) {
    console.error('Could not apply schema on boot:', err.message);
    // Keep going — Railway may attach the DB a moment later; routes will surface errors clearly.
  }
  app.listen(PORT, () => {
    console.log(`ParentRecall running on :${PORT}`);
    try { require('./scheduler').start(); } catch (e) { console.error('scheduler failed to start', e.message); }
  });
}

start();
