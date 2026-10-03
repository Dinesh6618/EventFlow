import bcrypt from 'bcryptjs';
import { closeDb, initSchema, query } from '../db.js';
import { createEvent } from '../models/eventModel.js';
import { create as createSession } from '../models/scheduleModel.js';
import * as certificates from '../models/certificateModel.js';
import * as help from '../models/helpModel.js';
import * as volunteerOps from '../models/volunteerOpsModel.js';
import * as volunteerTasks from '../models/volunteerTaskModel.js';
import * as volunteerApplications from '../models/volunteerModel.js';
import * as judging from '../models/judgingModel.js';
import * as teams from '../models/teamModel.js';
import { createUser, updateProfile } from '../models/userModel.js';

// Development sample data. WARNING: wipes all users and events first.
export const SAMPLE_PASSWORD = 'Password123';

const pad = (n) => String(n).padStart(2, '0');
const dayOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

await initSchema();
// CASCADE also empties every table that references users/events (registrations, and later phases).
await query('TRUNCATE users RESTART IDENTITY CASCADE');
await query('ALTER SEQUENCE participant_code_seq RESTART');
await query('ALTER SEQUENCE certificate_seq RESTART');

const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, 10);
const make = (name, email, role, department, college) =>
  createUser({ name, email, role, passwordHash, department, college, emailVerified: true });

const admin = await make('Admin User', 'admin@eventflow.test', 'admin');
const priya = await make('Priya Nair', 'organizer@eventflow.test', 'organizer');
const arjun = await make('Arjun Mehta', 'organizer2@eventflow.test', 'organizer');
const sam = await make('Sam Participant', 'participant@eventflow.test', 'participant', 'Computer Science', 'Sunrise Institute of Technology');
const riya = await make('Riya Sharma', 'participant2@eventflow.test', 'participant', 'Information Technology', 'Sunrise Institute of Technology');
const extra = [
  await make('Karthik Raja', 'karthik@eventflow.test', 'participant', 'Electronics', 'Lakeview Engineering College'),
  await make('Meera Iyer', 'meera@eventflow.test', 'participant', 'Computer Science', 'Lakeview Engineering College'),
  await make('Aditya Verma', 'aditya@eventflow.test', 'participant', 'Mechanical', 'Northfield University'),
  await make('Fatima Khan', 'fatima@eventflow.test', 'participant', 'Information Technology', 'Northfield University'),
];

const contact = (user, phone) => ({ organizerName: user.name, organizerContact: phone });
const deadline = (days, time = '17:00') => `${dayOffset(days)}T${time}`;

const events = [
  [priya, {
    name: 'CodeStorm 24h Hackathon', type: 'Hackathon', date: dayOffset(14), endDate: dayOffset(15), startTime: '09:00', endTime: '09:00',
    venue: 'Main Auditorium', maxParticipants: 150, registrationDeadline: deadline(10), requiresApproval: true, teamEnabled: true, minTeamSize: 2, maxTeamSize: 4,
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

const created = [];
for (const [organizer, data, organizerInfo] of events) {
  created.push(await createEvent(organizer.id, { ...data, ...organizerInfo }));
}

// Sample registrations (inserted directly so the demo data does not depend on today's deadlines).
const [hackathon, mlWorkshop, , cloudSeminar, codingContest] = created;
const addRegistration = (event, user, status) =>
  query(
    `INSERT INTO registrations (event_id, user_id, participant_code, status)
     VALUES ($1, $2, 'EF-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('participant_code_seq')::text, 6, '0'), $3)`,
    [event.id, user.id, status],
  );
const sessions = (event, list) =>
  Promise.all(list.map(([date, startTime, endTime, title, sessionType, venue = event.venue, speaker = '', description = '']) =>
    createSession(event, { date, startTime, endTime, title, sessionType, venue, speaker, description })));

await sessions(hackathon, [
  [dayOffset(14), '09:00', '10:00', 'Opening ceremony and problem statements', 'talk', 'Main Auditorium', 'Dr. Meenakshi Rao', 'Welcome, rules, and the three problem tracks.'],
  [dayOffset(14), '10:00', '13:00', 'Hacking begins', 'competition', 'Computer Labs 1-4'],
  [dayOffset(14), '13:00', '14:00', 'Lunch', 'break', 'Cafeteria'],
  [dayOffset(14), '16:00', '17:00', 'Mentor round 1', 'session', 'Lab corridor', 'Industry mentors'],
  [dayOffset(14), '21:00', '22:00', 'Midnight snacks', 'break', 'Cafeteria'],
  [dayOffset(15), '06:00', '07:00', 'Final push check-in', 'session', 'Computer Labs 1-4'],
  [dayOffset(15), '07:30', '09:00', 'Judging round', 'evaluation_round', 'Main Auditorium', 'Panel of judges'],
]);
await sessions(mlWorkshop, [
  [mlWorkshop.date, '14:00', '14:45', 'What is machine learning?', 'talk', 'Computer Lab 3', 'Priya Nair'],
  [mlWorkshop.date, '14:45', '16:15', 'Hands-on: train your first model', 'workshop', 'Computer Lab 3', 'Priya Nair', 'Bring a laptop with Python installed.'],
  [mlWorkshop.date, '16:15', '17:00', 'Questions and next steps', 'session', 'Computer Lab 3'],
]);
const openSource = created[created.length - 1];
await sessions(openSource, [
  [openSource.date, '09:00', '09:30', 'Kick-off and picking issues', 'session', 'Library Annex'],
  [openSource.date, '10:00', '13:00', 'Contribution sprint', 'workshop', 'Online + Library Annex'],
  [openSource.date, '13:00', '14:00', 'Lunch break', 'break', 'Cafeteria'],
  [openSource.date, '14:00', '15:00', 'Maintainer Q&A', 'talk', 'Online', 'Guest maintainers'],
  [openSource.date, '16:00', '17:00', 'Demo and wrap-up', 'session', 'Library Annex'],
]);

// Help Center demo. The Open Source drive is on today, so help is open for it: Sam and Riya are
// registered, Meera volunteers, and a few requests are already in different states.
await addRegistration(openSource, sam, 'confirmed');
await addRegistration(openSource, riya, 'confirmed');
await addRegistration(openSource, extra[1], 'confirmed');
await query(`INSERT INTO event_staff (event_id, user_id, staff_role, added_by) VALUES ($1, $2, 'volunteer', $3)`, [openSource.id, extra[1].id, arjun.id]);
const helpCategories = await help.listCategories();
const helpCategory = (code) => helpCategories.find((c) => c.code === code);
const wifi = await help.create({ event: openSource, userId: riya.id, category: helpCategory('technical'), description: 'The Wi-Fi keeps dropping in the Library Annex, so we cannot push our changes.', location: 'Library Annex', contactPreference: 'app', details: {} });
await help.assign(wifi, extra[1], arjun.id);
await help.transition(wifi, 'in_progress', extra[1].id);
await help.addUpdate(wifi, extra[1].id, 'Network team is on the way.');
await help.create({ event: openSource, userId: sam.id, category: helpCategory('venue'), description: 'Not enough power sockets near the front row.', location: 'Library Annex', contactPreference: 'in_person', details: {} });
await help.create({ event: openSource, userId: riya.id, category: helpCategory('lost_found'), description: 'Blue steel bottle with a sticker on the side.', location: 'Library Annex', contactPreference: 'app', details: { kind: 'lost', itemName: 'Blue water bottle' } });

// Volunteer Management demo for the same event: three departments, two approved volunteers on duty
// today (all day, so check-in is open whenever you try it), a task, an announcement and two applications.
await query(`INSERT INTO event_staff (event_id, user_id, staff_role, added_by) VALUES ($1, $2, 'volunteer', $3)`, [openSource.id, extra[2].id, arjun.id]);
await addRegistration(openSource, extra[2], 'confirmed');
const volunteerDept = (name, requiredCount, location, instructions, priority = 'medium') =>
  volunteerOps.createDepartment(openSource.id, { name, description: '', requiredCount, location, shiftStart: '08:00', shiftEnd: '18:00', instructions, priority });
const registrationDept = await volunteerDept('Registration', 2, 'Main Entrance', 'Verify each participant\'s QR pass and guide them to the right hall. Report registration problems to the organizer.', 'high');
const techDept = await volunteerDept('Technical Support', 3, 'Library Annex - Lab 3', 'Assist participants with technical issues during the event.', 'high');
await volunteerDept('Help Desk', 2, 'Library Annex', 'Answer questions and escalate anything you cannot solve.');
for (const [name, startTime, endTime] of [['Morning Shift', '08:00', '12:00'], ['Afternoon Shift', '12:00', '16:00'], ['Evening Shift', '16:00', '19:00']]) {
  await volunteerOps.createShift(openSource.id, { departmentId: techDept.id, name, date: openSource.date, startTime, endTime, requiredCount: 1 });
}
const dutyToday = (user, department, task) =>
  volunteerOps.createAssignment(openSource, { userId: user.id, departmentId: department.id, shiftId: null, date: openSource.date, startTime: '00:00', endTime: '23:59', location: department.location, task, allowOverflow: false }, arjun.id);
const meeraDuty = await dutyToday(extra[1], techDept, 'Help participants with technical problems');
await volunteerOps.accept(meeraDuty);
await dutyToday(extra[2], registrationDept, 'Verify participant registration and guide students');
await volunteerTasks.createTask(openSource, { userId: extra[1].id, departmentId: techDept.id, title: 'Fix the projector in the annex', description: '', location: 'Library Annex', date: openSource.date, startTime: '09:00', endTime: '17:00', priority: 'urgent', instructions: '1. Check the HDMI cable.\n2. Replace the lamp if the picture is dim.' }, arjun.id);
const announcement = await volunteerTasks.createAnnouncement(openSource, { title: 'Welcome, volunteers', message: 'Please read your instructions and check in when you arrive. Thank you for helping!', scope: 'all' }, arjun.id);
void announcement;
await volunteerApplications.apply(openSource, sam.id, 'I helped at the freshers event.', { phone: '+91 98765 43210', year: 3, skills: ['React', 'Communication'], interests: 'Open source', availability: 'Full day', experience: 'Registration desk at the freshers event', preferredDepartment: 'Registration' });
await volunteerApplications.apply(openSource, riya.id, '', { availability: 'Morning', preferredDepartment: 'Help Desk', skills: ['UI/UX'] });

// Skills (used for teammate suggestions) and a couple of teams for the hackathon.
const setSkills = (user, department, college, skills) => updateProfile(user.id, { name: user.name, department, college, skills });
await setSkills(sam, sam.department, sam.college, ['React', 'JavaScript', 'Public speaking']);
await setSkills(riya, riya.department, riya.college, ['UI/UX', 'Figma']);
await setSkills(extra[0], extra[0].department, extra[0].college, ['Arduino', 'IoT', 'Python']);
await setSkills(extra[1], extra[1].department, extra[1].college, ['Python', 'Machine learning']);
await setSkills(extra[2], extra[2].department, extra[2].college, ['Product design', 'Presentation']);
await setSkills(extra[3], extra[3].department, extra[3].college, ['Node.js', 'PostgreSQL', 'AWS']);

await addRegistration(hackathon, sam, 'pending');
await addRegistration(hackathon, riya, 'approved');
await addRegistration(hackathon, extra[0], 'pending');
await addRegistration(hackathon, extra[1], 'rejected');
const byteBuilders = await teams.create(hackathon.id, sam.id, {
  name: 'Byte Builders', projectTitle: 'Campus carbon tracker', skills: ['UI/UX Designer', 'Python'],
  projectDescription: 'A web app that shows each department\'s energy use and suggests savings.',
});
const circuit = await teams.create(hackathon.id, extra[0].id, { name: 'Circuit Breakers', projectTitle: 'Smart lab monitor', skills: ['Node.js'], projectDescription: '' });
void byteBuilders; void circuit;

// Judging setup for the hackathon: criteria summing to 100, two judges, every team gets both.
for (const [name, maxScore, description] of [
  ['Innovation', 30, 'How original is the idea?'],
  ['Technical depth', 30, 'Quality and difficulty of the build'],
  ['Impact', 20, 'Value to the campus or community'],
  ['Presentation', 20, 'Clarity of the demo and pitch'],
]) {
  await judging.createCriterion(hackathon.id, { name, maxScore, description });
}
const judgeStaff = (user) =>
  query(`INSERT INTO event_staff (event_id, user_id, staff_role, added_by) VALUES ($1, $2, 'judge', $3)`, [hackathon.id, user.id, priya.id]);
await judgeStaff(await make('Dr. Kiran Rao', 'judge1@eventflow.test', 'participant', 'Faculty', 'Sunrise Institute of Technology'));
await judgeStaff(await make('Prof. Anita Das', 'judge2@eventflow.test', 'participant', 'Faculty', 'Lakeview Engineering College'));
await judging.autoAssign(hackathon.id, 2);
await addRegistration(mlWorkshop, sam, 'confirmed');
await addRegistration(mlWorkshop, extra[1], 'confirmed');
await addRegistration(mlWorkshop, extra[2], 'confirmed');
await addRegistration(mlWorkshop, extra[3], 'cancelled');
await addRegistration(cloudSeminar, riya, 'confirmed');
await addRegistration(cloudSeminar, extra[0], 'confirmed');
await addRegistration(codingContest, sam, 'confirmed');
await addRegistration(codingContest, extra[3], 'confirmed');

// A finished event so the organizer dashboard has a past entry (not shown to participants).
const orientation = await createEvent(priya.id, {
  name: 'Freshers Orientation Talk', type: 'Seminar', date: dayOffset(-10), startTime: '10:00', endTime: '12:00',
  venue: 'Main Auditorium', maxParticipants: 200, registrationDeadline: `${dayOffset(-12)}T17:00`,
  description: 'Welcome session for new students covering campus resources, clubs and academic support.',
  ...contact(priya, 'priya.nair@college.edu'),
});


// The finished event has real history: registrations, check-ins and a speaker session, so
// certificates and feedback can be tried straight away.
for (const [user, checkedIn] of [[sam, true], [riya, true], [extra[0], true], [extra[1], false]]) {
  const rows = await query(
    `INSERT INTO registrations (event_id, user_id, participant_code, status)
     VALUES ($1, $2, 'EF-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('participant_code_seq')::text, 6, '0'), 'confirmed') RETURNING id`,
    [orientation.id, user.id],
  );
  if (checkedIn) {
    await query(
      `INSERT INTO attendance (registration_id, event_id, user_id, status, check_in_time) VALUES ($1, $2, $3, 'checked_in', $4)`,
      [rows[0].id, orientation.id, user.id, `${orientation.date}T10:05:00`],
    );
  }
}
await createSession(orientation, {
  date: orientation.date, startTime: '10:00', endTime: '11:00', title: 'Welcome address', sessionType: 'talk',
  venue: 'Main Auditorium', speaker: 'Prof. R. Iyer', description: 'Introduction to the college and its support services.',
});

// Student profile details, so tables and forms show realistic data.
const profile = async (user, year, phone) => query('UPDATE users SET year = $2, phone = $3 WHERE id = $1', [user.id, year, phone]);
await profile(sam, 3, '+91 98765 43210');
await profile(riya, 2, '+91 98765 43211');
await profile(extra[0], 4, '+91 98765 43212');
await profile(extra[1], 3, '+91 98765 43213');
await profile(extra[2], 1, '+91 98765 43214');
await profile(extra[3], 2, '+91 98765 43215');

// Event page content: format, prizes, rules and FAQs.
await query(
  `UPDATE events SET prizes = $2::jsonb, rules = $3::jsonb, faqs = $4::jsonb, mode = 'offline' WHERE id = $1`,
  [
    hackathon.id,
    JSON.stringify([
      { title: 'First place', description: 'Cash prize of Rs. 50,000 and internship referrals' },
      { title: 'Second place', description: 'Cash prize of Rs. 30,000' },
      { title: 'Third place', description: 'Cash prize of Rs. 15,000 and goodies' },
      { title: 'Best UI/UX', description: 'Special award for the best-designed prototype' },
    ]),
    JSON.stringify([
      'Teams must have between 2 and 4 members.',
      'All code must be written during the event; open-source libraries are allowed.',
      'Every team member must carry their college ID and event pass.',
      'Projects must be submitted before the deadline to be judged.',
      'The decision of the judges is final.',
    ]),
    JSON.stringify([
      { question: 'Do I need a team to register?', answer: 'No. You can register on your own and find teammates from the Team tab afterwards.' },
      { question: 'Is food provided?', answer: 'Yes. Meals and refreshments are provided throughout the 24 hours.' },
      { question: 'What should I bring?', answer: 'Your laptop, charger, college ID and your event pass (QR code).' },
    ]),
  ],
);
await query(`UPDATE events SET mode = 'online', department = NULL WHERE id = $1`, [mlWorkshop.id]);
await query(`UPDATE events SET department = 'Computer Science' WHERE id = $1`, [codingContest.id]);
await query(
  `UPDATE events SET rules = $2::jsonb, faqs = $3::jsonb WHERE id = $1`,
  [
    mlWorkshop.id,
    JSON.stringify(['Bring a laptop with Python installed.', 'Join the meeting link 10 minutes early.']),
    JSON.stringify([{ question: 'Will the session be recorded?', answer: 'Yes, registered participants receive the recording afterwards.' }]),
  ],
);

// A certificate for the finished event so "My Certificates" has something to show.
await certificates.issueManual(orientation, 'participant', [{ name: sam.name, email: sam.email }], priya.id);

console.log(`Seeded 11 users and ${events.length + 1} events with sample registrations. (admin id ${admin.id})`);
console.log(`All sample accounts use the password "${SAMPLE_PASSWORD}":`);
console.log('  admin@eventflow.test        (admin)');
console.log('  organizer@eventflow.test    (organizer)');
console.log('  organizer2@eventflow.test   (organizer)');
console.log('  participant@eventflow.test  (participant)');
console.log('  participant2@eventflow.test (participant)');
console.log('  karthik@, meera@, aditya@, fatima@eventflow.test (participants)');
console.log('  judge1@, judge2@eventflow.test (participants who judge the hackathon)');
await closeDb();
