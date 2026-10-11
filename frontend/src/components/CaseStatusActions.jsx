import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { createAuditLog } from '../utils/auditLog';

const showToast = (type, message) => {
  if (typeof Swal !== 'undefined' && Swal.fire) {
    Swal.fire({
      icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
      toast: true,
      position: 'top-end',
      timer: 2500,
      showConfirmButton: false,
      title: message,
    });
  }
};

export function CaseStatusActions({ currentCase, db, setBlotterList, onPrintCFA }) {
  const [updating, setUpdating] = useState(false);

  // Disable buttons if case is already closed
  const isClosed = 
    currentCase?.status === 'Settled / Resolved' || 
    currentCase?.status === 'Dismissed' || 
    currentCase?.cfaIssued || 
    currentCase?.status === 'Referred to PNP (CFA Issued)';
  
  console.log("Attempting update. DocID:", currentCase._id || currentCase.trackingNo, "DB exists:", !!db);
  const handleUpdateStatus = async (newStatus, actionType) => {
    if (!currentCase) return;

    let confirmMsg = `Sigurado ka bang nais palitan ang status ng kaso patungong "${newStatus}"?`;
    if (actionType === 'cfa') {
      confirmMsg = '⚠️ BABALA: Mag-i-issue ka ng Certificate to File Action (CFA). Ang kasong ito ay maitatransfer na sa PNP o Korte. Ituloy?';
    }

    if (!window.confirm(confirmMsg)) return;

    setUpdating(true);

    try {
      // 1. Get the correct document ID
      const docId = currentCase._id || currentCase.trackingNo || currentCase.id;
      
      if (!docId) {
       showToast('error', 'Walang valid na Case ID ang kasong ito. Paki-save muna ang blotter bago i-update ang status.');
        setUpdating(false);
        return;
      }

      let latestDoc;
      try {
        // Try to get the existing document from PouchDB
        latestDoc = await db.get(docId);
      } catch (err) {
        if (err.status === 404) {
          // FALLBACK: Document doesn't exist in DB yet (e.g., it's a mock case)
          // Let's create it first with a default 'Open' status, then we can update it
          console.warn("Document not found in DB. Creating it first...");
          const newDoc = {
            _id: docId,
            ...currentCase,
            status: 'Open',
            createdAt: new Date().toISOString(),
          };
          const createRes = await db.put(newDoc);
          latestDoc = { ...newDoc, _rev: createRes.rev };
        } else {
          console.error("Failed to fetch document:", err);
          alert(`⚠️ Hindi makuha ang record sa database. Error: ${err.message}`);
          setUpdating(false);
          return;
        }
      }

      // 2. Prepare the updated payload with the LATEST _rev
      const updatedPayload = {
        ...latestDoc,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };

      // Add specific metadata based on action
      if (actionType === 'cfa') {
        updatedPayload.cfaIssued = true;
        updatedPayload.cfaIssuedAt = new Date().toISOString();
      }
      if (actionType === 'settled') {
        updatedPayload.resolvedAt = new Date().toISOString();
        updatedPayload.resolution = 'Amicable Settlement Reached';
      }

      // 3. Save to DB with RETRY LOGIC for 409 conflicts (The "CustomPouchError" fix)
      let saveSuccess = false;
      let attempts = 0;
      while (attempts < 3 && !saveSuccess) {
        try {
          const res = await db.put(updatedPayload);
          updatedPayload._rev = res.rev; // Update rev for any subsequent operations
          saveSuccess = true;
        } catch (err) {
          if (err.status === 409) {
            attempts++;
            console.warn(`Conflict detected. Retrying (${attempts}/3)...`);
            // Fetch latest again to get new _rev
            const freshDoc = await db.get(docId);
            Object.assign(updatedPayload, freshDoc, { 
              status: newStatus, 
              updatedAt: new Date().toISOString() 
            });
            if (actionType === 'cfa') {
              updatedPayload.cfaIssued = true;
              updatedPayload.cfaIssuedAt = new Date().toISOString();
            }
            if (actionType === 'settled') {
              updatedPayload.resolvedAt = new Date().toISOString();
              updatedPayload.resolution = 'Amicable Settlement Reached';
            }
          } else {
            throw err; // Not a conflict, throw immediately
          }
        }
      }

      if (!saveSuccess) {
        throw new Error("Max retries reached due to persistent conflicts.");
      }

      // 4. Update Local State
      if (typeof setBlotterList === 'function') {
        setBlotterList(prev => 
          prev.map(item => 
            (item._id === updatedPayload._id || item.id === updatedPayload._id) 
              ? updatedPayload 
              : item
          )
        );
      }

      // 5. Audit Log
      if (typeof createAuditLog === 'function') {
        await createAuditLog({
          action: actionType === 'cfa' ? 'ISSUE_CFA' : 'UPDATE_BLOTTER_STATUS',
          module: 'BLOTTER',
          recordId: docId,
          details: `Updated status of ${docId} to "${newStatus}"`,
        });
      }

 showToast('success', `Status successfully updated to: ${newStatus}`);
      // 6. Auto-trigger CFA print if escalated
      if (actionType === 'cfa' && typeof onPrintCFA === 'function') {
        onPrintCFA(updatedPayload);
      }

    } catch (err) {
      console.error('Error updating status:', err);
     showToast(
  'error',
  `Hindi naiproseso ang pagbabago ng status.\n\nDetails: ${err.message || 'Unknown error'}`
);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px' }}>
      <button 
        type="button" 
        className="btn" 
        style={{ background: '#10b981', color: '#fff', fontSize: '13px', fontWeight: 700, flex: 1, minWidth: '150px', opacity: updating || isClosed ? 0.6 : 1, cursor: updating || isClosed ? 'not-allowed' : 'pointer' }} 
        disabled={updating || isClosed} 
        onClick={() => handleUpdateStatus('Settled / Resolved', 'settled')}
      >
        {updating ? '⏳ Updating...' : '✓ Mark as Settled (Amicable)'}
      </button>
      
      <button 
        type="button" 
        className="btn" 
        style={{ background: '#dc2626', color: '#fff', fontSize: '13px', fontWeight: 700, flex: 1, minWidth: '150px', opacity: updating || isClosed ? 0.6 : 1, cursor: updating || isClosed ? 'not-allowed' : 'pointer' }} 
        disabled={updating || isClosed} 
        onClick={() => {
          if (currentCase?.summonCount < 3) {
            if (!window.confirm("⚠️ BABALA: Ang CFA ay karaniwang inilalabas pagkatapos ng 3rd Summons na hindi dumating. Sigurado ka bang nais itong i-escalate ngayon?")) return;
          }
          handleUpdateStatus('Referred to PNP (CFA Issued)', 'cfa');
        }}
      >
        {updating ? '⏳ Updating...' : '⚠️ Issue CFA (Escalate)'}
      </button>
      
      <button 
        type="button" 
        className="btn" 
        style={{ background: '#6b7280', color: '#fff', fontSize: '13px', fontWeight: 700, flex: 1, minWidth: '150px', opacity: updating || isClosed ? 0.6 : 1, cursor: updating || isClosed ? 'not-allowed' : 'pointer' }} 
        disabled={updating || isClosed} 
        onClick={() => handleUpdateStatus('Dismissed', 'dismissed')}
      >
        {updating ? '⏳ Updating...' : '✕ Dismiss / Drop Case'}
      </button>
    </div>
  );
}