import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { signToken } from '../middleware/auth.js';
import * as emailPrefs from '../models/emailModel.js';
import * as verification from '../models/emailVerificationModel.js';
import * as users from '../models/userModel.js';
import { FRIENDLY_FAILURE, NOT_CONFIGURED, UNVERIFIED_MESSAGE, appLink, emailConfigured, queueEmail, sendEmail, verificationRequired } from '../services/email/index.js';
import { HttpError, conflict, unauthorized } from '../utils/httpError.js';

/* ---------------------------------------------------------------- helpers */

/** The same words for an unknown email and a wrong password, so accounts cannot be probed. */
const INVALID_CREDENTIALS = 'Invalid email or password.';

/** The message people see when an email could not go out. Nothing about why. */
const emailUnavailable = () => new HttpError(503, FRIENDLY_FAILURE, undefined, 'EMAIL_UNAVAILABLE');

/** Create a fresh verification token (cancelling the old one) and email it. Returns the send result. */
async function sendVerification(user) {
  const token = await verification.create(user.id);
  const sent = await sendEmail({ to: user.email, template: 'verifyEmail', data: { name: user.name, url: appLink(`/verify-email?token=${token}`) }, userId: user.id });
  // Nothing reached the inbox, so the link is useless: forget it rather than count it as a verification email.
  if (!sent.ok) await verification.revoke(token);
  return sent;
}

/**
 * Like sendVerification, but the email goes out in the background and the caller never learns how it went.
 * For the public "resend" request, whose answer must be the same for every address: waiting for the
 * provider would make addresses that have an account visibly slower, and a failure would give them away.
 * A failure is still logged (the admin Email page shows it) and the unusable link is thrown away.
 */
async function queueVerification(user) {
  const token = await verification.create(user.id);
  const queued = await queueEmail({ to: user.email, template: 'verifyEmail', data: { name: user.name, url: appLink(`/verify-email?token=${token}`) }, userId: user.id, onFailure: () => verification.revoke(token) });
  if (!queued.queued) await verification.revoke(token);
}

/* ------------------------------------------------------- register and login */

export async function register(req, res) {
  const { name, email, password, role, department, college, year, phone } = req.body;

  if (await users.findByEmail(email)) {
    throw conflict('Email is already registered', { email: 'An account with this email already exists' });
  }

  const user = await users.createUser({ name, email, role, department, college, year, phone, passwordHash: await bcrypt.hash(password, 10) });

  // The link goes to the inbox and nowhere else: it is never in this response.
  const required = verificationRequired();
  const emailSent = required || emailConfigured() ? (await sendVerification(user)).ok : false;

  // Someone who must verify first is not signed in yet; they get a session once they log in verified.
  res.status(201).json({ user, verificationRequired: required, emailSent, ...(required ? {} : { token: signToken(user) }) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const found = await users.findByEmail(email);

  // Same message for unknown email and wrong password so accounts cannot be probed.
  if (!found || !(await bcrypt.compare(password, found.password))) {
    throw unauthorized(INVALID_CREDENTIALS);
  }
  // A right password is not an attack, whatever happens next: it does not use up the failed-login allowance.
  res.locals.passwordWasRight = true;
  // Only someone who proved the password hears this, so it reveals nothing to a stranger.
  if (verificationRequired() && !found.emailVerified) {
    throw new HttpError(403, UNVERIFIED_MESSAGE, undefined, 'EMAIL_NOT_VERIFIED');
  }

  const { password: _hash, ...user } = found;
  res.json({ user, token: signToken(user) });
}

export function me(req, res) {
  res.json({ user: req.user });
}

export async function updateProfile(req, res) {
  const user = await users.updateProfile(req.user.id, req.body);
  res.json({ user });
}

/* ------------------------------------------------------ email verification */

const VERIFY_FAILURES = {
  invalid: ['This verification link is invalid.', 'TOKEN_INVALID'],
  expired: ['This verification link has expired.', 'TOKEN_EXPIRED'],
  used: ['This verification link has already been used.', 'TOKEN_USED'],
};

/** POST /auth/verify-email { token }: the page the emailed button opens calls this once. */
export async function verifyEmail(req, res) {
  const { status } = await verification.redeem(req.body.token);
  if (status !== 'ok') {
    const [message, code] = VERIFY_FAILURES[status];
    throw new HttpError(400, message, undefined, code);
  }
  res.json({ verified: true, message: 'Email verified successfully. You can now log in.' });
}

const RESENT = 'Verification email sent. Please check your inbox.';
const ADDRESS_CHANGED = 'If that address can be used, we have sent a verification link to it. Please check your inbox.';

/**
 * POST /auth/resend-verification { email } or { token }: send a new link, cancelling the old one.
 * Answers the same for every address, in the same time, so it cannot be used to find out who has an
 * account: the email is sent in the background. The rate limits (routes/index.js: a cooldown, then
 * EMAIL_RATE_LIMIT_MAX an hour per address) apply to every address alike. The count of stored links below
 * is only a backstop that survives a restart.
 */
export async function resendVerification(req, res) {
  if (!emailConfigured()) {
    console.error(NOT_CONFIGURED);
    throw emailUnavailable();
  }
  let user;
  if (req.body.token) {
    const userId = await verification.userIdFor(req.body.token);
    user = userId ? await users.findById(userId) : undefined;
  } else {
    user = await users.findByEmail(req.body.email);
  }
  if (user && !user.emailVerified && (await verification.requestedLastHour(user.id)) < config.email.resendLimit + 1) {
    await queueVerification(user);
  }
  res.json({ message: RESENT });
}

/**
 * POST /auth/change-email { email, password, newEmail }: for someone stuck on the wrong address before
 * verifying. They prove it is their account with the password. If the new address already belongs to
 * someone else nothing changes, and the answer is the same, so addresses cannot be discovered.
 */
export async function changeEmail(req, res) {
  const { email, password, newEmail } = req.body;
  const found = await users.findByEmail(email);
  if (!found || !(await bcrypt.compare(password, found.password))) throw unauthorized(INVALID_CREDENTIALS);
  res.locals.passwordWasRight = true;
  if (found.emailVerified) throw conflict('This email address is already verified.');
  if (!emailConfigured()) {
    console.error(NOT_CONFIGURED);
    throw emailUnavailable();
  }
  if (newEmail !== found.email && !(await users.changeEmail(found.id, newEmail))) return res.json({ message: ADDRESS_CHANGED });
  if ((await verification.requestedLastHour(found.id)) < config.email.resendLimit + 2) {
    if (!(await sendVerification({ ...found, email: newEmail })).ok) throw emailUnavailable();
  }
  res.json({ message: ADDRESS_CHANGED });
}

/* -------------------------------------------------------- email preferences */

/** Optional emails a person can switch off. The verification email always arrives. */
export async function getEmailPreferences(req, res) {
  res.json({ preferences: await emailPrefs.getPreferences(req.user.id), categories: emailPrefs.EMAIL_CATEGORIES });
}

export async function saveEmailPreferences(req, res) {
  res.json({ preferences: await emailPrefs.setPreferences(req.user.id, req.body), categories: emailPrefs.EMAIL_CATEGORIES });
}
