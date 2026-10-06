import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { meApi } from '../../api';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import NotificationBell from '../notifications/NotificationBell.jsx';
import Icon from '../ui/Icon.jsx';
import ProfileAvatar from '../ui/ProfileAvatar.jsx';
import BottomNavigation from './BottomNavigation.jsx';
import Logo from './Logo.jsx';

export const STUDENT_NAV = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/events', label: 'Explore', icon: 'compass', prefix: true },
  { to: '/my/registrations', label: 'My Events', icon: 'ticket', prefix: true },
  { to: '/my/schedule', label: 'Schedule', icon: 'clock' },
  { to: '/my/certificates', label: 'Certificates', icon: 'award' },
];

// Profile is the sixth item of the student menu: on phones it is a tab, on desktop it is the avatar menu.
const BOTTOM_NAV = [
  ...STUDENT_NAV.map((item) => ({ ...item, end: item.prefix ? false : undefined })),
  { to: '/profile', label: 'Profile', icon: 'user' },
];

const VOLUNTEER_BOTTOM_NAV = [
  { to: '/volunteer', label: 'Home', icon: 'home' },
  { to: '/volunteer/tasks', label: 'Tasks', icon: 'check' },
  { to: '/volunteer/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/notifications', label: 'Alerts', icon: 'bell' },
  { to: '/volunteer/profile', label: 'Profile', icon: 'user' },
];

/** Avatar button with a dropdown: profile, the less-used student areas, and logout. */
function ProfileMenu({ user, extra, onLogout }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50';

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-slate-100"
      >
        <ProfileAvatar name={user.name} size="sm" />
        <span className="hidden max-w-[9rem] truncate text-sm font-medium text-slate-800 sm:block">{user.name}</span>
        <Icon name="chevron-down" className="hidden h-4 w-4 text-slate-400 sm:block" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)} className={item}>
            <Icon name="user" className="h-4 w-4 text-slate-400" />
            Profile
          </Link>
          {extra.map((e) => (
            <Link key={e.to} to={e.to} role="menuitem" onClick={() => setOpen(false)} className={item}>
              <Icon name={e.icon} className="h-4 w-4 text-slate-400" />
              {e.label}
            </Link>
          ))}
          <button type="button" role="menuitem" onClick={onLogout} className={`${item} border-t border-slate-100`}>
            <Icon name="logout" className="h-4 w-4 text-slate-400" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

/** Student shell: one top navigation bar, with a bottom bar on phones. */
export default function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: assigned } = useApi((signal) => meApi.assignments(signal), []);

  const extra = [
    { to: '/my/team', label: 'My Team', icon: 'users' },
    { to: '/help', label: 'Get Help', icon: 'shield' },
    { to: '/volunteer', label: 'Volunteer', icon: 'qr' },
  ];
  if (assigned?.assignments.some((a) => a.staffRole === 'judge')) extra.push({ to: '/judging', label: 'Judging', icon: 'trophy' });

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const inVolunteer = location.pathname.startsWith('/volunteer');

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link to="/home" aria-label="EventFlow home">
              <Logo />
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
              {STUDENT_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={!item.prefix}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationBell />
            <ProfileMenu user={user} extra={extra} onLogout={handleLogout} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-12">
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>

      <BottomNavigation items={inVolunteer ? VOLUNTEER_BOTTOM_NAV : BOTTOM_NAV} label={inVolunteer ? 'Volunteer' : 'Student'} />
    </div>
  );
}
