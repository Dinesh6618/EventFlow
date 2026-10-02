import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { meApi } from '../../api';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ROLES, homePathFor } from '../../utils/constants.js';
import NotificationBell from '../notifications/NotificationBell.jsx';
import Button from '../ui/Button.jsx';
import Logo from './Logo.jsx';

const navClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

/** Top-bar shell used for browsing events (participants, and organizers/admins previewing). */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isParticipant = user.role === ROLES.PARTICIPANT;
  // Participants who were added as volunteers/judges get extra links.
  const { data: assigned } = useApi((signal) => (isParticipant ? meApi.assignments(signal) : Promise.resolve({ assignments: [] })), [isParticipant]);
  const isVolunteer = assigned?.assignments.some((a) => a.staffRole === 'volunteer');
  const isJudge = assigned?.assignments.some((a) => a.staffRole === 'judge');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-6">
            <Link to="/events" aria-label="EventFlow home">
              <Logo />
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
              <NavLink to="/events" end className={navClass}>Events</NavLink>
              {isParticipant && <NavLink to="/my/registrations" className={navClass}>My registrations</NavLink>}
              {isParticipant && <NavLink to="/my/certificates" className={navClass}>Certificates</NavLink>}
              {isVolunteer && <NavLink to="/volunteer" className={navClass}>Volunteering</NavLink>}
              {isJudge && <NavLink to="/judging" className={navClass}>Judging</NavLink>}
            </nav>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <NotificationBell />
            {!isParticipant && (
              <Link to={homePathFor(user.role)} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Dashboard
              </Link>
            )}
            <Link to="/profile" className="hidden max-w-[10rem] truncate text-sm text-slate-600 hover:text-slate-900 sm:block">
              {user.name}
            </Link>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
        {/* Phones: the same links as a second row */}
        <nav aria-label="Main mobile" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-1.5 sm:hidden">
          <NavLink to="/events" end className={navClass}>Events</NavLink>
          {isParticipant && <NavLink to="/my/registrations" className={navClass}>My registrations</NavLink>}
          {isParticipant && <NavLink to="/my/certificates" className={navClass}>Certificates</NavLink>}
          {isVolunteer && <NavLink to="/volunteer" className={navClass}>Volunteering</NavLink>}
          {isJudge && <NavLink to="/judging" className={navClass}>Judging</NavLink>}
          <NavLink to="/profile" className={navClass}>Profile</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
