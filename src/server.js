require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { migrate } = require('./migrate');

const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy; needed for rate-limit + secure cookies later.

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

// Static frontend
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await migrate(); // ensure tables exist on boot
  } catch (err) {
    console.error('Could not apply schema on boot:', err.message);
    // Keep going — Railway may attach the DB a moment later; routes will surface errors clearly.
  }
  app.listen(PORT, () => console.log(`ParentRecall running on :${PORT}`));
}

start();
