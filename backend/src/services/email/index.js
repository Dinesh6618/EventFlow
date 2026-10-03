import { config } from '../../config.js';
import * as logs from '../../models/emailModel.js';
import { deliver, emailConfigured, sanitize } from './provider.js';
import { renderTemplate } from './templates.js';

export { emailConfigured } from './provider.js';
export { EMAIL_CATEGORIES } from '../../models/emailModel.js';

/** Logged on the server only. Users are only ever told that the email could not be sent right now. */
export const NOT_CONFIGURED = 'Email service is not configured. Set EMAIL_PROVIDER_API_KEY and EMAIL_FROM.';

/** What a person is told when sending fails. No provider names, no keys, no details. */
export const FRIENDLY_FAILURE = "We couldn't send the email right now. Please try again.";

/** What an unverified person is told when they try to log in. */
export const UNVERIFIED_MESSAGE = 'Please verify your email before logging in.';

/**
 * Is verification enforced? Yes, unless EMAIL_VERIFICATION_REQUIRED says otherwise, whenever email is
 * configured (people can receive the link) and always in production (an unverified address is never
 * trusted there, even if email is broken). The one exception is a development machine with no email
 * set up at all, where nobody could ever receive a link and enforcing it would lock out every new account.
 */
export const verificationRequired = () =>
  config.email.verificationOverride === null ? emailConfigured() || config.env === 'production' : config.email.verificationOverride;

/** Build the full web address of a page. The base comes from APP_URL, never from the request. */
export const appLink = (path) => `${config.appUrl}${path}`;

/* ----------------------------------------------------------------- sending */

/** Send one rendered message and write the outcome to the log. Never throws. */
async function attempt(logId, template, message) {
  try {
    const result = await deliver(message);
    await logs.markSent(logId, result?.id ?? null);
    return { ok: true };
  } catch (err) {
    const safe = sanitize(err.message);
    await logs.markFailed(logId, safe).catch(() => {});
    console.error(`Email "${template}" could not be sent: ${safe}`);
    return { ok: false, reason: 'provider_error', error: safe };
  }
}

/** Look up whether the person wants this kind of optional email. Security emails never call this. */
async function allowed(userId, category) {
  if (!category || !userId) return true;
  return (await logs.getPreferences(userId))[category] !== false;
}

function build(template, data, attachments) {
  const { subject, html, text } = renderTemplate(template, data);
  return { subject, message: { subject, html, text, ...(attachments?.length && { attachments }) } };
}

/**
 * Send an email and wait for the result. For things a person is waiting on (the verification email).
 * `category` marks optional email that the person can switch off; leave it out for security email.
 * Returns { ok, skipped?, reason?, error? }.
 */
export async function sendEmail({ to, template, data, userId = null, category = null, attachments }) {
  let built;
  try {
    built = build(template, data, attachments);
  } catch (err) {
    console.error(`Email template "${template}" could not be built: ${err.message}`);
    return { ok: false, reason: 'template_error' };
  }
  if (!(await allowed(userId, category))) return { ok: true, skipped: 'preference' };

  const logId = await logs.insertLog({ userId, recipient: to, template, subject: built.subject });
  if (!emailConfigured()) {
    await logs.markFailed(logId, NOT_CONFIGURED);
    console.error(NOT_CONFIGURED);
    return { ok: false, reason: 'not_configured' };
  }
  return attempt(logId, template, { to, ...built.message });
}

/* -------------------------------------------------------------------- queue */

const queue = [];
let running = false;
let idleWaiters = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    await queue.shift()();
    if (config.email.sendIntervalMs > 0 && queue.length) await sleep(config.email.sendIntervalMs);
  }
  running = false;
  idleWaiters.forEach((resolve) => resolve());
  idleWaiters = [];
}

/** Resolves once everything queued so far has been sent or has failed. Tests and shutdown use it. */
export const emailIdle = () => (running || queue.length ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve());

/**
 * Add an email to the background queue and return straight away. For everything nobody is waiting on
 * (confirmations, reminders, announcements). It is logged as QUEUED now, then SENT or FAILED. Sends are
 * spaced out because providers limit how fast you can send. When email is not configured this does
 * nothing at all: the server already warned about that once at start-up.
 * `onFailure(result)` runs if the provider refuses it, after the failure is logged.
 */
export async function queueEmail({ to, template, data, userId = null, category = null, attachments, onFailure }) {
  if (!emailConfigured()) return { ok: false, skipped: 'not_configured' };
  try {
    if (!(await allowed(userId, category))) return { ok: true, skipped: 'preference' };
    const built = build(template, data, attachments);
    const logId = await logs.insertLog({ userId, recipient: to, template, subject: built.subject });
    queue.push(async () => {
      const result = await attempt(logId, template, { to, ...built.message });
      // For cleaning up after a send that did not happen, for example throwing away the unusable link.
      if (!result.ok && onFailure) await Promise.resolve(onFailure(result)).catch(() => {});
    });
    pump();
    return { ok: true, queued: true };
  } catch (err) {
    console.error(`Email "${template}" could not be queued: ${err.message}`);
    return { ok: false, reason: 'queue_error' };
  }
}

/** For the admin page: whether email works, and what is wrong if it does not. Never includes the key. */
export function emailStatus() {
  return { configured: emailConfigured(), provider: config.email.provider, from: config.email.from || null, appUrl: config.appUrl, verificationRequired: verificationRequired() };
}
