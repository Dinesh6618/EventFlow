-- Phase 4: multi-day events, event schedule, session attendance, notifications, announcements.

-- Events may span several days (e.g. a 24-hour hackathon). NULL means a single-day event.
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date DATE;
-- The Phase 1 rule "end_time > start_time" only holds for single-day events.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_check;
ALTER TABLE events ADD CONSTRAINT events_dates_check
  CHECK (end_date IS NULL OR end_date >= date);
ALTER TABLE events ADD CONSTRAINT events_times_check
  CHECK (COALESCE(end_date, date) > date OR end_time > start_time);

CREATE TABLE IF NOT EXISTS schedule_items (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title        VARCHAR(150) NOT NULL,
  description  TEXT         NOT NULL DEFAULT '',
  date         DATE         NOT NULL,
  start_time   TIME         NOT NULL,
  end_time     TIME         NOT NULL,
  venue        VARCHAR(200) NOT NULL DEFAULT '',
  speaker      VARCHAR(150) NOT NULL DEFAULT '',
  session_type VARCHAR(30)  NOT NULL DEFAULT 'session'
               CHECK (session_type IN ('session', 'workshop', 'talk', 'break', 'competition', 'evaluation_round')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS schedule_items_event_idx ON schedule_items (event_id, date, start_time);

-- Who was scanned into which session (the event-level check-in lives in `attendance`).
CREATE TABLE IF NOT EXISTS session_attendance (
  session_id      INTEGER     NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
  registration_id INTEGER     NOT NULL REFERENCES registrations(id)  ON DELETE CASCADE,
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, registration_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title      VARCHAR(150) NOT NULL,
  message    TEXT         NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS announcements_event_idx ON announcements (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id   INTEGER      REFERENCES events(id) ON DELETE CASCADE,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(150) NOT NULL,
  message    TEXT         NOT NULL,
  link       VARCHAR(200),
  -- Lets the reminder job run repeatedly without sending the same reminder twice.
  dedupe_key VARCHAR(120),
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
