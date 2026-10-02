const TONES = {
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

export default function Badge({ tone = 'slate', children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Lifecycle badge for an event DTO. */
export function EventStatusBadge({ event }) {
  if (event.status === 'ended') return <Badge tone="slate">Ended</Badge>;
  if (event.status === 'ongoing') return <Badge tone="green">Happening now</Badge>;
  if (!event.registrationOpen) return <Badge tone="amber">Registration closed</Badge>;
  return <Badge tone="indigo">Registration open</Badge>;
}

const REGISTRATION = {
  pending: ['amber', 'Pending approval'],
  approved: ['green', 'Approved'],
  confirmed: ['green', 'Confirmed'],
  rejected: ['red', 'Rejected'],
  cancelled: ['slate', 'Cancelled'],
};

export function RegistrationStatusBadge({ status }) {
  const [tone, label] = REGISTRATION[status] || ['slate', status];
  return <Badge tone={tone}>{label}</Badge>;
}
