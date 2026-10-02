-- EventFlow Phase 1 schema (PostgreSQL). Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'participant'
              CHECK (role IN ('organizer', 'participant', 'admin')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id                     SERIAL PRIMARY KEY,
  organizer_id           INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                   VARCHAR(150) NOT NULL,
  description            TEXT         NOT NULL,
  type                   VARCHAR(30)  NOT NULL
                         CHECK (type IN ('Hackathon', 'Workshop', 'Symposium', 'Seminar',
                                         'Competition', 'Cultural Event', 'Technical Event')),
  date                   DATE         NOT NULL,
  start_time             TIME         NOT NULL,
  end_time               TIME         NOT NULL,
  venue                  VARCHAR(200) NOT NULL,
  max_participants       INTEGER      NOT NULL CHECK (max_participants > 0),
  registration_deadline  TIMESTAMP    NOT NULL,
  image                  VARCHAR(255),
  organizer_name         VARCHAR(100) NOT NULL,
  organizer_contact      VARCHAR(100) NOT NULL,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS events_organizer_idx ON events (organizer_id);
CREATE INDEX IF NOT EXISTS events_date_idx ON events (date);
