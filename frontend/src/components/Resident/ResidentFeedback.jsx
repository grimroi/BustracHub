import { useState } from 'react';
import Swal from 'sweetalert2';
import { getFeedbackStep, formatResidentDate } from '../../utils/residentUtils';

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

const feedbackSteps = ['Submitted', 'Under Review', 'Responded', 'Resolved'];

export default function ResidentFeedback({
  myFeedbacks,
  submitFeedback,
  loggedInUser,
}) {
  const [feedbackType, setFeedbackType] = useState('Complaint');
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [expandedFeedbackId, setExpandedFeedbackId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleFeedback = (id) => {
    setExpandedFeedbackId((prev) => (prev === id ? null : id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackSubject.trim() || !feedbackMessage.trim()) {
    showToast('error', 'Please fill in all required fields.');
      return;
    }
    setIsSubmitting(true);
    try {
      await submitFeedback({
        feedbackType,
        subject: feedbackSubject.trim(),
        message: feedbackMessage.trim(),
        residentId: loggedInUser?.residentId || loggedInUser?.id || loggedInUser?._id || 'RES-LOCAL',
        residentName: loggedInUser?.fullName || loggedInUser?.name || 'Resident',
        username: loggedInUser?.username || loggedInUser?.email || 'resident',
      });
      setFeedbackSubject('');
      setFeedbackMessage('');
      setFeedbackType('Complaint');
    } catch (err) {
      console.error('Feedback submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeOptions = [
    {
      type: 'Complaint',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    {
      type: 'Suggestion',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
        </svg>
      ),
    },
    {
      type: 'Inquiry',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
  ];

  return (
    <div className="screen active" style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
      {/* Page Header */}
      <div className="page-hdr" style={{ marginBottom: 16 }}>
        <div className="page-title">Feedback & Concerns</div>
        <div className="page-sub">Submit and track your barangay concerns</div>
      </div>

      {/* Form Card */}
      <div className="card" style={{ padding: 18, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>New Concern</div>

        {/* Type Selection */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Select Concern Type
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {typeOptions.map(({ type, icon }) => {
              const isSelected = feedbackType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFeedbackType(type)}
                  aria-pressed={isSelected}
                  style={{
                    minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    padding: '6px 2px', borderRadius: 8,
                    border: isSelected ? '1px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
                    background: isSelected ? 'var(--primary-light)' : 'var(--surface2)',
                    color: isSelected ? 'var(--primary, #3b82f6)' : 'var(--muted)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{type}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="fg" style={{ marginBottom: 12 }}>
            <label className="fl" htmlFor="feedback-subject">Subject</label>
            <input
              id="feedback-subject"
              className="fc"
              type="text"
              placeholder="Brief description of your concern"
              value={feedbackSubject}
              onChange={(e) => setFeedbackSubject(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>
          <div className="fg" style={{ marginBottom: 14 }}>
            <label className="fl" htmlFor="feedback-message">Message</label>
            <textarea
              id="feedback-message"
              className="fc"
              rows={3}
              placeholder="Describe your concern in detail..."
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              required
              style={{ width: '100%', resize: 'none' }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>
              Your concern is securely linked to your account and will be reviewed within{" "}
              <strong style={{ color: 'var(--text)' }}>3 working days</strong>.
            </span>
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isSubmitting}
            style={{ width: '100%', padding: '12px', borderRadius: 10, fontWeight: 700, opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Concern'}
          </button>
        </form>
      </div>

      {/* Submissions List */}
      <div style={{
        fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
        marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>My Submissions</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {myFeedbacks?.length || 0} Total
        </span>
      </div>

      {!myFeedbacks || myFeedbacks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>You have not submitted any feedback or concerns yet.</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {myFeedbacks.map((item, idx, arr) => {
            const docId = item._id || item.id;
            const isExpanded = expandedFeedbackId === docId;
            const fbStep = getFeedbackStep(item.status);
            const isResolved = item.status === 'Resolved' || item.status === 'Resolved & Closed';
            const isReview = item.status === 'Under Review';
            const isResponded = item.status === 'Responded';
            const statusColor = isResolved ? 'var(--green)' : isReview ? 'var(--primary)' : isResponded ? 'var(--amber)' : 'var(--muted)';
            const statusBg = isResolved ? 'var(--green-bg)' : isReview ? 'var(--primary-light)' : isResponded ? 'var(--amber-bg)' : 'var(--surface2)';
            const statusBorder = isResolved ? 'var(--green-border)' : isReview ? 'var(--primary-light)' : isResponded ? 'var(--amber-border)' : 'var(--border)';

            return (
              <div key={docId} style={{ padding: '14px 16px', borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--primary, #3b82f6)', fontWeight: 700 }}>
                    {item.refNumber || `FB-${String(docId).slice(-5)}`}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
                    padding: '2px 8px', borderRadius: 6, color: statusColor, background: statusBg, border: `1px solid ${statusBorder}`,
                  }}>
                    {item.status || 'Pending'}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{item.subject}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                  {item.feedbackType || item.type || 'General'} · {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Just now'}
                </div>
                <button
                  type="button"
                  onClick={() => toggleFeedback(docId)}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary, #3b82f6)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? 'Hide Details ▲' : 'View Details ▼'}
                </button>

                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    {/* Progress Steps */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                      {feedbackSteps.map((label, index) => {
                        const value = index + 1;
                        const done = fbStep > value;
                        const active = fbStep === value;
                        return (
                          <div key={label} style={{ textAlign: 'center', flex: 1 }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: done || active ? 'var(--primary, #3b82f6)' : 'var(--surface2, rgba(255,255,255,0.05))',
                              color: done || active ? '#ffffff' : 'var(--muted)', fontSize: 10, fontWeight: 800,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px',
                              border: active ? '2px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
                            }}>
                              {done ? '✓' : value}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: active ? 'var(--text)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              {label}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Details */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Details</div>
                      <div style={{
                        fontSize: 13, color: 'var(--text)', lineHeight: 1.5,
                        background: 'var(--surface2, rgba(255,255,255,0.02))', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                      }}>
                        {item.details || item.message || item.content}
                      </div>
                    </div>

                    {/* Response */}
                    {item.response && (
                      <div style={{ padding: 12, background: 'var(--green-bg)', borderRadius: 8, border: '1px solid var(--green-border)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>
                          Response from {item.handledBy || 'Barangay Staff'}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{item.response}</div>
                        {item.dateResolved && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>Resolved {item.dateResolved}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
