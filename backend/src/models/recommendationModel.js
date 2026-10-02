import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db.js';
import { evaluateRules } from '../services/recommendationRules.js';
import { generateJson } from '../services/ai/anthropic.js';
import { HttpError, conflict, notFound } from '../utils/httpError.js';

const COLUMNS = `
  id, rule_key AS "ruleKey", source, category, severity, title, message, suggestion, evidence, link, status,
  created_at AS "createdAt", updated_at AS "updatedAt", resolved_at AS "resolvedAt"`;

export const CATEGORIES = ['registration', 'attendance', 'sessions', 'volunteers', 'teams', 'schedule', 'feedback', 'general'];
const ORDER = `CASE severity WHEN 'important' THEN 0 WHEN 'suggestion' THEN 1 ELSE 2 END`;

export async function list(eventId) {
  return query(
    `SELECT ${COLUMNS} FROM ai_recommendations WHERE event_id = $1
      ORDER BY (status = 'new') DESC, ${ORDER}, updated_at DESC, id DESC`,
    [eventId],
  );
}

/**
 * Re-evaluate the rules against current metrics and bring the stored list in line:
 * new findings are added, existing ones refreshed, and ones whose situation no longer applies are
 * marked resolved. The organizer's dismiss / done decisions are kept while the situation lasts.
 */
export async function refresh(eventId, metrics) {
  const findings = evaluateRules(metrics);
  const keys = findings.map((f) => f.key);

  for (const f of findings) {
    await query(
      `INSERT INTO ai_recommendations (event_id, rule_key, source, category, severity, title, message, suggestion, evidence, link)
       VALUES ($1, $2, 'rules', $3, $4, $5, $6, $7, $8::jsonb, $9)
       ON CONFLICT (event_id, rule_key) DO UPDATE
         SET category = EXCLUDED.category, severity = EXCLUDED.severity, title = EXCLUDED.title,
             message = EXCLUDED.message, suggestion = EXCLUDED.suggestion, evidence = EXCLUDED.evidence, link = EXCLUDED.link,
             updated_at = NOW(),
             status = CASE WHEN ai_recommendations.status = 'resolved' THEN 'new' ELSE ai_recommendations.status END,
             resolved_at = CASE WHEN ai_recommendations.status = 'resolved' THEN NULL ELSE ai_recommendations.resolved_at END`,
      [eventId, f.key, f.category, f.severity, f.title, f.message, f.suggestion, JSON.stringify(f.evidence), f.link],
    );
  }

  // Rules that no longer apply are resolved, whatever the organizer had decided about them.
  await query(
    `UPDATE ai_recommendations SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
      WHERE event_id = $1 AND source = 'rules' AND status <> 'resolved' AND NOT (rule_key = ANY($2))`,
    [eventId, keys],
  );
  return findings;
}

export async function setStatus(eventId, id, status) {
  const rows = await query(
    `UPDATE ai_recommendations SET status = $3, updated_at = NOW() WHERE id = $1 AND event_id = $2 AND status <> 'resolved' RETURNING id`,
    [id, eventId, status],
  );
  if (!rows[0]) {
    const exists = (await query(`SELECT status FROM ai_recommendations WHERE id = $1 AND event_id = $2`, [id, eventId]))[0];
    if (!exists) throw notFound('Recommendation not found');
    throw conflict('That recommendation no longer applies');
  }
  return (await query(`SELECT ${COLUMNS} FROM ai_recommendations WHERE id = $1`, [id]))[0];
}

/* ------------------------------------------------------------- AI suggestions */

const aiItem = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(5).max(160),
  message: z.string().trim().min(10).max(600),
  suggestion: z.string().trim().min(5).max(400),
  basis: z.string().trim().min(3).max(300),
});
const aiResult = z.object({ recommendations: z.array(aiItem).max(5) });

const aiJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendations'],
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'title', 'message', 'suggestion', 'basis'],
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          title: { type: 'string' },
          message: { type: 'string' },
          suggestion: { type: 'string' },
          basis: { type: 'string' },
        },
      },
    },
  },
};

const SYSTEM = `You advise student organizers of college events. You are given aggregate numbers about one event (no personal data) and the recommendations the app has already produced from fixed rules.

Suggest up to 5 ADDITIONAL, specific ideas that would help this event, in areas such as registration, attendance, sessions, volunteers, team formation, schedule and feedback.
- Base every idea on the numbers provided, and say which numbers in "basis". Never invent figures, names or facts.
- Do not repeat anything already listed. If the numbers do not justify more ideas, return fewer, or none.
- Phrase each as a suggestion the organizer can accept or ignore ("Consider ..."). You do not make decisions and nothing you say is applied automatically.`;

/** A compact, personal-data-free view of the metrics for the model. */
function snapshotFor(metrics) {
  const { now: _now, ...rest } = metrics;
  return {
    ...rest,
    sessions: {
      total: metrics.sessions.total,
      today: metrics.sessions.today,
      items: metrics.sessions.items.slice(0, 30).map((s) => ({ title: s.title, type: s.type, date: s.date, start: s.startTime, end: s.endTime, status: s.status, scans: s.scans })),
    },
  };
}

/** Ask Claude for extra suggestions. They are stored as `source: 'ai'` and are never applied by themselves. */
export async function addAiSuggestions(eventId, metrics, existingTitles) {
  const reply = async (messages) => generateJson({ system: SYSTEM, schema: aiJsonSchema, messages });
  const prompt = `Event metrics (JSON):\n${JSON.stringify(snapshotFor(metrics))}\n\nAlready shown to the organizer:\n${existingTitles.map((t) => `- ${t}`).join('\n') || '- (nothing yet)'}`;

  let result = aiResult.safeParse((await reply([{ role: 'user', content: prompt }])).json);
  if (!result.success) {
    // One more try; if it is still malformed we say so rather than store anything.
    result = aiResult.safeParse((await reply([{ role: 'user', content: prompt }])).json);
  }
  if (!result.success) throw new HttpError(502, 'The AI returned suggestions that did not pass our checks. Please try again.');

  let added = 0;
  for (const item of result.data.recommendations) {
    const key = `ai:${crypto.createHash('sha1').update(item.title.toLowerCase()).digest('hex').slice(0, 12)}`;
    const rows = await query(
      `INSERT INTO ai_recommendations (event_id, rule_key, source, category, severity, title, message, suggestion, evidence)
       VALUES ($1, $2, 'ai', $3, 'suggestion', $4, $5, $6, $7::jsonb) ON CONFLICT (event_id, rule_key) DO NOTHING RETURNING id`,
      [eventId, key, item.category, item.title, item.message, item.suggestion, JSON.stringify([{ label: 'Based on', value: item.basis }])],
    );
    added += rows.length;
  }
  return added;
}
