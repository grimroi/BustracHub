import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { localDb as db, forceSyncToRemote, remoteDb, stopPouchDBSync, onSyncStatusChange } from '../services/db';
import { createAuditLog } from '../utils/auditLog';
import { clearActiveSessionOnly } from '../utils/tokenStore';
import logo from '../assets/logo.png';
import './ResidentUI.css';
import { FaHome, FaFileAlt, FaBullhorn, FaCommentDots, FaUser, FaBalanceScale, FaHandHoldingHeart, FaCalendarAlt, FaBell, FaHeartbeat, FaExclamationTriangle, FaEllipsisH } from "react-icons/fa";
import Swal from 'sweetalert2'; // ? Added SweetAlert2 Import
import EventRegistrationScreen from '../components/screens/EventRegistrationScreen';
import {
  normalizeCertificateDoc,
  normalizeBlotterDoc,
  normalizeFeedbackDoc,
  buildAuditLogPayload,
  calculateAge,
  updateStoredUser,
  getStoredUser,
  clearStoredUser,
} from '../utils/residentUtils';
import { enforceBlotterSubmission } from '../utils/blotterSubmitGuard';

import ResidentHome from '../components/Resident/ResidentHome';
import ResidentCertificates from '../components/Resident/ResidentCertificates';
import ResidentAnnouncements from '../components/Resident/ResidentAnnouncements';
import ResidentFeedback from '../components/Resident/ResidentFeedback';
import ResidentBlotter from '../components/Resident/ResidentBlotter';
import ResidentAssistance from '../components/Resident/ResidentAssistance';
import ResidentProfile from '../components/Resident/ResidentProfile';
import ResidentHealthView from '../components/BHS/ResidentHealthView';
import ResidentBDRRMC from '../components/BDRRMC/ResidentBDRRMC';
import SyncStatusIndicator from '../components/SyncStatusIndicator';
import { fetchNotifications, createNotification, markAllReadForUser, getUnreadCount } from '../services/notifications';

const CERT_FORM_INITIAL = { certType: '', certPurpose: '' };

// Validates the certificate purpose so low-effort dummy text (e.g. "dfsghfgdhg")
// cannot be submitted. Returns an error message, or null when the text is valid.
const CERT_PURPOSE_MIN_LENGTH = 10;
const validateCertPurpose = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return 'Please state the purpose of the request.';
  if (text.length < CERT_PURPOSE_MIN_LENGTH) {
    return `Please provide a more detailed purpose (at least ${CERT_PURPOSE_MIN_LENGTH} characters).`;
  }
  if (!/[a-zA-Z]/.test(text)) {
    return 'Please describe the purpose in words.';
  }
  // Must contain at least one vowel and not be a single repeated character —
  // catches keyboard-mash entries such as "dfsghfgdhg" or "aaaaaaaaaa".
  if (!/[aeiou]/i.test(text)) {
    return 'That purpose doesn\u2019t look valid. Please describe it in plain words.';
  }
  if (/^(.)\1+$/.test(text.replace(/\s+/g, ''))) {
    return 'That purpose doesn\u2019t look valid. Please describe it in plain words.';
  }
  // Reject long keyboard-mash runs of consonants (e.g. "dfghjkl", "sdfghj").
  if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(text.replace(/\s+/g, ''))) {
    return 'That purpose doesn\u2019t look valid. Please describe it in plain words.';
  }
  return null;
};

// -- Resident identity matching ----------------------------------------------
// DB-wide replication means every resident's device holds every document. These
// helpers keep the Home metrics (and list views) strictly limited to records
// that belong to � or explicitly involve � the logged-in resident. Matching is
// exact (case-insensitive); partial/substring matches are never accepted, so a
// name or id collision can't leak another resident's records.
const normId = (value) => String(value ?? '').trim().toLowerCase();

const normPersonName = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const nameOfField = (value) =>
  value && typeof value === 'object'
    ? (value.name || value.fullName || '')
    : (value || '');

const safePut = async (doc) => {
    let attempts = 0;
    while (attempts < 3) {
      try {
        return await db.put(doc);
      } catch (e) {
        if (e.status === 409) {
          attempts++;
          console.warn(`Conflict detected on ${doc._id}. Retrying with latest _rev... (Attempt ${attempts})`);
          const latest = await db.get(doc._id);
          doc = { ...doc, _rev: latest._rev };
        } else {
          throw e;
        }
      }
    }
    throw new Error('Max retries reached: Document conflict unresolved');
  };

// Move focus out of any subtree before opening a SweetAlert2 popup. SweetAlert2
// marks the app background (e.g. #root) as aria-hidden; if a descendant keeps
// focus, the browser logs a "Blocked aria-hidden ... descendant retained focus"
// violation.
const blurActiveElement = () => {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (el && typeof el.blur === 'function') el.blur();
};

export default function ResidentUI() {
  const navigate = useNavigate();
  const location = useLocation();

  /* -----------------------------------------------------------
     SECTION 1: ALL useState (nasa pinakataas � walang exception)
     ----------------------------------------------------------- */
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [loggedInUser, setLoggedInUser] = useState(getStoredUser);
  const [activeScreen, setActiveScreen] = useState('s-home');
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  // Data states
  const [residentProfile, setResidentProfile] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [myBlotters, setMyBlotters] = useState([]);
  const [myAssistance, setMyAssistance] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [syncState, setSyncState] = useState(typeof navigator !== 'undefined' && navigator.onLine ? 'synced' : 'offline');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncDetail, setSyncDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Offline-first notifications (local, PouchDB `_local/` document)
  const [notifItems, setNotifItems] = useState([]);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  // "More" bottom-nav drawer (secondary tabs on mobile)
  const [moreOpen, setMoreOpen] = useState(false);

  // Certificate states
  const [showCertForm, setShowCertForm] = useState(false);
  const [certForm, setCertForm] = useState(CERT_FORM_INITIAL);
  const [certSuccess, setCertSuccess] = useState(null);
  const [isSubmittingCert, setIsSubmittingCert] = useState(false);
  const [filterTab, setFilterTab] = useState('all');

  // Blotter edit states
  const [editingReport, setEditingReport] = useState(null);
  const [editForm, setEditForm] = useState({
    subject: '', details: '', incidentDate: '', zone: 'Zone 1', street: '', respondent: '',
  });
    const [isSavingEdit, setIsSavingEdit] = useState(false); 

  const [sseNotification, setSseNotification] = useState(null);

  /* -----------------------------------------------------------
     SECTION 2: ALL useRef (kasunod ng useState)
     ----------------------------------------------------------- */
  const loggedInUserRef = useRef(loggedInUser);
  const isFetchingRef = useRef(false);
  const notifiedCertIds = useRef(new Set());
  const reloadTimerRef = useRef(null);
  const editModalRef = useRef(null);
  const prevCertStatusRef = useRef(null);
  const prevAnnouncementIdsRef = useRef(null);

  /* -----------------------------------------------------------
     SECTION 3: SIMPLE useEffect (no interdependencies)
     ----------------------------------------------------------- */
    //  3a. Sync loggedInUserRef � DAPAT PINAKAUNA
      useEffect(() => {
        loggedInUserRef.current = loggedInUser;
      }, [loggedInUser]);

  // 3b. Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
 
  // ? 3c. Modal scroll lock 
useEffect(() => {
  document.body.style.overflow = editingReport ? 'hidden' : '';
  return () => {
    document.body.style.overflow = '';
  };
}, [editingReport]);

  // 3c. Multi-tab & same-tab user sync
  useEffect(() => {
    const handleUserChange = (e) => {
      if (!e || e.key === 'bustrac_user' || e.type === 'bustrac_user_updated') {
        setLoggedInUser(getStoredUser());
      }
    };
    window.addEventListener('storage', handleUserChange);
    window.addEventListener('bustrac_user_updated', handleUserChange);
    return () => {
      window.removeEventListener('storage', handleUserChange);
      window.removeEventListener('bustrac_user_updated', handleUserChange);
    };
  }, []);

  // 3d. Offline/Online detection
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

  // 3d-2. Cloud sync status � shared PouchDB sync events from services/db.
  useEffect(() => {
    const unsubscribe = onSyncStatusChange(({ status, pending, detail }) => {
      setSyncState(status);
      setSyncDetail(detail ?? null);
      if (typeof pending === 'number' && pending !== 999) {
        setPendingCount(pending);
      }
      if (status === 'synced' || status === 'success') {
        setLastSync(new Date());
        setPendingCount(0);
        setSyncDetail(null);
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.db = db;
    window.remoteDb = remoteDb;
    window.forceSync = forceSyncToRemote;
    console.log('? Debug helpers exposed (Resident UI)');
    console.log('  ? window.db, window.remoteDb, window.forceSync');
  }
}, []);

  /* -----------------------------------------------------------
     SECTION 4: SIMPLE useMemo (no callback deps)
     ----------------------------------------------------------- */
  const greetingText = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  /* -----------------------------------------------------------
     SECTION 5: useCallback � IN DEPENDENCY ORDER ?? CRITICAL
     ----------------------------------------------------------- */

  // 5a. Resident identity + strict scoping helpers � dapat PINAKAUNA
  const getResidentIdentity = useCallback(() => {
    const user = loggedInUserRef.current || {};
    return {
      ids: [user._id, user.id, user.residentId].map(normId).filter(Boolean),
      usernames: [user.username, user.email].map(normId).filter(Boolean),
      fullName: normPersonName(user.fullName || user.name),
    };
  }, []);

  // The document explicitly belongs to the logged-in resident. Only exact owner
  // identifiers count (residentId / userId / submittedBy / ownerId / username).
  const isOwnedByResident = useCallback((doc) => {
    if (!doc) return false;
    const { ids, usernames } = getResidentIdentity();
    const docIds = [doc.residentId, doc.userId, doc.submittedBy, doc.ownerId]
      .map(normId)
      .filter(Boolean);
    if (ids.length && docIds.some((id) => ids.includes(id))) return true;
    const docUsernames = [doc.username, doc.user].map(normId).filter(Boolean);
    return usernames.length > 0 && docUsernames.some((u) => usernames.includes(u));
  }, [getResidentIdentity]);

  // Blotter visibility = "filed by OR involving" this resident: owned, carrying
  // their id in the complainant/respondent id fields, or an EXACT full-name
  // match as complainant/respondent.
  const isResidentInvolvedInBlotter = useCallback((doc) => {
    if (!doc) return false;
    if (isOwnedByResident(doc)) return true;
    const { ids, fullName } = getResidentIdentity();
    const involvedIds = [doc.complainantId, doc.respondentId].map(normId).filter(Boolean);
    if (ids.length && involvedIds.some((id) => ids.includes(id))) return true;
    if (!fullName) return false;
    const names = [doc.complainant, doc.complainantName, doc.respondent, doc.respondentName]
      .map((value) => normPersonName(nameOfField(value)))
      .filter(Boolean);
    return names.includes(fullName);
  }, [getResidentIdentity, isOwnedByResident]);

  // The resident's own profile document (owned id, or exact full-name match).
  const isResidentProfile = useCallback((doc) => {
    if (!doc) return false;
    if (isOwnedByResident(doc)) return true;
    const { fullName } = getResidentIdentity();
    if (!fullName) return false;
    const docName = normPersonName(
      doc.fullName || `${doc.firstName || ''} ${doc.lastName || ''}`
    );
    return Boolean(docName) && docName === fullName;
  }, [getResidentIdentity, isOwnedByResident]);

  const goToTab = useCallback((id) => {
  setActiveScreen(id);
}, []);

useLayoutEffect(() => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}, [activeScreen]);

  // -- Toast notification helper (Swal-based) --
const showToast = useCallback((message, type = 'success') => {
  // Handle swapped arguments (some components use showToast('error', msg))
  const VALID_TYPES = ['success', 'error', 'warning', 'info'];
  if (
    typeof message === 'string' &&
    VALID_TYPES.includes(message.toLowerCase()) &&
    typeof type === 'string' &&
    !VALID_TYPES.includes(type.toLowerCase())
  ) {
    const swapped = type;
    type = message;
    message = swapped;
  }

  if (typeof Swal !== 'undefined' && Swal.fire) {
    Swal.fire({
      icon: type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'info' ? 'info' : 'success',
      toast: true,
      position: 'top-end',
      timer: 2500,
      timerProgressBar: true,
      showConfirmButton: false,
      title: message,
    });
  } else {
    // Fallback kung wala si Swal
    console.warn(`[${type}] ${message}`);
  }
}, []);
  
  // 5b-2. requestNotificationPermission � no deps
  // 5c. handleLogout � deps: navigate
  const handleLogout = useCallback(() => {
    Swal.fire({
      title: 'Log Out?',
      text: 'Are you sure you want to leave the resident portal?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Log Out'
    }).then((result) => {
      if (result.isConfirmed) {
        clearStoredUser();
        clearActiveSessionOnly();
        stopPouchDBSync();
        navigate('/login');
      }
    });
  }, [navigate]);

  // 5d. loadData � deps: checkUserMatch ? SAFE
  const loadData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!db) {
      setIsLoading(false);
      setLoadError('Database not available');
      isFetchingRef.current = false;
      return;
    }

    const user = loggedInUserRef.current || loggedInUser;
    if (!user || !user.fullName) {
      setIsLoading(false);
      setLoadError('User not logged in');
      isFetchingRef.current = false;
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const res = await db.allDocs({ include_docs: true });
      const docs = res.rows.map((r) => r.doc).filter(Boolean);
      const byType = (type) => docs.filter((d) => d.type === type || d.docType === type);
      const sortTs = (a, b) => new Date(b.timestamp || b.updatedAt || b.createdAt || b.dateFiled || 0) - new Date(a.timestamp || a.updatedAt || a.createdAt || a.dateFiled || 0);

      const userBlotters = docs.filter((doc) => {
        const isBlotterDoc = doc.docType === 'blotter' || doc.type === 'blotter' || doc.type === 'blotter_record' || Boolean(doc.trackingNo || doc.caseNo || doc.caseNum || doc.refNumber);
        return isBlotterDoc && isResidentInvolvedInBlotter(doc);
      }).map(normalizeBlotterDoc).filter(Boolean).sort(sortTs);
      setMyBlotters(userBlotters);

      const userRequests = docs.filter((d) => (d.type === 'certificate_request' || d.type === 'request') && isOwnedByResident(d))
        .map(normalizeCertificateDoc).filter(Boolean).sort(sortTs);
      setMyRequests(userRequests);

      setAnnouncements(
        byType('announcement')
          .filter((a) => (a.status || 'Published').toLowerCase() !== 'draft')
          .sort(sortTs)
      );
      setMyAssistance(docs.filter((d) => d.type === 'aid_distribution' && isOwnedByResident(d)).sort(sortTs));

      const userFeedbacks = docs.filter((doc) => {
        const isFeedbackDoc = doc.type === 'feedback_report' || doc.type === 'feedback' || doc.docType === 'feedback';
        return isFeedbackDoc && isOwnedByResident(doc);
      }).map(normalizeFeedbackDoc).filter(Boolean).sort(sortTs);
      setMyFeedbacks(userFeedbacks);

      const residentDoc = docs.find((d) => (d.docType === 'resident' || d.type === 'resident' || d.residentId) && isResidentProfile(d));
      if (residentDoc) {
        setResidentProfile({ ...residentDoc, rawDoc: residentDoc });
        const prevUser = loggedInUserRef.current || {};
        const merged = {
          ...prevUser,
          firstName: residentDoc.firstName || prevUser?.firstName || '',
          lastName: residentDoc.lastName || prevUser?.lastName || '',
          fullName: residentDoc.fullName || `${residentDoc.firstName || ''} ${residentDoc.lastName || ''}`.trim() || prevUser?.fullName || '',
          birthdate: residentDoc.birthdate || residentDoc.dateOfBirth || prevUser?.birthdate || '',
          age: residentDoc.age || residentDoc.currentAge || calculateAge(residentDoc.birthdate || residentDoc.dateOfBirth) || prevUser?.age || 0,
          purok: residentDoc.purok || residentDoc.zone || prevUser?.purok || '',
          contact: residentDoc.contact || residentDoc.phone || residentDoc.mobile || prevUser?.contact || '',
          email: residentDoc.email || prevUser?.email || '',
          residentId: residentDoc.residentId || residentDoc._id || prevUser?.residentId || '',
          rbiId: residentDoc.rbiId || residentDoc.householdId || prevUser?.rbiId || '',
          address: residentDoc.address || residentDoc.streetAddress || prevUser?.address || '',
          gender: residentDoc.gender || prevUser?.gender || '',
          civilStatus: residentDoc.civilStatus || prevUser?.civilStatus || '',
          emergencyContactName: residentDoc.emergencyContactPerson || residentDoc.emergencyContactName || prevUser?.emergencyContactName || '',
          emergencyContactNumber: residentDoc.emergencyContactNo || residentDoc.emergencyContactNumber || prevUser?.emergencyContactNumber || '',
        };
        const updatedUser = updateStoredUser(merged);
        setLoggedInUser(updatedUser);
      }
      setLastSync(new Date());
    } catch (e) {
      console.error('? Load error in ResidentUI:', e);
      setLoadError(e.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [getResidentIdentity, isOwnedByResident, isResidentInvolvedInBlotter, isResidentProfile]); 

  const submitCert = useCallback(
  async (e) => {
    e.preventDefault();
    if (isSubmittingCert) return;

    const { certType, certPurpose } = certForm;
    const currentUser = loggedInUserRef.current;

    if (!certType) {
      Swal.fire('Error', 'Please select a certificate type.', 'error');
      return;
    }

    if (!certPurpose?.trim()) {
      Swal.fire('Error', 'Please state the purpose of the request.', 'error');
      return;
    }

    const purposeError = validateCertPurpose(certPurpose);
    if (purposeError) {
      Swal.fire('Error', purposeError, 'error');
      return;
    }

    if (!currentUser?.residentId) {
      Swal.fire('Error', 'Resident ID not found. Please log in again.', 'error');
      return;
    }

    setIsSubmittingCert(true);

    try {
      const recentCheck = await db.allDocs({
        include_docs: true,
        startkey: 'CERT-',
        endkey: 'CERT-\ufff0'
      });

      const userPendingCerts = recentCheck.rows
        .map(r => r.doc)
        .filter(
          doc =>
            doc.residentId === currentUser.residentId &&
            doc.certificateType === certType &&
            ['Submitted', 'Under Review', 'Pending'].includes(doc.status)
        );

      if (userPendingCerts.length >= 3) {
        Swal.fire('Limit Reached', 'You already have 3 pending requests for this certificate type.', 'warning');
        setIsSubmittingCert(false);
        return;
      }
      
      const generatedId = `CERT-RES-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const nowIso = new Date().toISOString();

      const payload = {
        _id: generatedId,
        type: 'certificate_request',
        applicantType: 'Resident',
        residentId: currentUser.residentId,
        residentName: currentUser.fullName || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
        username: currentUser.username || '',
        firstName: currentUser.firstName || '',
        lastName: currentUser.lastName || '',
        birthdate: currentUser.birthdate || '',
        age: currentUser.age || 0,
        contact: currentUser.contact || '',
        purok: currentUser.purok || 'Purok 1',
        email: currentUser.email || '',
        certificateType: certType,
        purpose: certPurpose.trim(),
        status: 'Submitted',
        step: 1,
        requestedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };

    await safePut(payload);

      try {
        await createAuditLog({
          action: 'CREATE_CERTIFICATE_REQUEST',
          module: 'CERTIFICATES',
          recordId: generatedId,
          actor: {
            username: currentUser.username || 'resident',
            role: 'resident',
            fullName: currentUser.fullName || 'Resident'
          },
          details: `Resident requested ${certType} for purpose: "${certPurpose.trim()}"`
        });
      } catch (auditErr) {
        console.warn('Audit log entry failed (likely offline):', auditErr);
      }

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await forceSyncToRemote();
        } catch (syncErr) {
          console.warn('Background sync delayed:', syncErr);
        }
      }

      setCertSuccess({
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        certType,
        refNumber: generatedId
      });

      setCertForm(CERT_FORM_INITIAL);
      await loadData();

      Swal.fire('Success', 'Your certificate request has been submitted successfully!', 'success');
      setTimeout(() => setCertSuccess(null), 5000);
    } catch (err) {
      console.error('Cert save error', err);
      Swal.fire('Error', 'Unable to save your request locally. Please try again.', 'error');
    } finally {
      setIsSubmittingCert(false);
    }
  },
  [certForm, loadData, isSubmittingCert]
);

  // 5f. submitFeedback � deps: []
  const submitFeedback = useCallback(
  async ({ feedbackType, subject, message, residentId, residentName, username }) => {
    if (!db) {
      Swal.fire('Error', 'Local database is unavailable.', 'error');
      throw new Error('No db');
    }

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentChecks = await db.allDocs({
        include_docs: true,
        startkey: 'feedback_',
        endkey: 'feedback_\ufff0',
      });

      const userRecentFeedback = recentChecks.rows
        .map((r) => r.doc)
        .filter((doc) => doc && doc.residentId === residentId && doc.timestamp > oneDayAgo);

      if (userRecentFeedback.length > 0) {
        Swal.fire('Wait a moment', '?? You can only submit one feedback every 24 hours. Please wait before submitting another.', 'warning');
        return;
      }
    } catch (err) {
      console.warn('Anti-spam check failed, proceeding with caution:', err);
    }

    const refNumber = 'FB-' + Date.now().toString().slice(-5);
    const doc = {
      _id: `feedback_${Date.now()}`,
      type: 'feedback_report',
      refNumber,
      feedbackType,
      subject,
      details: message,
      message,
      priority: 'Medium',
      status: 'Pending',
      timestamp: new Date().toISOString(),
      residentId,
      residentName,
      username,
      userId: residentId,
      sender: residentName,
      response: '',
      handledBy: '',
      dateResolved: '',
    };

    await safePut(doc);

    try {
      const auditPayload = buildAuditLogPayload({
        action: 'SUBMIT_FEEDBACK',
        module: 'FEEDBACK',
        recordId: refNumber,
        actor: { username, role: 'resident', fullName: residentName },
        details: `Submitted ${feedbackType} feedback: "${subject}"`,
      });
      await createAuditLog(auditPayload);
    } catch (auditErr) {
      console.warn('Audit log entry failed:', auditErr);
    }

    setMyFeedbacks((prev) => [normalizeFeedbackDoc(doc), ...(prev || [])]);
    Swal.fire('Success', 'Your feedback has been submitted successfully!', 'success');
  }, []);

  const submitBlotter = useCallback(
  async ({ subject, details, incidentDate, location, respondent, attachments = [] }) => {
    if (!db) {
      Swal.fire('Error', 'Local database is unavailable.', 'error');
      throw new Error('No db');
    }

    const currentUser = loggedInUserRef.current || loggedInUser;
    const safeComplainant = currentUser?.fullName || currentUser?.name || 'Anonymous Resident';
    const safeResidentId = currentUser?.residentId || '';
    const safeUsername = currentUser?.username || '';

    // ??? ANTI-SPAM + ?? DUPLICATE / PRELIMINARY BLOTTER CHECK.
    // Anti-spam runs FIRST and short-circuits the duplicate guard. The guard
    // blocks ONLY on reliable evidence that this submission duplicates the
    // resident's OWN active case; similar-name matches (possibly another
    // person) yield a neutral, non-blocking warning and never expose case
    // references. Logic lives in blotterSubmitGuard so the full decision flow
    // (including the Magpatuloy / Kanselahin buttons) is unit-tested.
    try {
      const blotterDocs = await db.allDocs({ include_docs: true, startkey: 'BLT-', endkey: 'BLT-\ufff0' });
      const blotterList = blotterDocs.rows.map((r) => r.doc).filter(Boolean);

      const guard = await enforceBlotterSubmission({
        blotterList,
        resident: { id: safeResidentId, name: safeComplainant },
        submission: { subject, incidentDate },
      });

      if (!guard.proceed) {
        return { success: false, reason: guard.reason };
      }
    } catch (err) {
      console.warn('Preliminary blotter check failed, proceeding with caution:', err);
    }

    const totalSizeMB = (attachments || []).reduce((acc, file) => acc + (parseFloat(file.size) || 0), 0);
    if (totalSizeMB > 8) {
      Swal.fire('File Too Large', `?? Ang total size ng mga ebidensya ay ${totalSizeMB.toFixed(2)}MB. Ang limit ay 8MB lamang.`, 'warning');
      return { success: false, reason: 'oversize' };
    }
     const refNumber = `BLT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

    const payload = {
      _id: refNumber,
      type: 'blotter_record',
      docType: 'blotter',
      refNumber,
      trackingNo: refNumber,
      caseNo: refNumber,
      id: refNumber,
      subject: subject.trim(),
      incidentType: subject.trim(),
      complainant: safeComplainant,
      complainantName: safeComplainant,
      residentName: safeComplainant,
      username: safeUsername,
      respondent: respondent || 'Under Investigation',
      respondentName: respondent || 'Under Investigation',
      location: location || 'Barangay Bustrac',
      incidentDate: incidentDate || new Date().toISOString().split('T')[0],
      details: details.trim(),
      narrative: details.trim(),
      attachments: attachments || [],
      status: 'Pending',
      history: [],
      contact: currentUser?.contact || '',
      purok: currentUser?.purok || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      residentId: safeResidentId,
      synced: false,
      isSynced: false,
    };

    await safePut(payload);

    try {
      const auditPayload = buildAuditLogPayload({
        action: 'CREATE_BLOTTER_REPORT',
        module: 'BLOTTER',
        recordId: refNumber,
        actor: { username: safeUsername || safeResidentId || 'resident', role: 'resident', fullName: safeComplainant || 'Resident' },
        details: `Filed incident report (${subject.trim()}) with ${(attachments || []).length} attachment(s)`,
      });
      await createAuditLog(auditPayload);
    } catch (auditErr) {
      console.error('Audit log creation failed:', auditErr);
    }

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try { await forceSyncToRemote(); } catch (syncErr) { console.warn('Force sync warning:', syncErr); }
    }

    Swal.fire('Success', 'Blotter report filed successfully!', 'success');

    return { success: true, data: payload };
  },
  []
);

  // 5h. handleCancelRequest � deps: myRequests, loadData 
  const handleCancelRequest = useCallback(
    async (certId) => {
      if (!db) { 
        Swal.fire('Error', 'Database unavailable.', 'error'); 
        return; 
      }
      const target = myRequests.find((r) => r._id === certId);
      if (!target) { 
        Swal.fire('Error', 'Certificate request not found.', 'error'); 
        return; 
      }
      const refNum = target.refNumber || certId;
      
      const confirmResult = await Swal.fire({
        title: 'Cancel Request?',
        text: `Reference: ${refNum}\nThis action cannot be undone.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, Cancel it',
        cancelButtonText: 'No, keep it'
      });
      
      if (!confirmResult.isConfirmed) return;
      
      try {
        const latest = await db.get(certId);
        await safePut({  ...latest, status: 'Cancelled', cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        Swal.fire('Cancelled', `Request ${refNum} has been cancelled successfully.`, 'success');
        await loadData();
      } catch (err) {
        console.error('Cancel error', err);
        Swal.fire('Error', 'Unable to cancel request. Please try again.', 'error');
      }
    },
    [myRequests, loadData]
  );

  // 5i. handleOpenEdit � deps: []
  const handleOpenEdit = useCallback((report) => {
    const editableStatuses = ['pending', 'needs revision', 'returned', 'open'];
    const currentStatus = (report.status || '').toLowerCase();
    if (!editableStatuses.includes(currentStatus)) {
      blurActiveElement();
      Swal.fire('Action Denied', `Editing is locked because this report is under status: "${report.status}".`, 'warning');
      return;
    }
    const rawLoc = report.location || report.purok || '';
    const zoneMatch = rawLoc.match(/(Zone\s*[1-5]|Purok\s*[1-5])/i);
    const detectedZone = zoneMatch ? zoneMatch[0] : '';
    const detectedStreet = rawLoc.replace(zoneMatch ? zoneMatch[0] : '', '').replace(/^[ ,-]+|[ ,-]+$/g, '');
    setEditingReport(report);
    setEditForm({
      subject: report.subject || report.incidentType || '',
      details: report.details || report.narrative || '',
      incidentDate: report.incidentDate || '',
      zone: detectedZone || 'Zone 1',
      street: detectedStreet || '',
      respondent: report.respondent || report.respondentName || '',
    });
  }, []);

  // Closes the edit modal without any confirmation. Used after a successful
  // save (the form is intentionally left "modified" vs the stale editingReport,
  // so reusing closeEditModal would wrongly prompt "Discard changes?").
  const resetEditModal = useCallback(() => {
    setEditingReport(null);
    setEditForm({ subject: '', details: '', incidentDate: '', zone: 'Zone 1', street: '', respondent: '' });
  }, []);
 
  const closeEditModal = useCallback(() => {
  const rawLoc = editingReport?.location || editingReport?.purok || '';
  const zoneMatch = rawLoc.match(/(Zone\s*[1-5]|Purok\s*[1-5])/i);
  const detectedZone = zoneMatch ? zoneMatch[0] : '';
  const detectedStreet = rawLoc.replace(zoneMatch ? zoneMatch[0] : '', '').replace(/^[ ,-]+|[ ,-]+$/g, '');

  const isModified =
    editForm.subject.trim() !== (editingReport?.subject || editingReport?.incidentType || '').trim() ||
    editForm.details.trim() !== (editingReport?.details || editingReport?.narrative || '').trim() ||
    editForm.respondent.trim() !== (editingReport?.respondent || editingReport?.respondentName || '').trim() ||
    editForm.incidentDate !== (editingReport?.incidentDate || '') ||
    editForm.zone !== (detectedZone || 'Zone 1') ||
    editForm.street.trim() !== detectedStreet.trim();

  if (isModified) {
    blurActiveElement();
    Swal.fire({
      title: 'Discard changes?',
      text: 'You have unsaved changes in this report.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, discard',
      cancelButtonText: 'Keep editing'
    }).then((result) => {
      if (result.isConfirmed) {
        resetEditModal();
      }
    });
  } else {
    resetEditModal();
  }
}, [editForm, editingReport, resetEditModal]);

  // 5j. handleSaveEdit � deps: editingReport, editForm, loadData ?
  const handleSaveEdit = useCallback(
  async (e) => {
    e.preventDefault();
     if (isSavingEdit) return; 
    if (!db || !editingReport) return;

    if (!editForm.subject.trim() || !editForm.details.trim()) {
      blurActiveElement();
      Swal.fire('Missing Fields', 'Please fill in all required fields (Subject and Details).', 'warning');
      return;
    }

    setIsSavingEdit(true); 

    try {
      const existingDoc = await db.get(editingReport._id);
      const formattedLocation = editForm.street.trim()
        ? `${editForm.street.trim()}, ${editForm.zone.trim()}`
        : editForm.zone.trim();

      const updatedDoc = {
        ...existingDoc,
        subject: editForm.subject.trim(),
        incidentType: editForm.subject.trim(),
        details: editForm.details.trim(),
        narrative: editForm.details.trim(),
        incidentDate: editForm.incidentDate,
        location: formattedLocation,
        purok: editForm.zone.trim(),
        respondent: editForm.respondent.trim() || 'Under Investigation',
        respondentName: editForm.respondent.trim() || 'Under Investigation',
        updatedAt: new Date().toISOString(),
        history: [
          ...(existingDoc.history || []),
          {
            action: 'UPDATE_REPORT',
            updatedBy: loggedInUser?.fullName || 'Resident',
            timestamp: new Date().toISOString(),
            details: `Resident updated report details (Location: ${formattedLocation}).`,
          },
        ],
      };

      await safePut(updatedDoc); 

      // Close the modal first (unmounts the focused Save button and clears the
      // stale edit state) so the success alert is not blocked behind the modal
      // and no aria-hidden focus violation is triggered.
      resetEditModal();
      blurActiveElement();
      Swal.fire('Success', 'Report updated successfully! Changes will sync to the Barangay Admin.', 'success');
      await loadData();
    } catch (err) {
      console.error('Error updating report:', err);
      blurActiveElement();
      Swal.fire('Error', 'Failed to update the report. Please try again.', 'error');
    } finally {
      setIsSavingEdit(false); // ? ADD THIS
    }
    }, [editForm, editingReport, db, loggedInUser, loadData, resetEditModal, isSavingEdit]);

  // 5k. handleSaveProfileEdit � deps: db, residentProfile, loggedInUser
  const handleSaveProfileEdit = useCallback(
    async (editableProfile) => {
      if (!db) throw new Error('Local database is not connected.');

      const targetDocId = residentProfile?.rawDoc?._id || residentProfile?._id || loggedInUserRef.current?._id || loggedInUserRef.current?.residentId;
      let existingDoc = null;
      
      if (targetDocId) {
        try { existingDoc = await db.get(targetDocId); } catch { /* ignore */ }
      }

      if (!existingDoc) {
        const res = await db.allDocs({ include_docs: true });
        const currentId = String(loggedInUserRef.current?.residentId || loggedInUserRef.current?.id || '').toLowerCase().trim();
        const currentName = String(loggedInUserRef.current?.fullName || '').toLowerCase().trim();

        existingDoc = res.rows.map((row) => row.doc).find((doc) => {
          if (!doc) return false;
          const isRes = doc.docType === 'resident' || doc.type === 'resident' || doc.residentId;
          if (!isRes) return false;
          const docId = String(doc.residentId || doc._id || '').toLowerCase().trim();
          const docName = String(doc.fullName || `${doc.firstName || ''} ${doc.lastName || ''}`).toLowerCase().trim();
          return (currentId && docId === currentId) || (currentName && docName.includes(currentName));
        });
      }

      const firstName = editableProfile.firstName?.trim() || existingDoc?.firstName || '';
      const lastName = editableProfile.lastName?.trim() || existingDoc?.lastName || '';
      const fullName = firstName && lastName ? `${firstName} ${lastName}` : existingDoc?.fullName || loggedInUserRef.current?.fullName || 'Resident';

      const updatedDoc = existingDoc ? {
          ...existingDoc,
          firstName, lastName, fullName,
          contact: editableProfile.contact.trim(),
          phone: editableProfile.contact.trim(),
          email: editableProfile.email.trim(),
          purok: editableProfile.purok || existingDoc.purok,
          zone: editableProfile.purok || existingDoc.zone,
          address: editableProfile.address.trim(),
          birthdate: editableProfile.birthdate || existingDoc.birthdate || existingDoc.dateOfBirth || '',
          dateOfBirth: editableProfile.birthdate || existingDoc.birthdate || existingDoc.dateOfBirth || '',
          age: calculateAge(editableProfile.birthdate || existingDoc.birthdate || existingDoc.dateOfBirth) || existingDoc.age || 0,
          gender: editableProfile.gender || existingDoc.gender || '',
          civilStatus: editableProfile.civilStatus || existingDoc.civilStatus || existingDoc.civil_status || '',
          emergencyContactPerson: editableProfile.emergencyContactName.trim(),
          emergencyContactNo: editableProfile.emergencyContactNumber.trim(),
          updatedAt: new Date().toISOString(),
        } : {
          _id: targetDocId || `RES-${Date.now()}`,
          docType: 'resident',
          type: 'resident',
          residentId: loggedInUserRef.current?.residentId || 'RES-0002',
          firstName, lastName, fullName,
          contact: editableProfile.contact.trim(),
          email: editableProfile.email.trim(),
          purok: editableProfile.purok || 'Purok 1',
          address: editableProfile.address.trim(),
          birthdate: editableProfile.birthdate || '',
          dateOfBirth: editableProfile.birthdate || '',
          age: calculateAge(editableProfile.birthdate) || 0,
          gender: editableProfile.gender || '',
          civilStatus: editableProfile.civilStatus || '',
          emergencyContactPerson: editableProfile.emergencyContactName.trim(),
          emergencyContactNo: editableProfile.emergencyContactNumber.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

      const result = await safePut(updatedDoc);

      try {
        const auditPayload = buildAuditLogPayload({
          action: 'UPDATE_PROFILE',
          module: 'RESIDENTS',
          recordId: updatedDoc._id || updatedDoc.residentId || 'RES-PROFILE',
          actor: { username: loggedInUserRef.current?.username || loggedInUserRef.current?.residentId || 'resident', role: 'resident', fullName: updatedDoc.fullName || 'Resident' },
          details: `Updated profile for ${updatedDoc.fullName} (Contact: ${editableProfile.contact.trim()}, Birthdate: ${updatedDoc.birthdate || 'N/A'})`,
        });
        await createAuditLog(auditPayload);
      } catch (auditErr) {
        console.warn('Audit log entry failed for profile edit:', auditErr);
      }

      setResidentProfile((prev) => ({
        ...prev,
        firstName: updatedDoc.firstName,
        lastName: updatedDoc.lastName,
        fullName: updatedDoc.fullName,
        contact: updatedDoc.contact,
        email: updatedDoc.email,
        purok: updatedDoc.purok,
        address: updatedDoc.address,
        birthdate: updatedDoc.birthdate,
        age: updatedDoc.age,
        gender: updatedDoc.gender,
        civilStatus: updatedDoc.civilStatus,
        emergencyContactPerson: updatedDoc.emergencyContactPerson,
        emergencyContactNo: updatedDoc.emergencyContactNo,
        rawDoc: { ...updatedDoc, _rev: result.rev },
      }));

      const prevUser = loggedInUserRef.current || loggedInUser || {};
      const mergedUser = {
        ...prevUser,
        firstName: updatedDoc.firstName,
        lastName: updatedDoc.lastName,
        fullName: updatedDoc.fullName,
        contact: updatedDoc.contact,
        email: updatedDoc.email,
        purok: updatedDoc.purok,
        address: updatedDoc.address,
        birthdate: updatedDoc.birthdate,
        age: updatedDoc.age,
        gender: updatedDoc.gender,
        civilStatus: updatedDoc.civilStatus,
        emergencyContactName: updatedDoc.emergencyContactPerson || prevUser?.emergencyContactName || '',
        emergencyContactNumber: updatedDoc.emergencyContactNo || prevUser?.emergencyContactNumber || '',
      };

      const updatedUser = updateStoredUser(mergedUser);
      setLoggedInUser(updatedUser);
      Swal.fire('Success', 'Your information has been successfully updated!', 'success');
    },
    [db, residentProfile, loggedInUser]
  );

  /* -----------------------------------------------------------
     SECTION 6: DERIVED VALUES (useMemo � after callbacks OK)
     ----------------------------------------------------------- */
  const pendingRequestCount = useMemo(() => {
    return myRequests.filter((r) => {
      const status = (r.status || '').toLowerCase();
      const step = Number(r.step || 1);
      if (status === 'cancelled') return false;
      if (['issued', 'released'].includes(status)) return false;
      return step < 5;
    }).length;
  }, [myRequests]);

  /* -----------------------------------------------------------
     SECTION 7: useEffect NA TUMATAWAG SA CALLBACKS
     ----------------------------------------------------------- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bustrac_notified_cert_ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.forEach((id) => notifiedCertIds.current.add(id));
      }
    } catch (e) {
      console.warn('Failed to load notified cert IDs', e);
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.setItem('bustrac_notified_cert_ids', JSON.stringify(Array.from(notifiedCertIds.current).slice(-50)));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Offline-first notifications: fetch local notification entries for this resident.
  const refreshNotifications = useCallback(async () => {
    const user = loggedInUserRef.current || {};
    const userId = user.residentId || user.id || user._id || null;
    const items = await fetchNotifications('resident', userId);
    setNotifItems(items);
  }, []);

  const toggleNotifPanel = useCallback(() => {
    setNotifPanelOpen((open) => {
      const next = !open;
      if (next) {
        const user = loggedInUserRef.current || {};
        const userId = user.residentId || user.id || user._id || null;
        markAllReadForUser('resident', userId).then(() => {
          setNotifItems((prev) => prev.map((n) => ({ ...n, read: true })));
        });
      }
      return next;
    });
  }, []);

  const notifUnread = useMemo(() => getUnreadCount(notifItems), [notifItems]);

  // 7a. Load data kapag ready na ang user
  useEffect(() => {
    if (loggedInUserRef.current?.fullName) {
      loadData();
    }
  }, [loadData]);

  // 7a-2. Initial load ng notifications (offline-first).
  useEffect(() => {
    if (loggedInUserRef.current?.fullName) {
      refreshNotifications();
    }
  }, [refreshNotifications]);

  // 7a-3. Gumawa ng notification kapag nagbago ang status ng cert request.
  useEffect(() => {
    const userId = (() => {
      const u = loggedInUserRef.current || {};
      return u.residentId || u.id || u._id || null;
    })();
    const map = {};
    myRequests.forEach((r) => {
      map[r._id || r.id] = String(r.status || '').toLowerCase();
    });
    if (prevCertStatusRef.current === null) {
      prevCertStatusRef.current = map;
      return;
    }
    const prev = prevCertStatusRef.current;
    let created = false;
    myRequests.forEach((r) => {
      const id = r._id || r.id;
      const status = String(r.status || '').toLowerCase();
      const before = prev[id];
      if (before !== undefined && before !== status) {
        createNotification({
          for: 'resident',
          userId,
          category: 'cert_request',
          title: 'Certificate request updated',
          body: `${r.certType || r.type || 'Certificate'} is now "${r.status || 'updated'}".`,
          link: 's-certificates',
          refId: id,
        });
        created = true;
      }
    });
    prevCertStatusRef.current = map;
    if (created) refreshNotifications();
  }, [myRequests, refreshNotifications]);

  // 7a-4. Gumawa ng notification para sa mga bagong announcement.
  useEffect(() => {
    const userId = (() => {
      const u = loggedInUserRef.current || {};
      return u.residentId || u.id || u._id || null;
    })();
    const ids = new Set(announcements.map((a) => a._id || a.id));
    if (prevAnnouncementIdsRef.current === null) {
      if (ids.size > 0) prevAnnouncementIdsRef.current = ids;
      return;
    }
    const prev = prevAnnouncementIdsRef.current;
    let created = false;
    announcements.forEach((a) => {
      const id = a._id || a.id;
      if (!prev.has(id)) {
        createNotification({
          for: 'resident',
          userId,
          category: 'announcement',
          title: a.title || 'New announcement',
          body: a.content || a.body || a.message || '',
          link: 's-announcements',
          refId: id,
        });
        created = true;
      }
    });
    prevAnnouncementIdsRef.current = ids;
    if (created) refreshNotifications();
  }, [announcements, refreshNotifications]);
  
  // ? 7d. PouchDB LIVE LISTENER
useEffect(() => {
  if (!db) return;
  let isMounted = true;

  const changes = db.changes({
    since: 'now',
    live: true,
    include_docs: true,
  })
    .on('change', (change) => {
      if (!isMounted || !change.doc) return;
      const doc = change.doc;

      const isRelevant = [
        'certificate_request',
        'blotter_record',
        'blotter',
        'announcement',
        'aid_distribution',
        'feedback_report',
      ].includes(doc.type || doc.docType);

      if (isRelevant) {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(() => {
          if (isMounted) loadData();
        }, 800);
      }
    })
    .on('error', (err) => console.error('PouchDB changes error:', err));

  return () => {
    isMounted = false;
    changes.cancel();
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
  };
}, [loadData]);

 // Close edit modal on Escape key
useEffect(() => {
  const handleEsc = (e) => {
    if (e.key === 'Escape' && editingReport) {
      closeEditModal();
    }
  };
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, [editingReport, closeEditModal]);

// Focus management for the edit modal: move focus into the dialog when it
// opens and restore it to the opener when it closes.
useEffect(() => {
  if (!editingReport) return undefined;
  const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;
  const focusTimer = setTimeout(() => {
    if (editModalRef.current) editModalRef.current.focus();
  }, 0);
  return () => {
    clearTimeout(focusTimer);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
  };
}, [editingReport]);

  // 7b. Tab routing mula sa navigate state
  useEffect(() => {
    if (location.state?.activeTab) {
      const tabMap = {
        announcements: 's-announcements',
        tracking: 's-certificates',
        feedback: 's-feedback',
        hotlines: 's-home',
      };
      const matched = tabMap[location.state.activeTab];
      if (matched) setActiveScreen(matched);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // 7c. SSE Notification listener
  useEffect(() => {
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    if (import.meta.env.DEV) console.log(`?? Attempting SSE connection to: ${backendUrl}/api/notifications`);

    const eventSource = new EventSource(`${backendUrl}/api/notifications`);
    
    eventSource.onopen = () => {
      if (import.meta.env.DEV) console.log(' SSE Connection Active');
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'AID_UPLOADED' || data.type === 'BLOTTER_UPDATE' || data.type === 'ANNOUNCEMENT') {
          if (Notification.permission === 'granted') {
            let notifTitle = 'Bustrac Hub Update';
            let notifBody = data.message || 'May bagong update ang Barangay Hall.';
            let notifIcon = '/logo.png';

            if (data.type === 'AID_UPLOADED') {
              notifTitle = '?? Bagong Aid Distribution';
              notifBody = 'May bagong relief goods na na-upload at available na.';
            } else if (data.type === 'BLOTTER_UPDATE') {
              notifTitle = '?? Blotter Case Update';
              notifBody = data.message || 'May update ang iyong blotter case status.';
            }

            new Notification(notifTitle, { body: notifBody, icon: notifIcon });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };
    
    eventSource.onerror = (err) => {
      if (import.meta.env.DEV) console.warn('?? SSE Connection lost. Reconnecting...', err);
    };
    
    return () => {
      if (import.meta.env.DEV) console.log('?? Closing SSE connection (component unmounted)');
      eventSource.close();
    };
  }, [loadData]);

  /* -----------------------------------------------------------
     SECTION 8: Regular functions (hindi hooks) at constants
     ----------------------------------------------------------- */
  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const updateCertField = (field) => (e) => {
    setCertForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Primary items stay in the bottom bar (max 4 + "More"); everything else
  // moves into the "More" drawer so labels never crowd/overlap on mobile.
  const primaryNavItems = [
    { id: 's-home', label: 'Home', icon: <FaHome /> },
    { id: 's-certificates', label: 'Certificates', icon: <FaFileAlt /> },
    { id: 's-bdrrmc', label: 'BDRRMC', icon: <FaExclamationTriangle /> },
    { id: 's-profile', label: 'Profile', icon: <FaUser /> },
  ];

  const moreNavItems = [
    { id: 's-announcements', label: 'News', icon: <FaBullhorn /> },
    { id: 's-feedback', label: 'Feedback', icon: <FaCommentDots /> },
    { id: 's-blotter', label: 'Blotter', icon: <FaBalanceScale /> },
    { id: 's-assistance', label: 'Aid', icon: <FaHandHoldingHeart /> },
    { id: 's-events', label: 'Events', icon: <FaCalendarAlt /> },
    { id: 's-health', label: 'Health', icon: <FaHeartbeat /> },
  ];

  const moreActive = moreNavItems.some((item) => item.id === activeScreen);

  /* -- Render -- */
  return (
    <div className="resident-root-container">
      <div id="app">
        {/* Top Header */}
        <div className="resident-header" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="resident-header__brand" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 auto' }}>
            <img src={logo} alt="Barangay Logo" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'contain', flexShrink: 0 }} />
            <span className="resident-header__title" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Bustrac Hub</span>
          </div>
          <div className="resident-header__actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            {/* Syncing is fully automatic for residents � no manual retry
                control. SyncStatusIndicator only reports the current state. */}
            <SyncStatusIndicator syncState={syncState} pendingCount={pendingCount} lastSynced={lastSync} detail={syncDetail} />
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={toggleNotifPanel}
                style={{ position: 'relative', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s ease' }}
                aria-label={`Notifications${notifUnread > 0 ? ` (${notifUnread} unread)` : ''}`}
                aria-expanded={notifPanelOpen}
              >
                <FaBell size={16} />
                {notifUnread > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, background: 'var(--red, #ef4444)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: '2px solid var(--surface)' }}>
                    {notifUnread > 9 ? '9+' : notifUnread}
                  </span>
                )}
              </button>
              {notifPanelOpen && (
                <div className="resident-notif-panel" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: 420, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.18)', zIndex: 300, padding: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Notifications</span>
                    <button onClick={toggleNotifPanel} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer' }} aria-label="Close notifications">&#x2715;</button>
                  </div>
                  {notifItems.length === 0 ? (
                    <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No notifications yet.</div>
                  ) : (
                    notifItems.map((n) => (
                      <button
                        key={n._id}
                        onClick={() => { if (n.link) goToTab(n.link); setNotifPanelOpen(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 8px', border: 'none', borderRadius: 8, background: n.read ? 'transparent' : 'var(--primary-light, rgba(59,130,246,0.08))', cursor: 'pointer' }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{n.title}</div>
                        {n.body ? <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{n.body}</div> : null}
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, opacity: 0.8 }}>{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s ease' }}
              aria-label="Toggle Light/Dark Theme"
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="content">
          {sseNotification && (
            <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--primary, #3b82f6)', color: 'white', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', animation: 'resident-fadeUp 0.3s ease-out', border: '1px solid rgba(255,255,255,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>??</span>
                <span style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.4 }}>{sseNotification}</span>
              </div>
              <button onClick={() => setSseNotification(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }} aria-label="Close notification">?</button>
            </div>
          )}

          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: 8, animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeLinecap="round" />
              </svg>
              Loading your data...
            </div>
          )}

          {loadError && (
            <div style={{ padding: '16px', margin: '16px', borderRadius: 12, background: 'var(--red-bg, rgba(239,68,68,0.1))', border: '1px solid var(--red-border, rgba(239,68,68,0.3))', color: 'var(--red, #ef4444)', fontSize: 13 }}>
              <strong>Error:</strong> {loadError}
              <button onClick={loadData} className="btn btn-sm" style={{ marginLeft: 12 }}>Retry</button>
            </div>
          )}

          {!isLoading && !loadError && activeScreen === 's-home' && (
            <ResidentHome isOffline={isOffline} greetingText={greetingText} loggedInUser={loggedInUser} myRequests={myRequests} pendingRequestCount={pendingRequestCount} announcements={announcements} myFeedbacks={myFeedbacks} myBlotters={myBlotters} myAssistance={myAssistance} goToTab={goToTab} />
          )}

          {!isLoading && !loadError && activeScreen === 's-certificates' && (
            <ResidentCertificates loggedInUser={loggedInUser} myRequests={myRequests} showCertForm={showCertForm} setShowCertForm={setShowCertForm} certForm={certForm} updateCertField={updateCertField} submitCert={submitCert} certSuccess={certSuccess} setCertSuccess={setCertSuccess} filterTab={filterTab} setFilterTab={setFilterTab} handleCancelRequest={handleCancelRequest} onRefresh={loadData} />
          )}

          {!isLoading && !loadError && activeScreen === 's-announcements' && (
            <ResidentAnnouncements announcements={announcements} />
          )}

          {!isLoading && !loadError && activeScreen === 's-feedback' && (
            <ResidentFeedback myFeedbacks={myFeedbacks} submitFeedback={submitFeedback} loggedInUser={loggedInUser} />
          )}

          {!isLoading && !loadError && activeScreen === 's-blotter' && (
            <ResidentBlotter myBlotters={myBlotters} loggedInUser={loggedInUser} submitBlotter={submitBlotter} handleOpenEdit={handleOpenEdit} />
          )}

          {!isLoading && !loadError && activeScreen === 's-assistance' && (
            <ResidentAssistance myAssistance={myAssistance} />
          )}
          
          {!isLoading && !loadError && activeScreen === 's-events' && (
            <EventRegistrationScreen
              db={db}
              loggedInUser={loggedInUser}
              showToast={showToast}
              createAuditLog={createAuditLog}
            />
          )}
          {!isLoading && !loadError && activeScreen === 's-profile' && (
            <ResidentProfile residentProfile={residentProfile} loggedInUser={loggedInUser} isOffline={isOffline} lastSync={lastSync} handleLogout={handleLogout} handleSaveProfileEdit={handleSaveProfileEdit} />
          )}
          {!isLoading && !loadError && activeScreen === 's-health' && (
            <ResidentHealthView loggedInUser={loggedInUser} />
          )}
          {!isLoading && !loadError && activeScreen === 's-bdrrmc' && (
            <ResidentBDRRMC loggedInUser={loggedInUser} />
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="bottom-nav">
          {primaryNavItems.map((item) => {
            const active = activeScreen === item.id;
            return (
              <button key={item.id} className={`bnav-item${active ? ' active' : ''}`} onClick={() => { setMoreOpen(false); goToTab(item.id); }} aria-current={active ? 'page' : undefined}>
                <span className="icon">{item.icon}</span>
                <span>{item.label}</span>
                <span className={`nav-selection-dot${active ? ' active' : ''}`} />
              </button>
            );
          })}
          <button
            type="button"
            className={`bnav-item${moreActive ? ' active' : ''}`}
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={moreActive ? 'page' : undefined}
          >
            <span className="icon"><FaEllipsisH /></span>
            <span>More</span>
            <span className={`nav-selection-dot${moreActive ? ' active' : ''}`} />
          </button>
        </div>

        {/* "More" slide-up drawer for secondary tabs */}
        {moreOpen && (
          <div
            role="presentation"
            onClick={() => setMoreOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="More options"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Escape') setMoreOpen(false); }}
              style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid var(--border)', borderBottom: 'none', padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -8px 32px rgba(0,0,0,0.3)', animation: 'resident-slideUp 0.22s ease-out' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.3px' }}>More</span>
                <button onClick={() => setMoreOpen(false)} aria-label="Close menu" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 4 }}>&#x2715;</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {moreNavItems.map((item) => {
                  const active = activeScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { goToTab(item.id); setMoreOpen(false); }}
                      aria-current={active ? 'page' : undefined}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 6px', borderRadius: 12, border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary-light)' : 'var(--surface2)', color: active ? 'var(--primary)' : 'var(--text)', fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease' }}
                    >
                      <span style={{ fontSize: 20, display: 'flex' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="resident-footer" style={{ marginTop: 28, padding: '24px 16px 12px', textAlign: 'center', borderTop: '1px solid var(--border)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.4px' }}>Bustrac Hub</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'var(--primary-light)', color: 'var(--primary, #3b82f6)', border: '1px solid var(--primary-light)' }}>v1.0</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.75, lineHeight: 1.4 }}>
            � {new Date().getFullYear()} Barangay Bustrac, Nabua. All rights reserved.
          </div>
        </footer>
      </div>

      {/* Blotter Edit Modal � portaled to document.body so SweetAlert2's
          aria-hidden on #root never hides an element that still holds focus.
          zIndex (1000) is kept below SweetAlert2's popup (1060) so confirmation
          dialogs (e.g. the "Discard changes?" prompt) render above the modal. */}
      {editingReport && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '48px 16px 16px', overflowY: 'auto' }} onClick={closeEditModal} role="presentation">
          <div ref={editModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Edit blotter report ${editingReport.refNumber || editingReport._id}`} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', padding: 20, marginBottom: 48, outline: 'none' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
              <span>Edit Report � {editingReport.refNumber || editingReport._id}</span>
              <button onClick={closeEditModal}  style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>?</button>
            </div>

            <form onSubmit={handleSaveEdit} noValidate>
              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl">Incident Subject *</label>
                <input className="fc" required value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div className="fg" style={{ margin: 0 }}>
                  <label className="fl">Incident Date *</label>
                  <input type="date" className="fc" required max={new Date().toISOString().split('T')[0]} value={editForm.incidentDate} onChange={(e) => setEditForm({ ...editForm, incidentDate: e.target.value })} />
                </div>
                <div className="fg" style={{ margin: 0 }}>
                  <label className="fl">Zone / Purok *</label>
                  <select className="fc" required value={editForm.zone || ''} onChange={(e) => setEditForm({ ...editForm, zone: e.target.value })}>
                    <option value="">Select Zone</option>
                    <option value="Zone 1">Zone 1</option>
                    <option value="Zone 2">Zone 2</option>
                    <option value="Zone 3">Zone 3</option>
                    <option value="Zone 4">Zone 4</option>
                    <option value="Zone 5">Zone 5</option>
                  </select>
                </div>
              </div>

              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl">Street / Landmark / Specific Location</label>
                <input className="fc" placeholder="e.g. Near Chapel, Main Street" value={editForm.street || ''} onChange={(e) => setEditForm({ ...editForm, street: e.target.value })} />
              </div>

              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl">Respondent (if known)</label>
                <input className="fc" value={editForm.respondent} onChange={(e) => setEditForm({ ...editForm, respondent: e.target.value })} />
              </div>

              <div className="fg" style={{ marginBottom: 16 }}>
                <label className="fl">Incident Details *</label>
                <textarea className="fc" rows="4" required maxLength={500} value={editForm.details} onChange={(e) => setEditForm({ ...editForm, details: e.target.value })} style={{ resize: 'vertical' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: (editForm.details || '').length >= 450 ? 'var(--red, #ef4444)' : 'var(--muted)' }}>
                    {(editForm.details || '').length}/500
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
  type="submit"
  className="btn btn-primary"
  disabled={isSavingEdit}
  style={{ opacity: isSavingEdit ? 0.7 : 1, cursor: isSavingEdit ? 'not-allowed' : 'pointer' }}
>
  {isSavingEdit ? 'Saving...' : 'Save Changes'}
</button>
                <button type="button" className="btn btn-ghost" onClick={closeEditModal}>Cancel</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
