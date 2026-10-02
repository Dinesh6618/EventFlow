-- Phase 5: team formation and skill-based matching.

-- Organizer-configurable team rules, per event.
ALTER TABLE events ADD COLUMN IF NOT EXISTS team_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS min_team_size INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN IF NOT EXISTS max_team_size INTEGER NOT NULL DEFAULT 4;
-- When false a participant can belong to only one team of the event.
ALTER TABLE events ADD COLUMN IF NOT EXISTS allow_multiple_teams BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD CONSTRAINT events_team_size_check
  CHECK (min_team_size >= 1 AND max_team_size >= min_team_size AND max_team_size <= 50);

-- Skills a participant has. `skill_key` is the lower-cased form used to avoid duplicates.
CREATE TABLE IF NOT EXISTS user_skills (
  user_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill     VARCHAR(40) NOT NULL,
  skill_key VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, skill_key)
);

CREATE TABLE IF NOT EXISTS teams (
  id                  SERIAL PRIMARY KEY,
  event_id            INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                VARCHAR(80)  NOT NULL,
  leader_id           INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_title       VARCHAR(150) NOT NULL DEFAULT '',
  project_description TEXT         NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Team names are unique within an event, ignoring case.
CREATE UNIQUE INDEX IF NOT EXISTS teams_event_name_idx ON teams (event_id, lower(name));
CREATE INDEX IF NOT EXISTS teams_leader_idx ON teams (leader_id);

-- Skills the team is looking for (drives teammate suggestions).
CREATE TABLE IF NOT EXISTS team_skills (
  team_id   INTEGER     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  skill     VARCHAR(40) NOT NULL,
  skill_key VARCHAR(40) NOT NULL,
  PRIMARY KEY (team_id, skill_key)
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id   INTEGER     NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  user_id   INTEGER     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  -- Denormalised so "one team per event" lookups are a single indexed query.
  event_id  INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role      VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_members_event_user_idx ON team_members (event_id, user_id);

-- Invitations (leader -> person) and join requests (person -> leader) share one table.
CREATE TABLE IF NOT EXISTS team_invitations (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         VARCHAR(10) NOT NULL CHECK (kind IN ('invite', 'request')),
  status       VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- At most one open invitation/request per person per team.
CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_pending_idx ON team_invitations (team_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS team_invitations_user_idx ON team_invitations (user_id, status);
