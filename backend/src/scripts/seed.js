import bcrypt from 'bcryptjs';
import { closeDb, initSchema, query } from '../db.js';
import { createEvent } from '../models/eventModel.js';
import { createUser } from '../models/userModel.js';

// Development sample data. WARNING: wipes all users and events first.
export const SAMPLE_PASSWORD = 'Password123';

const pad = (n) => String(n).padStart(2, '0');
const dayOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

await initSchema();
await query('TRUNCATE events, users RESTART IDENTITY CASCADE');

const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, 10);
const make = (name, email, role) => createUser({ name, email, role, passwordHash });

const admin = await make('Admin User', 'admin@eventflow.test', 'admin');
const priya = await make('Priya Nair', 'organizer@eventflow.test', 'organizer');
const arjun = await make('Arjun Mehta', 'organizer2@eventflow.test', 'organizer');
await make('Sam Participant', 'participant@eventflow.test', 'participant');
await make('Riya Sharma', 'participant2@eventflow.test', 'participant');

const contact = (user, phone) => ({ organizerName: user.name, organizerContact: phone });
const deadline = (days, time = '17:00') => `${dayOffset(days)}T${time}`;

const events = [
  [priya, {
    name: 'CodeStorm 24h Hackathon', type: 'Hackathon', date: dayOffset(14), startTime: '09:00', endTime: '21:00',
    venue: 'Main Auditorium', maxParticipants: 150, registrationDeadline: deadline(10),
    description: 'A day-long hackathon where teams of up to four build working prototypes around campus sustainability. Mentors from industry will review projects and the best builds win prizes and internship referrals.',
  }, contact(priya, 'priya.nair@college.edu')],
  [priya, {
    name: 'Intro to Machine Learning Workshop', type: 'Workshop', date: dayOffset(5), startTime: '14:00', endTime: '17:00',
    venue: 'Computer Lab 3', maxParticipants: 40, registrationDeadline: deadline(3),
    description: 'A hands-on beginner workshop covering data preparation, training a first model and evaluating it. Bring a laptop with Python installed; notebooks will be shared before the session.',
  }, contact(priya, '+91 98765 43210')],
  [priya, {
    name: 'Annual Tech Symposium', type: 'Symposium', date: dayOffset(30), startTime: '10:00', endTime: '16:30',
    venue: 'Seminar Hall A', maxParticipants: 300, registrationDeadline: deadline(25),
    description: 'Keynotes, paper presentations and poster sessions from students and faculty across departments, followed by a panel discussion on emerging technology careers.',
  }, contact(priya, 'priya.nair@college.edu')],
  [priya, {
    name: 'Cloud Careers Seminar', type: 'Seminar', date: dayOffset(2), startTime: '11:00', endTime: '12:30',
    venue: 'Room B-204', maxParticipants: 60, registrationDeadline: deadline(1),
    description: 'An alumni-led talk about building a career in cloud engineering, including a live Q&A on interviews, certifications and first-job expectations.',
  }, contact(priya, 'priya.nair@college.edu')],
  [arjun, {
    name: 'Inter-College Coding Competition', type: 'Competition', date: dayOffset(9), startTime: '10:00', endTime: '13:00',
    venue: 'Computer Lab 1', maxParticipants: 80, registrationDeadline: deadline(7),
    description: 'Solve algorithmic problems against the clock in a three-hour contest open to all undergraduate students. Rankings are decided by problems solved and penalty time.',
  }, contact(arjun, 'arjun.mehta@college.edu')],
  [arjun, {
    name: 'Spring Cultural Fest', type: 'Cultural Event', date: dayOffset(21), startTime: '17:00', endTime: '22:00',
    venue: 'Open Air Theatre', maxParticipants: 500, registrationDeadline: deadline(18),
    description: 'An evening of music, dance, drama and food stalls celebrating student talent. Performers can register for slots; everyone is welcome to attend.',
  }, contact(arjun, '+91 91234 56780')],
  [arjun, {
    name: 'IoT Build Day', type: 'Technical Event', date: dayOffset(7), startTime: '09:30', endTime: '15:30',
    venue: 'Electronics Lab', maxParticipants: 30, registrationDeadline: deadline(5),
    description: 'Wire up sensors, connect them to a microcontroller and publish live data to a dashboard. Kits are provided and teams of two share one kit.',
  }, contact(arjun, 'arjun.mehta@college.edu')],
  [arjun, {
    name: 'Open Source Contribution Drive', type: 'Workshop', date: dayOffset(0), startTime: '00:00', endTime: '23:59',
    venue: 'Online + Library Annex', maxParticipants: 100, registrationDeadline: deadline(0, '23:00'),
    description: 'A full-day drive to make first contributions to open-source projects, with maintainers on call to review pull requests and answer questions.',
  }, contact(arjun, 'arjun.mehta@college.edu')],
];

for (const [organizer, data, organizerInfo] of events) {
  await createEvent(organizer.id, { ...data, ...organizerInfo });
}

// A finished event so the organizer dashboard has a past entry (not shown to participants).
await createEvent(priya.id, {
  name: 'Freshers Orientation Talk', type: 'Seminar', date: dayOffset(-10), startTime: '10:00', endTime: '12:00',
  venue: 'Main Auditorium', maxParticipants: 200, registrationDeadline: `${dayOffset(-12)}T17:00`,
  description: 'Welcome session for new students covering campus resources, clubs and academic support.',
  ...contact(priya, 'priya.nair@college.edu'),
});

console.log(`Seeded 5 users and ${events.length + 1} events. (admin id ${admin.id})`);
console.log(`All sample accounts use the password "${SAMPLE_PASSWORD}":`);
console.log('  admin@eventflow.test        (admin)');
console.log('  organizer@eventflow.test    (organizer)');
console.log('  organizer2@eventflow.test   (organizer)');
console.log('  participant@eventflow.test  (participant)');
console.log('  participant2@eventflow.test (participant)');
await closeDb();
