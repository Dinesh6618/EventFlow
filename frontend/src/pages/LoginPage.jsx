import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import AuthShell from '../components/layout/AuthShell.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, homePathFor } from '../utils/constants.js';
import { validateLogin } from '../utils/validation.js';

// Matches the accounts created by `npm run seed` in the backend. Shown in development only.
const DEMO_ACCOUNTS = [
  { label: 'Organizer', email: 'organizer@eventflow.test' },
  { label: 'Participant', email: 'participant@eventflow.test' },
  { label: 'Admin', email: 'admin@eventflow.test' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validateLogin(values);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const user = await login({ email: values.email.trim(), password: values.password });
      // Send people back to where they were headed, but only if their role may open it.
      const from = location.state?.from;
      const allowed = from && (user.role === ROLES.PARTICIPANT ? from.startsWith('/events') : from.startsWith(`/${user.role}`));
      navigate(allowed ? from : homePathFor(user.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.errors);
      setFormError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to manage or discover college events.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <Alert type="error">{formError}</Alert>}
        <Input label="Email" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} placeholder="you@college.edu" />
        <Input label="Password" type="password" autoComplete="current-password" value={values.password} onChange={set('password')} error={errors.password} />
        <Button type="submit" size="lg" loading={submitting} className="w-full">
          {submitting ? 'Logging in...' : 'Log in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        New to EventFlow?{' '}
        <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-700">
          Create an account
        </Link>
      </p>

      {import.meta.env.DEV && (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm">
          <p className="font-medium text-slate-700">Sample accounts (development)</p>
          <p className="mt-0.5 text-xs text-slate-500">Password for all: Password123. Run `npm run seed` in backend first.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setValues({ email: account.email, password: 'Password123' });
                  setErrors({});
                }}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}
