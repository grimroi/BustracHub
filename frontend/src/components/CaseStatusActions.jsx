// src/components/CaseStatusActions.jsx
import React, { useState } from 'react';

export function CaseStatusActions({ currentCase, db, setBlotterList }) {
  const [updating, setUpdating] = useState(false);

  const handleUpdateStatus = async (newStatus) => {
  if (!currentCase) return;
  const confirmMsg = `Sigurado ka bang nais palitan ang status ng kaso patungong "${newStatus}"?`;
  if (!window.confirm(confirmMsg)) return;

  setUpdating(true);
  try {
    const updatedPayload = { 
      ...currentCase, 
      status: newStatus, 
      updatedAt: new Date().toISOString() 
    };

    // 1. Update DB
    if (db && typeof db.put === 'function') {
      await db.put(updatedPayload);
    }

    // 2. Local State Refresh
    if (typeof setBlotterList === 'function') {
      setBlotterList(prev => prev.map(item => item._id === updatedPayload._id ? updatedPayload : item));
    }

    // 3. Audit Log Integration (Maganda para sa Capstone Presentation)
    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'UPDATE_BLOTTER_STATUS',
        module: 'BLOTTER',
        recordId: currentCase.trackingNo || currentCase._id,
        details: `Updated status of ${currentCase.trackingNo} to "${newStatus}"`,
      });
    }

    alert(`✓ Status successfully updated to: ${newStatus}`);
  } catch (err) {
    console.error('Error updating status:', err);
    alert('⚠️ Hindi naiproseso ang pagbabago ng status.');
  } finally {
    setUpdating(false);
  }
};

  return (
    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
      <button 
        type="button" 
        className="btn" 
        style={{ background: '#10b981', color: '#fff', fontSize: '12px' }}
        disabled={updating || currentCase?.status === 'Settled / Closed'}
        onClick={() => handleUpdateStatus('Settled / Closed')}
      >
        Mark Case as Settled
      </button>

      <button 
        type="button" 
        className="btn" 
        style={{ background: '#f59e0b', color: '#fff', fontSize: '12px' }}
        disabled={updating || currentCase?.status === 'Referred to Lupon'}
        onClick={() => handleUpdateStatus('Referred to Lupon')}
      >
        Refer to Lupon / KP
      </button>

      <button 
        type="button" 
        className="btn" 
        style={{ background: '#ef4444', color: '#fff', fontSize: '12px' }}
        disabled={updating || currentCase?.status === 'Dismissed'}
        onClick={() => handleUpdateStatus('Dismissed')}
      >
        Dismiss Case
      </button>
    </div>
  );
}