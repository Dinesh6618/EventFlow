import { Link } from 'react-router-dom';
import { buttonClasses } from '../components/ui/Button.jsx';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-semibold text-indigo-600">404</p>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The page you are looking for does not exist.</p>
      <Link to="/" className={buttonClasses('primary', 'md', 'mt-6')}>
        Go home
      </Link>
    </div>
  );
}
