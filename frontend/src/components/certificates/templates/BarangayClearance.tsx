import React from 'react';
import nabuaLogo from '../../../assets/nabua-logo.jpg';
import bustracLogo from '../../../assets/bustrac-logo.png';

export interface ClearanceData {
  fullName?: string;
  applicantName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  applicantType?: string;
  businessName?: string;
  age?: number | string;
  civilStatus?: string;
  address?: string;
  purok?: string;
  purpose?: string;
  issuedAt?: string;
  dateIssued?: string;
  createdAt?: string;
  issueDate?: string;
  punongBarangay?: string;
  orNumber?: string;
  orNo?: string;
  amountPaid?: number | string;
  ctcNo?: string;
  ctcNumber?: string;
  ctcDateIssued?: string;
  ctcPlaceIssued?: string;
  ctc?: {
    number?: string;
    dateIssued?: string;
    placeIssued?: string;
    amountPaid?: number | string;
  };
}

interface ClearanceProps {
  data: ClearanceData;
}

export const BarangayClearance: React.FC<ClearanceProps> = ({ data }) => {
  if (!data) return null;

  // 1. Dynamic Applicant Name / Entity
  const formattedName = [data.firstName, data.middleName, data.lastName]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  const applicantDisplayName =
    data.fullName ||
    data.applicantName ||
    (formattedName.length > 0 ? formattedName : 'MARIA DELA CRUZ SANTOS');

  const address =
    data.address ||
    (data.purok ? `${data.purok}, Barangay Bustrac, Nabua, Camarines Sur` : 'Barangay Bustrac, Nabua, Camarines Sur');
  
  const purpose = data.purpose || 'any legal purpose';

  // 2. Date Formatting
  const certDate = data.issuedAt || data.dateIssued || data.issueDate || data.createdAt || new Date();
  const dateObj = new Date(certDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // 3. CTC & OR Metadata
  const orNo = data.orNumber || data.orNo || 'N/A';
  const ctcNo = data.ctcNo || data.ctcNumber || data.ctc?.number || '07545833';
  const ctcDateIssued = data.ctcDateIssued || data.ctc?.dateIssued || formattedDate;
  const ctcPlaceIssued = data.ctcPlaceIssued || data.ctc?.placeIssued || 'Nabua, Cam. Sur';
  const rawAmt = data.amountPaid || data.ctc?.amountPaid || '34.80';
  const amountPaid = typeof rawAmt === 'number' ? rawAmt.toFixed(2) : rawAmt;

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
      }}
    >
      <div>
        {/* Header Section with Logos */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
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

        {/* Header Divider */}
        <hr style={{ borderColor: '#000000', borderWidth: '1px', margin: '12px 0 24px 0' }} />

        {/* Document Title */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
            BARANGAY CLEARANCE
          </h2>
        </div>

        {/* Salutation */}
        <p style={{ fontWeight: 'bold', marginBottom: '24px', fontSize: '13px' }}>
          TO WHOM IT MAY CONCERN:
        </p>

        {/* Main Clearance Content */}
        <div style={{ textIndent: '40px', textAlign: 'justify', lineHeight: '1.85', fontSize: '13px' }}>
          <p style={{ margin: '0 0 18px 0' }}>
            This is to certify that{' '}
            {data.applicantType === 'Business' ? (
              <strong>{(data.businessName || applicantDisplayName).toUpperCase()}</strong>
            ) : (
              <>
                <strong>{applicantDisplayName}</strong>, of legal age, a <em>bona fide</em> resident of {address}
              </>
            )}
            , has been found to be of <strong>GOOD MORAL CHARACTER</strong> and compliant with local regulations, with <strong>NO DEROGATORY RECORD</strong> on file in this jurisdiction as of this date.
          </p>

          <p style={{ margin: '0 0 18px 0' }}>
            This certification is issued upon the request of the above-named person for <strong>{purpose}</strong> and for whatever legal intent it may serve.
          </p>

          <p style={{ margin: '0 0 30px 0' }}>
            Given this <strong>{formattedDate}</strong> at Barangay Bustrac, Nabua, Camarines Sur.
          </p>
        </div>
      </div>

      {/* Footer Section: Signatory & Official Metadata */}
      <div style={{ marginTop: '40px' }}>
        {/* Punong Barangay Signature */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
          <div style={{ textAlign: 'center', width: '260px' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase' }}>
              {data.punongBarangay || 'HON. ANNABELLE E. RULL'}
            </p>
            <p style={{ margin: '2px 0 0 0', fontSize: '11px' }}>Punong Barangay</p>
          </div>
        </div>

        {/* Official Receipts & CTC Reference */}
        <div style={{ fontSize: '11px', lineHeight: '1.45', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div><strong>O.R. No.:</strong> {orNo}</div>
            <div><strong>CTC No.:</strong> {ctcNo}</div>
            <div><strong>Date Issued:</strong> {ctcDateIssued}</div>
            <div><strong>Place Issued:</strong> {ctcPlaceIssued}</div>
            <div><strong>Amt. Paid:</strong> <strong>{String(amountPaid).startsWith('Php') ? amountPaid : `Php${amountPaid}`}</strong></div>
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic' }}>
            * Not valid without official seal
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarangayClearance;