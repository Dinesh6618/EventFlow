import * as events from '../models/eventModel.js';
import * as users from '../models/userModel.js';

export async function stats(_req, res) {
  const [counts, all] = await Promise.all([users.countByRole(), events.listAll()]);
  res.json({
    stats: { ...events.summarize(all), users: counts, totalUsers: Object.values(counts).reduce((a, b) => a + b, 0) },
    events: all,
  });
}
