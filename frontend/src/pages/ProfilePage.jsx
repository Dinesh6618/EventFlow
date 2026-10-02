import { useState } from 'react';
import { ApiError, authApi } from '../api';
import Alert from '../components/ui/Alert.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { Input } from '../components/ui/FormField.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const joined = new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { user: updated } = await authApi.updateProfile({ name: name.trim() });
      setUser(updated);
      setName(updated.name);
      toast.success('Profile updated.');
    } catch (err) {
      if (err instanceof ApiError && err.errors?.name) setError(err.errors.name);
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
          <Input
            label="Full name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            error={error}
          />
          <Button type="submit" loading={saving} disabled={name.trim() === user.name}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </>
  );
}
