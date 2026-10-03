import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import VerificationPending from '../components/auth/VerificationPending.jsx';
import AuthShell from '../components/layout/AuthShell.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCooldown, useSingleFlight } from '../hooks/useCooldown.js';
import { formatClock } from '../utils/format.js';
import { ROLES, homePathFor } from '../utils/constants.js';
import { validateLogin } from '../utils/validation.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Set when the password was right but the email is not verified yet: the address that was tried.
  const [unverified, setUnverified] = useState(null);
  const guard = useSingleFlight(); // one click is one request
  const cooldown = useCooldown(); // after "too many attempts", the button waits out the time

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    // The notice is about the address that was tried; a different address is a different question.
    if (key === 'email') setUnverified(null);
  };

  const submit = (e) => {
    e.preventDefault();
    return guard(async () => {
      setFormError('');
      const found = validateLogin(values);
      setErrors(found);
      if (Object.keys(found).length) return;

      setSubmitting(true);
      try {
        const user = await login({ email: values.email.trim(), password: values.password });
        // Send people back to where they were headed, but only if their role may open it.
        const from = location.state?.from;
        const allowed = from && (user.role === ROLES.PARTICIPANT ? !/^\/(organizer|admin)/.test(from) : from.startsWith(`/${user.role}`));
        navigate(allowed ? from : homePathFor(user.role), { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
          setUnverified({ email: values.email.trim(), password: values.password, message: err.message });
          setSubmitting(false);
          return;
        }
        setUnverified(null);
        if (err instanceof ApiError && err.status === 429 && err.retryAfter) cooldown.start(err.retryAfter);
        if (err instanceof ApiError && err.status === 422) setErrors(err.errors);
        setFormError(err.message);
        setSubmitting(false);
      }
    });
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to manage or discover college events.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <Alert type="error">{formError}</Alert>}
        <Input label="Email" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} placeholder="you@college.edu" />
        <Input label="Password" type="password" autoComplete="current-password" value={values.password} onChange={set('password')} error={errors.password} />
        <Button type="submit" size="lg" loading={submitting} disabled={cooldown.active} className="w-full">
          {submitting ? 'Logging in...' : cooldown.active ? `Try again in ${formatClock(cooldown.seconds)}` : 'Login'}
        </Button>
      </form>

      {unverified && <VerificationPending compact key={unverified.email} email={unverified.email} password={unverified.password} title={unverified.message} />}

      <p className="mt-6 text-center text-sm text-slate-600">
        Don&apos;t have an account?{' '}
        <Link to="/choose-role" className="font-semibold text-indigo-600 hover:text-indigo-700">
          Register
        </Link>
      </p>
    </AuthShell>
  );
}
