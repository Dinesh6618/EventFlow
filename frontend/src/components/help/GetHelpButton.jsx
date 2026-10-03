import { Link } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';

/**
 * The way into the Help Center. "Get help" with no event goes to the picker; with an event it opens that
 * event's help screen directly. `inline` is a compact pill for cards and headers.
 */
export default function GetHelpButton({ eventId, label, inline = false, className = '' }) {
  const to = eventId ? `/events/${eventId}/help` : '/help';
  if (inline) {
    return (
      <Link
        to={to}
        className={`inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${className}`}
      >
        <Icon name="shield" className="h-4 w-4" />
        {label ?? 'Need Help?'}
      </Link>
    );
  }
  return (
    <Link
      to={to}
      className={`inline-flex min-h-[3.25rem] items-center justify-center gap-2.5 rounded-2xl bg-white px-7 text-base font-extrabold uppercase tracking-wide text-slate-900 shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${className}`}
    >
      <Icon name="shield" className="h-5 w-5 text-indigo-600" />
      {label ?? 'Get help'}
    </Link>
  );
}
