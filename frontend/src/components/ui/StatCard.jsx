import Card from './Card.jsx';
import Icon from './Icon.jsx';

const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
  pink: 'bg-pink-50 text-pink-600',
};

export default function StatCard({ label, value, icon, tone = 'indigo', loading = false, hint }) {
  return (
    <Card hover className="flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${TONES[tone]}`}>
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm leading-tight text-slate-500">{label}</p>
        {loading ? (
          <div className="mt-1 h-8 w-12 animate-pulse rounded bg-slate-200" aria-label="Loading" />
        ) : (
          <p className="text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
        )}
        {hint && !loading && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </Card>
  );
}
