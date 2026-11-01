import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider.js';
import { LoginPage, roleRoutes } from './auth/LoginPage.js';
import { RequireRole } from './auth/RequireRole.js';
import { AppIndexRedirect, RoleHomePage } from './pages/RoleHomePage.js';
import { AdminUsersPage } from './users/AdminUsersPage.js';
import { StudentDashboardPage } from './grievances/StudentDashboardPage.js';
import { GrievanceFormPage } from './grievances/GrievanceFormPage.js';
import { GrievanceDetailPage } from './grievances/GrievanceDetailPage.js';
import { SubmissionConfirmationPage } from './grievances/SubmissionConfirmationPage.js';
import { HandlerQueuePage } from './grievances/HandlerQueuePage.js';
import { ReviewerQueuePage } from './grievances/ReviewerQueuePage.js';
import { NotificationsPage } from './notifications/NotificationsPage.js';
import { ReportsPage } from './reports/ReportsPage.js';
import { CategoryManagementPage } from './administration/CategoryManagementPage.js';
import { PublicLandingPage } from './pages/PublicLandingPage.js';

function AppRoutes(): ReactNode {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route
        path="/"
        element={
          loading ? (
            <main className="page-wait">Preparing SGRS…</main>
          ) : user ? (
            <Navigate to={roleRoutes[user.role]} replace />
          ) : (
            <PublicLandingPage />
          )
        }
      />
      <Route
        path="/login"
        element={
          loading ? (
            <main className="page-wait">Checking your session…</main>
          ) : user ? (
            <Navigate to={roleRoutes[user.role]} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/app"
        element={
          <RequireRole>
            <AppIndexRedirect />
          </RequireRole>
        }
      />
      <Route
        path="/app/notifications"
        element={
          <RequireRole roles={['STUDENT', 'HANDLER', 'REVIEWER', 'ADMINISTRATOR']}>
            <NotificationsPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/student"
        element={
          <RequireRole roles={['STUDENT']}>
            <StudentDashboardPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/student/grievances/new"
        element={
          <RequireRole roles={['STUDENT']}>
            <GrievanceFormPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/student/grievances/:grievanceId/edit"
        element={
          <RequireRole roles={['STUDENT']}>
            <GrievanceFormPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/student/grievances/:grievanceId/submitted"
        element={
          <RequireRole roles={['STUDENT']}>
            <SubmissionConfirmationPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/student/grievances/:grievanceId"
        element={
          <RequireRole roles={['STUDENT']}>
            <GrievanceDetailPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/handler"
        element={
          <RequireRole roles={['HANDLER']}>
            <HandlerQueuePage />
          </RequireRole>
        }
      />
      <Route
        path="/app/handler/grievances/:grievanceId"
        element={
          <RequireRole roles={['HANDLER']}>
            <GrievanceDetailPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/reviewer"
        element={
          <RequireRole roles={['REVIEWER']}>
            <ReviewerQueuePage />
          </RequireRole>
        }
      />
      <Route
        path="/app/reviewer/grievances/:grievanceId"
        element={
          <RequireRole roles={['REVIEWER']}>
            <GrievanceDetailPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/admin/grievances/:grievanceId"
        element={
          <RequireRole roles={['ADMINISTRATOR']}>
            <GrievanceDetailPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/admin"
        element={
          <RequireRole roles={['ADMINISTRATOR']}>
            <RoleHomePage role="ADMINISTRATOR" />
          </RequireRole>
        }
      />
      <Route
        path="/app/admin/users"
        element={
          <RequireRole roles={['ADMINISTRATOR']}>
            <AdminUsersPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/admin/reports"
        element={
          <RequireRole roles={['ADMINISTRATOR']}>
            <ReportsPage role="ADMINISTRATOR" />
          </RequireRole>
        }
      />
      <Route
        path="/app/admin/categories"
        element={
          <RequireRole roles={['ADMINISTRATOR']}>
            <CategoryManagementPage />
          </RequireRole>
        }
      />
      <Route
        path="/app/management"
        element={
          <RequireRole roles={['MANAGEMENT']}>
            <RoleHomePage role="MANAGEMENT" />
          </RequireRole>
        }
      />
      <Route
        path="/app/management/reports"
        element={
          <RequireRole roles={['MANAGEMENT']}>
            <ReportsPage role="MANAGEMENT" />
          </RequireRole>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App(): ReactNode {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
