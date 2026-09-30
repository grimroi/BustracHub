import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import BarangayClearance from '../components/certificates/templates/BarangayClearance';
import BusinessPermit from '../components/certificates/templates/BusinessPermit';
import IndigencyTemplate from '../components/certificates/templates/IndigencyTemplate';
import ResidencyCertificate from '../components/certificates/templates/ResidencyCertificate';
import '../styles/Certificates.css';
import { localDb as db, createAuditLog } from '../services/db';



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

    let updatedDoc;
    try {
      const existingDoc = await db.get(payload._id);
      updatedDoc = {
        ...existingDoc,
        ...payload,
        step: payload.step !== undefined ? payload.step : existingDoc.step,
        status: payload.status || existingDoc.status || 'Issued',
        issuedAt: payload.issuedAt || existingDoc.issuedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        issuanceMeta: {
          ...(existingDoc.issuanceMeta || {}),
          ...(payload.issuanceMeta || {}),
        },
        _rev: existingDoc._rev,
      };
    } catch (getErr) {
      if (getErr.name === 'not_found') {
        // Document doesn't exist yet — create new
        updatedDoc = {
          ...payload,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        throw getErr;
      }
    }

    return await db.put(updatedDoc);
  } catch (err) {
    console.error("Error saving certificate to PouchDB:", err);
    throw err;
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
  setPrintMode,
  showToast
}) {
  const [localPrintMode, setLocalPrintMode] = useState('original');
  const [localShowPrintModal, setLocalShowPrintModal] = useState(false);
  const [localSelectedPrintCert, setLocalSelectedPrintCert] = useState(null);
  const [dbIssuedCertificates, setDbIssuedCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null); 
  const [printingId, setPrintingId] = useState(null); 
  const workspaceRef = useRef(null);
  const [workspaceAction, setWorkspaceAction] = useState(null);
  const [saving, setSaving] = useState(false);   
  const [printing, setPrinting] = useState(false);   
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const isInitialLoadRef = useRef(true); 

  const loadIssuedCertificates = useCallback(async () => {
  try {
    if (isInitialLoadRef.current) setLoading(true);
    const result = await db.allDocs({
      include_docs: true,
      startkey: 'certificate_request_',
      endkey: 'certificate_request_\ufff0',
    });
    const allDocs = result.rows.map((row) => row.doc);
    const issued = allDocs.filter(
      (doc) =>
        doc &&
        doc.type === 'certificate_request' &&
        ['Approved', 'Issued', 'Released'].includes(doc.status)
    );
    setDbIssuedCertificates(issued);
  } catch (error) {
    console.error('Error fetching issued certificates:', error);
    setDbIssuedCertificates([]);
  } finally {
    if (isInitialLoadRef.current) {
      setLoading(false);
      isInitialLoadRef.current = false;
    }
  }
}, []);

  useEffect(() => {
  loadIssuedCertificates(); 
  
  const changes = db
    .changes({ live: true, include_docs: true, since: 'now' })
    .on('change', (change) => {
      if (change.doc && change.doc.type === 'certificate_request') {
        setDbIssuedCertificates((prev) => {
          const filtered = prev.filter((c) => c._id !== change.doc._id);
          if (change.deleted) return filtered;
          if (['Approved', 'Issued', 'Released'].includes(change.doc.status)) {
            return [change.doc, ...filtered];
          }
          return filtered;
        });
      }
    })
    .on('error', (err) => {
      console.error('Certificate changes error:', err);
    });
    
  return () => changes.cancel();
}, []); 

  // Fallback states
  const setPrintModeFn = setPrintMode ?? setLocalPrintMode;
  const setSelectedPrintCertFn = setSelectedPrintCert ?? setLocalSelectedPrintCert;

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

    // 1. HELPER FUNCTIONS 
  // ──────────────────────────────────────────────────────────────
  const getApplicantName = (cert) => {
    if (cert.applicantType === 'Business' || cert.businessName) {
      return `${cert.businessName || 'Business'} (${cert.ownerName || 'No Owner'})`;
    }
    const fullName = `${cert.firstName || ''} ${cert.lastName || ''}`.trim();
    return fullName || cert.fullName || 'Unnamed Applicant';
  };

  const buildIssuancePayload = () => ({
    ...selectedCertificate,
    status: 'Issued',
    step: 5,
    issuedAt: new Date().toISOString(),
    issuanceMeta,
    orNumber: issuanceMeta.orNumber,
    orDate: issuanceMeta.dateIssued,
    dateIssued: issuanceMeta.dateIssued,
    amountPaid: issuanceMeta.amountPaid,
    purpose: issuanceMeta.purpose || selectedCertificate?.purpose,
    remarks: issuanceMeta.remarks,
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
  });

  // ──────────────────────────────────────────────────────────────
  // 2. DATA DERIVATION (useMemo)
  // ──────────────────────────────────────────────────────────────
  const issuedAndReleased = useMemo(() => {
    const sourceList = dbIssuedCertificates.length > 0 
      ? dbIssuedCertificates 
      : (Array.isArray(issuedCertificates) ? issuedCertificates : []);
    return sourceList.filter((c) => 
      [5, 6].includes(Number(c.step)) || 
      ['Issued', 'Released'].includes(c.status)
    );
  }, [dbIssuedCertificates, issuedCertificates]);

  const [issuedSearchQuery, setIssuedSearchQuery] = useState('');
  const filteredIssuedAndReleased = useMemo(() => {
    if (!issuedSearchQuery.trim()) return issuedAndReleased;
    const q = issuedSearchQuery.toLowerCase();
    return issuedAndReleased.filter((c) => 
      (c._id || '').toLowerCase().includes(q) ||
      getApplicantName(c).toLowerCase().includes(q) ||
      (c.certificateType || '').toLowerCase().includes(q)
    );
  }, [issuedAndReleased, issuedSearchQuery]);

  const [approvedSearchQuery, setApprovedSearchQuery] = useState('');
  const filteredApprovedCertificates = useMemo(() => {
    if (!approvedSearchQuery.trim()) return approvedCertificates;
    const q = approvedSearchQuery.toLowerCase();
    return approvedCertificates.filter((c) => 
      (c._id || '').toLowerCase().includes(q) ||
      getApplicantName(c).toLowerCase().includes(q) ||
      (c.certificateType || '').toLowerCase().includes(q)
    );
  }, [approvedCertificates, approvedSearchQuery]);

  // ──────────────────────────────────────────────────────────────
  // 3. CORE HANDLERS & CALLBACKS
  // ──────────────────────────────────────────────────────────────
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

  const handleSaveOnlyAction = async () => {
    if (!issuanceMeta?.orNumber || !issuanceMeta.orNumber.trim()) {
      alert('An Official Receipt (OR) Number is required before saving!');
      return;
    }
    setSaving(true);
    try {
      const payload = buildIssuancePayload();
      await saveCertificateToCouchDB(payload);
      await createAuditLog({
        action: 'ISSUE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: payload._id,
        details: `Issued ${payload.certificateType || 'Certificate'} for ${getApplicantName(payload)} (OR#: ${payload.orNumber})`,
      });
      alert('Certificate record successfully saved!');
      await loadIssuedCertificates();
      handleCloseWorkspace();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false); // ⬅️ CRITICAL: Prevents permanent "Saving..." state
    }
  };

  const handlePrintDocumentAction = async () => {
    if (!issuanceMeta?.orNumber || !issuanceMeta.orNumber.trim()) {
      alert('An Official Receipt (OR) Number is required before printing!');
      return;
    }
    setPrinting(true);
    try {
      const payload = buildIssuancePayload(); // ⬅️ DRY: Reusing the helper
      await saveCertificateToCouchDB(payload);
      await createAuditLog({
        action: 'PRINT_ISSUE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: payload._id,
        details: `Printed & Issued ${payload.certificateType || 'Certificate'} for ${getApplicantName(payload)} (OR#: ${payload.orNumber})`,
      });
      await loadIssuedCertificates();
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
    } finally {
      setPrinting(false); // ⬅️ CRITICAL: Prevents permanent "Printing..." state
    }
  };

  const handleReprint = useCallback((cert) => {
    if (!cert) return;
    setPrintingId(cert._id); // Set ID para mag-disable ang button
    setSelectedCertificate(cert);
    if (typeof setSelectedPrintCertFn === 'function') setSelectedPrintCertFn(cert);
    if (typeof setPrintModeFn === 'function') setPrintModeFn('copy');
    
    createAuditLog({
      action: 'REPRINT_CERTIFICATE',
      module: 'CERTIFICATES',
      recordId: cert._id,
      details: `Reprinted ${cert.certificateType || 'Certificate'} for ${getApplicantName(cert)}`,
    }).catch(console.warn);

    setTimeout(() => {
      try {
        if (typeof handlePrintDocument === 'function') {
          handlePrintDocument(cert);
        } else {
          window.print();
        }
      } catch (err) {
        console.error('Print failed:', err);
      } finally {
        setPrintingId(null); // Reset ID after print
      }
    }, 300);
  }, [setSelectedCertificate, setSelectedPrintCertFn, setPrintModeFn, handlePrintDocument]);

  // ──────────────────────────────────────────────────────────────
  // 4. EFFECTS
  // ──────────────────────────────────────────────────────────────
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

  return (
    <div className="cert-print-screen" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ═══ SECTION 1: APPROVED CERTIFICATES QUEUE ═══ */}
      <div className="cert-section-card">
        <div className="cert-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <div className="cert-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '16px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Ready for Issuance & Printing
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="badge b">{filteredApprovedCertificates.length} Approved</span>
            <input
              type="text"
              className="fc"
              placeholder="Search approved records..."
              value={approvedSearchQuery}
              onChange={(e) => setApprovedSearchQuery(e.target.value)}
              style={{ width: '220px', height: '34px', fontSize: '13px' }}
            />
          </div>
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
              {loading ? (
                <tr>
                  <td colSpan="6" className="empty-cell" style={{ textAlign: 'center', padding: '32px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--muted)', fontSize: '13px' }}>
                      <span style={{
                        display: 'inline-block', width: '16px', height: '16px',
                        border: '2px solid rgba(59, 130, 246, 0.2)', borderTopColor: 'var(--accent)',
                        borderRadius: '50%', animation: 'spin 0.6s linear infinite'
                      }} />
                      Loading approved certificates...
                    </span>
                  </td>
                </tr>
              ) : filteredApprovedCertificates.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-cell" style={{ textAlign: 'center', padding: '20px' }}>
                    {approvedCertificates.length === 0 
                      ? 'No approved certificates waiting for issuance.' 
                      : 'No matches found for your search.'}
                  </td>
                </tr>
              ) : (
                filteredApprovedCertificates.map((cert) => {
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
        <div className="cert-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <div className="cert-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '16px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Issued & Released Records — Reprint Queue
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="badge a">{filteredIssuedAndReleased.length} of {issuedAndReleased.length}</span>
            <input
              type="text"
              className="fc"
              placeholder="Search issued records..."
              value={issuedSearchQuery}
              onChange={(e) => setIssuedSearchQuery(e.target.value)}
              style={{ width: '220px', height: '34px', fontSize: '13px' }}
            />
          </div>
        </div>

        <div className="cert-table-wrapper" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
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
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span>Loading records...</span>
                    </div>
                  </td>
                </tr>
              ) : issuedAndReleased.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-cell" style={{ textAlign: 'center', padding: '20px' }}>
                    No issued certificates yet. Maglalabas dito ang mga record pagkatapos ma-print o ma-save.
                  </td>
                </tr>
              ) : filteredIssuedAndReleased.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-cell" style={{ textAlign: 'center', padding: '20px' }}>
                    No matches found for your search.
                  </td>
                </tr>
              ) : (
                filteredIssuedAndReleased.map((cert) => (
                  <tr key={cert._id}>
                    <td className="mono id-cell">{cert.requestId || cert._id?.replace('issued_cert_', '')}</td>
                    <td><strong>{getApplicantName(cert)}</strong></td>
                    <td>{cert.certificateType || cert.certType || '—'}</td>
                    <td>
                      <span className={`badge ${cert.status === 'Released' ? 'g' : cert.status === 'Issued' ? 'a' : ''}`}>
                        {cert.status}
                      </span>
                    </td>
                    <td className="mono muted">{formatDateTime(cert.issuedAt || cert.updatedAt || cert.createdAt)}</td>
                    <td className="text-right">
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {(cert.status === 'Issued' || cert.step === 5) && (
                          <button
                            type="button"
                            className="btn btn-p btn-sm"
                            disabled={processingId === cert._id}
                            onClick={async () => {
                              setProcessingId(cert._id);
                              try {
                                const existing = await db.get(cert._id);
                                await db.put({
                                  ...existing,
                                  status: 'Released',
                                  step: 6,
                                  releasedAt: new Date().toISOString(),
                                  updatedAt: new Date().toISOString(),
                                  _rev: existing._rev,
                                });
                                await createAuditLog({
                                  action: 'RELEASE_CERTIFICATE',
                                  module: 'CERTIFICATES',
                                  recordId: cert._id,
                                  details: `Released ${cert.certificateType || 'Certificate'} to ${getApplicantName(cert)}`
                                });
                                await loadIssuedCertificates();
                              } catch (e) {
                                alert('Failed to release: ' + e.message);
                              } finally {
                                setProcessingId(null);
                              }
                            }}
                          >
                            {processingId === cert._id ? 'Releasing...' : '✓ Release'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-g btn-sm"
                          disabled={printingId === cert._id}
                          onClick={() => {
                            setPrintingId(cert._id);
                            handleReprint(cert);
                          }}
                          title="Print duplicate copy"
                        >
                          {printingId === cert._id ? 'Printing...' : '🖨️ Reprint Copy'}
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
                      <input className="fc" value={issuanceMeta.purpose || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, purpose: e.target.value }))} />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>Remarks</label>
                      <input className="fc" value={issuanceMeta.remarks || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, remarks: e.target.value }))} />
                    </div>
                  </div>
                  <div className="cert-form-row cols-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>Date Issued <span className="req" style={{ color: 'red' }}>*</span></label>
                      <input type="date" className="fc" value={issuanceMeta.dateIssued || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, dateIssued: e.target.value }))} />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>OR No. <span className="req" style={{ color: 'red' }}>*</span></label>
                      <input type="text" className="fc" placeholder="OR-2026-XXXXX" value={issuanceMeta.orNumber || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, orNumber: e.target.value }))} />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>Amt. Paid <span className="req" style={{ color: 'red' }}>*</span></label>
                      <input type="number" className="fc" value={issuanceMeta.amountPaid !== undefined ? issuanceMeta.amountPaid : ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, amountPaid: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* CTC Details */}
                <div className="fp cert-panel" style={{ border: '1px solid var(--border-color, #e2e8f0)', padding: '16px', borderRadius: '8px' }}>
                  <div className="fp-t accent" style={{ fontWeight: 600, marginBottom: '12px' }}>Community Tax Certificate (CTC) Details</div>
                  <div className="cert-form-row cols-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>CTC No.</label>
                      <input className="fc" value={issuanceMeta.ctcNumber || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcNumber: e.target.value }))} />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>CTC Amt. Paid</label>
                      <input type="number" className="fc" value={issuanceMeta.ctcAmountPaid || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcAmountPaid: e.target.value }))} />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>CTC Date Issued</label>
                      <input type="date" className="fc" value={issuanceMeta.ctcDateIssued || issuanceMeta.dateIssued || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcDateIssued: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="cert-action-bar no-print" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <button 
                    type="button" 
                    className="btn btn-g" 
                    disabled={printing || saving || !selectedCertificate}
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
                    disabled={printing || saving || !selectedCertificate}
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
                  <button 
                    type="button" 
                    className="btn btn-p" 
                    onClick={handleSaveOnlyAction} 
                    disabled={saving || !selectedCertificate}
                  >
                    {saving ? 'Saving...' : 'Save Record'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    onClick={handlePrintDocumentAction} 
                    disabled={printing || !selectedCertificate}
                  >
                    {printing ? 'Printing...' : 'Print Document'}
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
            <div id="printable-certificate-card" className="certificate-print-container print-only" data-print-mode={currentPrintMode}>
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