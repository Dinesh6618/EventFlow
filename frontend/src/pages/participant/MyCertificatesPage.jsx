import { certificatesApi } from '../../api';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';

const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export default function MyCertificatesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => certificatesApi.mine(signal));

  return (
    <>
      <PageHeader title="My certificates" description="Certificates you have earned. Anyone can check one at /verify with its ID." />
      {!data && loading ? <PageLoader /> : error ? <LoadError error={error} onRetry={reload} /> : data.certificates.length === 0 ? (
        <EmptyState icon="check" title="No certificates yet" description="When an organizer issues a certificate for an event you took part in, it will appear here." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.certificates.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col p-5">
                <Badge tone="indigo">{data.types[c.type]}</Badge>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">{c.eventName}</h2>
                <p className="text-sm text-slate-500">Issued {date(c.issuedAt)}</p>
                <p className="mt-2 font-mono text-xs text-slate-500">{c.code}</p>
                <div className="mt-auto flex gap-2 pt-4">
                  <Button size="sm" onClick={() => certificatesApi.download(c.code).catch((e) => toast.error(e.message))}>Download PDF</Button>
                  <a href={`/verify/${c.code}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50">Verification page</a>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
