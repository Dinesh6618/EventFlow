import Badge from '../ui/Badge.jsx';
import { ITEM_STATUS_LABEL, PRIORITY_META, STATUS_META } from '../../utils/help.js';

// Only the style guide's badge tones are used; any older tone name in the status tables becomes the accent.
const TONES = ['indigo', 'green', 'amber', 'red', 'slate'];
const toneOf = (tone) => (TONES.includes(tone) ? tone : 'indigo');

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'slate' };
  return <Badge tone={toneOf(meta.tone)}>{meta.label}</Badge>;
}

export function PriorityBadge({ priority }) {
  const meta = PRIORITY_META[priority] ?? { label: priority, tone: 'slate' };
  return <Badge tone={toneOf(meta.tone)}>{meta.label}</Badge>;
}

export function ItemStatusBadge({ status }) {
  if (!status) return null;
  return <Badge tone={status === 'open' ? 'amber' : 'green'}>{ITEM_STATUS_LABEL[status] ?? status}</Badge>;
}
