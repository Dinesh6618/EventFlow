import { Link } from 'react-router-dom';
import { formatDate, formatTimeRange } from '../../utils/format.js';
import Badge, { EventStatusBadge } from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';

const seats = (event) => `${event.registeredCount} / ${event.maxParticipants}`;

/** Table on wide screens, stacked cards on phones. */
export default function EventsTable({ events }) {
  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3">Event</th>
                <th scope="col" className="px-5 py-3">Date &amp; time</th>
                <th scope="col" className="px-5 py-3">Venue</th>
                <th scope="col" className="px-5 py-3">Registered</th>
                <th scope="col" className="px-5 py-3">Status</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-900">{event.name}</p>
                    <div className="mt-1"><Badge tone="indigo">{event.type}</Badge></div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                    {formatDate(event.date)}
                    <br />
                    <span className="text-xs text-slate-500">{formatTimeRange(event.startTime, event.endTime)}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{event.venue}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">{seats(event)}</td>
                  <td className="px-5 py-4"><EventStatusBadge event={event} /></td>
                  <td className="px-5 py-4 text-right">
                    <Link to={`/events/${event.id}`} className="font-medium text-indigo-600 hover:text-indigo-700">
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
                  <dd className="text-slate-700">{formatDate(event.date)}</dd>
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
                <Link to={`/events/${event.id}`} className="text-sm font-medium text-indigo-600">
                  View
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
