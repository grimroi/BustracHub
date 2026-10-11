// src/components/SummonsPanel.jsx
import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { createAuditLog } from '../utils/auditLog';
import { apiFetch } from '../utils/api';
import nabuaLogo from '../assets/nabua-logo.jpg';
import bustracLogo from '../assets/bustrac-logo.png';

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

  const handleScheduleDateChange = (e) => {
    const selectedValue = e.target.value;
    if (!selectedValue) {
      setSummonsDate("");
      return;
    }

    // Gumamit ng T00:00:00 para maiwasan ang timezone shift issues
    const selectedDate = new Date(`${selectedValue}T00:00:00`);
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 6 = Saturday

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Date',
        text: '⚠️ Ang Barangay Hall ay sarado tuwing Sabado at Linggo. Mangyaring pumili ng Lunes hanggang Biyernes.'
      });
      e.target.value = ""; // I-reset ang input
      setSummonsDate("");
      return;
    }

    setSummonsDate(selectedValue);
  };

  const handlePrintSummonsForm = () => {
    if (!currentCase) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Walang napiling kaso.' });
      return;
    }

    const rawDate = currentCase.nextHearingDate || currentCase.summonDate || currentCase.scheduleDate || currentCase.summonsDate;
    let formattedDate = 'TBA (To Be Announced)';

    if (rawDate) {
      const parsedDate = new Date(rawDate);
      if (!isNaN(parsedDate.getTime())) {
        formattedDate = parsedDate.toLocaleDateString('en-PH', { 
          year: 'numeric', month: 'long', day: 'numeric' 
        });
      } else {
        formattedDate = String(rawDate);
      }
    }

    const complainantName = typeof currentCase?.complainant === 'string' 
      ? currentCase.complainant 
      : currentCase?.complainant?.name || currentCase?.complainantName || 'N/A';

    const respondentName = typeof currentCase?.respondent === 'string' 
      ? currentCase.respondent 
      : currentCase?.respondent?.name || currentCase?.respondentName || 'Under Investigation';

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      Swal.fire({ icon: 'error', title: 'Popup Blocked', text: 'Please allow popups to print the form.' });
      return;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="fil">
<head>
  <meta charset="UTF-8">
  <title>KP Form No. 9 - Patawag (${currentCase?.trackingNo || currentCase?._id || 'N/A'})</title>
  <style>
    @page { size: A4; margin: 0; }
    body { font-family: 'Times New Roman', Times, serif; color: #000; padding: 1.5cm; box-sizing: border-box; line-height: 1.6; font-size: 12pt; }
    .kp-header-top { text-align: right; font-size: 10pt; font-weight: bold; margin-bottom: 10px; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    .header-table td { vertical-align: middle; }
    .logo-td { width: 80px; text-align: center; }
    .logo-td img { height: 75px; width: auto; object-fit: contain; }
    .header-text { text-align: center; }
    .header-text h5 { margin: 0; font-weight: normal; font-size: 11pt; }
    .header-text h4 { margin: 2px 0; font-size: 12pt; font-weight: bold; }
    .header-text h3 { margin: 5px 0 0 0; text-transform: uppercase; font-size: 15pt; font-weight: bold; }
    .divider { border-bottom: 2px solid #000; margin: 10px 0 20px 0; }
    .case-box { display: flex; justify-content: space-between; margin: 20px 0; font-size: 11pt; }
    .parties-col { width: 55%; }
    .meta-col { width: 40%; text-align: right; }
    .vs-text { margin: 10px 0 10px 40px; font-style: italic; font-weight: bold; }
    .form-title { text-align: center; font-weight: bold; font-size: 16pt; margin: 25px 0 20px 0; text-decoration: underline; text-transform: uppercase; letter-spacing: 1.5px; }
    .body-text { text-align: justify; text-indent: 40px; margin-bottom: 20px; }
    .body-text p { margin: 12px 0; }
    .signatures { margin-top: 50px; display: flex; justify-content: space-between; page-break-inside: avoid; }
    .sig-box { width: 280px; text-align: center; }
    .sig-line { border-top: 1px solid #000; margin-top: 55px; font-weight: bold; padding-top: 4px; font-size: 11pt; }
    .no-print { margin-top: 30px; padding: 12px; width: 100%; font-size: 14pt; font-weight: bold; cursor: pointer; background: #1e40af; color: white; border: none; border-radius: 6px; }
    @media print { .no-print { display: none !important; } body { padding: 1.5cm; } }
  </style>
</head>
<body>
  <div class="kp-header-top">KP Form No. 9</div>
  <table class="header-table">
    <tr>
      <td class="logo-td"><img src="${bustracLogo}" alt="Bustrac Logo" onerror="this.style.visibility='hidden'" /></td>
      <td class="header-text">
        <h5>Republika ng Pilipinas</h5>
        <h5>Lalawigan ng Camarines Sur • Bayan ng Nabua</h5>
        <h4>BARANGAY BUSTRAC</h4>
        <h3>TANGGAPAN NG LUPON TAGAPAMAYAPA</h3>
      </td>
      <td class="logo-td"><img src="${nabuaLogo}" alt="Nabua Logo" onerror="this.style.visibility='hidden'" /></td>
    </tr>
  </table>
  <div class="divider"></div>
  <div class="case-box">
    <div class="parties-col">
      <div><strong>${complainantName}</strong></div>
      <div style="font-size: 10pt; color: #333;">(Naghahabla / Complainant)</div>
      <div class="vs-text">- laban kay -</div>
      <div><strong>${respondentName}</strong></div>
      <div style="font-size: 10pt; color: #333;">(Ipinagsusumbong / Respondent)</div>
    </div>
    <div class="meta-col">
      <div><strong>KP Case No:</strong> ${currentCase?.trackingNo || currentCase?._id || 'N/A'}</div>
      <div style="margin-top: 5px;"><strong>Ukol sa:</strong> ${currentCase?.incidentType || currentCase?.type || 'Reklamo / Usapin'}</div>
    </div>
  </div>
  <div class="form-title">P A T A W A G (SUMMONS)</div>
  <div class="body-text">
    <p>Sa Iyo: <strong>${respondentName}</strong></p>
    <p>Sa pamamagitan nito, ikaw ay pinatatawag upang personal na humarap sa akin kasama ang iyong mga testigo sa <strong>Barangay Hall ng Bustrac</strong> sa petsang <strong>${formattedDate}</strong>, sa ganap na ika-<strong>${currentCase?.summonTime || currentCase?.scheduleTime || '9:00 AM'}</strong>, upang pag-usapan at pag-ayusin ang nabanggit na usapin.</p>
    <p>Ipinapaalala na ang iyong hindi pagharap sa itinakdang petsa at oras ay nangangahulugang pagbalewala sa proseso ng Katarungang Pambarangay. Ito ay maaaring maging dahilan upang ihain ang nararapat na parusa o pag-isyu ng <em>Certificate to File Action (CFA)</em> ayon sa probisyon ng Republic Act No. 7160.</p>
  </div>
  <div class="signatures">
    <div class="sig-box">
      <p style="text-align: left; margin-bottom: 50px; font-size: 10pt;">Binigyan ng Sipi / Tinanggap ni:</p>
      <div class="sig-line">${respondentName}</div>
      <p style="font-size: 9pt; margin-top: 2px;">Lagda ng Ipinagsusumbong / Petsa</p>
    </div>
    <div class="sig-box">
      <p style="text-align: left; margin-bottom: 50px; font-size: 10pt;">Inisyu ngayong araw:</p>
      <div class="sig-line">HON. BARANGAY CAPTAIN</div>
      <p style="font-size: 9pt; margin-top: 2px;">Punong Barangay / Lupon Chairman</p>
    </div>
  </div>
  <button class="no-print" onclick="window.print()">🖨️ I-Print ang KP Form No. 9 (Summons)</button>
  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 600); };
  </script>
</body>
</html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onafterprint = () => {
      printWindow.close();
    };
  };

  const handlePrintCFAForm = (caseData) => {
    if (!caseData) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      Swal.fire({ icon: 'error', title: 'Popup Blocked', text: 'Please allow popups to print the CFA.' });
      return;
    }

    printWindow.document.title = `Certificate to File Action - ${caseData?.trackingNo || 'N/A'}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Certificate to File Action - ${caseData?.trackingNo || 'N/A'}</title>
  <style>
    @page { margin: 1cm; size: A4; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; padding: 40px; color: #000; max-width: 800px; margin: 0 auto; line-height: 1.5; }
    .logos { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 15px; }
    .logos img { height: 70px; width: auto; object-fit: contain; }
    .header { text-align: center; margin-bottom: 20px; line-height: 1.3; border-bottom: 2px solid #000; padding-bottom: 15px; }
    .header h3 { margin: 0; text-transform: uppercase; font-size: 16pt; font-weight: bold; letter-spacing: 1px; }
    .header h4 { margin: 2px 0; font-weight: normal; font-size: 11pt; }
    .title { text-align: center; font-weight: bold; font-size: 16pt; margin: 30px 0; text-decoration: underline; text-transform: uppercase; }
    .body-text { font-size: 12pt; line-height: 1.8; text-align: justify; margin-bottom: 40px; }
    .case-info { margin: 20px 0; padding: 15px; border: 1px solid #000; font-size: 11pt; background: #f9f9f9; }
    .case-info p { margin: 5px 0; }
    .footer { margin-top: 80px; display: flex; justify-content: space-between; page-break-inside: avoid; }
    .sig-box { text-align: center; width: 250px; }
    .sig-line { border-top: 1px solid #000; margin-top: 50px; font-weight: bold; padding-top: 5px; }
    .kp-form-note { font-size: 9pt; text-align: center; margin-top: 60px; font-style: italic; color: #555; }
    @media print { body { padding: 0; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="logos">
    <img src="${bustracLogo}" alt="Bustrac Logo" />
    <img src="${nabuaLogo}" alt="Nabua Logo" />
  </div>
  <div class="header">
    <h4>Republic of the Philippines</h4>
    <h4>Province of Camarines Sur • Municipality of Nabua</h4>
    <h3>BARANGAY BUSTRAC</h3>
    <h4>OFFICE OF THE LUPON TAGAPAMAYAPA</h4>
  </div>
  <div class="title">CERTIFICATE TO FILE ACTION (CFA)</div>
  <div class="case-info">
    <p><strong>KP Case No:</strong> ${caseData?.trackingNo || caseData?._id || 'N/A'}</p>
    <p><strong>Complainant:</strong> ${caseData?.complainantName || (typeof caseData?.complainant === 'string' ? caseData.complainant : caseData?.complainant?.name) || 'N/A'}</p>
    <p><strong>Respondent:</strong> ${caseData?.respondentName || (typeof caseData?.respondent === 'string' ? caseData.respondent : caseData?.respondent?.name) || 'N/A'}</p>
    <p><strong>Nature of Complaint:</strong> ${caseData?.incidentType || caseData?.type || 'N/A'}</p>
  </div>
  <div class="body-text">
    <p>TO WHOM IT MAY CONCERN:</p>
    <p>This is to certify that the above-mentioned complaint has undergone the required mediation proceedings under the Katarungang Pambarangay Law (RA 7160). Despite <strong>${caseData?.summonCount || 'three (3)'}</strong> official summons, the parties failed to reach an amicable settlement.</p>
    <p>Consequently, this Office is issuing this Certificate to File Action, which authorizes the complainant to elevate the matter to the appropriate judicial or law enforcement authorities.</p>
    <p>Issued this <strong>${new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> at Barangay Bustrac, Nabua, Camarines Sur.</p>
  </div>
  <div class="footer">
    <div class="sig-box">
      <div class="sig-line">HON. BARANGAY CAPTAIN</div>
      <p style="font-size: 10pt; margin-top: 5px;">Punong Barangay / Lupon Chairman</p>
    </div>
    <div class="sig-box">
      <div class="sig-line">BARANGAY SECRETARY</div>
      <p style="font-size: 10pt; margin-top: 5px;">Lupon Secretary</p>
    </div>
  </div>
  <div class="kp-form-note">
    * Ito ay opisyal na dokumento ng Barangay Bustrac. Ang pagpapanggap o pagpapalit ng nilalaman nito ay may parusang ipinagbabawal ng batas.
  </div>
  <button class="no-print" onclick="window.print()" style="margin-top: 40px; padding: 12px 24px; width: 100%; font-size: 16px; font-weight: bold; cursor: pointer; background: #dc2626; color: white; border: none; border-radius: 6px;">
    🖨️ I-Print ang CFA
  </button>
  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 500); };
  </script>
</body>
</html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onafterprint = () => {
      printWindow.close();
    };
  };

  const handleSendSummonsNotice = async () => {
    if (!currentCase) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'No blotter record selected.' });
      return;
    }
    if (!summonsDate) {
      Swal.fire({ icon: 'warning', title: 'Missing Date', text: 'Please select an appearance date for the summons.' });
      return;
    }

    // ✅ Double-check weekend guard bago mag-send (defensive)
    const selectedDate = new Date(`${summonsDate}T00:00:00`);
    const dow = selectedDate.getDay();
    if (dow === 0 || dow === 6) {
      Swal.fire({ icon: 'warning', title: 'Invalid Date', text: '⚠️ Ang Barangay Hall ay sarado tuwing Sabado at Linggo.' });
      return;
    }

    setIsSending(true);

    try {
      const updatedStatus = 'Under Mediation';
      const updatedCount = Math.min(currentCount + 1, 3);

      let updatedPayload = {
        ...currentCase,
        summonCount: updatedCount,
        nextHearingDate: summonsDate,
        status: updatedStatus,
        updatedAt: new Date().toISOString()
      };

      // ✅ Robust PouchDB Update (Get latest _rev to prevent 409 Conflict)
      if (db) {
        try {
          const latestDoc = await db.get(currentCase._id);
          updatedPayload._rev = latestDoc._rev;
          await db.put(updatedPayload);
        } catch (getErr) {
          // Fallback if get fails
          await db.put(updatedPayload);
        }
      }

      // ✅ Audit Logging
      if (typeof createAuditLog === 'function') {
        await createAuditLog({
          action: 'SEND_SUMMONS',
          module: 'BLOTTER',
          recordId: currentCase._id,
          details: `Sent Summons #${updatedCount} for hearing on ${summonsDate}.`
        });
      }

      // ✅ Non-blocking Email Notification
      const targetEmail = currentCase.respondentEmail || currentCase.respondent?.email;
      if (targetEmail && targetEmail.trim() !== '') {
        try {
          await apiFetch('blotter/send-summons', {
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
        } catch (emailErr) {
          // Network errors and 401/403 are handled by apiFetch; do not
          // expose the token or upstream detail to the user.
          console.warn('Backend email service offline:', emailErr?.message || emailErr);
        }
      }

      const respName = typeof currentCase.respondent === 'string'
        ? currentCase.respondent
        : currentCase.respondent?.name || currentCase.respondentName || 'Respondent';

      Swal.fire({
        icon: 'success',
        title: 'Summons Sent',
        text: `Summons #${updatedCount} successfully logged for ${respName}!`,
        timer: 3000,
        showConfirmButton: false
      });

      if (typeof setBlotterList === 'function') {
        setBlotterList(prev => prev.map(item => item._id === updatedPayload._id ? { ...item, ...updatedPayload } : item));
      }

    } catch (err) {
      console.error('Error sending summons:', err);
      Swal.fire({
        icon: 'error',
        title: 'Failed',
        text: 'An error occurred while sending the summons. Please try again.'
      });
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
            onChange={handleScheduleDateChange}
            min={new Date().toISOString().slice(0, 10)}
            disabled={currentCount >= 3 || isCaseFinalized}
          />
          <small style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, display: 'block' }}>
            Lunes–Biyernes lamang (sarado ang Barangay Hall tuwing weekend).
          </small>
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
          style={{ width: '100%', padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          🖨️ Print Official Summons (KP Form)
        </button>

        {/* ✅ NEW: Print CFA Button (Shows when max summons reached or case is referred) */}
        {(currentCount >= 3 || currentCase?.status === 'Referred to Lupon' || currentCase?.status === 'Referred to PNP (CFA Issued)') && (
          <button
            type="button"
            className="btn"
            onClick={() => handlePrintCFAForm(currentCase)}
            style={{ width: '100%', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--red)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            📄 Print Certificate to File Action (CFA)
          </button>
        )}
        <div
          style={{
            marginTop: '4px',
            padding: '8px 10px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '10px',
            lineHeight: '1.5',
            color: 'var(--muted)'
          }}
        >
          Summons records are saved locally for offline use.
          Email notification is attempted when the backend service is available.
        </div>
      </div>
    </div>
  );
}