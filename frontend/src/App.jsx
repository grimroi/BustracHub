import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LogIn from './pages/LogIn';
import ResidentUI from './pages/ResidentUI';
import DashboardPortal from './pages/DashboardPortal';
import ProtectedRoute from './pages/ProtectedRoute';
import Register from './pages/Register';
import { setupPouchDBSync, resolveDbConflicts } from './services/db';
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

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/register" element={<Register />} />

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