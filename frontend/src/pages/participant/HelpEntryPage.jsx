import { Link, Navigate } from 'react-router-dom';
import { registrationsApi } from '../../api';
import Badge from '../../components/ui/Badge.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatEventDates } from '../../utils/format.js';
import { isHelpWindow } from '../../utils/help.js';

const HOLDS_SEAT = ['pending', 'approved', 'confirmed'];

/**
 * GET HELP from anywhere. With one event on today it goes straight to that event's help screen, so
 * a student in a hurry takes a single tap. Otherwise they pick the event.
 */
export default function HelpEntryPage() {
  const { data, error, loading, reload } = useApi((signal) => registrationsApi.mine(signal));

  if (!data && loading) return <PageLoader label="Finding your events..." />;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const mine = data.registrations.filter((r) => HOLDS_SEAT.includes(r.status) && r.eventStatus !== 'ended');
  const live = mine.filter((r) => isHelpWindow({ status: r.eventStatus, date: r.eventDate, endDate: r.eventEndDate }));
  const later = mine.filter((r) => !live.includes(r));

  if (live.length === 1) return <Navigate to={`/events/${live[0].eventId}/help`} replace />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Help Center" title="Need assistance?" description="Report a problem to the event team and follow what happens next." action={<Link to="/my/help" className={buttonClasses('secondary')}>My help requests</Link>} />

      {live.length > 0 ? (
        <section aria-labelledby="live-heading">
          <h2 id="live-heading" className="mb-3 text-sm font-extrabold uppercase tracking-widest text-slate-900">Which event do you need help at?</h2>
          <ul className="space-y-3">
            {live.map((r) => (
              <li key={r.id}>
                <Link to={`/events/${r.eventId}/help`} className="block rounded-2xl focus-visible:outline-offset-4">
                  <Card hover className="flex items-center gap-4 p-5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white"><Icon name="shield" className="h-6 w-6" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-900">{r.eventName}</p>
                      <p className="text-sm text-slate-500">{formatEventDates({ date: r.eventDate, endDate: r.eventEndDate })} &middot; {r.eventVenue}</p>
                    </div>
                    <Badge tone="green">Happening today</Badge>
                    <Icon name="arrow-right" className="h-5 w-5 shrink-0 text-slate-400" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          icon="shield"
          title="Help opens on the day of your event"
          description={mine.length ? 'When one of your events is on, Get help takes you straight to its Help Center.' : 'Register for an event and the Help Center becomes available on the day it takes place.'}
          action={<Link to={mine.length ? '/my/registrations' : '/events'} className={buttonClasses('primary')}>{mine.length ? 'My events' : 'Explore events'}</Link>}
        />
      )}

      {later.length > 0 && live.length > 0 && (
        <p className="mt-8 text-sm text-slate-500">You are also registered for {later.length} other event{later.length === 1 ? '' : 's'}. Their Help Centers open on the day.</p>
      )}
    </div>
  );
}
