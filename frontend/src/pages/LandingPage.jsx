import { Link } from 'react-router-dom';
import { publicApi } from '../api';
import HeroScene from '../components/landing/HeroScene.jsx';
import Logo from '../components/layout/Logo.jsx';
import PublicNavbar from '../components/layout/PublicNavbar.jsx';
import { buttonClasses } from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import { useApi } from '../hooks/useApi.js';

const FEATURES = [
  { icon: 'calendar', title: 'Event Management', text: 'Create events with schedules, venues and banners, and keep everything about an event in one place.', tone: 'bg-indigo-100 text-indigo-600' },
  { icon: 'ticket', title: 'Smart Registration', text: 'Seat limits, optional approval and instant event passes, so nobody is double-booked.', tone: 'bg-pink-100 text-pink-600' },
  { icon: 'qr', title: 'QR Attendance', text: 'Volunteers scan a personal QR pass at the door. Attendance is recorded the moment it happens.', tone: 'bg-emerald-100 text-emerald-600' },
  { icon: 'users', title: 'Team Collaboration', text: 'Form teams, invite people with the skills you need, and keep your project together.', tone: 'bg-sky-100 text-sky-600' },
  { icon: 'sparkles', title: 'AI Insights', text: 'Practical suggestions drawn from your own event numbers.', tone: 'bg-violet-100 text-violet-600' },
  { icon: 'award', title: 'Certificates', text: 'Numbered certificates anyone can verify online, delivered as PDFs.', tone: 'bg-amber-100 text-amber-600' },
];

const STEPS = [
  ['Explore', 'Find hackathons, workshops and seminars on your campus.'],
  ['Register', 'Reserve a seat in a minute and get your digital pass.'],
  ['Attend', 'Scan in with your QR, follow the live schedule, join a team.'],
  ['Grow', 'Collect verified certificates and share feedback.'],
];

const number = (n) => (n === undefined ? '-' : n.toLocaleString('en-IN'));

function StatTile({ value, label }) {
  return (
    <div className="px-4 py-5 text-center sm:py-6">
      <p className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function LandingPage() {
  const { data: stats } = useApi((signal) => publicApi.stats(signal), []);

  return (
    <div className="min-h-screen bg-white">
      <section id="home" className="bg-midnight relative overflow-hidden text-white">
        <PublicNavbar dark />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-28 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-36 lg:pt-20">
          <div className="page-enter">
            <span className="glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              Smart <span aria-hidden="true">•</span> Simple <span aria-hidden="true">•</span> Secure
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Turn Ideas Into <span className="grad-text">Impactful Events.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">Plan, manage and experience college events with AI-powered insights.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link to="/register?role=organizer" className={buttonClasses('primary', 'lg')}>
                Create an Event
                <Icon name="arrow-right" className="h-5 w-5" />
              </Link>
              <Link to="/events" className={buttonClasses('outlineLight', 'lg')}>Explore Events</Link>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
              {['Free to start', 'QR passes', 'Verified certificates'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Icon name="check" className="h-4 w-4 text-emerald-400" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroScene />
        </div>
      </section>

      <section aria-label="EventFlow in numbers" className="relative z-10 mx-auto -mt-14 max-w-5xl px-4 sm:px-6">
        <div className="surface grid grid-cols-2 divide-slate-100 lg:grid-cols-4 lg:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-slate-100 lg:[&>*]:border-b-0">
          <StatTile value={number(stats?.events)} label="Events Organized" />
          <StatTile value={number(stats?.participants)} label="Participants" />
          <StatTile value={number(stats?.colleges)} label="Colleges" />
          <StatTile value={stats ? (stats.satisfaction === null ? 'New' : `${stats.satisfaction}%`) : '-'} label="Satisfaction" />
        </div>
        <p className="mt-2 text-center text-xs text-slate-400">Live totals from this EventFlow workspace. Satisfaction is the average feedback rating.</p>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Features</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Everything You Need in One Platform</h2>
          <p className="mt-3 text-slate-500">From the first idea to the last certificate, EventFlow keeps students and organizers on the same page.</p>
        </div>
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="surface surface-lift p-7">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${f.tone}`}>
                <Icon name={f.icon} className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-lg font-bold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="about" className="bg-slate-50 py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Built for campus life</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">From &ldquo;I heard about it&rdquo; to &ldquo;I have the certificate&rdquo;</h2>
            <p className="mt-4 text-slate-600">
              EventFlow connects students, organizers and admins. Students find an event, register, get a pass and show up. Organizers see who is coming, who arrived and how it went, without spreadsheets.
            </p>
            <Link to="/choose-role" className={buttonClasses('primary', 'lg', 'mt-8')}>Get Started</Link>
          </div>
          <ol className="space-y-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="surface flex items-start gap-4 p-5">
                <span className="grad-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white">{i + 1}</span>
                <div>
                  <h3 className="font-bold text-slate-900">{title}</h3>
                  <p className="text-sm text-slate-500">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="bg-midnight relative overflow-hidden rounded-[2rem] px-6 py-14 text-center text-white sm:px-14">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to run your next event?</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">Join as a student to discover events, or as an organizer to create them.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/choose-role" className={buttonClasses('primary', 'lg')}>Get Started</Link>
            <Link to="/verify" className={buttonClasses('outlineLight', 'lg')}>Verify a certificate</Link>
          </div>
        </div>
      </section>

      <footer id="contact" className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-slate-500">Turn Ideas Into Impactful Events.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
            <Link to="/login" className="hover:text-indigo-700">Login</Link>
            <Link to="/choose-role" className="hover:text-indigo-700">Get Started</Link>
            <Link to="/verify" className="hover:text-indigo-700">Verify a certificate</Link>
            <a href="#features" className="hover:text-indigo-700">Features</a>
          </nav>
          <p className="text-sm text-slate-500">
            Questions? Ask your college&apos;s event team, or write to <span className="font-medium text-slate-700">the organizer listed on any event</span>.
          </p>
        </div>
      </footer>
    </div>
  );
}
