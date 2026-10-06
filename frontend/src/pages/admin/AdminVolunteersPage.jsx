import { useState } from 'react';
import { adminVolunteerApi } from '../../api';
import VolunteerAnalytics from '../../components/volunteer/VolunteerAnalytics.jsx';
import { DutyStatusBadge, LateBadge } from '../../components/volunteer/VolunteerBadges.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Checkbox, Input, Textarea } from '../../components/ui/FormField.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { useApi, useDebounced } from '../../hooks/useApi.js';
import { useSaver } from '../../hooks/useSaver.js';
import { formatDate } from '../../utils/format.js';
import { shiftText } from '../../utils/volunteer.js';

function Overview() {
  const { data, error, reload } = useApi((signal) => adminVolunteerApi.analytics(signal));
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <div className="h-40 animate-pulse rounded-lg bg-slate-200" aria-label="Loading" />;
  return <VolunteerAnalytics data={data} showEvents />;
}

/** Recent duties and the audit trail, so volunteer-related issues can be traced. */
function Activity() {
  const { data, error, reload } = useApi((signal) => adminVolunteerApi.activity({}, signal), [], { refreshMs: 30000 });
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <div className="h-40 animate-pulse rounded-lg bg-slate-200" aria-label="Loading" />;
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="text-base font-semibold text-slate-900">Recent duties</h2><p className="text-sm text-slate-500">Across every event, newest first.</p></div>
        {data.assignments.length === 0 ? <p className="p-5 text-sm text-slate-500">No volunteer duties yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr><th scope="col" className="px-4 py-3">Volunteer</th><th scope="col" className="px-4 py-3">Event</th><th scope="col" className="px-4 py-3">Department</th><th scope="col" className="px-4 py-3">When</th><th scope="col" className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{a.volunteerName}<span className="block font-mono text-xs text-slate-400">{a.volunteerCode}</span></td>
                    <td className="px-4 py-3">{a.eventName}</td>
                    <td className="px-4 py-3">{a.department}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(a.date)}<span className="block text-xs">{shiftText(a.startTime, a.endTime)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3">{a.status === 'removed' ? <Badge tone="slate">Removed</Badge> : <DutyStatusBadge status={a.liveStatus ?? 'assigned'} />} <LateBadge late={a.late} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Audit log</h2>
        <p className="mb-3 text-sm text-slate-500">Who changed assignments, tasks and attendance, and when.</p>
        {data.log.length === 0 ? <p className="text-sm text-slate-500">Nothing recorded yet.</p> : (
          <ol className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
            {data.log.map((l) => (
              <li key={l.id} className="text-sm">
                <p className="text-slate-800">{l.message}</p>
                <p className="text-xs text-slate-400">{[l.eventName, l.volunteerName && `for ${l.volunteerName}`, l.actorName && `by ${l.actorName}`, new Date(l.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' - ')}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

/** Everyone with a volunteer profile. An admin can suspend someone from volunteering anywhere. */
function People() {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const { data, error, reload } = useApi((signal) => adminVolunteerApi.volunteers({ search: q }, signal), [q]);
  const { busy, save } = useSaver();
  if (error) return <LoadError error={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <Card className="p-4"><Input label="" aria-label="Search volunteers" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or volunteer ID" /></Card>
      {!data ? <div className="h-32 animate-pulse rounded-lg bg-slate-200" /> : data.volunteers.length === 0 ? <EmptyState icon="users" title="No volunteers" description="Volunteer profiles are created when students apply." /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr><th scope="col" className="px-4 py-3">Volunteer</th><th scope="col" className="px-4 py-3">Events</th><th scope="col" className="px-4 py-3">Duties</th><th scope="col" className="px-4 py-3">Tasks done</th><th scope="col" className="px-4 py-3">Access</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.volunteers.map((v) => (
                  <tr key={v.userId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{v.name}<span className="block text-xs font-normal text-slate-400">{v.email} - {v.volunteerCode}</span></td>
                    <td className="px-4 py-3">{v.events}</td><td className="px-4 py-3">{v.duties}</td><td className="px-4 py-3">{v.tasksCompleted}</td>
                    <td className="px-4 py-3"><Badge tone={v.status === 'suspended' ? 'red' : 'green'}>{v.status === 'suspended' ? 'Suspended' : 'Active'}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="secondary" loading={busy === v.userId} onClick={async () => { if (await save(v.userId, () => adminVolunteerApi.setStatus(v.userId, v.status === 'suspended' ? 'active' : 'suspended'), v.status === 'suspended' ? 'Access restored.' : 'Volunteer suspended. Their unstarted duties were released.')) reload(); }}>{v.status === 'suspended' ? 'Restore' : 'Suspend'}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Categories() {
  const { data, error, reload } = useApi((signal) => adminVolunteerApi.categories(signal));
  const { busy, errors, save } = useSaver();
  const [v, setV] = useState({ name: '', description: '', instructions: '' });
  if (error) return <LoadError error={error} onRetry={reload} />;
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Add a department template</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">Organizers can start a new department from these, then adjust it.</p>
        <form noValidate className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await save('add', () => adminVolunteerApi.createCategory(v), 'Template added.')) { setV({ name: '', description: '', instructions: '' }); reload(); } }}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Name" value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} error={errors.name} maxLength={80} />
            <Input label="Description" value={v.description} onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))} maxLength={500} />
          </div>
          <Textarea label="Default instructions" rows={2} value={v.instructions} onChange={(e) => setV((p) => ({ ...p, instructions: e.target.value }))} maxLength={3000} />
          <Button type="submit" loading={busy === 'add'}>Add template</Button>
        </form>
      </Card>
      {!data ? <div className="h-32 animate-pulse rounded-lg bg-slate-200" /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.categories.map((c) => (
            <li key={c.id}>
              <Card className={`flex h-full flex-col justify-between gap-3 p-4 ${c.isActive ? '' : 'opacity-60'}`}>
                <div><p className="font-semibold text-slate-900">{c.name} {!c.isActive && <Badge tone="slate">Hidden</Badge>}</p><p className="text-sm text-slate-500">{c.description}</p></div>
                <Checkbox label="Offered to organizers" checked={c.isActive} onChange={async (e) => { if (await save(c.id, () => adminVolunteerApi.updateCategory(c.id, { isActive: e.target.checked }), e.target.checked ? 'Template shown.' : 'Template hidden.')) reload(); }} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Settings() {
  const { data, error, reload } = useApi((signal) => adminVolunteerApi.settings(signal));
  const { busy, errors, save } = useSaver();
  const [draft, setDraft] = useState(null);
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <div className="h-32 animate-pulse rounded-lg bg-slate-200" />;
  const value = draft ?? data.settings;
  const set = (key) => (e) => setDraft({ ...value, [key]: e.target.value });
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">Check-in rules</h2>
      <p className="mb-4 mt-1 text-sm text-slate-500">Volunteers can check in from a little before their shift starts until it ends. Arriving after the grace period marks them late.</p>
      <form noValidate className="grid gap-4 sm:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); if (await save('save', () => adminVolunteerApi.saveSettings(value), 'Settings saved.')) { setDraft(null); reload(); } }}>
        <Input label="Check-in opens (minutes before)" type="number" min="0" max="240" value={value.earlyCheckInMinutes} onChange={set('earlyCheckInMinutes')} error={errors.earlyCheckInMinutes} />
        <Input label="Late after (minutes)" type="number" min="0" max="240" value={value.lateGraceMinutes} onChange={set('lateGraceMinutes')} error={errors.lateGraceMinutes} />
        <Input label="Shift reminder (minutes before)" type="number" min="0" max="240" value={value.shiftReminderMinutes} onChange={set('shiftReminderMinutes')} error={errors.shiftReminderMinutes} />
        <div className="sm:col-span-3"><Button type="submit" loading={busy === 'save'} disabled={!draft}>Save settings</Button></div>
      </form>
    </Card>
  );
}

const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity & audit log' },
  { key: 'people', label: 'Volunteers' },
  { key: 'categories', label: 'Department templates' },
  { key: 'settings', label: 'Check-in rules' },
];

/** Admin: platform-wide volunteer reports, activity, permissions and settings. */
export default function AdminVolunteersPage() {
  const [section, setSection] = useState('overview');
  return (
    <>
      <PageHeader eyebrow="Volunteers" title="Volunteer administration" description="See volunteer activity across every event, manage who may volunteer, and set the check-in rules." />
      <div className="mb-6 max-w-full overflow-x-auto"><Tabs label="Volunteer administration sections" value={section} onChange={setSection} tabs={SECTIONS} /></div>
      {section === 'overview' && <Overview />}
      {section === 'activity' && <Activity />}
      {section === 'people' && <People />}
      {section === 'categories' && <Categories />}
      {section === 'settings' && <Settings />}
    </>
  );
}
