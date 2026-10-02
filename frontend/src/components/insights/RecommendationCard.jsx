import { Link } from 'react-router-dom';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

const SEVERITY = {
  important: ['red', 'Needs attention'],
  suggestion: ['amber', 'Suggestion'],
  info: ['slate', 'For your information'],
};

const CATEGORY = {
  registration: 'Registration',
  attendance: 'Attendance',
  sessions: 'Sessions',
  volunteers: 'Volunteers',
  teams: 'Teams',
  schedule: 'Schedule',
  feedback: 'Feedback',
  general: 'General',
};

const DESTINATION = {
  announcements: 'Open announcements',
  attendance: 'Open attendance',
  schedule: 'Open schedule',
  teams: 'Open teams',
  judging: 'Open judging',
  feedback: 'Open feedback',
  certificates: 'Open certificates',
  staff: 'Open team and volunteers',
  scan: 'Open check-in',
};

const destinationLabel = (link) => DESTINATION[link.split('/').pop()] || 'Open event';

/** One recommendation. The organizer decides: nothing here is ever applied automatically. */
export default function RecommendationCard({ item, busy, onStatus }) {
  const [tone, severityLabel] = SEVERITY[item.severity] || SEVERITY.suggestion;
  const resolved = item.status === 'resolved';
  const isAi = item.source === 'ai';

  return (
    <Card className={`p-5 ${item.status === 'new' ? '' : 'bg-slate-50/60'}`} data-testid="recommendation">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{severityLabel}</Badge>
        <Badge tone="slate">{CATEGORY[item.category] || item.category}</Badge>
        {isAi ? (
          <Badge tone="indigo">
            <Icon name="sparkles" className="mr-1 h-3 w-3" />
            AI suggestion
          </Badge>
        ) : (
          <span className="text-xs text-slate-500">Based on your event data</span>
        )}
        {item.status === 'done' && <Badge tone="green">Marked done</Badge>}
        {item.status === 'dismissed' && <Badge tone="slate">Dismissed</Badge>}
        {resolved && <Badge tone="green">No longer applies</Badge>}
      </div>

      <h3 className={`mt-3 text-base font-semibold ${item.status === 'new' ? 'text-slate-900' : 'text-slate-600'}`}>{item.title}</h3>
      <p className="mt-1 text-sm text-slate-600">{item.message}</p>

      {!resolved && (
        <div className="mt-3 rounded-lg bg-indigo-50/70 px-3 py-2.5 text-sm text-slate-800">
          <span className="font-medium text-indigo-800">{isAi ? 'Idea: ' : 'Suggested action: '}</span>
          {item.suggestion}
        </div>
      )}

      {item.evidence?.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
          {item.evidence.map((e) => (
            <div key={e.label} className="flex gap-1.5">
              <dt className="text-slate-500">{e.label}:</dt>
              <dd className="font-medium text-slate-800">{e.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {isAi && !resolved && (
        <p className="mt-3 text-xs text-slate-500">Written by an AI model from the numbers above. Please check it makes sense for your event; nothing is changed unless you do it yourself.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.link && !resolved && (
          <Link to={item.link} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            {destinationLabel(item.link)}
          </Link>
        )}
        {item.status === 'new' && (
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onStatus(item, 'done')}>
              <Icon name="check" className="h-4 w-4" />
              Mark done
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(item, 'dismissed')}>
              Dismiss
            </Button>
          </>
        )}
        {(item.status === 'done' || item.status === 'dismissed') && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(item, 'new')}>
            Reopen
          </Button>
        )}
      </div>
    </Card>
  );
}
