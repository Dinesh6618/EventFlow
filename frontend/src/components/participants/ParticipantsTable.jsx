import { formatDate } from '../../utils/format.js';
import { RegistrationStatusBadge } from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

const day = (iso) => formatDate(iso.slice(0, 10));

function Actions({ row, onView, onDecide }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {row.status === 'pending' && (
        <>
          <Button size="sm" onClick={() => onDecide(row, 'approved')}>Approve</Button>
          <Button size="sm" variant="secondary" onClick={() => onDecide(row, 'rejected')}>Reject</Button>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={() => onView(row)} aria-label={`View details for ${row.participantName}`}>
        Details
      </Button>
    </div>
  );
}

/** Table on wide screens, stacked cards on phones. */
export default function ParticipantsTable({ rows, onView, onDecide }) {
  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3">Participant</th>
                <th scope="col" className="px-5 py-3">Department / College</th>
                <th scope="col" className="px-5 py-3">Event</th>
                <th scope="col" className="px-5 py-3">Status</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-900">{row.participantName}</p>
                    <p className="text-xs text-slate-500">{row.email}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">{row.participantCode}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {row.department || '-'}
                    <br />
                    <span className="text-xs text-slate-500">{row.college || '-'}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {row.eventName}
                    <br />
                    <span className="text-xs text-slate-500">Registered {day(row.registeredAt)}</span>
                  </td>
                  <td className="px-5 py-4"><RegistrationStatusBadge status={row.status} /></td>
                  <td className="px-5 py-4"><Actions row={row} onView={onView} onDecide={onDecide} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{row.participantName}</p>
                  <p className="truncate text-xs text-slate-500">{row.email}</p>
                </div>
                <RegistrationStatusBadge status={row.status} />
              </div>
              <p className="mt-2 text-sm text-slate-600">{row.eventName}</p>
              <p className="text-xs text-slate-500">{[row.department, row.college].filter(Boolean).join(' - ') || 'No department or college'}</p>
              <p className="mt-0.5 font-mono text-xs text-slate-400">{row.participantCode}</p>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <Actions row={row} onView={onView} onDecide={onDecide} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
