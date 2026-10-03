-- The college or institution that conducts the event. Printed on certificates.
ALTER TABLE events ADD COLUMN IF NOT EXISTS college VARCHAR(150);

-- Events created before this column existed take their organizer's college, if they set one.
UPDATE events e SET college = u.college FROM users u WHERE u.id = e.organizer_id AND e.college IS NULL AND u.college IS NOT NULL;
