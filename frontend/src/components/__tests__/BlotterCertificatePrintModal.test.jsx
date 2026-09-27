import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BlotterCertificatePrintModal from '../BlotterCertificatePrintModal';

jest.mock('../../services/db', () => ({
  db: {
    put: jest.fn().mockResolvedValue({ ok: true }),
    find: jest.fn().mockResolvedValue({ docs: [] }),
  },
}));

describe('Direct Component Coverage: BlotterCertificatePrintModal', () => {
  const sampleBlotterRecord = {
    _id: 'BLT-2026-00125',
    trackingNo: 'BLT-2026-00125',
    complainant: 'Juan Dela Cruz',
    complainantId: 'RES-001',
    respondent: 'Pedro Penduko',
    respondentId: 'RES-002',
    incidentType: 'Noise Complaint',
    status: 'Open',
    date: '2026-09-27',
    location: 'Purok 3, Barangay Hall',
    narrative: 'Sample noise complaint statement details.',
    isVawc: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // TEST 1: Direct function execution para sa default onClose prop (Line 11)
  test('executes default onClose prop gracefully when click event occurs without onClose passed', () => {
    render(<BlotterCertificatePrintModal isOpen={true} blotterData={sampleBlotterRecord} />);
    const closeBtn = screen.getByRole('button', { name: /✕/i });
    expect(() => fireEvent.click(closeBtn)).not.toThrow();
  });

  test('renders safely without any props passed', () => {
    const { container } = render(<BlotterCertificatePrintModal />);
    expect(container.firstChild).toBeNull();
  });

  test('does not render when isOpen is false', () => {
    const { container } = render(
      <BlotterCertificatePrintModal
        isOpen={false}
        onClose={jest.fn()}
        blotterData={sampleBlotterRecord}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders correctly when isOpen is true and certificateType is Summon', () => {
    render(
      <BlotterCertificatePrintModal
        isOpen={true}
        onClose={jest.fn()}
        blotterData={sampleBlotterRecord}
        certificateType="Summon"
      />
    );
    expect(screen.getByText(/BLT-2026-00125/i)).toBeInTheDocument();
    const complainantElements = screen.getAllByText(/Juan Dela Cruz/i);
    expect(complainantElements.length).toBeGreaterThanOrEqual(1);
    const respondentElements = screen.getAllByText(/Pedro Penduko/i);
    expect(respondentElements.length).toBeGreaterThanOrEqual(1);
  });

  test('renders correctly when certificateType is Certification to File Action', () => {
    render(
      <BlotterCertificatePrintModal
        isOpen={true}
        onClose={jest.fn()}
        blotterData={sampleBlotterRecord}
        certificateType="Certification to File Action"
      />
    );
    expect(screen.getByText(/BLT-2026-00125/i)).toBeInTheDocument();
  });

  test('renders correctly with default or other certificate types (e.g. Notice of Hearing)', () => {
    render(
      <BlotterCertificatePrintModal
        isOpen={true}
        onClose={jest.fn()}
        blotterData={sampleBlotterRecord}
        certificateType="Notice of Hearing"
      />
    );
    expect(screen.getByText(/BLT-2026-00125/i)).toBeInTheDocument();
  });

  test('handles empty or missing certificateType string gracefully', () => {
    render(
      <BlotterCertificatePrintModal
        isOpen={true}
        onClose={jest.fn()}
        blotterData={sampleBlotterRecord}
        certificateType=""
      />
    );
    expect(screen.getByRole('button', { name: /✕/i })).toBeInTheDocument();
  });

  test('handles VAWC flag and empty blotter data fallbacks gracefully', () => {
    const vawcRecord = { ...sampleBlotterRecord, isVawc: true, isVAWC: true };
    
    // 1. Test render with VAWC record
    const { rerender, container } = render(
      <BlotterCertificatePrintModal isOpen={true} onClose={jest.fn()} blotterData={vawcRecord} />
    );
    expect(screen.getByText(/BLT-2026-00125/i)).toBeInTheDocument();

    // 2. Test render when blotterData is null
    rerender(
      <BlotterCertificatePrintModal isOpen={true} onClose={jest.fn()} blotterData={null} />
    );
    expect(container.firstChild).toBeNull();

    // 3. Test render when blotterData is an empty object {}
    rerender(
      <BlotterCertificatePrintModal isOpen={true} onClose={jest.fn()} blotterData={{}} />
    );
    expect(screen.getByRole('button', { name: /✕/i })).toBeInTheDocument();
  });

  test('triggers onClose handler when close button is clicked', () => {
    const handleClose = jest.fn();
    render(
      <BlotterCertificatePrintModal
        isOpen={true}
        onClose={handleClose}
        blotterData={sampleBlotterRecord}
      />
    );
    const closeBtn = screen.getByRole('button', { name: /✕/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test('triggers window.print when the print button is clicked', () => {
    const windowPrintSpy = jest.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <BlotterCertificatePrintModal
        isOpen={true}
        onClose={jest.fn()}
        blotterData={sampleBlotterRecord}
        certificateType="Summon"
      />
    );

    const printBtn = screen.getByRole('button', { name: /print/i });
    fireEvent.click(printBtn);

    expect(windowPrintSpy).toHaveBeenCalledTimes(1);
    windowPrintSpy.mockRestore();
  });
});