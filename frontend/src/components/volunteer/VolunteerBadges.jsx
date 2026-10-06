import Badge from '../ui/Badge.jsx';
import { APPLICATION_STATUS, ATTENDANCE, DUTY_STATUS, TASK_STATUS } from '../../utils/volunteer.js';

// Only the style guide's badge tones are used; any older tone name in the status tables becomes the accent.
const TONES = ['indigo', 'green', 'amber', 'red', 'slate'];
const toneOf = (tone) => (TONES.includes(tone) ? tone : 'indigo');

const make = (map) =>
  function StatusBadge({ status, children }) {
    const meta = map[status] ?? { label: status, tone: 'slate' };
    return <Badge tone={toneOf(meta.tone)}>{children ?? meta.label}</Badge>;
  };

export const DutyStatusBadge = make(DUTY_STATUS);
export const AttendanceStateBadge = make(ATTENDANCE);
export const TaskStatusBadge = make(TASK_STATUS);
export const ApplicationBadge = make(APPLICATION_STATUS);

export function LateBadge({ late }) {
  return late ? <Badge tone="amber">Late</Badge> : null;
}
