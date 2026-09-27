// src/components/__tests__/SyncStatusIndicator.test.js
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import SyncStatusIndicator from '../SyncStatusIndicator';
import { localDb } from '../../services/db';

// --- MOCK DATABASE SETUP ---
jest.mock('../../services/db', () => {
  const listeners = {};
  const mockEmitter = {
    on: jest.fn((event, callback) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
      return mockEmitter;
    }),
    cancel: jest.fn(),
    removeAllListeners: jest.fn(),
    emit: (event, data) => {
      if (listeners[event]) {
        listeners[event].forEach((cb) => cb(data));
      }
    },
    _reset: () => {
      Object.keys(listeners).forEach((key) => delete listeners[key]);
    },
  };
  return {
    __esModule: true,
    localDb: {
      sync: jest.fn(() => mockEmitter),
    },
    default: {
      sync: jest.fn(() => mockEmitter),
    },
  };
});

describe('SyncStatusIndicator Component', () => {
  let mockEmitter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmitter = localDb.sync();
    if (mockEmitter && mockEmitter._reset) {
      mockEmitter._reset();
    }
  });

  test('dapat mag-render nang tama sa initial state (Checking Connection...)', () => {
    render(<SyncStatusIndicator />);
    const statusText = screen.getByText(/Checking Connection.../i);
    expect(statusText).toBeInTheDocument();
  });

  test('dapat magpakita ng "⚡ All changes synced to Cloud" kapag nakatanggap ng "paused" event (no error)', async () => {
    render(<SyncStatusIndicator />);
    await act(async () => {
      mockEmitter.emit('paused', null);
    });
    await waitFor(() => {
      const statusText = screen.getByText(/All changes synced to Cloud/i);
      expect(statusText).toBeInTheDocument();
      expect(statusText.parentElement).toHaveClass('sync-success');
    });
  });

  test('dapat magpakita ng "🔄 Connecting & Syncing..." kapag nakatanggap ng "active" o "change" event', async () => {
    render(<SyncStatusIndicator />);
    
    // 1. Test 'active' event
    await act(async () => {
      mockEmitter.emit('active', null);
    });
    await waitFor(() => {
      const statusText = screen.getByText(/Connecting & Syncing changes/i);
      expect(statusText).toBeInTheDocument();
      expect(statusText.parentElement).toHaveClass('sync-active');
    });

    // 2. Test 'change' event
    await act(async () => {
      mockEmitter.emit('change', {
        direction: 'pull',
        change: { docs: [{ _id: 'blotter_123' }] },
      });
    });
    await waitFor(() => {
      const statusText = screen.getByText(/Connecting & Syncing changes/i);
      expect(statusText).toBeInTheDocument();
    });
  });

  test('dapat magpakita ng "☁️ Working Offline..." kapag nakatanggap ng "error" o "paused" with error event', async () => {
    render(<SyncStatusIndicator />);
    const mockError = new Error('Network disconnection');
    await act(async () => {
      mockEmitter.emit('error', mockError);
    });
    await waitFor(() => {
      const statusText = screen.getByText(/Working Offline \(Saved to Local Device\)/i);
      expect(statusText).toBeInTheDocument();
      expect(statusText.parentElement).toHaveClass('sync-offline');
    });
  });
});