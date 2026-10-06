import { useState } from 'react';
import { volunteerOpsApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate } from '../../utils/format.js';
import { shiftText } from '../../utils/volunteer.js';
import { PriorityBadge } from '../help/HelpBadges.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
import { TaskStatusBadge } from './VolunteerBadges.jsx';

/** A task the organizer gave this volunteer: accept it, start it, finish it. */
export default function TaskCard({ task: t, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const c = t.capabilities;

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5" data-testid="task">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
          <p className="text-sm text-slate-500">{t.eventName} - {t.department.name}</p>
        </div>
        <div className="flex items-center gap-1.5"><PriorityBadge priority={t.priority} /><TaskStatusBadge status={t.status} /></div>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5"><Icon name="clock" className="h-4 w-4 text-slate-400" />{formatDate(t.date)}, {shiftText(t.startTime, t.endTime)}</span>
        {t.location && <span className="inline-flex items-center gap-1.5"><Icon name="pin" className="h-4 w-4 text-slate-400" />{t.location}</span>}
      </p>
      {t.description && <p className="mt-2 text-sm text-slate-700">{t.description}</p>}
      {t.instructions && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3.5">
          <p className="text-sm font-medium text-slate-500">Instructions</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{t.instructions}</p>
        </div>
      )}
      {(c.canAccept || c.canStart || c.canComplete) && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {c.canAccept && <Button loading={busy === 'accept'} onClick={() => act('accept', () => volunteerOpsApi.acceptTask(t.id), 'Task accepted.')}>Accept task</Button>}
          {c.canStart && <Button loading={busy === 'start'} onClick={() => act('start', () => volunteerOpsApi.startTask(t.id), 'Task started.')}>Start task</Button>}
          {c.canComplete && <Button loading={busy === 'done'} onClick={() => act('done', () => volunteerOpsApi.completeTask(t.id), 'Task completed. Well done!')}>Complete task</Button>}
        </div>
      )}
    </Card>
  );
}
