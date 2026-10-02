import { useState } from 'react';
import { ApiError, authApi } from '../api';
import Alert from '../components/ui/Alert.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { Input } from '../components/ui/FormField.jsx';
import TagInput from '../components/ui/TagInput.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState({ name: user.name, department: user.department || '', college: user.college || '', skills: user.skills || [] });
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
    values.skills.join('\n') !== (user.skills || []).join('\n');
  const joined = new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (values.name.trim().length < 2) found.name = 'Name must be at least 2 characters';
    if (isParticipant && !values.department.trim()) found.department = 'Department is required';
    if (isParticipant && !values.college.trim()) found.college = 'College is required';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const { user: updated } = await authApi.updateProfile({
        name: values.name.trim(),
        department: values.department.trim(),
        college: values.college.trim(),
        ...(isParticipant ? { skills: values.skills } : {}),
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
      <PageHeader title="Profile" description="Your account details." />
      <Card className="max-w-2xl">
        <dl className="grid gap-4 border-b border-slate-200 p-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Email</dt>
            <dd className="mt-1 break-all text-sm font-medium text-slate-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Role</dt>
            <dd className="mt-1"><Badge tone="indigo">{user.role}</Badge></dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Member since</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{joined}</dd>
          </div>
        </dl>
        <form onSubmit={submit} noValidate className="space-y-5 p-6">
          {formError && <Alert type="error">{formError}</Alert>}
          <Input label="Full name" value={values.name} onChange={set('name')} error={errors.name} />
          {isParticipant && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Department" required value={values.department} onChange={set('department')} error={errors.department} maxLength={100} />
              <Input label="College" required value={values.college} onChange={set('college')} error={errors.college} maxLength={150} />
            </div>
          )}
          {isParticipant && (
            <TagInput
              label="Your skills"
              hint="Team leaders can see these to find teammates, for example UI/UX, Python or Public speaking."
              value={values.skills}
              onChange={(skills) => setValues((v) => ({ ...v, skills }))}
            />
          )}
          <Button type="submit" loading={saving} disabled={!changed}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </>
  );
}
