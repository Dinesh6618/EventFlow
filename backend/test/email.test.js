import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { config, dayOffset, query, startServer } from './helpers.js';

const { EmailProviderError, deliver, sanitize, setEmailProvider } = await import('../src/services/email/provider.js');
const { NOT_CONFIGURED, emailIdle, sendEmail } = await import('../src/services/email/index.js');
const { TEMPLATE_NAMES, renderTemplate, esc } = await import('../src/services/email/templates.js');
const { flushScheduleChanges } = await import('../src/services/email/broadcasts.js');
const { runReminders } = await import('../src/services/reminders.js');

// Real email: verification, resend, change of address, event emails, preferences, logging and failure handling.
// The provider is replaced by a recorder, so nothing is sent; what is checked is exactly what would be.
let t;
let org;
let org2;
let admin;
let sam; // a verified student
let outbox;
let failing = false;
const consoleErrors = [];
const realConsoleError = console.error;

// Some emails leave in the background after the answer is sent; wait for them so each check sees the result.
const api = async (method, url, json, token) => {
  const res = await t.api(method, url, { token, json });
  await emailIdle();
  return res;
};
const required = (value) => { config.email.verificationOverride = value; };
const tokenIn = (message) => message.text.match(/token=([0-9a-f]{64})/)[1];
const to = (address) => outbox.filter((m) => m.to === address);
const lastFor = (address, subject) => [...outbox].reverse().find((m) => m.to === address && (!subject || m.subject.includes(subject)));
const provider = {
  send: async (message) => {
    if (failing) throw new EmailProviderError('Provider said no (key re_secretkey123456 rejected)', 500);
    outbox.push(message);
    return { id: `msg_${outbox.length}` };
  },
};
const clearOutbox = () => { outbox.length = 0; };
const settle = async () => emailIdle();

// A verified account with a session, created while verification is switched off.
async function verifiedUser(role, email, extra = {}) {
  required(false);
  const person = await t.signUp(role, email, extra);
  await query(`UPDATE users SET email_verified = TRUE, email_verified_at = NOW() WHERE id = $1`, [person.user.id]);
  required(true);
  return person;
}

before(async () => {
  t = await startServer();
  console.error = (...args) => { consoleErrors.push(args.join(' ')); };
  outbox = [];
  setEmailProvider(provider);
  org = await verifiedUser('organizer', 'org@x.com', { name: 'Olive Organizer' });
  org2 = await verifiedUser('organizer', 'org2@x.com');
  admin = await verifiedUser('participant', 'admin@x.com', { name: 'Admin User' });
  await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.user.id]);
  sam = await verifiedUser('participant', 'sam@x.com', { name: 'Sam Student' });
});
after(async () => {
  console.error = realConsoleError;
  setEmailProvider(null);
  required(null);
  await t.stop();
});

/* ============================================================ verification */

describe('registration and email verification', () => {
  let token;

  it('sends a verification email and never shows the link', async () => {
    clearOutbox();
    required(true);
    const res = await api('POST', '/api/auth/register', { name: 'Riya Sharma', email: 'riya@x.com', password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College' });
    assert.equal(res.status, 201);
    assert.equal(res.body.verificationRequired, true);
    assert.equal(res.body.emailSent, true);
    assert.equal(res.body.token, undefined, 'no session until the address is verified');
    assert.equal(res.body.user.emailVerified, false);
    const shown = JSON.stringify(res.body);
    assert.ok(!/verify-email|token=|https?:\/\//.test(shown), 'the response holds no link and no token');

    const mail = lastFor('riya@x.com');
    assert.equal(mail.subject, 'Verify your EventFlow account');
    assert.match(mail.html, /Hi Riya Sharma,/);
    assert.match(mail.text, /Welcome to EventFlow\. Please verify your email address to activate your account\./);
    assert.match(mail.html, /Verify Email/);
    assert.match(mail.text, /expires in 24 hours and can be used once/);
    assert.match(mail.text, /Security notice: If you did not create an EventFlow account, you can safely ignore this email\./);
    assert.match(mail.text, /never ask you for your password by email/);
    assert.match(mail.html, /Security notice/);
    assert.match(mail.html, /name="viewport"/, 'responsive');
    assert.match(mail.text, new RegExp(`${config.appUrl.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/verify-email\\?token=[0-9a-f]{64}`));
    assert.equal(mail.from, config.email.from);
    token = tokenIn(mail);
  });

  it('stores only a hash of the token, and logs the send without it', async () => {
    const rows = await query(`SELECT token_hash, expires_at, used_at FROM email_verification_tokens`);
    assert.ok(rows.length >= 1 && rows.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash) && !r.token_hash.includes(token)));
    const expires = new Date(rows.at(-1).expires_at) - Date.now();
    assert.ok(expires > 23.5 * 3600e3 && expires <= 24 * 3600e3, 'expires in 24 hours');
    const log = (await query(`SELECT * FROM email_logs WHERE recipient = 'riya@x.com'`))[0];
    assert.deepEqual([log.template, log.status, log.subject], ['verifyEmail', 'sent', 'Verify your EventFlow account']);
    assert.ok(log.provider_message_id && log.sent_at);
    assert.ok(!JSON.stringify(log).includes(token), 'the log never holds the token');
  });

  it('blocks login until verified, with a message that gives nothing away', async () => {
    const blocked = await api('POST', '/api/auth/login', { email: 'riya@x.com', password: 'Password123' });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(blocked.body.message, 'Please verify your email before logging in.');
    assert.equal(blocked.body.token, undefined);
    assert.equal((await api('POST', '/api/auth/login', { email: 'riya@x.com', password: 'wrong' })).status, 401, 'a wrong password is still just a wrong password');
    assert.equal((await api('POST', '/api/auth/login', { email: 'nobody@x.com', password: 'Password123' })).status, 401);
  });

  it('verifies the address with the emailed link, exactly once', async () => {
    const ok = await api('POST', '/api/auth/verify-email', { token });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.verified, true);
    assert.equal(ok.body.message, 'Email verified successfully. You can now log in.');
    const row = (await query(`SELECT email_verified, email_verified_at FROM users WHERE email = 'riya@x.com'`))[0];
    assert.ok(row.email_verified && row.email_verified_at);

    const login = await api('POST', '/api/auth/login', { email: 'riya@x.com', password: 'Password123' });
    assert.equal(login.status, 200, 'a verified account logs in');
    assert.equal(login.body.user.emailVerified, true);
    assert.equal((await api('GET', '/api/auth/me', undefined, login.body.token)).status, 200);

    const again = await api('POST', '/api/auth/verify-email', { token });
    assert.equal(again.status, 400);
    assert.equal(again.body.code, 'TOKEN_USED');
    assert.match(again.body.message, /already been used/);
  });

  it('rejects an invalid or expired link and offers a new one', async () => {
    required(true);
    await api('POST', '/api/auth/register', { name: 'Dev Anand', email: 'dev@x.com', password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College' });
    const mail = lastFor('dev@x.com');
    const expiredToken = tokenIn(mail);

    const bad = await api('POST', '/api/auth/verify-email', { token: 'f'.repeat(64) });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'TOKEN_INVALID');
    assert.equal(bad.body.message, 'This verification link is invalid.');
    assert.equal((await api('POST', '/api/auth/verify-email', { token: 'short' })).status, 422);
    assert.equal((await api('POST', '/api/auth/verify-email', {})).status, 422);

    await query(`UPDATE email_verification_tokens SET expires_at = NOW() - INTERVAL '1 minute'`);
    const expired = await api('POST', '/api/auth/verify-email', { token: expiredToken });
    assert.equal(expired.status, 400);
    assert.equal(expired.body.code, 'TOKEN_EXPIRED');
    assert.equal(expired.body.message, 'This verification link has expired.');
    assert.equal((await query(`SELECT email_verified FROM users WHERE email = 'dev@x.com'`))[0].email_verified, false, 'an expired link verifies nothing');

    // An expired link is enough to ask for a new one: no need to remember the address.
    clearOutbox();
    const resend = await api('POST', '/api/auth/resend-verification', { token: expiredToken });
    assert.equal(resend.status, 200);
    assert.equal(to('dev@x.com').length, 1);
    assert.equal((await api('POST', '/api/auth/verify-email', { token: tokenIn(lastFor('dev@x.com')) })).status, 200);
  });
});

describe('resending the verification email', () => {
  it('cancels the old link and sends a new one', async () => {
    required(true);
    clearOutbox();
    await api('POST', '/api/auth/register', { name: 'Eli Jose', email: 'eli@x.com', password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College' });
    const first = tokenIn(lastFor('eli@x.com'));
    const res = await api('POST', '/api/auth/resend-verification', { email: 'eli@x.com' });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Verification email sent. Please check your inbox.');
    assert.equal(to('eli@x.com').length, 2);
    const second = tokenIn(lastFor('eli@x.com'));
    assert.notEqual(first, second);

    const old = await api('POST', '/api/auth/verify-email', { token: first });
    assert.equal(old.status, 400, 'the old link no longer works');
    assert.equal(old.body.code, 'TOKEN_USED');
    assert.equal((await api('POST', '/api/auth/verify-email', { token: second })).status, 200);
  });

  it('answers the same for unknown and already-verified addresses, and sends them nothing', async () => {
    clearOutbox();
    const unknown = await api('POST', '/api/auth/resend-verification', { email: 'nobody@x.com' });
    const verified = await api('POST', '/api/auth/resend-verification', { email: 'sam@x.com' });
    assert.deepEqual([unknown.status, verified.status], [200, 200]);
    assert.deepEqual(unknown.body, verified.body);
    assert.equal(outbox.length, 0);
    assert.equal((await api('POST', '/api/auth/resend-verification', {})).status, 422);
    assert.equal((await api('POST', '/api/auth/resend-verification', { email: 'bad' })).status, 422);
  });

  it('allows three resends an hour per address, then answers 429 with when to try again', async () => {
    required(true);
    clearOutbox();
    const { resetRateLimits } = await import('../src/middleware/rateLimit.js');
    resetRateLimits();
    config.rateLimit.email.max = 3;
    try {
      await api('POST', '/api/auth/register', { name: 'Fay Noor', email: 'fay@x.com', password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College' });
      for (let i = 0; i < 3; i += 1) assert.equal((await api('POST', '/api/auth/resend-verification', { email: 'fay@x.com' })).status, 200);
      assert.equal(to('fay@x.com').length, 4, 'the registration email plus three resends');
      const blocked = await api('POST', '/api/auth/resend-verification', { email: 'fay@x.com' });
      assert.equal(blocked.status, 429);
      assert.ok(blocked.body.retryAfter > 60 && blocked.body.retryAfter <= 3600, 'told to come back within the hour');
      assert.equal(to('fay@x.com').length, 4, 'nothing more was sent');
    } finally {
      config.rateLimit.email.max = 100;
    }
  });

  it('keeps a stored count as a backstop that renews after an hour', async () => {
    required(true);
    clearOutbox();
    await api('POST', '/api/auth/register', { name: 'Gus Rao', email: 'gus@x.com', password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College' });
    const id = (await query(`SELECT id FROM users WHERE email = 'gus@x.com'`))[0].id;
    config.rateLimit.email.max = 3;
    try {
      for (let i = 0; i < config.email.resendLimit + 1; i += 1) await query(`INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 day')`, [id, i.toString(16).padStart(64, '0')]);
      clearOutbox();
      assert.equal((await api('POST', '/api/auth/resend-verification', { email: 'gus@x.com' })).status, 200);
      assert.equal(to('gus@x.com').length, 0, 'the stored count says enough, even after a restart wiped the in-memory counters');
      await query(`UPDATE email_verification_tokens SET created_at = NOW() - INTERVAL '2 hours'`);
      await api('POST', '/api/auth/resend-verification', { email: 'gus@x.com' });
      assert.equal(to('gus@x.com').length, 1, 'the allowance renews after an hour');
    } finally {
      config.rateLimit.email.max = 100;
    }
  });
});

describe('changing the email address before verifying', () => {
  it('moves the account to the new address and verifies that one instead', async () => {
    required(true);
    await api('POST', '/api/auth/register', { name: 'Gita Rao', email: 'gita.typo@x.com', password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College' });
    const oldToken = tokenIn(lastFor('gita.typo@x.com'));
    clearOutbox();

    assert.equal((await api('POST', '/api/auth/change-email', { email: 'gita.typo@x.com', password: 'wrong', newEmail: 'gita@x.com' })).status, 401);
    const res = await api('POST', '/api/auth/change-email', { email: 'gita.typo@x.com', password: 'Password123', newEmail: 'gita@x.com' });
    assert.equal(res.status, 200);
    assert.match(res.body.message, /If that address can be used/);
    assert.equal(to('gita@x.com').length, 1, 'the link goes to the new address');
    assert.equal(to('gita.typo@x.com').length, 0);
    assert.equal((await api('POST', '/api/auth/verify-email', { token: oldToken })).status, 400, 'the link for the old address is dead');
    assert.equal((await api('POST', '/api/auth/verify-email', { token: tokenIn(lastFor('gita@x.com')) })).status, 200);
    assert.equal((await api('POST', '/api/auth/login', { email: 'gita@x.com', password: 'Password123' })).status, 200);
  });

  it('does not reveal whether the new address is already taken', async () => {
    required(true);
    await api('POST', '/api/auth/register', { name: 'Hari M', email: 'hari@x.com', password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College' });
    clearOutbox();
    const taken = await api('POST', '/api/auth/change-email', { email: 'hari@x.com', password: 'Password123', newEmail: 'sam@x.com' });
    const free = await api('POST', '/api/auth/change-email', { email: 'hari@x.com', password: 'Password123', newEmail: 'hari.new@x.com' });
    assert.deepEqual([taken.status, free.status], [200, 200]);
    assert.deepEqual(taken.body, free.body);
    assert.equal(to('sam@x.com').length, 0, 'nothing is sent to the address that belongs to someone else');
    assert.equal((await query(`SELECT COUNT(*)::int AS n FROM users WHERE email = 'sam@x.com'`))[0].n, 1);
  });

  it('is only for accounts that have not verified yet', async () => {
    assert.equal((await api('POST', '/api/auth/change-email', { email: 'sam@x.com', password: 'Password123', newEmail: 'sam2@x.com' })).status, 409);
  });
});

describe('where verification is required', () => {
  it('stops an existing session of an unverified account, and lets verified ones through', async () => {
    required(false);
    const person = await t.signUp('participant', 'late@x.com');
    assert.ok(person.token, 'without the requirement, sign-up logs you straight in');
    assert.equal((await api('GET', '/api/auth/me', undefined, person.token)).status, 200);
    required(true);
    const blocked = await api('GET', '/api/events', undefined, person.token);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal((await api('GET', '/api/events', undefined, sam.token)).status, 200);
    required(false);
    assert.equal((await api('GET', '/api/events', undefined, person.token)).status, 200, 'switched off: no one is locked out');
    required(true);
  });

  it('defaults to required exactly when email is configured', async () => {
    required(null);
    const { verificationRequired } = await import('../src/services/email/index.js');
    assert.equal(verificationRequired(), true, 'a provider is configured, so verification is on');
    setEmailProvider(null);
    assert.equal(verificationRequired(), false, 'no provider: nobody is locked out');
    setEmailProvider(provider);
    required(true);
  });
});

/* ============================================================ failures */

describe('when email cannot be sent', () => {
  it('does not let a failing provider reveal which addresses have an account, and logs the real reason', async () => {
    failing = true;
    consoleErrors.length = 0;
    required(true);
    await api('POST', '/api/auth/register', { name: 'Vic Rao', email: 'vic@x.com', password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College' });
    const known = await api('POST', '/api/auth/resend-verification', { email: 'vic@x.com' });
    const unknown = await api('POST', '/api/auth/resend-verification', { email: 'nobody@x.com' });
    assert.deepEqual([known.status, unknown.status], [200, 200], 'the same answer for an address that exists and one that does not');
    assert.deepEqual(known.body, unknown.body);
    const shown = JSON.stringify(known.body);
    assert.ok(!/Provider|re_secret|key|resend|smtp/i.test(shown), 'no provider details reach the user');
    assert.ok(consoleErrors.some((l) => /could not be sent/.test(l)), 'the failure is logged on the server');
    assert.ok(!consoleErrors.some((l) => /re_secretkey123456/.test(l)), 'and the key is scrubbed from the log');
    assert.ok(!consoleErrors.some((l) => /token=|verify-email/.test(l)), 'no link in the log');
    const log = (await query(`SELECT status, error_message FROM email_logs WHERE recipient = 'vic@x.com' ORDER BY id DESC LIMIT 1`))[0];
    assert.equal(log.status, 'failed');
    assert.ok(log.error_message.includes('[key]') && !log.error_message.includes('re_secretkey123456'));
    assert.equal((await query(`SELECT COUNT(*)::int AS n FROM email_verification_tokens WHERE used_at IS NULL AND user_id = (SELECT id FROM users WHERE email = 'vic@x.com')`))[0].n, 0, 'the link nobody received is thrown away');

    failing = false;
    clearOutbox();
    assert.equal((await api('POST', '/api/auth/resend-verification', { email: 'vic@x.com' })).status, 200);
    assert.equal(to('vic@x.com').length, 1, 'asking again sends it, instead of being taken for a repeat of the failed one');
  });

  it('still creates the account when the verification email fails, and says the email did not go', async () => {
    failing = true;
    required(true);
    const res = await api('POST', '/api/auth/register', { name: 'Ila Roy', email: 'ila@x.com', password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College' });
    assert.equal(res.status, 201);
    assert.equal(res.body.emailSent, false);
    assert.equal(res.body.token, undefined);
    const resend = await api('POST', '/api/auth/resend-verification', { email: 'ila@x.com' });
    assert.equal(resend.status, 200, 'a resend answers the same for every address, so it cannot say it failed');
    assert.equal((await query(`SELECT status FROM email_logs WHERE recipient = 'ila@x.com' ORDER BY id DESC LIMIT 1`))[0].status, 'failed', 'but the failure is in the log');
    failing = false;
    clearOutbox();
    assert.equal((await api('POST', '/api/auth/resend-verification', { email: 'ila@x.com' })).status, 200);
    assert.equal(to('ila@x.com').length, 1, 'and it works once the provider is back');
  });

  it('does not let a failing provider break registering for an event', async () => {
    failing = true;
    const e = await t.createEvent(org.token, { name: 'Quiet Fest' });
    const res = await api('POST', `/api/events/${e.id}/registrations`, undefined, sam.token);
    await settle();
    assert.equal(res.status, 201);
    failing = false;
  });

  it('tells administrators, not users, when email is not set up', async () => {
    setEmailProvider(null);
    consoleErrors.length = 0;
    const asked = await api('POST', '/api/auth/resend-verification', { email: 'vic@x.com' });
    assert.equal(asked.status, 503);
    assert.equal(asked.body.message, "We couldn't send the email right now. Please try again.");
    assert.ok(!/EMAIL_PROVIDER_API_KEY|EMAIL_FROM|configured/i.test(JSON.stringify(asked.body)), 'a user is told nothing about the setup');
    assert.ok(consoleErrors.some((l) => l === NOT_CONFIGURED), 'the server log names the missing settings');
    const unknown = await api('POST', '/api/auth/resend-verification', { email: 'nobody@x.com' });
    assert.deepEqual([unknown.status, unknown.body], [503, asked.body], 'a missing setup is the same for every address');

    const status = (await api('GET', '/api/admin/email-status', undefined, admin.token)).body;
    assert.equal(status.configured, false);
    assert.ok(status.problems.some((p) => /EMAIL_PROVIDER_API_KEY/.test(p)));
    const test = (await api('POST', '/api/admin/email-test', {}, admin.token)).body;
    assert.deepEqual([test.ok, test.message], [false, NOT_CONFIGURED]);
    setEmailProvider(provider);
  });
});

/* ===================================================== event emails */

describe('event registration emails', () => {
  let event;
  let approval;

  before(async () => {
    event = await t.createEvent(org.token, { name: 'Tech Fest 2026', venue: 'Main Auditorium' });
    approval = await t.createEvent(org.token, { name: 'Invite Only', requiresApproval: 'true' });
  });

  it('confirms a registration with the event details and a link to the pass', async () => {
    clearOutbox();
    const res = await api('POST', `/api/events/${event.id}/registrations`, undefined, sam.token);
    await settle();
    assert.equal(res.status, 201);
    const mail = lastFor('sam@x.com');
    assert.equal(mail.subject, "You're registered for Tech Fest 2026");
    assert.match(mail.text, /Hi Sam Student,/);
    assert.match(mail.text, /Your registration for Tech Fest 2026 has been confirmed\./);
    for (const row of [/Event: Tech Fest 2026/, /Date: .*2026/, /Time: 9:00 AM - 5:00 PM/, /Venue: Main Auditorium/, new RegExp(`Participant ID: ${res.body.registration.participantCode}`)]) assert.match(mail.text, row);
    assert.match(mail.html, /View Event Pass/);
    assert.ok(mail.text.includes(`${config.appUrl}/my/registrations/${res.body.registration.id}/pass`));
    assert.match(mail.text, /Thanks,\nEventFlow Team/);
    const log = (await query(`SELECT status FROM email_logs WHERE template = 'registrationConfirmed' AND subject = $1`, ["You're registered for Tech Fest 2026"]))[0];
    assert.equal(log.status, 'sent');
  });

  it('says a registration is awaiting approval, then emails the organizer\'s decision', async () => {
    clearOutbox();
    const sent = await api('POST', `/api/events/${approval.id}/registrations`, undefined, sam.token);
    await settle();
    assert.match(lastFor('sam@x.com').subject, /We received your registration for Invite Only/);
    assert.match(lastFor('sam@x.com').text, /organizer will review it/);

    await api('PATCH', `/api/registrations/${sent.body.registration.id}/status`, { status: 'approved' }, org.token);
    await settle();
    const approved = lastFor('sam@x.com', 'approved');
    assert.match(approved.subject, /Your registration was approved: Invite Only/);
    assert.ok(approved.text.includes(`/my/registrations/${sent.body.registration.id}/pass`));

    const other = await verifiedUser('participant', 'tom@x.com', { name: 'Tom T' });
    const second = await api('POST', `/api/events/${approval.id}/registrations`, undefined, other.token);
    await api('PATCH', `/api/registrations/${second.body.registration.id}/status`, { status: 'rejected' }, org.token);
    await settle();
    const rejected = lastFor('tom@x.com', 'Update on your registration');
    assert.match(rejected.text, /not able to accept your registration for Invite Only/);
    assert.ok(rejected.text.includes(`${config.appUrl}/events`));
  });

  it('keeps working when nothing is configured (no emails, no errors, no log noise)', async () => {
    setEmailProvider(null);
    clearOutbox();
    const before = (await query(`SELECT COUNT(*)::int AS n FROM email_logs`))[0].n;
    const e = await t.createEvent(org.token, { name: 'No Email Fest' });
    const res = await api('POST', `/api/events/${e.id}/registrations`, undefined, sam.token);
    await settle();
    assert.equal(res.status, 201);
    assert.equal((await query(`SELECT COUNT(*)::int AS n FROM email_logs`))[0].n, before);
    setEmailProvider(provider);
  });
});

describe('reminders', () => {
  let event;
  let online;
  let reg;
  let onlineMail;

  before(async () => {
    event = await t.createEvent(org.token, { name: 'Tomorrow Fest', venue: 'Seminar Hall 1' });
    online = await t.createEvent(org.token, { name: 'Online Summit', mode: 'online', meetingUrl: 'https://meet.example.com/summit-123' });
    for (const e of [event, online]) await query(`UPDATE events SET date = $2::date, start_time = '09:00', end_time = '11:00' WHERE id = $1`, [e.id, dayOffset(1)]);
    reg = await api('POST', `/api/events/${event.id}/registrations`, undefined, sam.token);
    await api('POST', `/api/events/${online.id}/registrations`, undefined, sam.token);
    await settle();
  });

  it('emails a reminder the day before, with the QR pass, once', async () => {
    clearOutbox();
    const now = new Date(new Date(`${dayOffset(1)}T09:00:00`).getTime() - 23 * 3600e3);
    await runReminders(now);
    await settle();
    const mail = lastFor('sam@x.com', 'Event Reminder — Tomorrow Fest');
    assert.ok(mail, 'a reminder was sent');
    assert.match(mail.text, /Venue: Seminar Hall 1/);
    assert.match(mail.html, /cid:eventpass/);
    assert.equal(mail.attachments.length, 1);
    assert.deepEqual([mail.attachments[0].cid, mail.attachments[0].filename], ['eventpass', 'event-pass.png']);
    assert.deepEqual([...mail.attachments[0].content.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'a real PNG');
    assert.ok(mail.text.includes(`/my/registrations/${reg.body.registration.id}/pass`));
    assert.match(mail.html, /View Event Pass/);

    onlineMail = lastFor('sam@x.com', 'Event Reminder — Online Summit');

    clearOutbox();
    await runReminders(now);
    await settle();
    assert.equal(outbox.length, 0, 'sent only once');
  });

  it('includes the meeting link for online events, and not for in-person ones', async () => {
    assert.ok(onlineMail, 'the online event was reminded too');
    assert.match(onlineMail.text, /Join online: https:\/\/meet\.example\.com\/summit-123/);
    const all = await query(`SELECT subject FROM email_logs WHERE template = 'eventReminder'`);
    assert.equal(all.length, 2);
  });

  it('puts the meeting link in the online reminder', () => {
    const { text } = renderTemplate('eventReminder', { name: 'Sam', event: { name: 'Online Summit', date: dayOffset(1), endDate: dayOffset(1), startTime: '09:00', endTime: '11:00', venue: 'Online' }, passUrl: 'https://app/x', meetingUrl: 'https://meet.example.com/summit-123', qrCid: 'eventpass' });
    assert.match(text, /Join online: https:\/\/meet\.example\.com\/summit-123/);
    const inPerson = renderTemplate('eventReminder', { name: 'Sam', event: { name: 'Fest', date: dayOffset(1), endDate: dayOffset(1), startTime: '09:00', endTime: '11:00', venue: 'Hall' }, passUrl: 'https://app/x' });
    assert.ok(!inPerson.text.includes('Join online'));
  });

  it('only accepts a proper link for the meeting', async () => {
    const bad = await t.api('POST', '/api/events', { token: org.token, form: t.eventForm({ mode: 'online', meetingUrl: 'not a link' }) });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.meetingUrl);
    const created = await t.api('POST', '/api/events', { token: org.token, form: t.eventForm({ mode: 'online', meetingUrl: 'https://meet.example.com/ok' }) });
    assert.equal(created.body.event.meetingUrl, 'https://meet.example.com/ok');
  });
});

describe('email preferences', () => {
  it('lists five optional categories, all on by default', async () => {
    const res = await api('GET', '/api/auth/email-preferences', undefined, sam.token);
    assert.deepEqual(res.body.preferences, { reminders: true, announcements: true, team: true, certificates: true, platform: true });
    assert.deepEqual(res.body.categories, ['reminders', 'announcements', 'team', 'certificates', 'platform']);
    assert.equal((await t.api('GET', '/api/auth/email-preferences')).status, 401);
  });

  it('stops optional emails when switched off, and never stops security emails', async () => {
    const saved = await api('PUT', '/api/auth/email-preferences', { reminders: false, announcements: false }, sam.token);
    assert.deepEqual([saved.body.preferences.reminders, saved.body.preferences.announcements, saved.body.preferences.team], [false, false, true]);
    assert.equal((await api('PUT', '/api/auth/email-preferences', {}, sam.token)).status, 422);
    assert.equal((await api('PUT', '/api/auth/email-preferences', { reminders: 'no' }, sam.token)).status, 422);

    // Announcements are skipped for Sam...
    const e = await t.createEvent(org.token, { name: 'Prefs Fest' });
    await api('POST', `/api/events/${e.id}/registrations`, undefined, sam.token);
    const fan = await verifiedUser('participant', 'fan@x.com', { name: 'Fan F' });
    await api('POST', `/api/events/${e.id}/registrations`, undefined, fan.token);
    await settle();
    clearOutbox();
    await api('POST', `/api/events/${e.id}/announcements`, { title: 'Doors open early', message: 'See you at 8:30.' }, org.token);
    await settle();
    assert.equal(outbox.filter((m) => m.to === 'sam@x.com').length, 0, 'Sam opted out of announcements');
    assert.equal(outbox.filter((m) => m.to === 'fan@x.com').length, 1, 'Fan did not');

    // ...but the email that verifies an address still reaches someone who has switched every optional email off.
    required(false);
    const quiet = await t.signUp('participant', 'quiet@x.com');
    required(true);
    await query(`UPDATE users SET email_prefs = '{"reminders": false, "announcements": false, "team": false, "certificates": false, "platform": false}'::jsonb, email_verified = FALSE, email_verified_at = NULL WHERE id = $1`, [quiet.user.id]);
    clearOutbox();
    await api('POST', '/api/auth/resend-verification', { email: 'quiet@x.com' });
    assert.equal(outbox.filter((m) => m.to === 'quiet@x.com' && /Verify your/.test(m.subject)).length, 1);
    await api('PUT', '/api/auth/email-preferences', { reminders: true, announcements: true }, sam.token);
  });
});

describe('announcements, schedule changes, certificates and teams', () => {
  let event;
  let fan;

  before(async () => {
    event = await t.createEvent(org.token, { name: 'Busy Fest' });
    fan = await verifiedUser('participant', 'fan2@x.com', { name: 'Fan <b>Two</b>' });
    for (const p of [sam, fan]) await api('POST', `/api/events/${event.id}/registrations`, undefined, p.token);
    await settle();
  });

  it('emails announcements, with anything people typed safely escaped', async () => {
    clearOutbox();
    await api('POST', `/api/events/${event.id}/announcements`, { title: 'Important update', message: 'Bring your <script>alert(1)</script> ID card.' }, org.token);
    await settle();
    const mail = lastFor('fan2@x.com');
    assert.equal(mail.subject, 'Busy Fest: Important update');
    assert.ok(!mail.html.includes('<script>') && mail.html.includes('&lt;script&gt;'));
    assert.ok(!mail.html.includes('Fan <b>Two</b>') && mail.html.includes('Fan &lt;b&gt;Two&lt;/b&gt;'));
    assert.match(mail.html, /Email preferences/, 'optional emails link to the preferences');
    assert.equal((await api('POST', `/api/events/${event.id}/announcements`, { title: 'Spam', message: 'x' }, org2.token)).status, 403);
  });

  it('sends several schedule changes as one email', async () => {
    config.email.scheduleDigestMs = 60_000;
    clearOutbox();
    const session = (title, start, end) => ({ title, date: event.date, startTime: start, endTime: end, venue: 'Hall', speaker: '', sessionType: 'talk', description: '' });
    await api('POST', `/api/events/${event.id}/schedule`, session('Opening', '09:00', '09:30'), org.token);
    await api('POST', `/api/events/${event.id}/schedule`, session('Keynote', '09:30', '10:30'), org.token);
    await settle();
    assert.equal(outbox.length, 0, 'held back so edits can be batched');
    await flushScheduleChanges(event.id);
    await settle();
    const mails = outbox.filter((m) => m.to === 'fan2@x.com');
    assert.equal(mails.length, 1);
    assert.equal(mails[0].subject, 'Schedule updated: Busy Fest');
    assert.match(mails[0].text, /"Opening" was added/);
    assert.match(mails[0].text, /"Keynote" was added/);
    config.email.scheduleDigestMs = 0;
  });

  it('emails a certificate only once it can be opened', async () => {
    clearOutbox();
    await api('POST', `/api/events/${event.id}/certificates`, { type: 'speaker', recipients: [{ name: 'Sam Student', email: 'sam@x.com' }] }, org.token);
    await settle();
    assert.equal(outbox.length, 0, 'the event has not started, so holders cannot see it yet');
    await query(`UPDATE events SET date = CURRENT_DATE - 2, end_date = NULL, registration_deadline = NOW() - INTERVAL '5 days' WHERE id = $1`, [event.id]);
    await api('POST', `/api/events/${event.id}/certificates`, { type: 'speaker', recipients: [{ name: 'Fan Two', email: 'fan2@x.com' }] }, org.token);
    await settle();
    const mail = lastFor('fan2@x.com');
    assert.equal(mail.subject, 'Your certificate is ready: Busy Fest');
    assert.ok(mail.text.includes(`${config.appUrl}/my/certificates`));
  });

  it('emails a team invitation to the person invited', async () => {
    const teamEvent = await t.createEvent(org.token, { name: 'Team Hack', teamEnabled: 'true', minTeamSize: '2', maxTeamSize: '3' });
    const lead = await verifiedUser('participant', 'lead@x.com', { name: 'Lena Lead' });
    const friend = await verifiedUser('participant', 'friend@x.com', { name: 'Finn Friend' });
    for (const p of [lead, friend]) await api('POST', `/api/events/${teamEvent.id}/registrations`, undefined, p.token);
    const team = (await api('POST', `/api/events/${teamEvent.id}/teams`, { name: 'Team Rocket', skills: [] }, lead.token)).body.team;
    await settle();
    clearOutbox();
    const res = await api('POST', `/api/teams/${team.id}/invitations`, { userId: friend.user.id }, lead.token);
    await settle();
    assert.equal(res.status, 201);
    const mail = lastFor('friend@x.com');
    assert.equal(mail.subject, 'You were invited to join Team Rocket');
    assert.match(mail.text, /Lena Lead invited you to join the team "Team Rocket" for Team Hack/);

    await api('PUT', '/api/auth/email-preferences', { team: false }, friend.token);
    const other = await verifiedUser('participant', 'other@x.com', { name: 'Oli Other' });
    await api('POST', `/api/events/${teamEvent.id}/registrations`, undefined, other.token);
    await api('PUT', '/api/auth/email-preferences', { team: false }, other.token);
    clearOutbox();
    await api('POST', `/api/teams/${team.id}/invitations`, { userId: other.user.id }, lead.token);
    await settle();
    assert.equal(outbox.length, 0, 'switched off');
  });
});

/* ============================================================== templates */

describe('email templates', () => {
  const event = { name: 'Tech Fest 2026', date: '2026-11-14', endDate: '2026-11-14', startTime: '09:00', endTime: '17:00', venue: 'Main Auditorium' };
  const samples = {
    verifyEmail: { name: 'Sam', url: 'https://app.example/verify-email?token=abc' },
    registrationConfirmed: { name: 'Sam', event, participantCode: 'EF-2026-000001', passUrl: 'https://app.example/pass' },
    registrationApproved: { name: 'Sam', event, passUrl: 'https://app.example/pass' },
    registrationRejected: { name: 'Sam', event, eventsUrl: 'https://app.example/events', reason: 'The event is full' },
    venueBookingApproved: { name: 'Olive', event },
    venueBookingRejected: { name: 'Olive', event, reason: 'The hall is booked that day' },
    scheduleChanged: { name: 'Sam', eventName: 'Tech Fest 2026', changes: ['"Keynote" was changed'], eventUrl: 'https://app.example/e' },
    eventReminder: { name: 'Sam', event, passUrl: 'https://app.example/pass', qrCid: 'eventpass' },
    certificateAvailable: { name: 'Sam', eventName: 'Tech Fest 2026', typeLabel: 'participant', certificatesUrl: 'https://app.example/c' },
    teamInvitation: { name: 'Sam', teamName: 'Team Rocket', eventName: 'Tech Fest 2026', inviterName: 'Lena', url: 'https://app.example/e' },
    eventAnnouncement: { name: 'Sam', eventName: 'Tech Fest 2026', title: 'Doors open', message: 'See you at 8:30.', eventUrl: 'https://app.example/e' },
    testEmail: { name: 'Admin' },
  };

  it('has every required template, each rendered in the same design', () => {
    for (const name of ['verifyEmail', 'registrationConfirmed', 'registrationApproved', 'registrationRejected', 'venueBookingApproved', 'venueBookingRejected', 'scheduleChanged', 'eventReminder', 'certificateAvailable', 'teamInvitation', 'eventAnnouncement']) {
      assert.ok(TEMPLATE_NAMES.includes(name), `${name} exists`);
    }
    for (const name of TEMPLATE_NAMES) {
      const mail = renderTemplate(name, samples[name]);
      assert.ok(mail.subject && mail.html && mail.text, name);
      assert.match(mail.html, />EventFlow</, `${name}: logo`);
      assert.match(mail.html, /<h1/, `${name}: heading`);
      assert.match(mail.text, /Thanks,\nEventFlow Team/, `${name}: sign-off`);
      assert.ok(!/undefined|NaN|\[object/.test(mail.html + mail.text), `${name}: no stray placeholders`);
    }
    assert.throws(() => renderTemplate('nope', {}), /Unknown email template/);
  });

  it('writes the venue booking emails as specified', () => {
    const ok = renderTemplate('venueBookingApproved', samples.venueBookingApproved);
    assert.equal(ok.subject, 'Venue Booking Approved — Tech Fest 2026');
    for (const line of [/Event: Tech Fest 2026/, /Venue: Main Auditorium/, /Date: .*14 November 2026/, /Time: 9:00 AM - 5:00 PM/, /Booking status: Approved/]) assert.match(ok.text, line);
    const no = renderTemplate('venueBookingRejected', samples.venueBookingRejected);
    assert.equal(no.subject, 'Venue Booking Request Update');
    for (const line of [/Requested venue: Main Auditorium/, /Reason: The hall is booked that day/]) assert.match(no.text, line);
  });

  it('sends a venue email to an organizer, ready for the day venue requests exist', async () => {
    clearOutbox();
    const result = await sendEmail({ to: 'org@x.com', template: 'venueBookingApproved', data: samples.venueBookingApproved, userId: org.user.id });
    assert.equal(result.ok, true);
    assert.equal(outbox[0].to, 'org@x.com');
    assert.equal(outbox[0].subject, 'Venue Booking Approved — Tech Fest 2026');
  });

  it('escapes anything that came from a person', () => {
    assert.equal(esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    const mail = renderTemplate('eventAnnouncement', { ...samples.eventAnnouncement, title: '<img src=x onerror=alert(1)>' });
    assert.ok(!mail.html.includes('<img src=x'));
  });
});

/* ====================================================== logging and admin */

describe('the email log and the admin view', () => {
  it('records every attempt as sent or failed, with nothing sensitive in it', async () => {
    const rows = await query(`SELECT * FROM email_logs`);
    assert.ok(rows.length > 10);
    assert.ok(rows.every((r) => ['queued', 'sent', 'failed'].includes(r.status)));
    assert.ok(rows.some((r) => r.status === 'sent' && r.provider_message_id) && rows.some((r) => r.status === 'failed' && r.error_message));
    const text = JSON.stringify(rows);
    assert.ok(!/token=|verify-email|re_secret|Bearer|Password123/.test(text), 'no tokens, links, keys or passwords');
    assert.ok(!consoleErrors.some((l) => /token=[0-9a-f]{64}/.test(l)), 'and none in the server log either');
  });

  it('shows administrators the status and the log, and nobody else', async () => {
    const status = (await api('GET', '/api/admin/email-status', undefined, admin.token)).body;
    assert.deepEqual([status.configured, status.provider, status.from], [true, 'resend', config.email.from]);
    assert.equal(status.appUrl, config.appUrl);
    assert.ok(status.stats.sent > 0 && status.templates.length === TEMPLATE_NAMES.length);
    assert.ok(!JSON.stringify(status).includes(config.email.apiKey || 'no-key-configured-in-tests'));
    assert.ok(status.recentFailures.last24h > 0, 'failed sends are summarised so a broken setup gets noticed');
    assert.ok(status.recentFailures.latest.errorMessage && !JSON.stringify(status.recentFailures).includes('re_secretkey123456'));
    assert.ok(!status.problems.some((p) => /test sender/.test(p)), 'a normal sender address raises no sandbox warning');
    const realFrom = config.email.from;
    config.email.from = 'EventFlow <onboarding@resend.dev>';
    try {
      const hint = (await api('GET', '/api/admin/email-status', undefined, admin.token)).body;
      assert.ok(hint.configured && hint.problems.some((p) => /test sender.*only deliver to the email address of your own Resend account/.test(p)), 'the Resend sandbox limit is explained');
    } finally {
      config.email.from = realFrom;
    }
    const failed = (await api('GET', '/api/admin/email-logs?status=failed', undefined, admin.token)).body.logs;
    assert.ok(failed.length > 0 && failed.every((l) => l.status === 'failed'));
    assert.equal((await api('GET', '/api/admin/email-logs?status=bogus', undefined, admin.token)).status, 422);
    for (const url of ['/api/admin/email-status', '/api/admin/email-logs']) {
      for (const person of [sam, org]) assert.equal((await api('GET', url, undefined, person.token)).status, 403, url);
      assert.equal((await t.api('GET', url)).status, 401);
    }
    assert.equal((await api('POST', '/api/admin/email-test', {}, sam.token)).status, 403);
  });

  it('sends the administrator a test email', async () => {
    clearOutbox();
    const res = (await api('POST', '/api/admin/email-test', {}, admin.token)).body;
    assert.equal(res.ok, true);
    assert.equal(outbox[0].to, 'admin@x.com');
    failing = true;
    const bad = (await api('POST', '/api/admin/email-test', {}, admin.token)).body;
    assert.equal(bad.ok, false);
    assert.ok(!bad.message.includes('re_secretkey123456'), 'even administrators never see a key');
    failing = false;
  });
});

/* =============================================================== provider */

describe('the Resend provider', () => {
  it('posts to Resend with the key in a header, never in the body', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    const previous = { key: config.email.apiKey, from: config.email.from };
    config.email.apiKey = 're_test_abcdefgh12345678';
    config.email.from = 'EventFlow <no-reply@example.com>';
    setEmailProvider(null);
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'resend-id-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
      const result = await deliver({ to: 'sam@x.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', attachments: [{ filename: 'event-pass.png', content: Buffer.from('png'), cid: 'eventpass' }] });
      assert.equal(result.id, 'resend-id-1');
      assert.equal(calls[0].url, 'https://api.resend.com/emails');
      assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test_abcdefgh12345678');
      const body = JSON.parse(calls[0].init.body);
      assert.deepEqual([body.from, body.to, body.subject], ['EventFlow <no-reply@example.com>', ['sam@x.com'], 'Hi']);
      assert.deepEqual(body.attachments, [{ filename: 'event-pass.png', content: Buffer.from('png').toString('base64'), content_id: 'eventpass' }]);
      assert.ok(!calls[0].init.body.includes('re_test_abcdefgh12345678'), 'the key is not in the payload');

      globalThis.fetch = async () => new Response(JSON.stringify({ message: 'The from address is not verified (key re_test_abcdefgh12345678)' }), { status: 403, headers: { 'content-type': 'application/json' } });
      await assert.rejects(() => deliver({ to: 'a@x.com', subject: 's', html: 'h', text: 't' }), (err) => err instanceof EmailProviderError && err.status === 403 && !err.message.includes('re_test_abcdefgh12345678'));

      globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
      await assert.rejects(() => deliver({ to: 'a@x.com', subject: 's', html: 'h', text: 't' }), /Could not reach the email provider/);
    } finally {
      globalThis.fetch = realFetch;
      config.email.apiKey = previous.key;
      config.email.from = previous.from;
      setEmailProvider(provider);
    }
  });

  it('scrubs keys, links and long messages from errors', () => {
    const safe = sanitize('Bad key re_abcdefghij123456 at https://api.resend.com/emails?token=1 Bearer sk_live_123 ' + 'x'.repeat(400));
    assert.ok(!safe.includes('re_abcdefghij123456') && !safe.includes('https://') && !safe.includes('sk_live_123'));
    assert.ok(safe.length <= 300);
  });
});

describe('abuse limits', () => {
  it('limits requests per IP address', async () => {
    const { resetRateLimits } = await import('../src/middleware/rateLimit.js');
    resetRateLimits();
    config.rateLimit.email.ipMax = 5;
    try {
      let status;
      for (let i = 0; i < 10; i += 1) {
        status = (await api('POST', '/api/auth/resend-verification', { email: `nobody${i}@x.com` })).status;
        if (status === 429) break;
      }
      assert.equal(status, 429);
    } finally {
      config.rateLimit.email.ipMax = 1000;
    }
  });
});
