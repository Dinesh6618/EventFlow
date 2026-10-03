# EventFlow API

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

**Rate limits.** A request that is over a limit gets `429` with a `Retry-After` header (seconds) and
`{ "success": false, "message": "Too many requests. Please try again later.", "retryAfter": 60 }`. The values come from the
environment (see the README); the defaults are:

| What | Counted per | Default |
| ---- | ----------- | ------- |
| Everything, signed in | account | 1500 per 15 minutes |
| Everything, not signed in (not `/auth/*`, not `/health`) | IP address | 100 per 15 minutes |
| `POST /auth/login`, `POST /auth/change-email` (failed password checks only) | IP address + email; and IP address alone | 10 per 15 minutes; 50 per 15 minutes |
| `POST /auth/register` (validation errors do not count) | IP address | 5 per hour |
| `POST /auth/resend-verification`, `POST /auth/change-email` | email address | one per 60 seconds, 3 per hour |
| the same two | IP address | 20 per hour |
| `POST /auth/verify-email` | IP address | 200 per 15 minutes |
| `GET /verify/:code` | IP address | 30 per minute |
| Help requests, volunteer duty actions and announcements | account | see their sections |

Signed-in people are counted by account so many students on one network do not share an allowance. Behind a reverse proxy
set `TRUST_PROXY` so the IP address is the visitor's. Each blocked client is logged once per window with the category,
method, endpoint, time, IP address and user id, and never with passwords, keys or tokens.

## Endpoints

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| GET | /health | public | Health check |
| POST | /auth/register | public | Create an account |
| POST | /auth/login | public | Log in |
| POST | /auth/verify-email | public | Verify an account with the emailed token |
| POST | /auth/resend-verification | public | Send a new verification email (one per 60 seconds, 3 an hour per address) |
| POST | /auth/change-email | public | Correct a mistyped email before verifying (needs the password) |
| GET | /auth/email-preferences | any | Which optional emails the user receives |
| PUT | /auth/email-preferences | any | Switch optional email categories on or off |
| GET | /auth/me | any | Current user |
| PATCH | /auth/me | any | Update own name |
| GET | /events | any | Events that have not ended; supports search and filters |
| GET | /events/mine | organizer | The organizer's own events (including past) |
| GET | /events/:id | any | One event |
| POST | /events | organizer | Create an event (multipart/form-data) |
| GET | /organizer/stats | organizer | Dashboard numbers and next events |

| POST | /events/:id/registrations | participant | Register for an event |
| GET | /registrations/mine | participant | Own registrations (upcoming and history) |
| GET | /registrations/:id | organizer (own events) / owner | Registration with participant details |
| POST | /registrations/:id/cancel | participant | Cancel own registration |
| PATCH | /registrations/:id/status | organizer | Approve or reject |
| GET | /organizer/participants | organizer | Participants of own events (search, filters, pagination) |
| GET | /organizer/participants/export | organizer | Same filters, as CSV |
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

Returns `200 { "user": {...}, "token": "..." }`. There are three outcomes:

| Situation | Answer |
| --------- | ------ |
| Wrong password, or no such email | `401 { message: "Invalid email or password." }` (the same words for both, so accounts cannot be probed) |
| Right password, email not verified | `403 { message: "Please verify your email before logging in.", code: "EMAIL_NOT_VERIFIED" }`; no token is issued |
| Right password, email verified | `200` with the user and a token |

There is no password reset: a password cannot be changed through the app, and nothing in the API sends a password or a password link.

### The account email

Each account has **one** email address, the one entered at sign-up (`users.email`, stored in lower case, unique). The same address is used to log in, to verify the account and for every email about the account. The only other address in the system is the sender (`EMAIL_FROM`), which all of EventFlow's emails come from; nobody logs in to it.

```
Registration -> verification email (to the registered address) -> verify -> log in
```

### Email verification

`POST /auth/register` creates the account with `emailVerified: false` and returns `201 { user, verificationRequired, emailSent }`. The `user` has `emailVerified` and `emailVerifiedAt` (null until verified). When verification is required there is no session yet: a single-use link `<APP_URL>/verify-email?token=...` is emailed to the registered address, valid for **24 hours**. The link and token never appear in an API response or in a log. (If verification is not required, a `token` for a session is returned instead.) A second sign-up with an address that exists, in any capitals, is refused with `409` and sends nothing.

`POST /auth/verify-email` with `{ token }` marks the account verified, sets `emailVerifiedAt` and uses the token up: `200 { verified: true, message: "Email verified successfully. You can now log in." }`. Otherwise `400` with a `code`:

| code | message |
| ---- | ------- |
| TOKEN_INVALID | This verification link is invalid. |
| TOKEN_EXPIRED | This verification link has expired. |
| TOKEN_USED | This verification link has already been used. |

Logging in with a correct password on an unverified account gives `403 { message: "Please verify your email before logging in.", code: "EMAIL_NOT_VERIFIED" }` (a wrong password is still the ordinary `401`), and so does every other authenticated request from such an account.

`POST /auth/resend-verification` with `{ email }` or `{ token }` (the token of an expired link is enough) always answers `200 { message: "Verification email sent. Please check your inbox." }` in the same time whatever the address, so it cannot be used to find out who has an account: the email is sent in the background and a failure shows only in the admin Email log. Resending is limited to one every **60 seconds** and **3 per hour** per address, and 20 an hour per IP address; anything over answers `429` with `retryAfter`, the same for addresses that have no account. Nothing is counted while email is not configured (that answers `503`, the same for every address). A new link cancels the earlier one. `POST /auth/change-email` with `{ email, password, newEmail }` moves a still-unverified account to the corrected address and sends the link there; it answers generically when the new address is already taken.

**When verification is enforced.** Whenever email is configured, and always when `NODE_ENV=production` (an unverified address is never trusted there, even if the provider is down: new accounts then wait until email works). The one exception is a development machine with no email provider at all, where nobody could receive a link and enforcing it would lock out every new account. `EMAIL_VERIFICATION_REQUIRED=true|false` overrides all of this. Accounts that existed before the email system count as verified.

### Email preferences

`GET /auth/email-preferences` returns `{ preferences, categories }`; `PUT` takes any of the booleans below and returns the same shape.

| Category | Controls |
| -------- | -------- |
| reminders | The 24-hour event reminder (with the QR pass, and the meeting link for online events) |
| announcements | Organizer announcements and schedule changes |
| team | Team invitations |
| certificates | Certificate ready notices |
| platform | Reserved for platform news (nothing is sent yet) |

The verification email and emails about the person's own registration (received, approved, rejected) are always sent.

### Email, as an admin

All three need the admin role. `GET /admin/email-status` returns `{ configured, provider, from, appUrl, verificationRequired, problems, stats, recentFailures, templates }` and never the key. `recentFailures` is `{ last24h, latest }` (the count of emails that failed in the last day and the latest reason), which the admin dashboard shows as a warning. `problems` also says when `EMAIL_FROM` is Resend's shared test sender, which can only deliver to the address of your own Resend account. `GET /admin/email-logs?status=sent|failed|queued&limit=` lists the log: recipient, template, subject, status, provider message id and a short error. Links and tokens are never stored in it. `POST /admin/email-test` sends a test message to the admin (5 a minute).

Every email goes through one queue and one design (`services/email/templates.js`): `verifyEmail`, `registrationConfirmed`, `registrationApproved`, `registrationRejected`, `venueBookingApproved`, `venueBookingRejected`, `scheduleChanged`, `eventReminder`, `certificateAvailable`, `teamInvitation`, `eventAnnouncement` and `testEmail`. A failed send is logged as `failed` with the provider's reason (the key is stripped from it) and never breaks the request that triggered it. The verification email has EventFlow branding, a button, how long the link lasts, and a security notice ("EventFlow will never ask you for your password by email"). The venue-booking templates are ready but nothing sends them yet, because EventFlow has no venue-booking feature.

Events can carry an optional `meetingUrl` (http or https, up to 500 characters) for online and hybrid events; the reminder email includes it.

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
| college | optional, up to 150 characters; the college that conducts the event. Printed on certificates (falls back to the organizer's profile college) |
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

## Registration (Phase 2)

Statuses: `pending`, `approved`, `confirmed`, `rejected`, `cancelled`.

- A new registration is `confirmed`, or `pending` when the event has `requiresApproval`.
- `pending`, `approved` and `confirmed` all hold a seat (they count towards `registeredCount`). `rejected` and `cancelled` free it.
- The organizer can move `pending` to `approved` or `rejected`, `approved`/`confirmed` to `rejected`, and `rejected` back to `approved` (only if a seat is free).
- A participant can cancel an active registration until the event starts, and register again later (the row and `participantCode` are kept). A rejected participant cannot register again on their own.
- Registration needs `department` and `college` on the participant's profile (422 with `errors.profile` otherwise).
- There is one registration per person per event; a duplicate gets 409. Seats are checked under a row lock, so concurrent requests cannot oversell.

`POST /events/:id/registrations` returns `201 { registration, event }`. Errors: 404 unknown event, 409 full / closed / already registered / rejected.

`GET /events/:id` also returns `registration` (the caller's own row, or `null`) and records a first view for participants.

`GET /organizer/participants` query: `eventId`, `q` (name, email or participant ID), `department`, `college`, `status`, `page`, `pageSize` (max 100). Returns `{ registrations, total, page, pageSize, departments, colleges }`; the last two feed the filter dropdowns. `/export` accepts the same filters and returns `text/csv`.

Registration object: `{ id, eventId, userId, participantCode: "EF-2026-000042", status, registeredAt, updatedAt, cancelledAt, decidedAt }`.

## QR attendance and volunteers (Phase 3)

Every registration has a random 64-character hex `qr_token`. The QR code contains only `EF1:<token>`: no name, email or sequential id. The token is returned only to the registration's owner (`qrToken` in `GET /registrations/mine`, and only while the status is `approved` or `confirmed`). Cancelling and registering again issues a new token, so an old screenshot stops working.

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| POST | /events/:id/attendance/scan | organizer of the event, or its volunteers | Check in / check out from a scanned code |
| POST | /events/:id/attendance/manual | organizer | Check in / out without a QR code |
| GET | /events/:id/attendance | organizer, volunteers | Counts, latest scans, and (organizer only) the attendee list |
| GET | /events/:id/attendance/export | organizer | Attendance as CSV |
| GET | /events/:id/staff | organizer | Volunteers and judges of the event |
| POST | /events/:id/staff | organizer | Add a participant account as `volunteer` or `judge` |
| DELETE | /events/:id/staff/:staffId | organizer | Remove one |
| GET | /me/assignments | participant | Events the caller volunteers or judges at |

`POST .../scan` body: `{ "code": "EF1:...", "action": "check_in" | "check_out" }` (a bare token also works). Success: `{ result, participant: { name, participantCode, department, college }, at }`. Failures (all with a readable `message`): 422 not an EventFlow code, 404 unknown code, 409 for a different event / registration not approved or confirmed / not the event day / event ended / already checked in / already checked out / not checked in yet, 403 not allowed to scan this event.

Rules: attendance can only be recorded on the day of the event, and only for `approved` or `confirmed` registrations. Check-in is unique per registration (duplicates are refused and show the first time). Check-out needs a prior check-in.

Attendance states: `registered` (no check-in yet), `checked_in`, `checked_out`, and `absent` (no check-in and the event has ended). The dashboard summary:

```json
{ "totalRegistered": 3, "checkedIn": 1, "checkedOut": 1, "attended": 2,
  "notCheckedIn": 1, "absent": 0, "attendancePercentage": 66.7 }
```

`attended` = `checkedIn` + `checkedOut`; `checkedIn` means currently inside. `GET /events/:id/attendance` accepts `?state=` and `?q=` to filter the attendee list.

Stored attendance row: `participantId` (`user_id`), `eventId`, `checkInTime`, `checkOutTime`, `status`.

## Schedule, announcements and notifications (Phase 4)

**Multi-day events.** `POST /events` takes an optional `endDate` (`YYYY-MM-DD`, not before `date`). For a single-day event the end time must be after the start time; across days any times are allowed (a 24-hour hackathon is `09:00` to `09:00` the next day). Events always report `endDate` (equal to `date` when single-day). Status, listing, filters and attendance use the whole range.

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| GET | /events/:id/schedule | any signed-in user | Sessions plus `current`, `next`, `todayCount` |
| POST | /events/:id/schedule | organizer | Add a session |
| PATCH | /events/:id/schedule/:itemId | organizer | Replace a session's fields |
| DELETE | /events/:id/schedule/:itemId | organizer | Remove a session |
| GET | /me/schedule/today | participant | Today's sessions for events the caller holds a seat in |
| GET | /events/:id/announcements | organizer, participants with a seat | Announcement history |
| POST | /events/:id/announcements | organizer | Save and deliver as notifications |
| GET | /notifications | any | Inbox; `?unread=1`, `?limit=` (max 50), `?before=<id>` |
| POST | /notifications/:id/read | any | Mark one read (own only) |
| POST | /notifications/read-all | any | Mark all read |

Session body: `title` (required), `date` (must be an event day), `startTime`, `endTime` (after start), `sessionType` (`session`, `registration`, `ceremony`, `keynote`, `talk`, `panel`, `workshop`, `presentation`, `competition`, `evaluation_round`, `mentoring`, `networking`, `break`), and optional `description`, `venue`, `speaker`. Each item also returns `status`: `upcoming`, `ongoing` or `past`. `next` ignores breaks.

**Session attendance.** `POST /events/:id/attendance/scan` accepts an optional `sessionId` (check-in only). It records entry to that session on today's date and also checks the person in to the event if they were not yet. A second scan for the same session returns 409.

**Notifications** are created for: registration confirmed / pending, approved / rejected, a new registration that needs the organizer's approval, schedule changes (to everyone with a seat), announcements (to registrants, volunteers and judges), event reminders and session-starting notices. A notification is `{ id, type, title, message, link, eventId, read, readAt, createdAt }`; list responses also return `unreadCount`.

**Reminders** run in the server process every minute (`src/services/reminders.js`): a reminder 24 h before an event starts, another 1 h before, and a notice 15 min before each non-break session (only to approved/confirmed registrants). A `dedupe_key` per user guarantees each is sent once, even across restarts.

## Volunteer Management

Organizers recruit, schedule and monitor volunteers; volunteers run their duty from a dashboard. It extends the existing Volunteer platform (below) instead of replacing it: **a volunteer is still a student with an `event_staff` row of role `volunteer`**, which is what grants QR scanning and Help Center access. There is no new login or role. Everything here is checked on the server: the organizer must own the event, and a volunteer can only touch their own assignments and tasks (anyone else gets 404 for an ID that is not theirs).

**Vocabulary.** *Department*: a team for one event (Registration, Technical Support, ...) with a required number. *Shift*: a named time block for a department on a day. *Assignment*: one volunteer's duty (department, optional shift, day, start and end, place, task). *Task*: a specific job with its own time, priority and instructions. Application statuses are `pending`, `approved` and `declined` (shown as "Rejected").

**Rules the server enforces**
1. A volunteer cannot hold overlapping assignments, in this event or any other (touching shifts are fine).
2. A department (or, when an assignment names a shift, that shift) cannot take more volunteers than it requires unless the organizer sends `allowOverflow: true`.
3. A new or changed assignment is `assigned` until the volunteer accepts it. Check-in needs `accepted` (an organizer checking someone in by hand accepts it for them).
4. A task can only be given to a volunteer who already holds a duty in that department, and the volunteer must have accepted that duty before accepting or starting the task.
5. Check-in opens `earlyCheckInMinutes` before the shift (default 30) and closes when it ends; arriving more than `lateGraceMinutes` (default 10) after the start marks them late. Both are admin settings. Check-out needs a check-in, and checking out completes the duty.
6. A completed task is locked: an organizer can only edit it with `allowCompleted: true`. Volunteers can never edit a task's requirements.
7. Deactivated (per event) or suspended (platform-wide, by an admin) volunteers get no new assignments and lose access; the duties they had not started are released.
8. Removing an assignment keeps the row (status `removed`) and writes to the audit log. An assignment of someone who is on duty cannot be changed or removed until they check out.

### Students

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | /events/:id/volunteers/apply | The full application: `message`, `phone`, `year`, `skills[]`, `interests`, `availability`, `experience`, `preferredDepartment` (everything optional). Same handler as `/events/:id/volunteer-applications`, which still works |
| GET, PUT | /volunteer/profile | The volunteer profile: `volunteerCode` (`VOL-2026-000001`), interests, experience, availability, plus phone, year and skills from the account |
| GET | /volunteer/dashboard | Today's duty and the current one, the next duty, today's and upcoming tasks, announcements, open requests, totals and the organizer's contact |
| GET | /volunteer/tasks, /volunteer/schedule, /volunteer/history, /volunteer/announcements | The caller's own tasks (today, upcoming, overdue, completed), duties, completed activities and announcements addressed to them |
| POST | /volunteer-assignments/:id/accept | Accept a duty |
| POST | /volunteer-assignments/:id/check-in, /check-out | Check in or out. 409 with a reason when it is too early, too late or already done |
| POST | /volunteer-assignments/:id/break | `{ onBreak }` while on duty |
| POST | /volunteer-assignments/:id/reassignment | `{ reason }`: ask to be reassigned (one open request per assignment) |
| POST | /volunteer-tasks/:id/accept, /start, /complete | Move a task through `assigned` → `accepted` → `in_progress` → `completed` |

### Organizer (own events only)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /events/:eventId/volunteer-overview | Totals (total, assigned, unassigned, checked in, active, tasks pending/completed, urgent, overdue), a card per department (`assigned`, `needed`, `status`: `complete`, `needed` or `over`) and alerts |
| GET | /events/:eventId/volunteers | The team. Filters: `search` (name, email or volunteer ID), `departmentId`, `status` (`available`, `assigned`, `checked_in`, `active`, `on_break`, `completed`, `absent`, `inactive`), `attendance` (`not_checked_in`, `checked_in`, `checked_out`, `absent`, `late`), `shiftId`, `date` |
| GET, PUT | /events/:eventId/volunteers/:userId | Detail (profile, application, current duty, all duties, attendance and hours, tasks, reassignment requests, timeline) / `{ isActive, notes }` to deactivate or reactivate |
| GET, POST | /events/:eventId/volunteer-departments | List (with `assigned`, `needed` and the admin `templates`) / create `{ name, description, requiredCount, location, shiftStart, shiftEnd, instructions, priority }` |
| PUT, DELETE | /volunteer-departments/:id | Edit / delete (409 while it has active assignments) |
| GET, POST | /events/:eventId/volunteer-shifts | List with `assigned` and `available` / create `{ name, date, startTime, endTime, requiredCount, departmentId \| departmentIds[] }` |
| PUT, DELETE | /volunteer-shifts/:id | Edit / delete |
| GET, POST | /events/:eventId/volunteer-assignments | List (`date`, `userId`) / assign `{ userId, departmentId, shiftId?, date?, startTime?, endTime?, location?, task?, allowOverflow? }`. Missing date and times come from the shift, then the department |
| PUT, DELETE | /volunteer-assignments/:id | Reassign (change volunteer, department, shift, time or place; sends it back for acceptance) / remove `{ reason? }` |
| POST | /volunteer-assignments/:id/check-in, /check-out | An organizer can check someone in or out by hand |
| GET | /events/:eventId/volunteer-attendance?date= | `{ summary: { total, checkedIn, late, absent, notCheckedIn }, rows }` for a day (default today) |
| GET, POST | /events/:eventId/volunteer-tasks | List (`status`, `departmentId`, `userId`, `priority`, `date`) / create `{ userId, departmentId, title, description, location, date, startTime, endTime, priority, instructions }` |
| PUT | /volunteer-tasks/:id | Edit, or `{ status: "cancelled" }`. Completed tasks need `allowCompleted: true` |
| POST | /volunteer-tasks/:id/complete | The organizer can complete any open task |
| GET, POST | /events/:eventId/volunteer-announcements | History / send `{ title, message, scope: all \| department \| shift \| volunteer, departmentId \| shiftId \| userId }`; 422 if nobody matches |
| GET | /events/:eventId/volunteer-reassignments | Requests, open ones first |
| PATCH | /volunteer-reassignments/:id | `{ status: approved \| rejected, note? }`. Approving removes the assignment, reopens the slot and cancels tasks not yet started |
| GET | /events/:eventId/volunteer-analytics | Totals, `departmentDistribution`, `attendanceByHour`, `tasksByDepartment`, `volunteerHours`, `departmentWorkload` |
| GET | /events/:eventId/volunteer-audit | Who changed what |
| GET | /events/:id/volunteer-applications, PATCH …/:appId | Review and decide applications (existing endpoints); approving creates the volunteer profile |

### Admin

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /admin/volunteer-analytics | The same reports across every event, plus `byEvent` |
| GET | /admin/volunteer-activity, /admin/volunteer-audit | Recent duties (no email addresses) and the audit log; optional `eventId` |
| GET, PUT | /admin/volunteers, /admin/volunteers/:userId | Everyone with a profile / `{ status: active \| suspended }` |
| GET, POST, PUT | /admin/volunteer-categories | Department templates offered to organizers |
| GET, PUT | /admin/volunteer-settings | `{ earlyCheckInMinutes, lateGraceMinutes, shiftReminderMinutes }` (0 to 240) |

**Statuses.** A volunteer's live status per duty is derived, not stored: `assigned`, `checked_in`, `active` (checked in with a task in progress), `on_break`, `completed` (checked out), `absent` (the shift ended with no check-in); `available` means no live duty and `inactive` means deactivated. Attendance is `not_checked_in`, `checked_in`, `checked_out` or `absent`, with `late` as a flag. "Checked in" in the overview means checked in today; "active" means on duty right now.

**Notifications** (existing system): application decision, assigned, assignment changed or removed, task assigned, changed or cancelled, announcement, reassignment decision, and "your shift starts soon" (once per duty, `shiftReminderMinutes` before it starts). Organizers are notified of applications, accepted assignments, completed tasks, late check-ins and reassignment requests. EventFlow has no way to cancel an event, so there is no event-cancelled notice.

**Command Center.** `GET /events/:id/control-center` carries `volunteers`: `total`, `assigned`, `unassigned`, `checkedIn`, `active`, `pendingTasks`, `urgentTasks`, `overdueTasks` and `alerts` (a short department, volunteers who have not checked in, overdue tasks).

**Privacy.** A volunteer's dashboard, schedule, tasks and announcements only ever contain their own data and the organizer's contact. Admin activity views carry names and volunteer IDs but no email addresses. The organizer's private note on a volunteer is only returned to that organizer.

## Emergency & Help Center

Participants report problems during an event; the event team tracks, assigns, answers and closes them. **EventFlow does not contact emergency services.** It routes requests to the event's own staff and shows the official contact numbers an admin configured. Nothing is automatically sent outside EventFlow.

**Who is who.** *Participant*: a student registered for the event. *Volunteer*: a participant the organizer added as an event volunteer (see Volunteer platform); volunteers only ever see requests handed to them. *Organizer*: the event's owner. *Admin*: platform-wide settings and monitoring, with metadata only.

**Request lifecycle.** `reported` → `acknowledged` → `assigned` → `in_progress` → `resolved` → `closed`, or `cancelled`. The server refuses any other move (409). A participant can cancel until work starts (`reported`, `acknowledged`, `assigned`). Closing needs `resolved` first. Assigning is possible until work starts.

**Priority** (`low`, `medium`, `high`, `urgent`) comes from the category's starting priority (defaults: medical and security urgent, technical high, venue and lost & found medium, general low). A participant cannot choose it: any `priority` they send is ignored. Urgent categories also need `confirmUrgent: true`. Organizers can change the priority or escalate (which lifts it to urgent).

**When help is open.** Requests can be made by a participant with a pending/approved/confirmed registration, on the day of the event or while it runs (409 otherwise). Official contacts are shown on the same days. Limits: at most 8 new requests per person per 10 minutes (`HELP_CREATE_LIMIT`, 429) and 5 open at once per event (`HELP_MAX_OPEN`, 409).

**Request IDs** look like `HELP-2026-001245`.

### Participant

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /events/:eventId/help/info | Everything the screen needs: `canRequest`, `reason`, active `categories`, `locations` (event venue, schedule venues and crowd zones), `contacts` (only on event days), `openRequests` |
| POST | /events/:eventId/help-requests | Create. Multipart or JSON: `categoryId`, `location`, `description`, `contactPreference` (`app`, `in_person`, `call`), `confirmUrgent`, optional `photo` (JPG/PNG/WEBP up to 5 MB, checked by content). Lost & Found also needs `lostFoundKind` (`lost`/`found`) and `itemName`, with optional `itemWhen` |
| GET | /events/:eventId/help-requests/my | The caller's requests for the event |
| GET | /help-requests/mine | The caller's requests across events |
| POST | /help-requests/:id/cancel | Cancel (own request, before work starts) |

### Shared (the server decides what each person sees and may do)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /help-requests/:id | `{ request, timeline, attachments, responders? }`. `request.capabilities` lists exactly what this viewer may do. People with no stake get 404, so IDs cannot be probed |
| GET | /help-requests/:id/attachments/:attId | The photo, for the participant, the event organizer and the assigned volunteer only. Stored outside the public uploads folder; `Cache-Control: private, no-store` |
| PATCH | /help-requests/:id/status | `{ status, message? }`. Organizer: `acknowledged`, `in_progress`, `resolved`, `closed`. Assigned volunteer: `in_progress`, `resolved` |
| POST | /help-requests/:id/updates | `{ message, internal? }`. Organizer or assigned volunteer. Participants receive visible updates as notifications; `internal` notes never reach them |
| PATCH | /help-requests/:id/item-status | Lost & Found: `{ itemStatus: open \| found \| claimed \| returned }` (organizer or assigned volunteer) |

### Volunteer

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /volunteer/help-requests | Requests assigned to the caller that are not closed or cancelled |
| PATCH | /help-requests/:id/accept | Accept an assigned request |

### Organizer

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /organizer/events/:eventId/help-requests | `{ summary, requests, responders, categories, settings }`; filter with `state` (`open`/`active`), `status`, `priority`, `category`. Urgent first |
| GET | /organizer/help-summary | Counts across the organizer's events, plus up to three open urgent requests |
| GET | /organizer/events/:eventId/help-analytics | Reports (see below) |
| PATCH | /help-requests/:id/assign | `{ volunteerId }`. Must be one of the event's volunteers; 409 once work has started |
| PATCH | /help-requests/:id/priority | `{ priority, reason? }`; the volunteer is notified |
| PATCH | /help-requests/:id/escalate | `{ reason? }`. Lifts the request to urgent and flags it |

### Admin

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /admin/help-requests | Platform-wide, with `summary`. Metadata only: no description, participant, photo or message text |
| GET | /admin/help-analytics | Reports with `byEvent` |
| GET, POST | /admin/help-categories | List all / create `{ name, description?, icon?, priorityLevel?, isUrgent? }` |
| PUT | /admin/help-categories/:id | Edit any field, including `isActive` (a switched-off category is not offered) |
| GET, POST | /admin/emergency-contacts | `{ name, department?, phone, availability?, description?, eventId? }`. No `eventId` = every event. No numbers are built in |
| PUT | /admin/emergency-contacts/:id | Edit, or `isActive: false` to hide |
| GET, POST, PUT | /admin/help-teams | Response teams, `{ name, description?, isActive? }` |
| POST, DELETE | /admin/help-teams/:id/members, /members/:userId | Add by `{ email }` / remove a responder. A volunteer's team names appear next to them when an organizer assigns, and as a team label to the participant |
| GET, PUT | /admin/help-settings | Escalation timings `{ ackMinutes: { urgent, high }, unresolvedMinutes: { urgent, high, medium, low } }` in minutes (defaults 2, 5 and 30, 60, 120, 240) |

### Notifications

| Who | When (`type`) |
| --- | ------------- |
| Participant | submitted (`help_submitted`), acknowledged, assigned, status change, resolved (`help_resolved`), a responder's update (`help_update`) |
| Volunteer | assigned (`help_assigned`), priority changed (`help_priority`), cancelled (`help_cancelled`) |
| Organizer | an urgent request created (`help_urgent`), escalation (`help_escalation`), unresolved too long (`help_unresolved`) |

Notifications name the category and place, never the description, because a description may hold medical details.

### Escalation

A job runs every 30 seconds. An **urgent** or **high** request still `reported` after the admin's limit is flagged `escalated` and the organizer is notified once. A request still open after the limit for its priority triggers one "still open" reminder. The job only flags and notifies inside EventFlow; the request's status and priority do not change on their own.

### Privacy

- A participant sees their own requests, a first name and team for the responder, and only updates meant for them. Never other people's data, phone numbers or internal notes.
- Organizers and the assigned volunteer see the description, the participant's name and department, and the participant's phone **only if they chose "Call me"**. Email addresses are never shown.
- Admins see metadata for monitoring, never descriptions, names, photos or messages.
- Photos are stored outside the public folder, verified by their first bytes (not just their name), and served only through the authenticated endpoint.
- Every status, assignment, priority and escalation change is written to the request's timeline with who and when (the audit trail). Participants see only the entries meant for them.

### Reports

`GET .../help-analytics` returns `summary` (`total`, `open`, `inProgress`, `urgent`, `resolved`, `escalated`), `byCategory` and `byLocation` (count and percent), `byPriority`, `averageResponseMinutes` (until acknowledged), `averageResolutionMinutes` (until resolved), `volunteerWorkload` (assigned, open, resolved) and, for admins, `byEvent`. **Open** means waiting for a response (`reported`, `acknowledged`, `assigned`); **in progress** is being worked on; **urgent** counts only urgent requests that are not finished. The Control Center (`GET /events/:id/control-center`) carries the same counts as `help`, plus `recentAlert`: the newest open urgent request's code, category and place.

## Volunteer platform

Students find events that need help, apply, and the organizer approves or declines. Approval adds the student to the event's staff as a `volunteer` (the same record as adding them by email on the Team tab), so they can scan QR codes and report crowd levels for that event.

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| GET | /volunteer/opportunities | participant | Events that have not ended, each with `applicationStatus` (`null`, `pending`, `approved`, `declined`) and `isVolunteer` |
| POST | /events/:id/volunteer-applications | participant | Apply: `{ message? }` (up to 500 characters). 409 if already applied (pending or approved), already a volunteer, or the event has ended. A declined student may apply again |
| DELETE | /events/:id/volunteer-applications/mine | participant | Withdraw a pending application (204; 404 if none) |
| GET | /events/:id/volunteer-applications | the event's organizer | Applications with the applicant's name, email, department, college and message, pending first |
| PATCH | /events/:id/volunteer-applications/:appId | the event's organizer | `{ status: "approved" \| "declined" }`. 409 if already decided |

The organizer is notified of each application, and the student of the decision.

## Teams (Phase 5)

Event fields (set on create, or later via `PATCH /events/:id/team-settings`): `teamEnabled`, `minTeamSize`, `maxTeamSize` (1-50, max not below min), `allowMultipleTeams`.

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| GET | /events/:id/teams | organizer, participants with a seat, event staff | Teams with members, `rules`, and per-viewer fields (`myRole`, `myInvitation`, `matchScore`) |
| POST | /events/:id/teams | participant with a seat | Create a team (the creator becomes leader) |
| GET | /events/:id/teams/overview | organizer | All teams plus registered participants without a team |
| PATCH | /events/:id/team-settings | organizer | Change the team rules |
| GET | /teams/:teamId | as above | One team; leaders and the organizer also get pending `invitations` |
| PATCH | /teams/:teamId | leader | Edit name, project, skills |
| DELETE | /teams/:teamId | leader or the organizer | Disband |
| POST | /teams/:teamId/requests | participant | Ask to join |
| POST | /teams/:teamId/invitations | leader | Invite a registered participant (`{ userId }`) |
| POST | /invitations/:id/respond | invitee (for an invitation), leader (for a request) | `{ accept: true \| false }` |
| DELETE | /invitations/:id | whoever created it | Withdraw |
| POST | /teams/:teamId/leave | member | Leave; leadership passes to the longest-standing member, an empty team is deleted |
| DELETE | /teams/:teamId/members/:userId | leader | Remove a member |
| GET | /teams/:teamId/suggestions | leader, organizer | Teammate suggestions; `?skill=Python` overrides the team's needs |
| GET | /me/invitations | participant | Pending invitations and own requests |

Rules (all enforced on the server, inside a transaction that locks the event): only people with a pending/approved/confirmed registration can create or join teams; team names are unique per event (case-insensitive); a team cannot exceed `maxTeamSize`, even when several requests are accepted at once; with `allowMultipleTeams` off, a person can be in one team, and their other open invitations are cancelled when they join. Teams freeze once the event has ended.

**Skills.** `PATCH /auth/me` accepts `skills` (up to 15, each up to 40 characters); omit it to leave skills unchanged. A team stores the skills it is *looking for*.

**Suggestions are rule-based, not AI.** A needed skill matches a person's skill when it is the same (3 points), when one contains the other as whole words (2), or when both belong to the same family such as design, frontend, backend, data, mobile, cloud, database, hardware or business (1). For example a team needing "UI/UX Designer" ranks "UI/UX" first, then "Figma" and "Product Design". People already in a team (when only one is allowed) or already invited are left out; scores of zero are never shown. Response: `{ needed, suggestions: [{ userId, name, department, college, skills, score, matches: [{ need, skill, strength }] }] }`.

Notifications are sent for invitations, join requests, answers, removals, a new leader and disbanding.

## Judging and leaderboard (Phase 6)

Judges are people added with role `judge` on the event's Team tab (`POST /events/:id/staff`); they keep their participant account.

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| GET | /events/:id/criteria | organizer, judges, volunteers, participants with a seat | Criteria and `maxTotal` |
| POST / PATCH / DELETE | /events/:id/criteria[/:criterionId] | organizer | `{ name, description?, maxScore }` (1-1000) |
| GET | /events/:id/judging/assignments | organizer | Judges with their `teamIds`, and all teams |
| PUT | /events/:id/judging/assignments/:judgeId | organizer | Replace one judge's teams: `{ teamIds }` |
| POST | /events/:id/judging/auto-assign | organizer | `{ judgesPerTeam }`: tops teams up with the least-loaded judges |
| GET | /events/:id/judging/progress | organizer | Totals, per judge, every evaluation (with private comments) |
| POST | /events/:id/judging/evaluations/:id/unlock | organizer | Let a judge correct a submitted evaluation |
| PATCH | /events/:id/judging/settings | organizer | `{ leaderboardPublished, shareJudgeComments }` |
| GET | /me/judging | participant | Events the caller judges, with progress |
| GET | /events/:id/judging/mine | judge | Assigned teams and criteria |
| GET | /events/:id/judging/teams/:teamId | judge | Project details and the judge's own evaluation |
| PUT | /events/:id/judging/teams/:teamId/evaluation | judge | Save a draft: `{ scores: { <criterionId>: number }, comments }` |
| POST | .../evaluation/submit | judge | Submit (needs every criterion) |
| GET | /events/:id/leaderboard | organizer: always; others: once published | Ranking |
| POST | /teams/:teamId/submit | team leader | Mark the project ready for judges |

Rules:

- Criteria are locked once any score exists (no adding, deleting or changing a maximum; names and descriptions can still change).
- A score must be between 0 and the criterion's maximum, with at most two decimals. Drafts may be partial; submitting requires every criterion.
- A submitted evaluation is read-only for the judge. The organizer's **unlock** lets them edit; the first edit returns it to `draft`, and it is locked again when re-submitted. Only submitted evaluations count towards the leaderboard.
- Judges only see teams assigned to them, only their own scores, and a judge can never be assigned to (or join) a team they belong to. A judge cannot be unassigned from a team they already submitted for.
- Leaderboard score = average of the team's submitted evaluation totals. Ties share a rank (1, 2, 2, 4); teams without scores come last with no rank. Status is `Final` (every assigned judge submitted), `In progress`, `Awaiting scores` or `Not assigned`.
- **Privacy.** The organizer gets per-criterion averages and every judge's comment. Everyone else gets nothing until the organizer publishes, then only `{ rank, team, teamId, score, status }` plus `myTeamIds`. Judges' comments reach a team only when `shareJudgeComments` is on, only for that team's own evaluations, and anonymised (`Judge 1`, `Judge 2`). Unpublishing hides the board again. Publishing notifies registrants.

Team projects also carry `repositoryUrl` and `demoUrl` (http/https only) and `submittedAt`; submitting needs a project title and description.

## Certificates and feedback (Phase 7)

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| GET | /events/:id/certificates | organizer | Issued certificates, `eligibility` per type, `canIssue` |
| POST | /events/:id/certificates | organizer | Issue: `{ type, scope?, finalistUpToRank? }` in bulk, or `{ type, recipients: [{ name, email? }] }` by name |
| GET | /events/:id/certificates/preview?type= | organizer | A sample PDF of that type's design with this event's details, marked SAMPLE and without a verification QR code |
| POST | /events/:id/certificates/:certId/revoke | organizer | `{ reason? }` |
| GET | /certificates/mine | participant | Own, non-revoked certificates |
| GET | /certificates/:code/pdf | the holder, or the event's organizer | The certificate as a PDF |
| GET | /verify/:code | **public** (rate limited) | Authenticity check |
| GET | /events/:id/feedback/mine | participant | What can be rated now, and the caller's own answers |
| PUT | /events/:id/feedback | participant with a seat | Create or update: `{ sessionId?, overall, organization?, speaker?, venue?, comments?, suggestions? }` |
| GET | /events/:id/feedback/summary | organizer | Averages, distribution, session-wise ratings, anonymous comments |

**Certificate types:** `participant`, `winner`, `runner_up`, `finalist`, `volunteer`, `organizer`, `speaker`, `judge`. The organizer can issue certificates at any time, even before the event starts. Holders (and their notification) only get access from the event's start time; the organizer sees them throughout.

- `participant` goes to people who checked in (`scope: "attended"`, default) or everyone approved/confirmed (`"registered"`).
- `winner` is the members of the rank-1 team(s), `runner_up` rank 2, `finalist` ranks 3 to `finalistUpToRank` (default 5), all taken from the leaderboard.
- `volunteer` and `judge` come from the event's Team tab; `organizer` is the event organizer.
- `speaker`, or anyone else, is issued by name. An email links it to that account; with no email it is name-only (for example an external speaker).
- Each person gets at most one certificate per type per event; issuing again only adds people who are missing, and returns 409 when there is nobody new.
- Certificate IDs look like `EVF-2026-001245` (year + a global sequence). The PDF (landscape A4) shows the holder, event, dates, venue, type, ID, issue date, organizer name and contact, and a QR code to `<PUBLIC_APP_URL>/verify/<id>`. Each type has its own colours and seal, and a rosette pattern drawn from the certificate ID, so no two certificates look identical.

**Verification** returns `{ status: "VALID" | "REVOKED" | "NOT_FOUND", valid, certificate? }` where `certificate` is only `{ code, participantName, eventName, type, typeLabel, issuedAt, organizer }`: no email and no account ids. Unknown or malformed IDs give 404. Because IDs are sequential, the endpoint is rate limited (30 requests per minute per IP; 429 with `Retry-After`). Revoked certificates verify as `REVOKED` and can no longer be downloaded by the holder.

**Feedback rules.** The whole event can be rated once it has ended; a session once it has finished (breaks excluded). Only people with a pending/approved/confirmed registration can answer, once per target, and may edit their answer. Ratings are whole numbers 1-5; `overall` is required. Session feedback keeps `overall` and `speaker`; organization and venue apply to the whole event. The organizer sees responses anonymously. After an event ends, approved/confirmed registrants get one "How was it?" notification (sent by the reminder job).

## Analytics (Phase 8)

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| GET | /organizer/analytics | organizer | Summary, charts and per-event performance for the organizer's own events |
| GET | /organizer/analytics/export | organizer | The per-event performance table as CSV |

Filters (all optional, applied to every figure): `eventId`, `type` (an event type), `from` and `to` (`YYYY-MM-DD`; an event is included when it ends on/after `from` and starts on/before `to`). Invalid values return 422.

Response: `{ filters, summary, performance[], charts }`. Everything is computed from stored records; nothing is estimated or filled in. With no matching data the numbers are 0 (or `null` for an average that has no responses).

- `summary`: `events`, `totalRegistrations`, `totalAttendance`, `attendanceRate`, `registrationConversion`, `pageViewers`, `teamCount`, `averageFeedback`, `feedbackResponses`, `certificateCount`.
- `performance[]` (one row per event, by date): `registrations`, `fillRate`, `attendance`, `attendanceRate`, `conversion`, `engagement`, `feedbackAverage`, `feedbackResponses`, `completion`, `teams`.
- `charts`: `registrationTrend` (daily count and running total, last 120 days), `attendanceTrend` (check-ins by hour when they fall on one day, otherwise by day), `departments` and `colleges` (top seven plus `Other`), `eventTypes` (events, registrations, check-ins per type), `sessionAttendance` (scans per session, up to 20), `feedbackRatings` (5 to 1).

Definitions: **registrations** = pending + approved + confirmed. **Attendance rate** = checked-in people / approved + confirmed registrations. **Registration conversion** = of the people who opened an event page, the share who registered. **Engagement** = share of registrations who scanned into a session, joined a team, or sent feedback. **Completion** = share of approved + confirmed registrations holding a non-revoked participation, winner, runner-up or finalist certificate. **Average feedback** = mean overall rating of whole-event feedback, weighted by responses.

The web UI draws these as custom SVG/HTML charts (no chart dependency) with a legend for multi-series charts, a hover/keyboard tooltip on every chart, and a Chart/Table switch so each figure can be read without hovering.


## Recommendations and the control center (Phase 10)

All of these are for the owning organizer, except the crowd-zone endpoints, which the event's volunteers can also use. Paths are under `/api`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /events/:id/recommendations | Re-checks the rules against the event's current data, then returns `{ recommendations, ai: { configured, model } }` |
| PATCH | /events/:id/recommendations/:rid | `{ status: "new" \| "dismissed" \| "done" }`. 409 if the recommendation no longer applies |
| POST | /events/:id/recommendations/ai | Ask Claude for extra ideas. Returns `{ added, recommendations }`. 503 if no API key, 502 on provider/validation failure, 429 over the hourly allowance |
| GET | /events/:id/control-center | The live snapshot ("digital event twin") described below |
| GET | /events/:id/zones | Crowd areas of the event (organizer or assigned volunteer) |
| POST | /events/:id/zones | Organizer only. `{ name }` (2-60 characters, unique per event ignoring case, 409 otherwise) |
| PATCH | /events/:id/zones/:zoneId | Organizer or volunteer reports what they see: `{ status: "normal" \| "busy" \| "high_queue", note? }` (note up to 200 characters). Stores who reported it and when |
| DELETE | /events/:id/zones/:zoneId | Organizer only |

**Recommendation object.** `{ id, ruleKey, source: "rules" \| "ai", category, severity: "important" \| "suggestion" \| "info", title, message, suggestion, evidence: [{ label, value }], link, status: "new" \| "dismissed" \| "done" \| "resolved", createdAt, updatedAt, resolvedAt }`.

**Where recommendations come from.** Rule-based ones are produced by fixed, documented rules (about 23) over aggregate numbers collected from the event's own records: registrations and pending approvals, attendance and per-session scans, schedule (venue clashes, long stretches without a break, missing speakers or venues), volunteers, teams, judging progress, feedback and certificates. Each one carries the numbers that triggered it (`evidence`) and a link to the page where the organizer can act, for example "Your event has 72% attendance. Consider sending a reminder before the next session." The same input always gives the same output.

**Lifecycle.** Opening the list re-evaluates every rule. New findings are added; existing ones are refreshed in place (no duplicates, one row per event and rule); rules whose situation has ended are set to `resolved` automatically; a resolved item whose situation returns becomes `new` again. `dismissed` and `done` are remembered for as long as the situation lasts.

**AI ideas.** `POST .../recommendations/ai` sends Claude only aggregate numbers (no names, emails, comments or QR data) plus the titles already shown, and asks for at most five additional, specific suggestions with the numbers they are based on. The reply must match a JSON schema and passes the same validation on our side; a malformed reply is retried once and, if still invalid, nothing is stored. Stored items have `source: "ai"`, severity `suggestion` and an evidence row "Based on". They are labelled as AI-written in the UI. Nothing is ever applied automatically.

**Control center.** `GET .../control-center` returns `{ generatedAt, event, phase, participants, teams, sessions, operations, judging, feedback, communication, activity, alerts, staleAfterMinutes }`:

- `phase`: `registration`, `upcoming` (registration closed), `live` or `ended`.
- `participants`: registered, capacity, pending approvals, checked in, expected (approved/confirmed), currently inside, attendance rate.
- `sessions`: sessions today, the session(s) running now with the number of people scanned in, and the next session with minutes until it starts.
- `operations`: check-ins in the last 10 minutes, last check-in time, volunteers assigned, and the crowd `zones`.
- `alerts`: only `important` findings (at most four), each with a link.

Every figure is read from records the platform already holds; nothing is estimated or simulated. Crowd levels are the one thing the platform cannot know, so they are reports from people on site: each zone carries `reportedBy`, `reportedAt` and `ageMinutes`, a zone nobody has reported on has `reported: false` (no level is claimed), and a report older than `staleAfterMinutes` (60) is marked `stale`. The page refreshes every 10 seconds.

## Student experience and UI (migration 010)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /public/stats | No sign-in. `{ events, participants, colleges, satisfaction }` for the landing page. `satisfaction` is the average whole-event feedback rating as a percentage, or `null` until someone has given feedback |
| GET | /me/dashboard | Students. `{ stats: { registered, upcoming, certificates, explored }, next, recommended }` |
| POST / DELETE | /events/:id/favorite | Students. Save / unsave an event (idempotent) |
| GET | /organizer/activity | The organizer's latest 8 registrations and check-ins across their events |

**Dashboard numbers.** `registered` and `upcoming` count registrations that hold a seat (upcoming = not yet ended); `certificates` counts non-revoked certificates; `explored` counts distinct event pages the student has opened. `recommended` is a transparent rule, not a prediction: open events with seats that the student has not joined, ranked by "made for your department" (+3), then "same type as events you opened or joined" (+2), then date. Each carries a `reason` string shown on the card.

**Event list filters** (`GET /events`): `q`, `type`, `date`, `mode` (`offline` | `online` | `hybrid`), `department` (events with no department are open to everyone and always match), `available=true` (hide full events), `favorites=true` (the caller's saved events). Event objects now include `mode`, `department`, `prizes` `[{ title, description }]`, `rules` `[string]`, `faqs` `[{ question, answer }]` and `favorite`.

**Creating events** accepts the new optional fields as multipart text; `prizes`, `rules` and `faqs` are JSON lists (at most 10 / 20 / 15 items, validated item by item).

**Profiles.** `PATCH /auth/me` also accepts `year` (1-4, or 5 for postgraduate; blank clears it) and `phone`. Leaving either out keeps the stored value.

**Participants list** (`GET /organizer/participants`) adds `year`, `attendanceStatus` and `teamName` to each row and accepts `sort` (`name`, `college`, `department`, `year`, `status`, `attendance`, `team`, `registered`) and `dir` (`asc` | `desc`). Sort keys are whitelisted on the server.

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
  "requiresApproval": true,
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
- `registeredCount` counts registrations that hold a seat; `availableSeats` is `maxParticipants - registeredCount`.
- Dates and times are plain local values with no timezone.
