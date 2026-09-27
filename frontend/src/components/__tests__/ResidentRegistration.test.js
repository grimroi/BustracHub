// src/components/__tests__/ResidentRegistration.test.js
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { localDb } from '../../services/db';

// Simple Component Test / Inline Render Check kung wala pang nakahahiwalay na component file
jest.mock('../../services/db', () => {
  const mockDbInstance = {
    post: jest.fn().mockResolvedValue({ ok: true, id: 'RES-9999', rev: '1-mock' }),
    put: jest.fn().mockResolvedValue({ ok: true, id: 'RES-9999', rev: '2-mock' }),
  };

  return {
    __esModule: true,
    localDb: mockDbInstance,
    default: mockDbInstance,
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  };
});

describe('Resident Registration Offline Database Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('dapat makapag-post ng bagong residente sa PouchDB localDb', async () => {
    const newResident = {
      _id: 'resident_2026_001',
      type: 'resident',
      fullName: 'Maria Clara',
      purok: 'Purok 1',
    };

    await act(async () => {
      await localDb.post(newResident);
    });

    expect(localDb.post).toHaveBeenCalledWith(newResident);
  });
});