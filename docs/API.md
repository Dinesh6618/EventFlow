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

Session body: `title` (required), `date` (must be an event day), `startTime`, `endTime` (after start), `sessionType` (`session`, `workshop`, `talk`, `break`, `competition`, `evaluation_round`), and optional `description`, `venue`, `speaker`. Each item also returns `status`: `upcoming`, `ongoing` or `past`. `next` ignores breaks.

**Session attendance.** `POST /events/:id/attendance/scan` accepts an optional `sessionId` (check-in only). It records entry to that session on today's date and also checks the person in to the event if they were not yet. A second scan for the same session returns 409.

**Notifications** are created for: registration confirmed / pending, approved / rejected, a new registration that needs the organizer's approval, schedule changes (to everyone with a seat), announcements (to registrants, volunteers and judges), event reminders and session-starting notices. A notification is `{ id, type, title, message, link, eventId, read, readAt, createdAt }`; list responses also return `unreadCount`.

**Reminders** run in the server process every minute (`src/services/reminders.js`): a reminder 24 h before an event starts, another 1 h before, and a notice 15 min before each non-break session (only to approved/confirmed registrants). A `dedupe_key` per user guarantees each is sent once, even across restarts.

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
| POST | /events/:id/certificates/:certId/revoke | organizer | `{ reason? }` |
| GET | /certificates/mine | participant | Own, non-revoked certificates |
| GET | /certificates/:code/pdf | the holder, or the event's organizer | The certificate as a PDF |
| GET | /verify/:code | **public** (rate limited) | Authenticity check |
| GET | /events/:id/feedback/mine | participant | What can be rated now, and the caller's own answers |
| PUT | /events/:id/feedback | participant with a seat | Create or update: `{ sessionId?, overall, organization?, speaker?, venue?, comments?, suggestions? }` |
| GET | /events/:id/feedback/summary | organizer | Averages, distribution, session-wise ratings, anonymous comments |

**Certificate types:** `participant`, `winner`, `runner_up`, `finalist`, `volunteer`, `organizer`, `speaker`, `judge`. Certificates can be issued once the event has started.

- `participant` goes to people who checked in (`scope: "attended"`, default) or everyone approved/confirmed (`"registered"`).
- `winner` is the members of the rank-1 team(s), `runner_up` rank 2, `finalist` ranks 3 to `finalistUpToRank` (default 5), all taken from the leaderboard.
- `volunteer` and `judge` come from the event's Team tab; `organizer` is the event organizer.
- `speaker`, or anyone else, is issued by name. An email links it to that account; with no email it is name-only (for example an external speaker).
- Each person gets at most one certificate per type per event; issuing again only adds people who are missing, and returns 409 when there is nobody new.
- Certificate IDs look like `EVF-2026-001245` (year + a global sequence). The PDF (landscape A4) shows the holder, event, dates, venue, type, ID, issue date, organizer name and contact, and a QR code to `<PUBLIC_APP_URL>/verify/<id>`.

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

## AI Event Planner (Phase 9)

Requires `ANTHROPIC_API_KEY` in `backend/.env`. The key is read only on the server, sent only to the Anthropic API, and never returned by any endpoint or written to a log. Without it the planner returns `503` and says the administrator needs to set the key; the rest of EventFlow is unaffected. Optional settings: `AI_MODEL` (default `claude-opus-5-5`), `AI_EFFORT` (`low` to `max`, default `medium`), `AI_MAX_TOKENS`, `AI_TIMEOUT_MS`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /organizer/ai/status | `{ configured, model }` |
| GET | /organizer/ai/plans | The organizer's plans (latest 50) |
| POST | /organizer/ai/plans | **Step 1.** Generate a draft: `{ idea, eventType?, expectedParticipants?, durationHours?, startTime?, sessionCount?, breakMinutes?, breakEveryHours? }` |
| GET | /organizer/ai/plans/:id | The plan with `warnings` and `publishDefaults` |
| PUT | /organizer/ai/plans/:id | **Step 3.** Save edits: `{ plan }` (the whole plan) |
| POST | /organizer/ai/plans/:id/schedule | Suggest a new schedule (**a proposal only; nothing is saved**) |
| POST | /organizer/ai/plans/:id/confirm | **Step 4.** Confirm the saved plan |
| POST | /organizer/ai/plans/:id/publish | **Step 5.** Create the event from a confirmed plan |
| DELETE | /organizer/ai/plans/:id | Discard a plan that was not published |
| GET | /organizer/ai/events/:eventId/plan | The plan an event was published from, or `null` |

**Workflow, enforced by the server.** AI generated, then review, edit, confirm, publish. A plan is created as `draft`. Only a `confirmed` plan can be published (otherwise 409). Saving an edit to a confirmed plan sets it back to `draft`, so the organizer must confirm what will actually be published. Publishing creates the event with its schedule sessions, judging criteria and team rules, then the plan becomes `published`: a read-only record linked to the event. The AI never creates or changes an event, and a schedule suggestion is returned for review and only saved if the organizer saves it.

**What the plan contains.** `title`, `summary`, `eventType`, `structure` (duration, days, participants, format, phases), `schedule` (day, start/end time, title, description, session type, venue and speaker hints), `registration` (approval, capacity, requirements, deadline in days), `team` (on/off, min and max size), `volunteers` (total and roles), `judging` (criteria with points, judges needed), `resources`, `communicationPlan` and `riskChecklist`. Volunteers, resources, communication and risks are kept as checklists on the event's *AI plan* tab; schedule, judging criteria, capacity, approval and team rules become real event settings.

**Checks on everything.** The model is asked for JSON that matches a schema (structured outputs), and the result is validated again on our side: formats, ranges, end after start, sessions within the plan's days, team sizes, unique criterion names. If the model's answer fails validation it is sent back once with the list of problems; if it still fails, nothing is saved (502). The organizer's own edits are held to the same rules (422 with `errors` keyed by path, for example `schedule.2.endTime`). Overlapping sessions and criteria that do not add up to 100 are warnings, not errors. The event details given at publish time go through the normal event validation.

**Safety and cost.** The organizer's description is passed inside tags and the system prompt tells the model to treat it as data, not instructions. Refusals (422), truncated plans, unreadable output, rate limits (429) and provider failures (502/504) are turned into plain messages that never contain provider details. Each organizer can start 20 generations per hour (schedule suggestions count); requests that fail validation are checked first and do not use the allowance. Token usage of each plan is stored. The original model output is kept unchanged next to the edited copy.

## Recommendations and the control center (Phase 10)

All of these are for the owning organizer, except the crowd-zone endpoints, which the event's volunteers can also use. Paths are under `/api`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /events/:id/recommendations | Re-checks the rules against the event's current data, then returns `{ recommendations, ai: { configured, model } }` |
| PATCH | /events/:id/recommendations/:rid | `{ status: "new" \| "dismissed" \| "done" }`. 409 if the recommendation no longer applies |
| POST | /events/:id/recommendations/ai | Ask Claude for extra ideas. Returns `{ added, recommendations }`. 503 if no API key, 502 on provider/validation failure, 429 over the hourly allowance (shared with the AI planner) |
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
