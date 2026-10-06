import { useState } from 'react';
import { ApiError, feedbackApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';
import Alert from '../ui/Alert.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Textarea } from '../ui/FormField.jsx';
import LoadError from '../ui/LoadError.jsx';
import Modal from '../ui/Modal.jsx';
import StarRating from '../ui/StarRating.jsx';

/** One feedback form. `session` rates a single session (overall + speaker); without it, the whole event. */
function FeedbackForm({ event, session, existing, onClose, onSaved }) {
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
      setErrors({ overall: 'Choose an overall rating' });
      return;
    }
    setSaving(true);
    const optional = (n) => (n ? n : null);
    try {
      await feedbackApi.save(event.id, {
        sessionId: session?.id ?? null,
        overall: values.overall,
        organization: session ? null : optional(values.organization),
        venue: session ? null : optional(values.venue),
        speaker: optional(values.speaker),
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
    <Modal open onClose={onClose} title={session ? `Rate: ${session.title}` : `Rate ${event.name}`}>
      <form onSubmit={submit} noValidate className="space-y-5">
        <StarRating label="Overall rating" required value={values.overall} onChange={set('overall')} error={errors.overall} />
        {!session && <StarRating label="Organization" value={values.organization} onChange={set('organization')} error={errors.organization} />}
        <StarRating label={session ? `Speaker${session.speaker ? ` (${session.speaker})` : ''}` : 'Speakers'} value={values.speaker} onChange={set('speaker')} error={errors.speaker} />
        {!session && <StarRating label="Venue" value={values.venue} onChange={set('venue')} error={errors.venue} />}
        <Textarea label="Comments" rows={3} value={values.comments} onChange={(e) => set('comments')(e.target.value)} error={errors.comments} />
        <Textarea label="Suggestions" rows={3} value={values.suggestions} onChange={(e) => set('suggestions')(e.target.value)} error={errors.suggestions} hint="What should the organizers do differently next time?" />
        <p className="text-xs text-slate-500">Organizers see your ratings and comments without your name.</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{existing ? 'Update feedback' : 'Submit feedback'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Participant feedback for an event and its finished sessions. Hidden until there is something to rate. */
export default function FeedbackPanel({ event }) {
  const { data, error, reload } = useApi((signal) => feedbackApi.mine(event.id, signal), [event.id, event.status]);
  const [editing, setEditing] = useState(null); // { session? }

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data || (!data.event.open && data.sessions.length === 0)) return null;

  const done = () => {
    setEditing(null);
    reload();
  };

  return (
    <section aria-label="Feedback">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Feedback</h2>
      <div className="space-y-3">
        {data.event.open && (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-medium text-slate-900">How was {event.name}?</p>
              <p className="text-sm text-slate-500">{data.event.feedback ? `You rated it ${data.event.feedback.overall} out of 5.` : 'Rate the event and help the organizers improve it.'}</p>
            </div>
            <Button variant={data.event.feedback ? 'secondary' : 'primary'} onClick={() => setEditing({})}>
              {data.event.feedback ? 'Edit feedback' : 'Give feedback'}
            </Button>
          </Card>
        )}
        {data.sessions.length > 0 && (
          <Card>
            <ul className="divide-y divide-slate-100">
              {data.sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{s.title}</p>
                    <p className="text-xs text-slate-500">{formatDate(s.date)}, {formatTimeRange(s.startTime, s.endTime)}{s.speaker ? ` - ${s.speaker}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.feedback && <Badge tone="green">Rated {s.feedback.overall}/5</Badge>}
                    {s.open && <Button size="sm" variant="secondary" onClick={() => setEditing({ session: s })}>{s.feedback ? 'Edit' : 'Rate'}</Button>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {!data.event.open && <Alert type="info">You can rate the whole event once it has finished.</Alert>}
      </div>

      {editing && (
        <FeedbackForm
          event={event}
          session={editing.session}
          existing={editing.session ? editing.session.feedback : data.event.feedback}
          onClose={() => setEditing(null)}
          onSaved={done}
        />
      )}
    </section>
  );
}
