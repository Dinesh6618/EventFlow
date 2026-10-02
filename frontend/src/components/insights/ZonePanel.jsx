import { useState } from 'react';
import { ApiError, insightsApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { Input } from '../ui/FormField.jsx';
import LoadError from '../ui/LoadError.jsx';

export const ZONE_LEVELS = [
  { value: 'normal', label: 'Normal', tone: 'green', on: 'border-emerald-600 bg-emerald-600 text-white' },
  { value: 'busy', label: 'Busy', tone: 'amber', on: 'border-amber-500 bg-amber-500 text-white' },
  { value: 'high_queue', label: 'High queue', tone: 'red', on: 'border-red-600 bg-red-600 text-white' },
];

export const levelOf = (value) => ZONE_LEVELS.find((l) => l.value === value) || ZONE_LEVELS[0];

export function ageText(minutes) {
  if (minutes === null || minutes === undefined) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

function ZoneRow({ eventId, zone, staleAfter, canManage, onChanged }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(null);
  const level = levelOf(zone.status);

  async function report(status) {
    setSaving(status);
    try {
      await insightsApi.reportZone(eventId, zone.id, { status, note: note.trim() });
      setNote('');
      toast.success(`${zone.name}: ${levelOf(status).label.toLowerCase()}.`);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 p-3" data-testid="zone">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-900">{zone.name}</p>
        {zone.reported ? <Badge tone={level.tone}>{level.label}</Badge> : <Badge tone="slate">No report yet</Badge>}
      </div>
      {zone.reported ? (
        <p className="mt-1 text-xs text-slate-500">
          Reported {ageText(zone.ageMinutes)}{zone.reportedBy ? ` by ${zone.reportedBy}` : ''}
          {zone.note ? ` - "${zone.note}"` : ''}
          {zone.stale && <span className="ml-1 font-medium text-amber-700">(over {staleAfter} minutes old, may be out of date)</span>}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Nobody has reported on this area yet, so its level is unknown.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={`Report the crowd level at ${zone.name}`}>
        {ZONE_LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            aria-pressed={zone.reported && zone.status === l.value}
            disabled={saving !== null}
            onClick={() => report(l.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
              zone.reported && zone.status === l.value ? l.on : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {saving === l.value ? 'Saving...' : l.label}
          </button>
        ))}
        <input
          type="text"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          aria-label={`Optional note for ${zone.name}`}
          placeholder="Note (optional)"
          className="min-w-0 flex-1 basis-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => onChanged({ remove: zone })} aria-label={`Remove ${zone.name}`}>
            Remove
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Crowd levels for named areas. They are reports from people on the ground (with who and when),
 * not sensor readings, so old reports are marked as possibly out of date instead of looking live.
 */
export function ZonePanel({ eventId, zones, staleAfter = 60, canManage = false, onChanged }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removingBusy, setRemovingBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setNameError('Give the area a name of at least 2 characters');
      return;
    }
    setAdding(true);
    setNameError('');
    try {
      await insightsApi.addZone(eventId, name.trim());
      setName('');
      toast.success('Area added.');
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.errors?.name) setNameError(err.errors.name);
      else toast.error(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function remove() {
    setRemovingBusy(true);
    try {
      await insightsApi.removeZone(eventId, removing.id);
      toast.success(`${removing.name} removed.`);
      setRemoving(null);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemovingBusy(false);
    }
  }

  const handle = (arg) => (arg?.remove ? setRemoving(arg.remove) : onChanged());

  return (
    <div>
      {zones.length === 0 ? (
        <p className="text-sm text-slate-500">
          {canManage ? 'Add the areas you want to keep an eye on, such as the main gate, registration desk or food court. Volunteers can then report how busy each one is.' : 'The organizer has not set up any areas yet.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {zones.map((z) => (
            <ZoneRow key={z.id} eventId={eventId} zone={z} staleAfter={staleAfter} canManage={canManage} onChanged={handle} />
          ))}
        </ul>
      )}

      {canManage && (
        <form onSubmit={add} className="mt-4 flex items-start gap-2" noValidate>
          <div className="flex-1">
            <Input label="New area" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={nameError} placeholder="e.g. Main gate" />
          </div>
          <Button type="submit" loading={adding} className="mt-[1.65rem]">
            Add area
          </Button>
        </form>
      )}

      <ConfirmDialog open={Boolean(removing)} title="Remove this area?" confirmLabel="Remove" danger loading={removingBusy} onConfirm={remove} onCancel={() => setRemoving(null)}>
        {removing && <p>&quot;{removing.name}&quot; and its latest crowd report will be deleted. This cannot be undone.</p>}
      </ConfirmDialog>
    </div>
  );
}

/** Stand-alone version for volunteers: fetches the zones itself and refreshes quietly. */
export function ZoneReporter({ eventId }) {
  const { data, error, loading, reload } = useApi((signal) => insightsApi.zones(eventId, signal), [eventId], { refreshMs: 30000 });
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data && loading) return <p className="text-sm text-slate-500">Loading areas...</p>;

  const now = Date.now();
  const zones = data.zones.map((z) => {
    const ageMinutes = z.reportedAt ? Math.max(Math.round((now - new Date(z.reportedAt)) / 60000), 0) : null;
    return { ...z, ageMinutes, reported: Boolean(z.reportedAt), stale: ageMinutes !== null && ageMinutes > 60 };
  });
  return <ZonePanel eventId={eventId} zones={zones} onChanged={reload} />;
}
