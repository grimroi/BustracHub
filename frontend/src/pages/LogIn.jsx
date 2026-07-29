import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

export default function LogIn() {
  const navigate = useNavigate();

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
          sessionStorage.setItem('bustrac_role', data.role);
          sessionStorage.setItem('bustrac_user', data.user);
          sessionStorage.setItem('bustrac_loginTime', new Date().toISOString());
          navigate(data.redirectPath);
        } else {
          setShowError(true);
        }
      } catch (error) {
        console.error('Backend connection failed:', error);
        setShowError(true);
      }
    },
    [username, password, navigate]
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
            Sign In →
          </button>
        </form>

        {/* MODERNIZED DEMO BADGES */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 space-y-2">
          <span className="block font-semibold text-amber-500/90 text-[10px] uppercase tracking-wider">
            💡 Quick Demo Accounts
          </span>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
            <div className="bg-slate-900 p-1.5 rounded border border-slate-800/50 text-center">
              <span className="text-emerald-400 font-bold block text-[9px] uppercase">Staff</span>
              mgcortero
            </div>
            <div className="bg-slate-900 p-1.5 rounded border border-slate-800/50 text-center">
              <span className="text-blue-400 font-bold block text-[9px] uppercase">Admin</span>
              jmacabangon
            </div>
          </div>
        </div>

        {/* BACK TO PUBLIC PORTAL & OFFLINE NOTE */}
        <div className="text-center pt-2 space-y-3">
          <button
            onClick={() => navigate('/')}
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors font-medium inline-flex items-center gap-1"
          >
            ← Back to the Public Portal
          </button>
          
          <div className="text-[10px] text-slate-600 border-t border-slate-800/60 pt-3">
            🔄 Gumagana kahit walang internet — Awtomatikong nagsi-sync sa CouchDB
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