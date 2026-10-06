import { useState } from 'react';
import { volunteerOpsApi } from '../../../../api';
import Badge from '../../../../components/ui/Badge.jsx';
import Button from '../../../../components/ui/Button.jsx';
import Card from '../../../../components/ui/Card.jsx';
import EmptyState from '../../../../components/ui/EmptyState.jsx';
import { Input, Select, Textarea } from '../../../../components/ui/FormField.jsx';
import LoadError from '../../../../components/ui/LoadError.jsx';
import { timeAgo } from '../../../../components/notifications/NotificationBell.jsx';
import { useApi } from '../../../../hooks/useApi.js';
import { useSaver } from '../../../../hooks/useSaver.js';
import { useEvent } from '../EventManageLayout.jsx';

const AUDIENCES = [
  { value: 'all', label: 'All volunteers' },
  { value: 'department', label: 'A department' },
  { value: 'shift', label: 'A shift' },
  { value: 'volunteer', label: 'One volunteer' },
];

/** Messages to volunteers: everyone, one department, one shift or one person. They arrive as notifications. */
export default function AnnouncementsTab() {
  const { event } = useEvent();
  const { busy, errors, save } = useSaver();
  const { data, error, loading, reload } = useApi((signal) => volunteerOpsApi.announcements(event.id, signal), [event.id]);
  const departments = useApi((signal) => volunteerOpsApi.departments(event.id, signal), [event.id]).data?.departments ?? [];
  const shifts = useApi((signal) => volunteerOpsApi.shifts(event.id, signal), [event.id]).data?.shifts ?? [];
  const people = useApi((signal) => volunteerOpsApi.volunteers(event.id, {}, signal), [event.id]).data?.volunteers ?? [];
  const [v, setV] = useState({ title: '', message: '', scope: 'all', departmentId: '', shiftId: '', userId: '' });
  const set = (key) => (e) => setV((p) => ({ ...p, [key]: e.target.value }));

  const send = async (e) => {
    e.preventDefault();
    const body = { title: v.title.trim(), message: v.message.trim(), scope: v.scope, ...(v.scope === 'department' ? { departmentId: Number(v.departmentId) } : {}), ...(v.scope === 'shift' ? { shiftId: Number(v.shiftId) } : {}), ...(v.scope === 'volunteer' ? { userId: Number(v.userId) } : {}) };
    if (await save('send', () => volunteerOpsApi.announce(event.id, body), 'Announcement sent.')) {
      setV((p) => ({ ...p, title: '', message: '' }));
      reload();
    }
  };

  const audience = (a) => (a.scope === 'all' ? 'All volunteers' : a.scope === 'department' ? a.departmentName : a.scope === 'shift' ? `${a.shiftName ?? 'Shift'}` : a.volunteerName);

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Send an announcement</h2>
        <form onSubmit={send} noValidate className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Send to" value={v.scope} onChange={set('scope')} error={errors.scope} options={AUDIENCES} />
            {v.scope === 'department' && <Select label="Department" required value={v.departmentId} onChange={set('departmentId')} error={errors.departmentId} placeholder="Choose a department" options={departments.map((d) => ({ value: d.id, label: d.name }))} />}
            {v.scope === 'shift' && <Select label="Shift" required value={v.shiftId} onChange={set('shiftId')} error={errors.shiftId} placeholder="Choose a shift" options={shifts.map((s) => ({ value: s.id, label: `${s.name} - ${s.departmentName}` }))} />}
            {v.scope === 'volunteer' && <Select label="Volunteer" required value={v.userId} onChange={set('userId')} error={errors.userId} placeholder="Choose a volunteer" options={people.map((p) => ({ value: p.userId, label: p.name }))} />}
          </div>
          <Input label="Title" required value={v.title} onChange={set('title')} error={errors.title} maxLength={120} placeholder="e.g. Report to Lab 3" />
          <Textarea label="Message" required rows={3} value={v.message} onChange={set('message')} error={errors.message} maxLength={2000} placeholder="Technical Support volunteers should report to Lab 3 by 8:45 AM." />
          <div className="flex justify-end"><Button type="submit" loading={busy === 'send'}>Send announcement</Button></div>
        </form>
      </Card>

      <section aria-labelledby="sent-heading">
        <h2 id="sent-heading" className="mb-3 text-lg font-semibold text-slate-900">Sent</h2>
        {error ? <LoadError error={error} onRetry={reload} /> : !data && loading ? <div className="h-24 animate-pulse rounded-lg bg-slate-200" /> : data.announcements.length === 0 ? (
          <EmptyState icon="message" title="Nothing sent yet" description="Announcements you send appear here and reach volunteers as notifications." />
        ) : (
          <ul className="space-y-3">
            {data.announcements.map((a) => (
              <li key={a.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">{a.title}</h3>
                    <span className="flex items-center gap-2 text-xs text-slate-400"><Badge tone="indigo">{audience(a)}</Badge>{a.recipients} recipient{a.recipients === 1 ? '' : 's'} - {timeAgo(a.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">{a.message}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
