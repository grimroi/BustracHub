import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import barangayLogo from '../assets/bustrac-logo.png';
import nabuaLogo from '../assets/nabua-logo.jpg';
import { localDb as db } from '../services/db';
import { createAuditLog } from '../utils/auditLog';

export default function BlotterCertificatePrintModal({ isOpen, onClose, blotterData }) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [systemSettings, setSystemSettings] = useState(null);


  const isCFA = blotterData?.status?.toLowerCase().includes('cfa') || 
                blotterData?.status?.toLowerCase().includes('pnp') || 
                blotterData?.cfaIssued === true;
  
  const title = isCFA ? "CERTIFICATE TO FILE ACTION" : "KATIBAYAN NG KASUNDUAN (CERTIFICATE OF SETTLEMENT)";
  const caseNo = blotterData?.trackingNo || blotterData?.caseNo || blotterData?.refNumber || blotterData?._id || 'N/A';
  const rawDate = blotterData?.dateFiled || blotterData?.incidentDate || blotterData?.date || blotterData?.createdAt;


  const complainant = typeof blotterData?.complainant === 'object' ? (
    blotterData.complainant?.name || blotterData.complainant?.displayName || '_______________'
  ) : (
    blotterData?.complainant || blotterData?.complainantName || blotterData?.compName || '_______________'
  );

  const respondent = typeof blotterData?.respondent === 'object' ? (
    blotterData.respondent?.name || blotterData.respondent?.displayName || '_______________'
  ) : (
    blotterData?.respondent || blotterData?.respondentName || blotterData?.respName || '_______________'
  );

  const incidentType = blotterData?.incidentType || blotterData?.subject || 'LUPONG TAGAPAYAPA CASE';
  
  const incidentDate = rawDate && rawDate !== 'N/A' 
    ? new Date(rawDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) 
    : 'N/A';

  const defaultRemarks = isCFA 
    ? "Walang napagkasunduan / Hindi sumipot ang Inirereklamo sa kabila ng mga ipinadalang patawag." 
    : "Ang magkabilang panig ay nagkakasundo sa maayos at mapayapang paraan.";

  const resolution = blotterData?.resolution || blotterData?.notes || blotterData?.narrative || blotterData?.remarks || defaultRemarks;
  
  const currentDate = new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
  
  const captainName = blotterData?.captainName || blotterData?.punongBarangay || systemSettings?.punongBarangay || "HON. ANNABELLE E. RULL";
  
  const secretaryName = blotterData?.secretaryName || blotterData?.luponSecretary || systemSettings?.luponSecretary || "MRS. MELY M. PRESADO";


  

  // ═══════════════════════════════════════════════
  // 5. useCallback
  // ═══════════════════════════════════════════════
  const handlePrint = useCallback(async () => {
    setIsPrinting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      window.print();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      
      createAuditLog({
        action: isCFA ? 'PRINT_CERTIFICATE_CFA' : 'PRINT_CERTIFICATE_SETTLEMENT',
        category: 'BLOTTER',
        targetId: caseNo,
        details: `Printed & issued ${title} for Case Ref: ${caseNo}`,
        user: blotterData?.currentUser || 'Barangay Secretary'
      }).catch(err => console.warn('Audit log failed:', err));
    } catch (error) {
      console.error("Print error:", error);
     showToast('error', 'Failed to print certificate. Please try again.');
    } finally {
      setIsPrinting(false);
    }
  }, [isCFA, caseNo, title, blotterData]);

  useEffect(() => {
    async function fetchBarangaySettings() {
      try {
        const savedData = await db.get('setting_barangay_officials');
        setSystemSettings(savedData);
      } catch (err) {
        if (err.status !== 404) {
          console.warn('Using default official settings:', err.message);
        }
      }
    }
    if (isOpen) {
      fetchBarangaySettings();
    }
  }, [isOpen]);

  useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      onClose();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();

      if (typeof handlePrint === 'function') {
        handlePrint();
      } else {
        window.print();
      }
    }
  };

  if (isOpen) {
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
  }

  return () => {
    document.body.style.overflow = 'unset';
    window.removeEventListener('keydown', handleKeyDown);
  };
}, [isOpen, onClose, handlePrint]);

  if (!isOpen || !blotterData) {
    return null;

  }
  return createPortal(
    <div className="print-modal-overlay">
      <div className="print-modal-content">
        <div className="modal-actions-bar">
          <div style={{ fontWeight: 600, fontSize: '14px' }}>
            Print Preview — {isCFA ? 'Certificate to File Action' : 'Certificate of Settlement'}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button 
              type="button" 
              className="btn-print" 
              onClick={handlePrint}
              disabled={isPrinting} 
              style={{ 
                opacity: isPrinting ? 0.7 : 1, 
                cursor: isPrinting ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {isPrinting ? (
                <>
                  {/* Loading Spinner */}
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  Printing...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9V2h12v7" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 14h12v8H6z" />
                  </svg>
                  Print / Save as PDF
                </>
              )}
            </button>
            <button type="button" className="btn-close-modal" onClick={onClose} title="Close (Esc)">
              ✕
            </button>
          </div>
        </div>

        <div className="paper-scroll-wrapper">
          <div className="printable-certificate">
            <div className="watermark-container">
              <img src={barangayLogo} alt="Seal Background" className="watermark-img" />
            </div>

            <div className="cert-content-inner">
              <div className="cert-header-wrapper">
                <img src={barangayLogo} alt="Barangay Logo" className="cert-logo" />
                <div className="cert-header-text">
                  <p>Republic of the Philippines</p>
                  <p>Province of Camarines Sur</p> <p>Municipality of Nabua</p>
                  <h4>BARANGAY BUSTRAC</h4>
                  <p style={{ fontWeight: 'bold', marginTop: '4px' }}>OFFICE OF THE LUPONG TAGAPAYAPA</p>
                </div>
                <img src={nabuaLogo} alt="Nabua Seal" className="cert-logo" />
              </div>

              <div className="case-meta-box">
                <div>
                  <strong>KP Case No.:</strong> {caseNo}<br />
                  <strong>For:</strong> {incidentType}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>Date Filed:</strong> {incidentDate}<br />
                  <strong>Date Issued:</strong> {currentDate}
                </div>
              </div>

              <div className="party-block">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{complainant.toUpperCase()}</strong><br />
                    <span style={{ fontSize: '12px', color: '#555' }}>Complainant/s</span>
                  </div>
                  <div style={{ fontWeight: 'bold' }}>— against —</div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{respondent.toUpperCase()}</strong><br />
                    <span style={{ fontSize: '12px', color: '#555' }}>Respondent/s</span>
                  </div>
                </div>
              </div>

              <div className="cert-title">{title}</div>

              {isCFA ? (
                <div>
                  <p className="cert-body-text">
                    This is to certify that the above-mentioned case was filed before the Office of the Lupong Tagapayapa of Barangay Bustrac.
                  </p>
                  <p className="cert-body-text">
                    This certification is issued due to the personal failure or refusal of the Respondent(s) to appear before the Punong Barangay / Pangkat Tagapayapa without justifiable cause, despite due notice and summons properly served.
                  </p>
                  <p className="cert-body-text">
                    Therefore, the corresponding complaint for the dispute may now be filed in Court or the appropriate Government Office.
                  </p>
                  <div className="resolution-box">
                    <strong>Referral Notes / Remarks:</strong><br />
                    {resolution}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="cert-body-text">
                    Pinatutunayan na ang Nagrereklamo at ang Inirereklamo ay nagkaharap sa tanggapan ng Lupong Tagapayapa at malayang nagkasundo na ayusin ang kanilang hidwaan batay sa mga sumusunod na probisyon:
                  </p>
                  <div className="resolution-box">
                    <strong>Pinagkasunduang Kasunduan (Amicable Settlement Terms):</strong><br />
                    "{resolution}"
                  </div>
                  <p className="cert-body-text">
                    Ang kasunduang ito ay may lakas at bisa ng isang pinal na hatol ng hukuman matapos ang sampung (10) araw mula sa petsa ng paglagda nito.
                  </p>
                </div>
              )}

              {!isCFA && (
                <div className="signatures-container">
                  <div className="sig-block">
                    <div className="sig-line">{complainant}</div>
                    <div style={{ fontSize: '12px' }}>Lagda ng Nagrereklamo</div>
                  </div>
                  <div className="sig-block">
                    <div className="sig-line">{respondent}</div>
                    <div style={{ fontSize: '12px' }}>Lagda ng Inirereklamo</div>
                  </div>
                </div>
              )}

              <div className="official-seal-footer">
                <div style={{ fontSize: '12px', fontStyle: 'italic', maxWidth: '250px' }}>
                  ATTESTED BY:<br /><br />
                  <div style={{ marginTop: '25px', fontWeight: 'bold', borderTop: '1px solid #000', paddingTop: '4px', textTransform: 'uppercase' }}>
                    {secretaryName}
                  </div>
                  <div style={{ fontSize: '11px', textTransform: 'none' }}>Lupon Secretary / Member</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', marginBottom: '35px' }}>APPROVED / CERTIFIED BY:</div>
                  <div style={{ fontWeight: 'bold', fontSize: '15px', textTransform: 'uppercase' }}>
                    {captainName}
                  </div>
                  <div style={{ fontSize: '12px' }}>Punong Barangay / Lupon Chairman</div>
                </div>
              </div>

              <div className="verification-footer-bar">
              {!isCFA ? (
                <div className="qr-text-meta">
                  <strong>OFFICIAL BARANGAY DOCUMENT</strong><br />
                  <span>Case Ref: {caseNo}</span><br />
                  <span>Issued under the seal of Barangay Bustrac</span>
                </div>
              ) : (
                <div className="qr-text-meta" style={{ fontStyle: 'italic', color: '#444' }}>
                  <strong>OFFICIAL KP FORM NO. 20 (CFA)</strong><br />
                  <span>Case Ref: {caseNo}</span><br />
                  <span>Issued for Court / PNP Legal Proceeding Purposes</span>
                </div>
              )}
              <div style={{ fontSize: '10px', color: '#666', textAlign: 'right' }}>
                <span>Barangay Bustrac Management Information System</span><br />
                <span>Camarines Sur, Philippines</span>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
        {showSuccess && (
        <div style={{ 
          position: 'fixed', 
          bottom: '24px', 
          right: '24px', 
          background: '#10b981', 
          color: '#ffffff', 
          padding: '14px 20px', 
          borderRadius: '8px', 
          fontWeight: 600, 
          fontSize: '14px',
          zIndex: 999999, 
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'slideIn 0.3s ease-out forwards'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Certificate printed successfully!
        </div>
      )}
    </div>,
    document.body 
  );
}