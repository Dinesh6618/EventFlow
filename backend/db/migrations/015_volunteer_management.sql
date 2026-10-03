-- Volunteer Management. A volunteer is still a student who holds an event_staff row with role
-- 'volunteer' (that row grants QR scanning and Help Center access). This adds what organizers need to
-- run them: profiles, departments, shifts, assignments, tasks, duty attendance, announcements,
-- reassignment requests and an audit log.

CREATE SEQUENCE IF NOT EXISTS volunteer_code_seq;

-- One per student, created the first time they apply or are added. Skills stay in user_skills.
CREATE TABLE IF NOT EXISTS volunteer_profiles (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER      NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  volunteer_code VARCHAR(24)  NOT NULL UNIQUE,
  interests      VARCHAR(300)  NOT NULL DEFAULT '',
  experience     VARCHAR(1000) NOT NULL DEFAULT '',
  availability   VARCHAR(100)  NOT NULL DEFAULT '',
  -- suspended = an admin has stopped this person receiving assignments anywhere
  status         VARCHAR(12)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- The fuller application form.
ALTER TABLE volunteer_applications ADD COLUMN IF NOT EXISTS phone                VARCHAR(20)   NOT NULL DEFAULT '';
ALTER TABLE volunteer_applications ADD COLUMN IF NOT EXISTS year                 SMALLINT;
ALTER TABLE volunteer_applications ADD COLUMN IF NOT EXISTS skills               JSONB         NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE volunteer_applications ADD COLUMN IF NOT EXISTS interests            VARCHAR(300)  NOT NULL DEFAULT '';
ALTER TABLE volunteer_applications ADD COLUMN IF NOT EXISTS availability         VARCHAR(100)  NOT NULL DEFAULT '';
ALTER TABLE volunteer_applications ADD COLUMN IF NOT EXISTS experience           VARCHAR(1000) NOT NULL DEFAULT '';
ALTER TABLE volunteer_applications ADD COLUMN IF NOT EXISTS preferred_department VARCHAR(80)   NOT NULL DEFAULT '';

-- A deactivated volunteer keeps their history but gets no access and no new assignments for that event.
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS is_active BOOLEAN      NOT NULL DEFAULT TRUE;
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS notes     VARCHAR(500) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS volunteer_departments (
  id             SERIAL PRIMARY KEY,
  event_id       INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           VARCHAR(80)  NOT NULL,
  description    VARCHAR(500) NOT NULL DEFAULT '',
  required_count INTEGER      NOT NULL DEFAULT 1 CHECK (required_count >= 0),
  location       VARCHAR(150) NOT NULL DEFAULT '',
  shift_start    TIME,
  shift_end      TIME,
  instructions   TEXT         NOT NULL DEFAULT '',
  priority       VARCHAR(10)  NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (shift_start IS NULL OR shift_end IS NULL OR shift_end > shift_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS volunteer_departments_name_idx ON volunteer_departments (event_id, lower(name));

CREATE TABLE IF NOT EXISTS volunteer_shifts (
  id             SERIAL PRIMARY KEY,
  event_id       INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  department_id  INTEGER     NOT NULL REFERENCES volunteer_departments(id) ON DELETE CASCADE,
  name           VARCHAR(60) NOT NULL,
  date           DATE        NOT NULL,
  start_time     TIME        NOT NULL,
  end_time       TIME        NOT NULL,
  required_count INTEGER     NOT NULL DEFAULT 1 CHECK (required_count >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS volunteer_shifts_event_idx ON volunteer_shifts (event_id, date, start_time);

-- A volunteer's duty: where, when and doing what. They must accept it before it counts as confirmed.
CREATE TABLE IF NOT EXISTS volunteer_assignments (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       INTEGER      NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  department_id INTEGER      NOT NULL REFERENCES volunteer_departments(id) ON DELETE CASCADE,
  shift_id      INTEGER      REFERENCES volunteer_shifts(id) ON DELETE SET NULL,
  task          VARCHAR(300) NOT NULL DEFAULT '',
  date          DATE         NOT NULL,
  start_time    TIME         NOT NULL,
  end_time      TIME         NOT NULL,
  location      VARCHAR(150) NOT NULL DEFAULT '',
  status        VARCHAR(12)  NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'accepted', 'completed', 'cancelled', 'removed')),
  assigned_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS volunteer_assignments_event_idx ON volunteer_assignments (event_id, date, status);
CREATE INDEX IF NOT EXISTS volunteer_assignments_user_idx  ON volunteer_assignments (user_id, date, status);

CREATE TABLE IF NOT EXISTS volunteer_tasks (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  department_id INTEGER      NOT NULL REFERENCES volunteer_departments(id) ON DELETE CASCADE,
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(150) NOT NULL,
  description   TEXT         NOT NULL DEFAULT '',
  location      VARCHAR(150) NOT NULL DEFAULT '',
  date          DATE         NOT NULL,
  start_time    TIME         NOT NULL,
  end_time      TIME         NOT NULL,
  priority      VARCHAR(10)  NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status        VARCHAR(12)  NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'accepted', 'in_progress', 'completed', 'cancelled')),
  instructions  TEXT         NOT NULL DEFAULT '',
  created_by    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  accepted_at   TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS volunteer_tasks_event_idx ON volunteer_tasks (event_id, status);
CREATE INDEX IF NOT EXISTS volunteer_tasks_user_idx  ON volunteer_tasks (user_id, status);

-- One row per duty once the volunteer has checked in. NOT_CHECKED_IN and ABSENT are derived.
CREATE TABLE IF NOT EXISTS volunteer_attendance (
  id             SERIAL PRIMARY KEY,
  assignment_id  INTEGER      NOT NULL UNIQUE REFERENCES volunteer_assignments(id) ON DELETE CASCADE,
  user_id        INTEGER      NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id       INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  check_in_time  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  check_out_time TIMESTAMPTZ,
  late           BOOLEAN      NOT NULL DEFAULT FALSE,
  on_break       BOOLEAN      NOT NULL DEFAULT FALSE,
  location       VARCHAR(150) NOT NULL DEFAULT '',
  -- NULL = the volunteer did it themselves; otherwise the organizer who did it for them
  checked_in_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  checked_out_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CHECK (check_out_time IS NULL OR check_out_time >= check_in_time)
);
CREATE INDEX IF NOT EXISTS volunteer_attendance_event_idx ON volunteer_attendance (event_id, check_in_time);

CREATE TABLE IF NOT EXISTS volunteer_announcements (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title         VARCHAR(120) NOT NULL,
  message       TEXT         NOT NULL,
  scope         VARCHAR(12)  NOT NULL CHECK (scope IN ('all', 'department', 'shift', 'volunteer')),
  department_id INTEGER      REFERENCES volunteer_departments(id) ON DELETE CASCADE,
  shift_id      INTEGER      REFERENCES volunteer_shifts(id) ON DELETE CASCADE,
  user_id       INTEGER      REFERENCES users(id) ON DELETE CASCADE,
  created_by    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  recipients    INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS volunteer_announcements_event_idx ON volunteer_announcements (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS volunteer_reassignment_requests (
  id            SERIAL PRIMARY KEY,
  assignment_id INTEGER      NOT NULL REFERENCES volunteer_assignments(id) ON DELETE CASCADE,
  event_id      INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       INTEGER      NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  reason        VARCHAR(500) NOT NULL,
  status        VARCHAR(12)  NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected')),
  review_note   VARCHAR(300) NOT NULL DEFAULT '',
  reviewed_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- A volunteer can only have one open request per assignment.
CREATE UNIQUE INDEX IF NOT EXISTS volunteer_reassignment_open_idx ON volunteer_reassignment_requests (assignment_id) WHERE status = 'requested';

-- Who changed what and when: assignments, tasks, attendance, reassignment decisions.
CREATE TABLE IF NOT EXISTS volunteer_audit (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER     REFERENCES events(id) ON DELETE CASCADE,
  actor_id   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  user_id    INTEGER     REFERENCES users(id) ON DELETE CASCADE,
  action     VARCHAR(40) NOT NULL,
  message    TEXT        NOT NULL,
  meta       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS volunteer_audit_event_idx ON volunteer_audit (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS volunteer_audit_user_idx  ON volunteer_audit (user_id, created_at DESC);

-- Department templates an admin offers organizers when they create a department.
CREATE TABLE IF NOT EXISTS volunteer_categories (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(80)  NOT NULL UNIQUE,
  description  VARCHAR(500) NOT NULL DEFAULT '',
  instructions TEXT         NOT NULL DEFAULT '',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO volunteer_categories (name, description, instructions) VALUES
  ('Registration',        'Welcome participants and check them in',        'Verify each participant''s QR pass and guide them to the right hall. Report registration problems to the organizer.'),
  ('Technical Support',   'Help with computers, network and AV',           'Assist participants with technical issues during the event.'),
  ('Food Management',     'Serve and manage meals and refreshments',       'Keep the food area orderly and tell the organizer when supplies run low.'),
  ('Stage Management',    'Run the stage and the speakers'' schedule',     'Keep sessions on time and look after speakers.'),
  ('Help Desk',           'Answer questions and point people the right way', 'Stay at the desk, answer questions, and escalate anything you cannot solve.'),
  ('Security Assistance', 'Support the security team',                     'Help control entry points and report concerns to the security lead straight away.'),
  ('Photography',         'Capture the event',                             'Cover the sessions on the schedule and share photos with the organizer.'),
  ('Hospitality',         'Look after guests and speakers',                'Receive guests, show them around and make sure they have what they need.'),
  ('Technical Setup',     'Prepare rooms and equipment',                   'Set up and test equipment before each session.')
ON CONFLICT (name) DO NOTHING;
