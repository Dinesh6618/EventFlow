import Card from './Card.jsx';
import Icon from './Icon.jsx';

// One accent for every card. Green and amber stay available for stats that mean "good" or "needs attention".
const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  sky: 'bg-indigo-50 text-indigo-600',
  pink: 'bg-indigo-50 text-indigo-600',
};

export default function StatCard({ label, value, icon, tone = 'indigo', loading = false, hint }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm leading-tight text-slate-500">{label}</p>
        {loading ? (
          <div className="mt-1 h-7 w-12 animate-pulse rounded bg-slate-200" aria-label="Loading" />
        ) : (
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
        )}
        {hint && !loading && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </Card>
  );
}
