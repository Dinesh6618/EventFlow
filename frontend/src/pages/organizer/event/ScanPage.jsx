import ScanPanel from '../../../components/attendance/ScanPanel.jsx';
import { useEvent } from './EventManageLayout.jsx';

export default function ScanPage() {
  const { event } = useEvent();
  return <ScanPanel eventId={event.id} />;
}
