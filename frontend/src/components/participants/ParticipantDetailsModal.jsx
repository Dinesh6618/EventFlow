import { registrationsApi } from '../../api';
import { useApi } from '../../hooks/useApi.js';
import { formatDateTime } from '../../utils/format.js';
import { RegistrationStatusBadge } from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import LoadError from '../ui/LoadError.jsx';
import Modal from '../ui/Modal.jsx';
import Spinner from '../ui/Spinner.jsx';

const local = (iso) => (iso ? formatDateTime(new Date(iso).toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T')) : '-');

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 break-words font-medium text-slate-900">{children || '-'}</dd>
    </div>
  );
}

/** Full details of one registration, with approve/reject when the organizer may change it. */
export default function ParticipantDetailsModal({ registrationId, onClose, onDecide }) {
  const { data, error, loading, reload } = useApi(
    (signal) => (registrationId ? registrationsApi.detail(registrationId, signal) : Promise.resolve(null)),
    [registrationId],
  );
  const r = data?.registration;
  const canApprove = r && ['pending', 'rejected'].includes(r.status);
  const canReject = r && ['pending', 'approved', 'confirmed'].includes(r.status);

  return (
    <Modal
      open={Boolean(registrationId)}
      onClose={onClose}
      title="Participant details"
      footer={
        r && (
          <>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {canReject && <Button variant="secondary" onClick={() => onDecide(r, 'rejected')}>Reject</Button>}
            {canApprove && <Button onClick={() => onDecide(r, 'approved')}>Approve</Button>}
          </>
        )
      }
    >
      {loading && !r ? (
        <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-indigo-600" /></div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : r ? (
        <dl className="divide-y divide-slate-100">
          <Row label="Name">{r.participantName}</Row>
          <Row label="Email">{r.email}</Row>
          <Row label="Department">{r.department}</Row>
          <Row label="College">{r.college}</Row>
          <Row label="Event">{r.eventName}</Row>
          <Row label="Participant ID"><span className="font-mono">{r.participantCode}</span></Row>
          <Row label="Status"><RegistrationStatusBadge status={r.status} /></Row>
          <Row label="Registered">{local(r.registeredAt)}</Row>
          {r.decidedAt && <Row label="Last decision">{local(r.decidedAt)}</Row>}
          {r.cancelledAt && <Row label="Cancelled">{local(r.cancelledAt)}</Row>}
        </dl>
      ) : null}
    </Modal>
  );
}
