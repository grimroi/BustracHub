import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import barangayLogo from '../assets/bustrac-logo.png';
import nabuaLogo from '../assets/nabua-logo.jpg';
import { createAuditLog, localDb } from '../services/db';

export default function BlotterCertificatePrintModal({ isOpen, onClose, blotterData }) {
  const [systemSettings, setSystemSettings] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
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
  }, [isOpen, onClose]);

  useEffect(() => {
    async function fetchBarangaySettings() {
      try {
        const savedData = await localDb.get('setting_barangay_officials');
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

  const isCFA = blotterData?.status?.toLowerCase().includes('cfa') ||
                blotterData?.status?.toLowerCase().includes('pnp') ||
                blotterData?.cfaIssued === true;

  const title = isCFA ? "CERTIFICATE TO FILE ACTION" : "KATIBAYAN NG KASUNDUAN (CERTIFICATE OF SETTLEMENT)";
  const caseNo = blotterData?.trackingNo || blotterData?.caseNo || blotterData?.refNumber || blotterData?._id || 'N/A';
  const rawDate = blotterData?.dateFiled || blotterData?.incidentDate || blotterData?.date || blotterData?.createdAt;

  const verificationPayload = useMemo(() => {
  if (!blotterData) return '';

  let baseUrl = systemSettings?.publicDomain || blotterData?.publicDomain;

  if (!baseUrl || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    baseUrl = 'http://192.168.1.7:5173';
  }

  baseUrl = baseUrl.replace(/\/$/, '');

  const cleanCaseNo = caseNo.replace(/[^a-zA-Z0-9]/g, '');
  const dateTimestamp = new Date(rawDate || Date.now()).getTime().toString(36).toUpperCase();
  const hash = `BB-${cleanCaseNo}-${dateTimestamp}`;

  const params = new URLSearchParams({
    caseNo: caseNo,
    type: title,
    hash: hash
  });

  return `${baseUrl}/verify?${params.toString()}`;
}, [title, caseNo, rawDate, blotterData, systemSettings]);

  if (!isOpen || !blotterData) return null;

  const handlePrint = async () => {
    window.print();
    try {
      await createAuditLog({
        action: isCFA ? 'PRINT_CERTIFICATE_CFA' : 'PRINT_CERTIFICATE_SETTLEMENT',
        category: 'BLOTTER',
        targetId: caseNo,
        details: `Printed & issued ${title} for Case Ref: ${caseNo}`,
        user: blotterData?.currentUser || 'Barangay Secretary'
      });
    } catch (error) {
      console.error("Failed to record audit log for print action:", error);
    }
  };

  const complainant = typeof blotterData.complainant === 'object'
    ? (blotterData.complainant?.name || blotterData.complainant?.displayName || '_______________')
    : (blotterData.complainant || blotterData.complainantName || blotterData.compName || '_______________');

  const respondent = typeof blotterData.respondent === 'object'
    ? (blotterData.respondent?.name || blotterData.respondent?.displayName || '_______________')
    : (blotterData.respondent || blotterData.respondentName || blotterData.respName || '_______________');

  const incidentType = blotterData.incidentType || blotterData.subject || 'LUPONG TAGAPAYAPA CASE';
  const incidentDate = (rawDate && rawDate !== 'N/A') ? new Date(rawDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A';
  const defaultRemarks = isCFA
    ? "Walang napagkasunduan / Hindi sumipot ang Inirereklamo sa kabila ng mga ipinadalang patawag."
    : "Ang magkabilang panig ay nagkakasundo sa maayos at mapayapang paraan.";
  const resolution = blotterData.resolution || blotterData.notes || blotterData.narrative || blotterData.remarks || defaultRemarks;
  const currentDate = new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });

  const captainName = blotterData?.captainName || blotterData?.punongBarangay || systemSettings?.punongBarangay || "HON. ANNABELLE E. RULL";
  const secretaryName = blotterData?.secretaryName || blotterData?.luponSecretary || systemSettings?.luponSecretary || "MRS. MELY M. PRESADO";

  return (
    <div className="print-modal-overlay">
      <style>{`
        .print-modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(15, 23, 42, 0.85); backdrop-filter: blur(6px);
          display: flex; justify-content: center; align-items: center; z-index: 99999; padding: 20px;
        }
        .print-modal-content {
          background: #0f172a; color: #f8fafc; width: 100%; max-width: 900px; height: 90vh;
          border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
          border: 1px solid #334155; display: flex; flex-direction: column; overflow: hidden;
        }
        .modal-actions-bar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 20px; background: #1e293b; border-bottom: 1px solid #334155; flex-shrink: 0;
        }
        .btn-print {
          background: #2563eb; color: #ffffff; border: none; padding: 8px 18px;
          border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; transition: background 0.2s ease;
        }
        .btn-print:hover { background: #1d4ed8; }
        .btn-close-modal { background: transparent; color: #94a3b8; border: none; font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
        .btn-close-modal:hover { color: #ffffff; background: rgba(255, 255, 255, 0.1); }
        .paper-scroll-wrapper {
          flex: 1; overflow-y: auto; padding: 30px 20px; background: #0f172a;
          display: flex; justify-content: center; align-items: flex-start;
        }
        .printable-certificate {
          position: relative; width: 210mm; min-height: 297mm; padding: 20mm 18mm;
          font-family: 'Times New Roman', Times, serif; line-height: 1.6; color: #000000;
          background: #ffffff; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
          border-radius: 2px; box-sizing: border-box; margin: 0 auto;
        }
        .watermark-container {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          opacity: 0.08; pointer-events: none; z-index: 1;
        }
        .watermark-img { width: 320px; height: 320px; object-fit: contain; }
        .cert-content-inner { position: relative; z-index: 2; }
        .cert-header-wrapper {
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 2px solid #000000; padding-bottom: 12px; margin-bottom: 20px;
        }
        .cert-logo { width: 75px; height: 75px; object-fit: contain; }
        .cert-header-text { text-align: center; flex: 1; }
        .cert-header-text p { margin: 2px 0; font-size: 13px; }
        .cert-header-text h4 { margin: 4px 0; font-size: 16px; font-weight: bold; text-transform: uppercase; }
        .cert-title { text-align: center; font-size: 19px; font-weight: bold; text-decoration: underline; margin: 25px 0 20px 0; letter-spacing: 0.5px; }
        .case-meta-box { display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 14px; }
        .party-block { margin-bottom: 20px; font-size: 15px; }
        .cert-body-text { font-size: 15px; text-align: justify; text-indent: 40px; margin-bottom: 16px; }
        .resolution-box { border: 1px solid #000000; padding: 12px 16px; margin: 20px 0; font-style: italic; background: #fafafa; font-size: 14px; }
        .signatures-container { margin-top: 35px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .sig-block { text-align: center; margin-top: 15px; }
        .sig-line { border-top: 1px solid #000000; margin-top: 35px; padding-top: 5px; font-weight: bold; text-transform: uppercase; }
        .official-seal-footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
        .verification-footer-bar { margin-top: 35px; border-top: 1px dashed #666666; padding-top: 10px; display: flex; align-items: center; justify-content: space-between; }
        .qr-code-box { display: flex; align-items: center; gap: 12px; }
        .qr-text-meta { font-size: 10px; color: #444444; line-height: 1.3; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { height: 100vh !important; overflow: hidden !important; background: #ffffff !important; }
          body * { visibility: hidden !important; }
          .printable-certificate, .printable-certificate * { visibility: visible !important; }
          .printable-certificate {
            position: fixed !important; left: 0 !important; top: 0 !important;
            width: 210mm !important; height: 297mm !important; max-height: 297mm !important;
            margin: 0 !important; padding: 15mm 15mm !important; box-shadow: none !important;
            border: none !important; background: #ffffff !important; page-break-inside: avoid !important;
            break-inside: avoid !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          .watermark-container { opacity: 0.08 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .modal-actions-bar, .print-modal-overlay { background: transparent !important; backdrop-filter: none !important; }
        }
      `}</style>

      <div className="print-modal-content">
        <div className="modal-actions-bar">
          <div style={{ fontWeight: 600, fontSize: '14px' }}>
            Print Preview — {isCFA ? 'Certificate to File Action' : 'Certificate of Settlement'}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button type="button" className="btn-print" onClick={handlePrint}>
              Print / Save as PDF
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
                <div className="qr-code-box">
                  {verificationPayload && (
                    <QRCodeSVG value={verificationPayload} size={80} level="L" includeMargin={true} />
                  )}
                  <div className="qr-text-meta">
                    <strong>OFFICIAL BARANGAY DOCUMENT</strong><br />
                    <span>Case Ref: {caseNo}</span><br />
                    <span>Scan to verify document integrity</span>
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: '#666', textAlign: 'right' }}>
                  <span>Barangay Bustrac Management Information System</span><br />
                  <span>Camarines Sur, Philippines</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}