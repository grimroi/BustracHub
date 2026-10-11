import React, { useRef } from 'react';
import BarangayClearance from './templates/BarangayClearance';
import IndigencyTemplate from './templates/IndigencyTemplate';
import BusinessPermit from './templates/BusinessPermit';
import ResidencyCertificate from './templates/ResidencyCertificate';

export type CertificateType = 'clearance' | 'indigency' | 'business' | 'residency';

export interface CertificateData {
  trackingCode: string;
  fullName: string;
  address: string;
  purpose: string;
  issueDate: string;
  orNumber?: string;
  amountPaid?: number;
  ctcNumber?: string;
  purok?: string;
  civilStatus?: string;
  age?: number | string;
  patientName?: string;
  relationToPatient?: string;
  punongBarangay?: string;
  [key: string]: any;
}

interface WrapperProps {
  type: CertificateType;
  mode?: 'original' | 'copy' | 'standard'; 
  data: CertificateData;
  publicDomain?: string;
  qrConfig?: Record<string, any>;
  onClose?: () => void;
}

export const CertificatePrintWrapper: React.FC<WrapperProps> = ({ type, mode,  data, publicDomain, qrConfig, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const renderTemplate = () => {
    switch (type) {
      case 'clearance':
        return <BarangayClearance data={data} publicDomain={publicDomain} qrConfig={qrConfig} />;
      case 'indigency':
        return <IndigencyTemplate data={data} />;
      case 'business':
        return <BusinessPermit data={data} />;
      case 'residency':
        return <ResidencyCertificate data={data} />;
      default:
        return <div>Invalid Certificate Type</div>;
    }
  };

  return (
  <div className="print-modal-overlay" onClick={(e) => e.stopPropagation()}>
    <div className="print-modal-content"> 
      <div className="modal-actions-bar no-print">
        <div>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
            Print Preview: {type.toUpperCase()}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Reference: {data.trackingCode}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {onClose && (
            <button type="button" className="btn-close-modal" onClick={onClose}>
              ✕ Close
            </button>
          )}
          <button type="button" className="btn-print" onClick={handlePrint}>
            🖨️ Print Document
          </button>
        </div>
      </div>
      <div className="paper-scroll-wrapper">
        <div
          ref={printRef}
          className="printable-certificate"
          id="printable-certificate-card"
          data-print-mode={mode || 'standard'}
        >
          {renderTemplate()}
        </div>
      </div>
    </div> 
  </div>
);
};

export default CertificatePrintWrapper;