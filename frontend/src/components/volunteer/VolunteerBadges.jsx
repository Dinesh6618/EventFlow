import Badge from '../ui/Badge.jsx';
import { APPLICATION_STATUS, ATTENDANCE, DUTY_STATUS, TASK_STATUS } from '../../utils/volunteer.js';

const make = (map) =>
  function StatusBadge({ status, children }) {
    const meta = map[status] ?? { label: status, tone: 'slate' };
    return <Badge tone={meta.tone}>{children ?? meta.label}</Badge>;
  };

export const DutyStatusBadge = make(DUTY_STATUS);
export const AttendanceStateBadge = make(ATTENDANCE);
export const TaskStatusBadge = make(TASK_STATUS);
export const ApplicationBadge = make(APPLICATION_STATUS);

export function LateBadge({ late }) {
  return late ? <Badge tone="amber">Late</Badge> : null;
}
