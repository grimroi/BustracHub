// src/components/__tests__/BlotterForm.test.js
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import BlotterForm from '../BlotterForm'; // Siguraduhing tama ang path kung may BlotterForm.jsx sa src/components/
import { localDb } from '../../services/db';

// --- HOIST-SAFE POUCHDB/COUCHDB MOCK ---
jest.mock('../../services/db', () => {
  const mockDbInstance = {
    post: jest.fn().mockResolvedValue({ ok: true, id: 'blotter_101', rev: '1-mock' }),
    put: jest.fn().mockResolvedValue({ ok: true, id: 'blotter_101', rev: '2-mock' }),
    get: jest.fn().mockResolvedValue({ _id: 'blotter_101', incidentType: 'Noise Complaint' }),
  };

  return {
    __esModule: true,
    localDb: mockDbInstance,
    default: mockDbInstance,
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  };
});

describe('BlotterForm Component - Validation & Offline CRUD', () => {
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('dapat magpakita ng validation error kapag isumite nang walang laman ang required fields', async () => {
    render(<BlotterForm onSuccess={mockOnSuccess} />);

    // Hanapin ang Submit / Save button
    const submitBtn = screen.getByRole('button', { name: /Save|Submit|I-save/i });

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Dapat hindi tumawag sa localDb.post o localDb.put dahil kulang sa inputs
    expect(localDb.post).not.toHaveBeenCalled();
  });

  test('dapat makapag-save ng bagong Blotter entry nang offline gamit ang localDb.post', async () => {
    render(<BlotterForm onSuccess={mockOnSuccess} />);

    // Punan ang kinakailangang Form Inputs
    const complainantInput = screen.getByLabelText(/Complainant|Nagrereklamo/i) || screen.getByPlaceholderText(/Complainant/i);
    const respondentInput = screen.getByLabelText(/Respondent|Inirereklamo/i) || screen.getByPlaceholderText(/Respondent/i);
    const incidentTypeInput = screen.getByLabelText(/Incident Type|Uri ng Insidente/i) || screen.getByPlaceholderText(/Incident/i);

    if (complainantInput && respondentInput && incidentTypeInput) {
      fireEvent.change(complainantInput, { target: { value: 'Juan Dela Cruz' } });
      fireEvent.change(respondentInput, { target: { value: 'Pedro Penduko' } });
      fireEvent.change(incidentTypeInput, { target: { value: 'Noise Complaint' } });
    }

    const submitBtn = screen.getByRole('button', { name: /Save|Submit|I-save/i });

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      // Tinitiyak na nag-save sa local offline database (PouchDB)
      expect(localDb.post || localDb.put).toHaveBeenCalled();
    });
  });
});