import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, eventsApi, feedbackApi } from '../../api';
import Alert from '../../components/ui/Alert.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Textarea } from '../../components/ui/FormField.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import StarRating from '../../components/ui/StarRating.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';

const MOODS = ['', 'Not great', 'Could be better', 'Good', 'Really good', 'Loved it!'];

function Form({ event, existing, onSaved }) {
  const toast = useToast();
  const [values, setValues] = useState({
    overall: existing?.overall ?? 0,
    organization: existing?.organization ?? 0,
    speaker: existing?.speaker ?? 0,
    venue: existing?.venue ?? 0,
    comments: existing?.comments ?? '',
    suggestions: existing?.suggestions ?? '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!values.overall) {
      setErrors({ overall: 'Tap a star to rate your overall experience' });
      return;
    }
    setSaving(true);
    const optional = (n) => n || null;
    try {
      await feedbackApi.save(event.id, {
        sessionId: null,
        overall: values.overall,
        organization: optional(values.organization),
        speaker: optional(values.speaker),
        venue: optional(values.venue),
        comments: values.comments,
        suggestions: values.suggestions,
      });
      toast.success(existing ? 'Feedback updated. Thank you!' : 'Thank you for your feedback!');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.errors);
      else toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-7">
      <div className="rounded-2xl bg-indigo-50/70 p-5 text-center">
        <StarRating label="Overall Experience" required value={values.overall} onChange={set('overall')} error={errors.overall} />
        <p className="mt-2 h-5 text-sm font-semibold text-indigo-700" aria-live="polite">{MOODS[values.overall]}</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        <StarRating label="Event Organization" value={values.organization} onChange={set('organization')} error={errors.organization} />
        <StarRating label="Mentors & Speakers" value={values.speaker} onChange={set('speaker')} error={errors.speaker} />
        <StarRating label="Venue" value={values.venue} onChange={set('venue')} error={errors.venue} />
      </div>
      <Textarea label="What went well?" rows={3} value={values.comments} onChange={(e) => set('comments')(e.target.value)} error={errors.comments} placeholder="Optional" />
      <Textarea label="What can we improve?" rows={4} value={values.suggestions} onChange={(e) => set('suggestions')(e.target.value)} error={errors.suggestions} placeholder="Tell the organizers what to do differently next time" />
      <p className="flex items-center gap-2 text-xs text-slate-500"><Icon name="shield" className="h-4 w-4" />Organizers see your ratings and comments without your name.</p>
      <Button type="submit" size="lg" loading={saving} className="w-full">{existing ? 'Update Feedback' : 'Submit Feedback'}</Button>
    </form>
  );
}

export default function FeedbackPage() {
  const { id } = useParams();
  const eventQuery = useApi((signal) => eventsApi.get(id, signal), [id]);
  const mine = useApi((signal) => feedbackApi.mine(id, signal), [id]);
  const [thanks, setThanks] = useState(false);

  if ((!eventQuery.data && eventQuery.loading) || (!mine.data && mine.loading)) return <PageLoader label="Loading..." />;
  if (eventQuery.error?.status === 404) return <EmptyState icon="calendar" title="Event not found" action={<Link to="/events" className="font-semibold text-indigo-600">Browse events</Link>} />;
  if (eventQuery.error || mine.error) {
    const err = eventQuery.error ?? mine.error;
    // The feedback endpoint refuses people who never held a seat.
    if (err.status === 403) return <EmptyState icon="alert" title="Feedback is for people who registered" description="Only registered participants can rate an event." action={<Link to={`/events/${id}`} className="font-semibold text-indigo-600">Back to the event</Link>} />;
    return <LoadError error={err} onRetry={() => { eventQuery.reload(); mine.reload(); }} />;
  }

  const { event } = eventQuery.data;

  if (thanks) {
    return (
      <div className="mx-auto max-w-md text-center" data-testid="feedback-thanks">
        <div className="mx-auto flex h-20 w-20 animate-check items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30">
          <Icon name="heart" className="h-9 w-9 fill-current" />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold text-slate-900">Thank you!</h1>
        <p className="mt-2 text-slate-500">Your feedback helps organizers make the next event better.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/my/registrations" className={buttonClasses('primary', 'lg')}>Back to My Events</Link>
          <Link to="/events" className={buttonClasses('secondary', 'lg')}>Explore Events</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/my/registrations" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        My Events
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">How was your experience?</h1>
      <p className="mt-1.5 text-lg font-semibold text-indigo-600">{event.name}</p>

      <Card className="mt-7 p-6 sm:p-8">
        {!mine.data.event.open ? (
          <Alert type="info">You can rate the whole event once it has finished. Come back after it ends.</Alert>
        ) : (
          <Form event={event} existing={mine.data.event.feedback} onSaved={() => setThanks(true)} />
        )}
      </Card>
      {mine.data.sessions.length > 0 && (
        <p className="mt-4 text-center text-sm text-slate-500">
          Want to rate individual sessions? Open the <Link to={`/events/${event.id}`} className="font-semibold text-indigo-600">event page</Link> and choose the Feedback tab.
        </p>
      )}
    </div>
  );
}
