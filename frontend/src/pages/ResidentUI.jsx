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
          {/* =============================================
              📡 OFFLINE NOTICE (SVG + Glass-Morphism)
              ============================================= */}
          {isOffline && (
            <div className="notice notice-offline" style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderLeft: '4px solid #ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '8px',
              animation: 'dp-fadeIn 0.3s ease'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#ef4444' }}>
                <path d="M5 12h14" />
                <path d="M12 5v14" />
                <path d="M5 12C5 12 8 9 12 9s7 3 7 3" />
                <path d="M12 15v7" />
              </svg>
              <div>
                <strong>You're offline.</strong> You can still browse announcements and submit
                requests. They'll sync when you reconnect.
              </div>
            </div>
          )}

          {/* =============================================
              📌 PAGE HEADER (SVG + Modern)
              ============================================= */}
          <div className="page-hdr" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '20px'
          }}>
            <div>
              <div className="page-title">{greetingText}, {loggedInUser.fullName}!</div>
              <div className="page-sub" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '2px'
              }}>
                <span>Barangay Bustrac</span>
                <span>•</span>
                <span style={{
                  color: isOffline ? 'var(--red)' : 'var(--green)',
                  fontWeight: '800',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {isOffline ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      Offline (Working Locally)
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <path d="M22 4L12 14.01l-3-3" />
                      </svg>
                      Connected & Synced
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* =============================================
              📊 STAT ROW (SVG Icons + Glass-Morphism + Hover Effects)
              ============================================= */}
          <div className="stat-row" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '12px',
            marginBottom: '20px'
          }}>
            {/* CERTIFICATES */}
            <div
              className="stat-card"
              onClick={() => goToTab('s-certificates')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: '1px solid rgba(79, 142, 247, 0.2)',
                background: 'rgba(26, 29, 36, 0.4)',
                backdropFilter: 'blur(8px)',
                borderRadius: '10px',
                padding: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(79, 142, 247, 0.5)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(79, 142, 247, 0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(79, 142, 247, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ marginBottom: '4px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--primary)' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M12 18v-6" />
                  <path d="M9 15h6" />
                </svg>
              </div>
              <div className="stat-val" style={{ color: 'var(--primary)' }}>{myRequests.length}</div>
              <div className="stat-lbl">Certificates</div>
            </div>

            {/* PENDING REQUEST */}
            <div
              className="stat-card"
              onClick={() => goToTab('s-certificates')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: '1px solid rgba(251, 191, 36, 0.2)',
                background: 'rgba(26, 29, 36, 0.4)',
                backdropFilter: 'blur(8px)',
                borderRadius: '10px',
                padding: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.5)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(251, 191, 36, 0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ marginBottom: '4px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--amber)' }}>
                  <path d="M12 2v4" />
                  <path d="M12 18v4" />
                  <path d="M4.93 4.93l2.83 2.83" />
                  <path d="M16.24 16.24l2.83 2.83" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="M4.93 19.07l2.83-2.83" />
                  <path d="M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div className="stat-val" style={{ color: 'var(--amber)' }}>{pendingRequestCount}</div>
              <div className="stat-lbl">Pending Request</div>
            </div>

            {/* ANNOUNCEMENTS */}
            <div
              className="stat-card"
              onClick={() => goToTab('s-announcements')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                background: 'rgba(26, 29, 36, 0.4)',
                backdropFilter: 'blur(8px)',
                borderRadius: '10px',
                padding: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ marginBottom: '4px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--green)' }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div className="stat-val" style={{ color: 'var(--green)' }}>{announcements.length}</div>
              <div className="stat-lbl">Announcements</div>
            </div>

            {/* MY FEEDBACKS */}
            <div
              className="stat-card"
              onClick={() => goToTab('s-feedback')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: '1px solid rgba(167, 139, 250, 0.2)',
                background: 'rgba(26, 29, 36, 0.4)',
                backdropFilter: 'blur(8px)',
                borderRadius: '10px',
                padding: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.5)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(167, 139, 250, 0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ marginBottom: '4px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--purple)' }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="stat-val" style={{ color: 'var(--purple)' }}>{myFeedbacks.length}</div>
              <div className="stat-lbl">My Feedbacks</div>
            </div>

            {/* MY BLOTTER REPORTS */}
            <div
              className="stat-card"
              onClick={() => goToTab('s-blotter')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: '1px solid rgba(248, 113, 113, 0.2)',
                background: 'rgba(26, 29, 36, 0.4)',
                backdropFilter: 'blur(8px)',
                borderRadius: '10px',
                padding: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.5)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(248, 113, 113, 0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ marginBottom: '4px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--red)' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div className="stat-val" style={{ color: 'var(--red)' }}>{myBlotters.length}</div>
              <div className="stat-lbl">My Blotter Reports</div>
            </div>

            {/* MY ASSISTANCE */}
            <div
              className="stat-card"
              onClick={() => goToTab('s-assistance')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                background: 'rgba(26, 29, 36, 0.4)',
                backdropFilter: 'blur(8px)',
                borderRadius: '10px',
                padding: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ marginBottom: '4px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--teal)' }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="stat-val" style={{ color: 'var(--teal)' }}>{myAssistance.length}</div>
              <div className="stat-lbl">My Assistance</div>
            </div>
          </div>

          {/* =============================================
              📢 LATEST ANNOUNCEMENTS (SVG + Glass-Morphism)
              ============================================= */}
          <div className="card" style={{
            background: 'rgba(26, 29, 36, 0.4)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(79, 142, 247, 0.2)',
            borderRadius: '10px',
            marginBottom: '16px',
            overflow: 'hidden'
          }}>
            <div className="card-title" style={{
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '700',
              color: 'var(--text)'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Latest Announcements
            </div>
            {announcements.length ? (
              announcements.slice(0, 3).map((announcement) => (
                <div
                  key={announcement._id}
                  className="list-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(79, 142, 247, 0.1)',
                    transition: 'background 0.2s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(79, 142, 247, 0.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="list-icon" style={{
                    background: announcement.category === 'Health' ? 'rgba(251, 191, 36, 0.15)' :
                              announcement.category === 'Governance' ? 'rgba(59, 130, 246, 0.15)' :
                              'rgba(107, 114, 128, 0.15)',
                    borderRadius: '8px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{
                      color: announcement.category === 'Health' ? '#f59e0b' :
                            announcement.category === 'Governance' ? '#3b82f6' : '#64748b'
                    }}>
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  <div className="list-body" style={{ flex: 1 }}>
                    <div className="list-title">{announcement.title}</div>
                    <div className="list-sub" style={{ color: 'var(--muted)', fontSize: '12px' }}>
                      {announcement.category || 'General'} · Posted {announcement.author ? `by ${announcement.author}` : 'recently'}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => goToTab('s-announcements')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--accent)',
                      borderColor: 'rgba(79, 142, 247, 0.3)'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14" />
                      <path d="M12 5l7 7-7 7" />
                    </svg>
                    View
                  </button>
                </div>
              ))
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '24px 10px',
                color: 'var(--muted)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.7 }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text)' }}>No announcements yet.</div>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>Check back later for new updates.</div>
              </div>
            )}
          </div>

          {/* =============================================
              🆘 EMERGENCY HOTLINES (SVG + Glass-Morphism)
              ============================================= */}
          <div className="card" style={{
            background: 'rgba(26, 29, 36, 0.4)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(79, 142, 247, 0.2)',
            borderRadius: '10px',
            marginBottom: '16px',
            overflow: 'hidden'
          }}>
            <div className="card-title" style={{
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '700',
              color: 'var(--text)'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              Emergency Hotlines (Nabua)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px' }}>
              {/* MDRRMO Nabua */}
              <div className="list-item" style={{
                padding: '8px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(79, 142, 247, 0.1)'
              }}>
                <div className="list-body">
                  <div className="list-title">MDRRMO Nabua (Rescue)</div>
                  <div className="list-sub" style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    Disaster & Emergency Response
                  </div>
                </div>
                <a
                  href="tel:09175060294"
                  className="btn btn-ghost btn-sm"
                  style={{
                    color: 'var(--green)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>
                  </svg>
                  Call
                </a>
              </div>

              {/* PNP Nabua */}
              <div className="list-item" style={{
                padding: '8px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(79, 142, 247, 0.1)'
              }}>
                <div className="list-body">
                  <div className="list-title">PNP Nabua (Police Station)</div>
                  <div className="list-sub" style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    Law Enforcement & Safety Concerns
                  </div>
                </div>
                <a
                  href="tel:09985986014"
                  className="btn btn-ghost btn-sm"
                  style={{
                    color: 'var(--green)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>
                  </svg>
                  Call
                </a>
              </div>

              {/* BFP Nabua */}
              <div className="list-item" style={{
                padding: '8px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(79, 142, 247, 0.1)'
              }}>
                <div className="list-body">
                  <div className="list-title">BFP Nabua (Fire Station)</div>
                  <div className="list-sub" style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    Fire Control & Incidents
                  </div>
                </div>
                <a
                  href="tel:0542884676"
                  className="btn btn-ghost btn-sm"
                  style={{
                    color: 'var(--green)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>
                  </svg>
                  Call
                </a>
              </div>

              {/* Barangay Bustrac Hall */}
              <div className="list-item" style={{
                padding: '8px 0',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div className="list-body">
                  <div className="list-title">Barangay Bustrac Hall</div>
                  <div className="list-sub" style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    Local Desk Command Center
                  </div>
                </div>
                <a
                  href="tel:09123456789"
                  className="btn btn-ghost btn-sm"
                  style={{
                    color: 'var(--green)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>
                  </svg>
                  Call
                </a>
              </div>
            </div>
          </div>

          {/* =============================================
              🚀 BARANGAY SERVICES (SVG + Glass-Morphism + Hover Effects)
              ============================================= */}
          <div className="card" style={{
            background: 'rgba(26, 29, 36, 0.4)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(79, 142, 247, 0.2)',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div className="card-title" style={{
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '700',
              color: 'var(--text)'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              Barangay Services
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px'
            }}>
              {/* CERTIFICATES */}
              <button
                className="btn btn-outline"
                onClick={() => goToTab('s-certificates')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '16px 12px',
                  height: 'auto',
                  borderRadius: '10px',
                  border: '1px solid rgba(79, 142, 247, 0.3)',
                  background: 'rgba(26, 29, 36, 0.3)',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(79, 142, 247, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(79, 142, 247, 0.5)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(26, 29, 36, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(79, 142, 247, 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--primary)' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M12 18v-6" />
                  <path d="M9 15h6" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: '800' }}>Certificates</span>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Request / Track</span>
              </button>

              {/* SUBMIT FEEDBACK */}
              <button
                className="btn btn-outline"
                onClick={() => goToTab('s-feedback')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '16px 12px',
                  height: 'auto',
                  borderRadius: '10px',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  background: 'rgba(26, 29, 36, 0.3)',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(167, 139, 250, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.5)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(26, 29, 36, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--purple)' }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: '800' }}>Submit Feedback</span>
              </button>

              {/* VIEW NEWS */}
              <button
                className="btn btn-outline"
                onClick={() => goToTab('s-announcements')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '16px 12px',
                  height: 'auto',
                  borderRadius: '10px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  background: 'rgba(26, 29, 36, 0.3)',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(26, 29, 36, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--green)' }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
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
            <div className="card" style={{ padding: '18px', marginBottom: '16px' }}>
              {/* Form Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  New Certificate Application
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowCertForm(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={(e) => { submitCert(e); setShowCertForm(false); }}>
                
                {/* Compact Applicant Verification Box */}
                <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>APPLICANT DETAILS</span>
                    <span className="badge b-green" style={{ fontSize: '9.5px', padding: '2px 6px' }}>✓ Profile Verified</span>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: '12.5px' }}>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Name</span>
                      <strong style={{ color: 'var(--text)' }}>{loggedInUser?.fullName || 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Purok / Zone</span>
                      <strong style={{ color: 'var(--text)' }}>{loggedInUser?.purok || 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Birthdate & Age</span>
                      <strong style={{ color: 'var(--text)' }}>
                        {loggedInUser?.birthdate || 'N/A'} {loggedInUser?.age ? `(${loggedInUser.age} y/o)` : ''}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Contact</span>
                      <strong style={{ color: 'var(--text)' }}>{loggedInUser?.contact || 'N/A'}</strong>
                    </div>
                  </div>
                </div>

                {/* Form Inputs */}
                <div className="fg" style={{ marginBottom: '12px' }}>
                  <label className="fl">Certificate Type *</label>
                  <select 
                    className="fc" 
                    value={certForm.certType} 
                    onChange={updateCertField('certType')} 
                    required
                  >
                    <option value="">-- Select Certificate Type --</option>
                    <option value="Barangay Clearance">Barangay Clearance</option>
                    <option value="Certificate of Indigency">Certificate of Indigency</option>
                    <option value="Certificate of Residency">Certificate of Residency</option>
                    <option value="First Time Job Seeker Certificate">First Time Job Seeker (RA 11261)</option>
                    <option value="Certificate of Good Moral Character">Certificate of Good Moral</option>
                    <option value="Certificate of Low Income">Certificate of Low Income</option>
                    <option value="Barangay Business Clearance">Barangay Business Clearance</option>
                    <option value="Barangay ID Application">Barangay ID Card Request</option>
                  </select>
                </div>

                <div className="fg" style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="fl" style={{ margin: 0 }}>Purpose of Request *</label>
                    <span style={{ fontSize: '10.5px', color: (certForm.certPurpose?.length || 0) > 200 ? 'var(--red)' : 'var(--muted)' }}>
                      {certForm.certPurpose?.length || 0} / 200
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
                    style={{ resize: 'none' }}
                  />
                </div>

                {/* Routing Notice */}
                <div style={{ fontSize: '11.5px', color: 'var(--muted)', background: 'var(--surface2)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '16px' }}>
                  Requests are routed directly to the Barangay Captain's desk for validation.
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    Submit Request
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowCertForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
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

                let certIcon = '';
                if (request.certType?.includes('Indigency')) certIcon = '';
                if (request.certType?.includes('Residency')) certIcon = '';

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
                        {isIssued ? '✓ Issued' : 'Pending'}
                      </span>
                      {!isIssued && stepCount === 1 && (
                        <button 
                          className="btn btn-ghost btn-sm" 
                          style={{ 
                            color: 'var(--red)', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600
                          }} 
                          onClick={() => handleCancelRequest(request._id)}
                          title="Cancel Request"
                        >
                          Cancel
                        </button>
                      )}
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
                        {isIssued ? 'Document ready for collection' : 'Awaiting Administrative E-Signature'}
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
                    <div>
                      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: '800' }}>
                        <span>{certIcon}</span> {request.certType}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px', fontStyle: request.certPurpose ? 'normal' : 'italic' }}>
                        {request.certPurpose || 'No purpose specification declaration'}
                      </div>
                    </div>

                    {/* Status Badge & Cancel Action Wrapper */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={badgeClass} style={{ textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.3px' }}>
                        {isIssued ? '✓ Issued' : '⏳ Pending'}
                      </span>

                      {!isIssued && stepCount === 1 && (
                        <button 
                          className="btn btn-ghost btn-sm" 
                          style={{ 
                            color: 'var(--red)', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            padding: '4px 8px', 
                            fontSize: '11px', 
                            fontWeight: 600 
                          }} 
                          onClick={() => handleCancelRequest(request._id)} 
                          title="Cancel Request"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          Cancel
                        </button>
                      )}
                    </div>
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
                    {
                      type: 'Complaint',
                      label: 'Complaint',
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      )
                    },
                    {
                      type: 'Suggestion',
                      label: 'Suggestion',
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
                        </svg>
                      )
                    },
                    {
                      type: 'Inquiry',
                      label: 'Inquiry',
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                          <circle cx="12" cy="12" r="10" />
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      )
                    },
                  ].map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      className={`type-btn${feedbackType === option.type ? ' active' : ''}`}
                      onClick={() => setFeedbackType(option.type)}
                    >
                      {option.icon}
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
                    Your concern is linked to your account and will be responded to by barangay staff within 3 working days.
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-full">Submit Concern</button>
              </form>
            </div>

            {/* MY SUBMISSIONS SECTION */}
            <div className="card" style={{ marginTop: '16px' }}>
              <div className="card-title" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                My Submissions ({myFeedbacks.length})
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

                    const typeIcon =
                      item.feedbackType === 'Complaint' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      ) : item.feedbackType === 'Suggestion' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                          <circle cx="12" cy="12" r="10" />
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      );

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

                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#f8fafc', marginBottom: '4px', display: 'flex', alignItems: 'center' }}>
                          {typeIcon}
                          {item.subject}
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
                          style={{
                            marginBottom: isExpanded ? '12px' : '0',
                            fontSize: '12px',
                            padding: '4px 10px',
                          }}
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
                                  <div
                                    key={label}
                                    className={`step${isDone ? ' done' : isActive ? ' active' : ' pending'}`}
                                  >
                                    <div className="step-circle">{isDone ? '✓' : value}</div>
                                    <div className="step-label">{label}</div>
                                    {index < 3 && <div className="step-line" />}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Full Message */}
                            <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '12px', lineHeight: '1.4' }}>
                              &quot;{item.details}&quot;
                            </div>

                            {/* Official Response */}
                            {item.response && (
                              <div
                                style={{
                                  marginTop: '10px',
                                  padding: '10px 12px',
                                  background: '#0f172a',
                                  borderLeft: '3px solid #10b981',
                                  borderRadius: '4px',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '11px',
                                    color: '#10b981',
                                    fontWeight: 'bold',
                                    marginBottom: '2px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                    <polyline points="9 22 9 12 15 12 15 22" />
                                  </svg>
                                  Official Barangay Response ({item.handledBy || 'Barangay Staff'}):
                                </div>
                                <div style={{ fontSize: '12px', color: '#f1f5f9', fontStyle: 'italic' }}>
                                  &quot;{item.response}&quot;
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

          {/* ─── BLOTTER SCREEN ─── */}
<div className={`screen${activeScreen === 's-blotter' ? ' active' : ''}`}>
  <div className="page-hdr">
    <div className="page-title">Blotter Reports</div>
    <div className="page-sub">File incidents and track complaint status</div>
  </div>

  {/* ─── New Complaint Form ─── */}
  <div className="card" style={{ padding: '18px', marginBottom: '16px' }}>
    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--red)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      File New Complaint
    </div>
    
    <form onSubmit={submitBlotter}>
      <div className="fg" style={{ marginBottom: '12px' }}>
        <label className="fl">Incident Subject / Title *</label>
        <input 
          type="text" 
          className="fc" 
          placeholder="e.g. Property Dispute, Noise Complaint" 
          required 
          value={blotterSubject} 
          onChange={(e) => setBlotterSubject(e.target.value)} 
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
        <div className="fg" style={{ margin: 0 }}>
          <label className="fl">Incident Date</label>
          <input 
            type="date" 
            className="fc" 
            value={blotterIncidentDate} 
            onChange={(e) => setBlotterIncidentDate(e.target.value)} 
          />
        </div>
        <div className="fg" style={{ margin: 0 }}>
          <label className="fl">Location / Zone</label>
          <input 
            type="text" 
            className="fc" 
            placeholder="e.g. Purok 3" 
            value={blotterLocation} 
            onChange={(e) => setBlotterLocation(e.target.value)} 
          />
        </div>
      </div>

      <div className="fg" style={{ marginBottom: '16px' }}>
        <label className="fl">Incident Details *</label>
        <textarea 
          className="fc" 
          rows="3" 
          placeholder="State details, persons involved, or immediate context..." 
          required 
          value={blotterDetails} 
          onChange={(e) => setBlotterDetails(e.target.value)} 
          style={{ resize: 'none' }} 
        />
      </div>

      <button type="submit" className="btn btn-primary btn-full">
        Submit Incident Report
      </button>
    </form>
  </div>

  {/* ─── My Filed Reports ─── */}
  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <span>My Submitted Reports</span>
    <span className="badge b-blue" style={{ fontSize: '10px' }}>
      {myBlotters.length} Total
    </span>
  </div>

  {myBlotters.length === 0 ? (
    <div className="card" style={{ textAlign: 'center', padding: '32px 16px', border: '2px dashed var(--border)', background: 'transparent' }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
      <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>No blotter records on file</div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
        Your filed complaint histories will display here.
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {myBlotters.map((item) => {
        const blotterStep = getBlotterStep(item.status);
        const blotterSteps = ['Filed', 'Investigation', 'Mediation', 'Resolved'];

        const isResolved = item.status === 'Resolved' || item.status === 'Closed';
        const isMediation = item.status === 'Under Mediation' || item.status === 'For Mediation';
        const isInvestigation = item.status === 'Under Investigation';

        const badgeClass = isResolved 
          ? 'badge b-green' 
          : isMediation 
          ? 'badge b-purple' 
          : isInvestigation 
          ? 'badge b-blue' 
          : 'badge b-amber';

        return (
          <div className="card" key={item._id || item.refNumber} style={{ padding: '16px' }}>
            {/* Title & Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>
                  {item.incidentType || item.subject || 'Incident Complaint'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                  Ref: <code style={{ color: 'var(--text)', fontWeight: 700 }}>{item.refNumber}</code>
                  {item.caseNo && item.caseNo !== item.refNumber ? ` · Case #${item.caseNo}` : ''}
                </div>
              </div>
              <span className={badgeClass} style={{ textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.3px' }}>
                {item.status || 'Pending'}
              </span>
            </div>

            {/* Location & Summary Meta */}
            {item.location && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>📍 Location:</span>
                <strong style={{ color: 'var(--text)' }}>{item.location}</strong>
              </div>
            )}

            <div style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: '1.4', marginBottom: '14px', background: 'var(--surface2)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              {item.details}
            </div>

            {/* Compact Progress Stepper */}
            <div className="steps" style={{ marginBottom: '12px' }}>
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

            {/* Scheduled Mediation Notice */}
            {item.mediationDate && (
              <div style={{ marginBottom: '10px', padding: '8px 10px', background: 'rgba(124, 58, 237, 0.1)', border: '1px solid rgba(124, 58, 237, 0.2)', borderRadius: '6px', fontSize: '11.5px', color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🗓️</span>
                <span><strong>Mediation Schedule:</strong> {item.mediationDate}</span>
              </div>
            )}

            {/* Footer Date & Offline Sync Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
              <span>Incident Date: <strong style={{ color: 'var(--text)' }}>{item.incidentDate || 'N/A'}</strong></span>
              <span className={`badge ${item._rev?.startsWith('1-') ? 'b-amber' : 'b-green'}`} style={{ fontSize: '9px' }}>
                {item._rev?.startsWith('1-') ? 'Local Log' : 'Synced'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>

          {/* ASSISTANCE SCREEN */}
          <div className={`screen${activeScreen === 's-assistance' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">My Assistance</div>
              <div className="page-sub">Track your aid, relief, and beneficiary records</div>
            </div>

            <div
              className="stat-row"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <div className="stat-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                </div>
                <div className="stat-val" style={{ color: 'var(--teal)' }}>{myAssistance.length}</div>
                <div className="stat-lbl">Total Received</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div className="stat-val" style={{ color: 'var(--amber)' }}>
                  {myAssistance.filter((a) => ['pending', 'scheduled'].includes((a.status || '').toLowerCase())).length}
                </div>
                <div className="stat-lbl">Pending / Scheduled</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <div className="stat-val" style={{ color: 'var(--green)' }}>
                  {myAssistance.filter((a) => ['released', 'completed'].includes((a.status || '').toLowerCase())).length}
                </div>
                <div className="stat-lbl">Completed</div>
              </div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Assistance History
              </div>

              {myAssistance.length === 0 ? (
                <div className="notice notice-info">
                  <span>No assistance records found. Records will appear here once the barangay admin encodes your aid distribution.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {myAssistance.map((item) => (
                    <div
                      key={item._id || item.refNumber}
                      style={{
                        background: 'var(--surface2)',
                        padding: '14px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 'bold' }}>
                          {item.refNumber || item._id}
                        </span>
                        <span
                          className="badge"
                          style={{
                            background: ['released', 'completed'].includes((item.status || '').toLowerCase()) ? 'var(--green-bg)' : 'var(--amber-bg)',
                            color: ['released', 'completed'].includes((item.status || '').toLowerCase()) ? 'var(--green)' : 'var(--amber)',
                            fontSize: '11px',
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
                        <div>
                          Date:{" "}
                          <strong style={{ color: 'var(--text)' }}>
                            {item.dateDistributed || item.date || item.timestamp
                              ? new Date(item.dateDistributed || item.date || item.timestamp).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : 'N/A'}
                          </strong>
                        </div>
                        <div>
                          Amount/Item:{" "}
                          <strong style={{ color: 'var(--text)' }}>{item.amount || item.item || item.quantity || 'N/A'}</strong>
                        </div>
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
            <div className="card" style={{ padding: '20px', textAlign: 'center', marginBottom: '16px' }}>
              <div 
                style={{ 
                  width: '60px', 
                  height: '60px', 
                  background: 'var(--surface2)', 
                  border: '2px solid var(--primary)', 
                  borderRadius: '50%', 
                  margin: '0 auto 10px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '20px', 
                  fontWeight: 800, 
                  color: 'var(--primary)' 
                }}
              >
                {loggedInUser?.initials || 'RES'}
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>
                {loggedInUser?.fullName || 'Resident Member'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                Resident ID: <code style={{ color: 'var(--text)', fontWeight: 600 }}>{loggedInUser?.residentId || 'Not Available'}</code>
              </div>
              <div style={{ marginTop: '10px' }}>
                <span className="badge b-green" style={{ fontSize: '10px', letterSpacing: '0.3px', padding: '3px 8px' }}>
                  ✓ {loggedInUser?.voterStatus || 'Registered Voter'}
                </span>
              </div>
            </div>

            {/* Personal Details (Clean Grid Layout) */}
            <div className="card" style={{ padding: '18px', marginBottom: '16px' }}>
              <div 
                style={{ 
                  fontSize: '11px', 
                  fontWeight: 800, 
                  color: 'var(--primary)', 
                  marginBottom: '14px', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px' 
                }}
              >
                Personal Information
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', fontSize: '13px' }}>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Birthdate:</span>
                  <strong style={{ color: 'var(--text)' }}>
                    {loggedInUser?.birthdate ? new Date(loggedInUser.birthdate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not Available'}
                  </strong>
                </div>

                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Age:</span>
                  <strong style={{ color: 'var(--text)' }}>
                    {loggedInUser?.age ? `${loggedInUser.age} years old` : 'Not Available'}
                  </strong>
                </div>

                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Gender:</span>
                  <strong style={{ color: 'var(--text)' }}>{loggedInUser?.gender || 'Not Available'}</strong>
                </div>

                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Civil Status:</span>
                  <strong style={{ color: 'var(--text)' }}>{loggedInUser?.civilStatus || 'Not Available'}</strong>
                </div>

                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Contact:</span>
                  <strong style={{ color: 'var(--text)' }}>{loggedInUser?.contact || 'Not Available'}</strong>
                </div>

                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Purok:</span>
                  <strong style={{ color: 'var(--text)' }}>
                    {loggedInUser?.purok ? (loggedInUser.purok.toString().toLowerCase().startsWith('purok') ? loggedInUser.purok : `Purok ${loggedInUser.purok}`) : 'Not Available'}
                  </strong>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>Household:</span>
                  <strong style={{ color: 'var(--text)' }}>{loggedInUser?.household || 'Not Available'}</strong>
                </div>
              </div>
            </div>

            {/* Sync Status Banner */}
            <div 
              style={{ 
                padding: '10px 12px', 
                background: 'var(--surface2)', 
                borderRadius: 'var(--radius-sm)', 
                border: '1px solid var(--border)', 
                fontSize: '11px', 
                color: 'var(--muted)', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                marginBottom: '16px' 
              }}
            >
              <div className={`sync-dot ${isOffline ? 'offline' : ''}`} />
              <span>
                CouchDB Sync — <strong style={{ color: isOffline ? 'var(--red)' : 'var(--green)' }}>{isOffline ? 'Offline' : 'Up to date'}</strong>
                {lastSync ? ` · ${lastSync.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            </div>

            {/* Sign Out Button */}
            <button 
              className="btn btn-ghost btn-full" 
              onClick={handleLogout} 
              style={{ 
                color: 'var(--red)', 
                borderColor: 'rgba(239, 68, 68, 0.2)', 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '6px', 
                fontWeight: 700 
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
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
