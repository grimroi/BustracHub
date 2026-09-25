import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LogIn from './pages/LogIn';
import ResidentUI from './pages/ResidentUI';
import DashboardPortal from './pages/DashboardPortal';
import ProtectedRoute from './pages/ProtectedRoute';
import Register from './pages/Register';

// 1. Import setupPouchDBSync and resolveDbConflicts from db.js
import { setupPouchDBSync, resolveDbConflicts } from './services/db';

export default function App() {
  // 2. Start Live Synchronization when App mounts
  useEffect(() => {
    // Initialize two-way sync in the background
    const syncHandler = setupPouchDBSync();

    // Automatically check and resolve any offline conflicts on startup
    resolveDbConflicts();

    // Cleanup: Cancel replication when the application unmounts
    return () => {
      if (syncHandler && typeof syncHandler.cancel === 'function') {
        syncHandler.cancel();
        console.log('PouchDB sync handler safely cancelled.');
      }
    };
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/register" element={<Register />} />
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