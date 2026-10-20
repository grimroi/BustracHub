import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import logo from '../assets/logo.png';
import { localDb as db } from '../services/db';
import { createAuditLog } from '../utils/auditLog';
import { hashPassword, verifyPassword, isSha256Hash } from '../utils/password';
import { apiFetch } from '../utils/api';
import { setToken, setOfflineSession, clearOfflineSession, clearDeviceAuthCache } from '../utils/tokenStore';
import Swal from 'sweetalert2';
import './LogIn.css';

const isAccountActive = (status) => {
  if (!status) return true;
  const normalized = String(status).trim().toLowerCase();
  return normalized === 'active' || normalized === 'enabled' || normalized === 'approved';
};

export default function LogIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('Invalid username or password. Please try again.');
  const [errorHint, setErrorHint] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [hasCachedCreds, setHasCachedCreds] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('bustrac_offline_auth');
      setHasCachedCreds(!!raw && Object.keys(JSON.parse(raw)).length > 0);
    } catch {
      setHasCachedCreds(false);
    }
  }, []);

  const handleForgetDevice = useCallback(async () => {
    const result = await Swal.fire({
      title: 'Forget this device?',
      text: 'This removes saved offline login credentials from this device. You will need to log in online again before offline login is available on this device.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Forget device',
      cancelButtonText: 'Cancel',
    });
    if (!result.isConfirmed) return;
    await clearDeviceAuthCache();
    setHasCachedCreds(false);
    await Swal.fire({
      title: 'Device forgotten',
      text: 'This device has been forgotten. Offline login is unavailable until you log in online again.',
      icon: 'success',
      confirmButtonText: 'OK',
    });
  }, []);

  const checkLocalAuth = async (trimmedUsername, inputPassword) => {
    // Normalize exactly once. MUST match the key used when the cache is
    // written during a successful online login (handleLogin -> lowerUsername).
    const lowerUsername = String(trimmedUsername || '').trim().toLowerCase();

    // Source 1 — localStorage['bustrac_offline_auth'][lowerUsername]
    try {
      const raw = localStorage.getItem('bustrac_offline_auth');
      const all = raw ? JSON.parse(raw) : {};
      const entry = all && typeof all === 'object' ? all[lowerUsername] : null;
      if (entry && entry.passwordHash) {
        // Cached account EXISTS for this username. Isolate verification so a
        // thrown error can never be mistaken for "no cache on this device".
        try {
          const matches = await verifyPassword(inputPassword, entry.passwordHash);
          if (!matches) return { status: 'no-match' };
          const cachedStatus = entry.user?.status || entry.status;
          if (!isAccountActive(cachedStatus)) return { status: 'inactive' };
          // Upgrade a legacy SHA-256 hash ONLY after successful verification.
          if (isSha256Hash(entry.passwordHash)) {
            try {
              entry.passwordHash = await hashPassword(inputPassword);
              all[lowerUsername] = entry;
              localStorage.setItem('bustrac_offline_auth', JSON.stringify(all));
            } catch {
              // Upgrade is best-effort; verification already succeeded.
            }
          }
          return {
            status: 'match',
            username: entry.username,
            role: entry.role,
            user: entry.user,
          };
        } catch (err) {
          console.warn('Offline auth: localStorage verification error:', err?.message);
          return { status: 'no-match' };
        }
      }
    } catch (err) {
      // Unreadable/corrupt source — do NOT let it hide other valid sources.
      console.warn('Offline auth: localStorage source unreadable:', err?.message);
    }

    // Source 2 — PouchDB _local/user-${lowerUsername} (canonical, non-replicating)
    let localUserDoc = null;
    try {
      localUserDoc = await db.get(`_local/user-${lowerUsername}`);
    } catch {
      // Missing (404) — try the legacy id below.
    }

    // Source 3 — legacy user_${lowerUsername} (older devices only)
    if (!localUserDoc || !localUserDoc.passwordHash) {
      try {
        localUserDoc = await db.get(`user_${lowerUsername}`);
      } catch {
        // Missing.
      }
    }

    if (localUserDoc && localUserDoc.passwordHash) {
      // Cached account EXISTS. Isolate verification from source lookup.
      try {
        const matches = await verifyPassword(inputPassword, localUserDoc.passwordHash);
        if (!matches) return { status: 'no-match' };
        if (!isAccountActive(localUserDoc.status)) return { status: 'inactive' };
        return {
          status: 'match',
          username: localUserDoc.username,
          role: localUserDoc.role,
          user: {
            id: localUserDoc._id,
            username: localUserDoc.username,
            role: localUserDoc.role,
            fullName: localUserDoc.fullName || localUserDoc.name,
            status: localUserDoc.status,
          },
        };
      } catch (err) {
        console.warn('Offline auth: pouchdb verification error:', err?.message);
        return { status: 'no-match' };
      }
    }

    // Only reached when NO source holds a cached credential for this username.
    return { status: 'not-found' };
  };

  const handleLogin = useCallback(async (event) => {
    event.preventDefault();
    setShowError(false);
    setErrorHint('');
    setIsLoading(true);
    const trimmedUsername = username.trim();
    const lowerUsername = trimmedUsername.toLowerCase();

    const finishOfflineLogin = (localUser) => {
      const userRole = String(localUser.role || localUser.user?.role || '').trim().toLowerCase();
      // Drop any identity left over from a previous session in this tab. The
      // replication filter (services/db.js) reads getCurrentUser(), which looks
      // at sessionStorage['bustrac_user'] BEFORE localStorage, so a stale
      // resident entry here would otherwise shadow the incoming identity.
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('bustrac_user');
        }
      } catch {
        // Best-effort; a missing/blocked sessionStorage is non-fatal.
      }
      localStorage.setItem('bustrac_role', userRole);
      localStorage.setItem('bustrac_user', JSON.stringify(localUser.user));
      localStorage.setItem('bustrac_loginTime', new Date().toISOString());

      // Device-bound offline session: there is no server token, but the route
      // guard honours this flag for the current tab. It is cleared on logout,
      // when the tab closes, or when an online login succeeds.
      setOfflineSession();

      createAuditLog({
        action: 'USER_LOGIN',
        module: 'SYSTEM',
        recordId: localUser.user?.username || trimmedUsername,
        user: `${localUser.user?.username || trimmedUsername} (${userRole})`,
        details: `${userRole} logged in via OFFLINE MODE`,
      }).catch(console.warn);

      if (userRole === 'admin') navigate('/admin');
      else if (userRole === 'staff' || userRole === 'vawc_officer') navigate('/staff');
      else if (userRole === 'resident') navigate('/resident');
      else navigate('/');
    };

    const tryOfflineLogin = async () => {
      const outcome = await checkLocalAuth(trimmedUsername, password);
      if (outcome.status === 'inactive') {
        setErrorMessage('Ang iyong account ay hindi aktibo.');
        setShowError(true);
        return;
      }
      if (outcome.status === 'match') {
        finishOfflineLogin(outcome);
        return;
      }
      if (outcome.status === 'no-match') {
        setErrorMessage('Invalid username or password. Please try again.');
        setErrorHint('');
        setShowError(true);
        return;
      }
      // No cached credentials exist for this device at all.
      setErrorMessage(
        'Offline login is available only after a successful online login on this device.'
      );
      setErrorHint('Please connect to the internet and log in once to enable offline access on this device.');
      setShowError(true);
    };

    try {
      // Never attempt a server login while the browser reports it is offline.
      if (!navigator.onLine) {
        await tryOfflineLogin();
        return;
      }

      const response = await apiFetch('login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, password }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const userRole = String(data.user?.role || data.role || '').trim().toLowerCase();

          if (!isAccountActive(data.user?.status)) {
            setErrorMessage('Ang iyong account ay hindi aktibo. Makipag-ugnayan sa Administrator.');
            setShowError(true);
            setIsLoading(false);
            return;
          }

          // Establish the NEW identity BEFORE setToken(). setToken() dispatches
          // 'bustrac:token-changed' synchronously, which starts live replication
          // and builds the per-session replication filter. That filter reads the
          // role from storage once and caches it, so a stale identity from a
          // previous session (in localStorage, or in sessionStorage which
          // getCurrentUser reads first) would otherwise be captured and applied
          // to the whole sync session.
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.removeItem('bustrac_user');
            }
          } catch {
            // Best-effort; a missing/blocked sessionStorage is non-fatal.
          }
          localStorage.setItem('bustrac_role', userRole);
          localStorage.setItem('bustrac_user', JSON.stringify(data.user));
          localStorage.setItem('bustrac_loginTime', new Date().toISOString());

          // Store the server-issued session token ONLY for a successful
          // online login. A missing or empty token is never stored, so a
          // failed or partial response cannot leave a stale token behind.
          if (data.sessionToken && String(data.sessionToken).trim()) {
            setToken(data.sessionToken);
          }
          // A successful online login supersedes any stale offline session.
          clearOfflineSession();

          let passwordHash = null;
          try {
            passwordHash = await hashPassword(password);
          } catch (hashErr) {
            console.warn('Failed to hash password for offline cache:', hashErr);
          }

          if (passwordHash) {
            // localStorage cache (best-effort; a quota/parse error here must
            // not prevent the PouchDB cache below from being written).
            try {
              const existingOfflineAuth = JSON.parse(localStorage.getItem('bustrac_offline_auth') || '{}');
              existingOfflineAuth[lowerUsername] = {
                username: trimmedUsername,
                passwordHash,
                role: userRole,
                user: data.user,
              };
              localStorage.setItem('bustrac_offline_auth', JSON.stringify(existingOfflineAuth));
            } catch (storageErr) {
              console.warn('Failed to cache credentials in localStorage:', storageErr);
            }

            // PouchDB cache (best-effort; stored under _local/ so PouchDB
            // NEVER replicates it, with its passwordHash, to remote CouchDB).
            try {
              const pouchUserDoc = {
                _id: `_local/user-${lowerUsername}`,
                type: 'user',
                username: trimmedUsername,
                passwordHash,
                role: userRole,
                fullName: data.user?.fullName || data.user?.name || trimmedUsername,
                status: data.user?.status || 'Active',
                updatedAt: new Date().toISOString()
              };
              try {
                const existing = await db.get(`_local/user-${lowerUsername}`);
                if (existing?._rev) pouchUserDoc._rev = existing._rev;
              } catch {
                // No prior local credential document — create a fresh one.
              }
              await db.put(pouchUserDoc);
            } catch (pouchErr) {
              console.warn('Failed to cache credentials in PouchDB:', pouchErr);
            }
          }

          try {
            await createAuditLog({
              action: 'USER_LOGIN',
              module: 'SYSTEM',
              recordId: data.user?.username || trimmedUsername,
              user: `${data.user?.username || trimmedUsername} (${userRole})`,
              details: `${userRole} logged in via Online API`,
            });
          } catch (auditErr) {
            console.warn('Audit log error:', auditErr);
          }

          if (userRole === 'admin') navigate('/admin');
          else if (userRole === 'staff' || userRole === 'vawc_officer') navigate('/staff');
          else if (userRole === 'resident') {
            const destination = location.state?.redirectTo || '/resident';
            navigate(destination, { state: { activeTab: location.state?.activeTab } });
          } else {
            navigate('/');
          }
          return;
        }
      }
      
      setErrorMessage('Invalid username or password. Please try again.');
      setShowError(true);
    } catch (err) {
      const isNetworkError = err?.isNetworkError === true || err?.kind === 'network';
      if (isNetworkError) {
        // Connectivity outage — safe to fall back to the local device cache.
        console.warn('Backend unavailable. Switching to offline authentication...', err);
        await tryOfflineLogin();
      } else {
        // The server was reached but rejected the request (e.g. 403) or
        // another non-network failure occurred. Do NOT fall back to offline
        // login here — show the normal online error instead.
        console.error('Login request failed:', err);
        setErrorMessage('Invalid username or password. Please try again.');
        setErrorHint('');
        setShowError(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [username, password, navigate, location]);

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
      {/* LEFT: HERO / BRANDING SECTION */}
      <div className="hero-section">
        <div className="hero-glow-top" />
        <div className="hero-glow-bottom" />
        <div className="hero-brand">
          <img src={logo} alt="Barangay Logo" className="brand-logo" />
          <span className="brand-title">Bustrac Hub</span>
        </div>
        <div className="hero-content">
          <div className="hero-tag">Barangay Management Portal</div>
          <h1 className="hero-heading">Streamlined local governance, fully offline-ready.</h1>
          <p className="hero-description">
            Centralized resident profiling, certificate issuance, blotter logging, and aid distribution workspace built for uninterrupted barangay operations.
          </p>
          <div className="hero-features">
            <div>
              <div className="feature-title">Offline Sync</div>
              <div className="feature-sub">PouchDB/CouchDB core</div>
            </div>
            <div>
              <div className="feature-title">Encrypted</div>
              <div className="feature-sub">Bcrypt Password Hashing</div>
            </div>
            <div>
              <div className="feature-title">Audit Ready</div>
              <div className="feature-sub">System Activity Logs</div>
            </div>
          </div>
        </div>
        <div className="hero-footer">© 2026 Barangay Bustrac. All rights reserved.</div>
      </div>

      {/* RIGHT: LOGIN FORM SECTION */}
      <div className="form-section">
        <div className="form-container">
          <div className="mobile-brand">
            <img src={logo} alt="Logo" className="brand-logo-sm" />
            <span className="brand-title-sm">Bustrac Hub</span>
          </div>
          
          <div className="form-header">
            <h2 className="form-title">Sign In</h2>
            <p className="form-sub">Welcome back! Please enter your details.</p>
          </div>

          {showError && (
            <div className="error-alert">
              <svg className="error-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                {errorMessage}
                {errorHint && <span className="error-hint" style={{ display: 'block' }}>{errorHint}</span>}
              </span>
            </div>
          )}

          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label className="input-label">Username</label>
              <input
                className="custom-input"
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setShowError(false); }}
                placeholder="e.g. admin"
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
                  onChange={(e) => { setPassword(e.target.value); setShowError(false); }}
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
                  <span className="spinner" /> Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="form-footer">
            <div className="register-prompt">
              Wala pang account?{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => { setShowError(false); setIsLoading(false); navigate('/resident-register'); }}
              >
                Mag-request ng Resident Account Online
              </button>
            </div>
            
            <button type="button" onClick={() => navigate('/')} className="back-btn">
              ← Back to Public Portal
            </button>

            {hasCachedCreds && (
              <button
                type="button"
                onClick={handleForgetDevice}
                className="link-btn forget-device-btn"
                style={{ marginTop: 10 }}
              >
                Forget this device
              </button>
            )}
            
            <p className="offline-notice">
              {!isOnline && <strong className="offline-badge">[OFFLINE MODE] </strong>}
              Works seamlessly without internet. Your data saves locally and automatically syncs when online.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
