import BarList from '../charts/BarList.jsx';
import ChartCard from '../charts/ChartCard.jsx';
import Card from '../ui/Card.jsx';
import StatCard from '../ui/StatCard.jsx';
import { PRIORITY_META, durationText } from '../../utils/help.js';

const toRows = (items) => items.map((i) => ({ name: i.label, values: [i.count] }));
const percentText = (v) => `${v}`;

/** Where requests come from and how fast the team answers. Used by the organizer tab and the admin page. */
export default function HelpAnalytics({ data, showEvents = false, stats = true }) {
  const { summary: s } = data;
  const table = (title, items) => ({ columns: [title, 'Requests', 'Share'], rows: items.map((i) => [i.label, i.count, i.percent !== undefined ? `${i.percent}%` : '']) });

  return (
    <div className="space-y-6">
      {stats && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total requests" value={s.total} icon="inbox" tone="indigo" />
        <StatCard label="Average response time" value={durationText(data.averageResponseMinutes)} icon="clock" tone="indigo" hint="until acknowledged" />
        <StatCard label="Average resolution time" value={durationText(data.averageResolutionMinutes)} icon="check" tone="green" hint="until resolved" />
        <StatCard label="Escalated now" value={s.escalated} icon="alert" tone="amber" />
      </div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Requests by category" subtitle="Share of all requests." empty={data.byCategory.length === 0} emptyText="No requests yet." table={table('Category', data.byCategory)}>
          <BarList rows={data.byCategory.map((c) => ({ name: c.label, values: [c.percent] }))} series={['Share of requests']} unit="%" format={percentText} />
        </ChartCard>
        <ChartCard title="Requests by venue" subtitle="Where people asked for help." empty={data.byLocation.length === 0} emptyText="No requests yet." table={table('Location', data.byLocation)}>
          <BarList rows={toRows(data.byLocation)} series={['Requests']} />
        </ChartCard>
        <ChartCard title="Requests by priority" empty={s.total === 0} emptyText="No requests yet." table={{ columns: ['Priority', 'Requests'], rows: data.byPriority.map((p) => [PRIORITY_META[p.label].label, p.count]) }}>
          <BarList rows={data.byPriority.map((p) => ({ name: PRIORITY_META[p.label].label, values: [p.count] }))} series={['Requests']} />
        </ChartCard>
        {showEvents && data.byEvent && (
          <ChartCard title="Requests by event" empty={data.byEvent.length === 0} emptyText="No requests yet." table={{ columns: ['Event', 'Requests'], rows: data.byEvent.map((e) => [e.label, e.count]) }}>
            <BarList rows={toRows(data.byEvent)} series={['Requests']} />
          </ChartCard>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h3 className="text-base font-semibold text-slate-900">Volunteer workload</h3>
          <p className="text-sm text-slate-500">Requests each volunteer has been handed.</p>
        </div>
        {data.volunteerWorkload.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No requests have been assigned yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr><th scope="col" className="px-5 py-3">Volunteer</th><th scope="col" className="px-5 py-3">Assigned</th><th scope="col" className="px-5 py-3">Open</th><th scope="col" className="px-5 py-3">Resolved</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.volunteerWorkload.map((v) => (
                  <tr key={v.userId} className="hover:bg-slate-50"><td className="px-5 py-3 font-medium text-slate-900">{v.name}</td><td className="px-5 py-3">{v.assigned}</td><td className="px-5 py-3">{v.open}</td><td className="px-5 py-3">{v.resolved}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
