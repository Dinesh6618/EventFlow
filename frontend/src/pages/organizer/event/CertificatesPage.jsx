import { useState } from 'react';
import { ApiError, certificatesApi } from '../../../api';
import Alert from '../../../components/ui/Alert.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import Button from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx';
import { Input, Select } from '../../../components/ui/FormField.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { useEvent } from './EventManageLayout.jsx';

const HELP = {
  participant: 'People who checked in.',
  winner: 'Members of the top-ranked team.',
  runner_up: 'Members of the second-ranked team.',
  finalist: 'Members of teams ranked 3 to 5.',
  volunteer: 'Everyone on the Team tab as volunteer.',
  judge: 'Everyone on the Team tab as judge.',
  organizer: 'You, as the event organizer.',
};
const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function CertificatesPage() {
  const { event } = useEvent();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => certificatesApi.forEvent(event.id, signal), [event.id]);
  const [busy, setBusy] = useState(null);
  const [scope, setScope] = useState('attended');
  const [manual, setManual] = useState({ type: 'speaker', name: '', email: '' });
  const [manualErrors, setManualErrors] = useState({});
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState('');

  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      const result = await fn();
      toast.success(success(result));
      reload();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.errors?.email) setManualErrors({ email: err.errors.email });
      else toast.error(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const issueBulk = (type) =>
    run(type, () => certificatesApi.issue(event.id, { type, ...(type === 'participant' ? { scope } : {}) }), (r) => `${r.issued} ${data.types[type].toLowerCase()} certificate${r.issued === 1 ? '' : 's'} issued.`);

  const issueManual = async (e) => {
    e.preventDefault();
    const found = {};
    if (manual.name.trim().length < 2) found.name = 'Enter the name to print';
    if (manual.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual.email.trim())) found.email = 'Enter a valid email address';
    setManualErrors(found);
    if (Object.keys(found).length) return;
    const ok = await run('manual', () => certificatesApi.issue(event.id, { type: manual.type, recipients: [{ name: manual.name.trim(), ...(manual.email.trim() && { email: manual.email.trim() }) }] }), () => `Certificate issued to ${manual.name.trim()}.`);
    if (ok) setManual((m) => ({ ...m, name: '', email: '' }));
  };

  const revoke = async () => {
    const ok = await run('revoke', () => certificatesApi.revoke(event.id, revoking.id, reason.trim()), () => `${revoking.code} was revoked.`);
    if (ok) {
      setRevoking(null);
      setReason('');
    }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data && loading) return null;

  const typeOptions = Object.keys(data.types);
  const automatic = typeOptions.filter((t) => t !== 'speaker');

  return (
    <div className="space-y-8">
      {!data.canIssue && <Alert type="info">Certificates can be issued once the event has started.</Alert>}

      <section aria-label="Issue certificates">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Issue certificates</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {automatic.map((type) => {
            const info = data.eligibility[type];
            return (
              <Card key={type} className="flex flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-slate-900">{data.types[type]}</h3>
                  <span className="text-xs text-slate-500">{info.issued} issued</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{HELP[type]}</p>
                {type === 'participant' && (
                  <div className="mt-3">
                    <label htmlFor="cert-scope" className="sr-only">Who counts as a participant</label>
                    <select id="cert-scope" value={scope} onChange={(e) => setScope(e.target.value)} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                      <option value="attended">Only people who checked in</option>
                      <option value="registered">Everyone registered</option>
                    </select>
                  </div>
                )}
                <div className="mt-auto pt-4">
                  <Button className="w-full" variant="secondary" loading={busy === type} disabled={!data.canIssue || (type !== 'participant' && info.eligible === 0)} onClick={() => issueBulk(type)}>
                    {type === 'participant' ? 'Issue to eligible' : `Issue to ${info.eligible}`}
                  </Button>
                  {type === 'participant' && <p className="mt-1.5 text-center text-xs text-slate-500">{info.eligible} eligible by check-in</p>}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Issue to a named person</h2>
        <p className="mt-1 text-sm text-slate-500">For speakers and anyone else, including people without an account. Add an email to link it to their account so it shows in their certificates.</p>
        {data.eligibility.speaker.suggestions.length > 0 && (
          <p className="mt-2 text-sm text-slate-600">
            Speakers on your schedule:{' '}
            {data.eligibility.speaker.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setManual({ type: 'speaker', name: s, email: '' })} className="mr-2 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100">{s}</button>
            ))}
          </p>
        )}
        <form onSubmit={issueManual} noValidate className="mt-4 grid gap-4 md:grid-cols-[10rem_1fr_1fr_auto] md:items-start">
          <Select label="Type" value={manual.type} onChange={(e) => setManual((m) => ({ ...m, type: e.target.value }))} options={typeOptions} />
          <Input label="Name on certificate" value={manual.name} onChange={(e) => { setManual((m) => ({ ...m, name: e.target.value })); setManualErrors({}); }} error={manualErrors.name} maxLength={100} />
          <Input label="Email (optional)" type="email" value={manual.email} onChange={(e) => { setManual((m) => ({ ...m, email: e.target.value })); setManualErrors({}); }} error={manualErrors.email} />
          <div className="md:pt-[1.625rem]"><Button type="submit" loading={busy === 'manual'} disabled={!data.canIssue} className="w-full">Issue</Button></div>
        </form>
      </Card>

      <section aria-label="Issued certificates">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Issued ({data.certificates.length})</h2>
        {data.certificates.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing issued yet.</p>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Certificate ID</th>
                    <th scope="col" className="px-4 py-3">Recipient</th>
                    <th scope="col" className="px-4 py-3">Type</th>
                    <th scope="col" className="hidden px-4 py-3 sm:table-cell">Issued</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.certificates.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{c.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{c.recipientName}{c.revokedAt && <Badge tone="red">Revoked</Badge>}</td>
                      <td className="px-4 py-3"><Badge tone="indigo">{data.types[c.type]}</Badge></td>
                      <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{date(c.issuedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => certificatesApi.download(c.code).catch((e) => toast.error(e.message))}>PDF</Button>
                        {!c.revokedAt && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setRevoking(c)}>Revoke</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <ConfirmDialog open={Boolean(revoking)} title="Revoke this certificate?" confirmLabel="Revoke" danger loading={busy === 'revoke'} onCancel={() => { setRevoking(null); setReason(''); }} onConfirm={revoke}>
        <p><strong className="text-slate-900">{revoking?.code}</strong> for {revoking?.recipientName} will show as REVOKED when someone verifies it, and the holder will no longer be able to download it.</p>
        <div className="mt-3">
          <label htmlFor="revoke-reason" className="mb-1 block text-xs font-medium text-slate-600">Reason (optional)</label>
          <input id="revoke-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
        </div>
      </ConfirmDialog>
    </div>
  );
}
