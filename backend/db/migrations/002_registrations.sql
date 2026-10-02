-- Phase 2: participant registration and management.

ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS college    VARCHAR(150);

-- When true, new registrations wait as "pending" until the organizer approves them.
ALTER TABLE events ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE;

CREATE SEQUENCE IF NOT EXISTS participant_code_seq;

CREATE TABLE IF NOT EXISTS registrations (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id          INTEGER     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  -- Human-friendly unique participant ID, e.g. EF-2026-000042
  participant_code VARCHAR(24) NOT NULL UNIQUE,
  status           VARCHAR(20) NOT NULL
                   CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'confirmed')),
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at     TIMESTAMPTZ,
  decided_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  -- One registration row per person per event: no duplicates, cancellations are re-activated.
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS registrations_event_status_idx ON registrations (event_id, status);
CREATE INDEX IF NOT EXISTS registrations_user_idx ON registrations (user_id);

-- First time a signed-in participant opens an event page; used for registration conversion.
CREATE TABLE IF NOT EXISTS event_views (
  event_id        INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         INTEGER     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
