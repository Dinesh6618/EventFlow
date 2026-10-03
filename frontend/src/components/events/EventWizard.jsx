import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, eventsApi } from '../../api';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { DEPARTMENTS, EVENT_MODES, EVENT_TYPES, TYPE_ICONS, modeLabel } from '../../utils/constants.js';
import { formatDateTime, formatEventDates, formatTimeRange, nowLocalISO, todayISO } from '../../utils/format.js';
import { validateEvent, validateImage } from '../../utils/validation.js';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Checkbox, Input, Select, Textarea } from '../ui/FormField.jsx';
import Icon from '../ui/Icon.jsx';
import { FaqsEditor, PrizesEditor, RulesEditor } from './ListEditors.jsx';
import Stepper from './Stepper.jsx';

const STEPS = ['Basic Info', 'Schedule', 'Venue', 'Registration', 'Review'];

// Which fields belong to which step, so each step only reports its own problems.
const STEP_FIELDS = [
  ['name', 'type', 'description', 'image'],
  ['date', 'endDate', 'startTime', 'endTime'],
  ['venue', 'mode'],
  ['maxParticipants', 'registrationDeadline', 'minTeamSize', 'maxTeamSize', 'organizerName', 'organizerContact', 'prizes', 'rules', 'faqs'],
];

const SCALAR_FIELDS = [
  'name', 'description', 'type', 'date', 'startTime', 'endTime', 'venue', 'maxParticipants',
  'registrationDeadline', 'organizerName', 'organizerContact', 'college', 'endDate', 'minTeamSize', 'maxTeamSize', 'mode', 'department',
];

/** Problems with the optional lists, keyed like the server's errors (for example "prizes.0.title"). */
function validateLists({ prizes, rules, faqs }) {
  const e = {};
  prizes.forEach((p, i) => { if (!p.title.trim()) e[`prizes.${i}.title`] = 'Give the prize a title'; });
  rules.forEach((r, i) => { if (!r.trim()) e[`rules.${i}`] = 'A rule cannot be empty'; });
  faqs.forEach((f, i) => {
    if (!f.question.trim()) e[`faqs.${i}.question`] = 'Question is required';
    if (!f.answer.trim()) e[`faqs.${i}.answer`] = 'Answer is required';
  });
  return e;
}

const stepOf = (key) => {
  const prefix = key.split('.')[0];
  const index = STEP_FIELDS.findIndex((fields) => fields.includes(prefix));
  return index === -1 ? 0 : index;
};

function Summary({ title, step, onEdit, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900">{title}</h3>
        <button type="button" onClick={() => onEdit(step)} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">Edit</button>
      </div>
      <dl className="mt-3 space-y-2 text-sm">{children}</dl>
    </section>
  );
}

function Item({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words font-semibold text-slate-900">{children || <span className="font-normal text-slate-400">Not set</span>}</dd>
    </div>
  );
}

export default function EventWizard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInput = useRef(null);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState({
    name: '', description: '', type: '', date: '', endDate: '', startTime: '', endTime: '', venue: '', mode: 'offline', department: '',
    maxParticipants: '', registrationDeadline: '',
    organizerName: user.name, organizerContact: user.email, college: user.college || '', requiresApproval: false,
    teamEnabled: false, allowMultipleTeams: false, minTeamSize: '1', maxTeamSize: '4',
    prizes: [], rules: [], faqs: [],
  });
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Object URLs must be released or they leak for the life of the page.
  useEffect(() => {
    if (!image) return undefined;
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const setList = (key) => (list) => setValues((v) => ({ ...v, [key]: list }));
  const toggle = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.checked }));

  const pickImage = (e) => {
    const file = e.target.files?.[0] || null;
    const error = validateImage(file);
    setErrors((prev) => ({ ...prev, image: error }));
    if (error) {
      e.target.value = '';
      setImage(null);
      setPreview(null);
      return;
    }
    setImage(file);
    if (!file) setPreview(null);
  };
  const removeImage = () => {
    setImage(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const allProblems = () => ({ ...validateEvent(values, image), ...validateLists(values), ...(errors.image ? { image: errors.image } : {}) });

  const next = () => {
    const found = allProblems();
    const mine = Object.fromEntries(Object.entries(found).filter(([key]) => stepOf(key) === step));
    setErrors((prev) => ({ ...prev, ...mine }));
    if (Object.keys(mine).length === 0) {
      setFormError('');
      setStep((s) => s + 1);
    }
  };

  const submit = async () => {
    setFormError('');
    const found = allProblems();
    if (Object.keys(found).length) {
      setErrors(found);
      setStep(Math.min(...Object.keys(found).map(stepOf)));
      setFormError('Please fix the highlighted fields and try again.');
      return;
    }

    const body = new FormData();
    SCALAR_FIELDS.forEach((key) => body.append(key, String(values[key]).trim()));
    body.append('requiresApproval', String(values.requiresApproval));
    body.append('teamEnabled', String(values.teamEnabled));
    body.append('allowMultipleTeams', String(values.allowMultipleTeams));
    body.append('prizes', JSON.stringify(values.prizes.map((p) => ({ title: p.title.trim(), description: p.description.trim() }))));
    body.append('rules', JSON.stringify(values.rules.map((r) => r.trim())));
    body.append('faqs', JSON.stringify(values.faqs.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))));
    if (image) body.append('image', image);

    setSubmitting(true);
    try {
      const { event } = await eventsApi.create(body);
      toast.success(`"${event.name}" was created. Now plan its schedule.`);
      navigate(`/organizer/events/${event.id}/schedule`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors) {
        setErrors(err.errors);
        setStep(Math.min(...Object.keys(err.errors).map(stepOf)));
      }
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const multiDay = values.endDate && values.endDate > values.date;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-7"><Stepper steps={STEPS} current={step} label="Event creation steps" /></div>

      <Card className="p-6 sm:p-8">
        {formError && <Alert type="error" className="mb-5">{formError}</Alert>}

        {step === 0 && (
          <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate className="page-enter space-y-5" aria-label="Basic info">
            <h2 className="text-xl font-bold text-slate-900">Basic info</h2>
            <Input label="Event name" required value={values.name} onChange={set('name')} error={errors.name} maxLength={150} placeholder="e.g. CodeStorm 24h Hackathon" />
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-slate-700">Event type <span className="text-red-500" aria-hidden="true">*</span></legend>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {EVENT_TYPES.map((t) => (
                  <label
                    key={t}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3.5 py-3 text-sm font-semibold transition-all has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-indigo-600 ${
                      values.type === t ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                    }`}
                  >
                    <input type="radio" name="event-type" value={t} checked={values.type === t} onChange={set('type')} className="sr-only" />
                    <Icon name={TYPE_ICONS[t]} className="h-4 w-4 shrink-0" />
                    {t}
                  </label>
                ))}
              </div>
              {errors.type && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.type}</p>}
            </fieldset>
            <Textarea label="Description" required value={values.description} onChange={set('description')} error={errors.description} placeholder="What will happen, who should attend, what to bring..." />

            <div>
              <label htmlFor="event-image" className="mb-1.5 block text-sm font-medium text-slate-700">Event banner</label>
              {preview ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <img src={preview} alt="Selected banner preview" className="h-44 w-full object-cover" />
                  <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2 text-sm">
                    <span className="truncate text-slate-600">{image?.name}</span>
                    <button type="button" onClick={removeImage} className="font-semibold text-red-600 hover:text-red-700">Remove</button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="event-image"
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center text-sm text-slate-500 hover:border-indigo-400 hover:bg-indigo-50/40 ${errors.image ? 'border-red-400' : 'border-slate-300'}`}
                >
                  <Icon name="upload" className="h-8 w-8 text-indigo-400" />
                  <span><span className="font-semibold text-indigo-600">Choose an image</span> (JPG, PNG, WEBP or GIF, up to 5 MB)</span>
                  <span className="text-xs text-slate-400">Optional. Without one, a coloured banner is generated from the event type.</span>
                </label>
              )}
              <input ref={fileInput} id="event-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pickImage} className={preview ? 'hidden' : 'sr-only'} />
              {errors.image && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.image}</p>}
            </div>
            <div className="flex justify-end pt-2"><Button type="submit" size="lg">Next<Icon name="arrow-right" className="h-4 w-4" /></Button></div>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate className="page-enter space-y-5" aria-label="Schedule">
            <h2 className="text-xl font-bold text-slate-900">Schedule</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Date" required type="date" min={todayISO()} value={values.date} onChange={set('date')} error={errors.date} />
              <Input label="End date" type="date" min={values.date || todayISO()} value={values.endDate} onChange={set('endDate')} error={errors.endDate} hint="Only for events that run over several days." />
              <Input label="Start time" required type="time" value={values.startTime} onChange={set('startTime')} error={errors.startTime} />
              <Input label="End time" required type="time" value={values.endTime} onChange={set('endTime')} error={errors.endTime} hint={multiDay ? 'The time of day the last day ends.' : undefined} />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="secondary" size="lg" onClick={() => setStep(0)}><Icon name="arrow-left" className="h-4 w-4" />Back</Button>
              <Button type="submit" size="lg">Next<Icon name="arrow-right" className="h-4 w-4" /></Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate className="page-enter space-y-5" aria-label="Venue">
            <h2 className="text-xl font-bold text-slate-900">Venue</h2>
            <Input label="Venue" required value={values.venue} onChange={set('venue')} error={errors.venue} maxLength={200} placeholder="e.g. Main Auditorium, or a meeting link" />
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-slate-700">Format</legend>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {EVENT_MODES.map((m) => (
                  <label
                    key={m.value}
                    className={`cursor-pointer rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-indigo-600 ${
                      values.mode === m.value ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                    }`}
                  >
                    <input type="radio" name="event-mode" value={m.value} checked={values.mode === m.value} onChange={set('mode')} className="sr-only" />
                    {m.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Select label="Open to department" value={values.department} onChange={set('department')} placeholder="All departments" options={DEPARTMENTS} hint="Students can filter events by department. Leave open if everyone may join." />
            <div className="flex justify-between pt-2">
              <Button variant="secondary" size="lg" onClick={() => setStep(1)}><Icon name="arrow-left" className="h-4 w-4" />Back</Button>
              <Button type="submit" size="lg">Next<Icon name="arrow-right" className="h-4 w-4" /></Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate className="page-enter space-y-6" aria-label="Registration">
            <h2 className="text-xl font-bold text-slate-900">Registration</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Maximum participants" required type="number" min="1" step="1" inputMode="numeric" value={values.maxParticipants} onChange={set('maxParticipants')} error={errors.maxParticipants} placeholder="e.g. 100" />
              <Input label="Registration deadline" required type="datetime-local" min={nowLocalISO()} value={values.registrationDeadline} onChange={set('registrationDeadline')} error={errors.registrationDeadline} hint="Must be on or before the event start." />
            </div>
            <Checkbox label="Require approval for registrations" hint="New registrations stay pending (and hold a seat) until you approve or reject them." checked={values.requiresApproval} onChange={toggle('requiresApproval')} />
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Who can take part?</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {[
                  [false, 'Individuals only', 'Each participant joins on their own (1 person).'],
                  [true, 'Teams', 'Participants form teams. You decide how many members a team can have.'],
                ].map(([value, title, text]) => (
                  <label
                    key={title}
                    className={`cursor-pointer rounded-xl border-2 px-4 py-3 transition-all has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-indigo-600 ${
                      values.teamEnabled === value ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <input type="radio" name="participation-type" checked={values.teamEnabled === value} onChange={() => setValues((v) => ({ ...v, teamEnabled: value }))} className="sr-only" />
                    <span className="block text-sm font-semibold text-slate-900">{title}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {values.teamEnabled && (
              <div className="page-enter grid gap-5 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                <Input label="Minimum members per team" type="number" min="1" value={values.minTeamSize} onChange={set('minTeamSize')} error={errors.minTeamSize} hint="Use 1 to allow solo entries." />
                <Input label="Maximum members per team" type="number" min="1" max="50" value={values.maxTeamSize} onChange={set('maxTeamSize')} error={errors.maxTeamSize} hint="Teams cannot grow beyond this." />
                <div className="sm:col-span-2"><Checkbox label="Allow a participant to be in more than one team" checked={values.allowMultipleTeams} onChange={toggle('allowMultipleTeams')} /></div>
              </div>
            )}
            <Input label="College / institution" value={values.college} onChange={set('college')} error={errors.college} maxLength={150} placeholder="e.g. Lakeview Engineering College" hint="The college conducting the event. It is printed at the top of every certificate." />
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Organizer name" required value={values.organizerName} onChange={set('organizerName')} error={errors.organizerName} maxLength={100} />
              <Input label="Organizer contact" required value={values.organizerContact} onChange={set('organizerContact')} error={errors.organizerContact} hint="Email address or phone number" />
            </div>
            <details className="rounded-2xl border border-slate-200 p-4" open={values.prizes.length + values.rules.length + values.faqs.length > 0}>
              <summary className="cursor-pointer text-sm font-bold text-slate-800">Event page details: prizes, rules and FAQs (optional)</summary>
              <div className="mt-4 space-y-5">
                <PrizesEditor value={values.prizes} onChange={setList('prizes')} errors={errors} />
                <RulesEditor value={values.rules} onChange={setList('rules')} errors={errors} />
                <FaqsEditor value={values.faqs} onChange={setList('faqs')} errors={errors} />
              </div>
            </details>
            <div className="flex justify-between pt-2">
              <Button variant="secondary" size="lg" onClick={() => setStep(2)}><Icon name="arrow-left" className="h-4 w-4" />Back</Button>
              <Button type="submit" size="lg">Next<Icon name="arrow-right" className="h-4 w-4" /></Button>
            </div>
          </form>
        )}

        {step === 4 && (
          <div className="page-enter space-y-4" aria-label="Review">
            <h2 className="text-xl font-bold text-slate-900">Review and create</h2>
            <p className="text-sm text-slate-500">Check everything. You can edit any step before creating the event.</p>
            {preview && <img src={preview} alt="Banner preview" className="h-40 w-full rounded-2xl object-cover" />}
            <Summary title="Basic info" step={0} onEdit={setStep}>
              <Item label="Name">{values.name.trim()}</Item>
              <Item label="Type">{values.type}</Item>
              <Item label="Description"><span className="line-clamp-3 font-normal">{values.description.trim()}</span></Item>
            </Summary>
            <Summary title="Schedule" step={1} onEdit={setStep}>
              <Item label="Date">{values.date && formatEventDates({ date: values.date, endDate: values.endDate || values.date })}</Item>
              <Item label="Time">{values.startTime && values.endTime && formatTimeRange(values.startTime, values.endTime)}</Item>
            </Summary>
            <Summary title="Venue" step={2} onEdit={setStep}>
              <Item label="Venue">{values.venue.trim()}</Item>
              <Item label="Format">{modeLabel(values.mode)}</Item>
              <Item label="Department">{values.department || 'All departments'}</Item>
            </Summary>
            <Summary title="Registration" step={3} onEdit={setStep}>
              <Item label="Capacity">{values.maxParticipants}</Item>
              <Item label="Deadline">{values.registrationDeadline && formatDateTime(values.registrationDeadline)}</Item>
              <Item label="Approval">{values.requiresApproval ? 'Required' : 'Not required'}</Item>
              <Item label="Teams">{values.teamEnabled ? `${values.minTeamSize} to ${values.maxTeamSize} members` : 'Off'}</Item>
              {values.college.trim() && <Item label="College">{values.college.trim()}</Item>}
              <Item label="Contact">{`${values.organizerName.trim()} - ${values.organizerContact.trim()}`}</Item>
              <Item label="Page details">{[[values.prizes.length, "prize"], [values.rules.length, "rule"], [values.faqs.length, "FAQ"]].map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`).join(", ")}</Item>
            </Summary>
            <div className="flex justify-between pt-2">
              <Button variant="secondary" size="lg" onClick={() => setStep(3)} disabled={submitting}><Icon name="arrow-left" className="h-4 w-4" />Back</Button>
              <Button size="lg" onClick={submit} loading={submitting}>{submitting ? 'Creating...' : 'Create event'}</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
