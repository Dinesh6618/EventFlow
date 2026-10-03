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
| Vol+ | Volunteer Management | Departments with required headcounts, shifts, assignments that cannot overlap, tasks, volunteer check-in and check-out, announcements, reassignment requests, analytics, Command Center alerts and an admin audit log |
| Help | Emergency & Help Center | Participants report medical, security, technical, venue and lost & found problems during an event; organizers prioritise and assign, volunteers respond, admins set categories, official contacts, response teams and escalation timings. It never contacts emergency services |
| 10 | Recommendations and control center | Rule-based recommendations from the event's own numbers, optional AI ideas, a live control center with crowd-level reports |

Definitions of every number (for example attendance rate or conversion) are in [docs/API.md](docs/API.md).

## Folder structure

```text
EventFlow/
├── backend/                     Node.js + Express REST API
│   ├── db/migrations/           Versioned SQL migrations 001..017, applied automatically at start
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
| 014 | Help Center: categories, requests, updates, photos, contacts, response teams, settings |
| 015 | Volunteer Management: profiles, departments, shifts, assignments, tasks, duty attendance, announcements, reassignment requests, audit log, department templates |
| 016 | (password reset; removed again by 018) |
| 017 | email system: verification tokens, email preferences, email log, event meeting link |
| 018 | removes the password reset table and its session column |

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
| EMAIL_PROVIDER_API_KEY / EMAIL_FROM | empty | Real email through [Resend](https://resend.com): verification, registration, reminders and more. The key stays on the server. `EMAIL_FROM` must be on a domain verified with Resend. Empty = no email is sent (see [Email](#email)) |
| APP_URL | PUBLIC_APP_URL | Where the web app runs. Links in emails start with it, so set it to the real frontend address |
| EMAIL_VERIFICATION_REQUIRED | auto | Verification is required whenever email is configured, and always in production. `false` switches it off, `true` forces it. See [Email](#email) |
| EMAIL_SEND_INTERVAL_MS | 600 | The pause between queued emails in milliseconds (Resend allows about two a second) |
| RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX | 900000 / 100 | General limit for visitors who are **not** signed in, per IP address |
| USER_RATE_LIMIT_MAX | 1500 | General limit per signed-in account in that window. Far above normal use (the busiest page makes about 20 requests a minute) |
| AUTH_RATE_LIMIT_WINDOW_MS / AUTH_RATE_LIMIT_MAX / AUTH_RATE_LIMIT_IP_MAX | 900000 / 10 / 50 | **Failed** logins per IP address and email, and per IP address across all emails. Correct logins never count |
| SIGNUP_RATE_LIMIT_WINDOW_MS / SIGNUP_RATE_LIMIT_MAX | 3600000 / 5 | Sign-up attempts per IP address. Raise the number if many students sign up from one college network at once |
| EMAIL_RATE_LIMIT_WINDOW_MS / EMAIL_RATE_LIMIT_MAX / EMAIL_RATE_LIMIT_IP_MAX | 3600000 / 3 / 20 | Verification resend and change of address: per email address, and per IP address |
| EMAIL_RESEND_COOLDOWN_SECONDS | 60 | Pause between two emails to the same address |
| LINK_RATE_LIMIT_MAX | 200 | Opening the emailed verification link, per IP address in 15 minutes |
| RATE_LIMIT_DEV_MULTIPLIER | 10 | On localhost in development every limit is this many times higher. No effect in production; `1` tries the real numbers |
| RATE_LIMIT_LOG | true | One log line per blocked client (never passwords, keys or tokens) |
| TRUST_PROXY | false | Behind nginx or a hosting platform set the number of proxies (for example `1`), or every visitor looks like the proxy and shares one limit |
| ANTHROPIC_API_KEY | empty | Enables the AI recommendation ideas. Server-side only, never sent to the browser. Empty = AI features show "not set up" and nothing else changes |
| AI_MODEL / AI_EFFORT | claude-opus-5-5 / medium | Model and effort used for AI features |
| DATABASE_URL | empty | PostgreSQL connection string. Empty = embedded PGlite |
| PGLITE_DIR | .data/pglite | Where the embedded database is stored |

### Rate limiting

Rate limits stop password guessing, sign-up floods and email abuse. They are deliberately *not* one strict limit on everything:

- **Login** counts only failed attempts, per IP address and email, so a correct login is never blocked and one person's typos do not lock out their classmates.
- **Sending email** (resend verification, change of address) has a 60 second pause between emails to an address, 3 an hour per address and 20 an hour per IP address. It is the same for addresses with no account, so it reveals nothing. Nothing is counted while email is not configured, and an email that failed to send is given back.
- **Everything else** is counted per signed-in account (1500 per 15 minutes), not per network, so a whole college on one Wi-Fi does not share an allowance. Visitors who are not signed in are counted per IP address.
- A blocked request gets `429 { success: false, message, retryAfter }` and a `Retry-After` header. The web app shows "Please try again in 14 minutes", counts the time down on the button, and never retries by itself.

The counters live in the API process's memory (a few bytes per client, swept every minute and capped at 50,000 per limiter), which is right for one server. If you ever run several copies of the API, move the counters to a shared store such as Redis (only `take()` in `backend/src/middleware/rateLimit.js` changes).

### Email

EventFlow sends real email through [Resend](https://resend.com), from the backend only. To switch it on:

1. Create a Resend account, verify your sending domain, and create an API key.
2. In `backend/.env` set `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM` (an address on that domain) and `APP_URL` (where the frontend runs, because every link in an email starts with it). `.env` is git-ignored.
3. Restart the backend. Log in as an admin and open **Email** in the sidebar to see the status, send yourself a test, and read the delivery log.

What it sends: account verification (a link valid for 24 hours, single use), registration received / approved / rejected, schedule changes, announcements, team invitations, certificate notices, and a reminder 24 hours before an event with the QR pass (and the meeting link for online events). People choose which optional emails they get under **Profile → Email preferences**; security emails always arrive.

**One address per account.** The email entered at sign-up is the account email: it is used to log in, to verify the account and for every email about the account.

- **Verify:** a new account must verify its email (a link valid for 24 hours, once) before it can log in. Until then login says "Please verify your email before logging in." with a "Resend Verification Email" button.
- **Limits:** 60 seconds between emails to an address and 3 an hour; the pages show a countdown.
- **No password reset.** EventFlow has no "forgot password" feature and never emails a password or a password link.

**The sender is not an account.** `EMAIL_FROM` is the single "from" address every EventFlow email comes from (for example `EventFlow <no-reply@yourcollege.edu>`); people never log in to it. With Resend's free test sender (`onboarding@resend.dev`) mail is only delivered to the email address you opened your Resend account with, so to email everyone verify your own domain in Resend. Admins see failed deliveries on their dashboard and in **Admin → Email**.

Without a key nothing is sent. On a development machine sign-up still works and does not ask for verification (nobody could receive the link), "Resend Verification Email" says the email could not be sent, and admins see a warning on their dashboard. In production, with no email, new accounts wait: they cannot log in until email is set up. Details and the API are in [docs/API.md](docs/API.md).

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
