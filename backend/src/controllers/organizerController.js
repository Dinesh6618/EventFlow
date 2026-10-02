import * as events from '../models/eventModel.js';

export async function stats(req, res) {
  const mine = await events.listByOrganizer(req.user.id);
  const upcoming = mine
    .filter((e) => e.status !== 'ended')
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    .slice(0, 5);

  res.json({ stats: events.summarize(mine), upcomingEvents: upcoming });
}
