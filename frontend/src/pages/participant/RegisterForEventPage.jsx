import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError, authApi, eventsApi, registrationsApi, teamsApi } from '../../api';
import RegistrationSuccess from '../../components/events/RegistrationSuccess.jsx';
import Stepper from '../../components/events/Stepper.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Checkbox, Input, Select } from '../../components/ui/FormField.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { DEPARTMENTS, YEARS, yearLabel } from '../../utils/constants.js';
import { formatEventDates } from '../../utils/format.js';

const STEPS = ['Personal Info', 'Participation', 'Review'];
const PHONE_RE = /^\+?[\d\s\-()]{7,20}$/;
const HOLDS_SEAT = ['pending', 'approved', 'confirmed'];

function validatePersonal(v) {
  const e = {};
  if (v.name.trim().length < 2) e.name = 'Enter your full name';
  if (!v.college.trim()) e.college = 'College is required';
  if (!v.department.trim()) e.department = 'Department is required';
  if (!v.year) e.year = 'Choose your year';
  if (v.phone.trim() && !PHONE_RE.test(v.phone.trim())) e.phone = 'Enter a valid phone number';
  return e;
}

function validateParticipation(v, event) {
  const e = {};
  if (v.mode === 'team') {
    if (!event.teamEnabled) e.mode = 'This event does not use teams';
    const name = v.teamName.trim();
    if (name.length < 2) e.teamName = 'Team name must be at least 2 characters';
    else if (name.length > 80) e.teamName = 'Team name must be at most 80 characters';
  }
  if (!v.terms) e.terms = 'Please accept the terms to continue';
  return e;
}

function Choice({ checked, disabled, onChange, icon, title, text }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-indigo-600 ${
        disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60' : checked ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <input type="radio" name="participation" checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${checked ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-500">{text}</span>
      </span>
    </label>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-slate-900">{children || <span className="font-normal text-slate-400">Not provided</span>}</dd>
    </div>
  );
}

export default function RegisterForEventPage() {
  const { id } = useParams();
  const { user, setUser } = useAuth();
  const { data, error, loading, reload } = useApi((signal) => eventsApi.get(id, signal), [id]);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState({
    name: user.name,
    college: user.college ?? '',
    department: user.department ?? '',
    year: user.year ? String(user.year) : '',
    phone: user.phone ?? '',
    mode: 'individual',
    teamName: '',
    terms: false,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  if (!data && loading) return <PageLoader label="Loading registration..." />;
  if (error?.status === 404) return <EmptyState icon="calendar" title="Event not found" action={<Link to="/events" className="font-medium text-indigo-600">Browse events</Link>} />;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const { event, registration } = data;

  if (done) return <RegistrationSuccess event={event} registration={done.registration} teamName={done.teamName} teamNote={done.teamNote} />;
  if (registration && HOLDS_SEAT.includes(registration.status)) return <Navigate to={`/events/${event.id}`} replace />;

  const closed = !event.registrationOpen || event.availableSeats === 0 || registration?.status === 'rejected';
  if (closed) {
    const reason = event.status === 'ended' ? 'This event has ended.' : !event.registrationOpen ? 'Registration has closed.' : registration?.status === 'rejected' ? 'The organizer declined your earlier registration.' : 'This event is full.';
    return <EmptyState icon="alert" title="You can't register right now" description={reason} action={<Link to={`/events/${event.id}`} className="font-medium text-indigo-600">Back to the event</Link>} />;
  }

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const next = () => {
    const found = step === 0 ? validatePersonal(values) : validateParticipation(values, event);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep((s) => s + 1);
  };

  const confirm = async () => {
    setFormError('');
    setSubmitting(true);
    try {
      const profile = { name: values.name.trim(), department: values.department.trim(), college: values.college.trim(), year: Number(values.year), phone: values.phone.trim() };
      const changed = profile.name !== user.name || profile.department !== user.department || profile.college !== user.college || profile.year !== user.year || profile.phone !== (user.phone ?? '');
      if (changed) setUser((await authApi.updateProfile(profile)).user);

      const { registration: created } = await registrationsApi.register(event.id);

      let teamNote = '';
      const teamName = values.mode === 'team' ? values.teamName.trim() : '';
      if (teamName) {
        try {
          await teamsApi.create(event.id, { name: teamName });
        } catch (err) {
          teamNote = `You are registered, but the team "${teamName}" could not be created: ${err.message} You can set up a team from the event's Team tab.`;
        }
      }
      setDone({ registration: created, teamName, teamNote });
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setErrors(err.errors);
        if (err.errors.name || err.errors.department || err.errors.college || err.errors.year || err.errors.phone) setStep(0);
      }
      setFormError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={`/events/${event.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        Back to event
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Register</h1>
      <p className="mt-1 text-sm text-slate-500 sm:text-base">
        {event.name} <span aria-hidden="true">·</span> {formatEventDates(event)}
      </p>

      <div className="my-6"><Stepper steps={STEPS} current={step} label="Registration steps" /></div>

      <Card className="p-6 sm:p-8">
        {formError && <Alert type="error" className="mb-5">{formError}</Alert>}

        {step === 0 && (
          <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate className="page-enter space-y-5" aria-label="Personal information">
            <h2 className="text-lg font-semibold text-slate-900">Personal information</h2>
            <Input label="Full Name" required autoComplete="name" value={values.name} onChange={set('name')} error={errors.name} />
            <Input label="College" required autoComplete="organization" value={values.college} onChange={set('college')} error={errors.college} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Select label="Department" required value={values.department} onChange={set('department')} error={errors.department} placeholder="Select department" options={[...new Set([...(values.department ? [values.department] : []), ...DEPARTMENTS])]} />
              <Select label="Year" required value={values.year} onChange={set('year')} error={errors.year} placeholder="Select year" options={YEARS.map((y) => ({ value: String(y.value), label: y.label }))} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Email" type="email" value={user.email} readOnly hint="This is your login email." />
              <Input label="Phone Number" type="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} error={errors.phone} placeholder="+91 98765 43210" hint="Optional" />
            </div>
            <div className="flex justify-end pt-2"><Button type="submit" size="lg">Next<Icon name="arrow-right" className="h-4 w-4" /></Button></div>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate className="page-enter space-y-5" aria-label="Participation">
            <h2 className="text-lg font-semibold text-slate-900">How will you take part?</h2>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Participation type</legend>
              <Choice checked={values.mode === 'individual'} onChange={() => setValues((v) => ({ ...v, mode: 'individual' }))} icon="user" title="Individual" text="Join on your own" />
              <Choice
                checked={values.mode === 'team'}
                disabled={!event.teamEnabled}
                onChange={() => setValues((v) => ({ ...v, mode: 'team' }))}
                icon="users"
                title="Team"
                text={event.teamEnabled ? `Teams of ${event.minTeamSize === event.maxTeamSize ? event.minTeamSize : `${event.minTeamSize}-${event.maxTeamSize}`} people` : 'This event does not use teams'}
              />
            </fieldset>
            {values.mode === 'team' && (
              <div className="page-enter">
                <Input label="Team Name" required maxLength={80} value={values.teamName} onChange={set('teamName')} error={errors.teamName} placeholder="e.g. Byte Builders" hint="You will lead the team and can invite teammates after registering." />
              </div>
            )}
            <div className="pt-1">
              <Checkbox
                label="I agree to the event rules and the code of conduct"
                hint={event.requiresApproval ? 'The organizer reviews registrations for this event, so yours will start as pending.' : 'Your seat is confirmed straight away.'}
                checked={values.terms}
                onChange={set('terms')}
              />
              {errors.terms && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.terms}</p>}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="secondary" size="lg" onClick={() => setStep(0)}><Icon name="arrow-left" className="h-4 w-4" />Back</Button>
              <Button type="submit" size="lg">Next<Icon name="arrow-right" className="h-4 w-4" /></Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="page-enter" aria-label="Review">
            <h2 className="text-lg font-semibold text-slate-900">Review your details</h2>
            <p className="mt-1 text-sm text-slate-500">Check everything before you confirm.</p>
            <dl className="mt-4 divide-y divide-slate-100">
              <Row label="Event">{event.name}</Row>
              <Row label="Full Name">{values.name.trim()}</Row>
              <Row label="College">{values.college.trim()}</Row>
              <Row label="Department">{values.department}</Row>
              <Row label="Year">{yearLabel(values.year)}</Row>
              <Row label="Email">{user.email}</Row>
              <Row label="Phone">{values.phone.trim()}</Row>
              <Row label="Participation">{values.mode === 'team' ? `Team: ${values.teamName.trim()}` : 'Individual'}</Row>
            </dl>
            <div className="mt-6 flex justify-between">
              <Button variant="secondary" size="lg" onClick={() => setStep(1)} disabled={submitting}><Icon name="arrow-left" className="h-4 w-4" />Back</Button>
              <Button size="lg" onClick={confirm} loading={submitting}>Confirm registration</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
