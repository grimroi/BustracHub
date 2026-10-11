import { useState } from 'react';
import Swal from 'sweetalert2';
import { getBlotterStepProgress, formatLocationDisplay } from '../../utils/residentUtils';
import { validateBlotterForm } from '../../utils/blotterSubmitGuard';



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

const blotterSteps = ['Filed', 'Investigation', 'Mediation / Summons', 'Resolved'];

export default function ResidentBlotter({
  myBlotters,
  loggedInUser,
  submitBlotter,
  handleOpenEdit,
}) {
  const [blotterForm, setBlotterForm] = useState({
    subject: '',
    details: '',
    incidentDate: '',
    location: '',
    respondent: '',
    attachments: [], 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(!myBlotters || myBlotters.length === 0);

  const updateForm = (field) => (e) => {
    setBlotterForm((p) => ({ ...p, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
  e.preventDefault();

  const validation = validateBlotterForm(blotterForm);
  if (!validation.valid) {
    showToast('error', validation.message);
    return;
  }

  setIsSubmitting(true);
  try {
    const result = await submitBlotter({
      subject: blotterForm.subject.trim(),
      details: blotterForm.details.trim(),
      incidentDate: blotterForm.incidentDate || new Date().toISOString().split('T')[0],
      location: blotterForm.location?.trim() || 'Unknown Location',
      respondent: blotterForm.respondent?.trim() || 'Under Investigation',
      attachments: blotterForm.attachments || [],
    });

    // ✅ Kung na-block ng anti-spam/oversize, huwag mag-show ng success
    // (parent na ang nag-show ng warning Swal)
    if (result?.success === false) {
      return;
    }

    // ✅ Success — reset form at mag-show ng success message
    setBlotterForm({
      subject: '', details: '', incidentDate: '', location: '', respondent: '', attachments: [],
    });
    setIsFormOpen(false);

    // ✅ WALANG loadData() — parent's 7d PouchDB listener na ang bahala
  } catch (err) {
    console.error('Blotter submit error:', err);
    showToast('error', `Failed to submit report: ${err.message || 'Unknown error'}`);
  } finally {
    setIsSubmitting(false);
  }
};

  return (
    <div className="screen active" style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
      {/* Page Header */}
      <div className="page-hdr" style={{ marginBottom: 16 }}>
        <div className="page-title">Blotter Reports</div>
        <div className="page-sub">File incidents and track complaint status</div>
      </div>

      {/* Submit Form (Collapsible) */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        
        {/* Collapsible Header */}
        <div 
          style={{ 
            padding: '14px 18px', 
            background: isFormOpen ? 'var(--surface2, rgba(255,255,255,0.03))' : 'transparent', 
            borderBottom: isFormOpen ? '1px solid var(--border)' : 'none', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            cursor: 'pointer', 
            transition: 'all 0.2s ease',
            userSelect: 'none'
          }} 
          onClick={() => setIsFormOpen(!isFormOpen)}
          role="button"
          aria-expanded={isFormOpen}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Minimal Left Border Accent */}
            <div style={{ width: 4, height: 16, background: 'var(--primary, #3b82f6)', borderRadius: 2 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {isFormOpen ? 'Hide Report Form' : 'File New Incident Report'}
            </div>
          </div>
          {/* Clean Unicode Arrow */}
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, transition: 'transform 0.2s', transform: isFormOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </div>

        {/* Form Body (Conditionally Rendered) */}
        {isFormOpen && (
          <form onSubmit={handleSubmit} style={{ padding: 18 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Report an incident or official concern. Your entry will be securely recorded and reviewed by authorized personnel.
            </p>
            
            <div className="fg" style={{ marginBottom: 12 }}>
              <label className="fl" htmlFor="blotter-subject">Incident Subject / Title *</label>
              <input 
                id="blotter-subject" 
                type="text" 
                className="fc" 
                placeholder="e.g. Property Dispute, Noise Complaint" 
                required 
                value={blotterForm.subject} 
                onChange={updateForm('subject')} 
              />
            </div>

            <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                  marginBottom: 12
                }}
              >
                <div className="fg" style={{ margin: 0 }}>
                <label className="fl" htmlFor="blotter-date">
                  Incident Date <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  id="blotter-date"
                  type="date"
                  className="fc"
                  required
                  value={blotterForm.incidentDate}
                  onChange={updateForm('incidentDate')}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="fg" style={{ margin: 0 }}>
                <label className="fl" htmlFor="blotter-location">
                  Location / Zone
                </label>
                <input
                  id="blotter-location"
                  type="text"
                  className="fc"
                  placeholder="e.g. Purok 3, Main Street"
                  value={blotterForm.location}
                  onChange={updateForm('location')}
                />
              </div>
              </div>

            <div className="fg" style={{ marginBottom: 12 }}>
              <label className="fl" htmlFor="blotter-respondent">Respondent (if known)</label>
              <input 
                id="blotter-respondent" 
                type="text" 
                className="fc" 
                placeholder="Name of person involved" 
                value={blotterForm.respondent} 
                onChange={updateForm('respondent')} 
              />
            </div>

            <div className="fg" style={{ marginBottom: 6 }}>
              <label className="fl" htmlFor="blotter-details">Incident Details *</label>
              <textarea 
                id="blotter-details" 
                className="fc" 
                rows="4" 
                placeholder="State details, persons involved, or immediate context..." 
                required 
                maxLength={500} 
                value={blotterForm.details} 
                onChange={updateForm('details')} 
                style={{ resize: 'vertical' }} 
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <span style={{ 
                  fontSize: 10, 
                  fontWeight: 600, 
                  color: (blotterForm.details || '').length >= 450 ? 'var(--red, #ef4444)' : 'var(--muted)' 
                }}>
                  {(blotterForm.details || '').length}/500
                </span>
              </div>
            </div>

            {/* Evidence Upload Section */}
            <div className="fg" style={{ marginBottom: '16px' }}>
              <label className="fl">Evidence Attachments (Optional)</label>

              <input 
                type="file" 
                id="resident-blotter-evidence" 
                multiple 
                accept="image/*, video/*, application/pdf" 
                style={{ display: 'none' }} 
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  const MAX_SIZE_MB = 5;
                  const processedFiles = [];
                  for (const file of files) {
                    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
                     showToast('error', `Masyadong malaki ang file na "${file.name}". Ang limit ay ${MAX_SIZE_MB}MB lamang bawat file.`);
                      continue;
                    }
                    const base64Data = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.readAsDataURL(file);
                      reader.onload = () => resolve(reader.result);
                      reader.onerror = (error) => reject(error);
                    });
                    processedFiles.push({
                      id: 'EVID-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
                      name: file.name,
                      size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
                      type: file.type,
                      data: base64Data,
                    });
                  }
                  setBlotterForm((prev) => ({ ...prev, attachments: [...(prev.attachments || []), ...processedFiles] }));
                  e.target.value = ''; // Reset input
                }} 
              />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-g btn-sm"
                  onClick={() => document.getElementById('resident-blotter-evidence').click()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                    minHeight: '44px',
                    textAlign: 'center'
                  }}
                >
                  📎 Attach Photo / Video / PDF
                </button>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--muted)',
                  textAlign: 'center',
                  lineHeight: 1.4
                }}>
                  Max 5MB per file · 8MB total
                </div>
                {blotterForm.attachments?.length > 0 && (
    <button type="button" onClick={() => setBlotterForm(p => ({ ...p, attachments: [] }))}
      style={{ flex: '0 1 auto', minHeight: '44px' }}>
      🗑️ Clear All
    </button>
  )}
              </div>

              {/* Display Attached Files List */}
              {blotterForm.attachments && blotterForm.attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                  {blotterForm.attachments.map((att) => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                        <span style={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {att.name}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>({att.size})</span>
                      </div>
                      <button 
                        type="button" 
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 4px', fontSize: '14px', flexShrink: 0 }} 
                        onClick={() => {
                          setBlotterForm((prev) => ({ ...prev, attachments: prev.attachments.filter((item) => item.id !== att.id) }));
                        }} 
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button 
              type="submit" 
              className="btn btn-primary btn-full" 
              disabled={isSubmitting} 
              style={{ width: '100%', marginTop: 8, padding: '12px', borderRadius: 10, fontWeight: 700, opacity: isSubmitting ? 0.6 : 1 }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Incident Report'}
            </button>
          </form>
        )}
      </div>

      {/* My Submitted Reports */}
      <div style={{
        fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
        marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>My Submitted Reports</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {myBlotters?.length || 0} Total
        </span>
      </div>

      {!myBlotters || myBlotters.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '48px 16px', 
            background: 'var(--surface)', 
            border: '2px dashed var(--border)', 
            borderRadius: 14 
          }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.6 }}>📂</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
              No blotter records on file
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', maxWidth: '280px', margin: '0 auto', lineHeight: 1.5 }}>
              Your filed complaint histories and status updates will display here securely.
            </div>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {myBlotters.map((item) => {
            const blotterStep = getBlotterStepProgress(item.status);
            const currentUserName = String(loggedInUser?.fullName || '').toLowerCase().trim();
            const complainantName = String(item.complainant || item.complainantName || '').toLowerCase().trim();
            const isMyReport = currentUserName && complainantName === currentUserName;
            const canEdit = isMyReport && ['pending', 'needs revision', 'returned'].includes((item.status || '').toLowerCase());
            const isResolved = item.status?.toLowerCase().includes('settled') || item.status?.toLowerCase().includes('resolved');
            const isMediation = item.status?.toLowerCase().includes('summon') || item.status?.toLowerCase().includes('mediation');
            const isInvestigation = item.status?.toLowerCase().includes('investigation');
            const displayRefNumber = item.trackingNo || item.caseNo || item.refNumber || item._id || 'N/A';
            const displayTitle = item.subject || item.incidentType || item.title || 'Incident Complaint';
            const historyList = Array.isArray(item.history) ? item.history : [];
            const latestHistory = historyList.length > 0 ? historyList[historyList.length - 1] : null;

            return (
              <div className="resident-card" key={item._id || displayRefNumber} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16,
              }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{displayTitle}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Ref:{" "}
                      <code style={{ color: 'var(--text)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{displayRefNumber}</code>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '2px 8px', borderRadius: 6,
                    color: isResolved ? '#10b981' : isMediation ? '#a855f7' : isInvestigation ? '#3b82f6' : 'var(--muted)',
                    background: isResolved ? 'rgba(16, 185, 129, 0.15)' : isMediation ? 'rgba(168, 85, 247, 0.15)' : isInvestigation ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface2, rgba(255,255,255,0.05))',
                    border: `1px solid ${isResolved ? 'rgba(16, 185, 129, 0.3)' : isMediation ? 'rgba(168, 85, 247, 0.3)' : isInvestigation ? 'rgba(59, 130, 246, 0.3)' : 'var(--border)'}`,
                  }}>
                    {item.status || 'Pending'}
                  </span>
                </div>

                {/* Location */}
                {(item.location || item.purok) && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    Location:{" "}
                    <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{formatLocationDisplay(item)}</strong>
                  </div>
                )}

                {/* Details Preview */}
                <div style={{
                  fontSize: 12, color: 'var(--text)', lineHeight: 1.5, background: 'var(--surface2, rgba(255,255,255,0.03))',
                  padding: '10px 12px', borderRadius: 8, marginBottom: 12, border: '1px solid var(--border)',
                }}>
                  {item.details || item.narrative || item.description || 'No additional details provided.'}
                </div>

                {/* Progress Steps */}
                <div className="steps" style={{ marginBottom: 12 }}>
                  {blotterSteps.map((label, idx) => {
                    const value = idx + 1;
                    const done = blotterStep >= 4 ? value <= blotterStep : blotterStep > value;
                    const active = blotterStep < 4 && blotterStep === value;
                    return (
                      <div key={label} className={`step${done ? ' done' : active ? ' active' : ' pending'}`}>
                        <div className="step-circle">{done ? '✓' : value}</div>
                        <div className="step-label">{label}</div>
                        {idx < 3 && <div className="step-line" />}
                      </div>
                    );
                  })}
                </div>

                {/* Hearing Schedule */}
                {(item.nextHearingDate) && (
                  <div style={{
                    background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--primary, #3b82f6)',
                    padding: '10px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12,
                  }}>
                    📅 <strong>Patawag / Hearing Schedule:</strong>{" "}
                    <span style={{ color: 'var(--primary, #3b82f6)', fontWeight: 700 }}>
                      {new Date(item.nextHearingDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                )}

                {/* Remarks */}
                {latestHistory?.notes && (
                  <div style={{
                    background: 'var(--surface2, rgba(255,255,255,0.03))', border: '1px solid var(--border)',
                    padding: '10px 12px', borderRadius: 8, marginBottom: 10, fontSize: 11, color: 'var(--text)',
                  }}>
                    💬 <strong>Barangay Remarks:</strong> "{latestHistory.notes}"
                  </div>
                )}

                {/* Edit Button */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(item)}
                    className="btn btn-outline"
                    style={{ width: '100%', marginBottom: 10, padding: '8px', fontSize: 12, fontWeight: 700 }}
                  >
                    Edit Report Details
                  </button>
                )}

                {/* Footer */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11,
                  color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10,
                }}>
                  <span>
                    Incident Date:{" "}
                    <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.incidentDate || item.dateFiled || 'N/A'}</strong>
                  </span>
                  <span style={{ 
                    fontSize: 9, 
                    fontWeight: 700, 
                    padding: '2px 6px', 
                    borderRadius: 4, 
                    background: (item.synced || item.isSynced) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', 
                    color: (item.synced || item.isSynced) ? '#10b981' : '#f59e0b', 
                    border: `1px solid ${(item.synced || item.isSynced) ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {(item.synced || item.isSynced) ? '✓ Synced' : '⏳ Local Log'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
