import { yearLabel } from '../../utils/constants.js';
import { formatDate } from '../../utils/format.js';
import { AttendanceBadge } from '../attendance/AttendanceSummary.jsx';
import { RegistrationStatusBadge } from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
import ProfileAvatar from '../ui/ProfileAvatar.jsx';

const day = (iso) => formatDate(iso.slice(0, 10));

function Actions({ row, onView, onDecide, stacked = false }) {
  return (
    <div className={stacked ? 'flex w-24 flex-col items-stretch gap-1.5' : 'flex flex-wrap items-center justify-end gap-2'}>
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

const COLUMNS = [
  ['name', 'Name'],
  ['college', 'College'],
  ['department', 'Department'],
  ['year', 'Year'],
  ['status', 'Registration'],
  ['attendance', 'Attendance'],
  ['team', 'Team'],
];

function SortHeader({ id, label, sort, dir, onSort }) {
  const active = sort === id;
  return (
    <th scope="col" className="whitespace-nowrap px-3 py-3" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(id)} className={`inline-flex items-center gap-1 uppercase tracking-wide ${active ? 'text-indigo-700' : 'hover:text-slate-800'}`}>
        {label}
        <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${active ? (dir === 'asc' ? 'rotate-180' : '') : 'opacity-30'}`} />
      </button>
    </th>
  );
}

/** Sortable table on wide screens, stacked cards on phones. */
export default function ParticipantsTable({ rows, onView, onDecide, sort, dir, onSort }) {
  return (
    <>
      <Card className="hidden overflow-hidden xl:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                {COLUMNS.map(([id, label]) => <SortHeader key={id} id={id} label={label} sort={sort} dir={dir} onSort={onSort} />)}
                <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-indigo-50/30">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <ProfileAvatar name={row.participantName} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{row.participantName}</p>
                        <p className="max-w-[13rem] truncate text-xs text-slate-500" title={row.email}>{row.email}</p>
                        <p className="max-w-[13rem] truncate text-xs font-medium text-indigo-600" title={row.eventName}>{row.eventName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[9rem] px-3 py-3 text-slate-600">{row.college || '-'}</td>
                  <td className="max-w-[8rem] px-3 py-3 text-slate-600">{row.department || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{yearLabel(row.year) || '-'}</td>
                  <td className="px-3 py-3"><RegistrationStatusBadge status={row.status} /></td>
                  <td className="px-3 py-3">{row.attendanceStatus ? <AttendanceBadge state={row.attendanceStatus} /> : <span className="text-slate-400">-</span>}</td>
                  <td className="max-w-[7rem] px-3 py-3 text-slate-600">{row.teamName || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-3"><Actions row={row} onView={onView} onDecide={onDecide} stacked /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ul className="space-y-3 xl:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileAvatar name={row.participantName} size="sm" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{row.participantName}</p>
                    <p className="truncate text-xs text-slate-500">{row.email}</p>
                  </div>
                </div>
                <RegistrationStatusBadge status={row.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{row.eventName}</p>
              <p className="text-xs text-slate-500">{[row.department, yearLabel(row.year), row.college].filter(Boolean).join(' - ') || 'No details'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {row.attendanceStatus && <AttendanceBadge state={row.attendanceStatus} />}
                {row.teamName && <span>Team: <span className="font-semibold text-slate-700">{row.teamName}</span></span>}
                <span className="font-mono text-slate-400">{row.participantCode}</span>
                <span>Registered {day(row.registeredAt)}</span>
              </div>
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
