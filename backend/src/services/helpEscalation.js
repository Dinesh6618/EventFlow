import { query } from '../db.js';
import * as help from '../models/helpModel.js';
import * as alerts from './helpNotifications.js';

/**
 * Raise the alarm inside EventFlow, nothing more: it tells the event organizer. It never contacts
 * outside emergency services.
 *  1. An urgent or high request that nobody has acknowledged within the admin's limit is flagged and the organizer notified.
 *  2. A request that stays unresolved beyond the limit for its priority notifies the organizer once.
 */
export async function runHelpEscalation(now = new Date()) {
  const settings = await help.escalationSettings();
  let escalated = 0;
  let unresolved = 0;

  const waiting = await query(
    `SELECT id, priority, created_at AS "createdAt" FROM help_requests WHERE status = 'reported' AND NOT escalated AND priority IN ('urgent', 'high')`,
  );
  for (const row of waiting) {
    const limit = settings.ackMinutes[row.priority];
    if (!limit || help.minutesBetween(now, row.createdAt) < limit) continue;
    const updated = await help.escalate(row.id, { raise: false, reason: `Not acknowledged within ${limit} minutes` });
    if (!updated) continue;
    const full = await help.find(row.id);
    await alerts.escalated(full, `Not acknowledged within ${limit} minutes.`);
    escalated += 1;
  }

  const open = await query(
    `SELECT id, priority, created_at AS "createdAt" FROM help_requests WHERE status = ANY($1) AND unresolved_alerted_at IS NULL`,
    [help.ACTIVE],
  );
  for (const row of open) {
    const limit = settings.unresolvedMinutes[row.priority];
    const age = help.minutesBetween(now, row.createdAt);
    if (!limit || age < limit) continue;
    await query(`UPDATE help_requests SET unresolved_alerted_at = NOW() WHERE id = $1`, [row.id]);
    await alerts.unresolved(await help.find(row.id), Math.floor(age));
    unresolved += 1;
  }

  return { escalated, unresolved };
}

/** Check every half minute. Returns a function that stops the loop. */
export function startHelpEscalationLoop(everyMs = 30 * 1000) {
  const tick = () => runHelpEscalation().catch((err) => console.error('Help escalation job failed:', err.message));
  tick();
  const timer = setInterval(tick, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
