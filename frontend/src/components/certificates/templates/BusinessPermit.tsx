import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import nabuaLogo from '../../../assets/nabua-logo.jpg';
import bustracLogo from '../../../assets/bustrac-logo.png';

export interface BusinessPermitData {
  _id?: string;
  bcIdNo?: string;
  businessName?: string;
  ownerName?: string;
  applicantName?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  natureOfBusiness?: string;
  businessAddress?: string;
  address?: string;
  orNo?: string;
  orNumber?: string;
  clearanceFee?: string | number;
  amountPaid?: string | number;
  dateIssued?: string;
  regDate?: string;
  photoUrl?: string;
  captain?: string;
  punongBarangay?: string;
  secretary?: string;
  status?: string;
  printMode?: string;
  isDuplicate?: boolean;
  contactNo?: string;
  civilStatus?: string;
  occupation?: string;
  nationality?: string;
  purok?: string;
  applicantAddress?: string;
  purpose?: string;
  clearanceYear?: string | number;
  clearanceExpires?: string;
  kindOfTransaction?: string;
  issuedAt?: string;
  createdAt?: string;
  garbageFee?: string | number;
  age?: number | string;
  sex?: string;
  birthdate?: string;
}

interface BusinessPermitProps {
  data: BusinessPermitData;
  publicDomain?: string;
}

export const BusinessPermit: React.FC<BusinessPermitProps> = ({ data, publicDomain }) => {
  if (!data) return null;

  // Extract and format data with defaults
  const bcIdNo = data.bcIdNo || data.orNo || '065012';
  const orNo = data.orNo || data.orNumber || '065012';
  const amount = data.clearanceFee || data.amountPaid || '100.00';
  const dateIssued = data.dateIssued || data.regDate || new Date().toISOString().split('T')[0];
  
  const ownerName = (
    data.ownerName || 
    data.applicantName || 
    `${data.lastName || ''}, ${data.firstName || ''} ${data.middleName || ''}`.trim()
  ).toUpperCase();

  const businessName = (data.businessName || 'N/A').toUpperCase();
  const natureOfBusiness = (data.natureOfBusiness || 'N/A').toUpperCase();
  const businessAddress = (
    data.businessAddress || 
    data.address || 
    data.applicantAddress || 
    'N/A'
  ).toUpperCase();
  
  const captain = data.captain || data.punongBarangay || 'HON. ANNABELLE E. RULL';
  const secretary = data.secretary || 'MRS. MELY M. PRESADO';
  
  const isDuplicateMode = data.printMode === 'copy' || data.isDuplicate || data.status === 'Released';

  // Calculate age if birthdate provided
  const age = data.age || (data.birthdate || data.regDate ? 
    new Date().getFullYear() - new Date(data.birthdate || data.regDate).getFullYear() : 'N/A');
  
  const sex = data.sex || 'M';
  const citizenship = (data.nationality || 'Filipino').toUpperCase();
  const civilStatus = (data.civilStatus || 'Single').toUpperCase();

  return (
    <div style={{
      border: '1px solid #000',
      padding: '0',
      background: '#fff',
      minHeight: '270mm',
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: '#000',
      fontSize: '11px',
      lineHeight: '1.3',
      position: 'relative',
      boxSizing: 'border-box',
    }}>
      {/* DUPLICATE WATERMARK */}
      {isDuplicateMode && (
        <div style={{
          position: 'absolute',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%) rotate(-35deg)',
          fontSize: '48px',
          fontWeight: 'bold',
          color: 'rgba(220, 38, 38, 0.15)',
          border: '6px dashed rgba(220, 38, 38, 0.25)',
          padding: '10px 30px',
          zIndex: 10,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          DUPLICATE COPY
        </div>
      )}

      {/* Header Logos */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px 10px' }}>
        <div style={{ width: '70px', height: '70px' }}>
          <img src={nabuaLogo} alt="Nabua Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold' }}>Republic of the Philippines</p>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold' }}>Province of Camarines Sur</p>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold' }}>Municipality of Nabua</p>
          <p style={{ margin: '3px 0 0', fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.5px' }}>BARANGAY BUSTRAC</p>
          <p style={{ margin: '2px 0 0', fontSize: '12px', fontWeight: 'bold' }}>OFFICE OF THE PUNONG BARANGAY</p>
        </div>
        <div style={{ width: '70px', height: '70px' }}>
          <img src={bustracLogo} alt="Bustrac Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      </div>

      {/* Yellow Title Banner */}
      <div style={{ backgroundColor: '#FFCC00', textAlign: 'center', padding: '6px 0', margin: '0 20px', border: '1.5px solid #000' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', letterSpacing: '1px', color: '#000' }}>
          BARANGAY CLEARANCE
        </h2>
      </div>

      {/* Main Content - 3 Column Layout */}
      <div style={{ padding: '20px', display: 'flex', gap: '15px' }}>
        {/* LEFT COLUMN - Document Details */}
        <div style={{ width: '140px', fontSize: '9px', lineHeight: '1.4' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{bcIdNo}</div>
            <div>OR Number</div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>₱{typeof amount === 'number' ? amount.toFixed(2) : amount}</div>
            <div>Clearance Amount</div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{dateIssued}</div>
            <div>Date Issued</div>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <div style={{ fontWeight: 'bold' }}>(c) Six Months Validity</div>
            <div>Validity of this CLEARANCE from the Date of Issuance</div>
          </div>
          <div style={{ borderTop: '1px solid #000', margin: '15px 0', paddingTop: '10px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '10px' }}>
              OFFICIAL DOCUMENT<br/>
              -Not Valid Without Seal-
            </div>
          </div>
          <div style={{ fontSize: '9px', marginTop: '10px' }}>
            Date Printed: {new Date().toLocaleDateString('en-US')}<br/>
            System Generated
          </div>
          
          {/* Thumb Mark Boxes */}
          <div style={{ marginTop: '25px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', marginBottom: '3px' }}>Applicant's Thumb Mark</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <div style={{ border: '1px solid #000', width: '35px', height: '45px' }}></div>
              <div style={{ border: '1px solid #000', width: '35px', height: '45px' }}></div>
            </div>
            <div style={{ fontSize: '8px', marginTop: '3px' }}>LEFT &nbsp;&nbsp;&nbsp;&nbsp; RIGHT</div>
          </div>
        </div>

        {/* CENTER COLUMN - Main Content */}
        <div style={{ flex: 1, fontSize: '10px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '11px' }}>TO WHOM IT MAY CONCERN:</p>
          <p style={{ margin: '0 0 8px 0', textAlign: 'justify', lineHeight: '1.4' }}>
            This is to certify that as per record, the person whose name, photo and signature appearing herein has requested a CLEARANCE from this office with the following detail/s:
          </p>

          {/* Photo Box (Right aligned in center column) */}
          <div style={{ float: 'right', width: '100px', height: '120px', border: '1px solid #000', marginLeft: '10px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
            {data.photoUrl ? (
              <img src={data.photoUrl} alt="Photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '8px', color: '#666', textAlign: 'center' }}>PHOTO<br/>PLACEHOLDER</span>
            )}
          </div>

          <div style={{ fontSize: '10px', lineHeight: '1.6' }}>
            <div><strong>Last Name:</strong> {data.lastName || 'PRESADO'}</div>
            <div><strong>First Name:</strong> {data.firstName || 'MELY'}</div>
            <div><strong>Middle Name:</strong> {data.middleName || 'MONTEJO'}</div>
            <div><strong>Marital Status:</strong> {civilStatus} &nbsp;&nbsp;&nbsp; <strong>Sex:</strong> {sex}</div>
            <div><strong>Birthdate:</strong> {data.birthdate || data.regDate || dateIssued}</div>
            <div><strong>Age:</strong> {age}</div>
            <div><strong>Citizenship:</strong> {citizenship}</div>
            <div><strong>Lot No. Subd. Purok/Zone:</strong> {data.purok || data.applicantAddress || 'ZONE 4'}</div>
            <div><strong>Barangay/City-Municipality/Province:</strong> BUSTRAC, NABUA, CAMARINES SUR</div>
          </div>

          <div style={{ clear: 'both', marginTop: '10px' }}>
            <p style={{ margin: '10px 0 5px' }}><strong>PURPOSE:</strong> {data.purpose || 'FOR MICRO FINANCE PURPOSE'}</p>
            <p style={{ margin: '0 0 10px' }}><strong>REMARKS:</strong> No Derogatory Record</p>
            <p style={{ margin: '10px 0', textAlign: 'justify', lineHeight: '1.4' }}>
              This certification is issued upon the request of the above subject for the purpose stated.
            </p>
            <p style={{ margin: '15px 0 0', fontWeight: 'bold' }}>
              DATE ISSUED: {dateIssued}
            </p>
          </div>

          {/* Claimant Signature */}
          <div style={{ marginTop: '40px', textAlign: 'center' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px', borderBottom: '1px solid #000', display: 'inline-block', padding: '0 30px', marginBottom: '3px' }}>
              {ownerName}
            </div>
            <div style={{ fontSize: '9px' }}>Signature Over Printed Name of Claimant</div>
          </div>

          {/* Secretary Signature */}
          <div style={{ marginTop: '30px', textAlign: 'center' }}>
            <div style={{ fontWeight: 'bold', fontSize: '10px', backgroundColor: '#e0e0e0', padding: '2px 8px', display: 'inline-block' }}>
              {secretary}
            </div>
            <div style={{ fontSize: '9px', marginTop: '2px' }}>Barangay Secretary</div>
          </div>

          {/* Captain Signature */}
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <div style={{ fontWeight: 'bold', fontSize: '10px' }}>{captain}</div>
            <div style={{ fontSize: '9px', marginTop: '2px' }}>Punong Barangay</div>
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <div style={{ position: 'absolute', bottom: '30px', left: '20px', right: '20px', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: '9px' }}>
            <div style={{ fontWeight: 'bold' }}>OR: {orNo}</div>
            <div>[BARCODE PLACEHOLDER] &nbsp; [QR CODE PLACEHOLDER]</div>
            <div style={{ fontWeight: 'bold', fontStyle: 'italic', marginTop: '2px' }}>Paid Document</div>
          </div>
          <div style={{ fontSize: '8px', color: '#666', textAlign: 'right', maxWidth: '250px' }}>
            This file is a transcription/template based on the supplied image and is not an official government document.
          </div>
        </div>
        
        {/* Bottom Yellow Banner */}
        <div style={{ backgroundColor: '#FFCC00', textAlign: 'center', padding: '6px 0', marginTop: '15px', border: '1.5px solid #000', fontWeight: '900', fontSize: '14px', letterSpacing: '1px', color: '#000', textTransform: 'uppercase' }}>
          MAUNLAD NA BARANGAY!
        </div>
      </div>

         {data?._id && (
        <div style={{ position: 'absolute', bottom: '40px', right: '40px', textAlign: 'center', zIndex: 20 }}>
          <QRCodeSVG 
            value={`https://${publicDomain || 'localhost:5173'}/verify?id=${encodeURIComponent(data._id)}`} 
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

export default BusinessPermit;