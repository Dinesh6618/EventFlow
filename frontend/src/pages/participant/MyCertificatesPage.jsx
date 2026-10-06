import { useState } from 'react';
import { Link } from 'react-router-dom';
import { certificatesApi } from '../../api';
import CertificateCard from '../../components/certificates/CertificateCard.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';

const FILTERS = [
  ['all', 'All', null],
  ['participant', 'Participant', ['participant']],
  ['winner', 'Winner', ['winner', 'runner_up']],
  ['finalist', 'Finalist', ['finalist']],
  ['volunteer', 'Volunteer', ['volunteer']],
];

export default function MyCertificatesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => certificatesApi.mine(signal));
  const [tab, setTab] = useState('all');
  const [busy, setBusy] = useState(null);

  const download = async (c) => {
    setBusy(c.code);
    try {
      await certificatesApi.download(c.code);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const all = data?.certificates ?? [];
  const matches = (types) => (types ? all.filter((c) => types.includes(c.type)) : all);
  const shown = matches(FILTERS.find(([key]) => key === tab)[2]);

  return (
    <>
      <PageHeader eyebrow="Achievements" title="My Certificates" description="Certificates you have earned. Anyone can check one with its ID on the verification page." />

      <Tabs label="Certificate types" value={tab} onChange={setTab} tabs={FILTERS.map(([key, label, types]) => ({ key, label, count: data ? matches(types).length : undefined }))} />

      <div className="mt-6">
        {!data && loading ? (
          <PageLoader />
        ) : error ? (
          <LoadError error={error} onRetry={reload} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="award"
            title={tab === 'all' ? 'No certificates yet' : 'Nothing in this category'}
            description="When an organizer issues a certificate for an event you took part in, it will appear here."
            action={tab === 'all' && <Link to="/events" className={buttonClasses('primary')}>Explore Events</Link>}
          />
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((c) => (
              <li key={c.id}><CertificateCard certificate={c} typeLabel={data.types[c.type]} onDownload={download} downloading={busy === c.code} /></li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
