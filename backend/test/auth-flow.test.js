import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { config, query, startServer } from './helpers.js';

const { setEmailProvider } = await import('../src/services/email/provider.js');
const { emailIdle, verificationRequired } = await import('../src/services/email/index.js');
const { resetRateLimits } = await import('../src/middleware/rateLimit.js');

// The account email journey, end to end through the real HTTP API with a recording mailbox instead of a
// real provider: registration -> verification email -> verify -> login. The one registered address is the
// only address ever used for verification and login. Password reset does not exist (see the last tests).
let t;
let outbox;
let delayMs = 0;
const rl = config.rateLimit;
const roomy = structuredClone(rl);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mailbox = {
  send: async (message) => {
    if (delayMs) await wait(delayMs);
    outbox.push(message);
    return { id: `msg_${outbox.length}` };
  },
};

// Some emails leave in the background after the answer is sent; wait for them so each check sees them.
const call = async (method, url, json, token) => {
  const res = await t.api(method, url, { token, json });
  await emailIdle();
  return res;
};
const person = (email, extra = {}) => ({ name: 'Ana Rao', email, password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College', ...extra });
const register = (email, extra) => call('POST', '/api/auth/register', person(email, extra));
const login = (email, password = 'Password123') => call('POST', '/api/auth/login', { email, password });
const resend = (body) => call('POST', '/api/auth/resend-verification', body);
const verify = (token) => call('POST', '/api/auth/verify-email', { token });
const mailTo = (address) => outbox.filter((m) => m.to === address);
const latest = (address, subjectPart) => [...outbox].reverse().find((m) => m.to === address && (!subjectPart || m.subject.includes(subjectPart)));
const tokenIn = (mail) => mail.text.match(/token=([0-9a-f]{64})/)[1];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const expire = (table, token) => query(`UPDATE ${table} SET expires_at = NOW() - INTERVAL '1 minute' WHERE token_hash = $1`, [sha256(token)]);
const userRow = async (email) => (await query(`SELECT id, password, email_verified, email_verified_at FROM users WHERE email = $1`, [email]))[0];

before(async () => {
  t = await startServer();
  outbox = [];
  setEmailProvider(mailbox);
  config.email.verificationOverride = null; // the real rule: required whenever email is set up
});
after(() => {
  setEmailProvider(null);
  return t.stop();
});
beforeEach(() => {
  resetRateLimits();
  Object.assign(rl, structuredClone(roomy));
  delayMs = 0;
  setEmailProvider(mailbox);
  config.email.verificationOverride = null;
});

describe('registration -> verification email -> verify -> login', () => {
  const email = 'ana@x.com';
  let token;

  it('creates the account unverified and emails the link to the registered address only', async () => {
    const res = await register(email);
    assert.equal(res.status, 201);
    assert.equal(res.body.user.emailVerified, false);
    assert.equal(res.body.user.emailVerifiedAt, null);
    assert.equal(res.body.verificationRequired, true);
    assert.equal(res.body.emailSent, true);
    assert.equal(res.body.token, undefined, 'no session until the address is verified');
    assert.ok(!/token=|verify-email|https?:\/\//.test(JSON.stringify(res.body)), 'no link or token in the response');

    const row = await userRow(email);
    assert.deepEqual([row.email_verified, row.email_verified_at], [false, null]);
    assert.equal(outbox.length, 1);
    const mail = outbox[0];
    assert.equal(mail.to, email, 'the registered address, and nobody else');
    assert.equal(mail.subject, 'Verify your EventFlow account');
    assert.match(mail.text, new RegExp(`${config.appUrl.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/verify-email\\?token=[0-9a-f]{64}`), 'link format /verify-email?token=');
    assert.match(mail.text, /Hi Ana Rao,/);
    assert.match(mail.text, /Welcome to EventFlow\. Please verify your email address to activate your account\./);
    assert.match(mail.html, />Verify Email</, 'the button');
    assert.match(mail.html, /EventFlow/, 'branding');
    assert.match(mail.html, /name="viewport"/);
    assert.match(mail.text, /expires in 24 hours/);
    assert.match(mail.text, /Security notice:/);
    token = tokenIn(mail);
  });

  it('blocks login until the address is verified, and says how to fix it', async () => {
    const blocked = await login(email);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.message, 'Please verify your email before logging in.');
    assert.equal(blocked.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(blocked.body.token, undefined);
    assert.equal((await login(email, 'WrongPassword1')).status, 401, 'a wrong password is just a wrong password');
  });

  it('verifies with the emailed link: flag, time and single-use token', async () => {
    const res = await verify(token);
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Email verified successfully. You can now log in.');
    const row = await userRow(email);
    assert.equal(row.email_verified, true);
    assert.ok(row.email_verified_at, 'emailVerifiedAt is set');
    const stored = (await query(`SELECT token_hash, used_at FROM email_verification_tokens WHERE user_id = $1`, [row.id]));
    assert.ok(stored.length >= 1 && stored.every((r) => r.used_at), 'the token is invalidated');
    assert.ok(stored.every((r) => r.token_hash !== token && /^[0-9a-f]{64}$/.test(r.token_hash)), 'only a hash is stored, never the token');
  });

  it('then lets the person log in with the same email and password', async () => {
    const res = await login(email);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.emailVerified, true);
    assert.ok(res.body.user.emailVerifiedAt);
    assert.equal((await call('GET', '/api/auth/me', undefined, res.body.token)).status, 200);
  });
});

describe('expired, used and invalid verification links', () => {
  it('an expired link verifies nothing and a new one can be asked for with it', async () => {
    await register('exp@x.com');
    const old = tokenIn(latest('exp@x.com'));
    await expire('email_verification_tokens', old);
    const res = await verify(old);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'TOKEN_EXPIRED');
    assert.equal(res.body.message, 'This verification link has expired.');
    assert.equal((await userRow('exp@x.com')).email_verified, false);

    outbox.length = 0;
    assert.equal((await resend({ token: old })).status, 200);
    assert.equal(mailTo('exp@x.com').length, 1, 'the new link goes to the registered address');
    assert.equal((await verify(tokenIn(mailTo('exp@x.com')[0]))).status, 200);
    assert.equal((await login('exp@x.com')).status, 200);
  });

  it('a used link cannot be used again', async () => {
    await register('used@x.com');
    const link = tokenIn(latest('used@x.com'));
    assert.equal((await verify(link)).status, 200);
    const again = await verify(link);
    assert.equal(again.status, 400);
    assert.equal(again.body.code, 'TOKEN_USED');
    assert.equal(again.body.message, 'This verification link has already been used.');
  });

  it('an invalid or altered link is refused', async () => {
    await register('bad@x.com');
    const link = tokenIn(latest('bad@x.com'));
    const altered = `${link.slice(0, -1)}${link.endsWith('0') ? '1' : '0'}`;
    for (const bad of ['f'.repeat(64), altered]) {
      const res = await verify(bad);
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'TOKEN_INVALID');
      assert.equal(res.body.message, 'This verification link is invalid.');
    }
    assert.equal((await verify('short')).status, 422);
    assert.equal((await userRow('bad@x.com')).email_verified, false);
    assert.equal((await verify(link)).status, 200, 'the real link still works afterwards');
  });
});

describe('wrong email', () => {
  before(async () => {
    config.email.verificationOverride = false;
    await register('real1@x.com', { name: 'Real One' });
    config.email.verificationOverride = null;
    await query(`UPDATE users SET email_verified = TRUE, email_verified_at = NOW() WHERE email = 'real1@x.com'`);
    await register('real2@x.com', { name: 'Real Two' });
  });

  it('answers a resend request identically for an address with no account, and sends nothing', async () => {
    outbox.length = 0;
    const unknown = await resend({ email: 'nobody@x.com' });
    const verified = await resend({ email: 'real1@x.com' });
    assert.deepEqual([unknown.status, unknown.body], [verified.status, verified.body]);
    assert.equal(outbox.length, 0);
  });

  it('says exactly the same for an unknown email and a wrong password', async () => {
    const unknown = await login('nobody@x.com');
    const wrong = await login('real1@x.com', 'WrongPassword1');
    assert.deepEqual([unknown.status, unknown.body], [401, { message: 'Invalid email or password.' }]);
    assert.deepEqual([wrong.status, wrong.body], [401, { message: 'Invalid email or password.' }]);
  });

  it('typing someone else\'s address can only send that person their own link', async () => {
    outbox.length = 0;
    // Real One asks for a new link with Real Two's address.
    assert.equal((await resend({ email: 'real2@x.com' })).status, 200);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, 'real2@x.com', 'the link goes to the registered address of that account');
    assert.equal(mailTo('real1@x.com').length, 0, 'not to the person asking');
    assert.equal((await userRow('real2@x.com')).email_verified, false, 'and nothing about the account changed');
  });
});

describe('duplicate registration', () => {
  it('refuses a second account for the same address, in any capitals, without emailing or changing anything', async () => {
    await register('dup@x.com', { name: 'First Owner' });
    const before = await userRow('dup@x.com');
    outbox.length = 0;
    for (const variant of ['dup@x.com', 'DUP@x.com', ' Dup@X.com ']) {
      const res = await register(variant, { name: 'Second Person', password: 'Different123' });
      assert.equal(res.status, 409);
      assert.equal(res.body.errors.email, 'An account with this email already exists');
    }
    assert.equal(outbox.length, 0, 'no email is sent to the owner of the address');
    const after = await userRow('dup@x.com');
    assert.equal(after.password, before.password, 'the original password is untouched');
    assert.equal((await query(`SELECT COUNT(*)::int AS n FROM users WHERE email = 'dup@x.com'`))[0].n, 1);
  });
});

describe('repeated clicks', () => {
  it('several rapid resend clicks produce one email, then a 60 second wait', async () => {
    rl.email.cooldownSeconds = 60;
    await register('click@x.com');
    outbox.length = 0;
    const burst = await Promise.all([1, 2, 3, 4, 5].map(() => resend({ email: 'click@x.com' })));
    assert.deepEqual(burst.map((r) => r.status).sort(), [200, 429, 429, 429, 429]);
    assert.equal(mailTo('click@x.com').length, 1, 'one email however many clicks');
    const refused = burst.find((r) => r.status === 429);
    assert.ok(refused.body.retryAfter > 0 && refused.body.retryAfter <= 60);
    assert.equal(refused.headers.get('retry-after'), String(refused.body.retryAfter));
  });

  it('allows three resend requests an hour per address, then refuses', async () => {
    rl.email.cooldownSeconds = 0;
    rl.email.max = 3;
    await register('hourly@x.com');
    outbox.length = 0;
    for (let i = 0; i < 3; i += 1) assert.equal((await resend({ email: 'hourly@x.com' })).status, 200);
    const fourth = await resend({ email: 'hourly@x.com' });
    assert.equal(fourth.status, 429);
    assert.ok(fourth.body.retryAfter > 60, 'told to wait up to an hour');
    assert.equal(mailTo('hourly@x.com').length, 3);
    assert.equal((await resend({ email: 'click@x.com' })).status, 200, 'another address has its own allowance');
  });

  it('the limits do not touch normal use of the API', async () => {
    rl.email.cooldownSeconds = 60;
    rl.email.max = 1;
    const res = await login('ana@x.com');
    assert.equal(res.status, 200);
    for (let i = 0; i < 50; i += 1) assert.equal((await call('GET', '/api/auth/me', undefined, res.body.token)).status, 200);
  });
});

describe('an unverified person', () => {
  it('cannot log in, and a session that predates the rule is stopped too', async () => {
    config.email.verificationOverride = false;
    const early = await register('early@x.com');
    assert.ok(early.body.token, 'no verification yet: signed in straight away');
    config.email.verificationOverride = null;

    const blocked = await login('early@x.com');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'EMAIL_NOT_VERIFIED');
    const old = await call('GET', '/api/auth/me', undefined, early.body.token);
    assert.equal(old.status, 403);
    assert.equal(old.body.message, 'Please verify your email before logging in.');

    outbox.length = 0;
    assert.equal((await resend({ email: 'early@x.com' })).status, 200);
    assert.equal((await verify(tokenIn(latest('early@x.com')))).status, 200);
    assert.equal((await login('early@x.com')).status, 200, 'and after verifying it works');
  });
});

describe('the three ways a login can end', () => {
  it('wrong credentials: "Invalid email or password."', async () => {
    await register('three@x.com');
    for (const attempt of [login('three@x.com', 'WrongPassword1'), login('nobody@x.com')]) {
      const res = await attempt;
      assert.equal(res.status, 401);
      assert.equal(res.body.message, 'Invalid email or password.');
    }
  });

  it('right credentials, email not verified: "Please verify your email before logging in." and a way to resend', async () => {
    const res = await login('three@x.com');
    assert.equal(res.status, 403);
    assert.equal(res.body.message, 'Please verify your email before logging in.');
    assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(res.body.token, undefined);
    outbox.length = 0;
    assert.equal((await resend({ email: 'three@x.com' })).status, 200);
    assert.equal(mailTo('three@x.com').length, 1, 'the link is emailed to the registered address');
  });

  it('right credentials, email verified: logged in', async () => {
    await verify(tokenIn(latest('three@x.com')));
    const res = await login('three@x.com');
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.password, undefined, 'a password hash is never sent');
  });
});

describe('when verification is enforced', () => {
  it('is on whenever email is set up, and always in production', () => {
    assert.equal(verificationRequired(), true, 'email is set up');
    setEmailProvider({ configured: false, send: async () => { throw new Error('unused'); } });
    assert.equal(verificationRequired(), false, 'a development machine with no email cannot send links, so nobody is locked out');
    const env = config.env;
    config.env = 'production';
    try {
      assert.equal(verificationRequired(), true, 'production never trusts an unverified address');
      config.email.verificationOverride = false;
      assert.equal(verificationRequired(), false, 'unless EMAIL_VERIFICATION_REQUIRED=false says so');
    } finally {
      config.env = env;
    }
  });

  it('in production without email, new accounts exist but cannot log in, and are told email is the problem', async () => {
    setEmailProvider({ configured: false, send: async () => { throw new Error('unused'); } });
    const env = config.env;
    config.env = 'production';
    const realError = console.error;
    console.error = () => {};
    try {
      const res = await register('prod@x.com');
      assert.equal(res.status, 201);
      assert.deepEqual([res.body.verificationRequired, res.body.emailSent, res.body.token], [true, false, undefined]);
      assert.equal((await login('prod@x.com')).status, 403);
      const again = await resend({ email: 'prod@x.com' });
      assert.equal(again.status, 503);
      assert.equal(again.body.message, "We couldn't send the email right now. Please try again.");
    } finally {
      console.error = realError;
      config.env = env;
    }
  });
});

describe('enumeration', () => {
  it('answers a resend request without waiting for the email provider, for every address', async () => {
    await register('slow@x.com');
    delayMs = 600; // a slow provider
    const timings = {};
    for (const [label, address] of [['known', 'slow@x.com'], ['unknown', 'ghost@x.com']]) {
      const started = Date.now();
      const res = await t.api('POST', '/api/auth/resend-verification', { json: { email: address } });
      timings[label] = Date.now() - started;
      assert.equal(res.status, 200);
    }
    await emailIdle();
    assert.ok(timings.known < 400, `an account that exists is not visibly slower (${timings.known}ms)`);
    assert.ok(timings.unknown < 400, `${timings.unknown}ms`);
    assert.equal(mailTo('slow@x.com').length >= 2, true, 'and the emails still went out');
  });
});

describe('password reset has been removed', () => {
  const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  it('has no endpoints any more', async () => {
    for (const [method, url, json] of [
      ['POST', '/api/auth/forgot-password', { email: 'ana@x.com' }],
      ['POST', '/api/auth/reset-password', { token: 'a'.repeat(64), password: 'NewPassword123' }],
      ['GET', `/api/auth/reset-password/${'a'.repeat(64)}`],
    ]) {
      assert.equal((await call(method, url, json)).status, 404, `${method} ${url}`);
    }
    assert.equal((await call('GET', '/api/auth/verify-email')).status, 404, 'a GET on the real endpoints is still just not found');
  });

  it('sends no reset email and keeps no reset data', async () => {
    assert.ok(!(await query(`SELECT 1 FROM information_schema.tables WHERE table_name IN ('password_reset_tokens', 'password_resets')`)).length, 'the token table is dropped');
    assert.ok(!(await query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_changed_at'`)).length, 'and so is the column that signed out old sessions');
    const { TEMPLATE_NAMES, renderTemplate } = await import('../src/services/email/templates.js');
    assert.ok(!TEMPLATE_NAMES.includes('passwordReset'));
    assert.throws(() => renderTemplate('passwordReset', {}), /Unknown email template/);
  });

  it('leaves email verification fully in place', async () => {
    assert.equal((await query(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'email_verification_tokens'`))[0].n, 1);
    const { TEMPLATE_NAMES } = await import('../src/services/email/templates.js');
    assert.ok(TEMPLATE_NAMES.includes('verifyEmail'));
    for (const [method, url] of [['POST', '/api/auth/verify-email'], ['POST', '/api/auth/resend-verification'], ['POST', '/api/auth/change-email'], ['POST', '/api/auth/login'], ['POST', '/api/auth/register']]) {
      assert.notEqual((await call(method, url, {})).status, 404, `${method} ${url} exists`);
    }
  });

  it('is gone from the application code, so it cannot creep back unnoticed', () => {
    const roots = [path.join(backendDir, 'src'), path.join(backendDir, '..', 'frontend', 'src')];
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx|css|html)$/.test(entry.name)) files.push(full);
      }
    };
    roots.forEach(walk);
    assert.ok(files.length > 100, 'the whole source tree was scanned');
    const pattern = /forgot[-_ ]?password|reset[-_ ]?password|password[-_ ]?reset|PasswordReset|passwordChangedAt|password_changed_at|checkResetToken/i;
    const found = files.filter((file) => pattern.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(path.join(backendDir, '..'), file));
    assert.deepEqual(found, [], 'no password reset code or wording is left');
  });
});
