import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import ProfileAvatar from '../ui/ProfileAvatar.jsx';
import Logo from './Logo.jsx';

const STYLES = {
  dark: {
    shell: 'bg-midnight text-slate-300',
    link: 'text-slate-300 hover:bg-white/10 hover:text-white',
    active: 'grad-brand text-white shadow-lg shadow-indigo-900/40',
    user: 'border-white/10',
    name: 'text-white',
    role: 'text-slate-400',
    logout: 'text-slate-300 hover:bg-white/10 hover:text-white',
  },
  light: {
    shell: 'border-r border-slate-200/80 bg-white/80 text-slate-600 backdrop-blur-xl',
    link: 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700',
    active: 'grad-brand text-white shadow-md shadow-indigo-600/25',
    user: 'border-slate-200',
    name: 'text-slate-900',
    role: 'text-slate-500',
    logout: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  },
};

/**
 * Navigation column used by both shells (dark for organizers/admins, light for students).
 * `items`: [{ to, label, icon, end? }]. `onNavigate` lets a drawer close itself after a click.
 */
export default function Sidebar({ items, user, onLogout, variant = 'dark', onNavigate, header }) {
  const s = STYLES[variant];
  return (
    <div className={`flex h-full flex-col px-4 py-5 ${s.shell}`}>
      <div className="mb-7 flex items-center justify-between px-1">
        <Logo light={variant === 'dark'} />
        {header}
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? !item.prefix}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${isActive ? s.active : s.link}`
            }
          >
            <Icon name={item.icon} className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className={`mt-4 border-t pt-4 ${s.user}`}>
        <div className="flex items-center gap-3 px-1">
          <ProfileAvatar name={user?.name} size="sm" />
          <div className="min-w-0">
            <p className={`truncate text-sm font-semibold ${s.name}`}>{user?.name}</p>
            <p className={`truncate text-xs capitalize ${s.role}`}>{user?.role === 'participant' ? 'Student' : user?.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className={`mt-3 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition-colors ${s.logout}`}
        >
          <Icon name="logout" className="h-5 w-5" />
          Logout
        </button>
      </div>
    </div>
  );
}
