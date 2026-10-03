import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api';
import VerificationPending from '../components/auth/VerificationPending.jsx';
import { useCooldown, useSingleFlight } from '../hooks/useCooldown.js';
import { formatClock } from '../utils/format.js';
import AuthShell from '../components/layout/AuthShell.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, homePathFor } from '../utils/constants.js';
import { validateRegister } from '../utils/validation.js';

// Volunteers have a student account; the choice only decides where they land after signing up.
const VOLUNTEER = 'volunteer';
const ROLE_OPTIONS = [
  { value: ROLES.PARTICIPANT, title: 'Student', text: 'Discover and join events' },
  { value: VOLUNTEER, title: 'Volunteer', text: 'Help run events' },
  { value: ROLES.ORGANIZER, title: 'Organizer', text: 'Create and manage events' },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Only the volunteer area may be requested, so this cannot be turned into an open redirect.
  const startRole = params.get('role') === ROLES.ORGANIZER ? ROLES.ORGANIZER : params.get('next') === '/volunteer' ? VOLUNTEER : ROLES.PARTICIPANT;

  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '', role: startRole, department: '', college: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(null);
  const guard = useSingleFlight(); // one click is one request
  const cooldown = useCooldown();

  const accountRole = values.role === VOLUNTEER ? ROLES.PARTICIPANT : values.role;

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = (e) => {
    e.preventDefault();
    return guard(async () => {
      setFormError('');
      const found = validateRegister({ ...values, role: accountRole });
      setErrors(found);
      if (Object.keys(found).length) return;

      setSubmitting(true);
      try {
        const result = await register({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          role: accountRole,
          department: values.department.trim(),
          college: values.college.trim(),
        });
        if (result.verificationRequired && !result.token) {
          // The link was emailed. Nothing about it is shown here.
          setPending({ email: values.email.trim(), emailSent: result.emailSent });
          return;
        }
        navigate(values.role === VOLUNTEER ? '/volunteer' : homePathFor(result.user.role), { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.status === 429 && err.retryAfter) cooldown.start(err.retryAfter);
        if (err instanceof ApiError && err.errors) setErrors(err.errors);
        setFormError(err.message);
        setSubmitting(false);
      }
    });
  };

  if (pending) {
    return (
      <AuthShell title="Check your email" subtitle="Your account is created. One more step.">
        <VerificationPending email={pending.email} emailSent={pending.emailSent} password={values.password} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Join EventFlow to organize or attend college events.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <Alert type="error">{formError}</Alert>}

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">I want to</legend>
          <div className="grid grid-cols-3 gap-3">
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-indigo-600 ${
                  values.role === option.value ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-slate-300 bg-white hover:border-slate-400'
                }`}
              >
                <input type="radio" name="role" value={option.value} checked={values.role === option.value} onChange={set('role')} className="sr-only" />
                <span className="block font-medium text-slate-900">{option.title}</span>
                <span className="block text-xs text-slate-500">{option.text}</span>
              </label>
            ))}
          </div>
          {errors.role && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.role}</p>}
        </fieldset>

        <Input label="Full name" autoComplete="name" value={values.name} onChange={set('name')} error={errors.name} />
        <Input label="Email" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} placeholder="you@college.edu" />
        {accountRole === ROLES.PARTICIPANT && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label="Department" required value={values.department} onChange={set('department')} error={errors.department} placeholder="e.g. Computer Science" maxLength={100} />
            <Input label="College" required value={values.college} onChange={set('college')} error={errors.college} placeholder="e.g. Sunrise Institute" maxLength={150} />
          </div>
        )}
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 8 characters, with a letter and a number."
        />
        <Input label="Confirm password" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} />

        <Button type="submit" size="lg" loading={submitting} disabled={cooldown.active} className="w-full">
          {submitting ? 'Creating account...' : cooldown.active ? `Try again in ${formatClock(cooldown.seconds)}` : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
