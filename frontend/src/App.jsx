import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Import your existing pages and your new combined layout
import Login from './pages/Login';
import ResidentUI from './pages/ResidentUI';
import DashboardPortal from './pages/DashboardPortal'; // New component

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/resident" element={<ResidentUI />} />

        {/* Pass 'staff' role parameter dynamically */}
        <Route path="/staff" element={<DashboardPortal role="staff" />} />

        {/* Pass 'admin' role parameter dynamically */}
        <Route path="/admin" element={<DashboardPortal role="admin" />} />

        {/* Fallback route */}
        <Route path="*" element={<Login />} />
      </Routes>
    </Router>
  );
}
