import { useState } from 'react';
import { getBlotterStepProgress, formatLocationDisplay } from '../../utils/residentUtils';

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
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateForm = (field) => (e) => {
    setBlotterForm((p) => ({ ...p, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!blotterForm.subject.trim() || !blotterForm.details.trim()) {
      alert('Please fill in all required fields.');
      return;
    }
    setIsSubmitting(true);
    try {
      await submitBlotter({
        subject: blotterForm.subject.trim(),
        details: blotterForm.details.trim(),
        incidentDate: blotterForm.incidentDate,
        location: blotterForm.location.trim(),
        respondent: blotterForm.respondent.trim(),
        complainant: loggedInUser?.fullName || loggedInUser?.name || 'Resident',
        residentId: loggedInUser?.residentId || loggedInUser?.id || loggedInUser?._id || '',
      });
      setBlotterForm({ subject: '', details: '', incidentDate: '', location: '', respondent: '' });
    } catch (err) {
      console.error('Blotter submit error:', err);
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

      {/* Submit Form */}
      <div className="card" style={{ padding: 18, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary, #3b82f6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Submit Incident Report
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            Report an incident or official concern to Barangay Bustrac. Your entry will be securely recorded and reviewed by authorized personnel.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
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
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="fg" style={{ margin: 0, minWidth: 0 }}>
              <label className="fl" htmlFor="blotter-date">Incident Date</label>
              <input
                id="blotter-date"
                type="date"
                className="fc"
                style={{ width: '100%' }}
                value={blotterForm.incidentDate}
                onChange={updateForm('incidentDate')}
              />
            </div>
            <div className="fg" style={{ margin: 0, minWidth: 0 }}>
              <label className="fl" htmlFor="blotter-location">Location / Zone</label>
              <input
                id="blotter-location"
                type="text"
                className="fc"
                placeholder="e.g. Purok 3"
                style={{ width: '100%' }}
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
              style={{ width: '100%' }}
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
              style={{ width: '100%', resize: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{(blotterForm.details || '').length}/500</span>
            </div>
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
        <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" style={{ marginBottom: 10, opacity: 0.5 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>No blotter records on file</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Your filed complaint histories will display here.</div>
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
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: 'var(--surface2, rgba(255,255,255,0.05))',
                    color: (item.synced === true || item.isSynced === true) ? '#10b981' : '#f59e0b',
                    border: `1px solid ${(item.synced === true || item.isSynced === true) ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                  }}>
                    {(item.synced === true || item.isSynced === true) ? 'Synced' : 'Local Log'}
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
