-- Phase 6: judging, evaluation criteria, leaderboard, project submission.

-- The organizer decides when teams may see the leaderboard, and whether judges' comments reach teams.
ALTER TABLE events ADD COLUMN IF NOT EXISTS leaderboard_published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS share_judge_comments BOOLEAN NOT NULL DEFAULT FALSE;

-- What judges look at: the team's project.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS repository_url VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS demo_url VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        VARCHAR(80) NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  max_score   INTEGER     NOT NULL CHECK (max_score > 0 AND max_score <= 1000),
  position    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS evaluation_criteria_name_idx ON evaluation_criteria (event_id, lower(name));

-- Which judge scores which team. Judges themselves are `event_staff` rows with role 'judge'.
CREATE TABLE IF NOT EXISTS judge_assignments (
  judge_id   INTEGER     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  team_id    INTEGER     NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  event_id   INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (judge_id, team_id)
);

CREATE INDEX IF NOT EXISTS judge_assignments_event_idx ON judge_assignments (event_id);

CREATE TABLE IF NOT EXISTS evaluations (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id       INTEGER     NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  judge_id      INTEGER     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status        VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  -- Private to judges and the organizer unless the organizer chooses to share them.
  comments      TEXT        NOT NULL DEFAULT '',
  -- Set by the organizer so a judge can correct a submitted evaluation.
  edit_unlocked BOOLEAN     NOT NULL DEFAULT FALSE,
  submitted_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, judge_id)
);

CREATE INDEX IF NOT EXISTS evaluations_event_status_idx ON evaluations (event_id, status);

CREATE TABLE IF NOT EXISTS evaluation_scores (
  evaluation_id INTEGER       NOT NULL REFERENCES evaluations(id)         ON DELETE CASCADE,
  criterion_id  INTEGER       NOT NULL REFERENCES evaluation_criteria(id) ON DELETE CASCADE,
  score         NUMERIC(7, 2) NOT NULL CHECK (score >= 0),
  PRIMARY KEY (evaluation_id, criterion_id)
);
