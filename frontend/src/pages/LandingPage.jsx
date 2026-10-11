import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import bustracLogo from '../assets/logo.png';
import './LandingPage.css';

const PUBLIC_API = `${import.meta.env.VITE_API_URL || 'http://192.168.1.3:5000'}/api/public`;

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
  const [selectedItem, setSelectedItem] = useState(null);
  const [visibleAnnouncementsCount, setVisibleAnnouncementsCount] = useState(6);
  const [visibleActivitiesCount, setVisibleActivitiesCount] = useState(6);
  const [visibleAdvisoriesCount, setVisibleAdvisoriesCount] = useState(6);

  // 1. Normalize helper
  const normalizeAnnouncements = useCallback((rawList) => {
    if (!Array.isArray(rawList)) return [];
    return rawList
      .filter((item) => item && (item.type === 'announcement' || String(item._id || '').startsWith('announcement_')))
      .filter((item) => (item.status || 'Published').toLowerCase() !== 'draft')
      .map((item) => ({
        id: item._id || item.id || Math.random().toString(36).slice(2),
        title: item.title || 'Untitled',
        description: item.description || item.content || item.body || '',
        date: item.date || item.timestamp || item.createdAt || new Date().toISOString(),
        category: item.category || 'General',
        pinned: !!item.pinned,
        author: item.author || 'Barangay Office',
        status: item.status || 'Published',
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, []);

  // 2. LocalStorage loader
  const loadAnnouncementsFromLocalStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem('bustrac_announcements');
      if (raw) {
        return normalizeAnnouncements(JSON.parse(raw));
      }
    } catch (e) {
      console.warn('Failed to read localStorage announcements:', e);
    }
    return [];
  }, [normalizeAnnouncements]);
  
    // ── 3. Activities helpers ──
  const normalizeActivities = useCallback((rawList) => {
    if (!Array.isArray(rawList)) return [];
    return rawList
      .filter((item) => item && (item.type === 'activity' || item.id || item._id))
      .map((item) => ({
        id: item._id || item.id || Math.random().toString(36).slice(2),
        title: item.title || 'Untitled Activity',
        description: item.description || item.content || item.body || item.details || '',
        date: item.date || item.activityDate || item.timestamp || item.createdAt || new Date().toISOString(),
        category: item.category || 'Events',
        location: item.location || '',
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, []);

  const loadActivitiesFromLocalStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem('bustrac_activities');
      if (raw) {
        return normalizeActivities(JSON.parse(raw));
      }
    } catch (e) {
      console.warn('Failed to read localStorage activities:', e);
    }
    return [];
  }, [normalizeActivities]);

  // ── 4. Advisories helpers ──
  const normalizeAdvisories = useCallback((rawList) => {
    if (!Array.isArray(rawList)) return [];
    return rawList
      .filter((item) => item && (item.type === 'advisory' || String(item._id || '').startsWith('advisory_')))
      .map((item) => ({
        id: item._id || item.id || Math.random().toString(36).slice(2),
        title: item.title || 'Untitled Advisory',
        description: item.description || item.content || item.body || '',
        date: item.date || item.timestamp || item.createdAt || new Date().toISOString(),
        category: item.category || 'Relief',
        priority: item.priority || 'Medium',
        status: item.status || 'Active',
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, []);

  const loadAdvisoriesFromLocalStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem('bustrac_advisories');
      if (raw) {
        return normalizeAdvisories(JSON.parse(raw));
      }
    } catch (e) {
      console.warn('Failed to read localStorage advisories:', e);
    }
    return [];
  }, [normalizeAdvisories]);

  // 3. SINGLE MERGED useEffect (dapat nasa ibaba ng callbacks na ginagamit nito)
    // ── 5. SINGLE MERGED useEffect: LocalStorage + API ──
  useEffect(() => {
    let cancelled = false;
    const hadLight = document.documentElement.classList.contains('light');

    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
    document.documentElement.classList.remove('light');
    document.body.classList.remove('light');

    // A. Immediate load from admin localStorage: ANNOUNCEMENTS
    const localAnnouncements = loadAnnouncementsFromLocalStorage();
    if (localAnnouncements.length > 0) {
      setData((prev) => ({ ...prev, announcements: localAnnouncements }));
    }

    // B. Immediate load from admin localStorage: ACTIVITIES
    const localActivities = loadActivitiesFromLocalStorage();
    if (localActivities.length > 0) {
      setData((prev) => ({ ...prev, activities: localActivities }));
    }

    // C. Immediate load from admin localStorage: ADVISORIES
    const localAdvisories = loadAdvisoriesFromLocalStorage();
    if (localAdvisories.length > 0) {
      setData((prev) => ({ ...prev, advisories: localAdvisories }));
    }

    // D. Fetch from public API then merge
    const fetchPublicData = async () => {
      try {
        const response = await fetch(PUBLIC_API);
        if (!response.ok) {
          throw new Error('Failed to fetch public portal announcements and details.');
        }
        const result = await response.json();

        if (!cancelled) {
          // Merge announcements (API takes precedence)
          const apiAnnouncements = normalizeAnnouncements(result.announcements || []);
          const annMap = new Map();
          apiAnnouncements.forEach((a) => annMap.set(a.id, a));
          localAnnouncements.forEach((a) => {
            if (!annMap.has(a.id)) annMap.set(a.id, a);
          });
          const mergedAnnouncements = Array.from(annMap.values()).sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          );

          // Merge activities (API takes precedence)
          const apiActivities = normalizeActivities(result.activities || []);
          const actMap = new Map();
          apiActivities.forEach((a) => actMap.set(a.id, a));
          localActivities.forEach((a) => {
            if (!actMap.has(a.id)) actMap.set(a.id, a);
          });
          const mergedActivities = Array.from(actMap.values()).sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          );

          // Merge advisories (API takes precedence)
          const apiAdvisories = normalizeAdvisories(result.advisories || []);
          const advMap = new Map();
          apiAdvisories.forEach((a) => advMap.set(a.id, a));
          localAdvisories.forEach((a) => {
            if (!advMap.has(a.id)) advMap.set(a.id, a);
          });
          const mergedAdvisories = Array.from(advMap.values()).sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          );

          setData({
            announcements: mergedAnnouncements,
            advisories: mergedAdvisories,
            activities: mergedActivities,
            hotlines: result.hotlines || [],
            office: result.office || null,
          });
          setError('');
        }
      } catch (err) {
        console.error('Error fetching public portal data:', err);
        if (!cancelled) {
          if (
            localAnnouncements.length === 0 &&
            localActivities.length === 0 &&
            localAdvisories.length === 0
          ) {
            setError(
              'Hindi maikonekta sa server o ma-load ang mga anunsyo. Pakisubukan ulit mamaya.'
            );
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchPublicData();

    const intervalId = setInterval(() => {
      fetchPublicData();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      if (hadLight) {
        document.documentElement.classList.add('light');
        document.body.classList.add('light');
      }
    };
  }, [
    loadAnnouncementsFromLocalStorage,
    normalizeAnnouncements,
    loadActivitiesFromLocalStorage,
    normalizeActivities,
    loadAdvisoriesFromLocalStorage,
    normalizeAdvisories,
  ]);

  const goToLogin = (activeTab = null) => {
    navigate('/login', {
      state: {
        redirectTo: '/resident',
        ...(activeTab ? { activeTab } : {}),
      },
    });
  };

  return (
    <div className="landing-page-root min-h-screen bg-slate-950 text-slate-300 font-sans selection:bg-emerald-500 selection:text-white relative overflow-clip">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-emerald-500/10 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute top-96 right-0 w-[500px] h-[300px] bg-blue-500/5 blur-[100px] pointer-events-none rounded-full" />

      {/* ========================================================= HEADER ========================================================= */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 border border-slate-700/60 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
              <img src={bustracLogo} alt="Barangay Bustrac Logo" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-wide leading-none">
                  Bustrac Hub
                </h1>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono font-semibold">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Barangay Bustrac Public Portal
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
            <button onClick={() => scrollTo('announcements')} className="hover:text-emerald-400 transition-colors">Announcements</button>
            <button onClick={() => scrollTo('relief')} className="hover:text-emerald-400 transition-colors">Relief & Aid</button>
            <button onClick={() => scrollTo('activities')} className="hover:text-emerald-400 transition-colors">Activities</button>
            <button onClick={() => scrollTo('services')} className="hover:text-emerald-400 transition-colors">Services</button>
            <button onClick={() => scrollTo('hotlines')} className="hover:text-emerald-400 transition-colors">Hotlines</button>
          </nav>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-lg text-xs font-bold tracking-wide transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <span>Portal Login</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
          </button>
        </div>
      </header>

      {/* ========================================================= MAIN ========================================================= */}
      <main className="max-w-6xl mx-auto px-6 py-12 relative z-10">

        {/* ======================================================= HERO ======================================================= */} 
        <section className="py-12 md:py-16 flex flex-col justify-center mb-8">
          <p className="text-xs font-bold tracking-wider text-emerald-400 uppercase mb-3 flex items-center gap-2"> 
            <span className="h-px w-6 bg-emerald-500" /> Official Barangay Information Portal 
          </p> 

          <h2 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.15] mb-6 max-w-4xl"> 
            Makabagong Serbisyo para sa <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">Barangay Bustrac</span> 
          </h2> 

          <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-2xl mb-8"> 
            Aksesible at mabilis na pampublikong impormasyon tungkol sa mga anunsyo, relief advisories, barangay activities, at online resident services. 
          </p> 

          <div className="flex flex-wrap items-center gap-4"> 
            <button type="button" onClick={() => scrollTo('announcements')} className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-2" > 
              <span>View Announcements</span> 
            </button> 
            <button type="button" onClick={() => scrollTo('services')} className="px-5 py-3 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 rounded-xl text-sm font-semibold transition-all backdrop-blur-sm" > 
              Explore Services 
            </button> 
          </div> 

          {/* Key Metrics / Highlights Strip */} 
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 pt-8 border-t border-slate-800/60"> 
            <div> 
              <p className="text-2xl font-black text-white">24/7</p> 
              <p className="text-xs text-slate-400 mt-0.5">Emergency Assistance</p> 
            </div> 
            <div> 
              <p className="text-2xl font-black text-emerald-400">Online</p> 
              <p className="text-xs text-slate-400 mt-0.5">Certificate Requests</p> 
            </div> 
            <div> 
              <p className="text-2xl font-black text-cyan-400">Direct</p> 
              <p className="text-xs text-slate-400 mt-0.5">Community Feedback</p> 
            </div> 
            <div> 
              <p className="text-2xl font-black text-slate-200">Real-Time</p> 
              <p className="text-xs text-slate-400 mt-0.5">Public Advisories</p> 
            </div> 
          </div> 
        </section>

        {/* ======================================================= LOAD ERROR ======================================================= */}
        {error && (
          <div className="mb-10 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-center gap-3">
            <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}

        {/* ======================================================= ANNOUNCEMENTS ======================================================= */}
        <section id="announcements" className="mb-16">
          <SectionHeading 
            eyebrow="Community Updates" 
            title="Latest Announcements" 
            description="Official announcements and community notices from Barangay Bustrac." 
            icon={
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A2.5 2.5 0 013 11.2V8.8a2.5 2.5 0 012.436-2.483l6.564-.469M15 8h.01M19 10h.01M21 12h.01"/>
              </svg>
            } 
          />

          {loading ? (
            <LoadingGrid count={3} />
          ) : data.announcements.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {data.announcements.slice(0, visibleAnnouncementsCount).map((item) => (
                  <AnnouncementCard key={item.id} item={item} onSelect={setSelectedItem} />
                ))}
              </div>

              {data.announcements.length > visibleAnnouncementsCount && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => setVisibleAnnouncementsCount((prev) => prev + 6)}
                    className="px-6 py-2.5 text-xs font-bold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-all"
                  >
                    Load More Announcements ({data.announcements.length - visibleAnnouncementsCount} remaining)
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState message="No public announcements available at this time." />
          )}
        </section>

        {/* ======================================================= RELIEF / AID ADVISORIES ======================================================= */}
        <section id="relief" className="mb-16">
          <SectionHeading
            eyebrow="Relief & Assistance"
            title="Relief & Aid Advisories"
            description="Public information regarding relief operations and assistance programs."
            icon={
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            }
          />

          {loading ? (
            <LoadingGrid count={2} />
          ) : data.advisories.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {data.advisories.slice(0, visibleAdvisoriesCount).map((item) => (
                  <AdvisoryCard key={item.id} item={item} onSelect={setSelectedItem} />
                ))}
              </div>

              {data.advisories.length > visibleAdvisoriesCount && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => setVisibleAdvisoriesCount((prev) => prev + 6)}
                    className="px-6 py-2.5 text-xs font-bold text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-all"
                  >
                    Load More Advisories ({data.advisories.length - visibleAdvisoriesCount} remaining)
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState message="No active relief or assistance advisories." />
          )}
        </section>

        {/* ======================================================= ACTIVITIES ======================================================= */}
        <section id="activities" className="mb-16">
          <SectionHeading
            eyebrow="Community Calendar"
            title="Barangay Activities"
            description="Upcoming programs, meetings, and community activities."
            icon={
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            }
          />
          {loading ? (
            <LoadingGrid count={3} />
          ) : data.activities.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {data.activities.slice(0, visibleActivitiesCount).map((item) => (
                  <ActivityCard key={item.id} item={item} onSelect={setSelectedItem} />
                ))}
              </div>

              {data.activities.length > visibleActivitiesCount && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => setVisibleActivitiesCount((prev) => prev + 6)}
                    className="px-6 py-2.5 text-xs font-bold text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-all"
                  >
                    Load More Activities ({data.activities.length - visibleActivitiesCount} remaining)
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState message="No upcoming barangay activities available." />
          )}
        </section>

        {/* ======================================================= PUBLIC SERVICES ======================================================= */}
        <section id="services" className="mb-16">
          <SectionHeading
            eyebrow="Public Services"
            title="Barangay Services"
            description="Access available services through the Bustrac Hub Resident Portal."
            icon={
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <ServiceCard
              title="Announcements"
              description="View official barangay announcements and community updates."
              action="View Updates"
              onClick={() => scrollTo('announcements')}
              iconPath="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A2.5 2.5 0 013 11.2V8.8a2.5 2.5 0 012.436-2.483l6.564-.469M15 8h.01M19 10h.01M21 12h.01"
            />
            <ServiceCard
              title="Certificate Tracking"
              description="Check the status of your submitted certificate request."
              action="Check Status"
              onClick={() => goToLogin('tracking')}
              iconPath="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
            <ServiceCard
              title="Feedback & Concerns"
              description="Submit a concern, suggestion, complaint, or inquiry."
              action="Submit Request"
              onClick={() => goToLogin('feedback')}
              iconPath="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
            <ServiceCard
              title="Emergency Hotlines"
              description="View emergency assistance information and contact details."
              action="View Numbers"
              onClick={() => scrollTo('hotlines')}
              iconPath="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </div>
        </section>

        {/* ======================================================= HOTLINES + OFFICE ======================================================= */}
        <section id="hotlines" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-16 scroll-mt-24">
        {/* EMERGENCY HOTLINES */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400"> Emergency Assistance </p>
                <h3 className="text-lg font-bold text-white"> Emergency Hotlines </h3>
              </div>
            </div>

            {loading ? (
              <div className="space-y-2.5">
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
              </div>
            ) : data.hotlines.length > 0 ? (
              <div className="space-y-2.5">
                {data.hotlines.map((item) => (
                  <Hotline key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState message="Emergency contact information is currently unavailable." />
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <span>24/7 Hotlines para sa Emergency at Sakuna</span>
          </div>
        </div>

        {/* BARANGAY OFFICE */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m3 0h1m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-1 0v-4"/>
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400"> Barangay Information </p>
                <h3 className="text-lg font-bold text-white"> Barangay Office </h3>
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
              </div>
            ) : data.office ? (
              <div className="divide-y divide-slate-800/80">
                <InfoRow label="Barangay" value={data.office.barangay} />
                <InfoRow label="Municipality" value={data.office.municipality} />
                <InfoRow label="Office Hours" value={data.office.officeHours} />
                <InfoRow label="Public Updates" value={data.office.publicUpdates} />
              </div>
            ) : (
              <EmptyState message="Barangay office information is currently unavailable." />
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span>Official Hall Location: Brgy. Bustrac, Nabua, Camarines Sur</span>
          </div>
        </div>
      </section>

        {/* ======================================================= RESIDENT PORTAL CTA ======================================================= */}
        <section className="mb-4">
          <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 rounded-2xl p-8 relative overflow-clip flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
            <div className="max-w-2xl relative z-10">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2 block">
                Resident Portal Access
              </span>
              <h3 className="text-2xl font-bold text-white mb-2">
                May kailangan ka bang sertipiko o gustong magpasa ng concern?
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Mag-log in sa Resident Portal upang makapaghiling ng barangay clearance, mag-track ng status ng iyong request, at magpadala ng direktang feedback.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/login')}
              className="shrink-0 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-emerald-950/80 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 relative z-10"
            >
              <span>Open Resident Portal</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
            </button>

            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-emerald-500/5 to-transparent pointer-events-none" />
          </div>
        </section>
      </main>

      {/* ========================================================= FOOTER ========================================================= */}
      <footer className="border-t border-slate-800/80 bg-slate-950/90 relative z-10">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <img src={bustracLogo} alt="Logo" className="w-6 h-6 object-contain opacity-80" />
              <div>
                <p className="text-sm font-bold text-slate-200">Bustrac Hub</p>
                <p className="text-xs text-slate-400">Barangay Bustrac Public Portal</p>
              </div>
            </div>

            <div className="text-xs text-slate-400 md:text-right">
              <p>© 2026 Barangay Bustrac. All rights reserved.</p>
              <p className="mt-1 font-mono text-[11px] text-slate-400">
                CSPC BSIT Capstone Project
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* DETAIL MODAL */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100">

            <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-slate-800">
              <div>
                <span className="inline-block px-2.5 py-1 text-[10px] font-bold tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full uppercase mb-2">
                  {selectedItem.category || 'Notice'}
                </span>
                <h3 className="text-xl font-bold text-white leading-snug">
                  {selectedItem.title}
                </h3>
              </div>

              <button
                onClick={() => setSelectedItem(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {selectedItem.date && (
              <p className="text-xs text-slate-400 mb-4 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {new Date(selectedItem.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            )}

            <div className="text-sm text-slate-300 whitespace-pre-line leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
              {selectedItem.description || selectedItem.content || 'Walang karagdagang detalye.'}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================ SECTION HEADING ================================================================ */
function SectionHeading({ eyebrow, title, description, icon }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
          {eyebrow}
        </p>
      </div>
      <h3 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-400 mt-1 max-w-xl">
        {description}
      </p>
    </div>
  );
}

/* ================================================================ ANNOUNCEMENT CARD ================================================================ */
function AnnouncementCard({ item, onSelect }) {
  return (
    <article className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-950/50 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          {/* Ipakita ang tunay na Category badge sa halip na "ANNOUNCEMENT" */}
          <span className="inline-flex px-2.5 py-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] font-extrabold tracking-wider uppercase">
            {item.category || 'Notice'}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {formatDate(item.date)}
          </span>
        </div>
        <h4 className="text-base font-bold text-white mb-2 leading-snug">
          {item.title}
        </h4>
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
          {item.description}
        </p>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-end">
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="text-emerald-400 text-xs font-bold flex items-center gap-1 group cursor-pointer hover:text-emerald-300 transition-colors bg-transparent border-0 p-0"
        >
          Read details <span className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </div>
    </article>
  );
}

/* ================================================================ ADVISORY CARD ================================================================ */
function AdvisoryCard({ item, onSelect }) {
  return (
    <article className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700/80 transition-all">
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <span className="text-[11px] text-slate-400 font-mono">
            {formatDate(item.date)}
          </span>
        </div>
        <h4 className="text-lg font-bold text-white mb-2">
          {item.title}
        </h4>
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
          {item.description}
        </p>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">
          {item.category || 'Relief & Aid'}
        </span>
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="text-amber-400 text-xs font-bold flex items-center gap-1 group cursor-pointer hover:text-amber-300 transition-colors bg-transparent border-0 p-0"
        >
          View details <span className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </div>
    </article>
  );
}

/* ================================================================ ACTIVITY CARD ================================================================ */
function ActivityCard({ item, onSelect }) {
  return (
    <article className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500/30 transition-all">
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <span className="inline-flex px-2.5 py-1 rounded-md border border-blue-500/20 bg-blue-500/10 text-blue-400 text-[10px] font-extrabold tracking-wider">
            ACTIVITY
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {formatDate(item.date)}
          </span>
        </div>
        <h4 className="text-base font-bold text-white mb-2">
          {item.title}
        </h4>
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
          {item.description}
        </p>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">
          {item.category || 'Events'}
        </span>
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="text-blue-400 text-xs font-bold flex items-center gap-1 group cursor-pointer hover:text-blue-300 transition-colors bg-transparent border-0 p-0"
        >
          View Details
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </div>
    </article>
  );
}

/* ================================================================ SERVICE CARD ================================================================ */
function ServiceCard({ title, description, action, onClick, iconPath }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 hover:bg-slate-800/80 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
    >
      <div>
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center text-emerald-400 mb-4 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath}/></svg>
        </div>
        <h4 className="font-bold text-white text-base mb-1.5 group-hover:text-emerald-400 transition-colors">
          {title}
        </h4>
        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          {description}
        </p>
      </div>
      <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 pt-2 border-t border-slate-800/60 w-full">
        <span>{action}</span>
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </span>
    </button>
  );
}

/* ================================================================ HOTLINE ================================================================ */
function Hotline({ item }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
      <div>
        <p className="text-xs font-bold text-slate-200">
          {item.name}
        </p>
        <p className="text-xs text-slate-400 font-mono mt-0.5">
          {item.number}
        </p>
      </div>
      {item.number && item.number !== 'N/A' && (
        <a
          href={`tel:${item.number}`}
          className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          Call
        </a>
      )}
    </div>
  );
}

/* ================================================================ INFORMATION ROW ================================================================ */
function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between items-center gap-4 py-3 text-xs">
      <span className="text-slate-400 font-medium">
        {label}
      </span>
      <span className="text-slate-200 font-semibold text-right">
        {value || 'Not available'}
      </span>
    </div>
  );
}

/* ================================================================ EMPTY STATE ================================================================ */
function EmptyState({ message }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 text-center backdrop-blur-sm">
      <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto mb-3 text-slate-500">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </div>
      <p className="text-xs text-slate-400">
        {message}
      </p>
    </div>
  );
}

/* ================================================================ LOADING COMPONENTS ================================================================ */
function LoadingGrid({ count = 3 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <LoadingCard key={index} />
      ))}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 animate-pulse">
      <div className="h-4 w-24 bg-slate-800 rounded-md mb-6" />
      <div className="h-5 w-3/4 bg-slate-800 rounded-md mb-3" />
      <div className="h-3 w-full bg-slate-800 rounded-md mb-2" />
      <div className="h-3 w-5/6 bg-slate-800 rounded-md" />
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="h-12 bg-slate-950/80 border border-slate-800/80 rounded-xl animate-pulse" />
  );
}

/* ================================================================ DATE FORMATTER ================================================================ */
function formatDate(value) {
  if (!value) {
    return 'Date not specified';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
