import { Link } from 'react-router-dom';
import Logo from '../components/layout/Logo.jsx';
import PublicNavbar from '../components/layout/PublicNavbar.jsx';
import Badge from '../components/ui/Badge.jsx';
import { buttonClasses } from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';

const FEATURES = [
  { icon: 'calendar', title: 'Event Management', text: 'Create events with schedules, venues and banners, and keep everything about an event in one place.' },
  { icon: 'ticket', title: 'Smart Registration', text: 'Seat limits, optional approval and instant event passes, so nobody is double-booked.' },
  { icon: 'qr', title: 'QR Attendance', text: 'Volunteers scan a personal QR pass at the door. Attendance is recorded the moment it happens.' },
  { icon: 'users', title: 'Team Collaboration', text: 'Form teams, invite people with the skills you need, and keep your project together.' },
  { icon: 'sparkles', title: 'AI Insights', text: 'Practical suggestions drawn from your own event numbers.' },
  { icon: 'award', title: 'Certificates', text: 'Numbered certificates anyone can verify online, delivered as PDFs.' },
];

const STEPS = [
  ['Explore', 'Find hackathons, workshops and seminars on your campus.'],
  ['Register', 'Reserve a seat in a minute and get your digital pass.'],
  ['Attend and grow', 'Scan in with your QR, follow the live schedule, join a team, then collect verified certificates.'],
];

// Sample figures for the picture of the organizer dashboard. Nothing here comes from the database.
const SAMPLE_STATS = [
  ['Total Events', '12'],
  ['Registrations', '480'],
  ['Attendance', '80%'],
  ['Upcoming Events', '3'],
];
const SAMPLE_BARS = [['Mon', 30], ['Tue', 45], ['Wed', 40], ['Thu', 65], ['Fri', 80], ['Sat', 55], ['Sun', 90]];
const SAMPLE_EVENTS = [
  ['Inter-college Hackathon', '14 Mar', '120 registered'],
  ['Design Workshop', '18 Mar', '60 registered'],
  ['Cultural Night', '22 Mar', '200 registered'],
];

/** A still picture of the organizer overview. It is static: no data, no links. */
function DashboardPreview() {
  return (
    <figure className="mx-auto mt-12 max-w-4xl text-left">
      <Card className="p-4 sm:p-6">
        <div aria-hidden="true">
          <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-slate-900">Overview</p>
            <Badge tone="slate">Preview</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {SAMPLE_STATS.map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="text-2xl font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Registrations this week</p>
              <div className="mt-3 flex h-32 items-end gap-2 border-b border-slate-200">
                {SAMPLE_BARS.map(([day, value]) => (
                  <div key={day} className="flex h-full flex-1 items-end">
                    <div className="w-full rounded-t bg-indigo-600" style={{ height: `${value}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-2 text-xs text-slate-400">
                {SAMPLE_BARS.map(([day]) => <span key={day} className="flex-1 text-center">{day}</span>)}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">Upcoming events</p>
              <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
                {SAMPLE_EVENTS.map(([name, date, count]) => (
                  <li key={name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-900">{name}</span>
                    <span className="shrink-0 text-slate-500">{date} - {count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Card>
      <figcaption className="mt-3 text-center text-sm text-slate-500">Preview of the organizer dashboard, shown with sample numbers.</figcaption>
    </figure>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNavbar />

      <section className="border-b border-slate-200 bg-slate-50">
        <div className="page-enter mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold text-slate-900 sm:text-5xl">Every Campus Event. One Flow.</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">Plan events, register in a minute and check in with a QR pass, all in one place.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/choose-role" className={buttonClasses('primary', 'lg')}>Get Started</Link>
            <Link to="/events" className={buttonClasses('secondary', 'lg')}>Explore Events</Link>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section id="features" className="scroll-mt-14">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Everything You Need in One Platform</h2>
            <p className="mt-3 text-slate-600">From the first idea to the last certificate, EventFlow keeps students and organizers on the same page.</p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <Card className="h-full p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Icon name={f.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{f.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="how-it-works" className="text-center text-2xl font-semibold text-slate-900 sm:text-3xl">How it works</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map(([title, text], i) => (
              <li key={title}>
                <Card className="h-full p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">{i + 1}</span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-slate-500">Every Campus Event. One Flow.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
            <Link to="/events" className="transition-colors hover:text-indigo-700">Explore Events</Link>
            <Link to="/login" className="transition-colors hover:text-indigo-700">Login</Link>
            <Link to="/choose-role" className="transition-colors hover:text-indigo-700">Get Started</Link>
            <Link to="/verify" className="transition-colors hover:text-indigo-700">Verify a certificate</Link>
          </nav>
          <p className="text-sm text-slate-500">
            Questions? Ask your college&apos;s event team, or write to <span className="font-medium text-slate-700">the organizer listed on any event</span>.
          </p>
        </div>
      </footer>
    </div>
  );
}
