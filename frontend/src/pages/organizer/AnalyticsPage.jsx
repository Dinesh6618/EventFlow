import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { analyticsApi, eventsApi } from '../../api';
import BarList from '../../components/charts/BarList.jsx';
import ChartCard from '../../components/charts/ChartCard.jsx';
import ColumnChart from '../../components/charts/ColumnChart.jsx';
import TrendChart from '../../components/charts/TrendChart.jsx';
import { formatNumber, formatPercent } from '../../components/charts/core.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { EVENT_TYPES } from '../../utils/constants.js';
import { formatDate, todayISO } from '../../utils/format.js';

const CONTROL = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';
const PRESETS = [['all', 'All time'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['custom', 'Custom range']];

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Filter({ label, id, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const DEFINITIONS = [
  ['Registrations', 'Pending, approved and confirmed registrations. Cancelled and rejected ones are not counted.'],
  ['Attendance rate', 'People who checked in, out of approved and confirmed registrations.'],
  ['Registration conversion', 'Of the people who opened an event page, the share who registered.'],
  ['Engagement', 'Share of registrations who did more than turn up: scanned into a session, joined a team, or sent feedback.'],
  ['Completion', 'Share of approved and confirmed registrations holding a participation, winner, runner-up or finalist certificate.'],
  ['Average feedback', 'Mean overall rating (1-5) of whole-event feedback, weighted by the number of responses.'],
];

export default function AnalyticsPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [eventId, setEventId] = useState(searchParams.get('eventId') || '');
  const [type, setType] = useState('');
  const [preset, setPreset] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => {
    if (preset === '30' || preset === '90') return { from: daysAgo(Number(preset)), to: todayISO() };
    if (preset === 'custom') return { from: custom.from, to: custom.to };
    return { from: '', to: '' };
  }, [preset, custom]);
  const filters = { eventId, type, ...range };

  const myEvents = useApi((signal) => eventsApi.mine(signal));
  const { data, error, loading, reload } = useApi((signal) => analyticsApi.get(filters, signal), [eventId, type, range.from, range.to], { refreshMs: 60000 });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await analyticsApi.exportCsv(filters);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const invalidRange = preset === 'custom' && custom.from && custom.to && custom.from > custom.to;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How your events are performing, from real registrations, check-ins, teams and feedback."
        action={<Button variant="secondary" onClick={exportCsv} loading={exporting} disabled={!data?.performance.length}>Export CSV</Button>}
      />

      {/* One row of filters above everything they scope. */}
      <Card className="mb-6 p-4">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
          <Filter label="Event" id="an-event">
            <select id="an-event" value={eventId} onChange={(e) => setEventId(e.target.value)} className={CONTROL}>
              <option value="">All events</option>
              {myEvents.data?.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </Filter>
          <Filter label="Event type" id="an-type">
            <select id="an-type" value={type} onChange={(e) => setType(e.target.value)} className={CONTROL}>
              <option value="">All types</option>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Filter>
          <Filter label="Events starting" id="an-range">
            <select id="an-range" value={preset} onChange={(e) => setPreset(e.target.value)} className={CONTROL}>
              {PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Filter>
          {preset === 'custom' ? (
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
              <Filter label="From" id="an-from"><input id="an-from" type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className={CONTROL} /></Filter>
              <Filter label="To" id="an-to"><input id="an-to" type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className={CONTROL} /></Filter>
            </div>
          ) : <span className="hidden lg:block" />}
          <Button variant="ghost" onClick={() => { setEventId(''); setType(''); setPreset('all'); setCustom({ from: '', to: '' }); }} disabled={!eventId && !type && preset === 'all'}>Reset</Button>
        </form>
        {invalidRange && <p role="alert" className="mt-2 text-xs font-medium text-red-600">The end date is before the start date.</p>}
      </Card>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-200" aria-label="Loading analytics" />
      ) : data.summary.events === 0 ? (
        <EmptyState
          icon="dashboard"
          title="No events match these filters"
          description={eventId || type || preset !== 'all' ? 'Try widening the filters.' : 'Create an event and the numbers will appear here as people register and attend.'}
          action={<Link to="/organizer/create-event" className={buttonClasses('primary')}>Create event</Link>}
        />
      ) : (
        <Dashboard data={data} dimmed={loading} />
      )}
    </>
  );
}

function Dashboard({ data, dimmed }) {
  const { summary: s, performance, charts: c } = data;
  const multi = performance.length > 1;
  const compared = performance.slice(-6);

  return (
    <div className={`space-y-6 transition-opacity ${dimmed ? 'opacity-60' : ''}`}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total registrations" value={formatNumber(s.totalRegistrations)} icon="users" tone="indigo" />
        <StatCard label="Total attendance" value={formatNumber(s.totalAttendance)} icon="check" tone="green" />
        <StatCard label="Attendance rate" value={formatPercent(s.attendanceRate)} icon="dashboard" tone="sky" />
        <StatCard label="Registration conversion" value={formatPercent(s.registrationConversion)} icon="clock" tone="amber" />
        <StatCard label="Teams formed" value={formatNumber(s.teamCount)} icon="users" tone="indigo" />
        <StatCard label="Average feedback" value={s.averageFeedback === null ? '-' : `${s.averageFeedback} / 5`} icon="star" tone="amber" />
        <StatCard label="Certificates issued" value={formatNumber(s.certificateCount)} icon="check" tone="green" />
        <StatCard label="Events in view" value={formatNumber(s.events)} icon="calendar" tone="sky" />
      </div>

      <details className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">How these numbers are calculated</summary>
        <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {DEFINITIONS.map(([term, text]) => (
            <div key={term}><dt className="font-medium text-slate-900">{term}</dt><dd className="text-slate-600">{text}</dd></div>
          ))}
        </dl>
      </details>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Registration trend"
          subtitle="Running total of registrations by sign-up date"
          empty={c.registrationTrend.length === 0}
          emptyText="No registrations yet."
          table={{ columns: ['Date', 'New that day', 'Running total'], rows: c.registrationTrend.map((p) => [formatDate(p.label), p.value, p.total]) }}
        >
          <TrendChart
            points={c.registrationTrend.map((p) => ({ label: p.label, value: p.total, extra: p.value }))}
            valueName="Registrations so far"
            extraName="New that day"
            ariaLabel={`Registrations over time, reaching ${s.totalRegistrations}`}
          />
          {c.registrationTrend.length === 1 && (
            <p className="mt-2 text-xs text-slate-500">All {c.registrationTrend[0].total} registrations came in on {formatDate(c.registrationTrend[0].label)}, so there is no trend line yet.</p>
          )}
        </ChartCard>

        <ChartCard
          title="Attendance trend"
          subtitle={c.attendanceTrend.granularity === 'hour' ? `Check-ins by hour${c.attendanceTrend.day ? ` on ${formatDate(c.attendanceTrend.day)}` : ''}` : 'Check-ins by day'}
          empty={c.attendanceTrend.points.length === 0}
          emptyText="No one has checked in yet."
          table={{ columns: [c.attendanceTrend.granularity === 'hour' ? 'Hour' : 'Day', 'Check-ins'], rows: c.attendanceTrend.points.map((p) => [p.label, p.value]) }}
        >
          <ColumnChart
            data={c.attendanceTrend.points.map((p) => ({ ...p, axisLabel: c.attendanceTrend.granularity === 'day' ? formatDate(p.label).replace(/^\w+, /, '').replace(/ \d{4}$/, '') : p.label }))}
            unit="check-ins"
            ariaLabel={`Check-ins by ${c.attendanceTrend.granularity}`}
          />
        </ChartCard>

        <ChartCard
          title="Department distribution"
          subtitle="Registrations by participant department"
          empty={c.departments.length === 0}
          table={{ columns: ['Department', 'Registrations'], rows: c.departments.map((d) => [d.name, d.value]) }}
        >
          <BarList series={['Registrations']} rows={c.departments.map((d) => ({ name: d.name, values: [d.value] }))} />
        </ChartCard>

        <ChartCard
          title="College distribution"
          subtitle="Registrations by participant college"
          empty={c.colleges.length === 0}
          table={{ columns: ['College', 'Registrations'], rows: c.colleges.map((d) => [d.name, d.value]) }}
        >
          <BarList series={['Registrations']} rows={c.colleges.map((d) => ({ name: d.name, values: [d.value] }))} />
        </ChartCard>

        <ChartCard
          title="Event type distribution"
          subtitle="Registrations and check-ins by type of event"
          empty={c.eventTypes.length === 0}
          table={{ columns: ['Type', 'Events', 'Registrations', 'Checked in'], rows: c.eventTypes.map((d) => [d.name, d.events, d.value, d.attendance]) }}
        >
          <BarList series={['Registrations', 'Checked in']} rows={c.eventTypes.map((d) => ({ name: `${d.name} (${d.events})`, values: [d.value, d.attendance] }))} />
        </ChartCard>

        <ChartCard
          title="Session attendance"
          subtitle="People scanned into each session"
          empty={c.sessionAttendance.every((d) => d.value === 0)}
          emptyText={c.sessionAttendance.length === 0 ? 'No sessions scheduled yet.' : 'Nobody has been scanned into a session yet. Pick a session in the check-in scanner to record it.'}
          table={{ columns: ['Session', 'Checked in', 'Of registered'], rows: c.sessionAttendance.map((d) => [d.label, d.value, formatPercent(d.percentage)]) }}
        >
          <BarList series={['Checked in']} rows={c.sessionAttendance.map((d) => ({ name: d.label, values: [d.value] }))} />
        </ChartCard>

        <ChartCard
          title="Feedback ratings"
          subtitle={`Overall rating of the whole event${s.feedbackResponses ? ` (${s.feedbackResponses} responses)` : ''}`}
          empty={s.feedbackResponses === 0}
          emptyText="No feedback yet."
          table={{ columns: ['Rating', 'Responses'], rows: [...c.feedbackRatings].reverse().map((d) => [`${d.rating} star${d.rating === 1 ? '' : 's'}`, d.value]) }}
        >
          <ColumnChart
            data={[...c.feedbackRatings].reverse().map((d) => ({ label: `${d.rating} star${d.rating === 1 ? '' : 's'}`, axisLabel: `${d.rating}★`, value: d.value }))}
            unit="responses"
            ariaLabel="Number of responses at each overall rating from one to five stars"
          />
        </ChartCard>

        <ChartCard
          title="Event comparison"
          subtitle={compared.length < performance.length ? `The ${compared.length} most recent events, as a share of registrations` : 'As a share of registrations'}
          empty={performance.length === 0}
          table={{ columns: ['Event', 'Attendance rate', 'Engagement', 'Completion'], rows: performance.map((p) => [p.name, formatPercent(p.attendanceRate), formatPercent(p.engagement), formatPercent(p.completion)]) }}
        >
          <BarList
            series={['Attendance rate', 'Engagement', 'Completion']}
            rows={compared.map((p) => ({ name: p.name, values: [p.attendanceRate, p.engagement, p.completion] }))}
            format={formatNumber}
            unit="%"
            max={100}
          />
        </ChartCard>
      </div>

      <section aria-label="Event performance">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Event performance{multi ? ' (compare events)' : ''}</h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Event</th>
                  <th scope="col" className="px-4 py-3">Registrations</th>
                  <th scope="col" className="px-4 py-3">Attendance</th>
                  <th scope="col" className="px-4 py-3">Engagement</th>
                  <th scope="col" className="px-4 py-3">Feedback</th>
                  <th scope="col" className="px-4 py-3">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {performance.map((p) => (
                  <tr key={p.eventId}>
                    <td className="px-4 py-3"><Link to={`/organizer/events/${p.eventId}`} className="font-medium text-slate-900 hover:text-indigo-700">{p.name}</Link><p className="text-xs text-slate-500">{p.type} - {formatDate(p.date)}</p></td>
                    <td className="px-4 py-3 tabular-nums">{p.registrations} <span className="text-xs text-slate-400">/ {p.capacity} ({formatPercent(p.fillRate)})</span></td>
                    <td className="px-4 py-3 tabular-nums">{p.attendance} <span className="text-xs text-slate-400">({formatPercent(p.attendanceRate)})</span></td>
                    <td className="px-4 py-3 tabular-nums">{formatPercent(p.engagement)}</td>
                    <td className="px-4 py-3 tabular-nums">{p.feedbackAverage === null ? '-' : `${p.feedbackAverage} / 5`} <span className="text-xs text-slate-400">({p.feedbackResponses})</span></td>
                    <td className="px-4 py-3 tabular-nums">{formatPercent(p.completion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
