-- More kinds of schedule session: registration desk, keynote, panel, presentation, networking, ceremony, mentoring.

ALTER TABLE schedule_items DROP CONSTRAINT IF EXISTS schedule_items_session_type_check;
ALTER TABLE schedule_items ADD CONSTRAINT schedule_items_session_type_check
  CHECK (session_type IN (
    'session', 'registration', 'ceremony', 'keynote', 'talk', 'panel', 'workshop', 'presentation',
    'competition', 'evaluation_round', 'mentoring', 'networking', 'break'
  ));
