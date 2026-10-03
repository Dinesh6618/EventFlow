import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { config, query, startServer } from './helpers.js';

const { EmailProviderError, setEmailProvider } = await import('../src/services/email/provider.js');
const { MAX_KEYS, limiterKeyCount, rateLimit, resetRateLimits } = await import('../src/middleware/rateLimit.js');
const { emailIdle } = await import('../src/services/email/index.js');
const { createApp } = await import('../src/app.js');

// The rate limiting rules. helpers.js gives the whole suite roomy limits (all test accounts share one IP
// address); here the real documented values are put back, so what is checked is what ships.
let t;
let outbox;
let mode = 'ok'; // ok | down
const rl = config.rateLimit;
const roomy = structuredClone(rl);
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The defaults documented in .env.example and the README. */
const real = () => {
  Object.assign(rl, {
    windowMs: 900000,
    max: 100,
    userMax: 1500,
    auth: { windowMs: 900000, max: 10, ipMax: 50 },
    signup: { windowMs: 3600000, max: 5 },
    email: { windowMs: 3600000, max: 3, ipMax: 20, cooldownSeconds: 60 },
    link: { windowMs: 900000, max: 200 },
  });
};

const post = async (url, json, token) => {
  const res = await t.api('POST', url, { json, token });
  await emailIdle(); // some emails leave in the background after the answer
  return res;
};
const get = (url, token) => t.api('GET', url, { token });
const person = (n, extra = {}) => ({ name: 'Test Person', email: `p${n}@x.com`, password: 'Password123', role: 'participant', department: 'CSE', college: 'ABC College', ...extra });
const register = (n, extra) => post('/api/auth/register', person(n, extra));
const login = (email, password = 'Password123') => post('/api/auth/login', { email, password });
const resend = (email) => post('/api/auth/resend-verification', { email });
const sentTo = (address) => outbox.filter((m) => m.to === address).length;
const required = (value) => { config.email.verificationOverride = value; };

before(async () => {
  t = await startServer();
  outbox = [];
  setEmailProvider({
    send: async (message) => {
      if (mode === 'down') throw new EmailProviderError('down', 500);
      outbox.push(message);
      return { id: `m${outbox.length}` };
    },
  });
  required(false);
  await t.signUp('participant', 'sam@x.com', { name: 'Sam Student' });
  await t.signUp('organizer', 'org@x.com', { name: 'Olive Organizer' });
});
after(() => {
  setEmailProvider(null);
  required(null);
  return t.stop();
});
/** Back to roomy limits with nothing counted. A describe-level before() hook must call this itself. */
const reset = () => {
  resetRateLimits();
  Object.assign(rl, structuredClone(roomy));
};
beforeEach(() => {
  reset();
  mode = 'ok';
  required(false);
  setEmailProvider({
    send: async (message) => {
      if (mode === 'down') throw new EmailProviderError('down', 500);
      outbox.push(message);
      return { id: `m${outbox.length}` };
    },
  });
});

describe('what a blocked request looks like', () => {
  it('is a 429 with a clean body and a Retry-After header', async () => {
    real();
    rl.signup.max = 2;
    assert.equal((await register(1)).status, 201);
    assert.equal((await register(2)).status, 201);
    const blocked = await register(3);
    assert.equal(blocked.status, 429);
    assert.deepEqual(Object.keys(blocked.body).sort(), ['message', 'retryAfter', 'success']);
    assert.equal(blocked.body.success, false);
    assert.equal(blocked.body.message, 'Too many requests. Please try again later.');
    assert.ok(Number.isInteger(blocked.body.retryAfter) && blocked.body.retryAfter > 0 && blocked.body.retryAfter <= 3600);
    assert.equal(blocked.headers.get('retry-after'), String(blocked.body.retryAfter), 'the header says how long is really left');
  });

  it('counts down: asking later gives a shorter wait, and the block ends by itself', async () => {
    real();
    rl.signup = { windowMs: 1500, max: 1 };
    assert.equal((await register(10)).status, 201);
    const first = await register(11);
    assert.equal(first.status, 429);
    assert.equal(first.body.retryAfter, 2, 'rounded up to whole seconds');
    await new Promise((resolve) => setTimeout(resolve, 1600));
    assert.equal((await register(11)).status, 201, 'nobody is blocked for good');
  });
});

describe('login', () => {
  before(async () => {
    reset();
    required(false);
    for (const n of [20, 21, 22]) assert.equal((await register(n)).status, 201);
  });

  it('only failed attempts count: any number of correct logins is fine', async () => {
    real();
    rl.auth.max = 3;
    for (let i = 0; i < 15; i += 1) assert.equal((await login('p20@x.com')).status, 200);
  });

  it('blocks a guessing run after the configured number of failures, only for that address', async () => {
    real();
    rl.auth.max = 3;
    for (let i = 0; i < 3; i += 1) assert.equal((await login('p21@x.com', 'wrong-guess-1')).status, 401);
    const blocked = await login('p21@x.com', 'wrong-guess-2');
    assert.equal(blocked.status, 429);
    assert.ok(blocked.body.retryAfter > 0 && blocked.body.retryAfter <= 900, 'for at most one window, not for good');
    assert.equal((await login('p22@x.com')).status, 200, 'other accounts on the same network are unaffected');
  });

  it('a correct login between failures is not held against the person', async () => {
    real();
    rl.auth.max = 3;
    assert.equal((await login('p20@x.com', 'bad-1')).status, 401);
    assert.equal((await login('p20@x.com', 'bad-2')).status, 401);
    assert.equal((await login('p20@x.com')).status, 200);
    assert.equal((await login('p20@x.com', 'bad-3')).status, 401);
    assert.equal((await login('p20@x.com', 'bad-4')).status, 429);
  });

  it('cannot be got round by guessing in parallel', async () => {
    real();
    rl.auth.max = 3;
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => login('p21@x.com', `parallel-${i}`)));
    assert.equal(results.filter((r) => r.status === 401).length, 3);
    assert.equal(results.filter((r) => r.status === 429).length, 9);
  });

  it('also limits one address trying many accounts', async () => {
    real();
    rl.auth.ipMax = 4;
    for (let i = 0; i < 4; i += 1) assert.equal((await login(`nobody${i}@x.com`, 'guess')).status, 401);
    assert.equal((await login('nobody9@x.com', 'guess')).status, 429);
  });

  it('does not count a correct password on an account that still has to verify its email', async () => {
    real();
    rl.auth.max = 3;
    required(true);
    await query(`UPDATE users SET email_verified = FALSE WHERE email = 'p22@x.com'`);
    for (let i = 0; i < 8; i += 1) {
      const res = await login('p22@x.com');
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
    }
    await query(`UPDATE users SET email_verified = TRUE WHERE email = 'p22@x.com'`);
  });
});

describe('sign-up', () => {
  it('allows five attempts an hour per IP address', async () => {
    real();
    for (let i = 0; i < 5; i += 1) assert.equal((await register(100 + i)).status, 201);
    assert.equal((await register(105)).status, 429);
  });

  it('does not hold validation mistakes against anyone', async () => {
    real();
    for (let i = 0; i < 8; i += 1) assert.equal((await register(200, { password: 'short' })).status, 422);
    for (let i = 0; i < 5; i += 1) assert.equal((await register(210 + i)).status, 201);
  });
});

describe('verification emails', () => {
  beforeEach(() => required(true));

  it('sends one email at sign-up, one per resend, and a double click sends only one', async () => {
    real();
    assert.equal((await register(300)).status, 201);
    assert.equal(sentTo('p300@x.com'), 1, 'sign-up sends exactly one email');

    const twice = await Promise.all([resend('p300@x.com'), resend('p300@x.com')]);
    assert.deepEqual(twice.map((r) => r.status).sort(), [200, 429]);
    assert.equal(sentTo('p300@x.com'), 2, 'only one of the two clicks produced an email');
  });

  it('enforces a cooldown between emails, then three an hour, and says how long to wait', async () => {
    real();
    await register(310);
    const first = await resend('p310@x.com');
    assert.equal(first.status, 200);
    const tooSoon = await resend('p310@x.com');
    assert.equal(tooSoon.status, 429);
    assert.ok(tooSoon.body.retryAfter >= 1 && tooSoon.body.retryAfter <= 60, 'the cooldown is up to a minute');

    rl.email.cooldownSeconds = 0;
    assert.equal((await resend('p310@x.com')).status, 200);
    assert.equal((await resend('p310@x.com')).status, 200);
    const hourly = await resend('p310@x.com');
    assert.equal(hourly.status, 429);
    assert.ok(hourly.body.retryAfter > 60, 'the hourly limit asks for longer than the cooldown');
    assert.equal(sentTo('p310@x.com'), 4, 'sign-up plus three resends, never more');
  });

  it('treats an address with no account exactly the same, so nothing is revealed', async () => {
    real();
    assert.equal((await resend('ghost@x.com')).status, 200);
    assert.equal((await resend('ghost@x.com')).status, 429);
    assert.equal(sentTo('ghost@x.com'), 0);
  });

  it('works from the emailed token alone, with its own allowance', async () => {
    real();
    const link = await post('/api/auth/resend-verification', { token: 'a'.repeat(64) });
    const again = await post('/api/auth/resend-verification', { token: 'a'.repeat(64) });
    assert.equal(link.status, 200);
    assert.equal(again.status, 429);
    assert.equal((await post('/api/auth/resend-verification', { token: 'b'.repeat(64) })).status, 200, 'a different link is a different allowance');
  });

  it('nothing in the response or the log is a verification link', async () => {
    real();
    const res = await register(320);
    const body = JSON.stringify(res.body);
    assert.ok(!/token|verify-email|https?:\/\//i.test(body), 'no token or link in the sign-up response');
  });
});

describe('the other email limits', () => {
  it('limits resend requests per IP address as well, whoever they are for', async () => {
    real();
    rl.email.cooldownSeconds = 0;
    rl.email.ipMax = 5;
    for (let i = 0; i < 5; i += 1) assert.equal((await resend(`unknown${i}@x.com`)).status, 200);
    assert.equal((await resend('unknown9@x.com')).status, 429);
  });

  it('does not use up the allowance while email is not set up, so a developer is never locked out', async () => {
    real();
    setEmailProvider({ configured: false, send: async () => { throw new Error('unused'); } });
    for (let i = 0; i < 12; i += 1) {
      const res = await resend('sam@x.com');
      assert.equal(res.status, 503, 'the friendly "could not send" message, never a 429');
      assert.equal(res.body.code, 'EMAIL_UNAVAILABLE');
    }
    setEmailProvider({ send: async (m) => { outbox.push(m); return { id: 'ok' }; } });
    assert.equal((await resend('sam@x.com')).status, 200, 'works the moment email is set up');
  });

  it('opening verification links has a roomy limit of its own', async () => {
    real();
    for (let i = 0; i < 40; i += 1) assert.equal((await post('/api/auth/verify-email', { token: 'c'.repeat(64) })).status, 400);
    rl.link.max = 3;
    resetRateLimits();
    for (let i = 0; i < 3; i += 1) assert.equal((await post('/api/auth/verify-email', { token: 'd'.repeat(64) })).status, 400);
    assert.equal((await post('/api/auth/verify-email', { token: 'd'.repeat(64) })).status, 429);
  });
});

describe('normal use of EventFlow is never blocked', () => {
  let student;
  let organizer;
  let event;
  before(async () => {
    reset();
    student = (await login('sam@x.com')).body;
    organizer = (await login('org@x.com')).body;
    event = await t.createEvent(organizer.token, { name: 'Normal Day' });
  });

  it('lets a student browse, open events and refresh their session hundreds of times', async () => {
    real();
    const statuses = [];
    for (let i = 0; i < 100; i += 1) {
      statuses.push((await get('/api/events', student.token)).status);
      statuses.push((await get(`/api/events/${event.id}`, student.token)).status);
      statuses.push((await get('/api/auth/me', student.token)).status);
    }
    assert.ok(statuses.every((s) => s === 200), `unexpected statuses: ${[...new Set(statuses)]}`);
  });

  it('counts each signed-in person separately, even on one network', async () => {
    real();
    rl.userMax = 5;
    for (let i = 0; i < 5; i += 1) assert.equal((await get('/api/auth/me', student.token)).status, 200);
    assert.equal((await get('/api/auth/me', student.token)).status, 429);
    assert.equal((await get('/api/auth/me', organizer.token)).status, 200, 'the organizer is unaffected by the student');
  });

  it('counts visitors who are not signed in per IP address, and a made-up token does not get round that', async () => {
    real();
    rl.max = 5;
    for (let i = 0; i < 5; i += 1) assert.equal((await get('/api/events')).status, 401);
    assert.equal((await get('/api/events')).status, 429);
    assert.equal((await get('/api/events', 'not.a.real.token')).status, 429, 'junk tokens are still anonymous');
    assert.equal((await get('/api/events', student.token)).status, 200, 'but a signed-in student is fine');
  });

  it('leaves /health and the public login and sign-up pages out of the general limit', async () => {
    real();
    rl.max = 3;
    for (let i = 0; i < 20; i += 1) assert.equal((await get('/api/health')).status, 200);
    for (let i = 0; i < 8; i += 1) assert.equal((await login('sam@x.com')).status, 200);
  });
});

describe('the server log', () => {
  const lines = [];
  const realWarn = console.warn;
  before(() => { console.warn = (...args) => lines.push(args.join(' ')); });
  after(() => { console.warn = realWarn; });
  beforeEach(() => { lines.length = 0; rl.log = true; });

  it('records endpoint, method, time, IP and category, once per blocked key, and no secrets', async () => {
    real();
    rl.link.max = 1;
    const secret = 'f'.repeat(64);
    await post('/api/auth/verify-email', { token: secret });
    for (let i = 0; i < 4; i += 1) assert.equal((await post('/api/auth/verify-email', { token: secret })).status, 429);
    const logged = lines.filter((l) => l.includes('[rate-limit]'));
    assert.equal(logged.length, 1, 'one line however many requests were blocked');
    const entry = JSON.parse(logged[0].slice(logged[0].indexOf('{')));
    assert.equal(entry.category, 'email-link');
    assert.equal(entry.method, 'POST');
    assert.equal(entry.endpoint, '/api/auth/verify-email');
    assert.ok(entry.ip && entry.at && entry.retryAfter > 0);
    assert.ok(!logged[0].includes(secret), 'the verification token is never logged');
  });

  it('never writes a long token-like part of a web address to the log', async () => {
    real();
    rl.max = 1;
    const secret = 'f'.repeat(64);
    await get(`/api/verify/${secret}?token=${secret}`);
    assert.equal((await get(`/api/verify/${secret}?token=${secret}`)).status, 429);
    const logged = lines.filter((l) => l.includes('[rate-limit]'));
    const entry = JSON.parse(logged[0].slice(logged[0].indexOf('{')));
    assert.equal(entry.endpoint, '/api/verify/:redacted');
    assert.ok(!logged[0].includes(secret), 'neither the path nor the query string leaks');
  });

  it('includes the user ID when the person is signed in, never their token', async () => {
    real();
    rl.userMax = 1;
    const sam = (await login('sam@x.com')).body;
    await get('/api/auth/me', sam.token);
    lines.length = 0;
    assert.equal((await get('/api/auth/me', sam.token)).status, 429);
    const entry = JSON.parse(lines[0].slice(lines[0].indexOf('{')));
    assert.equal(entry.category, 'general');
    assert.equal(entry.userId, sam.user.id);
    assert.ok(!lines[0].includes(sam.token));
  });

  it('never logs a password', async () => {
    real();
    rl.auth.max = 1;
    await login('p20@x.com', 'My-Secret-Pass-9');
    assert.equal((await login('p20@x.com', 'My-Secret-Pass-9')).status, 429);
    assert.ok(lines.some((l) => l.includes('"category":"login"')));
    assert.ok(!lines.join('\n').includes('My-Secret-Pass-9'));
  });

  it('can be switched off', async () => {
    real();
    rl.log = false;
    rl.link.max = 1;
    await post('/api/auth/verify-email', { token: 'e'.repeat(64) });
    await post('/api/auth/verify-email', { token: 'e'.repeat(64) });
    assert.equal(lines.length, 0);
  });
});

describe('localhost in development, and production', () => {
  it('relaxes the limits for localhost in development only', async () => {
    real();
    rl.signup.max = 2;
    rl.devMultiplier = 10;
    for (let i = 0; i < 20; i += 1) assert.equal((await register(400 + i)).status, 201);
    assert.equal((await register(420)).status, 429);

    resetRateLimits();
    const env = config.env;
    config.env = 'production';
    try {
      assert.equal((await register(430)).status, 201);
      assert.equal((await register(431)).status, 201);
      assert.equal((await register(432)).status, 429, 'in production localhost gets no special treatment');
    } finally {
      config.env = env;
    }
  });
});

describe('behind a reverse proxy', () => {
  async function withServer(trustProxy, run) {
    const before = config.trustProxy;
    config.trustProxy = trustProxy;
    const server = createApp().listen(0);
    config.trustProxy = before;
    const base = `http://localhost:${server.address().port}`;
    const signUpFrom = (forwardedFor, n) => fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
      body: JSON.stringify(person(n)),
    }).then((r) => r.status);
    try {
      await run(signUpFrom);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  it('with TRUST_PROXY set, each visitor has their own allowance instead of sharing the proxy\'s', async () => {
    real();
    rl.signup.max = 1;
    rl.devMultiplier = 1;
    await withServer(1, async (signUpFrom) => {
      assert.equal(await signUpFrom('203.0.113.7', 500), 201);
      assert.equal(await signUpFrom('203.0.113.7', 501), 429);
      assert.equal(await signUpFrom('203.0.113.8', 502), 201, 'a different visitor');
    });
  });

  it('without it the header is ignored, so it cannot be forged to dodge a limit', async () => {
    real();
    rl.signup.max = 1;
    rl.devMultiplier = 1;
    await withServer(false, async (signUpFrom) => {
      assert.equal(await signUpFrom('203.0.113.7', 510), 201);
      assert.equal(await signUpFrom('198.51.100.99', 511), 429);
    });
  });
});

describe('memory and configuration', () => {
  it('keeps a bounded number of counters however many different clients appear', () => {
    resetRateLimits();
    const middleware = rateLimit({ name: 'memory-check', windowMs: 3_600_000, max: 1, key: (req) => req.ip });
    const res = { set() {}, status() { return this; }, json() {}, on() {} };
    for (let i = 0; i < MAX_KEYS + 5000; i += 1) middleware({ ip: `client-${i}`, headers: {}, method: 'GET', path: '/x', baseUrl: '' }, res, () => {});
    assert.ok(limiterKeyCount() <= MAX_KEYS + 50, `kept ${limiterKeyCount()} counters`);
    resetRateLimits();
  });

  it('has the documented defaults when nothing is set in the environment', () => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/RATE_LIMIT|^EMAIL_|^TRUST_PROXY|^DOTENV/.test(key)));
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', "import { config } from './src/config.js'; console.log(JSON.stringify([config.rateLimit, config.trustProxy]))"], {
      cwd: backendDir,
      env: { ...clean, DOTENV_CONFIG_PATH: path.join(backendDir, 'no-such.env') },
    }).toString();
    const [limits, trust] = JSON.parse(out);
    assert.deepEqual(limits, {
      windowMs: 900000,
      max: 100,
      userMax: 1500,
      auth: { windowMs: 900000, max: 10, ipMax: 50 },
      signup: { windowMs: 3600000, max: 5 },
      email: { windowMs: 3600000, max: 3, ipMax: 20, cooldownSeconds: 60 },
      link: { windowMs: 900000, max: 200 },
      devMultiplier: 10,
      log: true,
    });
    assert.equal(trust, false);
  });

  it('lists every setting in .env.example', () => {
    const example = fs.readFileSync(path.join(backendDir, '.env.example'), 'utf8');
    for (const name of ['RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX', 'USER_RATE_LIMIT_MAX', 'AUTH_RATE_LIMIT_WINDOW_MS', 'AUTH_RATE_LIMIT_MAX', 'AUTH_RATE_LIMIT_IP_MAX', 'SIGNUP_RATE_LIMIT_MAX', 'EMAIL_RATE_LIMIT_WINDOW_MS', 'EMAIL_RATE_LIMIT_MAX', 'EMAIL_RATE_LIMIT_IP_MAX', 'EMAIL_RESEND_COOLDOWN_SECONDS', 'RATE_LIMIT_DEV_MULTIPLIER', 'TRUST_PROXY']) {
      assert.ok(example.includes(name), `${name} is missing from .env.example`);
    }
  });
});
