import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';

/** Centered frame shared by the login, register and verification pages. */
export default function AuthShell({ title, subtitle, children }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="page-enter w-full max-w-md">
        <Link to="/" aria-label="EventFlow home" className="mb-6 flex justify-center">
          <Logo />
        </Link>
        <div className="surface p-6 sm:p-8">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
