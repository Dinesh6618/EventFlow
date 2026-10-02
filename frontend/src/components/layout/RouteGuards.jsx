import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { homePathFor } from '../../utils/constants.js';
import { PageLoader } from '../ui/Spinner.jsx';

/** Signed-in users only; optionally restricted to certain roles. */
export function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Checking your session..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return <Outlet />;
}

/** Login/register pages: signed-in users are sent to their own home instead. */
export function PublicOnlyRoute() {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader label="Checking your session..." />;
  if (user) return <Navigate to={homePathFor(user.role)} replace />;
  return <Outlet />;
}
