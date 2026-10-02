# EventFlow

College Event Planning and Management Platform.

**Phase 1** (this release): authentication with three roles, an organizer dashboard, event creation, a participant-facing event listing with search and filters, and event details. Participant registration, AI features, QR attendance, certificates and judging arrive in later phases.

## Folder structure

```text
EventFlow/
├── backend/                     Node.js + Express REST API
│   ├── db/schema.sql            PostgreSQL schema (users, events)
│   ├── src/
│   │   ├── server.js            Entry point
│   │   ├── app.js               Express app (CORS, JSON, static uploads, routes)
│   │   ├── config.js            Environment configuration
│   │   ├── db.js                PostgreSQL (pg) or embedded PostgreSQL (PGlite)
│   │   ├── constants.js         Roles and event types
│   │   ├── routes/              URL -> controller mapping and access rules
│   │   ├── controllers/         Request handling
│   │   ├── models/              SQL queries (users, events)
│   │   ├── validators/          Request validation (zod)
│   │   ├── middleware/          auth, validate, upload, error handler
│   │   ├── utils/               event status helpers, HTTP errors
│   │   └── scripts/             setupDb.js, seed.js
│   ├── test/api.test.js         API integration tests
│   ├── uploads/                 Uploaded event banners (git-ignored)
│   └── .env.example
├── frontend/                    React + Tailwind CSS (Vite)
│   └── src/
│       ├── api/                 fetch client + endpoint functions
│       ├── context/             AuthContext, ToastContext
│       ├── hooks/               useApi, useDebounced
│       ├── components/
│       │   ├── ui/              Button, FormField, Modal, Card, Badge, ...
│       │   ├── layout/          DashboardLayout (sidebar), AppLayout, route guards
│       │   └── events/          EventCard, EventForm, EventFilters, EventsTable
│       ├── pages/               organizer/, participant/, admin/, auth pages
│       └── utils/               constants, formatting, validation
└── docs/API.md                  API endpoint documentation
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

Production build of the frontend: `npm run build` (output in `frontend/dist`).

## Database

The schema is in [backend/db/schema.sql](backend/db/schema.sql) and is applied automatically every time the server starts (it is safe to repeat). `npm run db:setup` applies it without starting the server.

| Table  | Columns |
| ------ | ------- |
| users  | id, name, email (unique), password (bcrypt hash), role (`organizer` / `participant` / `admin`), created_at |
| events | id, organizer_id, name, description, type, date, start_time, end_time, venue, max_participants, registration_deadline, image, organizer_name, organizer_contact, created_at |

Relationship: `events.organizer_id` references `users.id` (one organizer has many events; deleting a user deletes their events).

**Two ways to run the database**

- **Zero setup (default):** leave `DATABASE_URL` empty. The backend uses PGlite, a real PostgreSQL engine embedded in Node, and stores it in `backend/.data/pglite`.
- **PostgreSQL server:** create a database and set `DATABASE_URL`:
  ```bash
  createdb eventflow
  # backend/.env
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/eventflow
  ```
  Then run `npm run seed` or just `npm start`.

Stop the backend before running `npm run seed` when using the embedded database; it can only be opened by one process at a time.

## Environment variables

`backend/.env` (see [backend/.env.example](backend/.env.example)):

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| PORT | 5000 | API port |
| NODE_ENV | development | Set to `production` to require `JWT_SECRET` |
| CLIENT_ORIGIN | http://localhost:5173 | Allowed browser origin(s) for CORS, comma separated |
| JWT_SECRET | dev-only value | Secret used to sign login tokens. Use a long random string outside development |
| DATABASE_URL | empty | PostgreSQL connection string. Empty = embedded PGlite |
| PGLITE_DIR | .data/pglite | Where the embedded database is stored |

`frontend/.env` (optional, see [frontend/.env.example](frontend/.env.example)): `VITE_API_URL` is only needed when the API is on a different origin than the site.

## Sample data

`npm run seed` (in `backend/`) **deletes all users and events** and loads 5 accounts and 9 events. Every account uses the password `Password123`.

| Role | Email |
| ---- | ----- |
| Admin | admin@eventflow.test |
| Organizer | organizer@eventflow.test |
| Organizer | organizer2@eventflow.test |
| Participant | participant@eventflow.test |
| Participant | participant2@eventflow.test |

The login page shows buttons that fill these in during development. Admin accounts cannot be created through the register form.

## Phase 1 flow

```text
Login -> role detection
  Organizer   -> /organizer/dashboard -> Create Event -> My Events
  Participant -> /events -> search / filter -> event details -> Register
  Admin       -> /admin/dashboard
```

How the dashboard numbers are defined:

- **Upcoming events**: events that have not started yet.
- **Active events**: events happening right now, or still accepting registrations.
- **Registered participants**: always 0 in Phase 1, because registration is not built yet. The Register button shows a confirmation message only and saves nothing.
- Participants see events that have not ended yet; past events are only visible to their organizer and the admin.

## Tests

```bash
cd backend
npm test
```

Runs the API tests (auth, role access, validation, image upload, search and filters) against a temporary embedded database.

API reference: [docs/API.md](docs/API.md).
