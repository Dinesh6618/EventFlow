import { useParams, useSearchParams } from 'react-router-dom';
import HelpRequestPanel from '../components/help/HelpRequestPanel.jsx';

/**
 * One help request, for any role. The server decides what the signed-in person sees and can do;
 * `area` only picks where the Back link goes.
 */
export default function HelpRequestPage({ area }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const eventId = params.get('event');
  const back = {
    participant: ['/my/help', 'My help requests'],
    volunteer: ['/volunteer/help', 'My assigned requests'],
    organizer: eventId ? [`/organizer/events/${eventId}/help`, 'Help Center'] : ['/organizer/dashboard', 'Dashboard'],
    admin: ['/admin/help', 'Help management'],
  }[area];
  return <HelpRequestPanel id={id} backTo={back[0]} backLabel={back[1]} />;
}
