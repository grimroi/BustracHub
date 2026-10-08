import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { localDb, remoteDb } from '../services/db';
import bustracLogo from '../assets/bustrac-logo.png';

export default function VerifyDocument() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const docId = searchParams.get('id');

  const [documentData, setDocumentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const verifyDoc = async () => {
      if (!docId) {
        setError('Invalid verification link. No document ID provided.');
        setLoading(false);
        return;
      }

      try {
        let doc;

        try {
          doc = await localDb.get(docId);
        } catch (localErr: any) {
          if (localErr.status === 404 && remoteDb) {
            doc = await remoteDb.get(docId);
          } else {
            throw localErr;
          }
        }

        setDocumentData(doc);
      } catch (err: any) {
        if (err.status === 404) {
          setError('Document not found. It may have been deleted, or the ID is invalid.');
        } else {
          setError('An error occurred while verifying the document. Please check your internet connection.');
        }
      } finally {
        setLoading(false);
      }
    };

    verifyDoc();
  }, [docId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', fontFamily: 'sans-serif' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 600 }}>Verifying document authenticity...</p>
      </div>
    );
  }

  if (error) {
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
        <p style={{ color: '#b91c1c', maxWidth: '400px' }}>{error}</p>
        <button
          onClick={() => navigate('/')}
          style={{ marginTop: '24px', padding: '10px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const docType = documentData.type?.replace('_', ' ').toUpperCase() || 'CERTIFICATE';
  const fullName =
    documentData.fullName ||
    documentData.applicantName ||
    documentData.businessName ||
    documentData.firstName + ' ' + documentData.lastName ||
    'Unknown';
  const dateIssued = documentData.dateIssued || documentData.issuedAt || documentData.createdAt || 'N/A';

  const isRevoked =
    documentData.status === 'Revoked' ||
    documentData.status === 'Cancelled';

  const scanTime = new Date().toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const themeColor = isRevoked ? '#ef4444' : '#16a34a';
  const themeBg = isRevoked ? '#fef2f2' : '#f0fdf4';
  const borderColor = isRevoked ? '#ef4444' : '#22c55e';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: themeBg, fontFamily: 'sans-serif', padding: '20px' }}>
      <div style={{ background: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxWidth: '500px', width: '100%', textAlign: 'center', border: `2px solid ${borderColor}` }}>
        
        <div style={{ width: '80px', height: '80px', background: isRevoked ? '#fee2e2' : '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
          {isRevoked ? (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          )}
        </div>

        <h1 style={{ color: themeColor, margin: '0 0 8px 0', fontSize: '24px' }}>
          {isRevoked ? 'Document Revoked / Invalid' : 'Document Verified'}
        </h1>

        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
          {isRevoked
            ? 'This document has been officially cancelled or revoked by the Barangay. It is no longer valid for any legal or transactional purpose.'
            : 'This document is authentic and was officially generated by the Bustrac Hub System.'}
        </p>

        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'left', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Document Type</span>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{docType}</div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Issued To</span>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{fullName.toUpperCase()}</div>
          </div>

          {(documentData.purpose || documentData.issuanceMeta?.purpose) && (
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Purpose</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                {documentData.purpose || documentData.issuanceMeta?.purpose}
              </div>
            </div>
          )}

          {(documentData.orNo || documentData.orNumber || documentData.issuanceMeta?.orNumber) && (
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                Official Receipt No.
              </span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155', fontFamily: 'monospace' }}>
                {documentData.orNo || documentData.orNumber || documentData.issuanceMeta?.orNumber}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Date Issued</span>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
              {new Date(dateIssued).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>

          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Verified At (Server Time)</span>
            <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#475569' }}>{scanTime}</div>
          </div>
        </div>
        {/* Navigation Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
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
            gap: '8px'
            }}
        >
            🏠 Go to Home
        </button>
        <button 
            onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')} 
            style={{ 
            flex: 1, 
            padding: '12px', 
            background: themeColor, 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            fontWeight: 700, 
            fontSize: '15px' 
            }}
        >
            ← Back
        </button>
        </div>

        {/* Report Link (Nasa tamang pwesto na ito) */}
        <div style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8' }}>
        Suspicious of a fake document?{' '}
        <a 
            href={`mailto:barangay.bustrac@gmail.com?subject=Suspicious Document Report - ${docId}&body=Hello, I would like to report a potentially fake or altered document.%0D%0A%0D%ADocument ID: ${docId}%0D%ADate Scanned: ${scanTime}%0D%0APlease verify this document's authenticity.`} 
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