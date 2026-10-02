import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { registrationsApi } from '../../api';
import QRPass, { useQrDataUrl } from '../../components/attendance/QRPass.jsx';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { downloadIcs } from '../../utils/calendar.js';
import { downloadPassPng } from '../../utils/passImage.js';

export default function EventPassPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => registrationsApi.mine(signal), []);
  const [saving, setSaving] = useState(false);
  const r = data?.registrations.find((x) => String(x.id) === id);
  const qr = useQrDataUrl(r?.qrToken);

  if (!data && loading) return <PageLoader label="Loading your pass..." />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!r) {
    return <EmptyState icon="ticket" title="Pass not found" description="This registration is not yours or no longer exists." action={<Link to="/my/registrations" className="font-semibold text-indigo-600">Back to My Events</Link>} />;
  }

  const event = { id: r.eventId, name: r.eventName, description: '', venue: r.eventVenue, date: r.eventDate, endDate: r.eventEndDate, startTime: r.eventStartTime, endTime: r.eventEndTime };

  const download = async () => {
    setSaving(true);
    try {
      await downloadPassPng({ registration: r, user, qrSrc: qr.src });
    } catch {
      toast.error('Could not save the pass. Try taking a screenshot instead.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Link to="/my/registrations" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        My Events
      </Link>
      <div className="anim-pop"><QRPass registration={r} user={user} qrSrc={qr.src} qrFailed={qr.failed} /></div>

      <div className="mt-7 grid grid-cols-2 gap-3">
        <Button size="lg" onClick={download} loading={saving} disabled={!qr.src}>
          <Icon name="download" className="h-5 w-5" />
          Download
        </Button>
        <Button variant="secondary" size="lg" onClick={() => downloadIcs(event)}>
          <Icon name="calendar" className="h-5 w-5" />
          Add to Calendar
        </Button>
      </div>
      <Link to={`/events/${r.eventId}`} className="mt-5 block text-center text-sm font-semibold text-indigo-600 hover:text-indigo-700">View event</Link>
    </div>
  );
}
