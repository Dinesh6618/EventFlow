import { NavLink, Outlet } from 'react-router-dom';
import { useEvent } from '../EventManageLayout.jsx';

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'people', label: 'Volunteers' },
  { to: 'departments', label: 'Departments' },
  { to: 'shifts', label: 'Shifts' },
  { to: 'assignments', label: 'Assignments' },
  { to: 'tasks', label: 'Tasks' },
  { to: 'attendance', label: 'Attendance' },
  { to: 'announcements', label: 'Announcements' },
  { to: 'analytics', label: 'Analytics' },
];

/** Volunteer Management for one event: a sub-navigation and the page it points at. */
export default function VolunteerManagementLayout() {
  const context = useEvent();
  return (
    <div className="space-y-6">
      <nav aria-label="Volunteer management" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="inline-flex gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white p-1">
          {TABS.map((tab) => (
            <li key={tab.label}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) => `block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet context={context} />
    </div>
  );
}
