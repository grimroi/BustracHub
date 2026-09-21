import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();

  const role = sessionStorage.getItem('bustrac_role');
  const isLoggedIn = !!sessionStorage.getItem('bustrac_user');

  if (!isLoggedIn) {
    return (
      <Navigate 
        to="/login" 
        state={{ redirectTo: location.pathname }} 
        replace 
      />
    );
  }
  if (allowedRoles && !allowedRoles.includes(role)) {
    console.warn(`🔒 Access Denied. Role '${role}' is not authorized for this route.`);
    
    if (role === 'admin') return <Navigate to="/admin" replace />;
    if (role === 'staff') return <Navigate to="/staff" replace />;
    
    return <Navigate to="/resident" replace />;
  }

  // 3. KUNG PASOK SA ZONING CONTROLS: Payagang mag-render ang protektadong component
  return children;
}