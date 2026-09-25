import React from 'react';
import nabuaLogo from '../../../assets/nabua-logo.jpg';
import bustracLogo from '../../../assets/bustrac-logo.png';

export interface BusinessPermitData {
  _id?: string;
  bcIdNo?: string;
  businessName?: string;
  ownerName?: string;
  fullName?: string;
  applicantName?: string;
  firstName?: string;
  lastName?: string;
  nationality?: string;
  contactNo?: string;
  contactNos?: string;
  civilStatus?: string;
  occupation?: string;
  address?: string;
  purok?: string;
  businessAddress?: string;
  purpose?: string;
  clearanceYear?: string | number;
  clearanceExpires?: string;
  kindOfTransaction?: string;
  regDate?: string;
  issuedAt?: string;
  dateIssued?: string;
  createdAt?: string;
  issueDate?: string;
  punongBarangay?: string;
  orNo?: string;
  orNumber?: string;
  amountPaid?: number | string;
  photoUrl?: string;
  ctcNo?: string;
  ctcNumber?: string;
  ctcDateIssued?: string;
  ctcPlaceIssued?: string;
  status?: string;
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
  printMode?: string;
  isDuplicate?: boolean;
}

interface BusinessPermitProps {
  data: BusinessPermitData;
}

export const BusinessPermit: React.FC<BusinessPermitProps> = ({ data }) => {
  if (!data) return null;

  const meta = data.issuanceMeta || {};

  const bcIdNo = data.bcIdNo || '0156';
  const ownerName = (
    data.ownerName ||
    data.fullName ||
    data.applicantName ||
    `${data.lastName || ''}, ${data.firstName || ''}`.replace(/^,\s*/, '').trim() ||
    'DELA CRUZ, JUAN'
  ).toUpperCase();
  const businessName = (data.businessName || 'BUSTRAC SARI-SARI STORE').toUpperCase();
  const address = (
    data.address ||
    (data.purok ? `${data.purok.toUpperCase()}, BUSTRAC, NABUA, CAMARINES SUR` : 'ZONE 5, BUSTRAC, NABUA, CAMARINES SUR')
  ).toUpperCase();
  const nationality = (data.nationality || 'FILIPINO').toUpperCase();
  const contactNo = data.contactNo || data.contactNos || 'N/A';
  const civilStatus = (data.civilStatus || 'SINGLE').toUpperCase();
  const occupation = (data.occupation || 'BUSINESS OWNER').toUpperCase();

  // Financial & OR Details
  const orNo = meta.orNumber || data.orNumber || data.orNo || 'N/A';
  const rawAmt = meta.amountPaid !== undefined ? meta.amountPaid : (data.amountPaid || '0.00');
  const amountPaid = typeof rawAmt === 'number' ? rawAmt.toFixed(2) : Number(rawAmt || 0).toFixed(2);

  // Dates Formatting
  const certDate = meta.dateIssued || data.issuedAt || data.dateIssued || data.issueDate || data.regDate || data.createdAt || new Date();
  const dateObj = new Date(certDate);
  const formattedDate = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : String(certDate);
  const clearanceYear = data.clearanceYear || (!isNaN(dateObj.getTime()) ? dateObj.getFullYear() : '2026');
  const clearanceExpires = data.clearanceExpires || 'DECEMBER 31';
  const kindOfTransaction = data.kindOfTransaction || 'Renewal';
  const printedDate = new Date().toLocaleDateString('en-US');

  // Watermark Condition Check
  const isDuplicateMode = data.printMode === 'copy' || data.isDuplicate || data.status === 'Released';

  return (
    <div
      style={{
        border: '2px solid #000',
        padding: '30px 40px',
        background: '#fff',
        minHeight: '270mm',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#000000',
        fontSize: '11px',
        lineHeight: '1.4',
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
          <div style={{ width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={nabuaLogo} alt="Municipality of Nabua Seal" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ textAlign: 'center', flex: 1, padding: '0 10px' }}>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold' }}>REPUBLIC OF THE PHILIPPINES</p>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold' }}>PROVINCE OF CAMARINES SUR</p>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold' }}>MUNICIPALITY OF NABUA</p>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              BARANGAY BUSTRAC
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              OFFICE OF THE PUNONG BARANGAY
            </p>
          </div>
          <div style={{ width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={bustracLogo} alt="Barangay Bustrac Seal" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        </div>

        {/* Yellow Document Title Banner */}
        <div
          style={{
            backgroundColor: '#FFCC00',
            border: '1.5px solid #000',
            textAlign: 'center',
            padding: '6px 0',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, letterSpacing: '1px', color: '#000' }}>
            BARANGAY BUSINESS CLEARANCE
          </h2>
        </div>

        {/* Top Info Grid: Photo & Applicant Details */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', alignItems: 'flex-start' }}>
          {/* Left: Photo Placeholder */}
          <div
            style={{
              width: '120px',
              height: '130px',
              border: '1px solid #000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center', // Inayos mula 'justify' papuntang 'justifyContent'
              textAlign: 'center',
              padding: '8px',
              fontSize: '10px',
              fontWeight: 'bold',
              boxSizing: 'border-box',
              background: '#fcfcfc',
            }}
          >
            {data.photoUrl ? (
              <img src={data.photoUrl} alt="Applicant" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              '[ PHOTO PLACEHOLDER ]'
            )}
          </div>

          {/* Center: Applicant Metadata */}
          <div style={{ flex: 1, fontSize: '11px', lineHeight: '1.5' }}>
            <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{ownerName}</div>
            <div style={{ fontSize: '9px', fontStyle: 'italic', marginBottom: '6px' }}>(Owner/Proprietor)</div>
            <div><strong>{address}</strong></div>
            <div><strong>Nationality:</strong> {nationality}</div>
            <div><strong>Contact:</strong> {contactNo}</div>
            <div><strong>Civil Status:</strong> {civilStatus}</div>
            <div><strong>Occupation:</strong> {occupation}</div>
          </div>

          {/* Right: Business Control Metadata */}
          <div style={{ width: '160px', textAlign: 'right', fontSize: '11px', lineHeight: '1.4' }}>
            <div style={{ fontWeight: 900, fontSize: '14px' }}>{bcIdNo}</div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '6px' }}>BUSINESS ID NO.:</div>
            <div style={{ fontWeight: 'bold' }}>{clearanceYear}</div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '6px' }}>CLEARANCE YEAR</div>
            <div style={{ fontWeight: 'bold' }}>{clearanceExpires}</div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '6px' }}>CLEARANCE EXPIRES</div>
            <div style={{ fontWeight: 'bold' }}>{kindOfTransaction}</div>
            <div style={{ fontSize: '9px', fontWeight: 'bold' }}>KIND OF TRANSACTION</div>
          </div>
        </div>

        {/* Salutation & Body Terms */}
        <div style={{ fontSize: '11px', lineHeight: '1.5', textAlign: 'justify' }}>
          <p style={{ fontWeight: 'bold', margin: '0 0 10px 0' }}>TO WHOM IT MAY CONCERN:</p>
          <p style={{ margin: '0 0 8px 0' }}>
            This is to certify that the BUSINESS OWNER/OPERATOR/PROPRIETOR has been cleared of any liabilities and obligations. And granted/permitted to operate business in this barangay:
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            That the business as applied will not pollute the environment nor affect the health, convenience and safety of our residents.
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            That the Barangay Council has no objection in the proposed operation of the said business provided that the applicant will follow all Barangay and Municipal Laws and Ordinances concerning the proper operation of their business.
          </p>
          <p style={{ margin: '0 0 20px 0' }}>
            This BUSINESS CLEARANCE is issued upon request of the interested party in applying or renewing his/her business clearance to operate said establishment in compliance of Article (4) Section (152) of the 1991 Local Government Code of the Philippines and whatever legal purpose this official clearance may serve.
          </p>
        </div>

        {/* Middle Section: Business Entity & Payment / Seal Grid */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '10px' }}>
          {/* Left: Highlighted Business Name & Details */}
          <div style={{ flex: 1, paddingRight: '20px' }}>
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <div style={{ fontWeight: 900, fontSize: '15px', letterSpacing: '0.5px' }}>{businessName}</div>
              <div style={{ fontSize: '11px', marginTop: '2px' }}>{address}</div>
            </div>

            {/* Applicant Signature Block */}
            <div style={{ textAlign: 'center', marginTop: '45px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '12px', borderBottom: '1px solid #000', display: 'inline-block', padding: '0 20px' }}>
                {ownerName}
              </div>
              <div style={{ fontSize: '10px', marginTop: '2px' }}>Name and Signature of Applicant</div>
            </div>

            {/* Punong Barangay Signature Block */}
            <div style={{ textAlign: 'center', marginTop: '35px' }}>
              <div style={{ fontWeight: 900, fontSize: '13px' }}>
                {data.punongBarangay || 'HON. ANNABELLE E. RULL'}
              </div>
              <div style={{ fontSize: '10px' }}>Punong Barangay</div>
            </div>
          </div>

          {/* Right: Payment Details & Seal Placeholder */}
          <div style={{ width: '220px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '8px' }}>
              Paid under the following<br />O.R. Details:
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{orNo}</div>
            <div style={{ fontSize: '9px', marginBottom: '8px' }}>O.R. No.</div>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{formattedDate}</div>
            <div style={{ fontSize: '9px', marginBottom: '8px' }}>O.R. Date Issued</div>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>₱{amountPaid}</div>
            <div style={{ fontSize: '9px', marginBottom: '15px' }}>Amount Paid</div>

            {/* Seal / QR Placeholder Box */}
            <div
              style={{
                border: '1px dashed #000',
                height: '110px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center', // Inayos mula 'justify' papuntang 'justifyContent'
                padding: '10px',
                fontSize: '9px',
                fontWeight: 'bold',
                color: '#333',
                background: '#fafafa',
              }}
            >
              [ SEAL / QR / BARCODE PLACEHOLDER ]
            </div>
          </div>
        </div>
      </div>

      {/* Footer Legal Terms */}
      <div style={{ borderTop: '1px solid #000', paddingTop: '8px', marginTop: '15px', fontSize: '8px', lineHeight: '1.3' }}>
        <p style={{ margin: '0 0 4px 0' }}>
          This clearance shall be posted conspicuously at the place where the business is/are being conducted and shall be presented and or surrendered to competent authorities upon demand. NOT TRANSFERABLE AND NOT VALID WITHOUT OFFICIAL SEAL AND BUSINESS CLEARANCE PAYMENT. In case of closure of business, please notify this barangay for further clearance and certification.
        </p>
        <p style={{ fontWeight: 'bold', margin: '0 0 6px 0' }}>
          ERASURE AND/OR ALTERATION WILL INVALIDATE THIS CLEARANCE.
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
          <span style={{ fontWeight: 'bold', fontStyle: 'italic', margin: '0 auto' }}>
            — NOT VALID WITHOUT OFFICIAL SEAL —
          </span>
          <span style={{ fontSize: '8px', color: '#555' }}>
            System Generated: Date Printed: {printedDate}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BusinessPermit;