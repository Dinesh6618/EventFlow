import { Link } from 'react-router-dom';
import Logo from '../components/layout/Logo.jsx';
import { buttonClasses } from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';

const ROLES = [
  {
    key: 'student',
    title: 'Student',
    to: '/register?role=participant',
    cta: 'Get Started',
    icon: 'compass',
    art: 'from-violet-500 to-indigo-600',
    points: ['Discover events', 'Register', 'Participate', 'Grow'],
    text: 'Find events you care about, get your pass and collect certificates.',
  },
  {
    key: 'organizer',
    title: 'Organizer',
    to: '/register?role=organizer',
    cta: 'Get Started',
    icon: 'calendar',
    art: 'from-blue-500 to-violet-600',
    points: ['Create events', 'Manage participants', 'Track attendance'],
    text: 'Plan and run events with registration, QR check-in and analytics.',
  },
  {
    key: 'volunteer',
    title: 'Volunteer',
    to: '/register?role=participant&next=/volunteer',
    cta: 'Join as a volunteer',
    icon: 'heart',
    art: 'from-emerald-500 to-teal-600',
    points: ['Find events needing help', 'Apply in one tap', 'Scan QR check-ins'],
    text: 'Help run campus events. Sign up, apply to the events you like, and get approved by the organizer.',
  },
  {
    key: 'admin',
    title: 'Admin',
    to: '/login',
    cta: 'Log in as admin',
    icon: 'shield',
    art: 'from-fuchsia-500 to-pink-600',
    points: ['Manage users', 'Manage events', 'Platform settings'],
    text: 'Oversee the platform. Admin accounts are set up by the platform team, so there is no sign-up.',
  },
];

/** Illustration tile: layered shapes around the role icon. */
function Art({ icon, gradient }) {
  return (
    <div className={`relative flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${gradient}`} aria-hidden="true">
      <span className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15" />
      <span className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-black/10" />
      <span className="absolute bottom-4 right-8 h-8 w-8 rotate-12 rounded-lg bg-white/20" />
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-white shadow-lg backdrop-blur">
        <Icon name={icon} className="h-8 w-8" />
      </span>
    </div>
  );
}

export default function RoleSelectionPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/" aria-label="EventFlow home"><Logo /></Link>
        <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-indigo-700">I already have an account</Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <div className="page-enter text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Choose Your Role</h1>
          <p className="mt-3 text-lg text-slate-500">Select how you want to use EventFlow</p>
        </div>

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role, i) => (
            <li key={role.key} className="page-enter" style={{ animationDelay: `${i * 70}ms` }}>
              <article className="surface surface-lift flex h-full flex-col p-5" aria-labelledby={`role-${role.key}`}>
                <Art icon={role.icon} gradient={role.art} />
                <h2 id={`role-${role.key}`} className="mt-5 text-xl font-extrabold text-slate-900">{role.title}</h2>
                <p className="mt-1.5 text-sm text-slate-500">{role.text}</p>
                <ul className="mt-4 space-y-2 text-sm font-medium text-slate-700">
                  {role.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"><Icon name="check" className="h-3 w-3" /></span>
                      {p}
                    </li>
                  ))}
                </ul>
                <Link to={role.to} className={buttonClasses(role.key === 'admin' ? 'secondary' : 'primary', 'md', 'mt-auto w-full')} style={{ marginTop: '1.5rem' }}>
                  {role.cta}
                  <Icon name="arrow-right" className="h-4 w-4" />
                </Link>
              </article>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
