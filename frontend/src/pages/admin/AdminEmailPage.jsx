import { useState } from 'react';
import { adminEmailApi } from '../../api';
import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';

const TONE = { sent: 'green', failed: 'red', queued: 'amber' };
const FILTERS = [['', 'All'], ['sent', 'Sent'], ['failed', 'Failed'], ['queued', 'Queued']];
const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Admin only: is email set up, how has delivery gone, and a way to send a test. Never shows the key. */
export default function AdminEmailPage() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [testing, setTesting] = useState(false);
  const info = useApi((signal) => adminEmailApi.status(signal), [], { refreshMs: 30000 });
  const logs = useApi((signal) => adminEmailApi.logs({ status, limit: 100 }, signal), [status], { refreshMs: 30000 });

  const test = async () => {
    setTesting(true);
    try {
      const result = await adminEmailApi.test();
      (result.ok ? toast.success : toast.error)(result.message);
      info.reload();
      logs.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  const s = info.data;
  return (
    <>
      <PageHeader eyebrow="System" title="Email" description="Whether EventFlow can send email, and what has been sent." action={<Button onClick={test} loading={testing} disabled={!s?.configured}>Send me a test email</Button>} />

      {info.error ? (
        <LoadError error={info.error} onRetry={info.reload} />
      ) : !s ? (
        <div className="h-32 animate-pulse rounded-lg bg-slate-200" aria-label="Loading" />
      ) : (
        <div className="space-y-6">
          {s.configured ? (
            <Alert type="success"><span className="font-medium">Email is set up.</span> Sending through {s.provider} from {s.from}. {s.verificationRequired ? 'New accounts must verify their email before they can use EventFlow.' : 'Email verification is not required.'}</Alert>
          ) : (
            <Alert type="error">
              <p className="font-semibold">Email is not set up, so EventFlow cannot send any email.</p>
              <p className="mt-1">New accounts cannot verify their address, and nobody gets event emails, until this is fixed.</p>
              <ul className="mt-2 list-inside list-disc">{s.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              <p className="mt-2">Set these in the backend&apos;s <code className="rounded bg-red-100 px-1">.env</code> file and restart it: <code className="rounded bg-red-100 px-1">EMAIL_PROVIDER_API_KEY</code>, <code className="rounded bg-red-100 px-1">EMAIL_FROM</code> and <code className="rounded bg-red-100 px-1">APP_URL</code>.</p>
            </Alert>
          )}
          {s.configured && s.problems.length > 0 && <Alert type="info">{s.problems.join(' ')}</Alert>}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Sent, last 7 days" value={s.stats.sent} icon="mail" tone="green" />
            <StatCard label="Failed" value={s.stats.failed} icon="alert" tone="amber" />
            <StatCard label="Waiting to send" value={s.stats.queued} icon="clock" tone="indigo" />
          </div>
          <p className="text-sm text-slate-500">Links in emails point to <span className="font-mono text-slate-700">{s.appUrl}</span>. Change it with <code className="rounded bg-slate-100 px-1">APP_URL</code>.</p>

          <section aria-labelledby="log-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="log-heading" className="text-lg font-semibold text-slate-900">Email log</h2>
              <div role="group" aria-label="Filter by status" className="flex gap-1.5">
                {FILTERS.map(([value, label]) => <button key={label} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${status === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}
              </div>
            </div>
            {logs.error ? <LoadError error={logs.error} onRetry={logs.reload} /> : !logs.data ? <div className="h-32 animate-pulse rounded-lg bg-slate-200" /> : logs.data.logs.length === 0 ? (
              <EmptyState icon="mail" title="No emails yet" description="Emails appear here as EventFlow sends them. Links and tokens are never stored in this log." />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <tr><th scope="col" className="px-4 py-3">Time</th><th scope="col" className="px-4 py-3">Recipient</th><th scope="col" className="px-4 py-3">Email</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="hidden px-4 py-3 lg:table-cell">Detail</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.data.logs.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-3 text-slate-500">{when(l.createdAt)}</td>
                          <td className="px-4 py-3 text-slate-800">{l.recipient}</td>
                          <td className="px-4 py-3"><span className="font-medium text-slate-900">{l.subject}</span><span className="block font-mono text-xs text-slate-400">{l.template}</span></td>
                          <td className="px-4 py-3"><Badge tone={TONE[l.status]}>{l.status}</Badge></td>
                          <td className="hidden max-w-xs truncate px-4 py-3 text-slate-500 lg:table-cell" title={l.errorMessage ?? l.providerMessageId ?? ''}>{l.errorMessage ?? l.providerMessageId ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>
        </div>
      )}
    </>
  );
}
