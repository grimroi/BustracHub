import { useMemo } from 'react';
import { getStepFromStatus } from '../../utils/residentUtils';

const certSteps = ['Submitted', 'Review', 'Approved', 'Ready', 'Issued'];

export default function ResidentCertificates({
  loggedInUser,
  myRequests,
  showCertForm,
  setShowCertForm,
  certForm,
  updateCertField,
  submitCert,
  certSuccess,
  setCertSuccess,
  filterTab,
  setFilterTab,
  handleCancelRequest,
}) {
  const filteredRequests = useMemo(() => {
    return myRequests.filter((req) => {
      const isIssued = req.status === 'Issued' || Number(req.step || 1) >= 5;
      if (filterTab === 'pending') return !isIssued;
      if (filterTab === 'issued') return isIssued;
      return true;
    });
  }, [myRequests, filterTab]);

  const pendingRequestCount = useMemo(() => {
    return myRequests.filter((r) => {
      const status = r.status || 'Pending';
      const step = Number(r.step || 1);
      return status !== 'Issued' && step < 5;
    }).length;
  }, [myRequests]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await submitCert(e);
    if (success) {
      setShowCertForm(false);
    }
  };

  return (
    <div
      className="screen active"
      style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}
    >
      {/* Page Header */}
      <div className="page-hdr" style={{ marginBottom: 16 }}>
        <div className="page-title">My Certificates</div>
        <div className="page-sub">Request and track your barangay certificates</div>
      </div>

      {/* Request Button */}
      {!showCertForm && (
        <button
          className="btn btn-primary btn-full"
          style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => setShowCertForm(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Request a Certificate</span>
        </button>
      )}

      {/* Certificate Form */}
      {showCertForm && (
        <div className="card" style={{ padding: 18, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              New Certificate Application
            </div>
            <button
              type="button"
              onClick={() => setShowCertForm(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}
              aria-label="Close form"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Applicant Details */}
            <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>APPLICANT DETAILS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 12 }}>
                <div><span style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>Name</span><strong style={{ color: 'var(--text)' }}>{loggedInUser?.fullName || 'N/A'}</strong></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>Purok / Zone</span><strong style={{ color: 'var(--text)' }}>{loggedInUser?.purok || 'N/A'}</strong></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>Birthdate & Age</span><strong style={{ color: 'var(--text)' }}>{loggedInUser?.birthdate || 'N/A'} {loggedInUser?.age ? `(${loggedInUser.age} y/o)` : ''}</strong></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>Contact</span><strong style={{ color: 'var(--text)' }}>{loggedInUser?.contact || 'N/A'}</strong></div>
              </div>
            </div>

            {/* Certificate Type */}
            <div className="fg" style={{ marginBottom: 12 }}>
              <label className="fl">Certificate Type *</label>
              <select className="fc" value={certForm.certType} onChange={updateCertField('certType')} required>
                <option value="">-- Select Certificate Type --</option>
                <option value="Barangay Clearance">Barangay Clearance</option>
                <option value="Certificate of Indigency">Certificate of Indigency</option>
                <option value="Certificate of Residency">Certificate of Residency</option>
                <option value="Barangay Business Clearance">Barangay Business Clearance</option>
              </select>
            </div>

            {/* Purpose */}
            <div className="fg" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="fl" style={{ margin: 0 }}>Purpose of Request *</label>
                <span style={{ fontSize: 10, color: (certForm.certPurpose?.length || 0) > 200 ? 'var(--red)' : 'var(--muted)' }}>
                  {certForm.certPurpose?.length || 0} / 200
                </span>
              </div>
              <textarea
                className="fc"
                rows="3"
                maxLength={200}
                placeholder="e.g. For employment requirements at DOLE-Camarines Sur..."
                value={certForm.certPurpose}
                onChange={updateCertField('certPurpose')}
                required
                style={{ resize: 'none' }}
              />
            </div>

            <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface2)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 16 }}>
              Requests are routed directly to the Barangay Captain's desk for validation.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Request</button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCertForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Success Notice */}
      {certSuccess && (
        <div className="notice notice-success" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div>
            <strong style={{ display: 'block', marginBottom: 2, fontSize: 14 }}>Request Filed Successfully!</strong>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              Tracking Reference:{" "}
              <code style={{ background: 'var(--surface)', color: 'var(--green)', padding: '2px 6px', borderRadius: 4, fontWeight: 'bold', border: '1px solid var(--border)' }}>
                {certSuccess.refNumber}
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span>My Requests</span>
        <span className="badge b-blue" style={{ fontSize: 10 }}>{myRequests.length} Total</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['all', 'pending', 'issued'].map((tab) => (
          <button
            key={tab}
            className={`btn ${filterTab === tab ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, textTransform: 'capitalize' }}
            onClick={() => setFilterTab(tab)}
          >
            {tab === 'all' ? `All (${myRequests.length})` : tab}
          </button>
        ))}
      </div>

      {/* Request Cards */}
      {filteredRequests.length ? (
        filteredRequests.map((request) => {
          const stepCount = Number(request.step || 1);
          const statusLabel = request.status || 'Pending';
          const isIssued = statusLabel === 'Issued' || stepCount >= 5;
          const isReady = statusLabel === 'Ready' || stepCount === 4;
          const isApproved = statusLabel === 'Approved' || stepCount >= 3;
          const refNumber = request.refNumber || `CERT-${(request._id || '').slice(-6).toUpperCase()}`;
          const submittedDate = request.timestamp
            ? new Date(request.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Recently added';

          const getStatusLogText = () => {
            if (isIssued) return 'Document Released / Completed';
            if (isReady) return 'Document Ready for Pick-up at Barangay Hall';
            if (isApproved) return 'Approved — Preparing Certificate Document';
            if (stepCount === 2) return 'Under Administrative Review';
            return 'Awaiting Captain / Admin Validation';
          };

          return (
            <div className="card" key={request._id} style={{ padding: 18, marginBottom: 14, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4, lineHeight: '1.3', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {request.certType}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: request.certPurpose ? 'normal' : 'italic', lineHeight: '1.4', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {request.certPurpose || 'No purpose specification declaration'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <span className={`badge ${isIssued ? 'b-green' : isReady ? 'b-blue' : 'b-amber'}`} style={{ textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.3px', padding: '3px 8px' }}>
                    {isIssued ? 'Issued' : isReady ? 'Ready' : 'Pending'}
                  </span>
                  {!isIssued && stepCount === 1 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--red)', padding: '2px 6px', fontSize: 11, height: 'auto' }}
                      onClick={() => {
                        if (window.confirm('Are you sure you want to cancel this certificate request?')) {
                          handleCancelRequest(request._id);
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'var(--surface2)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 16, border: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ color: 'var(--muted)' }}>Ref: </span>
                  <code style={{ color: 'var(--text)', fontWeight: 700 }}>{refNumber}</code>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--muted)' }}>Filed: </span>
                  <strong style={{ color: 'var(--text)' }}>{submittedDate}</strong>
                </div>
              </div>

              {/* Progress Steps */}
              <div className="steps" style={{ marginBottom: 6 }}>
                {certSteps.map((label, idx) => {
                  const value = idx + 1;
                  const done = isIssued ? true : stepCount > value;
                  const active = !isIssued && stepCount === value;
                  return (
                    <div key={label} className={`step${done ? ' done' : active ? ' active' : ' pending'}`}>
                      <div className="step-circle">
                        {done ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          value
                        )}
                      </div>
                      <div className="step-label">{label}</div>
                      {idx < certSteps.length - 1 && <div className="step-line" />}
                    </div>
                  );
                })}
              </div>

              {/* Status Log */}
              <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: isIssued ? 'var(--green)' : isReady ? 'var(--blue)' : 'var(--amber)' }} />
                  Status Log
                </span>
                <span style={{ fontWeight: 600, color: isIssued ? 'var(--green)' : isReady ? 'var(--primary)' : 'var(--muted)' }}>
                  {getStatusLogText()}
                </span>
              </div>
            </div>
          );
        })
      ) : (
        /* Empty State */
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px', border: '2px dashed var(--border)', background: 'transparent', borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>No certificate requests yet.</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 16 }}>
            Your local logs are clear. You can request clearances and tracking histories anytime.
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setShowCertForm(true)}>Submit First Request</button>
        </div>
      )}
    </div>
  );
}
