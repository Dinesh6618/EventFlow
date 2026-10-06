import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';

/** Phone navigation bar. Each item is a link, or a button when it has `onClick` (for "More"). */
export default function BottomNavigation({ items, label = 'Primary' }) {
  const base = 'flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[0.7rem] font-medium transition-colors';
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl items-stretch gap-1 px-2 py-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex flex-1">
            {item.onClick ? (
              <button type="button" onClick={item.onClick} aria-expanded={item.expanded} className={`${base} text-slate-500 hover:text-indigo-700`}>
                <Icon name={item.icon} className="h-5 w-5" />
                {item.label}
              </button>
            ) : (
              <NavLink
                to={item.to}
                end={item.end ?? true}
                className={({ isActive }) => `${base} ${isActive ? 'text-indigo-700' : 'text-slate-500 hover:text-indigo-700'}`}
              >
                <Icon name={item.icon} className="h-5 w-5" />
                {item.label}
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
