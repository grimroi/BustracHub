import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import './LogIn.css';

// Credentials for each role — mapped to React Router paths instead of raw .html files
const credentials = {
  staff: { username: 'mgcortero', password: 'password', path: '/staff' },
  admin: { username: 'jmacabangon', password: 'password', path: '/admin' },
};

export default function LogIn() {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showError, setShowError] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const handleLogin = useCallback(
    (event) => {
      event.preventDefault();

      const trimmedUsername = username.trim();
      let authenticatedRole = null;
      let authenticatedPath = null;

      // Check credentials against all roles
      for (const [role, cred] of Object.entries(credentials)) {
        if (trimmedUsername === cred.username && password === cred.password) {
          authenticatedRole = role;
          authenticatedPath = cred.path;
          break;
        }
      }

      if (authenticatedRole) {
        // Store session data
        sessionStorage.setItem('bustrac_role', authenticatedRole);
        sessionStorage.setItem('bustrac_user', trimmedUsername);
        sessionStorage.setItem('bustrac_loginTime', new Date().toISOString());

        // Redirect to appropriate portal via React Router
        navigate(authenticatedPath);
      } else {
        setShowError(true);
      }
    },
    [username, password, navigate]
  );

  // Clear error message whenever the user edits either field
  const handleUsernameChange = (event) => {
    setUsername(event.target.value);
    setShowError(false);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
    setShowError(false);
  };

  // Show/hide live indicator based on connection status
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
    <div className="login-root-container">
      <div className="login-wrap">
        <div className="login-card">
          {/* Brand */}
          <div className="login-brand">
            <img
              src={logo}
              alt="Logo"
              style={{ width: '48px', height: '48px', objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <div className="brand-name">Bustrac Hub</div>
              <div className="brand-sub">Barangay Management System</div>
            </div>
          </div>

          {/* Error Message */}
          <div className={`error-msg${showError ? ' show' : ''}`}>
            <span>❌</span>
            <span>Invalid credentials. Please check your username, password, and role.</span>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin}>
            <div className="fg">
              <label className="fl">Username</label>
              <input
                className="fc"
                type="text"
                value={username}
                onChange={handleUsernameChange}
                placeholder="Enter your username"
                autoComplete="username"
                required
              />
            </div>
            <div className="fg">
              <label className="fl">Password</label>
              <input
                className="fc"
                type="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '13px' }}>
              Sign In →
            </button>
          </form>

          {/* Demo Credentials Badge */}
          <div className="role-badge">
            💡 Demo: mgcortero / password (Staff) or jmacabangon / password (Admin)
          </div>

          {/* Footer */}
          <div className="footer-text">
            🔄 Works offline — your data syncs automatically
            <span style={{ marginTop: '12px', fontSize: '11px', opacity: 0.7 }}>
              v1.0 • Barangay Bustrac © 2026
            </span>
          </div>
        </div>
      </div>

      {/* Live Connection Indicator */}
      {isOnline && (
        <div className="live-indicator">
          <div className="live-dot" />
          <div className="live-text">LIVE</div>
        </div>
      )}
    </div>
  );
}
