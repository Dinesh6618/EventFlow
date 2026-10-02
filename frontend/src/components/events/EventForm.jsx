import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, eventsApi } from '../../api';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { EVENT_TYPES } from '../../utils/constants.js';
import { nowLocalISO, todayISO } from '../../utils/format.js';
import { validateEvent, validateImage } from '../../utils/validation.js';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Input, Select, Textarea } from '../ui/FormField.jsx';
import Icon from '../ui/Icon.jsx';

const FIELDS = [
  'name', 'description', 'type', 'date', 'startTime', 'endTime', 'venue',
  'maxParticipants', 'registrationDeadline', 'organizerName', 'organizerContact',
];

function Section({ title, description, children }) {
  return (
    <section className="grid gap-5 border-b border-slate-200 p-6 last:border-b-0 lg:grid-cols-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:col-span-2">{children}</div>
    </section>
  );
}

export default function EventForm() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInput = useRef(null);

  const [values, setValues] = useState({
    name: '', description: '', type: '', date: '', startTime: '', endTime: '', venue: '',
    maxParticipants: '', registrationDeadline: '',
    organizerName: user.name, organizerContact: user.email,
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

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validateEvent(values, image);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError('Please fix the highlighted fields and try again.');
      return;
    }

    const body = new FormData();
    FIELDS.forEach((key) => body.append(key, String(values[key]).trim()));
    if (image) body.append('image', image);

    setSubmitting(true);
    try {
      const { event } = await eventsApi.create(body);
      toast.success(`"${event.name}" was created.`);
      navigate('/organizer/events');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.errors);
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <Section title="Basic details" description="What the event is and how participants will recognise it.">
          <div className="sm:col-span-2">
            <Input label="Event name" required value={values.name} onChange={set('name')} error={errors.name} maxLength={150} placeholder="e.g. CodeStorm 24h Hackathon" />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Event description" required value={values.description} onChange={set('description')} error={errors.description} placeholder="What will happen, who should attend, what to bring..." />
          </div>
          <Select label="Event type" required value={values.type} onChange={set('type')} error={errors.type} options={EVENT_TYPES} placeholder="Select a type" />
          <Input label="Maximum participants" required type="number" min="1" step="1" inputMode="numeric" value={values.maxParticipants} onChange={set('maxParticipants')} error={errors.maxParticipants} placeholder="e.g. 100" />
        </Section>

        <Section title="Schedule & venue" description="When and where it takes place, and how long registration stays open.">
          <div className="sm:col-span-2">
            <Input label="Date" required type="date" min={todayISO()} value={values.date} onChange={set('date')} error={errors.date} />
          </div>
          <Input label="Start time" required type="time" value={values.startTime} onChange={set('startTime')} error={errors.startTime} />
          <Input label="End time" required type="time" value={values.endTime} onChange={set('endTime')} error={errors.endTime} />
          <div className="sm:col-span-2">
            <Input label="Venue" required value={values.venue} onChange={set('venue')} error={errors.venue} maxLength={200} placeholder="e.g. Main Auditorium" />
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Registration deadline"
              required
              type="datetime-local"
              min={nowLocalISO()}
              value={values.registrationDeadline}
              onChange={set('registrationDeadline')}
              error={errors.registrationDeadline}
              hint="Must be on or before the event start."
            />
          </div>
        </Section>

        <Section title="Banner" description="Optional image shown on the event card and details page.">
          <div className="sm:col-span-2">
            <label htmlFor="event-image" className="mb-1.5 block text-sm font-medium text-slate-700">
              Event image / banner
            </label>
            {preview ? (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <img src={preview} alt="Selected banner preview" className="h-44 w-full object-cover" />
                <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2 text-sm">
                  <span className="truncate text-slate-600">{image?.name}</span>
                  <button type="button" onClick={removeImage} className="font-medium text-red-600 hover:text-red-700">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label
                htmlFor="event-image"
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm text-slate-500 hover:border-indigo-400 hover:bg-indigo-50/40 ${
                  errors.image ? 'border-red-400' : 'border-slate-300'
                }`}
              >
                <Icon name="image" className="h-8 w-8 text-slate-400" />
                <span><span className="font-medium text-indigo-600">Choose an image</span> (JPG, PNG, WEBP or GIF, up to 5 MB)</span>
              </label>
            )}
            <input ref={fileInput} id="event-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pickImage} className={preview ? 'hidden' : 'sr-only'} />
            {errors.image && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.image}</p>}
          </div>
        </Section>

        <Section title="Organizer contact" description="Participants use this to reach you with questions.">
          <Input label="Organizer name" required value={values.organizerName} onChange={set('organizerName')} error={errors.organizerName} maxLength={100} />
          <Input label="Organizer contact" required value={values.organizerContact} onChange={set('organizerContact')} error={errors.organizerContact} hint="Email address or phone number" />
        </Section>

        <div className="flex flex-col gap-4 bg-slate-50 p-6">
          {formError && <Alert type="error">{formError}</Alert>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => navigate('/organizer/events')} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Creating...' : 'Create event'}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
