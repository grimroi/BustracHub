import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

const monoMuted = { fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' };
const mono10 = { fontFamily: 'var(--mono)', fontSize: '10px' };

const titlesMap = {
  dashboard: ['Dashboard', 'Barangay Bustrac Operations'],
  residents: ['Manage Residents', 'Resident Registry Module'],
  'add-resident': ['Add New Resident', 'Resident Registry'],
  households: ['Manage Households', 'Resident Registry'],
  'cert-req': ['Certificate Request', 'Certificate Issuance Module'],
  'cert-approve': ['Certificate Approval', 'Certificate Issuance Module'],
  'cert-print': ['Issuance & Print', 'Certificate Issuance Module'],
  programs: ['Distribution Programs', 'Aid Distribution Module'],
  'aid-encode': ['Encode Distribution', 'Aid Distribution Module'],
  'aid-logs': ['Distribution Logs', 'Aid Distribution Module'],
  'blotter-new': ['File Blotter Entry', 'Blotter Module'],
  'blotter-manage': ['Manage Blotter Records', 'Blotter Module'],
  'blotter-detail': ['Complaint Details', 'Blotter Module — Case Management'],
  announcements: ['Announcements', 'Community Module'],
  feedback: ['Feedback & Complaints', 'Community Module'],
  reports: ['Generate Reports', 'Administration'],
};

export default function StaffUI() {
  const navigate = useNavigate();

  const [screen, setScreen] = useState('dashboard');
  const [offline, setOffline] = useState(false);

  const [certForm, setCertForm] = useState({ resident: '', certType: '', purpose: '' });

  const [staffCase, setStaffCase] = useState({
    caseNum: 'BLT-2024-041',
    status: 'Open',
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
  });

  const updateCase = (field, value) => setStaffCase((prev) => ({ ...prev, [field]: value }));

  const nav = (id) => setScreen(id);

  const logout = () => navigate('/login');

  const toggleOffline = () => setOffline((prev) => !prev);

  const submitStaffCert = (e) => {
    e.preventDefault();
    const { resident, certType, purpose } = certForm;
    if (!resident || !certType || !purpose.trim()) {
      alert('Please fill in all required fields.');
      return;
    }
    alert('Certificate request submitted for ' + resident + '.\nType: ' + certType + '\nPurpose: ' + purpose);
    setCertForm({ resident: '', certType: '', purpose: '' });
    nav('cert-req');
  };

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
    if (sendSMS) methods.push('SMS');
    if (sendEmail) methods.push('Email');
    if (methods.length === 0) {
      alert('Please select at least one notification method');
      return;
    }
    const confirmMsg = `Send summons to ${respName} via ${methods.join(
      ' and '
    )}?\n\nAppearance: ${summonDate} at ${summonTime}\n\nThis action will be recorded in the audit log.`;
    if (window.confirm(confirmMsg)) {
      alert(
        `✓ Summons sent successfully via ${methods.join(
          ' and '
        )}!\n\nNotification recorded: BLT-2024-041\nRespondent: ${respName}\nScheduled: ${summonDate} ${summonTime}`
      );
    }
  };

  const t = titlesMap[screen] || [screen, ''];

  return (
    <>
      <style>{`
        :root{
          --bg:#111318;--surface:#1A1D24;--surface2:#20242E;--surface3:#252A36;
          --border:#2A2F3D;--border2:#323849;
          --text:#E8ECF4;--muted:#7B83A0;--hint:#4A5168;
          --accent:#4F8EF7;--accent2:#3A7AE8;--accent-bg:rgba(79,142,247,0.1);
          --green:#34D399;--green-bg:rgba(52,211,153,0.1);
          --amber:#FBBF24;--amber-bg:rgba(251,191,36,0.1);
          --red:#F87171;--red-bg:rgba(248,113,113,0.1);
          --purple:#A78BFA;--purple-bg:rgba(167,139,250,0.1);
          --teal:#2DD4BF;--teal-bg:rgba(45,212,191,0.1);
          --orange:#FB923C;--orange-bg:rgba(251,146,60,0.1);
          --sidebar:220px;--topbar:54px;
          --font:'DM Sans',sans-serif;--mono:'DM Mono',monospace;
          --r:10px;--r-sm:6px;
        }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:var(--font);background:var(--bg);color:var(--text);font-size:14px;min-height:100vh;}
        .app{display:flex;min-height:100vh;}
        .sidebar{width:var(--sidebar);background:var(--surface);border-right:1px solid var(--border);
          position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100;overflow-y:auto;}
        .sb-logo{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;align-items:center;gap:8px;}
        .sb-logo-img{width:56px;height:56px;object-fit:contain;}
        .sb-logo-text{display:flex;align-items:center;gap:10px;width:100%;}
        .sb-icon{width:30px;height:30px;border-radius:7px;
          background:linear-gradient(135deg,var(--accent),var(--purple));
          display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;flex-shrink:0;}
        .sb-title{font-size:13px;font-weight:700;line-height:1.2;}
        .sb-sub{font-size:9px;color:var(--muted);}
        .sb-nav{flex:1;padding:8px 0;}
        .sb-sec{padding:14px 18px 5px;font-size:10px;font-weight:600;color:var(--hint);text-transform:uppercase;letter-spacing:0.8px;}
        .nav-btn{display:flex;align-items:center;gap:9px;width:100%;padding:8px 18px;
          background:none;border:none;color:var(--muted);font-family:var(--font);font-size:13px;font-weight:500;
          cursor:pointer;transition:all 0.12s;position:relative;text-align:left;}
        .nav-btn:hover{color:var(--text);background:var(--surface2);}
        .nav-btn.active{color:var(--accent);background:var(--accent-bg);}
        .nav-btn.active::before{content:'';position:absolute;left:0;top:3px;bottom:3px;
          width:3px;background:var(--accent);border-radius:0 2px 2px 0;}
        .nav-ico{font-size:15px;width:18px;text-align:center;flex-shrink:0;}
        .nb{margin-left:auto;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;}
        .nb-red{background:var(--red-bg);color:var(--red);}
        .nb-amber{background:var(--amber-bg);color:var(--amber);}
        .nb-green{background:var(--green-bg);color:var(--green);}
        .sb-foot{padding:12px 14px;border-top:1px solid var(--border);display:flex;align-items:center;gap:9px;}
        .sb-ava{width:28px;height:28px;border-radius:50%;
          background:linear-gradient(135deg,var(--accent),var(--teal));
          display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0;}
        .sb-uname{font-size:12px;font-weight:600;}
        .sb-urole{font-size:10px;color:var(--muted);}
        .online-dot{width:7px;height:7px;border-radius:50%;background:var(--green);
          flex-shrink:0;margin-left:auto;box-shadow:0 0 0 2px var(--green-bg);}
        .main{margin-left:var(--sidebar);flex:1;display:flex;flex-direction:column;}
        .topbar{height:var(--topbar);background:var(--surface);border-bottom:1px solid var(--border);
          display:flex;align-items:center;padding:0 22px;gap:14px;position:sticky;top:0;z-index:50;}
        .tb-title{font-size:15px;font-weight:700;flex:1;}
        .tb-sub{font-size:11px;color:var(--muted);}
        .offline-pill{display:flex;align-items:center;gap:6px;padding:4px 12px;
          background:var(--amber-bg);border:1px solid rgba(251,191,36,0.3);border-radius:14px;
          font-size:11px;font-weight:600;color:var(--amber);}
        .content{padding:22px;flex:1;}
        .screen{display:none;animation:fi 0.18s ease;}
        .screen.active{display:block;}
        @keyframes fi{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}
        .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
          border-radius:var(--r-sm);font-family:var(--font);font-size:13px;font-weight:600;
          cursor:pointer;border:none;transition:all 0.12s;}
        .btn-p{background:var(--accent);color:white;}
        .btn-p:hover{background:var(--accent2);}
        .btn-g{background:transparent;color:var(--text);border:1px solid var(--border2);}
        .btn-g:hover{background:var(--surface2);}
        .btn-s{background:var(--green-bg);color:var(--green);border:1px solid rgba(52,211,153,0.3);}
        .btn-d{background:var(--red-bg);color:var(--red);border:1px solid rgba(248,113,113,0.3);}
        .btn-a{background:var(--amber-bg);color:var(--amber);border:1px solid rgba(251,191,36,0.3);}
        .btn-sm{padding:5px 10px;font-size:11px;}
        .badge{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;}
        .g{background:var(--green-bg);color:var(--green);}
        .a{background:var(--amber-bg);color:var(--amber);}
        .r{background:var(--red-bg);color:var(--red);}
        .b{background:var(--accent-bg);color:var(--accent);}
        .p{background:var(--purple-bg);color:var(--purple);}
        .t{background:var(--teal-bg);color:var(--teal);}
        .gr{background:var(--surface3);color:var(--muted);}
        .o{background:var(--orange-bg);color:var(--orange);}
        .ph{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:14px;}
        .pt{font-size:18px;font-weight:700;letter-spacing:-0.3px;}
        .ps{font-size:12px;color:var(--muted);margin-top:2px;}
        .sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:22px;}
        .sc{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;}
        .sc:hover{border-color:var(--accent);}
        .sv{font-size:26px;font-weight:800;line-height:1;margin-top:4px;}
        .sl{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;}
        .si{font-size:18px;margin-bottom:4px;}
        .tw{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:20px;}
        .tb{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);}
        .sb-box{display:flex;align-items:center;gap:7px;background:var(--surface2);
          border:1px solid var(--border);border-radius:var(--r-sm);padding:6px 10px;flex:1;max-width:280px;}
        .sb-box input{background:none;border:none;color:var(--text);font-family:var(--font);font-size:12px;flex:1;outline:none;}
        .sb-box input::placeholder{color:var(--hint);}
        select.fc{background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);
          padding:6px 10px;color:var(--text);font-family:var(--font);font-size:12px;outline:none;}
        table{width:100%;border-collapse:collapse;}
        thead th{background:var(--surface2);padding:9px 14px;font-size:10px;font-weight:700;
          text-align:left;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;
          border-bottom:1px solid var(--border);}
        tbody tr{border-bottom:1px solid rgba(42,47,61,0.6);}
        tbody tr:last-child{border-bottom:none;}
        tbody tr:hover{background:var(--surface2);}
        td{padding:10px 14px;font-size:12px;}
        .fp{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px;margin-bottom:16px;}
        .fp-t{font-size:13px;font-weight:700;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border);}
        .fg{margin-bottom:14px;}
        .fl{font-size:11px;font-weight:600;color:var(--muted);margin-bottom:5px;display:block;text-transform:uppercase;letter-spacing:0.4px;}
        .fc{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);
          padding:8px 12px;color:var(--text);font-family:var(--font);font-size:13px;outline:none;transition:border-color 0.12s;}
        .fc:focus{border-color:var(--accent);}
        textarea.fc{resize:vertical;min-height:80px;}
        .fg2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        .fg3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
        .fa{display:flex;gap:8px;padding-top:8px;}
        .note{border-radius:var(--r-sm);padding:10px 12px;display:flex;gap:8px;align-items:flex-start;font-size:12px;margin-bottom:12px;}
        .note-w{background:var(--amber-bg);border:1px solid rgba(251,191,36,0.3);color:var(--amber);}
        .note-s{background:var(--green-bg);border:1px solid rgba(52,211,153,0.3);color:var(--green);}
        .note-i{background:var(--accent-bg);border:1px solid rgba(79,142,247,0.3);color:var(--accent);}
        .note-e{background:var(--red-bg);border:1px solid rgba(248,113,113,0.3);color:var(--red);}
        .tc{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;}
        .thc{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:18px;}
        .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px;}
        .card:hover{border-color:var(--border2);}
        .ct{font-size:13px;font-weight:700;margin-bottom:3px;}
        .cm{font-size:11px;color:var(--muted);}
        .al-row{display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(42,47,61,0.6);align-items:flex-start;}
        .al-ico{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;}
        .al-body{flex:1;}
        .al-act{font-size:12px;font-weight:600;}
        .al-det{font-size:11px;color:var(--muted);}
        .al-t{font-size:10px;color:var(--hint);white-space:nowrap;font-family:var(--mono);}
        .prog{background:var(--surface3);border-radius:3px;height:5px;overflow:hidden;}
        .prog-b{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--accent),var(--purple));}
        .cf-card{background:var(--surface);border:1px solid rgba(248,113,113,0.4);border-radius:var(--r);overflow:hidden;margin-bottom:14px;}
        .cf-hdr{background:var(--red-bg);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(248,113,113,0.2);}
        .cf-vs{display:grid;grid-template-columns:1fr 1fr;}
        .cf-v{padding:12px 14px;}
        .cf-v+.cf-v{border-left:1px solid var(--border);}
        .cf-vl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:6px;}
        .cf-vf{font-size:11px;margin-bottom:3px;}
        .cf-vf span{color:var(--muted);margin-right:3px;}
        .cf-vf strong{color:var(--amber);}
        .cert-p{background:white;color:#1a1a2e;border-radius:8px;padding:24px 28px;
          font-family:'Times New Roman',serif;border:1px solid var(--border);max-width:420px;}
        .cert-p h2{text-align:center;font-size:13px;margin-bottom:2px;text-transform:uppercase;}
        .cert-p h3{text-align:center;font-size:11px;color:#555;margin-bottom:10px;}
        .cert-p hr{border:1px solid #ccc;margin:8px 0;}
        .cert-p p{font-size:11px;text-align:justify;margin-bottom:6px;line-height:1.6;}
        .cert-sig{text-align:center;font-size:11px;margin-top:20px;}
        .cert-sig strong{display:block;margin-top:16px;}
        .bl-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
          padding:14px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;}
        .bl-case{font-family:var(--mono);font-size:10px;color:var(--muted);
          background:var(--surface2);padding:3px 7px;border-radius:4px;white-space:nowrap;margin-top:2px;}
        .ann{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);
          border-radius:var(--r);padding:14px;margin-bottom:10px;}
        .ann.pinned{border-left-color:var(--amber);}
        .ann-cat{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;}
        .ann-t{font-size:13px;font-weight:700;margin-bottom:4px;}
        .ann-b{font-size:12px;color:var(--muted);line-height:1.6;}
        .ann-f{font-size:10px;color:var(--hint);margin-top:8px;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
      `}</style>

      <div id="appWrap" className="app" style={{ display: 'flex' }}>
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sb-logo" style={{ flexDirection: 'column', alignItems: 'center' }}>
            <img
              src={logo}
              alt="Logo"
              style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '8px' }}
            />
            <div>
              <div className="sb-title">Bustrac Hub</div>
              <div className="sb-sub">Staff Portal</div>
            </div>
          </div>
          <nav className="sb-nav">
            <div className="sb-sec">Overview</div>
            <button className={`nav-btn ${screen === 'dashboard' ? 'active' : ''}`} onClick={() => nav('dashboard')}>
              <span className="nav-ico">📊</span>Dashboard
            </button>

            <div className="sb-sec">Residents</div>
            <button className={`nav-btn ${screen === 'residents' ? 'active' : ''}`} onClick={() => nav('residents')}>
              <span className="nav-ico">👥</span>Manage Residents
            </button>
            <button className={`nav-btn ${screen === 'households' ? 'active' : ''}`} onClick={() => nav('households')}>
              <span className="nav-ico">🏠</span>Manage Households
            </button>
            <button
              className={`nav-btn ${screen === 'add-resident' ? 'active' : ''}`}
              onClick={() => nav('add-resident')}
            >
              <span className="nav-ico">➕</span>Add Resident
            </button>

            <div className="sb-sec">Certificates</div>
            <button className={`nav-btn ${screen === 'cert-req' ? 'active' : ''}`} onClick={() => nav('cert-req')}>
              <span className="nav-ico">📝</span>Certificate Request<span className="nb nb-amber">3</span>
            </button>
            <button
              className={`nav-btn ${screen === 'cert-approve' ? 'active' : ''}`}
              onClick={() => nav('cert-approve')}
            >
              <span className="nav-ico">✅</span>Cert. Approval
            </button>
            <button className={`nav-btn ${screen === 'cert-print' ? 'active' : ''}`} onClick={() => nav('cert-print')}>
              <span className="nav-ico">🖨️</span>Issuance &amp; Print
            </button>

            <div className="sb-sec">Aid Distribution</div>
            <button className={`nav-btn ${screen === 'programs' ? 'active' : ''}`} onClick={() => nav('programs')}>
              <span className="nav-ico">📦</span>Programs
            </button>
            <button className={`nav-btn ${screen === 'aid-encode' ? 'active' : ''}`} onClick={() => nav('aid-encode')}>
              <span className="nav-ico">➕</span>Encode Distribution
            </button>
            <button className={`nav-btn ${screen === 'aid-logs' ? 'active' : ''}`} onClick={() => nav('aid-logs')}>
              <span className="nav-ico">📋</span>Distribution Logs
            </button>

            <div className="sb-sec">Blotter</div>
            <button className={`nav-btn ${screen === 'blotter-new' ? 'active' : ''}`} onClick={() => nav('blotter-new')}>
              <span className="nav-ico">🚨</span>File Blotter Entry
            </button>
            <button
              className={`nav-btn ${screen === 'blotter-manage' ? 'active' : ''}`}
              onClick={() => nav('blotter-manage')}
            >
              <span className="nav-ico">📂</span>Manage Blotter<span className="nb nb-red">2</span>
            </button>
            <button
              className={`nav-btn ${screen === 'blotter-detail' ? 'active' : ''}`}
              onClick={() => nav('blotter-detail')}
            >
              <span className="nav-ico">📨</span>Blotter Summon
            </button>

            <div className="sb-sec">Community</div>
            <button
              className={`nav-btn ${screen === 'announcements' ? 'active' : ''}`}
              onClick={() => nav('announcements')}
            >
              <span className="nav-ico">📢</span>Announcements
            </button>
            <button className={`nav-btn ${screen === 'feedback' ? 'active' : ''}`} onClick={() => nav('feedback')}>
              <span className="nav-ico">💬</span>Feedback<span className="nb nb-red">5</span>
            </button>

            <div className="sb-sec">Reports</div>
            <button className={`nav-btn ${screen === 'reports' ? 'active' : ''}`} onClick={() => nav('reports')}>
              <span className="nav-ico">📈</span>Generate Reports
            </button>
          </nav>
          <div className="sb-foot">
            <div className="sb-ava">MC</div>
            <div>
              <div className="sb-uname">Mark Cortero</div>
              <div className="sb-urole">Staff</div>
            </div>
            <div className="online-dot" title="Online — CouchDB synced" />
          </div>
        </aside>

        {/* MAIN */}
        <div className="main">
          <header className="topbar">
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{t[0]}</span>
              <br />
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t[1]}</span>
            </div>
            {offline && <div className="offline-pill">📡 Offline — syncing to CouchDB</div>}
            <button className="btn btn-g btn-sm" onClick={toggleOffline}>
              Toggle Offline
            </button>
            <button className="btn btn-g btn-sm" onClick={logout}>
              Sign Out
            </button>
          </header>

          <div className="content">
            {/* DASHBOARD */}
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
                  <div className="sc">
                    <div className="si">💬</div>
                    <div className="sl">Unread Feedback</div>
                    <div className="sv" style={{ color: 'var(--teal)' }}>5</div>
                  </div>
                </div>
                <div className="tc">
                  <div>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--muted)',
                        marginBottom: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Recent Activity
                    </div>
                    <div className="tw">
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
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--muted)',
                        marginBottom: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Pending Actions
                    </div>
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ct">Certificate Requests</div>
                          <div className="cm">3 pending approval</div>
                        </div>
                        <button className="btn btn-p btn-sm" onClick={() => nav('cert-approve')}>
                          Review
                        </button>
                      </div>
                    </div>
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ct">Resident Feedback</div>
                          <div className="cm">5 unread submissions</div>
                        </div>
                        <button className="btn btn-p btn-sm" onClick={() => nav('feedback')}>
                          Review
                        </button>
                      </div>
                    </div>
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ct">Open Blotter Cases</div>
                          <div className="cm">4 active cases</div>
                        </div>
                        <button className="btn btn-p btn-sm" onClick={() => nav('blotter-manage')}>
                          Manage
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MANAGE RESIDENTS */}
            {screen === 'residents' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Manage Residents</div>
                    <div className="ps">1,248 registered residents</div>
                  </div>
                  <button className="btn btn-p" onClick={() => nav('add-resident')}>
                    ＋ Add Resident
                  </button>
                </div>
                <div className="tw">
                  <div className="tb">
                    <div className="sb-box">
                      <span>🔍</span>
                      <input placeholder="Search by name, purok..." />
                    </div>
                    <select className="fc" style={{ width: '130px' }}>
                      <option>All Puroks</option>
                      <option>Purok 1</option>
                      <option>Purok 2</option>
                      <option>Purok 3</option>
                      <option>Purok 4</option>
                      <option>Purok 5</option>
                    </select>
                    <select className="fc" style={{ width: '110px' }}>
                      <option>All Gender</option>
                      <option>Male</option>
                      <option>Female</option>
                    </select>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Full Name</th>
                        <th>Purok</th>
                        <th>Age</th>
                        <th>Status</th>
                        <th>Voter</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={monoMuted}>RES-0001</td>
                        <td><strong>Santos, Maria D.</strong></td>
                        <td><span className="badge b">Purok 3</span></td>
                        <td>34</td>
                        <td>Married</td>
                        <td><span className="badge g">✓ Yes</span></td>
                        <td><button className="btn btn-g btn-sm">Edit</button></td>
                      </tr>
                      <tr>
                        <td style={monoMuted}>RES-0002</td>
                        <td><strong>Reyes, Juan B.</strong></td>
                        <td><span className="badge p">Purok 1</span></td>
                        <td>67</td>
                        <td>Widowed</td>
                        <td><span className="badge g">✓ Yes</span></td>
                        <td><button className="btn btn-g btn-sm">Edit</button></td>
                      </tr>
                      <tr>
                        <td style={monoMuted}>RES-0003</td>
                        <td><strong>Garcia, Ana L.</strong></td>
                        <td><span className="badge t">Purok 2</span></td>
                        <td>28</td>
                        <td>Single</td>
                        <td><span className="badge gr">✗ No</span></td>
                        <td><button className="btn btn-g btn-sm">Edit</button></td>
                      </tr>
                      <tr>
                        <td style={monoMuted}>RES-0412</td>
                        <td>
                          <strong>Dela Cruz, Maria</strong>{' '}
                          <span className="badge r" style={{ fontSize: '9px' }}>⚠ Conflict</span>
                        </td>
                        <td><span className="badge a">Purok ?</span></td>
                        <td>29</td>
                        <td>Married</td>
                        <td><span className="badge g">✓ Yes</span></td>
                        <td><button className="btn btn-d btn-sm">Resolve</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ADD RESIDENT */}
            {screen === 'add-resident' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Add New Resident</div>
                    <div className="ps">Fill in the resident's complete profile</div>
                  </div>
                  <button className="btn btn-g" onClick={() => nav('residents')}>
                    ← Back
                  </button>
                </div>
                <div className="fp">
                  <div className="fp-t">Personal Information</div>
                  <div className="fg3">
                    <div className="fg">
                      <label className="fl">First Name</label>
                      <input className="fc" placeholder="e.g. Maria" />
                    </div>
                    <div className="fg">
                      <label className="fl">Middle Name</label>
                      <input className="fc" placeholder="e.g. Dela Cruz" />
                    </div>
                    <div className="fg">
                      <label className="fl">Last Name</label>
                      <input className="fc" placeholder="e.g. Santos" />
                    </div>
                  </div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Birthdate</label>
                      <input className="fc" type="date" />
                    </div>
                    <div className="fg">
                      <label className="fl">Gender</label>
                      <select className="fc">
                        <option>Male</option>
                        <option>Female</option>
                      </select>
                    </div>
                  </div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Civil Status</label>
                      <select className="fc">
                        <option>Single</option>
                        <option>Married</option>
                        <option>Widowed</option>
                        <option>Separated</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label className="fl">Contact Number</label>
                      <input className="fc" placeholder="09XX-XXX-XXXX" />
                    </div>
                  </div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Purok</label>
                      <select className="fc">
                        <option>Purok 1</option>
                        <option>Purok 2</option>
                        <option>Purok 3</option>
                        <option>Purok 4</option>
                        <option>Purok 5</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label className="fl">Household</label>
                      <select className="fc">
                        <option>-- Select Household --</option>
                        <option>HH-0012 — Santos Family</option>
                        <option>HH-0003 — Reyes Family</option>
                      </select>
                    </div>
                  </div>
                  <div className="fg">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="checkbox" /> Registered Voter
                    </label>
                  </div>
                </div>
                <div className="note note-i" style={{ marginBottom: '14px' }}>
                  🔄 <strong>Offline mode:</strong> This record will be saved to the local CouchDB instance and synced
                  when connected.
                </div>
                <div className="fa">
                  <button className="btn btn-p">💾 Save Resident</button>
                  <button className="btn btn-g">Cancel</button>
                </div>
              </div>
            )}

            {/* HOUSEHOLDS */}
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
                    <select className="fc" style={{ width: '130px' }}>
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
                        <td style={mono10}>HH-0012</td>
                        <td>Santos, Pedro A.</td>
                        <td>No. 12, Rizal St.</td>
                        <td><span className="badge b">Purok 3</span></td>
                        <td>5</td>
                        <td>
                          <button className="btn btn-g btn-sm">View</button>{' '}
                          <button className="btn btn-g btn-sm">Edit</button>
                        </td>
                      </tr>
                      <tr>
                        <td style={mono10}>HH-0003</td>
                        <td>Reyes, Elpidio R.</td>
                        <td>No. 3, Mabini Ave.</td>
                        <td><span className="badge p">Purok 1</span></td>
                        <td>3</td>
                        <td>
                          <button className="btn btn-g btn-sm">View</button>{' '}
                          <button className="btn btn-g btn-sm">Edit</button>
                        </td>
                      </tr>
                      <tr>
                        <td style={mono10}>HH-0021</td>
                        <td>Lopez, Ricardo M.</td>
                        <td>No. 21, Bonifacio Rd.</td>
                        <td><span className="badge a">Purok 5</span></td>
                        <td>7</td>
                        <td>
                          <button className="btn btn-g btn-sm">View</button>{' '}
                          <button className="btn btn-g btn-sm">Edit</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CERT REQUEST */}
            {screen === 'cert-req' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Certificate Request</div>
                    <div className="ps">Submit or view certificate requests</div>
                  </div>
                </div>
                <div className="tc">
                  <div className="fp">
                    <div className="fp-t">New Request</div>
                    <form onSubmit={submitStaffCert}>
                      <div className="fg">
                        <label className="fl">Resident</label>
                        <select
                          className="fc"
                          required
                          value={certForm.resident}
                          onChange={(e) => setCertForm({ ...certForm, resident: e.target.value })}
                        >
                          <option value="">-- Select Resident --</option>
                          <option>Santos, Maria D. (RES-0001)</option>
                          <option>Reyes, Juan B. (RES-0002)</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl">Certificate Type</label>
                        <select
                          className="fc"
                          required
                          value={certForm.certType}
                          onChange={(e) => setCertForm({ ...certForm, certType: e.target.value })}
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
                          required
                          value={certForm.purpose}
                          onChange={(e) => setCertForm({ ...certForm, purpose: e.target.value })}
                        />
                      </div>
                      <div className="fa">
                        <button type="submit" className="btn btn-p">
                          Submit Request
                        </button>
                      </div>
                    </form>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '10px',
                      }}
                    >
                      Pending
                    </div>
                    <div className="tw">
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
                            <td style={mono10}>CERT-2024-089</td>
                            <td>Santos, Maria</td>
                            <td><span className="badge b">Clearance</span></td>
                            <td><span className="badge a">Pending</span></td>
                          </tr>
                          <tr>
                            <td style={mono10}>CERT-2024-090</td>
                            <td>Cruz, Ramon</td>
                            <td><span className="badge a">Indigency</span></td>
                            <td><span className="badge a">Pending</span></td>
                          </tr>
                          <tr>
                            <td style={mono10}>CERT-2024-088</td>
                            <td>Lim, Ana</td>
                            <td><span className="badge t">Residency</span></td>
                            <td><span className="badge g">Approved</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CERT APPROVAL */}
            {screen === 'cert-approve' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Certificate Approval</div>
                    <div className="ps">Review and approve pending requests</div>
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
                        <td style={mono10}>CERT-2024-089</td>
                        <td>
                          <strong>Santos, Maria D.</strong>
                          <br />
                          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>RES-0001 · Purok 3</span>
                        </td>
                        <td><span className="badge b">Clearance</span></td>
                        <td style={{ fontSize: '11px', maxWidth: '160px' }}>For employment at DOLE-Camarines Sur</td>
                        <td style={{ fontSize: '10px', color: 'var(--muted)' }}>Apr 7</td>
                        <td>
                          <button className="btn btn-s btn-sm">✓ Approve</button>{' '}
                          <button className="btn btn-d btn-sm">✗ Reject</button>
                        </td>
                      </tr>
                      <tr>
                        <td style={mono10}>CERT-2024-090</td>
                        <td>
                          <strong>Cruz, Ramon P.</strong>
                          <br />
                          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>RES-0044 · Purok 2</span>
                        </td>
                        <td><span className="badge a">Indigency</span></td>
                        <td style={{ fontSize: '11px', maxWidth: '160px' }}>For Philhealth application</td>
                        <td style={{ fontSize: '10px', color: 'var(--muted)' }}>Apr 7</td>
                        <td>
                          <button className="btn btn-s btn-sm">✓ Approve</button>{' '}
                          <button className="btn btn-d btn-sm">✗ Reject</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CERT PRINT */}
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
                            <td style={mono10}>CERT-2024-088</td>
                            <td>Lim, Ana G.</td>
                            <td><span className="badge t">Residency</span></td>
                            <td><span className="badge g">Approved</span></td>
                            <td><button className="btn btn-p btn-sm">🖨️ Print</button></td>
                          </tr>
                          <tr>
                            <td style={mono10}>CERT-2024-085</td>
                            <td>Dela Rosa, Ben</td>
                            <td><span className="badge b">Clearance</span></td>
                            <td><span className="badge gr">Issued</span></td>
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
                      <h2 style={{ marginTop: '8px' }}>BARANGAY CLEARANCE</h2>
                      <hr />
                      <p style={{ marginTop: '10px' }}>
                        This is to certify that <strong>ANA GRACE LIM</strong>, of legal age, a <em>bona fide</em>{' '}
                        resident of Purok 2, Barangay Bustrac, has been found to be of{' '}
                        <strong>good moral character</strong> and has no derogatory record on file as of this date.
                      </p>
                      <p>
                        This certification is issued upon the request of the above-named person for{' '}
                        <strong>employment purposes</strong> and for whatever legal purpose it may serve.
                      </p>
                      <div className="cert-sig">
                        Issued at Barangay Bustrac, April 7, 2024
                        <br />
                        Cert. No.: <strong>CERT-2024-088</strong>
                        <strong>Hon. Barangay Captain</strong>
                        <div>Barangay Captain, Barangay Bustrac</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PROGRAMS */}
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
                      <button className="btn btn-p btn-sm" onClick={() => nav('aid-encode')}>
                        Encode
                      </button>
                      <button className="btn btn-g btn-sm" onClick={() => nav('aid-logs')}>
                        Logs
                      </button>
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
                      <div
                        className="prog-b"
                        style={{ width: '100%', background: 'linear-gradient(90deg,var(--green),var(--teal))' }}
                      />
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

            {/* AID ENCODE */}
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
                    <div className="fp-t">Distribution Entry</div>
                    <div className="fg">
                      <label className="fl">Distribution Program</label>
                      <select className="fc">
                        <option>Ayuda Rice Distribution (PROG-2024-004)</option>
                      </select>
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
                      ⚠ <strong>Duplicate Alert:</strong> Lopez, Pedro D. has already received aid under this program.
                      Entry blocked.
                    </div>
                    <div className="tw">
                      <table>
                        <thead>
                          <tr>
                            <th>Resident</th>
                            <th>Aid</th>
                            <th>By</th>
                            <th>Time</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Cruz, Ramon P.</td>
                            <td>Rice 5kg</td>
                            <td>Cortero</td>
                            <td style={mono10}>09:02</td>
                            <td><span className="badge g">OK</span></td>
                          </tr>
                          <tr>
                            <td>Garcia, Ana L.</td>
                            <td>Rice 5kg</td>
                            <td>Napagal</td>
                            <td style={mono10}>08:55</td>
                            <td><span className="badge t">Synced</span></td>
                          </tr>
                          <tr>
                            <td>Lopez, Pedro D.</td>
                            <td>Rice 5kg</td>
                            <td>Amparado</td>
                            <td style={mono10}>08:40</td>
                            <td><span className="badge r">Duplicate</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AID LOGS */}
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
                      <span>🔍</span>
                      <input placeholder="Search beneficiary..." />
                    </div>
                    <select className="fc" style={{ width: '180px' }}>
                      <option>All Programs</option>
                      <option>Ayuda Rice Distribution</option>
                    </select>
                    <select className="fc" style={{ width: '110px' }}>
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
                        <td style={mono10}>LOG-0041</td>
                        <td>Cruz, Ramon P.</td>
                        <td>Rice Distribution</td>
                        <td>Rice 5kg</td>
                        <td>Cortero</td>
                        <td style={{ fontSize: '10px' }}>Apr 7, 09:02</td>
                        <td><span className="badge g">Normal</span></td>
                      </tr>
                      <tr>
                        <td style={mono10}>LOG-0040</td>
                        <td>Garcia, Ana L.</td>
                        <td>Rice Distribution</td>
                        <td>Rice 5kg</td>
                        <td>Napagal</td>
                        <td style={{ fontSize: '10px' }}>Apr 7, 08:55</td>
                        <td><span className="badge t">Offline sync</span></td>
                      </tr>
                      <tr>
                        <td style={mono10}>LOG-0039</td>
                        <td>Lopez, Pedro D.</td>
                        <td>Rice Distribution</td>
                        <td>Rice 5kg</td>
                        <td>Amparado</td>
                        <td style={{ fontSize: '10px' }}>Apr 7, 08:40</td>
                        <td><span className="badge r">⚠ Duplicate</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* BLOTTER NEW */}
            {screen === 'blotter-new' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">File Blotter Entry</div>
                    <div className="ps">Record a new incident in the digital blotter</div>
                  </div>
                </div>
                <div className="fp">
                  <div className="fp-t">Incident Details</div>
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">Date of Incident</label>
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
                      <input className="fc" placeholder="e.g. Purok 5, near the court" />
                    </div>
                  </div>
                </div>
                <div className="fp">
                  <div className="fp-t">Parties Involved</div>
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
                      <option>Open</option>
                      <option>Under Mediation</option>
                      <option>Resolved</option>
                      <option>Referred to Higher Authority</option>
                    </select>
                  </div>
                </div>
                <div className="fa">
                  <button className="btn btn-p">📋 File Blotter Entry</button>
                  <button className="btn btn-g">Cancel</button>
                </div>
              </div>
            )}

            {/* BLOTTER MANAGE */}
            {screen === 'blotter-manage' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Blotter Records</div>
                    <div className="ps">Manage filed barangay cases</div>
                  </div>
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
                    <select className="fc" style={{ width: '150px' }}>
                      <option>All Types</option>
                      <option>Noise Complaint</option>
                      <option>Property Dispute</option>
                    </select>
                    <select className="fc" style={{ width: '140px' }}>
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
                        <td style={mono10}>BLT-2024-041</td>
                        <td>Noise Complaint</td>
                        <td>Reyes, Carmen</td>
                        <td>Torres, Mark</td>
                        <td>Purok 5</td>
                        <td style={{ fontSize: '10px' }}>Apr 7</td>
                        <td><span className="badge r">Open</span></td>
                        <td>
                          <button className="btn btn-g btn-sm" onClick={() => nav('blotter-detail')}>
                            View
                          </button>{' '}
                          <button className="btn btn-g btn-sm">Print</button>
                        </td>
                      </tr>
                      <tr>
                        <td style={mono10}>BLT-2024-040</td>
                        <td>Property Dispute</td>
                        <td>Santos, Jose</td>
                        <td>Cruz, Ana</td>
                        <td>Purok 2</td>
                        <td style={{ fontSize: '10px' }}>Apr 5</td>
                        <td><span className="badge a">Mediation</span></td>
                        <td>
                          <button className="btn btn-g btn-sm">Update</button>{' '}
                          <button className="btn btn-g btn-sm">Print</button>
                        </td>
                      </tr>
                      <tr>
                        <td style={mono10}>BLT-2024-038</td>
                        <td>Domestic Concern</td>
                        <td>Lim, Rosa</td>
                        <td>Lim, Carlos</td>
                        <td>Purok 1</td>
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

            {/* BLOTTER DETAIL */}
            {screen === 'blotter-detail' && (
              <div className="screen active">
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
                            value={staffCase.caseNum}
                            disabled
                            style={{ background: 'var(--surface2)', color: 'var(--muted)' }}
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="fl">Status</label>
                          <select
                            className="fc"
                            value={staffCase.status}
                            onChange={(e) => updateCase('status', e.target.value)}
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
                            value={staffCase.dateFiled}
                            onChange={(e) => updateCase('dateFiled', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="fl">Time</label>
                          <input
                            className="fc"
                            type="time"
                            value={staffCase.timeFiled}
                            onChange={(e) => updateCase('timeFiled', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="fg">
                        <label className="fl">Incident Type</label>
                        <select
                          className="fc"
                          value={staffCase.incidentType}
                          onChange={(e) => updateCase('incidentType', e.target.value)}
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
                          value={staffCase.location}
                          onChange={(e) => updateCase('location', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="fp">
                      <div className="fp-t">👤 Complainant Information</div>
                      <div className="fg">
                        <label className="fl">Full Name</label>
                        <input
                          className="fc"
                          value={staffCase.compName}
                          onChange={(e) => updateCase('compName', e.target.value)}
                        />
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Resident ID</label>
                          <input
                            className="fc"
                            value={staffCase.compID}
                            disabled
                            style={{ background: 'var(--surface2)', color: 'var(--muted)' }}
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="fl">Status</label>
                          <input
                            className="fc"
                            defaultValue="Registered Resident"
                            disabled
                            style={{ background: 'var(--surface2)', color: 'var(--muted)' }}
                            readOnly
                          />
                        </div>
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Contact Number</label>
                          <input
                            className="fc"
                            value={staffCase.compContact}
                            onChange={(e) => updateCase('compContact', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="fl">Purok</label>
                          <select
                            className="fc"
                            value={staffCase.compPurok}
                            onChange={(e) => updateCase('compPurok', e.target.value)}
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
                          style={{ minHeight: '100px' }}
                          value={staffCase.narrative}
                          onChange={(e) => updateCase('narrative', e.target.value)}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Status Notes</label>
                        <textarea
                          className="fc"
                          style={{ minHeight: '80px' }}
                          value={staffCase.statusNotes}
                          onChange={(e) => updateCase('statusNotes', e.target.value)}
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
                          value={staffCase.respName}
                          onChange={(e) => updateCase('respName', e.target.value)}
                        />
                      </div>
                      <div className="fg2">
                        <div>
                          <label className="fl">Resident ID</label>
                          <input
                            className="fc"
                            value={staffCase.respID}
                            disabled
                            style={{ background: 'var(--surface2)', color: 'var(--muted)' }}
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="fl">Status</label>
                          <input
                            className="fc"
                            defaultValue="Registered Resident"
                            disabled
                            style={{ background: 'var(--surface2)', color: 'var(--muted)' }}
                            readOnly
                          />
                        </div>
                      </div>
                      <div className="fg">
                        <label className="fl">Contact Number (SMS)</label>
                        <input
                          className="fc"
                          value={staffCase.respContact}
                          onChange={(e) => updateCase('respContact', e.target.value)}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Email Address</label>
                        <input
                          className="fc"
                          type="email"
                          value={staffCase.respEmail}
                          onChange={(e) => updateCase('respEmail', e.target.value)}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Address</label>
                        <input
                          className="fc"
                          value={staffCase.respAddress}
                          onChange={(e) => updateCase('respAddress', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="fp" style={{ borderLeft: '3px solid var(--accent)' }}>
                      <div className="fp-t">📨 Send Summons / Notification</div>
                      <div className="note note-i" style={{ marginBottom: '12px' }}>
                        Send official notification to respondent regarding this complaint and request their appearance
                        at barangay hall.
                      </div>

                      <div className="fg">
                        <label className="fl">Scheduled Appearance Date</label>
                        <input
                          className="fc"
                          type="date"
                          value={staffCase.summonDate}
                          onChange={(e) => updateCase('summonDate', e.target.value)}
                        />
                      </div>

                      <div className="fg">
                        <label className="fl">Scheduled Time</label>
                        <input
                          className="fc"
                          type="time"
                          value={staffCase.summonTime}
                          onChange={(e) => updateCase('summonTime', e.target.value)}
                        />
                      </div>

                      <div className="fg">
                        <label className="fl">Message / Instructions</label>
                        <textarea
                          className="fc"
                          style={{ minHeight: '100px' }}
                          value={staffCase.summonMsg}
                          onChange={(e) => updateCase('summonMsg', e.target.value)}
                        />
                      </div>

                      <div className="fg">
                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={staffCase.sendSMS}
                            onChange={(e) => updateCase('sendSMS', e.target.checked)}
                          />{' '}
                          <span>Send via SMS</span>
                        </label>
                      </div>

                      <div className="fg">
                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={staffCase.sendEmail}
                            onChange={(e) => updateCase('sendEmail', e.target.checked)}
                          />{' '}
                          <span>Send via Email</span>
                        </label>
                      </div>

                      <div className="note note-s" style={{ marginBottom: '12px' }}>
                        ✓ SMS and Email enabled. Notification will be recorded in audit log.
                      </div>

                      <div className="fa" style={{ flexDirection: 'column', gap: '8px' }}>
                        <button
                          className="btn btn-p"
                          style={{ width: '100%', justifyContent: 'center' }}
                          onClick={staffSendSummons}
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div
                          style={{
                            padding: '10px',
                            background: 'var(--surface2)',
                            borderRadius: 'var(--r-sm)',
                            borderLeft: '3px solid var(--green)',
                          }}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>✓ SMS Sent</div>
                          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                            April 7, 11:15 AM · Initial complaint filed
                          </div>
                        </div>
                        <div
                          style={{
                            padding: '10px',
                            background: 'var(--surface2)',
                            borderRadius: 'var(--r-sm)',
                            borderLeft: '3px solid var(--muted)',
                          }}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>Pending Summons</div>
                          <div style={{ fontSize: '10px', color: 'var(--hint)', marginTop: '2px' }}>
                            Will be sent upon confirmation
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-s" onClick={staffSaveComplaintChanges}>
                      💾 Save Changes
                    </button>
                    <button className="btn btn-g" onClick={staffCancelEdit}>
                      Cancel
                    </button>
                    <button className="btn btn-a">📝 Schedule Mediation</button>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-g">📋 Update Status</button>
                    <button className="btn btn-g" onClick={() => nav('blotter-manage')}>
                      Close &amp; Return
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ANNOUNCEMENTS */}
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
                    <div className="fp-t">Post Announcement</div>
                    <div className="fg">
                      <label className="fl">Title</label>
                      <input className="fc" placeholder="Announcement title" />
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
                      <div className="ann-b">
                        Free consultation, blood pressure check, medicine dispensing. All residents welcome. Bring
                        valid ID.
                      </div>
                      <div className="ann-f">Posted by Cortero · Apr 5</div>
                    </div>
                    <div className="ann">
                      <div className="ann-cat" style={{ color: 'var(--accent)' }}>🏛️ Governance</div>
                      <div className="ann-t">Barangay Assembly — Apr 20</div>
                      <div className="ann-b">
                        Quarterly assembly at 8:00 AM, covered court. All residents are encouraged to attend.
                      </div>
                      <div className="ann-f">Posted by Napagal · Apr 4</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FEEDBACK */}
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
                    <div className="sb-box">
                      <span>🔍</span>
                      <input placeholder="Search..." />
                    </div>
                    <select className="fc" style={{ width: '120px' }}>
                      <option>All Types</option>
                      <option>Complaint</option>
                      <option>Suggestion</option>
                      <option>Inquiry</option>
                    </select>
                    <select className="fc" style={{ width: '130px' }}>
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
                        <td style={mono10}>FB-041</td>
                        <td>Santos, Maria</td>
                        <td><span className="badge r">Complaint</span></td>
                        <td style={{ fontSize: '11px' }}>Garbage not collected in Purok 3</td>
                        <td style={{ fontSize: '10px' }}>Apr 7</td>
                        <td><span className="badge a">Pending</span></td>
                        <td><button className="btn btn-p btn-sm">Respond</button></td>
                      </tr>
                      <tr>
                        <td style={mono10}>FB-040</td>
                        <td>Reyes, Juan</td>
                        <td><span className="badge b">Suggestion</span></td>
                        <td style={{ fontSize: '11px' }}>Additional streetlights in Purok 1</td>
                        <td style={{ fontSize: '10px' }}>Apr 6</td>
                        <td><span className="badge a">Under Review</span></td>
                        <td><button className="btn btn-g btn-sm">View</button></td>
                      </tr>
                      <tr>
                        <td style={mono10}>FB-039</td>
                        <td>Garcia, Ana</td>
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

            {/* REPORTS */}
            {screen === 'reports' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Generate Reports</div>
                    <div className="ps">Printable summary reports for all modules</div>
                  </div>
                </div>
                <div className="thc">
                  <div className="card">
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📝</div>
                    <div className="ct">Certificate Issuance</div>
                    <div className="cm" style={{ marginBottom: '10px' }}>Monthly issuance summary by type</div>
                    <select className="fc" style={{ marginBottom: '10px' }}>
                      <option>April 2024</option>
                      <option>March 2024</option>
                    </select>
                    <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                      Generate PDF
                    </button>
                  </div>
                  <div className="card">
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📦</div>
                    <div className="ct">Aid Distribution</div>
                    <div className="cm" style={{ marginBottom: '10px' }}>Beneficiary list per program</div>
                    <select className="fc" style={{ marginBottom: '10px' }}>
                      <option>Ayuda Rice Distribution</option>
                    </select>
                    <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                      Generate PDF
                    </button>
                  </div>
                  <div className="card">
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>👥</div>
                    <div className="ct">Resident Registry</div>
                    <div className="cm" style={{ marginBottom: '10px' }}>Full resident list by purok</div>
                    <select className="fc" style={{ marginBottom: '10px' }}>
                      <option>All Puroks</option>
                    </select>
                    <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                      Generate PDF
                    </button>
                  </div>
                  <div className="card">
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>🚨</div>
                    <div className="ct">Blotter Summary</div>
                    <div className="cm" style={{ marginBottom: '10px' }}>Cases grouped by type and status</div>
                    <select className="fc" style={{ marginBottom: '10px' }}>
                      <option>April 2024</option>
                    </select>
                    <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                      Generate PDF
                    </button>
                  </div>
                  <div className="card">
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>💬</div>
                    <div className="ct">Feedback Report</div>
                    <div className="cm" style={{ marginBottom: '10px' }}>Concern submissions and resolutions</div>
                    <select className="fc" style={{ marginBottom: '10px' }}>
                      <option>All Status</option>
                    </select>
                    <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                      Generate PDF
                    </button>
                  </div>
                  <div className="card">
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏠</div>
                    <div className="ct">Household Registry</div>
                    <div className="cm" style={{ marginBottom: '10px' }}>Household listing by purok</div>
                    <select className="fc" style={{ marginBottom: '10px' }}>
                      <option>All Puroks</option>
                    </select>
                    <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                      Generate PDF
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
