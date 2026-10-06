import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import NotificationBell from '../notifications/NotificationBell.jsx';
import Icon from '../ui/Icon.jsx';
import BottomNavigation from './BottomNavigation.jsx';
import Logo from './Logo.jsx';
import Sidebar from './Sidebar.jsx';

/**
 * Organizer / admin shell: light sidebar on desktop, slide-in drawer on tablets and phones,
 * and a bottom bar on phones for the most-used pages.
 */
export default function DashboardLayout({ items, bottomItems }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const bottom = [...(bottomItems ?? []), { label: 'More', icon: 'menu', onClick: () => setOpen(true), expanded: open }];
  const firstLink = items.find((i) => i.to);

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link to={firstLink.to} aria-label="Dashboard home">
          <Logo />
        </Link>
        <div className="-mr-2 flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Icon name="menu" className="h-6 w-6" />
          </button>
        </div>
      </header>

      {open && <div className="animate-toast-in fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          items={items}
          user={user}
          onLogout={handleLogout}
          onNavigate={() => setOpen(false)}
          header={
            <span className="flex items-center gap-1">
              <span className="hidden lg:block"><NotificationBell align="left" /></span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
              >
                <Icon name="x" />
              </button>
            </span>
          }
        />
      </aside>

      <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-6xl">
          <div key={location.pathname.split('/').slice(0, 4).join('/')} className="page-enter">
            <Outlet />
          </div>
        </div>
      </main>

      <BottomNavigation items={bottom} label="Quick" />
    </div>
  );
}

// The first block matches the organizer menu in the product brief ("Create Event" is the primary
// button on the Events page). Tools that sit outside it stay reachable under "More".
export const ORGANIZER_NAV = [
  { to: '/organizer/dashboard', label: 'Overview', icon: 'dashboard' },
  { to: '/organizer/events', label: 'Events', icon: 'calendar', prefix: true },
  { to: '/organizer/participants', label: 'Participants', icon: 'users' },
  { to: '/organizer/section/attendance', label: 'Attendance', icon: 'check' },
  { to: '/organizer/section/schedule', label: 'Schedule', icon: 'clock' },
  { to: '/organizer/section/teams', label: 'Teams', icon: 'user-plus' },
  { to: '/organizer/section/judging', label: 'Judging', icon: 'trophy' },
  { to: '/organizer/section/certificates', label: 'Certificates', icon: 'award' },
  { to: '/organizer/section/feedback', label: 'Feedback', icon: 'message' },
  { to: '/organizer/analytics', label: 'Analytics', icon: 'chart' },
  { heading: 'More' },
  { to: '/organizer/section/scan', label: 'QR Scan', icon: 'qr' },
  { to: '/organizer/section/volunteers', label: 'Volunteer Management', icon: 'heart' },
  { to: '/organizer/section/help', label: 'Help Center', icon: 'shield' },
  { to: '/organizer/profile', label: 'Settings', icon: 'settings' },
];

export const ORGANIZER_BOTTOM = [
  { to: '/organizer/dashboard', label: 'Overview', icon: 'dashboard' },
  { to: '/organizer/events', label: 'Events', icon: 'calendar', end: false },
  { to: '/organizer/create-event', label: 'Create', icon: 'plus' },
  { to: '/organizer/participants', label: 'People', icon: 'users' },
];

export const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/admin/help', label: 'Help Management', icon: 'shield', prefix: true },
  { to: '/admin/volunteers', label: 'Volunteers', icon: 'heart', prefix: true },
  { to: '/admin/email', label: 'Email', icon: 'mail' },
  { to: '/admin/profile', label: 'Settings', icon: 'settings' },
];
