-- Student experience: richer profiles and event pages, and saved (favourite) events.

ALTER TABLE users ADD COLUMN IF NOT EXISTS year  SMALLINT CHECK (year BETWEEN 1 AND 5);   -- 1-4 = year of study, 5 = postgraduate
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

ALTER TABLE events ADD COLUMN IF NOT EXISTS mode       VARCHAR(10) NOT NULL DEFAULT 'offline' CHECK (mode IN ('offline', 'online', 'hybrid'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS department VARCHAR(100);                          -- NULL = open to every department
ALTER TABLE events ADD COLUMN IF NOT EXISTS prizes     JSONB NOT NULL DEFAULT '[]'::jsonb;    -- [{ title, description }]
ALTER TABLE events ADD COLUMN IF NOT EXISTS rules      JSONB NOT NULL DEFAULT '[]'::jsonb;    -- [string]
ALTER TABLE events ADD COLUMN IF NOT EXISTS faqs       JSONB NOT NULL DEFAULT '[]'::jsonb;    -- [{ question, answer }]

CREATE TABLE IF NOT EXISTS event_favorites (
  user_id    INTEGER     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id   INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);
