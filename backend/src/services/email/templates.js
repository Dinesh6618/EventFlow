import { config } from '../../config.js';

/**
 * Every email EventFlow sends. Each template returns { subject, html, text } from plain data, and all
 * of them share one layout: logo, heading, message, a button, extra details, footer.
 * Anything that came from a person (names, event titles, announcement text) is escaped.
 */

const BRAND = '#4f46e5';
const NAVY = '#0f172a';

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------------------------------------------------------- date and time */

const dateOf = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

/** { date, time } as people read them: "Saturday, 14 November 2026" and "9:00 AM - 5:00 PM". */
export function eventWhen(event) {
  const multi = (event.endDate || event.date) !== event.date;
  return {
    date: multi ? `${dateOf(event.date)} to ${dateOf(event.endDate)}` : dateOf(event.date),
    time: `${timeOf(event.startTime)} - ${timeOf(event.endTime)}`,
  };
}

/* ----------------------------------------------------------------- layout */

/**
 * @param {object} o
 * @param {string} o.preheader   one line shown next to the subject in the inbox
 * @param {string} o.heading
 * @param {string[]} o.paragraphs plain text, escaped here
 * @param {{label: string, url: string}} [o.button]
 * @param {[string, string][]} [o.details]   rows of label / value
 * @param {string} [o.after]     more plain text under the button
 * @param {string} [o.notice]    a security notice, set apart in its own box
 * @param {string} [o.extraHtml] trusted HTML (the QR image) placed after the details
 * @param {boolean} [o.preferences] show the email preferences link (optional emails only)
 */
function layout({ preheader, heading, paragraphs = [], button, details = [], after, notice, extraHtml = '', preferences = false }) {
  const prefsUrl = `${config.appUrl}/profile`;
  const para = (t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">${esc(t).replace(/\n/g, '<br>')}</p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ff;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader ?? heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td style="padding:0 4px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:34px;height:34px;background:${BRAND};border-radius:10px;text-align:center;color:#ffffff;font-weight:800;font-size:18px;line-height:34px;">E</td>
      <td style="padding-left:10px;font-size:20px;font-weight:800;color:${NAVY};letter-spacing:-0.3px;">EventFlow</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border-radius:20px;padding:36px 32px;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
    <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;color:${NAVY};">${esc(heading)}</h1>
    ${paragraphs.map(para).join('\n    ')}
    ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr><td style="background:${BRAND};border-radius:12px;"><a href="${esc(button.url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(button.label)}</a></td></tr></table>` : ''}
    ${details.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f8fafc;border-radius:14px;padding:6px 18px;">${details.map(([k, v]) => `<tr><td style="padding:10px 0;width:38%;font-size:13px;color:#64748b;vertical-align:top;">${esc(k)}</td><td style="padding:10px 0;font-size:15px;font-weight:600;color:${NAVY};">${esc(v)}</td></tr>`).join('')}</table>` : ''}
    ${extraHtml}
    ${after ? para(after) : ''}
    ${notice ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;"><tr><td style="padding:14px 16px;font-size:14px;line-height:1.55;color:#78350f;"><strong>Security notice</strong><br>${esc(notice).replace(/\n/g, '<br>')}</td></tr></table>` : ''}
    <p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#334155;">Thanks,<br>EventFlow Team</p>
    ${button ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">Button not working? Copy this link into your browser:<br><span style="word-break:break-all;">${esc(button.url)}</span></p>` : ''}
  </td></tr>
  <tr><td style="padding:18px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">
    You are receiving this email because you have an EventFlow account.${preferences ? ` <a href="${esc(prefsUrl)}" style="color:#64748b;">Email preferences</a>` : ''}<br>EventFlow, college event management.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    heading,
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    ...details.map(([k, v]) => `${k}: ${v}`),
    ...(details.length ? [''] : []),
    ...(after ? [after, ''] : []),
    ...(notice ? [`Security notice: ${notice}`, ''] : []),
    'Thanks,',
    'EventFlow Team',
    ...(preferences ? ['', `Email preferences: ${prefsUrl}`] : []),
  ].join('\n');
  return { html, text };
}

const hi = (name) => `Hi ${name || 'there'},`;
const venueLine = (event) => event.venue || 'To be announced';

/* -------------------------------------------------------------- templates */

export const TEMPLATES = {
  /** 1. Account verification. */
  verifyEmail: ({ name, url }) => ({
    subject: 'Verify your EventFlow account',
    ...layout({
      preheader: 'Confirm your email address to activate your account.',
      heading: 'Verify your email address',
      paragraphs: [hi(name), 'Welcome to EventFlow. Please verify your email address to activate your account.'],
      button: { label: 'Verify Email', url: url },
      after: 'This verification link expires in 24 hours and can be used once.',
      notice: 'If you did not create an EventFlow account, you can safely ignore this email.\nEventFlow will never ask you for your password by email.',
    }),
  }),

  /** 2. Registration confirmed (or received, when the organizer must approve it first). */
  registrationConfirmed: ({ name, event, participantCode, passUrl, pending = false }) => {
    const when = eventWhen(event);
    return {
      subject: pending ? `We received your registration for ${event.name}` : `You're registered for ${event.name}`,
      ...layout({
        preheader: pending ? 'The organizer will review your registration.' : 'Your seat is confirmed.',
        heading: pending ? 'Registration received' : "You're registered!",
        paragraphs: [hi(name), pending ? `We have received your registration for ${event.name}. The organizer will review it and you will get another email with their decision.` : `Your registration for ${event.name} has been confirmed.`],
        details: [['Event', event.name], ['Date', when.date], ['Time', when.time], ['Venue', venueLine(event)], ['Participant ID', participantCode]],
        button: pending ? { label: 'View Event', url: passUrl } : { label: 'View Event Pass', url: passUrl },
      }),
    };
  },

  /** 3. The organizer approved a registration. */
  registrationApproved: ({ name, event, passUrl }) => {
    const when = eventWhen(event);
    return {
      subject: `Your registration was approved: ${event.name}`,
      ...layout({
        preheader: 'You have a seat. Your event pass is ready.',
        heading: 'Registration approved',
        paragraphs: [hi(name), `Good news: the organizer approved your registration for ${event.name}.`],
        details: [['Event', event.name], ['Date', when.date], ['Time', when.time], ['Venue', venueLine(event)]],
        button: { label: 'View Event Pass', url: passUrl },
      }),
    };
  },

  /** 4. The organizer declined a registration. */
  registrationRejected: ({ name, event, eventsUrl, reason }) => ({
    subject: `Update on your registration: ${event.name}`,
    ...layout({
      preheader: 'The organizer was not able to accept your registration.',
      heading: 'Registration not accepted',
      paragraphs: [hi(name), `The organizer was not able to accept your registration for ${event.name}.`, ...(reason ? [`Reason: ${reason}`] : []), 'There are other events you might like.'],
      button: { label: 'Explore Events', url: eventsUrl },
    }),
  }),

  /** 5. An admin approved an organizer's venue request. */
  venueBookingApproved: ({ name, event, bookingUrl }) => {
    const when = eventWhen(event);
    return {
      subject: `Venue Booking Approved — ${event.name}`,
      ...layout({
        preheader: `${venueLine(event)} is booked for your event.`,
        heading: 'Venue booking approved',
        paragraphs: [hi(name), `Your venue request for ${event.name} has been approved.`],
        details: [['Event', event.name], ['Venue', venueLine(event)], ['Date', when.date], ['Time', when.time], ['Booking status', 'Approved']],
        ...(bookingUrl && { button: { label: 'View Event', url: bookingUrl } }),
      }),
    };
  },

  /** 6. An admin rejected an organizer's venue request. */
  venueBookingRejected: ({ name, event, reason, bookingUrl }) => {
    const when = eventWhen(event);
    return {
      subject: 'Venue Booking Request Update',
      ...layout({
        preheader: `Your venue request for ${event.name} could not be approved.`,
        heading: 'Venue request not approved',
        paragraphs: [hi(name), `We could not approve the venue request for ${event.name}. You can choose another venue or time and ask again.`],
        details: [['Event', event.name], ['Requested venue', venueLine(event)], ['Date', when.date], ['Time', when.time], ['Reason', reason || 'No reason was given']],
        ...(bookingUrl && { button: { label: 'View Event', url: bookingUrl } }),
      }),
    };
  },

  /** 7. The schedule changed. `changes` is a list of short sentences. */
  scheduleChanged: ({ name, eventName, changes, eventUrl }) => ({
    subject: `Schedule updated: ${eventName}`,
    ...layout({
      preheader: changes[0],
      heading: 'The schedule changed',
      paragraphs: [hi(name), `The organizer updated the schedule for ${eventName}:`, ...changes.map((c) => `- ${c}`)],
      button: { label: 'View Schedule', url: eventUrl },
      preferences: true,
    }),
  }),

  /** 8. The day-before reminder. Includes the QR pass and, for online events, the meeting link. */
  eventReminder: ({ name, event, passUrl, meetingUrl, qrCid }) => {
    const when = eventWhen(event);
    return {
      subject: `Event Reminder — ${event.name}`,
      ...layout({
        preheader: `${event.name} is coming up.`,
        heading: 'Your event is coming up',
        paragraphs: [hi(name), `This is a reminder that ${event.name} is happening soon.`],
        details: [['Event', event.name], ['Date', when.date], ['Time', when.time], ['Venue', venueLine(event)], ...(meetingUrl ? [['Join online', meetingUrl]] : [])],
        extraHtml: qrCid ? `<p style="margin:0 0 8px;font-size:13px;color:#64748b;">Your QR event pass</p><img src="cid:${esc(qrCid)}" width="180" height="180" alt="Your QR event pass" style="display:block;margin:0 0 20px;border-radius:12px;border:1px solid #e2e8f0;">` : '',
        button: { label: 'View Event Pass', url: passUrl },
        after: qrCid ? 'Show the QR code at the entrance to check in.' : undefined,
        preferences: true,
      }),
    };
  },

  /** 9. A certificate is ready. */
  certificateAvailable: ({ name, eventName, typeLabel, certificatesUrl }) => ({
    subject: `Your certificate is ready: ${eventName}`,
    ...layout({
      preheader: `Your ${typeLabel} certificate can be downloaded now.`,
      heading: 'Your certificate is ready',
      paragraphs: [hi(name), `Your ${typeLabel} certificate for ${eventName} is ready to download.`],
      button: { label: 'View My Certificates', url: certificatesUrl },
      preferences: true,
    }),
  }),

  /** 10. Invited to join a team. */
  teamInvitation: ({ name, teamName, eventName, inviterName, url }) => ({
    subject: `You were invited to join ${teamName}`,
    ...layout({
      preheader: `${inviterName || 'A team leader'} invited you to ${teamName} for ${eventName}.`,
      heading: 'You have a team invitation',
      paragraphs: [hi(name), `${inviterName || 'A team leader'} invited you to join the team "${teamName}" for ${eventName}.`],
      button: { label: 'View Invitation', url },
      preferences: true,
    }),
  }),

  /** 11. An announcement from the organizer. */
  eventAnnouncement: ({ name, eventName, title, message, eventUrl }) => ({
    subject: `${eventName}: ${title}`,
    ...layout({
      preheader: String(message).slice(0, 90),
      heading: title,
      paragraphs: [hi(name), `A message from the organizer of ${eventName}:`, message],
      button: { label: 'View Event', url: eventUrl },
      preferences: true,
    }),
  }),

  /** Sent from the admin page to check that email works. */
  testEmail: ({ name }) => ({
    subject: 'EventFlow test email',
    ...layout({ preheader: 'Email is working.', heading: 'Email is working', paragraphs: [hi(name), 'This is a test email from EventFlow. If you can read it, your email settings are correct.'] }),
  }),
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

export function renderTemplate(name, data) {
  const template = TEMPLATES[name];
  if (!template) throw new Error(`Unknown email template: ${name}`);
  return template(data);
}
