import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import nabuaLogo from '../../../assets/nabua-logo.jpg';
import bustracLogo from '../../../assets/bustrac-logo.png';
import { validateCertificateData } from '../../../utils/certHelpers';

export interface ResidencyData {
  _id?: string;
  requestId?: string;
  fullName?: string;
  applicantName?: string;
  firstName?: string;
  lastName?: string;
  zone?: string;
  purok?: string;
  barangay?: string;
  municipality?: string;
  province?: string;
  maritalStatus?: string;
  civilStatus?: string;
  sex?: 'M' | 'F' | string;
  gender?: string;
  birthdate?: string;
  citizenship?: string;
  age?: number | string;
  yearsOfResidency?: number | string;
  purpose?: string;
  remarks?: string;
  issuedAt?: string;
  dateIssued?: string;
  issueDate?: string;
  createdAt?: string;
  dayIssued?: string;
  issuedDayOrdinal?: string;
  issuedMonthYear?: string;
  secretaryName?: string;
  punongBarangayName?: string;
  punongBarangay?: string;
  status?: string;

  // Direct Financial/CTC Props
  orNumber?: string;
  orNo?: string;
  orDate?: string;
  orAmount?: string;
  amountPaid?: number | string;
  ctcNumber?: string;
  ctcNo?: string;
  ctcDateIssued?: string;
  ctcAmount?: string;
  ctcPlaceIssued?: string;
  datePrinted?: string;
  trackingCode?: string;

  // Nested Issuance Metadata mula sa CouchDB
  issuanceMeta?: {
    orNumber?: string;
    amountPaid?: number | string;
    dateIssued?: string;
    remarks?: string;
    purpose?: string;
    noDerogatoryRecord?: boolean;
    ctcNumber?: string;
    ctcAmountPaid?: number | string;
    ctcDateIssued?: string;
  };

  // Print Mode indicators
  printMode?: string;
  isDuplicate?: boolean;
  [key: string]: any;
}

export interface ResidencyProps {
  data?: ResidencyData;
  publicDomain?: string;
}

export const ResidencyCertificate: React.FC<ResidencyProps> = ({ data, publicDomain }) => {
  if (!data) return null;

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

  // 1. Safe Extraction ng Nested Issuance Metadata
  const meta = data.issuanceMeta || {};

  // 2. Data Normalization & Fallbacks
  const fullName = (
    data.fullName ||
    data.applicantName ||
    `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
    ''
  ).toUpperCase();

  const zone = (data.zone || data.purok || '').toUpperCase();
  const barangay = (data.barangay || '').toUpperCase();
  const municipality = (data.municipality || '').toUpperCase();
  const province = (data.province || '').toUpperCase();
  const fullAddress = `${zone}, ${barangay}, ${municipality}, ${province}`.trim();

  const maritalStatus = data.maritalStatus || data.civilStatus || '';
  const sexProp = data.sex || data.gender || '';
  const sex = String(sexProp).toUpperCase().startsWith('M') ? 'M' : (sexProp ? 'F' : '');
  const pronounHeShe = sex === 'M' ? 'He' : (sexProp ? 'She' : '');

  const birthdate = data.birthdate || '';
  const citizenship = data.citizenship || '';
  const age = data.age !== undefined ? String(data.age) : '';
  const yearsOfResidency = data.yearsOfResidency || '';
  const purpose = meta.purpose || data.purpose || '';

  // 3. Date Extractions & Formatting
  const certDate = meta.dateIssued || data.issuedAt || data.dateIssued || data.issueDate || data.createdAt || new Date();
  const dateObj = new Date(certDate);
  const isValidDate = !isNaN(dateObj.getTime());

  const formattedDateIssued = isValidDate ? dateObj.toLocaleDateString('en-US') : '';

  const dayNum = isValidDate ? dateObj.getDate() : 0;
  const getOrdinalSuffix = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const issuedDayOrdinal = data.issuedDayOrdinal || data.dayIssued || getOrdinalSuffix(dayNum);
  const issuedMonthYear = data.issuedMonthYear || (isValidDate ? `${dateObj.toLocaleDateString('en-US', { month: 'long' })}, ${dateObj.getFullYear()}` : '');

  // Signatories
  const secretaryName = data.secretaryName || '';
  const punongBarangayName = data.punongBarangayName || data.punongBarangay || '';

  // O.R. Details
  const orNumber = meta.orNumber || data.orNumber || data.orNo || '';
  const orDate = meta.dateIssued ? new Date(meta.dateIssued).toLocaleDateString('en-US') : (data.orDate || formattedDateIssued);
  const rawOrAmt = meta.amountPaid !== undefined ? meta.amountPaid : (data.orAmount || data.amountPaid || '');
  const orAmount = typeof rawOrAmt === 'number' ? rawOrAmt.toFixed(2) : String(rawOrAmt);

  // CTC Details
  const ctcNumber = meta.ctcNumber || data.ctcNumber || data.ctcNo || '';
  const ctcDateIssued = meta.ctcDateIssued || data.ctcDateIssued || '';
  const rawCtcAmt = meta.ctcAmountPaid !== undefined ? meta.ctcAmountPaid : (data.ctcAmount || '');
  const ctcAmount = typeof rawCtcAmt === 'number' ? rawCtcAmt.toFixed(2) : String(rawCtcAmt);
  const ctcPlaceIssued = data.ctcPlaceIssued || '';

  const datePrinted = data.datePrinted || new Date().toLocaleDateString('en-US');

  // Verification URL (kung wala ang _id, wala ring QR)
  const verifyUrl = data._id
    ? `https://${publicDomain || 'localhost:5173'}/verify?id=${encodeURIComponent(data._id)}`
    : null;

  // 4. Watermark Condition Check
  const isDuplicateMode = data.printMode === 'copy' || data.isDuplicate || data.status === 'Released';

  return (
    <div
      style={{
        width: '800px',
        minHeight: '1050px',
        margin: '0 auto',
        padding: '32px 48px',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'Arial, sans-serif',
        boxSizing: 'border-box',
        position: 'relative',
        fontSize: '13px',
        lineHeight: '1.4',
        overflow: 'hidden',
      }}
    >
      {/* ═══ REPRINT / DUPLICATE WATERMARK OVERLAY ═══ */}
      {isDuplicateMode && (
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-35deg)',
            fontSize: '52px',
            fontWeight: 'bold',
            color: 'rgba(220, 38, 38, 0.18)',
            border: '8px dashed rgba(220, 38, 38, 0.25)',
            padding: '10px 30px',
            borderRadius: '12px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
            textTransform: 'uppercase',
            letterSpacing: '4px',
          }}
        >
          DUPLICATE COPY
        </div>
      )}

      {/* 1. HEADER SECTION */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <img src={nabuaLogo} alt="Municipality Logo" style={{ width: '90px', height: '90px', objectFit: 'contain' }} />
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '13px' }}>Republic of the Philippines</div>
          <div style={{ fontSize: '13px' }}>Province of Camarines Sur</div>
          <div style={{ fontSize: '13px' }}>Municipality of Nabua</div>
          <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '2px' }}>BARANGAY BUSTRAC</div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#333333' }}>OFFICE OF THE PUNONG BARANGAY</div>
        </div>
        <img src={bustracLogo} alt="Barangay Logo" style={{ width: '90px', height: '90px', objectFit: 'contain' }} />
      </div>

      {/* Header Divider */}
      <div style={{ width: '100%', height: '3px', backgroundColor: '#8daec6', marginBottom: '28px' }} />

      {/* 2. DOCUMENT TITLE */}
      <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 800, margin: '0 0 28px 0', letterSpacing: '0.5px' }}>
        Barangay Certification
      </h1>

      {/* 3. APPLICANT PHOTO & DETAILS BLOCK */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
        <div style={{ width: '110px', height: '110px', border: '1px solid #000000', flexShrink: 0, backgroundColor: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
          [ PHOTO ]
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ fontWeight: 800, fontSize: '14px' }}>{fullName}</div>
          <div style={{ fontWeight: 800, fontSize: '13px' }}>{fullAddress}</div>
          <div>Marital Status: {maritalStatus}</div>
          <div>
            <span style={{ textDecoration: 'underline' }}>Sex :</span> {sex} &nbsp;&nbsp;&nbsp;&nbsp;
            <span style={{ textDecoration: 'underline' }}>Birthdate :</span> {birthdate}
          </div>
          <div>
            <span style={{ textDecoration: 'underline' }}>Citizenship :</span> {citizenship} &nbsp;&nbsp;&nbsp;&nbsp; Age: {age}
          </div>
        </div>
      </div>

      {/* 4. DATE & SUBJECT */}
      <div style={{ marginBottom: '28px' }}>
        <div>
          Date <span style={{ textDecoration: 'underline' }}>issued :</span> {formattedDateIssued}
        </div>
        <div>
          <span style={{ textDecoration: 'underline' }}>Subject :</span> {purpose}
        </div>
      </div>

      {/* 5. BODY TEXT */}
      <div style={{ marginBottom: '20px', fontWeight: 800 }}>TO WHOM IT MAY CONCERN:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'justify' }}>
        <p style={{ textIndent: '40px', margin: 0 }}>
          This is to Certify that <strong>{fullName}</strong>, {age} yrs. old, {maritalStatus.toLowerCase()}, a bona fide resident of and with postal address at {zone} {barangay}, {municipality}, {province}.
        </p>
        <p style={{ textIndent: '40px', margin: 0 }}>
          {pronounHeShe} reside in this barangay for more or less {yearsOfResidency} years.
        </p>
        <p style={{ textIndent: '40px', margin: 0 }}>
          This Barangay Certification is issued upon the request of the above-named person for information record and reference purpose.
        </p>
        <p style={{ textIndent: '40px', margin: 0 }}>
          Issued this {issuedDayOrdinal} day of {issuedMonthYear} at Barangay Bustrac, Nabua, Camarines Sur.
        </p>
      </div>

      <div style={{ textAlign: 'center', margin: '24px 0 32px 0', fontSize: '12px' }}>
        ---oOo--- ---oOo---
      </div>

      {/* 6. CLAIMANT SIGNATURE */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ fontWeight: 800, textDecoration: 'underline', fontSize: '14px' }}>
          {fullName}
        </div>
        <div style={{ fontSize: '11px', marginTop: '2px' }}>Signature Over Printed Name of Claimant</div>
      </div>

      {/* 7. OFFICIALS SIGNATURE BLOCK */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div style={{ width: '45%' }}>
          <div style={{ fontWeight: 800, textDecoration: 'underline', marginBottom: '16px' }}>Prepared by:</div>
          <div style={{ fontWeight: 800, textDecoration: 'underline', fontSize: '13px' }}>{secretaryName.toUpperCase()}</div>
          <div style={{ fontWeight: 800, textDecoration: 'underline', fontSize: '13px' }}>Barangay Secretary</div>
        </div>
        <div style={{ width: '45%' }}>
          <div style={{ fontWeight: 800, textDecoration: 'underline', marginBottom: '16px' }}>Attested by:</div>
          <div style={{ fontWeight: 800, textDecoration: 'underline', fontSize: '13px' }}>{punongBarangayName.toUpperCase()}</div>
          <div style={{ fontWeight: 800, textDecoration: 'underline', fontSize: '13px' }}>Punong Barangay</div>
        </div>
      </div>

      {/* 8. FOOTER DATA & THUMBMARK BOXES */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '11px' }}>
        <div style={{ width: '30%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div><strong>System Generated:</strong></div>
          <div><strong>Date Printed : {datePrinted}</strong></div>
          <div style={{ marginTop: '10px' }}><strong>Paid Document</strong></div>
          <div><strong>NOT VALID WITHOUT OFFICIAL SEAL</strong></div>
        </div>

        <div style={{ width: '38%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div>Paid under the following:</div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>OR Date:</span><span>{orDate}</span></div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>OR No.:</span><span>{orNumber}</span></div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>Amt. Paid:</span><span>{orAmount.startsWith('₱') || orAmount.startsWith('Php') ? orAmount : `Php ${orAmount}`}</span></div>
          <div style={{ marginTop: '8px' }}>CTC Details:</div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>CTC Date Issued:</span><span>{ctcDateIssued}</span></div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>CTC No.:</span><span>{ctcNumber}</span></div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>CTC Amt.:</span><span>{ctcAmount.startsWith('₱') || ctcAmount.startsWith('Php') ? ctcAmount : `Php ${ctcAmount}`}</span></div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>Place Issued:</span><span>{ctcPlaceIssued}</span></div>
        </div>

        <div style={{ width: '28%', textAlign: 'center' }}>
          <div style={{ marginBottom: '6px' }}>Applicant's Thumb Mark</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', marginBottom: '4px' }}>LEFT</div>
              <div style={{ width: '65px', height: '70px', border: '1px solid #000000' }} />
            </div>
            <div>
              <div style={{ fontSize: '10px', marginBottom: '4px' }}>RIGHT</div>
              <div style={{ width: '65px', height: '70px', border: '1px solid #000000' }} />
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Verification */}
      {verifyUrl && (
        <div style={{ position: 'absolute', bottom: '40px', right: '40px', textAlign: 'center', zIndex: 20 }}>
          <QRCodeSVG
            value={verifyUrl}
            size={90}
            level="H"
            bgColor="#ffffff"
            fgColor="#000000"
            includeMargin={true}
          />
          <div style={{ fontSize: '9px', marginTop: '6px', fontWeight: 'bold', color: '#000' }}>
            Scan to Verify Authenticity
          </div>
        </div>
      )}
    </div>
  );
};

export default ResidencyCertificate;