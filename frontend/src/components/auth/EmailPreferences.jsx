import { useState } from 'react';
import { authApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import Card from '../ui/Card.jsx';
import { Checkbox } from '../ui/FormField.jsx';
import LoadError from '../ui/LoadError.jsx';

const OPTIONS = [
  ['reminders', 'Event reminders', 'A reminder the day before an event you registered for, with your QR pass.'],
  ['announcements', 'Event announcements', 'Messages from organizers and changes to an event schedule.'],
  ['team', 'Team notifications', 'Invitations to join a team.'],
  ['certificates', 'Certificate notifications', 'When one of your certificates is ready.'],
  ['platform', 'Platform updates', 'News about new EventFlow features.'],
];

/** Settings → Email preferences. Optional emails can be switched off; security emails always arrive. */
export default function EmailPreferences() {
  const toast = useToast();
  const { data, error, reload } = useApi((signal) => authApi.emailPreferences(signal));
  const [saving, setSaving] = useState(null);

  const toggle = (key) => async (e) => {
    const value = e.target.checked;
    setSaving(key);
    try {
      await authApi.saveEmailPreferences({ [key]: value });
      toast.success(value ? 'You will get these emails.' : 'You will no longer get these emails.');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="mt-6 max-w-3xl p-5 sm:p-6" aria-labelledby="email-prefs-heading">
      <h2 id="email-prefs-heading" className="text-lg font-semibold text-slate-900">Email preferences</h2>
      <p className="mt-1 text-sm text-slate-500">Choose which emails you would like to receive.</p>
      {error ? (
        <div className="mt-4"><LoadError error={error} onRetry={reload} /></div>
      ) : !data ? (
        <div className="mt-4 h-32 animate-pulse rounded-lg bg-slate-100" aria-label="Loading email preferences" />
      ) : (
        <div className="mt-5 space-y-4">
          {OPTIONS.map(([key, label, hint]) => (
            <div key={key} className={saving === key ? 'opacity-60' : ''}>
              <Checkbox label={label} hint={hint} checked={data.preferences[key]} disabled={saving !== null} onChange={toggle(key)} />
            </div>
          ))}
          <p className="rounded-lg bg-slate-50 p-3.5 text-sm text-slate-600">The email that verifies your address, and emails about your own registrations, are always sent.</p>
        </div>
      )}
    </Card>
  );
}
