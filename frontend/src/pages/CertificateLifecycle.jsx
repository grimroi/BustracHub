import React, { useCallback, useEffect, useState } from 'react';
import PouchDB from 'pouchdb-browser';

const db = new PouchDB('bustrac_db');
const REMOTE_URL = 'http://admin:capstone2026@localhost:5984/bustrachub_db';

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  certificateType: '',
  purpose: '',
  residentId: '',
  rbiId: '',
  purok: '',
  ctc: {
    name: '',
    number: '',
    amountPaid: '',
    dateIssued: '',
    placeIssued: ''
  }
};

const formatStamp = () => {
  const now = new Date();
  return now.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function CertificateLifecycle() {
  const [allRequests, setAllRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [requestForm, setRequestForm] = useState(INITIAL_FORM);
  const [remarksById, setRemarksById] = useState({});
  const [loading, setLoading] = useState(true);

  const visibleRequests = allRequests.filter((req) => Number(req.step) !== 4);

  const loadRequests = useCallback(async () => {
    try {
      const result = await db.allDocs({ include_docs: true, attachments: false });
      const requests = result.rows
        .map((row) => row.doc)
        .filter((doc) => doc && doc.type === 'certificate_request')
        .filter((doc) => Number(doc.step) !== 5)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      setAllRequests(requests);
    } catch (error) {
      console.error('Unable to load certificate requests', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const changes = db.changes({ live: true, include_docs: true });
    const sync = db.sync(REMOTE_URL, { live: true, retry: true });

    changes.on('change', (change) => {
      if (!change.doc || change.doc.type !== 'certificate_request') {
        return;
      }

      setAllRequests((prev) => {
        const next = prev.filter((item) => item._id !== change.id);
        if (Number(change.doc.step) === 4) {
          return next;
        }

        const exists = prev.some((item) => item._id === change.id);
        if (!exists) {
          return [change.doc, ...next];
        }

        return prev.map((item) => (item._id === change.id ? change.doc : item));
      });
    });

    changes.on('error', (error) => {
      console.error('Certificate changes feed error', error);
    });

    sync.on('error', (error) => {
      console.error('Certificate sync error', error);
    });

    loadRequests();

    return () => {
      changes.cancel();
      sync.cancel();
    };
  }, [loadRequests]);

const updateRequest = useCallback(async (request, nextStep) => {
  try {
    // Create the updated request object
    const updatedRequest = {
      ...request,
      step: nextStep,
      updatedAt: formatStamp(),
    };

    // If the request reaches Step 4 (Issued),
    // change its status to 'Approved' and add it to issuedCertificates
    if (nextStep === 4) {
  updatedRequest.status = 'Approved';
}

    if (nextStep === 5) {
          updatedRequest.status = 'Issued';
        }

    await db.put(updatedRequest);
  } catch (error) {
    console.error('Unable to update certificate request', error);
  }
}, []);

  const handleRemarksSubmit = useCallback(async (request) => {
    const remarks = remarksById[request._id] ?? request.remarks ?? '';
    try {
      await db.put({
        ...request,
        remarks,
        step: 3,
        updatedAt: formatStamp(),
      });
    } catch (error) {
      console.error('Unable to send request for approval', error);
    }
  }, [remarksById]);

  const handleCreateRequest = async (event) => {
  event.preventDefault();
  if (
    !requestForm.firstName.trim() ||
    !requestForm.lastName.trim() ||
    !requestForm.certificateType ||
    !requestForm.purpose.trim()
  ) {
    return;
  }

  try {
    const generatedId = `CERT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const newRequestPayload = {
      _id: generatedId,
      type: 'certificate_request',
      firstName: requestForm.firstName.trim(),
      lastName: requestForm.lastName.trim(),
      certificateType: requestForm.certificateType,
      purpose: requestForm.purpose.trim(),
      residentId: requestForm.residentId.trim(),
      rbiId: requestForm.rbiId.trim().toUpperCase(),
      purok: requestForm.purok || 'Purok 1',
      status: 'Pending',
      step: 1,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      ctc: {
        name: requestForm.ctc?.name?.trim() || '',
        number: requestForm.ctc?.number?.trim() || '',
        amountPaid: parseFloat(requestForm.ctc?.amountPaid) || 0,
        dateIssued: requestForm.ctc?.dateIssued || '',
        placeIssued: requestForm.ctc?.placeIssued?.trim() || '',
      },
    };

    await db.put(newRequestPayload);

    alert('✓ Certificate request submitted and queued for issuance preview!');
    setRequestForm(INITIAL_FORM);
    setShowModal(false);
  } catch (error) {
    console.error('Unable to save certificate request', error);
    alert('Failed to synchronize transaction with database engine.');
  }
};

  const getStatusBadge = (step) => {
    switch (step) {
      case 2:
        return 'badge a';
      case 3:
        return 'badge b';
      case 4:
        return 'badge g';
      default:
        return 'badge gr';
    }
  };

  const getStatusText = (step) => {
    switch (step) {
      case 2:
        return 'Under Review';
      case 3:
        return 'Awaiting Approval';
      case 4:
        return 'Issued';
      default:
        return 'Submitted';
    }
  };

  return (
    <div className="card certificate-lifecycle-shell">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Add Request
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '16px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div className="card" style={{ flex: '1', minWidth: 0 }}>
          <div className="card-title" style={{ marginBottom: '10px', fontWeight: 700 }}>
             Incoming Requests
          </div>
          <div className="tw" style={{ marginBottom: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Resident Name</th>
                  <th>Details</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="3" className="certificate-empty">Loading certificate requests…</td>
                  </tr>
                ) : allRequests.filter((req) => req.step === 1 || req.step === 2).length === 0 ? (
                  <tr>
                    <td colSpan="3" className="certificate-empty">No incoming requests.</td>
                  </tr>
                ) : (
                  allRequests
                    .filter((req) => req.step === 1 || req.step === 2)
                    .map((req) => {
                      const residentName = `${req.firstName || ''} ${req.lastName || ''}`.trim();
                      const certificateType = req.certificateType || req.certType || '—';
                      const purpose = req.purpose || req.certPurpose || '—';
                      const remarksValue = remarksById[req._id] ?? req.remarks ?? '';

                      return (
                        <tr key={req._id}>
                          <td>
                            <strong>{residentName || 'Unnamed Resident'}</strong>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--text)' }}>{certificateType}</span>
                              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{purpose}</span>
                            </div>
                          </td>
                          <td>
                            <div className="list-item certificate-actions">
                              {req.step === 1 && (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => updateRequest(req, 2)}
                                >
                                  Mark Under Review
                                </button>
                              )}

                              {req.step === 2 && (
                                <>
                                  <textarea
                                    className="fc"
                                    value={remarksValue}
                                    placeholder="Add review remarks..."
                                    onChange={(event) =>
                                      setRemarksById((prev) => ({
                                        ...prev,
                                        [req._id]: event.target.value,
                                      }))
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleRemarksSubmit(req)}
                                  >
                                    Send for Approval
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ flex: '1', minWidth: 0 }}>
          <div className="card-title" style={{ marginBottom: '10px', fontWeight: 700 }}>
             Pending Approvals
          </div>
          <div className="tw" style={{ marginBottom: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Resident Name</th>
                  <th>Details</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="3" className="certificate-empty">Loading certificate requests…</td>
                  </tr>
                ) : allRequests.filter((req) => req.step === 3).length === 0 ? (
                  <tr>
                    <td colSpan="3" className="certificate-empty">No pending approvals.</td>
                  </tr>
                ) : (
                  allRequests
                    .filter((req) => req.step === 3)
                    .map((req) => {
                      const residentName = `${req.firstName || ''} ${req.lastName || ''}`.trim();
                      const certificateType = req.certificateType || req.certType || '—';
                      const purpose = req.purpose || req.certPurpose || '—';
                      const remarksValue = req.remarks || '—';

                      return (
                        <tr key={req._id}>
                          <td>
                            <strong>{residentName || 'Unnamed Resident'}</strong>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--text)' }}>{certificateType}</span>
                              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{purpose}</span>
                              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{remarksValue}</span>
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              style={{ background: '#10b981', color: '#fff' }}
                              onClick={() => updateRequest(req, 4)}
                            >
                              Approve Certificate
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: '20px',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '22px' }}>
            <div className="fp-t"> New Request</div>
            <form onSubmit={handleCreateRequest}>
              <div className="fg">
                <label className="fl">First Name</label>
                <input
                  className="fc"
                  placeholder="e.g. Maria"
                  value={requestForm.firstName}
                  onChange={(event) => setRequestForm((prev) => ({ ...prev, firstName: event.target.value }))}
                />
              </div>
              <div className="fg">
                <label className="fl">Last Name</label>
                <input
                  className="fc"
                  placeholder="e.g. Santos"
                  value={requestForm.lastName}
                  onChange={(event) => setRequestForm((prev) => ({ ...prev, lastName: event.target.value }))}
                />
              </div>
              <div className="fg">
                <label className="fl">Certificate Type</label>
                <select
                  className="fc"
                  value={requestForm.certificateType}
                  onChange={(event) => setRequestForm((prev) => ({ ...prev, certificateType: event.target.value }))}
                >
                  <option value="">-- Select Type --</option>
                  <option>Barangay Clearance</option>
                  <option>Certificate of Indigency</option>
                  <option>Certificate of Residency</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Purpose</label>
                <textarea
                  className="fc"
                  placeholder="State the purpose of this certificate..."
                  value={requestForm.purpose}
                  onChange={(event) => setRequestForm((prev) => ({ ...prev, purpose: event.target.value }))}
                />
              </div>
              <div className="fa">
                <button type="submit" className="btn btn-primary">
                  Submit Request
                </button>
                <button
                  type="button"
                  className="btn btn-g"
                  onClick={() => {
                    setShowModal(false);
                    setRequestForm(INITIAL_FORM);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export  function CertificateIssuancePrint({ issuedCertificates, handlePrintCertificate }) {
  return (
    <div className="card">
      {/* Title and description */}
      <div className="card-title">📄 Issued Certificates</div>

      {issuedCertificates.length === 0 ? (
        <p>No issued certificates yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Resident</th>
              <th>Certificate Type</th>
              <th>Purpose</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {issuedCertificates.map((cert) => (
              <tr key={cert._id}>
                <td>
                  <strong>{cert.firstName} {cert.lastName}</strong>
                </td>
                <td>{cert.certificateType}</td>
                <td>{cert.purpose}</td>
                <td>
                  {/* Place the print button here */}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handlePrintCertificate(cert)}
                  >
                    🖨️ Print & Issue
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}