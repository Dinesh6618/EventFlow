import { useState } from 'react';
import { scheduleApi } from '../../api';
import { useApi } from '../../hooks/useApi.js';
import { todayISO, formatDate, formatTimeRange } from '../../utils/format.js';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Icon from '../ui/Icon.jsx';
import LoadError from '../ui/LoadError.jsx';
import Modal from '../ui/Modal.jsx';
import Spinner from '../ui/Spinner.jsx';
import ScheduleList, { SessionTypeBadge } from './ScheduleList.jsx';

/** Participant-facing schedule: what is on now, what is next, today's sessions and the full list. */
export default function SchedulePanel({ eventId }) {
  const { data, error, loading, reload } = useApi((signal) => scheduleApi.list(eventId, signal), [eventId], { refreshMs: 60000 });
  const [view, setView] = useState('full');
  const [selected, setSelected] = useState(null);

  if (!data && loading) return <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-indigo-600" /></div>;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const { items, current, next } = data;
  if (items.length === 0) {
    return <EmptyState icon="calendar" title="The schedule has not been published yet" description="Check back closer to the event." />;
  }

  const today = todayISO();
  const todays = items.filter((i) => i.date === today);
  const shown = view === 'today' ? todays : items;

  return (
    <div className="space-y-4">
      {current.map((item) => (
        <Alert key={item.id} type="success">
          <span className="font-medium">Happening now:</span> {item.title} ({formatTimeRange(item.startTime, item.endTime)}
          {item.venue ? `, ${item.venue}` : ''})
        </Alert>
      ))}
      {next && (
        <Alert type="info">
          <span className="font-medium">Up next:</span> {next.title} on {formatDate(next.date)} at {formatTimeRange(next.startTime, next.endTime)}
        </Alert>
      )}

      <div role="tablist" aria-label="Schedule view" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {[
          ['full', `Full schedule (${items.length})`],
          ['today', `Today (${todays.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing scheduled for today" description="Switch to the full schedule to see all sessions." />
      ) : (
        <ScheduleList items={shown} nextId={next?.id} onSelect={setSelected} />
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? ''} footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}>
        {selected && (
          <div className="space-y-3">
            <SessionTypeBadge type={selected.sessionType} />
            <p className="flex items-center gap-2"><Icon name="calendar" className="h-4 w-4 text-slate-400" />{formatDate(selected.date)}, {formatTimeRange(selected.startTime, selected.endTime)}</p>
            {selected.venue && <p className="flex items-center gap-2"><Icon name="pin" className="h-4 w-4 text-slate-400" />{selected.venue}</p>}
            {selected.speaker && <p className="flex items-center gap-2"><Icon name="user" className="h-4 w-4 text-slate-400" />{selected.speaker}</p>}
            <p className="whitespace-pre-line text-slate-600">{selected.description || 'No further details.'}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
