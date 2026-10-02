import { useState } from 'react';
import { ApiError, announcementsApi } from '../../../api';
import Button from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { Input, Textarea } from '../../../components/ui/FormField.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { useEvent } from './EventManageLayout.jsx';

const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function AnnouncementsPage() {
  const { event } = useEvent();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => announcementsApi.list(event.id, signal), [event.id]);
  const [values, setValues] = useState({ title: '', message: '' });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const send = async (e) => {
    e.preventDefault();
    const found = {};
    if (!values.title.trim()) found.title = 'Title is required';
    if (!values.message.trim()) found.message = 'Message is required';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSending(true);
    try {
      const { notified } = await announcementsApi.create(event.id, { title: values.title.trim(), message: values.message.trim() });
      toast.success(`Announcement sent to ${notified} ${notified === 1 ? 'person' : 'people'}.`);
      setValues({ title: '', message: '' });
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.errors);
      else toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Send an announcement</h2>
        <p className="mt-1 text-sm text-slate-500">Registered participants, volunteers and judges get it as a notification.</p>
        <form onSubmit={send} noValidate className="mt-4 space-y-4">
          <Input label="Title" value={values.title} onChange={set('title')} error={errors.title} maxLength={150} />
          <Textarea label="Message" rows={3} value={values.message} onChange={set('message')} error={errors.message} />
          <Button type="submit" loading={sending}>Send announcement</Button>
        </form>
      </Card>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data && loading ? null : data.announcements.length === 0 ? (
        <EmptyState icon="mail" title="No announcements yet" description="Announcements you send will be listed here." />
      ) : (
        <ul className="space-y-3">
          {data.announcements.map((a) => (
            <li key={a.id}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{a.title}</p>
                  <span className="shrink-0 text-xs text-slate-400">{when(a.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.message}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
