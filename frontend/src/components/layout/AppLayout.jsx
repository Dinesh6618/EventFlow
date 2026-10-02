import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, homePathFor } from '../../utils/constants.js';
import Button from '../ui/Button.jsx';
import Logo from './Logo.jsx';

/** Top-bar shell used for browsing events (participants, and organizers/admins previewing). */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/events" aria-label="EventFlow home">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {user.role !== ROLES.PARTICIPANT && (
              <Link to={homePathFor(user.role)} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Dashboard
              </Link>
            )}
            <span className="hidden max-w-[10rem] truncate text-sm text-slate-600 sm:block">{user.name}</span>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
