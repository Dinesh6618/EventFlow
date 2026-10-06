import { yearLabel } from '../../utils/constants.js';
import { formatDate } from '../../utils/format.js';
import { AttendanceBadge } from '../attendance/AttendanceSummary.jsx';
import { RegistrationStatusBadge } from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
import ProfileAvatar from '../ui/ProfileAvatar.jsx';

const day = (iso) => formatDate(iso.slice(0, 10));

/** Approve and reject stay one click away for pending registrations; everything else lives in the details view. */
function Decisions({ row, onDecide }) {
  if (row.status !== 'pending') return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => onDecide(row, 'approved')} aria-label={`Approve ${row.participantName}`}>Approve</Button>
      <Button size="sm" variant="ghost" onClick={() => onDecide(row, 'rejected')} aria-label={`Reject ${row.participantName}`}>Reject</Button>
    </div>
  );
}

function NameButton({ row, onView, children }) {
  return (
    <button
      type="button"
      onClick={() => onView(row)}
      aria-label={`View details for ${row.participantName}`}
      className="text-left font-medium text-slate-900 transition-colors hover:text-indigo-700"
    >
      {children}
    </button>
  );
}

// Each sortable column maps to a sort key the server understands.
const COLUMNS = [
  ['name', 'Name'],
  ['department', 'Department'],
  ['registered', 'Registration Date'],
  ['status', 'Status'],
  ['attendance', 'Attendance'],
];

function SortHeader({ id, label, sort, dir, onSort }) {
  const active = sort === id;
  return (
    <th scope="col" className="whitespace-nowrap px-4 py-3" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(id)} className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-indigo-700' : 'hover:text-slate-800'}`}>
        {label}
        <Icon name="chevron-down" className={`h-3.5 w-3.5 ${active ? (dir === 'asc' ? 'rotate-180' : '') : 'opacity-30'}`} />
      </button>
    </th>
  );
}

/** Sortable table on wide screens, stacked cards on phones. */
export default function ParticipantsTable({ rows, onView, onDecide, sort, dir, onSort }) {
  return (
    <>
      <Card className="hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                {COLUMNS.map(([id, label]) => <SortHeader key={id} id={id} label={label} sort={sort} dir={dir} onSort={onSort} />)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProfileAvatar name={row.participantName} size="sm" />
                      <div className="min-w-0">
                        <NameButton row={row} onView={onView}>{row.participantName}</NameButton>
                        <p className="max-w-64 truncate text-xs text-slate-500" title={row.email}>{row.email}</p>
                        <p className="max-w-64 truncate text-xs text-slate-400" title={row.eventName}>{row.eventName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-40 px-4 py-3 text-slate-600">{row.department || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{day(row.registeredAt)}</td>
                  <td className="px-4 py-3">
                    <RegistrationStatusBadge status={row.status} />
                    <Decisions row={row} onDecide={onDecide} />
                  </td>
                  <td className="px-4 py-3">{row.attendanceStatus ? <AttendanceBadge state={row.attendanceStatus} /> : <span className="text-slate-400">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ul className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileAvatar name={row.participantName} size="sm" />
                  <div className="min-w-0">
                    <NameButton row={row} onView={onView}>{row.participantName}</NameButton>
                    <p className="truncate text-xs text-slate-500">{row.email}</p>
                  </div>
                </div>
                <RegistrationStatusBadge status={row.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{row.eventName}</p>
              <p className="text-xs text-slate-500">{[row.department, yearLabel(row.year), row.college].filter(Boolean).join(' - ') || 'No details'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {row.attendanceStatus && <AttendanceBadge state={row.attendanceStatus} />}
                {row.teamName && <span>Team: <span className="font-medium text-slate-700">{row.teamName}</span></span>}
                <span className="font-mono text-slate-400">{row.participantCode}</span>
                <span>Registered {day(row.registeredAt)}</span>
              </div>
              <Decisions row={row} onDecide={onDecide} />
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
