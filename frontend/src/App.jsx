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
import AiPlanPage from './pages/organizer/AiPlanPage.jsx';
import AiPlannerPage from './pages/organizer/AiPlannerPage.jsx';
import AnalyticsPage from './pages/organizer/AnalyticsPage.jsx';
import MyEventsPage from './pages/organizer/MyEventsPage.jsx';
import OrganizerDashboard from './pages/organizer/OrganizerDashboard.jsx';
import AiPlanTab from './pages/organizer/event/AiPlanTab.jsx';
import AnnouncementsPage from './pages/organizer/event/AnnouncementsPage.jsx';
import AttendancePage from './pages/organizer/event/AttendancePage.jsx';
import ControlCenterPage from './pages/organizer/event/ControlCenterPage.jsx';
import InsightsPage from './pages/organizer/event/InsightsPage.jsx';
import CertificatesPage from './pages/organizer/event/CertificatesPage.jsx';
import FeedbackPage from './pages/organizer/event/FeedbackPage.jsx';
import JudgingPage from './pages/organizer/event/JudgingPage.jsx';
import SchedulePage from './pages/organizer/event/SchedulePage.jsx';
import TeamsPage from './pages/organizer/event/TeamsPage.jsx';
import EventManageLayout from './pages/organizer/event/EventManageLayout.jsx';
import OverviewPage from './pages/organizer/event/OverviewPage.jsx';
import ScanPage from './pages/organizer/event/ScanPage.jsx';
import StaffPage from './pages/organizer/event/StaffPage.jsx';
import ParticipantsPage from './pages/organizer/ParticipantsPage.jsx';
import { VolunteerEvent, VolunteerHome } from './pages/volunteer/VolunteerPages.jsx';
import EventDetailsPage from './pages/participant/EventDetailsPage.jsx';
import EventListingPage from './pages/participant/EventListingPage.jsx';
import { JudgingEvent, JudgingHome, JudgingTeam } from './pages/judge/JudgePages.jsx';
import MyCertificatesPage from './pages/participant/MyCertificatesPage.jsx';
import MyRegistrationsPage from './pages/participant/MyRegistrationsPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import VerifyPage from './pages/VerifyPage.jsx';
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

      {/* Certificate verification is public: anyone holding a certificate can check it */}
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/verify/:code" element={<VerifyPage />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Browsing events: open to every signed-in role */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/events" element={<EventListingPage />} />
          <Route path="/events/:id" element={<EventDetailsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={[ROLES.PARTICIPANT]} />}>
        <Route element={<AppLayout />}>
          <Route path="/my/registrations" element={<MyRegistrationsPage />} />
          <Route path="/my/certificates" element={<MyCertificatesPage />} />
          <Route path="/judging" element={<JudgingHome />} />
          <Route path="/judging/events/:eventId" element={<JudgingEvent />} />
          <Route path="/judging/events/:eventId/teams/:teamId" element={<JudgingTeam />} />
          <Route path="/volunteer" element={<VolunteerHome />} />
          <Route path="/volunteer/events/:eventId" element={<VolunteerEvent />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={[ROLES.ORGANIZER]} />}>
        <Route path="/organizer" element={<DashboardLayout items={ORGANIZER_NAV} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<OrganizerDashboard />} />
          <Route path="create-event" element={<CreateEventPage />} />
          <Route path="events" element={<MyEventsPage />} />
          <Route path="events/:eventId" element={<EventManageLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="control-center" element={<ControlCenterPage />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="judging" element={<JudgingPage />} />
            <Route path="certificates" element={<CertificatesPage />} />
            <Route path="feedback" element={<FeedbackPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="ai-plan" element={<AiPlanTab />} />
            <Route path="staff" element={<StaffPage />} />
          </Route>
          <Route path="participants" element={<ParticipantsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="ai-planner" element={<AiPlannerPage />} />
          <Route path="ai-planner/:id" element={<AiPlanPage />} />
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
