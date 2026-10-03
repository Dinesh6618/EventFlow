// Adds sample volunteers to the events that are still to come, WITHOUT touching anything else.
// It talks to the running API (so the backend must be up) and can be run again safely: it only
// creates what is missing. Run it with:  npm run seed:volunteers
//
// Each upcoming event gets the five example departments, 14 volunteers (12 assigned, 2 unassigned),
// a task per department, a welcome announcement and two pending applications.

const API = (process.env.EVENTFLOW_API || 'http://localhost:5000').replace(/\/$/, '');
const PASSWORD = 'Password123';
const ORGANIZERS = ['organizer@eventflow.test', 'organizer2@eventflow.test'];

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  return { status: res.status, ok: res.ok, data };
};
const login = async (email) => {
  const res = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  if (!res.ok) throw new Error(`Could not sign in as ${email} (${res.status}). Is the sample data loaded?`);
  return { token: res.data.token, user: res.data.user };
};

const NAMES = [
  'Arun Kumar', 'Bala Raj', 'Chitra Devi', 'Dev Anand', 'Eswari Priya', 'Farhan Ali', 'Gayathri S',
  'Harish M', 'Ishita Roy', 'Jayanth K', 'Kavya Nair', 'Lokesh B', 'Meena T', 'Naveen R',
];

// Required headcount, and how many of the 14 volunteers go into each department (Technical Support and
// Help Desk are deliberately one short so the "needed" state shows).
const DEPARTMENTS = [
  { name: 'Registration', required: 3, assign: 3, location: 'Main Entrance', start: '08:30', end: '11:30', priority: 'high', instructions: '1. Verify participant QR code.\n2. Guide participants to the correct hall.\n3. Report registration problems to the organizer.', task: 'Verify participant registration and guide students', taskTitle: 'Manage Registration Desk', taskPriority: 'high' },
  { name: 'Technical Support', required: 4, assign: 3, location: 'A Block - Lab 3', start: '09:00', end: '16:00', priority: 'high', instructions: 'Assist participants with technical issues during the event.', task: 'Help participants with computers and the network', taskTitle: 'Set up and test the laptops', taskPriority: 'medium' },
  { name: 'Food Management', required: 2, assign: 2, location: 'Cafeteria', start: '11:00', end: '15:00', priority: 'medium', instructions: 'Keep the serving area orderly and tell the organizer when supplies run low.', task: 'Serve lunch and manage the queue', taskTitle: 'Serve lunch and manage the queue', taskPriority: 'low' },
  { name: 'Stage Management', required: 3, assign: 3, location: 'Main Auditorium', start: '09:00', end: '17:00', priority: 'high', instructions: 'Keep sessions on time and look after the speakers.', task: 'Run the stage and look after speakers', taskTitle: 'Run stage cues for the keynote', taskPriority: 'urgent' },
  { name: 'Help Desk', required: 2, assign: 1, location: 'Information Desk', start: '10:00', end: '16:00', priority: 'medium', instructions: 'Answer questions and escalate anything you cannot solve.', task: 'Answer participant questions', taskTitle: 'Answer participant questions', taskPriority: 'medium' },
];

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

console.log(`Using the API at ${API}`);

// 1. The 14 volunteer accounts (created once; signed in if they already exist).
const people = [];
for (const [i, name] of NAMES.entries()) {
  const email = `${name.split(' ')[0].toLowerCase()}.volunteer@eventflow.test`;
  let session;
  const created = await call('POST', '/auth/register', { body: { name, email, password: PASSWORD, role: 'participant', department: 'Computer Science', college: 'Sunrise Institute of Technology' } });
  session = created.ok ? { token: created.data.token, user: created.data.user } : await login(email);
  people.push({ ...session, name, email, index: i });
}
console.log(`${people.length} volunteer accounts ready (password ${PASSWORD}).`);

const sam = await login('participant@eventflow.test');
const riya = await login('participant2@eventflow.test');
let applicationsSent = 0;

for (const organizerEmail of ORGANIZERS) {
  const org = await login(organizerEmail);
  const mine = (await call('GET', '/events/mine', { token: org.token })).data.events ?? [];
  for (const event of mine.filter((e) => e.status !== 'ended')) {
    const base = `/events/${event.id}`;
    console.log(`\n${event.name} (${event.date}, ${organizerEmail})`);

    // 2. Everyone joins the event's volunteer team.
    for (const p of people) await call('POST', `${base}/staff`, { token: org.token, body: { email: p.email, role: 'volunteer' } });

    // 3. The five departments.
    const existing = (await call('GET', `${base}/volunteer-departments`, { token: org.token })).data.departments ?? [];
    const departments = [];
    for (const d of DEPARTMENTS) {
      let found = existing.find((x) => x.name.toLowerCase() === d.name.toLowerCase());
      if (!found) {
        const made = await call('POST', `${base}/volunteer-departments`, { token: org.token, body: { name: d.name, description: '', requiredCount: d.required, location: d.location, shiftStart: d.start, shiftEnd: d.end, instructions: d.instructions, priority: d.priority } });
        found = made.data.department;
      }
      departments.push({ ...d, id: found.id });
    }

    // 4. Morning and afternoon shifts for Technical Support, once.
    const shifts = (await call('GET', `${base}/volunteer-shifts`, { token: org.token })).data.shifts ?? [];
    const tech = departments.find((d) => d.name === 'Technical Support');
    if (!shifts.some((s) => s.departmentId === tech.id)) {
      for (const [name, startTime, endTime] of [['Morning Shift', '08:00', '12:00'], ['Afternoon Shift', '12:00', '16:00']]) {
        await call('POST', `${base}/volunteer-shifts`, { token: org.token, body: { departmentId: tech.id, name, date: event.date, startTime, endTime, requiredCount: 2 } });
      }
    }

    // 5. Assign volunteers, in order, to fill each department.
    const already = new Set(((await call('GET', `${base}/volunteer-assignments`, { token: org.token })).data.assignments ?? []).map((a) => a.volunteer.userId));
    let next = 0;
    const assigned = [];
    for (const d of departments) {
      for (let n = 0; n < d.assign; n += 1) {
        const p = people[next++];
        if (already.has(p.user.id)) continue;
        const res = await call('POST', `${base}/volunteer-assignments`, { token: org.token, body: { userId: p.user.id, departmentId: d.id, date: event.date, startTime: d.start, endTime: d.end, location: d.location, task: d.task } });
        if (res.status === 201) assigned.push({ p, d, id: res.data.assignment.id });
        else console.log(`  skipped ${p.name} -> ${d.name}: ${res.data.message}`);
      }
    }
    // Most accept; the last one in each department is left waiting so the "awaiting acceptance" state shows.
    for (const [i, a] of assigned.entries()) if (i % 4 !== 3) await call('POST', `/volunteer-assignments/${a.id}/accept`, { token: a.p.token });

    // 6. When the event is today, a few are already on duty.
    if (event.date === today) for (const a of assigned.filter((_, i) => i % 4 !== 3).slice(0, 6)) await call('POST', `/volunteer-assignments/${a.id}/check-in`, { token: org.token });

    // 7. One task per department, once.
    const taskCount = ((await call('GET', `${base}/volunteer-tasks`, { token: org.token })).data.tasks ?? []).length;
    if (taskCount === 0) {
      for (const a of assigned.filter((x, i, all) => all.findIndex((y) => y.d.name === x.d.name) === i)) {
        const res = await call('POST', `${base}/volunteer-tasks`, { token: org.token, body: { userId: a.p.user.id, departmentId: a.d.id, title: a.d.taskTitle, description: '', location: a.d.location, date: event.date, startTime: a.d.start, endTime: a.d.end, priority: a.d.taskPriority, instructions: a.d.instructions } });
        if (res.status === 201 && a.d.taskPriority !== 'urgent') await call('POST', `/volunteer-tasks/${res.data.task.id}/accept`, { token: a.p.token });
      }
    }

    // 8. A welcome announcement, once.
    if (((await call('GET', `${base}/volunteer-announcements`, { token: org.token })).data.announcements ?? []).length === 0) {
      await call('POST', `${base}/volunteer-announcements`, { token: org.token, body: { title: 'Welcome, volunteers', message: 'Please read your instructions and check in when you arrive. Thank you for helping!', scope: 'all' } });
    }

    // 9. Two pending applications from the sample students, on the first event only.
    if (applicationsSent === 0) {
      const a = await call('POST', `${base}/volunteers/apply`, { token: sam.token, body: { message: 'I helped at the freshers event.', phone: '+91 98765 43210', year: 3, skills: ['React', 'Communication'], interests: 'Open source', availability: 'Full day', experience: 'Registration desk at the freshers event', preferredDepartment: 'Registration' } });
      const b = await call('POST', `${base}/volunteers/apply`, { token: riya.token, body: { availability: 'Morning', skills: ['UI/UX'], preferredDepartment: 'Help Desk' } });
      applicationsSent = [a, b].filter((r) => r.status === 201).length;
      if (applicationsSent) console.log(`  ${applicationsSent} pending application${applicationsSent === 1 ? '' : 's'} added`);
    }

    const overview = (await call('GET', `${base}/volunteer-overview`, { token: org.token })).data;
    console.log(`  ${overview.totals.total} volunteers, ${overview.totals.assigned} assigned, ${overview.totals.unassigned} unassigned: ` + overview.departments.map((d) => `${d.name} ${d.assigned}/${d.requiredCount}`).join(', '));
  }
}
console.log('\nDone. Sign in as organizer@eventflow.test or organizer2@eventflow.test and open Volunteer Management.');
