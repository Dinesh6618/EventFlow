import { Link } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import Logo from './Logo.jsx';

const HIGHLIGHTS = [
  ['compass', 'Discover hackathons, workshops, seminars and more'],
  ['ticket', 'Register in a minute and get a digital QR pass'],
  ['award', 'Collect certificates anyone can verify'],
];

/** Split-screen frame shared by the login and register pages. */
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="bg-midnight hidden flex-col justify-between p-12 text-white lg:flex">
        <Link to="/" aria-label="EventFlow home"><Logo light /></Link>
        <div>
          <h2 className="max-w-md text-4xl font-extrabold leading-tight">
            Turn Ideas Into <span className="grad-text">Impactful Events.</span>
          </h2>
          <ul className="mt-9 space-y-4 text-slate-200">
            {HIGHLIGHTS.map(([icon, line]) => (
              <li key={line} className="flex items-center gap-3">
                <span className="glass-dark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-indigo-200"><Icon name={icon} className="h-5 w-5" /></span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-slate-400">Smart <span aria-hidden="true">•</span> Simple <span aria-hidden="true">•</span> Secure</p>
      </aside>

      <main id="main" className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 lg:min-h-0">
        <div className="page-enter w-full max-w-md">
          <Link to="/" aria-label="EventFlow home" className="mb-8 inline-block lg:hidden"><Logo /></Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
