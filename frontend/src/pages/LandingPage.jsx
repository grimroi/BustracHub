import React from 'react';
import { useNavigate } from 'react-router-dom';
import bustracLogo from '../assets/logo.png';

export default function LandingPage() {
  const navigate = useNavigate();
  
  const handleProtectedNavigation = (tabName) => {
    navigate('/login', { 
      state: { 
        redirectTo: '/resident', 
        activeTab: tabName 
      } 
    });
  };
  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
  <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-between relative overflow-hidden">
    <div className="absolute inset-0 z-0 opacity-35 pointer-events-none">
      {/* Emerald Orb (Top-Right) - Enhanced Glow */}
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-emerald-500/10 blur-[130px] rounded-full" />

      {/* Slate Orb (Bottom-Left) - Enhanced Blur */}
      <div className="absolute -bottom-20 -left-20 w-[500px] h-[500px] bg-slate-500/5 blur-[100px] rounded-full" />

      {/* Grid Texture Overlay - More Subtle */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40" />

      {/* Subtle Radial Gradient for Depth */}
      <div className="absolute inset-0 radial-gradient(ellipse at 50% 0%, rgba(16, 185, 129, 0.05) 0%, transparent 50%)" />
    </div>

    {/* =============================================
         🏛️ HEADER SECTION (Glass-Morphism + SVG Logo)
         ============================================= */}
    <header className="relative z-10 border-b border-slate-800/50 bg-slate-950/70 backdrop-blur-lg px-6 py-4 flex justify-between items-center">
      <div className="flex items-center gap-3">
        {/* Logo Container with Fallback SVG */}
        <div className="w-10 h-10 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-center p-1 shadow-inner shadow-slate-950/50">
          {bustracLogo ? (
            <img
              src={bustracLogo}
              alt="Bustrac Mini Seal"
              className="w-full h-full object-contain filter brightness-110 contrast-110"
              onError={(e) => {
                e.target.onerror = null;
                e.target.parentNode.innerHTML = `
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" class="w-6 h-6">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                `;
              }}
            />
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          )}
        </div>

        {/* Title & Subtitle */}
        <div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            Bustrac Hub
          </h1>
          <p className="text-xs text-slate-500 font-medium">Barangay Bustrac Public Portal</p>
        </div>
      </div>

      {/* Login Button (SVG Arrow + Enhanced Hover) */}
      <button
        onClick={() => navigate('/login')}
        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-all text-sm shadow-lg shadow-emerald-950/50 hover:shadow-emerald-600/20 active:scale-98 flex items-center gap-2 group"
      >
        Portal Login
      </button>
    </header>

    {/* =============================================
         🌟 HERO & PUBLIC VIEWING MAIN CONTENT
         ============================================= */}
    <main className="relative z-10 max-w-6xl mx-auto px-6 py-12 flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
      {/* LEFT & CENTER: HERO + PUBLIC CARDS */}
      <div className="md:col-span-2 space-y-8">
        {/* Hero Section (Glass-Morphism + Logo Showcase) */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm grid grid-cols-1 sm:grid-cols-5 gap-6 items-center">
          {/* Hero Text Content */}
          <div className="sm:col-span-3 space-y-4">
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block">
              Camarines Sur • Municipality of Nabua
            </span>
            <h2 className="text-3xl font-black tracking-tight leading-tight text-slate-100">
              Makabagong Serbisyo para sa Barangay Bustrac
            </h2>
            <p className="text-slate-400 leading-relaxed text-sm">
              Ang Bustrac Hub ay ang opisyal na portal ng pamahalaang barangay upang mapabilis ang mga transaksyon,
              pamamahagi ng tulong (aid distribution), at pag-isyu ng mga digital certificates para sa bawat residente.
            </p>
          </div>

          {/* Hero Logo Showcase (Glow Effect) */}
          <div className="sm:col-span-2 flex justify-center sm:justify-end relative group">
            <div className="absolute top-1/2 left-1/2 sm:left-auto sm:right-16 -translate-x-1/2 -translate-y-1/2 w-44 h-44 bg-emerald-500/10 rounded-full filter blur-2xl pointer-events-none group-hover:bg-emerald-500/15 transition-colors duration-500" />
            <div className="relative w-40 h-40 bg-slate-950/80 rounded-full border-4 border-double border-slate-800 p-4 shadow-xl flex items-center justify-center transform group-hover:rotate-[3deg] transition-all duration-300">
              {bustracLogo ? (
                <img
                  src={bustracLogo}
                  alt="Official Seal of Barangay Bustrac"
                  className="w-full h-full object-contain filter drop-shadow-[0_4px_10px_rgba(16,185,129,0.2)]"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.parentNode.innerHTML = `
                      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                        <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                        <circle cx="12" cy="12" r="10" stroke="#10b981" strokeWidth="1" fill="none"/>
                      </svg>
                    `;
                  }}
                />
              ) : (
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                  <circle cx="12" cy="12" r="10" stroke="#10b981" strokeWidth="1" fill="none"/>
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* INTERACTIVE PUBLIC CARDS (SVG Icons + Enhanced Hover Effects) */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
            Public Services & Action Hub
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* CARD 1: ANNOUNCEMENTS (SVG Megaphone) */}
            <div className="group bg-slate-900/30 border border-slate-800/50 p-6 rounded-2xl hover:border-emerald-500/40 hover:bg-slate-900/60 transition-all duration-300 shadow-md flex flex-col justify-between min-h-[190px]">
              <div>
                <div className="text-lg mb-2 bg-slate-950 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-emerald-500/30 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <h4 className="font-bold text-sm text-slate-200">Barangay Announcements</h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Alamin ang mga pinakabagong balita, proyekto, at iskedyul ng ayuda sa ating komunidad.
                </p>
              </div>
              <button
                onClick={() => handleProtectedNavigation('announcements')}
                className="mt-4 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-xs font-bold w-max shadow-md shadow-emerald-950 flex items-center gap-1"
              >
                Tingnan
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14"/>
                  <path d="M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>

            {/* CARD 2: DOCUMENT TRACKING (SVG Document) */}
            <div className="group bg-slate-900/30 border border-slate-800/50 p-6 rounded-2xl hover:border-emerald-500/40 hover:bg-slate-900/60 transition-all duration-300 shadow-md flex flex-col justify-between min-h-[190px]">
              <div>
                <div className="text-lg mb-2 bg-slate-950 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-emerald-500/30 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <path d="M14 2v6h6"/>
                    <path d="M12 18v-6"/>
                    <path d="M9 15h6"/>
                  </svg>
                </div>
                <h4 className="font-bold text-sm text-slate-200">Track Certificate Request</h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Suriin ang real-time verification status ng inyong ni-request na Barangay Clearance o Certifications.
                </p>
              </div>
              <button
                onClick={() => handleProtectedNavigation('tracking')}
                className="mt-4 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-xs font-bold w-max shadow-md shadow-emerald-950 flex items-center gap-1"
              >
                Suriin
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14"/>
                  <path d="M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>

            {/* CARD 3: FEEDBACK SYSTEM (SVG Message) */}
            <div className="group bg-slate-900/30 border border-slate-800/50 p-6 rounded-2xl hover:border-emerald-500/40 hover:bg-slate-900/60 transition-all duration-300 shadow-md flex flex-col justify-between min-h-[190px]">
              <div>
                <div className="text-lg mb-2 bg-slate-950 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-emerald-500/30 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <h4 className="font-bold text-sm text-slate-200">Submit Public Feedback</h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Maghain ng mungkahi, reklamo (complaints), o direktang inquiries sa pamahalaang barangay.
                </p>
              </div>
              <button
                onClick={() => handleProtectedNavigation('feedback')}
                className="mt-4 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-xs font-bold w-max shadow-md shadow-emerald-950 flex items-center gap-1"
              >
                Mag-ulat
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14"/>
                  <path d="M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>

            {/* CARD 4: EMERGENCY CONTACTS (SVG Alert) */}
            <div className="group bg-slate-900/30 border border-slate-800/50 p-6 rounded-2xl hover:border-emerald-500/40 hover:bg-slate-900/60 transition-all duration-300 shadow-md flex flex-col justify-between min-h-[190px]">
              <div>
                <div className="text-lg mb-2 bg-slate-950 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-emerald-500/30 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <path d="M12 9v4"/>
                    <path d="M12 17h.01"/>
                  </svg>
                </div>
                <h4 className="font-bold text-sm text-slate-200">Emergency Hotlines</h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Mabilisang access sa mga numero ng ambulansya, bumbero, kapulisan, at MDRRMO Nabua.
                </p>
              </div>
              <button
                onClick={() => handleProtectedNavigation('hotlines')}
                className="mt-4 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-xs font-bold w-max shadow-md shadow-emerald-950 flex items-center gap-1"
              >
                Tawagan
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14"/>
                  <path d="M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: INFO CORNER */}
      <div className="space-y-4 self-stretch flex flex-col justify-between md:justify-start">
        {/* Important System Note Card (Glass-Morphism + SVG) */}
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-3xl p-6 space-y-4 shadow-xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
          <div className="flex items-center gap-2 text-amber-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <h3 className="font-bold text-xs uppercase tracking-widest">Important System Note</h3>
          </div>
          <hr className="border-slate-800/50" />
          <div className="space-y-4 text-xs text-slate-400 leading-relaxed">
            <p>
              <strong className="text-slate-200 block mb-1">Para sa mga Residente:</strong>
              Ang mga serbisyong pampubliko sa itaas ay nangangailangan ng secured log-in session upang matiyak ang data privacy at seguridad ng inyong records.
            </p>
            <p>
              <strong className="text-slate-200 block mb-1">Para sa mga Opisyal at Staff:</strong>
              I-click ang <span className="text-emerald-400 font-semibold">Portal Login</span> sa itaas upang ma-access ang admin registry dashboard, blotter verification modules, at analytics tools.
            </p>
          </div>
        </div>

        {/* System Identity Footer (Hidden on Mobile) */}
        <div className="hidden md:block bg-slate-950/80 border border-slate-800/50 p-4 rounded-2xl text-[11px] text-slate-600 text-center font-medium backdrop-blur-sm">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="inline-block mr-1"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          System Identity Verified • CSPC BSIT Capstone 2026
        </div>
      </div>
    </main>

    {/* =============================================
         📜 FOOTER (Glass-Morphism + SVG)
         ============================================= */}
    <footer className="relative z-10 border-t border-slate-800/50 bg-slate-950/80 backdrop-blur-sm px-6 py-4 text-center text-xs text-slate-600 font-medium">
      <div className="flex items-center justify-center gap-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        v1.0 • Opisyal na Sistema ng Barangay Bustrac © 2026.
      </div>
      <div className="mt-1 text-[10px] text-slate-700">
        Powered by CouchDB Local Synchronization
      </div>
    </footer>
  </div>
);
}