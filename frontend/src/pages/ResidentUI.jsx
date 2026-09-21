import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PouchDB from 'pouchdb';
import logo from '../assets/logo.png';
import './ResidentUI.css';
import CertificatePrintWrapper from '../components/certificates/CertificatePrintWrapper';
import { createPortal } from 'react-dom';
import {
  FaHome,
  FaFileAlt,
  FaBullhorn,
  FaCommentDots,
  FaUser,
  FaBalanceScale,
  FaHandHoldingHeart,
  FaClock
} from "react-icons/fa";

const CERT_FORM_INITIAL = {
  certType: '',
  certPurpose: '',
};

const REMOTE_DB_URL = import.meta.env.VITE_COUCHDB_URL || 'http://admin:capstone2026@localhost:5984/bustrachub_db';

const mapDocToResidentFeedback = (doc) => {
  const rawTime = doc.timestamp || doc.createdAt || doc.date || new Date().toISOString();
  return {
    _id: doc._id,
    _rev: doc._rev,
    refNumber: doc.refNumber || doc.id || doc._id || 'FB-LOG',
    feedbackType: doc.feedbackType || doc.type || doc.concernType || doc.category || 'Complaint',
    subject: doc.subject || doc.title || 'No Subject',
    details: doc.details || doc.message || doc.description || '',
    status: doc.status || 'Pending',
    timestamp: rawTime,
    response: doc.response || '',
    handledBy: doc.handledBy || '',
    dateResolved: doc.dateResolved || '',
    residentId: doc.residentId || '',
    residentName: doc.residentName || doc.fullName || doc.sender || '',
    rawDoc: doc,
  };
};

const formatResidentDate = (rawTime) => {
  if (!rawTime) return 'Recently';
  const parsed = new Date(rawTime);
  if (isNaN(parsed.getTime())) return String(rawTime);
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getBlotterStep = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'resolved' || s === 'closed') return 4;
  if (s === 'under mediation' || s === 'for mediation' || s === 'mediation') return 3;
  if (s === 'under investigation' || s === 'investigating') return 2;
  return 1;
};

const getFeedbackStep = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'resolved' || s === 'resolved & closed' || s === 'closed') return 4;
  if (s === 'responded') return 3;
  if (s === 'under review') return 2;
  return 1;
};

const getStepFromStatus = (status, existingStep) => {
  if (existingStep && Number(existingStep) > 0) return Number(existingStep);
  const s = (status || '').toLowerCase();
  if (s === 'issued' || s === 'released') return 5;
  if (s === 'ready') return 4;
  if (s === 'approved') return 3;
  if (s === 'under review' || s === 'review') return 2;
  return 1; // Submitted / Default
}; 

export default function ResidentUI() {
  const navigate = useNavigate();
  const location = useLocation();

  const loggedInUser = useMemo(() => {
    const rawUser = sessionStorage.getItem('bustrac_user');
    if (!rawUser) return { fullName: 'Resident', initials: 'RS' };
    try {
      const parsed = typeof rawUser === 'string' ? JSON.parse(rawUser) : rawUser;
      const name = parsed.fullName || parsed.user || parsed.name || 'Resident';
      const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      return { fullName: name, initials, ...parsed };
    } catch (e) {
      const initials = rawUser.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      return { fullName: rawUser, initials };
    }
  }, []);

  const greetingText = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const db = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new PouchDB('bustrachub_db');
  }, []);

  const [activeScreen, setActiveScreen] = useState('s-home');
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  const [showCertForm, setShowCertForm] = useState(false);
  const [certForm, setCertForm] = useState(CERT_FORM_INITIAL);
  const [certSuccess, setCertSuccess] = useState(null);
  
  const [printData, setPrintData] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [filterTab, setFilterTab] = useState('all');
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [myBlotters, setMyBlotters] = useState([]);
  const [myAssistance, setMyAssistance] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  const [announcementFilter, setAnnouncementFilter] = useState('All');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState(null);

  const [feedbackType, setFeedbackType] = useState('Complaint');
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const [blotterForm, setBlotterForm] = useState({
    subject: '',
    details: '',
    incidentDate: '',
    location: '',
    respondent: '',
  });

  const [lastSync, setLastSync] = useState(null);

  /* ── Effects ── */
  useEffect(() => {
    if (location.state?.activeTab) {
      const tabMap = { announcements: 's-announcements', tracking: 's-certificates', feedback: 's-feedback', hotlines: 's-home' };
      const matched = tabMap[location.state.activeTab];
      if (matched) setActiveScreen(matched);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!db || !loggedInUser) return;

    const matchesUser = (doc) => {
      if (!doc) return false;
      const isFeedback = ['feedback', 'feedback_report', 'feedback_submission'].includes(doc.type) ||
        (doc._id && String(doc._id).startsWith('feedback_'));
      if (!isFeedback) return false;

      const rid = String(loggedInUser?.residentId || loggedInUser?.id || loggedInUser?._id || '').trim();
      const uname = String(loggedInUser?.username || loggedInUser?.email || '').trim().toLowerCase();
      const name = String(loggedInUser?.fullName || loggedInUser?.name || '').trim().toLowerCase();

      const drid = String(doc.residentId || doc.userId || '').trim();
      const duname = String(doc.username || doc.sender || '').trim().toLowerCase();
      const dname = String(doc.residentName || doc.sender || doc.fullName || '').trim().toLowerCase();

      if (!rid && !uname && !name) return true;
      return (rid && drid === rid) || (uname && duname === uname) || (name && dname === name);
    };

    const load = async () => {
      try {
        const res = await db.allDocs({ include_docs: true });
        const docs = res.rows.map(r => r.doc).filter(Boolean);

        const byType = (type) => docs.filter(d => d.type === type);
        const forMe = (list) => list.filter((doc) => {
  const residentId = String(
    loggedInUser.residentId ||
    loggedInUser.id ||
    loggedInUser._id ||
    ''
  ).trim();

  const username = String(
    loggedInUser.username ||
    loggedInUser.email ||
    ''
  ).trim().toLowerCase();

  const docResidentId = String(
    doc.residentId || ''
  ).trim();

  const docUsername = String(
    doc.username || ''
  ).trim().toLowerCase();

  return (
    (residentId && docResidentId === residentId) ||
    (username && docUsername === username)
  );
});
        const sortTs = (a, b) =>
          new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0);

        setMyRequests(forMe(byType('certificate_request')).sort(sortTs));
        setMyBlotters(forMe(byType('blotter_report')).sort(sortTs));
        setAnnouncements(byType('announcement').sort(sortTs));
        setMyAssistance(forMe(byType('aid_distribution')).sort(sortTs));
        setMyFeedbacks(docs.filter(matchesUser).map(mapDocToResidentFeedback));
      } catch (e) {
        console.error('Load error', e);
      }
    };

    load();

    const changes = db.changes({ live: true, since: 'now', include_docs: true });
    changes.on('change', load);
    changes.on('error', err => console.error('Changes error', err));

    const remoteDb = new PouchDB(REMOTE_DB_URL);
    const sync = db.sync(remoteDb, { live: true, retry: true });
    sync.on('change', () => setLastSync(new Date()));
    sync.on('paused', () => setLastSync(new Date()));
    sync.on('error', err => console.error('Sync error', err));

    return () => {
      changes.cancel();
      sync.cancel();
    };
  }, [db, loggedInUser]);

  useEffect(() => {
    if (!selectedAnnouncement) return;
    const onKey = (e) => { if (e.key === 'Escape') setSelectedAnnouncement(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedAnnouncement]);

  /* ── Handlers ── */
  const goToTab = useCallback((id) => {
    setActiveScreen(id);
    window.scrollTo(0, 0);
  }, []);

  const handleLogout = useCallback(() => {
    if (window.confirm('Are you sure you want to leave the resident portal?')) {
      sessionStorage.removeItem('bustrac_user');
      sessionStorage.removeItem('lastCertRequest');
      navigate('/');
    }
  }, [navigate]);

  const updateCertField = (field) => (e) => {
    setCertForm(prev => ({ ...prev, [field]: e.target.value }));
  };

 const submitCert = useCallback(async (e) => {
  e.preventDefault();
  const { certType, certPurpose } = certForm;
  const trimmedPurpose = certPurpose.trim();
  const fullName = loggedInUser?.fullName?.trim() || '';
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  const birthdate = loggedInUser?.birthdate || '';
  const age = Number(loggedInUser?.age) || 0;
  const contact = (loggedInUser?.contact || '').replace(/\D/g, '');
  const purok = String(loggedInUser?.purok || '').trim();
  const email = (loggedInUser?.email || '').trim();

  if (!firstName || !lastName) {
    alert('Resident profile name is incomplete.');
    return;
  }
  if (!birthdate || !age) {
    alert('Birthdate or age is missing from profile.');
    return;
  }
  if (!contact || !/^09\d{9}$/.test(contact)) {
    alert('Please provide a valid 11-digit Philippine contact number.');
    return;
  }
  if (!purok) {
    alert('Purok/Area is missing from profile.');
    return;
  }
  if (!certType) {
    alert('Please select a certificate type.');
    return;
  }
  if (!trimmedPurpose) {
    alert('Please state the purpose of the request.');
    return;
  }
  if (!db) {
    alert('Local database connection is unavailable.');
    return;
  }

  const now = new Date().toISOString();
  const refNumber = 'CERT-' + Date.now().toString().slice(-6);

  // Synchronized Payload with Admin Portal Schema
  const payload = {
    _id: `cert_${Date.now()}`,
    type: 'certificate_request',
    applicantType: 'Resident', // Mahalaga para sa Admin filtering
    residentId: loggedInUser.residentId || loggedInUser.username || '',
    rbiId: loggedInUser.rbiId || '',
    residentName: fullName,
    username: loggedInUser.username || '',
    firstName,
    lastName,
    birthdate,
    age,
    contact,
    purok,
    email,
    certificateType: certType,
    certType,
    purpose: trimmedPurpose,
    certPurpose: trimmedPurpose,
    status: 'Submitted', // Align sa Step 1 ng Admin Approval Flow
    step: 1, // Step 1: Submitted -> Step 4: Approved -> Step 5: Issued
    refNumber,
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.put(payload);
    sessionStorage.setItem('lastCertRequest', JSON.stringify(payload));
    setShowCertForm(false);
    setCertSuccess({ firstName, lastName, certType, refNumber });
    setCertForm(CERT_FORM_INITIAL);
    setTimeout(() => setCertSuccess(null), 5000);
  } catch (err) {
    console.error('Cert save error', err);
    alert('Unable to save your request offline right now.');
  }
}, [certForm, db, loggedInUser]);

  const submitFeedback = useCallback(async (e) => {
    e.preventDefault();
    if (!feedbackSubject.trim() || !feedbackMessage.trim()) {
      alert('Please fill in all required fields.'); return;
    }
    if (!db) { alert('Local database is unavailable.'); return; }

    const refNumber = 'FB-' + Date.now().toString().slice(-5);
    const doc = {
      _id: `feedback_${Date.now()}`,
      type: 'feedback_report',
      refNumber,
      feedbackType,
      subject: feedbackSubject.trim(),
      details: feedbackMessage.trim(),
      message: feedbackMessage.trim(),
      priority: 'Medium',
      status: 'Pending',
      timestamp: new Date().toISOString(),
      residentId: loggedInUser?.residentId || loggedInUser?.id || loggedInUser?._id || 'RES-LOCAL',
      residentName: loggedInUser?.fullName || loggedInUser?.name || 'Resident',
      username: loggedInUser?.username || loggedInUser?.email || 'resident',
      userId: loggedInUser?.residentId || loggedInUser?.id || loggedInUser?._id || '',
      sender: loggedInUser?.fullName || 'Resident',
      response: '',
      handledBy: '',
      dateResolved: '',
    };

    try {
      await db.put(doc);
      alert(`Thank you! Your ${feedbackType.toLowerCase()} report (${refNumber}) has been submitted successfully.`);
      setFeedbackSubject('');
      setFeedbackMessage('');
      setFeedbackType('Complaint');
    } catch (err) {
      console.error('Feedback save error', err);
      alert('Unable to save your feedback offline right now.');
    }
  }, [feedbackSubject, feedbackMessage, feedbackType, db, loggedInUser]);

  const submitBlotter = useCallback(async (e) => {
    e.preventDefault();
    const { subject, details, incidentDate, location, respondent } = blotterForm;
    if (!subject.trim() || !details.trim()) {
      alert('Please fill in all required fields.'); return;
    }
    if (!db) { alert('Local database is unavailable.'); return; }

    const refNumber = 'BLTR-' + Math.floor(100000 + Math.random() * 900000);
    const currentResName = loggedInUser?.fullName || loggedInUser?.name || 'Resident';

    const payload = {
      _id: `blotter_${Date.now()}`,
      type: 'blotter_report',
      refNumber,
      caseNo: refNumber,
      incidentType: subject.trim(),
      complainant: currentResName,
      respondent: respondent.trim() || 'Under Investigation',
      location: location.trim() || 'Barangay Bustrac',
      incidentDate: incidentDate || new Date().toISOString().split('T')[0],
      details: details.trim(),
      status: 'Pending',
      timestamp: new Date().toISOString(),
      residentId: loggedInUser?.residentId || loggedInUser?.id || loggedInUser?._id || '',
    };

    try {
      await db.put(payload);
      alert(`Incident report submitted successfully! Reference No: ${refNumber}`);
      setBlotterForm({ subject: '', details: '', incidentDate: '', location: '', respondent: '' });
    } catch (err) {
      console.error('Blotter save error', err);
      alert('Unable to save blotter report offline right now.');
    }
  }, [db, loggedInUser, blotterForm]);

  const handleCancelRequest = useCallback(async (certId) => {
    if (!db) { alert('Database unavailable.'); return; }
    const target = myRequests.find(r => r._id === certId);
    if (!target) { alert('Certificate request not found.'); return; }

    const refNum = target.refNumber || certId;
    const certName = target.certType || target.certificateType || 'Certificate';
    if (!window.confirm(`Cancel this request?\n\nReference: ${refNum}\nType: ${certName}\n\nThis action cannot be undone.`)) return;

    try {
      const latest = await db.get(certId);
      await db.put({ ...latest, status: 'Cancelled', cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      alert(`Request ${refNum} has been cancelled successfully.`);
    } catch (err) {
      console.error('Cancel error', err);
      try {
        const doc = await db.get(certId);
        await db.remove(doc);
        alert(`Request ${refNum} has been removed.`);
      } catch (delErr) {
        alert('Unable to cancel request. Please try again.');
      }
    }
  }, [db, myRequests]);

  const toggleFeedback = useCallback((id) => {
    setExpandedFeedbackId(prev => (prev === id ? null : id));
  }, []);

  const openAnnouncement = useCallback((ann) => setSelectedAnnouncement(ann), []);
  const closeAnnouncement = useCallback(() => setSelectedAnnouncement(null), []);

  /* ── Derived ── */
 const pendingRequestCount = myRequests.filter(r => {
  const status = r.status || 'Pending';
  const step = Number(r.step || 1);
  return status !== 'Issued' && step < 5;
}).length;
  
   const filteredRequests = myRequests.filter(req => {
    const isIssued = req.status === 'Issued' || Number(req.step || 1) >= 5;
    if (filterTab === 'pending') return !isIssued;
    if (filterTab === 'issued') return isIssued;
    return true;
  });

  const filteredAnnouncements = announcements.filter(a =>
    announcementFilter === 'All' || a.category === announcementFilter
  );

  const navItems = [
    { id: 's-home', label: 'Home', icon: <FaHome /> },
    { id: 's-certificates', label: 'Certificates', icon: <FaFileAlt /> },
    { id: 's-announcements', label: 'News', icon: <FaBullhorn /> },
    { id: 's-feedback', label: 'Feedback', icon: <FaCommentDots /> },
    { id: 's-blotter', label: 'Blotter', icon: <FaBalanceScale /> },
    { id: 's-assistance', label: 'Aid', icon: <FaHandHoldingHeart /> },
    { id: 's-profile', label: 'Profile', icon: <FaUser /> },
  ];

  /* ── Render helpers ── */
  const certSteps = ['Submitted', 'Review', 'Approved', 'Ready', 'Issued'];
  const feedbackSteps = ['Submitted', 'Under Review', 'Responded', 'Resolved / Closed'];
  const blotterSteps = ['Filed', 'Investigation', 'Mediation', 'Resolved'];

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
  };
  return (
  <div className="resident-root-container">
    <div id="app">
      {/* Top Brand Header with Theme Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={logo}
            alt="Barangay Logo"
            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'contain' }}
          />
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.3px' }}>
            Bustrac Hub
          </span>
        </div>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          aria-label="Toggle Light/Dark Theme"
        >
          {theme === 'dark' ? (
            /* Sun Icon (Switch to Light) */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            /* Moon Icon (Switch to Dark) */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>

        <div className="content">
          {/* ==================== HOME ==================== */}
          <div className={`screen${activeScreen === 's-home' ? ' active' : ''}`} style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
          {/* Offline Banner Notice */}
          {isOffline && (
            <div className="notice notice-offline" role="status" aria-live="polite" style={{ marginBottom: 16 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
              <span><strong>Offline:</strong> Changes will sync once you are back online.</span>
            </div>
          )}

          {/* Header */}
          <div className="page-hdr" style={{ marginBottom: 16 }}>
            <div className="page-title">{greetingText}, {loggedInUser.fullName}!</div>
            <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span>Barangay Bustrac</span>
              <span>•</span>
              <span style={{ color: isOffline ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                {isOffline ? 'Offline Mode' : 'Connected & Synced'}
              </span>
            </div>
          </div>

          {/* 2-Column Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Certificates', value: myRequests.length, target: 's-certificates' },
              { label: 'Pending Requests', value: pendingRequestCount, target: 's-certificates' },
              { label: 'Announcements', value: announcements.length, target: 's-announcements' },
              { label: 'My Feedback', value: myFeedbacks.length, target: 's-feedback' },
              { label: 'Blotter Reports', value: myBlotters.length, target: 's-blotter' },
              { label: 'Assistance', value: myAssistance.length, target: 's-assistance' },
            ].map((stat) => (
              <div
                key={stat.label}
                onClick={() => goToTab(stat.target)}
                style={{
                  cursor: 'pointer',
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  justify: 'space-between',
                  transition: 'all 0.2s ease'
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 8 }}>
                  {stat.label}
                </span>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Latest Announcements Card */}
          <div className="card" style={{ padding: 18, marginBottom: 16, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="card-title" style={{ marginBottom: 12, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              Latest Announcements
            </div>
            {announcements.length ? (
              announcements.slice(0, 3).map(ann => (
                <div key={ann._id} className="list-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div
                    className="list-icon"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      flexShrink: 0,
                      background: ann.category === 'Health' ? 'var(--amber-bg)' : ann.category === 'Governance' ? 'var(--primary-light)' : 'var(--surface2)',
                      color: ann.category === 'Health' ? 'var(--amber)' : ann.category === 'Governance' ? 'var(--primary)' : 'var(--muted)'
                    }}
                  >
                    <FaBullhorn size={16} />
                  </div>
                  <div className="list-body" style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-title" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ann.title}
                    </div>
                    <div className="list-sub" style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {ann.category || 'General'} · Posted {ann.author ? `by ${ann.author}` : 'recently'}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => goToTab('s-announcements')} style={{ fontSize: 11 }}>
                    View →
                  </button>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--muted)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>No announcements yet.</div>
                <div style={{ fontSize: 12 }}>Check back later for new updates.</div>
              </div>
            )}
          </div>

          {/* Emergency Hotlines Card */}
          <div className="card" style={{ padding: 18, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="card-title" style={{ marginBottom: 12, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              Emergency Hotlines (Nabua)
            </div>
            {[
              { name: 'MDRRMO Nabua (Rescue)', sub: 'Disaster & Emergency Response', tel: '09175060294' },
              { name: 'PNP Nabua (Police Station)', sub: 'Law Enforcement & Safety Concerns', tel: '09985986014' },
              { name: 'BFP Nabua (Fire Station)', sub: 'Fire Control & Incidents', tel: '0542884676' },
              { name: 'Barangay Bustrac Hall', sub: 'Local Desk Command Center', tel: '09123456789' },
            ].map((h, idx, arr) => (
              <div
                key={h.name}
                className="list-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none'
                }}
              >
                <div className="list-body" style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-title" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{h.name}</div>
                  <div className="list-sub" style={{ fontSize: 11, color: 'var(--muted)' }}>{h.sub}</div>
                </div>
                <a
                  href={`tel:${h.tel}`}
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--green)', borderColor: 'var(--green-border)', padding: '4px 12px', fontSize: 11 }}
                >
                  Call
                </a>
              </div>
            ))}
          </div>
        </div>

          {/* ==================== CERTIFICATES ==================== */}
              <div className={`screen${activeScreen === 's-certificates' ? ' active' : ''}`} style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
              {/* Page Header */}
              <div className="page-hdr" style={{ marginBottom: 16 }}>
                <div className="page-title">My Certificates</div>
                <div className="page-sub">Request and track your barangay certificates</div>
              </div>

              {/* Request Button */}
              {!showCertForm && (
                <button
                  className="btn btn-primary btn-full"
                  style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onClick={() => setShowCertForm(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Request a Certificate</span>
                </button>
              )}

              {/* Certificate Application Form */}
              {showCertForm && (
                <div className="card" style={{ padding: 18, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      New Certificate Application
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCertForm(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}
                      aria-label="Close form"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <form onSubmit={(e) => { submitCert(e); setShowCertForm(false); }}>
                    {/* Applicant Verification Box */}
                    <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>APPLICANT DETAILS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 12 }}>
                        <div><span style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>Name</span><strong style={{ color: 'var(--text)' }}>{loggedInUser?.fullName || 'N/A'}</strong></div>
                        <div><span style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>Purok / Zone</span><strong style={{ color: 'var(--text)' }}>{loggedInUser?.purok || 'N/A'}</strong></div>
                        <div><span style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>Birthdate & Age</span><strong style={{ color: 'var(--text)' }}>{loggedInUser?.birthdate || 'N/A'} {loggedInUser?.age ? `(${loggedInUser.age} y/o)` : ''}</strong></div>
                        <div><span style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>Contact</span><strong style={{ color: 'var(--text)' }}>{loggedInUser?.contact || 'N/A'}</strong></div>
                      </div>
                    </div>

                    {/* Form Inputs */}
                    <div className="fg" style={{ marginBottom: 12 }}>
                      <label className="fl">Certificate Type *</label>
                      <select className="fc" value={certForm.certType} onChange={updateCertField('certType')} required>
                        <option value="">-- Select Certificate Type --</option>
                        <option value="Barangay Clearance">Barangay Clearance</option>
                        <option value="Certificate of Indigency">Certificate of Indigency</option>
                        <option value="Certificate of Residency">Certificate of Residency</option>
                        <option value="Barangay Business Clearance">Barangay Business Clearance</option>
                      </select>
                    </div>

                    <div className="fg" style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label className="fl" style={{ margin: 0 }}>Purpose of Request *</label>
                        <span style={{ fontSize: 10, color: (certForm.certPurpose?.length || 0) > 200 ? 'var(--red)' : 'var(--muted)' }}>
                          {certForm.certPurpose?.length || 0} / 200
                        </span>
                      </div>
                      <textarea className="fc" rows="3" maxLength={200} placeholder="e.g. For employment requirements at DOLE-Camarines Sur..." value={certForm.certPurpose} onChange={updateCertField('certPurpose')} required style={{ resize: 'none' }} />
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface2)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 16 }}>
                      Requests are routed directly to the Barangay Captain's desk for validation.
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Request</button>
                      <button type="button" className="btn btn-ghost" onClick={() => setShowCertForm(false)}>Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              {/* Success Notice */}
              {certSuccess && (
                <div className="notice notice-success" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <div>
                    <strong style={{ display: 'block', marginBottom: 2, fontSize: 14 }}>Request Filed Successfully!</strong>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      Tracking Reference: <code style={{ background: 'var(--surface)', color: 'var(--green)', padding: '2px 6px', borderRadius: 4, fontWeight: 'bold', border: '1px solid var(--border)' }}>{certSuccess.refNumber}</code>
                    </div>
                  </div>
                </div>
              )}

              {/* Requests Header & Filter Tabs */}
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>My Requests</span>
                <span className="badge b-blue" style={{ fontSize: 10 }}>{myRequests.length} Total</span>
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {['all', 'pending', 'issued'].map(tab => (
                  <button
                    key={tab}
                    className={`btn ${filterTab === tab ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, textTransform: 'capitalize' }}
                    onClick={() => setFilterTab(tab)}
                  >
                    {tab === 'all' ? `All (${myRequests.length})` : tab}
                  </button>
                ))}
              </div>

              {/* Request Cards List */}
              {filteredRequests.length ? (
                filteredRequests.map(request => {
                  const currentStep = request.step || (request.status === 'Issued' ? 5 : request.status === 'Approved' ? 3 : 1);
                  const stepCount = Number(request.step || 1);
                  const statusLabel = request.status || 'Pending';
                  const isIssued = statusLabel === 'Issued' || stepCount >= 5;
                  const isReady = statusLabel === 'Ready' || stepCount === 4;
                  const isApproved = statusLabel === 'Approved' || stepCount >= 3;
                  const refNumber = request.refNumber || `CERT-${(request._id || '').slice(-6).toUpperCase()}`;
                  const submittedDate = request.timestamp ? new Date(request.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently added';

                  const getStatusLogText = () => {
                    if (isIssued) return 'Document Released / Completed';
                    if (isReady) return 'Document Ready for Pick-up at Barangay Hall';
                    if (isApproved) return 'Approved — Preparing Certificate Document';
                    if (stepCount === 2) return 'Under Administrative Review';
                    return 'Awaiting Captain / Admin Validation';
                  };

                  return (
                    <div className="card" key={request._id} style={{ padding: 18, marginBottom: 14, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4, lineHeight: '1.3', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {request.certType}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: request.certPurpose ? 'normal' : 'italic', lineHeight: '1.4', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {request.certPurpose || 'No purpose specification declaration'}
                          </div>
                        </div>

                        {/* Dynamic Badge Status */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                          <span className={`badge ${isIssued ? 'b-green' : isReady ? 'b-blue' : 'b-amber'}`} style={{ textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.3px', padding: '3px 8px' }}>
                            {isIssued ? 'Issued' : isReady ? 'Ready' : 'Pending'}
                          </span>
                          {!isIssued && stepCount === 1 && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--red)', padding: '2px 6px', fontSize: 11, height: 'auto' }}
                              onClick={() => {
                                if (window.confirm("Are you sure you want to cancel this certificate request?")) {
                                  handleCancelRequest(request._id);
                                }
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Reference & Submission Date Metadata Box */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'var(--surface2)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 16, border: '1px solid var(--border)', fontSize: 12 }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: 'var(--muted)' }}>Ref: </span>
                          <code style={{ color: 'var(--text)', fontWeight: 700 }}>{refNumber}</code>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--muted)' }}>Filed: </span>
                          <strong style={{ color: 'var(--text)' }}>{submittedDate}</strong>
                        </div>
                      </div>

                      {/* Application Progress Tracker (5 Steps) */}
                      <div className="steps" style={{ marginBottom: 6 }}>
                        {certSteps.map((label, idx) => {
                          const value = idx + 1;
                          const done = isIssued ? true : stepCount > value;
                          const active = !isIssued && stepCount === value;
                          return (
                            <div key={label} className={`step${done ? ' done' : active ? ' active' : ' pending'}`}>
                              <div className="step-circle">
                                {done ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  value
                                )}
                              </div>
                              <div className="step-label">{label}</div>
                              {idx < certSteps.length - 1 && <div className="step-line" />}
                            </div>
                          );
                        })}
                      </div>

                      {/* Status Log Footer */}
                      <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isIssued ? 'var(--green)' : isReady ? 'var(--blue)' : 'var(--amber)' }} /> Status Log
                        </span>
                        <span style={{ fontWeight: 600, color: isIssued ? 'var(--green)' : isReady ? 'var(--primary)' : 'var(--muted)' }}>
                          {getStatusLogText()}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Empty State */
                <div className="card" style={{ textAlign: 'center', padding: '36px 20px', border: '2px dashed var(--border)', background: 'transparent', borderRadius: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                    </svg>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>No certificate requests yet.</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 16 }}>Your local logs are clear. You can request clearances and tracking histories anytime.</div>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowCertForm(true)}>Submit First Request</button>
                </div>
              )}
            </div>

          {/* ==================== ANNOUNCEMENTS / NEWS ==================== */}
          <div className={`screen${activeScreen === 's-announcements' ? ' active' : ''}`} style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
          {/* Page Header */}
          <div className="page-hdr" style={{ marginBottom: 16 }}>
            <div className="page-title">Announcements</div>
            <div className="page-sub">Official notices and community advisories from Barangay Bustrac</div>
          </div>

          {/* Filter Chips Container */}
          <div className="type-select" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {['All', 'Health', 'Governance', 'Events', 'Security'].map(label => {
              const icons = {
                All: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="3"/><circle cx="12" cy="19" r="3"/></svg>,
                Health: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
                Governance: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v16"/></svg>,
                Events: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
                Security: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              };
              const isActive = announcementFilter === label;
              return (
                <button
                  key={label}
                  type="button"
                  className={`type-btn${isActive ? ' active' : ''}`}
                  onClick={() => setAnnouncementFilter(label)}
                  style={{
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    borderRadius: 20,
                    padding: '7px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    userSelect: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: isActive ? 'var(--primary, #3b82f6)' : 'var(--surface)',
                    color: isActive ? '#ffffff' : 'var(--muted)',
                    border: isActive ? '1px solid var(--primary, #3b82f6)' : '1px solid var(--border)'
                  }}
                >
                  {icons[label]} {label}
                </button>
              );
            })}
          </div>

          {/* Announcement Cards List */}
          {!filteredAnnouncements || filteredAnnouncements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                No announcements found
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                There are currently no announcements under this category.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredAnnouncements.map(ann => (
                <div
                  key={ann._id || ann.id}
                  className="card"
                  style={{
                    padding: 18,
                    borderRadius: 14,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Badges Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    {ann.pinned && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        padding: '2px 8px',
                        borderRadius: 6,
                        color: 'var(--primary, #3b82f6)',
                        background: 'var(--primary-light)',
                        border: '1px solid var(--primary-light)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                        Pinned
                      </span>
                    )}
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      padding: '2px 8px',
                      borderRadius: 6,
                      color: 'var(--muted)',
                      background: 'var(--surface2, rgba(255, 255, 255, 0.05))',
                      border: '1px solid var(--border)'
                    }}>
                      {ann.category || 'General'}
                    </span>
                  </div>

                  {/* Title & Body */}
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 6, lineHeight: 1.3 }}>
                    {ann.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', opacity: 0.9, lineHeight: 1.5, marginBottom: 12 }}>
                    {ann.content || ann.body || ann.description}
                  </div>

                  {/* Footer Meta */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <span>Posted: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{ann.date || (ann.timestamp ? new Date(ann.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently')}</strong></span>
                    <span>By: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{ann.author || 'Barangay Admin'}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

          {/* ==================== FEEDBACK ==================== */}
          <div className={`screen${activeScreen === 's-feedback' ? ' active' : ''}`} style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
          {/* Page Header */}
          <div className="page-hdr" style={{ marginBottom: 16 }}>
            <div className="page-title">Feedback &amp; Concerns</div>
            <div className="page-sub">Submit and track your barangay concerns</div>
          </div>

          {/* Form Card */}
          <div className="card" style={{ padding: 18, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
              New Concern
            </div>

            {/* Type Selection Buttons */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Select Concern Type
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[
                  {
                    type: 'Complaint',
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    )
                  },
                  {
                    type: 'Suggestion',
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
                      </svg>
                    )
                  },
                  {
                    type: 'Inquiry',
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    )
                  }
                ].map(({ type, icon }) => {
                  const isSelected = feedbackType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFeedbackType(type)}
                      aria-pressed={isSelected}
                      style={{
                        minHeight: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        padding: '6px 2px',
                        borderRadius: 8,
                        border: isSelected ? '1px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
                        background: isSelected ? 'var(--primary-light)' : 'var(--surface2)',
                        color: isSelected ? 'var(--primary, #3b82f6)' : 'var(--muted)',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{type}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Inputs */}
            <form onSubmit={submitFeedback}>
              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl" htmlFor="feedback-subject">Subject</label>
                <input id="feedback-subject" className="fc" type="text" placeholder="Brief description of your concern" value={feedbackSubject} onChange={(e) => setFeedbackSubject(e.target.value)} required style={{ width: '100%' }} />
              </div>

              <div className="fg" style={{ marginBottom: 14 }}>
                <label className="fl" htmlFor="feedback-message">Message</label>
                <textarea id="feedback-message" className="fc" rows={3} placeholder="Describe your concern in detail..." value={feedbackMessage} onChange={(e) => setFeedbackMessage(e.target.value)} required style={{ width: '100%', resize: 'none' }} />
              </div>

              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  Your concern is securely linked to your account and will be reviewed within <strong style={{ color: 'var(--text)' }}>3 working days</strong>.
                </span>
              </div>

              <button type="submit" className="btn btn-primary btn-full" style={{ width: '100%', padding: '12px', borderRadius: 10, fontWeight: 700 }}>
                Submit Concern
              </button>
            </form>
          </div>

          {/* Submissions Section Header */}
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>My Submissions</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {myFeedbacks ? myFeedbacks.length : 0} Total
            </span>
          </div>

          {!myFeedbacks || myFeedbacks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>You have not submitted any feedback or concerns yet.</div>
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {myFeedbacks.map((item, idx, arr) => {
                const docId = item._id || item.id;
                const isExpanded = expandedFeedbackId === docId;
                const fbStep = typeof getFeedbackStep === 'function' ? getFeedbackStep(item.status) : 1;
                const steps = typeof feedbackSteps !== 'undefined' ? feedbackSteps : ['Submitted', 'Under Review', 'Responded', 'Resolved'];
                const isResolved = item.status === 'Resolved' || item.status === 'Resolved & Closed';
                const isReview = item.status === 'Under Review';
                const isResponded = item.status === 'Responded';
                const statusColor = isResolved ? 'var(--green)' : isReview ? 'var(--primary)' : isResponded ? 'var(--amber)' : 'var(--muted)';
                const statusBg = isResolved ? 'var(--green-bg)' : isReview ? 'var(--primary-light)' : isResponded ? 'var(--amber-bg)' : 'var(--surface2)';
                const statusBorder = isResolved ? 'var(--green-border)' : isReview ? 'var(--primary-light)' : isResponded ? 'var(--amber-border)' : 'var(--border)';

                return (
                  <div key={docId} style={{ padding: '14px 16px', borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--primary, #3b82f6)', fontWeight: 700 }}>
                        {item.refNumber || `FB-${String(docId).slice(-5)}`}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '2px 8px', borderRadius: 6, color: statusColor, background: statusBg, border: `1px solid ${statusBorder}` }}>
                        {item.status || 'Pending'}
                      </span>
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                      {item.subject}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                      {item.feedbackType || item.type || 'General'} · {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Just now'}
                    </div>

                    <button type="button" onClick={() => toggleFeedback(docId)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary, #3b82f6)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }} aria-expanded={isExpanded}>
                      {isExpanded ? 'Hide Details ▲' : 'View Details ▼'}
                    </button>

                    {isExpanded && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                        {/* Progress Steps */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                          {steps.map((label, index) => {
                            const value = index + 1;
                            const done = fbStep > value;
                            const active = fbStep === value;
                            return (
                              <div key={label} style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ width: 22, height: 22, borderRadius: '50%', background: done || active ? 'var(--primary, #3b82f6)' : 'var(--surface2, rgba(255,255,255,0.05))', color: done || active ? '#ffffff' : 'var(--muted)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', border: active ? '2px solid var(--primary, #3b82f6)' : '1px solid var(--border)' }}>
                                  {done ? '✓' : value}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 700, color: active ? 'var(--text)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                  {label}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Details Box */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Details
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, background: 'var(--surface2, rgba(255,255,255,0.02))', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                            {item.details || item.message || item.content}
                          </div>
                        </div>

                        {/* Response block */}
                        {item.response && (
                          <div style={{ padding: 12, background: 'var(--green-bg)', borderRadius: 8, border: '1px solid var(--green-border)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>
                              Response from {item.handledBy || 'Barangay Staff'}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{item.response}</div>
                            {item.dateResolved && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>Resolved {item.dateResolved}</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

          {/* ==================== BLOTTER ==================== */}
          <div className={`screen${activeScreen === 's-blotter' ? ' active' : ''}`} style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
          {/* Page Header */}
          <div className="page-hdr" style={{ marginBottom: 16 }}>
            <div className="page-title">Blotter Reports</div>
            <div className="page-sub">File incidents and track complaint status</div>
          </div>

          {/* ─── NEW COMPLAINT FORM ─── */}
          <div className="card" style={{ padding: 18, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
            {/* Clean Modern Header Section */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary, #3b82f6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Submit Incident Report
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                Report an incident or official concern to Barangay Bustrac. Your entry will be securely recorded and reviewed by authorized personnel.
              </p>
            </div>

            <form onSubmit={submitBlotter}>
              {/* Subject Field */}
              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl" htmlFor="blotter-subject">Incident Subject / Title *</label>
                <input id="blotter-subject" type="text" className="fc" placeholder="e.g. Property Dispute, Noise Complaint" required value={blotterForm.subject} onChange={e => setBlotterForm(p => ({ ...p, subject: e.target.value }))} style={{ width: '100%' }} />
              </div>

              {/* Date & Location Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div className="fg" style={{ margin: 0, minWidth: 0 }}>
                  <label className="fl" htmlFor="blotter-date">Incident Date</label>
                  <input id="blotter-date" type="date" className="fc" style={{ width: '100%', colorScheme: theme === 'dark' ? 'dark' : 'light' }}value={blotterForm.incidentDate} onChange={e => setBlotterForm(p => ({ ...p, incidentDate: e.target.value }))} />
                </div>
                <div className="fg" style={{ margin: 0, minWidth: 0 }}>
                  <label className="fl" htmlFor="blotter-location">Location / Zone</label>
                  <input id="blotter-location" type="text" className="fc" placeholder="e.g. Purok 3" style={{ width: '100%' }} value={blotterForm.location} onChange={e => setBlotterForm(p => ({ ...p, location: e.target.value }))} />
                </div>
              </div>

              {/* Respondent Field */}
              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl" htmlFor="blotter-respondent">Respondent (if known)</label>
                <input id="blotter-respondent" type="text" className="fc" placeholder="Name of person involved" style={{ width: '100%' }} value={blotterForm.respondent} onChange={e => setBlotterForm(p => ({ ...p, respondent: e.target.value }))} />
              </div>

              {/* Details Field */}
              <div className="fg" style={{ marginBottom: 6 }}>
                <label className="fl" htmlFor="blotter-details">Incident Details *</label>
                <textarea id="blotter-details" className="fc" rows="4" placeholder="State details, persons involved, or immediate context..." required maxLength={500} value={blotterForm.details} onChange={e => setBlotterForm(p => ({ ...p, details: e.target.value }))} style={{ width: '100%', resize: 'none' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {blotterForm.details ? blotterForm.details.length : 0}/500
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button type="submit" className="btn btn-primary btn-full" style={{ width: '100%', marginTop: 8, padding: '12px', borderRadius: 10, fontWeight: 700 }}>
                Submit Incident Report
              </button>
            </form>
          </div>

          {/* ─── MY SUBMITTED REPORTS ─── */}
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>My Submitted Reports</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {myBlotters ? myBlotters.length : 0} Total
            </span>
          </div>

          {!myBlotters || myBlotters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 14 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" style={{ marginBottom: 10, opacity: 0.5 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                No blotter records on file
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Your filed complaint histories will display here.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myBlotters.map(item => {
                const blotterStep = typeof getBlotterStep === 'function' ? getBlotterStep(item.status) : 1;
                const blotterSteps = ['Filed', 'Investigation', 'Mediation', 'Resolved'];
                const isResolved = item.status === 'Resolved' || item.status === 'Closed';
                const isMediation = item.status === 'Under Mediation' || item.status === 'For Mediation';
                const isInvestigation = item.status === 'Under Investigation';

                return (
                  <div key={item._id || item.refNumber} style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
                    {/* Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>
                          {item.incidentType || item.subject || 'Incident Complaint'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          Ref: <code style={{ color: 'var(--text)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{item.refNumber}</code>
                        </div>
                      </div>

                      {/* Clean Status Badge */}
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        padding: '2px 8px',
                        borderRadius: 6,
                        color: isResolved ? 'var(--green)' : isMediation ? 'var(--purple)' : isInvestigation ? 'var(--primary)' : 'var(--muted)',
                        background: isResolved ? 'var(--green-bg)' : isMediation ? 'var(--purple-bg)' : isInvestigation ? 'var(--primary-light)' : 'var(--surface2)',
                        border: `1px solid ${isResolved ? 'var(--green-border)' : isMediation ? 'var(--purple-border)' : isInvestigation ? 'var(--primary-light)' : 'var(--border)'}`
                      }}>
                        {item.status || 'Pending'}
                      </span>
                    </div>

                    {/* Location Info */}
                    {item.location && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        Location: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.location}</strong>
                      </div>
                    )}

                    {/* Details Box */}
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, marginBottom: 12, background: 'var(--surface2, rgba(255,255,255,0.02))', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      {item.details}
                    </div>

                    {/* Progress Stepper */}
                    <div className="steps" style={{ marginBottom: 12 }}>
                      {blotterSteps.map((label, idx) => {
                        const value = idx + 1;
                        const done = blotterStep > value;
                        const active = blotterStep === value;
                        return (
                          <div key={label} className={`step${done ? ' done' : active ? ' active' : ' pending'}`}>
                            <div className="step-circle">{done ? '✓' : value}</div>
                            <div className="step-label">{label}</div>
                            {idx < 3 && <div className="step-line" />}
                          </div>
                        );
                      })}
                    </div>

                    {/* Mediation Schedule */}
                    {item.mediationDate && (
                      <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--purple-bg)', border: '1px solid var(--purple-border)', borderRadius: 8, fontSize: 11, color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <strong>Mediation Schedule:</strong> {item.mediationDate}
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <span>Incident Date: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.incidentDate || 'N/A'}</strong></span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2, rgba(255,255,255,0.05))', color: item._rev?.startsWith('1-') ? 'var(--muted)' : '#10b981', border: '1px solid var(--border)' }}>
                        {item._rev?.startsWith('1-') ? 'Local Log' : 'Synced'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

          {/* ==================== ASSISTANCE ==================== */}
          <div 
            className={`screen${activeScreen === 's-assistance' ? ' active' : ''}`}
            style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}
          >
            {/* Page Header */}
            <div className="page-hdr" style={{ marginBottom: 16 }}>
              <div className="page-title">My Assistance</div>
              <div className="page-sub">Track your aid, relief, and beneficiary records</div>
            </div>

            {/* Stat Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {/* Total Received */}
              <div style={{ padding: '14px 10px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                  {myAssistance.length}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 6 }}>
                  Total Received
                </div>
              </div>

              {/* Pending / Scheduled */}
              <div style={{ padding: '14px 10px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ olor: 'var(--amber)', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                  {myAssistance.filter(a => ['pending', 'scheduled'].includes((a.status || '').toLowerCase())).length}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 6 }}>
                  Pending
                </div>
              </div>

              {/* Completed */}
              <div style={{ padding: '14px 10px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ color: '#10b981', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                  {myAssistance.filter(a => ['released', 'completed'].includes((a.status || '').toLowerCase())).length}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 6 }}>
                  Completed
                </div>
              </div>
            </div>

            {/* Assistance History List */}
            <div className="card" style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
              <div style={{ marginBottom: 14, fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
                Assistance History
              </div>

              {myAssistance.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', background: 'var(--surface2, rgba(255,255,255,0.02))', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--muted)', marginTop: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    No assistance records found
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    Records will appear here once the barangay admin encodes your aid distribution.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myAssistance.map(item => {
                    const isCompleted = ['released', 'completed'].includes((item.status || '').toLowerCase());
                    return (
                      <div 
                        key={item._id || item.refNumber} 
                        style={{ 
                          background: 'var(--surface2, rgba(255,255,255,0.02))', 
                          padding: 14, 
                          borderRadius: 10, 
                          border: '1px solid var(--border)' 
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', fontWeight: 700 }}>
                            {item.refNumber || item._id}
                          </span>
                          <span style={{ 
                            fontSize: 10, 
                            fontWeight: 700, 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.4px', 
                            padding: '2px 8px', 
                            borderRadius: 6, 
                            color: isCompleted ? 'var(--green)' : 'var(--amber)',
                            background: isCompleted ? 'var(--green-bg)' : 'var(--amber-bg)',
                            border: `1px solid ${isCompleted ? 'var(--green-border)' : 'var(--amber-border)'}`
                          }}>
                            {item.status || 'Pending'}
                          </span>
                        </div>

                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                          {item.programName || item.program || item.aidType || 'Assistance Program'}
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>
                          {item.description || item.details || item.notes || 'No additional details.'}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                          <div>
                            Date: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
                              {item.dateDistributed || item.date || item.timestamp ? new Date(item.dateDistributed || item.date || item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                            </strong>
                          </div>
                          <div>
                            Amount/Item: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
                              {item.amount || item.item || item.quantity || 'N/A'}
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ==================== PROFILE ==================== */}
          <div 
          className={`screen${activeScreen === 's-profile' ? ' active' : ''}`}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            boxShadow: 'none', 
            padding: 0 
          }}
        >
          {/* Page Header */}
          <div className="page-hdr" style={{ marginBottom: 16 }}>
            <div className="page-title">My Profile</div>
            <div className="page-sub">Resident information and account status</div>
          </div>

          {/* Clean Profile Header Card */}
          <div className="card" style={{ padding: 16, marginBottom: 14, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'var(--primary, #3b82f6)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 800,
                flexShrink: 0
              }}>
                {loggedInUser?.initials || 'RS'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                  {loggedInUser?.fullName || 'Resident Member'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: 6 }}>
                  ID: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{loggedInUser?.residentId || 'RES-0000'}</span>
                </div>
                
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--green-bg)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--green-border)',color: 'var(--green)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>
                    {loggedInUser?.voterStatus || 'Registered Voter'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Details List Card */}
          <div className="card" style={{ padding: '4px 16px', marginBottom: 14, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {[
              { label: 'Birthdate', value: loggedInUser?.birthdate ? new Date(loggedInUser.birthdate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A' },
              { label: 'Age', value: loggedInUser?.age ? `${loggedInUser.age} years old` : 'N/A' },
              { label: 'Gender', value: loggedInUser?.gender || 'N/A' },
              { label: 'Civil Status', value: loggedInUser?.civilStatus || 'N/A' },
              { label: 'Contact', value: loggedInUser?.contact || 'N/A' },
              { label: 'Purok', value: loggedInUser?.purok ? String(loggedInUser.purok).toLowerCase().startsWith('purok') ? loggedInUser.purok : `Purok ${loggedInUser.purok}` : 'N/A' },
              { label: 'Household', value: loggedInUser?.household || 'Not Available' }
            ].map((item, idx, arr) => (
              <div 
                key={item.label} 
                style={{ 
                  display: 'flex', 
                  justify: 'space-between', 
                  alignItems: 'center', 
                  padding: '12px 0', 
                  borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  gap: 16
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>
                  {item.label}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700, textAlign: 'right', wordBreak: 'break-word', flex: 1 }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          {/* Sync Status Card */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', marginBottom: 14, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
             <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOffline ? 'var(--amber)' : 'var(--green)' }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                  {isOffline ? 'Working Offline' : 'Online & Synced'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  {lastSync ? `Updated ${lastSync.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Waiting for sync...'}
                </div>
              </div>
            </div>
          </div>

          {/* Sign Out Button */}
          <button 
            className="btn" 
            onClick={handleLogout} 
            style={{ 
              width: '100%', 
              padding: '12px', 
              borderRadius: 12, 
              background: 'var(--red-bg)', 
              color: 'var(--red)', 
              border: '1px solid var(--red-border)', 
              fontSize: 13, 
              fontWeight: 700, 
              cursor: 'pointer' 
            }}
          >
            Sign Out
          </button>
        </div>
        </div>
        
        <div className="bottom-nav">
            {navItems.map(item => {
              const active = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  className={`bnav-item${active ? ' active' : ''}`}
                  onClick={() => goToTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="icon">{item.icon}</span>
                  <span>{item.label}</span>
                  <span className={`nav-selection-dot${active ? ' active' : ''}`} />
                </button>
              );
            })}
          </div>
        {/* Clean & Modern Mobile Footer */}
        <footer
          className="resident-footer"
          style={{
            marginTop: 28,
            padding: '24px 16px 12px',
            textAlign: 'center',
            borderTop: '1px solid var(--border)',
            background: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.4px' }}>
              Bustrac Hub
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 12,
              background: 'var(--primary-light)',
              color: 'var(--primary, #3b82f6)',
              border: '1px solid var(--primary-light)'
            }}>
              v1.0
            </span>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.75, lineHeight: 1.4 }}>
            © {new Date().getFullYear()} Barangay Bustrac, Nabua. All rights reserved.
          </div>
        </footer>
      </div>
        {/* Modal Print Overlay (Naka-Portal papunta sa document.body at may Direct Inline Styles) */}
        {printData && createPortal(
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 999999,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: '20px',
            overflowY: 'auto'
          }}>
            <CertificatePrintWrapper 
              type={
                printData.type || 
                (printData.certificateType && printData.certificateType.toLowerCase().includes('indigency') ? 'indigency' : 'clearance')
              } 
              data={{
                trackingCode: printData.trackingCode || printData._id || 'CERT-000000',
                fullName: printData.residentName || printData.fullName || 'JUAN DELA CRUZ',
                address: printData.address || 'Barangay Bustrac, Nabua, Camarines Sur',
                purpose: printData.purpose || 'Local Employment',
                issueDate: printData.issueDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                orNumber: printData.orNumber || 'N/A',
                amountPaid: printData.amountPaid || 0,
                ctcNumber: printData.ctcNumber || 'N/A',
                purok: printData.purok || 'Zone 2',
                civilStatus: printData.civilStatus || 'Single',
                age: printData.age,
                patientName: printData.patientName,
                relationToPatient: printData.relationToPatient,
                punongBarangay: printData.punongBarangay
              }} 
              onClose={() => setPrintData(null)} 
            />
          </div>,
          document.body
        )}
        {/* Announcement Details Modal */}
        {selectedAnnouncement && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '16px'
            }}
            onClick={() => setSelectedAnnouncement(null)}
          >
            <div 
              style={{
                background: 'var(--surface, #1e293b)',
                border: '1px solid var(--border, #334155)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '520px',
                maxHeight: '85vh',
                overflowY: 'auto',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
                position: 'relative'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, color: 'var(--primary, #3b82f6)', background: 'var(--primary-light)', border: '1px solid var(--primary-light)' }}>
                    {selectedAnnouncement.category || 'General'}
                  </span>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text, #f8fafc)', marginTop: 8, marginBottom: 0, lineHeight: 1.3 }}>
                    {selectedAnnouncement.title}
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedAnnouncement(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted, #94a3b8)', cursor: 'pointer', fontSize: 20, padding: 4 }}
                >
                  ✕
                </button>
              </div>

              {/* Author & Date Metadata */}
              <div style={{ fontSize: 12, color: 'var(--muted, #94a3b8)', marginBottom: 16, borderBottom: '1px solid var(--border, #334155)', paddingBottom: 12 }}>
                Posted by <strong style={{ color: 'var(--text, #f8fafc)' }}>{selectedAnnouncement.author || 'Barangay Office'}</strong> · {selectedAnnouncement.date || 'Recently posted'}
              </div>

              {/* Full Body Text */}
              <div style={{ fontSize: 14, color: 'var(--text, #f8fafc)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {selectedAnnouncement.body}
              </div>

              {/* Footer Close Button */}
              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn btn-outline btn-sm" 
                  onClick={() => setSelectedAnnouncement(null)}
                  style={{ padding: '8px 18px', borderRadius: 8, cursor: 'pointer' }}
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