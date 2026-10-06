import { useState } from 'react';
import { ApiError, authApi } from '../api';
import Alert from '../components/ui/Alert.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { Input, Select } from '../components/ui/FormField.jsx';
import EmailPreferences from '../components/auth/EmailPreferences.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import ProfileAvatar from '../components/ui/ProfileAvatar.jsx';
import TagInput from '../components/ui/TagInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { YEARS } from '../utils/constants.js';

const PHONE_RE = /^\+?[\d\s\-()]{7,20}$/;

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState({
    name: user.name,
    department: user.department || '',
    college: user.college || '',
    year: user.year ? String(user.year) : '',
    phone: user.phone || '',
    skills: user.skills || [],
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const isParticipant = user.role === 'participant';
  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const changed =
    values.name.trim() !== user.name ||
    values.department.trim() !== (user.department || '') ||
    values.college.trim() !== (user.college || '') ||
    values.year !== (user.year ? String(user.year) : '') ||
    values.phone.trim() !== (user.phone || '') ||
    values.skills.join('\n') !== (user.skills || []).join('\n');
  const joined = new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (values.name.trim().length < 2) found.name = 'Name must be at least 2 characters';
    if (isParticipant && !values.department.trim()) found.department = 'Department is required';
    if (isParticipant && !values.college.trim()) found.college = 'College is required';
    if (values.phone.trim() && !PHONE_RE.test(values.phone.trim())) found.phone = 'Enter a valid phone number';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const { user: updated } = await authApi.updateProfile({
        name: values.name.trim(),
        department: values.department.trim(),
        college: values.college.trim(),
        phone: values.phone.trim(),
        ...(isParticipant ? { skills: values.skills, year: values.year ? Number(values.year) : '' } : {}),
      });
      setUser(updated);
      toast.success('Profile updated.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.errors);
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow={isParticipant ? 'Profile' : 'Settings'} title={isParticipant ? 'Your profile' : 'Account settings'} description="Your account details." />

      <Card className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 p-5 sm:p-6">
          <ProfileAvatar name={user.name} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{user.name}</h2>
            <p className="break-all text-sm text-slate-500">{user.email}</p>
            {isParticipant && (user.department || user.college) && (
              <p className="text-sm text-slate-500">{[user.department, user.college].filter(Boolean).join(' - ')}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="indigo" className="capitalize">{isParticipant ? 'Student' : user.role}</Badge>
              <span className="text-sm text-slate-500">Member since {joined}</span>
            </div>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="space-y-5 p-5 sm:p-6">
          {formError && <Alert type="error">{formError}</Alert>}
          <Input label="Full name" value={values.name} onChange={set('name')} error={errors.name} />
          {isParticipant && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Input label="Department" required value={values.department} onChange={set('department')} error={errors.department} maxLength={100} />
                <Input label="College" required value={values.college} onChange={set('college')} error={errors.college} maxLength={150} />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Select label="Year" value={values.year} onChange={set('year')} error={errors.year} placeholder="Select year" options={YEARS.map((y) => ({ value: String(y.value), label: y.label }))} />
                <Input label="Phone number" type="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} error={errors.phone} placeholder="+91 98765 43210" />
              </div>
              <TagInput
                label="Your skills"
                hint="Team leaders can see these to find teammates, for example UI/UX, Python or Public speaking."
                value={values.skills}
                onChange={(skills) => setValues((v) => ({ ...v, skills }))}
              />
            </>
          )}
          <Button type="submit" size="lg" loading={saving} disabled={!changed}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </Card>
      <EmailPreferences />
    </>
  );
}
