import React, { useRef } from 'react';

export default function BlotterCertificatePrintModal({ isOpen, onClose, blotterData }) {
  if (!isOpen || !blotterData) return null;

  // I-determine kung CFA o Settlement Certificate ang kailangang i-print
  const isCFA = blotterData.status?.toLowerCase().includes('cfa') || 
                blotterData.status?.toLowerCase().includes('pnp') ||
                blotterData.cfaIssued === true;

  const title = isCFA ? "CERTIFICATE TO FILE ACTION" : "KATIBAYAN NG KASUNDUAN (CERTIFICATE OF SETTLEMENT)";

  const handlePrint = () => {
    window.print();
  };

  // Mga detalye ng Blotter Case
  const caseNo = blotterData.trackingNo || blotterData.caseNo || blotterData.refNumber || blotterData._id || 'N/A';
  const complainant = blotterData.complainant || blotterData.complainantName || '_______________';
  const respondent = blotterData.respondent || blotterData.respondentName || '_______________';
  const incidentType = blotterData.incidentType || blotterData.subject || 'LUPONG TAGAPAYAPA CASE';
  const incidentDate = blotterData.incidentDate || 'N/A';
  const resolution = blotterData.resolution || blotterData.notes || blotterData.narrative || 'Ang magkabilang panig ay nagkakasundo sa maayos at mapayapang paraan.';

  const currentDate = new Date().toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="print-modal-overlay">
      <style>{`
        /* Modal Backdrop & Outer Container */
        .print-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
          padding: 20px;
          overflow-y: auto;
        }

        .print-modal-content {
          background: #ffffff;
          color: #000000;
          width: 100%;
          max-width: 800px;
          border-radius: 12px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .modal-actions-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 24px;
          background: #1f2937;
          color: #ffffff;
          border-bottom: 1px solid #374151;
        }

        .btn-print {
          background: #2563eb;
          color: white;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-weight: 700;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-print:hover {
          background: #1d4ed8;
        }

        .btn-close-modal {
          background: transparent;
          color: #9ca3af;
          border: none;
          font-size: 20px;
          cursor: pointer;
        }

        .btn-close-modal:hover {
          color: #ffffff;
        }

        /* Printable Document Body */
        .printable-certificate {
          padding: 40px 50px;
          font-family: 'Times New Roman', Times, serif;
          line-height: 1.6;
          color: #000000;
          background: #ffffff;
        }

        .cert-header {
          text-align: center;
          border-bottom: 2px solid #000000;
          padding-bottom: 15px;
          margin-bottom: 25px;
          position: relative;
        }

        .cert-header p {
          margin: 2px 0;
          font-size: 13px;
        }

        .cert-header h4 {
          margin: 4px 0;
          font-size: 16px;
          font-weight: bold;
          text-transform: uppercase;
        }

        .cert-title {
          text-align: center;
          font-size: 20px;
          font-weight: bold;
          text-decoration: underline;
          margin: 30px 0 20px 0;
          letter-spacing: 1px;
        }

        .case-meta-box {
          display: flex;
          justify-content: space-between;
          margin-bottom: 25px;
          font-size: 14px;
        }

        .party-block {
          margin-bottom: 20px;
          font-size: 15px;
        }

        .cert-body-text {
          font-size: 15px;
          text-align: justify;
          text-indent: 40px;
          margin-bottom: 20px;
        }

        .resolution-box {
          border: 1px solid #000000;
          padding: 15px;
          margin: 20px 0;
          font-style: italic;
          background: #fafafa;
          font-size: 14px;
        }

        .signatures-container {
          margin-top: 50px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
        }

        .sig-block {
          text-align: center;
          margin-top: 30px;
        }

        .sig-line {
          border-top: 1px solid #000000;
          margin-top: 40px;
          padding-top: 5px;
          font-weight: bold;
          text-transform: uppercase;
        }

        .official-seal-footer {
          margin-top: 60px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        /* PRINT STYLES rules for paper generation */
        @media print {
          body * {
            visibility: hidden;
          }

          .print-modal-overlay {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            background: none;
            padding: 0;
            backdrop-filter: none;
          }

          .modal-actions-bar {
            display: none !important;
          }

          .print-modal-content {
            box-shadow: none;
            border-radius: 0;
            max-width: 100%;
            width: 100%;
          }

          .printable-certificate, .printable-certificate * {
            visibility: visible;
          }

          .printable-certificate {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20mm 15mm;
          }

          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>

      <div className="print-modal-content">
        {/* Top Control Bar (Hidden on Print) */}
        <div className="modal-actions-bar">
          <div style={{ fontWeight: 600 }}>📄 Document Print Preview</div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button className="btn-print" onClick={handlePrint}>
              🖨️ Print / Save as PDF
            </button>
            <button className="btn-close-modal" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Printable Official Document Body */}
        <div className="printable-certificate">
          {/* Header */}
          <div className="cert-header">
            <p>Republic of the Philippines</p>
            <p>Province of Camarines Sur</p>
            <p>Municipality of Nabua</p>
            <h4>BARANGAY BUSTRAC</h4>
            <p style={{ fontWeight: 'bold', marginTop: '6px' }}>OFFICE OF THE LUPONG TAGAPAYAPA</p>
          </div>

          {/* Case Number & Reference */}
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

          {/* Complainant vs Respondent Block */}
          <div className="party-block">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <strong>{complainant.toUpperCase()}</strong><br />
                <span style={{ fontSize: '12px', color: '#555' }}>Complainant/s</span>
              </div>
              <div style={{ fontWeight: 'bold', alignSelf: 'center' }}>— against —</div>
              <div style={{ textAlign: 'right' }}>
                <strong>{respondent.toUpperCase()}</strong><br />
                <span style={{ fontSize: '12px', color: '#555' }}>Respondent/s</span>
              </div>
            </div>
          </div>

          {/* Certificate Title */}
          <div className="cert-title">{title}</div>

          {/* Body Content */}
          {isCFA ? (
            /* CFA Content */
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
            /* Settlement Content */
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

          {/* Signatures of Parties */}
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

          {/* Official Signatures */}
          <div className="official-seal-footer">
            <div style={{ fontSize: '12px', fontStyle: 'italic', maxWidth: '250px' }}>
              ATTESTED BY:<br /><br />
              <div style={{ marginTop: '30px', fontWeight: 'bold', borderTop: '1px solid #000', paddingTop: '4px' }}>
                LUPO SECRETARY / MEMBER
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', marginBottom: '40px' }}>APPROVED / CERTIFIED BY:</div>
              <div style={{ fontWeight: 'bold', fontSize: '15px', textTransform: 'uppercase' }}>
                HON. PUNONG BARANGAY
              </div>
              <div style={{ fontSize: '12px' }}>Punong Barangay / Lupon Chairman</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}