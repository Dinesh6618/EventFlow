import { config } from '../../config.js';

/** A failure from the email provider. The message is safe to store; it never holds a key. */
export class EmailProviderError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

let override = null;

/** Swap the provider (tests inject a fake). Pass null to go back to Resend. */
export function setEmailProvider(next) {
  override = next;
}

/** True when an email can really be sent: a provider key and a sender address are both set. */
export const emailConfigured = () => Boolean(override ? override.configured !== false : config.email.apiKey && config.email.from);

/** Is the sender address set to something a real provider will accept? Used for the admin status page. */
export const configProblems = () => {
  const problems = [];
  if (!config.email.apiKey) problems.push('EMAIL_PROVIDER_API_KEY is not set.');
  if (!config.email.from) problems.push('EMAIL_FROM is not set.');
  if (config.env === 'production' && !config.appUrl.startsWith('https://')) problems.push('APP_URL should use https in production.');
  // Resend's shared test sender only delivers to the address the Resend account was opened with.
  if (/@resend\.dev\b/i.test(config.email.from)) {
    problems.push("EMAIL_FROM is Resend's test sender, which can only deliver to the email address of your own Resend account. Verify a domain in Resend and use an address on it to email everyone.");
  }
  return problems;
};

/** Make an error message safe to keep or show: no keys, no links, short. */
export function sanitize(message) {
  return String(message ?? 'Unknown error')
    .replace(/re_[A-Za-z0-9_]{8,}/g, '[key]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [key]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .slice(0, 300);
}

const RESEND_URL = 'https://api.resend.com/emails';

/** Send through Resend's HTTP API. Returns { id } or throws EmailProviderError. */
async function sendWithResend({ from, to, subject, html, text, attachments }) {
  let response;
  try {
    response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.email.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        ...(attachments?.length && {
          attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64'), ...(a.cid && { content_id: a.cid }) })),
        }),
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new EmailProviderError(err.name === 'TimeoutError' ? 'The email provider took too long to answer' : 'Could not reach the email provider');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new EmailProviderError(sanitize(body.message || `The email provider answered ${response.status}`), response.status);
  return { id: body.id };
}

/** `message`: { to, subject, html, text, attachments? }. The sender is added here. */
export async function deliver(message) {
  const provider = override ?? { send: sendWithResend };
  return provider.send({ from: config.email.from, ...message });
}
