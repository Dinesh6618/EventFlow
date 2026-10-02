import { query } from '../db.js';
import { conflict, notFound } from '../utils/httpError.js';

export const ZONE_STATUSES = ['normal', 'busy', 'high_queue'];

const SELECT = `
  SELECT z.id, z.name, z.status, z.note, z.reported_at AS "reportedAt", u.name AS "reportedBy"
    FROM event_zones z LEFT JOIN users u ON u.id = z.reported_by`;

export async function list(eventId) {
  return query(`${SELECT} WHERE z.event_id = $1 ORDER BY z.position, z.id`, [eventId]);
}

export async function create(eventId, name) {
  try {
    const next = (await query(`SELECT COALESCE(MAX(position), 0) + 1 AS n FROM event_zones WHERE event_id = $1`, [eventId]))[0].n;
    const rows = await query(`INSERT INTO event_zones (event_id, name, position) VALUES ($1, $2, $3) RETURNING id`, [eventId, name, next]);
    return (await query(`${SELECT} WHERE z.id = $1`, [rows[0].id]))[0];
  } catch (err) {
    if (err.code === '23505') throw conflict('There is already a zone with that name', { name: 'That zone already exists' });
    throw err;
  }
}

/** Record what someone on the ground sees right now. Stores who reported it and when. */
export async function report(eventId, zoneId, userId, { status, note }) {
  const rows = await query(
    `UPDATE event_zones SET status = $3, note = $4, reported_at = NOW(), reported_by = $5 WHERE id = $1 AND event_id = $2 RETURNING id`,
    [zoneId, eventId, status, note, userId],
  );
  if (!rows[0]) throw notFound('Zone not found');
  return (await query(`${SELECT} WHERE z.id = $1`, [zoneId]))[0];
}

export async function remove(eventId, zoneId) {
  const rows = await query(`DELETE FROM event_zones WHERE id = $1 AND event_id = $2 RETURNING id`, [zoneId, eventId]);
  if (!rows[0]) throw notFound('Zone not found');
}
