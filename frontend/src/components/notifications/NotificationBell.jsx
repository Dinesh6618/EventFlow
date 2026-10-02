import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../api';
import { useApi } from '../../hooks/useApi.js';
import Icon from '../ui/Icon.jsx';

export const timeAgo = (iso) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** Bell with an unread badge and a dropdown of the latest notifications. Polls every 30 s. */
export default function NotificationBell({ dark = false, align = 'right' }) {
  const navigate = useNavigate();
  const { data, reload } = useApi((signal) => notificationsApi.list({ limit: 8 }, signal), [], { refreshMs: 30000 });
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const unread = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) await notificationsApi.markRead(n.id).catch(() => {});
    reload();
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    await notificationsApi.markAllRead().catch(() => {});
    reload();
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          reload();
        }}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        className={`relative rounded-lg p-2 transition-colors ${dark ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
      >
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          // Phones: a full-width sheet under the header. Larger screens: a popover anchored to the bell.
          className={`fixed inset-x-4 top-16 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:mt-2 sm:w-80 ${align === 'right' ? 'sm:right-0' : 'sm:left-0'}`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                Mark all read
              </button>
            )}
          </div>
          {data?.notifications.length ? (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {data.notifications.map((n) => (
                <li key={n.id}>
                  <button type="button" role="menuitem" onClick={() => openItem(n)} className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-indigo-50/50'}`}>
                    <span className="flex items-start gap-2">
                      {!n.read && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{n.title}</span>
                        <span className="line-clamp-2 text-xs text-slate-500">{n.message}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">You are all caught up.</p>
          )}
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-indigo-600 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
