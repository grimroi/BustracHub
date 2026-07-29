import React from 'react';
import { useNavigate } from 'react-router-dom';
import bustracLogo from '../assets/logo.png';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-between relative overflow-hidden">
      
      {/* ── BACKGROUND TEXTURE ENGINE (ASYMMETRIC GLOW & GRID MESH) ── */}
      <div className="absolute inset-0 z-0 opacity-35 pointer-events-none">
        {/* Asymmetric Light Spot 1: Emerald glow sa kanang itaas */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-emerald-500/10 blur-[130px] rounded-full" />
        {/* Asymmetric Light Spot 2: Slate/Blue glow sa kaliwang ibaba */}
        <div className="absolute -bottom-20 -left-20 w-[500px] h-[500px] bg-slate-500/5 blur-[100px] rounded-full" />
        {/* Clean Line Grid Overlay for high-tech structural texture */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40" />
      </div>

      {/* HEADER SECTION */}
      <header className="relative z-10 border-b border-slate-900 bg-slate-950/70 backdrop-blur-md px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {/* Micro Logo Branding Container */}
          <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center p-1 shadow-inner shadow-slate-950">
            <img 
              src={bustracLogo} 
              alt="Bustrac Mini Seal" 
              className="w-full h-full object-contain filter brightness-110"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentNode.innerHTML = '<span className="text-emerald-500 text-xs font-bold">B</span>';
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
        
        {/* LEFT & CENTER (COLSPAN 2): REDESIGNED ASYMMETRIC HERO & SEAL COMPONENT */}
        <div className="md:col-span-2 space-y-8">
          
          {/* HERO BANNER BLOCK WITH DYNAMIC DISPLAY SPLIT */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm grid grid-cols-1 sm:grid-cols-5 gap-6 items-center">
            
            {/* Texts Context (Colspan 3) */}
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

            {/* THE PROMINENT VISUAL LOGO INJECTOR (Colspan 2) */}
            <div className="sm:col-span-2 flex justify-center sm:justify-end relative group">
              {/* Backlight Aura Ring for Visual Depth */}
              <div className="absolute top-1/2 left-1/2 sm:left-auto sm:right-16 -translate-x-1/2 -translate-y-1/2 w-44 h-44 bg-emerald-500/10 rounded-full filter blur-2xl pointer-events-none group-hover:bg-emerald-500/15 transition-colors duration-500" />
              
              {/* Main Structural Frame */}
              <div className="relative w-40 h-40 bg-slate-950/80 rounded-full border-4 border-double border-slate-800 p-4 shadow-xl flex items-center justify-center transform group-hover:rotate-[3deg] transition-all duration-300">
                <img 
                  src={bustracLogo} 
                  alt="Official Seal of Barangay Bustrac"
                  className="w-full h-full object-contain filter drop-shadow-[0_4px_10px_rgba(16,185,129,0.2)]"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentNode.innerHTML = `
                      <div className="text-center text-slate-600 flex flex-col justify-center items-center">
                        <span className="text-3xl">🏛️</span>
                        <span className="text-[10px] uppercase font-bold tracking-widest mt-1 text-slate-400">Official Seal</span>
                      </div>
                    `;
                  }}
                />
              </div>
            </div>

          </div>

          {/* PUBLIC VIEWING FEATURES TRACK ENGINE */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">Public Services & Tracking</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-900/30 border border-slate-900 p-6 rounded-2xl hover:border-slate-800 hover:bg-slate-900/50 transition-all group duration-300 shadow-md">
                <div className="text-2xl mb-3 bg-slate-950 w-10 h-10 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-slate-700 transition-colors">📋</div>
                <h4 className="font-bold text-sm text-slate-200">Document Tracking</h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">Suriin ang status ng inyong ni-request na Barangay Clearance o Certificate online.</p>
              </div>
              <div className="bg-slate-900/30 border border-slate-900 p-6 rounded-2xl hover:border-slate-800 hover:bg-slate-900/50 transition-all group duration-300 shadow-md">
                <div className="text-2xl mb-3 bg-slate-950 w-10 h-10 flex items-center justify-center rounded-xl border border-slate-800 group-hover:border-slate-700 transition-colors">📢</div>
                <h4 className="font-bold text-sm text-slate-200">Barangay Announcements</h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">Alamin ang mga pinakabagong balita, proyekto, at iskedyul ng ayuda sa komunidad.</p>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT SIDE: ASYMMETRIC CARD GROUP FOR SYSTEM INSTRUCTIONS */}
        <div className="space-y-4 self-stretch flex flex-col justify-between md:justify-start">
          <div className="bg-slate-900/50 border border-slate-900 rounded-3xl p-6 space-y-4 shadow-xl backdrop-blur-sm relative overflow-hidden">
            {/* Subtle top edge highlighting */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            
            <div className="flex items-center gap-2 text-amber-500">
              <span className="text-xl">💡</span>
              <h3 className="font-bold text-xs uppercase tracking-widest">Important System Note</h3>
            </div>
            <hr className="border-slate-900" />
            
            <div className="space-y-4 text-xs text-slate-400 leading-relaxed">
              <p>
                <strong className="text-slate-200 block mb-1">Para sa mga Residente:</strong> Ang portal na ito ay kasalukuyang tumatakbo bilang local public viewing service. Para sa mga request, mangyaring makipag-ugnayan sa inyong itinalagang Purok Leader.
              </p>
              <p>
                <strong className="text-slate-200 block mb-1">Para sa mga Opisyal at Staff:</strong> I-click ang <span className="text-emerald-400 font-semibold">Portal Login</span> sa itaas upang ma-access ang system registry, blotter filing, at aid monitoring tools.
              </p>
            </div>
          </div>
          
          {/* Mini Meta Block for Visual Balance under the note */}
          <div className="hidden md:block bg-slate-950 border border-slate-900 p-4 rounded-2xl text-[11px] text-slate-600 text-center font-medium">
            System Identity Verified • CSPC BSIT Capstone 2026
          </div>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-slate-950 bg-slate-950/80 backdrop-blur-sm px-6 py-4 text-center text-xs text-slate-600 font-medium">
        v1.0 • Opisyal na Sistema ng Barangay Bustrac © 2026. Powered by CouchDB Local Synchronization.
      </footer>
    </div>
  );
}