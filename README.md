# EventFlow

College event planning and management platform: organizers create and run events, participants discover and join them, judges and volunteers do their part, and the platform keeps the records.

## What it does

| Phase | Feature | Highlights |
| ----- | ------- | ---------- |
| 1 | Accounts and events | Organizer / participant / admin roles, create events with a banner, searchable event listing, event details |
| 2 | Registration | Register / cancel, optional organizer approval, capacity enforced under row locks, participant management, CSV export |
| 3 | QR attendance | Per-registration secret QR codes, camera or manual scanning, volunteers, check-in/out, attendance dashboard |
| 4 | Schedule and notifications | Sessions (multi-day events too), announcements, in-app notifications, reminders, session-level attendance |
| 5 | Teams | Create / join / invite, leader tools, skill-based suggestions, team rules per event |
| 6 | Judging | Criteria, judge assignment, scoring, progress tracking, leaderboard with a publish step and privacy controls |
| 7 | Certificates and feedback | Numbered PDF certificates, public verification page, anonymous feedback |
| 8 | Analytics | Registrations, attendance rate, conversion, engagement and completion, per event or overall, CSV export |
| UI | Student experience and redesign | Landing page, role selection, student home with recommendations, explore with filters and saved events, tabbed event pages, 3-step registration wizard, digital event pass with downloadable QR, My Events, timeline schedule, My Team, notification centre, certificate gallery, feedback screen, 5-step event wizard, sortable participants table, bottom navigation on phones |
| Vol | Volunteer platform | Students browse events and apply to volunteer, organizers approve or decline, approved volunteers scan QR check-ins and report crowd levels |
| 10 | Recommendations and control center | Rule-based recommendations from the event's own numbers, optional AI ideas, a live control center with crowd-level reports |

Definitions of every number (for example attendance rate or conversion) are in [docs/API.md](docs/API.md).

## Folder structure

```text
EventFlow/
├── backend/                     Node.js + Express REST API
│   ├── db/migrations/           Versioned SQL migrations 001..010, applied automatically at start
│   ├── src/
│   │   ├── server.js, app.js, config.js, db.js, constants.js
│   │   ├── routes/              URL -> controller mapping and access rules
│   │   ├── controllers/         Request handling
│   │   ├── models/              SQL queries
│   │   ├── services/            Access checks, metrics, rules engine, control center, certificates PDF,
│   │   │                        reminders, ai/ (the only code that talks to Claude)
│   │   ├── validators/          Request validation (zod)
│   │   ├── middleware/          auth, validate, upload, rate limits, error handler
│   │   ├── utils/               event status, HTTP errors, CSV, params
│   │   └── scripts/             setupDb.js, seed.js
│   ├── test/                    node:test suites, one temporary database per file
│   ├── uploads/                 Uploaded banners (git-ignored)
│   └── .env.example
├── frontend/                    React + Tailwind CSS (Vite)
│   └── src/
│       ├── api/                 fetch client + endpoint functions
│       ├── context/             AuthContext, ToastContext
│       ├── hooks/               useApi (polling, abort), useDebounced
│       ├── components/          ui/, layout/, events/, participants/, attendance/, schedule/, teams/,
│       │                        judging/, feedback/, notifications/, charts/, ai/, insights/
│       ├── pages/               organizer/ (+ event/ tabs), participant/, judge/, volunteer/, admin/
│       └── utils/               constants, formatting, validation
└── docs/API.md                  API reference and the rules behind each feature
```

## Requirements

- Node.js 20 or newer (developed on Node 26)
- Nothing else. PostgreSQL is optional (see Database).

## Run locally

Use two terminals.

### 1. Backend (http://localhost:5000)

```bash
cd backend
npm install
cp .env.example .env     # on Windows PowerShell: Copy-Item .env.example .env
npm run seed             # creates the tables and loads sample data
npm start                # or: npm run dev  (auto-restarts on change)
```

### 2. Frontend (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. In development the Vite server proxies `/api` and `/uploads` to the backend, so no CORS or URL configuration is needed.

Production build of the frontend: `npm run build` (output in `frontend/dist`, serve it from any static host and set `VITE_API_URL` if the API is on another origin).

## Database

Migrations live in [backend/db/migrations](backend/db/migrations) and are applied in order, once each, every time the server starts (recorded in a `schema_migrations` table). `npm run db:setup` applies them without starting the server.

| Migration | Adds |
| --------- | ---- |
| 001 | users, events |
| 002 | registrations |
| 003 | attendance, event staff (volunteers) |
| 004 | schedule sessions, announcements, notifications, multi-day events |
| 005 | teams, members, invitations, skills |
| 006 | judging criteria, assignments, scores, leaderboard settings |
| 007 | certificates, feedback |
| 008 | AI plans (unused; the planner was removed) |
| 009 | recommendations, crowd-level zones |
| 010 | student year/phone, event format/department/prizes/rules/FAQs, saved events |
| 011 | more schedule session types |
| 012 | event college (printed on certificates) |
| 013 | volunteer applications |

**Two ways to run the database**

- **Zero setup (default):** leave `DATABASE_URL` empty. The backend uses PGlite, a real PostgreSQL engine embedded in Node, and stores it in `backend/.data/pglite`.
- **PostgreSQL server:** create a database and set `DATABASE_URL`:
  ```bash
  createdb eventflow
  # backend/.env
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/eventflow
  ```
  Then run `npm run seed` or just `npm start`. The automated tests and manual checks so far ran against the embedded engine; the server path uses the same SQL through `pg` but has not been exercised in this repository's tests.

Stop the backend before running `npm run seed` when using the embedded database; it can only be opened by one process at a time.

## Environment variables

`backend/.env` (see [backend/.env.example](backend/.env.example)):

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| PORT | 5000 | API port |
| NODE_ENV | development | Set to `production` to require `JWT_SECRET` |
| CLIENT_ORIGIN | http://localhost:5173 | Allowed browser origin(s) for CORS, comma separated |
| JWT_SECRET | dev-only value | Secret used to sign login tokens. Use a long random string outside development |
| PUBLIC_APP_URL | http://localhost:5173 | Address of the web app; certificate QR codes link to `<PUBLIC_APP_URL>/verify/<id>` |
| ANTHROPIC_API_KEY | empty | Enables the AI recommendation ideas. Server-side only, never sent to the browser. Empty = AI features show "not set up" and nothing else changes |
| AI_MODEL / AI_EFFORT | claude-opus-5-5 / medium | Model and effort used for AI features |
| DATABASE_URL | empty | PostgreSQL connection string. Empty = embedded PGlite |
| PGLITE_DIR | .data/pglite | Where the embedded database is stored |

`frontend/.env` (optional, see [frontend/.env.example](frontend/.env.example)): `VITE_API_URL` is only needed when the API is on a different origin than the site. There are no secrets in the frontend.

## Sample data

`npm run seed` (in `backend/`) **deletes all users and events** and loads 11 accounts and 9 events (a multi-day hackathon with teams, judging criteria and a schedule, an event happening today, and a finished event with registrations, attendance and a session). Every account uses the password `Password123`.

| Role | Email |
| ---- | ----- |
| Admin | admin@eventflow.test |
| Organizer | organizer@eventflow.test (Priya), organizer2@eventflow.test (Arjun) |
| Participant | participant@eventflow.test (Sam), participant2@eventflow.test (Riya), karthik@, meera@, aditya@, fatima@eventflow.test |
| Judge (a participant account assigned as a judge) | judge1@eventflow.test, judge2@eventflow.test |

The login page shows buttons that fill these in during development. Admin accounts cannot be created through the register form. Volunteers and judges are ordinary participant accounts that an organizer assigns to an event.

## Design system

Fonts: Plus Jakarta Sans. Colours are defined once in `frontend/src/index.css` (`@theme`): midnight navy surfaces, electric purple/indigo for actions, pink and blue as accents. The Tailwind `indigo` and `slate` scales are re-pointed at the brand palette, so every screen shares it. Reusable pieces live in `components/ui` (Button, Card, Badge, Tabs, SearchBar, ProfileAvatar, Timeline, Modal, StatCard, EmptyState, FavoriteButton, FormField), `components/layout` (Sidebar, StudentLayout, DashboardLayout, BottomNavigation, PublicNavbar) and `components/attendance/QRPass.jsx`. Motion is short and is switched off for people who prefer reduced motion.

## Roles and what each can do

```text
Organizer   -> /organizer/dashboard: create events, then per event: overview, control center, insights,
               attendance, schedule, teams, judging, check-in, feedback, certificates, announcements,
               team and volunteers. Also: participants, analytics.
Student     -> /home: dashboard, /events explore, register (3 steps), /my/registrations (My Events + event pass),
               /my/team, /notifications, /my/certificates, /events/:id/feedback, /profile.
               If assigned: /judging (score teams) and /volunteer (scan QR codes, report crowd levels).
Admin       -> /admin/dashboard
```

All authorisation is enforced on the server (role checks and per-event ownership or assignment checks); the frontend hides what a role cannot use but is not relied on.

## Phase 10: recommendations and control center

- **Insights tab.** Recommendations come from fixed rules over the event's own aggregate numbers, each shown with the numbers behind it and a link to the page where you can act. Dismiss or mark done; items disappear on their own when the situation changes.
- **Ask AI for more ideas.** Sends Claude only aggregate numbers (no names, emails or comments) and stores up to five extra suggestions, clearly labelled as AI-written. Nothing is applied automatically.
- **Control center tab.** A live picture of the event, refreshed every 10 seconds: check-ins, attendance, sessions on now and next, check-in throughput, judging and feedback progress, important alerts, and recent activity.
- **Crowd levels.** The platform cannot sense crowds, so levels (Normal / Busy / High queue) are reported by the organizer and volunteers (volunteers use their event page on a phone). Each report shows who and when, an unreported area makes no claim, and a report older than an hour is marked as possibly out of date.

## Tests

```bash
cd backend
npm test
```

Runs the backend suites against temporary embedded databases: auth and validation, registration concurrency, QR attendance, schedule and notifications, teams, judging, certificates and feedback, analytics, and the Phase 10 rule engine, recommendations, zones and control center.

**About AI testing.** Without an Anthropic API key the AI features were verified against a scripted stub, against the real Anthropic SDK pointed at a local mock server (to check the request and response format), and in the browser against that mock. They have not been run against the live Anthropic API in this repository.

API reference: [docs/API.md](docs/API.md).
