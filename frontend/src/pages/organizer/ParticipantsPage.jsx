import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, eventsApi, organizerApi, registrationsApi } from '../../api';
import ParticipantDetailsModal from '../../components/participants/ParticipantDetailsModal.jsx';
import ParticipantsTable from '../../components/participants/ParticipantsTable.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi, useDebounced } from '../../hooks/useApi.js';

const NO_FILTERS = { eventId: '', q: '', department: '', college: '', status: '' };
const STATUS_OPTIONS = ['pending', 'approved', 'confirmed', 'rejected', 'cancelled'];
const CONTROL =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

function Filter({ label, id, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

export default function ParticipantsPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({ ...NO_FILTERS, eventId: searchParams.get('eventId') || '' });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: '', dir: 'asc' });
  const [viewing, setViewing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const q = useDebounced(filters.q.trim());
  const query = { ...filters, q, page, pageSize: 20, sort: sort.key, dir: sort.key ? sort.dir : '' };
  const { data, error, loading, reload } = useApi(
    (signal) => organizerApi.participants(query, signal),
    [q, filters.eventId, filters.department, filters.college, filters.status, page, sort.key, sort.dir],
  );
  const myEvents = useApi((signal) => eventsApi.mine(signal));

  const onSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(1);
  };
  const filtered = Object.values(filters).some(Boolean);
  const change = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const decide = async (registration, status) => {
    setBusy(true);
    try {
      await registrationsApi.decide(registration.id, status);
      toast.success(`${registration.participantName || 'Registration'} ${status === 'approved' ? 'approved' : 'rejected'}.`);
      setViewing(null);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the registration.');
    } finally {
      setBusy(false);
      setRejecting(null);
    }
  };

  // Rejecting removes someone's seat, so confirm first; approving is immediate.
  const onDecide = (registration, status) => (status === 'rejected' ? setRejecting(registration) : decide(registration, status));

  const exportCsv = async () => {
    setExporting(true);
    try {
      await organizerApi.exportParticipants({ ...filters, q, sort: sort.key, dir: sort.key ? sort.dir : '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Participants"
        title="Registered participants"
        description="Everyone registered for your events."
        action={
          <Button variant="secondary" onClick={exportCsv} loading={exporting} disabled={!data?.total}>
            Export CSV
          </Button>
        }
      />

      <Card className="mb-6 p-4">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="lg:col-span-2">
            <Filter label="Search" id="p-q">
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="p-q" type="search" value={filters.q} onChange={(e) => change({ q: e.target.value })} placeholder="Name, email or participant ID" className={`${CONTROL} pl-9`} />
              </div>
            </Filter>
          </div>
          <Filter label="Event" id="p-event">
            <select id="p-event" value={filters.eventId} onChange={(e) => change({ eventId: e.target.value })} className={CONTROL}>
              <option value="">All events</option>
              {myEvents.data?.events.map((event) => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
          </Filter>
          <Filter label="Department" id="p-dept">
            <select id="p-dept" value={filters.department} onChange={(e) => change({ department: e.target.value })} className={CONTROL}>
              <option value="">All departments</option>
              {data?.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Filter>
          <Filter label="College" id="p-college">
            <select id="p-college" value={filters.college} onChange={(e) => change({ college: e.target.value })} className={CONTROL}>
              <option value="">All colleges</option>
              {data?.colleges.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Filter>
          <Filter label="Status" id="p-status">
            <select id="p-status" value={filters.status} onChange={(e) => change({ status: e.target.value })} className={`${CONTROL} capitalize`}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </Filter>
        </form>
        {filtered && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={() => change(NO_FILTERS)}>Clear filters</Button>
          </div>
        )}
      </Card>

      {!data && loading ? (
        <PageLoader label="Loading participants..." />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : data.registrations.length === 0 ? (
        <EmptyState
          icon="users"
          title={filtered ? 'No participants match your filters' : 'No participants yet'}
          description={filtered ? 'Try different filters or a different search.' : 'When people register for your events, they will appear here.'}
          action={filtered && <Button variant="secondary" onClick={() => change(NO_FILTERS)}>Clear filters</Button>}
        />
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <p className="mb-3 text-sm text-slate-500" aria-live="polite">{data.total} {data.total === 1 ? 'participant' : 'participants'}</p>
          <ParticipantsTable rows={data.registrations} onView={(r) => setViewing(r.id)} onDecide={onDecide} sort={sort.key} dir={sort.dir} onSort={onSort} />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}

      <ParticipantDetailsModal registrationId={viewing} onClose={() => setViewing(null)} onDecide={onDecide} />

      <ConfirmDialog
        open={Boolean(rejecting)}
        title="Reject this registration?"
        confirmLabel="Reject"
        danger
        loading={busy}
        onCancel={() => setRejecting(null)}
        onConfirm={() => decide(rejecting, 'rejected')}
      >
        <p>
          <strong className="text-slate-900">{rejecting?.participantName}</strong> will lose their seat for{' '}
          <strong className="text-slate-900">{rejecting?.eventName}</strong> and will not be able to register again on their own.
        </p>
      </ConfirmDialog>
    </>
  );
}
