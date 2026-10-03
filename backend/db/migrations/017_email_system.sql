-- Real email: account verification, email preferences, a send log, and a meeting link for online events.

-- Existing accounts keep working: they are marked verified when this runs. New accounts start unverified.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified    BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
UPDATE users SET email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE email_verified = FALSE;

-- Which optional emails a person wants. Security emails (verification, password reset) ignore this.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_prefs JSONB NOT NULL
  DEFAULT '{"reminders": true, "announcements": true, "team": true, "certificates": true, "platform": true}'::jsonb;

-- Like password reset tokens: only a SHA-256 hash is stored, the token works once, and it expires.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64)    NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx ON email_verification_tokens (user_id, created_at DESC);

-- The password reset table from the previous migration, under its proper name.
ALTER TABLE IF EXISTS password_resets RENAME TO password_reset_tokens;

-- Every email EventFlow tries to send. Never holds a token, a link, a password or a provider key.
CREATE TABLE IF NOT EXISTS email_logs (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  recipient           VARCHAR(255) NOT NULL,
  template            VARCHAR(40)  NOT NULL,
  subject             VARCHAR(255) NOT NULL,
  status              VARCHAR(10)  NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  provider_message_id VARCHAR(100),
  error_message       VARCHAR(300),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_logs_created_idx ON email_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS email_logs_status_idx  ON email_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS email_logs_user_idx    ON email_logs (user_id, created_at DESC);

-- Online and hybrid events can carry a link that the reminder email includes.
ALTER TABLE events ADD COLUMN IF NOT EXISTS meeting_url VARCHAR(500);
