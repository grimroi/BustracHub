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
  data: CertificateData;
  onClose?: () => void;
}

export const CertificatePrintWrapper: React.FC<WrapperProps> = ({ type, data, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const renderTemplate = () => {
    switch (type) {
      case 'clearance':
        return <BarangayClearance data={data} />;
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
    <div className="flex flex-col items-center p-4 min-h-screen bg-gray-900 text-white">
      {/* Control Action Buttons */}
      <div className="no-print flex gap-4 mb-6 bg-gray-800 p-4 rounded-lg shadow-md w-full max-w-4xl justify-between items-center">
        <div>
          <h2 className="text-lg font-bold">Print Preview: {type.toUpperCase()}</h2>
          <p className="text-sm text-gray-400">Reference: {data.trackingCode}</p>
        </div>
        <div className="flex gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-sm font-semibold transition"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handlePrint}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-bold flex items-center gap-2 shadow transition"
          >
            🖨️ Print Document
          </button>
        </div>
      </div>

      {/* Printable Paper Canvas Area */}
      <div
        ref={printRef}
        className="printable-area bg-white text-black shadow-2xl p-8 rounded-sm"
        style={{
          width: '210mm',
          minHeight: '297mm',
          boxSizing: 'border-box'
        }}
      >
        {renderTemplate()}
      </div>     
    </div>
  );
};

export default CertificatePrintWrapper;