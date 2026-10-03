-- Students apply to volunteer at an event; the organizer approves or declines. Approving adds the
-- person to event_staff as a volunteer, exactly as if the organizer had added them by email.
CREATE TABLE IF NOT EXISTS volunteer_applications (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER      NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  message    VARCHAR(500) NOT NULL DEFAULT '',
  status     VARCHAR(10)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS volunteer_applications_event_idx ON volunteer_applications (event_id, status);
