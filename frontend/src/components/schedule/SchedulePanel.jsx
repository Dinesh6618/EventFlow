import { useMemo, useState } from 'react';
import { scheduleApi } from '../../api';
import { useApi } from '../../hooks/useApi.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Icon from '../ui/Icon.jsx';
import LoadError from '../ui/LoadError.jsx';
import Modal from '../ui/Modal.jsx';
import Spinner from '../ui/Spinner.jsx';
import Tabs from '../ui/Tabs.jsx';
import Timeline from '../ui/Timeline.jsx';
import { SessionTypeBadge } from './ScheduleList.jsx';

/**
 * Participant-facing schedule as a timeline. Tabs filter by day and by kind of session;
 * the session happening right now is highlighted and marked ONGOING.
 */
export default function SchedulePanel({ eventId }) {
  const { data, error, loading, reload } = useApi((signal) => scheduleApi.list(eventId, signal), [eventId], { refreshMs: 60000 });
  const [view, setView] = useState('all');
  const [selected, setSelected] = useState(null);

  const items = data?.items ?? [];
  const days = useMemo(() => [...new Set(items.map((i) => i.date))], [items]);

  const tabs = useMemo(() => {
    const list = [{ key: 'all', label: 'All Sessions' }];
    if (days.length > 1) days.forEach((d, i) => list.push({ key: `day:${d}`, label: `Day ${i + 1}` }));
    const kinds = new Set(items.map((i) => i.sessionType));
    if (kinds.has('workshop')) list.push({ key: 'type:workshop', label: 'Workshops' });
    if (kinds.has('talk')) list.push({ key: 'type:talk', label: 'Talks' });
    if (kinds.has('break')) list.push({ key: 'type:break', label: 'Breaks' });
    return list;
  }, [days, items]);

  if (!data && loading) return <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-indigo-600" /></div>;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const { current, next } = data;
  if (items.length === 0) {
    return <EmptyState icon="calendar" title="The schedule has not been published yet" description="Check back closer to the event." />;
  }

  const active = tabs.some((t) => t.key === view) ? view : 'all';
  const shown = items.filter((i) => {
    if (active === 'all') return true;
    if (active.startsWith('day:')) return i.date === active.slice(4);
    return i.sessionType === active.slice(5);
  });
  const multiDay = days.length > 1;

  return (
    <div className="space-y-5">
      {current.map((item) => (
        <Alert key={item.id} type="success">
          <span className="font-semibold">Happening now:</span> {item.title} ({formatTimeRange(item.startTime, item.endTime)}
          {item.venue ? `, ${item.venue}` : ''})
        </Alert>
      ))}
      {next && !current.length && (
        <Alert type="info">
          <span className="font-semibold">Up next:</span> {next.title} on {formatDate(next.date)} at {formatTimeRange(next.startTime, next.endTime)}
        </Alert>
      )}

      <Tabs tabs={tabs} value={active} onChange={setView} label="Schedule view" />

      {shown.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing here" description="No sessions match this view." />
      ) : (
        <div className="space-y-6">
          {(multiDay && active === 'all' ? days : [null]).map((day) => {
            const group = day ? shown.filter((i) => i.date === day) : shown;
            const heading = day ?? (multiDay && active.startsWith('day:') ? active.slice(4) : null);
            return (
              <section key={day ?? 'all'} aria-label={heading ? formatDate(heading) : 'Sessions'}>
                {heading && <h3 className="mb-3 text-sm font-medium text-slate-500">{formatDate(heading)}</h3>}
                <Timeline items={group} onSelect={setSelected} />
              </section>
            );
          })}
        </div>
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
