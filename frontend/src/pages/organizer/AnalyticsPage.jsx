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

const CONTROL = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';
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
        <div className="h-64 animate-pulse rounded-lg bg-slate-200" aria-label="Loading analytics" />
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

/** Plain secondary table for the breakdowns that do not need a chart. */
function BreakdownTable({ title, columns, rows, empty }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-sm font-medium text-slate-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="surface overflow-hidden">
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>{columns.map((c) => <th key={c} scope="col" className="px-4 py-2.5">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {row.map((cell, j) => <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'text-slate-700' : 'tabular-nums text-slate-900'}`}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Dashboard({ data, dimmed }) {
  const { summary: s, performance, charts: c } = data;
  const compared = performance.slice(-6);

  return (
    <div className={`space-y-6 transition-opacity ${dimmed ? 'opacity-60' : ''}`}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registrations" value={formatNumber(s.totalRegistrations)} icon="users" hint={`across ${s.events} event${s.events === 1 ? '' : 's'}`} />
        <StatCard label="Attendance" value={formatNumber(s.totalAttendance)} icon="check" hint={`${formatPercent(s.attendanceRate)} of approved registrations`} />
        <StatCard
          label="Feedback"
          value={s.averageFeedback === null ? '-' : `${s.averageFeedback} / 5`}
          icon="star"
          hint={`${s.feedbackResponses} response${s.feedbackResponses === 1 ? '' : 's'}`}
        />
        <StatCard label="Certificates" value={formatNumber(s.certificateCount)} icon="award" hint="issued" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Registrations"
          subtitle="Running total by sign-up date"
          empty={c.registrationTrend.length === 0}
          emptyText="No registrations yet."
          table={{ columns: ['Date', 'New that day', 'Running total'], rows: c.registrationTrend.map((p) => [formatDate(p.label), p.value, p.total]) }}
        >
          <TrendChart
            height={190}
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
          title="Attendance"
          subtitle={c.attendanceTrend.granularity === 'hour' ? `Check-ins by hour${c.attendanceTrend.day ? ` on ${formatDate(c.attendanceTrend.day)}` : ''}` : 'Check-ins by day'}
          empty={c.attendanceTrend.points.length === 0}
          emptyText="No one has checked in yet."
          table={{ columns: [c.attendanceTrend.granularity === 'hour' ? 'Hour' : 'Day', 'Check-ins'], rows: c.attendanceTrend.points.map((p) => [p.label, p.value]) }}
        >
          <ColumnChart
            height={190}
            data={c.attendanceTrend.points.map((p) => ({ ...p, axisLabel: c.attendanceTrend.granularity === 'day' ? formatDate(p.label).replace(/^\w+, /, '').replace(/ \d{4}$/, '') : p.label }))}
            unit="check-ins"
            ariaLabel={`Check-ins by ${c.attendanceTrend.granularity}`}
          />
        </ChartCard>

        <ChartCard
          title="Feedback"
          subtitle={`Overall rating of the whole event${s.feedbackResponses ? ` (${s.feedbackResponses} responses)` : ''}`}
          empty={s.feedbackResponses === 0}
          emptyText="No feedback yet."
          table={{ columns: ['Rating', 'Responses'], rows: [...c.feedbackRatings].reverse().map((d) => [`${d.rating} star${d.rating === 1 ? '' : 's'}`, d.value]) }}
        >
          <ColumnChart
            height={190}
            data={[...c.feedbackRatings].reverse().map((d) => ({ label: `${d.rating} star${d.rating === 1 ? '' : 's'}`, axisLabel: `${d.rating} star`, value: d.value }))}
            unit="responses"
            ariaLabel="Number of responses at each overall rating from one to five stars"
          />
        </ChartCard>

        <ChartCard
          title="Departments"
          subtitle="Registrations by participant department"
          empty={c.departments.length === 0}
          table={{ columns: ['Department', 'Registrations'], rows: c.departments.map((d) => [d.name, d.value]) }}
        >
          <BarList series={['Registrations']} rows={c.departments.map((d) => ({ name: d.name, values: [d.value] }))} />
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Event performance"
          subtitle={compared.length < performance.length ? `Attendance rate of the ${compared.length} most recent events` : 'Attendance rate by event'}
          empty={performance.length === 0}
          table={{
            columns: ['Event', 'Registrations', 'Attendance', 'Attendance rate', 'Engagement', 'Feedback', 'Completion'],
            rows: performance.map((p) => [
              <Link key={p.eventId} to={`/organizer/events/${p.eventId}`} className="font-medium text-slate-900 hover:text-indigo-700">{p.name}</Link>,
              `${p.registrations} / ${p.capacity}`,
              p.attendance,
              formatPercent(p.attendanceRate),
              formatPercent(p.engagement),
              p.feedbackAverage === null ? '-' : `${p.feedbackAverage} / 5`,
              formatPercent(p.completion),
            ]),
          }}
        >
          <BarList
            series={['Attendance rate']}
            rows={compared.map((p) => ({ name: p.name, values: [p.attendanceRate] }))}
            format={formatNumber}
            unit="%"
            max={100}
          />
        </ChartCard>
      </div>

      <details className="surface px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">More breakdowns</summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <BreakdownTable title="Colleges" columns={['College', 'Registrations']} rows={c.colleges.map((d) => [d.name, d.value])} empty="No registrations yet." />
          <BreakdownTable title="Event types" columns={['Type', 'Events', 'Registrations', 'Checked in']} rows={c.eventTypes.map((d) => [d.name, d.events, d.value, d.attendance])} empty="No events yet." />
          <BreakdownTable
            title="Session attendance"
            columns={['Session', 'Checked in', 'Of registered']}
            rows={c.sessionAttendance.map((d) => [d.label, d.value, formatPercent(d.percentage)])}
            empty="No sessions scheduled yet."
          />
          <section aria-label="How these numbers are calculated">
            <h3 className="mb-2 text-sm font-medium text-slate-700">How these numbers are calculated</h3>
            <dl className="space-y-2">
              {DEFINITIONS.map(([term, text]) => (
                <div key={term}><dt className="font-medium text-slate-900">{term}</dt><dd className="text-slate-600">{text}</dd></div>
              ))}
            </dl>
          </section>
        </div>
      </details>
    </div>
  );
}
