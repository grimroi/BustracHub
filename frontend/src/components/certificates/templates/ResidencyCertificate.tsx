import React from 'react';
import nabuaLogo from '../../../assets/nabua-logo.jpg';
import bustracLogo from '../../../assets/bustrac-logo.png';

export interface ResidencyData {
  fullName?: string;
  zone?: string;
  purok?: string;
  barangay?: string;
  municipality?: string;
  province?: string;
  maritalStatus?: string;
  civilStatus?: string;
  sex?: 'M' | 'F' | string;
  birthdate?: string;
  citizenship?: string;
  age?: number | string;
  yearsOfResidency?: number | string;
  purpose?: string;
  dateIssued?: string;
  issueDate?: string;
  issuedDayOrdinal?: string;
  issuedMonthYear?: string;
  secretaryName?: string;
  punongBarangayName?: string;
  punongBarangay?: string;
  orNumber?: string;
  orDate?: string;
  orAmount?: string;
  amountPaid?: number | string;
  ctcNumber?: string;
  ctcDateIssued?: string;
  ctcAmount?: string;
  ctcPlaceIssued?: string;
  datePrinted?: string;
  trackingCode?: string;
  [key: string]: any;
}

export interface BarangayCertificationProps {
  data?: ResidencyData;
}

export const ResidencyCertificate: React.FC<BarangayCertificationProps> = ({ data = {} }) => {
  const {
    fullName = 'JAYSON VILLAFLOR AZON',
    zone = data.purok || 'ZONE 1',
    barangay = 'BUSTRAC',
    municipality = 'NABUA',
    province = 'CAMARINES SUR',
    maritalStatus = data.civilStatus || 'Married',
    sex = 'M',
    birthdate = '09/28/1987',
    citizenship = 'Filipino',
    age = 38,
    yearsOfResidency = 3,
    purpose = data.purpose || 'Residency',
    dateIssued = data.issueDate || '9/1/2026',
    issuedDayOrdinal = '18th',
    issuedMonthYear = 'August, 2026',
    secretaryName = 'MRS. MELY M. PRESADO',
    punongBarangayName = data.punongBarangay || 'HON. ANNABELLE E. RULL',
    orNumber = data.orNumber || '65452371',
    orDate = '08/18/2026',
    orAmount = data.amountPaid ? String(data.amountPaid) : '100.00',
    ctcNumber = data.ctcNumber || '26414445',
    ctcDateIssued = '03/02/2026',
    ctcAmount = '35.00',
    ctcPlaceIssued = 'NABUA, CAMARINES SUR',
    datePrinted = '9/1/2026',
  } = data;

  const fullAddress = `${zone.toUpperCase()}, ${barangay.toUpperCase()}, ${municipality.toUpperCase()}, ${province.toUpperCase()}`;

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
      }}
    >
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
        <div style={{ width: '110px', height: '110px', border: '1px solid #000000', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ fontWeight: 800, fontSize: '14px' }}>{fullName.toUpperCase()}</div>
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
          Date <span style={{ textDecoration: 'underline' }}>issued :</span> {dateIssued}
        </div>
        <div>
          <span style={{ textDecoration: 'underline' }}>Subject :</span> {purpose}
        </div>
      </div>

      {/* 5. BODY TEXT */}
      <div style={{ marginBottom: '20px', fontWeight: 800 }}>TO WHOM IT MAY CONCERN:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'justify' }}>
        <p style={{ textIndent: '40px', margin: 0 }}>
          This is to Certify that <strong>{fullName.toUpperCase()}</strong>, {age} yrs. old, {maritalStatus.toLowerCase()}, a bona fide resident of and with postal address at {zone} {barangay}, {municipality}, {province}.
        </p>
        <p style={{ textIndent: '40px', margin: 0 }}>
          He reside in this barangay for more or less {yearsOfResidency} years.
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
          {fullName.toUpperCase()}
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
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>Amt. Paid:</span><span>{orAmount}</span></div>
          <div style={{ marginTop: '8px' }}>CTC Details:</div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>CTC Date Issued:</span><span>{ctcDateIssued}</span></div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>CTC No.:</span><span>{ctcNumber}</span></div>
          <div style={{ display: 'flex' }}><span style={{ width: '100px' }}>CTC Amt.:</span><span>{ctcAmount}</span></div>
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
    </div>
  );
};

export default ResidencyCertificate;