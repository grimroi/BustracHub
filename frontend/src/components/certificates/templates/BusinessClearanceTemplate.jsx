import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import bustracLogo from '../../../assets/bustrac-logo.png';
import nabuaLogo from '../../../assets/nabua-logo.jpg';
import { normalizeQrConfig, buildVerifyUrl } from '../../../utils/qrConfig';
import { validateCertificateData } from '../../../utils/certHelpers';

const BusinessClearanceTemplate = ({ data = {}, publicDomain, qrConfig }) => {
  const validation = validateCertificateData(data);
  if (!validation.valid) {
    return (
      <div style={{ border: '2px solid #c00', padding: '24px', maxWidth: '210mm', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <h3 style={{ color: '#c00' }}>⚠️ Cannot Render Certificate</h3>
        <p>The following required fields are missing. Please complete them before printing:</p>
        <ul>
          {validation.missing.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </div>
    );
  }

  // Kunin ang kumpletong pangalan ng applicant / owner
  const fullName = (
    data.fullName ||
    data.ownerName ||
    `${data.lastName || ''}, ${data.firstName || ''} ${data.middleName || ''}`.trim() ||
    `${data.firstName || ''} ${data.lastName || ''}`.trim()
  ).toUpperCase();

  const printedDate = new Date().toLocaleDateString('en-US');

  // ── Configurable QR verification ──
  const qr = normalizeQrConfig({
    ...(qrConfig || {}),
    baseUrl: qrConfig?.baseUrl || publicDomain || '',
  });
  const verifyUrl = qr.enabled ? buildVerifyUrl(data._id, qr) : '';

  // Clearance year + expiry come from stored data when available; a missing
  // expiry is rendered as a placeholder instead of a fabricated date.
  const clearanceYear = String(data.clearanceYear || '').trim();
  const formatExpiry = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      .toUpperCase();
  };
  const expiryLabel = formatExpiry(data.expiryDate) || '[ EXPIRY NOT SET ]';

  return (
    <div style={{ 
        width: '100%',
        maxWidth: '210mm',
        minHeight: '297mm', 
        padding: '8mm 10mm',  
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontSize: '11px',
        lineHeight: '1.3',
        margin: '0 auto', 
        }}
    >
      <div>
        {/* ── HEADER WITH LOGOS ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}
        >
          <img
            src={nabuaLogo}
            alt="Municipality Logo"
            style={{ width: '70px', height: '70px', objectFit: 'contain' }}
          />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <p style={{ margin: 0, fontSize: '11px' }}>Republic of the Philippines</p>
            <p style={{ margin: 0, fontSize: '11px' }}>Province of Camarines Sur</p>
            <p style={{ margin: 0, fontSize: '11px' }}>Municipality of Nabua</p>
            <p
              style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: 'bold',
                textDecoration: 'underline',
              }}
            >
              BARANGAY BUSTRAC
            </p>
            <h3
              style={{
                margin: '4px 0 0 0',
                fontSize: '15px',
                fontWeight: 'bold',
                letterSpacing: '0.5px',
              }}
            >
              OFFICE OF THE PUNONG BARANGAY
            </h3>
          </div>
          <img
            src={bustracLogo}
            alt="Barangay Logo"
            style={{ width: '70px', height: '70px', objectFit: 'contain' }}
          />
        </div>

        {/* ── YELLOW BANNER TITLE ── */}
        <div
          style={{
            backgroundColor: '#e3a008',
            color: '#000000',
            textAlign: 'center',
            padding: '6px 0',
            fontWeight: 'bold',
            fontSize: '18px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            margin: '10px 0 16px 0',
            border: '1px solid #b47d00',
          }}
        >
          BARANGAY BUSINESS CLEARANCE
        </div>

        {/* ── TOP SECTION: PHOTO, APPLICANT DETAILS, & METADATA ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '130px 1fr 140px',
            gap: '12px',
            marginBottom: '20px',
            alignItems: 'start',
          }}
        >
          {/* PHOTO PLACEHOLDER / CAPTURED PHOTO */}
          <div
            style={{
              width: '120px',
              height: '120px',
              border: '1px solid #000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: '10px',
              padding: '4px',
              boxSizing: 'border-box',
              background: '#f9f9f9',
            }}
          >
            {data.photoUrl ? (
              <img
                src={data.photoUrl}
                alt="Applicant"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
              />
            ) : (
              '[ PHOTO PLACEHOLDER ]'
            )}
          </div>

          {/* APPLICANT INFO */}
          <div style={{ fontSize: '11px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase' }}>
              {fullName || ''}
            </div>
            <div style={{ fontSize: '10px', color: '#333', marginBottom: '6px' }}>
              (Owner/Proprietor)
            </div>
            <div style={{ marginBottom: '2px' }}>
              <span style={{ fontWeight: 'bold' }}>
                {data.applicantAddress || data.address || ''}
              </span>
            </div>
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '10px' }}>Nationality:</div>
              <div style={{ fontWeight: 'bold' }}>{(data.nationality || '').toUpperCase()}</div>
            </div>
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '10px' }}>Contact:</div>
              <div style={{ fontWeight: 'bold' }}>{data.contactNo || ''}</div>
            </div>
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '10px' }}>Civil Status:</div>
              <div style={{ fontWeight: 'bold' }}>{(data.civilStatus || '').toUpperCase()}</div>
            </div>
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '10px' }}>Occupation:</div>
              <div style={{ fontWeight: 'bold' }}>{(data.occupation || '').toUpperCase()}</div>
            </div>
          </div>

          {/* RIGHT SIDE METADATA */}
          <div style={{ textAlign: 'right', fontSize: '10px', lineHeight: '1.4' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{data.bcIdNo || ''}</div>
            <div style={{ color: '#444' }}>Business ID No.:</div>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{clearanceYear || '—'}</div>
            <div style={{ color: '#444' }}>Clearance Year</div>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{expiryLabel}</div>
            <div style={{ color: '#444' }}>Clearance Expires</div>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>
              {data.kindOfTransaction || 'Renewal'}
            </div>
            <div style={{ color: '#444' }}>Kind of Transaction</div>
          </div>
        </div>

        {/* ── MAIN BODY: 2 COLUMNS (LEGAL TEXTS + O.R. DETAILS) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '20px', marginTop: '10px' }}>
          {/* LEFT COLUMN: LEGAL TEXT & CERTIFICATION */}
          <div style={{ textAlign: 'justify', fontSize: '11px', lineHeight: '1.45' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 'bold' }}>
              TO WHOM IT MAY CONCERN:
            </h4>
            <p style={{ margin: '0 0 10px 0' }}>
              This is to certify that the BUSINESS OWNER/OPERATOR/PROPRIETOR has been cleared of any
              liabilities and obligations. And granted/permitted to operate business in this barangay:
            </p>
            <p style={{ margin: '0 0 10px 0' }}>
              That the business as applied will not pollute the environment nor affect the health,
              convenience and safety of our residents.
            </p>
            <p style={{ margin: '0 0 10px 0' }}>
              That the Barangay Council has no objection in the proposed operation of the said business
              provided that the applicant will follow all Barangay and Municipal Laws and Ordinances
              concerning the proper operation of their business.
            </p>
            <p style={{ margin: '0 0 16px 0' }}>
              This BUSINESS CLEARANCE is issued upon request of the interested party in applying or
              renewing his/her business clearance to operate said establishment in compliance of
              Article (4) Section (152) of the 1991 Local Government Code of the Philippines and whatever
              legal purpose this official clearance may serve.
            </p>

            {/* BUSINESS NAME & ADDRESS DISPLAY */}
            <div style={{ textAlign: 'center', margin: '20px 0 15px 0' }}>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {data.businessName || ''}
              </div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', marginTop: '4px' }}>
                {data.businessAddress || ''}
              </div>
            </div>

            {/* APPLICANT SIGNATURE */}
            <div style={{ textAlign: 'center', marginTop: '25px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase' }}>
                {fullName || ''}
              </div>
              <div
                style={{
                  borderTop: '1px solid #000',
                  width: '220px',
                  margin: '2px auto 0 auto',
                  paddingTop: '2px',
                  fontSize: '10px',
                }}
              >
                Name and Signature of Applicant
              </div>
            </div>

            {/* PUNONG BARANGAY SIGNATURE */}
            <div style={{ textAlign: 'center', marginTop: '30px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase' }}>
                {data.captain || data.punongBarangay || ''}
              </div>
              <div style={{ fontSize: '11px', marginTop: '2px' }}>Punong Barangay</div>
            </div>
          </div>

          {/* RIGHT COLUMN: O.R. DETAILS & SEAL PLACEHOLDER */}
          <div style={{ textAlign: 'center', fontSize: '10px', paddingTop: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Paid under the following</div>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontWeight: 'bold' }}>O.R. Details:</div>
              <div style={{ fontWeight: 'bold', fontSize: '11px', marginTop: '2px' }}>
                {data.orNo || ''}
              </div>
              <div>OR. No.</div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '11px' }}>
                {data.dateIssued || data.regDate || ''}
              </div>
              <div>OR. Date Issued</div>
            </div>
            <div style={{ marginBottom: '25px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '11px' }}>
                {(Number(data.clearanceFee || 0) + Number(data.garbageFee || 0)).toFixed(2)}
              </div>
              <div>Total Fees Due</div>
            </div>

            {/* SEAL / QR VERIFICATION */}
            {verifyUrl ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px',
                  border: '1px solid #000',
                  background: '#ffffff',
                }}
              >
                <QRCodeSVG
                  value={verifyUrl}
                  size={qr.size}
                  level={qr.level}
                  includeMargin={qr.includeMargin}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
                <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#000', textAlign: 'center' }}>
                  {qr.label}
                </div>
              </div>
            ) : (
              <div
                style={{
                  border: '1px dashed #666',
                  height: '80px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                  color: '#444',
                  fontWeight: 'bold',
                  fontSize: '9px',
                }}
              >
                [ SEAL / OR / BARCODE PLACEHOLDER ]
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── FOOTER NOTICES ── */}
      <div style={{ fontSize: '8.5px', lineHeight: '1.2', borderTop: '1px solid #000', paddingTop: '6px', marginTop: '10px' }}>
        <p style={{ margin: '0 0 4px 0', textAlign: 'justify' }}>
          This clearance shall be posted conspicuously at the place where the business is/are being
          conducted and shall be presented and/or surrendered to competent authorities upon demand. NOT
          TRANSFERABLE AND NOT VALID WITHOUT OFFICIAL SEAL AND BUSINESS CLEARANCE PAYMENT. In case of closure
          of business, please notify this barangay for further clearance and certification.
        </p>
        <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', textAlign: 'center', fontSize: '9.5px' }}>
          ERASURE AND/OR ALTERATION WILL INVALIDATE THIS CLEARANCE.
        </p>
        <p
          style={{
            margin: '0 0 4px 0',
            fontWeight: 'bold',
            textAlign: 'center',
            fontSize: '10px',
            letterSpacing: '1px',
          }}
        >
          — NOT VALID WITHOUT OFFICIAL SEAL —
        </p>
        <div style={{ textAlign: 'right', color: '#555', fontSize: '8px' }}>
          System Generated: Date Printed: {printedDate}
        </div>
      </div>
    </div>
  );
};

export default BusinessClearanceTemplate;