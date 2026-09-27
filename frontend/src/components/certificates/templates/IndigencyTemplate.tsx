import React from 'react';
import nabuaLogo from '../../../assets/nabua-logo.jpg';
import bustracLogo from '../../../assets/bustrac-logo.png';

export interface IndigencyData {
  _id?: string;
  requestId?: string;
  fullName?: string;
  applicantName?: string;
  firstName?: string;
  lastName?: string;
  age?: number | string;
  civilStatus?: string;
  gender?: string;
  sex?: string;
  patientName?: string;
  relationToPatient?: string;
  address?: string;
  purok?: string;
  purpose?: string;
  remarks?: string;
  issuedAt?: string;
  dateIssued?: string;
  createdAt?: string;
  issueDate?: string;
  dayIssued?: string;
  monthYearIssued?: string;
  punongBarangay?: string;
  status?: string;

  // Direct Financial/CTC Props
  orNumber?: string;
  orNo?: string;
  ctcNo?: string;
  ctcNumber?: string;
  ctcDateIssued?: string;
  ctcPlaceIssued?: string;
  amountPaid?: number | string;

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
}

interface IndigencyProps {
  data: IndigencyData;
}

export const IndigencyTemplate: React.FC<IndigencyProps> = ({ data }) => {
  if (!data) return null;

  // 1. Safe Extraction ng Nested Issuance Metadata
  const meta = data.issuanceMeta || {};

  // 2. Dynamic Full Name & Resident Details
  const fullName = (
    data.fullName ||
    data.applicantName ||
    `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
    'MARI VILMA ARROYO OJANO'
  ).toUpperCase();
  const age = data.age !== undefined ? String(data.age) : '47';
  const civilStatus = (data.civilStatus || 'married').toLowerCase();
  const address = data.address || (data.purok ? `${data.purok} Bustrac, Nabua, Camarines Sur` : 'Zone 2 Bustrac, Nabua, Camarines Sur');
  const purpose = meta.purpose || data.purpose || 'applying for PHILHEALTH for indigent';

  // 3. Gender & Spouse Pronouns Logic
  const sexProp = data.gender || data.sex || '';
  const isMale = String(sexProp).toLowerCase() === 'male' || String(sexProp).toLowerCase() === 'm';
  const pronounHeShe = isMale ? 'he' : 'she';
  const spouseText = civilStatus === 'single' ? 'family' : isMale ? 'his wife' : 'her husband';

  // 4. Date Formatting with Ordinal Suffix
  const certDate = meta.dateIssued || data.issuedAt || data.dateIssued || data.issueDate || data.createdAt || new Date();
  const dateObj = new Date(certDate);
  const dayNum = !isNaN(dateObj.getTime()) ? dateObj.getDate() : new Date().getDate();
  
  const getOrdinalSuffix = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  
  const dayOrdinal = data.dayIssued || getOrdinalSuffix(dayNum);
  const monthName = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('en-US', { month: 'long' }) : 'September';
  const currentYear = !isNaN(dateObj.getTime()) ? dateObj.getFullYear() : 2026;

  // 5. CTC Details Extractions (Fallback sa issuanceMeta / Root)
  const ctcNo = meta.ctcNumber || data.ctcNumber || data.ctcNo || '07545833';
  const ctcDateIssued = meta.ctcDateIssued || data.ctcDateIssued || 'August 24, 2026';
  const ctcPlaceIssued = data.ctcPlaceIssued || 'Nabua, Cam. Sur';
  const rawAmt = meta.ctcAmountPaid !== undefined ? meta.ctcAmountPaid : (meta.amountPaid !== undefined ? meta.amountPaid : (data.amountPaid || '34.80'));
  const amountPaid = typeof rawAmt === 'number' ? rawAmt.toFixed(2) : String(rawAmt);

  // 6. Watermark Condition Check
  const isDuplicateMode = data.printMode === 'copy' || data.isDuplicate || data.status === 'Released';

  return (
  <div
    style={{
      border: '2px solid #000',
      padding: '40px 50px',
      background: '#fff',
      minHeight: '270mm',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxSizing: 'border-box',
      fontFamily: '"Times New Roman", Times, serif',
      color: '#000000',
      fontSize: '13px',
      lineHeight: '1.6',
      position: 'relative',
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

      <div>
        {/* Header Section with Logos */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div style={{ width: '85px', height: '85px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={nabuaLogo} alt="Municipality of Nabua Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ textAlign: 'center', flex: 1, padding: '0 10px' }}>
            <p style={{ margin: 0, fontSize: '12px' }}>Republic of the Philippines</p>
            <p style={{ margin: 0, fontSize: '12px' }}>Province of Camarines Sur</p>
            <p style={{ margin: 0, fontSize: '12px' }}>Municipality of Nabua</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
              BARANGAY BUSTRAC
            </p>
          </div>
          <div style={{ width: '85px', height: '85px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={bustracLogo} alt="Barangay Bustrac Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        </div>

        {/* Titles */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            OFFICE OF THE PUNONG BARANGAY
          </h3>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            BARANGAY CERTIFICATION OF INDIGENCY
          </h2>
        </div>

        {/* Salutation */}
        <p style={{ fontWeight: 'bold', marginBottom: '24px', fontSize: '13px' }}>
          TO WHOM IT MAY CONCERN:
        </p>

        {/* Certificate Body Paragraphs */}
        <div style={{ textIndent: '40px', textAlign: 'justify', lineHeight: '1.85', fontSize: '13px' }}>
          <p style={{ margin: '0 0 18px 0' }}>
            This is to certify that <strong>{fullName}</strong>, {age} yrs. old, {civilStatus}{' '}
            {data.patientName ? (
              <>
                , mother of patient <strong>{data.patientName.toUpperCase()}</strong>
              </>
            ) : null}
            , a bona fide resident of and with postal address at {address}.
          </p>
          <p style={{ margin: '0 0 18px 0' }}>
            This is to further certify that {pronounHeShe} belongs to an indigent family in our barangay, considering that {pronounHeShe} together with {spouseText} has no permanent source of income.
          </p>
          <p style={{ margin: '0 0 24px 0' }}>
            This Barangay Certification is issued upon request of the above-named person for information, record, and reference purposes for {purpose}.
          </p>
          <p style={{ margin: '0 0 40px 0' }}>
            Issued this <strong>{dayOrdinal}</strong> day of <strong>{monthName}</strong>, <strong>{currentYear}</strong> at Barangay Bustrac, Nabua, Camarines Sur.
          </p>
        </div>
      </div>

      {/* Signatory & CTC Footer Section */}
      <div style={{ marginTop: '40px' }}>
        {/* Punong Barangay Signature (Right Aligned) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
          <div style={{ textAlign: 'center', width: '260px' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase' }}>
              {data.punongBarangay || 'HON. ANNABELLE E. RULL'}
            </p>
            <p style={{ margin: '2px 0 0 0', fontSize: '11px' }}>Punong Barangay</p>
          </div>
        </div>

        {/* CTC Info Block (Bottom Left) */}
        <div style={{ fontSize: '11px', lineHeight: '1.45' }}>
          <div><strong>CTC No.:</strong> {ctcNo}</div>
          <div><strong>Date Issued:</strong> {ctcDateIssued}</div>
          <div><strong>Place Issued:</strong> {ctcPlaceIssued}</div>
          <div>
            <strong>Amt. Paid:</strong>{' '}
            <strong>{amountPaid.startsWith('Php') || amountPaid.startsWith('₱') ? amountPaid : `Php ${amountPaid}`}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndigencyTemplate;