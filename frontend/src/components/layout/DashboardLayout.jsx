import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import NotificationBell from '../notifications/NotificationBell.jsx';
import Icon from '../ui/Icon.jsx';
import Logo from './Logo.jsx';

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`;

/** Sidebar shell. On small screens the sidebar becomes a slide-in drawer. */
export default function DashboardLayout({ items }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen lg:flex">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Logo />
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

      {open && <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 px-4 py-5 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-1">
          <Logo light />
          <span className="hidden lg:block"><NotificationBell dark align="left" /></span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <Icon name="x" />
          </button>
        </div>

        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} end={!item.prefix}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <Icon name="logout" />
            Logout
          </button>
        </nav>

        <div className="mt-4 flex items-center gap-3 border-t border-slate-800 px-1 pt-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white">
            {user?.name?.[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="truncate text-xs capitalize text-slate-400">{user?.role}</p>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export const ORGANIZER_NAV = [
  { to: '/organizer/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/organizer/create-event', label: 'Create Event', icon: 'plus' },
  { to: '/organizer/events', label: 'My Events', icon: 'calendar' },
  { to: '/organizer/participants', label: 'Participants', icon: 'users' },
  { to: '/organizer/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/organizer/ai-planner', label: 'AI Planner', icon: 'sparkles', prefix: true },
  { to: '/organizer/profile', label: 'Profile', icon: 'user' },
];

export const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/admin/profile', label: 'Profile', icon: 'user' },
];
