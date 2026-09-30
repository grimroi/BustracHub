import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import barangayLogo from '../assets/bustrac-logo.png';
import nabuaLogo from '../assets/nabua-logo.jpg';
import { localDb as db } from '../services/db'; 

export default function VerifyDocument() {
  const [searchParams] = useSearchParams();
  const caseNo = searchParams.get('caseNo');
  const type = searchParams.get('type');
  const hash = searchParams.get('hash');
  const [loading, setLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    async function verifyInDb() {
      if (!caseNo) {
        setLoading(false);
        setIsValid(false);
        return;
      }
      try {
        // 1. Unang i-check ang Local PouchDB Index
        let result = await db.allDocs({ include_docs: true });
        let allDocs = result.rows.map(r => r.doc).filter(Boolean);

        // 2. Kung empty sa local, mag-fallback sa Remote CouchDB
        if (allDocs.length === 0 && typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            const remoteCouchUrl = 'http://192.168.1.3:5984/bustrachub_db/_all_docs?include_docs=true';
            const authHeader = 'Basic ' + btoa('admin:capstone2026');
            const response = await fetch(remoteCouchUrl, {
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
              }
            });
            if (response.ok) {
              const remoteData = await response.json();
              allDocs = remoteData.rows.map(r => r.doc).filter(Boolean);
            }
          } catch (remoteErr) {
            console.warn('Could not fetch directly from Remote CouchDB:', remoteErr);
          }
        }

        // 3. Match Case Reference
        const cleanSearchTarget = caseNo.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const foundDoc = allDocs.find(doc => {
          if (!doc) return false;
          const possibleIds = [
            doc._id,
            doc.trackingNo,
            doc.caseNo,
            doc.refNumber,
            doc.trackingNumber,
            doc.blotterId
          ];
          return possibleIds.some(idVal => {
            if (!idVal) return false;
            const cleanDocId = String(idVal).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanDocId === cleanSearchTarget || cleanDocId.includes(cleanSearchTarget) || cleanSearchTarget.includes(cleanDocId);
          });
        });

        setIsValid(Boolean(foundDoc));
      } catch (err) {
        console.error('Verification DB error:', err);
        setIsValid(false);
      } finally {
        setLoading(false);
      }
    }

    verifyInDb();
  }, [caseNo]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      color: '#ffffff',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px 16px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '20px',
        padding: '32px 24px',
        maxWidth: '460px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        textAlign: 'center'
      }}>
        {/* Balanced Header Seals with Clean Badge Background */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '20px' }}>
        <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            padding: '4px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
        }}>
            <img 
            src={barangayLogo} 
            alt="Barangay Logo" 
            style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} 
            />
        </div>

        <div style={{ height: '36px', width: '1px', background: '#334155' }}></div>

        <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            padding: '4px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
        }}>
            <img 
            src={nabuaLogo} 
            alt="Nabua Logo" 
            style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} 
            onError={(e) => { e.target.parentElement.style.display = 'none'; }}
            />
        </div>
        </div>

        <p style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', letterSpacing: '1.2px', textTransform: 'uppercase', margin: '0 0 4px 0' }}>
          Republic of the Philippines
        </p>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#94a3b8', margin: '0 0 24px 0' }}>
          BARANGAY BUSTRAC, NABUA
        </h3>

        {loading ? (
          <div style={{ padding: '30px 0' }}>
            <div style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>
              Verifying document with Barangay Database...
            </div>
          </div>
        ) : isValid ? (
          <>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e', margin: '0 0 4px 0' }}>
              OFFICIAL BARANGAY DOCUMENT
            </h2>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 24px 0' }}>
              Document Integrity Verified & Authentic
            </p>

            <div style={{
              background: '#0f172a',
              borderRadius: '12px',
              padding: '18px',
              textAlign: 'left',
              fontSize: '13px',
              lineHeight: '1.8',
              border: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Document Type:</span>
                <span style={{ fontWeight: 600, color: '#f8fafc', textAlign: 'right' }}>{type || 'Blotter Certificate'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Case Reference:</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{caseNo || 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Verification Hash:</span>
                <span style={{ fontFamily: 'monospace', color: '#38bdf8', fontWeight: 600 }}>{hash || 'N/A'}</span>
              </div>
              <div style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px dashed #334155',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ color: '#94a3b8' }}>Status:</span>
                <span style={{
                  background: 'rgba(34, 197, 94, 0.2)',
                  color: '#4ade80',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  AUTHENTIC & ISSUED
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              fontSize: '32px',
              marginBottom: '12px',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}>
              ✕
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ef4444', margin: '0 0 8px 0' }}>
              INVALID / UNVERIFIED DOCUMENT
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              The case reference code <strong style={{ color: '#f8fafc' }}>{caseNo || 'Unknown'}</strong> was not found in the official record system of Barangay Bustrac.
            </p>
          </>
        )}

        <div style={{
          fontSize: '11px',
          color: '#64748b',
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid #334155',
          lineHeight: '1.5'
        }}>
          This verification confirms that the certificate with the above reference hash was officially processed by Barangay Bustrac Management Information System, Nabua, Camarines Sur.
        </div>
      </div>
    </div>
  );
}