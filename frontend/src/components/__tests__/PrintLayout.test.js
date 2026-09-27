import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Certificate Print Preview Dummy Component
const PrintClearanceView = ({ clearanceData }) => {
  return (
    <div className="printable-clearance-container">
      <div className="no-print">
        <button id="print-now-btn">Print Document</button>
        <button id="close-modal-btn">Close</button>
      </div>
      
      <div className="official-letterhead">
        <h2>REPUBLIC OF THE PHILIPPINES</h2>
        <h3>BARANGAY BUSTRAC OFFICIAL CLEARANCE</h3>
      </div>

      <div className="clearance-body">
        <p>This is to certify that <strong>{clearanceData.fullName}</strong> is a bona fide resident of {clearanceData.purok}.</p>
        <p>OR No: {clearanceData.orNumber}</p>
        <p>Issued By: {clearanceData.issuedBy}</p>
      </div>
    </div>
  );
};

describe('Print Layout & Rendering Integration Tests', () => {
  const sampleClearance = {
    fullName: 'Maria Clarissa Santos',
    purok: 'Purok 3',
    orNumber: 'OR-2026-0091',
    issuedBy: 'Admin Secretary'
  };

  test('should render official clearance metadata correctly in document body', () => {
    render(<PrintClearanceView clearanceData={sampleClearance} />);

    expect(screen.getByText(/BARANGAY BUSTRAC OFFICIAL CLEARANCE/i)).toBeInTheDocument();
    expect(screen.getByText(/Maria Clarissa Santos/i)).toBeInTheDocument();
    expect(screen.getByText(/OR-2026-0091/i)).toBeInTheDocument();
  });

  test('should ensure navigation controls have no-print class marker', () => {
    render(<PrintClearanceView clearanceData={sampleClearance} />);

    const printBtn = screen.getByText('Print Document');
    expect(printBtn.closest('.no-print')).toBeInTheDocument();
  });
});