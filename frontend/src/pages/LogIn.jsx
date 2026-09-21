import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import logo from '../assets/logo.png';
import { createAuditLog } from '../utils/auditLog';
import './LogIn.css';

const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000';

const hashPasswordForOffline = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export default function LogIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showError, setShowError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const handleLogin = useCallback(
    async (event) => {
      event.preventDefault();
      setShowError(false);
      setIsLoading(true);
      const trimmedUsername = username.trim();

      try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmedUsername, password }),
        });
        const data = await response.json();

        if (response.ok && data.success) {
          sessionStorage.setItem('bustrac_role', data.role);
          sessionStorage.setItem('bustrac_user', JSON.stringify(data.user));
          sessionStorage.setItem('bustrac_loginTime', new Date().toISOString());

          const passwordHash = await hashPasswordForOffline(password);
          const existingOfflineAuth = JSON.parse(
            localStorage.getItem('bustrac_offline_auth') || '{}'
          );
          existingOfflineAuth[trimmedUsername.toLowerCase()] = {
            username: trimmedUsername,
            passwordHash,
            role: data.role,
            user: data.user,
          };
          localStorage.setItem(
            'bustrac_offline_auth',
            JSON.stringify(existingOfflineAuth)
          );

          await createAuditLog({
            action: 'USER_LOGIN',
            module: 'AUTHENTICATION',
            details: 'User logged in via Online API',
          }).catch((err) => console.warn('Audit log skipped:', err));

          if (data.role === 'admin') navigate('/admin');
          else if (data.role === 'staff') navigate('/staff');
          else if (data.role === 'resident') {
            const destination = location.state?.redirectTo || '/resident';
            navigate(destination, { state: { activeTab: location.state?.activeTab } });
          } else navigate('/');
          return;
        }
        setShowError(true);
      } catch {
        try {
          const storedOfflineAuth = localStorage.getItem('bustrac_offline_auth');
          if (!storedOfflineAuth) {
            setShowError(true);
            return;
          }
          const allOfflineAuth = JSON.parse(storedOfflineAuth);
          const offlineAuth = allOfflineAuth[trimmedUsername.toLowerCase()];
          if (!offlineAuth) {
            setShowError(true);
            return;
          }

          const passwordHash = await hashPasswordForOffline(password);
          if (passwordHash !== offlineAuth.passwordHash) {
            setShowError(true);
            return;
          }

          sessionStorage.setItem('bustrac_role', offlineAuth.role);
          sessionStorage.setItem('bustrac_user', JSON.stringify(offlineAuth.user));
          sessionStorage.setItem('bustrac_loginTime', new Date().toISOString());

          await createAuditLog({
            action: 'USER_LOGIN',
            module: 'AUTHENTICATION',
            details: 'User logged in via Offline Mode',
          }).catch((err) => console.warn('Offline audit log skipped:', err));

          if (offlineAuth.role === 'admin') navigate('/admin');
          else if (offlineAuth.role === 'staff') navigate('/staff');
          else if (offlineAuth.role === 'resident') {
            const destination = location.state?.redirectTo || '/resident';
            navigate(destination, { state: { activeTab: location.state?.activeTab } });
          } else navigate('/');
        } catch {
          setShowError(true);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [username, password, navigate, location]
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="login-page-root">
      {/* KALIWA: HERO / BRANDING SECTION */}
      <div className="hero-section">
        <div className="hero-glow-top" />
        <div className="hero-glow-bottom" />

        {/* Top Header */}
        <div className="hero-brand">
          <img src={logo} alt="Barangay Logo" className="brand-logo" />
          <span className="brand-title">Bustrac Hub</span>
        </div>

        {/* Center Hero Text */}
        <div className="hero-content">
          <div className="hero-tag font-bold">Barangay Management Portal</div>
          <h1 className="hero-heading">
            Streamlined local governance, fully offline-ready.
          </h1>
          <p className="hero-description">
            Centralized resident profiling, certificate issuance, blotter logging, and aid distribution workspace built for uninterrupted barangay operations.
          </p>

          {/* Quick Feature Badges */}
          <div className="hero-features">
            <div>
              <div className="feature-title">Offline Sync</div>
              <div className="feature-sub">PouchDB/CouchDB core</div>
            </div>
            <div>
              <div className="feature-title">Encrypted</div>
              <div className="feature-sub">Local SHA-256 Auth</div>
            </div>
            <div>
              <div className="feature-title">Audit Ready</div>
              <div className="feature-sub">System Activity Logs</div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="hero-footer">
          © 2026 Barangay Bustrac. All rights reserved.
        </div>
      </div>

      {/* KANAN: LOGIN FORM SECTION */}
      <div className="form-section">
        <div className="form-container">
          {/* Mobile Logo Header */}
          <div className="mobile-brand">
            <img src={logo} alt="Logo" className="brand-logo-sm" />
            <span className="brand-title-sm">Bustrac Hub</span>
          </div>

          {/* Form Header */}
          <div className="form-header">
            <h2 className="form-title">Sign In</h2>
            <p className="form-sub">
              Enter your credentials to access the administrative portal
            </p>
          </div>

          {/* ERROR ALERT */}
          {showError && (
            <div className="error-alert">
              <svg className="error-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Invalid username or password. Please try again.</span>
            </div>
          )}

          {/* FORM */}
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label className="input-label">Username</label>
              <input
                className="custom-input"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setShowError(false);
                }}
                placeholder="e.g. jmacabangon"
                autoComplete="username"
                disabled={isLoading}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <div className="password-wrapper">
                <input
                  className="custom-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setShowError(false);
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="toggle-password-btn"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="submit-btn">
              {isLoading ? (
                <>
                  <span className="spinner" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* FOOTER ACTIONS */}
          <div className="form-footer">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="back-btn"
            >
              ← Back to Public Portal
            </button>
            <p className="offline-notice">
              Works seamlessly without internet. Your data saves locally and automatically syncs when online.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}