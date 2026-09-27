// src/setupTests.js
import '@testing-library/jest-dom';

// Global mock storage para ma-access sa loob ng test files kung kinakailangan
global.consoleLogSpy = null;
global.alertSpy = null;

beforeAll(() => {
  // 1. Mute/Spy console methods para malinis ang test output
  global.consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  // 2. Global window.alert spy
  global.alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
});

beforeEach(() => {
  // 3. Siguraduhing malinis ang lahat ng mock history (calls, instances) bago ang bawat test scenario
  jest.clearAllMocks();
});

afterAll(() => {
  // 4. I-restore ang original console at window functionality pagkatapos ng buong test suite
  global.consoleLogSpy.mockRestore();
  global.alertSpy.mockRestore();
  jest.restoreAllMocks();
});