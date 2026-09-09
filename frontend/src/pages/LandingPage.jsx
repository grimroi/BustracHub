import React from 'react';
import { useNavigate } from 'react-router-dom';
import bustracLogo from '../assets/logo.png';

export default function LandingPage() {
  const navigate = useNavigate();

  const handleProtectedNavigation = (tabName) => {
    navigate('/login', { state: { redirectTo: '/resident', activeTab: tabName } });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans flex flex-col">
      {/* HEADER - Clean, Solid, No Blur */}
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center">
            {bustracLogo ? (
              <img src={bustracLogo} alt="Logo" className="w-6 h-6 object-contain" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">Bustrac Hub</h1>
            <p className="text-xs text-slate-500 mt-0.5">Barangay Bustrac Public Portal</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Portal Login
        </button>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 w-full">
        {/* HERO SECTION */}
        <div className="mb-12 max-w-3xl">
          <span className="inline-block bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            Camarines Sur • Municipality of Nabua
          </span>
          <h2 className="text-4xl font-bold text-white tracking-tight leading-tight mb-4">
            Makabagong Serbisyo para sa Barangay Bustrac
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            Ang Bustrac Hub ay ang opisyal na portal ng pamahalaang barangay upang mapabilis ang mga transaksyon, pamamahagi ng tulong, at pag-isyu ng mga digital certificates para sa bawat residente.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT: PUBLIC CARDS */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              Public Services & Action Hub
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ServiceCard
                icon={<BellIcon />}
                title="Barangay Announcements"
                desc="Alamin ang mga pinakabagong balita, proyekto, at iskedyul ng ayuda sa ating komunidad."
                action="Tingnan"
                onClick={() => handleProtectedNavigation('announcements')}
              />
              <ServiceCard
                icon={<DocIcon />}
                title="Track Certificate Request"
                desc="Suriin ang real-time verification status ng inyong ni-request na Barangay Clearance."
                action="Suriin"
                onClick={() => handleProtectedNavigation('tracking')}
              />
              <ServiceCard
                icon={<MsgIcon />}
                title="Submit Public Feedback"
                desc="Maghain ng mungkahi, reklamo, o direktang inquiries sa pamahalaang barangay."
                action="Mag-ulat"
                onClick={() => handleProtectedNavigation('feedback')}
              />
              <ServiceCard
                icon={<AlertIcon />}
                title="Emergency Hotlines"
                desc="Mabilisang access sa mga numero ng ambulansya, bumbero, kapulisan, at MDRRMO Nabua."
                action="Tawagan"
                onClick={() => handleProtectedNavigation('hotlines')}
              />
            </div>
          </div>

          {/* RIGHT: INFO CORNER */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center gap-2 text-amber-400 mb-3">
                <h3 className="font-semibold text-sm text-white">Important System Note</h3>
              </div>
              <hr className="border-slate-800 mb-4" />
              <div className="space-y-4 text-sm text-slate-400 leading-relaxed">
                <p>
                  <span className="text-slate-200 font-medium block mb-1">Para sa mga Residente:</span>
                  Ang mga serbisyong pampubliko ay nangangailangan ng secured log-in session upang matiyak ang data privacy at seguridad ng inyong records.
                </p>
                <p>
                  <span className="text-slate-200 font-medium block mb-1">Para sa mga Opisyal at Staff:</span>
                  I-click ang <span className="text-emerald-400 font-medium">Portal Login</span> sa itaas upang ma-access ang admin registry dashboard at analytics tools.
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 font-medium">
                System Identity Verified • CSPC BSIT Capstone 2026
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 px-6 py-6 text-center mt-auto">
        <p className="text-xs text-slate-500">
          v1.0 • Opisyal na Sistema ng Barangay Bustrac © 2026. Powered by CouchDB Local Synchronization.
        </p>
      </footer>
    </div>
  );
}

function ServiceCard({ icon, title, desc, action, onClick }) {
  return (
    <div 
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Pumunta sa ${title}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className="bg-slate-900 border border-slate-800 p-5 rounded-xl hover:border-emerald-500/50 hover:-translate-y-1 transition-all duration-200 flex flex-col group cursor-pointer"
    >
      <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-emerald-400 mb-4 group-hover:bg-emerald-500/10 group-hover:text-emerald-400 transition-colors duration-200">
        {icon}
      </div>
      <h4 className="font-semibold text-white mb-1 group-hover:text-emerald-400 transition-colors">
        {title}
      </h4>
      <p className="text-sm text-slate-400 mb-4 flex-1">{desc}</p>

      <span className="text-sm text-emerald-500 font-medium flex items-center gap-1.5 group-hover:gap-2.5 transition-all duration-200 w-max">
        {action}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </span>
    </div>
  );
}

// ==========================================
// ICON COMPONENTS
// ==========================================
function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function MsgIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}