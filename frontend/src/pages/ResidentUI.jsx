import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { localDb as db, forceSyncToRemote, createAuditLog } from '../services/db';
import logo from '../assets/logo.png';
import './ResidentUI.css';
import { FaHome, FaFileAlt, FaBullhorn, FaCommentDots, FaUser, FaBalanceScale, FaHandHoldingHeart } from "react-icons/fa";

import {
  normalizeCertificateDoc,
  normalizeBlotterDoc,
  normalizeFeedbackDoc,
  buildAuditLogPayload,
  calculateAge,
} from '../utils/residentUtils';

import ResidentHome from '../components/Resident/ResidentHome';
import ResidentCertificates from '../components/Resident/ResidentCertificates';
import ResidentAnnouncements from '../components/Resident/ResidentAnnouncements';
import ResidentFeedback from '../components/Resident/ResidentFeedback';
import ResidentBlotter from '../components/Resident/ResidentBlotter';
import ResidentAssistance from '../components/Resident/ResidentAssistance';
import ResidentProfile from '../components/Resident/ResidentProfile';

const CERT_FORM_INITIAL = { certType: '', certPurpose: '' };

export default function ResidentUI() {
  const navigate = useNavigate();
  const location = useLocation();

  /* ── Theme ── */
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  /* ── User State ── */
  const [loggedInUser, setLoggedInUser] = useState(() => {
    const rawUser = sessionStorage.getItem('bustrac_user') || localStorage.getItem('bustrac_user');
    if (!rawUser) return { fullName: 'Resident', initials: 'RS' };
    try {
      const parsed = typeof rawUser === 'string' ? JSON.parse(rawUser) : rawUser;
      const name = parsed.fullName || parsed.user || parsed.name || 'Resident';
      const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
      return { fullName: name, initials, ...parsed };
    } catch (e) {
      const name = typeof rawUser === 'string' ? rawUser : 'Resident';
      return { fullName: name, initials: name.slice(0, 2).toUpperCase() };
    }
  });

  const greetingText = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  /* ── Navigation ── */
  const [activeScreen, setActiveScreen] = useState('s-home');
  const goToTab = useCallback((id) => {
    setActiveScreen(id);
    window.scrollTo(0, 0);
  }, []);

  /* ── Offline State ── */
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
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

  /* ── Data States ── */
  const [residentProfile, setResidentProfile] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [myBlotters, setMyBlotters] = useState([]);
  const [myAssistance, setMyAssistance] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  /* ── Certificate States ── */
  const [showCertForm, setShowCertForm] = useState(false);
  const [certForm, setCertForm] = useState(CERT_FORM_INITIAL);
  const [certSuccess, setCertSuccess] = useState(null);
  const [filterTab, setFilterTab] = useState('all');

  /* ── Blotter Edit States ── */
  const [editingReport, setEditingReport] = useState(null);
  const [editForm, setEditForm] = useState({
    subject: '', details: '', incidentDate: '', zone: 'Zone 1', street: '', respondent: '',
  });

  /* ── Tab routing ── */
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

  /* ── FIX 1: Stable user matching using refs to prevent circular deps ── */
  const loggedInUserRef = useRef(loggedInUser);
  useEffect(() => {
    loggedInUserRef.current = loggedInUser;
  }, [loggedInUser]);

  const checkUserMatch = useCallback((doc) => {
    const user = loggedInUserRef.current;
    if (!doc || !user) return false;

    const userFullName = String(user.fullName || '').toLowerCase().trim();
    const userName = String(user.username || user.email || '').toLowerCase().trim();
    const userId = String(user._id || user.residentId || user.id || '').toLowerCase().trim();

    const docUserId = String(doc.userId || doc.residentId || doc.submittedBy || '').toLowerCase().trim();
    if (userId && docUserId && (docUserId === userId || userId.includes(docUserId) || docUserId.includes(userId))) return true;

    const docUsername = String(doc.username || doc.user || '').toLowerCase().trim();
    if (userName && docUsername && docUsername === userName) return true;

    const comp = typeof doc.complainant === 'object' ? (doc.complainant?.name || '') : (doc.complainant || doc.complainantName || '');
    const resp = typeof doc.respondent === 'object' ? (doc.respondent?.name || '') : (doc.respondent || doc.respondentName || '');
    const compLower = String(comp).toLowerCase().trim();
    const respLower = String(resp).toLowerCase().trim();

    const matchesComplainant = Boolean(
      (userFullName && compLower.includes(userFullName)) ||
      (userFullName && userFullName.includes(compLower) && compLower.length > 2) ||
      (userName && compLower.includes(userName))
    );
    const matchesRespondent = Boolean(
      (userFullName && respLower.includes(userFullName)) ||
      (userFullName && userFullName.includes(respLower) && respLower.length > 2) ||
      (userName && respLower.includes(userName))
    );
    return matchesComplainant || matchesRespondent;
  }, []);

  /* ── FIX 1: loadData with stable deps (no loggedInUser in deps) ── */
  const loadData = useCallback(async () => {
    if (!db) {
      setIsLoading(false);
      setLoadError('Database not available');
      return;
    }
    const user = loggedInUserRef.current;
    if (!user || !user.fullName) {
      setIsLoading(false);
      setLoadError('User not logged in');
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await db.allDocs({ include_docs: true });
      const docs = res.rows.map((r) => r.doc).filter(Boolean);
      const byType = (type) => docs.filter((d) => d.type === type || d.docType === type);
      const sortTs = (a, b) =>
        new Date(b.timestamp || b.updatedAt || b.createdAt || b.dateFiled || 0) -
        new Date(a.timestamp || a.updatedAt || a.createdAt || a.dateFiled || 0);

      const userBlotters = docs
        .filter((doc) => {
          const isBlotterDoc = doc.docType === 'blotter' || doc.type === 'blotter' || doc.type === 'blotter_record' ||
            Boolean(doc.trackingNo || doc.caseNo || doc.caseNum || doc.refNumber);
          return isBlotterDoc && checkUserMatch(doc);
        })
        .map(normalizeBlotterDoc)
        .filter(Boolean)
        .sort(sortTs);
      setMyBlotters(userBlotters);

      const userRequests = docs
        .filter((d) => (d.type === 'certificate_request' || d.type === 'request') && checkUserMatch(d))
        .map(normalizeCertificateDoc)
        .filter(Boolean)
        .sort(sortTs);
      setMyRequests(userRequests);

      setAnnouncements(byType('announcement').sort(sortTs));

      setMyAssistance(
        docs.filter((d) => d.type === 'aid_distribution' && checkUserMatch(d)).sort(sortTs)
      );

      const currentUserId = String(user?.residentId || user?.id || user?._id || '').toLowerCase().trim();
      const currentUsername = String(user?.username || user?.email || '').toLowerCase().trim();
      const userFeedbacks = docs
        .filter((doc) => {
          const isFeedbackDoc = doc.type === 'feedback_report' || doc.type === 'feedback' || doc.docType === 'feedback';
          if (!isFeedbackDoc) return false;
          const docUserId = String(doc.residentId || doc.userId || '').toLowerCase().trim();
          const docUsername = String(doc.username || doc.user || '').toLowerCase().trim();
          const isMatchById = Boolean(currentUserId && docUserId && currentUserId === docUserId);
          const isMatchByUsername = Boolean(currentUsername && docUsername && currentUsername === docUsername);
          return isMatchById || isMatchByUsername || checkUserMatch(doc);
        })
        .map(normalizeFeedbackDoc)
        .filter(Boolean)
        .sort(sortTs);
      setMyFeedbacks(userFeedbacks);

      // FIX 2: Find resident profile and enrich loggedInUser ONCE
      const residentDoc = docs.find((d) =>
        (d.docType === 'resident' || d.type === 'resident' || d.residentId) && checkUserMatch(d)
      );
            if (residentDoc) {
        setResidentProfile({ ...residentDoc, rawDoc: residentDoc });
        setLoggedInUser((prev) => {
          const merged = {
            ...prev,
            firstName: residentDoc.firstName || prev?.firstName || '',
            lastName: residentDoc.lastName || prev?.lastName || '',
            fullName: residentDoc.fullName || `${residentDoc.firstName || ''} ${residentDoc.lastName || ''}`.trim() || prev?.fullName || '',
            birthdate: residentDoc.birthdate || residentDoc.dateOfBirth || prev?.birthdate || '',
            age: residentDoc.age || residentDoc.currentAge || calculateAge(residentDoc.birthdate || residentDoc.dateOfBirth) || prev?.age || 0,
            purok: residentDoc.purok || residentDoc.zone || prev?.purok || '',
            contact: residentDoc.contact || residentDoc.phone || residentDoc.mobile || prev?.contact || '',
            email: residentDoc.email || prev?.email || '',
            residentId: residentDoc.residentId || residentDoc._id || prev?.residentId || '',
            rbiId: residentDoc.rbiId || residentDoc.householdId || prev?.rbiId || '',
            address: residentDoc.address || residentDoc.streetAddress || prev?.address || '',
            gender: residentDoc.gender || prev?.gender || '',
            civilStatus: residentDoc.civilStatus || prev?.civilStatus || '',
            emergencyContactName: residentDoc.emergencyContactPerson || residentDoc.emergencyContactName || prev?.emergencyContactName || '',
            emergencyContactNumber: residentDoc.emergencyContactNo || residentDoc.emergencyContactNumber || prev?.emergencyContactNumber || '',
          };
          try {
            const storageUser = JSON.parse(sessionStorage.getItem('bustrac_user') || localStorage.getItem('bustrac_user') || '{}');
            const updated = { ...storageUser, ...merged };
            sessionStorage.setItem('bustrac_user', JSON.stringify(updated));
            localStorage.setItem('bustrac_user', JSON.stringify(updated));
          } catch (e) { /* ignore */ }
          return merged;
        });
      }

      setLastSync(new Date());
    } catch (e) {
      console.error('Load error in ResidentUI:', e);
      setLoadError(e.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [checkUserMatch]); // FIXED: removed loggedInUser from deps

  /* ── FIX 1: Real-time listener with cleanup ── */
  useEffect(() => {
    if (!db) return;
    let isMounted = true;
    let changes = null;

    const init = async () => {
      if (!isMounted) return;
      await loadData();
      if (!isMounted) return;

      changes = db.changes({ live: true, since: 'now', include_docs: true });
      changes.on('change', () => {
        if (isMounted) loadData();
      });
      changes.on('error', (err) => console.error('Changes listener error:', err));
    };

    init();

    return () => {
      isMounted = false;
      if (changes) {
        try { changes.cancel(); } catch (e) { /* ignore */ }
      }
    };
  }, [loadData]);

  /* ── Handlers ── */
  const handleLogout = useCallback(() => {
    if (window.confirm('Are you sure you want to leave the resident portal?')) {
      sessionStorage.removeItem('bustrac_user');
      localStorage.removeItem('bustrac_user');
      navigate('/');
    }
  }, [navigate]);

  const updateCertField = (field) => (e) => {
    setCertForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const submitCert = useCallback(
  async (e) => {
    e.preventDefault();
    const { certType, certPurpose } = certForm;
    const trimmedPurpose = certPurpose.trim();

    // FIX 2: Use freshest loggedInUser state
    const currentUser = loggedInUserRef.current;
    const fullName = currentUser?.fullName?.trim() || '';
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const birthdate = currentUser?.birthdate || '';
    // FIX 3: `age` must be mutable so it can be derived from birthdate below
    let age = Number(currentUser?.age) || 0;
    const contact = (currentUser?.contact || '').replace(/\D/g, '');
    const purok = String(currentUser?.purok || '').trim();

    if (!firstName || !lastName) { alert('Resident profile name is incomplete.'); return false; }

    // FIX 3: Only birthdate is required — age is derived from it when missing/invalid
    if (!birthdate || Number.isNaN(new Date(birthdate).getTime())) {
      alert('Birthdate is missing or invalid in your profile. Please complete your profile first.');
      return false;
    }
    if (!age) {
      age = calculateAge(birthdate);
    }

    if (!contact || !/^09\d{9}$/.test(contact)) { alert('Please provide a valid 11-digit Philippine contact number.'); return false; }
    if (!purok) { alert('Purok/Area is missing from profile.'); return false; }
    if (!certType) { alert('Please select a certificate type.'); return false; }
    if (!trimmedPurpose) { alert('Please state the purpose of the request.'); return false; }
    if (!db) { alert('Local database connection is unavailable.'); return false; }

    const now = new Date().toISOString();
    const refNumber = 'CERT-' + Date.now().toString().slice(-6);
    const payload = {
      _id: `cert_${Date.now()}`,
      type: 'certificate_request',
      applicantType: 'Resident',
      residentId: currentUser.residentId || currentUser.username || '',
      rbiId: currentUser.rbiId || '',
      residentName: fullName,
      username: currentUser.username || '',
      firstName, lastName, birthdate, age, contact, purok,
      email: (currentUser.email || '').trim(),
      certificateType: certType,
      certType,
      purpose: trimmedPurpose,
      certPurpose: trimmedPurpose,
      status: 'Submitted',
      step: 1,
      refNumber,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.put(payload);
      try {
        const auditPayload = buildAuditLogPayload({
          action: 'CREATE_CERTIFICATE_REQUEST',
          module: 'CERTIFICATES',
          recordId: refNumber,
          actor: {
            username: currentUser.username || currentUser.residentId || 'resident',
            role: 'resident',
            fullName: currentUser.fullName || 'Resident',
          },
          details: `Requested ${certType} for purpose: "${trimmedPurpose}"`,
        });
        await createAuditLog(auditPayload);
      } catch (auditErr) { console.warn('Audit log entry failed:', auditErr); }
      sessionStorage.setItem('lastCertRequest', JSON.stringify(payload));
      setCertSuccess({ firstName, lastName, certType, refNumber });
      setCertForm(CERT_FORM_INITIAL);
      setTimeout(() => setCertSuccess(null), 5000);
      await loadData();
      return true;
    } catch (err) {
      console.error('Cert save error', err);
      alert('Unable to save your request offline right now.');
      return false;
    }
  },
  [certForm, loadData]
);

  const submitFeedback = useCallback(
    async ({ feedbackType, subject, message, residentId, residentName, username }) => {
      if (!db) { alert('Local database is unavailable.'); throw new Error('No db'); }
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
      await db.put(doc);
      try {
        const auditPayload = buildAuditLogPayload({
          action: 'SUBMIT_FEEDBACK',
          module: 'FEEDBACK',
          recordId: refNumber,
          actor: { username, role: 'resident', fullName: residentName },
          details: `Submitted ${feedbackType} feedback: "${subject}"`,
        });
        await createAuditLog(auditPayload);
      } catch (auditErr) { console.warn('Audit log entry failed:', auditErr); }
      setMyFeedbacks((prev) => [normalizeFeedbackDoc(doc), ...(prev || [])]);
    },
    []
  );

  const submitBlotter = useCallback(
    async ({ subject, details, incidentDate, location, respondent, complainant, residentId }) => {
      if (!db) { alert('Local database is unavailable.'); throw new Error('No db'); }
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const refNumber = `BLT-2026-${randomNum}`;
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
        complainant,
        complainantName: complainant,
        respondent: respondent || 'Under Investigation',
        respondentName: respondent || 'Under Investigation',
        location: location || 'Barangay Bustrac',
        incidentDate: incidentDate || new Date().toISOString().split('T')[0],
        details: details.trim(),
        narrative: details.trim(),
        status: 'Pending',
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        residentId,
        synced: false,
        isSynced: false,
      };
      await db.put(payload);
      try {
        const auditPayload = buildAuditLogPayload({
          action: 'CREATE_BLOTTER_REPORT',
          module: 'BLOTTER',
          recordId: refNumber,
          actor: {
            username: residentId || 'resident',
            role: 'resident',
            fullName: complainant || 'Resident',
          },
          details: `Filed incident report (${subject.trim()}) at ${location || 'Brgy. Bustrac'}`,
        });
        await createAuditLog(auditPayload);
      } catch (auditErr) { console.error('Audit log creation failed:', auditErr); }
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try { await forceSyncToRemote(); } catch (syncErr) { console.warn('Force sync warning:', syncErr); }
      }
      await loadData();
    },
    [loadData]
  );

  const handleCancelRequest = useCallback(
    async (certId) => {
      if (!db) { alert('Database unavailable.'); return; }
      const target = myRequests.find((r) => r._id === certId);
      if (!target) { alert('Certificate request not found.'); return; }
      const refNum = target.refNumber || certId;
      if (!window.confirm(`Cancel this request?\n\nReference: ${refNum}\nThis action cannot be undone.`)) return;
      try {
        const latest = await db.get(certId);
        await db.put({ ...latest, status: 'Cancelled', cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        alert(`Request ${refNum} has been cancelled successfully.`);
        await loadData();
      } catch (err) {
        console.error('Cancel error', err);
        alert('Unable to cancel request. Please try again.');
      }
    },
    [myRequests, loadData]
  );

  const handleOpenEdit = useCallback((report) => {
    const editableStatuses = ['pending', 'needs revision', 'returned', 'open'];
    const currentStatus = (report.status || '').toLowerCase();
    if (!editableStatuses.includes(currentStatus)) {
      alert(`Editing is locked because this report is under status: "${report.status}".`);
      return;
    }
    const rawLoc = report.location || report.purok || '';
    const zoneMatch = rawLoc.match(/(Zone\s*[1-5]|Purok\s*[1-5])/i);
    const detectedZone = zoneMatch ? zoneMatch[0] : '';
    const detectedStreet = rawLoc
      .replace(zoneMatch ? zoneMatch[0] : '', '')
      .replace(/^[ ,\-]+|[ ,\-]+$/g, '');
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

  const handleSaveEdit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!editingReport || !db) return;
      const validZonePattern = /^(Zone 1|Zone 2|Zone 3|Zone 4|Zone 5|Purok 1|Purok 2|Purok 3|Purok 4|Purok 5)$/i;
      if (!editForm.zone || !validZonePattern.test(editForm.zone.trim())) {
        alert('Invalid Location! Please select a valid Zone/Purok (Zone 1 to Zone 5).');
        return;
      }
      const todayStr = new Date().toISOString().split('T')[0];
      if (!editForm.incidentDate || editForm.incidentDate > todayStr) {
        alert('Invalid Date! Incident Date cannot be in the future.');
        return;
      }
      const formattedLocation = editForm.street.trim()
        ? `${editForm.street.trim()}, ${editForm.zone.trim()}`
        : editForm.zone.trim();
      const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
      try {
        const existingDoc = await db.get(editingReport._id);
        const timestamp = new Date().toISOString();
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
          updatedAt: timestamp,
          synced: isOnline,
          isSynced: isOnline,
          history: [
            ...(existingDoc.history || []),
            {
              action: 'UPDATE_REPORT',
              updatedBy: existingDoc.complainant || 'Resident',
              timestamp,
              details: `Resident updated report details (Location: ${formattedLocation}).`,
            },
          ],
        };
        await db.put(updatedDoc);
        try {
          const auditPayload = buildAuditLogPayload({
            action: 'UPDATE_BLOTTER_REPORT',
            module: 'BLOTTER',
            recordId: editingReport._id,
            actor: {
              username: loggedInUserRef.current?.username || loggedInUserRef.current?.residentId || 'resident',
              role: 'resident',
              fullName: loggedInUserRef.current?.fullName || 'Resident',
            },
            details: `Updated report details for ${editingReport._id} (Location: ${formattedLocation})`,
          });
          await createAuditLog(auditPayload);
        } catch (auditErr) { console.warn('Audit log entry failed:', auditErr); }
        if (isOnline) {
          try { await forceSyncToRemote(); } catch (s) { console.warn('Sync warning:', s); }
        }
        alert('Report updated successfully! Changes will sync to the Barangay Admin.');
        setEditingReport(null);
        await loadData();
      } catch (err) {
        console.error('Error updating report:', err);
        alert('Failed to update the report. Please try again.');
      }
    },
    [editingReport, editForm, loadData]
  );

  const handleSaveProfileEdit = useCallback(
  async (editableProfile) => {
    if (!db) throw new Error('Local database is not connected.');

    const targetDocId = residentProfile?.rawDoc?._id || residentProfile?._id || loggedInUserRef.current?._id || loggedInUserRef.current?.residentId;
    let existingDoc = null;
    if (targetDocId) {
      try { existingDoc = await db.get(targetDocId); } catch (err) { /* ignore */ }
    }
    if (!existingDoc) {
      const res = await db.allDocs({ include_docs: true });
      const currentId = String(loggedInUserRef.current?.residentId || loggedInUserRef.current?.id || '').toLowerCase().trim();
      const currentName = String(loggedInUserRef.current?.fullName || '').toLowerCase().trim();
      existingDoc = res.rows
        .map((row) => row.doc)
        .find((doc) => {
          if (!doc) return false;
          const isRes = doc.docType === 'resident' || doc.type === 'resident' || doc.residentId;
          if (!isRes) return false;
          const docId = String(doc.residentId || doc._id || '').toLowerCase().trim();
          const docName = String(doc.fullName || `${doc.firstName || ''} ${doc.lastName || ''}`).toLowerCase().trim();
          return (currentId && docId === currentId) || (currentName && docName.includes(currentName));
        });
    }

    // Build name fields
    const firstName = editableProfile.firstName?.trim() || existingDoc?.firstName || '';
    const lastName = editableProfile.lastName?.trim() || existingDoc?.lastName || '';
    const fullName = firstName && lastName 
      ? `${firstName} ${lastName}` 
      : (existingDoc?.fullName || loggedInUserRef.current?.fullName || 'Resident');

    const updatedDoc = existingDoc
      ? {
          ...existingDoc,
          firstName,
          lastName,
          fullName,
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
        }
      : {
          _id: targetDocId || `RES-${Date.now()}`,
          docType: 'resident',
          type: 'resident',
          residentId: loggedInUserRef.current?.residentId || 'RES-0002',
          firstName,
          lastName,
          fullName,
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

    const result = await db.put(updatedDoc);

    try {
      const auditPayload = buildAuditLogPayload({
        action: 'UPDATE_PROFILE',
        module: 'RESIDENTS',
        recordId: updatedDoc._id || updatedDoc.residentId || 'RES-PROFILE',
        actor: {
          username: loggedInUserRef.current?.username || loggedInUserRef.current?.residentId || 'resident',
          role: 'resident',
          fullName: updatedDoc.fullName || 'Resident',
        },
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

    setLoggedInUser((prev) => {
      const merged = {
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
      };
      localStorage.setItem('bustrac_user', JSON.stringify(merged));
      sessionStorage.setItem('bustrac_user', JSON.stringify(merged));
      return merged;
    });

    alert('Your information has been successfully updated!');
  },
  [db, residentProfile]
);


  /* ── Derived ── */
  const pendingRequestCount = useMemo(() => {
    return myRequests.filter((r) => {
      const status = r.status || 'Pending';
      const step = Number(r.step || 1);
      return status !== 'Issued' && step < 5;
    }).length;
  }, [myRequests]);

  /* ── Nav Items ── */
  const navItems = [
    { id: 's-home', label: 'Home', icon: <FaHome /> },
    { id: 's-certificates', label: 'Certificates', icon: <FaFileAlt /> },
    { id: 's-announcements', label: 'News', icon: <FaBullhorn /> },
    { id: 's-feedback', label: 'Feedback', icon: <FaCommentDots /> },
    { id: 's-blotter', label: 'Blotter', icon: <FaBalanceScale /> },
    { id: 's-assistance', label: 'Aid', icon: <FaHandHoldingHeart /> },
    { id: 's-profile', label: 'Profile', icon: <FaUser /> },
  ];

  /* ── Render ── */
  return (
    <div className="resident-root-container">
      <div id="app">
        {/* Top Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logo} alt="Barangay Logo" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'contain' }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.3px' }}>Bustrac Hub</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {lastSync && (
              <span style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: isOffline ? 'var(--amber)' : 'var(--green)',
                  display: 'inline-block',
                }} />
                {isOffline ? 'Offline' : 'Synced'}
              </span>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s ease',
              }}
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
          {isLoading && (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              padding: '40px 20px', color: 'var(--muted)', fontSize: 13,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: 8, animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeLinecap="round" />
              </svg>
              Loading your data...
            </div>
          )}

          {loadError && (
            <div style={{
              padding: '16px', margin: '16px', borderRadius: 12,
              background: 'var(--red-bg, rgba(239,68,68,0.1))',
              border: '1px solid var(--red-border, rgba(239,68,68,0.3))',
              color: 'var(--red, #ef4444)', fontSize: 13,
            }}>
              <strong>Error:</strong> {loadError}
              <button onClick={loadData} className="btn btn-sm" style={{ marginLeft: 12 }}>Retry</button>
            </div>
          )}

          {!isLoading && !loadError && activeScreen === 's-home' && (
            <ResidentHome
              isOffline={isOffline}
              greetingText={greetingText}
              loggedInUser={loggedInUser}
              myRequests={myRequests}
              pendingRequestCount={pendingRequestCount}
              announcements={announcements}
              myFeedbacks={myFeedbacks}
              myBlotters={myBlotters}
              myAssistance={myAssistance}
              goToTab={goToTab}
            />
          )}

          {!isLoading && !loadError && activeScreen === 's-certificates' && (
            <ResidentCertificates
              loggedInUser={loggedInUser}
              myRequests={myRequests}
              showCertForm={showCertForm}
              setShowCertForm={setShowCertForm}
              certForm={certForm}
              updateCertField={updateCertField}
              submitCert={submitCert}
              certSuccess={certSuccess}
              setCertSuccess={setCertSuccess}
              filterTab={filterTab}
              setFilterTab={setFilterTab}
              handleCancelRequest={handleCancelRequest}
            />
          )}

          {!isLoading && !loadError && activeScreen === 's-announcements' && (
            <ResidentAnnouncements announcements={announcements} />
          )}

          {!isLoading && !loadError && activeScreen === 's-feedback' && (
            <ResidentFeedback
              myFeedbacks={myFeedbacks}
              submitFeedback={submitFeedback}
              loggedInUser={loggedInUser}
            />
          )}

          {!isLoading && !loadError && activeScreen === 's-blotter' && (
            <ResidentBlotter
              myBlotters={myBlotters}
              loggedInUser={loggedInUser}
              submitBlotter={submitBlotter}
              handleOpenEdit={handleOpenEdit}
            />
          )}

          {!isLoading && !loadError && activeScreen === 's-assistance' && (
            <ResidentAssistance myAssistance={myAssistance} />
          )}

          {!isLoading && !loadError && activeScreen === 's-profile' && (
            <ResidentProfile
              residentProfile={residentProfile}
              loggedInUser={loggedInUser}
              isOffline={isOffline}
              lastSync={lastSync}
              handleLogout={handleLogout}
              handleSaveProfileEdit={handleSaveProfileEdit}
            />
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="bottom-nav">
          {navItems.map((item) => {
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

        {/* Footer */}
        <footer className="resident-footer" style={{
          marginTop: 28, padding: '24px 16px 12px', textAlign: 'center',
          borderTop: '1px solid var(--border)', background: 'transparent',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.4px' }}>Bustrac Hub</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
              background: 'var(--primary-light)', color: 'var(--primary, #3b82f6)', border: '1px solid var(--primary-light)',
            }}>v1.0</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.75, lineHeight: 1.4 }}>
            © {new Date().getFullYear()} Barangay Bustrac, Nabua. All rights reserved.
          </div>
        </footer>
      </div>

      {/* Blotter Edit Modal */}
      {editingReport && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
          onClick={() => setEditingReport(null)}
        >
          <div
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
              Edit Report — {editingReport.refNumber || editingReport._id}
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl">Incident Subject *</label>
                <input className="fc" required value={editForm.subject} onChange={(e) => setEditForm((p) => ({ ...p, subject: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div className="fg" style={{ margin: 0 }}>
                  <label className="fl">Incident Date *</label>
                  <input type="date" className="fc" required max={new Date().toISOString().split('T')[0]} value={editForm.incidentDate} onChange={(e) => setEditForm((p) => ({ ...p, incidentDate: e.target.value }))} />
                </div>
                <div className="fg" style={{ margin: 0 }}>
                  <label className="fl">Zone / Purok *</label>
                  <select className="fc" required value={editForm.zone || ''} onChange={(e) => setEditForm((p) => ({ ...p, zone: e.target.value }))}>
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
                <input className="fc" placeholder="e.g. Near Chapel, Main Street, Riverside" value={editForm.street || ''} onChange={(e) => setEditForm((p) => ({ ...p, street: e.target.value }))} />
              </div>
              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl">Respondent (if known)</label>
                <input className="fc" value={editForm.respondent} onChange={(e) => setEditForm((p) => ({ ...p, respondent: e.target.value }))} />
              </div>
              <div className="fg" style={{ marginBottom: 14 }}>
                <label className="fl">Incident Details *</label>
                <textarea className="fc" rows="4" required maxLength={500} value={editForm.details} onChange={(e) => setEditForm((p) => ({ ...p, details: e.target.value }))} style={{ resize: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Changes</button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingReport(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
