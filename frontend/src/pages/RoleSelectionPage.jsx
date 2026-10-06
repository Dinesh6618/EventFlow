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
    points: ['Discover events', 'Register', 'Participate', 'Grow'],
    text: 'Find events you care about, get your pass and collect certificates.',
  },
  {
    key: 'organizer',
    title: 'Organizer',
    to: '/register?role=organizer',
    cta: 'Get Started',
    icon: 'calendar',
    points: ['Create events', 'Manage participants', 'Track attendance'],
    text: 'Plan and run events with registration, QR check-in and analytics.',
  },
  {
    key: 'volunteer',
    title: 'Volunteer',
    to: '/register?role=participant&next=/volunteer',
    cta: 'Join as a volunteer',
    icon: 'heart',
    points: ['Find events needing help', 'Apply in one tap', 'Scan QR check-ins'],
    text: 'Help run campus events. Sign up, apply to the events you like, and get approved by the organizer.',
  },
  {
    key: 'admin',
    title: 'Admin',
    to: '/login',
    cta: 'Log in as admin',
    icon: 'shield',
    points: ['Manage users', 'Manage events', 'Platform settings'],
    text: 'Oversee the platform. Admin accounts are set up by the platform team, so there is no sign-up.',
  },
];

export default function RoleSelectionPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="EventFlow home"><Logo /></Link>
          <Link to="/login" className="text-sm font-medium text-slate-600 transition-colors hover:text-indigo-700">I already have an account</Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6">
        <div className="page-enter text-center">
          <h1 className="text-3xl font-semibold text-slate-900">Choose Your Role</h1>
          <p className="mt-2 text-base text-slate-500">Select how you want to use EventFlow</p>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => (
            <li key={role.key}>
              <article className="surface flex h-full flex-col p-5" aria-labelledby={`role-${role.key}`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600" aria-hidden="true">
                  <Icon name={role.icon} className="h-5 w-5" />
                </span>
                <h2 id={`role-${role.key}`} className="mt-4 text-lg font-semibold text-slate-900">{role.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{role.text}</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  {role.points.map((p) => (
                    <li key={p} className="flex items-center gap-2">
                      <Icon name="check" className="h-4 w-4 shrink-0 text-indigo-600" />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  <Link to={role.to} className={buttonClasses(role.key === 'admin' ? 'secondary' : 'primary', 'md', 'w-full')}>
                    {role.cta}
                    <Icon name="arrow-right" className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
