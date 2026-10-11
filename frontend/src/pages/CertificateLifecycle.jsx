import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import CertificatePrintWrapper from '../components/certificates/CertificatePrintWrapper';
import { createAuditLog } from '../utils/auditLog';
import '../styles/Certificates.css';
import { localDb as db } from '../services/db';
import { getApplicantName, normalizeCertType } from '../utils/certHelpers';

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
  ctc: { name: '', number: '', amountPaid: '', dateIssued: '', placeIssued: '' },
};

const STEP_LABELS = {
  1: 'Submitted',
  2: 'Under Review',
  3: 'Awaiting Approval',
  4: 'Approved',
  5: 'Issued',
  6: 'Released',
};

const STEP_COLORS = {
  1: '#6b7280',
  2: '#3b82f6',
  3: '#f59e0b',
  4: '#10b981',
  5: '#8b5cf6',
  6: '#64748b',
};

const StepBadge = ({ step }) => {
  const key = Number(step);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 700,
        color: '#fff',
        background: STEP_COLORS[key] || '#6b7280',
        whiteSpace: 'nowrap',
      }}
    >
      {STEP_LABELS[key] || `Step ${key}`}
    </span>
  );
};

const showToast = (type, message) => {
  Swal.fire({
    icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
    toast: true,
    position: 'top-end',
    timer: 2500,
    showConfirmButton: false,
    title: message,
  });
};

export default function CertificateLifecycle({ onOpenDispatcher, onOpenIssuance }) {
  const [allRequests, setAllRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [requestForm, setRequestForm] = useState(INITIAL_FORM);
  const [certificateSearch, setCertificateSearch] = useState('');
  const [printData, setPrintData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [residents, setResidents] = useState([]);
  const [showResidentPicker, setShowResidentPicker] = useState(false);
  const [residentSearchText, setResidentSearchText] = useState('');
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedCertificateSearch = certificateSearch.toLowerCase().trim();
  const searchQuery = certificateSearch;

  const incomingRequests = allRequests.filter((req) => Number(req.step) === 1);
  const pendingApprovalRequests = allRequests.filter((req) =>
    [2, 3, 4].includes(Number(req.step))
  );

  const loadResidents = useCallback(async () => {
    try {
      const result = await db.allDocs({ include_docs: true, attachments: false });
      const list = result.rows
        .map((r) => r.doc)
        .filter((d) => d && (d.type === 'resident' || d.type === 'profile' || d.collection === 'residents'));
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
        .sort(
          (a, b) =>
            new Date(b.createdAt || b.requestedAt || 0) -
            new Date(a.createdAt || a.requestedAt || 0)
        );
      setAllRequests(requests);
    } catch (error) {
      console.error('Unable to load certificate requests', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    const changes = db.changes({ live: true, include_docs: true, since: 'now' });
    changes.on('change', (change) => {
      if (!change.doc || change.doc.type !== 'certificate_request') return;
      setAllRequests((prev) => {
        const next = prev.filter((item) => item._id !== change.doc._id);
        const merged = change.deleted ? next : [change.doc, ...next];
        return merged.sort(
          (a, b) =>
            new Date(b.createdAt || b.requestedAt || 0) -
            new Date(a.createdAt || a.requestedAt || 0)
        );
      });
    });
    changes.on('error', (error) => console.error('Certificate changes feed error', error));
    return () => {
      if (changes && typeof changes.cancel === 'function') changes.cancel();
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
      const applyStep = (doc) => {
        const updated = { ...doc, step: nextStep, updatedAt: now };
        if (nextStep === 1) updated.status = 'Submitted';
        if (nextStep === 2) {
          updated.status = 'Under Review';
          updated.reviewedAt = now;
        }
        if (nextStep === 3) updated.status = 'Awaiting Approval';
        if (nextStep === 4) {
          updated.status = 'Approved';
          updated.approvedAt = now;
        }
        if (nextStep === 5) {
          updated.status = 'Issued';
          updated.issuedAt = now;
        }
        if (nextStep === 6) {
          updated.status = 'Released';
          updated.releasedAt = now;
        }
        return updated;
      };
      let fresh = null;
      try {
        fresh = await db.get(request._id);
      } catch (notFound) {
        fresh = request;
      }
      const updatedRequest = applyStep(fresh);
      try {
        await db.put(updatedRequest);
      } catch (conflictErr) {
        if (conflictErr.status === 409 || conflictErr.name === 'conflict') {
          const latest = await db.get(request._id);
          const retryDoc = applyStep(latest);
          await db.put(retryDoc);
          setAllRequests((prev) =>
            prev.map((r) => (r._id === retryDoc._id ? { ...retryDoc, ...r } : r))
          );
          return;
        }
        throw conflictErr;
      }
      setAllRequests((prev) =>
        prev.map((r) => (r._id === updatedRequest._id ? { ...updatedRequest } : r))
      );
    } catch (error) {
      console.error('Unable to update certificate request', error);
      showToast('error', `Unable to update this request: ${error?.message || 'Database error'}`);
    }
  }, []);

  const handleOpenIssuance = (cert) => {
    if (cert && typeof onOpenIssuance === 'function') {
      onOpenIssuance(cert);
      return;
    }
    if (cert) {
      console.warn('onOpenIssuance prop is missing; cannot open issuance workspace.');
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
      purok: resident.purok || resident.address?.purok || 'Purok 1',
    }));
    setShowResidentPicker(false);
    setResidentSearchText('');
  };

  const validateCertificateForm = () => {
    const applicantType = requestForm.applicantType || 'Resident';

    if (!requestForm.certificateType) {
      Swal.fire({ icon: 'warning', title: 'Missing Information', text: 'Please select a Certificate Type.' });
      return false;
    }
    if (!requestForm.purpose?.trim()) {
      Swal.fire({ icon: 'warning', title: 'Missing Information', text: 'Please state the purpose of this certificate.' });
      return false;
    }
    if (applicantType === 'Resident' || applicantType === 'Non-Resident') {
      if (!requestForm.firstName?.trim() || !requestForm.lastName?.trim()) {
        Swal.fire({ icon: 'warning', title: 'Invalid Name', text: 'Please enter the First Name and Last Name.' });
        return false;
      }
    }
    if (applicantType === 'Business') {
      if (!requestForm.businessName?.trim() || !requestForm.ownerName?.trim()) {
        Swal.fire({ icon: 'warning', title: 'Missing Business Info', text: 'Please enter the Business Name and Owner Name.' });
        return false;
      }
      if (!['Business Clearance', 'Business Permit', 'Barangay Clearance'].includes(requestForm.certificateType)) {
        Swal.fire({ icon: 'warning', title: 'Invalid Document', text: 'Please select a valid business document.' });
        return false;
      }
    }
    return true;
  };

  const handleCreateRequest = async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      console.warn('Submission already in progress, ignoring duplicate click');
      return;
    }

    if (!validateCertificateForm()) return;

    setIsSubmitting(true);

    try {
      const storedUser = JSON.parse(localStorage.getItem('bustrac_user') || '{}');
      const currentUser = storedUser.username
        ? storedUser
        : { username: 'Admin Staff', role: 'admin', fullName: 'Admin Staff' };
      const isAdminUser = currentUser?.role === 'admin' || currentUser?.role === 'staff';

      const certResult = await db.allDocs({
        include_docs: true,
        startkey: 'CERT-',
        endkey: 'CERT-\ufff0',
      });
      const allDocs = certResult.rows.map((row) => row.doc);

      // BLOTTER CHECK INTERLOCK
      if (
        requestForm.applicantType === 'Resident' &&
        requestForm.residentId &&
        requestForm.certificateType === 'Barangay Clearance'
      ) {
        const allDocsResult = await db.allDocs({ include_docs: true });
        const residentName = `${requestForm.firstName} ${requestForm.lastName}`.trim().toLowerCase();

        const pendingBlotters = allDocsResult.rows
          .map((row) => row.doc)
          .filter((doc) => {
            const isBlotter = doc.type === 'blotter_record' || doc.docType === 'blotter' || (doc._id && doc._id.toUpperCase().startsWith('BLT-'));
            const isActiveCase = ['Open', 'Under Mediation', 'Pending', 'Scheduled', 'Active'].includes(doc.status);
            const isResidentMatch =
              doc.residentId === requestForm.residentId ||
              (doc.complainant && doc.complainant.toLowerCase().includes(residentName)) ||
              (doc.respondent && doc.respondent.toLowerCase().includes(residentName));
            return isBlotter && isActiveCase && isResidentMatch;
          });

        if (pendingBlotters.length > 0) {
          Swal.fire({
            icon: 'error',
            title: 'Request Blocked',
            html: `This resident has <strong>${pendingBlotters.length} pending blotter case(s)</strong>.<br/><br/>A Barangay Clearance cannot be processed until all cases are settled or resolved.`,
            confirmButtonColor: '#ef4444',
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Resident Cooldown & Limit
      if (requestForm.applicantType === 'Resident' && requestForm.residentId) {
        const existingRequests = allDocs.filter(
          (doc) =>
            doc.residentId === requestForm.residentId &&
            doc.certificateType === requestForm.certificateType
        );

        const now = new Date();
        const recentRequest = existingRequests.find((doc) => {
          const requestDate = new Date(doc.createdAt || doc.requestedAt);
          return (now - requestDate) / (1000 * 60 * 60) < 24;
        });

        if (recentRequest && !isAdminUser) {
          showToast('error', `Cooldown: You already requested a ${requestForm.certificateType} recently.`);
          setIsSubmitting(false);
          return;
        }

        if (recentRequest && isAdminUser) {
          const confirmBypass = window.confirm(
            `Cooldown Warning: A ${requestForm.certificateType} was requested within the last 24 hours.\n\nOverride as Admin?`
          );
          if (!confirmBypass) {
            setIsSubmitting(false);
            return;
          }
        }

        const pendingRequests = existingRequests.filter(
          (doc) =>
            ['Submitted', 'Under Review', 'Pending'].includes(doc.status) || [1, 2].includes(doc.step)
        );

        if (pendingRequests.length >= 3 && !isAdminUser) {
          showToast('error', 'Request Limit Reached: Max 3 pending requests allowed.');
          setIsSubmitting(false);
          return;
        }
      }

      // Business Cooldown
      if (requestForm.applicantType === 'Business' && requestForm.businessName) {
        const businessRequests = allDocs.filter(
          (doc) =>
            doc.businessName === requestForm.businessName &&
            doc.certificateType === requestForm.certificateType
        );

        const now = new Date();
        const recentRequest = businessRequests.find((doc) => {
          const requestDate = new Date(doc.createdAt || doc.requestedAt);
          return (now - requestDate) / (1000 * 60 * 60) < 48;
        });

        if (recentRequest && !isAdminUser) {
          showToast('error', `Business Cooldown: ${requestForm.businessName} already requested this recently.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Payload
      const year = new Date().getFullYear();
      const uniqueSuffix = Date.now().toString().slice(-6) + Math.floor(10 + Math.random() * 90);
      const generatedId = `CERT-${year}-${uniqueSuffix}`;
      const nowIso = new Date().toISOString();

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
        requestedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        ctc: {
          name: requestForm.ctc?.name?.trim() || '',
          number: requestForm.ctc?.number?.trim() || '',
          amountPaid: parseFloat(requestForm.ctc?.amountPaid) || 0,
          dateIssued: requestForm.ctc?.dateIssued || '',
          placeIssued: requestForm.ctc?.placeIssued?.trim() || '',
        },
      };

      if (requestForm.applicantType === 'Resident') {
        newRequestPayload.residentId = requestForm.residentId?.trim() || '';
        newRequestPayload.rbiId = requestForm.rbiId?.trim().toUpperCase() || '';
        newRequestPayload.purok = requestForm.purok || 'Purok 1';
      }

      await db.put(newRequestPayload);

      if (typeof createAuditLog === 'function') {
        try {
          await createAuditLog({
            action: 'CREATE_CERTIFICATE_REQUEST',
            module: 'CERTIFICATES',
            recordId: generatedId,
            actor: {
              username: currentUser.username || 'Admin Staff',
              role: currentUser.role || 'admin',
              fullName: currentUser.fullName || 'Admin Staff',
            },
            details: `New certificate request: ${requestForm.certificateType} for ${
              requestForm.applicantType === 'Business'
                ? requestForm.businessName
                : `${requestForm.firstName || ''} ${requestForm.lastName || ''}`.trim()
            }`,
          });
        } catch (auditError) {
          console.error('Audit log failed (non-blocking):', auditError);
        }
      }

      showToast('success', 'Certificate request submitted successfully!');
      setRequestForm(INITIAL_FORM);
      setShowModal(false);
      setShowResidentPicker(false);
      setResidentSearchText('');
    } catch (error) {
      console.error('Unable to save certificate request', error);
      showToast('error', 'Failed to save certificate request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const reportRequests = allRequests.filter((req) => {
     const q = searchQuery.trim().toLowerCase();
  const applicantName = getApplicantName(req).toLowerCase();
    if (![4, 5, 6].includes(Number(req.step))) return false;

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

      const matches =
        applicantName.includes(normalizedCertificateSearch) ||
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

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="screen active certificate-lifecycle-screen">
       <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
      <button 
        className="btn btn-p" 
        onClick={onOpenDispatcher} // ✅ Gamitin ang prop dito
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New Request
      </button>
    </div>

      {/* ── Stats Cards ── */}
      <div className="cert-lifecycle-stats">
        <div className="cert-stat-card cert-stat-card--incoming">
          <div className="cert-stat-label">Incoming</div>
          <div className="cert-stat-value">{incomingRequests.length}</div>
          <div className="cert-stat-hint">Step 1 · New submissions</div>
        </div>
        <div className="cert-stat-card cert-stat-card--pending">
          <div className="cert-stat-label">Pending Approval</div>
          <div className="cert-stat-value">{pendingApprovalRequests.length}</div>
          <div className="cert-stat-hint">Steps 2–4 · Review to approval</div>
        </div>
        <div className="cert-stat-card cert-stat-card--total">
          <div className="cert-stat-label">Total Requests</div>
          <div className="cert-stat-value">{allRequests.length}</div>
          <div className="cert-stat-hint">All time</div>
        </div>
      </div>

      {/* ── Two Column Cards ── */}
      <div className="cert-columns">
        {/* Incoming Requests */}
        <div className="cert-section-card cert-column-card">
          <div className="cert-section-header">
            <div className="cert-section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
              Incoming Requests
            </div>
            <span className="badge badge--count">{incomingRequests.length}</span>
          </div>

          <div className="cert-table-wrapper cert-table-wrapper--compact">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Certificate & Purpose</th>
                  <th className="th-action">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="3">
                      <div className="loading-cell">
                        <span className="spinner" />
                        Loading requests…
                      </div>
                    </td>
                  </tr>
                ) : incomingRequests.length === 0 ? (
                  <tr>
                    <td colSpan="3">
                      <div className="empty-state">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                        </svg>
                        <span>No incoming requests yet.</span>
                        <span className="empty-state-hint">Click "New Request" to add one.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  incomingRequests.map((req) => (
                    <tr key={req._id}>
                      <td>
                        <div className="cert-cell-name">{getApplicantName(req)}</div>
                        <div className="cert-cell-id">{req._id}</div>
                      </td>
                      <td>
                        <div className="cert-cell-type">{req.certificateType || ''}</div>
                        <div className="cert-cell-purpose">{req.purpose || '—'}</div>
                        {req.revisionReason && (
                          <div className="cert-cell-returned">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            Returned: {req.revisionReason}
                          </div>
                        )}
                      </td>
                      <td className="td-action">
                        <div className="cert-row-actions">
                          <button
                            type="button"
                            className="btn btn-p btn-sm"
                            onClick={() => updateRequest(req, 2)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8" />
                              <path d="m21 21-4.3-4.3" />
                            </svg>
                            Start Review
                          </button>
                          <button
                            type="button"
                            className="btn btn-g btn-sm"
                            onClick={async () => {
                              const reason = window.prompt('Reason for return (e.g., Missing requirements):');
                              if (!reason?.trim()) return;
                              try {
                                const latest = await db.get(req._id);
                                const returnedDoc = {
                                  ...latest,
                                  step: 1,
                                  status: 'Needs Revision',
                                  revisionReason: reason.trim(),
                                  updatedAt: new Date().toISOString(),
                                };
                                await db.put(returnedDoc);
                                setAllRequests((prev) =>
                                  prev.map((r) => (r._id === req._id ? returnedDoc : r))
                                );
                                showToast('success', 'Returned to resident for correction.');
                              } catch (err) {
                                showToast('error', 'Error: ' + err.message);
                              }
                            }}
                          >
                            Return
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Request Processing */}
        <div className="cert-section-card cert-column-card">
          <div className="cert-section-header">
            <div className="cert-section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Request Processing
            </div>
            <span className="badge badge--count">{pendingApprovalRequests.length}</span>
          </div>

          <div className="cert-table-wrapper cert-table-wrapper--compact">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Certificate & Purpose</th>
                  <th>Status</th>
                  <th className="th-action">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4">
                      <div className="loading-cell">
                        <span className="spinner" />
                        Loading…
                      </div>
                    </td>
                  </tr>
                ) : pendingApprovalRequests.length === 0 ? (
                  <tr>
                    <td colSpan="4">
                      <div className="empty-state">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span>No pending approvals.</span>
                        <span className="empty-state-hint">Start a review from Incoming to move items here.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingApprovalRequests.map((req) => (
                    <tr key={req._id}>
                      <td>
                        <div className="cert-cell-name">{getApplicantName(req)}</div>
                        <div className="cert-cell-id">{req._id}</div>
                      </td>
                      <td>
                        <div className="cert-cell-type">{req.certificateType || '—'}</div>
                        <div className="cert-cell-purpose">{req.purpose || '—'}</div>
                      </td>
                      <td>
                        <StepBadge step={req.step} />
                      </td>
                      <td className="td-action">
                        <div className="cert-row-actions">
                          {req.step === 2 && (
                            <button
                              type="button"
                              className="btn btn-s btn-sm"
                              onClick={() => updateRequest(req, 3)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Send for Approval
                            </button>
                          )}
                          {req.step === 3 && (
                            <button
                              type="button"
                              className="btn btn-p btn-sm"
                              onClick={() => updateRequest(req, 4)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              Approve
                            </button>
                          )}
                          {req.step === 4 && (
                            <button
                              type="button"
                              className="btn btn-p btn-sm"
                              onClick={() => handleOpenIssuance(req)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              Issue Document
                            </button>
                          )}
                          {req.step <= 3 && (
                            <button
                              type="button"
                              className="btn btn-d btn-sm"
                              onClick={async () => {
                                const reason = window.prompt('Reason for return:');
                                if (!reason?.trim()) return;
                                try {
                                  const latest = await db.get(req._id);
                                  const returnedDoc = {
                                    ...latest,
                                    step: 1,
                                    status: 'Needs Revision',
                                    revisionReason: reason.trim(),
                                    updatedAt: new Date().toISOString(),
                                  };
                                  await db.put(returnedDoc);
                                  setAllRequests((prev) =>
                                    prev.map((r) => (r._id === req._id ? returnedDoc : r))
                                  );
                                  showToast('success', 'Returned to resident for correction.');
                                } catch (err) {
                                  showToast('error', 'Error: ' + err.message);
                                }
                              }}
                            >
                              Return
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODAL — New Certificate Request
          ══════════════════════════════════════════════════════════════ */}
      {showModal && createPortal(
        <div className="cert-modal-overlay">
          <div className="cert-modal cert-modal--wide">
            <div className="cert-modal-header">
              <div className="cert-modal-header-left">
                <div className="cert-modal-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div className="cert-modal-titles">
                  <h3>New Certificate Request</h3>
                  <span className="cert-modal-subtitle">Fill in applicant details below</span>
                </div>
              </div>
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="cert-modal-form">
              <div className="cert-modal-body">
                {/* Applicant Type */}
                <div className="fg">
                  <label className="fl">
                    Applicant Classification <span className="req">*</span>
                  </label>
                  <select
                    className="fc"
                    value={requestForm.applicantType}
                    onChange={(event) =>
                      setRequestForm((prev) => ({
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
                        lastName: '',
                      }))
                    }
                  >
                    <option value="Resident">Resident (Local Citizen)</option>
                    <option value="Non-Resident">Non-Resident / Walk-in Applicant</option>
                    <option value="Business">Commercial / Business Entity</option>
                  </select>
                </div>

                <div className="section-divider" />

                {/* RESIDENT FLOW */}
                {requestForm.applicantType === 'Resident' && (
                  <>
                    <div className="fg" style={{ position: 'relative' }}>
                      <label className="fl fl--between">
                        <span>Search & Link Resident Profile <span className="req">*</span></span>
                        {requestForm.residentId && (
                          <span className="cert-link-badge">
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

                      {showResidentPicker && (
                        <div className="resident-picker" ref={residentPickerRef}>
                          <div className="search-wrapper">
                            <input
                              type="text"
                              className="fc"
                              placeholder="Type name to search resident…"
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

                {/* BUSINESS FLOW */}
                {requestForm.applicantType === 'Business' && (
                  <>
                    <div className="fg">
                      <label className="fl">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 21V11a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v10" />
                          <path d="M2 21h20" />
                          <path d="M6 9h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2z" />
                        </svg>
                        Registered Business Name <span className="req">*</span>
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
                        Owner / Authorized Representative <span className="req">*</span>
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
                      <label className="fl">External Address (Outside Barangay)</label>
                      <input
                        className="fc"
                        placeholder="e.g. San Miguel, Iriga City"
                        value={requestForm.addressOutsideBarangay || ''}
                        onChange={(e) => setRequestForm((prev) => ({ ...prev, addressOutsideBarangay: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                {/* Certificate Type */}
                <div className="fg">
                  <label className="fl">
                    Certificate Type <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <select
                    className="fc"
                    required
                    value={requestForm.certificateType}
                    onChange={(e) => {
                      const selectedType = e.target.value;
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
  closePrint,
  showCreateModal,
  setShowCreateModal,
  navigate
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
                  <td><strong>{cert.firstName} {cert.lastName}</strong></td>
                  <td>{cert.certificateType}</td>
                  <td className="muted">{cert.purpose}</td>
                  <td>
                    <div className="cert-row-actions">
                      {Number(cert.step) === 4 && (
                        <button type="button" className="btn btn-p btn-sm" onClick={() => handleIssueCertificate(cert)}>
                          Issue Document
                        </button>
                      )}
                      {Number(cert.step) === 5 && (
                        <button type="button" className="btn btn-g btn-sm" onClick={() => handleReleaseDocument(cert)}>
                          Release Document
                        </button>
                      )}
                      <button type="button" className="btn btn-g btn-sm" onClick={() => handlePrintCertificate(cert)}>
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

      {printData && createPortal(
        <div className="print-overlay">
          <CertificatePrintWrapper
            type={normalizeCertType(printData.type || printData.certificateType)}
            data={{
              _id: printData._id,
              certificateType: printData.type || printData.certificateType,
              trackingCode: printData.trackingCode || printData._id || 'CERT-000000',
              fullName: printData.residentName || (printData.firstName ? `${printData.firstName} ${printData.lastName}` : printData.fullName) || '',
              firstName: printData.firstName || '',
              lastName: printData.lastName || '',
              address: printData.address || printData.purok || '',
              purpose: printData.purpose || '',
              issueDate: printData.issueDate || new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }),
              ctcNumber: printData.ctc?.number || printData.ctcNumber || '',
              amountPaid: printData.ctc?.amountPaid || printData.amountPaid || 0,
              civilStatus: printData.civilStatus || '',
              age: printData.age || '',
              punongBarangay: printData.punongBarangay || '',
            }}
            onClose={closePrint}
          />
        </div>,
        document.body
      )}
      {/* ═══ ROUTING MODAL: Choose Clearance Type ═══ */}   
      {/* ═══ ROUTING MODAL: Choose Clearance Type ═══ */}
{showCreateModal && createPortal(
  <div 
    className="cert-modal-overlay" 
    onClick={() => setShowCreateModal(false)}
  >
    <div 
      className="cert-modal" 
      style={{ maxWidth: '500px', textAlign: 'center' }} 
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: '32px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M12 18v-6" />
            <path d="M9 15h6" />
          </svg>
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '800', color: 'var(--text)' }}>
          Create New Clearance
        </h3>
        <p style={{ margin: '0 0 24px', color: 'var(--muted)', fontSize: '14px', lineHeight: 1.5 }}>
          Select the type of clearance you want to process. You will be redirected to the dedicated form.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            className="btn btn-p" 
            style={{ padding: '16px', fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }} 
            onClick={() => {
              setShowCreateModal(false);
              navigate('/admin?page=brgy_clearance'); // ✅ Seamless SPA Navigation
            }}
          >
            📄 Barangay Clearance (Individual)
          </button>
          
          <button 
            className="btn btn-g" 
            style={{ padding: '16px', fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }} 
            onClick={() => {
              setShowCreateModal(false);
              navigate('/admin?page=business_clearance'); // ✅ Seamless SPA Navigation
            }}
          >
            🏢 Business Clearance
          </button>
        </div>
        
        <button 
          className="btn btn-g btn-sm" 
          style={{ marginTop: '24px' }} 
          onClick={() => setShowCreateModal(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>,
  document.body
)}
    </div>
  );
}
