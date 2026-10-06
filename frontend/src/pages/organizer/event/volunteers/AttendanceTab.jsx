import { useState } from 'react';
import { volunteerOpsApi } from '../../../../api';
import { AttendanceStateBadge, DutyStatusBadge, LateBadge } from '../../../../components/volunteer/VolunteerBadges.jsx';
import Button from '../../../../components/ui/Button.jsx';
import Card from '../../../../components/ui/Card.jsx';
import EmptyState from '../../../../components/ui/EmptyState.jsx';
import { Input } from '../../../../components/ui/FormField.jsx';
import LoadError from '../../../../components/ui/LoadError.jsx';
import StatCard from '../../../../components/ui/StatCard.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import { useApi } from '../../../../hooks/useApi.js';
import { todayISO } from '../../../../utils/format.js';
import { clockTime } from '../../../../utils/help.js';
import { minutesText, shiftText } from '../../../../utils/volunteer.js';
import { useEvent } from '../EventManageLayout.jsx';

/** Who is on duty, who is late, who has not shown up. The organizer can check someone in by hand. */
export default function AttendanceTab() {
  const { event } = useEvent();
  const toast = useToast();
  const today = todayISO();
  const [date, setDate] = useState(today >= event.date && today <= (event.endDate || event.date) ? today : event.date);
  const { data, error, loading, reload } = useApi((signal) => volunteerOpsApi.attendance(event.id, date, signal), [event.id, date], { refreshMs: 10000 });
  const [busy, setBusy] = useState(null);

  const act = async (row, kind) => {
    setBusy(`${kind}-${row.id}`);
    try {
      await (kind === 'in' ? volunteerOpsApi.checkIn(row.id) : volunteerOpsApi.checkOut(row.id));
      toast.success(`${row.volunteer.name} ${kind === 'in' ? 'checked in' : 'checked out'}.`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-44"><Input label="Day" type="date" min={event.date} max={event.endDate} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        <p className="text-xs text-slate-500">Updates every 10 seconds.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total volunteers" value={s?.total} icon="users" tone="indigo" loading={!s} hint="on duty this day" />
        <StatCard label="Checked in" value={s?.checkedIn} icon="check" tone="green" loading={!s} />
        <StatCard label="Late" value={s?.late} icon="clock" tone="amber" loading={!s} />
        <StatCard label="Absent" value={s?.absent} icon="alert" tone="pink" loading={!s} hint="shift ended, no check-in" />
        <StatCard label="Not checked in" value={s?.notCheckedIn} icon="user" tone="sky" loading={!s} />
      </div>

      {!data && loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-label="Loading attendance" />
      ) : data.rows.length === 0 ? (
        <EmptyState icon="qr" title="Nobody is on duty this day" description="Assign volunteers to a shift on this day and their attendance appears here." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th scope="col" className="px-4 py-3">Volunteer</th><th scope="col" className="px-4 py-3">Department</th><th scope="col" className="px-4 py-3">Shift</th><th scope="col" className="hidden px-4 py-3 lg:table-cell">Check in</th><th scope="col" className="hidden px-4 py-3 lg:table-cell">Check out</th><th scope="col" className="hidden px-4 py-3 md:table-cell">Duration</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{r.volunteer.name}</td>
                    <td className="px-4 py-3">{r.department.name}{r.location && <span className="block text-xs text-slate-400">{r.location}</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{shiftText(r.startTime, r.endTime)}</td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{r.checkInTime ? clockTime(r.checkInTime) : '-'}</td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{r.checkOutTime ? clockTime(r.checkOutTime) : '-'}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{minutesText(r.minutes)}</td>
                    <td className="whitespace-nowrap px-4 py-3"><AttendanceStateBadge status={r.attendance} /> <LateBadge late={r.late} /> {r.liveStatus === 'on_break' && <DutyStatusBadge status="on_break" />}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {r.capabilities.canCheckIn && <Button size="sm" variant="secondary" loading={busy === `in-${r.id}`} onClick={() => act(r, 'in')}>Check in</Button>}
                      {r.capabilities.canCheckOut && <Button size="sm" variant="secondary" loading={busy === `out-${r.id}`} onClick={() => act(r, 'out')}>Check out</Button>}
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
