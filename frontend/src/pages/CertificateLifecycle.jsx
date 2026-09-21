import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PouchDB from 'pouchdb-browser';
import CertificatePrintWrapper from '../components/certificates/CertificatePrintWrapper';
import { logActivity } from '../utils/auditLog';

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

const formatDateTime = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
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

  const handleCreateRequest = async (event) => {
    event.preventDefault();
    if (!validateCertificateForm()) return;
    try {
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
      alert('Certificate request submitted and queued for issuance preview!');
      setRequestForm(INITIAL_FORM);
      setShowModal(false);
      setShowResidentPicker(false);
      setResidentSearchText('');
    } catch (error) {
      console.error('Unable to save certificate request', error);
      alert('Failed to synchronize transaction with database engine.');
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
    {/* ── Top Action Bar ── */}
    

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

   

    {showModal &&
  createPortal(
    <div className="cert-modal-overlay" style={{
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.75)',
  backdropFilter: 'blur(4px)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justify: 'center',
  padding: '16px'
}}>
  <div className="cert-modal" style={{
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '540px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    overflow: 'hidden'
  }}>
    
    {/* Modal Header */}
    <div className="cert-modal-header" style={{
      padding: '16px 20px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'rgba(30, 41, 59, 0.5)'
    }}>
      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
        📜 New Certificate Request
      </h3>
      <button 
        type="button" 
        className="cert-modal-close" 
        onClick={() => {
          setShowModal(false);
          setRequestForm(INITIAL_FORM);
          setShowResidentPicker(false);
          setResidentSearchText('');
        }}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          fontSize: '18px',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: '4px'
        }}
      >
        ✕
      </button>
    </div>

    {/* Form Body */}
    <form onSubmit={handleCreateRequest} className="cert-modal-form" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="cert-modal-body" style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        
        {/* Applicant Type Selection */}
        <div className="fg">
          <label className="fl" style={{ fontWeight: 600 }}>Applicant Classification <span style={{ color: 'var(--red)' }}>*</span></label>
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
            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
          >
            <option value="Resident">👤 Resident (Local Citizen)</option>
            <option value="Non-Resident">🌐 Non-Resident / Walk-in Applicant</option>
            <option value="Business">🏢 Commercial / Business Entity</option>
          </select>
        </div>

        <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

        {/* RESIDENT APPLICANT FLOW */}
        {requestForm.applicantType === 'Resident' && (
          <>
            <div className="fg" style={{ position: 'relative' }}>
              <label className="fl" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Search & Link Resident Profile <span style={{ color: 'var(--red)' }}>*</span></span>
                {requestForm.residentId && <span style={{ color: '#10b981', fontSize: '11px', fontWeight: 600 }}>✓ Resident Linked</span>}
              </label>
              
              <button 
                type="button" 
                className="btn btn-g btn-sm" 
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px' }} 
                onClick={() => setShowResidentPicker((prev) => !prev)}
              >
                {showResidentPicker ? '✕ Close Resident Registry' : '🔍 Select from Resident Registry'}
              </button>

              {/* Dynamic Overlay Resident Picker */}
              {showResidentPicker && (
                <div 
                  className="resident-picker" 
                  ref={residentPickerRef}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
                    zIndex: 20,
                    marginTop: '4px'
                  }}
                >
                  <input 
                    type="text" 
                    className="fc" 
                    placeholder="Type name to search resident..." 
                    value={residentSearchText} 
                    onChange={(e) => setResidentSearchText(e.target.value)} 
                    style={{ marginBottom: '8px', fontSize: '12px', width: '100%' }}
                    autoFocus
                  />
                  <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                          style={{
                            padding: '8px 10px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'rgba(255,255,255,0.03)',
                            display: 'flex',
                            justify: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px'
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {resident.firstName || resident.fname} {resident.lastName || resident.lname}
                          </span>
                          <span style={{ fontSize: '10px', opacity: 0.7 }}>
                            {resident.purok || resident.address?.purok || 'No Purok'}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="fg">
                <label className="fl muted" style={{ fontSize: '11px' }}>Resident System ID</label>
                <input className="fc" value={requestForm.residentId || ''} readOnly disabled placeholder="Auto-filled" style={{ opacity: 0.7 }} />
              </div>
              <div className="fg">
                <label className="fl muted" style={{ fontSize: '11px' }}>RBI Record ID</label>
                <input className="fc" value={requestForm.rbiId || ''} readOnly disabled placeholder="Auto-filled" style={{ opacity: 0.7 }} />
              </div>
            </div>

            <div className="fg">
              <label className="fl muted" style={{ fontSize: '11px' }}>Registered Purok Location</label>
              <input className="fc" value={requestForm.purok || ''} readOnly disabled placeholder="Auto-filled upon selection" style={{ opacity: 0.7 }} />
            </div>
          </>
        )}

        {/* BUSINESS APPLICANT FLOW */}
        {requestForm.applicantType === 'Business' && (
          <>
            <div className="fg">
              <label className="fl">Registered Business Name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input 
                className="fc" 
                placeholder="e.g. ABC Store & Trading Services" 
                required
                value={requestForm.businessName} 
                onChange={(e) => setRequestForm((prev) => ({ ...prev, businessName: e.target.value }))} 
              />
            </div>
            <div className="fg">
              <label className="fl">Owner / Authorized Representative <span style={{ color: 'var(--red)' }}>*</span></label>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
              <label className="fl">Complete Origin Address <span style={{ color: 'var(--red)' }}>*</span></label>
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

        <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

        {/* DYNAMIC CERTIFICATE TYPE SELECTION */}
        <div className="fg">
          <label className="fl">Certificate Type Request <span style={{ color: 'var(--red)' }}>*</span></label>
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

            {/* Individual / Resident Certificates */}
            {requestForm.applicantType !== 'Business' && (
              <>
                <option value="Barangay Clearance">Barangay Clearance</option>
                <option value="Certificate of Indigency">Certificate of Indigency</option>
                <option value="Certificate of Residency">Certificate of Residency</option>
                <option value="First Time Job Seeker (RA 11261)">First Time Job Seeker Certificate</option>
                <option value="Certificate of Good Moral Character">Certificate of Good Moral Character</option>
                <option value="Certificate of Low Income">Certificate of Low Income</option>
              </>
            )}

            {/* Business Certificates */}
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
          <label className="fl">Stated Purpose <span style={{ color: 'var(--red)' }}>*</span></label>
          <textarea 
            className="fc" 
            rows={2} 
            required
            placeholder="Specify purpose (e.g. Employment application, Scholarship, Postal ID)" 
            value={requestForm.purpose} 
            onChange={(e) => setRequestForm((prev) => ({ ...prev, purpose: e.target.value }))} 
            style={{ resize: 'vertical', minHeight: '60px' }} 
          />
        </div>

      </div>

      {/* Modal Footer */}
      <div className="cert-modal-footer" style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justify: 'flex-end',
        gap: '8px',
        background: 'rgba(30, 41, 59, 0.3)'
      }}>
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
        <button type="submit" className="btn btn-primary cert-modal-submit">
          Submit Certificate Request
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
