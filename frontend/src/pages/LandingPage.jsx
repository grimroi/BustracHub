import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import bustracLogo from '../assets/logo.png';
import './LandingPage.css';

// FIX 1: Wag hardcode IP. Gamitin localhost para gumana sa 4173/4174 at sa thesis defense
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const PUBLIC_API = `${API_BASE}/api/public`;

const VISIBLE_STEP = 6;

export default function LandingPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    announcements: [],
    advisories: [],
    activities: [],
    hotlines: [],
    office: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [visibleCounts, setVisibleCounts] = useState({
    announcements: VISIBLE_STEP,
    activities: VISIBLE_STEP,
    advisories: VISIBLE_STEP,
  });

  // === GENERIC NORMALIZER (isa na lang, hindi 3 paulit-ulit) ===
  const normalizeList = useCallback((rawList, type) => {
    if (!Array.isArray(rawList)) return [];
    return rawList
      .filter(Boolean)
      .filter((item) => {
        if (type === 'announcement') return item.type === 'announcement' || String(item._id || '').startsWith('announcement_');
        if (type === 'advisory') return item.type === 'advisory' || String(item._id || '').startsWith('advisory_');
        if (type === 'activity') return item.type === 'activity' || item.id || item._id;
        return true;
      })
      .filter((item) => (item.status || 'Published').toLowerCase() !== 'draft')
      .map((item) => ({
        id: item._id || item.id || Math.random().toString(36).slice(2),
        title: item.title || `Untitled ${type}`,
        description: item.description || item.content || item.body || item.details || '',
        date: item.date || item.activityDate || item.timestamp || item.createdAt || new Date().toISOString(),
        category: item.category || (type === 'advisory' ? 'Relief' : type === 'activity' ? 'Events' : 'General'),
        priority: item.priority || 'Medium',
        status: item.status || (type === 'advisory' ? 'Active' : 'Published'),
        location: item.location || '',
        pinned: !!item.pinned,
        author: item.author || 'Barangay Office',
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, []);

  // === GENERIC LOCALSTORAGE LOADER ===
  const loadLocal = useCallback((key, type) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return normalizeList(JSON.parse(raw), type);
    } catch (e) {
      console.warn(`Failed to read ${key}:`, e);
    }
    return [];
  }, [normalizeList]);

  // === OFFLINE-FIRST: Local agad, tapos API merge ===
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // Force dark for public portal (thesis design)
    const hadLight = document.documentElement.classList.contains('light');
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
    document.documentElement.classList.remove('light');
    document.body.classList.remove('light');

    const localAnnouncements = loadLocal('bustrac_announcements', 'announcement');
    const localActivities = loadLocal('bustrac_activities', 'activity');
    const localAdvisories = loadLocal('bustrac_advisories', 'advisory');

    // Immediate render from local (offline-first)
    if (localAnnouncements.length || localActivities.length || localAdvisories.length) {
      setData((prev) => ({
        ...prev,
        announcements: localAnnouncements,
        activities: localActivities,
        advisories: localAdvisories,
      }));
      setLoading(false);
    }

    const fetchPublicData = async () => {
      try {
        const res = await fetch(PUBLIC_API, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        if (cancelled) return;

        // Merge with API precedence
        const merge = (apiList, localList) => {
          const map = new Map();
          apiList.forEach((a) => map.set(a.id, a));
          localList.forEach((a) => { if (!map.has(a.id)) map.set(a.id, a); });
          return Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
        };

        setData({
          announcements: merge(normalizeList(result.announcements || [], 'announcement'), localAnnouncements),
          activities: merge(normalizeList(result.activities || [], 'activity'), localActivities),
          advisories: merge(normalizeList(result.advisories || [], 'advisory'), localAdvisories),
          hotlines: result.hotlines || [],
          office: result.office || null,
        });
        setError('');
        if (!cancelled) setOfflineMode(false);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn('[offline-first] Public API failed, using localStorage:', err?.message || err);
        if (!cancelled) {
          setOfflineMode(true);
          if (localAnnouncements.length === 0 && localActivities.length === 0 && localAdvisories.length === 0) {
            setError('Hindi maikonekta sa server. Offline mode - walang cached data.');
          } else {
            setError(''); // Wag mag error kung may local data - offline-first yan
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPublicData();
    const intervalId = setInterval(fetchPublicData, 30000);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(intervalId);
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      if (hadLight) {
        document.documentElement.classList.add('light');
        document.body.classList.add('light');
      }
    };
  }, [loadLocal, normalizeList]);

  const goToLogin = (activeTab = null) => {
    navigate('/login', { state: { redirectTo: '/resident', ...(activeTab ? { activeTab } : {}) } });
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const header = document.querySelector('header');
    const top = el.getBoundingClientRect().top + window.scrollY - (header?.offsetHeight || 64) - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  return (
    <div className="landing-page-root min-h-screen bg-slate-950 text-slate-300 font-sans selection:bg-emerald-500 selection:text-white relative overflow-clip">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-emerald-500/10 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute top-96 right-0 w-[500px] h-[300px] bg-blue-500/5 blur-[100px] pointer-events-none rounded-full" />

      {/* HEADER - BUSTRAC HUB ALL CAPS */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 border border-slate-700/60 rounded-xl flex items-center justify-center shadow-inner">
              <img src={bustracLogo} alt="Barangay Bustrac Logo" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-wide leading-none">BUSTRAC HUB</h1>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono font-semibold">v1.0</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Barangay Bustrac Public Portal</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
            <button onClick={() => scrollToSection('announcements')} className="hover:text-emerald-400">Announcements</button>
            <button onClick={() => scrollToSection('relief')} className="hover:text-emerald-400">Relief & Aid</button>
            <button onClick={() => scrollToSection('activities')} className="hover:text-emerald-400">Activities</button>
            <button onClick={() => scrollToSection('services')} className="hover:text-emerald-400">Services</button>
            <button onClick={() => scrollToSection('hotlines')} className="hover:text-emerald-400">Hotlines</button>
          </nav>
          <button type="button" onClick={() => navigate('/login')} className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-950/50 flex items-center gap-2">
            <span>Portal Login</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 relative z-10">
        <section className="py-12 md:py-16 flex flex-col justify-center mb-8">
          <p className="text-xs font-bold tracking-wider text-emerald-400 uppercase mb-3 flex items-center gap-2"><span className="h-px w-6 bg-emerald-500" /> Official Barangay Information Portal</p>
          <h2 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.15] mb-6 max-w-4xl">
            Makabagong Serbisyo para sa <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">Barangay Bustrac</span>
          </h2>
          <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-2xl mb-8">Aksesible at mabilis na pampublikong impormasyon — offline-first, kaya gumagana kahit walang internet.</p>
          <div className="flex flex-wrap items-center gap-4">
            <button onClick={() => scrollToSection('announcements')} className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/40">View Announcements</button>
            <button onClick={() => scrollToSection('services')} className="px-5 py-3 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 rounded-xl text-sm font-semibold">Explore Services</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 pt-8 border-t border-slate-800/60">
            <div><p className="text-2xl font-black text-white">24/7</p><p className="text-xs text-slate-400">Emergency Assistance</p></div>
            <div><p className="text-2xl font-black text-emerald-400">Offline</p><p className="text-xs text-slate-400">PouchDB First</p></div>
            <div><p className="text-2xl font-black text-cyan-400">Direct</p><p className="text-xs text-slate-400">Community Feedback</p></div>
            <div><p className="text-2xl font-black text-slate-200">Real-Time</p><p className="text-xs text-slate-400">CouchDB Sync</p></div>
          </div>
        </section>

        {offlineMode && (
          <div className="mb-10 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-sm text-amber-300">Offline Mode - showing cached public data</p>
          </div>
        )}

        {error && (
          <div className="mb-10 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-center gap-3">
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}

        <section id="announcements" className="mb-16">
          <SectionHeading title="Latest Announcements" />
          {loading ? <LoadingGrid count={3} /> : data.announcements.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {data.announcements.slice(0, visibleCounts.announcements).map((item) => <AnnouncementCard key={item.id} item={item} onSelect={setSelectedItem} />)}
              </div>
              {data.announcements.length > visibleCounts.announcements && (
                <div className="mt-8 text-center">
                  <button onClick={() => setVisibleCounts((p) => ({ ...p, announcements: p.announcements + VISIBLE_STEP }))} className="px-6 py-2.5 text-xs font-bold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-xl">Load More ({data.announcements.length - visibleCounts.announcements})</button>
                </div>
              )}
            </>
          ) : <EmptyState message="No public announcements available." />}
        </section>

        <section id="relief" className="mb-16">
          <SectionHeading title="Relief & Aid Advisories" />
          {loading ? <LoadingGrid count={2} /> : data.advisories.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {data.advisories.slice(0, visibleCounts.advisories).map((item) => <AdvisoryCard key={item.id} item={item} onSelect={setSelectedItem} />)}
              </div>
              {data.advisories.length > visibleCounts.advisories && (
                <div className="mt-8 text-center">
                  <button onClick={() => setVisibleCounts((p) => ({ ...p, advisories: p.advisories + VISIBLE_STEP }))} className="px-6 py-2.5 text-xs font-bold text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded-xl">Load More ({data.advisories.length - visibleCounts.advisories})</button>
                </div>
              )}
            </>
          ) : <EmptyState message="No active relief advisories." />}
        </section>

        <section id="activities" className="mb-16">
          <SectionHeading title="Barangay Activities" />
          {loading ? <LoadingGrid count={3} /> : data.activities.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {data.activities.slice(0, visibleCounts.activities).map((item) => <ActivityCard key={item.id} item={item} onSelect={setSelectedItem} />)}
              </div>
              {data.activities.length > visibleCounts.activities && (
                <div className="mt-8 text-center">
                  <button onClick={() => setVisibleCounts((p) => ({ ...p, activities: p.activities + VISIBLE_STEP }))} className="px-6 py-2.5 text-xs font-bold text-blue-400 border border-blue-500/30 bg-blue-500/10 rounded-xl">Load More ({data.activities.length - visibleCounts.activities})</button>
                </div>
              )}
            </>
          ) : <EmptyState message="No upcoming activities." />}
        </section>

        <section id="services" className="mb-16">
          <SectionHeading title="Barangay Services" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <ServiceCard title="Announcements" description="View official announcements." action="View Updates" onClick={() => scrollToSection('announcements')} iconPath="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6" />
            <ServiceCard title="Certificate Tracking" description="Check status of certificate request." action="Check Status" onClick={() => goToLogin('tracking')} iconPath="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            <ServiceCard title="Feedback" description="Submit concern or suggestion." action="Submit Request" onClick={() => goToLogin('feedback')} iconPath="M8 10h.01M12 10h.01M16 10h.01" />
            <ServiceCard title="Emergency Hotlines" description="View emergency contacts." action="View Numbers" onClick={() => scrollToSection('hotlines')} iconPath="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </div>
        </section>

        <section id="hotlines" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-16">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4">Emergency Hotlines</h3>
            {loading ? <LoadingRow /> : data.hotlines.length > 0 ? data.hotlines.map((item) => <Hotline key={item.id} item={item} />) : <EmptyState message="No hotlines." />}
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4">Barangay Office</h3>
            {loading ? <LoadingRow /> : data.office ? (
              <div className="divide-y divide-slate-800/80">
                <InfoRow label="Barangay" value={data.office.barangay} />
                <InfoRow label="Municipality" value={data.office.municipality} />
                <InfoRow label="Office Hours" value={data.office.officeHours} />
              </div>
            ) : <EmptyState message="Office info unavailable." />}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950/90">
        <div className="max-w-6xl mx-auto px-6 py-8 flex justify-between">
          <div className="flex items-center gap-3"><img src={bustracLogo} alt="Logo" className="w-6 h-6 opacity-80" /><div><p className="text-sm font-bold text-slate-200">BUSTRAC HUB</p><p className="text-xs text-slate-400">Barangay Bustrac Public Portal</p></div></div>
          <div className="text-xs text-slate-400"><p>© 2026 Brgy. Bustrac, Nabua, Camarines Sur.</p><p className="font-mono text-[11px]">CSPC BSIT Capstone - Offline-First Integrated MIS</p></div>
        </div>
      </footer>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between mb-4"><h3 className="text-xl font-bold text-white">{selectedItem.title}</h3><button onClick={() => setSelectedItem(null)} className="text-slate-400">✕</button></div>
            <p className="text-xs text-slate-400 mb-4">{formatDate(selectedItem.date)}</p>
            <div className="text-sm text-slate-300 whitespace-pre-line max-h-[60vh] overflow-y-auto">{selectedItem.description}</div>
            <div className="mt-6 flex justify-end"><button onClick={() => setSelectedItem(null)} className="px-4 py-2 text-xs bg-slate-800 rounded-lg">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ title }) {
  return <div className="mb-6"><h3 className="text-2xl md:text-3xl font-extrabold text-white">{title}</h3></div>;
}
function AnnouncementCard({ item, onSelect }) {
  return <article className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700 transition-all"><div><span className="inline-flex px-2.5 py-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] font-extrabold uppercase mb-4">{item.category}</span><h4 className="text-base font-bold text-white mb-2">{item.title}</h4><p className="text-xs text-slate-400 line-clamp-3">{item.description}</p></div><div className="mt-6 pt-4 border-t border-slate-800/80 flex justify-between items-center"><span className="text-[11px] text-slate-400 font-mono">{formatDate(item.date)}</span><button onClick={() => onSelect(item)} className="text-emerald-400 text-xs font-bold">Read details →</button></div></article>;
}
function AdvisoryCard({ item, onSelect }) {
  return <article className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between"><div><h4 className="text-lg font-bold text-white mb-2">{item.title}</h4><p className="text-xs text-slate-400 line-clamp-3">{item.description}</p></div><div className="mt-6 pt-4 border-t border-slate-800/80 flex justify-between"><span className="text-[11px] text-slate-400">{item.category}</span><button onClick={() => onSelect(item)} className="text-amber-400 text-xs font-bold">View details →</button></div></article>;
}
function ActivityCard({ item, onSelect }) {
  return <article className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between"><div><h4 className="text-base font-bold text-white mb-2">{item.title}</h4><p className="text-xs text-slate-400 line-clamp-3">{item.description}</p></div><div className="mt-6 pt-4 border-t border-slate-800/80 flex justify-between"><span className="text-[11px] text-slate-400">{item.category}</span><button onClick={() => onSelect(item)} className="text-blue-400 text-xs font-bold">View Details →</button></div></article>;
}
function ServiceCard({ title, description, action, onClick, iconPath }) {
  return <button onClick={onClick} className="text-left bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-5 transition-all"><h4 className="font-bold text-white mb-1">{title}</h4><p className="text-xs text-slate-400 mb-4">{description}</p><span className="text-xs text-emerald-400 font-bold">{action} →</span></button>;
}
function Hotline({ item }) {
  const primary = item.number?.split('/')[0]?.replace(/[^\d+]/g, '') || '';
  return <div className="flex justify-between p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-2"><div><p className="text-xs font-bold text-slate-200">{item.name}</p><p className="text-xs text-slate-400 font-mono">{item.number}</p></div>{primary && <a href={`tel:${primary}`} className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs font-bold">Call</a>}</div>;
}
function InfoRow({ label, value }) { return <div className="flex justify-between py-3 text-xs"><span className="text-slate-400">{label}</span><span className="text-slate-200 font-semibold">{value || 'Not available'}</span></div>; }
function EmptyState({ message }) { return <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 text-center"><p className="text-xs text-slate-400">{message}</p></div>; }
function LoadingGrid({ count = 3 }) { return <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{Array.from({ length: count }).map((_, i) => <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 animate-pulse"><div className="h-4 w-24 bg-slate-800 rounded mb-6" /><div className="h-5 w-3/4 bg-slate-800 rounded mb-3" /></div>)}</div>; }
function LoadingRow() { return <div className="h-12 bg-slate-950/80 border border-slate-800/80 rounded-xl animate-pulse mb-2" />; }
function formatDate(value) {
  if (!value) return 'Date not specified';
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
