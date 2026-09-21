import React, { useEffect, useCallback } from 'react';

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
}) {
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

  // ── 2. AUTO-FILL ISSUANCE META WHEN SELECTED ──
  useEffect(() => {
    if (selectedCertificate) {
      setIssuanceMeta((prev) => ({
        ...prev,
        purpose: selectedCertificate.purpose || selectedCertificate.certPurpose || prev.purpose || '',
        dateIssued: prev.dateIssued || new Date().toISOString().split('T')[0]
      }));
    }
  }, [selectedCertificate, setIssuanceMeta]);

  // ── 3. HANDLER FOR SELECTING A CERTIFICATE & SYNCING URL ──
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

  // Helper para sa tamang paglabas ng applicant name (Resident o Business)
  const getApplicantName = (cert) => {
    if (cert.applicantType === 'Business' || cert.businessName) {
      return `${cert.businessName || 'Business'} (${cert.ownerName || 'No Owner'})`;
    }
    const fullName = `${cert.firstName || ''} ${cert.lastName || ''}`.trim();
    return fullName || 'Unnamed Applicant';
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

        {/* Approved Certs Table */}
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

      {/* ═══ SECTION 2: ISSUANCE WORKSPACE ═══ */}
      <div className="cert-section-card">
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
                onClick={clearSelectedCert}
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
                        value={issuanceMeta.purpose || selectedCertificate.purpose || selectedCertificate.certPurpose || ''} 
                        onChange={(e) => setIssuanceMeta({ ...issuanceMeta, purpose: e.target.value })} 
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>Remarks</label>
                      <input 
                        className="fc" 
                        value={issuanceMeta.remarks || ''} 
                        onChange={(e) => setIssuanceMeta({ ...issuanceMeta, remarks: e.target.value })} 
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
                        onChange={(e) => setIssuanceMeta({ ...issuanceMeta, dateIssued: e.target.value })} 
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>OR No. <span className="req" style={{ color: 'red' }}>*</span></label>
                      <input 
                        className="fc" 
                        value={issuanceMeta.orNumber || ''} 
                        onChange={(e) => setIssuanceMeta({ ...issuanceMeta, orNumber: e.target.value })} 
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>Amt. Paid <span className="req" style={{ color: 'red' }}>*</span></label>
                      <input 
                        type="number" 
                        className="fc" 
                        value={issuanceMeta.amountPaid || ''} 
                        onChange={(e) => setIssuanceMeta({ ...issuanceMeta, amountPaid: e.target.value })} 
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
                        onChange={(e) => setIssuanceMeta({ ...issuanceMeta, ctcNumber: e.target.value })} 
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>CTC Amt. Paid</label>
                      <input 
                        type="number" 
                        className="fc" 
                        value={issuanceMeta.ctcAmountPaid || ''} 
                        onChange={(e) => setIssuanceMeta({ ...issuanceMeta, ctcAmountPaid: e.target.value })} 
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: '12px' }}>CTC Date Issued</label>
                      <input 
                        type="date" 
                        className="fc" 
                        value={issuanceMeta.ctcDateIssued || issuanceMeta.dateIssued || ''} 
                        onChange={(e) => setIssuanceMeta({ ...issuanceMeta, ctcDateIssued: e.target.value })} 
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="cert-action-bar" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                  <button type="button" className="btn btn-g" onClick={() => handlePrintFormat('a')}> Print Original </button>
                  <button type="button" className="btn btn-g" onClick={() => handlePrintFormat('b')}> Print Copy </button>
                  <button type="button" className="btn btn-p" onClick={handleSaveOnly}> Save Record </button>
                  <button type="button" className="btn btn-primary" onClick={() => handlePrintDocument(selectedCertificate)}> 🖨️ Print Document </button>
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

    </div>
  );
}