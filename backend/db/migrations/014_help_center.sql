-- Emergency & Help Center: participants report problems during an event, event staff respond.
-- EventFlow does not contact emergency services. It routes requests to the event's own staff and
-- shows the official contacts an admin configured.

CREATE SEQUENCE IF NOT EXISTS help_request_seq;

-- What a participant can report. `is_urgent` categories are shown in the "immediate help" section and
-- need an explicit confirmation; `priority_level` is the priority a request starts with.
CREATE TABLE IF NOT EXISTS help_categories (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(40)  NOT NULL UNIQUE,
  name           VARCHAR(60)  NOT NULL,
  description    VARCHAR(200) NOT NULL DEFAULT '',
  icon           VARCHAR(16)  NOT NULL DEFAULT 'ℹ️',
  priority_level VARCHAR(10)  NOT NULL DEFAULT 'medium' CHECK (priority_level IN ('low', 'medium', 'high', 'urgent')),
  is_urgent      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  position       INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO help_categories (code, name, description, icon, priority_level, is_urgent, position) VALUES
  ('medical',    'Medical Assistance', 'Get help from event staff',      '🏥', 'urgent', TRUE,  1),
  ('security',   'Security Issue',     'Report a safety concern',        '🛡️', 'urgent', TRUE,  2),
  ('technical',  'Technical Issue',    'Computer, network or AV help',   '💻', 'high',   FALSE, 3),
  ('venue',      'Venue Problem',      'Room, seating or facility',      '📍', 'medium', FALSE, 4),
  ('lost_found', 'Lost & Found',       'Report lost/found property',     '🔎', 'medium', FALSE, 5),
  ('general',    'General Help',       'Other event assistance',         'ℹ️', 'low',    FALSE, 6)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS help_requests (
  id                    SERIAL PRIMARY KEY,
  request_code          VARCHAR(24) NOT NULL UNIQUE,
  event_id              INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id        INTEGER     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  category_id           INTEGER     NOT NULL REFERENCES help_categories(id),
  description           TEXT        NOT NULL DEFAULT '',
  location              VARCHAR(150) NOT NULL DEFAULT '',
  priority              VARCHAR(10) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status                VARCHAR(14) NOT NULL DEFAULT 'reported'
                        CHECK (status IN ('reported', 'acknowledged', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled')),
  -- app = updates in the app, in_person = come to my location, call = staff may phone me
  contact_preference    VARCHAR(10) NOT NULL DEFAULT 'app' CHECK (contact_preference IN ('app', 'in_person', 'call')),
  -- Lost & Found: { kind: 'lost' | 'found', itemName, when }
  details               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  item_status           VARCHAR(10) CHECK (item_status IN ('open', 'found', 'claimed', 'returned')),
  assigned_volunteer_id INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  assigned_by           INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  escalated             BOOLEAN     NOT NULL DEFAULT FALSE,
  escalated_at          TIMESTAMPTZ,
  unresolved_alerted_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at       TIMESTAMPTZ,
  assigned_at           TIMESTAMPTZ,
  accepted_at           TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS help_requests_event_idx       ON help_requests (event_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS help_requests_participant_idx ON help_requests (participant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS help_requests_volunteer_idx   ON help_requests (assigned_volunteer_id, status);

-- The timeline and the audit log. `visibility = 'staff'` entries (internal notes, priority and
-- assignment changes) are never shown to the participant.
CREATE TABLE IF NOT EXISTS help_updates (
  id         SERIAL PRIMARY KEY,
  request_id INTEGER     NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  user_id    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  kind       VARCHAR(16) NOT NULL CHECK (kind IN ('created', 'status', 'assignment', 'priority', 'escalation', 'update', 'note', 'item')),
  message    TEXT        NOT NULL,
  visibility VARCHAR(12) NOT NULL DEFAULT 'participant' CHECK (visibility IN ('participant', 'staff')),
  meta       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS help_updates_request_idx ON help_updates (request_id, created_at);

-- Photos live outside the public uploads folder and are only served to people who may view the request.
CREATE TABLE IF NOT EXISTS help_attachments (
  id            SERIAL PRIMARY KEY,
  request_id    INTEGER     NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  stored_name   VARCHAR(80) NOT NULL,
  original_name VARCHAR(200) NOT NULL DEFAULT '',
  file_type     VARCHAR(40) NOT NULL,
  size_bytes    INTEGER     NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS help_attachments_request_idx ON help_attachments (request_id);

-- Official contacts configured by an admin. event_id NULL = for every event.
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER REFERENCES events(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  department   VARCHAR(100) NOT NULL DEFAULT '',
  phone        VARCHAR(30)  NOT NULL,
  availability VARCHAR(100) NOT NULL DEFAULT '',
  description  VARCHAR(300) NOT NULL DEFAULT '',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Response teams (for example "Technical Support") that an admin keeps and responders belong to.
CREATE TABLE IF NOT EXISTS help_teams (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(60)  NOT NULL UNIQUE,
  description VARCHAR(200) NOT NULL DEFAULT '',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS help_team_members (
  team_id INTEGER NOT NULL REFERENCES help_teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- Platform settings that an admin can change, such as the escalation timings.
CREATE TABLE IF NOT EXISTS help_settings (
  key        VARCHAR(40) PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO help_settings (key, value) VALUES
  ('escalation', '{"ackMinutes": {"urgent": 2, "high": 5}, "unresolvedMinutes": {"urgent": 30, "high": 60, "medium": 120, "low": 240}}'::jsonb)
ON CONFLICT (key) DO NOTHING;
