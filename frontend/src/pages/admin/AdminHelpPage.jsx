import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, adminApi, adminHelpApi } from '../../api';
import HelpAnalytics from '../../components/help/HelpAnalytics.jsx';
import { PriorityBadge, StatusBadge } from '../../components/help/HelpBadges.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Checkbox, Input, Select } from '../../components/ui/FormField.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { PRIORITIES, PRIORITY_META, durationText } from '../../utils/help.js';

const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }));

/** Runs a save with a toast and field errors, so each form below stays short. */
function useSaver() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});
  const save = async (key, fn, success) => {
    setBusy(key);
    setErrors({});
    try {
      await fn();
      toast.success(success);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, errors, save, clear: () => setErrors({}) };
}

/* ------------------------------------------------------------- overview */

function Overview() {
  const { data, error, reload } = useApi((signal) => adminHelpApi.analytics(signal));
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-label="Loading" />;
  const s = data.summary;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total requests" value={s.total} icon="inbox" tone="indigo" />
        <StatCard label="Urgent requests" value={s.urgent} icon="alert" tone="amber" hint="still open" />
        <StatCard label="Open requests" value={s.open + s.inProgress} icon="clock" tone="sky" />
        <StatCard label="Avg response" value={durationText(data.averageResponseMinutes)} icon="mail" tone="pink" />
        <StatCard label="Avg resolution" value={durationText(data.averageResolutionMinutes)} icon="check" tone="green" />
      </div>
      <HelpAnalytics data={data} showEvents stats={false} />
    </div>
  );
}

/* ------------------------------------------------------------- requests */

const REQUEST_FILTERS = [
  { key: 'all', label: 'Everything', query: {} },
  { key: 'active', label: 'Still open', query: { state: 'active' } },
  { key: 'urgent', label: 'Urgent', query: { state: 'active', priority: 'urgent' } },
];

function Requests() {
  const [filter, setFilter] = useState('active');
  const { data, error, loading, reload } = useApi((signal) => adminHelpApi.requests(REQUEST_FILTERS.find((f) => f.key === filter).query, signal), [filter], { refreshMs: 15000 });
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">For monitoring only: descriptions, participants and photos are visible to the event team, not here.</p>
      <div role="group" aria-label="Filter requests" className="flex flex-wrap gap-1.5">
        {REQUEST_FILTERS.map((f) => <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`rounded-full px-3 py-1 text-sm font-medium ${filter === f.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f.label}</button>)}
      </div>
      {error ? <LoadError error={error} onRetry={reload} /> : !data && loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200" /> : data.requests.length === 0 ? (
        <EmptyState icon="shield" title="No requests" description="Nothing matches this filter." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th scope="col" className="px-4 py-3">Request</th><th scope="col" className="px-4 py-3">Event</th><th scope="col" className="px-4 py-3">Category</th><th scope="col" className="px-4 py-3">Location</th><th scope="col" className="px-4 py-3">Priority</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Age</th><th scope="col" className="px-4 py-3"><span className="sr-only">View</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.requests.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{r.requestCode}</td>
                    <td className="px-4 py-3">{r.eventName}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span aria-hidden="true">{r.category.icon}</span> {r.category.name}</td>
                    <td className="px-4 py-3">{r.location}</td>
                    <td className="whitespace-nowrap px-4 py-3"><PriorityBadge priority={r.priority} />{r.escalated && <Badge tone="red" className="ml-1">Escalated</Badge>}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{durationText(r.ageMinutes)}</td>
                    <td className="px-4 py-3 text-right"><Link to={`/admin/help/${r.id}`} className={buttonClasses('secondary', 'sm')}>View</Link></td>
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

/* ----------------------------------------------------------- categories */

function CategoryEditor({ category, onSaved }) {
  const { busy, errors, save } = useSaver();
  const [v, setV] = useState({ name: category.name, description: category.description, icon: category.icon, priorityLevel: category.priorityLevel, isUrgent: category.isUrgent, isActive: category.isActive });
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const dirty = Object.keys(v).some((k) => v[k] !== category[k]);
  return (
    <Card className={`p-4 ${category.isActive ? '' : 'opacity-70'}`}>
      <div className="grid gap-3 md:grid-cols-[4rem_1fr_1.4fr_9rem]">
        <Input label="Icon" value={v.icon} onChange={set('icon')} maxLength={16} error={errors.icon} />
        <Input label="Name" value={v.name} onChange={set('name')} maxLength={60} error={errors.name} />
        <Input label="Description" value={v.description} onChange={set('description')} maxLength={200} error={errors.description} />
        <Select label="Starting priority" value={v.priorityLevel} onChange={set('priorityLevel')} options={PRIORITY_OPTIONS} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-5">
          <Checkbox label="Urgent (needs confirmation)" checked={v.isUrgent} onChange={set('isUrgent')} />
          <Checkbox label="Shown to participants" checked={v.isActive} onChange={set('isActive')} />
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="slate">{category.code}</Badge>
          <Button size="sm" disabled={!dirty} loading={busy === 'save'} onClick={async () => { if (await save('save', () => adminHelpApi.updateCategory(category.id, v), 'Category saved.')) onSaved(); }}>Save</Button>
        </div>
      </div>
    </Card>
  );
}

function Categories() {
  const { data, error, reload } = useApi((signal) => adminHelpApi.categories(signal));
  const { busy, errors, save, clear } = useSaver();
  const [v, setV] = useState({ name: '', description: '', icon: 'ℹ️', priorityLevel: 'medium', isUrgent: false });
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  if (error) return <LoadError error={error} onRetry={reload} />;
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Add a category</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-[4rem_1fr_1.4fr_9rem_auto] md:items-start" onSubmit={async (e) => { e.preventDefault(); if (await save('add', () => adminHelpApi.createCategory(v), 'Category added.')) { setV({ name: '', description: '', icon: 'ℹ️', priorityLevel: 'medium', isUrgent: false }); clear(); reload(); } }} noValidate>
          <Input label="Icon" value={v.icon} onChange={set('icon')} maxLength={16} />
          <Input label="Name" value={v.name} onChange={set('name')} error={errors.name} maxLength={60} />
          <Input label="Description" value={v.description} onChange={set('description')} maxLength={200} />
          <Select label="Starting priority" value={v.priorityLevel} onChange={set('priorityLevel')} options={PRIORITY_OPTIONS} />
          <div className="md:pt-[1.625rem]"><Button type="submit" loading={busy === 'add'}>Add</Button></div>
        </form>
        <div className="mt-2"><Checkbox label="Urgent: shown under the emergency heading and needs confirmation" checked={v.isUrgent} onChange={set('isUrgent')} /></div>
      </Card>
      {!data ? <div className="h-32 animate-pulse rounded-2xl bg-slate-200" /> : data.categories.map((c) => <CategoryEditor key={`${c.id}-${c.name}-${c.priorityLevel}-${c.isActive}-${c.isUrgent}`} category={c} onSaved={reload} />)}
    </div>
  );
}

/* ------------------------------------------------------------- contacts */

const BLANK_CONTACT = { name: '', department: '', phone: '', availability: '', description: '', eventId: '' };

function ContactForm({ initial = BLANK_CONTACT, events, submitLabel, onSubmit, busy, errors, onCancel }) {
  const [v, setV] = useState(initial);
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...v, eventId: v.eventId === '' ? null : Number(v.eventId) }, () => setV(BLANK_CONTACT)); }} noValidate className="grid gap-3 md:grid-cols-2">
      <Input label="Name" required value={v.name} onChange={set('name')} error={errors.name} maxLength={100} placeholder="e.g. Campus Security" />
      <Input label="Department" value={v.department} onChange={set('department')} maxLength={100} />
      <Input label="Phone" required value={v.phone} onChange={set('phone')} error={errors.phone} maxLength={30} placeholder="Official number, exactly as it should be dialled" hint="Enter only real, official numbers." />
      <Input label="Availability" value={v.availability} onChange={set('availability')} maxLength={100} placeholder="e.g. 24 hours" />
      <Select label="Applies to" value={v.eventId ?? ''} onChange={set('eventId')} error={errors.eventId} placeholder="Every event" options={events.map((e) => ({ value: e.id, label: e.name }))} />
      <Input label="Description" value={v.description} onChange={set('description')} maxLength={300} />
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" loading={busy}>{submitLabel}</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

function Contacts() {
  const { data, error, reload } = useApi((signal) => adminHelpApi.contacts(signal));
  const events = useApi((signal) => adminApi.stats(signal)).data?.events ?? [];
  const { busy, errors, save } = useSaver();
  const [editing, setEditing] = useState(null);
  if (error) return <LoadError error={error} onRetry={reload} />;
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Add an emergency contact</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">Participants see these numbers on the Help Center once the event day begins. EventFlow shows them; it never calls them.</p>
        <ContactForm events={events} submitLabel="Add contact" busy={busy === 'add'} errors={errors} onSubmit={async (body, reset) => { if (await save('add', () => adminHelpApi.createContact(body), 'Contact added.')) { reset(); reload(); } }} />
      </Card>
      {!data ? <div className="h-32 animate-pulse rounded-2xl bg-slate-200" /> : data.contacts.length === 0 ? (
        <EmptyState icon="shield" title="No contacts yet" description="Add the official security, medical and coordinator numbers for your college or event." />
      ) : data.contacts.map((c) => (
        <Card key={c.id} className={`p-4 ${c.isActive ? '' : 'opacity-70'}`}>
          {editing === c.id ? (
            <ContactForm initial={{ name: c.name, department: c.department, phone: c.phone, availability: c.availability, description: c.description, eventId: c.eventId ?? '' }} events={events} submitLabel="Save" busy={busy === `edit-${c.id}`} errors={errors} onCancel={() => setEditing(null)} onSubmit={async (body) => { if (await save(`edit-${c.id}`, () => adminHelpApi.updateContact(c.id, body), 'Contact saved.')) { setEditing(null); reload(); } }} />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{c.name} {!c.isActive && <Badge tone="slate">Hidden</Badge>}</p>
                <p className="text-sm text-slate-600">{[c.department, c.availability].filter(Boolean).join(' - ')}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">{c.phone}</p>
                <p className="text-xs text-slate-500">{c.eventName ? `Only for ${c.eventName}` : 'Every event'}{c.description && ` - ${c.description}`}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(c.id)}>Edit</Button>
                <Button size="sm" variant="secondary" loading={busy === `toggle-${c.id}`} onClick={async () => { if (await save(`toggle-${c.id}`, () => adminHelpApi.updateContact(c.id, { isActive: !c.isActive }), c.isActive ? 'Contact hidden.' : 'Contact shown.')) reload(); }}>{c.isActive ? 'Hide' : 'Show'}</Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- teams */

function TeamCard({ team, onChanged }) {
  const { busy, errors, save } = useSaver();
  const [email, setEmail] = useState('');
  return (
    <Card className={`p-5 ${team.isActive ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">{team.name} {!team.isActive && <Badge tone="slate">Inactive</Badge>}</h3>
          {team.description && <p className="text-sm text-slate-500">{team.description}</p>}
        </div>
        <Button size="sm" variant="secondary" loading={busy === 'toggle'} onClick={async () => { if (await save('toggle', () => adminHelpApi.updateTeam(team.id, { isActive: !team.isActive }), team.isActive ? 'Team switched off.' : 'Team switched on.')) onChanged(); }}>{team.isActive ? 'Switch off' : 'Switch on'}</Button>
      </div>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {team.members.length === 0 && <li className="py-2 text-slate-500">No responders yet.</li>}
        {team.members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between py-2">
            <span><span className="font-medium text-slate-900">{m.name}</span> <span className="text-slate-500">{m.email}</span></span>
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" loading={busy === `rm-${m.userId}`} onClick={async () => { if (await save(`rm-${m.userId}`, () => adminHelpApi.removeMember(team.id, m.userId), `${m.name} removed.`)) onChanged(); }}>Remove</Button>
          </li>
        ))}
      </ul>
      <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start" noValidate onSubmit={async (e) => { e.preventDefault(); if (await save('add', () => adminHelpApi.addMember(team.id, email.trim()), 'Responder added.')) { setEmail(''); onChanged(); } }}>
        <Input label="Add a responder by email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="student@college.edu" />
        <div className="sm:pt-[1.625rem]"><Button type="submit" loading={busy === 'add'} disabled={!email.trim()}>Add</Button></div>
      </form>
    </Card>
  );
}

function Teams() {
  const { data, error, reload } = useApi((signal) => adminHelpApi.teams(signal));
  const { busy, errors, save } = useSaver();
  const [v, setV] = useState({ name: '', description: '' });
  if (error) return <LoadError error={error} onRetry={reload} />;
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Add a response team</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">Teams such as Technical Support label your responders. Organizers still choose which event volunteers handle each request.</p>
        <form className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto] md:items-start" noValidate onSubmit={async (e) => { e.preventDefault(); if (await save('team', () => adminHelpApi.createTeam(v), 'Team added.')) { setV({ name: '', description: '' }); reload(); } }}>
          <Input label="Name" value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} error={errors.name} maxLength={60} placeholder="e.g. Technical Support" />
          <Input label="Description" value={v.description} onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))} maxLength={200} />
          <div className="md:pt-[1.625rem]"><Button type="submit" loading={busy === 'team'}>Add team</Button></div>
        </form>
      </Card>
      {!data ? <div className="h-32 animate-pulse rounded-2xl bg-slate-200" /> : data.teams.map((t) => <TeamCard key={t.id} team={t} onChanged={reload} />)}
    </div>
  );
}

/* ----------------------------------------------------------- escalation */

const MINUTES = [
  ['ackMinutes', 'urgent', 'Urgent: acknowledge within'],
  ['ackMinutes', 'high', 'High: acknowledge within'],
  ['unresolvedMinutes', 'urgent', 'Urgent: remind if unresolved after'],
  ['unresolvedMinutes', 'high', 'High: remind if unresolved after'],
  ['unresolvedMinutes', 'medium', 'Medium: remind if unresolved after'],
  ['unresolvedMinutes', 'low', 'Low: remind if unresolved after'],
];

function Escalation() {
  const { data, error, reload } = useApi((signal) => adminHelpApi.settings(signal));
  const { busy, errors, save } = useSaver();
  const [draft, setDraft] = useState(null);
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />;
  const value = draft ?? data.escalation;
  const set = (group, key) => (e) => setDraft({ ...value, [group]: { ...value[group], [key]: e.target.value } });
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">Escalation rules</h2>
      <p className="mb-4 mt-1 text-sm text-slate-500">When an urgent or high request waits too long, the organizer is alerted inside EventFlow. Nothing outside EventFlow is ever contacted automatically.</p>
      <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={async (e) => { e.preventDefault(); if (await save('save', () => adminHelpApi.saveSettings(value), 'Escalation rules saved.')) { setDraft(null); reload(); } }}>
        {MINUTES.map(([group, key, label]) => (
          <Input key={`${group}-${key}`} label={`${label} (minutes)`} type="number" min="1" value={value[group][key]} onChange={set(group, key)} error={errors[`${group}.${key}`]} />
        ))}
        <div className="sm:col-span-2"><Button type="submit" loading={busy === 'save'} disabled={!draft}>Save rules</Button></div>
      </form>
    </Card>
  );
}

/* ----------------------------------------------------------------- page */

const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'requests', label: 'Requests' },
  { key: 'categories', label: 'Categories' },
  { key: 'contacts', label: 'Emergency contacts' },
  { key: 'teams', label: 'Response teams' },
  { key: 'rules', label: 'Escalation rules' },
];

/** Admin: reports, categories, official contacts, response teams and escalation timings. */
export default function AdminHelpPage() {
  const [section, setSection] = useState('overview');
  return (
    <>
      <PageHeader eyebrow="Help Center" title="Help management" description="Set up what participants can report, who they can call, and how quickly the event team must respond." />
      <div className="mb-6 max-w-full overflow-x-auto"><Tabs label="Help management sections" value={section} onChange={setSection} tabs={SECTIONS} /></div>
      {section === 'overview' && <Overview />}
      {section === 'requests' && <Requests />}
      {section === 'categories' && <Categories />}
      {section === 'contacts' && <Contacts />}
      {section === 'teams' && <Teams />}
      {section === 'rules' && <Escalation />}
    </>
  );
}
