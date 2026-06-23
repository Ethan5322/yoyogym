// Guards /admin routes. Redirects to login when unauthenticated, and to the
// role's home when the user lacks the required role (RBAC, spec Part 4.1).
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function ProtectedRoute({ roles, children }) {
  const { user, loading, homeFor } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  if (roles && roles.length && !roles.includes(user.role)) {
    return <Navigate to={homeFor()} replace />;
  }

  return children;
}
