import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import BarangayClearance from '../components/certificates/templates/BarangayClearance';
import BusinessPermit from '../components/certificates/templates/BusinessPermit';
import IndigencyTemplate from '../components/certificates/templates/IndigencyTemplate';
import ResidencyCertificate from '../components/certificates/templates/ResidencyCertificate';
import '../styles/Certificates.css';
import PouchDB from 'pouchdb-browser';

const db = new PouchDB('bustrachub_db');

// ── Date Formatter Helper ──
const formatDateTime = (dateString) => {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
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

// ── API Helper: Save to CouchDB / PouchDB ──
const saveCertificateToCouchDB = async (payload) => {
  try {
    if (!payload || !payload._id) {
      throw new Error("Missing document ID (_id) for saving.");
    }
    const existingDoc = await db.get(payload._id);
    const updatedDoc = {
      ...existingDoc,
      ...payload,
      status: 'Issued',
      issuedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      issuanceMeta: {
        ...(existingDoc.issuanceMeta || {}),
        ...(payload.issuanceMeta || {}),
      },
      _rev: existingDoc._rev
    };
    const response = await db.put(updatedDoc);
    return response;
  } catch (err) {
    console.error("Error saving certificate to PouchDB:", err);
    throw err;
  }
};

// ── API Helper: Fetch Issued Certificates from CouchDB ──
const fetchIssuedCertificatesFromDB = async () => {
  try {
    const result = await db.allDocs({
      include_docs: true,
      startkey: 'CERT-',
      endkey: 'CERT-\ufff0'
    });
    const allDocs = result.rows.map((row) => row.doc);
    const issuedCertificates = allDocs.filter(
      (doc) => doc && doc.type === 'certificate_request' && ['Approved', 'Issued', 'Released'].includes(doc.status)
    );
    return issuedCertificates;
  } catch (error) {
    console.error('Error fetching issued certificates from PouchDB:', error);
    return [];
  }
};

export default function CertPrintScreen({
  approvedCertificates = [],
  selectedCertificate,
  setSelectedCertificate,
  clearSelectedCert,
  issuanceMeta,
  setIssuanceMeta,
  blotterVerifyQuery,
  setBlotterVerifyQuery,
  blotterMatches = [],
  handlePrintFormat,
  handleSaveOnly,
  handlePrintDocument,
  issuedCertificates = [],
  showPrintModal,
  setShowPrintModal,
  selectedPrintCert,
  setSelectedPrintCert,
  printMode,
  setPrintMode
}) {
  const [localPrintMode, setLocalPrintMode] = useState('original');
  const [localShowPrintModal, setLocalShowPrintModal] = useState(false);
  const [localSelectedPrintCert, setLocalSelectedPrintCert] = useState(null);
  const [dbIssuedCertificates, setDbIssuedCertificates] = useState([]);
  const [loading, setLoading] = useState(true);

  const workspaceRef = useRef(null);

  const loadIssuedCertificates = useCallback(async () => {
    try {
      setLoading(true);
      const result = await db.allDocs({
        include_docs: true,
        startkey: 'CERT-',
        endkey: 'CERT-\ufff0'
      });
      const allDocs = result.rows.map((row) => row.doc);
      const issuedCertificates = allDocs.filter(
        (doc) => doc && doc.type === 'certificate_request' && ['Approved', 'Issued', 'Released'].includes(doc.status)
      );
      setDbIssuedCertificates(issuedCertificates);
    } catch (error) {
      console.error('Error fetching issued certificates from PouchDB:', error);
      setDbIssuedCertificates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIssuedCertificates();
    const changes = db.changes({ live: true, include_docs: true, since: 'now' }).on('change', (change) => {
      if (change.doc && change.doc.type === 'certificate_request') {
        loadIssuedCertificates();
      }
    });
    return () => changes.cancel();
  }, [loadIssuedCertificates]);

  // LocalStorage backup persistence
  const [localBackupCertificates, setLocalBackupCertificates] = useState(() => {
    try {
      const saved = localStorage.getItem('issued_certificates_backup');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    if (Array.isArray(issuedCertificates) && issuedCertificates.length > 0) {
      localStorage.setItem('issued_certificates_backup', JSON.stringify(issuedCertificates));
      setLocalBackupCertificates(issuedCertificates);
    }
  }, [issuedCertificates]);

  // Fallback states
  const setPrintModeFn = setPrintMode ?? setLocalPrintMode;
  const setSelectedPrintCertFn = setSelectedPrintCert ?? setLocalSelectedPrintCert;

  const loadIssuedRecords = useCallback(async () => {
    const records = await fetchIssuedCertificatesFromDB();
    if (records && records.length > 0) {
      setDbIssuedCertificates(records);
    }
  }, []);

  useEffect(() => {
    loadIssuedRecords();
  }, [loadIssuedRecords]);

  const handleCloseWorkspace = useCallback(() => {
    if (typeof clearSelectedCert === 'function') {
      clearSelectedCert();
    } else if (typeof setSelectedCertificate === 'function') {
      setSelectedCertificate(null);
    }
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.pushState({}, '', url.toString());
    }
  }, [clearSelectedCert, setSelectedCertificate]);

  // ── Handler for 'Save Record' Button ──
  const handleSaveOnlyAction = async () => {
    if (!issuanceMeta?.orNumber || !issuanceMeta.orNumber.trim()) {
      alert('An Official Receipt (OR) Number is required before saving!');
      return;
    }
    try {
      const payload = {
        ...selectedCertificate,
        issuanceMeta,
        // Root properties for direct template compatibility
        orNumber: issuanceMeta.orNumber,
        orDate: issuanceMeta.dateIssued,
        dateIssued: issuanceMeta.dateIssued,
        amountPaid: issuanceMeta.amountPaid,
        purpose: issuanceMeta.purpose || selectedCertificate?.purpose,
        remarks: issuanceMeta.remarks,
        // Flattened CTC properties
        ctcNo: issuanceMeta.ctcNumber || selectedCertificate?.ctc?.number,
        ctcAmount: issuanceMeta.ctcAmountPaid || selectedCertificate?.ctc?.amountPaid,
        ctcDate: issuanceMeta.ctcDateIssued || selectedCertificate?.ctc?.dateIssued,
        ctc: {
          number: issuanceMeta.ctcNumber || selectedCertificate?.ctc?.number || '',
          amountPaid: issuanceMeta.ctcAmountPaid || selectedCertificate?.ctc?.amountPaid || 0,
          dateIssued: issuanceMeta.ctcDateIssued || selectedCertificate?.ctc?.dateIssued || issuanceMeta.dateIssued || '',
          placeIssued: selectedCertificate?.ctc?.placeIssued || 'NABUA, CAMARINES SUR',
        },
        blotterVerifyQuery,
        blotterMatches,
      };

      const res = await saveCertificateToCouchDB(payload);
      alert('Certificate record successfully saved!');
      await loadIssuedRecords();
      handleCloseWorkspace();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  };

  // ── Handler for 'Print Document' Button ──
  const handlePrintDocumentAction = async () => {
    if (!issuanceMeta?.orNumber || !issuanceMeta.orNumber.trim()) {
      alert('An Official Receipt (OR) Number is required before printing!');
      return;
    }
    try {
      const payload = {
        ...selectedCertificate,
        issuanceMeta,
        // Root properties for direct template compatibility
        orNumber: issuanceMeta.orNumber,
        orDate: issuanceMeta.dateIssued,
        dateIssued: issuanceMeta.dateIssued,
        amountPaid: issuanceMeta.amountPaid,
        purpose: issuanceMeta.purpose || selectedCertificate?.purpose,
        remarks: issuanceMeta.remarks,
        // Flattened CTC properties
        ctcNo: issuanceMeta.ctcNumber || selectedCertificate?.ctc?.number,
        ctcAmount: issuanceMeta.ctcAmountPaid || selectedCertificate?.ctc?.amountPaid,
        ctcDate: issuanceMeta.ctcDateIssued || selectedCertificate?.ctc?.dateIssued,
        ctc: {
          number: issuanceMeta.ctcNumber || selectedCertificate?.ctc?.number || '',
          amountPaid: issuanceMeta.ctcAmountPaid || selectedCertificate?.ctc?.amountPaid || 0,
          dateIssued: issuanceMeta.ctcDateIssued || selectedCertificate?.ctc?.dateIssued || issuanceMeta.dateIssued || '',
          placeIssued: selectedCertificate?.ctc?.placeIssued || 'NABUA, CAMARINES SUR',
        },
        blotterVerifyQuery,
        blotterMatches,
      };

      // 1. Save to database
      await saveCertificateToCouchDB(payload);

      // 2. Refresh reprint queue
      await loadIssuedRecords();

      // 3. Set target cert and trigger print
      if (typeof setSelectedPrintCertFn === 'function') {
        setSelectedPrintCertFn(payload);
      }
      setPrintModeFn('standard');

      if (typeof handlePrintDocument === 'function') {
        handlePrintDocument(payload);
      } else {
        setTimeout(() => window.print(), 250);
      }
    } catch (err) {
      alert('Cannot print because saving failed: ' + err.message);
    }
  };

  const handleReprint = useCallback((cert) => {
  if (!cert) return;

  setSelectedCertificate(cert);
  if (typeof setSelectedPrintCertFn === 'function') {
    setSelectedPrintCertFn(cert);
  }
  if (typeof setPrintModeFn === 'function') {
    setPrintModeFn('copy');
  }

  setTimeout(() => {
    if (typeof handlePrintDocument === 'function') {
      handlePrintDocument(cert);
    } else {
      window.print();
    }
  }, 300);
}, [setSelectedCertificate, setSelectedPrintCertFn, setPrintModeFn, handlePrintDocument]);

  const issuedAndReleased = useMemo(() => {
    const sourceList = dbIssuedCertificates.length > 0 ? dbIssuedCertificates : (Array.isArray(issuedCertificates) && issuedCertificates.length > 0) ? issuedCertificates : localBackupCertificates;
    return sourceList.filter((c) => [5, 6].includes(Number(c.step)) || c.status === 'Issued' || c.status === 'Released' || c.isIssued === true);
  }, [dbIssuedCertificates, issuedCertificates, localBackupCertificates]);

  const currentSelectedId = selectedCertificate?._id;
  useEffect(() => {
    if (!approvedCertificates || approvedCertificates.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const certIdFromUrl = params.get('id');
    if (certIdFromUrl) {
      const matchedCert = approvedCertificates.find((c) => String(c._id) === String(certIdFromUrl));
      if (matchedCert && String(currentSelectedId) !== String(matchedCert._id)) {
        setSelectedCertificate(matchedCert);
      }
    }
  }, [approvedCertificates, currentSelectedId, setSelectedCertificate]);

  // Default OR details allocation
  useEffect(() => {
    if (selectedCertificate) {
      let defaultAmount = 50;
      const type = (selectedCertificate.certificateType || selectedCertificate.type || '').toLowerCase();
      if (type.includes('indigency') || type.includes('job seeker')) {
        defaultAmount = 0;
      } else if (type.includes('business')) {
        defaultAmount = 200;
      }
      setIssuanceMeta((prev) => ({
        ...prev,
        purpose: prev.purpose || selectedCertificate.purpose || selectedCertificate.certPurpose || '',
        orNumber: prev.orNumber || `OR-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
        amountPaid: prev.amountPaid !== undefined && prev.amountPaid !== '' ? prev.amountPaid : defaultAmount,
        dateIssued: prev.dateIssued || new Date().toISOString().split('T')[0]
      }));
    }
  }, [selectedCertificate, setIssuanceMeta]);

  const handleSelectAndSyncUrl = useCallback((cert) => {
    setSelectedCertificate(cert);
    const url = new URL(window.location.href);
    if (cert?._id) {
      url.searchParams.set('id', cert._id);
    } else {
      url.searchParams.delete('id');
    }
    window.history.pushState({}, '', url.toString());
  }, [setSelectedCertificate]);

  const getApplicantName = (cert) => {
    if (cert.applicantType === 'Business' || cert.businessName) {
      return `${cert.businessName || 'Business'} (${cert.ownerName || 'No Owner'})`;
    }
    const fullName = `${cert.firstName || ''} ${cert.lastName || ''}`.trim();
    return fullName || cert.fullName || 'Unnamed Applicant';
  };

  return (
    <div className="cert-print-screen" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ═══ SECTION 1: APPROVED CERTIFICATES QUEUE ═══ */}
      <div className="cert-section-card">
        <div className="cert-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div className="cert-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '16px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Ready for Issuance & Printing
          </div>
          <span className="badge b">{approvedCertificates.length} Approved</span>
        </div>
        <div className="cert-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Resident / Business</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {approvedCertificates.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-cell" style={{ textAlign: 'center', padding: '20px' }}>
                    No approved certificates waiting for issuance.
                  </td>
                </tr>
              ) : (
                approvedCertificates.map((cert) => {
                  const isSelected = String(selectedCertificate?._id) === String(cert._id);
                  return (
                    <tr
                      key={cert._id}
                      className={isSelected ? 'row-selected' : ''}
                      onClick={() => handleSelectAndSyncUrl(cert)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="mono id-cell">{cert._id}</td>
                      <td><strong>{getApplicantName(cert)}</strong></td>
                      <td>{cert.certificateType || cert.certType || '—'}</td>
                      <td className="muted">{cert.purpose || cert.certPurpose || '—'}</td>
                      <td><span className="badge g">{cert.status || 'Approved'}</span></td>
                      <td className="text-right">
                        <button
                          type="button"
                          className={`btn btn-sm ${isSelected ? 'btn-p' : 'btn-g'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectAndSyncUrl(cert);
                            setTimeout(() => {
                              if (workspaceRef.current) {
                                workspaceRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }, 150);
                          }}
                        >
                          {isSelected ? 'Processing...' : 'Process'}
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

      {/* ── ISSUED & RELEASED — REPRINT QUEUE ── */}
      <div className="cert-section-card">
        <div className="cert-section-header">
          <div className="cert-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Issued & Released Records — Reprint Queue
          </div>
          <span className="badge a">{issuedAndReleased.length} Issued</span>
        </div>
        <div className="cert-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Resident / Business</th>
                <th>Type</th>
                <th>Status</th>
                <th>Issued At</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {issuedAndReleased.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    No issued certificates yet. Maglalabas dito ang mga record pagkatapos ma-print o ma-save.
                  </td>
                </tr>
              ) : (
                issuedAndReleased.map((cert) => (
                  <tr key={cert._id}>
                    <td className="mono id-cell">
                      {cert.requestId || cert._id?.replace('issued_cert_', '')}
                    </td>
                    <td><strong>{getApplicantName(cert)}</strong></td>
                    <td>{cert.certificateType || cert.certType || '—'}</td>
                    <td>
                      <span className={`badge ${cert.status === 'Released' ? 'g' : 'a'}`}>
                        {cert.status}
                      </span>
                    </td>
                    <td className="mono muted">
                      {formatDateTime(cert.issuedAt || cert.updatedAt || cert.createdAt)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-g btn-sm"
                        onClick={() => handleReprint(cert)}
                        title="Print duplicate copy"
                      >
                        🖨️ Reprint Copy
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ SECTION 2: ISSUANCE WORKSPACE ═══ */}
      <div className="cert-section-card" ref={workspaceRef} style={{ scrollMarginTop: '80px' }}>
        <div className="cert-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div className="cert-section-title" style={{ fontWeight: 600, fontSize: '16px' }}>
            Issuance Workspace
          </div>
          {selectedCertificate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge b">
                Selected: {selectedCertificate.certificateType || selectedCertificate.certType || 'Certificate'}
              </span>
              <button
                type="button"
                className="btn btn-g btn-sm"
                onClick={handleCloseWorkspace}
                title="Deselect Certificate"
              >
                ✕ Close Workspace
              </button>
            </div>
          )}
        </div>

        {selectedCertificate ? (
          <div className="cert-workspace-panel">
            <div className="cert-workspace-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
              {/* Left Column: Blotter Verification */}
              <div className="cert-sidebar">
                <div className="fp cert-panel" style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: '8px' }}>
                  <div className="fp-t" style={{ fontWeight: 600, marginBottom: '10px' }}>Blotter Verification</div>
                  <input
                    className="fc"
                    placeholder="Search last name in blotter..."
                    value={blotterVerifyQuery}
                    onChange={(e) => setBlotterVerifyQuery(e.target.value)}
                    style={{ marginBottom: '10px' }}
                  />
                  <div className="cert-mini-table-wrap" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '10px' }}>
                    <table className="cert-mini-table" style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>Respondent</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blotterMatches.length > 0 ? (
                          blotterMatches.map((b, idx) => (
                            <tr key={b.id || b._id || idx}>
                              <td>{b.respondent || b.respName || '—'}</td>
                              <td>
                                <span className={`badge ${b.status === 'Resolved' ? 'g' : b.status === 'Under Mediation' ? 'a' : 'r'}`}>
                                  {b.status || 'Open'}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="2" className="empty-cell" style={{ textAlign: 'center' }}>
                              {blotterVerifyQuery ? 'No derogatory records found.' : 'Type name to verify blotter.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <label className="cert-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={issuanceMeta.noDerogatoryRecord || false}
                      onChange={(e) => setIssuanceMeta({ ...issuanceMeta, noDerogatoryRecord: e.target.checked })}
                    />
                    <strong>No Derogatory Record Found</strong>
                  </label>
                </div>
              </div>

              {/* Right Column: Receipt, CTC Details, and Action Buttons */}
              <div className="cert-main" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* Receipt Details */}
                <div className="fp cert-panel" style={{ border: '1px solid var(--border-color, #e2e8f0)', padding: '16px', borderRadius: '8px' }}>
                  <div className="fp-t accent" style={{ fontWeight: 600, marginBottom: '12px' }}>Receipt Details & Purpose</div>
                  <div className="cert-form-row cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>Purpose <span className="req" style={{ color: 'red' }}>*</span></label>
                      <input
                        className="fc"
                        value={issuanceMeta.purpose || ''}
                        onChange={(e) => setIssuanceMeta(prev => ({ ...prev, purpose: e.target.value }))}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>Remarks</label>
                      <input
                        className="fc"
                        value={issuanceMeta.remarks || ''}
                        onChange={(e) => setIssuanceMeta(prev => ({ ...prev, remarks: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="cert-form-row cols-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>Date Issued <span className="req" style={{ color: 'red' }}>*</span></label>
                      <input
                        type="date"
                        className="fc"
                        value={issuanceMeta.dateIssued || ''}
                        onChange={(e) => setIssuanceMeta(prev => ({ ...prev, dateIssued: e.target.value }))}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>OR No. <span className="req" style={{ color: 'red' }}>*</span></label>
                      <input
                        type="text"
                        className="fc"
                        placeholder="OR-2026-XXXXX"
                        value={issuanceMeta.orNumber || ''}
                        onChange={(e) => setIssuanceMeta(prev => ({ ...prev, orNumber: e.target.value }))}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>Amt. Paid <span className="req" style={{ color: 'red' }}>*</span></label>
                      <input
                        type="number"
                        className="fc"
                        value={issuanceMeta.amountPaid !== undefined ? issuanceMeta.amountPaid : ''}
                        onChange={(e) => setIssuanceMeta(prev => ({ ...prev, amountPaid: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* CTC Details */}
                <div className="fp cert-panel" style={{ border: '1px solid var(--border-color, #e2e8f0)', padding: '16px', borderRadius: '8px' }}>
                  <div className="fp-t accent" style={{ fontWeight: 600, marginBottom: '12px' }}>Community Tax Certificate (CTC) Details</div>
                  <div className="cert-form-row cols-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>CTC No.</label>
                      <input
                        className="fc"
                        value={issuanceMeta.ctcNumber || ''}
                        onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcNumber: e.target.value }))}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>CTC Amt. Paid</label>
                      <input
                        type="number"
                        className="fc"
                        value={issuanceMeta.ctcAmountPaid || ''}
                        onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcAmountPaid: e.target.value }))}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>CTC Date Issued</label>
                      <input
                        type="date"
                        className="fc"
                        value={issuanceMeta.ctcDateIssued || issuanceMeta.dateIssued || ''}
                        onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcDateIssued: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="cert-action-bar no-print" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    className="btn btn-g"
                    onClick={() => {
                      if (!issuanceMeta?.orNumber?.trim()) {
                        alert('An Official Receipt (OR) Number is required before printing!');
                        return;
                      }
                      setPrintModeFn('original');
                      setTimeout(() => window.print(), 250);
                    }}
                  >
                    Print Original
                  </button>
                  <button
                    type="button"
                    className="btn btn-g"
                    onClick={() => {
                      if (!issuanceMeta?.orNumber?.trim()) {
                        alert('An Official Receipt (OR) Number is required before printing!');
                        return;
                      }
                      setPrintModeFn('copy');
                      setTimeout(() => window.print(), 250);
                    }}
                  >
                    Print Copy
                  </button>
                  <button type="button" className="btn btn-p" onClick={handleSaveOnlyAction}>
                    Save Record
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handlePrintDocumentAction}>
                    Print Document
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="cert-empty-state" style={{ padding: '32px', textAlign: 'center', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
            <span style={{ fontSize: '14px', color: 'var(--muted)' }}>
              Pumili ng approved certificate mula sa table sa itaas para simulan ang pag-proseso at pag-print.
            </span>
          </div>
        )}
      </div>

      {/* ── UNIFIED PRINT PORTAL ── */}
      {(() => {
        const baseCert = selectedCertificate || selectedPrintCert;
        if (!baseCert) return null;

        // Merge live input state (issuanceMeta) with baseCert so live preview receives current values
        const activeCert = {
          ...baseCert,
          issuanceMeta,
          orNumber: issuanceMeta?.orNumber || baseCert?.orNumber,
          orDate: issuanceMeta?.dateIssued || baseCert?.orDate,
          dateIssued: issuanceMeta?.dateIssued || baseCert?.dateIssued,
          amountPaid: issuanceMeta?.amountPaid !== undefined ? issuanceMeta.amountPaid : baseCert?.amountPaid,
          purpose: issuanceMeta?.purpose || baseCert?.purpose,
          remarks: issuanceMeta?.remarks || baseCert?.remarks,
          ctcNo: issuanceMeta?.ctcNumber || baseCert?.ctcNo || baseCert?.ctc?.number,
          ctcAmount: issuanceMeta?.ctcAmountPaid || baseCert?.ctcAmount || baseCert?.ctc?.amountPaid,
          ctcDate: issuanceMeta?.ctcDateIssued || baseCert?.ctcDate || baseCert?.ctc?.dateIssued,
          ctc: {
            number: issuanceMeta?.ctcNumber || baseCert?.ctc?.number || '',
            amountPaid: issuanceMeta?.ctcAmountPaid || baseCert?.ctc?.amountPaid || 0,
            dateIssued: issuanceMeta?.ctcDateIssued || baseCert?.ctc?.dateIssued || issuanceMeta?.dateIssued || '',
            placeIssued: baseCert?.ctc?.placeIssued || 'NABUA, CAMARINES SUR',
          }
        };

        const currentPrintMode = printMode || (activeCert.printMode || 'standard');

        return createPortal(
          <div className="certificate-print-container print-only" data-print-mode={currentPrintMode}>
            {currentPrintMode !== 'standard' && (
              <div className="cert-print-watermark">
                {currentPrintMode === 'original' ? 'ORIGINAL COPY' : 'DUPLICATE COPY'}
              </div>
            )}
            {/* Certificate template dispatcher */}
            {(() => {
              const type = (activeCert.certificateType || activeCert.type || '').toLowerCase();
              if (type.includes('business') || type.includes('permit') || activeCert.businessName) {
                return <BusinessPermit data={activeCert} />;
              }
              if (type.includes('indigency')) {
                return <IndigencyTemplate data={activeCert} />;
              }
              if (type.includes('residency')) {
                return <ResidencyCertificate data={activeCert} />;
              }
              return <BarangayClearance data={activeCert} />;
            })()}
          </div>,
          document.body
        );
      })()}
    </div>
  );
}