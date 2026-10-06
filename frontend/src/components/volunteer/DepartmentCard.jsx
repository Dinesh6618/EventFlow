import Badge from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';

const TONE = { complete: 'green', needed: 'amber', over: 'indigo' };

/** One department: how many volunteers it has against how many it needs. */
export default function DepartmentCard({ department: d, children }) {
  const percent = d.requiredCount ? Math.min(Math.round((d.assigned / d.requiredCount) * 100), 100) : 100;
  const label = d.status === 'complete' ? 'Complete' : d.status === 'over' ? `${d.assigned - d.requiredCount} extra` : `${d.needed} needed`;
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{d.name}</h3>
        <Badge tone={TONE[d.status] ?? 'slate'}>{label}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-600"><span className="text-xl font-semibold text-slate-900">{d.assigned}</span> / {d.requiredCount} assigned</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${d.name} staffing`}>
        <div className={`h-full rounded-full ${d.status === 'needed' ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${percent}%` }} />
      </div>
      {(d.checkedIn !== undefined || d.openTasks !== undefined) && (
        <p className="mt-3 text-xs text-slate-500">
          {d.checkedIn !== undefined && `${d.checkedIn} checked in today`}
          {d.checkedIn !== undefined && d.openTasks !== undefined && ' - '}
          {d.openTasks !== undefined && `${d.openTasks} open task${d.openTasks === 1 ? '' : 's'}`}
        </p>
      )}
      {children}
    </Card>
  );
}
