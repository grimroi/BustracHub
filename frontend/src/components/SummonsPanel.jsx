// src/components/SummonsPanel.jsx
import React, { useState, useEffect } from 'react';
import { createAuditLog } from '../utils/auditLog';
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

  // ✅ Weekend guard — pinipigilan ang Sabado/Linggo para sa appearance date
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
      alert("⚠️ Ang Barangay Hall ay sarado tuwing Sabado at Linggo. Mangyaring pumili ng Lunes hanggang Biyernes.");
      e.target.value = ""; // I-reset ang input
      setSummonsDate("");
      return;
    }

    setSummonsDate(selectedValue);
  };

  const handlePrintSummonsForm = () => {
    if (!currentCase) return alert('Walang napiling kaso.');

    const currentCount = Number(currentCase.summonCount || 0);
    const rawDate = currentCase.nextHearingDate || currentCase.summonDate;

    let formattedDate = 'TBA (To Be Announced)';
    if (rawDate) {
      try {
        formattedDate = new Date(rawDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
      } catch (e) {
        formattedDate = rawDate;
      }
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to print the form.');

    printWindow.document.title = `Summons Notice - ${currentCase?.trackingNo || 'N/A'}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Summons Notice - ${currentCase?.trackingNo || 'N/A'}</title>
  <style>
    body { font-family: 'Times New Roman', serif; padding: 40px; color: #000; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; line-height: 1.3; border-bottom: 2px solid #000; padding-bottom: 15px; }
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
    @media print {
      body { padding: 20px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="logos">
  <img src="${bustracLogo}" alt="Bustrac Logo" style="height: 70px; width: auto;" />
  <img src="${nabuaLogo}" alt="Nabua Logo" style="height: 70px; width: auto;" />
</div>
  <div class="header">
    <h4>Republic of the Philippines</h4>
    <h4>Province of Camarines Sur • Municipality of Nabua</h4>
    <h3>BARANGAY BUSTRAC</h3>
    <h4>OFFICE OF THE LUPON TAGAPAMAYAPA</h4>
  </div>

  <div class="case-info">
    <p><strong>KP Case No:</strong> ${currentCase?.trackingNo || currentCase?._id || 'N/A'}</p>
    <p><strong>Complainant:</strong> ${typeof currentCase?.complainant === 'string' ? currentCase.complainant : currentCase?.complainant?.name || currentCase?.complainantName || 'N/A'}</p>
    <p><strong>Respondent:</strong> ${typeof currentCase?.respondent === 'string' ? currentCase.respondent : currentCase?.respondent?.name || currentCase?.respondentName || 'N/A'}</p>
    <p><strong>Nature of Complaint:</strong> ${currentCase?.incidentType || currentCase?.type || 'General Incident'}</p>
  </div>

  <div class="title">PATAWAG (SUMMONS NOTICE)</div>

  <div class="body-text">
    <p>Sa Iyo: <strong>${typeof currentCase?.respondent === 'string' ? currentCase.respondent : currentCase?.respondent?.name || currentCase?.respondentName || 'N/A'}</strong>,</p>
    <p>Ipinag-uutos sa iyo na personal na humarap sa akin o sa kinatawan ng Lupon sa <strong>Barangay Hall ng Bustrac</strong> sa petsang <strong>${formattedDate}</strong> sa oras na <strong>${currentCase?.summonTime || 'TBA'}</strong>.</p>
    <p>Ang pagharap mo ay upang pag-usapan at pag-ayusin ang nabanggit na reklamo sa pamamagitan ng amicable settlement. Ang iyong hindi pagharap sa itinakdang petsa ay maaaring maging dahilan upang mawalan ka ng karapatang umapela o maghain ng kontra-reklamo, at maaaring magresulta sa pag-isyu ng <em>Certificate to File Action (CFA)</em> ayon sa Katarungang Pambarangay Law (RA 7160).</p>
  </div>

  <div class="footer">
    <div class="sig-box">
      <p style="margin-bottom: 60px;">Tinanggap ni Respondent:</p>
      <div class="sig-line">Lagda sa Itaas ng Pangalan</div>
      <p style="font-size: 10pt; margin-top: 5px;">Petsa ng Pagtanggap: ____________</p>
    </div>
    <div class="sig-box">
      <p style="margin-bottom: 60px;">Inisyu ni:</p>
      <div class="sig-line">HON. BARANGAY CAPTAIN</div>
      <p style="font-size: 10pt; margin-top: 5px;">Punong Barangay / Lupon Chairman</p>
    </div>
  </div>

  <div class="kp-form-note">
    * Ito ay opisyal na dokumento ng Barangay Bustrac. Ang pagpapanggap o pagpapalit ng nilalaman nito ay may parusang ipinagbabawal ng batas.
  </div>

  <button class="no-print" onclick="window.print()" style="margin-top: 40px; padding: 12px 24px; width: 100%; font-size: 16px; font-weight: bold; cursor: pointer; background: #2563eb; color: white; border: none; border-radius: 6px;">
    🖨️ I-Print ang Summons Form
  </button>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 500);
    };
  </script>
</body>
</html>
`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handlePrintCFAForm = (caseData) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print the CFA.');
  
  printWindow.document.title = `Certificate to File Action - ${caseData?.trackingNo || 'N/A'}`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Certificate to File Action - ${caseData?.trackingNo || 'N/A'}</title>
      <style>
        body { font-family: 'Times New Roman', serif; padding: 40px; color: #000; max-width: 800px; margin: 0 auto; }
        .logos { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .logos img { height: 70px; width: auto; }
        .header { text-align: center; margin-bottom: 20px; line-height: 1.3; border-bottom: 2px solid #000; padding-bottom: 15px; }
        .header h3 { margin: 0; text-transform: uppercase; font-size: 16pt; font-weight: bold; }
        .title { text-align: center; font-weight: bold; font-size: 16pt; margin: 30px 0; text-decoration: underline; }
        .body-text { font-size: 12pt; line-height: 1.8; text-align: justify; margin-bottom: 40px; }
        .case-info { margin: 20px 0; padding: 15px; border: 1px solid #000; font-size: 11pt; background: #f9f9f9; }
        .footer { margin-top: 80px; display: flex; justify-content: space-between; }
        .sig-box { text-align: center; width: 250px; }
        .sig-line { border-top: 1px solid #000; margin-top: 50px; font-weight: bold; padding-top: 5px; }
        @media print { body { padding: 20px; } .no-print { display: none !important; } }
      </style>
    </head>
    <body>
      <div class="logos">
        <img src="${bustracLogo}" alt="Bustrac Logo" style="height: 70px; width: auto;" />
        <img src="${nabuaLogo}" alt="Nabua Logo" style="height: 70px; width: auto;" />
      </div>
      <div class="header">
        <h4>Republic of the Philippines</h4>
        <h4>Province of Camarines Sur • Municipality of Nabua</h4>
        <h3>BARANGAY BUSTRAC</h3>
        <h4>OFFICE OF THE LUPON TAGAPAMAYAPA</h4>
      </div>
      <div class="title">CERTIFICATE TO FILE ACTION (CFA)</div>
      <div class="case-info">
        <p><strong>KP Case No:</strong> ${caseData?.trackingNo || 'N/A'}</p>
        <p><strong>Complainant:</strong> ${caseData?.complainantName || caseData?.complainant || 'N/A'}</p>
        <p><strong>Respondent:</strong> ${caseData?.respondentName || caseData?.respondent || 'N/A'}</p>
        <p><strong>Nature of Complaint:</strong> ${caseData?.incidentType || 'N/A'}</p>
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
      <button class="no-print" onclick="window.print()" style="margin-top: 40px; padding: 12px 24px; width: 100%; font-size: 16px; font-weight: bold; cursor: pointer; background: #dc2626; color: white; border: none; border-radius: 6px;"> 🖨️ I-Print ang CFA </button>
      <script>
        window.onload = function() { setTimeout(function() { window.print(); }, 500); };
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

    // ✅ Double-check weekend guard bago mag-send (defensive)
    const selectedDate = new Date(`${summonsDate}T00:00:00`);
    const dow = selectedDate.getDay();
    if (dow === 0 || dow === 6) {
      alert("⚠️ Ang Barangay Hall ay sarado tuwing Sabado at Linggo. Mangyaring pumili ng Lunes hanggang Biyernes.");
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
          style={{ width: '100%', padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontSize: '12px' }}
        >
          🖨️ Print Official Summons (KP Form)
        </button>
      </div>
    </div>
  );
}