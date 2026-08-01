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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-between relative overflow-hidden">
      
      {/* ── BACKGROUND TEXTURE ENGINE ── */}
      <div className="absolute inset-0 z-0 opacity-35 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-emerald-500/10 blur-[130px] rounded-full" />
        <div className="absolute -bottom-20 -left-20 w-[500px] h-[500px] bg-slate-500/5 blur-[100px] rounded-full" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40" />
      </div>

      {/* HEADER SECTION */}
      <header className="relative z-10 border-b border-slate-900 bg-slate-950/70 backdrop-blur-md px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center p-1 shadow-inner shadow-slate-950">
            <img 
              src={bustracLogo} 
              alt="Bustrac Mini Seal" 
              className="w-full h-full object-contain filter brightness-110"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentNode.innerHTML = '<span class="text-emerald-500 text-xs font-bold">B</span>';
              }}
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Bustrac Hub
            </h1>
            <p className="text-xs text-slate-500 font-medium">Barangay Bustrac Public Portal</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/login')}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-all text-sm shadow-lg shadow-emerald-950/50 hover:shadow-emerald-600/20 active:scale-98"
        >
          Portal Login →
        </button>
      </header>

      {/* HERO & PUBLIC VIEWING MAIN CONTENT */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12 flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        
        <div className="md:col-span-2 space-y-8">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm grid grid-cols-1 sm:grid-cols-5 gap-6 items-center">
            <div className="sm:col-span-3 space-y-4">
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block">
                Camarines Sur • Municipality of Nabua
              </span>
              <h2 className="text-3xl font-black tracking-tight leading-tight text-slate-100">
                Makabagong Serbisyo para sa Barangay Bustrac
              </h2>
              <p className="text-slate-400 leading-relaxed text-sm">
                Ang Bustrac Hub ay ang opisyal na portal ng pamahalaang barangay upang mapabilis ang mga transaksyon, pamamahagi ng tulong (aid distribution), at pag-isyu ng mga digital certificates para sa bawat residente.
              </p>
            </div>

            <div className="sm:col-span-2 flex justify-center sm:justify-end relative group">
              <div className="absolute top-1/2 left-1/2 sm:left-auto sm:right-16 -translate-x-1/2 -translate-y-1/2 w-44 h-44 bg-emerald-500/10 rounded-full filter blur-2xl pointer-events-none group-hover:bg-emerald-500/15 transition-colors duration-500" />
              <div className="relative w-40 h-40 bg-slate-950/80 rounded-full border-4 border-double border-slate-800 p-4 shadow-xl flex items-center justify-center transform group-hover:rotate-[3deg] transition-all duration-300">
                <img 
                  src={bustracLogo} 
                  alt="Official Seal of Barangay Bustrac"
                  className="w-full h-full object-contain filter drop-shadow-[0_4px_10px_rgba(16,185,129,0.2)]"
                />
              </div>
            </div>
          </div>

          {/* INTERACTIVE PUBLIC CARDS */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">Public Services &amp; Action Hub</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* CARD 1: ANNOUNCEMENTS */}
              <div className="group bg-slate-900/30 border border-slate-900/60 p-6 rounded-2xl hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all duration-300 shadow-md flex flex-col justify-between min-h-[190px]">
                <div>
                  <div className="text-lg mb-2 bg-slate-950 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-slate-700 transition-colors">📢</div>
                  <h4 className="font-bold text-sm text-slate-200">Barangay Announcements</h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">Alamin ang mga pinakabagong balita, proyekto, at iskedyul ng ayuda sa ating komunidad.</p>
                </div>
                <button
                  onClick={() => handleProtectedNavigation('announcements')}
                  className="mt-4 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-xs font-bold w-max shadow-md shadow-emerald-950"
                >
                  Tingnan →
                </button>
              </div>

              {/* CARD 2: DOCUMENT TRACKING */}
              <div className="group bg-slate-900/30 border border-slate-900/60 p-6 rounded-2xl hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all duration-300 shadow-md flex flex-col justify-between min-h-[190px]">
                <div>
                  <div className="text-lg mb-2 bg-slate-950 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-slate-700 transition-colors">📋</div>
                  <h4 className="font-bold text-sm text-slate-200">Track Certificate Request</h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">Suriin ang real-time verification status ng inyong ni-request na Barangay Clearance o Certifications.</p>
                </div>
                <button
                  onClick={() => handleProtectedNavigation('tracking')}
                  className="mt-4 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-xs font-bold w-max shadow-md shadow-emerald-950"
                >
                  Suriin →
                </button>
              </div>

              {/* CARD 3: FEEDBACK SYSTEM */}
              <div className="group bg-slate-900/30 border border-slate-900/60 p-6 rounded-2xl hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all duration-300 shadow-md flex flex-col justify-between min-h-[190px]">
                <div>
                  <div className="text-lg mb-2 bg-slate-950 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-slate-700 transition-colors">💬</div>
                  <h4 className="font-bold text-sm text-slate-200">Submit Public Feedback</h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">Maghain ng mungkahi, reklamo (complaints), o direktang inquiries sa pamahalaang barangay.</p>
                </div>
                <button
                  onClick={() => handleProtectedNavigation('feedback')}
                  className="mt-4 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-xs font-bold w-max shadow-md shadow-emerald-950"
                >
                  Mag-ulat →
                </button>
              </div>

              {/* CARD 4: EMERGENCY CONTACTS */}
              <div className="group bg-slate-900/30 border border-slate-900/60 p-6 rounded-2xl hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all duration-300 shadow-md flex flex-col justify-between min-h-[190px]">
                <div>
                  <div className="text-lg mb-2 bg-slate-950 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-slate-700 transition-colors">🚨</div>
                  <h4 className="font-bold text-sm text-slate-200">Emergency Hotlines</h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">Mabilisang access sa mga numero ng ambulansya, bumbero, kapulisan, at MDRRMO Nabua.</p>
                </div>
                <button
                  onClick={() => handleProtectedNavigation('hotlines')}
                  className="mt-4 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-xs font-bold w-max shadow-md shadow-emerald-950"
                >
                  Tawagan →
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT SIDE: INFO CORNER */}
        <div className="space-y-4 self-stretch flex flex-col justify-between md:justify-start">
          <div className="bg-slate-900/50 border border-slate-900 rounded-3xl p-6 space-y-4 shadow-xl backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            <div className="flex items-center gap-2 text-amber-500">
              <span className="text-xl">💡</span>
              <h3 className="font-bold text-xs uppercase tracking-widest">Important System Note</h3>
            </div>
            <hr className="border-slate-900" />
            <div className="space-y-4 text-xs text-slate-400 leading-relaxed">
              <p>
                <strong className="text-slate-200 block mb-1">Para sa mga Residente:</strong> Ang mga serbisyong pampubliko sa itaas ay nangangailangan ng secured log-in session upang matiyak ang data privacy at seguridad ng inyong records.
              </p>
              <p>
                <strong className="text-slate-200 block mb-1">Para sa mga Opisyal at Staff:</strong> I-click ang <span className="text-emerald-400 font-semibold">Portal Login</span> sa itaas upang ma-access ang admin registry dashboard, blotter verification modules, at analytics tools.
              </p>
            </div>
          </div>
          <div className="hidden md:block bg-slate-950 border border-slate-900 p-4 rounded-2xl text-[11px] text-slate-600 text-center font-medium">
            System Identity Verified • CSPC BSIT Capstone 2026
          </div>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/80 backdrop-blur-sm px-6 py-4 text-center text-xs text-slate-600 font-medium">
        v1.0 • Opisyal na Sistema ng Barangay Bustrac © 2026. Powered by CouchDB Local Synchronization.
      </footer>
    </div>
  );
}