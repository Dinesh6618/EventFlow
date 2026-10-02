import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import DashboardLayout, { ADMIN_NAV, ORGANIZER_NAV } from './components/layout/DashboardLayout.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './components/layout/RouteGuards.jsx';
import { PageLoader } from './components/ui/Spinner.jsx';
import { useAuth } from './context/AuthContext.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import CreateEventPage from './pages/organizer/CreateEventPage.jsx';
import MyEventsPage from './pages/organizer/MyEventsPage.jsx';
import OrganizerDashboard from './pages/organizer/OrganizerDashboard.jsx';
import ParticipantsPage from './pages/organizer/ParticipantsPage.jsx';
import EventDetailsPage from './pages/participant/EventDetailsPage.jsx';
import EventListingPage from './pages/participant/EventListingPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import { ROLES, homePathFor } from './utils/constants.js';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader label="Loading..." />;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Browsing events: open to every signed-in role */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/events" element={<EventListingPage />} />
          <Route path="/events/:id" element={<EventDetailsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={[ROLES.ORGANIZER]} />}>
        <Route path="/organizer" element={<DashboardLayout items={ORGANIZER_NAV} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<OrganizerDashboard />} />
          <Route path="create-event" element={<CreateEventPage />} />
          <Route path="events" element={<MyEventsPage />} />
          <Route path="participants" element={<ParticipantsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
        <Route path="/admin" element={<DashboardLayout items={ADMIN_NAV} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
