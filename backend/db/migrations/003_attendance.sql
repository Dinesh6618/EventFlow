-- Phase 3: QR attendance and event staff (volunteers; judges are added in a later phase).

-- Random, unguessable QR token per registration (about 240 bits, from the database CSPRNG).
-- The QR code contains only this token: no name, email, or sequential id.
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS qr_token VARCHAR(64) NOT NULL
  DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS registrations_qr_token_idx ON registrations (qr_token);

-- People who help run one event. They keep their normal participant account.
CREATE TABLE IF NOT EXISTS event_staff (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  staff_role VARCHAR(20) NOT NULL CHECK (staff_role IN ('volunteer', 'judge')),
  added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id, staff_role)
);

CREATE INDEX IF NOT EXISTS event_staff_user_idx ON event_staff (user_id);

-- One row per registration once the person has checked in. "Registered" and "Absent" are derived
-- (no row yet / no row after the event ended), so they are not stored.
CREATE TABLE IF NOT EXISTS attendance (
  id              SERIAL PRIMARY KEY,
  registration_id INTEGER     NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
  event_id        INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         INTEGER     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL CHECK (status IN ('checked_in', 'checked_out')),
  check_in_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_time  TIMESTAMPTZ,
  checked_in_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  checked_out_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CHECK (check_out_time IS NULL OR check_out_time >= check_in_time),
  CHECK ((status = 'checked_out') = (check_out_time IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS attendance_event_status_idx ON attendance (event_id, status);
