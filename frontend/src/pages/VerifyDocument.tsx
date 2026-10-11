import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { localDb, remoteDb } from '../services/db';
import bustracLogo from '../assets/bustrac-logo.png';
import {
  isVerifiableDocId,
  isVerifiableDoc,
  buildVerificationView,
} from '../utils/verifyDocument';
import { resolveApiBaseUrl } from '../utils/apiBase';

type VerificationView = ReturnType<typeof buildVerificationView>;

type VerifyResult =
  | { kind: 'ok'; view: VerificationView }
  | { kind: 'not_found'; message: string }
  | { kind: 'invalid_id'; message: string }
  | { kind: 'server_error'; message: string }
  | { kind: 'network_error'; message: string };

const apiBase = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

// Calls the public verification API and maps each outcome to a distinct result so
// the UI never conflates "server could not verify" with "you are offline".
const requestVerification = async (id: string): Promise<VerifyResult> => {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/certificates/verify/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err: any) {
    return { kind: 'network_error', message: err?.message || 'Network request failed.' };
  }

  if (response.status === 404) {
    return { kind: 'not_found', message: 'This document was not found in the barangay records.' };
  }
  if (response.status === 400) {
    return { kind: 'invalid_id', message: 'This verification link is invalid or malformed.' };
  }
  if (response.status >= 500) {
    return {
      kind: 'server_error',
      message: 'The verification service is temporarily unavailable. Please try again later.',
    };
  }
  if (!response.ok) {
    return { kind: 'server_error', message: `Verification failed (the server responded ${response.status}).` };
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    return { kind: 'server_error', message: 'The verification service returned an unexpected response.' };
  }

  if (!payload?.success || !payload?.data) {
    return { kind: 'not_found', message: 'This document was not found in the barangay records.' };
  }

  return { kind: 'ok', view: payload.data as VerificationView };
};

export default function VerifyDocument() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const docId = (searchParams.get('id') || '').trim();

  const [view, setView] = useState<VerificationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const verifyDoc = async () => {
      if (!docId || !isVerifiableDocId(docId)) {
        setError('Invalid verification link. The document ID is missing or malformed.');
        setLoading(false);
        return;
      }

      // 1. Prefer the backend API — it is reachable from phones over Wi-Fi/LAN
      //    and keeps CouchDB credentials off the client.
      const result = await requestVerification(docId);
      if (cancelled) return;

      if (result.kind === 'ok') {
        setView(result.view);
        setLoading(false);
        return;
      }

      // A definitive answer from the server must never be downgraded to "offline"
      // and must never be presented as an authentic document.
      if (result.kind === 'not_found' || result.kind === 'invalid_id' || result.kind === 'server_error') {
        setError(result.message);
        setLoading(false);
        return;
      }

      // 2. Network failure only — try the local/offline PouchDB replicas.
      try {
        let doc: any;
        try {
          doc = await localDb.get(docId);
        } catch (localErr: any) {
          if (localErr?.status === 404 && remoteDb) {
            doc = await remoteDb.get(docId);
          } else {
            throw localErr;
          }
        }

        if (cancelled) return;

        if (!isVerifiableDoc(doc)) {
          setError('This document could not be verified.');
          return;
        }

        setView(buildVerificationView(doc));
      } catch (offlineErr: any) {
        if (cancelled) return;
        if (offlineErr?.status === 404) {
          setError('This document was not found. It may have been deleted, or the ID is invalid.');
        } else {
          setError('Could not reach the verification service. Please check your connection and try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    verifyDoc();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', fontFamily: 'sans-serif' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 600 }}>Verifying document authenticity...</p>
      </div>
    );
  }

  if (error || !view) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fef2f2', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h2 style={{ color: '#991b1b', margin: '0 0 8px 0' }}>Verification Failed</h2>
        <p style={{ color: '#b91c1c', maxWidth: '400px' }}>{error || 'Document not found.'}</p>
        <button
          onClick={() => navigate('/')}
          style={{ marginTop: '24px', padding: '10px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const isValid = view.valid;
  const isRevoked = view.status === 'invalid';
  const isExpired = view.status === 'expired';
  const isPending = view.status === 'pending';
  const isUnverified = view.status === 'unverified';
  const themeColor = isValid ? '#16a34a' : isPending ? '#d97706' : isUnverified ? '#475569' : '#ef4444';
  const themeBg = isValid ? '#f0fdf4' : isPending ? '#fffbeb' : isUnverified ? '#f8fafc' : '#fef2f2';
  const borderColor = isValid ? '#22c55e' : isPending ? '#f59e0b' : isUnverified ? '#94a3b8' : '#ef4444';
  const iconBg = isValid ? '#dcfce7' : isPending ? '#fef3c7' : isUnverified ? '#e2e8f0' : '#fee2e2';

  const headline = isValid
    ? 'Document Verified'
    : isRevoked
      ? 'Document Revoked / Invalid'
      : isExpired
        ? 'Document Expired'
        : isPending
          ? 'Document Not Yet Valid'
          : isUnverified
            ? 'Document Unverified'
            : 'Document Not Valid';

  const subtext = isValid
    ? 'This document is authentic and was officially generated by the Bustrac Hub System.'
    : isRevoked
      ? 'This document has been officially cancelled or revoked by the Barangay. It is no longer valid for any legal or transactional purpose.'
      : isExpired
        ? 'This document is past its validity period and is no longer valid for any legal or transactional purpose.'
        : isPending
          ? 'This record exists in the barangay system but has not been issued/released yet, so it is not valid for any purpose. Please contact the Barangay to confirm its status.'
          : isUnverified
            ? 'The barangay system does not have enough verified issuance information for this record, so its authenticity cannot be confirmed. Please contact the Barangay.'
            : 'This document is not currently valid. Please contact the Barangay for assistance.';

  const scanTime = new Date().toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: themeBg, fontFamily: 'sans-serif', padding: '20px' }}>
      <div style={{ background: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxWidth: '500px', width: '100%', textAlign: 'center', border: `2px solid ${borderColor}` }}>

        <div style={{ width: '80px', height: '80px', background: iconBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
          {isValid ? (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : isPending || isExpired ? (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ) : isUnverified ? (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
        </div>

        <h1 style={{ color: themeColor, margin: '0 0 8px 0', fontSize: '24px' }}>{headline}</h1>

        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>{subtext}</p>

        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'left', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Document Type</span>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{view.documentType}</div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Status</span>
            <div style={{ fontSize: '16px', fontWeight: 800, color: themeColor }}>{view.statusLabel}</div>
          </div>

          {view.issuedTo && (
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Issued To</span>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{view.issuedTo.toUpperCase()}</div>
            </div>
          )}

          {view.referenceNo && (
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Reference No.</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155', fontFamily: 'monospace' }}>{view.referenceNo}</div>
            </div>
          )}

          {view.dateIssued && (
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Date Issued</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{view.dateIssued}</div>
            </div>
          )}

          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Verified At</span>
            <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#475569' }}>{scanTime}</div>
          </div>
        </div>

        <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '-12px', marginBottom: '20px' }}>
          For privacy, only the minimum information needed to confirm authenticity is shown.
        </p>

        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              flex: 1,
              padding: '12px',
              background: '#64748b',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            🏠 Go to Home
          </button>
          <button
            onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/'))}
            style={{
              flex: 1,
              padding: '12px',
              background: themeColor,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '15px',
            }}
          >
            ← Back
          </button>
        </div>

        <div style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8' }}>
          Suspicious of a fake document?{' '}
          <a
            href={`mailto:barangay.bustrac@gmail.com?subject=${encodeURIComponent(`Suspicious Document Report - ${docId}`)}&body=${encodeURIComponent(`Hello, I would like to report a potentially fake or altered document.\r\n\r\nDocument ID: ${docId}\r\nDate Scanned: ${scanTime}\r\n\r\nPlease verify this document's authenticity.`)}`}
            style={{ color: '#3b82f6', textDecoration: 'underline', fontWeight: 600 }}
          >
            Report it here
          </a>
        </div>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px' }}>
        <img src={bustracLogo} alt="Bustrac" style={{ width: '24px', height: '24px' }} />
        <span>Powered by Bustrac Hub v1.0.0</span>
      </div>
    </div>
  );
}
