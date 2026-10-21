import React from 'react';
import { render, screen } from '@testing-library/react';

// Capture the value handed to the QR so we can assert exactly what gets encoded.
jest.mock('qrcode.react', () => ({
  QRCodeSVG: (props: any) => {
    const ReactLib = require('react');
    return ReactLib.createElement('svg', { 'data-testid': 'qr', 'data-value': props.value });
  },
}));

import { BarangayClearance } from '../BarangayClearance';
import { buildVerifyUrl, normalizeQrConfig } from '../../../../utils/qrConfig';

const BRGY_ID = 'brgy_clearance_1788929049299';

const baseRecord: any = {
  _id: BRGY_ID,
  type: 'barangay_clearance',
  certificateType: 'Barangay Clearance',
  clearanceNo: 'BC-2026-0001',
  fullName: 'PANIZAL, JOAN REBUSQUILLO',
  firstName: 'JOAN',
  lastName: 'PANIZAL',
  purpose: 'Employment Requirement',
  address: 'Zone 5, Bustrac, Nabua',
  dateIssued: '2026-09-09',
};

const qrValue = () => screen.getByTestId('qr').getAttribute('data-value') || '';

describe('BarangayClearance QR', () => {
  test('encodes the configured base URL (via normalizeQrConfig/buildVerifyUrl)', () => {
    const qrConfig = { enabled: true, baseUrl: 'http://192.168.1.2:5174' };
    render(<BarangayClearance data={baseRecord} qrConfig={qrConfig} />);

    expect(qrValue()).toBe(buildVerifyUrl(BRGY_ID, normalizeQrConfig(qrConfig)));
  });

  test('uses publicDomain as the base URL when no qrConfig is supplied', () => {
    render(<BarangayClearance data={baseRecord} publicDomain="192.168.1.2:5174" />);

    const expected = buildVerifyUrl(
      BRGY_ID,
      normalizeQrConfig({ baseUrl: '192.168.1.2:5174' })
    );
    expect(qrValue()).toBe(expected);
  });

  test('missing config falls back to the current origin (never a hardcoded localhost:5173)', () => {
    render(<BarangayClearance data={baseRecord} />);

    // normalizeQrConfig() defaults enabled=true with an empty base URL, so the
    // expected value is derived from the REAL helpers, not hand-written.
    const expected = buildVerifyUrl(BRGY_ID, normalizeQrConfig());
    expect(qrValue()).toBe(expected);
    expect(qrValue()).not.toContain('localhost:5173');
    expect(qrValue()).not.toContain('https://localhost');
  });

  test('renders the [QR CODE PLACEHOLDER] when verification is disabled', () => {
    render(
      <BarangayClearance
        data={baseRecord}
        qrConfig={{ enabled: false, baseUrl: 'http://192.168.1.2:5174' }}
      />
    );

    expect(screen.queryByTestId('qr')).toBeNull();
    expect(screen.getByText('[QR CODE PLACEHOLDER]')).toBeTruthy();
  });

  test('shows the [QR CODE PLACEHOLDER] when there is no record id', () => {
    render(<BarangayClearance data={{ ...baseRecord, _id: undefined }} qrConfig={{ enabled: true }} />);

    expect(screen.queryByTestId('qr')).toBeNull();
    expect(screen.getByText('[QR CODE PLACEHOLDER]')).toBeTruthy();
  });

  test('does not encode a non-verifiable (uuid) id', () => {
    render(<BarangayClearance data={{ ...baseRecord, _id: '2a555d4b-27b8-41d3-ac39-a3a5b50653d3' }} qrConfig={{ enabled: true }} />);

    expect(screen.queryByTestId('qr')).toBeNull();
    expect(screen.getByText('[QR CODE PLACEHOLDER]')).toBeTruthy();
  });

  test('never encodes personal information in the QR', () => {
    render(<BarangayClearance data={baseRecord} qrConfig={{ enabled: true, baseUrl: 'http://192.168.1.2:5174' }} />);

    expect(qrValue()).not.toContain('PANIZAL');
    expect(qrValue()).not.toContain('JOAN');
    expect(qrValue()).not.toContain('Zone 5');
    expect(qrValue()).not.toContain('Employment');
    expect(qrValue()).toBe('http://192.168.1.2:5174/verify?id=' + BRGY_ID);
  });

  test('preserves the barcode placeholder', () => {
    render(<BarangayClearance data={baseRecord} qrConfig={{ enabled: true }} />);
    expect(screen.getByText('[BARCODE PLACEHOLDER]')).toBeTruthy();
  });
});

describe('BarangayClearance QR — secure verification token', () => {
  const TOKEN = 'aB3-_xYz9'.repeat(5).slice(0, 43);

  test('encodes the SECURE token URL when the certificate carries a token', () => {
    const qrConfig = { enabled: true, baseUrl: 'https://bustrac.example.gov.ph' };
    render(
      <BarangayClearance
        data={{ ...baseRecord, verificationToken: TOKEN }}
        qrConfig={qrConfig}
      />
    );

    expect(qrValue()).toBe(
      `https://bustrac.example.gov.ph/verify?token=${encodeURIComponent(TOKEN)}`
    );
  });

  test('the token URL does NOT contain the document id', () => {
    render(
      <BarangayClearance
        data={{ ...baseRecord, verificationToken: TOKEN }}
        qrConfig={{ enabled: true, baseUrl: 'https://bustrac.example.gov.ph' }}
      />
    );

    expect(qrValue()).not.toContain('id=');
    expect(qrValue()).not.toContain(BRGY_ID);
  });

  test('a malformed token falls back to the legacy id link rather than encoding it', () => {
    render(
      <BarangayClearance
        data={{ ...baseRecord, verificationToken: 'not-a-real-token' }}
        qrConfig={{ enabled: true, baseUrl: 'http://192.168.1.2:5174' }}
      />
    );

    expect(qrValue()).toBe('http://192.168.1.2:5174/verify?id=' + BRGY_ID);
  });

  test('the token QR still encodes no personal information', () => {
    render(
      <BarangayClearance
        data={{ ...baseRecord, verificationToken: TOKEN }}
        qrConfig={{ enabled: true, baseUrl: 'https://bustrac.example.gov.ph' }}
      />
    );

    expect(qrValue()).not.toContain('PANIZAL');
    expect(qrValue()).not.toContain('JOAN');
    expect(qrValue()).not.toContain('Zone 5');
    expect(qrValue()).not.toContain('Employment');
    expect(qrValue()).not.toContain('BC-2026-0001');
  });
});
