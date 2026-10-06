import Badge from '../ui/Badge.jsx';
import { ITEM_STATUS_LABEL, PRIORITY_META, STATUS_META } from '../../utils/help.js';

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'slate', dot: '' };
  return (
    <Badge tone={meta.tone}>
      <span aria-hidden="true" className="mr-1">{meta.dot}</span>
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }) {
  const meta = PRIORITY_META[priority] ?? { label: priority, tone: 'slate' };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function ItemStatusBadge({ status }) {
  if (!status) return null;
  return <Badge tone={status === 'open' ? 'amber' : 'green'}>{ITEM_STATUS_LABEL[status] ?? status}</Badge>;
}
