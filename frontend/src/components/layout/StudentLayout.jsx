import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { meApi } from '../../api';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import NotificationBell from '../notifications/NotificationBell.jsx';
import Icon from '../ui/Icon.jsx';
import ProfileAvatar from '../ui/ProfileAvatar.jsx';
import BottomNavigation from './BottomNavigation.jsx';
import Logo from './Logo.jsx';
import Sidebar from './Sidebar.jsx';

export const STUDENT_NAV = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/events', label: 'Explore Events', icon: 'compass', prefix: true },
  { to: '/my/registrations', label: 'My Events', icon: 'ticket', prefix: true },
  { to: '/my/certificates', label: 'Certificates', icon: 'award' },
  { to: '/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

const BOTTOM_NAV = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/events', label: 'Explore', icon: 'compass', end: false },
  { to: '/my/registrations', label: 'My Events', icon: 'ticket', end: false },
  { to: '/help', label: 'Help', icon: 'shield', end: false },
  { to: '/my/certificates', label: 'Certificates', icon: 'award' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

const VOLUNTEER_BOTTOM_NAV = [
  { to: '/volunteer', label: 'Home', icon: 'home' },
  { to: '/volunteer/tasks', label: 'Tasks', icon: 'check' },
  { to: '/volunteer/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/notifications', label: 'Alerts', icon: 'bell' },
  { to: '/volunteer/profile', label: 'Profile', icon: 'user' },
];

function TopSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/events?q=${encodeURIComponent(q.trim())}` : '/events');
      }}
      className="relative hidden w-full max-w-md md:block"
    >
      <label htmlFor="top-search" className="sr-only">Search events</label>
      <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id="top-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search events, workshops, hackathons..."
        className="w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
      />
    </form>
  );
}

/** Student shell: light sidebar on desktop, top bar everywhere, bottom navigation on phones. */
export default function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: assigned } = useApi((signal) => meApi.assignments(signal), []);

  const extra = [];
  extra.push({ to: '/help', label: 'Get Help', icon: 'shield', prefix: true });
  extra.push({ to: '/volunteer', label: 'Volunteer', icon: 'qr', prefix: true });
  if (assigned?.assignments.some((a) => a.staffRole === 'judge')) extra.push({ to: '/judging', label: 'Judging', icon: 'trophy', prefix: true });
  const items = [...STUDENT_NAV.slice(0, 5), ...extra, STUDENT_NAV[5]];

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <Sidebar items={items} user={user} onLogout={handleLogout} variant="light" />
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <Link to="/home" aria-label="EventFlow home" className="lg:hidden">
              <Logo />
            </Link>
            <TopSearch />
            <div className="flex items-center gap-1.5 sm:gap-3">
              <Link to="/events" aria-label="Search events" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden">
                <Icon name="search" className="h-5 w-5" />
              </Link>
              <NotificationBell />
              <Link to="/profile" className="flex items-center gap-2.5 rounded-xl p-1 pr-2 hover:bg-slate-100" aria-label="Your profile">
                <ProfileAvatar name={user.name} size="sm" />
                <span className="hidden max-w-[9rem] truncate text-sm font-semibold text-slate-800 sm:block">{user.name}</span>
              </Link>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-12">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNavigation items={location.pathname.startsWith('/volunteer') ? VOLUNTEER_BOTTOM_NAV : BOTTOM_NAV} label={location.pathname.startsWith('/volunteer') ? 'Volunteer' : 'Student'} />
    </div>
  );
}
