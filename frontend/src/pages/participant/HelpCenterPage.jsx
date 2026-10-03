import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, helpApi } from '../../api';
import { StatusBadge } from '../../components/help/HelpBadges.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import { Checkbox, Input, Select, Textarea } from '../../components/ui/FormField.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';
import { CONTACT_PREFERENCES } from '../../utils/help.js';

const OTHER = '__other__';
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO = 5 * 1024 * 1024;

function CategoryCard({ category, onPick, urgent }) {
  return (
    <button
      type="button"
      onClick={() => onPick(category)}
      className={`flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${urgent ? 'border-slate-300 hover:border-slate-500' : 'border-slate-200 hover:border-indigo-300'}`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${urgent ? 'bg-slate-900/5' : 'bg-indigo-50'}`} aria-hidden="true">{category.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-slate-900">{category.name}</span>
        <span className="block text-sm text-slate-500">{category.description}</span>
      </span>
      <Icon name="arrow-right" className="h-5 w-5 shrink-0 text-slate-400" />
    </button>
  );
}

/** Official numbers an admin configured. EventFlow itself does not call anyone. */
function EmergencyContacts({ contacts }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5 text-white">
      <h2 className="text-lg font-extrabold">Need immediate emergency assistance?</h2>
      <p className="mt-1 text-sm text-slate-300">If someone is in danger, contact the official event or college team first. EventFlow does not call emergency services for you.</p>
      {contacts.length === 0 ? (
        <p className="mt-3 rounded-xl bg-white/10 p-3 text-sm text-slate-200">No emergency contacts have been set up for this event yet. Ask the nearest event volunteer or organizer.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-xl bg-white/10 p-3.5">
              <p className="font-bold">{c.name}</p>
              {c.department && <p className="text-xs text-slate-300">{c.department}</p>}
              <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="mt-1.5 inline-flex items-center gap-2 text-lg font-extrabold text-white underline decoration-white/40 underline-offset-4">{c.phone}</a>
              {c.availability && <p className="mt-1 text-xs text-slate-300">{c.availability}</p>}
              {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestForm({ info, category, onBack, onDone }) {
  const lostFound = category.code === 'lost_found';
  const [values, setValues] = useState({ location: '', otherLocation: '', description: '', contactPreference: 'app', confirmUrgent: false, lostFoundKind: 'lost', itemName: '', itemWhen: '' });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!photo) return undefined;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return setPhoto(null);
    if (!PHOTO_TYPES.includes(file.type)) setErrors((p) => ({ ...p, photo: 'Photo must be a JPG, PNG or WEBP image' }));
    else if (file.size > MAX_PHOTO) setErrors((p) => ({ ...p, photo: 'Photo must be smaller than 5 MB' }));
    else { setErrors((p) => ({ ...p, photo: undefined })); setPhoto(file); return; }
    e.target.value = '';
    setPhoto(null);
  };

  const location = values.location === OTHER ? values.otherLocation.trim() : values.location;

  const validate = () => {
    const found = {};
    if (location.length < 2) found.location = lostFound ? 'Where was it?' : 'Choose where you are';
    if (lostFound && !values.itemName.trim()) found.itemName = 'Name the item';
    if (!lostFound && !category.isUrgent && values.description.trim().length < 3) found.description = 'Describe the problem in a few words';
    if (category.isUrgent && !values.confirmUrgent) found.confirmUrgent = 'Please confirm that this needs immediate attention';
    return found;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validate();
    setErrors((prev) => ({ ...prev, ...found }));
    if (Object.keys(found).length || errors.photo) return;

    const body = new FormData();
    body.set('categoryId', String(category.id));
    body.set('location', location);
    body.set('description', values.description.trim());
    body.set('contactPreference', values.contactPreference);
    body.set('confirmUrgent', String(values.confirmUrgent));
    if (lostFound) {
      body.set('lostFoundKind', values.lostFoundKind);
      body.set('itemName', values.itemName.trim());
      if (values.itemWhen) body.set('itemWhen', values.itemWhen);
    }
    if (photo) body.set('photo', photo);

    setSubmitting(true);
    try {
      onDone((await helpApi.create(info.event.id, body)).request);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      setFormError(err.message);
      setSubmitting(false);
    }
  };

  const locationOptions = [...info.locations.map((l) => ({ value: l, label: l })), { value: OTHER, label: 'Other' }];

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        All help options
      </button>

      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-2xl" aria-hidden="true">{category.icon}</span>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{category.name}</h2>
          <p className="text-sm text-slate-500">{category.description}</p>
        </div>
      </div>

      {category.isUrgent && <EmergencyContacts contacts={info.contacts} />}
      {formError && <Alert type="error">{formError}</Alert>}

      {lostFound && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">What happened?</legend>
          <div className="grid grid-cols-2 gap-3">
            {[['lost', 'I lost something'], ['found', 'I found something']].map(([value, label]) => (
              <label key={value} className={`cursor-pointer rounded-xl border-2 px-4 py-3 text-center text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-600 ${values.lostFoundKind === value ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}>
                <input type="radio" name="kind" value={value} checked={values.lostFoundKind === value} onChange={set('lostFoundKind')} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          {errors.lostFoundKind && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.lostFoundKind}</p>}
        </fieldset>
      )}
      {lostFound && <Input label="Item name" required maxLength={100} value={values.itemName} onChange={set('itemName')} error={errors.itemName} placeholder="e.g. Black backpack" />}

      <Select label={lostFound ? (values.lostFoundKind === 'found' ? 'Where did you find it?' : 'Where did you last see it?') : 'Where are you?'} required value={values.location} onChange={set('location')} error={errors.location} placeholder="Choose a location" options={locationOptions} />
      {values.location === OTHER && <Input label="Describe the place" required maxLength={150} value={values.otherLocation} onChange={set('otherLocation')} error={errors.location} placeholder="e.g. Near the library entrance" />}

      {lostFound && values.lostFoundKind === 'lost' && <Input label="When did you lose it? (optional)" type="datetime-local" value={values.itemWhen} onChange={set('itemWhen')} error={errors.itemWhen} />}

      <Textarea
        label={lostFound ? 'Description (colour, brand, anything that identifies it)' : category.isUrgent ? 'Anything we should know? (optional)' : 'What is the problem?'}
        required={!lostFound && !category.isUrgent}
        rows={3}
        maxLength={1000}
        value={values.description}
        onChange={set('description')}
        error={errors.description}
        placeholder={lostFound ? 'e.g. Has a blue keychain' : 'e.g. Projector is not working in Seminar Hall 2'}
        hint={category.isUrgent ? 'Share only what the responders need. Medical details are visible to the event team only.' : undefined}
      />

      <div>
        <label htmlFor="help-photo" className="mb-1.5 block text-sm font-medium text-slate-700">Photo (optional)</label>
        <input id="help-photo" type="file" accept={PHOTO_TYPES.join(',')} onChange={pickPhoto} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100" />
        {errors.photo && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.photo}</p>}
        {preview && <img src={preview} alt="Selected photo" className="mt-3 max-h-40 rounded-xl border border-slate-200" />}
      </div>

      <Select label="How should we reach you?" value={values.contactPreference} onChange={set('contactPreference')} options={CONTACT_PREFERENCES} hint="We only share your phone number with the responder if you choose Call me." />

      {category.isUrgent && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <Checkbox label="This needs immediate attention" hint="Urgent requests alert the organizer straight away. Please use them only for a real emergency." checked={values.confirmUrgent} onChange={set('confirmUrgent')} />
          {errors.confirmUrgent && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{errors.confirmUrgent}</p>}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full uppercase tracking-wide" loading={submitting}>Submit request</Button>
    </form>
  );
}

function Submitted({ request, event }) {
  return (
    <Card className="mx-auto max-w-lg p-6 text-center sm:p-8">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Icon name="check" className="h-7 w-7" /></span>
      <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Request submitted</h2>
      <p className="mt-1 text-sm text-slate-500">The event team has been told. Keep this ID if you need to refer to it.</p>
      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-slate-400">Request ID</p>
      <p className="font-mono text-2xl font-extrabold tracking-wide text-slate-900">{request.requestCode}</p>
      <dl className="mx-auto mt-5 grid max-w-xs grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-left text-sm">
        <dt className="text-slate-500">Category</dt><dd className="font-semibold text-slate-900">{request.category.name}</dd>
        <dt className="text-slate-500">Location</dt><dd className="font-semibold text-slate-900">{request.location}</dd>
        <dt className="text-slate-500">Status</dt><dd><StatusBadge status={request.status} /></dd>
      </dl>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link to={`/help/requests/${request.id}`} className={buttonClasses('primary', 'lg')}>Track status</Link>
        <Link to={`/events/${event.id}`} className={buttonClasses('secondary', 'lg')}>Back to event</Link>
      </div>
    </Card>
  );
}

/** GET HELP for one event: pick what is wrong, say where, send. */
export default function HelpCenterPage() {
  const { eventId } = useParams();
  const { data: info, error, loading, reload } = useApi((signal) => helpApi.info(eventId, signal), [eventId]);
  const [category, setCategory] = useState(null);
  const [done, setDone] = useState(null);

  if (!info && loading) return <PageLoader label="Opening the Help Center..." />;
  if (error) {
    return error.status === 403 || error.status === 404
      ? <Alert type="error">You can only ask for help at events you are registered for. <Link to="/events" className="font-semibold underline">Explore events</Link></Alert>
      : <LoadError error={error} onRetry={reload} />;
  }
  if (done) return <Submitted request={done} event={info.event} />;

  const urgent = info.categories.filter((c) => c.isUrgent);
  const normal = info.categories.filter((c) => !c.isUrgent);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Help Center"
        title={category ? 'Tell us what is wrong' : 'Need assistance?'}
        description={info.event.name}
        action={<Link to="/my/help" className={buttonClasses('secondary', 'sm')}>My help requests</Link>}
      />

      {!info.canRequest && (
        <Alert type="info" className="mb-6">
          <p className="font-semibold">{info.reason ?? 'Help requests are not available right now.'}</p>
          {info.windowOpen === false && <p className="mt-0.5">The official contacts below are shown once the event day begins.</p>}
        </Alert>
      )}

      {category && info.canRequest ? (
        <RequestForm info={info} category={category} onBack={() => setCategory(null)} onDone={setDone} />
      ) : (
        <div className="space-y-8">
          {urgent.length > 0 && (
            <section aria-labelledby="urgent-heading" className="space-y-4">
              <div>
                <h2 id="urgent-heading" className="text-sm font-extrabold uppercase tracking-widest text-slate-900">Urgent</h2>
                <p className="text-sm text-slate-500">Medical emergencies and immediate safety concerns.</p>
              </div>
              {info.windowOpen && <EmergencyContacts contacts={info.contacts} />}
              <div className="grid gap-3 sm:grid-cols-2">{urgent.map((c) => <CategoryCard key={c.id} category={c} urgent onPick={info.canRequest ? setCategory : () => {}} />)}</div>
            </section>
          )}
          {normal.length > 0 && (
            <section aria-labelledby="normal-heading" className="space-y-4">
              <div>
                <h2 id="normal-heading" className="text-sm font-extrabold uppercase tracking-widest text-slate-900">Everything else</h2>
                <p className="text-sm text-slate-500">Technical problems, venue issues, lost items and general questions.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">{normal.map((c) => <CategoryCard key={c.id} category={c} onPick={info.canRequest ? setCategory : () => {}} />)}</div>
            </section>
          )}
          {info.canRequest && info.openRequests > 0 && (
            <p className="text-sm text-slate-500">You have {info.openRequests} open request{info.openRequests === 1 ? '' : 's'} for this event. <Link to="/my/help" className="font-semibold text-indigo-600">Track them</Link></p>
          )}
        </div>
      )}
    </div>
  );
}
