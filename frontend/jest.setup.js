// frontend/jest.setup.js
import 'whatwg-fetch';
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfills
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

// Global mock para sa import.meta.env
if (typeof global.import === 'undefined') {
  global.import = {};
}
if (!global.import.meta) {
  global.import.meta = {
    env: {
      VITE_COUCHDB_URL: 'http://admin:admin@127.0.0.1:5984/bustrachub_db',
    },
  };
}

// Fallback mock para sa window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. MOCK POUCHDB PACKAGES (INLINE FACTORY FUNCTIONS)
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('pouchdb', () => {
  const createEmitter = () => ({
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
    sync: jest.fn().mockReturnValue(createEmitter()),
    changes: jest.fn().mockReturnValue(createEmitter()),
    setMaxListeners: jest.fn(),
  };

  const MockPouchDB = jest.fn().mockImplementation(() => instance);
  MockPouchDB.sync = jest.fn().mockReturnValue(createEmitter());
  MockPouchDB.defaults = jest.fn().mockImplementation(() => MockPouchDB);
  MockPouchDB.plugin = jest.fn();
  return MockPouchDB; });

jest.mock('pouchdb-browser', () => {
  const createEmitter = () => ({
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
    sync: jest.fn().mockReturnValue(createEmitter()),
    changes: jest.fn().mockReturnValue(createEmitter()),
    setMaxListeners: jest.fn(),
  };

  const MockPouchDB = jest.fn().mockImplementation(() => instance);
  MockPouchDB.sync = jest.fn().mockReturnValue(createEmitter());
  MockPouchDB.defaults = jest.fn().mockImplementation(() => MockPouchDB);
  MockPouchDB.plugin = jest.fn();
  return MockPouchDB; });

// ─────────────────────────────────────────────────────────────────────────────
// 2. MOCK DATABASE SERVICE (UNIVERSAL MATCH INLINE FACTORY)
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('../services/db', () => {
  const createEmitter = () => ({
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
    sync: jest.fn().mockReturnValue(createEmitter()),
    changes: jest.fn().mockReturnValue(createEmitter()),
    setMaxListeners: jest.fn(),
  };

  return {
    __esModule: true,
    localDb: instance,
    db: instance,
    default: instance,
    remoteCouchDB: instance,
    forceSyncToRemote: jest.fn().mockResolvedValue(undefined),
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  }; }, { virtual: true });

jest.mock('../../services/db', () => {
  const createEmitter = () => ({
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
    sync: jest.fn().mockReturnValue(createEmitter()),
    changes: jest.fn().mockReturnValue(createEmitter()),
    setMaxListeners: jest.fn(),
  };

  return {
    __esModule: true,
    localDb: instance,
    db: instance,
    default: instance,
    remoteCouchDB: instance,
    forceSyncToRemote: jest.fn().mockResolvedValue(undefined),
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  }; }, { virtual: true });

jest.mock('./src/services/db', () => {
  const createEmitter = () => ({
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
    sync: jest.fn().mockReturnValue(createEmitter()),
    changes: jest.fn().mockReturnValue(createEmitter()),
    setMaxListeners: jest.fn(),
  };

  return {
    __esModule: true,
    localDb: instance,
    db: instance,
    default: instance,
    remoteCouchDB: instance,
    forceSyncToRemote: jest.fn().mockResolvedValue(undefined),
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  }; }, { virtual: true });