// src/components/LinkResidentModal.jsx
import React, { useState, useMemo } from 'react';

export default function LinkResidentModal({
  isOpen,
  onClose,
  requestDoc,
  residentsList = [],
  onLinkResident,
  onCreateNewResident,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCandidates = useMemo(() => {
    if (!requestDoc) return [];
    const query = searchQuery.trim().toLowerCase();
    return (residentsList || []).filter((r) => {
      const name = (r.name || `${r.firstName || ''} ${r.lastName || ''}`).toLowerCase();
      const rbi = (r.rbiId || r.rbiNo || '').toLowerCase();
      const purok = (r.purok || '').toLowerCase();
      const contact = (r.contactNo || r.contact || '').toLowerCase();
      if (!query) return true;
      return name.includes(query) || rbi.includes(query) || purok.includes(query) || contact.includes(query);
    });
  }, [searchQuery, residentsList, requestDoc]);

  if (!isOpen || !requestDoc) return null;

  const reqName = requestDoc.fullName || requestDoc.name || 'Unknown';
  const reqPurok = requestDoc.purok || 'N/A';
  const reqContact = requestDoc.contact || requestDoc.contactNumber || 'N/A';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface, #1e293b)',
          border: '1px solid var(--border, #334155)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '650px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--text, #f8fafc)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Select Resident to Link Account</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted, #94a3b8)' }}>
              Link portal account request to an official Barangay Resident record
            </span>
          </div>
          <button
            onClick={onClose}
            className="btn btn-g btn-sm"
            style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>

        {/* Request Details Banner */}
        <div style={{ padding: '14px 24px', background: 'var(--surface2, #0f172a)', borderBottom: '1px solid var(--border, #334155)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Account Request From</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text, #f8fafc)' }}>{reqName}</div>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
            <div>
              <span style={{ color: 'var(--muted, #94a3b8)' }}>Purok:</span> <strong>{reqPurok}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--muted, #94a3b8)' }}>Contact:</span> <strong style={{ fontFamily: 'var(--mono, monospace)' }}>{reqContact}</strong>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '14px 24px 8px' }}>
          <div className="sb-box" style={{ width: '100%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              placeholder="Search registry by name, RBI ID, purok, or contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Candidates List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredCandidates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted, #94a3b8)' }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Walang nahanap na resident sa Registry.</p>
              <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
                Maaari mong irehistro si <strong>"{reqName}"</strong> bilang bagong resident sa ibaba.
              </p>
            </div>
          ) : (
            filteredCandidates.map((resident) => {
              const resId = resident.id || resident._id;
              const resName = resident.name || `${resident.firstName || ''} ${resident.lastName || ''}`.trim();
              const hasAccount = resident.hasAccount;

              return (
                <div
                  key={resId}
                  style={{
                    background: 'var(--surface2, #0f172a)',
                    border: '1px solid var(--border, #334155)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px' }}>{resName}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '8px',
                          background: hasAccount ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: hasAccount ? '#f59e0b' : '#10b981',
                          border: `1px solid ${hasAccount ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                        }}
                      >
                        {hasAccount ? 'Has Account' : 'No Account'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
                      <span>RBI: <strong style={{ color: 'var(--text, #f8fafc)', fontFamily: 'var(--mono, monospace)' }}>{resident.rbiId || resident.rbiNo || '—'}</strong></span>
                      <span>Purok: <strong>{resident.purok || 'N/A'}</strong></span>
                      {resident.contactNo && <span>Contact: <strong style={{ fontFamily: 'var(--mono, monospace)' }}>{resident.contactNo}</strong></span>}
                    </div>
                  </div>

                  <button
                    className="btn btn-p btn-sm"
                    style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
                    onClick={() => onLinkResident(resident)}
                  >
                    Link This Resident
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border, #334155)',
            background: 'var(--surface2, #0f172a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <button
            type="button"
            className="btn btn-g btn-sm"
            style={{ fontSize: '12px', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
            onClick={() => onCreateNewResident(requestDoc)}
          >
            ➕ Register "{reqName}" as New Resident
          </button>

          <button type="button" className="btn btn-g btn-sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
