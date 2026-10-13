// frontend/src/pages/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { getToken } from '../utils/tokenStore';

function normalizeRole(raw) {
  if (!raw) return '';
  let role = String(raw).trim();
  if (
    (role.startsWith('"') && role.endsWith('"')) ||
    (role.startsWith("'") && role.endsWith("'"))
  ) {
    try {
      role = JSON.parse(role);
    } catch {
      role = role.slice(1, -1);
    }
  }
  return String(role).trim().toLowerCase();
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();
  const token = getToken();                          // ← RESTORED
  const rawUser = localStorage.getItem('bustrac_user');
  const role = normalizeRole(localStorage.getItem('bustrac_role'));

  // BOTH token (sessionStorage) AND cached user (localStorage) must be present.
  const isLoggedIn = !!token && !!rawUser;

  if (!isLoggedIn) {
    try {
      localStorage.removeItem('bustrac_user');
      localStorage.removeItem('bustrac_role');
    } catch { /* ignore */ }
    return <Navigate to="/login" state={{ redirectTo: location.pathname }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    console.warn(`Access Denied. Role '${role}' not in [${allowedRoles.join(', ')}]`);
    if (role === 'admin') return <Navigate to="/admin" replace />;
    if (role === 'staff' || role === 'secretary') return <Navigate to="/staff" replace />;
    return <Navigate to="/" replace />;
  }

  return children;
}