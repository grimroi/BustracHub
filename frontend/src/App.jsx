import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LogIn from './pages/LogIn';
import ResidentUI from './pages/ResidentUI';
import DashboardPortal from './pages/DashboardPortal';
import ProtectedRoute from './pages/ProtectedRoute';
import Register from './pages/Register';
import ResidentRegister from './pages/ResidentRegister';
import { setupPouchDBSync, resolveDbConflicts, stopPouchDBSync } from './services/db';
import { getToken, clearToken } from './utils/tokenStore';
import { apiFetch } from './utils/api';
import { updateStoredUser } from './utils/residentUtils';
import VerifyDocument from './pages/VerifyDocument';



export default function App() {
  useEffect(() => {
    const syncHandler = setupPouchDBSync();
    

    return () => {
      if (syncHandler && typeof syncHandler.cancel === 'function') {
        syncHandler.cancel();
      }
    };
  }, []);

  // Restore the cached user from the server when a session token exists but
  // the local user object is missing/incomplete (e.g. after a refresh where
  // localStorage was cleared, or a resident whose cached user lacks residentId).
  useEffect(() => {
    if (!getToken()) return;

    let needsHydration = true;
    try {
      const raw = localStorage.getItem('bustrac_user');
      const cached = raw ? JSON.parse(raw) : null;
      if (cached && cached.username && cached.role) {
        const isResident = String(cached.role).toLowerCase() === 'resident';
        needsHydration = isResident ? !cached.residentId : false;
      }
    } catch {
      needsHydration = true;
    }
    if (!needsHydration) return;

    apiFetch('me')
      .then(async (res) => {
        if (res.status === 401) {
          clearToken();
          localStorage.removeItem('bustrac_user');
          localStorage.removeItem('bustrac_role');
          window.location.assign('/login');
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data && data.user) updateStoredUser(data.user);
        }
      })
      .catch(() => {
        /* offline or server unreachable — keep the cached user as-is */
      });
  }, []);

  // The sync layer dispatches this when replication is rejected with 401/403.
  // Without a handler the UI would stay on a dead session, so clear storage,
  // stop replication, and return to the login screen.
  useEffect(() => {
    const handleLogoutRequired = () => {
      clearToken();
      stopPouchDBSync();
      try {
        localStorage.removeItem('bustrac_user');
        localStorage.removeItem('bustrac_role');
        localStorage.removeItem('bustrac_loginTime');
      } catch {
        /* ignore */
      }
      window.location.assign('/login');
    };
    window.addEventListener('auth:logout-required', handleLogoutRequired);
    return () => window.removeEventListener('auth:logout-required', handleLogoutRequired);
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/register" element={<Register />} />
        <Route path="/resident-register" element={<ResidentRegister />} />
        <Route path="/verify" element={<VerifyDocument />} />

        <Route
          path="/resident"
          element={
            <ProtectedRoute allowedRoles={['resident']}>
              <ResidentUI />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute allowedRoles={['staff']}>
              <DashboardPortal role="staff" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardPortal role="admin" />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<LogIn />} />
      </Routes>
    </Router>
  );
}