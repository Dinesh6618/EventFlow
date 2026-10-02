import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, homePathFor } from '../../utils/constants.js';
import NotificationBell from '../notifications/NotificationBell.jsx';
import Button from '../ui/Button.jsx';
import Logo from './Logo.jsx';
import StudentLayout from './StudentLayout.jsx';

/**
 * Shell for pages that more than one role can open (event pages, profile, notifications).
 * Students get the full student experience; organizers and admins get a light top bar with a way back.
 */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (user.role === ROLES.PARTICIPANT) return <StudentLayout />;

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to={homePathFor(user.role)} aria-label="EventFlow dashboard">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell />
            <Link to={homePathFor(user.role)} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              Dashboard
            </Link>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
