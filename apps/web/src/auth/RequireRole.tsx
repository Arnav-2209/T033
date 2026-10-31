import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '@sgrs/contracts';
import { useAuth } from './AuthProvider.js';
import { roleRoutes } from './LoginPage.js';

export function RequireRole({
  roles,
  children,
}: {
  roles?: UserRole[];
  children: ReactNode;
}): ReactNode {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <main className="page-wait" aria-live="polite">
        Checking your session…
      </main>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={roleRoutes[user.role]} replace />;
  return children;
}
