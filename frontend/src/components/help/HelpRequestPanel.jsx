import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { helpApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { CONTACT_PREFERENCES, ITEM_STATUS_LABEL, PRIORITIES, PRIORITY_META, clockTime } from '../../utils/help.js';
import { formatDate } from '../../utils/format.js';
import { timeAgo } from '../notifications/NotificationBell.jsx';
import Alert from '../ui/Alert.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { Checkbox, Input, Select, Textarea } from '../ui/FormField.jsx';
import Icon from '../ui/Icon.jsx';
import LoadError from '../ui/LoadError.jsx';
import { PageLoader } from '../ui/Spinner.jsx';
import { ItemStatusBadge, PriorityBadge, StatusBadge } from './HelpBadges.jsx';
import StatusProgress from './StatusProgress.jsx';

const QUICK_REPLIES = ['Someone is on the way.', 'Please stay where you are.', 'We are looking into it.'];

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** The photo, fetched with the sign-in token because the file is never served publicly. */
function Photo({ requestId, attachment }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url;
    let cancelled = false;
    helpApi.photoUrl(requestId, attachment.id).then((u) => {
      if (cancelled) URL.revokeObjectURL(u);
      else { url = u; setSrc(u); }
    }).catch(() => setFailed(true));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [requestId, attachment.id]);
  if (failed) return <p className="text-sm text-slate-500">The photo could not be loaded.</p>;
  if (!src) return <div className="h-40 w-full max-w-xs animate-pulse rounded-xl bg-slate-200" aria-label="Loading photo" />;
  return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Attached by the participant" className="max-h-64 rounded-xl border border-slate-200 object-contain" /></a>;
}

/**
 * One help request, for whoever is looking at it. What each person may do comes from the server
 * (`request.capabilities`); the buttons here only reflect that answer.
 */
export default function HelpRequestPanel({ id, backTo, backLabel = 'Back' }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => helpApi.get(id, signal), [id], { refreshMs: 15000 });
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'cancel' | 'escalate'
  const [volunteerId, setVolunteerId] = useState('');
  const [priority, setPriority] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [internal, setInternal] = useState(false);

  if (!data && loading) return <PageLoader label="Loading request..." />;
  if (error) {
    return error.status === 404
      ? <Alert type="error">This request does not exist, or you do not have access to it.{backTo && <> <Link to={backTo} className="font-semibold underline">{backLabel}</Link></>}</Alert>
      : <LoadError error={error} onRetry={reload} />;
  }

  const { request: r, timeline, attachments, responders } = data;
  const c = r.capabilities;
  const staff = r.viewer === 'organizer' || r.viewer === 'volunteer';
  const finished = ['closed', 'cancelled'].includes(r.status);
  const lastUpdate = [...timeline].reverse().find((u) => u.kind === 'update' && !u.internal);

  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      reload();
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  };
  const move = (status, success) => run(status, () => helpApi.setStatus(r.id, status, status === 'resolved' ? note.trim() : ''), success).then((ok) => ok && setNote(''));

  const postUpdate = async (text) => {
    const ok = await run('update', () => helpApi.addUpdate(r.id, text, internal), internal ? 'Internal note saved.' : 'Update sent to the participant.');
    if (ok) setMessage('');
  };

  const contact = CONTACT_PREFERENCES.find((p) => p.value === r.contactPreference)?.label;

  return (
    <div className="space-y-6">
      {backTo && (
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <Icon name="arrow-left" className="h-4 w-4" />
          {backLabel}
        </Link>
      )}

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-slate-500">{r.requestCode}</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900">
              <span aria-hidden="true">{r.category.icon}</span>
              {r.category.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{r.eventName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <PriorityBadge priority={r.priority} />
            {r.escalated && <Badge tone="red">Escalated</Badge>}
            {r.overdue && <Badge tone="amber">Not acknowledged yet</Badge>}
            <ItemStatusBadge status={r.itemStatus} />
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Location">{r.location}</Fact>
          <Fact label="Reported">{clockTime(r.createdAt)} <span className="font-normal text-slate-500">({timeAgo(r.createdAt)})</span></Fact>
          {r.viewer !== 'participant' && r.viewer !== 'admin' && <Fact label="Participant">{r.participant.name}{r.participant.department && <span className="font-normal text-slate-500"> - {r.participant.department}</span>}</Fact>}
          <Fact label="Assigned to">
            {r.assignedTo ? (r.viewer === 'participant' ? <>{r.assignedTo.team ?? 'Event team'} <span className="font-normal text-slate-500">({r.assignedTo.name})</span></> : r.assignedTo.name) : <span className="font-normal text-slate-500">Not assigned yet</span>}
          </Fact>
          {contact && <Fact label="How to reach them">{contact}</Fact>}
          {r.participant?.phone && <Fact label="Phone (they asked to be called)">{r.participant.phone}</Fact>}
        </dl>

        {lastUpdate && r.viewer === 'participant' && !finished && (
          <div className="mt-5 rounded-xl bg-indigo-50 p-3.5 text-sm text-indigo-900">
            <span className="font-semibold">Last update:</span> &ldquo;{lastUpdate.message}&rdquo; <span className="text-indigo-600/70">({timeAgo(lastUpdate.at)})</span>
          </div>
        )}
        {r.status === 'resolved' && r.viewer === 'participant' && <Alert type="success"><span className="mt-0 block">The event team marked this resolved. If it is not, ask for help again.</span></Alert>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {r.viewer !== 'admin' && (
            <Card className="space-y-4 p-5 sm:p-6">
              <h2 className="text-base font-bold text-slate-900">Details</h2>
              {r.details?.itemName && (
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">{r.details.kind === 'found' ? 'Found' : 'Lost'}:</span> {r.details.itemName}
                  {r.details.when && <span className="text-slate-500"> ({formatDate(r.details.when.slice(0, 10))}, {r.details.when.slice(11)})</span>}
                </p>
              )}
              {r.description ? <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{r.description}</p> : <p className="text-sm text-slate-500">No description was added.</p>}
              {attachments.length > 0 && <div className="flex flex-wrap gap-3">{attachments.map((a) => <Photo key={a.id} requestId={r.id} attachment={a} />)}</div>}
            </Card>
          )}
          {r.viewer === 'admin' && <Alert type="info">You are monitoring this request. Descriptions, names, contact details and photos are only visible to the participant and the event team.</Alert>}

          {staff && (
            <Card className="space-y-5 p-5 sm:p-6">
              <h2 className="text-base font-bold text-slate-900">Respond</h2>
              <div className="flex flex-wrap gap-2.5">
                {c.canAcknowledge && <Button loading={busy === 'acknowledged'} onClick={() => move('acknowledged', 'Request acknowledged.')}>Acknowledge</Button>}
                {c.canAccept && <Button loading={busy === 'accept'} onClick={() => run('accept', () => helpApi.accept(r.id), 'You accepted this request.')}>Accept</Button>}
                {c.canStart && <Button variant={c.canAccept ? 'secondary' : 'primary'} loading={busy === 'in_progress'} onClick={() => move('in_progress', 'Marked as in progress.')}>Start work</Button>}
                {c.canClose && <Button loading={busy === 'closed'} onClick={() => move('closed', 'Request closed.')}>Close request</Button>}
                {c.canEscalate && <Button variant="secondary" className="text-red-700" onClick={() => setConfirm('escalate')}>Escalate</Button>}
              </div>

              {c.canResolve && (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Input label="Resolution note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Projector replaced" />
                  <Button variant="secondary" loading={busy === 'resolved'} onClick={() => move('resolved', 'Marked as resolved.')}>Mark resolved</Button>
                </div>
              )}

              {c.canAssign && (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Select
                    label="Assign to a volunteer"
                    value={volunteerId}
                    onChange={(e) => setVolunteerId(e.target.value)}
                    placeholder={responders?.length ? 'Choose a responder' : 'No volunteers yet. Add some on the Volunteers tab.'}
                    options={(responders ?? []).map((v) => ({ value: v.id, label: `${v.name}${v.teams.length ? ` - ${v.teams.join(', ')}` : ''} (${v.openCount} open)` }))}
                  />
                  <Button disabled={!volunteerId} loading={busy === 'assign'} onClick={() => run('assign', () => helpApi.assign(r.id, Number(volunteerId)), 'Volunteer assigned and notified.')}>Assign</Button>
                </div>
              )}

              {c.canChangePriority && (
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                  <Select label="Priority" value={priority || r.priority} onChange={(e) => setPriority(e.target.value)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
                  <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
                  <Button variant="secondary" disabled={!priority || priority === r.priority} loading={busy === 'priority'} onClick={() => run('priority', () => helpApi.setPriority(r.id, priority, reason.trim()), 'Priority updated.').then((ok) => ok && (setPriority(''), setReason('')))}>Update</Button>
                </div>
              )}

              {c.canSetItemStatus && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700">Lost &amp; Found status</p>
                  <div className="flex flex-wrap gap-2">
                    {['open', 'found', 'claimed', 'returned'].map((s) => (
                      <Button key={s} size="sm" variant={r.itemStatus === s ? 'primary' : 'secondary'} loading={busy === `item-${s}`} onClick={() => run(`item-${s}`, () => helpApi.setItemStatus(r.id, s), `Item marked ${ITEM_STATUS_LABEL[s].toLowerCase()}.`)}>{ITEM_STATUS_LABEL[s]}</Button>
                    ))}
                  </div>
                </div>
              )}

              {c.canUpdate && (
                <form onSubmit={(e) => { e.preventDefault(); if (message.trim()) postUpdate(message.trim()); }} className="space-y-3">
                  <Textarea label="Send an update" rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} hint={internal ? 'Only the event team will see this note.' : 'The participant receives this as a notification.'} />
                  <div className="flex flex-wrap gap-2">
                    {QUICK_REPLIES.map((q) => <button key={q} type="button" onClick={() => setMessage(q)} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">{q}</button>)}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Checkbox label="Internal note (hide from the participant)" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                    <Button type="submit" loading={busy === 'update'} disabled={!message.trim()}>{internal ? 'Save note' : 'Send update'}</Button>
                  </div>
                </form>
              )}
              {finished && <p className="text-sm text-slate-500">This request is {r.status}. No further changes can be made.</p>}
            </Card>
          )}

          {c.canCancel && (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-slate-600">No longer need help? You can cancel until someone starts working on it.</p>
              <Button variant="secondary" className="text-red-700" onClick={() => setConfirm('cancel')}>Cancel request</Button>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-base font-bold text-slate-900">Status</h2>
            <StatusProgress request={r} />
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="mb-3 text-base font-bold text-slate-900">Activity</h2>
            <ol className="space-y-3" aria-label="Activity">
              {timeline.map((u) => (
                <li key={u.id} className="flex gap-3 text-sm">
                  <span className="w-11 shrink-0 font-mono text-xs text-slate-400">{clockTime(u.at)}</span>
                  <div className="min-w-0">
                    <p className="text-slate-800">{u.message}</p>
                    <p className="text-xs text-slate-400">{u.by}{u.internal && <Badge tone="slate" className="ml-1.5">Internal</Badge>}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <ConfirmDialog open={confirm === 'cancel'} title="Cancel this request?" confirmLabel="Cancel request" danger loading={busy === 'cancel'} onCancel={() => setConfirm(null)} onConfirm={async () => { await run('cancel', () => helpApi.cancel(r.id), 'Request cancelled.'); setConfirm(null); }}>
        <p>The event team will be told you no longer need help with <strong className="text-slate-900">{r.requestCode}</strong>.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'escalate'} title="Escalate this request?" confirmLabel="Escalate" danger loading={busy === 'escalate'} onCancel={() => setConfirm(null)} onConfirm={async () => { await run('escalate', () => helpApi.escalate(r.id), 'Request escalated to urgent.'); setConfirm(null); }}>
        <p>This raises the request to <strong className="text-slate-900">urgent</strong>, flags it as escalated and tells the assigned volunteer. EventFlow does not contact emergency services; call your official contacts if someone is in danger.</p>
      </ConfirmDialog>
    </div>
  );
}
