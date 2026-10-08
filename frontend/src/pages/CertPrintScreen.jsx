import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import '../styles/Certificates.css';
import { localDb as db } from '../services/db';
import { createAuditLog } from '../utils/auditLog';
import { getApplicantName } from '../utils/certHelpers'; 
   import { sendResidentSMS } from '../services/smsService';



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
  issuedCertificates = [],
  printMode,
  setPrintMode,
  onOpenPrintPreview,
  showToast
}) {
  const [dbIssuedCertificates, setDbIssuedCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null); 
  const [printingId, setPrintingId] = useState(null); 
  const workspaceRef = useRef(null);
  const [saving, setSaving] = useState(false);   
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

  const buildIssuancePayload = () => {
  const currentStep = Number(selectedCertificate?.step) || 4;
  // Preserve Released (6) or Issued (5), only upgrade Approved (4)
  const targetStep = currentStep >= 5 ? currentStep : 5;
  const targetStatus = currentStep === 6 ? 'Released' : 'Issued';
  
  return {
    ...selectedCertificate,
    status: targetStatus,
    step: targetStep,
    issuedAt: selectedCertificate?.issuedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
  };
};

  // ──────────────────────────────────────────────────────────────
  // 2. DATA DERIVATION (useMemo)
  // ──────────────────────────────────────────────────────────────
     const issuedAndReleased = useMemo(() => {
  const sourceList =
    dbIssuedCertificates.length > 0
      ? dbIssuedCertificates
      : Array.isArray(issuedCertificates)
        ? issuedCertificates
        : [];

  const uniqueMap = new Map();

  sourceList.forEach((c) => {
    if (c?._id) uniqueMap.set(c._id, c);
  });

  return Array.from(uniqueMap.values()).filter((c) => {
    const step = Number(c.step);
    const status = String(c.status || '').trim();

    return (
      step === 5 ||
      step === 6 ||
      status === 'Issued' ||
      status === 'Released'
    );
  });
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
     const handleSelectCertificate = useCallback((cert) => {
  if (selectedCertificate?._id && String(selectedCertificate._id) === String(cert?._id)) {
    return;
  }
  setSelectedCertificate(cert);
  setIssuanceMeta({
    purpose: cert?.purpose || cert?.certPurpose || '',
    orNumber: `OR-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
    amountPaid: cert?.certificateType?.toLowerCase().includes('indigency') ? 0 : 50,
    dateIssued: new Date().toISOString().split('T')[0],
    ctcNumber: cert?.ctc?.number || '',
    noDerogatoryRecord: false,
    remarks: '',
  });
}, [selectedCertificate, setSelectedCertificate, setIssuanceMeta]);

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
    const msg = 'OR Number is required before saving!';
    if (typeof showToast === 'function') showToast(msg, 'error');
    else alert(msg);
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
      details: `Saved ${payload.certificateType || 'Certificate'} for ${getApplicantName(payload)} (OR#: ${payload.orNumber})`,
    });
    if (typeof showToast === 'function') showToast('Certificate record saved!', 'success');
    else alert('Saved!');
    await loadIssuedCertificates();
    handleCloseWorkspace();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Save failed: ' + err.message, 'error');
    else alert('Failed to save: ' + err.message);
  } finally {
    setSaving(false);
  }
};
 
  const handleReprint = useCallback((cert) => {
  if (!cert) {
    console.warn('Reprint failed: No certificate provided.');
    return;
  }
  setPrintingId(cert._id);
  
  if (typeof onOpenPrintPreview === 'function') {
    onOpenPrintPreview(cert, 'copy');
  } else {
    console.error('onOpenPrintPreview prop is missing!');
  }
  
  if (typeof createAuditLog === 'function') {
    createAuditLog({
      action: 'REPRINT_CERTIFICATE',
      module: 'CERTIFICATES',
      recordId: cert._id,
      details: `Reprinted (Copy) ${cert.certificateType || 'Certificate'} for ${getApplicantName(cert)}`,
    }).catch(console.warn);
  }
  
  setTimeout(() => setPrintingId(null), 600);
}, [onOpenPrintPreview]);

  const handleReleaseDocument = async (cert) => {
  if (!cert || !cert._id) {
    if (typeof showToast === 'function') {
      showToast('Error: Walang valid na Certificate ID.', 'error');
    } else {
      alert('Error: Walang valid na Certificate ID.');
    }
    return;
  }

  setProcessingId(cert._id);

  try {
    const latestDoc = await db.get(cert._id);

    const updatedCert = {
      ...latestDoc,
      status: 'Released',
      step: 6,
      releasedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.put(updatedCert);

    setDbIssuedCertificates((prev) =>
      prev.map((c) => (c._id === cert._id ? updatedCert : c))
    );

    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'RELEASE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: cert._id,
        details: `Released ${
          cert.certificateType || 'Certificate'
        } to ${getApplicantName(cert)}`,
      });
    }

    if (typeof showToast === 'function') {
      showToast('Certificate successfully released!', 'success');
    } else {
      alert('Certificate successfully released!');
    }
  } catch (e) {
    console.error('Failed to release:', e);

    if (e.status === 409) {
      if (typeof showToast === 'function') {
        showToast(
          'Conflict: Ang record ay na-update na. Subukan muli.',
          'warning'
        );
      } else {
       showToast(
  'error',
  'Conflict: Ang record ay na-update na ng ibang device. Subukan muli.'
);
      }
    } else {
      if (typeof showToast === 'function') {
        showToast(`Failed to release: ${e.message}`, 'error');
      } else {
        alert(`Failed to release: ${e.message}`);
      }
    }
  } finally {
    setProcessingId(null);
  }
};

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

    return (
    <div className="cert-print-screen" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 100px)' }}>
      
      {/* MAIN WORKSPACE: Split View Layout */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
        
        {/* LEFT PANEL: Approved Certificates Queue (40% Width) */}
        <div className="cert-section-card" style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="cert-section-header" style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
            <div className="cert-section-title" style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>
              Ready for Issuance
            </div>
            <input 
              type="text" 
              className="fc" 
              placeholder="Search approved records..." 
              value={approvedSearchQuery} 
              onChange={(e) => setApprovedSearchQuery(e.target.value)} 
              style={{ width: '100%', height: '36px', fontSize: '13px' }} 
            />
          </div>
          <div className="cert-table-wrapper" style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)' }}>Resident</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)' }}>Type</th>
                  <th style={{ padding: '10px', textAlign: 'right', fontSize: '11px', color: 'var(--muted)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>Loading approved certificates...</td></tr>
                ) : filteredApprovedCertificates.length === 0 ? (
                  <tr><td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>No approved certificates waiting.</td></tr>
                ) : (
                  filteredApprovedCertificates.map((cert) => {
                    const isSelected = String(selectedCertificate?._id) === String(cert._id);
                    return (
                      <tr 
                        key={cert._id} 
                        onClick={() => handleSelectCertificate(cert)}
                        style={{ 
                          cursor: 'pointer', 
                          background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.2s'
                        }}
                      >
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{getApplicantName(cert)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{cert._id}</div>
                        </td>
                        <td style={{ padding: '12px', fontSize: '12px' }}>{cert.certificateType || '—'}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <span className={`badge ${isSelected ? 'b' : 'g'}`}>{isSelected ? 'Selected' : 'Process'}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT PANEL: Issuance Workspace (60% Width) */}
        <div className="cert-section-card" style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedCertificate ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {/* Workspace Header */}
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'rgba(59, 130, 246, 0.05)' }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                  Issuance Workspace: {getApplicantName(selectedCertificate)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  {selectedCertificate.certificateType} • {selectedCertificate._id}
                </div>
              </div>
              
              {/* Workspace Scrollable Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. Blotter Verification */}
                <div className="fp cert-panel" style={{ background: 'var(--surface2)', padding: '16px', borderRadius: '8px' }}>
                  <div className="fp-t" style={{ fontWeight: 600, marginBottom: '10px', fontSize: '13px' }}> Blotter Verification Check</div>
                  <input className="fc" placeholder="Search last name to check for derogatory records..." value={blotterVerifyQuery} onChange={(e) => setBlotterVerifyQuery(e.target.value)} style={{ marginBottom: '10px' }} />
                  <div className="cert-mini-table-wrap" style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '10px', background: '#fff', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <table className="cert-mini-table" style={{ width: '100%', fontSize: '12px' }}>
                      <thead style={{ background: 'var(--surface2)', position: 'sticky', top: 0 }}>
                        <tr><th style={{ padding: '8px', textAlign: 'left' }}>Respondent</th><th style={{ padding: '8px', textAlign: 'left' }}>Status</th></tr>
                      </thead>
                      <tbody>
                        {blotterMatches.length > 0 ? blotterMatches.map((b, idx) => (
                          <tr key={b.id || idx}><td style={{ padding: '8px' }}>{b.respondent || '—'}</td><td style={{ padding: '8px' }}><span className={`badge ${b.status === 'Resolved' ? 'g' : 'r'}`}>{b.status || 'Open'}</span></td></tr>
                        )) : (
                          <tr><td colSpan="2" style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)' }}>{blotterVerifyQuery ? 'No derogatory records found.' : 'Type a name to verify.'}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <label className="cert-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                    <input type="checkbox" checked={issuanceMeta.noDerogatoryRecord || false} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, noDerogatoryRecord: e.target.checked })} />
                    I verify that there is No Derogatory Record.
                  </label>
                </div>

                {/* 2. Receipt & CTC Details (Side-by-Side) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="fp cert-panel" style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div className="fp-t accent" style={{ fontWeight: 600, marginBottom: '12px', fontSize: '13px' }}>🧾 Receipt Details</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div className="fg">
                        <label className="fl" style={{ fontSize: '12px' }}>Purpose <span style={{ color: 'red' }}>*</span></label>
                        <input className="fc" value={issuanceMeta.purpose || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, purpose: e.target.value }))} />
                      </div>
                      <div className="fg">
                        <label className="fl" style={{ fontSize: '12px' }}>OR No. <span style={{ color: 'red' }}>*</span></label>
                        <input type="text" className="fc" placeholder="OR-2026-XXXXX" value={issuanceMeta.orNumber || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, orNumber: e.target.value }))} />
                      </div>
                      <div className="fg">
                        <label className="fl" style={{ fontSize: '12px' }}>Amount Paid (₱) <span style={{ color: 'red' }}>*</span></label>
                        <input type="number" className="fc" value={issuanceMeta.amountPaid !== undefined ? issuanceMeta.amountPaid : ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, amountPaid: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  <div className="fp cert-panel" style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div className="fp-t accent" style={{ fontWeight: 600, marginBottom: '12px', fontSize: '13px' }}>🪪 CTC Details (Optional)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div className="fg">
                        <label className="fl" style={{ fontSize: '12px' }}>CTC No.</label>
                        <input className="fc" value={issuanceMeta.ctcNumber || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcNumber: e.target.value }))} />
                      </div>
                      <div className="fg">
                        <label className="fl" style={{ fontSize: '12px' }}>CTC Amount Paid</label>
                        <input type="number" className="fc" value={issuanceMeta.ctcAmountPaid || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcAmountPaid: e.target.value }))} />
                      </div>
                      <div className="fg">
                        <label className="fl" style={{ fontSize: '12px' }}>CTC Date Issued</label>
                        <input type="date" className="fc" value={issuanceMeta.ctcDateIssued || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcDateIssued: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Action Buttons Footer */}
              <div
                style={{
                  padding: '16px 20px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface)',
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 20,
                  boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.05)',
                }}
              >
                <button
                  type="button"
                  className="btn btn-g"
                  onClick={() => setSelectedCertificate(null)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="btn btn-a"
                  disabled={saving}
                  onClick={handleSaveOnlyAction}
                >
                  {saving ? 'Saving...' : ' Save Only'}
                </button>

                <button
                  type="button"
                  id="btn-issue-print"
                  className="btn btn-p"
                  disabled={saving}
                  onClick={async () => {
                    if (!selectedCertificate) {
                      if (typeof showToast === 'function') showToast('Please select a certificate to issue.', 'error');
                      return;
                    }
                    if (!issuanceMeta?.orNumber?.trim()) {
                      if (typeof showToast === 'function') showToast('OR Number is required before issuing.', 'error');
                      return;
                    }
                    if (
                      issuanceMeta?.amountPaid === '' ||
                      issuanceMeta?.amountPaid === null ||
                      issuanceMeta?.amountPaid === undefined
                    ) {
                      if (typeof showToast === 'function') showToast('Amount Paid is required before issuing.', 'error');
                      return;
                    }
                    setSaving(true);
                    try {
                      const now = new Date().toISOString();
                      let latest = selectedCertificate;
                      try {
                        latest = await db.get(selectedCertificate._id);
                      } catch (getErr) {
                        if (getErr.name !== 'not_found') throw getErr;
                      }
                      const issuedPayload = buildIssuancePayload();
                      const payload = {
                        ...issuedPayload,
                        _id: latest._id,
                        _rev: latest._rev,
                        status: 'Issued',
                        step: 5,
                        issuedAt: latest.issuedAt || now,
                        updatedAt: now,
                      };
                      await saveCertificateToCouchDB(payload);
                      if (typeof createAuditLog === 'function') {
                        try {
                          await createAuditLog({
                            action: 'ISSUE_CERTIFICATE',
                            module: 'CERTIFICATES',
                            recordId: latest._id,
                            details: `Issued ${payload.certificateType || 'Certificate'} for ${getApplicantName(payload)} (OR#: ${payload.orNumber || ''})`,
                          });
                        } catch (auditErr) {
                          console.warn('Audit log for issuance failed:', auditErr);
                        }
                      }
                      try {
                        await loadIssuedCertificates();
                      } catch (refreshErr) {
                        console.warn('Failed to refresh issued list:', refreshErr);
                      }
                      if (typeof showToast === 'function') showToast('Certificate issued successfully!', 'success');
                      if (typeof onOpenPrintPreview === 'function') {
                        onOpenPrintPreview(payload, 'copy');
                      }
                    } catch (err) {
                      console.error('Issue & Print failed:', err);
                      if (typeof showToast === 'function') showToast('Failed to issue certificate: ' + err.message, 'error');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  style={{
                    padding: '10px 24px',
                    fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                  }}
                >
                  {saving ? 'Processing...' : ' Issue & Print Certificate'}
                </button>
              </div>
            </div>
          ) : (
            /* Empty State Placeholder */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3, marginBottom: '16px' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>No Certificate Selected</h3>
              <p style={{ fontSize: '14px', textAlign: 'center', maxWidth: '300px' }}>Select an approved certificate from the list on the left to begin the issuance and printing process.</p>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM SECTION: Issued & Released History (Reprint Queue) */}
      <div className="cert-section-card" style={{ flexShrink: 0 }}>
        <div className="cert-section-header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="cert-section-title" style={{ fontWeight: 600, fontSize: '14px' }}> Issued & Released History (Reprint Queue)</div>
          <input type="text" className="fc" placeholder="Search issued records..." value={issuedSearchQuery} onChange={(e) => setIssuedSearchQuery(e.target.value)} style={{ width: '200px', height: '32px', fontSize: '12px' }} />
        </div>
        <div className="cert-table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 10 }}>
              <tr>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)' }}>Request ID</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)' }}>Resident</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)' }}>Type</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)' }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)' }}>Issued At</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '11px', color: 'var(--muted)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssuedAndReleased.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>No issued certificates found.</td></tr>
              ) : (
                filteredIssuedAndReleased.map((cert) => (
                  <tr key={cert._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="mono" style={{ padding: '10px', fontSize: '11px' }}>{cert.requestId || cert._id?.replace('issued_cert_', '')}</td>
                    <td style={{ padding: '10px', fontWeight: 600, fontSize: '13px' }}>{getApplicantName(cert)}</td>
                    <td style={{ padding: '10px', fontSize: '12px' }}>{cert.certificateType || '—'}</td>
                    <td style={{ padding: '10px' }}><span className={`badge ${cert.status === 'Released' ? 'g' : 'a'}`}>{cert.status}</span></td>
                    <td className="mono" style={{ padding: '10px', fontSize: '11px', color: 'var(--muted)' }}>{formatDateTime(cert.issuedAt || cert.updatedAt || cert.createdAt)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <button type="button" className="btn btn-g btn-sm" disabled={printingId === cert._id} onClick={() => { setPrintingId(cert._id); handleReprint(cert); }} title="Print duplicate copy">
                        {printingId === cert._id ? 'Printing...' : '🖨️ Reprint'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}