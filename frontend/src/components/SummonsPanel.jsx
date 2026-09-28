// src/components/SummonsPanel.jsx
import React, { useState, useEffect } from 'react';

export function SummonsPanel({ currentCase, db, setBlotterList }) {
  const [summonsDate, setSummonsDate] = useState('');
  const [isSending, setIsSending] = useState(false);

  const sanitizeDate = (rawDate) => {
    if (!rawDate || rawDate === 'N/A' || rawDate === 'TBA') return '';
    if (typeof rawDate === 'string' && rawDate.includes('T')) {
      return rawDate.split('T')[0];
    }
    return rawDate;
  };

  useEffect(() => {
    if (currentCase) {
      const validDate = sanitizeDate(currentCase.nextHearingDate || currentCase.summonDate);
      setSummonsDate(validDate);
    } else {
      setSummonsDate('');
    }
  }, [currentCase]);

  const currentCount = currentCase?.summonCount || 0;
  const isCaseFinalized = currentCase?.status === 'Settled / Closed' || currentCase?.status === 'Dismissed';

  const handlePrintSummonsForm = () => {
    if (!currentCase) return alert('Walang napiling kaso.');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to print the form.');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Summons Notice - ${currentCase?.trackingNo || currentCase?._id || 'N/A'}</title>
        <style>
          body { font-family: 'Times New Roman', serif; padding: 40px; color: #000; }
          .header { text-align: center; margin-bottom: 20px; line-height: 1.2; }
          .header h3 { margin: 0; text-transform: uppercase; font-size: 14pt; }
          .header h4 { margin: 2px 0; font-weight: normal; font-size: 11pt; }
          .title { text-align: center; font-weight: bold; font-size: 14pt; margin: 30px 0; text-decoration: underline; }
          .body-text { font-size: 12pt; line-height: 1.6; text-align: justify; }
          .case-info { margin: 20px 0; padding: 10px; border: 1px solid #000; font-size: 11pt; }
          .footer { margin-top: 60px; display: flex; justify-content: space-between; }
          .sig-box { text-align: center; width: 220px; }
          .sig-line { border-top: 1px solid #000; margin-top: 40px; font-weight: bold; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h4>Republic of the Philippines</h4>
          <h4>Province of Camarines Sur • Municipality of Nabua</h4>
          <h3>BARANGAY BUSTRAC</h3>
          <h4>OFFICE OF THE LUPON TAGAPAMAYAPA</h4>
        </div>
        <div class="case-info">
          <strong>KP Case No:</strong> ${currentCase?.trackingNo || currentCase?._id || 'N/A'}<br/>
          <strong>For:</strong> ${currentCase?.incidentType || currentCase?.type || 'General Incident'}<br/>
          <strong>Complainant:</strong> ${typeof currentCase?.complainant === 'string' ? currentCase.complainant : currentCase?.complainant?.name || currentCase?.complainantName || 'N/A'}<br/>
          <strong>Respondent:</strong> ${typeof currentCase?.respondent === 'string' ? currentCase.respondent : currentCase?.respondent?.name || currentCase?.respondentName || 'N/A'}
        </div>
        <div class="title">PATAWAG (SUMMONS NOTICE #${currentCount + 1})</div>
        <div class="body-text">
          <p>Sa Iyo: <strong>${typeof currentCase?.respondent === 'string' ? currentCase.respondent : currentCase?.respondent?.name || currentCase?.respondentName || 'N/A'}</strong></p>
          <p>Ipinag-uutos sa iyo na personal na humarap sa akin/sa Lupon sa <strong>Barangay Hall ng Bustrac</strong> sa petsang <strong>${summonsDate || 'TBA'}</strong> para sa paghaharap at pag-aayos ng nabanggit na reklamo laban sa iyo.</p>
          <p>Ang hindi pagharap sa itinakdang petsa ay maaaring maging dahilan upang mawalan ka ng karapatang umapela o maghain ng kontra-reklamo.</p>
        </div>
        <div class="footer">
          <div class="sig-box">
            <p>Tinanggap ni Respondent:</p>
            <div class="sig-line">Lagda sa Itaas ng Pangalan</div>
            <p style="font-size: 10pt;">Petsa ng Pagtanggap: ____________</p>
          </div>
          <div class="sig-box">
            <p>Pinagtibay ni:</p>
            <div class="sig-line">HON. BARANGAY CAPTAIN</div>
            <p style="font-size: 10pt;">Punong Barangay / Lupon Chairman</p>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleSendSummonsNotice = async () => {
  if (!currentCase) {
    alert('No blotter record selected.');
    return;
  }
  if (!summonsDate) {
    alert('Please select an appearance date for the summons.');
    return;
  }

  setIsSending(true);

  try {
    const updatedCount = (currentCase.summonCount || 0) + 1;
    const updatedStatus = updatedCount >= 3 ? 'Referred to Lupon' : 'Under Mediation';

    let updatedPayload = {
      ...currentCase,
      summonCount: updatedCount,
      nextHearingDate: summonsDate,
      status: updatedStatus,
      updatedAt: new Date().toISOString()
    };

    // Update local PouchDB / RxDB with conflict handling
    if (db) {
      try {
        if (typeof currentCase.atomicPatch === 'function') {
          await currentCase.atomicPatch({
            summonCount: updatedCount,
            nextHearingDate: summonsDate,
            status: updatedStatus,
            updatedAt: updatedPayload.updatedAt
          });
        } else if (typeof db.get === 'function') {
          try {
            const latestDoc = await db.get(currentCase._id);
            updatedPayload._rev = latestDoc._rev;
            const res = await db.put(updatedPayload);
            if (res && res.rev) {
              updatedPayload._rev = res.rev;
            }
          } catch (getErr) {
            const res = await db.put(updatedPayload);
            if (res && res.rev) {
              updatedPayload._rev = res.rev;
            }
          }
        }
      } catch (dbErr) {
        console.warn('Local DB update warning:', dbErr.message || dbErr);
      }
    }

    // Send email notification via backend
    const targetEmail = currentCase.respondentEmail || currentCase.respondent?.email;
    if (targetEmail && targetEmail.trim() !== '') {
      try {
        const response = await fetch('http://localhost:5000/api/blotter/send-summons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseNumber: currentCase.trackingNo || currentCase.caseNumber || currentCase._id,
            respondentName: typeof currentCase.respondent === 'string' ? currentCase.respondent : currentCase.respondent?.name || currentCase.respondentName || 'Respondent',
            respondentEmail: targetEmail,
            appearanceDate: summonsDate,
            summonCount: updatedCount,
            incidentType: currentCase.incidentType || currentCase.type || 'Incident'
          })
        });

        const resData = await response.json();
        if (!response.ok) {
          console.warn('Backend Email Server Warning:', resData.message);
        }
      } catch (emailErr) {
        console.warn('Backend email service offline:', emailErr);
      }
    }

    const respName = typeof currentCase.respondent === 'string'
      ? currentCase.respondent
      : currentCase.respondent?.name || currentCase.respondentName || 'Respondent';

    alert(`Summons #${updatedCount} successfully logged and sent to ${respName}!`);

    // Update parent list state
    if (typeof setBlotterList === 'function') {
      setBlotterList(prev => prev.map(item => item._id === updatedPayload._id ? updatedPayload : item));
    }

  } catch (err) {
    console.error('Error sending summons:', err);
    alert('An error occurred while sending the summons.');
  } finally {
    setIsSending(false);
  }
};

  return (
    <div className="fp" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
        <span>Send Official Summons</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        Current Summon Count: <strong>{currentCount} / 3</strong>
      </div>

      <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 12 }}>
        <div className="fg">
          <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
            Appearance Date (Petsa ng Paghaharap) <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <input
            className="fc"
            type="date"
            value={summonsDate}
            onChange={(e) => setSummonsDate(e.target.value)}
            disabled={currentCount >= 3 || isCaseFinalized}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        <button
          type="button"
          className="btn btn-p"
          disabled={isSending || currentCount >= 3 || isCaseFinalized}
          onClick={handleSendSummonsNotice}
          style={{ width: '100%', padding: '10px 14px', cursor: (currentCount >= 3 || isCaseFinalized) ? 'not-allowed' : 'pointer' }}
        >
          {isCaseFinalized
            ? `Case ${currentCase?.status}`
            : isSending
            ? 'Sending Notice...'
            : currentCount >= 3
            ? 'Max Summons Reached (3/3)'
            : 'Log & Send Summons Notice'}
        </button>

        <button
          type="button"
          className="btn"
          onClick={handlePrintSummonsForm}
          style={{ width: '100%', padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontSize: '12px' }}
        >
          🖨️ Print Official Summons (KP Form)
        </button>
      </div>
    </div>
  );
}