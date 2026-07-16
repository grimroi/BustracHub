import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PouchDB from 'pouchdb';
import logo from '../assets/logo.png';
import CertificateLifecycle from './CertificateLifecycle';
import './DashboardLayout.css';

const db = new PouchDB('bustrac_db');

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const SCREEN_META = {
  dashboard:        ['Dashboard', ''],            // subtitle rendered per role in JSX
  residents:        ['Manage Residents',          'Resident Registry Module'],
  'add-resident':   ['Add New Resident',          'Resident Registry'],
  households:       ['Manage Households',         'Resident Registry'],
  'cert-req':       ['Request & Approval',        'Certificate Issuance Module'],
  'cert-approve':   ['Certificate Approval',      'Certificate Issuance Module'],
  'cert-print':     ['Issuance & Print',          'Certificate Issuance Module'],
  programs:         ['Distribution Programs',     'Aid Distribution Module'],
  'aid-encode':     ['Encode Distribution',       'Aid Distribution Module'],
  'aid-logs':       ['Distribution Logs',         'Aid Distribution Module'],
  'add-beneficiary':['Add Beneficiaries',         'Aid Distribution Module'],
  'blotter-new':    ['File Blotter Entry',        'Blotter Module'],
  'blotter-manage': ['Manage Blotter Records',    'Blotter Module'],
  'blotter-detail': ['Complaint Details',         'Blotter Module — Case Management'],
  announcements:    ['Announcements',             'Community Module'],
  feedback:         ['Feedback & Complaints',     'Community Module'],
  conflicts:        ['Conflict Resolution',       'Admin Only — CouchDB Sync Conflicts'],
  audit:            ['Audit Log',                 'Admin Only — Immutable Transaction History'],
  users:            ['Manage Users',              'Admin Only — User Accounts & Roles'],
  reports:          ['Generate Reports',          'Administration'],
};

const EMPTY_RESIDENT = {
  firstName:   '',
  middleName:  '',
  lastName:    '',
  birthdate:   '',
  gender:      '',
  civilStatus: '',
  contact:     '',
  purok:       '',
  household:   '',
  voter:       false,
};

const INITIAL_COMPLAINT = {
  caseNum:      'BLT-2024-041',
  caseStatus:   'Open',
  dateFiled:    '2024-04-07',
  timeFiled:    '22:30',
  incidentType: 'Noise Complaint',
  location:     'Purok 5, Barangay Bustrac',
  compName:     'Reyes, Carmen P.',
  compID:       'RES-0156',
  compContact:  '09171234567',
  compPurok:    'Purok 5',
  narrative:
    "Continuous loud music and karaoke from Torres residence every night until past midnight. Noise level disturbs neighboring families and children's sleep. This has been ongoing for 2 weeks. Request immediate barangay action.",
  statusNotes:  'No notes yet. Document action taken during mediation.',
  respName:     'Torres, Mark P.',
  respID:       'RES-0189',
  respContact:  '09189876543',
  respEmail:    'mark.torres@email.com',
  respAddress:  'No. 45, Mag-asikaso St., Purok 5',
  summonDate:   '2024-04-14',
  summonTime:   '14:00',
  summonMsg:
    'You are hereby summoned to appear at Barangay Hall, Purok 5, on the scheduled date and time to discuss the complaint filed against you. Please bring any relevant documents or witnesses if applicable.',
  sendSMS:   true,
  sendEmail: true,
};

// ─────────────────────────────────────────────
// INLINE STYLE CONSTANTS
// ─────────────────────────────────────────────
const monoMuted = { fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' };
const mono10    = { fontFamily: 'var(--mono)', fontSize: '10px' };

// ─────────────────────────────────────────────
// DYNAMIC NAME DICTIONARY
// ─────────────────────────────────────────────
const NAME_MAP = {
  mgcortero:    'Mark Gian Cortero',
  jmacabangon:  'Juhairo Macabangon',
};

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function DashboardPortal({ role = 'staff' }) {
  const navigate = useNavigate();

  // ── Dynamic User Identity ──
  const username    = sessionStorage.getItem('bustrac_user');
  const displayName = NAME_MAP[username] ?? username ?? 'Portal User';
  const initials    = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // ── Navigation State ──
  const [screen,  setScreen]  = useState('dashboard');
  const [offline, setOffline] = useState(false);
  const [issuedCertificates, setIssuedCertificates] = useState([]);
  const [selectedCertificate, setSelectedCertificate] = useState(null);

  // ── Staff: Blotter Case / Summons State ──
  const [staffCase, setStaffCase] = useState({
    caseNum:      'BLT-2024-041',
    status:       'Open',
    dateFiled:    '2024-04-07',
    timeFiled:    '22:30',
    incidentType: 'Noise Complaint',
    location:     'Purok 5, Barangay Bustrac',
    compName:     'Reyes, Carmen P.',
    compID:       'RES-0156',
    compContact:  '09171234567',
    compPurok:    'Purok 5',
    narrative:
      "Continuous loud music and karaoke from Torres residence every night until past midnight. Noise level disturbs neighboring families and children's sleep. This has been ongoing for 2 weeks. Request immediate barangay action.",
    statusNotes:  'No notes yet. Document action taken during mediation.',
    respName:     'Torres, Mark P.',
    respID:       'RES-0189',
    respContact:  '09189876543',
    respEmail:    'mark.torres@email.com',
    respAddress:  'No. 45, Mag-asikaso St., Purok 5',
    summonDate:   '2024-04-14',
    summonTime:   '14:00',
    summonMsg:
      'You are hereby summoned to appear at Barangay Hall, Purok 5, on the scheduled date and time to discuss the complaint filed against you. Please bring any relevant documents or witnesses if applicable.',
    sendSMS:   true,
    sendEmail: true,
  });

  // ── Admin: Resident Form ──
  const [residentForm, setResidentForm] = useState(EMPTY_RESIDENT);

  // ── Admin: Complaint / Summons State ──
  const [complaint, setComplaint] = useState(INITIAL_COMPLAINT);

  // ── Admin: Beneficiary List ──
  const [beneficiaryDraft, setBeneficiaryDraft] = useState({
    name:    '',
    aidType: 'Rice 5kg',
    qty:     1,
  });
  const [beneficiaryList, setBeneficiaryList] = useState([]);

  // ─────────────────────────────────────────────
  // HANDLERS — SHARED
  // ─────────────────────────────────────────────
  const nav           = (id) => setScreen(id);
  const logout        = ()  => navigate('/login');
  const toggleOffline = ()  => setOffline((prev) => !prev);

  // ─────────────────────────────────────────────
  // HANDLERS — STAFF BLOTTER / SUMMONS
  // ─────────────────────────────────────────────
  const updateCase = (field, value) =>
    setStaffCase((prev) => ({ ...prev, [field]: value }));

  const staffSaveComplaintChanges = () => {
    const { compName, respName, narrative, incidentType, status, location } = staffCase;
    if (!compName || !respName || !narrative) {
      alert('Please fill in all required fields (names and narrative)');
      return;
    }
    alert(
      `✓ Complaint BLT-2024-041 updated successfully!\n\nChanges saved:\n• Complainant: ${compName}\n• Respondent: ${respName}\n• Incident Type: ${incidentType}\n• Status: ${status}\n• Location: ${location}\n\nAll changes recorded in audit log.`
    );
  };

  const staffCancelEdit = () => {
    if (window.confirm('Discard all unsaved changes?')) {
      nav('blotter-manage');
    }
  };

  const staffSendSummons = () => {
    const { summonDate, summonTime, respName, sendSMS, sendEmail } = staffCase;
    if (!summonDate || !summonTime) {
      alert('Please set date and time for appearance');
      return;
    }
    const methods = [];
    if (sendSMS)   methods.push('SMS');
    if (sendEmail) methods.push('Email');
    if (methods.length === 0) {
      alert('Please select at least one notification method');
      return;
    }
    const confirmMsg = `Send summons to ${respName} via ${methods.join(' and ')}?\n\nAppearance: ${summonDate} at ${summonTime}\n\nThis action will be recorded in the audit log.`;
    if (window.confirm(confirmMsg)) {
      alert(
        `✓ Summons sent successfully via ${methods.join(' and ')}!\n\nNotification recorded: BLT-2024-041\nRespondent: ${respName}\nScheduled: ${summonDate} ${summonTime}`
      );
    }
  };

  // ─────────────────────────────────────────────
  // HANDLERS — ADMIN RESIDENT FORM
  // ─────────────────────────────────────────────
  const updateResidentField = (field, value) =>
    setResidentForm((prev) => ({ ...prev, [field]: value }));

  const submitAddResident = (e) => {
    e.preventDefault();
    const { firstName, middleName, lastName, birthdate, gender, civilStatus, contact, purok, household } =
      residentForm;
    if (
      !firstName || !middleName || !lastName || !birthdate ||
      !gender    || !civilStatus || !contact  || !purok || !household
    ) {
      alert('Please fill in all required fields.');
      return;
    }
    const fullName = `${firstName} ${middleName} ${lastName}`;
    alert(
      `Resident added successfully!\n\nName: ${fullName}\nBirthdate: ${birthdate}\nGender: ${gender}\nPurok: ${purok}\n\nRecord saved and will be synced to CouchDB.`
    );
    setResidentForm(EMPTY_RESIDENT);
    nav('residents');
  };

  // ─────────────────────────────────────────────
  // HANDLERS — ADMIN COMPLAINT / SUMMONS
  // ─────────────────────────────────────────────
  const updateComplaintField = (field, value) =>
    setComplaint((prev) => ({ ...prev, [field]: value }));

  const saveComplaintChanges = () => {
    const { compName, respName, narrative, incidentType, caseStatus, location } = complaint;
    if (!compName || !respName || !narrative) {
      alert('Please fill in all required fields (names and narrative)');
      return;
    }
    alert(
      `✓ Complaint BLT-2024-041 updated successfully!\n\nChanges saved:\n• Complainant: ${compName}\n• Respondent: ${respName}\n• Incident Type: ${incidentType}\n• Status: ${caseStatus}\n• Location: ${location}\n\nAll changes recorded in audit log.`
    );
  };

  const cancelEdit = () => {
    if (window.confirm('Discard all unsaved changes?')) {
      nav('blotter-manage');
    }
  };

  const sendSummons = () => {
    const { summonDate, summonTime, respName, sendSMS, sendEmail } = complaint;
    if (!summonDate || !summonTime) {
      alert('Please set date and time for appearance');
      return;
    }
    const methods = [];
    if (sendSMS)   methods.push('SMS');
    if (sendEmail) methods.push('Email');
    if (methods.length === 0) {
      alert('Please select at least one notification method');
      return;
    }
    const confirmMsg = `Send summons to ${respName} via ${methods.join(' and ')}?\n\nAppearance: ${summonDate} at ${summonTime}\n\nThis action will be recorded in the audit log.`;
    if (window.confirm(confirmMsg)) {
      alert(
        `✓ Summons sent successfully via ${methods.join(' and ')}!\n\nNotification recorded: BLT-2024-041\nRespondent: ${respName}\nScheduled: ${summonDate} ${summonTime}`
      );
    }
  };

  // ─────────────────────────────────────────────
  // HANDLERS — ADMIN BENEFICIARY LIST
  // ─────────────────────────────────────────────
  const addToList = () => {
    if (!beneficiaryDraft.name.trim()) {
      alert('Please enter a beneficiary name.');
      return;
    }
    setBeneficiaryList((prev) => [...prev, beneficiaryDraft]);
    setBeneficiaryDraft({ name: '', aidType: 'Rice 5kg', qty: 1 });
  };

  const removeFromList = (index) =>
    setBeneficiaryList((prev) => prev.filter((_, i) => i !== index));

  const saveAll = () => {
    if (beneficiaryList.length === 0) {
      alert('No beneficiaries to save.');
      return;
    }
    alert(`✓ Saved ${beneficiaryList.length} beneficiary record(s).`);
    setBeneficiaryList([]);
  };

  useEffect(() => {
    const loadIssuedCertificates = async () => {
      try {
        const result = await db.allDocs({ include_docs: true, attachments: false });
        const docs = result.rows
          .map((row) => row.doc)
          .filter((doc) => doc && doc.type === 'certificate_request' && Number(doc.step) === 4);

        setIssuedCertificates(docs);
        if (!selectedCertificate && docs.length > 0) {
          setSelectedCertificate(docs[0]);
        }
      } catch (error) {
        console.error('Unable to load issued certificates', error);
      }
    };

    const changes = db.changes({ live: true, include_docs: true });
    changes.on('change', (change) => {
      if (!change.doc || change.doc.type !== 'certificate_request') {
        return;
      }

      setIssuedCertificates((prev) => {
        const next = prev.filter((item) => item._id !== change.id);
        if (Number(change.doc.step) !== 4) {
          return next;
        }

        if (!prev.some((item) => item._id === change.id)) {
          return [change.doc, ...next];
        }

        return next.map((item) => (item._id === change.id ? change.doc : item));
      });
    });

    loadIssuedCertificates();

    return () => changes.cancel();
  }, [selectedCertificate]);

  const handlePrintRelease = async (selectedDoc) => {
    try {
      const latestDoc = await db.get(selectedDoc._id);
      const updatedDoc = {
        ...latestDoc,
        step: 4,
        status: 'Issued',
        date_issued: new Date().toLocaleDateString(),
      };

      await db.put(updatedDoc);

      setIssuedCertificates((prev) =>
        prev.map((item) => (item._id === updatedDoc._id ? updatedDoc : item))
      );
      setSelectedCertificate((prev) =>
        prev && prev._id === updatedDoc._id ? updatedDoc : prev
      );
    } catch (err) {
      console.error('Failed to release and issue document instantly:', err);
      alert('Database synchronization lag error.');
    }
  };

  // ─────────────────────────────────────────────
  // TOPBAR TITLE
  // ─────────────────────────────────────────────
  const [title, subtitle] = (() => {
    if (screen === 'dashboard') {
      return [
        'Dashboard',
        role === 'admin'
          ? 'Barangay Bustrac — Full System View'
          : 'Barangay Bustrac Operations',
      ];
    }
    return SCREEN_META[screen] ?? [screen, ''];
  })();

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="dashboard-shell-container">
      <div className="app">

        {/* ════════════════ SIDEBAR ════════════════ */}
        <aside className="sidebar">
          {/* Logo / App Name */}
          <div className="sb-logo">
            <img src={logo} alt="Barangay Bustrac Official Seal" className="sb-logo-img" />
            <div>
              <div className="sb-title">Bustrac Hub</div>
              <div className="sb-sub">
                {role === 'admin' ? 'Administrator Portal' : 'Staff Portal'}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="sb-nav">

            {/* OVERVIEW */}
            <div className="sb-sec">Overview</div>
            <button
              className={`nav-btn${screen === 'dashboard' ? ' active' : ''}`}
              onClick={() => nav('dashboard')}
            >
              <span className="nav-ico">📊</span>Dashboard
            </button>

            {/* RESIDENTS */}
            <div className="sb-sec">Residents</div>
            <button
              className={`nav-btn${screen === 'residents' ? ' active' : ''}`}
              onClick={() => nav('residents')}
            >
              <span className="nav-ico">👥</span>Manage Residents
            </button>
            <button
              className={`nav-btn${screen === 'households' ? ' active' : ''}`}
              onClick={() => nav('households')}
            >
              <span className="nav-ico">🏠</span>Manage Households
            </button>
            <button
              className={`nav-btn${screen === 'add-resident' ? ' active' : ''}`}
              onClick={() => nav('add-resident')}
            >
              <span className="nav-ico">➕</span>Add Resident
            </button>

            {/* CERTIFICATES */}
            <div className="sb-sec">Certificates</div>
            <button
              className={`nav-btn${screen === 'cert-req' ? ' active' : ''}`}
              onClick={() => nav('cert-req')}
            >
              <span className="nav-ico">📝</span>Request &amp; Approval
              <span className="nb nb-amber">3</span>
            </button>
            <button
              className={`nav-btn${screen === 'cert-print' ? ' active' : ''}`}
              onClick={() => nav('cert-print')}
            >
              <span className="nav-ico">🖨️</span>Issuance &amp; Print
            </button>

            {/* AID DISTRIBUTION */}
            <div className="sb-sec">Aid Distribution</div>
            <button
              className={`nav-btn${screen === 'programs' ? ' active' : ''}`}
              onClick={() => nav('programs')}
            >
              <span className="nav-ico">📦</span>Programs
            </button>
            <button
              className={`nav-btn${screen === 'aid-encode' ? ' active' : ''}`}
              onClick={() => nav('aid-encode')}
            >
              <span className="nav-ico">➕</span>Encode Distribution
            </button>
            <button
              className={`nav-btn${screen === 'aid-logs' ? ' active' : ''}`}
              onClick={() => nav('aid-logs')}
            >
              <span className="nav-ico">📋</span>Distribution Logs
            </button>
            {role === 'admin' && (
              <button
                className={`nav-btn${screen === 'add-beneficiary' ? ' active' : ''}`}
                onClick={() => nav('add-beneficiary')}
              >
                <span className="nav-ico">➕</span>Add Beneficiary
              </button>
            )}

            {/* BLOTTER */}
            <div className="sb-sec">Blotter</div>
            <button
              className={`nav-btn${screen === 'blotter-new' ? ' active' : ''}`}
              onClick={() => nav('blotter-new')}
            >
              <span className="nav-ico">🚨</span>File Blotter Entry
            </button>
            <button
              className={`nav-btn${screen === 'blotter-manage' ? ' active' : ''}`}
              onClick={() => nav('blotter-manage')}
            >
              <span className="nav-ico">📂</span>Manage Blotter
              <span className="nb nb-red">2</span>
            </button>
            {role === 'staff' && (
              <button
                className={`nav-btn${screen === 'blotter-detail' ? ' active' : ''}`}
                onClick={() => nav('blotter-detail')}
              >
                <span className="nav-ico">📨</span>Blotter Summon
              </button>
            )}

            {/* COMMUNITY */}
            <div className="sb-sec">Community</div>
            <button
              className={`nav-btn${screen === 'announcements' ? ' active' : ''}`}
              onClick={() => nav('announcements')}
            >
              <span className="nav-ico">📢</span>Announcements
            </button>
            <button
              className={`nav-btn${screen === 'feedback' ? ' active' : ''}`}
              onClick={() => nav('feedback')}
            >
              <span className="nav-ico">💬</span>Feedback
              <span className="nb nb-red">5</span>
            </button>

            {/* ADMIN-ONLY SECTION */}
            {role === 'admin' && (
              <>
                <div className="sb-sec">Admin Only</div>
                <button
                  className={`nav-btn${screen === 'conflicts' ? ' active' : ''}`}
                  onClick={() => nav('conflicts')}
                >
                  <span className="nav-ico">⚠️</span>Conflict Resolution
                  <span className="nb nb-red">2</span>
                </button>
                <button
                  className={`nav-btn${screen === 'audit' ? ' active' : ''}`}
                  onClick={() => nav('audit')}
                >
                  <span className="nav-ico">🔍</span>Audit Log
                </button>
                <button
                  className={`nav-btn${screen === 'users' ? ' active' : ''}`}
                  onClick={() => nav('users')}
                >
                  <span className="nav-ico">🔐</span>Manage Users
                </button>
              </>
            )}

            {/* REPORTS */}
            <div className="sb-sec">Reports</div>
            <button
              className={`nav-btn${screen === 'reports' ? ' active' : ''}`}
              onClick={() => nav('reports')}
            >
              <span className="nav-ico">📈</span>Generate Reports
            </button>
          </nav>

          {/* Sidebar Footer — Dynamic Name */}
          <div className="sb-foot">
            <div className="sb-ava">{initials}</div>
            <div>
              <div className="sb-uname">{displayName}</div>
              <div className="sb-urole">
                {role === 'admin' ? 'Administrator' : 'Staff'}
              </div>
            </div>
            <div
              className="online-dot"
              title={offline ? 'Offline — local sync' : 'Online — CouchDB synced'}
              style={
                offline
                  ? { background: 'var(--amber)', boxShadow: '0 0 0 2px var(--amber-bg)' }
                  : undefined
              }
            />
          </div>
        </aside>

        {/* ════════════════ MAIN CONTENT ════════════════ */}
        <div className="main">

          {/* ── Topbar ── */}
          <header className="topbar">
            <div style={{ flex: 1 }}>
              <div className="tb-title">{title}</div>
              <div className="tb-sub">{subtitle}</div>
            </div>
            {offline && (
              <div className="offline-pill">📡 Offline — CouchDB local sync active</div>
            )}
            {role === 'admin' && (
              <div className="role-admin">🔑 Admin</div>
            )}
            <button className="btn btn-g btn-sm" onClick={toggleOffline}>
              Toggle Offline
            </button>
            <button className="btn btn-g btn-sm" onClick={logout}>
              Sign Out
            </button>
          </header>

          <div className="content">

            {/* ════════════════════════════════════════
                SCREEN: DASHBOARD
                ════════════════════════════════════════ */}
            {screen === 'dashboard' && (
              <div className="screen active">
                <div className="sg">
                  <div className="sc">
                    <div className="si">👥</div>
                    <div className="sl">Residents</div>
                    <div className="sv" style={{ color: 'var(--accent)' }}>1,248</div>
                  </div>
                  <div className="sc">
                    <div className="si">🏠</div>
                    <div className="sl">Households</div>
                    <div className="sv" style={{ color: 'var(--green)' }}>342</div>
                  </div>
                  <div className="sc">
                    <div className="si">📝</div>
                    <div className="sl">Pending Certs</div>
                    <div className="sv" style={{ color: 'var(--amber)' }}>8</div>
                  </div>
                  <div className="sc">
                    <div className="si">📦</div>
                    <div className="sl">Aid Beneficiaries</div>
                    <div className="sv" style={{ color: 'var(--purple)' }}>387</div>
                  </div>
                  <div className="sc">
                    <div className="si">🚨</div>
                    <div className="sl">Open Blotter</div>
                    <div className="sv" style={{ color: 'var(--red)' }}>4</div>
                  </div>
                  {role === 'admin' && (
                    <div className="sc">
                      <div className="si">⚠️</div>
                      <div className="sl">Sync Conflicts</div>
                      <div className="sv" style={{ color: 'var(--orange)' }}>2</div>
                    </div>
                  )}
                  <div className="sc">
                    <div className="si">💬</div>
                    <div className="sl">{role === 'admin' ? 'Feedback' : 'Unread Feedback'}</div>
                    <div className="sv" style={{ color: 'var(--teal)' }}>5</div>
                  </div>
                  {role === 'admin' && (
                    <div className="sc">
                      <div className="si">👤</div>
                      <div className="sl">Active Users</div>
                      <div className="sv" style={{ color: 'var(--muted)' }}>6</div>
                    </div>
                  )}
                </div>

                <div className="tc">
                  {/* LEFT: Pending Actions / Admin Actions */}
                  <div>
                    <div
                      style={{
                        fontSize: '12px', fontWeight: 700, color: 'var(--muted)',
                        marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}
                    >
                      {role === 'admin' ? 'Pending Admin Actions' : 'Pending Actions'}
                    </div>
                    {role === 'admin' && (
                      <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div className="ct">⚠️ Sync Conflicts (2)</div>
                            <div className="cm">CouchDB revision conflicts need resolution</div>
                          </div>
                          <button className="btn btn-d btn-sm" onClick={() => nav('conflicts')}>
                            Resolve Now
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ct">📝 Certificate Requests {role === 'admin' ? '(3)' : ''}</div>
                          <div className="cm">
                            {role === 'admin'
                              ? 'Pending approval by authorized officer'
                              : '3 pending approval'}
                          </div>
                        </div>
                        <button className="btn btn-p btn-sm" onClick={() => nav('cert-approve')}>
                          Review
                        </button>
                      </div>
                    </div>
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ct">💬 {role === 'admin' ? 'Unread Feedback (5)' : 'Resident Feedback'}</div>
                          <div className="cm">
                            {role === 'admin'
                              ? 'Resident submissions awaiting response'
                              : '5 unread submissions'}
                          </div>
                        </div>
                        <button className="btn btn-g btn-sm" onClick={() => nav('feedback')}>
                          {role === 'admin' ? 'View All' : 'Review'}
                        </button>
                      </div>
                    </div>
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ct">🚨 Open Blotter Cases {role === 'admin' ? '(4)' : ''}</div>
                          <div className="cm">
                            {role === 'admin'
                              ? 'Active cases requiring attention'
                              : '4 active cases'}
                          </div>
                        </div>
                        <button className="btn btn-g btn-sm" onClick={() => nav('blotter-manage')}>
                          {role === 'admin' ? 'Manage' : 'Manage'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: Activity / Audit Trail */}
                  <div>
                    <div
                      style={{
                        fontSize: '12px', fontWeight: 700, color: 'var(--muted)',
                        marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}
                    >
                      {role === 'admin' ? 'Recent Audit Trail' : 'Recent Activity'}
                    </div>
                    <div className="tw">
                      {role === 'staff' ? (
                        <>
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--accent-bg)' }}>📝</div>
                            <div className="al-body">
                              <div className="al-act">Certificate Issued — Clearance</div>
                              <div className="al-det">Lim, Ana G. · CERT-2024-088</div>
                            </div>
                            <div className="al-t">09:14</div>
                          </div>
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--green-bg)' }}>📦</div>
                            <div className="al-body">
                              <div className="al-act">Aid Entry — Rice Distribution</div>
                              <div className="al-det">Cruz, Ramon P. · Purok 2</div>
                            </div>
                            <div className="al-t">09:02</div>
                          </div>
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--red-bg)' }}>🚨</div>
                            <div className="al-body">
                              <div className="al-act">Blotter Filed — Noise Complaint</div>
                              <div className="al-det">Case BLT-2024-041 · Purok 5</div>
                            </div>
                            <div className="al-t">08:30</div>
                          </div>
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--teal-bg)' }}>🔄</div>
                            <div className="al-body">
                              <div className="al-act">Offline Sync Completed</div>
                              <div className="al-det">14 records synced from CouchDB</div>
                            </div>
                            <div className="al-t">07:45</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--accent-bg)' }}>📝</div>
                            <div style={{ flex: 1 }}>
                              <div className="al-a">APPROVE_CERT — CERT-2024-088</div>
                              <div className="al-d">Juhairo Macabangon · Approved for Lim, Ana G.</div>
                            </div>
                            <div className="al-t">09:14</div>
                          </div>
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--teal-bg)' }}>🔄</div>
                            <div style={{ flex: 1 }}>
                              <div className="al-a">SYNC_OFFLINE — 14 records</div>
                              <div className="al-d">Jay Napagal · CouchDB sync completed</div>
                            </div>
                            <div className="al-t">07:45</div>
                          </div>
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--amber-bg)' }}>⚠️</div>
                            <div style={{ flex: 1 }}>
                              <div className="al-a">CONFLICT_FLAGGED — RES-0412</div>
                              <div className="al-d">2 device revisions conflict on purok field</div>
                            </div>
                            <div className="al-t">08:10</div>
                          </div>
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--red-bg)' }}>🚨</div>
                            <div style={{ flex: 1 }}>
                              <div className="al-a">CREATE_BLOTTER — BLT-2024-041</div>
                              <div className="al-d">Mark Cortero · Noise complaint Purok 5</div>
                            </div>
                            <div className="al-t">08:30</div>
                          </div>
                        </>
                      )}
                    </div>
                    {role === 'admin' && (
                      <button
                        className="btn btn-g btn-sm"
                        onClick={() => nav('audit')}
                        style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
                      >
                        View Full Audit Log →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: MANAGE RESIDENTS
                ════════════════════════════════════════ */}
            {screen === 'residents' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Manage Residents</div>
                    <div className="ps">1,248 registered residents in Barangay Bustrac</div>
                  </div>
                  <button className="btn btn-p" onClick={() => nav('add-resident')}>
                    ＋ Add Resident
                  </button>
                </div>
                <div className="tw">
                  <div className="tb">
                    <div className="sb-box">
                      <span>🔍</span>
                      <input placeholder="Search by name, purok, ID..." />
                    </div>
                    <select className="fc" style={{ width: '130px' }}>
                      <option>All Puroks</option>
                      <option>Purok 1</option><option>Purok 2</option>
                      <option>Purok 3</option><option>Purok 4</option><option>Purok 5</option>
                    </select>
                    <select className="fc" style={{ width: '110px' }}>
                      <option>All Gender</option><option>Male</option><option>Female</option>
                    </select>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Resident ID</th><th>Full Name</th><th>Purok</th>
                        <th>Age</th><th>Civil Status</th><th>Voter</th>
                        {role === 'admin' && <th>Household</th>}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={monoMuted}>RES-0001</td>
                        <td><strong>Santos, Maria D.</strong></td>
                        <td><span className="badge b">Purok 3</span></td>
                        <td>34</td><td>Married</td>
                        <td><span className="badge g">✓ Yes</span></td>
                        {role === 'admin' && <td>HH-0012</td>}
                        <td>
                          <button className="btn btn-g btn-sm">Edit</button>
                          {role === 'admin' && <> <button className="btn btn-g btn-sm">View</button></>}
                        </td>
                      </tr>
                      <tr>
                        <td style={monoMuted}>RES-0002</td>
                        <td><strong>Reyes, Juan B.</strong></td>
                        <td><span className="badge p">Purok 1</span></td>
                        <td>67</td><td>Widowed</td>
                        <td><span className="badge g">✓ Yes</span></td>
                        {role === 'admin' && <td>HH-0003</td>}
                        <td>
                          <button className="btn btn-g btn-sm">Edit</button>
                          {role === 'admin' && <> <button className="btn btn-g btn-sm">View</button></>}
                        </td>
                      </tr>
                      <tr>
                        <td style={monoMuted}>RES-0003</td>
                        <td><strong>Garcia, Ana L.</strong></td>
                        <td><span className="badge t">Purok 2</span></td>
                        <td>28</td><td>Single</td>
                        <td><span className="badge gr">✗ No</span></td>
                        {role === 'admin' && <td>HH-0007</td>}
                        <td>
                          <button className="btn btn-g btn-sm">Edit</button>
                          {role === 'admin' && <> <button className="btn btn-g btn-sm">View</button></>}
                        </td>
                      </tr>
                      <tr>
                        <td style={monoMuted}>RES-0412</td>
                        <td>
                          <strong>Dela Cruz, Maria</strong>{' '}
                          <span className="badge r" style={{ fontSize: '9px' }}>⚠ Conflict</span>
                        </td>
                        <td><span className="badge a">Purok ?</span></td>
                        <td>29</td><td>Married</td>
                        <td><span className="badge g">✓ Yes</span></td>
                        {role === 'admin' && <td>HH-0015</td>}
                        <td>
                          <button
                            className="btn btn-d btn-sm"
                            onClick={() => role === 'admin' ? nav('conflicts') : undefined}
                          >
                            Resolve
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: ADD RESIDENT
                ════════════════════════════════════════ */}
            {screen === 'add-resident' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Add New Resident</div>
                    <div className="ps">Fill in the resident's complete profile</div>
                  </div>
                  <button className="btn btn-g" onClick={() => nav('residents')}>← Back</button>
                </div>
                <form onSubmit={role === 'admin' ? submitAddResident : (e) => e.preventDefault()}>
                  <div className="fp">
                    <div className="fp-t">📋 Personal Information</div>
                    <div className="fg3">
                      <div className="fg">
                        <label className="fl">First Name</label>
                        <input
                          className="fc" placeholder="e.g. Maria" required
                          value={role === 'admin' ? residentForm.firstName : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('firstName', e.target.value) : undefined}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Middle Name</label>
                        <input
                          className="fc" placeholder="e.g. Dela Cruz" required
                          value={role === 'admin' ? residentForm.middleName : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('middleName', e.target.value) : undefined}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Last Name</label>
                        <input
                          className="fc" placeholder="e.g. Santos" required
                          value={role === 'admin' ? residentForm.lastName : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('lastName', e.target.value) : undefined}
                        />
                      </div>
                    </div>
                    <div className="fg2">
                      <div className="fg">
                        <label className="fl">Birthdate</label>
                        <input
                          className="fc" type="date" required
                          value={role === 'admin' ? residentForm.birthdate : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('birthdate', e.target.value) : undefined}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Gender</label>
                        <select
                          className="fc" required
                          value={role === 'admin' ? residentForm.gender : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('gender', e.target.value) : undefined}
                        >
                          <option value="">-- Select --</option>
                          <option>Male</option><option>Female</option>
                        </select>
                      </div>
                    </div>
                    <div className="fg2">
                      <div className="fg">
                        <label className="fl">Civil Status</label>
                        <select
                          className="fc" required
                          value={role === 'admin' ? residentForm.civilStatus : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('civilStatus', e.target.value) : undefined}
                        >
                          <option value="">-- Select --</option>
                          <option>Single</option><option>Married</option>
                          <option>Widowed</option><option>Separated</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl">Contact Number</label>
                        <input
                          className="fc" placeholder="09XX-XXX-XXXX" required
                          value={role === 'admin' ? residentForm.contact : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('contact', e.target.value) : undefined}
                        />
                      </div>
                    </div>
                    <div className="fg2">
                      <div className="fg">
                        <label className="fl">Purok</label>
                        <select
                          className="fc" required
                          value={role === 'admin' ? residentForm.purok : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('purok', e.target.value) : undefined}
                        >
                          <option value="">-- Select --</option>
                          <option>Purok 1</option><option>Purok 2</option>
                          <option>Purok 3</option><option>Purok 4</option><option>Purok 5</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl">Household</label>
                        <select
                          className="fc" required
                          value={role === 'admin' ? residentForm.household : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('household', e.target.value) : undefined}
                        >
                          <option value="">-- Select Household --</option>
                          <option>HH-0012 — Santos Family</option>
                          <option>HH-0003 — Reyes Family</option>
                        </select>
                      </div>
                    </div>
                    <div className="fg">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={role === 'admin' ? residentForm.voter : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('voter', e.target.checked) : undefined}
                        />{' '}
                        Registered Voter
                      </label>
                    </div>
                  </div>
                  <div className="note note-i" style={{ marginBottom: '14px' }}>
                    🔄 <strong>Offline mode ready:</strong> Record saved to local CouchDB and synced on reconnect.
                  </div>
                  <div className="fa">
                    <button type="submit" className="btn btn-p">💾 Save Resident</button>
                    <button type="button" className="btn btn-g" onClick={() => nav('residents')}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: MANAGE HOUSEHOLDS
                ════════════════════════════════════════ */}
            {screen === 'households' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Manage Households</div>
                    <div className="ps">342 households registered</div>
                  </div>
                  <button className="btn btn-p">＋ Add Household</button>
                </div>
                <div className="tw">
                  <div className="tb">
                    <div className="sb-box">
                      <span>🔍</span>
                      <input placeholder="Search household..." />
                    </div>
                    <select className="fc" style={{ width: '130px' }}><option>All Puroks</option></select>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th><th>Head of Family</th><th>Address</th>
                        <th>Purok</th><th>Members</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={mono10}>HH-0012</td><td>Santos, Pedro A.</td>
                        <td>No. 12, Rizal St.</td>
                        <td><span className="badge b">Purok 3</span></td><td>5</td>
                        <td><button className="btn btn-g btn-sm">View</button>{' '}<button className="btn btn-g btn-sm">Edit</button></td>
                      </tr>
                      <tr>
                        <td style={mono10}>HH-0003</td><td>Reyes, Elpidio R.</td>
                        <td>No. 3, Mabini Ave.</td>
                        <td><span className="badge p">Purok 1</span></td><td>3</td>
                        <td><button className="btn btn-g btn-sm">View</button>{' '}<button className="btn btn-g btn-sm">Edit</button></td>
                      </tr>
                      <tr>
                        <td style={mono10}>HH-0021</td><td>Lopez, Ricardo M.</td>
                        <td>No. 21, Bonifacio Rd.</td>
                        <td><span className="badge a">Purok 5</span></td><td>7</td>
                        <td><button className="btn btn-g btn-sm">View</button>{' '}<button className="btn btn-g btn-sm">Edit</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: CERTIFICATE REQUEST
                ════════════════════════════════════════ */}
            {screen === 'cert-req' && (
              <div className="screen active">
                <CertificateLifecycle />
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: ISSUANCE & PRINT
                ════════════════════════════════════════ */}
            {screen === 'cert-print' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Certificate Issuance &amp; Print</div>
                    <div className="ps">Generate and print approved certificates</div>
                  </div>
                </div>
                <div className="tc">
                  <div>
                    <div className="tw">
                      <table>
                        <thead>
                          <tr><th>Cert #</th><th>Resident</th><th>Type</th><th>Status</th><th></th></tr>
                        </thead>
                        <tbody>
                          {issuedCertificates.length === 0 ? (
                            <tr>
                              <td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)' }}>
                                No issued certificates available yet.
                              </td>
                            </tr>
                          ) : (
                            issuedCertificates.map((req) => {
                              const residentName = `${req.firstName || ''} ${req.lastName || ''}`.trim();
                              const certificateType = req.certificateType || req.certType || 'Certificate';
                              const status = req.status || 'Approved';
                              const isIssued = status === 'Issued';

                              return (
                                <tr
                                  key={req._id}
                                  onClick={() => setSelectedCertificate(req)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <td style={mono10}>{req._id}</td>
                                  <td>{residentName || 'Unnamed Resident'}</td>
                                  <td><span className="badge t">{certificateType}</span></td>
                                  <td>
                                    <span className={isIssued ? 'badge gr' : 'badge g'}>
                                      {isIssued ? 'Issued' : 'Approved'}
                                    </span>
                                  </td>
                                  <td>
                                    {isIssued ? (
                                      <button className="btn btn-g btn-sm" onClick={() => setSelectedCertificate(req)}>
                                        Reprint
                                      </button>
                                    ) : (
                                      <button
                                        className="btn btn-p btn-sm"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handlePrintRelease(req);
                                        }}
                                      >
                                        🖨️ Print
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="cert-p">
                      <h2>Republic of the Philippines</h2>
                      <h2>Barangay Bustrac</h2>
                      <h3>Municipality of Camarines Sur</h3>
                      <hr />
                      <h2 style={{ marginTop: '8px' }}>
                        {((selectedCertificate?.certificateType || selectedCertificate?.certType || 'CERTIFICATE').toString()).toUpperCase()}
                      </h2>
                      <hr />
                      <p style={{ marginTop: '10px' }}>
                        This is to certify that{' '}
                        <strong>{`${selectedCertificate?.firstName || ''} ${selectedCertificate?.lastName || ''}`.trim().toUpperCase() || 'RESIDENT NAME'}</strong>,
                        of legal age, a <em>bona fide</em> resident of Purok 2, Barangay Bustrac, has been found to be of{' '}
                        <strong>good moral character</strong> and has no derogatory record on file as of this date.
                      </p>
                      <p>
                        This certification is issued upon the request of the above-named person for{' '}
                        <strong>{selectedCertificate?.purpose || selectedCertificate?.certPurpose || 'the stated purpose'}</strong>{' '}
                        and for whatever legal purpose it may serve.
                      </p>
                      <div className="cert-sig">
                        Issued at Barangay Bustrac, {selectedCertificate?.updatedAt || selectedCertificate?.createdAt || 'Date Unavailable'}<br />
                        Cert. No.: <strong>{selectedCertificate?._id || '—'}</strong>
                        <strong>Hon. Barangay Captain</strong>
                        <div>Barangay Captain, Barangay Bustrac</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: DISTRIBUTION PROGRAMS
                ════════════════════════════════════════ */}
            {screen === 'programs' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Distribution Programs</div>
                    <div className="ps">Manage aid distribution programs</div>
                  </div>
                  <button className="btn btn-p">＋ New Program</button>
                </div>
                <div className="thc">
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="badge g">Active</span>
                      <span className="badge gr">Apr 2024</span>
                    </div>
                    <div className="ct">Ayuda Rice Distribution</div>
                    <div className="cm">PROG-2024-004</div>
                    <div className="prog" style={{ margin: '10px 0' }}>
                      <div className="prog-b" style={{ width: '65%' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>387/600 beneficiaries</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button className="btn btn-p btn-sm" onClick={() => nav('aid-encode')}>Encode</button>
                      <button className="btn btn-g btn-sm" onClick={() => nav('aid-logs')}>Logs</button>
                    </div>
                  </div>
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="badge gr">Completed</span>
                      <span className="badge gr">Mar 2024</span>
                    </div>
                    <div className="ct">Cash Assistance — DSWD</div>
                    <div className="cm">PROG-2024-003</div>
                    <div className="prog" style={{ margin: '10px 0' }}>
                      <div className="prog-b" style={{ width: '100%', background: 'linear-gradient(90deg,var(--green),var(--teal))' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>312/312 — Completed</div>
                  </div>
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="badge a">Upcoming</span>
                      <span className="badge gr">May 2024</span>
                    </div>
                    <div className="ct">Medical Assistance</div>
                    <div className="cm">PROG-2024-005</div>
                    <div className="prog" style={{ margin: '10px 0' }}>
                      <div className="prog-b" style={{ width: '0%' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Scheduled May 15</div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: ENCODE DISTRIBUTION
                ════════════════════════════════════════ */}
            {screen === 'aid-encode' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Encode Aid Distribution</div>
                    <div className="ps">Log a beneficiary entry for an active program</div>
                  </div>
                </div>
                <div className="tc">
                  <div className="fp">
                    <div className="fp-t">📦 Distribution Entry</div>
                    <div className="fg">
                      <label className="fl">Distribution Program</label>
                      <select className="fc"><option>Ayuda Rice Distribution (PROG-2024-004)</option></select>
                    </div>
                    <div className="fg">
                      <label className="fl">Beneficiary (Resident)</label>
                      <select className="fc">
                        <option>Santos, Maria D. (RES-0001) — Purok 3</option>
                        <option>Reyes, Juan B. (RES-0002) — Purok 1</option>
                      </select>
                    </div>
                    <div className="fg2">
                      <div className="fg">
                        <label className="fl">Aid Type</label>
                        <input className="fc" defaultValue="Rice — 5kg" />
                      </div>
                      <div className="fg">
                        <label className="fl">Quantity</label>
                        <input className="fc" type="number" defaultValue={1} />
                      </div>
                    </div>
                    <div className="fg">
                      <label className="fl">Remarks</label>
                      <textarea className="fc" placeholder="Optional notes..." />
                    </div>
                    <div className="note note-s" style={{ marginBottom: '12px' }}>
                      ✓ No duplicate — resident not yet recorded under this program.
                    </div>
                    <div className="fa">
                      <button className="btn btn-p">✔ Log Entry</button>
                    </div>
                  </div>
                  <div>
                    <div className="note note-e" style={{ marginBottom: '14px' }}>
                      ⚠ <strong>Duplicate Alert:</strong> Lopez, Pedro D. has already received aid under this program. Entry blocked.
                    </div>
                    <div className="tw">
                      <table>
                        <thead>
                          <tr><th>Resident</th><th>Aid</th><th>By</th><th>Time</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Cruz, Ramon P.</td><td>Rice 5kg</td><td>Cortero</td>
                            <td style={mono10}>09:02</td><td><span className="badge g">OK</span></td>
                          </tr>
                          <tr>
                            <td>Garcia, Ana L.</td><td>Rice 5kg</td><td>Napagal</td>
                            <td style={mono10}>08:55</td><td><span className="badge t">Synced</span></td>
                          </tr>
                          <tr>
                            <td>Lopez, Pedro D.</td><td>Rice 5kg</td><td>Amparado</td>
                            <td style={mono10}>08:40</td><td><span className="badge r">Duplicate</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: DISTRIBUTION LOGS
                ════════════════════════════════════════ */}
            {screen === 'aid-logs' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Aid Distribution Logs</div>
                    <div className="ps">Full transaction log</div>
                  </div>
                </div>
                <div className="tw">
                  <div className="tb">
                    <div className="sb-box">
                      <span>🔍</span><input placeholder="Search beneficiary..." />
                    </div>
                    <select className="fc" style={{ width: '180px' }}>
                      <option>All Programs</option><option>Ayuda Rice Distribution</option>
                    </select>
                    <select className="fc" style={{ width: '110px' }}>
                      <option>All Status</option><option>Normal</option><option>Duplicate</option>
                    </select>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Log #</th><th>Beneficiary</th><th>Program</th>
                        <th>Aid</th><th>Encoded By</th><th>Date/Time</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={mono10}>LOG-0041</td><td>Cruz, Ramon P.</td>
                        <td>Rice Distribution</td><td>Rice 5kg</td><td>Cortero</td>
                        <td style={{ fontSize: '10px' }}>Apr 7, 09:02</td>
                        <td><span className="badge g">Normal</span></td>
                      </tr>
                      <tr>
                        <td style={mono10}>LOG-0040</td><td>Garcia, Ana L.</td>
                        <td>Rice Distribution</td><td>Rice 5kg</td><td>Napagal</td>
                        <td style={{ fontSize: '10px' }}>Apr 7, 08:55</td>
                        <td><span className="badge t">Offline sync</span></td>
                      </tr>
                      <tr>
                        <td style={mono10}>LOG-0039</td><td>Lopez, Pedro D.</td>
                        <td>Rice Distribution</td><td>Rice 5kg</td><td>Amparado</td>
                        <td style={{ fontSize: '10px' }}>Apr 7, 08:40</td>
                        <td><span className="badge r">⚠ Duplicate</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: ADD BENEFICIARY (Admin only)
                ════════════════════════════════════════ */}
            {role === 'admin' && screen === 'add-beneficiary' && (
              <div className="screen active">
                <div className="ph">
                  <div className="pt">Add Beneficiaries</div>
                  <button className="btn btn-g" onClick={() => nav('aid-encode')}>← Back</button>
                </div>
                <div className="fp">
                  <div className="fp-t">📦 Add Beneficiary List</div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Full Name</label>
                      <input
                        className="fc" placeholder="Enter name"
                        value={beneficiaryDraft.name}
                        onChange={(e) => setBeneficiaryDraft((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl">Aid Type</label>
                      <input
                        className="fc"
                        value={beneficiaryDraft.aidType}
                        onChange={(e) => setBeneficiaryDraft((prev) => ({ ...prev, aidType: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Quantity</label>
                      <input
                        className="fc" type="number"
                        value={beneficiaryDraft.qty}
                        onChange={(e) => setBeneficiaryDraft((prev) => ({ ...prev, qty: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="fg" style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button className="btn btn-p" type="button" onClick={addToList}>＋ Add</button>
                    </div>
                  </div>
                </div>
                <div className="tw">
                  <div className="tb"><strong>📋 Beneficiary List</strong></div>
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Aid</th><th>Qty</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {beneficiaryList.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                            No beneficiaries added yet.
                          </td>
                        </tr>
                      ) : (
                        beneficiaryList.map((b, i) => (
                          <tr key={i}>
                            <td>{b.name}</td><td>{b.aidType}</td><td>{b.qty}</td>
                            <td>
                              <button className="btn btn-d btn-sm" onClick={() => removeFromList(i)}>Remove</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="fa">
                  <button className="btn btn-p" onClick={saveAll}>✔ Save All Beneficiaries</button>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: FILE BLOTTER ENTRY
                ════════════════════════════════════════ */}
            {screen === 'blotter-new' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">File Blotter Entry</div>
                    <div className="ps">Record a new incident in the digital blotter</div>
                  </div>
                </div>
                <div className="fp">
                  <div className="fp-t">🚨 Incident Details</div>
                  <div className="fg2">
                    <div className="fg"><label className="fl">Date of Incident</label><input className="fc" type="date" /></div>
                    <div className="fg"><label className="fl">Time</label><input className="fc" type="time" /></div>
                  </div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Incident Type</label>
                      <select className="fc">
                        <option>Noise Complaint</option><option>Physical Altercation</option>
                        <option>Property Dispute</option><option>Domestic Concern</option>
                        <option>Theft</option><option>Other</option>
                      </select>
                    </div>
                    <div className="fg"><label className="fl">Location</label><input className="fc" placeholder="e.g. Purok 5, near the court" /></div>
                  </div>
                </div>
                <div className="fp">
                  <div className="fp-t">Parties Involved</div>
                  <div className="fg2">
                    <div className="fg"><label className="fl">Complainant</label><input className="fc" placeholder="Full name" /></div>
                    <div className="fg"><label className="fl">Respondent</label><input className="fc" placeholder="Full name" /></div>
                  </div>
                  <div className="fg">
                    <label className="fl">Witnesses (Optional)</label>
                    <input className="fc" placeholder="Comma-separated names" />
                  </div>
                </div>
                <div className="fp">
                  <div className="fp-t">Narrative and Action</div>
                  <div className="fg">
                    <label className="fl">Incident Narrative</label>
                    <textarea className="fc" style={{ minHeight: '90px' }} placeholder="Describe the incident in detail..." />
                  </div>
                  <div className="fg">
                    <label className="fl">Action Taken by Barangay</label>
                    <textarea className="fc" placeholder="e.g. Summoned parties, conducted mediation..." />
                  </div>
                  <div className="fg">
                    <label className="fl">Initial Status</label>
                    <select className="fc">
                      <option>Open</option><option>Under Mediation</option>
                      <option>Resolved</option><option>Referred to Higher Authority</option>
                    </select>
                  </div>
                </div>
                <div className="fa">
                  <button className="btn btn-p">📋 File Blotter Entry</button>
                  <button className="btn btn-g">Cancel</button>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: MANAGE BLOTTER
                ════════════════════════════════════════ */}
            {screen === 'blotter-manage' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Blotter Records</div>
                    <div className="ps">Manage filed barangay cases</div>
                  </div>
                  <button className="btn btn-p" onClick={() => nav('blotter-new')}>＋ File Blotter</button>
                </div>
                <div className="tw">
                  <div className="tb">
                    <div className="sb-box"><span>🔍</span><input placeholder="Search case #, name..." /></div>
                    <select className="fc" style={{ width: '150px' }}>
                      <option>All Types</option><option>Noise Complaint</option><option>Property Dispute</option>
                    </select>
                    <select className="fc" style={{ width: '140px' }}>
                      <option>All Status</option><option>Open</option>
                      <option>Under Mediation</option><option>Resolved</option>
                    </select>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Case #</th><th>Type</th><th>Complainant</th><th>Respondent</th>
                        <th>Location</th><th>Date</th><th>Status</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={mono10}>BLT-2024-041</td><td>Noise Complaint</td>
                        <td>Reyes, Carmen</td><td>Torres, Mark</td><td>Purok 5</td>
                        <td style={{ fontSize: '10px' }}>Apr 7</td>
                        <td><span className="badge r">Open</span></td>
                        <td>
                          <button className="btn btn-g btn-sm" onClick={() => nav('blotter-detail')}>View</button>{' '}
                          <button className="btn btn-g btn-sm">Print</button>
                        </td>
                      </tr>
                      <tr>
                        <td style={mono10}>BLT-2024-040</td><td>Property Dispute</td>
                        <td>Santos, Jose</td><td>Cruz, Ana</td><td>Purok 2</td>
                        <td style={{ fontSize: '10px' }}>Apr 5</td>
                        <td><span className="badge a">Mediation</span></td>
                        <td>
                          <button className="btn btn-g btn-sm">Update</button>{' '}
                          <button className="btn btn-g btn-sm">Print</button>
                        </td>
                      </tr>
                      <tr>
                        <td style={mono10}>BLT-2024-038</td><td>Domestic Concern</td>
                        <td>Lim, Rosa</td><td>Lim, Carlos</td><td>Purok 1</td>
                        <td style={{ fontSize: '10px' }}>Apr 2</td>
                        <td><span className="badge g">Resolved</span></td>
                        <td>
                          <button className="btn btn-g btn-sm">View</button>{' '}
                          <button className="btn btn-g btn-sm">Print</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: BLOTTER DETAIL
                (Staff uses staffCase, Admin uses complaint)
                ════════════════════════════════════════ */}
            {screen === 'blotter-detail' && role === 'staff' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Complaint Details — BLT-2024-041</div>
                    <div className="ps">Noise Complaint · Open · Apr 7, 2024</div>
                  </div>
                  <button className="btn btn-g" onClick={() => nav('blotter-manage')}>← Back to List</button>
                </div>
                <div className="tc">
                  {/* LEFT COLUMN */}
                  <div>
                    <div className="fp">
                      <div className="fp-t">📋 Case Information</div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Case Number</label>
                          <input className="fc" value={staffCase.caseNum} disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                        <div>
                          <label className="fl">Status</label>
                          <select className="fc" value={staffCase.status} onChange={(e) => updateCase('status', e.target.value)}>
                            <option>Open</option><option>Under Mediation</option>
                            <option>Resolved</option><option>Referred</option>
                          </select>
                        </div>
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Date Filed</label>
                          <input className="fc" type="date" value={staffCase.dateFiled} onChange={(e) => updateCase('dateFiled', e.target.value)} />
                        </div>
                        <div>
                          <label className="fl">Time</label>
                          <input className="fc" type="time" value={staffCase.timeFiled} onChange={(e) => updateCase('timeFiled', e.target.value)} />
                        </div>
                      </div>
                      <div className="fg">
                        <label className="fl">Incident Type</label>
                        <select className="fc" value={staffCase.incidentType} onChange={(e) => updateCase('incidentType', e.target.value)}>
                          <option>Noise Complaint</option><option>Physical Altercation</option>
                          <option>Property Dispute</option><option>Domestic Concern</option>
                          <option>Theft</option><option>Other</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl">Location</label>
                        <input className="fc" value={staffCase.location} onChange={(e) => updateCase('location', e.target.value)} />
                      </div>
                    </div>
                    <div className="fp">
                      <div className="fp-t">👤 Complainant Information</div>
                      <div className="fg">
                        <label className="fl">Full Name</label>
                        <input className="fc" value={staffCase.compName} onChange={(e) => updateCase('compName', e.target.value)} />
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Resident ID</label>
                          <input className="fc" value={staffCase.compID} disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                        <div>
                          <label className="fl">Status</label>
                          <input className="fc" defaultValue="Registered Resident" disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Contact Number</label>
                          <input className="fc" value={staffCase.compContact} onChange={(e) => updateCase('compContact', e.target.value)} />
                        </div>
                        <div>
                          <label className="fl">Purok</label>
                          <select className="fc" value={staffCase.compPurok} onChange={(e) => updateCase('compPurok', e.target.value)}>
                            <option>Purok 5</option><option>Purok 1</option><option>Purok 2</option>
                            <option>Purok 3</option><option>Purok 4</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="fp">
                      <div className="fp-t">📝 Incident Details</div>
                      <div className="fg">
                        <label className="fl">Narrative</label>
                        <textarea className="fc" style={{ minHeight: '100px' }} value={staffCase.narrative} onChange={(e) => updateCase('narrative', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Status Notes</label>
                        <textarea className="fc" style={{ minHeight: '80px' }} value={staffCase.statusNotes} onChange={(e) => updateCase('statusNotes', e.target.value)} />
                      </div>
                    </div>
                  </div>
                  {/* RIGHT COLUMN */}
                  <div>
                    <div className="fp">
                      <div className="fp-t">⚠️ Respondent Information</div>
                      <div className="fg">
                        <label className="fl">Full Name</label>
                        <input className="fc" value={staffCase.respName} onChange={(e) => updateCase('respName', e.target.value)} />
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Resident ID</label>
                          <input className="fc" value={staffCase.respID} disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                        <div>
                          <label className="fl">Status</label>
                          <input className="fc" defaultValue="Registered Resident" disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                      </div>
                      <div className="fg">
                        <label className="fl">Contact Number (SMS)</label>
                        <input className="fc" value={staffCase.respContact} onChange={(e) => updateCase('respContact', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Email Address</label>
                        <input className="fc" type="email" value={staffCase.respEmail} onChange={(e) => updateCase('respEmail', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Address</label>
                        <input className="fc" value={staffCase.respAddress} onChange={(e) => updateCase('respAddress', e.target.value)} />
                      </div>
                    </div>
                    <div className="fp" style={{ borderLeft: '3px solid var(--accent)' }}>
                      <div className="fp-t">📨 Send Summons / Notification</div>
                      <div className="note note-i" style={{ marginBottom: '12px' }}>
                        Send official notification to respondent regarding this complaint and request their appearance at barangay hall.
                      </div>
                      <div className="fg">
                        <label className="fl">Scheduled Appearance Date</label>
                        <input className="fc" type="date" value={staffCase.summonDate} onChange={(e) => updateCase('summonDate', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Scheduled Time</label>
                        <input className="fc" type="time" value={staffCase.summonTime} onChange={(e) => updateCase('summonTime', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Message / Instructions</label>
                        <textarea className="fc" style={{ minHeight: '100px' }} value={staffCase.summonMsg} onChange={(e) => updateCase('summonMsg', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={staffCase.sendSMS} onChange={(e) => updateCase('sendSMS', e.target.checked)} />{' '}
                          <span>Send via SMS</span>
                        </label>
                      </div>
                      <div className="fg">
                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={staffCase.sendEmail} onChange={(e) => updateCase('sendEmail', e.target.checked)} />{' '}
                          <span>Send via Email</span>
                        </label>
                      </div>
                      <div className="note note-s" style={{ marginBottom: '12px' }}>
                        ✓ SMS and Email enabled. Notification will be recorded in audit log.
                      </div>
                      <div className="fa" style={{ flexDirection: 'column', gap: '8px' }}>
                        <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }} onClick={staffSendSummons}>
                          🔔 Send Summons Now
                        </button>
                        <button className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }}>Preview Message</button>
                      </div>
                    </div>
                    <div className="fp">
                      <div className="fp-t">📬 Communication History</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ padding: '10px', background: 'var(--surface2)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--green)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>✓ SMS Sent</div>
                          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>April 7, 11:15 AM · Initial complaint filed</div>
                        </div>
                        <div style={{ padding: '10px', background: 'var(--surface2)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--muted)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>Pending Summons</div>
                          <div style={{ fontSize: '10px', color: 'var(--hint)', marginTop: '2px' }}>Will be sent upon confirmation</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-s" onClick={staffSaveComplaintChanges}>💾 Save Changes</button>
                    <button className="btn btn-g" onClick={staffCancelEdit}>Cancel</button>
                    <button className="btn btn-a">📝 Schedule Mediation</button>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-g">📋 Update Status</button>
                    <button className="btn btn-g" onClick={() => nav('blotter-manage')}>Close &amp; Return</button>
                  </div>
                </div>
              </div>
            )}

            {screen === 'blotter-detail' && role === 'admin' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Complaint Details — BLT-2024-041</div>
                    <div className="ps">Noise Complaint · Open · Apr 7, 2024</div>
                  </div>
                  <button className="btn btn-g" onClick={() => nav('blotter-manage')}>← Back to List</button>
                </div>
                <div className="tc">
                  {/* LEFT COLUMN */}
                  <div>
                    <div className="fp">
                      <div className="fp-t">📋 Case Information</div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Case Number</label>
                          <input className="fc" value={complaint.caseNum} disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                        <div>
                          <label className="fl">Status</label>
                          <select className="fc" value={complaint.caseStatus} onChange={(e) => updateComplaintField('caseStatus', e.target.value)}>
                            <option>Open</option><option>Under Mediation</option>
                            <option>Resolved</option><option>Referred</option>
                          </select>
                        </div>
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Date Filed</label>
                          <input className="fc" type="date" value={complaint.dateFiled} onChange={(e) => updateComplaintField('dateFiled', e.target.value)} />
                        </div>
                        <div>
                          <label className="fl">Time</label>
                          <input className="fc" type="time" value={complaint.timeFiled} onChange={(e) => updateComplaintField('timeFiled', e.target.value)} />
                        </div>
                      </div>
                      <div className="fg">
                        <label className="fl">Incident Type</label>
                        <select className="fc" value={complaint.incidentType} onChange={(e) => updateComplaintField('incidentType', e.target.value)}>
                          <option>Noise Complaint</option><option>Physical Altercation</option>
                          <option>Property Dispute</option><option>Domestic Concern</option>
                          <option>Theft</option><option>Other</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl">Location</label>
                        <input className="fc" value={complaint.location} onChange={(e) => updateComplaintField('location', e.target.value)} />
                      </div>
                    </div>
                    <div className="fp">
                      <div className="fp-t">👤 Complainant Information</div>
                      <div className="fg">
                        <label className="fl">Full Name</label>
                        <input className="fc" value={complaint.compName} onChange={(e) => updateComplaintField('compName', e.target.value)} />
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Resident ID</label>
                          <input className="fc" value={complaint.compID} disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                        <div>
                          <label className="fl">Status</label>
                          <input className="fc" value="Registered Resident" disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Contact Number</label>
                          <input className="fc" value={complaint.compContact} onChange={(e) => updateComplaintField('compContact', e.target.value)} />
                        </div>
                        <div>
                          <label className="fl">Purok</label>
                          <select className="fc" value={complaint.compPurok} onChange={(e) => updateComplaintField('compPurok', e.target.value)}>
                            <option>Purok 5</option><option>Purok 1</option><option>Purok 2</option>
                            <option>Purok 3</option><option>Purok 4</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="fp">
                      <div className="fp-t">📝 Incident Details</div>
                      <div className="fg">
                        <label className="fl">Narrative</label>
                        <textarea className="fc" style={{ minHeight: '100px' }} value={complaint.narrative} onChange={(e) => updateComplaintField('narrative', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Status Notes</label>
                        <textarea className="fc" style={{ minHeight: '80px' }} value={complaint.statusNotes} onChange={(e) => updateComplaintField('statusNotes', e.target.value)} />
                      </div>
                    </div>
                  </div>
                  {/* RIGHT COLUMN */}
                  <div>
                    <div className="fp">
                      <div className="fp-t">⚠️ Respondent Information</div>
                      <div className="fg">
                        <label className="fl">Full Name</label>
                        <input className="fc" value={complaint.respName} onChange={(e) => updateComplaintField('respName', e.target.value)} />
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Resident ID</label>
                          <input className="fc" value={complaint.respID} disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                        <div>
                          <label className="fl">Status</label>
                          <input className="fc" value="Registered Resident" disabled readOnly style={{ background: 'var(--surface2)', color: 'var(--muted)' }} />
                        </div>
                      </div>
                      <div className="fg">
                        <label className="fl">Contact Number (SMS)</label>
                        <input className="fc" value={complaint.respContact} onChange={(e) => updateComplaintField('respContact', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Email Address</label>
                        <input className="fc" type="email" value={complaint.respEmail} onChange={(e) => updateComplaintField('respEmail', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Address</label>
                        <input className="fc" value={complaint.respAddress} onChange={(e) => updateComplaintField('respAddress', e.target.value)} />
                      </div>
                    </div>
                    <div className="fp" style={{ borderLeft: '4px solid var(--accent)' }}>
                      <div className="fp-t">📨 Send Summons / Notification</div>
                      <div className="note note-i" style={{ marginBottom: '12px' }}>
                        Send official notification to respondent regarding this complaint and request their appearance at barangay hall.
                      </div>
                      <div className="fg">
                        <label className="fl">Scheduled Appearance Date</label>
                        <input className="fc" type="date" value={complaint.summonDate} onChange={(e) => updateComplaintField('summonDate', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Scheduled Time</label>
                        <input className="fc" type="time" value={complaint.summonTime} onChange={(e) => updateComplaintField('summonTime', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label className="fl">Message / Instructions</label>
                        <textarea className="fc" style={{ minHeight: '100px' }} value={complaint.summonMsg} onChange={(e) => updateComplaintField('summonMsg', e.target.value)} />
                      </div>
                      <div className="fg">
                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={complaint.sendSMS} onChange={(e) => updateComplaintField('sendSMS', e.target.checked)} />{' '}
                          <span>Send via SMS</span>
                        </label>
                      </div>
                      <div className="fg">
                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={complaint.sendEmail} onChange={(e) => updateComplaintField('sendEmail', e.target.checked)} />{' '}
                          <span>Send via Email</span>
                        </label>
                      </div>
                      <div className="note note-s" style={{ marginBottom: '12px' }}>
                        ✓ SMS and Email enabled. Notification will be recorded in audit log.
                      </div>
                      <div className="fa" style={{ flexDirection: 'column', gap: '8px' }}>
                        <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }} onClick={sendSummons}>
                          🔔 Send Summons Now
                        </button>
                        <button className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }}>Preview Message</button>
                      </div>
                    </div>
                    <div className="fp">
                      <div className="fp-t">📬 Communication History</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ padding: '10px', background: 'var(--surface2)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--green)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>✓ SMS Sent</div>
                          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>April 7, 11:15 AM · Initial complaint filed</div>
                        </div>
                        <div style={{ padding: '10px', background: 'var(--surface2)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--muted)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>Pending Summons</div>
                          <div style={{ fontSize: '10px', color: 'var(--hint)', marginTop: '2px' }}>Will be sent upon confirmation</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button className="btn btn-s" onClick={saveComplaintChanges}>💾 Save Changes</button>
                  <button className="btn btn-g" onClick={cancelEdit}>Cancel</button>
                  <button className="btn btn-a" style={{ marginLeft: 'auto' }}>📝 Schedule Mediation</button>
                  <button className="btn btn-g">📋 Update Status</button>
                  <button className="btn btn-g" onClick={() => nav('blotter-manage')}>Close &amp; Return</button>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: ANNOUNCEMENTS
                ════════════════════════════════════════ */}
            {screen === 'announcements' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Announcements</div>
                    <div className="ps">Post and manage barangay notices</div>
                  </div>
                  <button className="btn btn-p">＋ New</button>
                </div>
                <div className="tc">
                  <div className="fp">
                    <div className="fp-t">📢 Post Announcement</div>
                    <div className="fg"><label className="fl">Title</label><input className="fc" placeholder="Announcement title" /></div>
                    <div className="fg">
                      <label className="fl">Category</label>
                      <select className="fc">
                        <option>General</option><option>Health</option>
                        <option>Security</option><option>Events</option><option>Governance</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label className="fl">Content</label>
                      <textarea className="fc" style={{ minHeight: '90px' }} placeholder="Write your announcement..." />
                    </div>
                    <div className="fg">
                      <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" /> Pin to top
                      </label>
                    </div>
                    <div className="fa">
                      <button className="btn btn-p">Publish</button>
                      <button className="btn btn-g">Save Draft</button>
                    </div>
                  </div>
                  <div>
                    <div className="ann pinned">
                      <div className="ann-cat" style={{ color: 'var(--amber)' }}>📌 Health</div>
                      <div className="ann-t">Free Medical Mission — Apr 15</div>
                      <div className="ann-b">Free consultation, blood pressure check, medicine dispensing. All residents welcome. Bring valid ID.</div>
                      <div className="ann-f">Posted by Cortero · Apr 5</div>
                    </div>
                    <div className="ann">
                      <div className="ann-cat" style={{ color: 'var(--accent)' }}>🏛️ Governance</div>
                      <div className="ann-t">Barangay Assembly — Apr 20</div>
                      <div className="ann-b">Quarterly assembly at 8:00 AM, covered court. All residents are encouraged to attend.</div>
                      <div className="ann-f">Posted by Napagal · Apr 4</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: FEEDBACK & COMPLAINTS
                ════════════════════════════════════════ */}
            {screen === 'feedback' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Feedback &amp; Complaints</div>
                    <div className="ps">Manage resident submissions</div>
                  </div>
                </div>
                <div className="tw">
                  <div className="tb">
                    <div className="sb-box"><span>🔍</span><input placeholder="Search..." /></div>
                    <select className="fc" style={{ width: '120px' }}>
                      <option>All Types</option><option>Complaint</option>
                      <option>Suggestion</option><option>Inquiry</option>
                    </select>
                    <select className="fc" style={{ width: '130px' }}>
                      <option>All Status</option><option>Pending</option><option>Resolved</option>
                    </select>
                  </div>
                  <table>
                    <thead>
                      <tr><th>#</th><th>From</th><th>Type</th><th>Subject</th><th>Date</th><th>Status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={mono10}>FB-041</td><td>Santos, Maria</td>
                        <td><span className="badge r">Complaint</span></td>
                        <td style={{ fontSize: '11px' }}>Garbage not collected in Purok 3</td>
                        <td style={{ fontSize: '10px' }}>Apr 7</td>
                        <td><span className="badge a">Pending</span></td>
                        <td><button className="btn btn-p btn-sm">Respond</button></td>
                      </tr>
                      <tr>
                        <td style={mono10}>FB-040</td><td>Reyes, Juan</td>
                        <td><span className="badge b">Suggestion</span></td>
                        <td style={{ fontSize: '11px' }}>Additional streetlights in Purok 1</td>
                        <td style={{ fontSize: '10px' }}>Apr 6</td>
                        <td><span className="badge a">Under Review</span></td>
                        <td><button className="btn btn-g btn-sm">View</button></td>
                      </tr>
                      <tr>
                        <td style={mono10}>FB-039</td><td>Garcia, Ana</td>
                        <td><span className="badge p">Inquiry</span></td>
                        <td style={{ fontSize: '11px' }}>How to apply for clearance online?</td>
                        <td style={{ fontSize: '10px' }}>Apr 5</td>
                        <td><span className="badge g">Resolved</span></td>
                        <td><button className="btn btn-g btn-sm">View</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: CONFLICT RESOLUTION (Admin only)
                ════════════════════════════════════════ */}
            {role === 'admin' && screen === 'conflicts' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Conflict Resolution</div>
                    <div className="ps">CouchDB sync conflicts pending administrative review — data held, not overwritten</div>
                  </div>
                </div>
                <div className="note note-w" style={{ marginBottom: '20px' }}>
                  ⚠ <strong>2 conflicts detected.</strong> Records modified on multiple offline devices simultaneously. No data has been overwritten. Select the correct version or keep both.
                </div>

                <div className="cf-card">
                  <div className="cf-hdr">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: '13px' }}>⚠ Conflict #1</span>
                      <span className="badge g" style={{ fontSize: '10px' }}>residents</span>
                      <span className="badge gr" style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>RES-0412</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-s btn-sm">Keep Version A</button>
                      <button className="btn btn-g btn-sm">Keep Version B</button>
                      <button className="btn btn-a btn-sm">Keep Both</button>
                    </div>
                  </div>
                  <div className="cf-vs">
                    <div className="cf-v">
                      <div className="cf-vl">Version A — Cortero, Mark · Device 1 · 08:10 AM</div>
                      <div className="cf-vf"><span>Name:</span>Maria Dela Cruz Santos</div>
                      <div className="cf-vf"><span>Purok:</span><strong>Purok 3</strong></div>
                      <div className="cf-vf"><span>Civil Status:</span>Married</div>
                      <div className="cf-vf"><span>Contact:</span>09171234567</div>
                    </div>
                    <div className="cf-v">
                      <div className="cf-vl">Version B — Napagal, Jay · Device 2 · 08:15 AM</div>
                      <div className="cf-vf"><span>Name:</span>Maria Dela Cruz Santos</div>
                      <div className="cf-vf"><span>Purok:</span><strong>Purok 4</strong></div>
                      <div className="cf-vf"><span>Civil Status:</span>Married</div>
                      <div className="cf-vf"><span>Contact:</span>09171234567</div>
                    </div>
                  </div>
                </div>

                <div className="cf-card">
                  <div className="cf-hdr">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: '13px' }}>⚠ Conflict #2</span>
                      <span className="badge a" style={{ fontSize: '10px' }}>aid_distributions</span>
                      <span className="badge gr" style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>LOG-0039</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-s btn-sm">Keep Version A</button>
                      <button className="btn btn-g btn-sm">Keep Version B</button>
                      <button className="btn btn-a btn-sm">Keep Both</button>
                    </div>
                  </div>
                  <div className="cf-vs">
                    <div className="cf-v">
                      <div className="cf-vl">Version A — Regaspi, Mark · Device 1 · 09:00 AM</div>
                      <div className="cf-vf"><span>Beneficiary:</span>Lopez, Pedro D.</div>
                      <div className="cf-vf"><span>Aid Type:</span><strong>Rice 5kg</strong></div>
                      <div className="cf-vf"><span>Quantity:</span>1</div>
                    </div>
                    <div className="cf-v">
                      <div className="cf-vl">Version B — Amparado, Ken · Device 2 · 09:05 AM</div>
                      <div className="cf-vf"><span>Beneficiary:</span>Lopez, Pedro D.</div>
                      <div className="cf-vf"><span>Aid Type:</span><strong>Rice 10kg</strong></div>
                      <div className="cf-vf"><span>Quantity:</span>1</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: AUDIT LOG (Admin only)
                ════════════════════════════════════════ */}
            {role === 'admin' && screen === 'audit' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Audit Log</div>
                    <div className="ps">Complete immutable transaction history (append-only, no deletions permitted)</div>
                  </div>
                </div>
                <div className="tw">
                  <div className="tb">
                    <div className="sb-box"><span>🔍</span><input placeholder="Search user, action, module..." /></div>
                    <select className="fc" style={{ width: '150px' }}>
                      <option>All Modules</option><option>Residents</option>
                      <option>Certificates</option><option>Aid Distribution</option><option>Blotter</option>
                    </select>
                    <select className="fc" style={{ width: '130px' }}>
                      <option>All Actions</option><option>CREATE</option><option>UPDATE</option>
                      <option>APPROVE</option><option>LOGIN</option><option>SYNC</option><option>RESOLVE</option>
                    </select>
                  </div>
                  {[
                    { ico: '📝', bg: 'var(--accent-bg)', a: 'APPROVE_CERT — certificates · CERT-2024-088', d: 'User: Juhairo Macabangon (Admin) · Approved for Lim, Ana G.', badge: 'online', bClass: 't', t: 'Apr 7, 09:14' },
                    { ico: '🔄', bg: 'var(--teal-bg)',   a: 'SYNC_OFFLINE — residents · 14 records',       d: 'User: Jay Napagal (Staff) · CouchDB replication from device 192.168.1.14', badge: 'offline sync', bClass: 'b', t: 'Apr 7, 07:45' },
                    { ico: '⚠️', bg: 'var(--amber-bg)',  a: 'RESOLVE_CONFLICT — residents · RES-0412',      d: 'User: Juhairo Macabangon (Admin) · Retained Version A (Purok 3)', badge: 'online', bClass: 'g', t: 'Apr 7, 08:20' },
                    { ico: '🚨', bg: 'var(--red-bg)',    a: 'CREATE_BLOTTER — blotter · BLT-2024-041',      d: 'User: Mark Cortero (Staff) · Noise complaint, Purok 5', badge: 'online', bClass: 'g', t: 'Apr 7, 08:30' },
                    { ico: '🔑', bg: 'var(--accent-bg)', a: 'LOGIN — system',                               d: 'User: Juhairo Macabangon (Admin) · IP: 192.168.1.12 · Chrome/Windows', badge: 'online', bClass: 'g', t: 'Apr 7, 07:30' },
                    { ico: '⚡', bg: 'var(--red-bg)',    a: 'FLAG_DUPLICATE — aid_distributions · LOG-0039', d: 'User: Ken Amparado (Staff) · Lopez, Pedro D. flagged under Rice Distribution', badge: 'online', bClass: 'g', t: 'Apr 7, 08:40' },
                  ].map((row, i) => (
                    <div key={i} className="al-row">
                      <div className="al-ico" style={{ background: row.bg }}>{row.ico}</div>
                      <div style={{ flex: 1 }}>
                        <div className="al-a">{row.a}</div>
                        <div className="al-d">{row.d}</div>
                      </div>
                      <div>
                        <span className={`badge ${row.bClass}`} style={{ fontSize: '9px', marginBottom: '3px', display: 'flex' }}>{row.badge}</span>
                        <div className="al-t">{row.t}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: MANAGE USERS (Admin only)
                ════════════════════════════════════════ */}
            {role === 'admin' && screen === 'users' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Manage Users</div>
                    <div className="ps">User accounts, roles, and access management</div>
                  </div>
                  <button className="btn btn-p">＋ Add User</button>
                </div>
                <div className="tw">
                  <div className="tb">
                    <div className="sb-box"><span>🔍</span><input placeholder="Search users..." /></div>
                    <select className="fc" style={{ width: '130px' }}>
                      <option>All Roles</option><option>Admin</option>
                      <option>Barangay Captain</option><option>Staff</option><option>Resident</option>
                    </select>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>User ID</th><th>Full Name</th><th>Username</th>
                        <th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { id: 'USR-001', name: 'Macabangon, Juhairo B.',   uname: 'jmacabangon', role: 'Admin',    rClass: 'r', status: 'Active', last: 'Apr 7, 07:30' },
                        { id: 'USR-002', name: 'Cortero, Mark Gian A.',    uname: 'mgcortero',   role: 'Staff',   rClass: 'p', status: 'Active', last: 'Apr 7, 08:00' },
                        { id: 'USR-003', name: 'Napagal, Jay O.',          uname: 'jonapagal',   role: 'Staff',   rClass: 'p', status: 'Active', last: 'Apr 7, 07:45' },
                        { id: 'USR-004', name: 'Regaspi, Mark Denver S.',  uname: 'mdregaspi',   role: 'Staff',   rClass: 'p', status: 'Active', last: 'Apr 6, 05:00' },
                        { id: 'USR-005', name: 'Amparado, Ken Jette T.',   uname: 'kjamparado',  role: 'Staff',   rClass: 'p', status: 'Active', last: 'Apr 7, 09:00' },
                        { id: 'USR-006', name: 'Santos, Maria D.',         uname: 'mdsantos',    role: 'Resident', rClass: 't', status: 'Active', last: 'Apr 5, 10:00' },
                      ].map((u) => (
                        <tr key={u.id}>
                          <td style={monoMuted}>{u.id}</td>
                          <td><strong>{u.name}</strong></td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{u.uname}</td>
                          <td><span className={`badge ${u.rClass}`}>{u.role}</span></td>
                          <td><span className="badge g">{u.status}</span></td>
                          <td style={{ fontSize: '10px' }}>{u.last}</td>
                          <td>
                            <button className="btn btn-g btn-sm">Edit</button>
                            {u.role !== 'Admin' && <> <button className="btn btn-d btn-sm">Deactivate</button></>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: GENERATE REPORTS
                ════════════════════════════════════════ */}
            {screen === 'reports' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Generate Reports</div>
                    <div className="ps">
                      {role === 'admin'
                        ? 'Printable reports for all modules — admin full access'
                        : 'Printable summary reports for all modules'}
                    </div>
                  </div>
                </div>
                <div className="thc">
                  {[
                    { icon: '📝', title: 'Certificate Issuance',  desc: 'Monthly issuance summary by type',   select: ['April 2024', 'March 2024'] },
                    { icon: '📦', title: 'Aid Distribution',       desc: 'Beneficiary list per program',       select: ['Ayuda Rice Distribution'] },
                    { icon: '👥', title: 'Resident Registry',      desc: 'Full resident list by purok',        select: ['All Puroks'] },
                    { icon: '🚨', title: 'Blotter Summary',        desc: 'Cases grouped by type and status',   select: ['April 2024'] },
                    { icon: '💬', title: 'Feedback Report',        desc: 'Concern submissions and resolutions', select: ['All Status'] },
                    { icon: '🏠', title: 'Household Registry',     desc: 'Household listing by purok',         select: ['All Puroks'] },
                    ...(role === 'admin'
                      ? [{ icon: '🔍', title: 'Audit Trail Report', desc: 'Admin-only — full system log', select: ['April 2024'] }]
                      : []),
                  ].map((r) => (
                    <div key={r.title} className="card">
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{r.icon}</div>
                      <div className="ct">{r.title}</div>
                      <div className="cm" style={{ marginBottom: '10px' }}>{r.desc}</div>
                      <select className="fc" style={{ marginBottom: '10px' }}>
                        {r.select.map((o) => <option key={o}>{o}</option>)}
                      </select>
                      <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                        Generate PDF
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>{/* /content */}
        </div>{/* /main */}
      </div>{/* /app */}
    </div>/* /dashboard-shell-container */
  );
}
