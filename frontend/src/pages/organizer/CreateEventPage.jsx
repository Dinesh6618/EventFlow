import EventWizard from '../../components/events/EventWizard.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';

export default function CreateEventPage() {
  return (
    <>
      <PageHeader title="Create Event" description="Six short steps. Fields marked * are required." />
      <EventWizard />
    </>
  );
}
