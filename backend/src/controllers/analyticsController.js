import { z } from 'zod';
import { EVENT_TYPES } from '../constants.js';
import * as analytics from '../models/analyticsModel.js';
import { toCsv } from '../utils/csv.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const analyticsQuerySchema = z
  .object({
    eventId: z.coerce.number().int().positive().optional(),
    type: z.enum(EVENT_TYPES).optional(),
    from: date.optional(),
    to: date.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ['to'], message: 'End date cannot be before the start date' });

export async function get(req, res) {
  res.json(await analytics.analytics(req.user.id, req.query));
}

/** Event performance table as CSV, same filters as the dashboard. */
export async function exportCsv(req, res) {
  const { performance } = await analytics.analytics(req.user.id, req.query);
  const pct = (v) => `${v}%`;
  const csv = toCsv(performance, [
    { header: 'Event', value: (p) => p.name },
    { header: 'Type', value: (p) => p.type },
    { header: 'Date', value: (p) => p.date },
    { header: 'Capacity', value: (p) => p.capacity },
    { header: 'Registrations', value: (p) => p.registrations },
    { header: 'Fill rate', value: (p) => pct(p.fillRate) },
    { header: 'Attendance', value: (p) => p.attendance },
    { header: 'Attendance rate', value: (p) => pct(p.attendanceRate) },
    { header: 'Registration conversion', value: (p) => pct(p.conversion) },
    { header: 'Engagement', value: (p) => pct(p.engagement) },
    { header: 'Average feedback (of 5)', value: (p) => p.feedbackAverage ?? '' },
    { header: 'Feedback responses', value: (p) => p.feedbackResponses },
    { header: 'Completion', value: (p) => pct(p.completion) },
    { header: 'Teams', value: (p) => p.teams },
  ]);
  res
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="event-analytics.csv"')
    .send(csv);
}
