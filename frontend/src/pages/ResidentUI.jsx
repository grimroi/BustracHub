import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PouchDB from 'pouchdb';
import logo from '../assets/logo.png';
import './ResidentUI.css';

import {
  FaHome,
  FaFileAlt,
  FaBullhorn,
  FaCommentDots,
  FaUser,
  FaBalanceScale,
  FaHandHoldingHeart
} from "react-icons/fa";

const CERT_FORM_INITIAL = {
  firstName: '',
  lastName: '',
  birthdate: '',
  age: '',
  contact: '',
  purok: '',
  email: '',
  certType: '',
  certPurpose: '',
};

const REMOTE_DB_URL = 'http://admin:capstone2026@localhost:5984/bustrachub_db';

// Helper mapper function for Resident UI PouchDB docs
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

// Safe Date Formatter
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

// Blotter step mapper
const getBlotterStep = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'resolved' || s === 'closed') return 4;
  if (s === 'under mediation' || s === 'for mediation' || s === 'mediation') return 3;
  if (s === 'under investigation' || s === 'investigating') return 2;
  return 1; // Pending / Filed
};

// Feedback step mapper
const getFeedbackStep = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'resolved' || s === 'resolved & closed' || s === 'closed') return 4;
  if (s === 'responded') return 3;
  if (s === 'under review') return 2;
  return 1; // Submitted / Pending
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
      const initials = name.split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      return {
        fullName: name,
        initials,
        ...parsed
      };
    } catch (e) {
      const initials = rawUser.split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      return { fullName: rawUser, initials };
    }
  }, []);

  const greetingText = useMemo(() => {
    const currentHour = new Date().getHours();
    if (currentHour < 12) return 'Good morning';
    if (currentHour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const db = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new PouchDB('bustrac_db');
  }, []);

  // Which "screen" (tab) is currently visible
  const [activeScreen, setActiveScreen] = useState('s-home');

  // Offline banner
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  // Certificate request form
  const [showCertForm, setShowCertForm] = useState(false);
  const [certForm, setCertForm] = useState(CERT_FORM_INITIAL);
  const [certSuccess, setCertSuccess] = useState(null);

  // Local data collections
  const [myRequests, setMyRequests] = useState([]);
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [myBlotters, setMyBlotters] = useState([]);
  const [myAssistance, setMyAssistance] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  // Announcements filter chips
  const [announcementFilter, setAnnouncementFilter] = useState('All');

  // Feedback form
  const [feedbackType, setFeedbackType] = useState('Complaint');
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [expandedFeedbackId, setExpandedFeedbackId] = useState(null);
  
  const toggleFeedback = useCallback((id) => {
  setExpandedFeedbackId((prev) => (prev === id ? null : id));
}, []);
  const [lastSync, setLastSync] = useState(null);

  // State variables for blotter report form inputs
  const [blotterSubject, setBlotterSubject] = useState('');
  const [blotterDetails, setBlotterDetails] = useState('');
  const [blotterIncidentDate, setBlotterIncidentDate] = useState('');
  const [blotterLocation, setBlotterLocation] = useState('');
  
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  useEffect(() => {
    if (location.state?.activeTab) {
      const tabMap = {
        announcements: 's-announcements',
        tracking: 's-certificates',
        feedback: 's-feedback',
        hotlines: 's-home',
      };

      const matchedTab = tabMap[location.state.activeTab];

      if (matchedTab) {
        setActiveScreen(matchedTab);
        console.log(`Context Switch: Initialized view to ${matchedTab}`);
      }

      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Track online/offline status for the offline notice banner
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  useEffect(() => {
    if (!db || !loggedInUser) return undefined;

    const matchesLoggedInUser = (doc) => {
      if (!doc) return false;

      const validTypes = ['feedback', 'feedback_report', 'feedback_submission'];
      const isFeedbackDoc =
        validTypes.includes(doc.type) ||
        (doc._id && String(doc._id).startsWith('feedback_'));
      if (!isFeedbackDoc) return false;

      const currentResId = String(
        loggedInUser?.residentId || loggedInUser?.id || loggedInUser?._id || ''
      ).trim();
      const currentUname = String(
        loggedInUser?.username || loggedInUser?.email || ''
      ).trim().toLowerCase();
      const currentName = String(
        loggedInUser?.fullName || loggedInUser?.name || loggedInUser?.residentName || ''
      ).trim().toLowerCase();

      const docResId = String(doc.residentId || doc.userId || '').trim();
      const docUname = String(doc.username || doc.sender || '').trim().toLowerCase();
      const docName = String(doc.residentName || doc.sender || doc.fullName || '').trim().toLowerCase();

      const matchId = Boolean(currentResId && docResId === currentResId);
      const matchUser = Boolean(currentUname && docUname === currentUname);
      const matchName = Boolean(currentName && docName === currentName);

      if (!currentResId && !currentUname && !currentName) {
        return true;
      }

      return matchId || matchUser || matchName;
    };

    const refreshCollections = async () => {
      try {
        const result = await db.allDocs({ include_docs: true });
        const docs = result.rows
          .map((row) => row.doc)
          .filter(Boolean)
          .filter(
            (doc) =>
              doc.type === 'certificate_request' ||
              doc.type === 'announcement' ||
              doc.type === 'blotter_report' ||
              doc.type === 'aid_distribution'
          );

        const sortedRequests = docs
          .filter((doc) =>
            doc.type === 'certificate_request' &&
            doc.residentId === (loggedInUser.residentId || loggedInUser.username)
          )
          .sort(
            (a, b) =>
              new Date(b.timestamp || b.createdAt || 0).getTime() -
              new Date(a.timestamp || a.createdAt || 0).getTime()
          );

        const sortedBlotters = docs
          .filter((doc) =>
            doc.type === 'blotter_report' &&
            doc.residentId === (loggedInUser.residentId || loggedInUser.username)
          )
          .sort(
            (a, b) =>
              new Date(b.timestamp || b.createdAt || 0).getTime() -
              new Date(a.timestamp || a.createdAt || 0).getTime()
          );

        const sortedAnnouncements = docs
          .filter((doc) => doc.type === 'announcement')
          .sort(
            (a, b) =>
              new Date(b.timestamp || b.createdAt || 0).getTime() -
              new Date(a.timestamp || a.createdAt || 0).getTime()
          );

        const sortedAssistance = docs
          .filter((doc) =>
            doc.type === 'aid_distribution' &&
            doc.residentId === (loggedInUser.residentId || loggedInUser.username)
          )
          .sort(
            (a, b) =>
              new Date(b.timestamp || b.createdAt || 0).getTime() -
              new Date(a.timestamp || a.createdAt || 0).getTime()
          );

        setMyRequests(sortedRequests);
        setMyBlotters(sortedBlotters);
        setAnnouncements(sortedAnnouncements);
        setMyAssistance(sortedAssistance);

        // Also refresh feedbacks via the matchesLoggedInUser filter
        const feedbackDocs = result.rows
          .map((row) => row.doc)
          .filter(matchesLoggedInUser)
          .map(mapDocToResidentFeedback);
        setMyFeedbacks(feedbackDocs);
      } catch (error) {
        console.error('Unable to load offline data', error);
      }
    };

    refreshCollections();

    const changes = db.changes({ live: true, include_docs: true });
    changes.on('change', () => {
      refreshCollections();
    });
    changes.on('error', (error) => {
      console.error('PouchDB changes error', error);
    });

    const remoteDb = new PouchDB(REMOTE_DB_URL);
    const sync = db.sync(remoteDb, { live: true, retry: true });

    sync.on("active", () => {
      console.log("Syncing...");
    });

    sync.on("complete", () => {
      console.log("Sync complete");
    });

    sync.on('change', () => {
      setLastSync(new Date());
    });

    sync.on('paused', () => {
      setLastSync(new Date());
    });

    sync.on('error', (error) => {
      console.error('Sync error', error);
    });

    return () => {
      changes.cancel();
      sync.cancel();
    };
  }, [db, loggedInUser]);

  const goToTab = useCallback((screenId) => {
    setActiveScreen(screenId);
    window.scrollTo(0, 0);
  }, []);

  const handleLogout = useCallback(() => {
    if (window.confirm('Are you sure you want to leave the resident portal?')) {
      sessionStorage.removeItem('bustrac_user');
      sessionStorage.removeItem('lastCertRequest');
      navigate('/');
    }
  }, [navigate]);

  const updateCertField = (field) => (event) => {
    setCertForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const submitCert = useCallback(
    async (event) => {
      event.preventDefault();

      const {
        certType,
        certPurpose,
        email,
      } = certForm;

      const trimmedPurpose = certPurpose.trim();
      const trimmedEmail = email.trim();

      const fullName = loggedInUser?.fullName?.trim() || '';
      const birthdate = loggedInUser?.birthdate || '';
      const age = Number(loggedInUser?.age) || 0;
      const rawContact = loggedInUser?.contact?.trim() || '';
      const contact = rawContact.replace(/\D/g, '');
      const purok = String(loggedInUser?.purok || '').trim();

      const nameParts = fullName.split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1
        ? nameParts.slice(1).join(' ')
        : '';

      if (!firstName) {
        alert('Resident profile name is required.');
        return;
      }

      if (!lastName) {
        alert('Resident profile last name is required.');
        return;
      }

      if (!birthdate) {
        alert('Birthdate is missing from your resident profile.');
        return;
      }

      if (!age || age < 1 || age > 120) {
        alert('Your resident profile contains an invalid age.');
        return;
      }

      if (!contact) {
        alert('Contact number is missing from your resident profile.');
        return;
      }

      if (!purok) {
        alert('Purok/Area is missing from your resident profile.');
        return;
      }

      if (!certType) {
        alert('Please select a certificate type.');
        return;
      }

      if (!trimmedPurpose) {
        alert('Please provide the purpose of the certificate.');
        return;
      }

      if (
        trimmedEmail &&
        !trimmedEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      ) {
        alert('Please enter a valid email address.');
        return;
      }

      if (!/^09\d{9}$/.test(contact)) {
        alert('Your resident profile contains an invalid Philippine mobile number.');
        return;
      }

      if (!db) {
        alert('Local database is unavailable.');
        return;
      }

      const certRequest = {
        firstName,
        lastName,
        birthdate,
        age,
        contact,
        purok,
        email: trimmedEmail,
        certType,
        certPurpose: trimmedPurpose,
        dateSubmitted: new Date().toLocaleString(),
        status: 'Pending',
      };

      sessionStorage.setItem(
        'lastCertRequest',
        JSON.stringify(certRequest)
      );

      const refNumber = 'CERT-' + Date.now().toString().slice(-6);

      try {
        await db.post({
          residentId: loggedInUser.residentId || loggedInUser.username,
          residentName: loggedInUser.fullName,
          username: loggedInUser.username,
          refNumber,
          ...certRequest,
          type: 'certificate_request',
          timestamp: new Date().toISOString(),
          status: 'Pending',
          step: 1,
        });

        setShowCertForm(false);

        setCertSuccess({
          firstName,
          lastName,
          certType,
          refNumber,
        });

        setCertForm(CERT_FORM_INITIAL);

        setTimeout(() => setCertSuccess(null), 5000);
      } catch (error) {
        console.error('Unable to save certificate request', error);
        alert('Unable to save your request offline right now.');
      }
    },
    [certForm, db, loggedInUser]
  );

  const submitFeedback = useCallback(
    async (event) => {
      event.preventDefault();
      if (!feedbackSubject.trim() || !feedbackMessage.trim()) {
        alert('Please fill in all required fields.');
        return;
      }
      if (!db) {
        alert('Local database is unavailable.');
        return;
      }

      try {
        const refNumber = 'FB-' + Date.now().toString().slice(-5);

        const currentResId = loggedInUser?.residentId || loggedInUser?.id || loggedInUser?._id || 'RES-LOCAL';
        const currentResName = loggedInUser?.fullName || loggedInUser?.name || loggedInUser?.residentName || 'Resident';
        const currentUsername = loggedInUser?.username || loggedInUser?.email || 'resident';

        const newDocPayload = {
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
          residentId: currentResId,
          residentName: currentResName,
          username: currentUsername,
          userId: currentResId,
          sender: currentResName,
          response: '',
          handledBy: '',
          dateResolved: '',
        };

        await db.put(newDocPayload);

        alert(`Thank you! Your ${feedbackType.toLowerCase()} report (${refNumber}) has been submitted successfully.`);

        setFeedbackSubject('');
        setFeedbackMessage('');
        setFeedbackType('Complaint');
      } catch (error) {
        console.error('Unable to save feedback report offline:', error);
        alert('Unable to save your feedback offline right now.');
      }
    },
    [feedbackSubject, feedbackMessage, feedbackType, db, loggedInUser]
  );

  const submitBlotter = useCallback(
    async (event) => {
      event.preventDefault();

      const target = event.target;
      const subjectVal =
        target.subject?.value ||
        target.title?.value ||
        target.querySelector('input[type="text"]')?.value ||
        '';
      const detailsVal =
        target.details?.value ||
        target.description?.value ||
        target.querySelector('textarea')?.value ||
        '';
      const locationVal =
        target.location?.value || target.purok?.value || 'Barangay Bustrac';
      const respondentVal = target.respondent?.value || 'Under Investigation';
      const incidentDateVal =
        target.incidentDate?.value ||
        target.date?.value ||
        new Date().toISOString().split('T')[0];

      if (!subjectVal.trim() || !detailsVal.trim()) {
        alert('Please fill in all required fields.');
        return;
      }

      if (!db) {
        alert('Local database is unavailable.');
        return;
      }

      try {
        const refNumber =
          'BLTR-' + Math.floor(100000 + Math.random() * 900000);
        const currentResName =
          loggedInUser?.fullName ||
          loggedInUser?.name ||
          loggedInUser?.residentName ||
          'Resident';

        const blotterPayload = {
          _id: `blotter_${Date.now()}`,
          type: 'blotter_report',
          refNumber,
          caseNo: refNumber,
          incidentType: subjectVal.trim(),
          complainant: currentResName,
          respondent: respondentVal.trim(),
          location: locationVal.trim(),
          incidentDate: incidentDateVal,
          details: detailsVal.trim(),
          status: 'Pending',
          timestamp: new Date().toISOString(),
          residentId:
            loggedInUser?.residentId ||
            loggedInUser?.id ||
            loggedInUser?._id ||
            '',
        };

        await db.put(blotterPayload);
        alert(
          `Incident report submitted successfully! Reference No: ${refNumber}`
        );

        setBlotterSubject('');
        setBlotterDetails('');
        setBlotterIncidentDate('');
        setBlotterLocation('');
      } catch (error) {
        console.error('Error saving blotter report offline:', error);
        alert('Unable to save blotter report offline right now.');
      }
    },
    [db, loggedInUser]
  );
  
  const openAnnouncement = useCallback((ann) => {
    setSelectedAnnouncement(ann);
  }, []);

  const closeAnnouncement = useCallback(() => {
    setSelectedAnnouncement(null);
  }, []);

  useEffect(() => {
  if (!selectedAnnouncement) return;
  const handleKey = (e) => {
    if (e.key === 'Escape') closeAnnouncement();
  };
  window.addEventListener('keydown', handleKey);
  return () => window.removeEventListener('keydown', handleKey);
}, [selectedAnnouncement, closeAnnouncement]);

  const navItems = [
    { id: "s-home", label: "Home", icon: <FaHome /> },
    { id: "s-certificates", label: "Certificates", icon: <FaFileAlt /> },
    { id: "s-announcements", label: "News", icon: <FaBullhorn /> },
    { id: "s-feedback", label: "Feedback", icon: <FaCommentDots /> },
    { id: "s-blotter", label: "Blotter", icon: <FaBalanceScale /> },
    { id: "s-assistance", label: "Aid", icon: <FaHandHoldingHeart /> },
    { id: "s-profile", label: "Profile", icon: <FaUser /> }
  ];

  const pendingRequestCount = myRequests.filter((request) => {
    const statusLabel = request.status || 'Pending';
    const stepValue = Number(request.step || 1);
    return statusLabel === 'Pending' && stepValue < 4;
  }).length;

  const filteredAnnouncements = announcements.filter(
    (announcement) => announcementFilter === 'All' || announcement.category === announcementFilter
  );

  return (
    <div className="resident-root-container">
      <div id="app">
        <nav className="topnav">
          <div className="nav-brand">
            <img src={logo} alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
            <div>
              <div className="nav-title">Bustrac Hub</div>
            </div>
          </div>

          <nav className="bottom-nav">
            {navItems.map((item) => {
              const isActive = activeScreen === item.id;

              return (
                <button
                  key={item.id}
                  className={`bnav-item${isActive ? ' active' : ''}`}
                  onClick={() => goToTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="icon">{item.icon}</span>
                  {item.label}
                  {item.badge ? (
                    <span
                      className={`bnav-badge${isActive ? ' active' : ''}`}
                      style={{ background: isActive ? 'var(--primary)' : item.badgeColor }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                  <span className={`nav-selection-dot${isActive ? ' active' : ''}`} />
                </button>
              );
            })}
          </nav>
        </nav>

        <div className="content">
          {/* HOME SCREEN */}
          <div className={`screen${activeScreen === 's-home' ? ' active' : ''}`}>
            {isOffline && (
              <div className="notice notice-offline">
                <span style={{ fontSize: '16px' }}>📡</span>
                <div>
                  <strong>You're offline.</strong> You can still browse announcements and submit
                  requests. They'll sync when you reconnect.
                </div>
              </div>
            )}

            <div className="page-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="page-title">{greetingText}, {loggedInUser.fullName}!</div>
                <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <span>Barangay Bustrac</span>
                  <span>•</span>
                  <span style={{
                    color: isOffline ? 'var(--red)' : 'var(--green)',
                    fontWeight: '800',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {isOffline ? '🔴 Offline (Working Locally)' : '🟢 Connected & Synced'}
                  </span>
                </div>
              </div>
            </div>

            <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div className="stat-card" onClick={() => goToTab('s-certificates')} style={{ cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>📄</div>
                <div className="stat-val" style={{ color: 'var(--primary)' }}>{myRequests.length}</div>
                <div className="stat-lbl">Certificates</div>
              </div>

              <div className="stat-card" onClick={() => goToTab('s-certificates')} style={{ cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>⏳</div>
                <div className="stat-val" style={{ color: 'var(--amber)' }}>{pendingRequestCount}</div>
                <div className="stat-lbl">Pending Request</div>
              </div>

              <div className="stat-card" onClick={() => goToTab('s-announcements')} style={{ cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>📢</div>
                <div className="stat-val" style={{ color: 'var(--green)' }}>{announcements.length}</div>
                <div className="stat-lbl">Announcements</div>
              </div>

              <div className="stat-card" onClick={() => goToTab('s-feedback')} style={{ cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>💬</div>
                <div className="stat-val" style={{ color: 'var(--purple)' }}>{myFeedbacks.length}</div>
                <div className="stat-lbl">My Feedbacks</div>
              </div>

              <div className="stat-card" onClick={() => goToTab('s-blotter')} style={{ cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>⚖️</div>
                <div className="stat-val" style={{ color: 'var(--red)' }}>{myBlotters.length}</div>
                <div className="stat-lbl">My Blotter Reports</div>
              </div>

              <div className="stat-card" onClick={() => goToTab('s-assistance')} style={{ cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🤝</div>
                <div className="stat-val" style={{ color: 'var(--teal)' }}>{myAssistance.length}</div>
                <div className="stat-lbl">My Assistance</div>
              </div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>📌 Latest Announcements</div>
              {announcements.length ? (
                announcements.slice(0, 3).map((announcement) => (
                  <div className="list-item" key={announcement._id}>
                    <div className="list-icon" style={{ background: announcement.category === 'Health' ? '#FFFBEB' : announcement.category === 'Governance' ? '#EEF2FF' : '#F3F4F6' }}>📢</div>
                    <div className="list-body">
                      <div className="list-title">{announcement.title}</div>
                      <div className="list-sub">{announcement.category || 'General'} · Posted {announcement.author ? `by ${announcement.author}` : 'recently'}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => goToTab('s-announcements')}>View</button>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
                  <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text)' }}>No announcements yet.</div>
                  <div style={{ fontSize: '12px', marginTop: '2px' }}>Check back later for new updates.</div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Emergency Hotlines (Nabua)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px' }}>
                <div className="list-item" style={{ padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="list-body">
                    <div className="list-title">MDRRMO Nabua (Rescue)</div>
                    <div className="list-sub">Disaster & Emergency Response</div>
                  </div>
                  <a href="tel:09175060294" className="btn btn-ghost btn-sm" style={{ color: 'var(--green)', borderColor: 'var(--green)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    📞 Call
                  </a>
                </div>

                <div className="list-item" style={{ padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="list-body">
                    <div className="list-title">PNP Nabua (Police Station)</div>
                    <div className="list-sub">Law Enforcement & Safety Concerns</div>
                  </div>
                  <a href="tel:09985986014" className="btn btn-ghost btn-sm" style={{ color: 'var(--green)', borderColor: 'var(--green)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    📞 Call
                  </a>
                </div>

                <div className="list-item" style={{ padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="list-body">
                    <div className="list-title">BFP Nabua (Fire Station)</div>
                    <div className="list-sub">Fire Control & Incidents</div>
                  </div>
                  <a href="tel:0542884676" className="btn btn-ghost btn-sm" style={{ color: 'var(--green)', borderColor: 'var(--green)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    📞 Call
                  </a>
                </div>

                <div className="list-item" style={{ padding: '8px 0', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="list-body">
                    <div className="list-title">Barangay Bustrac Hall</div>
                    <div className="list-sub">Local Desk Command Center</div>
                  </div>
                  <a href="tel:09123456789" className="btn btn-ghost btn-sm" style={{ color: 'var(--green)', borderColor: 'var(--green)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    📞 Call
                  </a>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>🚀 Barangay Services</div>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <button className="btn btn-outline" onClick={() => goToTab('s-certificates')} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 12px', height: 'auto', borderRadius: '12px' }}>
                <span style={{ fontSize: '24px' }}>📄</span>
                <span style={{ fontSize: '13px', fontWeight: '800' }}>Certificates</span>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Request / Track</span>
              </button>

                <button className="btn btn-outline" onClick={() => goToTab('s-feedback')} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 12px', height: 'auto', borderRadius: '12px' }}>
                  <span style={{ fontSize: '24px' }}>💬</span>
                  <span style={{ fontSize: '13px', fontWeight: '800' }}>Submit Feedback</span>
                </button>

                <button className="btn btn-outline" onClick={() => goToTab('s-announcements')} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 12px', height: 'auto', borderRadius: '12px' }}>
                  <span style={{ fontSize: '24px' }}>📢</span>
                  <span style={{ fontSize: '13px', fontWeight: '800' }}>View News</span>
                </button>
              </div>
            </div>
          </div>

          {/* CERTIFICATES */}
          <div className={`screen${activeScreen === 's-certificates' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">My Certificates</div>
              <div className="page-sub">Request and track your barangay certificates</div>
            </div>

            {!showCertForm && (
              <button
                className="btn btn-primary btn-full"
                style={{ marginBottom: '18px' }}
                onClick={() => setShowCertForm(true)}
              >
                <span>＋</span> Request a Certificate
              </button>
            )}

            {showCertForm && (
              <div>
                <div className="card" style={{ borderColor: 'var(--primary-light)' }}>
                  <div className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    New Certificate Request
                  </div>

                  <form onSubmit={(e) => {
                    submitCert(e);
                    setShowCertForm(false);
                  }}>
                    <div style={{ marginBottom: '20px', padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Applicant Profile (Auto-Verified)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', fontSize: '13px' }}>
                        <div><span style={{ color: 'var(--muted)' }}>Name:</span> <strong style={{ color: 'var(--text)' }}>{loggedInUser?.fullName || 'Not Available'}</strong></div>
                        <div><span style={{ color: 'var(--muted)' }}>Purok:</span> <strong style={{ color: 'var(--text)' }}>{loggedInUser?.purok || 'Not on record'}</strong></div>
                        <div><span style={{ color: 'var(--muted)' }}>Age:</span> <strong style={{ color: 'var(--text)' }}>{loggedInUser?.age ? `${loggedInUser.age} years old` : 'Not Available'}</strong></div>
                        <div><span style={{ color: 'var(--muted)' }}>Birthdate:</span> <strong style={{ color: 'var(--text)' }}>{loggedInUser?.birthdate || 'Not Available'}</strong></div>
                        <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--muted)' }}>Contact:</span> <strong style={{ color: 'var(--text)' }}>{loggedInUser?.contact || 'Not on record'}</strong></div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--green)', marginTop: '10px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>✓</span> Information synced from your resident profile account.
                      </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--text)' }}>
                        Request Specifications
                      </div>

                      <div className="fg">
                        <label className="fl">Certificate Type</label>
                        <select
                          className="fc"
                          value={certForm.certType}
                          onChange={updateCertField('certType')}
                          required
                        >
                          <option value="">-- Select Certificate Type --</option>
                          <option value="Barangay Clearance">📄 Barangay Clearance</option>
                          <option value="Certificate of Indigency">🤝 Certificate of Indigency</option>
                          <option value="Certificate of Residency">🏠 Certificate of Residency</option>
                        </select>
                      </div>

                      <div className="fg">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label className="fl" style={{ margin: 0 }}>Purpose of Certificate</label>
                          <span style={{ fontSize: '11px', color: (certForm.certPurpose?.length || 0) > 200 ? 'var(--red)' : 'var(--muted)' }}>
                            {certForm.certPurpose?.length || 0} / 200 chars
                          </span>
                        </div>
                        <textarea
                          className="fc"
                          rows="3"
                          maxLength="200"
                          placeholder="e.g. For employment requirements at DOLE-Camarines Sur..."
                          value={certForm.certPurpose}
                          onChange={updateCertField('certPurpose')}
                          required
                        />
                      </div>
                    </div>

                    <div style={{
                      marginBottom: '18px',
                      padding: '12px 14px',
                      background: 'var(--surface2)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(79, 142, 247, 0.2)',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start'
                    }}>
                      <span style={{ color: 'var(--primary)', fontSize: '14px' }}>ℹ️</span>
                      <div style={{ fontSize: '12.5px', color: 'var(--muted)', lineHeight: '1.5' }}>
                        Your request will be routed directly to the Barangay Captain's desk for evaluation.
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Certificate Request</button>
                      <button type="button" className="btn btn-ghost" onClick={() => setShowCertForm(false)}>
                        ← Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {certSuccess && (
              <div className="notice notice-success" style={{ padding: '16px', borderRadius: 'var(--radius-sm)', marginBottom: '20px' }}>
                <div style={{ fontSize: '18px' }}>✅</div>
                <div>
                  <strong style={{ display: 'block', marginBottom: '2px', fontSize: '14px' }}>Request Filed Successfully!</strong>
                  <div style={{ fontSize: '12px', opacity: 0.9 }}>
                    Tracking Reference: <code style={{ background: 'var(--surface)', color: 'var(--green)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid var(--border)' }}>{certSuccess.refNumber}</code>
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                    The document state has been appended to your tracking index below.
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>My Requests</span>
              <span className="badge b-blue" style={{ fontSize: '10px' }}>
                {myRequests.length} Total
              </span>
            </div>

            {myRequests.length ? (
              myRequests.map((request) => {
                const stepCount = Number(request.step || 1);
                const statusLabel = request.status || 'Pending';
                const isIssued = statusLabel === 'Issued' || stepCount >= 4;
                const badgeClass = isIssued ? 'badge b-green' : 'badge b-amber';
                const refNumber = request.refNumber || `CERT-${(request._id || '').slice(-6).toUpperCase()}`;

                let certIcon = '📄';
                if (request.certType?.includes('Indigency')) certIcon = '🤝';
                if (request.certType?.includes('Residency')) certIcon = '🏠';

                const submittedDate = request.timestamp
                  ? new Date(request.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Recently added';

                return (
                  <div className="card" key={request._id} style={{ padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: '800' }}>
                          <span>{certIcon}</span> {request.certType}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px', fontStyle: request.certPurpose ? 'normal' : 'italic' }}>
                          {request.certPurpose || 'No purpose specification declaration'}
                        </div>
                      </div>
                      <span className={badgeClass} style={{ textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.3px' }}>
                        {isIssued ? '✓ Issued' : '⏳ Pending'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: 'var(--surface2)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', border: '1px solid var(--border)', fontSize: '12px' }}>
                      <div><span style={{ color: 'var(--muted)' }}>Reference:</span> <code style={{ color: 'var(--text)', fontWeight: '700', marginLeft: '4px' }}>{refNumber}</code></div>
                      <div style={{ textAlign: 'right' }}><span style={{ color: 'var(--muted)' }}>Filed:</span> <strong style={{ color: 'var(--text)', marginLeft: '4px' }}>{submittedDate}</strong></div>
                    </div>

                    <div className="steps" style={{ marginBottom: '6px' }}>
                      {['Submitted', 'Review', 'Approved', 'Issued'].map((label, index) => {
                        const value = index + 1;
                        const isDone = stepCount > value;
                        const isActive = stepCount === value;

                        return (
                          <div key={label} className={`step${isDone ? ' done' : isActive ? ' active' : ' pending'}`}>
                            <div className="step-circle">
                              {isDone ? '✓' : value}
                            </div>
                            <div className="step-label">
                              {label}
                            </div>
                            {index < 3 && <div className="step-line" />}
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isIssued ? 'var(--green)' : 'var(--amber)' }} />
                        Status Log
                      </span>
                      <span style={{ fontWeight: '600', color: isIssued ? 'var(--green)' : 'var(--muted)' }}>
                        {isIssued ? ' Document ready for collection' : '⏳ Awaiting Administrative E-Signature'}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '36px 20px', border: '2px dashed var(--border)', background: 'transparent' }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>📭</div>
                <div style={{ fontWeight: '800', fontSize: '15px', color: 'var(--text)' }}>No certificate requests yet.</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', marginBottom: '16px' }}>
                  Your local logs are clear. You can request clearances and tracking histories anytime.
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setShowCertForm(true)} style={{ margin: '0 auto' }}>
                  Submit First Request
                </button>
              </div>
            )}
          </div>

          {/* ANNOUNCEMENTS */}
          <div className={`screen${activeScreen === 's-announcements' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">Announcements</div>
              <div className="page-sub">Official notices from Barangay Bustrac</div>
              {selectedAnnouncement && (
              <div
                onClick={closeAnnouncement}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.75)',
                  zIndex: 300,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                }}
              >
                <div
                  className="card"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  style={{
                    maxWidth: '600px',
                    width: '100%',
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    margin: 0,
                    borderLeft: '4px solid',
                    borderLeftColor:
                      selectedAnnouncement.category === 'Health'
                        ? 'var(--amber)'
                        : selectedAnnouncement.category === 'Governance'
                        ? 'var(--primary)'
                        : selectedAnnouncement.category === 'Security'
                        ? 'var(--red)'
                        : 'var(--purple)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div
                      className="ann-cat"
                      style={{
                        color:
                          selectedAnnouncement.category === 'Health'
                            ? 'var(--amber)'
                            : selectedAnnouncement.category === 'Governance'
                            ? 'var(--primary)'
                            : selectedAnnouncement.category === 'Security'
                            ? 'var(--red)'
                            : 'var(--purple)',
                      }}
                    >
                      {selectedAnnouncement.pinned ? '📌 Pinned · ' : ''}
                      {selectedAnnouncement.category || 'General'}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={closeAnnouncement}>
                      ✕ Close
                    </button>
                  </div>

                  <div className="ann-title" style={{ fontSize: '20px', marginBottom: '14px', lineHeight: 1.3 }}>
                    {selectedAnnouncement.title}
                  </div>

                  <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.7, marginBottom: '20px', whiteSpace: 'pre-line' }}>
                    {selectedAnnouncement.body}
                  </div>

                  <div
                    style={{
                      background: 'var(--surface2)',
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      display: 'grid',
                      gap: '10px',
                    }}
                  >
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      📅 <strong style={{ color: 'var(--text)' }}>Event Date:</strong>{' '}
                      {selectedAnnouncement.eventDate || selectedAnnouncement.date || 'To be announced'}
                    </div>
                    {selectedAnnouncement.location && (
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        📍 <strong style={{ color: 'var(--text)' }}>Location:</strong> {selectedAnnouncement.location}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      🏛️ <strong style={{ color: 'var(--text)' }}>Posted by:</strong>{' '}
                      {selectedAnnouncement.author || 'Barangay Office'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      🕒 <strong style={{ color: 'var(--text)' }}>Posted on:</strong>{' '}
                      {selectedAnnouncement.timestamp
                        ? new Date(selectedAnnouncement.timestamp).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : selectedAnnouncement.date || 'Recently posted'}
                    </div>
                  </div>
                </div>
              </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {['All', 'Health', 'Governance', 'Events', 'Security'].map((label) => (
                <button
                  key={label}
                  className={`type-btn${announcementFilter === label ? ' active' : ''}`}
                  onClick={() => setAnnouncementFilter(label)}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredAnnouncements.length ? (
              filteredAnnouncements.map((announcement) => (
                <div key={announcement._id} className={`ann-card${announcement.pinned ? ' pinned' : ''}`}>
                  <div
                    className="ann-cat"
                    style={{
                      color: announcement.category === 'Health'
                        ? 'var(--amber)'
                        : announcement.category === 'Governance'
                          ? 'var(--primary)'
                          : announcement.category === 'Security'
                            ? 'var(--red)'
                            : 'var(--purple)',
                    }}
                  >
                    {announcement.pinned ? '📌 Pinned · ' : ''}
                    {announcement.category || 'General'}
                  </div>
                  <div className="ann-title">{announcement.title}</div>
                  <div className="ann-body">{announcement.body}</div>
                  <div className="ann-footer">
                    📅 Posted by {announcement.author || 'Barangay Office'} · {announcement.date || 'Recently posted'}
                  </div>
                  {/* VIEW DETAILS BUTTON */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => openAnnouncement(announcement)}>
                    View Details →
                  </button>
                </div>
                </div>
              ))
            ) : (
              <div className="notice notice-info">No announcements match the selected filter.</div>
            )}
          </div>

          {/* FEEDBACK */}
          <div className={`screen${activeScreen === 's-feedback' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">Feedback & Concerns</div>
              <div className="page-sub">Submit your concerns to the barangay office</div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>Submit a Concern</div>
              <form onSubmit={submitFeedback}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Type
                </div>
                <div className="type-select">
                  {[
                    { type: 'Complaint', label: '💬 Complaint' },
                    { type: 'Suggestion', label: '💡 Suggestion' },
                    { type: 'Inquiry', label: '❓ Inquiry' },
                  ].map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      className={`type-btn${feedbackType === option.type ? ' active' : ''}`}
                      onClick={() => setFeedbackType(option.type)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="fg">
                  <label className="fl">Subject</label>
                  <input
                    className="fc"
                    placeholder="Brief description of your concern"
                    value={feedbackSubject}
                    onChange={(event) => setFeedbackSubject(event.target.value)}
                    required
                  />
                </div>
                <div className="fg">
                  <label className="fl">Message</label>
                  <textarea
                    className="fc"
                    rows="4"
                    placeholder="Describe your concern in detail..."
                    value={feedbackMessage}
                    onChange={(event) => setFeedbackMessage(event.target.value)}
                    required
                  />
                </div>
                <div className="notice notice-info" style={{ marginBottom: '14px' }}>
                  <span></span>
                  <div style={{ fontSize: '12px' }}>
                    Your concern is linked to your account and will be responded to by barangay staff within
                    3 working days.
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-full">Submit Concern</button>
              </form>
            </div>

            {/* MY SUBMISSIONS SECTION */}
            <div className="card" style={{ marginTop: '16px' }}>
              <div className="card-title" style={{ marginBottom: '14px' }}>
                📂 My Submissions ({myFeedbacks.length})
              </div>

              {myFeedbacks.length === 0 ? (
                <div className="notice notice-info">
                  <span>You have not submitted any feedback or concerns yet.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {myFeedbacks.map((item) => {
                    const isExpanded = expandedFeedbackId === (item._id || item.refNumber);
                    const fbStep = getFeedbackStep(item.status);
                    const feedbackSteps = ['Submitted', 'Under Review', 'Responded', 'Resolved / Closed'];

                    return (
                      <div
                        key={item._id || item.refNumber}
                        style={{
                          background: 'var(--surface2)',
                          padding: '14px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {/* HEADER — always visible */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: '#60a5fa', fontWeight: 'bold' }}>
                            {item.refNumber}
                          </span>
                          <span
                            className="badge"
                            style={{
                              background:
                                item.status === 'Resolved' || item.status === 'Resolved & Closed'
                                  ? '#065f46'
                                  : item.status === 'Under Review'
                                  ? '#1e3a8a'
                                  : item.status === 'Responded'
                                  ? '#78350f'
                                  : '#7f1d1d',
                              color:
                                item.status === 'Resolved' || item.status === 'Resolved & Closed'
                                  ? '#34d399'
                                  : item.status === 'Under Review'
                                  ? '#93c5fd'
                                  : item.status === 'Responded'
                                  ? '#fde047'
                                  : '#fca5a5',
                              fontSize: '11px',
                            }}
                          >
                            {item.status || 'Pending'}
                          </span>
                        </div>

                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#f8fafc', marginBottom: '4px' }}>
                          {item.feedbackType === 'Complaint' ? '💬' : item.feedbackType === 'Suggestion' ? '💡' : '❓'} {item.subject}
                        </div>

                        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
                          Submitted on{' '}
                          {item.timestamp && !isNaN(Date.parse(item.timestamp))
                            ? new Date(item.timestamp).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : item.timestamp || 'Recently'}
                        </div>

                        {/* Expand / Collapse Button */}
                        <button
                          type="button"
                          onClick={() => toggleFeedback(item._id || item.refNumber)}
                          className="btn btn-ghost btn-sm"
                          style={{ marginBottom: isExpanded ? '12px' : '0', fontSize: '12px', padding: '4px 10px' }}
                        >
                          {isExpanded ? '▲ Hide Details' : '▼ View Details'}
                        </button>

                        {/* EXPANDED CONTENT */}
                        {isExpanded && (
                          <>
                            {/* Stepper */}
                            <div className="steps" style={{ margin: '12px 0 16px' }}>
                              {feedbackSteps.map((label, index) => {
                                const value = index + 1;
                                const isDone = fbStep > value;
                                const isActive = fbStep === value;
                                return (
                                  <div key={label} className={`step${isDone ? ' done' : isActive ? ' active' : ' pending'}`}>
                                    <div className="step-circle">{isDone ? '✓' : value}</div>
                                    <div className="step-label">{label}</div>
                                    {index < 3 && <div className="step-line" />}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Full Message */}
                            <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '12px', lineHeight: '1.4' }}>
                              "{item.details}"
                            </div>

                            {/* Official Response */}
                            {item.response && (
                              <div style={{ marginTop: '10px', padding: '10px 12px', background: '#0f172a', borderLeft: '3px solid #10b981', borderRadius: '4px' }}>
                                <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold', marginBottom: '2px' }}>
                                  🏛️ Official Barangay Response ({item.handledBy || 'Barangay Staff'}):
                                </div>
                                <div style={{ fontSize: '12px', color: '#f1f5f9', fontStyle: 'italic' }}>
                                  "{item.response}"
                                </div>
                                {item.dateResolved && (
                                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                                    Resolved: {item.dateResolved}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* BLOTTER SCREEN */}
          <div className={`screen${activeScreen === 's-blotter' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">File / View Blotter Reports</div>
              <div className="page-sub">Submit incident reports or track status of filed complaints</div>
            </div>

            {/* Form Card for Submitting New Incident Report */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>📝 New Incident Complaint</div>
              <form onSubmit={submitBlotter}>
                <div className="fg">
                  <label className="fl">Incident Subject / Title *</label>
                  <input
                    type="text"
                    className="fc"
                    placeholder="e.g., Property Dispute, Noise Disturbance, Physical Altercation"
                    required
                    value={blotterSubject}
                    onChange={(e) => setBlotterSubject(e.target.value)}
                  />
                </div>

                <div className="fg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="fl">Incident Date</label>
                    <input
                      type="date"
                      className="fc"
                      value={blotterIncidentDate}
                      onChange={(e) => setBlotterIncidentDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="fl">Location / Purok</label>
                    <input
                      type="text"
                      className="fc"
                      placeholder="e.g., Near Purok 3 Basketball Court"
                      value={blotterLocation}
                      onChange={(e) => setBlotterLocation(e.target.value)}
                    />
                  </div>
                </div>

                <div className="fg">
                  <label className="fl">Incident Details / Description *</label>
                  <textarea
                    className="fc"
                    rows="4"
                    placeholder="Provide clear details about what happened, persons involved, etc."
                    required
                    value={blotterDetails}
                    onChange={(e) => setBlotterDetails(e.target.value)}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-full">
                  Submit Blotter Report
                </button>
              </form>
            </div>

            {/* List Card for Resident's Submitted Blotters */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: '12px' }}>
                📂 My Filed Blotter Reports ({myBlotters.length})
              </div>

              {myBlotters.length === 0 ? (
                <div className="notice notice-info">
                  <span>No blotter reports filed yet. Submitted complaints will appear here for administrative tracking.</span>
                </div>
              ) : (
                <div>
                  {myBlotters.map((item) => {
                    const blotterStep = getBlotterStep(item.status);
                    const blotterSteps = ['Filed', 'Under Investigation', 'For Mediation', 'Resolved / Closed'];

                    return (
                      <div className="list-item" key={item._id || item.refNumber} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px', padding: '16px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div className="list-icon" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>⚖️</div>
                          <div className="list-body" style={{ flex: 1 }}>
                            <div className="list-title">{item.incidentType || item.subject || 'Incident Report'}</div>
                            <div className="list-sub">
                              Ref: <strong style={{ color: 'var(--primary)' }}>{item.refNumber}</strong> • Case No: {item.caseNo || item.refNumber}
                            </div>
                            {item.location && <div className="list-sub" style={{ color: 'var(--muted)' }}>📍 {item.location}</div>}
                            <div className="list-sub" style={{ marginTop: '4px', color: 'var(--text)' }}>{item.details}</div>
                          </div>
                          <div className="list-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <span className={`badge ${
                              item.status === 'Resolved' || item.status === 'Closed' ? 'b-green' :
                              item.status === 'Under Mediation' || item.status === 'For Mediation' ? 'b-purple' :
                              item.status === 'Under Investigation' ? 'b-blue' : 'b-amber'
                            }`}>
                              {item.status || 'Pending'}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                              {item._rev?.startsWith('1-') ? 'Local' : 'Synced'}
                            </span>
                          </div>
                        </div>

                        {/* Blotter Stepper */}
                        <div className="steps" style={{ margin: '0', padding: '0 0 0 54px' }}>
                          {blotterSteps.map((label, index) => {
                            const value = index + 1;
                            const isDone = blotterStep > value;
                            const isActive = blotterStep === value;
                            return (
                              <div key={label} className={`step${isDone ? ' done' : isActive ? ' active' : ' pending'}`}>
                                <div className="step-circle">{isDone ? '✓' : value}</div>
                                <div className="step-label">{label}</div>
                                {index < 3 && <div className="step-line" />}
                              </div>
                            );
                          })}
                        </div>

                        {/* Extra metadata */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', fontSize: '11px', color: 'var(--muted)', paddingLeft: '54px' }}>
                          <div>Incident Date: <strong style={{ color: 'var(--text)' }}>{item.incidentDate || 'N/A'}</strong></div>
                          <div>Filed: <strong style={{ color: 'var(--text)' }}>{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'N/A'}</strong></div>
                          <div>Latest: <strong style={{ color: 'var(--text)' }}>{item.latestUpdate || item.status || 'Pending'}</strong></div>
                        </div>

                        {item.mediationDate && (
                          <div style={{ fontSize: '11px', color: 'var(--purple)', paddingLeft: '54px' }}>
                            📅 Mediation Scheduled: {item.mediationDate}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ASSISTANCE SCREEN */}
          <div className={`screen${activeScreen === 's-assistance' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">My Assistance</div>
              <div className="page-sub">Track your aid, relief, and beneficiary records</div>
            </div>

            <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div className="stat-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🤝</div>
                <div className="stat-val" style={{ color: 'var(--teal)' }}>{myAssistance.length}</div>
                <div className="stat-lbl">Total Received</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>⏳</div>
                <div className="stat-val" style={{ color: 'var(--amber)' }}>
                  {myAssistance.filter(a => ['pending', 'scheduled'].includes((a.status || '').toLowerCase())).length}
                </div>
                <div className="stat-lbl">Pending / Scheduled</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>✅</div>
                <div className="stat-val" style={{ color: 'var(--green)' }}>
                  {myAssistance.filter(a => ['released', 'completed'].includes((a.status || '').toLowerCase())).length}
                </div>
                <div className="stat-lbl">Completed</div>
              </div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>📂 Assistance History</div>
              {myAssistance.length === 0 ? (
                <div className="notice notice-info">
                  <span>No assistance records found. Records will appear here once the barangay admin encodes your aid distribution.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {myAssistance.map((item) => (
                    <div key={item._id || item.refNumber} style={{ background: 'var(--surface2)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 'bold' }}>
                          {item.refNumber || item._id}
                        </span>
                        <span
                          className="badge"
                          style={{
                            background: ['released', 'completed'].includes((item.status || '').toLowerCase()) ? 'var(--green-bg)' : 'var(--amber-bg)',
                            color: ['released', 'completed'].includes((item.status || '').toLowerCase()) ? 'var(--green)' : 'var(--amber)',
                            fontSize: '11px'
                          }}
                        >
                          {item.status || 'Pending'}
                        </span>
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text)', marginBottom: '4px' }}>
                        {item.programName || item.program || item.aidType || 'Assistance Program'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', lineHeight: '1.4' }}>
                        {item.description || item.details || item.notes || 'No additional details.'}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                        <div>Date: <strong style={{ color: 'var(--text)' }}>{item.dateDistributed || item.date || item.timestamp ? new Date(item.dateDistributed || item.date || item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</strong></div>
                        <div>Amount/Item: <strong style={{ color: 'var(--text)' }}>{item.amount || item.item || item.quantity || 'N/A'}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PROFILE SCREEN */}
          <div className={`screen${activeScreen === 's-profile' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">My Profile</div>
              <div className="page-sub">Your resident information on file</div>
            </div>

            {/* Header Profile Card */}
            <div className="card" style={{ textAlign: 'center', padding: '28px' }}>
              <div
                style={{
                  width: '70px',
                  height: '70px',
                  background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
                  borderRadius: '50%',
                  margin: '0 auto 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  fontWeight: 900,
                  color: 'white',
                }}
              >
                {loggedInUser.initials || 'RES'}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 900 }}>{loggedInUser.fullName}</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                Resident ID: {loggedInUser.residentId || 'Not Available'}
              </div>
              <span className="badge b-green" style={{ marginTop: '8px' }}>
                ✓ {loggedInUser.voterStatus || 'Registered Voter'}
              </span>
            </div>

            {/* Personal Information Details */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>Personal Information</div>

              <div className="list-item">
                <div className="list-body">
                  <div className="list-sub">Birthdate</div>
                  <div className="list-title">
                    {loggedInUser.birthdate
                      ? new Date(loggedInUser.birthdate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                      : 'Not Available'}
                  </div>
                </div>
              </div>

              <div className="list-item">
                <div className="list-body">
                  <div className="list-sub">Age</div>
                  <div className="list-title">
                    {loggedInUser.age ? `${loggedInUser.age} years old` : 'Not Available'}
                  </div>
                </div>
              </div>

              <div className="list-item">
                <div className="list-body">
                  <div className="list-sub">Gender</div>
                  <div className="list-title">{loggedInUser.gender || 'Not Available'}</div>
                </div>
              </div>

              <div className="list-item">
                <div className="list-body">
                  <div className="list-sub">Civil Status</div>
                  <div className="list-title">{loggedInUser.civilStatus || 'Not Available'}</div>
                </div>
              </div>

              <div className="list-item">
                <div className="list-body">
                  <div className="list-sub">Contact Number</div>
                  <div className="list-title">{loggedInUser.contact || 'Not Available'}</div>
                </div>
              </div>

              <div className="list-item">
                <div className="list-body">
                  <div className="list-sub">Purok</div>
                  <div className="list-title">
                    {loggedInUser.purok
                      ? `${loggedInUser.purok.toString().toLowerCase().startsWith('purok') ? loggedInUser.purok : `Purok ${loggedInUser.purok}`}, Barangay Bustrac`
                      : 'Not Available'}
                  </div>
                </div>
              </div>

              <div className="list-item" style={{ border: 'none' }}>
                <div className="list-body">
                  <div className="list-sub">Household</div>
                  <div className="list-title">{loggedInUser.household || 'Not Available'}</div>
                </div>
              </div>
            </div>

            {/* Sync Status Banner */}
            <div className="sync-status">
              <div className={`sync-dot ${isOffline ? 'offline' : ''}`} />
              CouchDB sync — {isOffline ? 'Offline' : 'Up to date'} · Last sync:{' '}
              {lastSync
                ? lastSync.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Never'}
            </div>

            {/* Clean Sign Out Button */}
            <button
              className="btn btn-ghost btn-full"
              onClick={handleLogout}
              style={{ color: 'var(--red)', borderColor: '#FECACA', marginTop: '12px' }}
            >
              🚪 Sign Out
            </button>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="resident-footer">
          <div className="footer-inner">
            <span className="footer-brand">Bustrac Hub</span>
            <span className="footer-copy">
              © {new Date().getFullYear()} Barangay Bustrac. All rights reserved.
            </span>
            <span className="footer-version">Resident Portal v1.0</span>
          </div>
        </footer>
      </div>

      {/* LIVE INDICATOR */}
      <div
        className="live-indicator"
        style={{
          borderColor: isOffline ? 'var(--red)' : 'var(--green)',
          boxShadow: isOffline ? '0 2px 12px rgba(248, 113, 113, 0.2)' : '0 2px 12px rgba(5, 150, 105, 0.2)'
        }}
      >
        <div
          className="live-dot"
          style={{
            background: isOffline ? 'var(--red)' : 'var(--green)',
            animation: isOffline ? 'none' : 'resident-pulse 2s infinite'
          }}
        />
        <div
          className="live-text"
          style={{ color: isOffline ? 'var(--red)' : 'var(--green)' }}
        >
          {isOffline ? 'OFFLINE' : 'LIVE'}
        </div>
      </div>
    </div>
  );
}
