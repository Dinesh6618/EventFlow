import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import ProfileAvatar from '../ui/ProfileAvatar.jsx';
import Logo from './Logo.jsx';

/**
 * Light navigation column for organizers and admins.
 * `items`: [{ to, label, icon, end?, prefix? }] or a { heading } entry that starts a labelled group.
 * `onNavigate` lets a drawer close itself after a click.
 */
export default function Sidebar({ items, user, onLogout, onNavigate, header }) {
  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white px-3 py-4">
      <div className="mb-5 flex items-center justify-between px-2">
        <Logo />
        {header}
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {items.map((item) =>
          item.heading ? (
            <p key={item.heading} className="mb-1 mt-5 px-3 text-xs font-medium text-slate-400">
              {item.heading}
            </p>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? !item.prefix}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon name={item.icon} className="h-[1.15rem] w-[1.15rem]" />
              {item.label}
            </NavLink>
          ),
        )}
      </nav>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="flex items-center gap-3 px-2">
          <ProfileAvatar name={user?.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
            <p className="truncate text-xs capitalize text-slate-500">{user?.role === 'participant' ? 'Student' : user?.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <Icon name="logout" className="h-[1.15rem] w-[1.15rem]" />
          Logout
        </button>
      </div>
    </div>
  );
}
