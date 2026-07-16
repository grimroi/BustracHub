import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PouchDB from 'pouchdb';
import logo from '../assets/logo.png';
import './ResidentUI.css';

const CERT_FORM_INITIAL = {
  firstName: '',
  lastName: '',
  birthdate: '',
  age: '',
  contact: '',
  purok: '',
  email: '',
  certType: '',
  certPurpose: '',
};

const REMOTE_DB_URL = 'http://admin:capstone2026@localhost:5984/bustrachub_db';

export default function ResidentUI() {
  const navigate = useNavigate();
  const db = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new PouchDB('bustrac_db');
  }, []);

  // Which "screen" (tab) is currently visible
  const [activeScreen, setActiveScreen] = useState('s-home');

  // Offline banner
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  // Certificate request form
  const [showCertForm, setShowCertForm] = useState(false);
  const [certForm, setCertForm] = useState(CERT_FORM_INITIAL);
  const [certSuccess, setCertSuccess] = useState(null); // null or { firstName, lastName, certType, refNumber }

  // Local data collections
  const [myRequests, setMyRequests] = useState([]);
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  // Announcements filter chips (visual only, mirrors original markup)
  const [announcementFilter, setAnnouncementFilter] = useState('All');

  // Feedback form
  const [feedbackType, setFeedbackType] = useState('Complaint');
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  // Track online/offline status for the offline notice banner
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!db) return undefined;

    const refreshCollections = async () => {
      try {
        const result = await db.allDocs({ include_docs: true });
        const docs = result.rows
          .map((row) => row.doc)
          .filter(Boolean)
          .filter(
            (doc) =>
              doc.type === 'certificate_request' ||
              doc.type === 'feedback_submission' ||
              doc.type === 'announcement'
          );

        const sortedRequests = docs
          .filter((doc) => doc.type === 'certificate_request')
          .sort(
            (a, b) =>
              new Date(b.timestamp || b.createdAt || 0).getTime() -
              new Date(a.timestamp || a.createdAt || 0).getTime()
          );

        const sortedFeedbacks = docs
          .filter((doc) => doc.type === 'feedback_submission')
          .sort(
            (a, b) =>
              new Date(b.timestamp || b.createdAt || 0).getTime() -
              new Date(a.timestamp || a.createdAt || 0).getTime()
          );

        const sortedAnnouncements = docs
          .filter((doc) => doc.type === 'announcement')
          .sort(
            (a, b) =>
              new Date(b.timestamp || b.createdAt || 0).getTime() -
              new Date(a.timestamp || a.createdAt || 0).getTime()
          );

        setMyRequests(sortedRequests);
        setMyFeedbacks(sortedFeedbacks);
        setAnnouncements(sortedAnnouncements);
      } catch (error) {
        console.error('Unable to load offline data', error);
      }
    };

    refreshCollections();

    const changes = db.changes({ live: true, include_docs: true });
    changes.on('change', () => {
      refreshCollections();
    });
    changes.on('error', (error) => {
      console.error('PouchDB changes error', error);
    });

    const remoteDb = new PouchDB(REMOTE_DB_URL);
    const sync = db.sync(remoteDb, { live: true, retry: true });

    return () => {
      changes.cancel();
      sync.cancel();
    };
  }, [db]);

  const goToTab = useCallback((screenId) => {
    setActiveScreen(screenId);
    window.scrollTo(0, 0);
  }, []);

  const handleLogout = useCallback(() => {
    if (window.confirm('Are you sure you want to leave the resident portal?')) {
      navigate('/');
    }
  }, [navigate]);

  const updateCertField = (field) => (event) => {
    setCertForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const submitCert = useCallback(
    async (event) => {
      event.preventDefault();

      const {
        firstName,
        lastName,
        birthdate,
        age,
        contact,
        purok,
        email,
        certType,
        certPurpose,
      } = certForm;

      const trimmedFirstName = firstName.trim();
      const trimmedLastName = lastName.trim();
      const trimmedContact = contact.trim();
      const trimmedPurok = purok.trim();
      const trimmedEmail = email.trim();
      const trimmedPurpose = certPurpose.trim();

      if (!trimmedFirstName) {
        alert('First name is required.');
        return;
      }
      if (!trimmedLastName) {
        alert('Last name is required.');
        return;
      }
      if (!birthdate) {
        alert('Birthdate is required.');
        return;
      }
      if (!age || age < 1 || age > 120) {
        alert('Please enter a valid age (1-120).');
        return;
      }
      if (!trimmedContact) {
        alert('Contact number is required.');
        return;
      }
      if (!trimmedPurok) {
        alert('Purok/Area is required.');
        return;
      }
      if (!certType) {
        alert('Please select a certificate type.');
        return;
      }
      if (!trimmedPurpose) {
        alert('Please provide the purpose of the certificate.');
        return;
      }
      if (trimmedEmail && !trimmedEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        alert('Please enter a valid email address.');
        return;
      }
      if (!trimmedContact.match(/^\d{10,}$/)) {
        alert('Please enter a valid contact number (at least 10 digits).');
        return;
      }

      if (!db) {
        alert('Local database is unavailable.');
        return;
      }

      const certRequest = {
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        birthdate,
        age,
        contact: trimmedContact,
        purok: trimmedPurok,
        email: trimmedEmail,
        certType,
        certPurpose: trimmedPurpose,
        dateSubmitted: new Date().toLocaleString(),
        status: 'Pending',
      };
      sessionStorage.setItem('lastCertRequest', JSON.stringify(certRequest));

      const refNumber = 'CERT-' + Date.now().toString().slice(-6);

      try {
        await db.post({
          ...certRequest,
          type: 'certificate_request',
          timestamp: new Date().toISOString(),
          status: 'Pending',
          step: 1,
        });

        setShowCertForm(false);
        setCertSuccess({
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          certType,
          refNumber,
        });
        setCertForm(CERT_FORM_INITIAL);

        setTimeout(() => setCertSuccess(null), 5000);
      } catch (error) {
        console.error('Unable to save certificate request', error);
        alert('Unable to save your request offline right now.');
      }
    },
    [certForm, db]
  );

  const submitFeedback = useCallback(
    async (event) => {
      event.preventDefault();

      if (!feedbackSubject.trim() || !feedbackMessage.trim()) {
        alert('Please fill in all required fields.');
        return;
      }

      if (!db) {
        alert('Local database is unavailable.');
        return;
      }

      try {
        await db.post({
          type: 'feedback_submission',
          feedbackType,
          subject: feedbackSubject.trim(),
          message: feedbackMessage.trim(),
          status: 'Pending',
          timestamp: new Date().toISOString(),
        });

        alert('Thank you! Your ' + feedbackType.toLowerCase() + ' has been submitted successfully.');
        setFeedbackSubject('');
        setFeedbackMessage('');
        setFeedbackType('Complaint');
        goToTab('s-home');
      } catch (error) {
        console.error('Unable to save feedback', error);
        alert('Unable to save your feedback offline right now.');
      }
    },
    [feedbackSubject, feedbackMessage, feedbackType, goToTab, db]
  );

  const navItems = [
    { id: 's-home', label: 'Home', icon: 'Home', badge: null, badgeColor: 'var(--red)' },
    { id: 's-certificates', label: 'Certificates', icon: 'Certificates', badge: myRequests.length > 0 ? myRequests.length : null, badgeColor: 'var(--red)' },
    { id: 's-announcements', label: 'News', icon: 'News', badge: announcements.length > 0 ? announcements.length : null, badgeColor: 'var(--red)' },
    { id: 's-feedback', label: 'Feedback', icon: 'Feedback', badge: myFeedbacks.length > 0 ? myFeedbacks.length : null, badgeColor: 'var(--red)' },
  ];

  const pendingRequestCount = myRequests.filter((request) => {
    const statusLabel = request.status || 'Pending';
    const stepValue = Number(request.step || 1);
    return statusLabel === 'Pending' && stepValue < 4;
  }).length;
  const filteredAnnouncements = announcements.filter(
    (announcement) => announcementFilter === 'All' || announcement.category === announcementFilter
  );

  return (
    <div className="resident-root-container">
      {/* APP */}
      <div id="app">
        {/* HEADER */}
        <nav className="topnav">
          <div className="nav-brand">
            <img src={logo} alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
            <div>
              <div className="nav-title">Bustrac Hub</div>
            </div>
          </div>

          {/* TAB NAV */}
          <nav className="bottom-nav">
            {navItems.map((item) => {
              const isActive = activeScreen === item.id;

              return (
                <button
                  key={item.id}
                  className={`bnav-item${isActive ? ' active' : ''}`}
                  onClick={() => goToTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="icon">{item.icon}</span>
                  {item.label}
                  {item.badge ? (
                    <span
                      className={`bnav-badge${isActive ? ' active' : ''}`}
                      style={{ background: isActive ? 'var(--primary)' : item.badgeColor }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                  <span className={`nav-selection-dot${isActive ? ' active' : ''}`} />
                </button>
              );
            })}
          </nav>
        </nav>

        {/* CONTENT */}
        <div className="content">
          {/* HOME */}
          <div className={`screen${activeScreen === 's-home' ? ' active' : ''}`}>
            {isOffline && (
              <div className="notice notice-offline">
                <span style={{ fontSize: '16px' }}>📡</span>
                <div>
                  <strong>You're offline.</strong> You can still browse announcements and submit
                  requests. They'll sync when you reconnect.
                </div>
              </div>
            )}

            <div className="page-hdr">
              <div className="page-title">Good morning</div>
              <div className="page-sub">Barangay Bustrac</div>
            </div>

            <div className="stat-row">
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--primary)' }}>{myRequests.length}</div>
                <div className="stat-lbl">My Certificates</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--green)' }}>{pendingRequestCount}</div>
                <div className="stat-lbl">Pending Request</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--amber)' }}>{announcements.length}</div>
                <div className="stat-lbl">Announcements</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--purple)' }}>{myFeedbacks.length}</div>
                <div className="stat-lbl">My Feedbacks</div>
              </div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>📌 Latest Announcements</div>
              {announcements.length ? (
                announcements.slice(0, 3).map((announcement) => (
                  <div className="list-item" key={announcement._id}>
                    <div className="list-icon" style={{ background: announcement.category === 'Health' ? '#FFFBEB' : announcement.category === 'Governance' ? '#EEF2FF' : '#F3F4F6' }}>📢</div>
                    <div className="list-body">
                      <div className="list-title">{announcement.title}</div>
                      <div className="list-sub">{announcement.category || 'General'} · Posted {announcement.author ? `by ${announcement.author}` : 'recently'}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => goToTab('s-announcements')}>View</button>
                  </div>
                ))
              ) : (
                <div className="notice notice-info" style={{ marginTop: '8px' }}>
                  No announcements have been synced yet.
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>🚀 Quick Actions</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button className="btn btn-outline" onClick={() => goToTab('s-certificates')}>📝 Request Certificate</button>
                <button className="btn btn-outline" onClick={() => goToTab('s-feedback')}>💬 Submit Feedback</button>
                <button className="btn btn-outline" onClick={() => goToTab('s-announcements')}>📢 Announcements</button>
              </div>
            </div>
          </div>

          {/* CERTIFICATES */}
          <div className={`screen${activeScreen === 's-certificates' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">My Certificates</div>
              <div className="page-sub">Request and track your barangay certificates</div>
            </div>

            <button
              className="btn btn-primary btn-full"
              style={{ marginBottom: '18px' }}
              onClick={() => setShowCertForm(true)}
            >
              ＋ Request a Certificate
            </button>

            {showCertForm && (
              <div>
                <div className="card">
                  <div className="card-title" style={{ marginBottom: '16px' }}>New Certificate Request</div>
                  <form onSubmit={submitCert}>
                    {/* Resident Information Section */}
                    <div style={{ marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>📋 Your Information</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div className="fg">
                          <label className="fl">First Name</label>
                          <input
                            className="fc"
                            placeholder="e.g. Maria"
                            value={certForm.firstName}
                            onChange={updateCertField('firstName')}
                            required
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">Last Name</label>
                          <input
                            className="fc"
                            placeholder="e.g. Santos"
                            value={certForm.lastName}
                            onChange={updateCertField('lastName')}
                            required
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div className="fg">
                          <label className="fl">Birthdate</label>
                          <input
                            className="fc"
                            type="date"
                            value={certForm.birthdate}
                            onChange={updateCertField('birthdate')}
                            required
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">Age</label>
                          <input
                            className="fc"
                            type="number"
                            placeholder="e.g. 34"
                            value={certForm.age}
                            onChange={updateCertField('age')}
                            required
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div className="fg">
                          <label className="fl">Contact Number</label>
                          <input
                            className="fc"
                            type="tel"
                            placeholder="09XX-XXX-XXXX"
                            value={certForm.contact}
                            onChange={updateCertField('contact')}
                            required
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">Purok</label>
                          <input
                            className="fc"
                            placeholder="e.g. Purok 3"
                            value={certForm.purok}
                            onChange={updateCertField('purok')}
                            required
                          />
                        </div>
                      </div>
                      <div className="fg">
                        <label className="fl">Email (Optional)</label>
                        <input
                          className="fc"
                          type="email"
                          placeholder="your.email@example.com"
                          value={certForm.email}
                          onChange={updateCertField('email')}
                        />
                      </div>
                    </div>

                    {/* Certificate Details Section */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>📄 Certificate Request</div>
                      <div className="fg">
                        <label className="fl">Certificate Type</label>
                        <select
                          className="fc"
                          value={certForm.certType}
                          onChange={updateCertField('certType')}
                          required
                        >
                          <option value="">-- Select Certificate Type --</option>
                          <option value="Barangay Clearance">Barangay Clearance</option>
                          <option value="Certificate of Indigency">Certificate of Indigency</option>
                          <option value="Certificate of Residency">Certificate of Residency</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl">Purpose of Certificate</label>
                        <textarea
                          className="fc"
                          rows="3"
                          placeholder="e.g. For employment at DOLE-Camarines Sur..."
                          value={certForm.certPurpose}
                          onChange={updateCertField('certPurpose')}
                          required
                        />
                      </div>
                    </div>

                    <div className="notice notice-info" style={{ marginBottom: '14px' }}>
                      <span>ℹ️</span>
                      <div style={{ fontSize: '12px' }}>
                        Your request will be reviewed by the barangay office. You will be notified once approved.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button type="submit" className="btn btn-primary">Submit Request</button>
                      <button type="button" className="btn btn-ghost" onClick={() => setShowCertForm(false)}>Cancel</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {certSuccess && (
              <div className="notice notice-success">
                <span>✅</span>
                <strong>Request submitted!</strong>&nbsp;
                {certSuccess.firstName} {certSuccess.lastName} - {certSuccess.certType} (Ref: {certSuccess.refNumber}) is now pending approval.
              </div>
            )}

            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              My Requests
            </div>

            {myRequests.length ? (
              myRequests.map((request) => {
                const stepCount = Number(request.step || 1);
                const statusLabel = request.status || 'Pending';
                const isIssued = statusLabel === 'Issued' || stepCount >= 4;
                const badgeClass = isIssued ? 'badge b-green' : 'badge b-amber';
                const refNumber = request.refNumber || `CERT-${(request._id || '').slice(-6).toUpperCase()}`;
                const submittedDate = request.timestamp
                  ? new Date(request.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'Recently added';

                return (
                  <div className="card" key={request._id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <div className="card-title">{request.certType}</div>
                        <div className="card-meta">{refNumber} · {request.certPurpose || 'No purpose provided'}</div>
                      </div>
                      <span className={badgeClass}>{isIssued ? '✓ Issued' : '⏳ Pending'}</span>
                    </div>
                    <div className="steps">
                      {['Submitted', 'Review', 'Approved', 'Issued'].map((label, index) => {
                        const value = index + 1;
                        const isDone = stepCount > value;
                        const isActive = stepCount === value;
                        return (
                          <div key={label} className={`step${isDone ? ' done' : isActive ? ' active' : ' pending'}`}>
                            <div className="step-circle">{isDone ? '✓' : value}</div>
                            <div className="step-label">{label}</div>
                            {index < 3 && <div className="step-line" />}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Submitted {submittedDate} · {isIssued ? 'Request completed' : 'Awaiting Barangay Captain approval'}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="notice notice-info">No certificate requests have been saved locally yet.</div>
            )}
          </div>

          {/* ANNOUNCEMENTS */}
          <div className={`screen${activeScreen === 's-announcements' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">Announcements</div>
              <div className="page-sub">Official notices from Barangay Bustrac</div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {['All', 'Health', 'Governance', 'Events', 'Security'].map((label) => (
                <button
                  key={label}
                  className={`type-btn${announcementFilter === label ? ' active' : ''}`}
                  onClick={() => setAnnouncementFilter(label)}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredAnnouncements.length ? (
              filteredAnnouncements.map((announcement) => (
                <div key={announcement._id} className={`ann-card${announcement.pinned ? ' pinned' : ''}`}>
                  <div
                    className="ann-cat"
                    style={{
                      color: announcement.category === 'Health'
                        ? 'var(--amber)'
                        : announcement.category === 'Governance'
                          ? 'var(--primary)'
                          : announcement.category === 'Security'
                            ? 'var(--red)'
                            : 'var(--purple)',
                    }}
                  >
                    {announcement.pinned ? '📌 Pinned · ' : ''}
                    {announcement.category || 'General'}
                  </div>
                  <div className="ann-title">{announcement.title}</div>
                  <div className="ann-body">{announcement.body}</div>
                  <div className="ann-footer">
                    📅 Posted by {announcement.author || 'Barangay Office'} · {announcement.date || 'Recently posted'}
                  </div>
                </div>
              ))
            ) : (
              <div className="notice notice-info">No announcements match the selected filter.</div>
            )}
          </div>

          {/* FEEDBACK */}
          <div className={`screen${activeScreen === 's-feedback' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">Feedback & Concerns</div>
              <div className="page-sub">Submit your concerns to the barangay office</div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>Submit a Concern</div>
              <form onSubmit={submitFeedback}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Type
                </div>
                <div className="type-select">
                  {[
                    { type: 'Complaint', label: '💬 Complaint' },
                    { type: 'Suggestion', label: '💡 Suggestion' },
                    { type: 'Inquiry', label: '❓ Inquiry' },
                  ].map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      className={`type-btn${feedbackType === option.type ? ' active' : ''}`}
                      onClick={() => setFeedbackType(option.type)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="fg">
                  <label className="fl">Subject</label>
                  <input
                    className="fc"
                    placeholder="Brief description of your concern"
                    value={feedbackSubject}
                    onChange={(event) => setFeedbackSubject(event.target.value)}
                    required
                  />
                </div>
                <div className="fg">
                  <label className="fl">Message</label>
                  <textarea
                    className="fc"
                    rows="4"
                    placeholder="Describe your concern in detail..."
                    value={feedbackMessage}
                    onChange={(event) => setFeedbackMessage(event.target.value)}
                    required
                  />
                </div>
                <div className="notice notice-info" style={{ marginBottom: '14px' }}>
                  <span>🔒</span>
                  <div style={{ fontSize: '12px' }}>
                    Your concern is linked to your account and will be responded to by barangay staff within
                    3 working days.
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-full">Submit Concern</button>
              </form>
            </div>

            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              My Submissions
            </div>
            <div className="card">
              {myFeedbacks.length ? (
                myFeedbacks.map((feedback) => (
                  <div className="list-item" key={feedback._id}>
                    <div
                      className="list-icon"
                      style={{
                        background:
                          feedback.feedbackType === 'Suggestion'
                            ? 'var(--green-bg)'
                            : feedback.feedbackType === 'Inquiry'
                              ? 'var(--purple-bg)'
                              : 'var(--red-bg)',
                      }}
                    >
                      {feedback.feedbackType === 'Suggestion' ? '💡' : feedback.feedbackType === 'Inquiry' ? '❓' : '🗑️'}
                    </div>
                    <div className="list-body">
                      <div className="list-title">{feedback.subject}</div>
                      <div className="list-sub">{feedback.feedbackType} · Submitted {feedback.timestamp ? new Date(feedback.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently'}</div>
                    </div>
                    <span className={`badge ${feedback.status === 'Pending' ? 'b-amber' : 'b-green'}`}>{feedback.status || 'Pending'}</span>
                  </div>
                ))
              ) : (
                <div className="notice notice-info">No feedback submissions have been synced yet.</div>
              )}
            </div>
          </div>

          {/* PROFILE */}
          <div className={`screen${activeScreen === 's-profile' ? ' active' : ''}`}>
            <div className="page-hdr">
              <div className="page-title">My Profile</div>
              <div className="page-sub">Your resident information on file</div>
            </div>

            <div className="card" style={{ textAlign: 'center', padding: '28px' }}>
              <div
                style={{
                  width: '70px',
                  height: '70px',
                  background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
                  borderRadius: '50%',
                  margin: '0 auto 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  fontWeight: 900,
                  color: 'white',
                }}
              >
                MS
              </div>
              <div style={{ fontSize: '18px', fontWeight: 900 }}>Maria Dela Cruz Santos</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>Resident ID: RES-0001</div>
              <span className="badge b-green" style={{ marginTop: '8px' }}>✓ Registered Voter</span>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>Personal Information</div>
              <div className="list-item"><div className="list-body"><div className="list-sub">Birthdate</div><div className="list-title">March 12, 1990</div></div></div>
              <div className="list-item"><div className="list-body"><div className="list-sub">Age</div><div className="list-title">34 years old</div></div></div>
              <div className="list-item"><div className="list-body"><div className="list-sub">Gender</div><div className="list-title">Female</div></div></div>
              <div className="list-item"><div className="list-body"><div className="list-sub">Civil Status</div><div className="list-title">Married</div></div></div>
              <div className="list-item"><div className="list-body"><div className="list-sub">Contact Number</div><div className="list-title">0917-123-4567</div></div></div>
              <div className="list-item"><div className="list-body"><div className="list-sub">Purok</div><div className="list-title">Purok 3, Barangay Bustrac</div></div></div>
              <div className="list-item" style={{ border: 'none' }}><div className="list-body"><div className="list-sub">Household</div><div className="list-title">HH-0012 — Santos Family</div></div></div>
            </div>

            <div className="sync-status">
              <div className="sync-dot" />
              CouchDB sync — Up to date · Last sync: Today, 07:45 AM
            </div>

            <button
              className="btn btn-ghost btn-full"
              onClick={handleLogout}
              style={{ color: 'var(--red)', borderColor: '#FECACA' }}
            >
              Sign Out
            </button>
          </div>
        </div>
        {/* /content */}
      </div>

      {/* LIVE INDICATOR */}
      <div className="live-indicator">
        <div className="live-dot" />
        <div className="live-text">LIVE</div>
      </div>
    </div>
  );
}
