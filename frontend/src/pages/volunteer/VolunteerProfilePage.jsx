import { useState } from 'react';
import { volunteerOpsApi } from '../../api';
import DutyCard from '../../components/volunteer/DutyCard.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import { Input, Select, Textarea } from '../../components/ui/FormField.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useSaver } from '../../hooks/useSaver.js';
import { AVAILABILITY, parseSkills } from '../../utils/volunteer.js';
import { YEARS } from '../../utils/constants.js';

function ProfileForm({ profile, onSaved }) {
  const { busy, errors, save } = useSaver();
  const [v, setV] = useState({ phone: profile.phone ?? '', year: profile.year ? String(profile.year) : '', skills: (profile.skills ?? []).join(', '), interests: profile.interests ?? '', availability: profile.availability ?? '', experience: profile.experience ?? '' });
  const set = (key) => (e) => setV((p) => ({ ...p, [key]: e.target.value }));
  return (
    <form noValidate className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      const body = { phone: v.phone.trim(), ...(v.year ? { year: Number(v.year) } : {}), skills: parseSkills(v.skills), interests: v.interests.trim(), availability: v.availability, experience: v.experience.trim() };
      if (await save('save', () => volunteerOpsApi.saveProfile(body), 'Profile saved.')) onSaved();
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Phone" type="tel" value={v.phone} onChange={set('phone')} error={errors.phone} maxLength={20} />
        <Select label="Year" value={v.year} onChange={set('year')} error={errors.year} placeholder="Select year" options={YEARS.map((y) => ({ value: y.value, label: y.label }))} />
      </div>
      <Input label="Skills" value={v.skills} onChange={set('skills')} error={errors.skills} placeholder="Python, Web Development, Communication" hint="Separate with commas" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Availability" value={v.availability} onChange={set('availability')} error={errors.availability} placeholder="When can you help?" options={AVAILABILITY} />
        <Input label="Interests" value={v.interests} onChange={set('interests')} error={errors.interests} maxLength={300} />
      </div>
      <Textarea label="Previous experience" rows={3} value={v.experience} onChange={set('experience')} error={errors.experience} maxLength={1000} />
      <Button type="submit" loading={busy === 'save'}>Save profile</Button>
    </form>
  );
}

/** The volunteer's profile and a record of what they have completed. */
export default function VolunteerProfilePage() {
  const profile = useApi((signal) => volunteerOpsApi.profile(signal));
  const history = useApi((signal) => volunteerOpsApi.myHistory(signal));

  if (profile.error) return <LoadError error={profile.error} onRetry={profile.reload} />;
  if (!profile.data) return <PageLoader />;
  const p = profile.data.profile;
  const s = profile.data.summary;

  return (
    <>
      <PageHeader eyebrow="Volunteer" title="My volunteer profile" description="Organizers see this when they choose who to assign." action={<Badge tone={p.status === 'suspended' ? 'red' : 'indigo'}>{p.volunteerCode}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">{p.name}</h2>
          <p className="mb-4 text-sm text-slate-500">{p.email}{p.department ? ` - ${p.department}` : ''}</p>
          <ProfileForm profile={p} onSaved={profile.reload} />
        </Card>
        <div className="space-y-6">
          <Card className="grid grid-cols-3 gap-3 p-5 text-center">
            <div><p className="text-2xl font-semibold text-slate-900">{s.hours}</p><p className="text-xs text-slate-500">hours</p></div>
            <div><p className="text-2xl font-semibold text-slate-900">{s.completedDuties}</p><p className="text-xs text-slate-500">duties</p></div>
            <div><p className="text-2xl font-semibold text-slate-900">{s.tasksCompleted}</p><p className="text-xs text-slate-500">tasks</p></div>
          </Card>
          <section aria-labelledby="done-heading">
            <h2 id="done-heading" className="mb-3 text-base font-semibold text-slate-900">Completed activities</h2>
            {!history.data ? <div className="h-20 animate-pulse rounded-lg bg-slate-200" /> : history.data.duties.length + history.data.tasks.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing completed yet. Finished duties and tasks appear here.</p>
            ) : (
              <ul className="space-y-3">
                {history.data.duties.map((d) => <li key={`d${d.id}`}><DutyCard duty={d} onChanged={history.reload} /></li>)}
                {history.data.tasks.map((t) => <li key={`t${t.id}`}><Card className="p-4 text-sm"><p className="font-semibold text-slate-900">{t.title}</p><p className="text-slate-500">{t.department.name} - {t.eventName}</p></Card></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
