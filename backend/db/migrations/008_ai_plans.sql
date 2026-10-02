-- Phase 9: AI Event Planner. A plan is generated as a draft and only becomes an event after the
-- organizer reviews, edits, confirms and publishes it.

CREATE TABLE IF NOT EXISTS ai_plans (
  id            SERIAL PRIMARY KEY,
  organizer_id  INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Set when the plan is published as an event; the plan stays attached for reference.
  event_id      INTEGER     REFERENCES events(id) ON DELETE SET NULL,
  -- What the organizer asked for.
  request       JSONB       NOT NULL,
  -- Exactly what the model produced (never edited), kept for audit.
  original_plan JSONB       NOT NULL,
  -- The working copy the organizer edits.
  plan          JSONB       NOT NULL,
  status        VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'published')),
  model         VARCHAR(60) NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ,
  published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_plans_organizer_idx ON ai_plans (organizer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_plans_event_idx ON ai_plans (event_id);
