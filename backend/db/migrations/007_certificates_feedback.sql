-- Phase 7: certificates (with public verification) and feedback.

CREATE SEQUENCE IF NOT EXISTS certificate_seq;

CREATE TABLE IF NOT EXISTS certificates (
  id               SERIAL PRIMARY KEY,
  -- Public, human-friendly ID printed on the certificate, e.g. EVF-2026-001245
  certificate_code VARCHAR(24)  NOT NULL UNIQUE,
  event_id         INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- NULL for people without an account (for example an external speaker).
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- The name as printed; kept even if the account is renamed or deleted later.
  recipient_name   VARCHAR(100) NOT NULL,
  -- 'u:<userId>' or 'n:<lowercased name>': one certificate per person per type per event.
  recipient_key    VARCHAR(150) NOT NULL,
  type             VARCHAR(20)  NOT NULL
                   CHECK (type IN ('participant', 'winner', 'runner_up', 'finalist', 'volunteer', 'organizer', 'speaker', 'judge')),
  issued_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  issued_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_at       TIMESTAMPTZ,
  revoked_reason   VARCHAR(300),
  UNIQUE (event_id, type, recipient_key)
);

CREATE INDEX IF NOT EXISTS certificates_user_idx ON certificates (user_id);
CREATE INDEX IF NOT EXISTS certificates_event_idx ON certificates (event_id);

-- One feedback form per person per target: the event itself (session_id NULL) or a single session.
CREATE TABLE IF NOT EXISTS feedback (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER  NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      INTEGER  NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  session_id   INTEGER  REFERENCES schedule_items(id) ON DELETE CASCADE,
  overall      SMALLINT NOT NULL CHECK (overall BETWEEN 1 AND 5),
  organization SMALLINT CHECK (organization BETWEEN 1 AND 5),
  speaker      SMALLINT CHECK (speaker BETWEEN 1 AND 5),
  venue        SMALLINT CHECK (venue BETWEEN 1 AND 5),
  comments     TEXT     NOT NULL DEFAULT '',
  suggestions  TEXT     NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS feedback_target_idx ON feedback (event_id, user_id, COALESCE(session_id, 0));
CREATE INDEX IF NOT EXISTS feedback_event_idx ON feedback (event_id);
