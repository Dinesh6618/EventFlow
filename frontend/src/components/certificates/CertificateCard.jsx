import { Link } from 'react-router-dom';
import Badge from '../ui/Badge.jsx';
import Button, { buttonClasses } from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** One certificate: event, type, date, certificate ID, Download and Verify (the public /verify page). */
export default function CertificateCard({ certificate: c, typeLabel, onDownload, downloading }) {
  return (
    <Card className="flex h-full flex-col p-5" data-testid="certificate">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <Icon name="award" className="h-5 w-5" />
        </span>
        <Badge tone="indigo">{typeLabel}</Badge>
      </div>
      <h3 className="mt-3 text-base font-semibold leading-snug text-slate-900">{c.eventName}</h3>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-slate-500">Issued</dt>
          <dd className="text-slate-900">{date(c.issuedAt)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-slate-500">Certificate ID</dt>
          <dd className="min-w-0 break-all font-mono text-slate-900">{c.code}</dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button size="sm" loading={downloading} onClick={() => onDownload(c)}>
          <Icon name="download" className="h-4 w-4" />
          Download
        </Button>
        <Link to={`/verify/${c.code}`} className={buttonClasses('secondary', 'sm')}>
          <Icon name="shield" className="h-4 w-4" />
          Verify
        </Link>
      </div>
    </Card>
  );
}
