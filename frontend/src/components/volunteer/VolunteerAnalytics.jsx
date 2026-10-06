import BarList from '../charts/BarList.jsx';
import ChartCard from '../charts/ChartCard.jsx';
import Card from '../ui/Card.jsx';
import StatCard from '../ui/StatCard.jsx';

const rows = (items, value = 'count') => items.map((i) => ({ name: i.label, values: [i[value]] }));
const hoursText = (h) => (h === null || h === undefined ? '-' : `${h} h`);

/** Volunteer reports for one event or the whole platform: people, attendance, hours and workload. */
export default function VolunteerAnalytics({ data, showEvents = false }) {
  const t = data.totals;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total volunteers" value={t.totalVolunteers} icon="users" tone="indigo" />
        <StatCard label="Active volunteers" value={t.activeVolunteers} icon="zap" tone="green" hint="on duty now" />
        <StatCard label="Average attendance" value={t.averageAttendance === null ? '-' : `${t.averageAttendance}%`} icon="check" tone="sky" hint="of duties that have started" />
        <StatCard label="Average volunteer hours" value={hoursText(t.averageHours)} icon="clock" tone="amber" hint={`${t.totalHours} h in total`} />
        <StatCard label="Tasks completed" value={t.tasksCompleted} icon="award" tone="green" />
        <StatCard label="Tasks pending" value={t.tasksPending} icon="inbox" tone="pink" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Volunteers by department" empty={data.departmentDistribution.length === 0} emptyText="No volunteers are assigned yet." table={{ columns: ['Department', 'Volunteers'], rows: data.departmentDistribution.map((d) => [d.label, d.count]) }}>
          <BarList rows={rows(data.departmentDistribution)} series={['Volunteers']} />
        </ChartCard>
        <ChartCard title="Check-ins by time of day" subtitle="When volunteers arrived." empty={data.attendanceByHour.length === 0} emptyText="Nobody has checked in yet." table={{ columns: ['Hour', 'Check-ins'], rows: data.attendanceByHour.map((d) => [d.label, d.count]) }}>
          <BarList rows={rows(data.attendanceByHour)} series={['Check-ins']} />
        </ChartCard>
        <ChartCard title="Tasks completed vs pending" subtitle="By department." empty={data.tasksByDepartment.length === 0} emptyText="No tasks yet." table={{ columns: ['Department', 'Completed', 'Pending'], rows: data.tasksByDepartment.map((d) => [d.label, d.completed, d.pending]) }}>
          <BarList rows={data.tasksByDepartment.map((d) => ({ name: d.label, values: [d.completed, d.pending] }))} series={['Completed', 'Pending']} />
        </ChartCard>
        <ChartCard title="Volunteer hours" subtitle="Time between check-in and check-out, top 10." empty={data.volunteerHours.length === 0} emptyText="No hours recorded yet." table={{ columns: ['Volunteer', 'Hours'], rows: data.volunteerHours.map((d) => [d.label, d.hours]) }}>
          <BarList rows={rows(data.volunteerHours, 'hours')} series={['Hours']} unit=" h" />
        </ChartCard>
        <ChartCard title="Department workload" subtitle="Hours scheduled and hours worked." empty={data.departmentWorkload.length === 0} emptyText="Nothing scheduled yet." table={{ columns: ['Department', 'Scheduled h', 'Worked h', 'Volunteers'], rows: data.departmentWorkload.map((d) => [d.label, d.scheduledHours, d.workedHours, d.volunteers]) }}>
          <BarList rows={data.departmentWorkload.map((d) => ({ name: d.label, values: [d.scheduledHours, d.workedHours] }))} series={['Scheduled', 'Worked']} unit=" h" />
        </ChartCard>
        {showEvents && data.byEvent && (
          <ChartCard title="Volunteers by event" empty={data.byEvent.length === 0} emptyText="No events yet." table={{ columns: ['Event', 'Volunteers', 'Hours'], rows: data.byEvent.map((d) => [d.label, d.volunteers, d.hours]) }}>
            <BarList rows={data.byEvent.map((d) => ({ name: d.label, values: [d.volunteers] }))} series={['Volunteers']} />
          </ChartCard>
        )}
      </div>
      {data.departmentWorkload.length === 0 && data.departmentDistribution.length === 0 && (
        <Card className="p-5 text-sm text-slate-500">Charts fill in as volunteers are assigned, check in and complete tasks.</Card>
      )}
    </div>
  );
}
