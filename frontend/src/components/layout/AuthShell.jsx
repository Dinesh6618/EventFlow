import Logo from './Logo.jsx';

const HIGHLIGHTS = [
  'Create and manage college events in minutes',
  'Discover hackathons, workshops, symposiums and more',
  'One place for organizers and participants',
];

/** Split-screen frame shared by the login and register pages. */
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-12 text-white lg:flex">
        <Logo light />
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Plan campus events that people actually show up to.</h2>
          <ul className="mt-8 space-y-3 text-indigo-100">
            {HIGHLIGHTS.map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-200" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-indigo-200">College Event Planning and Management Platform</p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 lg:min-h-0">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
