-- ParentRecall schema
-- Hierarchy: user -> children -> clubs/classes -> people (the names you're trying to remember)
-- Every row carries user_id so authorization is a single, simple check on every query.

CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  name             TEXT DEFAULT '',
  email_verified   BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ
);

-- Minimal record kept AFTER an account is hard-deleted, for security/abuse-prevention
-- and to evidence that deletion requests were honoured. Holds no data beyond the email
-- and the lifecycle dates. Disclosed in the privacy policy.
CREATE TABLE IF NOT EXISTS deletion_log (
  id               SERIAL PRIMARY KEY,
  email            TEXT NOT NULL,
  email_hash       TEXT NOT NULL,
  role             TEXT,
  created_at       TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User feedback & suggestions.
CREATE TABLE IF NOT EXISTS feedback (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email      TEXT,
  kind       TEXT NOT NULL DEFAULT 'feedback',
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A household owns the data. Up to two members: one 'admin', one 'associate'.
CREATE TABLE IF NOT EXISTS households (
  id         SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS household_members (
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'associate',  -- 'admin' | 'associate'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
-- Each user belongs to at most one household.
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_user ON household_members(user_id);

-- Single-use, expiring tokens for email verification and password reset.
-- Only the SHA-256 hash of each token is stored, never the raw token.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,           -- 'verify' | 'reset'
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

CREATE TABLE IF NOT EXISTS children (
  id           SERIAL PRIMARY KEY,
  household_id INTEGER REFERENCES households(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  is_demo    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clubs (
  id           SERIAL PRIMARY KEY,
  household_id INTEGER REFERENCES households(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  child_id     INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sub        TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT 'blue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people (
  id             SERIAL PRIMARY KEY,
  household_id   INTEGER REFERENCES households(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  club_id        INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT '',
  parents        TEXT NOT NULL DEFAULT '',
  parents_list   TEXT NOT NULL DEFAULT '',
  hooks          TEXT NOT NULL DEFAULT '',
  birthday       TEXT NOT NULL DEFAULT '',
  birthday_month INTEGER,
  birthday_day   INTEGER,
  avatar         TEXT NOT NULL DEFAULT '',
  ptype          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One birthday-reminder digest per user per day (prevents duplicate sends).
CREATE TABLE IF NOT EXISTS reminder_log (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_on DATE NOT NULL,
  PRIMARY KEY (user_id, sent_on)
);

CREATE INDEX IF NOT EXISTS idx_children_user ON children(user_id);
CREATE INDEX IF NOT EXISTS idx_clubs_user    ON clubs(user_id);
CREATE INDEX IF NOT EXISTS idx_clubs_child   ON clubs(child_id);
CREATE INDEX IF NOT EXISTS idx_people_user   ON people(user_id);
CREATE INDEX IF NOT EXISTS idx_people_club   ON people(club_id);

CREATE INDEX IF NOT EXISTS idx_children_household ON children(household_id);
CREATE INDEX IF NOT EXISTS idx_clubs_household ON clubs(household_id);
CREATE INDEX IF NOT EXISTS idx_people_household ON people(household_id);
