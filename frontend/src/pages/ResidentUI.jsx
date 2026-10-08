import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { localDb as db, forceSyncToRemote } from '../services/db';
import { createAuditLog } from '../utils/auditLog';
import logo from '../assets/logo.png';
import './ResidentUI.css';
import { FaHome, FaFileAlt, FaBullhorn, FaCommentDots, FaUser, FaBalanceScale, FaHandHoldingHeart } from "react-icons/fa";
import { saveCertificateRequest } from '../services/db';
import Swal from 'sweetalert2'; // ✅ Added SweetAlert2 Import

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

  /* ═══════════════════════════════════════════════════════════
     SECTION 1: ALL useState (nasa pinakataas — walang exception)
     ═══════════════════════════════════════════════════════════ */
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

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

  const [sseNotification, setSseNotification] = useState(null);

  /* ═══════════════════════════════════════════════════════════
     SECTION 2: ALL useRef (kasunod ng useState)
     ═══════════════════════════════════════════════════════════ */
  const loggedInUserRef = useRef(loggedInUser);
  const isFetchingRef = useRef(false);
  const notifiedCertIds = useRef(new Set());

  /* ═══════════════════════════════════════════════════════════
     SECTION 3: SIMPLE useEffect (no interdependencies)
     ═══════════════════════════════════════════════════════════ */
  // 3b. Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

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

  /* ═══════════════════════════════════════════════════════════
     SECTION 4: SIMPLE useMemo (no callback deps)
     ═══════════════════════════════════════════════════════════ */
  const greetingText = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  /* ═══════════════════════════════════════════════════════════
     SECTION 5: useCallback — IN DEPENDENCY ORDER ⚠️ CRITICAL
     ═══════════════════════════════════════════════════════════ */

  // 5a. checkUserMatch — no deps, dapat PINAKAUNA
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

  // 5b. goToTab — no deps
  const goToTab = useCallback((id) => {
    setActiveScreen(id);
    window.scrollTo(0, 0);
  }, []);
  
  // 5b-2. requestNotificationPermission — no deps
  const requestNotificationPermission = useCallback(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('Browser does not support desktop notifications.');
      return;
    }

    if (Notification.permission === 'granted') {
      console.log('✅ Desktop notifications already enabled.');
      return;
    }

    if (Notification.permission === 'denied') {
      console.warn('❌ Notifications blocked. Enable manually in browser settings.');
      return;
    }

    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        console.log('✅ Desktop notifications enabled.');
        setSseNotification('🔔 Desktop notifications enabled! You will now receive real-time barangay updates.');
        setTimeout(() => setSseNotification(null), 5000);
      } else {
        console.warn('⚠️ Notification permission denied.');
      }
    });
  }, []);

  // 5c. handleLogout — deps: navigate
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
        navigate('/');
      }
    });
  }, [navigate]);

  // 5d. loadData — deps: checkUserMatch ✅ SAFE
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
        return isBlotterDoc && checkUserMatch(doc);
      }).map(normalizeBlotterDoc).filter(Boolean).sort(sortTs);
      setMyBlotters(userBlotters);

      const userRequests = docs.filter((d) => (d.type === 'certificate_request' || d.type === 'request') && checkUserMatch(d))
        .map(normalizeCertificateDoc).filter(Boolean).sort(sortTs);
      setMyRequests(userRequests);

      setAnnouncements(byType('announcement').sort(sortTs));
      setMyAssistance(docs.filter((d) => d.type === 'aid_distribution' && checkUserMatch(d)).sort(sortTs));

      const currentUserId = String(user?.residentId || user?.id || user?._id || '').toLowerCase().trim();
      const currentUsername = String(user?.username || user?.email || '').toLowerCase().trim();

      const userFeedbacks = docs.filter((doc) => {
        const isFeedbackDoc = doc.type === 'feedback_report' || doc.type === 'feedback' || doc.docType === 'feedback';
        if (!isFeedbackDoc) return false;
        const docUserId = String(doc.residentId || doc.userId || '').toLowerCase().trim();
        const docUsername = String(doc.username || doc.user || '').toLowerCase().trim();
        const isMatchById = Boolean(currentUserId && docUserId && currentUserId === docUserId);
        const isMatchByUsername = Boolean(currentUsername && docUsername && currentUsername === docUsername);
        return isMatchById || isMatchByUsername || checkUserMatch(doc);
      }).map(normalizeFeedbackDoc).filter(Boolean).sort(sortTs);
      setMyFeedbacks(userFeedbacks);

      const residentDoc = docs.find((d) => (d.docType === 'resident' || d.type === 'resident' || d.residentId) && checkUserMatch(d));
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
      console.error('❌ Load error in ResidentUI:', e);
      setLoadError(e.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [checkUserMatch]); 

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

      await db.put(payload);

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

  // 5f. submitFeedback — deps: []
  const submitFeedback = useCallback(
  async ({ feedbackType, subject, message, residentId, residentName, username }) => {
    if (!db) {
      Swal.fire('Error', 'Local database is unavailable.', 'error');
      throw new Error('No db');
    }

    // 🛡️ ANTI-SPAM: DB-level check — Max 1 feedback per 24 hours
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
        Swal.fire('Wait a moment', '⚠️ You can only submit one feedback every 24 hours. Please wait before submitting another.', 'warning');
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
    const safeResidentId = currentUser?.residentId || currentUser?.id || 'RES-UNKNOWN';

    // 🛡️ ANTI-SPAM: DB-level check
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const recentChecks = await db.allDocs({ include_docs: true, startkey: 'BLT-', endkey: 'BLT-\ufff0' });

      const userRecentBlotters = recentChecks.rows
        .map((r) => r.doc)
        .filter((doc) => doc && doc.residentId === safeResidentId && doc.createdAt > twoHoursAgo);

      if (userRecentBlotters.length > 0) {
        Swal.fire('Wait a moment', '⚠️ A blotter report was recently filed. Please wait 2 hours before submitting another, or visit the Barangay Hall directly.', 'warning');
        return;
      }
    } catch (err) {
      console.warn('Anti-spam check failed, proceeding with caution:', err);
    }

    const totalSizeMB = (attachments || []).reduce((acc, file) => acc + (parseFloat(file.size) || 0), 0);
    if (totalSizeMB > 8) {
      Swal.fire('File Too Large', `⚠️ Ang total size ng mga ebidensya ay ${totalSizeMB.toFixed(2)}MB. Ang limit ay 8MB lamang.`, 'warning');
      return;
    }

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
      complainant: safeComplainant,
      complainantName: safeComplainant,
      respondent: respondent || 'Under Investigation',
      respondentName: respondent || 'Under Investigation',
      location: location || 'Barangay Bustrac',
      incidentDate: incidentDate || new Date().toISOString().split('T')[0],
      details: details.trim(),
      narrative: details.trim(),
      attachments: attachments || [],
      status: 'Pending',
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      residentId: safeResidentId,
      synced: false,
      isSynced: false,
    };

    await db.put(payload);

    try {
      const auditPayload = buildAuditLogPayload({
        action: 'CREATE_BLOTTER_REPORT',
        module: 'BLOTTER',
        recordId: refNumber,
        actor: { username: safeResidentId || 'resident', role: 'resident', fullName: safeComplainant || 'Resident' },
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
    await loadData();
  }, [loadData]);

  // 5h. handleCancelRequest — deps: myRequests, loadData ✅
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
        await db.put({ ...latest, status: 'Cancelled', cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        Swal.fire('Cancelled', `Request ${refNum} has been cancelled successfully.`, 'success');
        await loadData();
      } catch (err) {
        console.error('Cancel error', err);
        Swal.fire('Error', 'Unable to cancel request. Please try again.', 'error');
      }
    },
    [myRequests, loadData]
  );

  // 5i. handleOpenEdit — deps: []
  const handleOpenEdit = useCallback((report) => {
    const editableStatuses = ['pending', 'needs revision', 'returned', 'open'];
    const currentStatus = (report.status || '').toLowerCase();
    if (!editableStatuses.includes(currentStatus)) {
      Swal.fire('Action Denied', `Editing is locked because this report is under status: "${report.status}".`, 'warning');
      return;
    }
    const rawLoc = report.location || report.purok || '';
    const zoneMatch = rawLoc.match(/(Zone\s*[1-5]|Purok\s*[1-5])/i);
    const detectedZone = zoneMatch ? zoneMatch[0] : '';
    const detectedStreet = rawLoc.replace(zoneMatch ? zoneMatch[0] : '', '').replace(/^[ ,\-]+|[ ,\-]+$/g, '');
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

  // 5j. handleSaveEdit — deps: editingReport, editForm, loadData ✅
  const handleSaveEdit = useCallback(
  async (e) => {
    e.preventDefault();
    if (!db || !editingReport) return;

    if (!editForm.subject.trim() || !editForm.details.trim()) {
      Swal.fire('Missing Fields', 'Please fill in all required fields (Subject and Details).', 'warning');
      return;
    }

    try {
      const existingDoc = await db.get(editingReport._id);
      const formattedLocation = editForm.street.trim() ? `${editForm.street.trim()}, ${editForm.zone.trim()}` : editForm.zone.trim();

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

      await db.put(updatedDoc);

      try {
        await createAuditLog({
          action: 'UPDATE_BLOTTER_REPORT',
          module: 'BLOTTER',
          recordId: editingReport._id,
          actor: { username: loggedInUser?.username || 'resident', role: 'resident', fullName: loggedInUser?.fullName || 'Resident' },
          details: `Updated report details for ${editingReport._id}`,
        });
      } catch (auditErr) {
        console.warn('Audit log failed:', auditErr);
      }

      Swal.fire('Success', 'Report updated successfully! Changes will sync to the Barangay Admin.', 'success');
      setEditingReport(null);
      await loadData();
    } catch (err) {
      console.error('Error updating report:', err);
      Swal.fire('Error', 'Failed to update the report. Please try again.', 'error');
    }
  },
  [editForm, editingReport, db, loggedInUser, loadData]
);

  // 5k. handleSaveProfileEdit — deps: db, residentProfile, loggedInUser
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

      const result = await db.put(updatedDoc);

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

  /* ═══════════════════════════════════════════════════════════
     SECTION 6: DERIVED VALUES (useMemo — after callbacks OK)
     ═══════════════════════════════════════════════════════════ */
  const pendingRequestCount = useMemo(() => {
    return myRequests.filter((r) => {
      const status = r.status || 'Pending';
      const step = Number(r.step || 1);
      return status !== 'Issued' && step < 5;
    }).length;
  }, [myRequests]);

  /* ═══════════════════════════════════════════════════════════
     SECTION 7: useEffect NA TUMATAWAG SA CALLBACKS
     ═══════════════════════════════════════════════════════════ */
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

  // 7a. Load data kapag ready na ang user
  useEffect(() => {
    if (loggedInUserRef.current?.fullName) {
      loadData();
    }
  }, [loadData]);

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
    if (import.meta.env.DEV) console.log(`🔌 Attempting SSE connection to: ${backendUrl}/api/notifications`);

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
              notifTitle = '📦 Bagong Aid Distribution';
              notifBody = 'May bagong relief goods na na-upload at available na.';
            } else if (data.type === 'BLOTTER_UPDATE') {
              notifTitle = '⚖️ Blotter Case Update';
              notifBody = data.message || 'May update ang iyong blotter case status.';
            }

            new Notification(notifTitle, { body: notifBody, icon: notifIcon });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
          }

          if (typeof loadData === 'function') loadData();
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };
    
    eventSource.onerror = (err) => {
      if (import.meta.env.DEV) console.warn('⚠️ SSE Connection lost. Reconnecting...', err);
    };
    
    return () => {
      if (import.meta.env.DEV) console.log('🔌 Closing SSE connection (component unmounted)');
      eventSource.close();
    };
  }, [loadData]);

  /* ═══════════════════════════════════════════════════════════
     SECTION 8: Regular functions (hindi hooks) at constants
     ═══════════════════════════════════════════════════════════ */
  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const updateCertField = (field) => (e) => {
    setCertForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const navItems = [
    { id: 's-home', label: 'Home', icon: <FaHome /> },
    { id: 's-certificates', label: 'Certificates', icon: <FaFileAlt /> },
    { id: 's-announcements', label: 'News', icon: <FaBullhorn /> },
    { id: 's-feedback', label: 'Feedback', icon: <FaCommentDots /> },
    { id: 's-blotter', label: 'Blotter', icon: <FaBalanceScale /> },
    { id: 's-assistance', label: 'Aid', icon: <FaHandHoldingHeart /> },
    { id: 's-profile', label: 'Profile', icon: <FaUser /> },
  ];

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

  /* ── Render ── */
  return (
    <div className="resident-root-container">
      <div id="app">
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logo} alt="Barangay Logo" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'contain' }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.3px' }}>Bustrac Hub</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {lastSync && (
              <span style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOffline ? 'var(--amber)' : 'var(--green)', display: 'inline-block' }} />
                {isOffline ? 'Offline' : 'Synced'}
              </span>
            )}
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
                <span style={{ fontSize: '20px' }}>🔔</span>
                <span style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.4 }}>{sseNotification}</span>
              </div>
              <button onClick={() => setSseNotification(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }} aria-label="Close notification">✕</button>
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
            <ResidentCertificates loggedInUser={loggedInUser} myRequests={myRequests} showCertForm={showCertForm} setShowCertForm={setShowCertForm} certForm={certForm} updateCertField={updateCertField} submitCert={submitCert} certSuccess={certSuccess} setCertSuccess={setCertSuccess} filterTab={filterTab} setFilterTab={setFilterTab} handleCancelRequest={handleCancelRequest} />
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

          {!isLoading && !loadError && activeScreen === 's-profile' && (
            <ResidentProfile residentProfile={residentProfile} loggedInUser={loggedInUser} isOffline={isOffline} lastSync={lastSync} handleLogout={handleLogout} handleSaveProfileEdit={handleSaveProfileEdit} />
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="bottom-nav">
          {navItems.map((item) => {
            const active = activeScreen === item.id;
            return (
              <button key={item.id} className={`bnav-item${active ? ' active' : ''}`} onClick={() => goToTab(item.id)} aria-current={active ? 'page' : undefined}>
                <span className="icon">{item.icon}</span>
                <span>{item.label}</span>
                <span className={`nav-selection-dot${active ? ' active' : ''}`} />
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <footer className="resident-footer" style={{ marginTop: 28, padding: '24px 16px 12px', textAlign: 'center', borderTop: '1px solid var(--border)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.4px' }}>Bustrac Hub</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'var(--primary-light)', color: 'var(--primary, #3b82f6)', border: '1px solid var(--primary-light)' }}>v1.0</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.75, lineHeight: 1.4 }}>
            © {new Date().getFullYear()} Barangay Bustrac, Nabua. All rights reserved.
          </div>
        </footer>
      </div>

      {/* Blotter Edit Modal */}
      {editingReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={() => setEditingReport(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
              <span>Edit Report — {editingReport.refNumber || editingReport._id}</span>
              <button onClick={() => setEditingReport(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSaveEdit}>
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
                <button type="submit" className="btn btn-primary" disabled={isSubmittingCert} style={{ opacity: isSubmittingCert ? 0.7 : 1, cursor: isSubmittingCert ? 'not-allowed' : 'pointer' }}>
                  {isSubmittingCert ? 'Submitting...' : 'Submit Request'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingReport(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}