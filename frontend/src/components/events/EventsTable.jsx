import { Link } from 'react-router-dom';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
import Badge, { EventStatusBadge } from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';

const seats = (event) => `${event.registeredCount} / ${event.maxParticipants}`;

/** Table on wide screens, stacked cards on phones. */
export default function EventsTable({ events, manage = false }) {
  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Event</th>
                <th scope="col" className="px-4 py-3">Date &amp; time</th>
                <th scope="col" className="px-4 py-3">Venue</th>
                <th scope="col" className="px-4 py-3">Registered</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{event.name}</p>
                    <div className="mt-1"><Badge tone="indigo">{event.type}</Badge></div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatEventDates(event)}
                    <br />
                    <span className="text-xs text-slate-500">{formatTimeRange(event.startTime, event.endTime)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{event.venue}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{seats(event)}</td>
                  <td className="px-4 py-3"><EventStatusBadge event={event} /></td>
                  <td className="space-x-4 whitespace-nowrap px-4 py-3 text-right">
                    {manage && (
                      <Link to={`/organizer/events/${event.id}`} className="font-medium text-indigo-600 hover:text-indigo-700">
                        Manage
                      </Link>
                    )}
                    <Link to={`/events/${event.id}`} className="font-medium text-slate-600 hover:text-slate-900">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ul className="space-y-3 md:hidden">
        {events.map((event) => (
          <li key={event.id}>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900">{event.name}</p>
                <Badge tone="indigo">{event.type}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Date</dt>
                  <dd className="text-slate-700">{formatEventDates(event)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Time</dt>
                  <dd className="text-slate-700">{formatTimeRange(event.startTime, event.endTime)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Venue</dt>
                  <dd className="text-slate-700">{event.venue}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Registered</dt>
                  <dd className="text-slate-700">{seats(event)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-between">
                <EventStatusBadge event={event} />
                <span className="space-x-4">
                  {manage && (
                    <Link to={`/organizer/events/${event.id}`} className="text-sm font-medium text-indigo-600">
                      Manage
                    </Link>
                  )}
                  <Link to={`/events/${event.id}`} className="text-sm font-medium text-slate-600">
                    View
                  </Link>
                </span>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
