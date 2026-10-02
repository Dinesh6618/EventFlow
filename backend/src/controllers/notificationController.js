import * as notifications from '../models/notificationModel.js';
import { idParam } from '../utils/params.js';

export async function list(req, res) {
  const { unread, limit, before } = req.query;
  const [items, unreadCount] = await Promise.all([
    notifications.list(req.user.id, { unreadOnly: unread, limit, before }),
    notifications.unreadCount(req.user.id),
  ]);
  res.json({ notifications: items, unreadCount });
}

export async function markRead(req, res) {
  await notifications.markRead(req.user.id, idParam(req.params.id, 'Notification'));
  res.json({ unreadCount: await notifications.unreadCount(req.user.id) });
}

export async function markAllRead(req, res) {
  await notifications.markAllRead(req.user.id);
  res.json({ unreadCount: 0 });
}
