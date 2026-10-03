import { useState } from 'react';
import { volunteerOpsApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate } from '../../utils/format.js';
import { clockTime } from '../../utils/help.js';
import { minutesText, shiftText } from '../../utils/volunteer.js';
import Alert from '../ui/Alert.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Textarea } from '../ui/FormField.jsx';
import Icon from '../ui/Icon.jsx';
import Modal from '../ui/Modal.jsx';
import { DutyStatusBadge, LateBadge } from './VolunteerBadges.jsx';

const contactLink = (contact) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? `mailto:${contact}` : `tel:${contact.replace(/[^\d+]/g, '')}`);

function Line({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon name={icon} className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-base font-semibold text-slate-900">{children}</p>
      </div>
    </div>
  );
}

/**
 * One duty. `featured` is the big "TODAY'S DUTY" card with the check-in button; otherwise a compact row.
 * Every action goes to the server, which decides whether it is allowed right now.
 */
export default function DutyCard({ duty: d, featured = false, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const c = d.capabilities;

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const sendRequest = async () => {
    await act('ask', () => volunteerOpsApi.requestReassignment(d.id, reason.trim()), 'Request sent. The organizer will answer it.');
    setAsking(false);
    setReason('');
  };

  const checkedIn = d.attendance === 'checked_in';
  const status = d.status === 'assigned' ? 'assigned' : d.liveStatus;

  const actions = (
    <div className="flex flex-wrap gap-2.5">
      {c.canAccept && <Button size={featured ? 'lg' : 'md'} loading={busy === 'accept'} onClick={() => act('accept', () => volunteerOpsApi.accept(d.id), 'Assignment accepted.')}>Accept assignment</Button>}
      {c.canCheckIn && <Button size={featured ? 'lg' : 'md'} className={featured ? 'min-w-[11rem] uppercase tracking-wide' : ''} loading={busy === 'in'} onClick={() => act('in', () => volunteerOpsApi.checkIn(d.id), 'You are checked in.')}>Check in</Button>}
      {c.canCheckOut && <Button size={featured ? 'lg' : 'md'} className={featured ? 'min-w-[11rem] uppercase tracking-wide' : ''} loading={busy === 'out'} onClick={() => act('out', () => volunteerOpsApi.checkOut(d.id), 'You are checked out. Thank you!')}>Check out</Button>}
      {c.canBreak && <Button size={featured ? 'lg' : 'md'} variant="secondary" loading={busy === 'break'} onClick={() => act('break', () => volunteerOpsApi.setBreak(d.id, !d.onBreak), d.onBreak ? 'Welcome back.' : 'Enjoy your break.')}>{d.onBreak ? 'Back from break' : 'Take a break'}</Button>}
      {c.canRequestReassignment && <Button size={featured ? 'lg' : 'md'} variant="ghost" onClick={() => setAsking(true)}>Request reassignment</Button>}
    </div>
  );

  const modal = (
    <Modal open={asking} onClose={() => setAsking(false)} title="Request reassignment">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Tell the organizer why you cannot do <strong className="text-slate-900">{d.department.name}</strong> on {formatDate(d.date)}. They can approve or reject it.</p>
        <Textarea label="Reason" required rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I have a class conflict during this shift." />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setAsking(false)}>Cancel</Button>
          <Button loading={busy === 'ask'} disabled={reason.trim().length < 3} onClick={sendRequest}>Send request</Button>
        </div>
      </div>
    </Modal>
  );

  if (!featured) {
    return (
      <Card className="p-4 sm:p-5" data-testid="duty">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-slate-900">{d.department.name}</p>
            <p className="text-sm text-slate-600">{d.eventName}</p>
            <p className="mt-1 text-sm text-slate-500">{formatDate(d.date)}, {shiftText(d.startTime, d.endTime)}{d.location ? ` - ${d.location}` : ''}</p>
          </div>
          <div className="flex items-center gap-1.5"><DutyStatusBadge status={status} >{d.status === 'assigned' ? 'Awaiting your acceptance' : undefined}</DutyStatusBadge><LateBadge late={d.late} /></div>
        </div>
        {d.task && <p className="mt-2 text-sm text-slate-700">{d.task}</p>}
        {(c.canAccept || c.canCheckIn || c.canCheckOut || c.canRequestReassignment) && <div className="mt-3">{actions}</div>}
        {d.hasOpenRequest && <p className="mt-2 text-xs font-medium text-amber-700">Reassignment requested. Waiting for the organizer.</p>}
        {modal}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" data-testid="todays-duty">
      <div className="bg-slate-900 px-5 py-3 text-white sm:px-7">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-200">Today&apos;s duty</p>
      </div>
      <div className="space-y-6 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{d.eventName}</h2>
            <p className="text-base text-slate-500">{d.department.name} team</p>
          </div>
          <div className="flex items-center gap-1.5"><DutyStatusBadge status={checkedIn || d.status !== 'assigned' ? d.liveStatus : 'assigned'}>{d.status === 'assigned' ? 'Not accepted yet' : d.attendance === 'not_checked_in' ? 'Not checked in' : undefined}</DutyStatusBadge><LateBadge late={d.late} /></div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Line icon="pin" label="Location">{d.location || 'See your instructions'}</Line>
          <Line icon="clock" label="Shift">{shiftText(d.startTime, d.endTime)}</Line>
          {d.checkInTime && <Line icon="check" label="Checked in">{clockTime(d.checkInTime)}{d.checkOutTime ? ` - out ${clockTime(d.checkOutTime)}` : ''} <span className="text-sm font-normal text-slate-500">({minutesText(d.minutes)})</span></Line>}
          {d.organizer && <Line icon="mail" label="Organizer contact">{d.organizer.name}{d.organizer.contact && <> - <a className="text-indigo-600 underline underline-offset-2" href={contactLink(d.organizer.contact)}>{d.organizer.contact}</a></>}</Line>}
        </div>

        {d.checkInMessage && <Alert type="info"><span className="font-medium">{d.checkInMessage}</span></Alert>}
        {actions}
        {d.hasOpenRequest && <p className="text-sm font-medium text-amber-700">You asked to be reassigned. Waiting for the organizer.</p>}

        {(d.task || d.instructions) && (
          <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
            {d.task && <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Your task</p><p className="mt-0.5 text-sm font-medium text-slate-900">{d.task}</p></div>}
            {d.instructions && <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Instructions</p><p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{d.instructions}</p></div>}
          </div>
        )}
      </div>
      {modal}
    </Card>
  );
}
