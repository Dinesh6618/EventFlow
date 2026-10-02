import EventWizard from '../../components/events/EventWizard.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';

export default function CreateEventPage() {
  return (
    <>
      <PageHeader eyebrow="Create event" title="Create a new event" description="Five quick steps. Fields marked * are required." />
      <EventWizard />
    </>
  );
}
