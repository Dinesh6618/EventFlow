import EventForm from '../../components/events/EventForm.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';

export default function CreateEventPage() {
  return (
    <>
      <PageHeader title="Create event" description="Fill in the details below. Fields marked * are required." />
      <EventForm />
    </>
  );
}
