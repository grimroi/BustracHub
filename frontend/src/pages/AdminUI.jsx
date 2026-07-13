import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import './AdminUI.css';

// Screen id -> [title, subtitle] shown in the top bar
const SCREEN_META = {
  dashboard: ['Dashboard', 'Barangay Bustrac — Full System View'],
  residents: ['Manage Residents', 'Resident Registry Module'],
  'add-resident': ['Add New Resident', 'Resident Registry'],
  households: ['Manage Households', 'Resident Registry'],
  'cert-req': ['Certificate Request', 'Certificate Issuance Module'],
  'cert-approve': ['Certificate Approval', 'Certificate Issuance Module'],
  'cert-print': ['Issuance & Print', 'Certificate Issuance Module'],
  programs: ['Distribution Programs', 'Aid Distribution Module'],
  'aid-encode': ['Encode Distribution', 'Aid Distribution Module'],
  'aid-logs': ['Distribution Logs', 'Aid Distribution Module'],
  'add-beneficiary': ['Add Beneficiaries', 'Aid Distribution Module'],
  'blotter-new': ['File Blotter Entry', 'Blotter Module'],
  'blotter-manage': ['Manage Blotter Records', 'Blotter Module'],
  'blotter-detail': ['Complaint Details', 'Blotter Module — Case Management'],
  announcements: ['Announcements', 'Community Module'],
  feedback: ['Feedback & Complaints', 'Community Module'],
  conflicts: ['Conflict Resolution', 'Admin Only — CouchDB Sync Conflicts'],
  audit: ['Audit Log', 'Admin Only — Immutable Transaction History'],
  users: ['Manage Users', 'Admin Only — User Accounts & Roles'],
  reports: ['Generate Reports', 'Administration'],
};

const EMPTY_RESIDENT = {
  firstName: '',
  middleName: '',
  lastName: '',
  birthdate: '',
  gender: '',
  civilStatus: '',
  contact: '',
  purok: '',
  household: '',
  voter: false,
};

const INITIAL_COMPLAINT = {
  caseNum: 'BLT-2024-041',
  caseStatus: 'Open',
  dateFiled: '2024-04-07',
  timeFiled: '22:30',
  incidentType: 'Noise Complaint',
  location: 'Purok 5, Barangay Bustrac',
  compName: 'Reyes, Carmen P.',
  compID: 'RES-0156',
  compContact: '09171234567',
  compPurok: 'Purok 5',
  narrative:
    "Continuous loud music and karaoke from Torres residence every night until past midnight. Noise level disturbs neighboring families and children's sleep. This has been ongoing for 2 weeks. Request immediate barangay action.",
  statusNotes: 'No notes yet. Document action taken during mediation.',
  respName: 'Torres, Mark P.',
  respID: 'RES-0189',
  respContact: '09189876543',
  respEmail: 'mark.torres@email.com',
  respAddress: 'No. 45, Mag-asikaso St., Purok 5',
  summonDate: '2024-04-14',
  summonTime: '14:00',
  summonMsg:
    'You are hereby summoned to appear at Barangay Hall, Purok 5, on the scheduled date and time to discuss the complaint filed against you. Please bring any relevant documents or witnesses if applicable.',
  sendSMS: true,
  sendEmail: true,
};

export default function AdminUI() {
  const navigate = useNavigate();

  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [offline, setOffline] = useState(false);

  const [residentForm, setResidentForm] = useState(EMPTY_RESIDENT);
  const [complaint, setComplaint] = useState(INITIAL_COMPLAINT);

  const [beneficiaryDraft, setBeneficiaryDraft] = useState({
    name: '',
    aidType: 'Rice 5kg',
    qty: 1,
  });
  const [beneficiaryList, setBeneficiaryList] = useState([]);

  const nav = (id) => setActiveScreen(id);

  const toggleOff = () => setOffline((prev) => !prev);

  const handleLogout = () => navigate('/login');

  const updateResidentField = (field, value) =>
    setResidentForm((prev) => ({ ...prev, [field]: value }));

  const submitAddResident = (e) => {
    e.preventDefault();
    const {
      firstName,
      middleName,
      lastName,
      birthdate,
      gender,
      civilStatus,
      contact,
      purok,
      household,
    } = residentForm;

    if (
      !firstName ||
      !middleName ||
      !lastName ||
      !birthdate ||
      !gender ||
      !civilStatus ||
      !contact ||
      !purok ||
      !household
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

  const updateComplaintField = (field, value) =>
    setComplaint((prev) => ({ ...prev, [field]: value }));

  const saveComplaintChanges = () => {
    const { compName, respName, narrative, incidentType, status, location, caseStatus } =
      complaint;

    if (!compName || !respName || !narrative) {
      alert('Please fill in all required fields (names and narrative)');
      return;
    }

    alert(
      `✓ Complaint BLT-2024-041 updated successfully!\n\nChanges saved:\n• Complainant: ${compName}\n• Respondent: ${respName}\n• Incident Type: ${incidentType}\n• Status: ${caseStatus}\n• Location: ${location}\n\nAll changes recorded in audit log.`
    );
  };

  const cancelEdit = () => {
    if (confirm('Discard all unsaved changes?')) {
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
    if (sendSMS) methods.push('SMS');
    if (sendEmail) methods.push('Email');

    if (methods.length === 0) {
      alert('Please select at least one notification method');
      return;
    }

    const confirmMsg = `Send summons to ${respName} via ${methods.join(
      ' and '
    )}?\n\nAppearance: ${summonDate} at ${summonTime}\n\nThis action will be recorded in the audit log.`;

    if (confirm(confirmMsg)) {
      alert(
        `✓ Summons sent successfully via ${methods.join(
          ' and '
        )}!\n\nNotification recorded: BLT-2024-041\nRespondent: ${respName}\nScheduled: ${summonDate} ${summonTime}`
      );
    }
  };

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

  const [title, subtitle] = SCREEN_META[activeScreen] || [activeScreen, ''];

  return (
    <div className="admin-ui">
      <div className="app">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sb-logo">
            <img src={logo} alt="Barangay Bus Trac Official Seal" className="sb-logo-img" />
            <div>
              <div className="sb-title">Bustrac Hub</div>
              <div className="sb-sub">Administrator Portal</div>
            </div>
          </div>

          <nav className="sb-nav">
            <div className="sb-sec">Overview</div>
            <button
              className={`nb${activeScreen === 'dashboard' ? ' active' : ''}`}
              onClick={() => nav('dashboard')}
            >
              <span className="ni">📊</span>Dashboard
            </button>

            <div className="sb-sec">Residents</div>
            <button
              className={`nb${activeScreen === 'residents' ? ' active' : ''}`}
              onClick={() => nav('residents')}
            >
              <span className="ni">👥</span>Manage Residents
            </button>
            <button
              className={`nb${activeScreen === 'households' ? ' active' : ''}`}
              onClick={() => nav('households')}
            >
              <span className="ni">🏠</span>Manage Households
            </button>
            <button
              className={`nb${activeScreen === 'add-resident' ? ' active' : ''}`}
              onClick={() => nav('add-resident')}
            >
              <span className="ni">➕</span>Add Resident
            </button>

            <div className="sb-sec">Certificates</div>
            <button
              className={`nb${activeScreen === 'cert-req' ? ' active' : ''}`}
              onClick={() => nav('cert-req')}
            >
              <span className="ni">📝</span>Certificate Request
              <span className="nba nba-a">3</span>
            </button>
            <button
              className={`nb${activeScreen === 'cert-approve' ? ' active' : ''}`}
              onClick={() => nav('cert-approve')}
            >
              <span className="ni">✅</span>Cert. Approval
            </button>
            <button
              className={`nb${activeScreen === 'cert-print' ? ' active' : ''}`}
              onClick={() => nav('cert-print')}
            >
              <span className="ni">🖨️</span>Issuance & Print
            </button>

            <div className="sb-sec">Aid Distribution</div>
            <button
              className={`nb${activeScreen === 'programs' ? ' active' : ''}`}
              onClick={() => nav('programs')}
            >
              <span className="ni">📦</span>Programs
            </button>
            <button
              className={`nb${activeScreen === 'aid-encode' ? ' active' : ''}`}
              onClick={() => nav('aid-encode')}
            >
              <span className="ni">➕</span>Encode Distribution
            </button>
            <button
              className={`nb${activeScreen === 'aid-logs' ? ' active' : ''}`}
              onClick={() => nav('aid-logs')}
            >
              <span className="ni">📋</span>Distribution Logs
            </button>
            <button
              className={`nb${activeScreen === 'add-beneficiary' ? ' active' : ''}`}
              onClick={() => nav('add-beneficiary')}
            >
              ➕ Add Beneficiary
            </button>

            <div className="sb-sec">Blotter</div>
            <button
              className={`nb${activeScreen === 'blotter-new' ? ' active' : ''}`}
              onClick={() => nav('blotter-new')}
            >
              <span className="ni">🚨</span>File Blotter Entry
            </button>
            <button
              className={`nb${activeScreen === 'blotter-manage' ? ' active' : ''}`}
              onClick={() => nav('blotter-manage')}
            >
              <span className="ni">📂</span>Manage Blotter
              <span className="nba nba-r">2</span>
            </button>

            <div className="sb-sec">Community</div>
            <button
              className={`nb${activeScreen === 'announcements' ? ' active' : ''}`}
              onClick={() => nav('announcements')}
            >
              <span className="ni">📢</span>Announcements
            </button>
            <button
              className={`nb${activeScreen === 'feedback' ? ' active' : ''}`}
              onClick={() => nav('feedback')}
            >
              <span className="ni">💬</span>Feedback
              <span className="nba nba-r">5</span>
            </button>

            <div className="sb-sec">Admin Only</div>
            <button
              className={`nb${activeScreen === 'conflicts' ? ' active' : ''}`}
              onClick={() => nav('conflicts')}
            >
              <span className="ni">⚠️</span>Conflict Resolution
              <span className="nba nba-r">2</span>
            </button>
            <button
              className={`nb${activeScreen === 'audit' ? ' active' : ''}`}
              onClick={() => nav('audit')}
            >
              <span className="ni">🔍</span>Audit Log
            </button>
            <button
              className={`nb${activeScreen === 'users' ? ' active' : ''}`}
              onClick={() => nav('users')}
            >
              <span className="ni">🔐</span>Manage Users
            </button>
            <button
              className={`nb${activeScreen === 'reports' ? ' active' : ''}`}
              onClick={() => nav('reports')}
            >
              <span className="ni">📈</span>Generate Reports
            </button>
          </nav>

          <div className="sb-foot">
            <div className="sb-av">JM</div>
            <div>
              <div className="sb-uname">Juhairo Macabangon</div>
              <div className="sb-urole">Administrator</div>
            </div>
            <div
              className="odot"
              title="Online"
              style={
                offline
                  ? { background: '#FBBF24', boxShadow: '0 0 0 2px rgba(251,191,36,0.2)' }
                  : undefined
              }
            />
          </div>
        </aside>

        {/* MAIN */}
        <div className="main">
          <header className="topbar">
            <div style={{ flex: 1 }}>
              <div className="tb-t">{title}</div>
              <div className="tb-s">{subtitle}</div>
            </div>
            {offline && <div className="off-pill">📡 Offline — CouchDB local sync active</div>}
            <div className="role-admin">🔑 Admin</div>
            <button className="btn btn-g btn-sm" onClick={toggleOff}>
              Toggle Offline
            </button>
            <Link to="/login" className="btn btn-g btn-sm" onClick={handleLogout}>
              Sign Out
            </Link>
          </header>

          <div className="content">
            {/* DASHBOARD */}
            <div className={`screen${activeScreen === 'dashboard' ? ' active' : ''}`}>
              <div className="sg">
                <div className="sc">
                  <div className="si">👥</div>
                  <div className="sl">Residents</div>
                  <div className="sv" style={{ color: 'var(--pri)' }}>1,248</div>
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
                <div className="sc">
                  <div className="si">⚠️</div>
                  <div className="sl">Sync Conflicts</div>
                  <div className="sv" style={{ color: 'var(--orange)' }}>2</div>
                </div>
                <div className="sc">
                  <div className="si">💬</div>
                  <div className="sl">Feedback</div>
                  <div className="sv" style={{ color: 'var(--teal)' }}>5</div>
                </div>
                <div className="sc">
                  <div className="si">👤</div>
                  <div className="sl">Active Users</div>
                  <div className="sv" style={{ color: 'var(--muted)' }}>6</div>
                </div>
              </div>

              <div className="tc">
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--muted)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 10,
                    }}
                  >
                    Pending Admin Actions
                  </div>
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
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="ct">📝 Certificate Requests (3)</div>
                        <div className="cm">Pending approval by authorized officer</div>
                      </div>
                      <button className="btn btn-a btn-sm" onClick={() => nav('cert-approve')}>
                        Review
                      </button>
                    </div>
                  </div>
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="ct">💬 Unread Feedback (5)</div>
                        <div className="cm">Resident submissions awaiting response</div>
                      </div>
                      <button className="btn btn-g btn-sm" onClick={() => nav('feedback')}>
                        View All
                      </button>
                    </div>
                  </div>
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="ct">🚨 Open Blotter Cases (4)</div>
                        <div className="cm">Active cases requiring attention</div>
                      </div>
                      <button className="btn btn-g btn-sm" onClick={() => nav('blotter-manage')}>
                        Manage
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--muted)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 10,
                    }}
                  >
                    Recent Audit Trail
                  </div>
                  <div className="tw">
                    <div className="al-row">
                      <div className="al-ico" style={{ background: 'var(--pri-l)' }}>📝</div>
                      <div style={{ flex: 1 }}>
                        <div className="al-a">APPROVE_CERT — CERT-2024-088</div>
                        <div className="al-d">Juhairo Macabangon · Approved for Lim, Ana G.</div>
                      </div>
                      <div className="al-t">09:14</div>
                    </div>
                    <div className="al-row">
                      <div className="al-ico" style={{ background: 'var(--teal-l)' }}>🔄</div>
                      <div style={{ flex: 1 }}>
                        <div className="al-a">SYNC_OFFLINE — 14 records</div>
                        <div className="al-d">Jay Napagal · CouchDB sync completed</div>
                      </div>
                      <div className="al-t">07:45</div>
                    </div>
                    <div className="al-row">
                      <div className="al-ico" style={{ background: 'var(--amber-l)' }}>⚠️</div>
                      <div style={{ flex: 1 }}>
                        <div className="al-a">CONFLICT_FLAGGED — RES-0412</div>
                        <div className="al-d">2 device revisions conflict on purok field</div>
                      </div>
                      <div className="al-t">08:10</div>
                    </div>
                    <div className="al-row">
                      <div className="al-ico" style={{ background: 'var(--red-l)' }}>🚨</div>
                      <div style={{ flex: 1 }}>
                        <div className="al-a">CREATE_BLOTTER — BLT-2024-041</div>
                        <div className="al-d">Mark Cortero · Noise complaint Purok 5</div>
                      </div>
                      <div className="al-t">08:30</div>
                    </div>
                  </div>
                  <button
                    className="btn btn-g btn-sm"
                    onClick={() => nav('audit')}
                    style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                  >
                    View Full Audit Log →
                  </button>
                </div>
              </div>
            </div>

            {/* RESIDENTS */}
            <div className={`screen${activeScreen === 'residents' ? ' active' : ''}`}>
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
                    <input placeholder="Search name, purok, ID..." />
                  </div>
                  <select className="sf">
                    <option>All Puroks</option>
                    <option>Purok 1</option>
                    <option>Purok 2</option>
                    <option>Purok 3</option>
                    <option>Purok 4</option>
                    <option>Purok 5</option>
                  </select>
                  <select className="sf">
                    <option>All Gender</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Resident ID</th>
                      <th>Full Name</th>
                      <th>Purok</th>
                      <th>Age</th>
                      <th>Civil Status</th>
                      <th>Voter</th>
                      <th>Household</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>RES-0001</td>
                      <td><strong>Santos, Maria D.</strong></td>
                      <td><span className="badge bb">Purok 3</span></td>
                      <td>34</td>
                      <td>Married</td>
                      <td><span className="badge bg">✓ Yes</span></td>
                      <td>HH-0012</td>
                      <td>
                        <button className="btn btn-g btn-sm">Edit</button>{' '}
                        <button className="btn btn-g btn-sm">View</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>RES-0002</td>
                      <td><strong>Reyes, Juan B.</strong></td>
                      <td><span className="badge bp">Purok 1</span></td>
                      <td>67</td>
                      <td>Widowed</td>
                      <td><span className="badge bg">✓ Yes</span></td>
                      <td>HH-0003</td>
                      <td>
                        <button className="btn btn-g btn-sm">Edit</button>{' '}
                        <button className="btn btn-g btn-sm">View</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>RES-0003</td>
                      <td><strong>Garcia, Ana L.</strong></td>
                      <td><span className="badge bt">Purok 2</span></td>
                      <td>28</td>
                      <td>Single</td>
                      <td><span className="badge bk">✗ No</span></td>
                      <td>HH-0007</td>
                      <td>
                        <button className="btn btn-g btn-sm">Edit</button>{' '}
                        <button className="btn btn-g btn-sm">View</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>RES-0412</td>
                      <td>
                        <strong>Dela Cruz Santos, Maria</strong>{' '}
                        <span className="badge br" style={{ fontSize: 9 }}>⚠ Conflict</span>
                      </td>
                      <td><span className="badge ba">Purok ?</span></td>
                      <td>29</td>
                      <td>Married</td>
                      <td><span className="badge bg">✓ Yes</span></td>
                      <td>HH-0015</td>
                      <td>
                        <button className="btn btn-d btn-sm" onClick={() => nav('conflicts')}>
                          Resolve
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ADD RESIDENT */}
            <div className={`screen${activeScreen === 'add-resident' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Add New Resident</div>
                <button className="btn btn-g" onClick={() => nav('residents')}>
                  ← Back
                </button>
              </div>
              <form onSubmit={submitAddResident}>
                <div className="fp">
                  <div className="fp-t">📋 Personal Information</div>
                  <div className="fg3">
                    <div className="fg">
                      <label className="fl">First Name</label>
                      <input
                        className="fc"
                        placeholder="Maria"
                        required
                        value={residentForm.firstName}
                        onChange={(e) => updateResidentField('firstName', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl">Middle Name</label>
                      <input
                        className="fc"
                        placeholder="Dela Cruz"
                        required
                        value={residentForm.middleName}
                        onChange={(e) => updateResidentField('middleName', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl">Last Name</label>
                      <input
                        className="fc"
                        placeholder="Santos"
                        required
                        value={residentForm.lastName}
                        onChange={(e) => updateResidentField('lastName', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Birthdate</label>
                      <input
                        className="fc"
                        type="date"
                        required
                        value={residentForm.birthdate}
                        onChange={(e) => updateResidentField('birthdate', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl">Gender</label>
                      <select
                        className="fc"
                        required
                        value={residentForm.gender}
                        onChange={(e) => updateResidentField('gender', e.target.value)}
                      >
                        <option value="">-- Select --</option>
                        <option>Male</option>
                        <option>Female</option>
                      </select>
                    </div>
                  </div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Civil Status</label>
                      <select
                        className="fc"
                        required
                        value={residentForm.civilStatus}
                        onChange={(e) => updateResidentField('civilStatus', e.target.value)}
                      >
                        <option value="">-- Select --</option>
                        <option>Single</option>
                        <option>Married</option>
                        <option>Widowed</option>
                        <option>Separated</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label className="fl">Contact Number</label>
                      <input
                        className="fc"
                        placeholder="09XX-XXX-XXXX"
                        required
                        value={residentForm.contact}
                        onChange={(e) => updateResidentField('contact', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Purok</label>
                      <select
                        className="fc"
                        required
                        value={residentForm.purok}
                        onChange={(e) => updateResidentField('purok', e.target.value)}
                      >
                        <option value="">-- Select --</option>
                        <option>Purok 1</option>
                        <option>Purok 2</option>
                        <option>Purok 3</option>
                        <option>Purok 4</option>
                        <option>Purok 5</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label className="fl">Household</label>
                      <select
                        className="fc"
                        required
                        value={residentForm.household}
                        onChange={(e) => updateResidentField('household', e.target.value)}
                      >
                        <option value="">-- Select --</option>
                        <option>HH-0012 — Santos Family</option>
                      </select>
                    </div>
                  </div>
                  <div className="fg">
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={residentForm.voter}
                        onChange={(e) => updateResidentField('voter', e.target.checked)}
                      />{' '}
                      Registered Voter
                    </label>
                  </div>
                </div>
                <div className="note note-i" style={{ marginBottom: 14 }}>
                  🔄 <strong>Offline mode ready:</strong> Saved to local CouchDB instance, synced on reconnect.
                </div>
                <div className="fa">
                  <button type="submit" className="btn btn-p">💾 Save Resident</button>
                  <button type="button" className="btn btn-g" onClick={() => nav('residents')}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>

            {/* HOUSEHOLDS */}
            <div className={`screen${activeScreen === 'households' ? ' active' : ''}`}>
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
                    <input placeholder="Search..." />
                  </div>
                  <select className="sf">
                    <option>All Puroks</option>
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Head of Family</th>
                      <th>Address</th>
                      <th>Purok</th>
                      <th>Members</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>HH-0012</td>
                      <td>Santos, Pedro A.</td>
                      <td>No. 12, Rizal St.</td>
                      <td><span className="badge bb">Purok 3</span></td>
                      <td>5</td>
                      <td>
                        <button className="btn btn-g btn-sm">View</button>{' '}
                        <button className="btn btn-g btn-sm">Edit</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>HH-0003</td>
                      <td>Reyes, Elpidio R.</td>
                      <td>No. 3, Mabini Ave.</td>
                      <td><span className="badge bp">Purok 1</span></td>
                      <td>3</td>
                      <td>
                        <button className="btn btn-g btn-sm">View</button>{' '}
                        <button className="btn btn-g btn-sm">Edit</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* CERT REQUEST */}
            <div className={`screen${activeScreen === 'cert-req' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Certificate Request</div>
              </div>
              <div className="tc">
                <div className="fp">
                  <div className="fp-t">📝 New Request</div>
                  <div className="fg">
                    <label className="fl">Resident</label>
                    <select className="fc">
                      <option>Santos, Maria D. (RES-0001)</option>
                      <option>Reyes, Juan B. (RES-0002)</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Certificate Type</label>
                    <select className="fc">
                      <option>Barangay Clearance</option>
                      <option>Certificate of Indigency</option>
                      <option>Certificate of Residency</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Purpose</label>
                    <textarea className="fc" placeholder="State the purpose..." />
                  </div>
                  <div className="fa">
                    <button className="btn btn-p">Submit Request</button>
                  </div>
                </div>
                <div>
                  <div className="tw">
                    <div
                      style={{
                        padding: '12px 16px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--muted)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      Pending Requests
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Cert #</th>
                          <th>Resident</th>
                          <th>Type</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>CERT-2024-089</td>
                          <td>Santos, Maria</td>
                          <td><span className="badge bb">Clearance</span></td>
                          <td><span className="badge ba">Pending</span></td>
                        </tr>
                        <tr>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>CERT-2024-090</td>
                          <td>Cruz, Ramon</td>
                          <td><span className="badge ba">Indigency</span></td>
                          <td><span className="badge ba">Pending</span></td>
                        </tr>
                        <tr>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>CERT-2024-088</td>
                          <td>Lim, Ana</td>
                          <td><span className="badge bt">Residency</span></td>
                          <td><span className="badge bg">Approved</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* CERT APPROVE */}
            <div className={`screen${activeScreen === 'cert-approve' ? ' active' : ''}`}>
              <div className="ph">
                <div>
                  <div className="pt">Certificate Approval</div>
                  <div className="ps">Review and approve pending certificate requests</div>
                </div>
              </div>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Cert #</th>
                      <th>Resident</th>
                      <th>Type</th>
                      <th>Purpose</th>
                      <th>Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>CERT-2024-089</td>
                      <td>
                        <strong>Santos, Maria D.</strong>
                        <br />
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>Purok 3</span>
                      </td>
                      <td><span className="badge bb">Clearance</span></td>
                      <td style={{ fontSize: 11, maxWidth: 160 }}>For employment at DOLE</td>
                      <td style={{ fontSize: 10, color: 'var(--muted)' }}>Apr 7</td>
                      <td>
                        <button className="btn btn-s btn-sm">✓ Approve</button>{' '}
                        <button className="btn btn-d btn-sm">✗ Reject</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>CERT-2024-090</td>
                      <td>
                        <strong>Cruz, Ramon P.</strong>
                        <br />
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>Purok 2</span>
                      </td>
                      <td><span className="badge ba">Indigency</span></td>
                      <td style={{ fontSize: 11, maxWidth: 160 }}>For Philhealth application</td>
                      <td style={{ fontSize: 10, color: 'var(--muted)' }}>Apr 7</td>
                      <td>
                        <button className="btn btn-s btn-sm">✓ Approve</button>{' '}
                        <button className="btn btn-d btn-sm">✗ Reject</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* CERT PRINT */}
            <div className={`screen${activeScreen === 'cert-print' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Issuance & Print</div>
              </div>
              <div className="tc">
                <div>
                  <div className="tw">
                    <table>
                      <thead>
                        <tr>
                          <th>Cert #</th>
                          <th>Resident</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>CERT-2024-088</td>
                          <td>Lim, Ana G.</td>
                          <td><span className="badge bt">Residency</span></td>
                          <td><span className="badge bg">Approved</span></td>
                          <td><button className="btn btn-p btn-sm">🖨️ Print</button></td>
                        </tr>
                        <tr>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>CERT-2024-085</td>
                          <td>Dela Rosa, Ben</td>
                          <td><span className="badge bb">Clearance</span></td>
                          <td><span className="badge bk">Issued</span></td>
                          <td><button className="btn btn-g btn-sm">Reprint</button></td>
                        </tr>
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
                    <h2 style={{ marginTop: 6 }}>BARANGAY CLEARANCE</h2>
                    <hr />
                    <p style={{ marginTop: 10 }}>
                      This is to certify that <strong>ANA GRACE LIM</strong>, a <em>bona fide</em> resident of
                      Purok 2, Barangay Bustrac, has been found to be of <strong>good moral character</strong> and
                      has no derogatory record on file.
                    </p>
                    <p>
                      This certification is issued for <strong>employment purposes</strong>.
                    </p>
                    <div className="cert-sig">
                      April 7, 2024 · Cert. No.: CERT-2024-088
                      <strong>Hon. Barangay Captain</strong>
                      <div>Barangay Bustrac</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PROGRAMS */}
            <div className={`screen${activeScreen === 'programs' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Distribution Programs</div>
                <button className="btn btn-p">＋ New Program</button>
              </div>
              <div className="thc">
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="badge bg">Active</span>
                    <span className="badge bk">Apr 2024</span>
                  </div>
                  <div className="ct">Ayuda Rice Distribution</div>
                  <div className="cm">PROG-2024-004</div>
                  <div className="prog" style={{ margin: '10px 0' }}>
                    <div className="prog-b" style={{ width: '65%' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>387/600 beneficiaries</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button className="btn btn-p btn-sm" onClick={() => nav('aid-encode')}>Encode</button>
                    <button className="btn btn-g btn-sm" onClick={() => nav('aid-logs')}>Logs</button>
                  </div>
                </div>
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="badge bk">Completed</span>
                    <span className="badge bk">Mar 2024</span>
                  </div>
                  <div className="ct">Cash Assistance — DSWD</div>
                  <div className="cm">PROG-2024-003</div>
                  <div className="prog" style={{ margin: '10px 0' }}>
                    <div
                      className="prog-b"
                      style={{ width: '100%', background: 'linear-gradient(90deg,var(--green),var(--teal))' }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>312/312 — Completed</div>
                </div>
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="badge ba">Upcoming</span>
                    <span className="badge bk">May 2024</span>
                  </div>
                  <div className="ct">Medical Assistance</div>
                  <div className="cm">PROG-2024-005 · May 15</div>
                  <div className="prog" style={{ margin: '10px 0' }}>
                    <div className="prog-b" style={{ width: '0%' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>0 beneficiaries</div>
                </div>
              </div>
            </div>

            {/* AID ENCODE */}
            <div className={`screen${activeScreen === 'aid-encode' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Encode Aid Distribution</div>
              </div>
              <div className="tc">
                <div className="fp">
                  <div className="fp-t">📦 Distribution Entry</div>
                  <div className="fg">
                    <label className="fl">Program</label>
                    <select className="fc">
                      <option>Ayuda Rice Distribution (PROG-2024-004)</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Beneficiary</label>
                    <select className="fc">
                      <option>Santos, Maria D. (RES-0001)</option>
                      <option>Reyes, Juan B. (RES-0002)</option>
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
                    <textarea className="fc" placeholder="Optional..." />
                  </div>
                  <div className="note note-s" style={{ marginBottom: 12 }}>
                    ✓ No duplicate detected under this program.
                  </div>
                  <div className="fa">
                    <button className="btn btn-p">✔Log Entry</button>
                  </div>
                </div>
                <div>
                  <div className="note note-e" style={{ marginBottom: 12 }}>
                    ⚠ <strong>Duplicate:</strong> Lopez, Pedro D. already logged under this program.
                  </div>
                  <div className="tw">
                    <table>
                      <thead>
                        <tr>
                          <th>Resident</th>
                          <th>Aid</th>
                          <th>By</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Cruz, Ramon P.</td>
                          <td>Rice 5kg</td>
                          <td>Cortero</td>
                          <td><span className="badge bg">Normal</span></td>
                        </tr>
                        <tr>
                          <td>Garcia, Ana L.</td>
                          <td>Rice 5kg</td>
                          <td>Napagal</td>
                          <td><span className="badge bt">Synced</span></td>
                        </tr>
                        <tr>
                          <td>Lopez, Pedro D.</td>
                          <td>Rice 5kg</td>
                          <td>Amparado</td>
                          <td><span className="badge br">Duplicate</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* AID LOGS */}
            <div className={`screen${activeScreen === 'aid-logs' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Aid Distribution Logs</div>
              </div>
              <div className="tw">
                <div className="tb">
                  <div className="sb-box">
                    <span>🔍</span>
                    <input placeholder="Search..." />
                  </div>
                  <select className="sf">
                    <option>All Programs</option>
                    <option>Ayuda Rice</option>
                  </select>
                  <select className="sf">
                    <option>All Status</option>
                    <option>Normal</option>
                    <option>Duplicate</option>
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Log #</th>
                      <th>Beneficiary</th>
                      <th>Program</th>
                      <th>Aid</th>
                      <th>Encoded By</th>
                      <th>Date/Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>LOG-0041</td>
                      <td>Cruz, Ramon P.</td>
                      <td>Rice Distribution</td>
                      <td>Rice 5kg</td>
                      <td>Cortero</td>
                      <td style={{ fontSize: 10 }}>Apr 7, 09:02</td>
                      <td><span className="badge bg">Normal</span></td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>LOG-0040</td>
                      <td>Garcia, Ana L.</td>
                      <td>Rice Distribution</td>
                      <td>Rice 5kg</td>
                      <td>Napagal</td>
                      <td style={{ fontSize: 10 }}>Apr 7, 08:55</td>
                      <td><span className="badge bt">Offline sync</span></td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>LOG-0039</td>
                      <td>Lopez, Pedro D.</td>
                      <td>Rice Distribution</td>
                      <td>Rice 5kg</td>
                      <td>Amparado</td>
                      <td style={{ fontSize: 10 }}>Apr 7, 08:40</td>
                      <td><span className="badge br">⚠ Duplicate</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ADD BENEFICIARY */}
            <div className={`screen${activeScreen === 'add-beneficiary' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Add Beneficiaries</div>
                <button className="btn btn-g" onClick={() => nav('aid-encode')}>
                  ← Back
                </button>
              </div>

              <div className="fp">
                <div className="fp-t">📦 Add Beneficiary List</div>
                <div className="fg2">
                  <div className="fg">
                    <label className="fl">Full Name</label>
                    <input
                      className="fc"
                      placeholder="Enter name"
                      value={beneficiaryDraft.name}
                      onChange={(e) =>
                        setBeneficiaryDraft((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="fg">
                    <label className="fl">Aid Type</label>
                    <input
                      className="fc"
                      value={beneficiaryDraft.aidType}
                      onChange={(e) =>
                        setBeneficiaryDraft((prev) => ({ ...prev, aidType: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="fg2">
                  <div className="fg">
                    <label className="fl">Quantity</label>
                    <input
                      className="fc"
                      type="number"
                      value={beneficiaryDraft.qty}
                      onChange={(e) =>
                        setBeneficiaryDraft((prev) => ({ ...prev, qty: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="fg" style={{ display: 'flex', alignItems: 'end' }}>
                    <button className="btn btn-p" type="button" onClick={addToList}>
                      ＋ Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="tw">
                <div className="tb">
                  <strong>📋 Beneficiary List</strong>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Aid</th>
                      <th>Qty</th>
                      <th>Action</th>
                    </tr>
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
                          <td>{b.name}</td>
                          <td>{b.aidType}</td>
                          <td>{b.qty}</td>
                          <td>
                            <button className="btn btn-d btn-sm" onClick={() => removeFromList(i)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="fa">
                <button className="btn btn-p" onClick={saveAll}>
                  ✔ Save All Beneficiaries
                </button>
              </div>
            </div>

            {/* BLOTTER NEW */}
            <div className={`screen${activeScreen === 'blotter-new' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">File Blotter Entry</div>
              </div>
              <div className="fp">
                <div className="fp-t">🚨 Incident Details</div>
                <div className="fg2">
                  <div className="fg">
                    <label className="fl">Date</label>
                    <input className="fc" type="date" />
                  </div>
                  <div className="fg">
                    <label className="fl">Time</label>
                    <input className="fc" type="time" />
                  </div>
                </div>
                <div className="fg2">
                  <div className="fg">
                    <label className="fl">Incident Type</label>
                    <select className="fc">
                      <option>Noise Complaint</option>
                      <option>Physical Altercation</option>
                      <option>Property Dispute</option>
                      <option>Domestic Concern</option>
                      <option>Theft</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Location</label>
                    <input className="fc" placeholder="e.g. Purok 5" />
                  </div>
                </div>
                <div className="fg2">
                  <div className="fg">
                    <label className="fl">Complainant</label>
                    <input className="fc" placeholder="Full name" />
                  </div>
                  <div className="fg">
                    <label className="fl">Respondent</label>
                    <input className="fc" placeholder="Full name" />
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Narrative</label>
                  <textarea
                    className="fc"
                    style={{ minHeight: 80 }}
                    placeholder="Describe the incident..."
                  />
                </div>
                <div className="fg">
                  <label className="fl">Action Taken</label>
                  <textarea className="fc" placeholder="Actions by barangay..." />
                </div>
                <div className="fg">
                  <label className="fl">Status</label>
                  <select className="fc">
                    <option>Open</option>
                    <option>Under Mediation</option>
                    <option>Resolved</option>
                    <option>Referred</option>
                  </select>
                </div>
              </div>
              <div className="fa">
                <button className="btn btn-p">📋 File Entry</button>
                <button className="btn btn-g">Cancel</button>
              </div>
            </div>

            {/* BLOTTER MANAGE */}
            <div className={`screen${activeScreen === 'blotter-manage' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Manage Blotter Records</div>
                <button className="btn btn-p" onClick={() => nav('blotter-new')}>
                  ＋ File Blotter
                </button>
              </div>
              <div className="tw">
                <div className="tb">
                  <div className="sb-box">
                    <span>🔍</span>
                    <input placeholder="Search case #, name..." />
                  </div>
                  <select className="sf">
                    <option>All Types</option>
                    <option>Noise Complaint</option>
                    <option>Property Dispute</option>
                  </select>
                  <select className="sf">
                    <option>All Status</option>
                    <option>Open</option>
                    <option>Under Mediation</option>
                    <option>Resolved</option>
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Case #</th>
                      <th>Type</th>
                      <th>Complainant</th>
                      <th>Respondent</th>
                      <th>Location</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>BLT-2024-041</td>
                      <td>Noise Complaint</td>
                      <td>Reyes, Carmen</td>
                      <td>Torres, Mark</td>
                      <td>Purok 5</td>
                      <td style={{ fontSize: 10 }}>Apr 7</td>
                      <td><span className="badge br">Open</span></td>
                      <td>
                        <button className="btn btn-g btn-sm" onClick={() => nav('blotter-detail')}>
                          View
                        </button>{' '}
                        <button className="btn btn-g btn-sm">Print</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>BLT-2024-040</td>
                      <td>Property Dispute</td>
                      <td>Santos, Jose</td>
                      <td>Cruz, Ana</td>
                      <td>Purok 2</td>
                      <td style={{ fontSize: 10 }}>Apr 5</td>
                      <td><span className="badge ba">Mediation</span></td>
                      <td>
                        <button className="btn btn-g btn-sm">Update</button>{' '}
                        <button className="btn btn-g btn-sm">Print</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>BLT-2024-038</td>
                      <td>Domestic Concern</td>
                      <td>Lim, Rosa</td>
                      <td>Lim, Carlos</td>
                      <td>Purok 1</td>
                      <td style={{ fontSize: 10 }}>Apr 2</td>
                      <td><span className="badge bg">Resolved</span></td>
                      <td>
                        <button className="btn btn-g btn-sm">View</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* BLOTTER DETAIL */}
            <div className={`screen${activeScreen === 'blotter-detail' ? ' active' : ''}`}>
              <div className="ph">
                <div>
                  <div className="pt">Complaint Details — BLT-2024-041</div>
                  <div className="ps">Noise Complaint · Open · Apr 7, 2024</div>
                </div>
                <button className="btn btn-g" onClick={() => nav('blotter-manage')}>
                  ← Back to List
                </button>
              </div>

              <div className="tc">
                {/* LEFT COLUMN */}
                <div>
                  <div className="fp">
                    <div className="fp-t">📋 Case Information</div>
                    <div className="fg2">
                      <div>
                        <label className="fl">Case Number</label>
                        <input
                          className="fc"
                          value={complaint.caseNum}
                          disabled
                          style={{ background: 'var(--surface3)', color: 'var(--muted)' }}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="fl">Status</label>
                        <select
                          className="fc"
                          value={complaint.caseStatus}
                          onChange={(e) => updateComplaintField('caseStatus', e.target.value)}
                        >
                          <option>Open</option>
                          <option>Under Mediation</option>
                          <option>Resolved</option>
                          <option>Referred</option>
                        </select>
                      </div>
                    </div>
                    <div className="fg2">
                      <div>
                        <label className="fl">Date Filed</label>
                        <input
                          className="fc"
                          type="date"
                          value={complaint.dateFiled}
                          onChange={(e) => updateComplaintField('dateFiled', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="fl">Time</label>
                        <input
                          className="fc"
                          type="time"
                          value={complaint.timeFiled}
                          onChange={(e) => updateComplaintField('timeFiled', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="fg">
                      <label className="fl">Incident Type</label>
                      <select
                        className="fc"
                        value={complaint.incidentType}
                        onChange={(e) => updateComplaintField('incidentType', e.target.value)}
                      >
                        <option>Noise Complaint</option>
                        <option>Physical Altercation</option>
                        <option>Property Dispute</option>
                        <option>Domestic Concern</option>
                        <option>Theft</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label className="fl">Location</label>
                      <input
                        className="fc"
                        value={complaint.location}
                        onChange={(e) => updateComplaintField('location', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="fp">
                    <div className="fp-t">👤 Complainant Information</div>
                    <div className="fg">
                      <label className="fl">Full Name</label>
                      <input
                        className="fc"
                        value={complaint.compName}
                        onChange={(e) => updateComplaintField('compName', e.target.value)}
                      />
                    </div>
                    <div className="fg2">
                      <div>
                        <label className="fl">Resident ID</label>
                        <input
                          className="fc"
                          value={complaint.compID}
                          disabled
                          readOnly
                          style={{ background: 'var(--surface3)', color: 'var(--muted)' }}
                        />
                      </div>
                      <div>
                        <label className="fl">Status</label>
                        <input
                          className="fc"
                          value="Registered Resident"
                          disabled
                          readOnly
                          style={{ background: 'var(--surface3)', color: 'var(--muted)' }}
                        />
                      </div>
                    </div>
                    <div className="fg2">
                      <div>
                        <label className="fl">Contact Number</label>
                        <input
                          className="fc"
                          value={complaint.compContact}
                          onChange={(e) => updateComplaintField('compContact', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="fl">Purok</label>
                        <select
                          className="fc"
                          value={complaint.compPurok}
                          onChange={(e) => updateComplaintField('compPurok', e.target.value)}
                        >
                          <option>Purok 5</option>
                          <option>Purok 1</option>
                          <option>Purok 2</option>
                          <option>Purok 3</option>
                          <option>Purok 4</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="fp">
                    <div className="fp-t">📝 Incident Details</div>
                    <div className="fg">
                      <label className="fl">Narrative</label>
                      <textarea
                        className="fc"
                        style={{ minHeight: 100 }}
                        value={complaint.narrative}
                        onChange={(e) => updateComplaintField('narrative', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl">Status Notes</label>
                      <textarea
                        className="fc"
                        style={{ minHeight: 80 }}
                        value={complaint.statusNotes}
                        onChange={(e) => updateComplaintField('statusNotes', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div>
                  <div className="fp">
                    <div className="fp-t">⚠️ Respondent Information</div>
                    <div className="fg">
                      <label className="fl">Full Name</label>
                      <input
                        className="fc"
                        value={complaint.respName}
                        onChange={(e) => updateComplaintField('respName', e.target.value)}
                      />
                    </div>
                    <div className="fg2">
                      <div>
                        <label className="fl">Resident ID</label>
                        <input
                          className="fc"
                          value={complaint.respID}
                          disabled
                          readOnly
                          style={{ background: 'var(--surface3)', color: 'var(--muted)' }}
                        />
                      </div>
                      <div>
                        <label className="fl">Status</label>
                        <input
                          className="fc"
                          value="Registered Resident"
                          disabled
                          readOnly
                          style={{ background: 'var(--surface3)', color: 'var(--muted)' }}
                        />
                      </div>
                    </div>
                    <div className="fg">
                      <label className="fl">Contact Number (SMS)</label>
                      <input
                        className="fc"
                        value={complaint.respContact}
                        onChange={(e) => updateComplaintField('respContact', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl">Email Address</label>
                      <input
                        className="fc"
                        type="email"
                        value={complaint.respEmail}
                        onChange={(e) => updateComplaintField('respEmail', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label className="fl">Address</label>
                      <input
                        className="fc"
                        value={complaint.respAddress}
                        onChange={(e) => updateComplaintField('respAddress', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="fp" style={{ borderLeft: '4px solid var(--pri)' }}>
                    <div className="fp-t">📨 Send Summons / Notification</div>
                    <div className="note note-i" style={{ marginBottom: 12 }}>
                      Send official notification to respondent regarding this complaint and request their
                      appearance at barangay hall.
                    </div>

                    <div className="fg">
                      <label className="fl">Scheduled Appearance Date</label>
                      <input
                        className="fc"
                        type="date"
                        value={complaint.summonDate}
                        onChange={(e) => updateComplaintField('summonDate', e.target.value)}
                      />
                    </div>

                    <div className="fg">
                      <label className="fl">Scheduled Time</label>
                      <input
                        className="fc"
                        type="time"
                        value={complaint.summonTime}
                        onChange={(e) => updateComplaintField('summonTime', e.target.value)}
                      />
                    </div>

                    <div className="fg">
                      <label className="fl">Message / Instructions</label>
                      <textarea
                        className="fc"
                        style={{ minHeight: 100 }}
                        value={complaint.summonMsg}
                        onChange={(e) => updateComplaintField('summonMsg', e.target.value)}
                      />
                    </div>

                    <div className="fg">
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={complaint.sendSMS}
                          onChange={(e) => updateComplaintField('sendSMS', e.target.checked)}
                        />{' '}
                        <span>Send via SMS</span>
                      </label>
                    </div>

                    <div className="fg">
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={complaint.sendEmail}
                          onChange={(e) => updateComplaintField('sendEmail', e.target.checked)}
                        />{' '}
                        <span>Send via Email</span>
                      </label>
                    </div>

                    <div className="note note-s" style={{ marginBottom: 12 }}>
                      ✓ SMS and Email enabled. Notification will be recorded in audit log.
                    </div>

                    <div className="fa" style={{ flexDirection: 'column', gap: 8 }}>
                      <button
                        className="btn btn-p"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={sendSummons}
                      >
                        🔔 Send Summons Now
                      </button>
                      <button className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }}>
                        Preview Message
                      </button>
                    </div>
                  </div>

                  <div className="fp">
                    <div className="fp-t">📬 Communication History</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div
                        style={{
                          padding: 10,
                          background: 'var(--surface2)',
                          borderRadius: 'var(--r-sm)',
                          borderLeft: '3px solid var(--green)',
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>✓ SMS Sent</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                          April 7, 11:15 AM · Initial complaint filed
                        </div>
                      </div>
                      <div
                        style={{
                          padding: 10,
                          background: 'var(--surface2)',
                          borderRadius: 'var(--r-sm)',
                          borderLeft: '3px solid var(--muted)',
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Pending Summons</div>
                        <div style={{ fontSize: 10, color: 'var(--hint)', marginTop: 2 }}>
                          Will be sent upon confirmation
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-s" onClick={saveComplaintChanges}>💾 Save Changes</button>
                <button className="btn btn-g" onClick={cancelEdit}>Cancel</button>
                <button className="btn btn-a" style={{ marginLeft: 'auto' }}>📝 Schedule Mediation</button>
                <button className="btn btn-g">📋 Update Status</button>
                <button className="btn btn-g" onClick={() => nav('blotter-manage')}>Close & Return</button>
              </div>
            </div>

            {/* ANNOUNCEMENTS */}
            <div className={`screen${activeScreen === 'announcements' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Announcements</div>
                <button className="btn btn-p">＋ New</button>
              </div>
              <div className="tc">
                <div className="fp">
                  <div className="fp-t">📢 Post Announcement</div>
                  <div className="fg">
                    <label className="fl">Title</label>
                    <input className="fc" placeholder="Title" />
                  </div>
                  <div className="fg">
                    <label className="fl">Category</label>
                    <select className="fc">
                      <option>General</option>
                      <option>Health</option>
                      <option>Security</option>
                      <option>Events</option>
                      <option>Governance</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Content</label>
                    <textarea className="fc" style={{ minHeight: 90 }} />
                  </div>
                  <div className="fg">
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" /> Pin to top of board
                    </label>
                  </div>
                  <div className="fa">
                    <button className="btn btn-p">Publish</button>
                    <button className="btn btn-g">Save Draft</button>
                  </div>
                </div>
                <div>
                  <div className="ann pinned">
                    <div className="ann-c" style={{ color: 'var(--amber)' }}>📌 Health</div>
                    <div className="ann-t">Free Medical Mission — Apr 15</div>
                    <div className="ann-b">
                      DOH-Bicol at covered court, 8AM–4PM. Free consultation, screening, and medicine.
                    </div>
                    <div className="ann-f">Posted by Cortero · Apr 5</div>
                  </div>
                  <div className="ann">
                    <div className="ann-c" style={{ color: 'var(--pri)' }}>🏛️ Governance</div>
                    <div className="ann-t">Barangay Assembly — Apr 20</div>
                    <div className="ann-b">
                      Quarterly assembly at 8AM. Budget update, peace and order, infrastructure projects.
                    </div>
                    <div className="ann-f">Posted by Napagal · Apr 4</div>
                  </div>
                </div>
              </div>
            </div>

            {/* FEEDBACK */}
            <div className={`screen${activeScreen === 'feedback' ? ' active' : ''}`}>
              <div className="ph">
                <div className="pt">Feedback & Complaints</div>
              </div>
              <div className="tw">
                <div className="tb">
                  <div className="sb-box">
                    <span>🔍</span>
                    <input placeholder="Search..." />
                  </div>
                  <select className="sf">
                    <option>All Types</option>
                    <option>Complaint</option>
                    <option>Suggestion</option>
                    <option>Inquiry</option>
                  </select>
                  <select className="sf">
                    <option>All Status</option>
                    <option>Pending</option>
                    <option>Resolved</option>
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>From</th>
                      <th>Type</th>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>FB-041</td>
                      <td>Santos, Maria</td>
                      <td><span className="badge br">Complaint</span></td>
                      <td style={{ fontSize: 11 }}>Garbage not collected in Purok 3</td>
                      <td style={{ fontSize: 10 }}>Apr 7</td>
                      <td><span className="badge ba">Pending</span></td>
                      <td><button className="btn btn-p btn-sm">Respond</button></td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>FB-040</td>
                      <td>Reyes, Juan</td>
                      <td><span className="badge bb">Suggestion</span></td>
                      <td style={{ fontSize: 11 }}>More streetlights in Purok 1</td>
                      <td style={{ fontSize: 10 }}>Apr 6</td>
                      <td><span className="badge ba">Under Review</span></td>
                      <td><button className="btn btn-g btn-sm">View</button></td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>FB-039</td>
                      <td>Garcia, Ana</td>
                      <td><span className="badge bp">Inquiry</span></td>
                      <td style={{ fontSize: 11 }}>How to apply for clearance online?</td>
                      <td style={{ fontSize: 10 }}>Apr 5</td>
                      <td><span className="badge bg">Resolved</span></td>
                      <td><button className="btn btn-g btn-sm">View</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* CONFLICTS */}
            <div className={`screen${activeScreen === 'conflicts' ? ' active' : ''}`}>
              <div className="ph">
                <div>
                  <div className="pt">Conflict Resolution</div>
                  <div className="ps">
                    CouchDB sync conflicts pending administrative review — data held, not overwritten
                  </div>
                </div>
              </div>
              <div className="note note-w" style={{ marginBottom: 20 }}>
                ⚠ <strong>2 conflicts detected.</strong> Records modified on multiple offline devices
                simultaneously. No data has been overwritten. Select the correct version or keep both.
              </div>

              <div className="cf">
                <div className="cf-h">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: 13 }}>⚠ Conflict #1</span>
                    <span className="badge bg" style={{ fontSize: 10 }}>residents</span>
                    <span className="badge bk" style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>RES-0412</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
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

              <div className="cf">
                <div className="cf-h">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: 13 }}>⚠ Conflict #2</span>
                    <span className="badge ba" style={{ fontSize: 10 }}>aid_distributions</span>
                    <span className="badge bk" style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>LOG-0039</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
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

            {/* AUDIT LOG */}
            <div className={`screen${activeScreen === 'audit' ? ' active' : ''}`}>
              <div className="ph">
                <div>
                  <div className="pt">Audit Log</div>
                  <div className="ps">Complete immutable transaction history (append-only, no deletions permitted)</div>
                </div>
              </div>
              <div className="tw">
                <div className="tb">
                  <div className="sb-box">
                    <span>🔍</span>
                    <input placeholder="Search user, action, module..." />
                  </div>
                  <select className="sf">
                    <option>All Modules</option>
                    <option>Residents</option>
                    <option>Certificates</option>
                    <option>Aid Distribution</option>
                    <option>Blotter</option>
                  </select>
                  <select className="sf">
                    <option>All Actions</option>
                    <option>CREATE</option>
                    <option>UPDATE</option>
                    <option>APPROVE</option>
                    <option>LOGIN</option>
                    <option>SYNC</option>
                    <option>RESOLVE</option>
                  </select>
                </div>
                <div className="al-row">
                  <div className="al-ico" style={{ background: 'var(--pri-l)' }}>📝</div>
                  <div style={{ flex: 1 }}>
                    <div className="al-a">APPROVE_CERT — certificates · CERT-2024-088</div>
                    <div className="al-d">User: <strong>Juhairo Macabangon</strong> (Admin) · Approved for Lim, Ana G.</div>
                  </div>
                  <div>
                    <span className="badge bt" style={{ fontSize: 9, marginBottom: 3, display: 'flex' }}>online</span>
                    <div className="al-t">Apr 7, 09:14</div>
                  </div>
                </div>
                <div className="al-row">
                  <div className="al-ico" style={{ background: 'var(--teal-l)' }}>🔄</div>
                  <div style={{ flex: 1 }}>
                    <div className="al-a">SYNC_OFFLINE — residents · 14 records</div>
                    <div className="al-d">
                      User: <strong>Jay Napagal</strong> (Staff) · CouchDB replication from device 192.168.1.14
                    </div>
                  </div>
                  <div>
                    <span className="badge bt" style={{ fontSize: 9, marginBottom: 3, display: 'flex' }}>offline sync</span>
                    <div className="al-t">Apr 7, 07:45</div>
                  </div>
                </div>
                <div className="al-row">
                  <div className="al-ico" style={{ background: 'var(--amber-l)' }}>⚠️</div>
                  <div style={{ flex: 1 }}>
                    <div className="al-a">RESOLVE_CONFLICT — residents · RES-0412</div>
                    <div className="al-d">
                      User: <strong>Juhairo Macabangon</strong> (Admin) · Retained Version A (Purok 3), discarded
                      Version B
                    </div>
                  </div>
                  <div>
                    <span className="badge bg" style={{ fontSize: 9, marginBottom: 3, display: 'flex' }}>online</span>
                    <div className="al-t">Apr 7, 08:20</div>
                  </div>
                </div>
                <div className="al-row">
                  <div className="al-ico" style={{ background: 'var(--red-l)' }}>🚨</div>
                  <div style={{ flex: 1 }}>
                    <div className="al-a">CREATE_BLOTTER — blotter · BLT-2024-041</div>
                    <div className="al-d">User: <strong>Mark Cortero</strong> (Staff) · Noise complaint, Purok 5</div>
                  </div>
                  <div>
                    <span className="badge bg" style={{ fontSize: 9, marginBottom: 3, display: 'flex' }}>online</span>
                    <div className="al-t">Apr 7, 08:30</div>
                  </div>
                </div>
                <div className="al-row">
                  <div className="al-ico" style={{ background: 'var(--pri-l)' }}>🔑</div>
                  <div style={{ flex: 1 }}>
                    <div className="al-a">LOGIN — system</div>
                    <div className="al-d">
                      User: <strong>Juhairo Macabangon</strong> (Admin) · IP: 192.168.1.12 · Device: Chrome/Windows
                    </div>
                  </div>
                  <div>
                    <span className="badge bg" style={{ fontSize: 9, marginBottom: 3, display: 'flex' }}>online</span>
                    <div className="al-t">Apr 7, 07:30</div>
                  </div>
                </div>
                <div className="al-row">
                  <div className="al-ico" style={{ background: 'var(--red-l)' }}>⚡</div>
                  <div style={{ flex: 1 }}>
                    <div className="al-a">FLAG_DUPLICATE — aid_distributions · LOG-0039</div>
                    <div className="al-d">
                      User: <strong>Ken Amparado</strong> (Staff) · Lopez, Pedro D. flagged under Rice Distribution
                    </div>
                  </div>
                  <div>
                    <span className="badge bg" style={{ fontSize: 9, marginBottom: 3, display: 'flex' }}>online</span>
                    <div className="al-t">Apr 7, 08:40</div>
                  </div>
                </div>
              </div>
            </div>

            {/* MANAGE USERS */}
            <div className={`screen${activeScreen === 'users' ? ' active' : ''}`}>
              <div className="ph">
                <div>
                  <div className="pt">Manage Users</div>
                  <div className="ps">User accounts, roles, and access management</div>
                </div>
                <button className="btn btn-p">＋ Add User</button>
              </div>
              <div className="tw">
                <div className="tb">
                  <div className="sb-box">
                    <span>🔍</span>
                    <input placeholder="Search users..." />
                  </div>
                  <select className="sf">
                    <option>All Roles</option>
                    <option>Admin</option>
                    <option>Barangay Captain</option>
                    <option>Staff</option>
                    <option>Resident</option>
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Full Name</th>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last Login</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>USR-001</td>
                      <td><strong>Macabangon, Juhairo B.</strong></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>jmacabangon</td>
                      <td><span className="badge br">Admin</span></td>
                      <td><span className="badge bg">Active</span></td>
                      <td style={{ fontSize: 10 }}>Apr 7, 07:30</td>
                      <td><button className="btn btn-g btn-sm">Edit</button></td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>USR-002</td>
                      <td><strong>Cortero, Mark Gian A.</strong></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>mgcortero</td>
                      <td><span className="badge bp">Staff</span></td>
                      <td><span className="badge bg">Active</span></td>
                      <td style={{ fontSize: 10 }}>Apr 7, 08:00</td>
                      <td>
                        <button className="btn btn-g btn-sm">Edit</button>{' '}
                        <button className="btn btn-d btn-sm">Deactivate</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>USR-003</td>
                      <td><strong>Napagal, Jay O.</strong></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>jonapagal</td>
                      <td><span className="badge bp">Staff</span></td>
                      <td><span className="badge bg">Active</span></td>
                      <td style={{ fontSize: 10 }}>Apr 7, 07:45</td>
                      <td>
                        <button className="btn btn-g btn-sm">Edit</button>{' '}
                        <button className="btn btn-d btn-sm">Deactivate</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>USR-004</td>
                      <td><strong>Regaspi, Mark Denver S.</strong></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>mdregaspi</td>
                      <td><span className="badge bp">Staff</span></td>
                      <td><span className="badge bg">Active</span></td>
                      <td style={{ fontSize: 10 }}>Apr 6, 05:00</td>
                      <td>
                        <button className="btn btn-g btn-sm">Edit</button>{' '}
                        <button className="btn btn-d btn-sm">Deactivate</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>USR-005</td>
                      <td><strong>Amparado, Ken Jette T.</strong></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>kjamparado</td>
                      <td><span className="badge bp">Staff</span></td>
                      <td><span className="badge bg">Active</span></td>
                      <td style={{ fontSize: 10 }}>Apr 7, 09:00</td>
                      <td>
                        <button className="btn btn-g btn-sm">Edit</button>{' '}
                        <button className="btn btn-d btn-sm">Deactivate</button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>USR-006</td>
                      <td><strong>Santos, Maria D.</strong></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>mdsantos</td>
                      <td><span className="badge bt">Resident</span></td>
                      <td><span className="badge bg">Active</span></td>
                      <td style={{ fontSize: 10 }}>Apr 5, 10:00</td>
                      <td>
                        <button className="btn btn-g btn-sm">Edit</button>{' '}
                        <button className="btn btn-d btn-sm">Deactivate</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* REPORTS */}
            <div className={`screen${activeScreen === 'reports' ? ' active' : ''}`}>
              <div className="ph">
                <div>
                  <div className="pt">Generate Reports</div>
                  <div className="ps">Printable reports for all modules — admin full access</div>
                </div>
              </div>
              <div className="thc">
                <div className="card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📝</div>
                  <div className="ct">Certificate Issuance</div>
                  <div className="cm" style={{ marginBottom: 10 }}>Monthly issuance summary by type</div>
                  <select className="fc" style={{ marginBottom: 10 }}>
                    <option>April 2024</option>
                    <option>March 2024</option>
                  </select>
                  <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                    Generate PDF
                  </button>
                </div>
                <div className="card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📦</div>
                  <div className="ct">Aid Distribution</div>
                  <div className="cm" style={{ marginBottom: 10 }}>Beneficiary list per program</div>
                  <select className="fc" style={{ marginBottom: 10 }}>
                    <option>Ayuda Rice Distribution</option>
                  </select>
                  <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                    Generate PDF
                  </button>
                </div>
                <div className="card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>
                  <div className="ct">Resident Registry</div>
                  <div className="cm" style={{ marginBottom: 10 }}>Full list by purok</div>
                  <select className="fc" style={{ marginBottom: 10 }}>
                    <option>All Puroks</option>
                  </select>
                  <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                    Generate PDF
                  </button>
                </div>
                <div className="card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🚨</div>
                  <div className="ct">Blotter Summary</div>
                  <div className="cm" style={{ marginBottom: 10 }}>Cases by type and status</div>
                  <select className="fc" style={{ marginBottom: 10 }}>
                    <option>April 2024</option>
                  </select>
                  <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                    Generate PDF
                  </button>
                </div>
                <div className="card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
                  <div className="ct">Feedback Report</div>
                  <div className="cm" style={{ marginBottom: 10 }}>Concerns and resolutions</div>
                  <select className="fc" style={{ marginBottom: 10 }}>
                    <option>All Status</option>
                  </select>
                  <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                    Generate PDF
                  </button>
                </div>
                <div className="card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                  <div className="ct">Audit Trail Report</div>
                  <div className="cm" style={{ marginBottom: 10 }}>Admin-only — full system log</div>
                  <select className="fc" style={{ marginBottom: 10 }}>
                    <option>April 2024</option>
                  </select>
                  <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                    Generate PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
