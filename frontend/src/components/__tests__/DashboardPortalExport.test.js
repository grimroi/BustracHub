// src/components/__tests__/DashboardPortalExport.test.js
import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPortal from '../../pages/DashboardPortal';
import * as excelExporter from '../../utils/excelExporter';

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

  const mockInstance = {
    get: jest.fn().mockImplementation((id) => {
      if (id === 'barangay_settings') {
        return Promise.resolve({ _id: 'barangay_settings', name: 'Barangay Bustrac' });
      }
      return Promise.resolve({});
    }),
    put: jest.fn().mockResolvedValue({ rev: '1-mock' }),
    post: jest.fn().mockResolvedValue({ id: 'mock-id', rev: '1-mock' }),
    find: jest.fn().mockResolvedValue({ docs: [] }),
    allDocs: jest.fn().mockResolvedValue({ rows: [] }),
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

  const instance = {
    get: jest.fn().mockResolvedValue({}),
    put: jest.fn().mockResolvedValue({ rev: '1-mock' }),
    post: jest.fn().mockResolvedValue({ id: 'mock-id', rev: '1-mock' }),
    find: jest.fn().mockResolvedValue({ docs: [] }),
    allDocs: jest.fn().mockResolvedValue({ rows: [] }),
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

describe('DashboardPortal - handleGenerateExcelReport Safety Integration', () => {
  // ✅ LOCAL ALERTSPY SETUP REMOVED - GUMAGAMIT NA NG GLOBAL.ALERTSPY MULA SA SETUPTESTS.JS

  test('dapat ligtas at WALANG CRASH kapag pinindot ang Excel export habang null/undefined ang data lists', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/?page=reports']}>
          <DashboardPortal
            screen="reports"
            initialScreen="reports"
            role="admin"
            residentsList={null}
            blotterList={undefined}
            feedbackList={null}
            householdsList={undefined}
            programsList={null}
            recentLogs={null}
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

    await screen.findByText(/Resident Registry/i);

    const exportButtons = screen.getAllByText(/Export Excel/i);
    expect(exportButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(exportButtons[0]);
    });

    // ✅ GUMAGAMIT NA NG GLOBAL.ALERTSPY
    expect(global.alertSpy).toHaveBeenCalledWith(
      'Walang available data para i-export sa piniling report category.'
    );
    expect(excelExporter.exportToExcel).not.toHaveBeenCalled();
  });

  test('dapat mag-export nang tama kapag mayroong laman ang mga data lists (Resident Registry)', async () => {
    const mockResidents = [
      {
        _id: 'RES-0001',
        id: 'RES-0001',
        lastName: 'Dela Cruz',
        firstName: 'Juan',
        name: 'Dela Cruz, Juan',
        purok: 'Purok 1',
        civilStatus: 'Single',
        gender: 'Male',
        contact: '09171234567',
        voter: true,
        voterStatus: 'Registered',
        isVoter: true,
      },
    ];

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/?page=reports']}>
          <DashboardPortal
            screen="reports"
            initialScreen="reports"
            role="admin"
            residentsList={mockResidents}
            blotterList={[]}
            feedbackList={[]}
            householdsList={[]}
            programsList={[]}
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

    const residentHeading = await screen.findByText(/Resident Registry/i);
    const residentCard = residentHeading.closest('.fp');
    expect(residentCard).toBeTruthy();

    const exportButton = within(residentCard).getByRole('button', { name: /Export Excel/i });

    await act(async () => {
      fireEvent.click(exportButton);
    });

    expect(excelExporter.exportToExcel).toHaveBeenCalledTimes(1);
    const [exportedData, exportedFilename, exportedCategory] = excelExporter.exportToExcel.mock.calls[0];

    expect(exportedCategory).toBe('residents');
    expect(exportedFilename).toMatch(/^Barangay_Bustrac_residents_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(Array.isArray(exportedData)).toBe(true);
    expect(exportedData.length).toBeGreaterThan(0);
    expect(exportedData[0]).toHaveProperty('Resident ID');
    expect(exportedData[0]).toHaveProperty('Full Name');
    expect(exportedData[0]).toHaveProperty('Purok / Zone');
  });
});