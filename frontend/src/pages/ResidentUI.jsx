import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function ResidentUI() {
  const navigate = useNavigate();

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
    (event) => {
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

      // Store certificate request data
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

      setShowCertForm(false);
      setCertSuccess({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        certType,
        refNumber,
      });
      setCertForm(CERT_FORM_INITIAL);

      setTimeout(() => setCertSuccess(null), 5000);
    },
    [certForm]
  );

  const submitFeedback = useCallback(
    (event) => {
      event.preventDefault();

      if (!feedbackSubject.trim() || !feedbackMessage.trim()) {
        alert('Please fill in all required fields.');
        return;
      }

      alert('Thank you! Your ' + feedbackType.toLowerCase() + ' has been submitted successfully.');
      setFeedbackSubject('');
      setFeedbackMessage('');
      setFeedbackType('Complaint');
      goToTab('s-home');
    },
    [feedbackSubject, feedbackMessage, feedbackType, goToTab]
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
            <button
              className={`bnav-item${activeScreen === 's-home' ? ' active' : ''}`}
              onClick={() => goToTab('s-home')}
            >
              <span className="icon">Home</span>Home
            </button>
            <button
              className={`bnav-item${activeScreen === 's-certificates' ? ' active' : ''}`}
              onClick={() => goToTab('s-certificates')}
            >
              <span className="icon">Certificates</span>Certificates
              <span className="bnav-badge">1</span>
            </button>
            <button
              className={`bnav-item${activeScreen === 's-announcements' ? ' active' : ''}`}
              onClick={() => goToTab('s-announcements')}
            >
              <span className="icon">News</span>News
              <span className="bnav-badge" style={{ background: 'var(--green)' }}>3</span>
            </button>
            <button
              className={`bnav-item${activeScreen === 's-feedback' ? ' active' : ''}`}
              onClick={() => goToTab('s-feedback')}
            >
              <span className="icon">Feedback</span>Feedback
            </button>
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
                <div className="stat-val" style={{ color: 'var(--primary)' }}>2</div>
                <div className="stat-lbl">My Certificates</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--green)' }}>1</div>
                <div className="stat-lbl">Pending Request</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--amber)' }}>3</div>
                <div className="stat-lbl">Announcements</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--purple)' }}>1</div>
                <div className="stat-lbl">My Feedbacks</div>
              </div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '14px' }}>📌 Latest Announcements</div>
              <div className="list-item">
                <div className="list-icon" style={{ background: '#FFFBEB' }}>📢</div>
                <div className="list-body">
                  <div className="list-title">Free Medical Mission — April 15</div>
                  <div className="list-sub">Health · Posted Apr 5</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => goToTab('s-announcements')}>View</button>
              </div>
              <div className="list-item">
                <div className="list-icon" style={{ background: '#EEF2FF' }}>🏛️</div>
                <div className="list-body">
                  <div className="list-title">Barangay Assembly — April 20</div>
                  <div className="list-sub">Governance · Posted Apr 4</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => goToTab('s-announcements')}>View</button>
              </div>
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

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <div className="card-title">Barangay Clearance</div>
                  <div className="card-meta">CERT-2024-089 · For employment purposes</div>
                </div>
                <span className="badge b-amber">⏳ Pending</span>
              </div>
              <div className="steps">
                <div className="step done">
                  <div className="step-circle">✓</div>
                  <div className="step-label">Submitted</div>
                  <div className="step-line" />
                </div>
                <div className="step active">
                  <div className="step-circle">2</div>
                  <div className="step-label">Review</div>
                  <div className="step-line" />
                </div>
                <div className="step pending">
                  <div className="step-circle">3</div>
                  <div className="step-label">Approved</div>
                  <div className="step-line" />
                </div>
                <div className="step pending">
                  <div className="step-circle">4</div>
                  <div className="step-label">Issued</div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Submitted Apr 7 · Awaiting Barangay Captain approval</div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <div className="card-title">Certificate of Residency</div>
                  <div className="card-meta">CERT-2024-081 · For school enrollment</div>
                </div>
                <span className="badge b-green">✓ Issued</span>
              </div>
              <div className="steps">
                <div className="step done">
                  <div className="step-circle">✓</div>
                  <div className="step-label">Submitted</div>
                  <div className="step-line" />
                </div>
                <div className="step done">
                  <div className="step-circle">✓</div>
                  <div className="step-label">Review</div>
                  <div className="step-line" />
                </div>
                <div className="step done">
                  <div className="step-circle">✓</div>
                  <div className="step-label">Approved</div>
                  <div className="step-line" />
                </div>
                <div className="step done">
                  <div className="step-circle">✓</div>
                  <div className="step-label">Issued</div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Issued Mar 15 · Cert No. BRG-CERT-0245</div>
            </div>
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

            <div className="ann-card pinned">
              <div className="ann-cat" style={{ color: 'var(--amber)' }}>📌 Pinned · Health</div>
              <div className="ann-title">Free Medical Mission — April 15, 2024</div>
              <div className="ann-body">
                The DOH-Bicol Region will conduct a FREE medical mission at the Barangay Bustrac covered
                court on April 15, 2024, from 8:00 AM to 4:00 PM. Services include free consultation, blood
                pressure monitoring, blood sugar screening, and medicine dispensing. Open to all residents of
                Barangay Bustrac. Please bring your barangay clearance or any valid ID.
              </div>
              <div className="ann-footer">📅 Posted by Cortero, Mark · April 5, 2024</div>
            </div>

            <div className="ann-card">
              <div className="ann-cat" style={{ color: 'var(--primary)' }}>🏛️ Governance</div>
              <div className="ann-title">Quarterly Barangay Assembly — April 20, 2024</div>
              <div className="ann-body">
                All residents of Barangay Bustrac are cordially invited to attend the 2nd Quarterly Barangay
                Assembly on April 20, 2024, at 8:00 AM at the Barangay Bustrac Covered Court. Topics to be
                discussed include the barangay budget update, peace and order situation, and upcoming
                infrastructure projects. Attendance is highly encouraged.
              </div>
              <div className="ann-footer">📅 Posted by Napagal, Jay · April 4, 2024</div>
            </div>

            <div className="ann-card">
              <div className="ann-cat" style={{ color: 'var(--red)' }}>🚨 Security</div>
              <div className="ann-title">Community Watch Reminder — Be Vigilant</div>
              <div className="ann-body">
                The barangay office reminds all residents to secure their homes and report any suspicious
                activities to the barangay hall or the nearest PNP station. The Barangay Bustrac Community
                Watch team conducts nightly patrols from 9 PM to 5 AM. Report emergencies to 09XXXXXXXXX.
              </div>
              <div className="ann-footer">📅 Posted by Admin · April 2, 2024</div>
            </div>
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
              <div className="list-item">
                <div className="list-icon" style={{ background: 'var(--red-bg)' }}>🗑️</div>
                <div className="list-body">
                  <div className="list-title">Garbage not collected in Purok 3</div>
                  <div className="list-sub">Complaint · Submitted Apr 7</div>
                </div>
                <span className="badge b-amber">Pending</span>
              </div>
              <div className="list-item">
                <div className="list-icon" style={{ background: 'var(--green-bg)' }}>💡</div>
                <div className="list-body">
                  <div className="list-title">More streetlights near the park</div>
                  <div className="list-sub">Suggestion · Submitted Mar 20</div>
                </div>
                <span className="badge b-green">Resolved</span>
              </div>
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
