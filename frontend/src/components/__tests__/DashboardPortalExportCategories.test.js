// src/components/__tests__/DashboardPortalExportCategories.test.js
import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPortal from '../../pages/DashboardPortal';
import * as excelExporter from '../../utils/excelExporter';

// Sample mock data para sa tests
const sampleBlotter = {
  _id: 'blotter_BLOT-001',
  id: 'BLOT-001',
  caseNumber: 'BLOT-001',
  incidentType: 'Noise Complaint',
  type: 'blotter',
  status: 'Pending',
  dateFiled: '2026-09-27',
  incidentDate: '2026-09-27',
  complainant: 'Juan Dela Cruz',
  respondent: 'Pedro Penduko',
  details: 'Sample complaint details',
};

// 1. MOCK EXCEL EXPORTER
jest.mock('../../utils/excelExporter', () => ({
  exportToExcel: jest.fn(),
}));

// 2. MOCK REACT ROUTER NAVIGATE
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

// 3. HOIST-SAFE MOCK PARA SA DATABASE SERVICE
jest.mock('../../services/db', () => {
  const createMockEmitter = () => ({
    on: jest.fn().mockReturnThis(),
    cancel: jest.fn(),
    removeAllListeners: jest.fn(),
    removeListener: jest.fn(),
  });

  const mockBlotterDoc = {
    _id: 'blotter_BLOT-001',
    id: 'BLOT-001',
    caseNumber: 'BLOT-001',
    incidentType: 'Noise Complaint',
    type: 'blotter',
    status: 'Pending',
    dateFiled: '2026-09-27',
    complainant: 'Juan Dela Cruz',
    respondent: 'Pedro Penduko',
  };

  const mockInstance = {
    get: jest.fn().mockImplementation((id) => {
      if (id === 'barangay_settings') {
        return Promise.resolve({ _id: 'barangay_settings', name: 'Barangay Bustrac' });
      }
      return Promise.resolve({});
    }),
    put: jest.fn().mockResolvedValue({ rev: '1-mock' }),
    post: jest.fn().mockResolvedValue({ id: 'mock-id', rev: '1-mock' }),
    find: jest.fn().mockImplementation(() => {
      return Promise.resolve({ docs: [mockBlotterDoc] });
    }),
    allDocs: jest.fn().mockImplementation(() => {
      return Promise.resolve({ rows: [{ doc: mockBlotterDoc }] });
    }),
    sync: jest.fn().mockReturnValue(createMockEmitter()),
    changes: jest.fn().mockReturnValue(createMockEmitter()),
    setMaxListeners: jest.fn(),
  };

  return {
    __esModule: true,
    localDb: mockInstance,
    db: mockInstance,
    default: mockInstance,
    remoteCouchDB: mockInstance,
    forceSyncToRemote: jest.fn().mockResolvedValue(undefined),
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  };
});

// 4. MOCK POUCHDB PACKAGES
jest.mock('pouchdb-browser', () => {
  const createMockEmitter = () => ({
    on: jest.fn().mockReturnThis(),
    cancel: jest.fn(),
    removeAllListeners: jest.fn(),
    removeListener: jest.fn(),
  });

  const mockBlotterDoc = {
    _id: 'blotter_BLOT-001',
    id: 'BLOT-001',
    caseNumber: 'BLOT-001',
    incidentType: 'Noise Complaint',
    type: 'blotter',
    status: 'Pending',
    dateFiled: '2026-09-27',
    complainant: 'Juan Dela Cruz',
    respondent: 'Pedro Penduko',
  };

  const instance = {
    get: jest.fn().mockResolvedValue({}),
    put: jest.fn().mockResolvedValue({ rev: '1-mock' }),
    post: jest.fn().mockResolvedValue({ id: 'mock-id', rev: '1-mock' }),
    find: jest.fn().mockResolvedValue({ docs: [mockBlotterDoc] }),
    allDocs: jest.fn().mockResolvedValue({ rows: [{ doc: mockBlotterDoc }] }),
    sync: jest.fn().mockReturnValue(createMockEmitter()),
    changes: jest.fn().mockReturnValue(createMockEmitter()),
    setMaxListeners: jest.fn(),
  };

  const MockPouchDB = jest.fn().mockImplementation(() => instance);
  MockPouchDB.sync = jest.fn().mockReturnValue(createMockEmitter());
  MockPouchDB.defaults = jest.fn().mockImplementation(() => MockPouchDB);
  MockPouchDB.plugin = jest.fn();
  return MockPouchDB;
});

jest.mock('pouchdb', () => jest.requireMock('pouchdb-browser'));

describe('DashboardPortal - Excel Export for Other Categories (Option A Schema Verification)', () => {
  // ✅ LOCAL ALERTSPY & JEST.CLEARALLMOCKS() REMOVED - GUMAGAMIT NA NG GLOBAL SETUP MULA SA SETUPTESTS.JS

  const setupReportsView = async (customProps = {}) => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/?page=reports']}>
          <DashboardPortal
            screen="reports"
            initialScreen="reports"
            role="admin"
            residentsList={[]}
            blotterList={[sampleBlotter]}
            blotters={[sampleBlotter]}
            recentLogs={[sampleBlotter]}
            feedbackList={[]}
            householdsList={[]}
            programsList={[]}
            {...customProps}
          />
        </MemoryRouter>
      );
    });

    const reportsNav = screen.queryByRole('button', { name: /Generate Reports/i }) || 
                       screen.queryByText(/Generate Reports/i) || 
                       screen.queryByText(/Reports/i);
    if (reportsNav) {
      await act(async () => {
        fireEvent.click(reportsNav);
      });
    }
  };

  test('dapat mag-export nang tama para sa Blotter Reports category', async () => {
    const mockBlotters = [sampleBlotter];
    await setupReportsView({ blotterList: mockBlotters, blotters: mockBlotters, recentLogs: mockBlotters });

    const heading = await screen.findByText('Blotter Summary');
    const card = heading.closest('.fp');
    expect(card).toBeTruthy();

    const exportBtn = within(card).getByRole('button', { name: /Export Excel/i });

    await act(async () => {
      fireEvent.click(exportBtn);
    });

    expect(excelExporter.exportToExcel).toHaveBeenCalledTimes(1);
    const [exportedData, exportedFilename, exportedCategory] = excelExporter.exportToExcel.mock.calls[0];

    expect(exportedCategory).toBe('blotter');
    expect(exportedFilename).toMatch(/^Barangay_Bustrac_blotter_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(Array.isArray(exportedData)).toBe(true);
    expect(exportedData.length).toBeGreaterThan(0);
  });

  test('dapat mag-export nang tama para sa Household Registry category', async () => {
    const mockHouseholds = [
      {
        _id: 'HH-001',
        householdNumber: 'HH-001',
        headName: 'Dela Cruz, Juan',
        purok: 'Purok 2',
        membersCount: 4,
      },
    ];

    await setupReportsView({ householdsList: mockHouseholds });

    const heading = await screen.findByText('Household Registry');
    const card = heading.closest('.fp');
    expect(card).toBeTruthy();

    const exportBtn = within(card).getByRole('button', { name: /Export Excel/i });

    await act(async () => {
      fireEvent.click(exportBtn);
    });

    expect(excelExporter.exportToExcel).toHaveBeenCalledTimes(1);
    const [exportedData, exportedFilename, exportedCategory] = excelExporter.exportToExcel.mock.calls[0];

    expect(exportedCategory).toBe('households');
    expect(exportedFilename).toMatch(/^Barangay_Bustrac_households_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(Array.isArray(exportedData)).toBe(true);
    expect(exportedData.length).toBeGreaterThan(0);
  });

  test('dapat mag-export nang tama para sa Community Programs/Aid category', async () => {
    const mockPrograms = [
      {
        _id: 'PROG-001',
        title: 'Clean and Green Initiative',
        status: 'Active',
        category: 'Health & Environment',
      },
    ];

    await setupReportsView({ programsList: mockPrograms });

    const descriptionText = await screen.findByText('Beneficiary list per program');
    const card = descriptionText.closest('.fp');
    expect(card).toBeTruthy();

    const exportBtn = within(card).getByRole('button', { name: /Export Excel/i });

    await act(async () => {
      fireEvent.click(exportBtn);
    });

    expect(excelExporter.exportToExcel).toHaveBeenCalledTimes(1);
    const [exportedData, exportedFilename, exportedCategory] = excelExporter.exportToExcel.mock.calls[0];

    expect(exportedCategory).toBe('aid');
    expect(exportedFilename).toMatch(/^Barangay_Bustrac_aid_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(Array.isArray(exportedData)).toBe(true);
    expect(exportedData.length).toBeGreaterThan(0);
  });
});