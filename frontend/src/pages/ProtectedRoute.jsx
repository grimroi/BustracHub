import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();

  const rawRole = sessionStorage.getItem('bustrac_role') || '';
  let role = rawRole.trim();
  if ((role.startsWith('"') && role.endsWith('"')) || (role.startsWith("'") && role.endsWith("'"))) {
    try {
      role = JSON.parse(role);
    } catch {
      role = role.slice(1, -1);
    }
  }
  role = role.trim();

  const rawUser = sessionStorage.getItem('bustrac_user');
  const isLoggedIn = !!rawUser;

  if (!isLoggedIn) {
    return (
      <Navigate to="/login" state={{ redirectTo: location.pathname }} replace />
    );
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    console.warn(` Access Denied. Role '${role}' is not authorized for this route.`);
    if (role === 'admin') return <Navigate to="/admin" replace />;
    if (role === 'staff') return <Navigate to="/staff" replace />;
    return <Navigate to="/resident" replace />;
  }

  return children;
}
