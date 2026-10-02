import { Link } from 'react-router-dom';
import EventBanner from '../events/EventBanner.jsx';
import Badge from '../ui/Badge.jsx';
import Button, { buttonClasses } from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** One certificate: event image, type, date, a verified badge and the two actions. */
export default function CertificateCard({ certificate: c, typeLabel, onDownload, downloading }) {
  return (
    <Card hover className="flex h-full flex-col overflow-hidden" data-testid="certificate">
      <EventBanner event={{ name: c.eventName, type: c.eventType, image: c.eventImage }} className="h-32">
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" aria-hidden="true" />
        <div className="absolute left-3 top-3"><Badge tone="dark">{typeLabel}</Badge></div>
        <span className="absolute -bottom-0 right-3 translate-y-1/2 rounded-full bg-white p-1.5 text-emerald-500 shadow-lg" title="Verified by EventFlow">
          <Icon name="shield" className="h-5 w-5" />
        </span>
      </EventBanner>
      <div className="flex flex-1 flex-col p-5 pt-6">
        <div className="flex items-center gap-2">
          <Badge tone="green"><Icon name="check" className="mr-1 h-3 w-3" />Verified</Badge>
          <span className="text-xs text-slate-500">Issued {date(c.issuedAt)}</span>
        </div>
        <h3 className="mt-2 text-lg font-bold leading-snug text-slate-900">{c.eventName}</h3>
        <p className="mt-1 font-mono text-xs text-slate-500">{c.code}</p>
        <div className="mt-auto flex flex-wrap gap-2.5 pt-5">
          <Link to={`/verify/${c.code}`} className={buttonClasses('secondary', 'sm')}>
            <Icon name="eye" className="h-4 w-4" />
            View Certificate
          </Link>
          <Button size="sm" loading={downloading} onClick={() => onDownload(c)}>
            <Icon name="download" className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>
    </Card>
  );
}
