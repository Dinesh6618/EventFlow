import { useState } from 'react';
import { volunteerOpsApi } from '../../api';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useSaver } from '../../hooks/useSaver.js';
import { AVAILABILITY, parseSkills } from '../../utils/volunteer.js';
import Button from '../ui/Button.jsx';
import { Input, Select, Textarea } from '../ui/FormField.jsx';
import Modal from '../ui/Modal.jsx';
import { YEARS } from '../../utils/constants.js';

/** The volunteer application. Name and email come from the account; the rest starts from the profile. */
export default function ApplyForm({ opportunity, onClose, onSent }) {
  const { user } = useAuth();
  const { busy, errors, save } = useSaver();
  const profile = useApi((signal) => volunteerOpsApi.profile(signal)).data?.profile;
  const [v, setV] = useState({ phone: user.phone ?? '', year: user.year ? String(user.year) : '', skills: (user.skills ?? []).join(', '), interests: '', availability: '', preferredDepartment: '', experience: '', message: '' });
  const [seeded, setSeeded] = useState(false);
  if (profile && !seeded) {
    // Start from what the volunteer profile already says, without overwriting anything typed meanwhile.
    setSeeded(true);
    setV((p) => ({ ...p, interests: p.interests || profile.interests || '', availability: p.availability || profile.availability || '', experience: p.experience || profile.experience || '' }));
  }
  const set = (key) => (e) => setV((p) => ({ ...p, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      message: v.message.trim(), phone: v.phone.trim(), ...(v.year ? { year: Number(v.year) } : {}), skills: parseSkills(v.skills), interests: v.interests.trim(),
      availability: v.availability, experience: v.experience.trim(), preferredDepartment: v.preferredDepartment.trim(),
    };
    if (await save('apply', () => volunteerOpsApi.apply(opportunity.eventId, body), `Application sent for ${opportunity.eventName}. The organizer will review it.`)) onSent();
  };

  return (
    <Modal open onClose={onClose} title={`Volunteer at ${opportunity.eventName}`} size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={user.name} readOnly hint="From your account" />
          <Input label="Email" value={user.email} readOnly hint="From your account" />
          <Input label="Phone" type="tel" value={v.phone} onChange={set('phone')} error={errors.phone} maxLength={20} placeholder="+91 98765 43210" />
          <Select label="Year" value={v.year} onChange={set('year')} error={errors.year} placeholder="Select year" options={YEARS.map((y) => ({ value: y.value, label: y.label }))} />
        </div>
        <Input label="Skills" value={v.skills} onChange={set('skills')} error={errors.skills} placeholder="Python, Web Development, Communication" hint="Separate with commas" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Availability" value={v.availability} onChange={set('availability')} error={errors.availability} placeholder="When can you help?" options={AVAILABILITY} />
          <Input label="Preferred department" value={v.preferredDepartment} onChange={set('preferredDepartment')} error={errors.preferredDepartment} maxLength={80} placeholder="e.g. Technical Support" />
        </div>
        <Input label="Interests" value={v.interests} onChange={set('interests')} error={errors.interests} maxLength={300} placeholder="e.g. Tech events, photography" />
        <Textarea label="Previous experience" rows={3} value={v.experience} onChange={set('experience')} error={errors.experience} maxLength={1000} placeholder="Events you have helped with before" />
        <Textarea label="Anything else you would like the organizer to know? (optional)" rows={2} value={v.message} onChange={set('message')} error={errors.message} maxLength={500} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy === 'apply'}>Cancel</Button>
          <Button type="submit" loading={busy === 'apply'}>Send application</Button>
        </div>
      </form>
    </Modal>
  );
}
