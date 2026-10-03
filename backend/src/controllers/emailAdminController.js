import * as logs from '../models/emailModel.js';
import { NOT_CONFIGURED, emailStatus, sendEmail } from '../services/email/index.js';
import { configProblems } from '../services/email/provider.js';
import { TEMPLATE_NAMES } from '../services/email/templates.js';

/**
 * For administrators only: is email set up, what is missing, and how delivery has gone.
 * Never includes the provider key. Ordinary users are never told any of this.
 */
export async function status(_req, res) {
  res.json({ ...emailStatus(), problems: configProblems(), stats: await logs.stats(), recentFailures: await logs.recentFailures(), templates: TEMPLATE_NAMES });
}

export async function list(req, res) {
  res.json({ logs: await logs.listLogs(req.query) });
}

/** Send a test email to the admin's own address, and say honestly what happened. */
export async function test(req, res) {
  const result = await sendEmail({ to: req.user.email, template: 'testEmail', data: { name: req.user.name }, userId: req.user.id });
  res.json({
    ok: result.ok,
    message: result.ok ? `A test email was sent to ${req.user.email}.` : result.reason === 'not_configured' ? NOT_CONFIGURED : `The email provider refused it: ${result.error ?? 'unknown error'}`,
  });
}
