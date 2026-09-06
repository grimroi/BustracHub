import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import logo from '../assets/logo.png';
import { createAuditLog } from '../utils/auditLog';

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
  const [showError, setShowError] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const handleLogin = useCallback(
  async (event) => {
    event.preventDefault();
    setShowError(false);

    const trimmedUsername = username.trim();

    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: trimmedUsername,
          password: password,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Save current authenticated session
        sessionStorage.setItem('bustrac_role', data.role);
        sessionStorage.setItem(
          'bustrac_user',
          JSON.stringify(data.user)
        );
        sessionStorage.setItem(
          'bustrac_loginTime',
          new Date().toISOString()
        );

        // Save offline login verifier (multi-user keyed store)
        const passwordHash = await hashPasswordForOffline(password);

        const existingOfflineAuth =
          JSON.parse(localStorage.getItem('bustrac_offline_auth') || '{}');

        existingOfflineAuth[trimmedUsername] = {
          username: trimmedUsername,
          passwordHash,
          role: data.role,
          user: data.user,
        };

        localStorage.setItem(
          'bustrac_offline_auth',
          JSON.stringify(existingOfflineAuth)
        );
        
        // Inside login success handler
        await createAuditLog({
          action: 'USER_LOGIN',
          module: 'AUTHENTICATION',
          details: `User logged in via ${navigator.onLine ? 'Online API' : 'Offline SHA-256 Fallback'}`
        });
        console.log(`➡️ Auth verified. User Role: ${data.role}`);

        if (data.role === 'admin') {
          navigate('/admin');
        } else if (data.role === 'staff') {
          navigate('/staff');
        } else if (data.role === 'resident') {
          const destination =
            location.state?.redirectTo || '/resident';

          navigate(destination, {
            state: {
              activeTab: location.state?.activeTab,
            },
          });
        } else {
          navigate('/');
        }

        return;
      }

      setShowError(true);
    } catch (error) {
      console.warn(
        'Backend unavailable. Attempting offline login...'
      );

      try {
  const storedOfflineAuth = localStorage.getItem('bustrac_offline_auth');

  if (!storedOfflineAuth) {
    console.warn('No offline credentials available.');
    setShowError(true);
    return;
  }

  const allOfflineAuth = JSON.parse(storedOfflineAuth);
  const offlineAuth = allOfflineAuth[trimmedUsername];

  if (!offlineAuth) {
    console.warn('No offline record for this username.');
    setShowError(true);
    return;
  }

  const passwordHash = await hashPasswordForOffline(password);
  const passwordMatches = passwordHash === offlineAuth.passwordHash;

  if (!passwordMatches) {
    console.warn('Offline password does not match.');
    setShowError(true);
    return;
  }

  // Restore local session
  sessionStorage.setItem('bustrac_role', offlineAuth.role);
  sessionStorage.setItem('bustrac_user', JSON.stringify(offlineAuth.user));
  sessionStorage.setItem('bustrac_loginTime', new Date().toISOString());
        await createAuditLog({
        action: 'USER_LOGIN',
        module: 'AUTHENTICATION',
        details: `User logged in via ${navigator.onLine ? 'Online API' : 'Offline SHA-256 Fallback'}`
      });
        console.log(
          `➡️ Offline authentication successful. User Role: ${offlineAuth.role}`
        );

        if (offlineAuth.role === 'admin') {
          navigate('/admin');
        } else if (offlineAuth.role === 'staff') {
          navigate('/staff');
        } else if (offlineAuth.role === 'resident') {
          const destination =
            location.state?.redirectTo || '/resident';

          navigate(destination, {
            state: {
              activeTab: location.state?.activeTab,
            },
          });
        } else {
          navigate('/');
        }
      } catch (offlineError) {
        console.error(
          'Offline authentication failed:',
          offlineError
        );
        setShowError(true);
      }
    }
  },
  [username, password, navigate, location]
);

  const handleUsernameChange = (event) => {
    setUsername(event.target.value);
    setShowError(false);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
    setShowError(false);
  };

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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center p-4 relative">
      
      {/* LOGIN CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
        
        {/* BRAND & LOGO */}
        <div className="flex items-center gap-3 pb-2">
          <img
            src={logo}
            alt="Logo"
            className="w-12 h-12 object-contain flex-shrink-0"
          />
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">Bustrac Hub</h2>
            <p className="text-xs text-slate-400">Barangay Management System</p>
          </div>
        </div>

        {/* ERROR MESSAGE */}
        {showError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs flex items-center gap-2 animate-shake">
            <span>❌</span>
            <span>Maling credentials. Pakisuri ang username at password.</span>
          </div>
        )}

        {/* LOGIN FORM */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Username</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Ipasok ang iyong username"
              autoComplete="username"
              required
            />
          </div>
          
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
              type="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button 
            type="submit" 
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg text-sm transition-colors shadow-lg shadow-emerald-950/50 mt-2"
          >
            Sign In 
          </button>
        </form>

        {/* BACK TO PUBLIC PORTAL & OFFLINE NOTE */}
        <div className="text-center pt-2 space-y-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors font-medium inline-flex items-center gap-1"
          >
             Back to the Public Portal
          </button>
          
          <div className="text-[10px] text-slate-600 border-t border-slate-800/60 pt-3">
             Gumagana kahit walang internet — Awtomatikong nagsi-sync sa CouchDB
            <span className="block mt-1 opacity-70">
              v1.0 • Barangay Bustrac © 2026
            </span>
          </div>
        </div>

      </div>

      {/* LIVE CONNECTION INDICATOR */}
      {isOnline && (
        <div className="absolute bottom-4 right-4 bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold tracking-widest flex items-center gap-2 shadow-lg backdrop-blur">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          LIVE
        </div>
      )}
    </div>
  );
}