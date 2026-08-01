import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LogIn from './pages/LogIn';
import ResidentUI from './pages/ResidentUI';
import DashboardPortal from './pages/DashboardPortal'; // New component
import ProtectedRoute from './pages/ProtectedRoute';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LogIn />} />

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
