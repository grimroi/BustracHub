import React from 'react';
import { QRCodeSVG } from 'qrcode.react'; 
import nabuaLogo from '../../../assets/nabua-logo.jpg';
import bustracLogo from '../../../assets/bustrac-logo.png';

export interface ClearanceData {
  _id?: string;
  requestId?: string;
  fullName?: string;
  applicantName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  applicantType?: string;
  businessName?: string;
  age?: number | string;
  sex?: string;
  birthdate?: string;
  civilStatus?: string;
  citizenship?: string;
  address?: string;
  purok?: string;
  zone?: string;
  purpose?: string;
  remarks?: string;
  issuedAt?: string;
  dateIssued?: string;
  createdAt?: string;
  issueDate?: string;
  punongBarangay?: string;
  barangaySecretary?: string;
  orNumber?: string;
  orNo?: string;
  amountPaid?: number | string;
  clearanceAmount?: number | string;
  ctcNo?: string;
  ctcNumber?: string;
  ctcDateIssued?: string;
  ctcPlaceIssued?: string;
  validity?: string;
  datePrinted?: string;
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

interface ClearanceProps {
  data: ClearanceData;
  publicDomain?: string;
}

export const BarangayClearance: React.FC<ClearanceProps> = ({ data, publicDomain }) => {
  if (!data) return null;

  const verifyUrl = data._id
    ? `https://${publicDomain || 'localhost:5173'}/verify?id=${encodeURIComponent(data._id)}`
    : null;
  // ── Helper: safe uppercase ──
  const u = (s?: string) => (s || '').toUpperCase();

  // ── Applicant Name ──
  const applicantDisplayName =
    data.fullName ||
    data.applicantName ||
    `${data.firstName || ''} ${data.middleName || ''} ${data.lastName || ''}`.trim() ||
    'MELY MONTEJO PRESADO';

  const lastName = data.lastName || 'PRESADO';
  const firstName = data.firstName || 'MELY';
  const middleName = data.middleName || 'MONTEJO';

  // ── Demographics ──
  const sex = data.sex || 'F';
  const birthdate = data.birthdate || '07/18/1961';
  const age = data.age !== undefined ? String(data.age) : '65';
  const civilStatus = data.civilStatus || 'Married';
  const citizenship = data.citizenship || 'Filipino';
  const purokZone = data.purok || data.zone || 'ZONE 4';
  const address = data.address || 'BUSTRAC, NABUA, CAMARINES SUR';
  const purpose = data.purpose || 'FOR MICRO FINANCE PURPOSE';
  const remarks = data.remarks || 'No Derogatory Record';

  // ── Dates ──
  const certDate = data.dateIssued || data.issuedAt || data.issueDate || data.createdAt || new Date();
  const dateObj = new Date(certDate);

  const dateIssuedStr = dateObj.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  // FIX: TypeScript error — gumamit ng numeric month para sa datePrinted
  const monthNum = dateObj.getMonth() + 1;
  const dayNum = dateObj.getDate();
  const yearNum = dateObj.getFullYear();
  const datePrinted = data.datePrinted || `${monthNum}/${dayNum}/${yearNum}`;

  // ── Financial / Official Metadata ──
  const orNo = data.orNumber || data.orNo || '8605032';
  const clearanceAmount = data.clearanceAmount || data.amountPaid || '100.00';
  const meta = data.issuanceMeta || {};
  const ctcNo = meta.ctcNumber || data.ctcNumber || data.ctcNo || '---00---';
  const validity = data.validity || '(6) Six Months Validity';

  // ── Signatories ──
  const punongBarangay = data.punongBarangay || 'HON. ANNABELLE E. RULL';
  const barangaySecretary = data.barangaySecretary || 'MRS. MELY M. PRESADO';

  return (
    <div
      style={{
        border: '2px solid #000',
        padding: '24px 28px',
        background: '#fff',
        minHeight: '270mm',
        position: 'relative', 
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        fontFamily: '"Times New Roman", Times, serif',
        color: '#000',
        fontSize: '11.5px',
        lineHeight: 1.5,
        maxWidth: '210mm',
        margin: '0 auto',
      }}
    >
      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ width: '75px', height: '75px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={nabuaLogo}
            alt="Municipality of Nabua Logo"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
        <div style={{ textAlign: 'center', flex: 1, padding: '0 8px' }}>
          <div style={{ fontSize: '11.5px', marginBottom: '2px' }}>Republic of the Philippines</div>
          <div style={{ fontSize: '11.5px', marginBottom: '2px' }}>Province of Camarines Sur</div>
          <div style={{ fontSize: '11.5px', marginBottom: '2px' }}>Municipality of Nabua</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '4px', letterSpacing: '0.5px' }}>
            Barangay Bustrac
          </div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
            OFFICE OF THE PUNONG BARANGAY
          </div>
        </div>
        <div style={{ width: '75px', height: '75px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={bustracLogo}
            alt="Barangay Bustrac Logo"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      </div>

      {/* Gold Banner */}
      <div
        style={{
          background: '#e6b800',
          color: '#000',
          textAlign: 'center',
          padding: '6px 0',
          fontSize: '17px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          marginBottom: '14px',
          border: '1px solid #000',
        }}
      >
        BARANGAY CLEARANCE
      </div>

      {/* ═══ TWO COLUMN BODY ═══ */}
      <div style={{ display: 'flex', gap: '16px', flex: 1 }}>
        {/* ── LEFT COLUMN ── */}
        <div
          style={{
            width: '26%',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderRight: '1px solid #aaa',
            paddingRight: '10px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{orNo}</div>
            <div style={{ fontSize: '9px' }}>O.R. Number</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{clearanceAmount}</div>
            <div style={{ fontSize: '9px' }}>Clearance Amount</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{dateIssuedStr}</div>
            <div style={{ fontSize: '9px' }}>Date Issued</div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '2px' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{validity}</div>
            <div style={{ fontSize: '8.5px', lineHeight: 1.35, marginTop: '2px' }}>
              Validity of this CLEARANCE
              <br />
              from the Date of Issuance:
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '4px', fontSize: '9.5px', fontWeight: 'bold' }}>
            <div>OFFICIAL DOCUMENT</div>
            <div>-Not Valid Without Seal-</div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '2px', fontSize: '8.5px' }}>
            <div>Date Printed: {datePrinted}</div>
            <div>System Generated</div>
          </div>

          {/* Thumb Mark */}
          <div style={{ marginTop: 'auto', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', marginBottom: '4px' }}>Applicant&apos;s Thumb Mark</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
              <div>
                <div style={{ fontSize: '8px', marginBottom: '2px' }}>LEFT</div>
                <div style={{ width: '44px', height: '54px', border: '1px solid #000' }} />
              </div>
              <div>
                <div style={{ fontSize: '8px', marginBottom: '2px' }}>RIGHT</div>
                <div style={{ width: '44px', height: '54px', border: '1px solid #000' }} />
              </div>
            </div>
          </div>

          {/* Barcodes */}
          <div style={{ textAlign: 'center', fontSize: '8px', marginTop: '6px' }}>
            <div
              style={{
                fontFamily: '"Libre Barcode 39", "Courier New", monospace',
                fontSize: '22px',
                letterSpacing: '1px',
                marginBottom: '1px',
                lineHeight: 1,
              }}
            >
              {orNo}2022
            </div>
            <div>[BARCODE PLACEHOLDER]</div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ width: '74%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '12px', textTransform: 'uppercase' }}>
            TO WHOM IT MAY CONCERN:
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
            <div style={{ flex: 1, textAlign: 'justify', fontSize: '11.5px', lineHeight: 1.55 }}>
              This is to certify that as per record, the person whose name, photo and signature appearing herein has
              requested a <strong>CLEARANCE</strong> from this office with the following detail/s;
            </div>
            <div
              style={{
                width: '80px',
                height: '95px',
                border: '1px solid #000',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                color: '#555',
                background: '#fafafa',
              }}
            >
              Photo
            </div>
          </div>

          {/* Resident Details */}
          <div style={{ marginBottom: '10px', fontSize: '11.5px', lineHeight: 1.65 }}>
            <div>
              <strong>Last Name:</strong> {u(lastName)}
            </div>
            <div>
              <strong>First Name:</strong> {u(firstName)}
            </div>
            <div>
              <strong>Middle Name:</strong> {u(middleName)}
            </div>
            <div>
              <strong>Marital Status:</strong> {civilStatus} &nbsp;&nbsp;&nbsp; <strong>Sex:</strong> {sex}{' '}
              &nbsp;&nbsp;&nbsp; <strong>Birthdate:</strong> {birthdate}
            </div>
            <div>
              <strong>Age:</strong> {age}
            </div>
            <div>
              <strong>Citizenship:</strong> {citizenship}
            </div>
            <div>
              <strong>Lot No., Subd., Purok/Zone:</strong> {purokZone}
            </div>
            <div>
              <strong>Brgy./City-Municipality/Province:</strong> {u(address)}
            </div>
          </div>

          <div style={{ fontSize: '11.5px', lineHeight: 1.65, marginBottom: '8px' }}>
            <div>
              <strong>PURPOSE:</strong> {u(purpose)}
            </div>
            <div>
              <strong>REMARKS:</strong> {remarks}
            </div>
          </div>

          <p style={{ margin: '0 0 8px 0', fontSize: '11.5px', textAlign: 'justify', lineHeight: 1.55 }}>
            This certification is issued upon the request of the above subject for the purpose stated.
          </p>

          <p style={{ margin: '0 0 16px 0', fontSize: '11.5px' }}>
            <strong>DATE ISSUED: {dateIssuedStr}</strong>
          </p>

          {/* Claimant Signature */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
            <div style={{ textAlign: 'center', width: '55%' }}>
              <div
                style={{
                  borderTop: '1px solid #000',
                  paddingTop: '3px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                }}
              >
                {u(applicantDisplayName)}
              </div>
              <div style={{ fontSize: '9px' }}>Signature Over Printed Name of Claimant</div>
            </div>
          </div>

          {/* Secretary & Punong Barangay */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 'auto',
              marginBottom: '6px',
              paddingRight: '10px',
            }}
          >
            <div style={{ width: '42%', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                {u(barangaySecretary)}
              </div>
              <div style={{ fontSize: '9px' }}>Barangay Secretary</div>
            </div>
            <div style={{ width: '42%', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                {u(punongBarangay)}
              </div>
              <div style={{ fontSize: '9px' }}>Punong Barangay</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM BANNER ═══ */}
      <div
        style={{
          background: '#e6b800',
          color: '#000',
          textAlign: 'center',
          padding: '6px 0',
          fontSize: '15px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginTop: '10px',
          border: '1px solid #000',
        }}
      >
        MAUNLAD NA BARANGAY!
      </div>

      <div
        style={{
          textAlign: 'center',
          fontSize: '8.5px',
          marginTop: '4px',
          color: '#333',
          fontStyle: 'italic',
        }}
      >
        This file is a transcription/template based on the supplied image and is not an official government document.
      </div>
  {verifyUrl && (
  <div style={{ position: 'absolute', bottom: '56px', right: '40px', textAlign: 'center' }}>
    <QRCodeSVG value={verifyUrl} size={80} level="H" bgColor="#ffffff" fgColor="#000000" />
    <div style={{ fontSize: '8px', marginTop: '4px', fontWeight: 'bold' }}>Scan to Verify</div>
  </div>
)}
    </div>
    
  );
};

export default BarangayClearance;