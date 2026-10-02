# EventFlow API (Phase 1)

Base URL: `http://localhost:5000/api`. Requests and responses are JSON unless stated otherwise.

## Authentication

Log in or register to receive a `token`, then send it on every other request:

```
Authorization: Bearer <token>
```

Tokens last 7 days. There is no server-side logout: the client discards the token.

## Errors

| Status | Meaning |
| ------ | ------- |
| 400 | Malformed request body |
| 401 | Missing, invalid or expired token; wrong email/password |
| 403 | Signed in, but the role is not allowed |
| 404 | Not found |
| 409 | Email already registered |
| 422 | Validation failed |

```json
{ "message": "Please fix the highlighted fields", "errors": { "name": "Event name is required" } }
```

Other errors return `{ "message": "..." }`. `errors` is only present on 422 and 409.

## Endpoints

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| GET | /health | public | Health check |
| POST | /auth/register | public | Create an account |
| POST | /auth/login | public | Log in |
| GET | /auth/me | any | Current user |
| PATCH | /auth/me | any | Update own name |
| GET | /events | any | Events that have not ended; supports search and filters |
| GET | /events/mine | organizer | The organizer's own events (including past) |
| GET | /events/:id | any | One event |
| POST | /events | organizer | Create an event (multipart/form-data) |
| GET | /organizer/stats | organizer | Dashboard numbers and next events |
| GET | /organizer/participants | organizer | Registered participants (empty in Phase 1) |
| GET | /admin/stats | admin | Platform totals and all events |

### POST /auth/register

```json
{ "name": "Sam", "email": "sam@college.edu", "password": "Password123", "role": "participant" }
```

- `name`: 2-100 characters
- `email`: valid address, stored lowercase, unique
- `password`: 8-72 characters with at least one letter and one number (stored as a bcrypt hash)
- `role`: `organizer` or `participant` (admin cannot self-register)

Returns `201 { "user": { id, name, email, role, createdAt }, "token": "..." }`.

### POST /auth/login

```json
{ "email": "organizer@eventflow.test", "password": "Password123" }
```

Returns `200 { "user": {...}, "token": "..." }`. The same 401 message is used for unknown email and wrong password.

### GET /auth/me, PATCH /auth/me

`GET` returns `{ "user": {...} }`. `PATCH` takes `{ "name": "New Name" }` and returns the updated `{ "user": {...} }`.

### GET /events

Query parameters (all optional):

| Param | Example | Behaviour |
| ----- | ------- | --------- |
| q | `hack` | Case-insensitive match on name, description or venue |
| type | `Workshop` | Exact event type |
| date | `2026-10-14` | Events on that day |

Returns `{ "events": [Event] }` sorted by date and start time. Events that have already ended are excluded. An invalid `type` or `date` returns 422.

### GET /events/:id

Returns `{ "event": Event }`, or 404.

### POST /events

`Content-Type: multipart/form-data` with these fields:

| Field | Rules |
| ----- | ----- |
| name | required, 3-150 characters |
| description | required, 10-5000 characters |
| type | one of: Hackathon, Workshop, Symposium, Seminar, Competition, Cultural Event, Technical Event |
| date | `YYYY-MM-DD`, not in the past |
| startTime, endTime | `HH:MM` (24-hour); end must be after start |
| venue | required, 2-200 characters |
| maxParticipants | whole number, 1-100000 |
| registrationDeadline | `YYYY-MM-DDTHH:MM`, not in the past, not after the event start |
| organizerName | required, 2-100 characters |
| organizerContact | required; an email address or phone number |
| image | optional file, JPG/PNG/WEBP/GIF, up to 5 MB |

Returns `201 { "event": Event }`. Rejected requests (422) never leave an uploaded file on disk.

### GET /organizer/stats

```json
{
  "stats": { "totalEvents": 8, "upcomingEvents": 7, "activeEvents": 7, "totalParticipants": 0 },
  "upcomingEvents": [Event]
}
```

`upcomingEvents` holds up to 5 events that have not ended, soonest first.

### GET /admin/stats

```json
{
  "stats": { "totalEvents": 9, "upcomingEvents": 7, "activeEvents": 8, "totalParticipants": 0,
             "totalUsers": 5, "users": { "organizer": 2, "participant": 2, "admin": 1 } },
  "events": [Event]
}
```

## Event object

```json
{
  "id": 1,
  "organizerId": 2,
  "name": "CodeStorm 24h Hackathon",
  "description": "...",
  "type": "Hackathon",
  "date": "2026-10-16",
  "startTime": "09:00",
  "endTime": "21:00",
  "venue": "Main Auditorium",
  "maxParticipants": 150,
  "registrationDeadline": "2026-10-12T17:00",
  "image": "/uploads/3f2c....png",
  "organizerName": "Priya Nair",
  "organizerContact": "priya.nair@college.edu",
  "createdAt": "2026-10-02T09:30:00.000Z",
  "registeredCount": 0,
  "availableSeats": 150,
  "status": "upcoming",
  "registrationOpen": true
}
```

- `image` is `null` when no banner was uploaded; otherwise it is a path served by the API host.
- `status` is `upcoming`, `ongoing` or `ended`.
- `registrationOpen` is true until the deadline passes or the event ends.
- `registeredCount` is always 0 in Phase 1.
- Dates and times are plain local values with no timezone.
