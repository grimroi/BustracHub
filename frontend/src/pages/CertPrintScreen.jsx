import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/Certificates.css';
import { localDb as db } from '../services/db';
import { createAuditLog } from '../utils/auditLog';
import { getApplicantName, normalizeCertType, validateCertificateData } from '../utils/certHelpers';
import BarangayClearance from '../components/certificates/templates/BarangayClearance';
import IndigencyTemplate from '../components/certificates/templates/IndigencyTemplate';
import BusinessPermit from '../components/certificates/templates/BusinessPermit';
import ResidencyCertificate from '../components/certificates/templates/ResidencyCertificate';



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
  } catch {
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
  issuedCertificates = [],
  onOpenPrintPreview,
  onIssuePrint,
  publicDomain,
  qrConfig,
  showToast,
  notifyDesktop,
  nav,  
}) {
  const [dbIssuedCertificates, setDbIssuedCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printingId, setPrintingId] = useState(null); 
  const previewPaneRef = useRef(null);
  const [previewZoom, setPreviewZoom] = useState(0.62);
  const [saving, setSaving] = useState(false);   
  const isInitialLoadRef = useRef(true); 
  const [blotterRecords, setBlotterRecords] = useState([]);
const [blotterMatches, setBlotterMatches] = useState([]);
const [isVerifying, setIsVerifying] = useState(false);

  const loadIssuedCertificates = useCallback(async () => {
  try {
    if (isInitialLoadRef.current) setLoading(true);
    const result = await db.allDocs({ include_docs: true });
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

// Initial load of the issued/released history. Running it on mount also clears
// the `loading` flag, so the "Ready for Issuance" panel falls through to its
// empty state when there is nothing approved instead of showing the loader.
useEffect(() => {
  loadIssuedCertificates();
}, [loadIssuedCertificates]);

useEffect(() => {
  if (!db || typeof db.allDocs !== 'function') return;
  let isMounted = true;

  

  const changes = db.changes({
    since: 'now', live: true, include_docs: true,
    filter: (doc) => doc.type === 'certificate_request'
  })
  .on('change', (change) => {
    if (!isMounted || !change.doc) return;

    const doc = change.doc;
    const isNewRequest =
      doc.step === 1 &&
      ['Under Review', 'Pending', 'Proceeding'].includes(doc.status);

    if (isNewRequest) {
      const applicant =
        `${doc.firstName || ''} ${doc.lastName || ''}`.trim() || 'Resident';
      notifyDesktop(
        ' New Certificate Request',
        `${applicant} — ${doc.certificateType || 'Certificate'}`,
        {
          tag: `cert-${doc._id}`,
          onClick: () => nav('cert-approve'),
        }
      );
    }

    setDbIssuedCertificates((prevCerts) => {
      const filtered = (prevCerts || []).filter((c) => c?._id !== doc._id);
      return [doc, ...filtered];
    });
  })
  .on('error', (err) => {
    console.error('PouchDB cert changes listener error:', err);
  });

  return () => {
    isMounted = false;
    changes.cancel();
  };
}, [notifyDesktop, nav]);

// Load blotter records for auto-verification
useEffect(() => {
  const loadBlotter = async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const records = result.rows
        .map((row) => row.doc)
        .filter((doc) => doc && (
          doc.type === 'blotter' ||
          doc.type === 'blotter_record' ||
          doc.type === 'blotter_report' ||
          doc.docType === 'blotter'
        ));
      setBlotterRecords(records);
    } catch (err) {
      console.error('Error loading blotter records:', err);
      setBlotterRecords([]);
    }
  };
  loadBlotter();
}, []);

// AUTO VERIFY LOGIC
// Auto-fill query from the selected resident's last name
useEffect(() => {
  const lastName =
    selectedCertificate?.lastName ||
    (getApplicantName(selectedCertificate) || '').split(' ').pop() ||
    issuanceMeta?.residentName?.split(' ').pop();
  if (lastName && lastName.length >= 2) {
    setBlotterVerifyQuery(lastName);
  }
}, [selectedCertificate, issuanceMeta?.residentName, setBlotterVerifyQuery]);

// Compute blotter matches for the current query
useEffect(() => {
  const q = (blotterVerifyQuery || '').trim().toLowerCase();
  if (!q) {
    setBlotterMatches([]);
    return;
  }
  const nameOf = (val) =>
    typeof val === 'object' && val !== null
      ? (val.name || val.displayName || '')
      : (val || '');
  const matches = blotterRecords
    .filter((b) => {
      const respondent = nameOf(b.respondent) || b.respondentName || b.respName || '';
      const complainant = nameOf(b.complainant) || b.complainantName || b.compName || '';
      return (
        respondent.toLowerCase().includes(q) ||
        complainant.toLowerCase().includes(q)
      );
    })
    .map((b) => ({
      id: b._id,
      respondent: nameOf(b.respondent) || b.respondentName || b.respName || 'N/A',
      status: b.status || 'Pending',
    }));
  setBlotterMatches(matches);
}, [blotterVerifyQuery, blotterRecords]);

// Auto-compute verification result
useEffect(() => {
  if (!blotterVerifyQuery) return;
  setIsVerifying(true);
  const timer = setTimeout(() => {
    const hasOpenCase = blotterMatches.some(
      (b) => b.status !== 'Resolved' && b.status !== 'Closed'
    );
    setIssuanceMeta((prev) => ({
      ...prev,
      noDerogatoryRecord: blotterMatches.length === 0,
      hasDerogatory: hasOpenCase,
      autoVerified: true,
      verifiedAt: new Date().toISOString(),
    }));
    setIsVerifying(false);
  }, 400);
  return () => clearTimeout(timer);
}, [blotterMatches.length]);



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

  const sortTs = (c) => {
    const raw = c.issuedAt || c.updatedAt || c.createdAt;
    const t = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  };

  return Array.from(uniqueMap.values())
    .filter((c) => {
      const step = Number(c.step);
      const status = String(c.status || '').trim();

      return (
        step === 5 ||
        step === 6 ||
        status === 'Issued' ||
        status === 'Released'
      );
    })
    .sort((a, b) => sortTs(b) - sortTs(a));
}, [dbIssuedCertificates, issuedCertificates]);

  const [issuedSearchQuery, setIssuedSearchQuery] = useState('');
  // ✅ Filter states (status/type pinned to 'All' until the filter UI ships)
const [filterIssuedStatus] = useState('All');
const [filterIssuedType] = useState('All');
  const filteredIssuedAndReleased = issuedAndReleased.filter((cert) => {
  // 1. Search filter
  const query = issuedSearchQuery.toLowerCase().trim();
  const residentName = getApplicantName(cert).toLowerCase();
  const certType = (cert.certificateType || '').toLowerCase();
  const reqId = (cert.requestId || cert._id || '').toLowerCase();
  
  const matchesSearch = !query ||
    residentName.includes(query) ||
    certType.includes(query) ||
    reqId.includes(query);
  
  // 2. Status filter
  const matchesStatus = filterIssuedStatus === 'All' || 
    (cert.status || '').toLowerCase() === filterIssuedStatus.toLowerCase();
  
  // 3. Type filter
  const matchesType = filterIssuedType === 'All' ||
    (cert.certificateType || '').toLowerCase().includes(filterIssuedType.toLowerCase());
  
  return matchesSearch && matchesStatus && matchesType;
});

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

  // ── Issuance modal: lock body scroll + close on Escape ──
  useEffect(() => {
    if (!selectedCertificate) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleCloseWorkspace();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedCertificate, handleCloseWorkspace]);

  // ── Issuance modal: responsive scale for the live document preview ──
  useEffect(() => {
    const el = previewPaneRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const recompute = () => {
      const available = el.clientWidth - 32;
      if (available > 0) {
        // 210mm ≈ 794px @ 96dpi (A4 width)
        setPreviewZoom(Math.min(1, Math.max(0.3, available / 794)));
      }
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedCertificate]);

  // ── Live certificate data for the preview (merges edits from the form) ──
  const previewData = useMemo(() => {
    if (!selectedCertificate) return null;
    return {
      ...selectedCertificate,
      orNumber: issuanceMeta.orNumber || selectedCertificate.orNumber,
      amountPaid:
        issuanceMeta.amountPaid !== undefined && issuanceMeta.amountPaid !== ''
          ? issuanceMeta.amountPaid
          : selectedCertificate.amountPaid,
      purpose: issuanceMeta.purpose || selectedCertificate.purpose,
      dateIssued: issuanceMeta.dateIssued || selectedCertificate.dateIssued,
      ctcNumber: issuanceMeta.ctcNumber || selectedCertificate.ctc?.number,
      issuanceMeta,
    };
  }, [selectedCertificate, issuanceMeta]);

  // ── Issuance gating: required-field validation + O.R. presence ──
  const certValidation = useMemo(
    () => validateCertificateData(previewData),
    [previewData]
  );
  const orNumberMissing = !String(issuanceMeta?.orNumber || '').trim();
  const issueDisabled =
    saving || issuanceMeta.hasDerogatory || orNumberMissing || !certValidation.valid;

  const renderPreviewTemplate = () => {
    if (!previewData) return null;
    const type = normalizeCertType(
      selectedCertificate?.certificateType || selectedCertificate?.type
    );
    switch (type) {
      case 'indigency':
        return <IndigencyTemplate data={previewData} publicDomain={publicDomain} />;
      case 'business':
        return <BusinessPermit data={previewData} publicDomain={publicDomain} />;
      case 'residency':
        return <ResidencyCertificate data={previewData} publicDomain={publicDomain} />;
      case 'clearance':
      default:
        return (
          <BarangayClearance
            data={previewData}
            publicDomain={publicDomain}
            qrConfig={qrConfig}
          />
        );
    }
  };

  const handleIssuePrintAction = async () => {
    const blockers = [
      ...(issuanceMeta.hasDerogatory ? ['open blotter case found'] : []),
      ...(orNumberMissing ? ['O.R. Number'] : []),
      ...(certValidation.valid ? [] : certValidation.missing),
    ];
    if (blockers.length > 0) {
      const msg = `Cannot issue — missing/blocked: ${blockers.join(', ')}.`;
      if (typeof showToast === 'function') showToast(msg, 'error');
      else alert(msg);
      return;
    }
    if (typeof onIssuePrint !== 'function') {
      const msg = 'Issue & Print is unavailable right now.';
      if (typeof showToast === 'function') showToast(msg, 'error');
      else alert(msg);
      return;
    }
    setSaving(true);
    try {
      await onIssuePrint(selectedCertificate);
    } catch (err) {
      if (typeof showToast === 'function') showToast('Issue failed: ' + err.message, 'error');
      else alert('Issue failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

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
    <div className="cert-print-screen" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 70px)' }}>

      {/* MAIN PANEL: Approved Certificates Queue */}
      <div className="cert-section-card" style={{ flex: filteredApprovedCertificates.length > 0 ? '1 1 0' : '0 0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div className="cert-section-header">
            <div className="cert-section-title" style={{ fontSize: '15px' }}>
              Ready for Issuance
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid rgba(79,142,247,0.25)' }}>
                {filteredApprovedCertificates.length}
              </span>
            </div>
            <input 
              type="text" 
              className="fc" 
              placeholder="Search approved records..." 
              value={approvedSearchQuery} 
              onChange={(e) => setApprovedSearchQuery(e.target.value)} 
              aria-label="Search approved certificates"
              style={{ width: '240px', height: '34px', fontSize: '12px', padding: '6px 12px' }} 
            />
          </div>
            <div className="cert-table-wrapper" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)' }}>Resident</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', minWidth: '140px', whiteSpace: 'nowrap' }}>Type</th>
                  <th style={{ padding: '10px', textAlign: 'right', fontSize: '11px', color: 'var(--muted)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && filteredApprovedCertificates.length === 0 ? (
                  <tr><td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>Loading approved certificates...</td></tr>
                ) : filteredApprovedCertificates.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ padding: 0 }}>
                      <div className="cert-empty-state">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="9" y1="13" x2="15" y2="13" />
                          <line x1="9" y1="17" x2="13" y2="17" />
                        </svg>
                        <div className="cert-empty-state__title">No approved certificates waiting</div>
                        <div className="cert-empty-state__hint">Approved requests will appear here, ready to issue and print.</div>
                      </div>
                    </td>
                  </tr>
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
                        <td style={{ padding: '12px', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }} title={cert.certificateType || 'Certificate (generic)'}>
                          {cert.certificateType || 'Certificate (generic)'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-p btn-sm"
                            onClick={(e) => { e.stopPropagation(); handleSelectCertificate(cert); }}
                            aria-label={`Open issuance workspace for ${getApplicantName(cert)}`}
                            style={{ fontSize: 11, padding: '5px 12px' }}
                          >
                            Open
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

      {/* (Issuance workspace now renders as a focused overlay modal at the end of this screen) */}

      {/* BOTTOM SECTION: Issued & Released History (Reprint Queue) */}
<div 
  className="cert-section-card" 
  style={{ 
    flex: '1 1 0',
    display: 'flex', 
    flexDirection: 'column', 
    overflow: 'hidden', 
    minHeight: 0,
    padding: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
  }}
>
  {/* ── Header ── */}
  <div 
    className="cert-section-header" 
    style={{ 
      padding: '14px 20px', 
      borderBottom: '1px solid var(--border)', 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      gap: 12, 
      flexWrap: 'wrap',
    }}
  >
    <div 
      className="cert-section-title" 
      style={{ 
        fontWeight: 700, 
        fontSize: 14, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      Issued & Released History
      <span 
        style={{ 
          fontSize: 10, 
          fontWeight: 700, 
          padding: '2px 8px', 
          borderRadius: 10, 
          background: 'var(--accent-bg)', 
          color: 'var(--accent)', 
          border: '1px solid rgba(79,142,247,0.25)',
        }}
      >
        {filteredIssuedAndReleased.length}
      </span>
    </div>
    <input 
      type="text" 
      className="fc" 
      placeholder="Search issued records..." 
      value={issuedSearchQuery} 
      onChange={(e) => setIssuedSearchQuery(e.target.value)} 
      style={{ 
        width: 240, 
        height: 34, 
        fontSize: 12, 
        padding: '6px 12px',
      }} 
    />
  </div>

  {/* ── Table Wrapper ── */}
  <div 
    className="cert-table-wrapper" 
    style={{ 
      flex: 1, 
      minHeight: 0, 
      overflowY: 'auto', 
      overflowX: 'hidden',
      width: '100%',              // ✅ Explicit width
      boxSizing: 'border-box',    // ✅
    }}
  >
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 10 }}>
        <tr>
          {/* Request ID — 20% */}
          <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '20%' }}>
            Request ID
          </th>
          {/* Resident — 26% */}
          <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '26%' }}>
            Resident
          </th>
          {/* Type — 18% */}
          <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '18%' }}>
            Type
          </th>
          {/* Status — 10% */}
          <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '10%' }}>
            Status
          </th>
          {/* Issued At — 14% */}
          <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '14%' }}>
            Issued At
          </th>
          {/* Action — 12% */}
          <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '12%' }}>
            Action
          </th>
        </tr>
      </thead>
      <tbody>
        {filteredIssuedAndReleased.length === 0 ? (
          <tr>
            <td colSpan="6" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600 }}>No issued certificates found.</span>
              </div>
            </td>
          </tr>
        ) : (
          filteredIssuedAndReleased.map((cert, index) => {
            const rawId = cert.requestId || cert._id?.replace('issued_cert_', '') || '—';
            const displayId = rawId.length > 20 ? `${rawId.slice(0, 8)}…${rawId.slice(-6)}` : rawId;
            
            return (
              <tr 
                key={cert._id} 
                style={{ 
                  borderBottom: '1px solid var(--border)', 
                  background: index % 2 === 0 ? 'transparent' : 'var(--surface2)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'transparent' : 'var(--surface2)'}
              >
                {/* Request ID — truncated */}
                <td 
                  className="mono" 
                  style={{ 
                    padding: '12px 16px', 
                    fontSize: 11, 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                  }} 
                  title={rawId}
                >
                  {displayId}
                </td>

                {/* Resident — truncated */}
                <td 
                  style={{ 
                    padding: '12px 16px', 
                    fontWeight: 600, 
                    fontSize: 13, 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                  }} 
                  title={getApplicantName(cert)}
                >
                  {getApplicantName(cert)}
                </td>

                {/* Type — truncated */}
                <td 
                  style={{ 
                    padding: '12px 16px', 
                    fontSize: 12, 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                  }} 
                  title={cert.certificateType || 'Certificate (generic)'}
                >
                  {cert.certificateType || 'Certificate (generic)'}
                </td>

                {/* Status */}
                <td style={{ padding: '12px 16px' }}>
                  <span className={`badge ${cert.status === 'Released' ? 'g' : 'a'}`} style={{ fontSize: 10 }}>
                    {cert.status}
                  </span>
                </td>

                {/* Issued At */}
                <td 
                  className="mono" 
                  style={{ 
                    padding: '12px 16px', 
                    fontSize: 11, 
                    color: 'var(--muted)', 
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatDateTime(cert.issuedAt || cert.updatedAt || cert.createdAt)}
                </td>

                {/* Action */}
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <button 
                    type="button" 
                    className="btn btn-g btn-sm" 
                    disabled={printingId === cert._id} 
                    onClick={() => { 
                      setPrintingId(cert._id); 
                      handleReprint(cert); 
                    }} 
                    title="Print duplicate copy" 
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: 4, 
                      fontSize: 11, 
                      padding: '5px 10px',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    {printingId === cert._id ? 'Printing...' : 'Reprint'}
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

      {/* ═══════════════════════════════════════════════════════════
          ISSUANCE WORKSPACE — focused full-height overlay modal
          ═══════════════════════════════════════════════════════════ */}
      {selectedCertificate && createPortal(
        <div
          role="presentation"
          data-issuance-overlay="true"
          onClick={(e) => { if (e.target === e.currentTarget) handleCloseWorkspace(); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(3, 7, 18, 0.72)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Issuance workspace for ${getApplicantName(selectedCertificate)}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1180px, 100%)',
              height: 'min(92vh, 100%)',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
          >

            {/* ── Header: resident name, certificate type, tracking reference ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '18px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {getApplicantName(selectedCertificate)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <span className="badge b">{selectedCertificate.certificateType || 'Certificate'}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    Ref: {selectedCertificate.trackingCode || selectedCertificate._id}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseWorkspace}
                aria-label="Close issuance workspace"
                style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* ── Top section: blotter verification + clearance checkbox ── */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span className="fp-t" style={{ margin: 0 }}>Blotter Verification</span>
                {isVerifying ? (
                  <span className="badge" style={{ fontSize: 11 }}>Verifying…</span>
                ) : issuanceMeta.autoVerified ? (
                  blotterMatches.length === 0 ? (
                    <span className="badge g" style={{ fontSize: 11 }}>✓ No derogatory record</span>
                  ) : (
                    <span className="badge r" style={{ fontSize: 11 }}>⚠ Has record</span>
                  )
                ) : (
                  <span className="badge" style={{ fontSize: 11 }}>Not verified</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="fc"
                  placeholder="Auto-detected resident"
                  value={blotterVerifyQuery}
                  readOnly
                  aria-label="Auto-detected resident for blotter verification"
                  style={{ height: 38, fontSize: 13, padding: '0 12px', flex: '1 1 240px', maxWidth: 360, background: 'var(--surface2)' }}
                />
                <label className="cert-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, cursor: issuanceMeta.hasDerogatory ? 'not-allowed' : 'pointer', opacity: issuanceMeta.hasDerogatory ? 0.6 : 1 }}>
                  <input
                    type="checkbox"
                    checked={issuanceMeta.noDerogatoryRecord || false}
                    disabled={issuanceMeta.hasDerogatory}
                    onChange={(e) => setIssuanceMeta({ ...issuanceMeta, noDerogatoryRecord: e.target.checked })}
                    style={{ width: 16, height: 16 }}
                  />
                  {issuanceMeta.hasDerogatory ? 'Cannot issue — open blotter case found' : 'I verify there is no derogatory record (auto)'}
                </label>
              </div>

              {blotterMatches.length > 0 && (
                <div className="cert-mini-table-wrap" style={{ maxHeight: 132, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <table className="cert-mini-table" style={{ width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)' }}>
                      <tr>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11 }}>Respondent</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blotterMatches.map((b, idx) => (
                        <tr key={b.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 12px', fontSize: 12.5 }}>{b.respondent || '—'}</td>
                          <td style={{ padding: '9px 12px' }}><span className={`badge ${b.status === 'Resolved' ? 'g' : 'r'}`}>{b.status || 'Open'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Middle section: live document preview + issuance details ── */}
            <div className="cert-issuance-body">

              {/* Live certificate preview */}
              <div className="cert-document-preview">
                <div className="fp-t accent" style={{ marginBottom: 12 }}>Document Preview</div>
                <div className="cert-document-preview__pane" ref={previewPaneRef}>
                  <div style={{ zoom: previewZoom }}>
                    {renderPreviewTemplate()}
                  </div>
                </div>
                <div className="cert-document-preview__caption">
                  Live preview — updates as you edit the details.
                </div>
              </div>

              {/* Receipt & CTC details */}
              <div className="cert-receipt-details">
                <div className="fp cert-panel">
                  <div className="fp-t accent">🧾 Receipt Details</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="fg">
                      <label className="fl">Purpose <span style={{ color: 'red' }}>*</span></label>
                      <input className="fc" value={issuanceMeta.purpose || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, purpose: e.target.value }))} />
                    </div>
                    <div className="fg">
                      <label className="fl">OR No. <span style={{ color: 'red' }}>*</span></label>
                      <input type="text" className="fc" placeholder="OR-2026-XXXXX" value={issuanceMeta.orNumber || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, orNumber: e.target.value }))} />
                    </div>
                    <div className="fg">
                      <label className="fl">Amount Paid (₱) <span style={{ color: 'red' }}>*</span></label>
                      <input type="number" className="fc" value={issuanceMeta.amountPaid !== undefined ? issuanceMeta.amountPaid : ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, amountPaid: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="fp cert-panel">
                  <div className="fp-t accent">🪪 CTC Details (Optional)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="fg">
                      <label className="fl">CTC No.</label>
                      <input className="fc" value={issuanceMeta.ctcNumber || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcNumber: e.target.value }))} />
                    </div>
                    <div className="fg">
                      <label className="fl">CTC Amount Paid</label>
                      <input type="number" className="fc" value={issuanceMeta.ctcAmountPaid || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcAmountPaid: e.target.value }))} />
                    </div>
                    <div className="fg">
                      <label className="fl">CTC Date Issued</label>
                      <input type="date" className="fc" value={issuanceMeta.ctcDateIssued || ''} onChange={(e) => setIssuanceMeta(prev => ({ ...prev, ctcDateIssued: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Bottom footer: fixed action bar ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, boxShadow: '0 -6px 14px -6px rgba(0, 0, 0, 0.35)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, minHeight: 20 }}>
                {issuanceMeta.hasDerogatory ? (
                  <span style={{ color: 'var(--red, #ef4444)' }}>⛔ Cannot issue — open blotter case found.</span>
                ) : orNumberMissing ? (
                  <span style={{ color: 'var(--muted)' }}>Enter the O.R. Number to enable issuance.</span>
                ) : !certValidation.valid ? (
                  <span style={{ color: 'var(--muted)' }}>Missing required field(s): {certValidation.missing.join(', ')}.</span>
                ) : (
                  <span style={{ color: 'var(--green, #22c55e)' }}>✓ Ready to issue.</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-g" onClick={handleCloseWorkspace}>
                  Cancel
                </button>
                <button type="button" className="btn btn-a" disabled={saving} onClick={handleSaveOnlyAction}>
                  {saving ? 'Saving…' : 'Save Only'}
                </button>
                <button
                  type="button"
                  id="btn-issue-print"
                  className="btn btn-p"
                  disabled={issueDisabled}
                  onClick={handleIssuePrintAction}
                  title={
                    issuanceMeta.hasDerogatory
                      ? 'Blocked: open blotter case'
                      : orNumberMissing
                        ? 'Enter the O.R. Number first'
                        : !certValidation.valid
                          ? `Missing: ${certValidation.missing.join(', ')}`
                          : 'Issue & Print'
                  }
                  style={{
                    padding: '10px 24px',
                    fontWeight: 700,
                    opacity: issueDisabled ? 0.6 : 1,
                    cursor: issueDisabled ? 'not-allowed' : 'pointer',
                    background: issueDisabled ? 'var(--surface2)' : undefined,
                    color: issueDisabled ? 'var(--muted)' : undefined,
                    border: issueDisabled ? '1px solid var(--border)' : undefined,
                    boxShadow: issueDisabled ? 'none' : '0 4px 14px rgba(59,130,246,0.35)',
                  }}
                >
                  {issuanceMeta.hasDerogatory ? '⛔ Blocked by Blotter' : saving ? 'Processing…' : 'Issue & Print Certificate'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}