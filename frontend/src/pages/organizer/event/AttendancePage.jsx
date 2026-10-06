import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, attendanceApi } from '../../../api';
import { AttendanceBadge } from '../../../components/attendance/AttendanceSummary.jsx';
import AttendanceSummary from '../../../components/attendance/AttendanceSummary.jsx';
import Button, { buttonClasses } from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi, useDebounced } from '../../../hooks/useApi.js';

const STATES = [
  ['', 'All'],
  ['registered', 'Registered'],
  ['checked_in', 'Checked in'],
  ['checked_out', 'Checked out'],
  ['absent', 'Absent'],
];
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '-');

export default function AttendancePage() {
  const { eventId } = useParams();
  const toast = useToast();
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [busyId, setBusyId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const { data, error, loading, reload } = useApi(
    (signal) => attendanceApi.dashboard(eventId, { q, state }, signal),
    [eventId, q, state],
    { refreshMs: 15000 },
  );

  const mark = async (attendee, action) => {
    setBusyId(attendee.registrationId);
    try {
      await attendanceApi.mark(eventId, attendee.registrationId, action);
      toast.success(`${attendee.name} ${action === 'check_in' ? 'checked in' : 'checked out'}.`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update attendance.');
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await attendanceApi.exportCsv(eventId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  const attendees = data?.attendees ?? [];

  return (
    <div className="space-y-6">
      <AttendanceSummary summary={data?.summary} loading={!data && loading} />

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
            {STATES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={state === value}
                onClick={() => setState(value)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${state === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <label htmlFor="att-search" className="sr-only">Search attendees</label>
              <input
                id="att-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or ID"
                className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 sm:w-64"
              />
            </div>
            <Link to="../scan" relative="path" className={buttonClasses('primary')}>
              <Icon name="qr" className="h-4 w-4" />
              Scan QR
            </Link>
            <Button variant="secondary" onClick={exportCsv} loading={exporting} disabled={!data?.summary.totalRegistered}>
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      {!data && loading ? null : attendees.length === 0 ? (
        <EmptyState
          icon="users"
          title={state || q ? 'No attendees match' : 'No attendees yet'}
          description={state || q ? 'Try a different filter.' : 'Approved and confirmed participants will appear here.'}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">Participant</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="hidden px-5 py-3 sm:table-cell">In</th>
                  <th scope="col" className="hidden px-5 py-3 sm:table-cell">Out</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendees.map((a) => (
                  <tr key={a.registrationId}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{a.name}</p>
                      <p className="font-mono text-xs text-slate-400">{a.participantCode}</p>
                    </td>
                    <td className="px-5 py-3"><AttendanceBadge state={a.state} /></td>
                    <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">{time(a.checkInTime)}</td>
                    <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">{time(a.checkOutTime)}</td>
                    <td className="px-5 py-3 text-right">
                      {a.state === 'registered' && (
                        <Button size="sm" variant="secondary" loading={busyId === a.registrationId} onClick={() => mark(a, 'check_in')}>
                          Check in
                        </Button>
                      )}
                      {a.state === 'checked_in' && (
                        <Button size="sm" variant="secondary" loading={busyId === a.registrationId} onClick={() => mark(a, 'check_out')}>
                          Check out
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
