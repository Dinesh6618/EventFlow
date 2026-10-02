-- Phase 10: recommendations (rule-based and AI) and live operations zones for the control center.

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- Stable identifier of the rule (or of the AI suggestion) so refreshing never creates duplicates.
  rule_key    VARCHAR(80)  NOT NULL,
  source      VARCHAR(8)   NOT NULL CHECK (source IN ('rules', 'ai')),
  category    VARCHAR(20)  NOT NULL
              CHECK (category IN ('registration', 'attendance', 'sessions', 'volunteers', 'teams', 'schedule', 'feedback', 'general')),
  severity    VARCHAR(12)  NOT NULL CHECK (severity IN ('info', 'suggestion', 'important')),
  title       VARCHAR(160) NOT NULL,
  message     TEXT         NOT NULL,
  suggestion  TEXT         NOT NULL DEFAULT '',
  -- The numbers the recommendation is based on: [{ "label": "...", "value": "..." }]
  evidence    JSONB        NOT NULL DEFAULT '[]'::jsonb,
  link        VARCHAR(200),
  -- new: needs attention; dismissed/done: the organizer's decision; resolved: the situation fixed itself.
  status      VARCHAR(10)  NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'dismissed', 'done', 'resolved')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (event_id, rule_key)
);

CREATE INDEX IF NOT EXISTS ai_recommendations_event_idx ON ai_recommendations (event_id, status);

-- Places at the venue whose crowding the team reports during the event (registration desk, food counter...).
CREATE TABLE IF NOT EXISTS event_zones (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       VARCHAR(60) NOT NULL,
  status     VARCHAR(12) NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'busy', 'high_queue')),
  note       VARCHAR(200) NOT NULL DEFAULT '',
  -- NULL until someone reports: the control center then says "not reported" instead of guessing.
  reported_at TIMESTAMPTZ,
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  position   INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_zones_name_idx ON event_zones (event_id, lower(name));
