import { Link } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { timeAgo } from './NotificationBell.jsx';

/** Category and icon for each notification type the backend sends. */
export const NOTIFICATION_KINDS = {
  new_registration: { group: 'updates', icon: 'ticket', tone: 'bg-indigo-50 text-indigo-600' },
  announcement: { group: 'updates', icon: 'message', tone: 'bg-indigo-50 text-indigo-600' },
  schedule_change: { group: 'updates', icon: 'calendar', tone: 'bg-amber-50 text-amber-600' },
  leaderboard_published: { group: 'updates', icon: 'trophy', tone: 'bg-indigo-50 text-indigo-600' },
  judging_assignment: { group: 'updates', icon: 'trophy', tone: 'bg-indigo-50 text-indigo-600' },
  judging_unlocked: { group: 'updates', icon: 'trophy', tone: 'bg-indigo-50 text-indigo-600' },
  team_invitation: { group: 'updates', icon: 'user-plus', tone: 'bg-indigo-50 text-indigo-600' },
  team_request: { group: 'updates', icon: 'user-plus', tone: 'bg-indigo-50 text-indigo-600' },
  team_response: { group: 'updates', icon: 'users', tone: 'bg-indigo-50 text-indigo-600' },
  certificate_issued: { group: 'updates', icon: 'award', tone: 'bg-emerald-50 text-emerald-600' },
  event_reminder: { group: 'reminders', icon: 'clock', tone: 'bg-amber-50 text-amber-600' },
  session_starting: { group: 'reminders', icon: 'zap', tone: 'bg-amber-50 text-amber-600' },
  feedback_request: { group: 'reminders', icon: 'star', tone: 'bg-amber-50 text-amber-600' },
};

export const kindOf = (type) => NOTIFICATION_KINDS[type] ?? { group: 'updates', icon: 'bell', tone: 'bg-slate-100 text-slate-600' };

export default function NotificationItem({ notification: n, onRead }) {
  const kind = kindOf(n.type);
  return (
    <li className={`flex items-start gap-4 px-5 py-4 transition-colors ${n.read ? '' : 'bg-indigo-50/50'}`} data-testid="notification">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${kind.tone}`}>
        <Icon name={kind.icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`${n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {timeAgo(n.createdAt)}
          {n.link && (
            <Link to={n.link} onClick={() => onRead(n)} className="font-medium text-indigo-600 hover:text-indigo-700">Open</Link>
          )}
          {!n.read && (
            <button type="button" onClick={() => onRead(n)} className="font-medium text-slate-500 hover:text-slate-800">Mark as read</button>
          )}
        </p>
      </div>
      {!n.read ? <span role="img" aria-label="Unread" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-600" /> : <span className="mt-2 h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
    </li>
  );
}
