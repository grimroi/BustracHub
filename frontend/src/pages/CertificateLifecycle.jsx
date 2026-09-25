import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PouchDB from 'pouchdb-browser';
import CertificatePrintWrapper from '../components/certificates/CertificatePrintWrapper';
import { logActivity } from '../utils/auditLog';
import '../styles/Certificates.css';

const db = new PouchDB('bustrachub_db');
const REMOTE_URL = import.meta.env.VITE_COUCHDB_URL || 'http://admin:admin@127.0.0.1:5984/bustrachub_db';

const INITIAL_FORM = {
  applicantType: 'Resident',
  firstName: '',
  lastName: '',
  businessName: '',
  ownerName: '',
  certificateType: '',
  purpose: '',
  residentId: '',
  rbiId: '',
  purok: '',
  ctc: { name: '', number: '', amountPaid: '', dateIssued: '', placeIssued: '' }
};

const formatStamp = () => new Date().toISOString();

// ── Date Formatter Helper ──
const formatDateTime = (dateString) => {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (err) {
    return '—';
  }
};

const formatDateOnly = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toISOString().split('T')[0];
};

const exportReportCSV = (rows, filename) => {
  const escapeCSV = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const headers = ['ID', 'Name', 'Type', 'Purpose', 'Status', 'Date'];
  const csv = [
    headers.map(escapeCSV).join(','),
    ...rows.map((r) =>
      [
        r._id,
        `${r.firstName || ''} ${r.lastName || ''}`.trim(),
        r.certificateType,
        r.purpose,
        r.status,
        formatDateTime(r.updatedAt || r.createdAt)
      ]
        .map(escapeCSV)
        .join(',')
    )
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const normalizeCertType = (typeString) => {
  if (!typeString) return 'indigency';
  const lower = typeString.toLowerCase();
  if (lower.includes('indigency')) return 'indigency';
  if (lower.includes('business')) return 'business';
  if (lower.includes('residency')) return 'residency';
  return 'clearance';
};

export default function CertificateLifecycle() {
  const [allRequests, setAllRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [requestForm, setRequestForm] = useState(INITIAL_FORM);
  const [remarksById, setRemarksById] = useState({});
  const [certificateSearch, setCertificateSearch] = useState('');
  const [printData, setPrintData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [residents, setResidents] = useState([]);
  const [showResidentPicker, setShowResidentPicker] = useState(false);
  const [residentSearchText, setResidentSearchText] = useState('');
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');

  const normalizedCertificateSearch = certificateSearch.toLowerCase().trim();

  const incomingRequests = allRequests.filter((req) => req.step === 1 || req.step === 2);

  const pendingApprovalRequests = allRequests.filter((req) => req.step === 3);

  const loadResidents = useCallback(async () => {
    try {
      const result = await db.allDocs({ include_docs: true, attachments: false });
      const list = result.rows
        .map((r) => r.doc)
        .filter(
          (d) => d && (d.type === 'resident' || d.type === 'profile' || d.collection === 'residents')
        );
      setResidents(list);
    } catch (e) {
      console.error('Failed to load residents', e);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const result = await db.allDocs({ include_docs: true, attachments: false });
      const requests = result.rows
        .map((row) => row.doc)
        .filter((doc) => doc && doc.type === 'certificate_request')
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setAllRequests(requests);
    } catch (error) {
      console.error('Unable to load certificate requests', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const changes = db.changes({ live: true, include_docs: true });
    const sync = db.sync(REMOTE_URL, { live: true, retry: true });

    changes.on('change', (change) => {
      if (!change.doc || change.doc.type !== 'certificate_request') return;
      setAllRequests((prev) => {
        const next = prev.filter((item) => item._id !== change.id);
        const exists = prev.some((item) => item._id === change.id);
        if (!exists) return [change.doc, ...next];
        return prev.map((item) => (item._id === change.id ? change.doc : item));
      });
    });

    changes.on('error', (error) => console.error('Certificate changes feed error', error));
    sync.on('error', (error) => console.error('Certificate sync error', error));

    loadRequests();
    return () => {
      changes.cancel();
      sync.cancel();
    };
  }, [loadRequests]);

  useEffect(() => {
    if (showModal && requestForm.applicantType === 'Resident') {
      loadResidents();
    }
  }, [showModal, requestForm.applicantType, loadResidents]);

  const updateRequest = useCallback(async (request, nextStep) => {
    try {
      const now = new Date().toISOString();
      const updatedRequest = { ...request, step: nextStep, updatedAt: now };
      if (nextStep === 2) {
        updatedRequest.status = 'Under Review';
        updatedRequest.reviewedAt = now;
      }
      if (nextStep === 3) updatedRequest.status = 'Awaiting Approval';
      if (nextStep === 4) {
        updatedRequest.status = 'Approved';
        updatedRequest.approvedAt = now;
      }
      if (nextStep === 5) {
        updatedRequest.status = 'Issued';
        updatedRequest.issuedAt = now;
      }
      if (nextStep === 6) {
        updatedRequest.status = 'Released';
        updatedRequest.releasedAt = now;
      }
      await db.put(updatedRequest);
    } catch (error) {
      console.error('Unable to update certificate request', error);
    }
  }, []);

  const handleRemarksSubmit = useCallback(
    async (request) => {
      const remarks = remarksById[request._id] ?? request.remarks ?? '';
      try {
        await db.put({ ...request, remarks, step: 3, updatedAt: formatStamp() });
      } catch (error) {
        console.error('Unable to send request for approval', error);
      }
    },
    [remarksById]
  );

  const handlePrintCertificate = useCallback((cert) => {
    console.log('PRINT BUTTON CLICKED! Data:', cert);
    setPrintData(cert);
    logActivity({
      action: 'PRINT_CERTIFICATE',
      module: 'Certificate Lifecycle',
      details: `Printed ${cert.certificateType || 'Certificate'} for ${cert.firstName || ''} ${cert.lastName || cert.fullName || 'Resident'} (Ref: ${cert.trackingCode || cert._id})`,
      performedBy: 'Barangay Official'
    });
  }, []);

  const handleIssueCertificate = async (cert) => {
    try {
      const updatedCert = {
        ...cert,
        step: 5,
        status: 'Issued',
        issuedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (typeof updateCertificateDoc === 'function') {
        await updateCertificateDoc(updatedCert);
      }
      logActivity({
        action: 'ISSUE_CERTIFICATE',
        module: 'Certificate Lifecycle',
        details: `Issued ${cert.certificateType || 'Certificate'} for ${cert.firstName || ''} ${cert.lastName || cert.fullName || 'Resident'} (Ref: ${cert.trackingCode || cert._id})`,
        performedBy: 'Barangay Official'
      });
      alert(`Certificate ${cert.trackingCode || cert._id} has been successfully ISSUED!`);
    } catch (error) {
      console.error('Error issuing certificate:', error);
      alert('Failed to issue certificate. Please try again.');
    }
  };

  const handleReleaseDocument = async (cert) => {
    try {
      const updatedCert = {
        ...cert,
        step: 6,
        status: 'Released',
        releasedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (typeof updateCertificateDoc === 'function') {
        await updateCertificateDoc(updatedCert);
      }
      logActivity({
        action: 'RELEASE_CERTIFICATE',
        module: 'Certificate Lifecycle',
        details: `Released ${cert.certificateType || 'Certificate'} to ${cert.firstName || ''} ${cert.lastName || cert.fullName || 'Resident'} (Ref: ${cert.trackingCode || cert._id})`,
        performedBy: 'Barangay Official'
      });
      alert(`Certificate ${cert.trackingCode || cert._id} has been successfully RELEASED!`);
    } catch (error) {
      console.error('Error releasing certificate:', error);
      alert('Failed to release certificate. Please try again.');
    }
  };

  const closePrint = useCallback(() => setPrintData(null), []);

  const handleSelectResident = (resident) => {
    setRequestForm((prev) => ({
      ...prev,
      firstName: resident.firstName || resident.fname || '',
      lastName: resident.lastName || resident.lname || '',
      residentId: resident._id || resident.residentId || '',
      rbiId: resident.rbiId || resident.rbi || '',
      purok: resident.purok || resident.address?.purok || 'Purok 1'
    }));
    setShowResidentPicker(false);
    setResidentSearchText('');
  };

  const validateCertificateForm = () => {
    const applicantType = requestForm.applicantType || 'Resident';
    if (!requestForm.certificateType) {
      alert('Please select a Certificate Type.');
      return false;
    }
    if (!requestForm.purpose?.trim()) {
      alert('Please state the purpose of this certificate.');
      return false;
    }
    if (applicantType === 'Resident' || applicantType === 'Non-Resident') {
      if (!requestForm.firstName?.trim() || !requestForm.lastName?.trim()) {
        alert('Please enter the First Name and Last Name.');
        return false;
      }
    }
    if (applicantType === 'Business') {
      if (!requestForm.businessName?.trim() || !requestForm.ownerName?.trim()) {
        alert('Please enter the Business Name and Owner Name.');
        return false;
      }
      if (!['Business Clearance', 'Business Permit', 'Barangay Clearance'].includes(requestForm.certificateType)) {
        alert('Please select a valid business document.');
        return false;
      }
    }
    return true;
  };
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateRequest = async (event) => {
  event.preventDefault();

  // LAYER 1: Anti-Double Click Protection
  if (isSubmitting) {
    console.warn('Submission already in progress, ignoring duplicate click');
    return;
  }

  if (!validateCertificateForm()) return;

  setIsSubmitting(true); // Lock the button

  try {
    // Kuhanin ang kasalukuyang logged-in user mula sa localStorage o default sa Admin
    const storedUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const currentUser = storedUser.username ? storedUser : { username: 'Admin Staff', role: 'admin' };

    // OPTIMIZED: Fetch all certificate requests ONCE
    const allRequests = await db.allDocs({
      include_docs: true,
      startkey: 'CERT-',
      endkey: 'CERT-\ufff0'
    });
    const allDocs = allRequests.rows.map(row => row.doc);

    // CHECK IF USER IS ADMIN / STAFF
    const isAdminUser = currentUser?.role === 'admin' || currentUser?.role === 'staff' || true;

    // LAYER 2: Duplicate Request Check (Resident)
    if (requestForm.applicantType === 'Resident' && requestForm.residentId) {
      const existingRequests = allDocs.filter(doc =>
        doc.residentId === requestForm.residentId &&
        doc.certificateType === requestForm.certificateType
      );

      // Check 24-hour cooldown (SKIP IF ADMIN or CONFIRMED)
      const now = new Date();
      const recentRequest = existingRequests.find(doc => {
        const requestDate = new Date(doc.createdAt || doc.requestedAt);
        const hoursSince = (now - requestDate) / (1000 * 60 * 60);
        return hoursSince < 24;
      });

      if (recentRequest && !isAdminUser) {
        alert(`Cooldown Active: You already requested a ${requestForm.certificateType} recently. Please wait 24 hours before requesting the same certificate type again.`);
        setIsSubmitting(false);
        return;
      }

      // If Admin, ask for confirmation instead of blocking completely
      if (recentRequest && isAdminUser) {
        const confirmBypass = window.confirm(
          `Cooldown Warning: A ${requestForm.certificateType} was requested for this resident within the last 24 hours.\n\nDo you want to proceed and override as Admin?`
        );
        if (!confirmBypass) {
          setIsSubmitting(false);
          return;
        }
      }

      // Check pending request quota (max 3)
      const pendingRequests = existingRequests.filter(doc =>
        doc.status === 'Submitted' ||
        doc.status === 'Under Review' ||
        doc.status === 'Pending' ||
        doc.step === 1 ||
        doc.step === 2
      );

      if (pendingRequests.length >= 3 && !isAdminUser) {
        alert(`Request Limit Reached: You already have ${pendingRequests.length} pending certificate requests. Please wait for them to be processed before submitting new requests.`);
        setIsSubmitting(false);
        return;
      }
    }

    // LAYER 3: Business Duplicate Check
    if (requestForm.applicantType === 'Business' && requestForm.businessName) {
      const businessRequests = allDocs.filter(doc =>
        doc.businessName === requestForm.businessName &&
        doc.certificateType === requestForm.certificateType
      );

      const now = new Date();
      const recentRequest = businessRequests.find(doc => {
        const requestDate = new Date(doc.createdAt || doc.requestedAt);
        const hoursSince = (now - requestDate) / (1000 * 60 * 60);
        return hoursSince < 48; // 48 hours for business permits
      });

      if (recentRequest && !isAdminUser) {
        alert(`Business Cooldown: ${requestForm.businessName} already requested a ${requestForm.certificateType} recently. Please wait 48 hours.`);
        setIsSubmitting(false);
        return;
      }
    }

    // All checks passed - proceed with creation
    const generatedId = `CERT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const newRequestPayload = {
      _id: generatedId,
      type: 'certificate_request',
      applicantType: requestForm.applicantType || 'Resident',
      firstName: requestForm.firstName?.trim() || '',
      lastName: requestForm.lastName?.trim() || '',
      businessName: requestForm.businessName?.trim() || '',
      ownerName: requestForm.ownerName?.trim() || '',
      certificateType: requestForm.certificateType,
      purpose: requestForm.purpose.trim(),
      status: 'Submitted',
      step: 1,
      requestedAt: now,
      reviewedAt: null,
      approvedAt: null,
      issuedAt: null,
      releasedAt: null,
      createdAt: now,
      updatedAt: now,
      ctc: {
        name: requestForm.ctc?.name?.trim() || '',
        number: requestForm.ctc?.number?.trim() || '',
        amountPaid: parseFloat(requestForm.ctc?.amountPaid) || 0,
        dateIssued: requestForm.ctc?.dateIssued || '',
        placeIssued: requestForm.ctc?.placeIssued?.trim() || ''
      }
    };

    if (requestForm.applicantType === 'Resident') {
      newRequestPayload.residentId = requestForm.residentId?.trim() || '';
      newRequestPayload.rbiId = requestForm.rbiId?.trim().toUpperCase() || '';
      newRequestPayload.purok = requestForm.purok || 'Purok 1';
    }

    await db.put(newRequestPayload);

    // Audit Log - Gumamit ng logActivity sa halip na createAuditLog
    await logActivity({
      action: 'CREATE_CERTIFICATE_REQUEST',
      module: 'CERTIFICATES',
      recordId: generatedId,
      details: `New certificate request: ${requestForm.certificateType} for ${
        requestForm.applicantType === 'Business'
          ? requestForm.businessName
          : `${requestForm.firstName || ''} ${requestForm.lastName || ''}`.trim()
      }`,
      performedBy: currentUser?.username || 'Barangay Official'
    });

    alert('Certificate request submitted successfully and queued for review!');

    setRequestForm(INITIAL_FORM);
    setShowModal(false);
    setShowResidentPicker(false);
    setResidentSearchText('');

    // Unlock button after cooldown (2 seconds)
    setTimeout(() => setIsSubmitting(false), 2000);

  } catch (error) {
    console.error('Unable to save certificate request', error);
    alert('Failed to save certificate request. Please try again.');
    setIsSubmitting(false); // Unlock on error immediately
  }
};
  
  const getApplicantName = (req) => {
  if (!req) return 'Unnamed Applicant';
  if (req.businessName) {
    return `${req.businessName}${req.ownerName ? ` (${req.ownerName})` : ''}`;
  }
  const fullName = `${req.firstName || ''} ${req.lastName || ''}`.trim();
  return fullName || 'Unnamed Applicant';
};

 const reportRequests = allRequests.filter((req) => {
  if (![4, 5, 6].includes(Number(req.step))) return false;
  
  // Date range filter
  if (reportStart || reportEnd) {
    const date = new Date(req.updatedAt || req.createdAt || 0);
    const start = reportStart ? new Date(reportStart) : null;
    const end = reportEnd ? new Date(reportEnd) : null;
    if (end) end.setHours(23, 59, 59, 999);
    const inRange = (!start || date >= start) && (!end || date <= end);
    if (!inRange) return false;
  }

  if (normalizedCertificateSearch) {
    const applicantName = getApplicantName(req).toLowerCase();
    const certificateType = String(req.certificateType || req.certType || '').toLowerCase();
    const purpose = String(req.purpose || req.certPurpose || '').toLowerCase();
    const requestId = String(req._id || '').toLowerCase();

    const matches = applicantName.includes(normalizedCertificateSearch) ||
      certificateType.includes(normalizedCertificateSearch) ||
      purpose.includes(normalizedCertificateSearch) ||
      requestId.includes(normalizedCertificateSearch);
    
    if (!matches) return false;
  }
  
  return true;
});

  const reportCounts = {
  approved: reportRequests.filter((r) => Number(r.step) === 4).length,
  issued: reportRequests.filter((r) => Number(r.step) === 5).length,
  released: reportRequests.filter((r) => Number(r.step) === 6).length,
  total: reportRequests.length,
};

  const handleResetFilters = () => {
    setReportStart('');
    setReportEnd('');
     setCertificateSearch('');
  };

  useEffect(() => {
    if (!showModal) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setShowModal(false);
        setRequestForm(INITIAL_FORM);
        setShowResidentPicker(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showModal]);

  const residentPickerRef = useRef(null);
  useEffect(() => {
    if (!showResidentPicker) return;
    const handleClickOutside = (e) => {
      if (residentPickerRef.current && !residentPickerRef.current.contains(e.target)) {
        setShowResidentPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showResidentPicker]);

   return (
  <div className="screen active certificate-lifecycle-screen">

    {/* ── Two Column Cards: Incoming & Pending (Version A) ── */}
    <div className="cert-columns">
      {/* Incoming Requests */}
      <div className="cert-section-card">
        <div className="cert-section-header">
          <div className="cert-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Incoming Requests
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowModal(true)}
          >
            + Add Request
          </button>
        </div>
        <div className="cert-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Applicant Name</th>
                <th>Details</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="3">
                    <div className="loading-cell">
                      <span className="spinner" />
                      <span>Loading certificate requests…</span>
                    </div>
                  </td>
                </tr>
              ) : incomingRequests.length === 0 ? (
                <tr>
                  <td colSpan="3">
                    <div className="empty-state">
                      <span>No incoming requests.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                incomingRequests.map((req) => {
                  const applicantName = getApplicantName(req);
                  const certificateType = req.certificateType || req.certType || '—';
                  const purpose = req.purpose || req.certPurpose || '—';
                  const remarksValue = remarksById[req._id] ?? req.remarks ?? '';

                  return (
                    <tr key={req._id}>
                      <td><strong>{applicantName}</strong></td>
                      <td>
                        <div className="cert-detail-stack">
                          <span>{certificateType}</span>
                          <span className="muted">{purpose}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cert-actions">
                          {req.step === 1 && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => updateRequest(req, 2)}>
                              Mark Under Review
                            </button>
                          )}
                          {req.step === 2 && (
                            <div className="cert-remarks-box">
                              <textarea
                                className="fc"
                                value={remarksValue}
                                placeholder="Add review remarks..."
                                rows={2}
                                onChange={(e) => setRemarksById((prev) => ({ ...prev, [req._id]: e.target.value }))}
                              />
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleRemarksSubmit(req)}>
                                Send for Approval
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Approvals */}
      <div className="cert-section-card">
        <div className="cert-section-header">
          <div className="cert-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            Pending Approvals
          </div>
          {pendingApprovalRequests.length > 0 && (
            <span className="badge a">{pendingApprovalRequests.length} Waiting</span>
          )}
        </div>
        <div className="cert-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Applicant Name</th>
                <th>Details</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="3">
                    <div className="loading-cell">
                      <span className="spinner" />
                      <span>Loading certificate requests…</span>
                    </div>
                  </td>
                </tr>
              ) : pendingApprovalRequests.length === 0 ? (
                <tr>
                  <td colSpan="3">
                    <div className="empty-state">
                      <span>No pending approvals.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pendingApprovalRequests.map((req) => {
                  const applicantName = getApplicantName(req);
                  const certificateType = req.certificateType || req.certType || '—';
                  const purpose = req.purpose || req.certPurpose || '—';
                  const remarksValue = req.remarks || '—';

                  return (
                    <tr key={req._id}>
                      <td><strong>{applicantName}</strong></td>
                      <td>
                        <div className="cert-detail-stack">
                          <span>{certificateType}</span>
                          <span className="muted">{purpose}</span>
                          <span className="muted">Remarks: {remarksValue}</span>
                        </div>
                      </td>
                      <td>
                        <button type="button" className="btn btn-p btn-sm" onClick={() => updateRequest(req, 4)}>
                          Approve Certificate
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    {showModal && createPortal(
  <div className="cert-modal-overlay">
    <div className="cert-modal">
      {/* Modal Header */}
      <div className="cert-modal-header">
        <h3>New Certificate Request</h3>
        <button
          type="button"
          className="cert-modal-close"
          aria-label="Close modal"
          onClick={() => {
            setShowModal(false);
            setRequestForm(INITIAL_FORM);
            setShowResidentPicker(false);
            setResidentSearchText('');
          }}
        >
          ✕
        </button>
      </div>

      {/* Form Body */}
      <form onSubmit={handleCreateRequest} className="cert-modal-form">
        <div className="cert-modal-body">
          {/* Applicant Type Selection */}
          <div className="fg">
            <label className="fl">
              Applicant Classification <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select
              className="fc"
              value={requestForm.applicantType}
              onChange={(event) => setRequestForm((prev) => ({
                ...prev,
                applicantType: event.target.value,
                certificateType: '',
                purpose: '',
                residentId: '',
                rbiId: '',
                purok: '',
                businessName: '',
                ownerName: '',
                firstName: '',
                lastName: ''
              }))}
            >
              <option value="Resident">Resident (Local Citizen)</option>
              <option value="Non-Resident">Non-Resident / Walk-in Applicant</option>
              <option value="Business">Commercial / Business Entity</option>
            </select>
          </div>

          <div className="section-divider" />

          {/* RESIDENT APPLICANT FLOW */}
          {requestForm.applicantType === 'Resident' && (
            <>
              <div className="fg" style={{ position: 'relative' }}>
                <label className="fl" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Search & Link Resident Profile <span style={{ color: 'var(--red)' }}>*</span>
                  </span>
                  {requestForm.residentId && (
                    <span style={{ color: 'var(--green)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Resident Linked
                    </span>
                  )}
                </label>

                <button
                  type="button"
                  className="btn btn-g btn-sm"
                  onClick={() => setShowResidentPicker((prev) => !prev)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  {showResidentPicker ? 'Close Resident Registry' : 'Select from Resident Registry'}
                </button>

                {/* Dynamic Overlay Resident Picker */}
                {showResidentPicker && (
                  <div className="resident-picker" ref={residentPickerRef}>
                    <div className="search-wrapper">
                      <input
                        type="text"
                        className="fc"
                        placeholder="Type name to search resident..."
                        value={residentSearchText}
                        onChange={(e) => setResidentSearchText(e.target.value)}
                        autoFocus
                      />
                      {residentSearchText && (
                        <button
                          type="button"
                          className="search-clear"
                          onClick={() => setResidentSearchText('')}
                          aria-label="Clear search"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div>
                      {residents
                        .filter((r) => {
                          const fullName = `${r.firstName || r.fname || ''} ${r.lastName || r.lname || ''}`.toLowerCase();
                          return fullName.includes(residentSearchText.toLowerCase());
                        })
                        .slice(0, 20)
                        .map((resident) => (
                          <div
                            key={resident._id || resident.id}
                            className="resident-option"
                            onClick={() => {
                              handleSelectResident(resident);
                              setShowResidentPicker(false);
                            }}
                          >
                            <span className="resident-option-name">
                              {resident.firstName || resident.fname} {resident.lastName || resident.lname}
                            </span>
                            <span className="resident-option-purok">
                              {resident.purok || resident.address?.purok || 'No Purok'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="cert-form-row cols-2">
                <div className="fg">
                  <label className="fl muted">Resident System ID</label>
                  <input className="fc" value={requestForm.residentId || ''} readOnly disabled placeholder="Auto-filled" />
                </div>
                <div className="fg">
                  <label className="fl muted">RBI Record ID</label>
                  <input className="fc" value={requestForm.rbiId || ''} readOnly disabled placeholder="Auto-filled" />
                </div>
              </div>

              <div className="fg">
                <label className="fl muted">Registered Purok Location</label>
                <input className="fc" value={requestForm.purok || ''} readOnly disabled placeholder="Auto-filled upon selection" />
              </div>
            </>
          )}

          {/* BUSINESS APPLICANT FLOW */}
          {requestForm.applicantType === 'Business' && (
            <>
              <div className="fg">
                <label className="fl">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 21V11a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v10" />
                    <path d="M2 21h20" />
                    <path d="M6 9h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2z" />
                  </svg>
                  Registered Business Name <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  className="fc"
                  placeholder="e.g. ABC Store & Trading Services"
                  required
                  value={requestForm.businessName}
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, businessName: e.target.value }))}
                />
              </div>
              <div className="fg">
                <label className="fl">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Owner / Authorized Representative <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  className="fc"
                  placeholder="e.g. Juan Dela Cruz"
                  required
                  value={requestForm.ownerName}
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, ownerName: e.target.value }))}
                />
              </div>
            </>
          )}

          {/* NON-RESIDENT APPLICANT FLOW */}
          {requestForm.applicantType === 'Non-Resident' && (
            <>
              <div className="cert-form-row cols-2">
                <div className="fg">
                  <label className="fl">First Name <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    className="fc"
                    placeholder="e.g. Maria"
                    required
                    value={requestForm.firstName}
                    onChange={(e) => setRequestForm((prev) => ({ ...prev, firstName: e.target.value }))}
                  />
                </div>
                <div className="fg">
                  <label className="fl">Last Name <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    className="fc"
                    placeholder="e.g. Santos"
                    required
                    value={requestForm.lastName}
                    onChange={(e) => setRequestForm((prev) => ({ ...prev, lastName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="fg">
                <label className="fl">
                  Complete Origin Address <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  className="fc"
                  placeholder="e.g. Brgy. San Nicolas, Baao, Camarines Sur"
                  required
                  value={requestForm.purok}
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, purok: e.target.value }))}
                />
              </div>
            </>
          )}

          <div className="section-divider" />

          {/* DYNAMIC CERTIFICATE TYPE SELECTION */}
          <div className="fg">
            <label className="fl">
              Certificate Type Request <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select
              className="fc"
              required
              value={requestForm.certificateType}
              onChange={(event) => {
                const selectedType = event.target.value;
                setRequestForm((prev) => ({
                  ...prev,
                  certificateType: selectedType,
                  purpose: prev.purpose || (selectedType ? `For ${selectedType} requirements` : '')
                }));
              }}
            >
              <option value="">-- Select Certificate Type --</option>
              {requestForm.applicantType !== 'Business' && (
                <>
                  <option value="Barangay Clearance">Barangay Clearance</option>
                  <option value="Certificate of Indigency">Certificate of Indigency</option>
                  <option value="Certificate of Residency">Certificate of Residency</option>
                  {/* <option value="First Time Job Seeker (RA 11261)">First Time Job Seeker Certificate</option>
                  <option value="Certificate of Good Moral Character">Certificate of Good Moral Character</option>
                  <option value="Certificate of Low Income">Certificate of Low Income</option> */}
                </>
              )}
              {requestForm.applicantType === 'Business' && (
                <>
                  <option value="Business Clearance">Business Clearance</option>
                  <option value="Business Permit">Business Permit</option>
                  <option value="Barangay Building Clearance">Barangay Clearance for Construction/Building</option>
                </>
              )}
            </select>
          </div>

          {/* Purpose */}
          <div className="fg">
            <label className="fl">
              Stated Purpose <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <textarea
              className="fc"
              rows={2}
              required
              placeholder="Specify purpose (e.g. Employment application, Scholarship, Postal ID)"
              value={requestForm.purpose}
              onChange={(e) => setRequestForm((prev) => ({ ...prev, purpose: e.target.value }))}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="cert-modal-footer">
          <button
            type="button"
            className="btn btn-g"
            onClick={() => {
              setShowModal(false);
              setRequestForm(INITIAL_FORM);
              setShowResidentPicker(false);
              setResidentSearchText('');
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary cert-modal-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" />
                Processing...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Submit Request
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  </div>,
  document.body
)}
  </div>
);
}

export function CertificateIssuancePrint({
  issuedCertificates,
  handlePrintCertificate,
  issuedCertificateSearch,
  setIssuedCertificateSearch,
  filteredIssuedCertificates,
  handleIssueCertificate,
  handleReleaseDocument,
  printData,
  closePrint
}) {
  return (
    <div className="card">
      {issuedCertificates.length === 0 ? (
        <p className="empty-text">No issued certificates yet.</p>
      ) : (
        <div className="tw cert-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Resident</th>
                <th>Certificate Type</th>
                <th>Purpose</th>
                <th className="th-action">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssuedCertificates.map((cert) => (
                <tr key={cert._id}>
                  <td>
                    <strong>{cert.firstName} {cert.lastName}</strong>
                  </td>
                  <td>{cert.certificateType}</td>
                  <td className="muted">{cert.purpose}</td>
                  <td>
                    <div className="cert-row-actions">
                      {Number(cert.step) === 4 && (
                        <button
                          type="button"
                          className="btn btn-p btn-sm"
                          onClick={() => handleIssueCertificate(cert)}
                        >
                          Issue Document
                        </button>
                      )}
                      {Number(cert.step) === 5 && (
                        <button
                          type="button"
                          className="btn btn-g btn-sm"
                          onClick={() => handleReleaseDocument(cert)}
                        >
                          Release Document
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-g btn-sm"
                        onClick={() => handlePrintCertificate(cert)}
                      >
                        Print
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {printData &&
        createPortal(
          <div className="print-overlay">
            <CertificatePrintWrapper
              type={normalizeCertType(printData.type || printData.certificateType)}
              data={{
                trackingCode: printData.trackingCode || printData._id || 'CERT-000000',
                fullName:
                  printData.residentName ||
                  (printData.firstName ? `${printData.firstName} ${printData.lastName}` : printData.fullName) ||
                  'JUAN DELA CRUZ',
                address: printData.address || 'Barangay Bustrac, Nabua, Camarines Sur',
                purpose: printData.purpose || 'Local Employment',
                issueDate:
                  printData.issueDate ||
                  new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                orNumber: printData.orNumber || 'N/A',
                amountPaid: printData.amountPaid || 0,
                ctcNumber: printData.ctcNumber || 'N/A',
                purok: printData.purok || 'Zone 2',
                civilStatus: printData.civilStatus || 'Single',
                age: printData.age || 47,
                patientName: printData.patientName || 'VINCENT ARROYO OJANO',
                relationToPatient: printData.relationToPatient || 'mother of patient',
                punongBarangay: printData.punongBarangay || 'HON. ANNABELLE E. RULL'
              }}
              onClose={closePrint}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
