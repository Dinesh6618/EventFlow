import { z } from 'zod';
import * as recommendations from '../models/recommendationModel.js';
import * as zones from '../models/zoneModel.js';
import { aiStatus } from '../services/ai/anthropic.js';
import { requireEventAccess } from '../services/access.js';
import { controlCenter } from '../services/controlCenter.js';
import { collectMetrics } from '../services/eventMetrics.js';
import { idParam } from '../utils/params.js';

export const statusSchema = z.object({ status: z.enum(['new', 'dismissed', 'done'], { errorMap: () => ({ message: 'Status must be new, dismissed or done' }) }) });
export const zoneCreateSchema = z.object({ name: z.string({ required_error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(60, 'Name must be at most 60 characters') });
export const zoneReportSchema = z.object({
  status: z.enum(zones.ZONE_STATUSES, { errorMap: () => ({ message: 'Choose normal, busy or high queue' }) }),
  note: z.string().trim().max(200, 'Note must be at most 200 characters').optional().transform((v) => v ?? ''),
});

const eventOf = (req, allowed = ['organizer']) => requireEventAccess(req.user, idParam(req.params.id, 'Event'), allowed);

/** GET /events/:id/recommendations - re-checks the rules against today's data, then lists everything. */
export async function list(req, res) {
  const { event } = await eventOf(req);
  await recommendations.refresh(event.id, await collectMetrics(event));
  res.json({ recommendations: await recommendations.list(event.id), ai: aiStatus() });
}

export async function update(req, res) {
  const { event } = await eventOf(req);
  res.json({ recommendation: await recommendations.setStatus(event.id, idParam(req.params.rid, 'Recommendation'), req.body.status) });
}

/** POST /events/:id/recommendations/ai - extra ideas from Claude, stored as suggestions. */
export async function suggestWithAi(req, res) {
  const { event } = await eventOf(req);
  const metrics = await collectMetrics(event);
  await recommendations.refresh(event.id, metrics);
  const current = await recommendations.list(event.id);
  const added = await recommendations.addAiSuggestions(event.id, metrics, current.filter((r) => r.status !== 'resolved').map((r) => r.title));
  res.json({ added, recommendations: await recommendations.list(event.id) });
}

/** GET /events/:id/control-center */
export async function getControlCenter(req, res) {
  const { event } = await eventOf(req);
  res.json(await controlCenter(event));
}

/* ------------------------------------------------------------------- zones */

export async function listZones(req, res) {
  const { event } = await eventOf(req, ['organizer', 'volunteer']);
  res.json({ zones: await zones.list(event.id) });
}

export async function createZone(req, res) {
  const { event } = await eventOf(req);
  res.status(201).json({ zone: await zones.create(event.id, req.body.name) });
}

/** Organizers and volunteers both report what they see. */
export async function reportZone(req, res) {
  const { event } = await eventOf(req, ['organizer', 'volunteer']);
  res.json({ zone: await zones.report(event.id, idParam(req.params.zoneId, 'Zone'), req.user.id, req.body) });
}

export async function removeZone(req, res) {
  const { event } = await eventOf(req);
  await zones.remove(event.id, idParam(req.params.zoneId, 'Zone'));
  res.status(204).end();
}
