import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PouchDB from 'pouchdb';
import logo from '../assets/logo.png';
import CertificateLifecycle from './CertificateLifecycle';
import './DashboardLayout.css';
import { createAuditLog, getAuditLogs } from '../utils/auditLog';

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

const ACTION_META = {
  LOGIN:       { ico: '🔑', bg: 'var(--accent-bg)', badge: 'online',  bClass: 't' },
  USER_LOGIN:  { ico: '🔑', bg: 'var(--accent-bg)', badge: 'online',  bClass: 't' },
  CREATE:      { ico: '🚨', bg: 'var(--red-bg)',    badge: 'online',  bClass: 'g' },
  UPDATE:      { ico: '✏️', bg: 'var(--amber-bg)',  badge: 'online',  bClass: 'g' },
  ARCHIVE:     { ico: '🗃️', bg: 'var(--teal-bg)',   badge: 'archive', bClass: 'a' },
  APPROVE:     { ico: '📝', bg: 'var(--accent-bg)', badge: 'online',  bClass: 't' },
  SYNC:        { ico: '🔄', bg: 'var(--teal-bg)',   badge: 'sync',    bClass: 'b' },
  RESOLVE:     { ico: '⚠️', bg: 'var(--amber-bg)',  badge: 'online',  bClass: 'g' },
  FLAG:        { ico: '⚡', bg: 'var(--red-bg)',    badge: 'online',  bClass: 'g' },
};

function getActionMeta(action = '') {
  const key = action.toUpperCase();
  return ACTION_META[key] || { ico: '📄', bg: 'var(--accent-bg)', badge: 'online', bClass: 'g' };
}

// Helper mapper function for PouchDB feedback doc -> Admin Feedback Table
const mapDocToFeedback = (doc) => {
  const rawTime = doc.timestamp || doc.createdAt || doc.date || new Date().toISOString();
  
  return {
    _id: doc._id,
    _rev: doc._rev,
    id: doc.refNumber || doc.id || doc._id,
    sender: doc.residentName || doc.fullName || doc.username || doc.sender || 'Resident',
    // Fallback sa mga karaniwang property names ng concern type
    type: doc.feedbackType || doc.concernType || doc.category || doc.classification || 
          (doc.type !== 'feedback' && doc.type !== 'feedback_report' ? doc.type : 'Complaint'),
    priority: doc.priority || 'Medium',
    subject: doc.subject || doc.title || 'No Subject',
    message: doc.details || doc.message || doc.description || '',
    rawTimestamp: rawTime,
    date: !isNaN(Date.parse(rawTime))
      ? new Date(rawTime).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : rawTime,
    assignedTo: doc.assignedTo || 'Unassigned',
    status: doc.status || 'Pending',
    attachment: doc.attachment || null,
    response: doc.response || '',
    handledBy: doc.handledBy || '',
    dateResolved: doc.dateResolved || '',
    rawDoc: doc,
  };
};

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function DashboardPortal({ role = 'staff' }) {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Dynamic User Identity ──
const rawUser = sessionStorage.getItem('bustrac_user');

let currentUser = {};

try {
  currentUser = rawUser ? JSON.parse(rawUser) : {};
} catch {
  // Backward compatibility for old plain-string sessions
  currentUser = {
    username: rawUser || '',
  };
}

const username = currentUser.username || '';

const displayName =
  currentUser.fullName ||
  NAME_MAP[username] ||
  username ||
  'Portal User';

const initials = displayName
  .split(' ')
  .map((w) => w[0])
  .join('')
  .slice(0, 2)
  .toUpperCase();
  
  // ── Navigation State ──
  const [screen,  setScreen]  = useState('dashboard');
  const [selectedCertificate, setSelectedCertificate] = useState(null);

  const [syncState, setSyncState] = useState(navigator.onLine ? 'synced' : 'offline');
  
  useEffect(() => {
  const handleOnline = () => {
    setSyncState('syncing');
    
    // Simulate the re-synchronization pipeline to the CouchDB server.
    setTimeout(() => {
      setSyncState('synced');
    }, 2000); // 2-second visual confirmation so the panel can see the sync status
  };

  const handleOffline = () => {
    setSyncState('offline');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
  }, []);

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

  const [showBulkDropdown, setShowBulkDropdown] = useState(false);

  // Multi-select States for the Residents
  const [selectedResidents, setSelectedResidents] = useState([]);

  // State for search input text
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('All Gender');

  // New initialization: It will check if localStorage has content; if not, it will use the default.
  const [residentsList, setResidentsList] = useState(() => {
    const savedResidents = localStorage.getItem('bustrac_residents');
    return savedResidents ? JSON.parse(savedResidents) : [
      { id: 'RES-0001', name: 'Santos, Maria D.', purok: 'Purok 3', purokClass: 'b', age: 34, civilStatus: 'Married', voter: true, household: 'HH-0012', conflict: false },
      { id: 'RES-0002', name: 'Reyes, Juan B.', purok: 'Purok 1', purokClass: 'p', age: 67, civilStatus: 'Widowed', voter: true, household: 'HH-0003', conflict: false },
      { id: 'RES-0003', name: 'Garcia, Ana L.', purok: 'Purok 2', purokClass: 't', age: 28, civilStatus: 'Single', voter: false, household: 'HH-0007', conflict: false },
      { id: 'RES-0412', name: 'Dela Cruz, Maria', purok: 'Purok ?', purokClass: 'a', age: 29, civilStatus: 'Married', voter: true, household: 'HH-0015', conflict: true },
    ];
  });

  // ── DYNAMIC AID PROGRAMS STATE (2026 REALISTIC INITIAL DATA WITH V2 CACHE) ──
  const [programsList, setProgramsList] = useState(() => {
    const savedPrograms = localStorage.getItem('bustrac_programs_v2');
    if (savedPrograms) return JSON.parse(savedPrograms);

    return [
      {
        id: 'PROG-2026-001',
        title: 'Rice Aid & Food Pack Distribution (Neighborhood 1-7)',
        status: 'Active',
        dateLabel: 'Aug 2026',
        current: 425,
        target: 600,
        note: 'Ongoing distribution at Barangay Hall',
      },
      {
        id: 'PROG-2026-002',
        title: 'Educational Assistance for College Students',
        status: 'Active',
        dateLabel: 'Sep 2026',
        current: 120,
        target: 150,
        note: 'Verification phase ongoing',
      },
      {
        id: 'PROG-2026-003',
        title: 'Senior Citizen Social Pension Aid',
        status: 'Upcoming',
        dateLabel: 'Oct 2026',
        current: 0,
        target: 250,
        note: 'Scheduled Oct 12',
      },
      {
        id: 'PROG-2026-004',
        title: 'DSWD Financial Emergency Assistance',
        status: 'Completed',
        dateLabel: 'Jul 2026',
        current: 310,
        target: 310,
        note: 'Completed July 28',
      },
    ];
  });

  // Ensure force save to new key:
  useEffect(() => {
    localStorage.setItem('bustrac_programs_v2', JSON.stringify(programsList));
  }, [programsList]);

// ── NEW ADVANCED PROGRAM MANAGEMENT STATES ──
const [programSearchQuery, setProgramSearchQuery] = useState('');
const [programStatusFilter, setProgramStatusFilter] = useState('All'); // All, Active, Upcoming, Completed, Archived
const [programSortOption, setProgramSortOption] = useState('Newest');  // Newest, Oldest, Alpha, MostBeneficiaries

// Modals/Editing Focus States
const [editingProgram, setEditingProgram] = useState(null); // Will contain the prog object when editing
const [viewingProgram, setViewingProgram] = useState(null); // Will contain the prog object for the full details modal
const [confirmDeleteId, setConfirmDeleteId] = useState(null); // Target ID for the safe delete prompt

const [selectedProgramId, setSelectedProgramId] = useState('');
// Auto-save tracker for the programs
useEffect(() => {
  localStorage.setItem('bustrac_programs', JSON.stringify(programsList));
}, [programsList]);

// Control state for the inline input form of the New Program
const [showNewProgramForm, setShowNewProgramForm] = useState(false);
const [newProgramTitle, setNewProgramTitle] = useState('');
const [newProgramTarget, setNewProgramTarget] = useState(100);
const [newProgramStatus, setNewProgramStatus] = useState('Active');

// ──FUNCTION: ADD A NEW PROGRAM TO THE REGISTRY ──
const handleCreateProgram = (e) => {
  e.preventDefault();
  if (!newProgramTitle.trim()) {
    alert('Please enter the Program name.');
    return;
  }

  const currentYear = new Date().getFullYear();
  const generatedId = `PROG-${currentYear}-${String(programsList.length + 1).padStart(3, '0')}`;
  
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentDateLabel = `${months[new Date().getMonth()]} ${currentYear}`;

  const newProgram = {
    id: generatedId,
    title: newProgramTitle,
    status: newProgramStatus,
    dateLabel: currentDateLabel,
    current: 0,
    target: Number(newProgramTarget),
    note: newProgramStatus === 'Upcoming' ? `Scheduled ${months[new Date().getMonth() + 1]} 15` : ''
  };

  setProgramsList([...programsList, newProgram]);
  alert(`✓ Program ${generatedId} created successfully!`);
  
  // Reset form inputs
  setNewProgramTitle('');
  setNewProgramTarget(100);
  setNewProgramStatus('Active');
  setShowNewProgramForm(false);
};
//  Automatically saved to localStorage whenever there are changes to our residentsList array
useEffect(() => {
  localStorage.setItem('bustrac_residents', JSON.stringify(residentsList));
}, [residentsList]);

  // ──  We will use this to remember which Resident ID is currently being updated ──
  const [editingResidentId, setEditingResidentId] = useState(null);
  
  // 1. Array list for approved certificates that are ready to be issued.
  const [issuedCertificates, setIssuedCertificates] = useState([]);
  // Automatically updates the UI whenever there is a change in PouchDB
useEffect(() => {
  const fetchAllCerts = async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const certs = result.rows
        .map(row => row.doc)
        .filter(doc => doc && doc.type === 'certificate_request');
      setIssuedCertificates(certs);
    } catch (err) {
      console.error("Error loading initial certs:", err);
    }
  };
  
  fetchAllCerts();

  // Listen for real-time database changes (Insert, Update, Delete)
  const changes = db.changes({
    since: 'now',
    live: true,
    include_docs: true
  }).on('change', (change) => {
    if (change.doc && change.doc.type === 'certificate_request') {
      setIssuedCertificates((prevCerts) => {
        // Remove the old version of the doc (if any) and insert the newest
        const filtered = prevCerts.filter(c => c._id !== change.doc._id);
        return [change.doc, ...filtered];
      });
    }
  }).on('error', (err) => {
    console.error("PouchDB change listener error:", err);
  });

  return () => changes.cancel(); 
}, []);

   // FUNCTION FOR DELETING A RESIDENT
  const deleteResident = (id) => {
    if (window.confirm("Are you sure you want to delete this resident?")) {
      setResidentsList(prev => prev.filter(res => res.id !== id));
      setSelectedResidents(prev => prev.filter(selectedId => selectedId !== id));
    }
  };

  // FUNCTION TO ENABLE EDIT MODE
  const startEditResident = (res) => {
    setEditingResidentId(res.id);

    const nameParts = res.name.split(', ');
    const lName = nameParts[0] || '';
    const fName = nameParts[1] || res.name;

    setResidentForm({
      firstName: fName,
      middleName: '',
      lastName: lName,
      birthdate: '',
      gender: 'Male',
      civilStatus: res.civilStatus,
      contact: '09123456789',
      purok: res.purok,
      household: res.household
    });

    nav('edit-resident');
  };

  // FUNCTION TO SAVE THE UPDATED RESIDENT INFORMATION
  const submitEditResident = async (e) => {
    e.preventDefault();

    const {
      firstName,
      middleName,
      lastName,
      civilStatus,
      purok,
      household
    } = residentForm;

    const updatedName = middleName
      ? `${lastName}, ${firstName} ${middleName}`
      : `${lastName}, ${firstName}`;

    setResidentsList(prev =>
      prev.map(res => {
        if (res.id === editingResidentId) {
          return {
            ...res,
            name: updatedName,
            civilStatus,
            purok,
            household,
            age: residentForm.birthdate
              ? new Date().getFullYear() -
                new Date(residentForm.birthdate).getFullYear()
              : res.age
          };
        }
        return res;
      })
    );
    await createAuditLog({
    action: 'UPDATE',
    module: 'RESIDENTS',
    recordId: editingResidentId,
    details: `Updated resident record: ${updatedName}`,
  });

    alert("Resident record updated successfully!");

    setEditingResidentId(null);
    setResidentForm(EMPTY_RESIDENT);
    nav('residents');
  };
  // Admin: Complaint / Summons State
  const [complaint, setComplaint] = useState(INITIAL_COMPLAINT);

  // Admin: Beneficiary List
  const [beneficiaryDraft, setBeneficiaryDraft] = useState({
    name:    '',
    aidType: 'Rice 5kg',
    qty:     1,
  });
  const [beneficiaryList, setBeneficiaryList] = useState([]);

  // ── Sort order for address/purok column ──
  const [addressSortOrder, setAddressSortOrder] = useState('none'); // 'none', 'asc', o 'desc'

  // ──────────────────────────────────────────────────────────────────────
  // HOUSEHOLD CORE FILTER STATES
  // ──────────────────────────────────────────────────────────────────────
  const [householdSearch, setHouseholdSearch] = useState('');
  const [purokFilter, setPurokFilter] = useState('All Puroks');
  
  
  // 1. This already includes setHouseholdsList and a localStorage loading pattern
  const [householdsList, setHouseholdsList] = useState(() => {
  const savedHouseholds = localStorage.getItem('bustrac_households');
  if (savedHouseholds) return JSON.parse(savedHouseholds);
  
  // Default fallback data
  return [
    { id: 'HH-0012', head: 'Santos, Pedro A.', address: 'No. 12, Rizal St.', purok: 'Purok 3', purokClass: 'b', members: 5 },
    { id: 'HH-0003', head: 'Reyes, Elpidio R.', address: 'No. 3, Mabini Ave.', purok: 'Purok 1', purokClass: 'p', members: 3 },
    { id: 'HH-0021', head: 'Lopez, Ricardo M.', address: 'No. 21, Bonifacio Rd.', purok: 'Purok 5', purokClass: 'a', members: 7 },
    { id: 'HH-0004', head: 'Napagal, Jay O.', address: 'No. 7, Zone 1, Nabua', purok: 'Purok 1', purokClass: 'p', members: 0 },
  ];
  });
  const [selectedHouseholdId, setSelectedHouseholdId] = useState(null);
  const EMPTY_HOUSEHOLD = { head: '', address: '', purok: '' };
  const [householdForm, setHouseholdForm] = useState(EMPTY_HOUSEHOLD);

// 2. Auto-save watcher for households
useEffect(() => {
  localStorage.setItem('bustrac_households', JSON.stringify(householdsList));
}, [householdsList]);

// 2. Derived array for dynamic sorting based on active sort order state
const sortedHouseholds = [...householdsList].sort((a, b) => {
  if (addressSortOrder === 'asc') return a.address.localeCompare(b.address);
  if (addressSortOrder === 'desc') return b.address.localeCompare(a.address);
  return 0; // 'none' — will return to default/original order
});
// ──────────────────────────────────────────────────────────────────────
// 3. DYNAMIC DROPDOWN GENERATOR (Extracts unique puroks from active list)
// ──────────────────────────────────────────────────────────────────────
const uniquePuroks = [...new Set(householdsList.map(h => h.purok))].filter(Boolean).sort();

// ──────────────────────────────────────────────────────────────────────
// 4. COMBINED FILTER & SEARCH ENGINE (Google Docs/PouchDB Prep Level)
// ──────────────────────────────────────────────────────────────────────
const filteredHouseholds = sortedHouseholds.filter((h) => {
  const query = householdSearch.toLowerCase();
  
  // A. Search Match Condition (Checks ID, Household Head, and Street Address)
  const matchesSearch = 
    (h.id && h.id.toLowerCase().includes(query)) ||
    (h.head && h.head.toLowerCase().includes(query)) ||
    (h.address && h.address.toLowerCase().includes(query));
    
  // B. Purok Dropdown Filter Match Condition
  const matchesPurok = purokFilter === 'All Puroks' || h.purok === purokFilter;
  
  // Both conditions must pass (TRUE) to remain in the active view list
  return matchesSearch && matchesPurok;
});
  // ─────────────────────────────────────────────
  // HANDLERS — SHARED
  // ─────────────────────────────────────────────
  const nav = (id) => {
  setScreen(id);
  navigate(`?page=${id}`);
  // Updates the browser history so this screen can be tracked by the Back button.
  window.history.pushState({ internalScreen: id }, '', '');
};
  const logout        = ()  => navigate('/login');

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

  // 1. Function to populate the form when Edit is clicked
const handleStartEditResident = (res) => {
  const nameParts = res.name.split(' ');
  
  setResidentForm({
    firstName: nameParts[0] || '',
    middleName: nameParts.length > 2 ? nameParts[1] : '',
    lastName: nameParts[nameParts.length - 1] || '',
    birthdate: '2026-01-01', // Pansamantalang default date para sa form validator
    gender: 'Male', // Default selection
    civilStatus: res.civilStatus,
    contact: '09123456789', // Default contact mock
    purok: res.purok,
    household: res.household
  });

  setEditingResidentId(res.id);
  nav('add-resident'); 
};

// 2. Function to delete the resident from the list
const handleDeleteResident = async (id, name) => {
  // Better for the presentation if the name is asked when deleting
  if (window.confirm(`Sigurado ka ba na gusto mong burahin si ${name} (ID: ${id}) sa system roster?`)) {
    const filteredList = residentsList.filter(res => res.id !== id);
    
    setResidentsList(filteredList);

    // Here we will permanently save to the data simulation cache
    localStorage.setItem('bustrac_residents', JSON.stringify(filteredList));
    setSelectedResidents(prev => prev.filter(selectedId => selectedId !== id));
    
     await createAuditLog({
      action: 'ARCHIVE',
      module: 'RESIDENTS',
      recordId: id,
      details: `Archived resident record: ${name}`,
    });

    alert("✓ Success: Resident record has been completely removed.");
  }
};
  const submitAddResident = async (e) => {
  e.preventDefault();
  const { firstName, middleName, lastName, birthdate, gender, civilStatus, contact, purok, household } = residentForm;
  
  if (!firstName || !middleName || !lastName || !birthdate || !gender || !civilStatus || !contact || !purok || !household) {
    alert('Please fill in all required fields.');
    return;
  }

  const fullName = `${firstName} ${middleName} ${lastName}`;

  let dynamicPurokClass = 'b';
  if (purok.includes('1')) dynamicPurokClass = 'p';
  else if (purok.includes('2')) dynamicPurokClass = 'g';
  else if (purok.includes('5')) dynamicPurokClass = 'a';

  if (editingResidentId) {
    // ── UPDATE LOGIC ──
    const updatedList = residentsList.map((res) => {
      if (res.id === editingResidentId) {
        return {
          ...res,
          name: fullName,
          purok: purok,
          purokClass: dynamicPurokClass,
          age: birthdate ? new Date().getFullYear() - new Date(birthdate).getFullYear() : res.age,
          civilStatus: civilStatus,
          household: household
        };
      }
      return res;
    });

    setResidentsList(updatedList);
    await createAuditLog({
      action: 'UPDATE',
      module: 'RESIDENTS',
      recordId: editingResidentId,
      details: `Updated resident record: ${fullName}`,
    });
    alert(`Resident ${editingResidentId} updated successfully!`);
    setEditingResidentId(null); // I-reset ang edit mode
  } else {
    //  CREATE LOGIC 
    const newResident = {
      id: `RES-${String(residentsList.length + 1).padStart(4, '0')}`,
      name: fullName,
      purok: purok,
      purokClass: dynamicPurokClass,
      age: birthdate ? new Date().getFullYear() - new Date(birthdate).getFullYear() : 0,
      civilStatus: civilStatus,
      voter: true,
      household: household,
      conflict: false
    };
    setResidentsList([...residentsList, newResident]);

    await createAuditLog({
      action: 'CREATE',
      module: 'RESIDENTS',
      recordId: newResident.id,
      details: `Added new resident record: ${fullName}`,
    });
    alert(`Resident added successfully!\n\nName: ${fullName}`);
  }

  setResidentForm(EMPTY_RESIDENT);
  nav('residents');
};
 
 const submitAddHousehold = async (e) => {
  e.preventDefault();
  const { head, address, purok } = householdForm;

  if (!head || !address || !purok) {
    alert('Please fill in all required fields.');
    return;
  }

  // Auto-badge color generator base sa Purok zone
  let dynamicPurokClass = 'b';
  if (purok.includes('1')) dynamicPurokClass = 'p';
  else if (purok.includes('2')) dynamicPurokClass = 'g';
  else if (purok.includes('5')) dynamicPurokClass = 'a';

  const newHousehold = {
    id: `HH-${String(householdsList.length + 1).padStart(4, '0')}`,
    head: head,
    address: address,
    purok: purok,
    purokClass: dynamicPurokClass,
    members: 0 // Magsisimula sa 0 dahil dynamic itong madadagdagan kapag may na-link na residente
  };

  setHouseholdsList([...householdsList, newHousehold]);
  
   await createAuditLog({
    action: 'CREATE',
    module: 'HOUSEHOLDS',
    recordId: newHousehold.id,
    details: `Registered new household: ${newHousehold.head}`,
  });

  alert(`Household Registered successfully!\n\nID: ${newHousehold.id}\nHead of Family: ${head}`);
  
  setHouseholdForm(EMPTY_HOUSEHOLD);
  nav('households'); // Awtomatikong babalik sa listahan na updated
};

  // ─────────────────────────────────────────────
// HANDLERS — DYNAMIC ADMIN COMPLAINT / SUMMONS
// ─────────────────────────────────────────────
const updateComplaintField = (field, value) =>
  setComplaint((prev) => ({ ...prev, [field]: value }));

const saveComplaintChanges = () => {
  const { caseNum, compName, respName, narrative, incidentType, caseStatus, location } = complaint;
  
  if (!compName || !respName || !narrative) {
    alert('⚠️ Please fill in all required fields (names and narrative)');
    return;
  }

  // 1. DYNAMIC DATA PERSISTENCE: Updating the master list in React memory state
  if (typeof setBlotterList === 'function') {
    setBlotterList((prevList) =>
      prevList.map((item) =>
        item.id === caseNum
          ? {
              ...item,
              type: incidentType,
              complainant: compName,
              respondent: respName,
              location: location,
              status: caseStatus,
              narrative: narrative
            }
          : item
      )
    );
  }

  // 2. DYNAMIC ALERT: Now matches the actual Case Number you clicked (e.g., BLT-8875)
  alert(
    `✓ Complaint ${caseNum} updated successfully!\n\n` +
    `Changes saved:\n` +
    `• Complainant: ${compName}\n` +
    `• Respondent: ${respName}\n` +
    `• Status: ${caseStatus}\n\n` +
    `All changes recorded in client registry audit log.`
  );
  
  nav('blotter-manage'); // Awtomatikong ibalik sa listahan para makita ang pagbabago
};

const cancelEdit = () => {
  if (window.confirm('Discard all unsaved changes and return to ledger?')) {
    nav('blotter-manage');
  }
};

const sendSummons = () => {
  const { caseNum, summonDate, summonTime, respName, sendSMS, sendEmail } = complaint;
  
  if (!summonDate || !summonTime) {
    alert('⚠️ Please set a valid date and time for appearance.');
    return;
  }
  
  // Identify the selected notification channels
  const methods = [];
  if (sendSMS || sendSMS === undefined) methods.push('SMS'); // Fallback logic kung true by default
  if (sendEmail) methods.push('Email');

  const confirmMsg = `Send official summons to ${respName} via ${methods.join(' and ')}?\n\n` +
                     `Appearance Schedule: ${summonDate} at ${summonTime}\n\n` +
                     `This operational transaction will toggle data logs.`;
  
  if (window.confirm(confirmMsg)) {
    // When a summons is sent, automatically set the case status to "Under Mediation"
    if (typeof setBlotterList === 'function') {
      setBlotterList((prevList) =>
        prevList.map((item) =>
          item.id === caseNum ? { ...item, status: 'Under Mediation' } : item
        )
      );
      // Also sync the current active form rendering context
      updateComplaintField('caseStatus', 'Under Mediation');
    }

    alert(
      `✓ Summons successfully dispatched via ${methods.join(' and ')} engine!\n\n` +
      `Tracking Log: ${caseNum}\n` +
      `Recipient Party: ${respName}\n` +
      `Scheduled Date: ${summonDate} [${summonTime}]`
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

  

  const handlePrintRelease = async (req) => {
  try {
    const latestDoc = await db.get(req._id);
    const updatedDoc = {
      ...latestDoc,
      status: 'Issued',
      issuedAt: new Date().toISOString(),
      step: 5,
    };
    await db.put(updatedDoc);

    await createAuditLog({
    action: 'UPDATE',
    module: 'CERTIFICATES',
    recordId: req._id,
    details: `Issued and printed certificate for ${req.firstName || ''} ${req.lastName || ''}`,
    });

    setSelectedCertificate(updatedDoc); 

    setTimeout(() => {
      window.print();
    }, 350);
  } catch (err) {
    console.error('Failed to update certificate status:', err);
  }
};

useEffect(() => {
  // Print will only run if the certificate is officially at Step 4 (Issued) and in the correct screen area
  if (selectedCertificate && Number(selectedCertificate.step) === 4 && screen === 'cert-print') {
    const printTimer = setTimeout(() => {
      window.print();
    }, 150);

    return () => clearTimeout(printTimer);
  }
}, [selectedCertificate, screen]);

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
  // Dynamic computing: This looks for a match in the typed input against Name, ID, or Purok
  const filteredResidents = residentsList.filter((res) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      res.name.toLowerCase().includes(query) ||
      res.id.toLowerCase().includes(query) ||
      res.purok.toLowerCase().includes(query);

    const matchesPurok = purokFilter === 'All Puroks' || res.purok === purokFilter;
    const matchesGender = genderFilter === 'All Gender' || res.gender === genderFilter;

    return matchesSearch && matchesPurok && matchesGender;
  });

// Dynamic Calculations for the Dashboard Panels
const totalResidents = residentsList.length;
const totalHouseholds = householdsList.length;
const totalVoters = residentsList.filter(r => r.voter).length;
const totalConflicts = residentsList.filter(r => r.conflict).length;

// Purok Breakdown Statistics (For the CSS Bar Graph)
const getPurokCount = (purokName) => residentsList.filter(r => r.purok === purokName).length;
const p1Count = getPurokCount('Purok 1');
const p2Count = getPurokCount('Purok 2');
const p3Count = getPurokCount('Purok 3');
const p5Count = getPurokCount('Purok 5');
const p6Count = getPurokCount('Purok 6');
const [currentBeneficiaryId, setCurrentBeneficiaryId] = useState('');

useEffect(() => {
  if (selectedResidents && selectedResidents.length > 0) {
    // Get the first resident in the queue (Index 0)
    const activeId = selectedResidents[0];
    setCurrentBeneficiaryId(activeId);
  } else {
    setCurrentBeneficiaryId(''); // Reset when there is no queue
  }
}, [selectedResidents]);

// ── AID ENCODE CONFIGURATION STATES ──
const [currentProgramId, setCurrentProgramId] = useState('PROG-2024-004');
const [aidType, setAidType] = useState('Rice — 5kg');
const [quantity, setQuantity] = useState(1);
const [remarks, setRemarks] = useState('');
const [duplicateAlert, setDuplicateAlert] = useState('');
const [successMessage, setSuccessMessage] = useState('');


// Dynamic storage para sa distribution logs (naka-cache sa localStorage)
const [aidLogs, setAidLogs] = useState(() => {
  const savedLogs = localStorage.getItem('bustrac_aid_logs');
  return savedLogs ? JSON.parse(savedLogs) : [
    { id: 'LOG-001', residentName: 'Cruz, Ramon P.', residentId: 'RES-0005', aid: 'Rice 5kg', officer: displayName, time: '09:02', status: 'OK' },
    { id: 'LOG-002', residentName: 'Garcia, Ana L.', residentId: 'RES-0003', aid: 'Rice 5kg', officer: 'Napagal', time: '08:55', status: 'Synced' }
  ];
});

// Auto-save tracker para sa logs array
useEffect(() => {
  localStorage.setItem('bustrac_aid_logs', JSON.stringify(aidLogs));
}, [aidLogs]);

// ── AUTOMATIC DUPLICATION CHECKER LAYER ──
useEffect(() => {
  if (!currentBeneficiaryId) {
    setDuplicateAlert('');
    return;
  }
  // Titingnan kung ang napiling Resident ID ay nabigyan na ng ayuda sa program logs natin
  const alreadyReceived = aidLogs.some(log => 
    log.residentId === currentBeneficiaryId && 
    log.programId === currentProgramId &&
    log.status !== 'Duplicate');
  
  if (alreadyReceived) {
    const targetResident = residentsList.find(r => r.id === currentBeneficiaryId);
    setDuplicateAlert(`Duplicate Alert: ${targetResident ? targetResident.name : 'Resident'} has already received aid under this program. Entry blocked.`);
  } else {
    setDuplicateAlert('');
  }
}, [currentBeneficiaryId, aidLogs, residentsList, currentProgramId]);

// ── TRANSACTION SUBMIT LOGIC LAYER ──
const handleLogAidEntry = async () => {
  if (!currentBeneficiaryId) {
    alert('Mangyaring pumili muna ng residente (Beneficiary).');
    return;
  }

  if (duplicateAlert) {
    alert('Hindi maiproseso: Ang residenteng ito ay nakatanggap na ng ayuda.');
    return;
  }

  const targetResident = residentsList.find(r => r.id === currentBeneficiaryId);
  if (!targetResident) return;

  const now = new Date();
  const timeStamp = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

  // Paggawa ng bagong record schema block
  const newLogEntry = {
    id: `LOG-${Date.now()}`,
    programId: currentProgramId,
    residentName: targetResident.name,
    residentId: targetResident.id,
    aid: aidType,
    officer: displayName.split(' ')[0], // Kukunin ang first name ng admin/staff account
    time: timeStamp,
    status: 'OK'
  };

  // I-salansan sa unahan ng logs array
  setAidLogs([newLogEntry, ...aidLogs]);

  await createAuditLog({
    action: 'CREATE',
    module: 'AID_DISTRIBUTION',
    recordId: newLogEntry.id,
    details: `Distributed ${newLogEntry.aid} to ${newLogEntry.residentName} under program ${currentProgramId}`,
  });
  
  setRemarks(''); // I-clear ang text field control pagkatapos mag-save

  // ⚡ BATCH MODE QUEUE MANAGER SHIFTER
  if (selectedResidents.length > 0) {
    // Kung may natitira sa pila galing masterlist, alisin ang una para umabante ang susunod
    setSelectedResidents(prev => prev.slice(1));
    alert(`Success: Na-log na ang ayuda para kay ${targetResident.name}. Umuusad na ang Batch Mode Queue!`);
  } else {
    // Kung normal manual single encoding, i-reset ang select field indicator
    setCurrentBeneficiaryId('');
    alert(`Success: Aid has been successfully recorded for ${targetResident.name}!`);
  }
};

const handleEncodeSubmit = async (e) => {
  if (e) e.preventDefault();

  // 1. Basic Validation
  if (!selectedProgramId) {
    alert('Pumili muna ng Active Relief Program.');
    return;
  }
  if (!selectedResidentId) {
    alert('Pumili muna ng Beneficiary Resident.');
    return;
  }

  // 2. Kuhanin ang detalye ng napiling program at residente
  const targetProg = programsList.find((p) => p.id === selectedProgramId);
  const targetResident = residentsList.find((r) => r.id === selectedResidentId);
  const residentName = targetResident ? targetResident.name : 'Unknown Resident';

  // 3. Clean Duplicate Beneficiary Check (Gamit ang aidLogs lamang)
  const isDuplicate = aidLogs.some(
    (log) => log.programId === selectedProgramId && log.residentId === selectedResidentId
  );

  if (isDuplicate) {
    const errorMsg = `⚠️ Si ${residentName} ay nakatanggap na ng ayuda sa ilalim ng ${targetProg?.title || 'programang ito'}.`;
    if (typeof setDuplicateAlert === 'function') {
      setDuplicateAlert(errorMsg);
    } else {
      alert(errorMsg);
    }
    return;
  }

  // Clear duplicate alert kung pumasa sa check
  if (typeof setDuplicateAlert === 'function') setDuplicateAlert('');

  // 4. Capacity Limit Check
  if (targetProg && (targetProg.current || 0) >= (targetProg.target || 1)) {
    alert(`⚠️ Puno na ang capacity ng ${targetProg.title} (${targetProg.current}/${targetProg.target}).`);
    return;
  }

  // 5. Increment Program Counter
  const updatedPrograms = programsList.map((prog) => {
    if (prog.id === selectedProgramId) {
      return { ...prog, current: Math.min(prog.target, (prog.current || 0) + 1) };
    }
    return prog;
  });
  setProgramsList(updatedPrograms);

  // 6. Buuin ang Bagong Log Record
  const now = new Date();
  const timeStamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const newLog = {
    id: `LOG-${Date.now().toString().slice(-4)}`,
    residentId: selectedResidentId,
    residentName: residentName,
    programId: selectedProgramId,
    aid: aidType || 'Relief Goods',
    officer: typeof displayName !== 'undefined' ? displayName.split(' ')[0] : 'Mark Gian Cortero',
    time: timeStamp,
    status: 'OK',
  };

  // 7. Update Log State
  setAidLogs((prev) => [newLog, ...prev]);

  // 8. Audit Trace (PouchDB / System Log)
  if (typeof createAuditLog === 'function') {
    await createAuditLog({
      action: 'CREATE',
      module: 'AID_DISTRIBUTION',
      recordId: newLog.id,
      details: `Distributed ${newLog.aid} to ${newLog.residentName} under program ${selectedProgramId}`,
    });
  }

  // 9. Reset Inputs & Success Notification
  setSelectedProgramId('');
  setSelectedResidentId('');
  setResidentSearch('');
  setQuantity(1);
  setRemarks('');
  
  if (typeof setSuccessMessage === 'function') {
    setSuccessMessage(`Matagumpay na na-record ang ayuda para kay ${residentName}!`);
    setTimeout(() => setSuccessMessage(''), 4000);
  }
};

// ── LIVE HOUSEHOLD DETECTOR ENGINE ──

// Finds the complete details of the selected household head
const activeHousehold = householdsList.find(
  h => h.id === selectedHouseholdId
);

// Automatically filters all residents who belong to the selected household ID
const activeFamilyMembers = residentsList.filter(
  r => r.household === selectedHouseholdId
);
const [viewingHouseholdId, setViewingHouseholdId] = useState(null); 
const [viewingResidentId, setViewingResidentId] = useState(null);
const [selectedResidentId, setSelectedResidentId] = useState(null);

const [residentSearch, setResidentSearch] = useState('');

const safeResidentsList = residentsList || [];
const filteredBeneficiaries = safeResidentsList.filter((res) => {
  const query = (residentSearch || '').toLowerCase().trim();
  if (!query) return true;
  return (
    (res.name && res.name.toLowerCase().includes(query)) ||
    (res.id && res.id.toLowerCase().includes(query)) ||
    (res.purok && res.purok.toString().toLowerCase().includes(query))
  );
});
// ── STATE BUFFER PARA SA EDIT FORM ──
const [editForm, setEditForm] = useState({
  firstName: '',
  lastName: '',
  civilStatus: 'Single',
  purok: 'Purok 1',
  household: ''
});

// Awtomatikong hihilahin ang lumang data ni resident tuwing bubuksan ang Edit screen
useEffect(() => {
  if (screen === 'edit-resident' && selectedResidentId) {
    const targetRes = residentsList.find(r => r.id === selectedResidentId);
    if (targetRes) {
      // Kung hiwalay ang firstName/lastName sa schema mo, gamitin iyon. 
      // Kung buong pangalan (.name) lang ang mayroon, i-split natin pansamantala:
      const nameParts = targetRes.name ? targetRes.name.split(' ') : ['', ''];
      
      setEditForm({
        firstName: targetRes.firstName || nameParts[0] || '',
        lastName: targetRes.lastName || nameParts[nameParts.length - 1] || '',
        civilStatus: targetRes.civilStatus || 'Single',
        purok: targetRes.purok || 'Purok 1',
        household: targetRes.household || ''
      });
    }
  }
}, [screen, selectedResidentId, residentsList]);

const handleUpdateResidentChanges = (e) => {
  e.preventDefault();

  if (!selectedResidentId) return;

  // I-update ang residentsList array gamit ang map function
  setResidentsList(prevList => {
    const updatedList = prevList.map(r => {
      if (r.id === selectedResidentId) {
        // The name will be combined again for the table display registry
        const fullCombinedName = `${editForm.firstName} ${editForm.lastName}`.trim();
        
        return {
          ...r,
          name: fullCombinedName,
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          civilStatus: editForm.civilStatus,
          purok: editForm.purok,
          household: editForm.household,
          // The class for the Purok badge color will be automatically retrieved
          purokClass: editForm.purok === 'Purok 1' ? 'p' : editForm.purok === 'Purok 3' ? 'b' : editForm.purok === 'Purok 5' ? 'a' : 'g'
        };
      }
      return r;
    });

    // I-sync kaagad sa local storage para permanenteng naka-save kahit i-refresh
    localStorage.setItem('bustrac_residents', JSON.stringify(updatedList));
    return updatedList;
  });

  alert(`✓ Success: Record for ${selectedResidentId} has been updated.`);
  nav('residents'); // Bumalik sa Masterlist Table View
};

// ── 1. CORE BLOTTER LIST STATE DATABASE ──
const [blotterList, setBlotterList] = useState(() => {
  const saved = localStorage.getItem('bustrac_blotter');
  return saved ? JSON.parse(saved) : [];
});

// ── 2. MAIN CORE BLOTTER FORM OBJECT STATE ──
const [blotterForm, setBlotterForm] = useState({
  date: new Date().toISOString().split('T')[0],
  time: '',
  type: 'Noise Complaint',
  location: '',
  isComplainantNonResident: false,
  complainant: '',
  isRespondentNonResident: false,
  respondent: '',
  witnesses: '',
  priority: 'Medium',
  actionTaken: 'Summoned Parties',
  narrative: '',
  status: 'Open',
  nextHearingDate: ''
});

useEffect(() => {
    if (!db) return;

    // Mapper function para sa Blotter records
    const mapDocToBlotter = (doc) => ({
      _id: doc._id,
      _rev: doc._rev,
      id: doc.refNumber || doc.caseNo || doc.id || doc._id,
      caseNo: doc.refNumber || doc.caseNo || doc.id || 'BLTR-LOG',
      type: doc.incidentType || doc.type || 'Incident',
      complainant: doc.complainant || doc.residentName || doc.fullName || doc.sender || 'Resident',
      respondent: doc.respondent || doc.respondentName || 'Under Investigation',
      location: doc.location || doc.purok || 'Barangay Bustrac',
      date: doc.incidentDate || doc.date || doc.timestamp || 'Recently',
      status: doc.status || 'Pending',
      details: doc.details || doc.description || doc.message || '',
      rawDoc: doc,
    });

    // 1. Initial Fetch mula sa local PouchDB
    const fetchBlotters = async () => {
      try {
        const res = await db.allDocs({ include_docs: true });
        const blotterDocs = res.rows
          .map((row) => row.doc)
          .filter(
            (doc) =>
              doc &&
              (doc.type === 'blotter' ||
                doc.type === 'blotter_report' ||
                doc.type === 'blotter_record' ||
                (doc._id && String(doc._id).startsWith('blotter_')))
          )
          .map(mapDocToBlotter);
        setBlotterList(blotterDocs);
      } catch (err) {
        console.error('Error fetching blotter records from PouchDB:', err);
      }
    };

    fetchBlotters();

    // 2. Real-time changes listener
    const changes = db
      .changes({ since: 'now', live: true, include_docs: true })
      .on('change', (change) => {
        const doc = change.doc;
        if (
          doc &&
          (doc.type === 'blotter' ||
            doc.type === 'blotter_report' ||
            doc.type === 'blotter_record' ||
            (doc._id && String(doc._id).startsWith('blotter_')))
        ) {
          const mappedDoc = mapDocToBlotter(doc);
          setBlotterList((prev) => {
            const filtered = prev.filter(
              (item) => item._id !== doc._id && item.id !== mappedDoc.id
            );
            return [mappedDoc, ...filtered];
          });
        }
      })
      .on('error', (err) => console.error('PouchDB blotter change listener error:', err));

    return () => changes.cancel();
  }, [db]);

// ── 3. LOOKUP TEXT INPUT QUERIES (Eksaktong tugma sa variable ng JSX mo!) ──
const [complainantQuery, setComplainantQuery] = useState('');
const [respondentQuery, setRespondentQuery] = useState('');

// ── 4. DROPDOWN BOOLED CONTROLS (Eksaktong tugma sa variable ng JSX mo!) ──
const [showComplainantDropdown, setShowComplainantDropdown] = useState(false);
const [showRespondentDropdown, setShowRespondentDropdown] = useState(false);

// ── 5. SUCCESS DIALOG ROUTINE INTERFACES (Eksaktong tugma sa variable ng JSX mo!) ──
const [showSuccessModal, setShowSuccessModal] = useState(false);
const [recentlyFiledId, setRecentlyFiledId] = useState('');

// ── 6. RESIDENT REGISTRY DATA DATA SOURCE (Eksaktong tugma sa registry filter ng JSX mo!) ──
// Tiyakin na mayroong ganitong array list variable para may masuri ang .filter() function mo
const [residentsRegistry, setResidentsRegistry] = useState([
  { id: 'RES-2026-001', name: 'Juan Dela Cruz', purok: 'Purok 1' },
  { id: 'RES-2026-002', name: 'Maria Santos', purok: 'Purok 3' },
  { id: 'RES-2026-003', name: 'Pedro Penduko', purok: 'Purok 5' },
  { id: 'RES-2026-004', name: 'Mark Gian Cortero', purok: 'Purok 2' },
  { id: 'RES-2026-005', name: 'Juhairo Macabangon', purok: 'Purok 4' }
]);


// ── UPGRADED SUBMIT METRICS SYSTEM HANDLER ──
const handleCreateBlotterEntry = async (e) => {
  e.preventDefault();

  // Paglikha ng Auto-Incremental ID Tracker Block
  const generatedId = `BLT-2026-${String(blotterList.length + 125).padStart(5, '0')}`;
  
  const finalCaseData = {
    id: generatedId,
    ...blotterForm,
    handlerOfficer: "Juhairo Macabangon",
    dateRecorded: "July 29, 2026",
    filedAt: new Date().toLocaleString()
  };

  const updatedBlotters = [...blotterList, finalCaseData];
  setBlotterList(updatedBlotters);
  localStorage.setItem('bustrac_blotter', JSON.stringify(updatedBlotters));
  
  await createAuditLog({
    action: 'CREATE',
    module: 'BLOTTER',
    recordId: generatedId,
    details: `Filed new blotter case: ${blotterForm.type} at ${blotterForm.location}`,
  });
  // Triggering the success interface metrics modal window
  setRecentlyFiledId(generatedId);
  setShowSuccessModal(true);
};

// 3. Submit handler function para ipasok ang bagong kaso
const handleClearBlotterForm = () => {
  setBlotterForm({
    date: new Date().toISOString().split('T')[0],
    time: '',
    type: 'Noise Complaint',
    location: '',
    isComplainantNonResident: false,
    complainant: '',
    isRespondentNonResident: false,
    respondent: '',
    witnesses: '',
    priority: 'Medium',
    actionTaken: 'Summoned Parties',
    narrative: '',
    status: 'Open',
    nextHearingDate: ''
  });
  
  // Linisin ang search parameters para sa susunod na entry loop
  setComplainantQuery('');
  setRespondentQuery('');
  setShowComplainantDropdown(false);
  setShowRespondentDropdown(false);
};

// ── BROWSER BACK/FORWARD BUTTON LISTENER ──
useEffect(() => {
  // 1. I-setup ang panimulang history frame para sa default loading screen (dashboard)
  if (!window.history.state) {
    window.history.replaceState({ internalScreen: 'dashboard' }, '', '');
  }

  // 2. Taga-kinig kapag pinindot ang kaliwa o kanang arrow ng web browser
  const handleBrowserNavigation = (event) => {
    if (event.state && event.state.internalScreen) {
      // Kung may valid sub-screen state sa history track, i-load iyon nang tahimik
      setScreen(event.state.internalScreen);
    } else {
      // Fallback transition sa default control hub kapag naubos ang stack memory
      setScreen('dashboard');
    }
  };

  window.addEventListener('popstate', handleBrowserNavigation);
  
  // Cleanup hook kapag nag-unmount ang main component element bundle
  return () => window.removeEventListener('popstate', handleBrowserNavigation);
}, []);

// ── BLOTTER FILTER & SEARCH STATES ──
const [blotterSearch, setBlotterSearch] = useState('');
const [filterType, setFilterType] = useState('All Types');
const [filterStatus, setFilterStatus] = useState('All Status');
const [selectedBlotterId, setSelectedBlotterId] = useState(null);

useEffect(() => {
  const params = new URLSearchParams(location.search);
  const pageFromUrl = params.get('page');
  
  if (pageFromUrl) {
    setScreen(pageFromUrl); // Navigate to the screen specified by the ?page= URL parameter.
  } else {
    setScreen('dashboard'); 
  }
}, [location]);

// Use a fallback array in case blotterList is empty or undefined.
const currentBlotterRoster = typeof blotterList !== 'undefined' ? blotterList : [
  { id: 'BLT-2024-041', type: 'Noise Complaint', complainant: 'Reyes, Carmen', respondent: 'Torres, Mark', location: 'Purok 5', date: '2024-04-07', time: '08:30', status: 'Open', narrative: 'Laging malakas ang karaoke tuwing hatinggabi.', actionTaken: 'Summoned parties' },
  { id: 'BLT-2024-040', type: 'Property Dispute', complainant: 'Santos, Jose', respondent: 'Cruz, Ana', location: 'Purok 2', date: '2024-04-05', time: '10:15', status: 'Under Mediation', narrative: 'Kinasuhan dahil sa bakod na lumampas.', actionTaken: 'Pending hearing' }
];

const filteredBlotters = currentBlotterRoster.filter(b => {
  const matchesSearch = b.id.toLowerCase().includes(blotterSearch.toLowerCase()) ||
                        b.complainant.toLowerCase().includes(blotterSearch.toLowerCase()) ||
                        b.respondent.toLowerCase().includes(blotterSearch.toLowerCase());
  
  const matchesType = filterType === 'All Types' || b.type === filterType;
  
  // Hahawakan natin ang status text compatibility (e.g. Mediation vs Under Mediation)
  const matchesStatus = filterStatus === 'All Status' || 
                        b.status === filterStatus || 
                        (filterStatus === 'Under Mediation' && b.status === 'Mediation');

  return matchesSearch && matchesType && matchesStatus;
});
// Dropdown control para sa Residents Submenu
const [isResidentsOpen, setIsResidentsOpen] = useState(false);
// CERTIFICATE PIPELINE BRIDGE LAYER 
// This handler will take the new request from the Lifecycle component 
// and safely plug it into the state table of Issuance & Print
const handleNewCertificateRequest = async (newRequestData) => {
  if (!newRequestData) return;

  const formattedPayload = {
  _id: newRequestData._id ?? `certificate_request_${Date.now()}`,
  firstName: newRequestData.firstName || 'Resident',
  lastName: newRequestData.lastName || 'Name',
  certificateType: newRequestData.certificateType || 'Barangay Clearance',
  purpose: newRequestData.purpose || 'Any legal intent',
  status: 'Under Review',   
  purok: newRequestData.purok || 'Purok 1',
  createdAt: newRequestData.createdAt || new Date().toISOString().split('T')[0],
  type: 'certificate_request',
  step: 1
};

  try {
    await db.put(formattedPayload);
  } catch (err) {
    console.error('Failed to save certificate request to PouchDB:', err);
  }

  if (typeof nav === 'function') {
    nav('cert-print');
  }
};
const approvedCertificates = issuedCertificates.filter(cert => cert.step === 4 || cert.status === 'Approved');
const strictlyIssuedCertificates = issuedCertificates.filter(cert => cert.step === 5 || cert.status === 'Issued');

const handleApproveCertificate = async (currentRequest) => {
  if (!currentRequest) return;

  try{
    const latestDoc = await db.get(currentRequest._id);
    
    const formattedPayload = {
      ...latestDoc,                    // Gamitin ang latest doc structures
      status: 'Approved',              // 🏛️ Papasok sa approvedCertificates filter
      step: 3,                         // 📑 Step 3: Handa na para sa Printing Queue
      updatedAt: new Date().toISOString().split('T')[0]
    };

    // I-save ang pinakabagong state transition
    await db.put(formattedPayload);
    
    await createAuditLog({
    action: 'APPROVE',
    module: 'CERTIFICATES',
    recordId: currentRequest._id,
    details: `Approved certificate request for ${currentRequest.firstName || ''} ${currentRequest.lastName || ''}`,
    });

    // Lipat sa screen kung saan nandoon ang print features
    if (typeof nav === 'function') {
      nav('cert-print'); 
    }
  } catch (err) {
    console.error('Failed to update certificate status to Approved:', err);
  }
};
const [logSearchQuery, setLogSearchQuery] = useState('');
const [programFilter, setProgramFilter] = useState('All');
const [statusFilter, setStatusFilter] = useState('All');
const filteredLogs = aidLogs.filter(log => {
  // 1. Filter gamit ang Search Bar (Tugma sa Resident Name o Log ID)
  const matchesSearch = 
    log.residentName?.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
    log.id?.toLowerCase().includes(logSearchQuery.toLowerCase());

  // 2. Filter gamit ang Program Dropdown
  const matchesProgram = 
    programFilter === 'All' || 
    log.programId === programFilter || 
    log.programName === programFilter; // Depende kung anong gamit mong tag sa save schema

  // 3. Filter gamit ang Status Dropdown
  const matchesStatus = 
    statusFilter === 'All' || 
    log.status === statusFilter;

  return matchesSearch && matchesProgram && matchesStatus;
});
const processedPrograms = programsList
  .filter((prog) => {
    // 1. Search Logic (Tugma sa Title, ID, o Aid Type)
    const matchesSearch = 
      prog.title?.toLowerCase().includes(programSearchQuery.toLowerCase()) ||
      prog.id?.toLowerCase().includes(programSearchQuery.toLowerCase()) ||
      prog.aidType?.toLowerCase().includes(programSearchQuery.toLowerCase());

    // 2. Status & Archive Filter Logic
    if (programStatusFilter === 'All') {
      return matchesSearch && prog.status !== 'Archived'; // Itago ang archived sa pangkalahatang view
    }
    return matchesSearch && prog.status === programStatusFilter;
  })
  .sort((a, b) => {
    // 3. Sorting Logic Layer
    if (programSortOption === 'Newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (programSortOption === 'Oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (programSortOption === 'Alphabetical') return a.title.localeCompare(b.title);
    if (programSortOption === 'MostBeneficiaries') return b.target - a.target;
    return 0;
  });
  // ── UPGRADED BLOTTER CONFIGURATION STATES ──
const [showBlotterSuccess, setShowBlotterSuccess] = useState(false);
const [lastGeneratedBlotterId, setLastGeneratedBlotterId] = useState('BLT-2026-00125');

// Mock Resident Registry para sa instant lookup preview (Palitan ng PouchDB/Live state niyo pagkatapos)
const [residentRegistry] = useState([
  { id: 'RES-001', name: 'Juan Dela Cruz', purok: 'Purok 1' },
  { id: 'RES-002', name: 'Maria Santos', purok: 'Purok 3' },
  { id: 'RES-003', name: 'Pedro Penduko', purok: 'Purok 5' },
  { id: 'RES-004', name: 'Gian Cortero', purok: 'Purok 2' },
]);
const [compSearchQuery, setCompSearchQuery] = useState('');
const [respSearchQuery, setRespSearchQuery] = useState('');

// ── ANNOUNCEMENTS DATABASE STATE ──
const [announcementsList, setAnnouncementsList] = useState([
  { id: 1, title: 'Free Medical Mission — Apr 15', category: 'Health', content: 'Free consultation, blood pressure check, medicine dispensing. All residents welcome. Bring valid ID.', pinned: true, author: 'Cortero', date: 'Apr 5', status: 'Published' },
  { id: 2, title: 'Barangay Assembly — Apr 20', category: 'Governance', content: 'Quarterly assembly at 8:00 AM, covered court. All residents are encouraged to attend.', pinned: false, author: 'Napagal', date: 'Apr 4', status: 'Published' }
]);

// ── SCREEN ROUTING SUB-STATE ──
// Pwede itong: 'list' (Main Board), 'new' (Creation Box), o 'edit' (Modification Box)
const [announcementSubScreen, setAnnouncementSubScreen] = useState('list');

// ── CENTRALIZED FORM OBJECT STATE ──
const [announcementForm, setAnnouncementForm] = useState({
  title: '', category: 'General', content: '', pinned: false, status: 'Published'
});

// ── STATE IDENTIFIERS FOR ENGINE MANAGEMENT ──
const [editingAnnId, setEditingAnnId] = useState(null);
const [searchAnnQuery, setSearchAnnQuery] = useState('');
const [filterAnnCategory, setFilterAnnCategory] = useState('All');
const [filterAnnStatus, setFilterAnnStatus] = useState('All');

// ── DELETE CONFIRMATION INTERFACE OVERLAYS ──
const [showAnnDeleteModal, setShowAnnDeleteModal] = useState(false);
const [annIdToDelete, setAnnIdToDelete] = useState(null);

// Function for saving (Combined Create and Edit logic)
const handleSaveAnnouncement = async (e, targetStatus) => {
  e.preventDefault();
  
  if (announcementSubScreen === 'new') {
    const newEntry = {
      id: Date.now(), // Unique runtime tracker stamp
      title: announcementForm.title,
      category: announcementForm.category,
      content: announcementForm.content,
      pinned: announcementForm.pinned,
      status: targetStatus, // Can be 'Published' or 'Draft'
      author: 'Cortero', // Default dynamic user profile identifier
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
    setAnnouncementsList([newEntry, ...announcementsList]);
    await createAuditLog({
      action: 'CREATE',
      module: 'ANNOUNCEMENTS',
      recordId: String(newEntry.id),
      details: `Published new announcement: ${newEntry.title}`,
    });

  } else if (announcementSubScreen === 'edit') {
    setAnnouncementsList(announcementsList.map(ann => 
      ann.id === editingAnnId 
        ? { ...ann, ...announcementForm, status: targetStatus }
        : ann
    ));
    await createAuditLog({
      action: 'UPDATE',
      module: 'ANNOUNCEMENTS',
      recordId: String(editingAnnId),
      details: `Updated announcement: ${announcementForm.title}`,
    });
  }
  
  // Reset workflow and return to board registry view
  setAnnouncementSubScreen('list');
  setAnnouncementForm({ title: '', category: 'General', content: '', pinned: false, status: 'Published' });
  setEditingAnnId(null);
};

// Trigger loading layout when editing
const handleOpenEditAnnouncement = (ann) => {
  setEditingAnnId(ann.id);
  setAnnouncementForm({
    title: ann.title,
    category: ann.category,
    content: ann.content,
    pinned: ann.pinned,
    status: ann.status
  });
  setAnnouncementSubScreen('edit');
};

// Quick structural handler for active pinning feature
const handleTogglePinAnnouncement = (id) => {
  setAnnouncementsList(announcementsList.map(ann => 
    ann.id === id ? { ...ann, pinned: !ann.pinned } : ann
  ));
};

// Trigger delete verification state tracker
const handleTriggerDeleteAnnouncement = (id) => {
  setAnnIdToDelete(id);
  setShowAnnDeleteModal(true);
};

const handleConfirmDeleteAnnouncement = () => {
  setAnnouncementsList(announcementsList.filter(ann => ann.id !== annIdToDelete));
  setShowAnnDeleteModal(false);
  setAnnIdToDelete(null);
};
// ── EXTENDED DATA REGISTRY WITH WORKFLOW METADATA ──
const [feedbackList, setFeedbackList] = useState([
  { 
    id: 'FB-041', 
    sender: 'Santos, Maria', 
    type: 'Complaint', 
    priority: 'High', 
    subject: 'Garbage not collected in Purok 3', 
    message: 'The garbage truck has not visited our area for two weeks, causing bad odor and attracting pests near the community chapel.', 
    date: 'Apr 7, 2026, 9:15 AM', 
    status: 'Pending', 
    assignedTo: 'Unassigned', 
    attachment: 'garbage_pile.jpg',
    response: '',
    handledBy: '',
    dateResolved: ''
  },
  { 
    id: 'FB-040', 
    sender: 'Reyes, Juan', 
    type: 'Suggestion', 
    priority: 'Medium', 
    subject: 'Additional streetlights in Purok 1', 
    message: 'Requesting additional solar streetlights along the dark curves of Purok 1 for citizen safety at night.', 
    date: 'Apr 6, 2026, 2:30 PM', 
    status: 'Under Review', 
    assignedTo: 'Mark Gian Cortero', //
    attachment: null,
    response: '',
    handledBy: '',
    dateResolved: ''
  },
  { 
    id: 'FB-039', 
    sender: 'Garcia, Ana', 
    type: 'Inquiry', 
    priority: 'Low', 
    subject: 'How to apply for clearance online?', 
    message: 'Hello, ask ko lang po kung anong requirements para sa online barangay clearance retrieval window kung taga ibang purok?', 
    date: 'Apr 5, 2026, 10:05 AM', 
    status: 'Resolved', 
    assignedTo: 'Juhairo Macabangon', //
    attachment: null,
    response: 'Good day! You can upload 1 valid government ID in the Document Request screen panel. Processing takes 1-2 business days.',
    handledBy: 'Juhairo Macabangon', //
    dateResolved: 'Apr 5, 2026, 4:12 PM'
  }
]);

// ── ADVANCED REGISTRY SEARCH & FILTER FIELDS ──
const [searchFbQuery, setSearchFbQuery] = useState('');
const [filterFbType, setFilterFbType] = useState('All Types');
const [filterFbStatus, setFilterFbStatus] = useState('All Status');
const [filterFbPriority, setFilterFbPriority] = useState('All Priorities');
const [sortFbBy, setSortFbBy] = useState('Newest');

// ── WORKFLOW INTERACTIVE STATE MANAGEMENT OVERLAYS ──
const [selectedFeedback, setSelectedFeedback] = useState(null); // String object placeholder para sa modal frame view
const [fbResponseText, setFbResponseText] = useState('');
const [fbStatusUpdate, setFbStatusUpdate] = useState('Pending');
const [fbStaffAssignment, setFbStaffAssignment] = useState('Unassigned');

// ── GLOBAL NOTIFICATION DURATION CONTROL ──
const [showFbSuccessToast, setShowFbSuccessToast] = useState(false);
const [fbToastMessage, setFbToastMessage] = useState('');
// Triggering mechanism para sa full diagnostic interactive panel view
const handleOpenFeedbackDetails = (fb) => {
  setSelectedFeedback(fb);
  setFbResponseText(fb.response || '');
  setFbStatusUpdate(fb.status);
  setFbStaffAssignment(fb.assignedTo);
};
  
useEffect(() => {
    if (!db) return;

    const loadIssuedCertificates = async () => {
      try {
        const result = await db.allDocs({ include_docs: true });
        const docs = result.rows
          .map((row) => row.doc)
          .filter(
            (doc) => doc.type === 'certificate_request' && (Number(doc.step) === 3 || Number(doc.step) === 4)
          );
        setIssuedCertificates(docs);
      } catch (err) {
        console.error('Failed to load issued certificates:', err);
      }
    };

    loadIssuedCertificates();

    const changes = db
      .changes({ since: 'now', live: true, include_docs: true })
      .on('change', (change) => {
        if (
          change.doc &&
          change.doc.type === 'certificate_request' &&
          (Number(change.doc.step) === 3 || Number(change.doc.step) === 4)
        ) {
          setIssuedCertificates((prev) => {
            const filtered = prev.filter((cert) => cert._id !== change.doc._id);
            return [change.doc, ...filtered];
          });
        }
      });

    return () => changes.cancel();
  }, [db]);
// ════════════════════════════════════════════════════════════════
  // 4. EFFECT #2: FEEDBACK & COMPLAINTS POUCHDB LISTENER
  // ════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!db) return;

    // Initial Load mula sa PouchDB
    const fetchFeedbacks = async () => {
      try {
        const res = await db.allDocs({ include_docs: true });
        const dbFeedbacks = res.rows
          .map((row) => row.doc)
          .filter(
            (doc) => doc && (doc.type === 'feedback' || doc.type === 'feedback_report')
          )
          .map(mapDocToFeedback);

        setFeedbackList((prev) => {
          const existingDbIds = new Set(dbFeedbacks.map((f) => f._id));
          const filteredMock = prev.filter(
            (item) => !item._id && !existingDbIds.has(item.id)
          );
          return [...dbFeedbacks, ...filteredMock];
        });
      } catch (err) {
        console.error('Error fetching feedbacks from PouchDB:', err);
      }
    };

    fetchFeedbacks();

    // Real-time Live Changes Listener
    const changes = db
      .changes({ since: 'now', live: true, include_docs: true })
      .on('change', (change) => {
        if (
          change.doc &&
          (change.doc.type === 'feedback' || change.doc.type === 'feedback_report')
        ) {
          const updatedItem = mapDocToFeedback(change.doc);
          setFeedbackList((prev) => {
            const filtered = prev.filter(
              (f) => f._id !== change.doc._id && f.id !== change.doc.refNumber
            );
            return [updatedItem, ...filtered];
          });
        }
      })
      .on('error', (err) => {
        console.error('Feedback PouchDB change listener error:', err);
      });

    return () => changes.cancel();
  }, [db]);

const handleSubmitFeedbackAction = async (e) => {
  e.preventDefault();
  if (!selectedFeedback) return;

  const isNowResolved = fbStatusUpdate === 'Resolved';
  const resolvedTimestamp = isNowResolved
    ? new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : selectedFeedback.dateResolved;

  const handlerName =
    fbStaffAssignment !== 'Unassigned' ? fbStaffAssignment : 'Mark Gian Cortero';

  // 1. Kung galing sa PouchDB ang document, i-update ito sa database
  const targetId = selectedFeedback._id || (selectedFeedback.rawDoc && selectedFeedback.rawDoc._id);

  if (targetId && db) {
    try {
      // Kunin ang latest revision (_rev) para maiwasan ang PouchDB update conflict
      const latestDoc = await db.get(targetId);

      const updatedDoc = {
        ...latestDoc,
        status: fbStatusUpdate,
        assignedTo: fbStaffAssignment,
        response: fbResponseText,
        handledBy: handlerName,
        dateResolved: resolvedTimestamp,
        updatedAt: new Date().toISOString(),
      };

      await db.put(updatedDoc);
      // HINDI NA kailangan mag-setFeedbackList dito manual dahil aabutan na ito ng live PouchDB listener mo!
    } catch (err) {
      console.error('Failed to update feedback in PouchDB:', err);
      alert('Unable to save feedback update to offline database.');
      return;
    }
  } else {
    // 2. Fallback para sa mga static mock items (kung may natitira pa sa initial state)
    setFeedbackList((prev) =>
      prev.map((item) => {
        if (item.id === selectedFeedback.id) {
          return {
            ...item,
            status: fbStatusUpdate,
            assignedTo: fbStaffAssignment,
            response: fbResponseText,
            handledBy: handlerName,
            dateResolved: resolvedTimestamp,
          };
        }
        return item;
      })
    );
  }

  // Success UI Feedback & Modal Cleanup
  setFbToastMessage(`✓ Action metrics saved for ${selectedFeedback.id}. Resident framework notified.`);
  setShowFbSuccessToast(true);
  setSelectedFeedback(null);

  setTimeout(() => setShowFbSuccessToast(false), 4000);
};

// ── AUDIT LOGS STATE ──
const [auditLogs, setAuditLogs] = useState([]);

// ── AUDIT FILTER STATES ──
const [auditSearch, setAuditSearch] = useState('');
const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');
const [auditActionFilter, setAuditActionFilter] = useState('ALL');

// ── AUDIT LOGS LOADER ──
useEffect(() => {
  if (role === 'admin') {
    loadAuditLogs();
  }
}, [role]);

async function loadAuditLogs() {
  try {
    const logs = await getAuditLogs();
    // Newest first
    const sorted = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    setAuditLogs(sorted);
  } catch (err) {
    console.error('Failed to load audit logs:', err);
  }
}
const filteredAuditLogs = auditLogs.filter((log) => {
    const search = auditSearch.toLowerCase();

    const matchesSearch =
        !search ||
        log.actor?.username?.toLowerCase().includes(search) ||
        log.action?.toLowerCase().includes(search) ||
        log.module?.toLowerCase().includes(search) ||
        String(log.recordId || '').toLowerCase().includes(search) ||
        log.details?.toLowerCase().includes(search);

    const matchesModule =
        auditModuleFilter === 'ALL' ||
        log.module === auditModuleFilter;

    const matchesAction =
        auditActionFilter === 'ALL' ||
        log.action === auditActionFilter;

    return matchesSearch && matchesModule && matchesAction;
});
const [isAidOpen, setIsAidOpen] = useState(true);
// ════════════════════════════════════════════════════════════════
// HELPER FUNCTION (Ilagay sa itaas bago ang return statement)
// ════════════════════════════════════════════════════════════════
const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'Active':
      return 'badge-success'; // Emerald Green
    case 'Upcoming':
      return 'badge-warning'; // Amber / Yellow
    case 'Completed':
      return 'badge-secondary'; // Cool Gray / Slate
    case 'Archived':
      return 'badge-danger'; // Muted Red
    default:
      return 'badge-info';
  }
};
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
            <div className="sb-sub">{role === 'admin' ? 'Administrator Portal' : 'Staff Portal'}</div>
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
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h8v8H3z" />
                <path d="M3 13h6v8H3z" />
                <path d="M13 3h8v6h-8z" />
                <path d="M13 13h8v8h-8z" />
              </svg>
            </span>
            Dashboard
          </button>

          {/* RESIDENTS */}
          <div className="sb-sec">Residents Management</div>
          <button
            type="button"
            className={`nav-btn toggle-parent ${['residents', 'households', 'add-resident'].includes(screen) ? 'active-parent' : ''}`}
            onClick={() => setIsResidentsOpen(!isResidentsOpen)}
            aria-expanded={isResidentsOpen}
          >
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span style={{ flex: 1 }}>Residents Profile</span>
            <span className="submenu-arrow">▶</span>
          </button>
          {isResidentsOpen && (
            <div className="sb-submenu-zone">
              <button
                className={`nav-btn sub-btn${screen === 'residents' ? ' active' : ''}`}
                onClick={() => nav('residents')}
              >
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M12 18v-6" />
                    <path d="M9 15h6" />
                  </svg>
                </span>
                Manage Ledger
              </button>
              <button
                className={`nav-btn sub-btn${screen === 'households' ? ' active' : ''}`}
                onClick={() => nav('households')}
              >
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <path d="M9 22V12h6v10" />
                  </svg>
                </span>
                Manage Households
              </button>
              <button
                className={`nav-btn sub-btn${screen === 'add-resident' ? ' active' : ''}`}
                onClick={() => nav('add-resident')}
              >
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                Add Resident
              </button>
            </div>
          )}

          {/* CERTIFICATES */}
          <div className="sb-sec">Certificates</div>
          <button
            className={`nav-btn${screen === 'cert-req' ? ' active' : ''}`}
            onClick={() => nav('cert-req')}
          >
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M12 18v-6" />
                <path d="M9 15h6" />
              </svg>
            </span>
            Request & Approval
            <span className="nb nb-amber">3</span>
          </button>
          <button
            className={`nav-btn${screen === 'cert-print' ? ' active' : ''}`}
            onClick={() => nav('cert-print')}
          >
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
                <path d="M7 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H7" />
                <path d="M12 7V5" />
                <path d="M10 19h4" />
                <path d="M7 9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
              </svg>
            </span>
            Issuance & Print
          </button>

          {/* AID DISTRIBUTION */}
          <div className="sb-sec">Aid Distribution</div>
          <button
            type="button"
            className={`nav-btn toggle-parent ${['programs', 'aid-encode', 'aid-logs', 'add-beneficiary'].includes(screen) ? 'active-parent' : ''}`}
            onClick={() => setIsAidOpen(!isAidOpen)}
            aria-expanded={isAidOpen}
          >
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                <path d="M12 22.08V12" />
              </svg>
            </span>
            <span style={{ flex: 1 }}>Aid Distribution</span>
            <span className="submenu-arrow">▶</span>
          </button>
          {isAidOpen && (
            <div className="sb-submenu-zone">
              <button
                className={`nav-btn sub-btn${screen === 'programs' ? ' active' : ''}`}
                onClick={() => nav('programs')}
              >
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                </span>
                Programs
              </button>
              <button
                className={`nav-btn sub-btn${screen === 'aid-encode' ? ' active' : ''}`}
                onClick={() => nav('aid-encode')}
              >
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                Encode Distribution
              </button>
              <button
                className={`nav-btn sub-btn${screen === 'aid-logs' ? ' active' : ''}`}
                onClick={() => nav('aid-logs')}
              >
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M12 18v-6" />
                    <path d="M9 15h6" />
                  </svg>
                </span>
                Distribution Logs
              </button>
              {role === 'admin' && (
                <button
                  className={`nav-btn sub-btn${screen === 'add-beneficiary' ? ' active' : ''}`}
                  onClick={() => nav('add-beneficiary')}
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  Add Beneficiary
                </button>
              )}
            </div>
          )}

          {/* BLOTTER */}
          <div className="sb-sec">Blotter</div>
          <button
            className={`nav-btn${screen === 'blotter-new' ? ' active' : ''}`}
            onClick={() => nav('blotter-new')}
          >
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </span>
            File Blotter Entry
          </button>
          <button
            className={`nav-btn${screen === 'blotter-manage' ? ' active' : ''}`}
            onClick={() => nav('blotter-manage')}
          >
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M12 18v-6" />
                <path d="M9 15h6" />
              </svg>
            </span>
            Manage Blotter
            <span className="nb nb-red">2</span>
          </button>
          {role === 'staff' && (
            <button
              className={`nav-btn${screen === 'blotter-detail' ? ' active' : ''}`}
              onClick={() => nav('blotter-detail')}
            >
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              Blotter Summon
            </button>
          )}

          {/* COMMUNITY */}
          <div className="sb-sec">Community</div>
          <button
            className={`nav-btn${screen === 'announcements' ? ' active' : ''}`}
            onClick={() => nav('announcements')}
          >
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
            Announcements
          </button>
          <button
            className={`nav-btn${screen === 'feedback' ? ' active' : ''}`}
            onClick={() => nav('feedback')}
          >
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            Feedback
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
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                </span>
                Conflict Resolution
                <span className="nb nb-red">2</span>
              </button>
              <button
                className={`nav-btn${screen === 'audit' ? ' active' : ''}`}
                onClick={() => nav('audit')}
              >
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
                  </svg>
                </span>
                Audit Log
              </button>
              <button
                className={`nav-btn${screen === 'users' ? ' active' : ''}`}
                onClick={() => nav('users')}
              >
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                Manage Users
              </button>
            </>
          )}

          {/* REPORTS */}
          <div className="sb-sec">Reports</div>
          <button
            className={`nav-btn${screen === 'reports' ? ' active' : ''}`}
            onClick={() => nav('reports')}
          >
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h18v18H3z" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </span>
            Generate Reports
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="sb-foot">
          <div className="sb-ava">{initials}</div>
          <div>
            <div className="sb-uname">{displayName}</div>
            <div className="sb-urole">{role === 'admin' ? 'Administrator' : 'Staff'}</div>
          </div>
          <div
            className="online-dot"
            title={
              syncState === 'offline'
                ? 'Offline — changes saved locally'
                : syncState === 'syncing'
                ? 'Connecting and syncing'
                : 'Online — changes synced'
            }
            style={{
              background: syncState === 'offline'
                ? 'var(--red)'
                : syncState === 'syncing'
                ? 'var(--amber)'
                : 'var(--green)',
              boxShadow: syncState === 'offline'
                ? '0 0 0 2px var(--red-bg)'
                : syncState === 'syncing'
                ? '0 0 0 2px var(--amber-bg)'
                : '0 0 0 2px var(--green-bg)',
            }}
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
            {role === 'admin' && (
              <div className="role-admin">🔑 Admin</div>
            )}
            
            {/* ════════════════════════════════════════════════════════════════
                DYNAMIC SYNC STATUS INDICATOR (GOOGLE DOCS BEHAVIOR COMPLIANT)
                ════════════════════════════════════════════════════════════════ */}
            <div className="sync-status-container" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: syncState === 'offline' ? 'rgba(239, 68, 68, 0.15)' : 
                          syncState === 'syncing' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${
                syncState === 'offline' ? '#ef4444' : 
                syncState === 'syncing' ? '#f59e0b' : '#10b981'
              }`,
              transition: 'all 0.3s ease'
            }}>
              {/* The Pulsing Status Dot Indicator */}
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: syncState === 'offline' ? '#ef4444' : 
                            syncState === 'syncing' ? '#f59e0b' : '#10b981',
                display: 'inline-block',
                animation: syncState === 'syncing' ? 'dp-sync-pulse 1s infinite alternate' : 'none'
              }} />
              
              {/* The Dynamic Contextual Messages */}
              <span style={{ 
                fontSize: '12px', 
                fontWeight: '600',
                color: syncState === 'offline' ? '#f87171' : 
                      syncState === 'syncing' ? '#fbbf24' : '#34d399'
              }}>
                {syncState === 'offline' && "☁️ Working Offline (Saved to Local Device)"}
                {syncState === 'syncing' && "🔄 Connecting & Syncing changes to Central Cloud..."}
                {syncState === 'synced' && "🗲 All changes synced to Cloud"}
              </span>
            </div>
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
                {/* ── HEADER PANEL ── */}
                <div className="ph">
                  <div>
                    <div className="pt">Barangay Bustrac Hub Dashboard</div>
                    <div className="ps">Real-time community metrics overview and systems operation engine</div>
                  </div>
                </div>

                {/* =============================================
                    📈 1. DYNAMIC METRICS CARDS GRID (SVG Icons)
                  ============================================= */}
                <div className="sg">
                  {/* TOTAL RESIDENTS */}
                  <div className="sc residents">
                    <div className="si">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
                        <path d="M12 12c-2.21 0-4 1.79-4 4v2h8v-2c0-2.21-1.79-4-4-4z" />
                        <path d="M12 6V4" />
                        <path d="M8 10l2 2 4-4" />
                      </svg>
                    </div>
                    <div className="sl">Total Residents</div>
                    <div className="sv">{totalResidents}</div>
                  </div>

                  {/* TOTAL HOUSEHOLDS */}
                  <div className="sc households">
                    <div className="si">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="M9 22V12h6v10" />
                      </svg>
                    </div>
                    <div className="sl">Households</div>
                    <div className="sv" style={{ color: 'var(--green)' }}>{totalHouseholds}</div>
                  </div>

                  {/* REGISTERED VOTERS */}
                  <div className="sc voters">
                    <div className="si">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 12l2 2 4-4" />
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <div className="sl">Reg. Voters</div>
                    <div className="sv" style={{ color: 'var(--amber)' }}>
                      {totalVoters}
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        ({totalResidents > 0 ? (totalVoters / totalResidents * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                  </div>

                  {/* PENDING CERTIFICATES */}
                  <div className="sc certs">
                    <div className="si">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                    </div>
                    <div className="sl">Pending Certs</div>
                    <div className="sv" style={{ color: 'var(--purple)' }}>8</div>
                  </div>

                  {/* OPEN BLOTTER CASES */}
                  <div className="sc blotter">
                    <div className="si">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                      </svg>
                    </div>
                    <div className="sl">Open Blotter</div>
                    <div className="sv" style={{ color: 'var(--red)' }}>
                      {typeof blotterList !== 'undefined' ? blotterList.filter(b => b.status === 'Open' || b.status === 'Under Mediation').length : 4}
                    </div>
                  </div>

                  {/* SYSTEM CONFLICTS (ADMIN ONLY) */}
                  {role === 'admin' && (
                    <div className="sc conflicts">
                      <div className="si">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                      </div>
                      <div className="sl">Sync Conflicts</div>
                      <div className="sv" style={{ color: 'var(--orange)' }}>{totalConflicts}</div>
                    </div>
                  )}

                  {/* RESIDENT FEEDBACK */}
                  <div className="sc feedback">
                    <div className="si">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div className="sl">{role === 'admin' ? 'Feedback' : 'Unread Feedback'}</div>
                    <div className="sv" style={{ color: 'var(--teal)' }}>5</div>
                  </div>
                </div>

                {/* =============================================
                    📋 2. MIDDLE ROW: OPERATIONS & AUDIT TRAIL (2-COLUMN)
                  ============================================= */}
                <div className="tc" style={{ marginBottom: '24px' }}>
                  {/* LEFT COLUMN: PENDING ACTIONS */}
                  <div>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--muted)',
                      marginBottom: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      {role === 'admin' ? 'Pending Admin Actions' : 'Pending Actions'}
                    </div>

                    {/* SYNC CONFLICTS (Admin Only) */}
                    {role === 'admin' && totalConflicts > 0 && (
                      <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div className="ct">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <path d="M12 9v4" />
                                <path d="M12 17h.01" />
                              </svg>
                              Sync Conflicts ({totalConflicts})
                            </div>
                            <div className="cm">CouchDB revision conflicts need resolution</div>
                          </div>
                          <button className="btn btn-d btn-sm" onClick={() => nav('conflicts')}>Resolve Now</button>
                        </div>
                      </div>
                    )}

                    {/* CERTIFICATE REQUESTS */}
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ct">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                              <path d="M12 18v-6" />
                              <path d="M9 15h6" />
                            </svg>
                            Certificate Requests {role === 'admin' ? '(3)' : ''}
                          </div>
                          <div className="cm">
                            {role === 'admin' ? 'Pending approval by authorized officer' : '3 pending approval'}
                          </div>
                        </div>
                        <button className="btn btn-p btn-sm" onClick={() => nav('cert-approve')}>Review</button>
                      </div>
                    </div>

                    {/* FEEDBACK */}
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ct">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            {role === 'admin' ? 'Unread Feedback (5)' : 'Resident Feedback'}
                          </div>
                          <div className="cm">
                            {role === 'admin' ? 'Resident submissions awaiting response' : '5 unread submissions'}
                          </div>
                        </div>
                        <button className="btn btn-g btn-sm" onClick={() => nav('feedback')}>
                          {role === 'admin' ? 'View All' : 'Review'}
                        </button>
                      </div>
                    </div>

                    {/* OPEN BLOTTER CASES */}
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ct">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <path d="M12 9v4" />
                              <path d="M12 17h.01" />
                            </svg>
                            Open Blotter Cases {role === 'admin' ? '(4)' : ''}
                          </div>
                          <div className="cm">Active incident cases requiring mediation tracking</div>
                        </div>
                        <button className="btn btn-g btn-sm" onClick={() => nav('blotter-manage')}>Manage</button>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: AUDIT TRAIL / ACTIVITY LOGS */}
                  <div>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--muted)',
                      marginBottom: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      {role === 'admin' ? 'Recent Audit Trail' : 'Recent Activity'}
                    </div>

                    {/* ACTIVITY LOGS (SVG Icons) */}
                    <div className="tw">
                      {role === 'staff' ? (
                        <>
                          {/* CERTIFICATE ISSUED */}
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--accent-bg)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6" />
                                <path d="M12 18v-6" />
                                <path d="M9 15h6" />
                              </svg>
                            </div>
                            <div className="al-body">
                              <div className="al-act">Certificate Issued — Clearance</div>
                              <div className="al-det">Lim, Ana G. · CERT-2024-088</div>
                            </div>
                            <div className="al-t">09:14</div>
                          </div>

                          {/* AID ENTRY */}
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--green-bg)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                                <path d="M12 22.08V12" />
                              </svg>
                            </div>
                            <div className="al-body">
                              <div className="al-act">Aid Entry — Rice Distribution</div>
                              <div className="al-det">Cruz, Ramon P. · Purok 2</div>
                            </div>
                            <div className="al-t">09:02</div>
                          </div>

                          {/* BLOTTER FILED */}
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--red-bg)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <path d="M12 9v4" />
                                <path d="M12 17h.01" />
                              </svg>
                            </div>
                            <div className="al-body">
                              <div className="al-act">Blotter Filed — Noise Complaint</div>
                              <div className="al-det">Case BLT-2024-041 · Purok 5</div>
                            </div>
                            <div className="al-t">08:30</div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* ADMIN ACTIONS */}
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--accent-bg)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6" />
                                <path d="M12 18v-6" />
                                <path d="M9 15h6" />
                              </svg>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div className="al-a">APPROVE_CERT — CERT-2024-088</div>
                              <div className="al-d">Juhairo Macabangon · Approved for Lim, Ana G.</div>
                            </div>
                            <div className="al-t">09:14</div>
                          </div>

                          {/* SYNC OFFLINE */}
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--teal-bg)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9 9 9 0 0 1 9 9z" />
                                <path d="M12 12L12 12.01" />
                                <path d="M12 6v6l4 4" />
                              </svg>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div className="al-a">SYNC_OFFLINE — 14 records</div>
                              <div className="al-d">Jay Napagal · CouchDB sync completed</div>
                            </div>
                            <div className="al-t">07:45</div>
                          </div>

                          {/* CONFLICT FLAGGED */}
                          <div className="al-row">
                            <div className="al-ico" style={{ background: 'var(--amber-bg)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <path d="M12 9v4" />
                                <path d="M12 17h.01" />
                              </svg>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div className="al-a">CONFLICT_FLAGGED — RES-0412</div>
                              <div className="al-d">2 device revisions conflict on purok field</div>
                            </div>
                            <div className="al-t">08:10</div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* VIEW FULL AUDIT LOG (Admin Only) */}
                    {role === 'admin' && (
                      <button
                        className="btn btn-g btn-sm"
                        onClick={() => nav('audit')}
                        style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                          <path d="M5 12h14" />
                          <path d="M12 5l7 7-7 7" />
                        </svg>
                        View Full Audit Log
                      </button>
                    )}
                  </div>
                </div>

                {/* =============================================
                    📊 3. BOTTOM ROW: PUROK DISTRIBUTION + SYSTEM LOGS
                  ============================================= */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                  gap: '24px'
                }}>
                  {/* LEFT: PUROK POPULATION DISTRIBUTION GRAPH */}
                  <div style={{
                    background: '#1e293b',
                    padding: '24px',
                    borderRadius: '8px',
                    border: '1px solid rgba(79, 142, 247, 0.1)'
                  }}>
                    <h3 style={{
                      color: '#f8fafc',
                      fontSize: '16px',
                      marginBottom: '16px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Population Distribution per Purok
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* PUROK 1 */}
                      <div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          color: '#94a3b8',
                          fontSize: '13px',
                          marginBottom: '4px'
                        }}>
                          <span>Purok 1</span>
                          <span>{p1Count} Residente</span>
                        </div>
                        <div style={{
                          background: '#0f172a',
                          height: '10px',
                          borderRadius: '5px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            background: '#a855f7',
                            height: '100%',
                            width: `${totalResidents > 0 ? (p1Count / totalResidents * 100) : 0}%`,
                            transition: 'width 0.5s ease-in-out'
                          }}></div>
                        </div>
                      </div>

                      {/* PUROK 2 */}
                      <div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          color: '#94a3b8',
                          fontSize: '13px',
                          marginBottom: '4px'
                        }}>
                          <span>Purok 2</span>
                          <span>{p2Count} Residente</span>
                        </div>
                        <div style={{
                          background: '#0f172a',
                          height: '10px',
                          borderRadius: '5px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            background: '#10b981',
                            height: '100%',
                            width: `${totalResidents > 0 ? (p2Count / totalResidents * 100) : 0}%`,
                            transition: 'width 0.5s ease-in-out'
                          }}></div>
                        </div>
                      </div>

                      {/* PUROK 3 */}
                      <div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          color: '#94a3b8',
                          fontSize: '13px',
                          marginBottom: '4px'
                        }}>
                          <span>Purok 3</span>
                          <span>{p3Count} Residente</span>
                        </div>
                        <div style={{
                          background: '#0f172a',
                          height: '10px',
                          borderRadius: '5px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            background: '#3b82f6',
                            height: '100%',
                            width: `${totalResidents > 0 ? (p3Count / totalResidents * 100) : 0}%`,
                            transition: 'width 0.5s ease-in-out'
                          }}></div>
                        </div>
                      </div>

                      {/* PUROK 5 */}
                      <div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          color: '#94a3b8',
                          fontSize: '13px',
                          marginBottom: '4px'
                        }}>
                          <span>Purok 5</span>
                          <span>{p5Count} Residente</span>
                        </div>
                        <div style={{
                          background: '#0f172a',
                          height: '10px',
                          borderRadius: '5px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            background: '#f59e0b',
                            height: '100%',
                            width: `${totalResidents > 0 ? (p5Count / totalResidents * 100) : 0}%`,
                            transition: 'width 0.5s ease-in-out'
                          }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: SYSTEM ACTIVITY LOGS */}
                  <div style={{
                    background: '#1e293b',
                    padding: '24px',
                    borderRadius: '8px',
                    border: '1px solid rgba(79, 142, 247, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <h3 style={{
                        color: '#f8fafc',
                        fontSize: '16px',
                        marginBottom: '12px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                          <path d="M12 22.08V12" />
                        </svg>
                        Local System Activity Logs
                      </h3>
                      <p style={{
                        color: '#94a3b8',
                        fontSize: '13px',
                        lineHeight: '1.5'
                      }}>
                        Ang local PouchDB instance mo ay kasalukuyang nakikipag-ugnayan sa backend Node.js core endpoint. Ang lahat ng mga pagbabagong isinasagawa sa client layer ay ligtas na naka-queue para sa global CouchDB cluster replication stream.
                      </p>
                    </div>
                    <div style={{
                      borderTop: '1px solid #334155',
                      paddingTop: '12px',
                      marginTop: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{
                        fontSize: '12px',
                        color: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                        Local synchronization active
                      </span>
                      <button
                        className="btn btn-g btn-sm"
                        onClick={() => nav('residents')}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        View Masterlist
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14" />
                          <path d="M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* ════════════════════════════════════════
                SCREEN: MANAGE RESIDENTS
                ════════════════════════════════════════ */}
            {screen === 'residents' && (
              <div className="screen active">
                {/* =============================================
                    📌 HEADER PANEL (Modern + Clean)
                    ============================================= */}
                <div className="ph">
                  <div>
                    <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Resident Masterlist
                    </div>
                    <div className="ps">
                      <span style={{ color: 'var(--muted)' }}>1,248 registered residents</span>
                      <span style={{ color: 'var(--hint)' }}> · Barangay Bustrac</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-p"
                    onClick={() => nav('add-resident')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add Resident
                  </button>
                </div>

                {/* =============================================
                    🔍 SEARCH & FILTER BAR (Glass-Morphism)
                    ============================================= */}
                <div
                  className="tw"
                  style={{
                    background: 'rgba(26, 29, 36, 0.4)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(79, 142, 247, 0.2)',
                    marginBottom: '16px'
                  }}
                >
                  <div className="tb">
                    {/* Search Box (SVG Icon) */}
                    <div className="sb-box">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                      </svg>
                      <input
                        placeholder="Search by name, purok, or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ color: 'var(--text)' }}
                      />
                    </div>

                    {/* Purok Filter (SVG Icon) */}
                    <select
                      className="fc"
                      style={{ width: '130px' }}
                      value={purokFilter}
                      onChange={(e) => setPurokFilter(e.target.value)}
                    >
                      <option value="">All Puroks</option>
                      <option value="Purok 1">Purok 1</option>
                      <option value="Purok 2">Purok 2</option>
                      <option value="Purok 3">Purok 3</option>
                      <option value="Purok 4">Purok 4</option>
                      <option value="Purok 5">Purok 5</option>
                      <option value="Purok 6">Purok 6</option>
                    </select>

                    {/* Gender Filter (SVG Icon) */}
                    <select className="fc" style={{ width: '110px' }}>
                      <option value="">All Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>

                {selectedResidents.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      marginBottom: '16px',
                      fontSize: '13px',
                      position: 'relative',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                      <span>
                        Selected: <strong style={{ color: 'var(--accent)' }}>{selectedResidents.length}</strong>
                        {selectedResidents.length === 1 ? ' resident' : ' residents'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
                      {/* Bulk Action Button (SVG Icon) */}
                      <button
                        className="btn btn-p btn-sm"
                        onClick={() => setShowBulkDropdown(!showBulkDropdown)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                          <path d="M12 2v2" />
                          <path d="M12 18v2" />
                          <path d="M4.93 4.93l2.83 2.83" />
                          <path d="M16.24 16.24l2.83 2.83" />
                          <path d="M2 12h2" />
                          <path d="M20 12h2" />
                          <path d="M4.93 19.07l2.83-2.83" />
                          <path d="M16.24 7.76l2.83-2.83" />
                        </svg>
                        Bulk Actions
                        <span style={{ fontSize: '10px' }}>{showBulkDropdown ? '▲' : '▼'}</span>
                      </button>

                      {/* Cancel Button */}
                      <button
                        className="btn btn-g btn-sm"
                        onClick={() => {
                          setSelectedResidents([]);
                          setShowBulkDropdown(false);
                        }}
                      >
                        Cancel
                      </button>

                      {/* Floating Dropdown Menu (SVG Icons) */}
                      {showBulkDropdown && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '40px',
                            right: '0',
                            background: '#111827',
                            border: '1px solid rgba(79, 142, 247, 0.2)',
                            borderRadius: '8px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                            zIndex: 50,
                            minWidth: '240px',
                            overflow: 'hidden',
                            animation: 'dp-fadeIn 0.2s ease-out'
                          }}
                        >
                          {/* Encode to Aid Program */}
                          <button
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text)',
                              fontSize: '13px',
                              textAlign: 'left',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => {
                              nav('aid-encode');
                              setShowBulkDropdown(false);
                            }}
                            onMouseEnter={(e) => (e.target.style.background = 'rgba(79, 142, 247, 0.1)')}
                            onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            </svg>
                            Encode to Aid Program
                          </button>

                          {/* Prepare Bulk Certificates */}
                          <button
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text)',
                              fontSize: '13px',
                              textAlign: 'left',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => {
                              nav('cert-print');
                              setShowBulkDropdown(false);
                            }}
                            onMouseEnter={(e) => (e.target.style.background = 'rgba(79, 142, 247, 0.1)')}
                            onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                              <path d="M12 18v-6" />
                              <path d="M9 15h6" />
                            </svg>
                            Prepare Bulk Certificates
                          </button>

                          {/* Divider */}
                          <div style={{ height: '1px', background: 'rgba(79, 142, 247, 0.2)', margin: '4px 0' }} />

                          {/* Export to CSV */}
                          <button
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--green)',
                              fontSize: '13px',
                              textAlign: 'left',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => {
                              const selectedData = residentsList.filter(r => selectedResidents.includes(r.id));
                              const csvHeaders = "Resident ID,Name,Purok,Age,Civil Status,Voter\n";
                              const csvRows = selectedData
                                .map(r => `"${r.id}","${r.name}","${r.purok}",${r.age},"${r.civilStatus}","${r.voter ? 'Yes' : 'No'}"`)
                                .join("\n");
                              const blob = new Blob([csvHeaders + csvRows], { type: 'text/csv;charset=utf-8;' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement("a");
                              link.setAttribute("href", url);
                              link.setAttribute("download", `Bustrac_Selected_Residents_${new Date().toISOString().slice(0, 10)}.csv`);
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              setShowBulkDropdown(false);
                              setSelectedResidents([]);
                            }}
                            onMouseEnter={(e) => (e.target.style.background = 'rgba(16, 185, 129, 0.1)')}
                            onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <path d="M7 10l5 5 5-5" />
                              <path d="M12 15v-6" />
                            </svg>
                            Export to CSV
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div
                  className="tw"
                  style={{
                    background: 'rgba(26, 29, 36, 0.4)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(79, 142, 247, 0.2)',
                    borderRadius: '8px'
                  }}
                >
                  <table>
                    <thead>
                      <tr>
                        {/* Master Checkbox */}
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            style={{ cursor: 'pointer' }}
                            checked={residentsList.length > 0 && selectedResidents.length === residentsList.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedResidents(residentsList.map(r => r.id));
                              } else {
                                setSelectedResidents([]);
                              }
                            }}
                          />
                        </th>
                        <th>Resident ID</th>
                        <th>Full Name</th>
                        <th>Purok</th>
                        <th>Age</th>
                        <th>Civil Status</th>
                        <th>Voter</th>
                        {role === 'admin' && <th>Household</th>}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResidents.map((res) => {
                        const isChecked = selectedResidents.includes(res.id);
                        return (
                          <tr
                            key={res.id}
                            style={
                              isChecked
                                ? {
                                    background: 'rgba(16, 185, 129, 0.08)',
                                    borderLeft: '3px solid var(--green)'
                                  }
                                : {}
                            }
                          >
                            {/* Checkbox Column */}
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedResidents([...selectedResidents, res.id]);
                                  } else {
                                    setSelectedResidents(selectedResidents.filter(id => id !== res.id));
                                  }
                                }}
                              />
                            </td>

                            {/* Resident ID */}
                            <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{res.id}</td>

                            {/* Full Name */}
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <strong>{res.name}</strong>
                                {res.conflict && (
                                  <span className="badge r" style={{ fontSize: '9px' }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                      <path d="M12 9v4" />
                                      <path d="M12 17h.01" />
                                    </svg>
                                    Conflict
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Purok */}
                            <td>
                              <span className={`badge ${res.purokClass}`}>{res.purok}</span>
                            </td>

                            {/* Age */}
                            <td>{res.age}</td>

                            {/* Civil Status */}
                            <td>{res.civilStatus}</td>

                            {/* Voter Status */}
                            <td>
                              <span className={`badge ${res.voter ? 'g' : 'gr'}`}>
                                {res.voter ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <path d="M22 4L12 14.01l-3-3" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                    <line x1="9" y1="9" x2="9.01" y2="9" />
                                    <line x1="15" y1="9" x2="15.01" y2="9" />
                                  </svg>
                                )}
                                {res.voter ? 'Yes' : 'No'}
                              </span>
                            </td>

                            {/* Household (Admin Only) */}
                            {role === 'admin' && <td style={{ fontFamily: 'var(--mono)' }}>{res.household}</td>}

                            {/* Actions */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {/* View */}
                              <button
                                className="btn btn-g btn-sm"
                                onClick={() => {
                                  setSelectedResidentId(res.id);
                                  nav('view-resident');
                                }}
                                style={{
                                  padding: '4px 8px',
                                  marginRight: '4px',
                                  color: 'var(--accent)',
                                  background: 'transparent',
                                  border: '1px solid rgba(79, 142, 247, 0.3)'
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <path d="M14 2v6h6" />
                                  <path d="M12 18v-6" />
                                  <path d="M9 15h6" />
                                </svg>
                              </button>

                              {/* Edit */}
                              <button
                                className="btn btn-g btn-sm"
                                onClick={() => {
                                  setSelectedResidentId(res.id);
                                  nav('edit-resident');
                                }}
                                style={{
                                  padding: '4px 8px',
                                  marginRight: '4px',
                                  color: 'var(--amber)',
                                  background: 'transparent',
                                  border: '1px solid rgba(251, 191, 36, 0.3)'
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>

                              {/* Delete (Admin Only) */}
                              {role === 'admin' && (
                                <button
                                  className="btn btn-g btn-sm"
                                  onClick={() => handleDeleteResident(res.id, res.name)}
                                  style={{
                                    padding: '4px 8px',
                                    color: 'var(--red)',
                                    background: 'transparent',
                                    border: '1px solid rgba(248, 113, 113, 0.3)'
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
                    <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                      Add New Resident
                    </div>
                    <div className="ps">Fill in the resident's complete profile</div>
                  </div>
                  <button
                    className="btn btn-g"
                    onClick={() => nav('residents')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5" />
                      <path d="M12 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                </div>

                {/* =============================================
                    📋 FORM PANEL (Glass-Morphism + SVG Icons)
                    ============================================= */}
                <form onSubmit={role === 'admin' ? submitAddResident : (e) => e.preventDefault()}>
                  <div className="fp" style={{
                    background: 'rgba(26, 29, 36, 0.4)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(79, 142, 247, 0.2)'
                  }}>
                    <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Personal Information
                    </div>

                    {/* Name Fields (3-Column Grid) */}
                    <div className="fg3">
                      <div className="fg">
                        <label className="fl">First Name</label>
                        <input
                          className="fc"
                          placeholder="e.g. Maria"
                          required
                          value={role === 'admin' ? residentForm.firstName : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('firstName', e.target.value) : undefined}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Middle Name</label>
                        <input
                          className="fc"
                          placeholder="e.g. Dela Cruz"
                          required
                          value={role === 'admin' ? residentForm.middleName : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('middleName', e.target.value) : undefined}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Last Name</label>
                        <input
                          className="fc"
                          placeholder="e.g. Santos"
                          required
                          value={role === 'admin' ? residentForm.lastName : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('lastName', e.target.value) : undefined}
                        />
                      </div>
                    </div>

                    {/* Birthdate & Gender (2-Column Grid) */}
                    <div className="fg2">
                      <div className="fg">
                        <label className="fl">Birthdate</label>
                        <input
                          className="fc"
                          type="date"
                          required
                          value={role === 'admin' ? residentForm.birthdate : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('birthdate', e.target.value) : undefined}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Gender</label>
                        <select
                          className="fc"
                          required
                          value={role === 'admin' ? residentForm.gender : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('gender', e.target.value) : undefined}
                        >
                          <option value="">-- Select --</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                    </div>

                    {/* Civil Status & Contact (2-Column Grid) */}
                    <div className="fg2">
                      <div className="fg">
                        <label className="fl">Civil Status</label>
                        <select
                          className="fc"
                          required
                          value={role === 'admin' ? residentForm.civilStatus : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('civilStatus', e.target.value) : undefined}
                        >
                          <option value="">-- Select --</option>
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Widowed">Widowed</option>
                          <option value="Separated">Separated</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl">Contact Number</label>
                        <input
                          className="fc"
                          placeholder="09XX-XXX-XXXX"
                          required
                          value={role === 'admin' ? residentForm.contact : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('contact', e.target.value) : undefined}
                        />
                      </div>
                    </div>

                    {/* Purok & Household (2-Column Grid) */}
                    <div className="fg2">
                      <div className="fg">
                        <label className="fl">Purok</label>
                        <select
                          className="fc"
                          required
                          value={role === 'admin' ? residentForm.purok : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('purok', e.target.value) : undefined}
                        >
                          <option value="">-- Select --</option>
                          <option value="Purok 1">Purok 1</option>
                          <option value="Purok 2">Purok 2</option>
                          <option value="Purok 3">Purok 3</option>
                          <option value="Purok 4">Purok 4</option>
                          <option value="Purok 5">Purok 5</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl">Household</label>
                        <select
                          className="fc"
                          required
                          value={role === 'admin' ? residentForm.household : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('household', e.target.value) : undefined}
                        >
                          <option value="">-- Select Household --</option>
                          {householdsList.map((hh) => {
                            const lastName = hh.head.split(',')[0].trim();
                            return (
                              <option key={hh.id} value={hh.id}>
                                {hh.id} — {lastName} Family ({hh.purok})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* Voter Checkbox */}
                    <div className="fg">
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}>
                        <input
                          type="checkbox"
                          checked={role === 'admin' ? residentForm.voter : undefined}
                          onChange={role === 'admin' ? (e) => updateResidentField('voter', e.target.checked) : undefined}
                        />
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 12l2 2 4-4" />
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        Registered Voter
                      </label>
                    </div>
                  </div>

                  {/* Offline Mode Notice */}
                  <div className="note note-i" style={{ marginBottom: '14px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9 9 9 0 0 1 9 9z" />
                      <path d="M12 12L12 12.01" />
                      <path d="M12 6v6l4 4" />
                    </svg>
                    <strong>Offline mode ready:</strong> Record saved to local CouchDB and synced on reconnect.
                  </div>

                  {/* Action Buttons */}
                  <div className="fa">
                    <button type="submit" className="btn btn-p" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21H5" />
                        <path d="M19 3H5" />
                        <path d="M19 12H5" />
                        <path d="M5 21V3" />
                      </svg>
                      Save Resident
                    </button>
                    <button
                      type="button"
                      className="btn btn-g"
                      onClick={() => nav('residents')}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 15l-6-6-6 6" />
                      </svg>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
            {/* ════════════════════════════════════════
                SCREEN: VIEW RESIDENT PROFILE
                ════════════════════════════════════════ */}
            {screen === 'view-resident' && (() => {
              const res = residentsList.find(r => r.id === selectedResidentId);
              const personalAidHistory = (typeof aidLogs !== 'undefined' ? aidLogs : [])
                .filter(log => log.residentId === selectedResidentId);

              if (!res) {
                return (
                  <div className="screen active">
                    <div className="ph">
                      <div className="pt">Resident Profile Not Found</div>
                      <button className="btn btn-g" onClick={() => nav('residents')}>← Back</button>
                    </div>
                    <div className="card">Mangyaring pumili ng valid na residente mula sa masterlist roster.</div>
                  </div>
                );
              }

              return (
                <div className="screen active">
                  <div className="ph">
                    <div>
                      <div className="pt">👤 Resident Profile Card</div>
                      <div className="ps">Personal dossier file index for {res.id}</div>
                    </div>
                    <button className="btn btn-g" onClick={() => nav('residents')}>← Back to Masterlist</button>
                  </div>

                  <div className="tc" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px' }}>
                    
                    {/* KALIWANG BAHAGI: CORE DEMOGRAPHIC SHEET */}
                    <div className="card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
                        <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>
                          {res.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#f8fafc' }}>{res.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>ID: {res.id}</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                        <div>
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Age</span>
                          <div style={{ fontWeight: 'bold', marginTop: '2px' }}>{res.age} yrs old</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Civil Status</span>
                          <div style={{ fontWeight: 'bold', marginTop: '2px' }}>{res.civilStatus}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Geographic Sector</span>
                          <div style={{ marginTop: '4px' }}><span className={`badge ${res.purokClass}`}>{res.purok}</span></div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Voter Authentication</span>
                          <div style={{ marginTop: '4px' }}>
                            <span className={`badge ${res.voter ? 'g' : 'gr'}`}>{res.voter ? '✓ Active Voter' : '✗ Non-Voter'}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: '16px', borderTop: '1px solid #334155', paddingTop: '12px', fontSize: '13px' }}>
                        <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Linked Household Structure</span>
                        <div 
                          style={{ fontWeight: 'bold', color: '#3b82f6', marginTop: '4px', cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => {
                            if (res.household) {
                              setSelectedHouseholdId(res.household);
                              nav('view-household');
                            }
                          }}
                        >
                          🏢 {res.household || 'None (Unassigned)'}
                        </div>
                      </div>
                    </div>

                    {/* KANANG BAHAGI: ASSISTANCE RECEIVED LOGS (CRUD AUDIT TRAIL) */}
                    <div className="card">
                      <div style={{ fontWeight: 'bold', marginBottom: '14px', color: '#3b82f6' }}>
                        📦 Relief & Assistance Ledger ({personalAidHistory.length})
                      </div>

                      {personalAidHistory.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: '13px', background: '#0f172a', borderRadius: '6px' }}>
                          Ang residenteng ito ay wala pang record ng anumang natatanggap na ayuda sa kasalukuyang mga programa.
                        </div>
                      ) : (
                        <div className="tw">
                          <table style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th>Log ID</th>
                                <th>Aid Released</th>
                                <th>Officer</th>
                                <th>Time Stamp</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {personalAidHistory.map((log) => (
                                <tr key={log.id}>
                                  <td style={monoMuted}>{log.id.substring(0, 8)}</td>
                                  <td><strong>{log.aid}</strong></td>
                                  <td>{log.officer}</td>
                                  <td style={monoMuted}>{log.time}</td>
                                  <td>
                                    <span className={`badge ${log.status === 'OK' ? 'g' : 't'}`}>
                                      {log.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* ════════════════════════════════════════
                SCREEN: EDIT RESIDENT
                ════════════════════════════════════════ */}
                {screen === 'edit-resident' && (
                  <div className="screen active">
                    <div className="ph">
                      <div>
                        <div className="pt">Edit Resident Record</div>
                        <div className="ps">
                          Updating record for ID: {' '}
                          <strong style={{ color: '#3b82f6', fontFamily: 'var(--mono)' }}>
                            {selectedResidentId}
                          </strong>
                        </div>
                      </div>
                      <button className="btn btn-g" onClick={() => nav('residents')}>
                        ← Back to List
                      </button>
                    </div>

                    {/* RESIDENT DATA UPDATE FORM */}
                    <form onSubmit={handleUpdateResidentChanges}>
                      <div className="fp">
                        <div className="fg2">
                          <div className="fg">
                            <label className="fl">First Name</label>
                            <input 
                              className="fc" 
                              required 
                              value={editForm.firstName} 
                              onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} 
                            />
                          </div>
                          <div className="fg">
                            <label className="fl">Last Name</label>
                            <input 
                              className="fc" 
                              required 
                              value={editForm.lastName} 
                              onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} 
                            />
                          </div>
                        </div>

                        <div className="fg2">
                          <div className="fg">
                            <label className="fl">Civil Status</label>
                            <select 
                              className="fc" 
                              required 
                              value={editForm.civilStatus} 
                              onChange={(e) => setEditForm({ ...editForm, civilStatus: e.target.value })}
                            >
                              <option value="Single">Single</option>
                              <option value="Married">Married</option>
                              <option value="Widowed">Widowed</option>
                              <option value="Separated">Separated</option>
                            </select>
                          </div>

                          <div className="fg">
                            <label className="fl">Purok / Zone</label>
                            <select 
                              className="fc" 
                              required 
                              value={editForm.purok} 
                              onChange={(e) => setEditForm({ ...editForm, purok: e.target.value })}
                            >
                              <option value="Purok 1">Purok 1</option>
                              <option value="Purok 2">Purok 2</option>
                              <option value="Purok 3">Purok 3</option>
                              <option value="Purok 4">Purok 4</option>
                              <option value="Purok 5">Purok 5</option>
                            </select>
                          </div>
                        </div>

                        <div className="fg">
                          <label className="fl">Household Assignment ID</label>
                          <input 
                            className="fc" 
                            placeholder="e.g. HH-0004" 
                            value={editForm.household} 
                            onChange={(e) => setEditForm({ ...editForm, household: e.target.value })} 
                          />
                        </div>
                      </div>

                      <div className="fa" style={{ marginTop: '20px' }}>
                        <button 
                          type="button" 
                          className="btn btn-g" 
                          onClick={() => nav('residents')} 
                          style={{ marginRight: '10px' }}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-p">
                          💾 Save Modifications
                        </button>
                      </div>
                    </form>
                  </div>
                )}
           
            {screen === 'add-household' && (
              <div className="screen active">
                <div className="ph">
                  <div>
                    <div className="pt">Register New Household</div>
                    <div className="ps">Create a primary household record for Barangay Bustrac</div>
                  </div>
                  <button className="btn btn-g" onClick={() => nav('households')}>← Back to List</button>
                </div>

                <div className="tw" style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
                  <form onSubmit={role === 'admin' ? submitAddHousehold : (e) => e.preventDefault()}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', color: '#94a3b8', marginBottom: '6px', fontSize: '13px' }}>Head of Family (Format: Lastname, Firstname M.)</label>
                      <input 
                        className="fc" 
                        placeholder="e.g., Obrero, Jay N."
                        value={householdForm.head}
                        onChange={(e) => setHouseholdForm({...householdForm, head: e.target.value})}
                        required
                      />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', color: '#94a3b8', marginBottom: '6px', fontSize: '13px' }}>Complete Address</label>
                      <input 
                        className="fc" 
                        placeholder="e.g., No. 7, Zone 1, Nabua"
                        value={householdForm.address}
                        onChange={(e) => setHouseholdForm({...householdForm, address: e.target.value})}
                        required
                      />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', color: '#94a3b8', marginBottom: '6px', fontSize: '13px' }}>Purok Assignment</label>
                      <select 
                        className="fc"
                        value={householdForm.purok}
                        onChange={(e) => setHouseholdForm({...householdForm, purok: e.target.value})}
                        required
                      >
                        <option value="">-- Select Purok --</option>
                        <option value="Purok 1">Purok 1</option>
                        <option value="Purok 2">Purok 2</option>
                        <option value="Purok 3">Purok 3</option>
                        <option value="Purok 4">Purok 4</option>
                        <option value="Purok 5">Purok 5</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-g" onClick={() => { setHouseholdForm(EMPTY_HOUSEHOLD); nav('households'); }}>Cancel</button>
                      <button type="submit" className="btn btn-p">💾 Save Household</button>
                    </div>
                  </form>
                </div>
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
                  <div className="ps">
                  {householdsList ? householdsList.length : 0} households registered
                </div>
                </div>
                <button className="btn btn-p" onClick={() => nav('add-household')}>＋ Add Household </button>
              </div>
              <div className="tw">
                <div className="tb">
                  <div className="sb-box">
                    <span>🔍</span>
                    <input 
                          type="text"
                          className="fc" 
                          placeholder="Search household..." 
                          value={householdSearch}
                          onChange={(e) => setHouseholdSearch(e.target.value)}
                        />
                  </div>
                  <select 
                    className="fc" 
                    style={{ width: '130px' }} 
                    value={purokFilter}
                    onChange={(e) => setPurokFilter(e.target.value)}
                  >
                    <option value="All Puroks">All Puroks</option>
                    {uniquePuroks.map((purok) => (
                      <option key={purok} value={purok}>
                        {purok}
                      </option>
                    ))}
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Head of Family</th>
                      <th 
                        onClick={() => {
                          if (addressSortOrder === 'none') setAddressSortOrder('asc');
                          else if (addressSortOrder === 'asc') setAddressSortOrder('desc');
                          else setAddressSortOrder('none');
                        }}
                        style={{ cursor: 'pointer', userSelect: 'none', transition: 'color 0.2s' }}
                        onMouseEnter={(e) => e.target.style.color = '#3b82f6'}
                        onMouseLeave={(e) => e.target.style.color = ''}
                      >
                        ADDRESS {addressSortOrder === 'asc' ? '▲' : addressSortOrder === 'desc' ? '▼' : '↕'}
                      </th>
                      <th>Purok</th>
                      <th>Members</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  
                  <tbody>
            {filteredHouseholds.map((h) => (
              <tr key={h.id}>
                <td style={mono10}>{h.id}</td>
                <td>{h.head}</td>
                <td>{h.address}</td>
                <td>
                  <span className={`badge ${h.purokClass}`}>{h.purok}</span>
                </td>
                <td>{h.members}</td>
                <td>
                  {/* 1. VIEW ACTION (Corrected from hh to h) */}
                  <span 
                    style={{ color: '#3b82f6', cursor: 'pointer', marginRight: '10px', fontSize: '12px', fontWeight: 'bold' }}
                    onClick={() => {
                      console.log("Selected HH ID:", h.id);
                      setSelectedHouseholdId(h.id);
                      nav('view-household');
                    }}
                  >
                    View
                  </span>

                  {/* 2. EDIT ACTION (Corrected from hh to h) */}
                  <span 
                    style={{ color: '#eab308', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    onClick={() => {
                      setSelectedHouseholdId(h.id);
                      nav('edit-household');
                    }}
                  >
                    Edit
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
                </table>
              </div>
            </div>
          )}
            {/* ════════════════════════════════════════
                SCREEN: VIEW HOUSEHOLD PROFILE
                ════════════════════════════════════════ */}
            {screen === 'view-household' && (() => {
              // Hahanapin ang tugmang household sa state array
              const hh = householdsList.find(h => h.id === selectedHouseholdId);
              
              // Awtomatikong kukunin ang lahat ng residente na kabilang sa household na ito
              const familyMembers = residentsList.filter(r => r.household === selectedHouseholdId);

              if (!hh) {
                return (
                  <div className="screen active">
                    <div className="ph">
                      <div className="pt">Household Not Found</div>
                      <button className="btn btn-g" onClick={() => nav('households')}>← Back</button>
                    </div>
                    <div className="card">Mangyaring pumili ng valid na Household mula sa listahan.</div>
                  </div>
                );
              }

              return (
                <div className="screen active">
                  <div className="ph">
                    <div>
                      <div className="pt">🏡 Household Profile Dashboard</div>
                      <div className="ps">Detailed management index for {hh.id}</div>
                    </div>
                    <button className="btn btn-g" onClick={() => nav('households')}>← Back to List</button>
                  </div>

                  <div className="tc" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                    
                    {/* KALIWANG BAHAGI: HOUSEHOLD METADATA */}
                    <div className="card" style={{ height: 'fit-content' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '14px', color: '#3b82f6', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
                        📍 Registration Specs
                      </div>
                      <div style={{ marginBottom: '10px', fontSize: '13px' }}>
                        <span style={{ color: 'var(--muted)' }}>Household Head:</span>
                        <div style={{ fontWeight: 'bold', fontSize: '15px', marginTop: '2px' }}>{hh.head}</div>
                      </div>
                      <div style={{ marginBottom: '10px', fontSize: '13px' }}>
                        <span style={{ color: 'var(--muted)' }}>Barangay Address:</span>
                        <div style={{ fontWeight: 'bold', marginTop: '2px' }}>{hh.address}</div>
                      </div>
                      <div style={{ marginBottom: '10px', fontSize: '13px' }}>
                        <span style={{ color: 'var(--muted)' }}>Jurisdiction Area:</span>
                        <div><span className={`badge ${hh.purokClass}`} style={{ marginTop: '2px' }}>{hh.purok}</span></div>
                      </div>
                      <div style={{ fontSize: '13px' }}>
                        <span style={{ color: 'var(--muted)' }}>Declared Members Count:</span>
                        <div style={{ fontWeight: 'bold', color: '#eab308' }}>{hh.members} individuals</div>
                      </div>
                    </div>

                    {/* KANANG BAHAGI: LIVE MEMBER ROSTER LIST */}
                    <div className="card">
                      <div style={{ fontWeight: 'bold', marginBottom: '12px', color: '#10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>👨‍👩‍👧‍👦 Dynamic Family Roster ({familyMembers.length})</span>
                        <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--muted)' }}>Cross-referenced from Resident Registry</span>
                      </div>

                      {familyMembers.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: '13px' }}>
                          Walang indibidwal na residente ang kasalukuyang naka-link sa Household Code na ito.
                        </div>
                      ) : (
                        <div className="tw">
                          <table style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th>Resident ID</th>
                                <th>Full Name</th>
                                <th>Age</th>
                                <th>Civil Status</th>
                                <th>Voter status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {familyMembers.map((member) => (
                                <tr key={member.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedResidentId(member.id); nav('view-resident'); }}>
                                  <td style={monoMuted}>{member.id}</td>
                                  <td><strong>{member.name}</strong></td>
                                  <td>{member.age}</td>
                                  <td>{member.civilStatus}</td>
                                  <td>
                                    <span className={`badge ${member.voter ? 'g' : 'gr'}`}>
                                      {member.voter ? 'Registered' : 'Non-Voter'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })()}
            {/* ════════════════════════════════════════
                SCREEN: CERTIFICATE REQUEST
                ════════════════════════════════════════ */}
            {screen === 'cert-req' && (
              <div className="screen active">
                {/* Ipinapasa ang state updater para makapag-dagdag ng data ang lifecycle modal */}
                <CertificateLifecycle setIssuedCertificates={setIssuedCertificates} />
              </div>
            )}
            
            {screen === 'cert-approve' && (
            <div className="screen active">
              <CertificateLifecycle />
            </div>
          )}
            {/* ════════════════════════════════════════
                SCREEN: ISSUANCE & PRINT
                ════════════════════════════════════════ */}
            {screen === 'cert-print' && (
  <div className="screen active">
    {/* =============================================
         📜 HEADER PANEL (SVG + Modern)
         ============================================= */}
    <div className="ph">
      <div>
        <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M12 18v-6" />
            <path d="M9 15h6" />
          </svg>
          Certificate Issuance & Print
        </div>
        <div className="ps">Generate, track, and print approved local community clearances</div>
      </div>
    </div>

    {/* =============================================
         📄 TWO-COLUMN LAYOUT (Glass-Morphism)
         ============================================= */}
    <div className="tc" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
      {/* LEFT COLUMN: TRANSACTION LIST TABLE (Glass-Morphism) */}
      <div>
        <div className="tw" style={{
          background: 'rgba(26, 29, 36, 0.4)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(79, 142, 247, 0.2)',
          borderRadius: '8px'
        }}>
          <div className="tb" style={{ borderBottom: '1px solid rgba(79, 142, 247, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text)' }}>Approved Certificates</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>Cert #</th>
                <th>Resident</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {approvedCertificates.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: '6px' }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                    No approved certificates awaiting issuance.
                  </td>
                </tr>
              ) : (
                approvedCertificates.map((req) => {
                  const residentName = `${req.firstName || ''} ${req.lastName || ''}`.trim();
                  const certificateType = req.certificateType || req.certType || 'Certificate';
                  const isSelected = selectedCertificate?._id === req._id;
                  return (
                    <tr
                      key={req._id}
                      onClick={() => setSelectedCertificate(req)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(59, 130, 246, 0.12)' : undefined,
                        borderLeft: isSelected ? '3px solid var(--accent)' : 'none'
                      }}
                    >
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{req._id}</td>
                      <td><strong>{residentName || 'Unnamed Resident'}</strong></td>
                      <td><span className="badge t">{certificateType}</span></td>
                      <td><span className="badge g">Approved</span></td>
                      <td>
                        <button
                          className="btn btn-p btn-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePrintRelease(req);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
                            <path d="M7 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H7" />
                            <path d="M12 7V5" />
                            <path d="M10 19h4" />
                            <path d="M7 9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                          </svg>
                          Print & Issue
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

      {/* RIGHT COLUMN: CERTIFICATE PREVIEW (White Background for Print) */}
      <div>
        {selectedCertificate ? (
          <div
            className="cert-p"
            id="printable-certificate-card"
            style={{
              position: 'relative',
              padding: '40px',
              background: '#ffffff',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              color: '#1e293b',
              overflow: 'hidden'
            }}
          >
            {Number(selectedCertificate.step) === 5 && (
              <div
                className="non-printable-watermark"
                style={{
                  position: 'absolute',
                  top: '40%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-25deg)',
                  fontSize: '75px',
                  fontWeight: '900',
                  color: 'rgba(22, 163, 74, 0.09)',
                  border: '8px double rgba(22, 163, 74, 0.15)',
                  padding: '10px 40px',
                  borderRadius: '16px',
                  letterSpacing: '6px',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  zIndex: 1
                }}
              >
                RELEASED / ISSUED
              </div>
            )}

            {/* LETTERHEAD HEADERS */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '14px', margin: 0, color: '#475569', fontWeight: 'normal', textTransform: 'uppercase' }}>
                Republic of the Philippines
              </h2>
              <h2 style={{ fontSize: '18px', margin: '4px 0', color: '#0f172a', fontWeight: 'bold', textTransform: 'uppercase' }}>
                Barangay Bustrac
              </h2>
              <h3 style={{ fontSize: '13px', margin: 0, color: '#64748b', fontStyle: 'italic' }}>
                Municipality of Nabua, Camarines Sur
              </h3>
            </div>
            <hr style={{ borderColor: '#0f172a', borderWidth: '1.5px', margin: '12px 0' }} />

            {/* DYNAMIC CERTIFICATE TITLE */}
            <h2 style={{
              textAlign: 'center',
              margin: '24px 0',
              color: '#2563eb',
              letterSpacing: '1.5px',
              fontSize: '22px',
              fontWeight: 'bold',
              textTransform: 'uppercase'
            }}>
              {((selectedCertificate.certificateType || 'CERTIFICATE').toString()).toUpperCase()}
            </h2>
            <hr style={{ borderColor: '#0f172a', borderWidth: '1.5px', margin: '12px 0' }} />

            {/* BODY PARAGRAPHS */}
            <p style={{
              marginTop: '28px',
              lineHeight: '2',
              color: '#1e293b',
              textIndent: '40px',
              textAlign: 'justify',
              fontSize: '15px'
            }}>
              This is to certify that <strong>{`${selectedCertificate.firstName || ''} ${selectedCertificate.lastName || ''}`.trim().toUpperCase()}</strong>, of legal age, a <em>bona fide</em> resident of <strong>
                {selectedCertificate.purok || (typeof residentsList !== 'undefined' && residentsList.find(r => r.name?.toLowerCase().includes(selectedCertificate.lastName?.toLowerCase() || ''))?.purok) || 'Purok 1'}
              </strong>, Barangay Bustrac, Nabua, Camarines Sur, has been found to be of <strong>good moral character</strong> and has no derogatory record or pending criminal case on file in this jurisdiction as of this date.
            </p>
            <p style={{
              marginTop: '20px',
              lineHeight: '2',
              color: '#1e293b',
              textIndent: '40px',
              textAlign: 'justify',
              fontSize: '15px'
            }}>
              This certification is issued upon the request of the above-named person for <strong>{selectedCertificate.purpose || 'any legal purpose'}</strong> and for whatever legal intent it may serve.
            </p>

            {/* SIGNATORY BLOCK */}
            <div style={{ marginTop: '60px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ textAlign: 'center', marginRight: '20px' }}>
                <div style={{ color: '#475569', fontSize: '13px', marginBottom: '35px' }}>
                  Issued on: {selectedCertificate.date_issued || selectedCertificate.updatedAt || selectedCertificate.createdAt || 'Today'}
                </div>
                <strong style={{
                  color: '#0f172a',
                  display: 'block',
                  borderTop: '1px solid #0f172a',
                  paddingTop: '8px',
                  minWidth: '240px',
                  fontSize: '15px',
                  textTransform: 'uppercase'
                }}>
                  HON. MARK GIAN CORTERO
                </strong>
                <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>Barangay Captain</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            background: '#1e293b',
            borderRadius: '8px',
            padding: '40px',
            textAlign: 'center',
            color: '#64748b',
            border: '2px dashed #334155',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span>Select an approved request from the table to preview the certificate.</span>
          </div>
        )}
      </div>
    </div>

    {/* =============================================
         📜 ISSUED HISTORY LOG (Glass-Morphism)
         ============================================= */}
    <div style={{ marginTop: '35px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="M9 15h6" />
            </svg>
            Issued History Log
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Official registry of previously printed and released community certificates
          </div>
        </div>
        <span className="badge gr" style={{ padding: '6px 12px' }}>
          Total Issued: {strictlyIssuedCertificates.length}
        </span>
      </div>
      <div className="tw" style={{
        background: 'rgba(26, 29, 36, 0.4)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(79, 142, 247, 0.2)',
        borderRadius: '8px'
      }}>
        <table>
          <thead>
            <tr>
              <th style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>Cert #</th>
              <th>Resident</th>
              <th>Type</th>
              <th>Date Issued</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {strictlyIssuedCertificates.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                  No historical issuance records found.
                </td>
              </tr>
            ) : (
              strictlyIssuedCertificates.map((req) => {
                const residentName = `${req.firstName || ''} ${req.lastName || ''}`.trim();
                const certificateType = req.certificateType || req.certType || 'Certificate';
                const isSelected = selectedCertificate?._id === req._id;
                return (
                  <tr
                    key={req._id}
                    onClick={() => setSelectedCertificate(req)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(59, 130, 246, 0.12)' : undefined,
                      borderLeft: isSelected ? '3px solid var(--accent)' : 'none'
                    }}
                  >
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{req._id}</td>
                    <td><strong>{residentName || 'Unnamed Resident'}</strong></td>
                    <td><span className="badge t">{certificateType}</span></td>
                    <td style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {req.issuedAt ? new Date(req.issuedAt).toLocaleDateString() : 'Recent'}
                    </td>
                    <td>
                      <button
                        className="btn btn-g btn-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedCertificate(req);
                          setTimeout(() => {
                            window.print();
                          }, 350);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
                          <path d="M7 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H7" />
                          <path d="M12 7V5" />
                          <path d="M10 19h4" />
                          <path d="M7 9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                        </svg>
                        Reprint
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
)}
             
            {/* ════════════════════════════════════════
                SCREEN: DISTRIBUTION PROGRAMS
                ════════════════════════════════════════ */}
            {screen === 'programs' && (
            <div className="screen active">
              <div className="ph">
                <div>
                  <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                    Distribution Programs
                  </div>
                  <div className="ps">Manage aid distribution programs, targets, lifecycle configurations, and logs</div>
                </div>
                <button
                  className="btn btn-p"
                  onClick={() => setShowNewProgramForm(!showNewProgramForm)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {showNewProgramForm ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 15l-6-6-6 6" />
                      </svg>
                      Close Form
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      New Program
                    </>
                  )}
                </button>
              </div>

              {/* =============================================
                  📝 PROGRAM CREATION FORM (Glass-Morphism + SVG)
                  ============================================= */}
              {showNewProgramForm && (
                <form
                  onSubmit={handleCreateProgram}
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(79, 142, 247, 0.2)',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '20px'
                  }}
                >
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    marginBottom: '12px',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                    Register New Distribution Campaign
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end'
                  }}>
                    <div style={{ flex: 2, minWidth: '200px' }}>
                      <label style={{
                        fontSize: '11px',
                        color: '#cbd5e1',
                        display: 'block',
                        marginBottom: '4px'
                      }}>
                        Program Title
                      </label>
                      <input
                        className="fc"
                        required
                        placeholder="e.g., Senior Citizen Cash Subsidy"
                        value={newProgramTitle}
                        onChange={(e) => setNewProgramTitle(e.target.value)}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: '100px' }}>
                      <label style={{
                        fontSize: '11px',
                        color: '#cbd5e1',
                        display: 'block',
                        marginBottom: '4px'
                      }}>
                        Target Beneficiaries
                      </label>
                      <input
                        className="fc"
                        type="number"
                        required
                        min="1"
                        value={newProgramTarget}
                        onChange={(e) => setNewProgramTarget(e.target.value)}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label style={{
                        fontSize: '11px',
                        color: '#cbd5e1',
                        display: 'block',
                        marginBottom: '4px'
                      }}>
                        Initial Status
                      </label>
                      <select
                        className="fc"
                        value={newProgramStatus}
                        onChange={(e) => setNewProgramStatus(e.target.value)}
                      >
                        <option value="Active">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                          Active
                        </option>
                        <option value="Upcoming">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                          Upcoming
                        </option>
                      </select>
                    </div>

                    <div>
                      <button
                        type="submit"
                        className="btn btn-p"
                        style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 21H5" />
                          <path d="M19 3H5" />
                          <path d="M19 12H5" />
                          <path d="M5 21V3" />
                        </svg>
                        Save Program
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* =============================================
                  🔍 SEARCH, FILTER & SORT BAR (Glass-Morphism + SVG)
                  ============================================= */}
              <div
                className="tb"
                style={{
                  background: 'rgba(26, 29, 36, 0.4)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(79, 142, 247, 0.2)',
                  marginBottom: '20px',
                  gap: '10px',
                  flexWrap: 'wrap',
                  padding: '12px',
                  borderRadius: '8px'
                }}
              >
                <div className="sb-box" style={{ flex: 2, minWidth: '220px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    placeholder="Search campaign name, ID, or aid type..."
                    value={programSearchQuery}
                    onChange={(e) => setProgramSearchQuery(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {/* Status Filter */}
                  <select
                    className="fc"
                    style={{ width: '130px' }}
                    value={programStatusFilter}
                    onChange={(e) => setProgramStatusFilter(e.target.value)}
                  >
                    <option value="All">All Status</option>
                    <option value="Active">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      Active
                    </option>
                    <option value="Upcoming">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      Upcoming
                    </option>
                    <option value="Completed">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      Completed
                    </option>
                    <option value="Archived">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                      Archived
                    </option>
                  </select>

                  {/* Sorting Options */}
                  <select
                    className="fc"
                    style={{ width: '160px' }}
                    value={programSortOption}
                    onChange={(e) => setProgramSortOption(e.target.value)}
                  >
                    <option value="Newest">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M7 12h10" />
                        <path d="M12 2v20" />
                      </svg>
                      Newest Created
                    </option>
                    <option value="Oldest">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M7 12h10" />
                      </svg>
                      Oldest Created
                    </option>
                    <option value="Alphabetical">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                      Alphabetical (A-Z)
                    </option>
                    <option value="MostBeneficiaries">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Target Capacity
                    </option>
                  </select>
                </div>
              </div>

              {/* =============================================
                  📊 PROGRAMS GRID (Glass-Morphism + SVG)
                  ============================================= */}
              {processedPrograms.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px',
                  background: 'rgba(30, 41, 59, 0.4)',
                  borderRadius: '8px',
                  color: '#94a3b8',
                  border: '1px dashed rgba(79, 142, 247, 0.2)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  Walang nakitang distribution programs na tumutugma sa iyong query o filter settings.
                </div>
              ) : (
                <div className="thc" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '16px'
                }}>
                  {processedPrograms.map((prog) => {
                    const percent = Math.min(100, Math.round((prog.current / prog.target) * 100)) || 0;

                    // Status badge styling
                    let statusBadgeClass = "badge g";
                    let statusIcon = (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4" />
                        <path d="M12 18v4" />
                        <path d="M4.93 4.93l2.83 2.83" />
                        <path d="M16.24 16.24l2.83 2.83" />
                        <path d="M2 12h2" />
                        <path d="M20 12h2" />
                        <path d="M4.93 19.07l2.83-2.83" />
                        <path d="M16.24 7.76l2.83-2.83" />
                      </svg>
                    );

                    if (prog.status === 'Completed') {
                      statusBadgeClass = "badge t";
                      statusIcon = (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <path d="M22 4L12 14.01l-3-3" />
                        </svg>
                      );
                    } else if (prog.status === 'Upcoming') {
                      statusBadgeClass = "badge a";
                      statusIcon = (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                      );
                    } else if (prog.status === 'Archived') {
                      statusBadgeClass = "badge r";
                      statusIcon = (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                      );
                    }

                    return (
  <div
    className="card"
    key={prog.id}
    style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      border: '1px solid rgba(79, 142, 247, 0.2)',
      position: 'relative',
      background: 'rgba(30, 41, 59, 0.4)',
      backdropFilter: 'blur(8px)',
      borderRadius: '8px',
      padding: '16px',
      transition: 'all 0.3s ease'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = 'rgba(79, 142, 247, 0.2)';
      e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
    }}
  >
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '8px',
        alignItems: 'center'
      }}>
        <span className={statusBadgeClass} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {statusIcon}
          {prog.status}
        </span>
        <span className="badge gr" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M12 18v-6" />
            <path d="M9 15h6" />
          </svg>
          {prog.dateLabel || 'Campaign'}
        </span>
      </div>

      <div className="ct" style={{
        fontWeight: 'bold',
        fontSize: '15px',
        color: '#f8fafc',
        marginBottom: '4px'
      }}>
        {prog.title}
      </div>

      <div className="cm" style={{
        fontFamily: 'var(--mono)',
        fontSize: '11px',
        color: '#94a3b8',
        marginBottom: '10px'
      }}>
        {prog.id}
      </div>

      {/* Progress Bar */}
      <div className="prog" style={{
        margin: '10px 0',
        background: '#334155',
        borderRadius: '4px',
        height: '8px',
        overflow: 'hidden'
      }}>
        <div
          className="prog-b"
          style={{
            width: `${percent}%`,
            height: '100%',
            background: prog.status === 'Completed'
              ? 'linear-gradient(90deg, #10b981, #14b8a6)'
              : prog.status === 'Upcoming'
                ? '#64748b'
                : '#3b82f6',
            transition: 'width 0.4s ease-in-out'
          }}
        />
      </div>

      <div style={{
        fontSize: '11px',
        color: '#94a3b8',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>{prog.current} / {prog.target} targets</span>
        <strong>{percent}%</strong>
      </div>
    </div>

    {/* Action Buttons */}
    <div style={{
      display: 'flex',
      gap: '6px',
      marginTop: '16px',
      borderTop: '1px solid rgba(79, 142, 247, 0.2)',
      paddingTop: '12px',
      flexWrap: 'wrap'
    }}>
      {prog.status === 'Active' && (
        <>
          <button
            className="btn btn-p btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => nav('aid-encode')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            Encode
          </button>

          <button
            className="btn btn-g btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => nav('aid-logs')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="M9 15h6" />
            </svg>
            Logs
          </button>

          <button
            className="btn btn-a btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: '#d97706',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => setEditingProgram(prog)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>

          <button
            className="btn btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: '#10b981',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => {
              const updated = programsList.map(p =>
                p.id === prog.id ? { ...p, status: 'Completed' } : p
              );
              setProgramsList(updated);
              alert(`Program campaign ${prog.title} has been successfully closed and marked as Completed.`);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="M22 4L12 14.01l-3-3" />
            </svg>
            Complete
          </button>
        </>
      )}

      <button
        className="btn btn-sm"
        style={{
          padding: '4px 8px',
          fontSize: '11px',
          background: '#475569',
          color: '#cbd5e1',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
        onClick={async () => {
          const updated = programsList.map(p =>
            p.id === prog.id ? { ...p, status: 'Archived' } : p
          );
          setProgramsList(updated);
          await createAuditLog({
            action: 'ARCHIVE',
            module: 'PROGRAMS',
            recordId: prog.id,
            details: `Archived program: ${prog.title}`,
          });
          alert(`Campaign historical logs archived successfully.`);
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
        Archive
      </button>

      {prog.status === 'Upcoming' && (
        <>
          <button
            className="btn btn-p btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => {
              const updated = programsList.map(p =>
                p.id === prog.id ? { ...p, status: 'Active' } : p
              );
              setProgramsList(updated);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="M4.93 4.93l2.83 2.83" />
              <path d="M16.24 16.24l2.83 2.83" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="M4.93 19.07l2.83-2.83" />
              <path d="M16.24 7.76l2.83-2.83" />
            </svg>
            Activate
          </button>

          <button
            className="btn btn-a btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => setEditingProgram(prog)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>

          <button
            className="btn btn-r btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => setConfirmDeleteId(prog.id)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            Archive
          </button>
        </>
      )}

      {prog.status === 'Archived' && (
        <>
          <button
            className="btn btn-p btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: '#6366f1',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => setViewingProgram(prog)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="M9 15h6" />
            </svg>
            View
          </button>

          <button
            className="btn btn-g btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => {
              const updated = programsList.map(p =>
                p.id === prog.id ? { ...p, status: 'Active' } : p
              );
              setProgramsList(updated);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="M4.93 4.93l2.83 2.83" />
              <path d="M16.24 16.24l2.83 2.83" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="M4.93 19.07l2.83-2.83" />
              <path d="M16.24 7.76l2.83-2.83" />
            </svg>
            Restore
          </button>
        </>
      )}
    </div>
  </div>
);
                  })}
                </div>
              )}

              {/* =============================================
                  📋 MODAL 1: VIEW PROGRAM DETAILS (Glass-Morphism + SVG)
                  ============================================= */}
              {viewingProgram && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'rgba(0,0,0,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999
                }}>
                  <div style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(79, 142, 247, 0.3)',
                    padding: '24px',
                    borderRadius: '12px',
                    width: '90%',
                    maxWidth: '450px',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                  }}>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#f8fafc',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                      Campaign Insights
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#3b82f6',
                      marginBottom: '16px',
                      fontFamily: 'var(--mono)'
                    }}>
                      {viewingProgram.id}
                    </div>

                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      fontSize: '13px',
                      color: '#cbd5e1'
                    }}>
                      <div>
                        <strong>Campaign Title:</strong>
                        <span style={{ color: 'white' }}>{viewingProgram.title}</span>
                      </div>

                      <div>
                        <strong>Distribution Phase Status:</strong>
                        <span className="badge g" style={{ marginLeft: '8px' }}>
                          {viewingProgram.status}
                        </span>
                      </div>

                      <div>
                        <strong>Aid Classification Matrix:</strong>
                        <span>{viewingProgram.aidType || 'Rice Support — 5kg'}</span>
                      </div>

                      <hr style={{ borderColor: 'rgba(79, 142, 247, 0.2)', margin: '4px 0' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Expected Targets:</span>
                        <strong>{viewingProgram.target}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Encoded Beneficiaries:</span>
                        <strong style={{ color: '#10b981' }}>{viewingProgram.current}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Remaining Queue Space:</span>
                        <strong style={{ color: '#ef4444' }}>
                          {viewingProgram.target - viewingProgram.current}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Completion Execution Rate:</span>
                        <strong style={{ color: '#3b82f6' }}>
                          {Math.round((viewingProgram.current / viewingProgram.target) * 100)}%
                        </strong>
                      </div>

                      <hr style={{ borderColor: 'rgba(79, 142, 247, 0.2)', margin: '4px 0' }} />

                      <div>
                        <strong>Log Audit Remarks:</strong>
                        <p style={{
                          fontStyle: 'italic',
                          background: '#0f172a',
                          padding: '8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          marginTop: '4px'
                        }}>
                          {viewingProgram.remarks || 'No recorded admin overhead remarks for this log asset.'}
                        </p>
                      </div>
                    </div>

                    <button
                      className="btn btn-g"
                      style={{
                        width: '100%',
                        marginTop: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        justifyContent: 'center'
                      }}
                      onClick={() => setViewingProgram(null)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 15l-6-6-6 6" />
                      </svg>
                      Close Viewport
                    </button>
                  </div>
                </div>
              )}

              {/* =============================================
                  ✏️ MODAL 2: EDIT PROGRAM FORM (Glass-Morphism + SVG)
                  ============================================= */}
              {editingProgram && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'rgba(0,0,0,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999
                }}>
                  <div style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(79, 142, 247, 0.3)',
                    padding: '24px',
                    borderRadius: '12px',
                    width: '90%',
                    maxWidth: '450px',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                  }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: 'bold',
                      color: '#f8fafc',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit Distribution Configuration
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{
                          fontSize: '11px',
                          color: '#cbd5e1',
                          display: 'block',
                          marginBottom: '4px'
                        }}>
                          Program Title
                        </label>
                        <input
                          className="fc"
                          value={editingProgram.title}
                          onChange={(e) => setEditingProgram({...editingProgram, title: e.target.value})}
                        />
                      </div>

                      <div>
                        <label style={{
                          fontSize: '11px',
                          color: '#cbd5e1',
                          display: 'block',
                          marginBottom: '4px'
                        }}>
                          Target Capacity
                        </label>
                        <input
                          className="fc"
                          type="number"
                          value={editingProgram.target}
                          onChange={(e) => setEditingProgram({...editingProgram, target: Number(e.target.value)})}
                        />
                      </div>

                      <div>
                        <label style={{
                          fontSize: '11px',
                          color: '#cbd5e1',
                          display: 'block',
                          marginBottom: '4px'
                        }}>
                          Aid Material Type
                        </label>
                        <input
                          className="fc"
                          value={editingProgram.aidType || ''}
                          placeholder="e.g., Rice 5kg / Financial Cash P1000"
                          onChange={(e) => setEditingProgram({...editingProgram, aidType: e.target.value})}
                        />
                      </div>

                      <div>
                        <label style={{
                          fontSize: '11px',
                          color: '#cbd5e1',
                          display: 'block',
                          marginBottom: '4px'
                        }}>
                          Campaign Schedule Label
                        </label>
                        <input
                          className="fc"
                          value={editingProgram.dateLabel || ''}
                          placeholder="e.g., Q3 2026 / July 2026"
                          onChange={(e) => setEditingProgram({...editingProgram, dateLabel: e.target.value})}
                        />
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '20px',
                      borderTop: '1px solid rgba(79, 142, 247, 0.2)',
                      paddingTop: '16px'
                    }}>
                      <button
                        className="btn btn-g"
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'center'
                        }}
                        onClick={() => setEditingProgram(null)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 15l-6-6-6 6" />
                        </svg>
                        Cancel
                      </button>

                      <button
                        className="btn btn-p"
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'center'
                        }}
                        onClick={() => {
                          const updated = programsList.map(p =>
                            p.id === editingProgram.id ? editingProgram : p
                          );
                          setProgramsList(updated);
                          setEditingProgram(null);
                          alert('Distribution details synchronized updated.');
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 21H5" />
                          <path d="M19 3H5" />
                          <path d="M19 12H5" />
                          <path d="M5 21V3" />
                        </svg>
                        Save Modifications
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* =============================================
                  🗑️ MODAL 3: DELETE CONFIRMATION (Glass-Morphism + SVG)
                  ============================================= */}
              {confirmDeleteId && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'rgba(0,0,0,0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 99999
                }}>
                  <div style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid #ef4444',
                    padding: '24px',
                    borderRadius: '12px',
                    width: '90%',
                    maxWidth: '400px',
                    textAlign: 'center',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                  }}>
                    <div style={{
                      fontSize: '36px',
                      marginBottom: '12px',
                      color: '#ef4444'
                    }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                      </svg>
                    </div>

                    <div style={{
                      fontSize: '16px',
                      fontWeight: 'bold',
                      color: '#f8fafc',
                      marginBottom: '8px'
                    }}>
                      Delete this program?
                    </div>

                    <div style={{
                      fontSize: '12px',
                      color: '#94a3b8',
                      marginBottom: '20px'
                    }}>
                      Ang aksyong ito ay hindi na mababawi. Mawawala ang core program registration block na ito mula sa system registry.
                    </div>

                    <div style={{
                      display: 'flex',
                      gap: '10px',
                      justifyContent: 'center'
                    }}>
                      <button
                        className="btn btn-g"
                        style={{
                          minWidth: '100px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'center'
                        }}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 15l-6-6-6 6" />
                        </svg>
                        Cancel
                      </button>

                      <button
                        className="btn btn-r"
                        style={{
                          minWidth: '100px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'center'
                        }}
                        onClick={() => {
                          const updated = programsList.filter(p => p.id !== confirmDeleteId);
                          setProgramsList(updated);
                          setConfirmDeleteId(null);
                          alert('Program template completely purged from current state registry.');
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
)}

            {/* ════════════════════════════════════════
                SCREEN: ENCODE DISTRIBUTION
                ════════════════════════════════════════ */}
            {screen === 'aid-encode' && (
                  <div className="screen active">
                    {/* Page Header */}
                    <div className="ph">
                      <div>
                        <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                            <path d="M12 22.08V12" />
                          </svg>
                          Aid Distribution Encoding
                        </div>
                        <div className="ps">Log a beneficiary entry for an active relief program</div>
                      </div>
                      <button 
                        className="btn btn-g" 
                        onClick={() => nav('programs')} 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 12H5" />
                          <path d="M12 19l-7-7 7-7" />
                        </svg>
                        Back to Programs
                      </button>
                    </div>

                    {/* Success Message Banner */}
                    {successMessage && (
                      <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(6, 95, 70, 0.4)', color: '#34d399', border: '1px solid #059669', fontSize: '13px', fontWeight: '500', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {successMessage}
                      </div>
                    )}

                    {/* Batch Mode Indicator */}
                    {selectedResidents.length > 0 && (
                      <div style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px dashed #3b82f6', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '12px', backdropFilter: 'blur(8px)' }}>
                        <span style={{ color: '#3b82f6', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                          Batch Mode Active:
                        </span>
                        {' '}<strong>{selectedResidents.length}</strong> residents are queued for processing from the Masterlist Selection.
                        <div style={{ marginTop: '5px', maxHeight: '60px', overflowY: 'auto', fontSize: '11px', color: '#94a3b8', padding: '4px 8px', background: '#0f172a', borderRadius: '4px' }}>
                          Queued: {residentsList.filter(r => selectedResidents.includes(r.id)).map(r => r.name).join(', ')}
                        </div>
                        <button 
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', padding: '0', marginTop: '6px', display: 'block' }}
                          onClick={() => setSelectedResidents([])}
                        >
                          Cancel Batch Mode
                        </button>
                      </div>
                    )}

                    <div className="tc">
                      {/* 📝 FORM PANEL */}
                      <div className="fp" style={{ background: 'rgba(26, 29, 36, 0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(79, 142, 247, 0.2)', borderRadius: '8px' }}>
                        <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          </svg>
                          Distribution Entry Form
                        </div>

                        {/* Relief Program Field */}
                        <div className="fg" style={{ marginBottom: '16px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                            Relief Program <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <select
                            className="fc"
                            value={selectedProgramId}
                            onChange={(e) => {
                              const progId = e.target.value;
                              setSelectedProgramId(progId);
                              const foundProg = programsList.find((p) => p.id === progId);
                              if (foundProg) {
                                setAidType(
                                  foundProg.title.includes('Rice') ? 'Rice — 5kg Pack' : 'Financial / Cash Aid'
                                );
                              }
                            }}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#0f172a', color: selectedProgramId ? '#f8fafc' : '#64748b', border: '1px solid #334155', fontSize: '13px', outline: 'none', cursor: 'pointer', transition: 'border-color 0.2s ease' }}
                          >
                            <option value="" disabled hidden>Choose active relief campaign...</option>
                            {programsList
                              .filter((prog) => prog.status === 'Active')
                              .map((prog) => {
                                const isFull = (prog.current || 0) >= (prog.target || 1);
                                return (
                                  <option key={prog.id} value={prog.id} disabled={isFull} style={{ background: '#1e293b', color: isFull ? '#94a3b8' : '#f8fafc', padding: '8px' }}>
                                    {prog.title} ({prog.id}) — {prog.current}/{prog.target} {isFull ? '⚠️ (FULL)' : ''}
                                  </option>
                                );
                              })}
                          </select>
                        </div>

                        {/* Beneficiary Resident Selector with Filter & Clean Purok Text */}
                        <div className="fg" style={{ marginBottom: '16px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            Beneficiary Resident <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <div style={{ position: 'relative', marginBottom: '8px' }}>
                            <input
                              type="text"
                              placeholder="Type to filter resident name, ID, or purok..."
                              value={residentSearch}
                              onChange={(e) => setResidentSearch(e.target.value)}
                              style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: '6px', background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                            />
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                              <circle cx="11" cy="11" r="8" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            {residentSearch && (
                              <button
                                type="button"
                                onClick={() => setResidentSearch('')}
                                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', padding: '2px' }}
                              >
                                ✕
                              </button>
                            )}
                          </div>

                          <select
                            className="fc"
                            value={selectedResidentId}
                            onChange={(e) => setSelectedResidentId(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#0f172a', color: selectedResidentId ? '#f8fafc' : '#64748b', border: '1px solid #334155', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                          >
                            <option value="" disabled hidden>
                              {filteredBeneficiaries.length > 0 ? "Select beneficiary from filtered list..." : "No matching resident found..."}
                            </option>
                            {filteredBeneficiaries.map((res) => (
                              <option key={res.id} value={res.id} style={{ background: '#1e293b', color: '#f8fafc', padding: '8px' }}>
                                {res.name} ({res.id || 'Resident'}) — {res.purok?.toString().toLowerCase().startsWith('purok') ? res.purok : `Purok ${res.purok || '1'}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Aid Type Field */}
                        <div className="fg" style={{ marginBottom: '16px' }}>
                          <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 7h-9" />
                              <path d="M14 17H5" />
                              <path d="M9 7v10" />
                            </svg>
                            Aid Type <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="fc"
                            value={aidType}
                            onChange={(e) => setAidType(e.target.value)}
                            placeholder="e.g., Rice — 5kg"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', fontSize: '13px', outline: 'none' }}
                          />
                        </div>

                        {/* 🔢 Custom Stepper + Add Entry Action Grid */}
                        <div className="fg2" style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          {/* Custom Quantity Stepper */}
                          <div className="fg">
                            <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 11.25v8.75a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.75" />
                                <path d="M18 11l-3-3-3 3" />
                              </svg>
                              Quantity <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
                              <button
                                type="button"
                                onClick={() => setQuantity(prev => Math.max(1, (Number(prev) || 1) - 1))}
                                style={{ padding: '0 12px', height: '38px', background: '#1e293b', border: 'none', color: '#94a3b8', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s ease, color 0.2s ease' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#f8fafc'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                style={{ width: '100%', textAlign: 'center', background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '13px', fontWeight: '600', outline: 'none' }}
                              />
                              <button
                                type="button"
                                onClick={() => setQuantity(prev => (Number(prev) || 0) + 1)}
                                style={{ padding: '0 12px', height: '38px', background: '#1e293b', border: 'none', color: '#94a3b8', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s ease, color 0.2s ease' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#f8fafc'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Integrated Add / Log Entry Button */}
                          <div className="fg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-p"
                              onClick={handleEncodeSubmit}
                              disabled={!selectedProgramId || !selectedResidentId}
                              style={{
                                height: '38px',
                                display: 'flex',
                                alignItems: 'center',
                                justify: 'center',
                                gap: '6px',
                                borderRadius: '8px',
                                background: '#0284c7',
                                color: '#ffffff',
                                fontWeight: '600',
                                fontSize: '13px',
                                border: 'none',
                                cursor: (!selectedProgramId || !selectedResidentId) ? 'not-allowed' : 'pointer',
                                opacity: (!selectedProgramId || !selectedResidentId) ? 0.5 : 1,
                                transition: 'background 0.2s ease'
                              }}
                              onMouseEnter={(e) => { if (selectedProgramId && selectedResidentId) e.currentTarget.style.background = '#0369a1'; }}
                              onMouseLeave={(e) => { if (selectedProgramId && selectedResidentId) e.currentTarget.style.background = '#0284c7'; }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                              </svg>
                              Add Entry
                            </button>
                          </div>
                        </div>

                        {/* Remarks */}
                        <div className="fg">
                          <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                              <path d="M12 18v-6" />
                              <path d="M9 15h6" />
                            </svg>
                            Remarks
                          </label>
                          <textarea
                            className="fc"
                            placeholder="Optional notes..."
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            style={{ minHeight: '70px' }}
                          />
                        </div>

                        {/* Duplicate Validation Status */}
                        {!duplicateAlert && selectedResidentId && (
                          <div className="note note-s" style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <path d="M22 4L12 14.01l-3-3" />
                            </svg>
                            No duplicate — resident not yet recorded under this program.
                          </div>
                        )}
                      </div>

                      {/* 📊 AID LOGS TABLE */}
                      <div>
                        {duplicateAlert && (
                          <div className="note note-e" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <path d="M12 9v4" />
                              <path d="M12 17h.01" />
                            </svg>
                            <strong>{duplicateAlert}</strong>
                          </div>
                        )}

                        <div className="tw" style={{ background: 'rgba(26, 29, 36, 0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(79, 142, 247, 0.2)', borderRadius: '8px' }}>
                          <table style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>Resident</th>
                                <th style={{ fontSize: '11px', color: 'var(--muted)' }}>Aid</th>
                                <th style={{ fontSize: '11px', color: 'var(--muted)' }}>By</th>
                                <th style={{ fontSize: '11px', color: 'var(--muted)' }}>Time</th>
                                <th style={{ fontSize: '11px', color: 'var(--muted)' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {aidLogs.map((log) => (
                                <tr
                                  key={log.id}
                                  style={{ borderBottom: '1px solid rgba(79, 142, 247, 0.1)', transition: 'background 0.2s ease' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(79, 142, 247, 0.05)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <td>{log.residentName}</td>
                                  <td>{log.aid}</td>
                                  <td>{log.officer}</td>
                                  <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: '#94a3b8' }}>{log.time}</td>
                                  <td>
                                    <span className={`badge ${log.status === 'OK' ? 'g' : log.status === 'Synced' ? 't' : 'r'}`}>
                                      {log.status === 'OK' && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                          <path d="M22 4L12 14.01l-3-3" />
                                        </svg>
                                      )}
                                      {log.status === 'Synced' && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                        </svg>
                                      )}
                                      {log.status === 'Error' && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                          <path d="M12 9v4" />
                                          <path d="M12 17h.01" />
                                        </svg>
                                      )}
                                      {' '}{log.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
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
                      {/* 🔍 GUMAGANANG SEARCH INPUT */}
                      <div className="sb-box">
                        <span>🔍</span>
                        <input 
                          placeholder="Search beneficiary or log ID..." 
                          value={logSearchQuery}
                          onChange={(e) => setLogSearchQuery(e.target.value)}
                        />
                      </div>
                      
                      {/* 🔄 DYNAMIC PROGRAM FILTER DROPDOWN */}
                      <select 
                        className="fc" 
                        style={{ width: '260px' }} 
                        value={programFilter} 
                        onChange={(e) => setProgramFilter(e.target.value)}
                      >
                        <option value="All">All Programs</option>
                        {programsList.map((prog) => {
  // Calculate percentage for the progress bar
  const percent = Math.min(100, Math.round(((prog.current || 0) / (prog.target || 1)) * 100));

  return (
    <div
      className="card"
      key={prog.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justify: 'space-between',
        border: '1px solid rgba(79, 142, 247, 0.2)',
        position: 'relative',
        background: 'rgba(30, 41, 59, 0.4)',
        backdropFilter: 'blur(8px)',
        borderRadius: '8px',
        padding: '16px',
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(79, 142, 247, 0.2)';
        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
      }}
    >
      <div>
        {/* CARD HEADER WITH DYNAMIC BADGE */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
          {/* Call the helper function here */}
          <span className={`badge ${getStatusBadgeClass(prog.status)}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ height: '6px', width: '6px', borderRadius: '50%', backgroundColor: 'currentColor', display: 'inline-block' }}></span>
            {prog.status}
          </span>

          <span className="badge gr" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="M9 15h6" />
            </svg>
            {prog.dateLabel || 'Campaign'}
          </span>
        </div>

        <div className="ct" style={{ fontWeight: 'bold', fontSize: '15px', color: '#f8fafc', marginBottom: '4px' }}>
          {prog.title}
        </div>
        <div className="cm" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
          {prog.id}
        </div>

        {/* PROGRESS BAR */}
        <div className="prog" style={{ margin: '10px 0', background: '#334155', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
          <div
            className="prog-b"
            style={{
              width: `${percent}%`,
              height: '100%',
              background: prog.status === 'Completed' ? 'linear-gradient(90deg, #10b981, #14b8a6)' : prog.status === 'Upcoming' ? '#64748b' : '#3b82f6',
              transition: 'width 0.4s ease-in-out',
            }}
          />
        </div>

        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
          <span>
            {prog.current} / {prog.target} targets
          </span>
          <strong>{percent}%</strong>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '16px', borderTop: '1px solid rgba(79, 142, 247, 0.2)', paddingTop: '12px', flexWrap: 'wrap' }}>
        {prog.status === 'Active' && (
          <>
            <button className="btn btn-p btn-sm" style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => nav('aid-encode')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              Encode
            </button>
            <button className="btn btn-g btn-sm" style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => nav('aid-logs')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M12 18v-6" />
                <path d="M9 15h6" />
              </svg>
              Logs
            </button>
            <button className="btn btn-a btn-sm" style={{ padding: '4px 8px', fontSize: '11px', background: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setEditingProgram(prog)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
            <button
              className="btn btn-sm"
              style={{ padding: '4px 8px', fontSize: '11px', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={() => {
                const updated = programsList.map((p) => (p.id === prog.id ? { ...p, status: 'Completed' } : p));
                setProgramsList(updated);
                alert(`Program campaign ${prog.title} has been successfully closed and marked as Completed.`);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="M22 4L12 14.01l-3-3" />
              </svg>
              Complete
            </button>
          </>
        )}

        <button
          className="btn btn-sm"
          style={{ padding: '4px 8px', fontSize: '11px', background: '#475569', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={async () => {
            const updated = programsList.map((p) => (p.id === prog.id ? { ...p, status: 'Archived' } : p));
            setProgramsList(updated);
            if (typeof createAuditLog === 'function') {
              await createAuditLog({
                action: 'ARCHIVE',
                module: 'PROGRAMS',
                recordId: prog.id,
                details: `Archived program: ${prog.title}`,
              });
            }
            alert(`Campaign historical logs archived successfully.`);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          Archive
        </button>

        {prog.status === 'Upcoming' && (
          <>
            <button
              className="btn btn-p btn-sm"
              style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={() => {
                const updated = programsList.map((p) => (p.id === prog.id ? { ...p, status: 'Active' } : p));
                setProgramsList(updated);
              }}
            >
              Activate
            </button>
            <button className="btn btn-a btn-sm" style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setEditingProgram(prog)}>
              Edit
            </button>
          </>
        )}

        {prog.status === 'Archived' && (
          <>
            <button className="btn btn-p btn-sm" style={{ padding: '4px 8px', fontSize: '11px', background: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setViewingProgram(prog)}>
              View
            </button>
            <button
              className="btn btn-g btn-sm"
              style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={() => {
                const updated = programsList.map((p) => (p.id === prog.id ? { ...p, status: 'Active' } : p));
                setProgramsList(updated);
              }}
            >
              Restore
            </button>
          </>
        )}
      </div>
    </div>
  );
})}
                      </select>
                      
                      {/* 🔄 GUMAGANANG STATUS FILTER DROPDOWN */}
                      <select 
                        className="fc" 
                        style={{ width: '130px' }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="All">All Status</option>
                        <option value="OK">Normal (OK)</option>
                        <option value="Synced">Offline Sync</option>
                        <option value="Duplicate">Duplicate</option>
                      </select>
                    </div>
                    
                    <table>
                      <thead>
                        <tr>
                          <th>Log #</th>
                          <th>Beneficiary</th>
                          <th>Program ID</th>
                          <th>Aid</th>
                          <th>Encoded By</th>
                          <th>Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogs.length === 0 ? (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                              Walang nahanap na tugmang transaksyon sa talaan.
                            </td>
                          </tr>
                        ) : (
                          filteredLogs.map((log) => (
                            <tr key={log.id}>
                              <td style={mono10}>{log.id}</td>
                              <td>{log.residentName}</td>
                              <td>{log.programId || 'N/A'}</td>
                              <td>{log.aid}</td>
                              <td>{log.officer}</td>
                              <td style={{ fontSize: '10px' }}>{log.time}</td>
                              <td>
                                <span className={`badge ${log.status === 'OK' ? 'g' : log.status === 'Synced' ? 't' : 'r'}`}>
                                  {log.status === 'Duplicate' ? '⚠ Duplicate' : log.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
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
                  <div className="fp-t"> Add Beneficiary List</div>
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
     
                  <div className="fg2" style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Quantity Field with Custom +/- Steppers */}
                    <div className="fg">
                      <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 11.25v8.75a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.75" />
                          <path d="M18 11l-3-3-3 3" />
                        </svg> 
                        Quantity <span style={{ color: '#ef4444' }}>*</span>
                      </label>

                      <div style={{ display: 'flex', alignItems: 'center', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
                        {/* Decrement (-) Button */}
                        <button
                          type="button"
                          onClick={() => setQuantity(prev => Math.max(1, (Number(prev) || 1) - 1))}
                          style={{
                            padding: '0 12px',
                            height: '38px',
                            background: '#1e293b',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'background 0.2s ease, color 0.2s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#f8fafc'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}
                        >
                          −
                        </button>

                        {/* Numerical Display Input */}
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          style={{
                            width: '100%',
                            textAlign: 'center',
                            background: 'transparent',
                            border: 'none',
                            color: '#f8fafc',
                            fontSize: '13px',
                            fontWeight: '600',
                            outline: 'none',
                            MozAppearance: 'textfield' // Tinatago ang browser spin buttons sa Firefox
                          }}
                        />

                        {/* Increment (+) Button */}
                        <button
                          type="button"
                          onClick={() => setQuantity(prev => (Number(prev) || 0) + 1)}
                          style={{
                            padding: '0 12px',
                            height: '38px',
                            background: '#1e293b',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'background 0.2s ease, color 0.2s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#f8fafc'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Integrated Add Button */}
                    <div className="fg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-p"
                        type="button"
                        onClick={addToList}
                        style={{
                          height: '38px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          borderRadius: '8px',
                          background: '#0284c7',
                          color: '#ffffff',
                          fontWeight: '600',
                          fontSize: '13px',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#0369a1')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#0284c7')}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Entry
                      </button>
                    </div>
                  </div>
                </div>
                <div className="tw">
                  <div className="tb"><strong> Beneficiary List</strong></div>
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
                  <button className="btn btn-p" onClick={saveAll}> Save All Beneficiaries</button>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: FILE BLOTTER ENTRY
             {/* ════════════════════════════════════════ */}
              {screen === 'blotter-new' && (
                <div className="screen active" style={{ position: 'relative' }}>
                  <div className="ph">
                    <div>
                      <div className="pt" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                        File Blotter Entry
                      </div>
                      <div className="ps">
                        Record a new community incident in the digital legal blotter engine
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-g"
                      onClick={() => nav('blotter-manage')}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5" />
                        <path d="M12 19l-7-7 7-7" />
                      </svg>
                      Back to Registry
                    </button>
                  </div>

                  {/* =============================================
                      🔐 SECTION 1: SYSTEM METADATA (Read-Only + Glass-Morphism)
                      ============================================= */}
                  <form onSubmit={handleCreateBlotterEntry}>
                    <div className="fp" style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      backdropFilter: 'blur(10px)',
                      borderLeft: '4px solid var(--accent)',
                      borderRadius: '8px',
                      marginBottom: '16px'
                    }}>
                      <div className="fp-t" style={{
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        System Metadata (Read-Only)
                      </div>
                      <div className="fg3" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px',
                        marginTop: '8px'
                      }}>
                        <div className="fg">
                          <label className="fl" style={{ color: '#94a3b8' }}>Blotter Tracking No.</label>
                          <input
                            className="fc"
                            style={{
                              background: '#1e293b',
                              color: '#60a5fa',
                              fontWeight: 'bold',
                              fontFamily: 'var(--mono)'
                            }}
                            readOnly
                            value={`BLT-2026-${String(blotterList.length + 125).padStart(5, '0')}`}
                          />
                        </div>
                        <div className="fg">
                          <label className="fl" style={{ color: '#94a3b8' }}>Officer Handling Case</label>
                          <input
                            className="fc"
                            style={{ background: '#1e293b', color: '#cbd5e1' }}
                            readOnly
                            value="Juhairo Macabangon"
                          />
                        </div>
                        <div className="fg">
                          <label className="fl" style={{ color: '#94a3b8' }}>Date Logged</label>
                          <input
                            className="fc"
                            style={{ background: '#1e293b', color: '#cbd5e1' }}
                            readOnly
                            value={new Date().toLocaleDateString('en-PH', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* =============================================
                      🚨 SECTION 2: INCIDENT CHARACTERISTICS (SVG Icons + Priority Badges)
                      ============================================= */}
                    <div className="fp" style={{
                      background: 'rgba(26, 29, 36, 0.4)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(79, 142, 247, 0.2)',
                      borderRadius: '8px',
                      marginBottom: '16px'
                    }}>
                      <div className="fp-t" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                        Incident Parameters & Priority
                      </div>

                      {/* Date, Time, Priority */}
                      <div className="fg3" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px'
                      }}>
                        <div className="fg">
                          <label className="fl">Date of Incident</label>
                          <input
                            className="fc"
                            type="date"
                            required
                            value={blotterForm.date}
                            onChange={(e) => setBlotterForm({...blotterForm, date: e.target.value})}
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">Time Matrix</label>
                          <input
                            className="fc"
                            type="time"
                            required
                            value={blotterForm.time}
                            onChange={(e) => setBlotterForm({...blotterForm, time: e.target.value})}
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">Case Priority Rank</label>
                          <select
                            className="fc"
                            value={blotterForm.priority}
                            onChange={(e) => setBlotterForm({...blotterForm, priority: e.target.value})}
                          >
                            <option value="Low">
                              <span style={{ color: '#10b981' }}>●</span> Low Priority
                            </option>
                            <option value="Medium">
                              <span style={{ color: '#fbbf24' }}>●</span> Medium Priority
                            </option>
                            <option value="High">
                              <span style={{ color: '#f87171' }}>●</span> High Priority
                            </option>
                          </select>
                        </div>
                      </div>

                      {/* Incident Type & Location */}
                      <div className="fg2" style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        marginTop: '12px'
                      }}>
                        <div className="fg">
                          <label className="fl">Incident Type Classification</label>
                          <select
                            className="fc"
                            value={blotterForm.type}
                            onChange={(e) => setBlotterForm({...blotterForm, type: e.target.value})}
                          >
                            <option value="Noise Complaint">Noise Complaint</option>
                            <option value="Physical Altercation">Physical Altercation</option>
                            <option value="Domestic Violence">Domestic Violence</option>
                            <option value="Theft">Theft</option>
                            <option value="Trespassing">Trespassing</option>
                            <option value="Property Dispute">Property Dispute</option>
                            <option value="Harassment">Harassment</option>
                            <option value="Threat">Threat</option>
                            <option value="Vandalism">Vandalism</option>
                            <option value="Others">Others</option>
                          </select>
                        </div>
                        <div className="fg">
                          <label className="fl">Exact Location Address</label>
                          <input
                            className="fc"
                            required
                            placeholder="e.g. Purok 5, near the public plaza"
                            value={blotterForm.location}
                            onChange={(e) => setBlotterForm({...blotterForm, location: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    {/* =============================================
                      👥 SECTION 3: PARTIES INVOLVED (SVG Icons + Intelligent Search)
                      ============================================= */}
                    <div className="fp" style={{
                      background: 'rgba(26, 29, 36, 0.4)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(79, 142, 247, 0.2)',
                      borderRadius: '8px',
                      marginBottom: '16px'
                    }}>
                      <div className="fp-t" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        Legal Parties Involved
                      </div>

                      <div className="fg2" style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '20px'
                      }}>
                        {/* COMPLAINANT */}
                        <div className="fg" style={{ position: 'relative' }}>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '4px'
                          }}>
                            <label className="fl" style={{ margin: 0 }}>Complainant (Nagrereklamo)</label>
                            <label style={{
                              fontSize: '11px',
                              color: '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer'
                            }}>
                              <input
                                type="checkbox"
                                checked={blotterForm.isComplainantNonResident}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setBlotterForm({
                                    ...blotterForm,
                                    isComplainantNonResident: checked,
                                    complainant: ''
                                  });
                                  setComplainantQuery('');
                                }}
                              />
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                              </svg>
                              Non-resident
                            </label>
                          </div>

                          {blotterForm.isComplainantNonResident ? (
                            <input
                              className="fc"
                              required
                              placeholder="Enter full name of non-resident complainant"
                              value={blotterForm.complainant}
                              onChange={(e) => setBlotterForm({...blotterForm, complainant: e.target.value})}
                            />
                          ) : (
                            <>
                              <div style={{ position: 'relative' }}>
                                <div className="sb-box">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="M21 21l-4.35-4.35" />
                                  </svg>
                                  <input
                                    className="fc"
                                    placeholder="Search resident name from database..."
                                    value={complainantQuery}
                                    onChange={(e) => {
                                      setComplainantQuery(e.target.value);
                                      setShowComplainantDropdown(true);
                                    }}
                                    onFocus={() => setShowComplainantDropdown(true)}
                                    style={{ width: '100%' }}
                                  />
                                </div>
                                {blotterForm.complainant && (
                                  <div style={{
                                    fontSize: '11px',
                                    color: '#10b981',
                                    marginTop: '2px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    </svg>
                                    Linked Profile: <strong>{blotterForm.complainant}</strong>
                                  </div>
                                )}
                              </div>

                              {showComplainantDropdown && complainantQuery && (
                                <div style={{
                                  position: 'absolute',
                                  top: '64px',
                                  left: 0,
                                  width: '100%',
                                  background: '#1e293b',
                                  border: '1px solid #334155',
                                  borderRadius: '4px',
                                  zIndex: 10,
                                  maxHeight: '150px',
                                  overflowY: 'auto',
                                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                                }}>
                                  {residentsRegistry
                                    .filter(r => r.name.toLowerCase().includes(complainantQuery.toLowerCase()))
                                    .map(res => (
                                      <div
                                        key={res.id}
                                        style={{
                                          padding: '8px 12px',
                                          color: 'white',
                                          cursor: 'pointer',
                                          borderBottom: '1px solid #334155',
                                          fontSize: '12px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          transition: 'background 0.2s ease'
                                        }}
                                        onClick={() => {
                                          setBlotterForm({...blotterForm, complainant: res.name});
                                          setComplainantQuery(res.name);
                                          setShowComplainantDropdown(false);
                                        }}
                                        onMouseEnter={(e) => (e.target.style.background = 'rgba(79, 142, 247, 0.1)')}
                                        onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                          <circle cx="9" cy="7" r="4" />
                                        </svg>
                                        {res.name} ({res.purok}) —
                                        <span style={{ color: '#64748b', fontSize: '10px' }}>{res.id}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* RESPONDENT */}
                        <div className="fg" style={{ position: 'relative' }}>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '4px'
                          }}>
                            <label className="fl" style={{ margin: 0 }}>Respondent (Inirereklamo)</label>
                            <label style={{
                              fontSize: '11px',
                              color: '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer'
                            }}>
                              <input
                                type="checkbox"
                                checked={blotterForm.isRespondentNonResident}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setBlotterForm({
                                    ...blotterForm,
                                    isRespondentNonResident: checked,
                                    respondent: ''
                                  });
                                  setRespondentQuery('');
                                }}
                              />
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                              </svg>
                              Non-resident
                            </label>
                          </div>

                          {blotterForm.isRespondentNonResident ? (
                            <input
                              className="fc"
                              required
                              placeholder="Enter full name of non-resident respondent"
                              value={blotterForm.respondent}
                              onChange={(e) => setBlotterForm({...blotterForm, respondent: e.target.value})}
                            />
                          ) : (
                            <>
                              <div style={{ position: 'relative' }}>
                                <div className="sb-box">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="M21 21l-4.35-4.35" />
                                  </svg>
                                  <input
                                    className="fc"
                                    placeholder="Search resident name from database..."
                                    value={respondentQuery}
                                    onChange={(e) => {
                                      setRespondentQuery(e.target.value);
                                      setShowRespondentDropdown(true);
                                    }}
                                    onFocus={() => setShowRespondentDropdown(true)}
                                    style={{ width: '100%' }}
                                  />
                                </div>
                                {blotterForm.respondent && (
                                  <div style={{
                                    fontSize: '11px',
                                    color: '#10b981',
                                    marginTop: '2px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    </svg>
                                    Linked Profile: <strong>{blotterForm.respondent}</strong>
                                  </div>
                                )}
                              </div>

                              {showRespondentDropdown && respondentQuery && (
                                <div style={{
                                  position: 'absolute',
                                  top: '64px',
                                  left: 0,
                                  width: '100%',
                                  background: '#1e293b',
                                  border: '1px solid #334155',
                                  borderRadius: '4px',
                                  zIndex: 10,
                                  maxHeight: '150px',
                                  overflowY: 'auto',
                                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                                }}>
                                  {residentsRegistry
                                    .filter(r => r.name.toLowerCase().includes(respondentQuery.toLowerCase()))
                                    .map(res => (
                                      <div
                                        key={res.id}
                                        style={{
                                          padding: '8px 12px',
                                          color: 'white',
                                          cursor: 'pointer',
                                          borderBottom: '1px solid #334155',
                                          fontSize: '12px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          transition: 'background 0.2s ease'
                                        }}
                                        onClick={() => {
                                          setBlotterForm({...blotterForm, respondent: res.name});
                                          setRespondentQuery(res.name);
                                          setShowRespondentDropdown(false);
                                        }}
                                        onMouseEnter={(e) => (e.target.style.background = 'rgba(79, 142, 247, 0.1)')}
                                        onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                          <circle cx="9" cy="7" r="4" />
                                        </svg>
                                        {res.name} ({res.purok}) —
                                        <span style={{ color: '#64748b', fontSize: '10px' }}>{res.id}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* WITNESSES */}
                      <div className="fg" style={{ marginTop: '12px' }}>
                        <label className="fl">Witnesses Block (Optional)</label>
                        <input
                          className="fc"
                          placeholder="Comma-separated names (e.g. Pedro Oliver, Maria Santos)"
                          value={blotterForm.witnesses}
                          onChange={(e) => setBlotterForm({...blotterForm, witnesses: e.target.value})}
                        />
                      </div>
                    </div>

                    {/* =============================================
                      📜 SECTION 4: CASE NARRATIVE & RESOLUTION (SVG Icons + Glass-Morphism)
                      ============================================= */}
                    <div className="fp" style={{
                      background: 'rgba(26, 29, 36, 0.4)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(79, 142, 247, 0.2)',
                      borderRadius: '8px',
                      marginBottom: '16px'
                    }}>
                      <div className="fp-t" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                          <path d="M12 18v-6" />
                          <path d="M9 15h6" />
                        </svg>
                        Narrative & Executive Barangay Action
                      </div>

                      <div className="fg">
                        <label className="fl">Incident Narrative Report Statement</label>
                        <textarea
                          className="fc"
                          required
                          style={{ minHeight: '100px' }}
                          placeholder="Provide a detailed chronological presentation statement of the incident..."
                          value={blotterForm.narrative}
                          onChange={(e) => setBlotterForm({...blotterForm, narrative: e.target.value})}
                        />
                      </div>

                      <div className="fg2" style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        marginTop: '12px'
                      }}>
                        <div className="fg">
                          <label className="fl">Barangay Formal Action Taken</label>
                          <select
                            className="fc"
                            value={blotterForm.actionTaken}
                            onChange={(e) => setBlotterForm({...blotterForm, actionTaken: e.target.value})}
                          >
                            <option value="Summoned Parties">Summoned Parties</option>
                            <option value="Conducted Mediation">Conducted Mediation</option>
                            <option value="Issued Certification">Issued Certification to File Action</option>
                            <option value="Referred to PNP">Referred to PNP Authorities</option>
                            <option value="Referred to Lupon">Referred to Lupon Tagapamayapa</option>
                            <option value="Others">Others</option>
                          </select>
                        </div>
                        <div className="fg">
                          <label className="fl">Active Case Management Status</label>
                          <select
                            className="fc"
                            value={blotterForm.status}
                            onChange={(e) => setBlotterForm({...blotterForm, status: e.target.value})}
                          >
                            <option value="Open">Open (Pending Mediation)</option>
                            <option value="Under Mediation">Under Mediation Process</option>
                            <option value="Resolved">Resolved & Closed Case</option>
                            <option value="Referred to Higher Authority">Referred to Higher Authority</option>
                          </select>
                        </div>
                      </div>

                      {/* NEXT MEDIATION HEARING (Conditional) */}
                      {(blotterForm.status === 'Open' || blotterForm.status === 'Under Mediation') && (
                        <div className="fg" style={{
                          marginTop: '12px',
                          background: '#1e293b',
                          padding: '12px',
                          borderRadius: '6px',
                          borderLeft: '3px solid var(--amber)'
                        }}>
                          <label className="fl" style={{
                            color: 'var(--amber)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2v4" />
                              <path d="M12 18v4" />
                              <path d="M4.93 4.93l2.83 2.83" />
                              <path d="M16.24 16.24l2.83 2.83" />
                              <path d="M2 12h2" />
                              <path d="M20 12h2" />
                              <path d="M4.93 19.07l2.83-2.83" />
                              <path d="M16.24 7.76l2.83-2.83" />
                            </svg>
                            Scheduled Next Mediation Hearing Date
                          </label>
                          <input
                            className="fc"
                            type="date"
                            value={blotterForm.nextHearingDate}
                            onChange={(e) => setBlotterForm({...blotterForm, nextHearingDate: e.target.value})}
                          />
                        </div>
                      )}

                      {/* EVIDENCE ATTACHMENTS (Disabled) */}
                      <div className="fg" style={{ marginTop: '12px' }}>
                        <label className="fl" style={{
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <path d="M7 10l5 5 5-5" />
                            <path d="M12 15v-6" />
                          </svg>
                          Evidence Attachments (Future Enhancement)
                        </label>
                        <div style={{ display: 'flex', gap: '8px', opacity: 0.6 }}>
                          <button
                            type="button"
                            disabled
                            className="btn btn-g btn-sm"
                            style={{
                              cursor: 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <circle cx="12" cy="12" r="4" />
                            </svg>
                            Upload Photo
                          </button>
                          <button
                            type="button"
                            disabled
                            className="btn btn-g btn-sm"
                            style={{
                              cursor: 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                              <path d="M12 18v-6" />
                              <path d="M9 15h6" />
                            </svg>
                            Upload PDF
                          </button>
                          <button
                            type="button"
                            disabled
                            className="btn btn-g btn-sm"
                            style={{
                              cursor: 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <path d="M12 5v14" />
                            </svg>
                            Upload Video
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="fa" style={{
                      display: 'flex',
                      gap: '10px',
                      marginTop: '20px',
                      borderTop: '1px solid #334155',
                      paddingTop: '16px'
                    }}>
                      <button
                        type="submit"
                        className="btn btn-p"
                        style={{
                          flex: 2,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'center'
                        }}
                      >
                        Save Blotter Case Record
                      </button>

                      <button
                        type="button"
                        className="btn btn-a"
                        style={{
                          background: '#475569',
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'center'
                        }}
                        onClick={handleClearBlotterForm}
                      >
                        Clear Form
                      </button>

                      <button
                        type="button"
                        className="btn btn-g"
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'center'
                        }}
                        onClick={() => nav('blotter-manage')}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                  {showSuccessModal && (
                    <div style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      background: 'rgba(0,0,0,0.85)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 99999
                    }}>
                      <div style={{
                        background: '#1e293b',
                        border: '1px solid #10b981',
                        padding: '30px',
                        borderRadius: '12px',
                        width: '90%',
                        maxWidth: '420px',
                        textAlign: 'center',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(10px)'
                      }}>
                        <div style={{
                          fontSize: '42px',
                          marginBottom: '12px',
                          color: '#10b981'
                        }}>
                          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <path d="M22 4L12 14.01l-3-3" />
                          </svg>
                        </div>

                        <div style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: '#f8fafc',
                          marginBottom: '4px'
                        }}>
                          Blotter Successfully Recorded
                        </div>

                        <div style={{
                          fontSize: '13px',
                          color: '#60a5fa',
                          fontFamily: 'var(--mono)',
                          marginBottom: '16px',
                          fontWeight: 'bold'
                        }}>
                          {recentlyFiledId}
                        </div>

                        <div style={{
                          fontSize: '12px',
                          color: '#94a3b8',
                          marginBottom: '24px'
                        }}>
                          The formal incident report context has been cataloged into Nabua’s local database schema registry successfully.
                        </div>

                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}>
                          <button
                            className="btn btn-p"
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              justifyContent: 'center'
                            }}
                            onClick={() => {
                              setShowSuccessModal(false);
                              nav('blotter-manage');
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                              <path d="M12 18v-6" />
                              <path d="M9 15h6" />
                            </svg>
                            View Case File Logs
                          </button>

                          <button
                            className="btn btn-g"
                            style={{
                              width: '100%',
                              background: '#10b981',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              justifyContent: 'center'
                            }}
                            onClick={() => {
                              setShowSuccessModal(false);
                              handleClearBlotterForm();
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            File New Blotter Entry
                          </button>

                          <button
                            className="btn btn-a"
                            style={{
                              width: '100%',
                              background: '#334155',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              justifyContent: 'center'
                            }}
                            onClick={() => {
                              setShowSuccessModal(false);
                              nav('blotter-manage');
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 12H5" />
                              <path d="M12 19l-7-7 7-7" />
                            </svg>
                            Back to Manage Board
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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
        <div className="ps">Manage filed barangay cases dynamically</div>
      </div>
      <button className="btn btn-p" onClick={() => nav('blotter-new')}>＋ File Blotter</button>
    </div>
    
    <div className="tw">
      {/* ── SEARCH & FILTER CONTROLS ── */}
      <div className="tb">
        <div className="sb-box">
          <span>🔍</span>
          <input 
            placeholder="Search case #, name..." 
            value={blotterSearch}
            onChange={(e) => setBlotterSearch(e.target.value)}
          />
        </div>
        <select className="fc" style={{ width: '150px' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="All Types">All Types</option>
          <option value="Noise Complaint">Noise Complaint</option>
          <option value="Physical Altercation">Physical Altercation</option>
          <option value="Property Dispute">Property Dispute</option>
          <option value="Domestic Concern">Domestic Concern</option>
          <option value="Theft">Theft</option>
          <option value="Other">Other</option>
        </select>
        <select className="fc" style={{ width: '140px' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="All Status">All Status</option>
          <option value="Open">Open</option>
          <option value="Under Mediation">Under Mediation</option>
          <option value="Resolved">Resolved</option>
          <option value="Referred to Higher Authority">Referred</option>
        </select>
      </div>

      {/* ── MAIN LEDGER TABLE ── */}
      <table>
        <thead>
          <tr>
            <th>Case #</th><th>Type</th><th>Complainant</th><th>Respondent</th>
            <th>Location</th><th>Date</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredBlotters.length === 0 ? (
            <tr>
              <td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                Walang nahanap na tugmang record sa blotter log data storage.
              </td>
            </tr>
          ) : (
            filteredBlotters.map((b) => (
              <tr key={b.id}>
                <td style={mono10}>{b.id}</td>
                <td>{b.type}</td>
                <td><strong>{b.complainant}</strong></td>
                <td>{b.respondent}</td>
                <td>{b.location}</td>
                <td style={{ fontSize: '11px' }}>{b.date}</td>
                <td>
                  <span className={`badge ${b.status === 'Open' ? 'r' : b.status === 'Resolved' ? 'g' : 'a'}`}>
                    {b.status}
                  </span>
                </td>
                <td>
                  <button 
                    className="btn btn-g btn-sm" 
                    onClick={() => {
                      setSelectedBlotterId(b.id);
                      nav('blotter-detail');
                    }}
                  >
                    View
                  </button>
                  {' '}
                  <button className="btn btn-g btn-sm" onClick={() => window.print()}>Print</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
)}

            {/* ════════════════════════════════════════
                SCREEN: BLOTTER DETAIL (DYNAMIC LOGIC ROUTE)
                ════════════════════════════════════════ */}
                {screen === 'blotter-detail' && (
                  <div className="screen active">
                    
                    {/* SCREEN HEADER SPECIFICATIONS */}
                    <div className="ph">
                      <div>
                        <div className="pt">
                          {role === 'admin' ? '🏛️ Administrative Review' : '📋 Staff Complaint Management'} — {selectedBlotterId}
                        </div>
                        <div className="ps">Blotter Module · Dynamic Case Audit Trail View</div>
                      </div>
                      <button className="btn btn-g" onClick={() => nav('blotter-manage')}>← Back to List</button>
                    </div>

                    {/* TWO-COLUMN LAYOUT INTERFACE */}
                    <div className="tc" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr', gap: '20px' }}>
                      
                      {/* ================= LEFT COLUMN ================= */}
                      <div>
                        {/* CASE SPECIFIC CARD */}
                        <div className="fp">
                          <div className="fp-t">📋 Case Information</div>
                          <div className="fg2">
                            <div>
                              <label className="fl">Case Number</label>
                              <input className="fc" value={selectedBlotterId || ''} disabled readOnly style={{ background: '#0f172a', color: 'var(--muted)' }} />
                            </div>
                            <div>
                              <label className="fl">Current Case Status</label>
                              <select 
                                className="fc" 
                                value={role === 'admin' ? (complaint?.caseStatus || 'Open') : (staffCase?.status || 'Open')} 
                                onChange={(e) => role === 'admin' ? updateComplaintField('caseStatus', e.target.value) : updateCase('status', e.target.value)}
                              >
                                <option value="Open">Open</option>
                                <option value="Under Mediation">Under Mediation</option>
                                <option value="Resolved">Resolved</option>
                                <option value="Referred to Higher Authority">Referred</option>
                              </select>
                            </div>
                          </div>
                          <div className="fg2">
                            <div>
                              <label className="fl">Date Filed</label>
                              <input className="fc" type="date" value={role === 'admin' ? (complaint?.dateFiled || '') : (staffCase?.dateFiled || '')} onChange={(e) => role === 'admin' ? updateComplaintField('dateFiled', e.target.value) : updateCase('dateFiled', e.target.value)} />
                            </div>
                            <div>
                              <label className="fl">Time</label>
                              <input className="fc" type="time" value={role === 'admin' ? (complaint?.timeFiled || '') : (staffCase?.timeFiled || '')} onChange={(e) => role === 'admin' ? updateComplaintField('timeFiled', e.target.value) : updateCase('timeFiled', e.target.value)} />
                            </div>
                          </div>
                          <div className="fg">
                            <label className="fl">Incident Type Classification</label>
                            <select className="fc" value={role === 'admin' ? (complaint?.incidentType || 'Noise Complaint') : (staffCase?.incidentType || 'Noise Complaint')} onChange={(e) => role === 'admin' ? updateComplaintField('incidentType', e.target.value) : updateCase('incidentType', e.target.value)}>
                              <option value="Noise Complaint">Noise Complaint</option>
                              <option value="Physical Altercation">Physical Altercation</option>
                              <option value="Property Dispute">Property Dispute</option>
                              <option value="Domestic Concern">Domestic Concern</option>
                              <option value="Theft">Theft</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="fg">
                            <label className="fl">Location of Incident</label>
                            <input className="fc" value={role === 'admin' ? (complaint?.location || '') : (staffCase?.location || '')} onChange={(e) => role === 'admin' ? updateComplaintField('location', e.target.value) : updateCase('location', e.target.value)} />
                          </div>
                        </div>

                        {/* COMPLAINANT METADATA */}
                        <div className="fp">
                          <div className="fp-t">👤 Complainant Information (Nagrereklamo)</div>
                          <div className="fg">
                            <label className="fl">Full Name</label>
                            <input className="fc" value={role === 'admin' ? (complaint?.compName || '') : (staffCase?.compName || '')} onChange={(e) => role === 'admin' ? updateComplaintField('compName', e.target.value) : updateCase('compName', e.target.value)} />
                          </div>
                          <div className="fg2">
                            <div>
                              <label className="fl">Resident System ID</label>
                              <input className="fc" value={role === 'admin' ? (complaint?.compID || 'RES-XXXX') : (staffCase?.compID || 'RES-XXXX')} disabled readOnly style={{ background: '#0f172a', color: 'var(--muted)' }} />
                            </div>
                            <div>
                              <label className="fl">Verification Status</label>
                              <input className="fc" value="Registered Resident" disabled readOnly style={{ background: '#0f172a', color: 'var(--muted)' }} />
                            </div>
                          </div>
                          <div className="fg2">
                            <div>
                              <label className="fl">Contact Number</label>
                              <input className="fc" value={role === 'admin' ? (complaint?.compContact || '') : (staffCase?.compContact || '')} onChange={(e) => role === 'admin' ? updateComplaintField('compContact', e.target.value) : updateCase('compContact', e.target.value)} />
                            </div>
                            <div>
                              <label className="fl">Purok Area</label>
                              <select className="fc" value={role === 'admin' ? (complaint?.compPurok || 'Purok 1') : (staffCase?.compPurok || 'Purok 1')} onChange={(e) => role === 'admin' ? updateComplaintField('compPurok', e.target.value) : updateCase('compPurok', e.target.value)}>
                                <option value="Purok 1">Purok 1</option>
                                <option value="Purok 2">Purok 2</option>
                                <option value="Purok 3">Purok 3</option>
                                <option value="Purok 4">Purok 4</option>
                                <option value="Purok 5">Purok 5</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* INCIDENT NARRATIVE TEXTAREAS */}
                        <div className="fp">
                          <div className="fp-t">📝 Incident Narrative Records</div>
                          <div className="fg">
                            <label className="fl">Official Narrative Statement</label>
                            <textarea className="fc" style={{ minHeight: '100px' }} value={role === 'admin' ? (complaint?.narrative || '') : (staffCase?.narrative || '')} onChange={(e) => role === 'admin' ? updateComplaintField('narrative', e.target.value) : updateCase('narrative', e.target.value)} />
                          </div>
                          <div className="fg">
                            <label className="fl">Action & Status Operational Notes</label>
                            <textarea className="fc" style={{ minHeight: '80px' }} value={role === 'admin' ? (complaint?.statusNotes || '') : (staffCase?.statusNotes || '')} onChange={(e) => role === 'admin' ? updateComplaintField('statusNotes', e.target.value) : updateCase('statusNotes', e.target.value)} />
                          </div>
                        </div>
                      </div>

                      {/* ================= RIGHT COLUMN ================= */}
                      <div>
                        {/* RESPONDENT DATA */}
                        <div className="fp">
                          <div className="fp-t">⚠️ Respondent Information (Inirereklamo)</div>
                          <div className="fg">
                            <label className="fl">Full Name</label>
                            <input className="fc" value={role === 'admin' ? (complaint?.respName || '') : (staffCase?.respName || '')} onChange={(e) => role === 'admin' ? updateComplaintField('respName', e.target.value) : updateCase('respName', e.target.value)} />
                          </div>
                          <div className="fg2">
                            <div>
                              <label className="fl">Resident ID Link</label>
                              <input className="fc" value={role === 'admin' ? (complaint?.respID || 'RES-YYYY') : (staffCase?.respID || 'RES-YYYY')} disabled readOnly style={{ background: '#0f172a', color: 'var(--muted)' }} />
                            </div>
                            <div>
                              <label className="fl">Status Profile</label>
                              <input className="fc" value="Registered Resident" disabled readOnly style={{ background: '#0f172a', color: 'var(--muted)' }} />
                            </div>
                          </div>
                          <div className="fg">
                            <label className="fl">Contact Number (SMS Dispatcher Link)</label>
                            <input className="fc" value={role === 'admin' ? (complaint?.respContact || '') : (staffCase?.respContact || '')} onChange={(e) => role === 'admin' ? updateComplaintField('respContact', e.target.value) : updateCase('respContact', e.target.value)} />
                          </div>
                          <div className="fg">
                            <label className="fl">Email Address</label>
                            <input className="fc" type="email" value={role === 'admin' ? (complaint?.respEmail || '') : (staffCase?.respEmail || '')} onChange={(e) => role === 'admin' ? updateComplaintField('respEmail', e.target.value) : updateCase('respEmail', e.target.value)} />
                          </div>
                          <div className="fg">
                            <label className="fl">Residential Address</label>
                            <input className="fc" value={role === 'admin' ? (complaint?.respAddress || '') : (staffCase?.respAddress || '')} onChange={(e) => role === 'admin' ? updateComplaintField('respAddress', e.target.value) : updateCase('respAddress', e.target.value)} />
                          </div>
                        </div>

                        {/* DISPATCH SUMMONS ENGINE */}
                        <div className="fp" style={{ borderLeft: '4px solid var(--accent)' }}>
                          <div className="fp-t">📨 Send Official Summons / Notification</div>
                          <div className="note note-i" style={{ marginBottom: '12px', fontSize: '12px' }}>
                            Magpadala ng automated real-time SMS at Email notification sa respondent para sa gagawing paghaharap sa barangay hall.
                          </div>
                          <div className="fg2">
                            <div>
                              <label className="fl">Scheduled Appearance Date</label>
                              <input className="fc" type="date" value={role === 'admin' ? (complaint?.summonDate || '') : (staffCase?.summonDate || '')} onChange={(e) => role === 'admin' ? updateComplaintField('summonDate', e.target.value) : updateCase('summonDate', e.target.value)} />
                            </div>
                            <div>
                              <label className="fl">Scheduled Time</label>
                              <input className="fc" type="time" value={role === 'admin' ? (complaint?.summonTime || '') : (staffCase?.summonTime || '')} onChange={(e) => role === 'admin' ? updateComplaintField('summonTime', e.target.value) : updateCase('summonTime', e.target.value)} />
                            </div>
                          </div>
                          <div className="fg">
                            <label className="fl">Custom Message dispatch block</label>
                            <textarea className="fc" style={{ minHeight: '80px' }} value={role === 'admin' ? (complaint?.summonMsg || '') : (staffCase?.summonMsg || '')} onChange={(e) => role === 'admin' ? updateComplaintField('summonMsg', e.target.value) : updateCase('summonMsg', e.target.value)} />
                          </div>
                          
                          <div className="fa" style={{ flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                            <button 
                              type="button"
                              className="btn btn-p" 
                              style={{ width: '100%', justifyContent: 'center' }} 
                              onClick={sendSummons}
                          >
                              🔔 Send Summons Now
                            </button>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* SYSTEM UTILITIES CONTROL FOOTER BUTTONS */}
                    <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                      <button className="btn btn-s" onClick={() => {
                        alert(" Success: Case configuration updates successfully saved to client core registry.");
                        nav('blotter-manage');
                      }}>
                         Save Changes
                      </button>
                      <button className="btn btn-g" onClick={() => nav('blotter-manage')}>Cancel Updates</button>
                      <button className="btn btn-a" style={{ marginLeft: 'auto' }} onClick={() => alert("📆 Scheduling Mediation: Hearing date posted to operational calendar.")}>
                         Schedule Mediation
                      </button>
                      <button className="btn btn-g" onClick={() => nav('blotter-manage')}>Close View</button>
                    </div>

                  </div>
                )}
            
            {/* ════════════════════════════════════════
                SCREEN: ANNOUNCEMENTS
                {/* ════════════════════════════════════════ */}
                {screen === 'announcements' && (
                  <div className="screen active">
                    {announcementSubScreen === 'list' && (
                      <div>
                        {/* TOP LEVEL CONTROLLER BAR */}
                        <div className="ph">
                          <div>
                            <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                              </svg>
                              Announcements Engine
                            </div>
                            <div className="ps">Post, monitor, and configure active community bulletin broadcasts</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-p"
                            onClick={() => {
                              setAnnouncementForm({ title: '', category: 'General', content: '', pinned: false, status: 'Published' });
                              setAnnouncementSubScreen('new');
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            New Announcement
                          </button>
                        </div>

                        {/* SEARCH AND FILTER CONTROLS (SVG Icons + Glass-Morphism) */}
                        <div className="fp" style={{
                          background: 'rgba(15, 23, 42, 0.6)',
                          backdropFilter: 'blur(10px)',
                          border: '1px solid rgba(79, 142, 247, 0.2)',
                          marginBottom: '16px',
                          padding: '16px',
                          borderRadius: '8px'
                        }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                            {/* Search Input */}
                            <div className="fg" style={{ margin: 0 }}>
                              <label className="fl" style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                Search Bulletins
                              </label>
                              <input
                                className="fc"
                                placeholder="Search announcement title or content details..."
                                value={searchAnnQuery}
                                onChange={(e) => setSearchAnnQuery(e.target.value)}
                              />
                            </div>

                            {/* Category Filter */}
                            <div className="fg" style={{ margin: 0 }}>
                              <label className="fl" style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                Category Filter
                              </label>
                              <select
                                className="fc"
                                value={filterAnnCategory}
                                onChange={(e) => setFilterAnnCategory(e.target.value)}
                              >
                                <option value="All">All Categories</option>
                                <option value="General">General</option>
                                <option value="Health">Health</option>
                                <option value="Security">Security</option>
                                <option value="Events">Events</option>
                                <option value="Governance">Governance</option>
                              </select>
                            </div>

                            {/* Status Filter */}
                            <div className="fg" style={{ margin: 0 }}>
                              <label className="fl" style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                Workflow Status
                              </label>
                              <select
                                className="fc"
                                value={filterAnnStatus}
                                onChange={(e) => setFilterAnnStatus(e.target.value)}
                              >
                                <option value="All">All Statuses</option>
                                <option value="Published">Published</option>
                                <option value="Draft">Drafts</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* MAIN DATA RENDERING GRID */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {announcementsList
                            // Sorting: Pinned first
                            .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
                            // Filtering
                            .filter(ann => {
                              const matchQuery = ann.title.toLowerCase().includes(searchAnnQuery.toLowerCase()) ||
                                                ann.content.toLowerCase().includes(searchAnnQuery.toLowerCase());
                              const matchCat = filterAnnCategory === 'All' || ann.category === filterAnnCategory;
                              const matchStatus = filterAnnStatus === 'All' || ann.status === filterAnnStatus;
                              return matchQuery && matchCat && matchStatus;
                            })
                            .map(ann => (
                              <div
                                key={ann.id}
                                className={`ann ${ann.pinned ? 'pinned' : ''}`}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  background: '#1e293b',
                                  padding: '16px',
                                  borderRadius: '8px',
                                  borderLeft: ann.pinned ? '4px solid #f59e0b' : '4px solid #475569',
                                  transition: 'all 0.3s ease'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = '#252f3f')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = '#1e293b')}
                              >
                                <div style={{ flex: 1, paddingRight: '20px' }}>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: '4px'
                                  }}>
                                    <span
                                      className="ann-cat"
                                      style={{
                                        color: ann.category === 'Health' ? '#f59e0b' :
                                              ann.category === 'Security' ? '#ef4444' :
                                              ann.category === 'Events' ? '#8b5cf6' :
                                              ann.category === 'Governance' ? '#3b82f6' : '#64748b',
                                        fontWeight: 'bold',
                                        fontSize: '11px',
                                        textTransform: 'uppercase'
                                      }}
                                    >
                                      {ann.pinned && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                        </svg>
                                      )}
                                      {ann.category}
                                    </span>

                                    <span style={{
                                      fontSize: '10px',
                                      background: ann.status === 'Published' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                                      color: ann.status === 'Published' ? '#34d399' : '#fbbf24',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: '600'
                                    }}>
                                      {ann.status}
                                    </span>
                                  </div>

                                  <div className="ann-t" style={{
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    color: '#f8fafc',
                                    marginBottom: '6px'
                                  }}>
                                    {ann.title}
                                  </div>

                                  <div className="ann-b" style={{
                                    fontSize: '13px',
                                    color: '#cbd5e1',
                                    lineHeight: '1.5',
                                    marginBottom: '8px'
                                  }}>
                                    {ann.content}
                                  </div>

                                  <div className="ann-f" style={{
                                    fontSize: '11px',
                                    color: '#94a3b8',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                      <circle cx="9" cy="7" r="4" />
                                    </svg>
                                    Posted by {ann.author} · {ann.date}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    className="btn btn-g btn-sm"
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      background: ann.pinned ? '#78350f' : '#334155',
                                      color: ann.pinned ? '#fbbf24' : '#60a5fa'
                                    }}
                                    onClick={() => handleTogglePinAnnouncement(ann.id)}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                    </svg>
                                    {ann.pinned ? 'Unpin' : 'Pin'}
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-g btn-sm"
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      background: '#334155',
                                      color: '#60a5fa'
                                    }}
                                    onClick={() => handleOpenEditAnnouncement(ann)}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-g btn-sm"
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      background: '#7f1d1d',
                                      color: '#fca5a5'
                                    }}
                                    onClick={() => handleTriggerDeleteAnnouncement(ann.id)}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M3 6h18" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}

                          {/* EMPTY STATE */}
                          {announcementsList.filter(ann => {
                            const matchQuery = ann.title.toLowerCase().includes(searchAnnQuery.toLowerCase()) ||
                                              ann.content.toLowerCase().includes(searchAnnQuery.toLowerCase());
                            const matchCat = filterAnnCategory === 'All' || ann.category === filterAnnCategory;
                            const matchStatus = filterAnnStatus === 'All' || ann.status === filterAnnStatus;
                            return matchQuery && matchCat && matchStatus;
                          }).length === 0 && (
                            <div style={{
                              textAlign: 'center',
                              padding: '40px',
                              color: '#94a3b8',
                              background: '#0f172a',
                              borderRadius: '8px',
                              border: '1px dashed #334155',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '12px'
                            }}>
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                              </svg>
                              No records found matching the active filtering options.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* =============================================
                        📝 VIEW 2 & 3: ANNOUNCEMENT FORM (CREATE & EDIT)
                        ============================================= */}
                    {(announcementSubScreen === 'new' || announcementSubScreen === 'edit') && (
                      <div className="fp" style={{
                        maxWidth: '700px',
                        margin: '0 auto',
                        background: 'rgba(26, 29, 36, 0.4)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(79, 142, 247, 0.2)',
                        borderRadius: '8px'
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '16px',
                          borderBottom: '1px solid #334155',
                          paddingBottom: '12px'
                        }}>
                          <div>
                            <div className="fp-t" style={{
                              fontSize: '18px',
                              margin: 0,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              {announcementSubScreen === 'new' ? (
                                <>
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                  </svg>
                                  Create New Barangay Announcement
                                </>
                              ) : (
                                <>
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                  Modify Existing Announcement
                                </>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                              Distribute critical legal updates and bulletins to Nabua residents
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-g"
                            onClick={() => setAnnouncementSubScreen('list')}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            Back to Board
                          </button>
                        </div>

                        <form onSubmit={(e) => handleSaveAnnouncement(e, announcementForm.status)}>
                          <div className="fg">
                            <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              Announcement Title Header
                            </label>
                            <input
                              className="fc"
                              required
                              placeholder="e.g. Schedule of General Assembly or Relief Operations"
                              value={announcementForm.title}
                              onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                            />
                          </div>

                          {/* Category & Pin Toggle (2-Column Grid) */}
                          <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="fg">
                              <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                Category Engine Routing
                              </label>
                              <select
                                className="fc"
                                value={announcementForm.category}
                                onChange={(e) => setAnnouncementForm({ ...announcementForm, category: e.target.value })}
                              >
                                <option value="General">General Notice</option>
                                <option value="Health">Health Mission / Advisory</option>
                                <option value="Security">Security Alerts & Regulations</option>
                                <option value="Events">Community Events & Sports</option>
                                <option value="Governance">Local Barangay Governance</option>
                              </select>
                            </div>
                            <div className="fg" style={{ display: 'flex', alignItems: 'center', marginTop: '24px' }}>
                              <label style={{
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center',
                                fontSize: '13px',
                                cursor: 'pointer',
                                color: '#cbd5e1'
                              }}>
                                <input
                                  type="checkbox"
                                  checked={announcementForm.pinned}
                                  onChange={(e) => setAnnouncementForm({ ...announcementForm, pinned: e.target.checked })}
                                />
                                Pin this announcement to top
                              </label>
                            </div>
                          </div>

                          {/* Content */}
                          <div className="fg">
                            <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              Public Content Narrative Report Statement
                            </label>
                            <textarea
                              className="fc"
                              required
                              style={{ minHeight: '140px', lineHeight: '1.6' }}
                              placeholder="Write down the comprehensive details here..."
                              value={announcementForm.content}
                              onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                            />
                          </div>

                          {/* Action Buttons */}
                          <div className="fa" style={{
                            display: 'flex',
                            gap: '10px',
                            marginTop: '20px',
                            borderTop: '1px solid #334155',
                            paddingTop: '16px',
                            justifyContent: 'flex-end'
                          }}>
                            <button
                              type="button"
                              className="btn btn-g"
                              style={{ background: '#475569' }}
                              onClick={() => setAnnouncementSubScreen('list')}
                            >
                              Cancel Changes
                            </button>
                            <button
                              type="submit"
                              className="btn btn-g"
                              style={{ background: '#b45309', color: 'white' }}
                              onClick={(e) => handleSaveAnnouncement(e, 'Draft')}
                            >
                              Save as Draft
                            </button>
                            <button
                              type="submit"
                              className="btn btn-p"
                              onClick={(e) => handleSaveAnnouncement(e, 'Published')}
                            >
                              Broadcast & Publish
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {showAnnDeleteModal && (
                      <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 99999
                      }}>
                        <div style={{
                          background: '#1e293b',
                          border: '1px solid #ef4444',
                          padding: '24px',
                          borderRadius: '8px',
                          width: '90%',
                          maxWidth: '400px',
                          textAlign: 'center',
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)'
                        }}>
                          <div style={{ fontSize: '36px', marginBottom: '8px', color: '#ef4444' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <path d="M12 9v4" />
                              <path d="M12 17h.01" />
                            </svg>
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '8px' }}>
                            Confirm Permanent Deletion?
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '20px' }}>
                            Are you sure you want to remove this notice? Residents will immediately lose read access visibility across the portal logs.
                          </div>
                          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-g"
                              style={{ flex: 1 }}
                              onClick={() => {
                                setShowAnnDeleteModal(false);
                                setAnnIdToDelete(null);
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{
                                flex: 1,
                                background: '#ef4444',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                justifyContent: 'center'
                              }}
                              onClick={handleConfirmDeleteAnnouncement}
                            >
                              Delete Notice
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

            {/* ════════════════════════════════════════
                SCREEN: FEEDBACK & COMPLAINTS
                ════════════════════════════════════════ */}
                {screen === 'feedback' && (
  <div className="screen active" style={{ position: 'relative' }}>
    {/* SYSTEM SUCCESS GLOBAL TOAST */}
    {showFbSuccessToast && (
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: '#059669',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '6px',
        zIndex: 99999,
        fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="M22 4L12 14.01l-3-3" />
        </svg>
        {fbToastMessage}
      </div>
    )}

    {/* HEADER METRICS DESK */}
    <div className="ph">
      <div>
        <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Feedback & Complaints Desk
        </div>
        <div className="ps">Monitor, route, and resolve real-time constituent issues within Barangay Bustrac</div>
      </div>
    </div>

    {/* QUICK STATISTICS OVERVIEW TILES (SVG Icons + Glass-Morphism) */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '12px',
      marginBottom: '16px'
    }}>
      <div style={{
        background: 'rgba(30, 41, 59, 0.6)',
        padding: '16px',
        borderRadius: '8px',
        borderLeft: '4px solid #ef4444',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="M4.93 4.93l2.83 2.83" />
          <path d="M16.24 16.24l2.83 2.83" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M4.93 19.07l2.83-2.83" />
          <path d="M16.24 7.76l2.83-2.83" />
        </svg>
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Pending Submissions</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f8fafc' }}>
            {feedbackList.filter(f => f.status === 'Pending').length}
          </div>
        </div>
      </div>

      <div style={{
        background: 'rgba(30, 41, 59, 0.6)',
        padding: '16px',
        borderRadius: '8px',
        borderLeft: '4px solid #3b82f6',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Under Review</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f8fafc' }}>
            {feedbackList.filter(f => f.status === 'Under Review').length}
          </div>
        </div>
      </div>

      <div style={{
        background: 'rgba(30, 41, 59, 0.6)',
        padding: '16px',
        borderRadius: '8px',
        borderLeft: '4px solid #10b981',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="M22 4L12 14.01l-3-3" />
        </svg>
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Resolved & Closed</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f8fafc' }}>
            {feedbackList.filter(f => f.status === 'Resolved').length}
          </div>
        </div>
      </div>
    </div>

    {/* CONTROLS WORKSPACE (SEARCH, FILTER, SORT) */}
    <div className="tw" style={{
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '16px',
      borderRadius: '8px',
      marginBottom: '12px',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(79, 142, 247, 0.2)'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
        gap: '10px',
        alignItems: 'center'
      }}>
        {/* Search */}
        <div className="sb-box" style={{ margin: 0, width: '100%' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            placeholder="Search Resident, ID or Subject..."
            value={searchFbQuery}
            onChange={(e) => setSearchFbQuery(e.target.value)}
          />
        </div>

        {/* Type Filter */}
        <select
          className="fc"
          style={{ width: '100%' }}
          value={filterFbType}
          onChange={(e) => setFilterFbType(e.target.value)}
        >
          <option value="All Types">All Types</option>
          <option value="Complaint">Complaint</option>
          <option value="Suggestion">Suggestion</option>
          <option value="Inquiry">Inquiry</option>
        </select>

        {/* Status Filter */}
        <select
          className="fc"
          style={{ width: '100%' }}
          value={filterFbStatus}
          onChange={(e) => setFilterFbStatus(e.target.value)}
        >
          <option value="All Status">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Under Review">Under Review</option>
          <option value="Responded">Responded</option>
          <option value="Resolved">Resolved</option>
        </select>

        {/* Priority Filter */}
        <select
          className="fc"
          style={{ width: '100%' }}
          value={filterFbPriority}
          onChange={(e) => setFilterFbPriority(e.target.value)}
        >
          <option value="All Priorities">All Priorities</option>
          <option value="High">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
            High Priority
          </option>
          <option value="Medium">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
            Medium Priority
          </option>
          <option value="Low">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
            Low Priority
          </option>
        </select>

        {/* Sort */}
        <select
          className="fc"
          style={{ width: '100%' }}
          value={sortFbBy}
          onChange={(e) => setSortFbBy(e.target.value)}
        >
          <option value="Newest">Newest First</option>
          <option value="Oldest">Oldest First</option>
          <option value="PendingFirst">Pending Priority</option>
        </select>
      </div>
    </div>

    {/* CENTRAL REGISTRY SYSTEM TABLE (Glass-Morphism) */}
    <div className="tw" style={{
      background: 'rgba(26, 29, 36, 0.4)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(79, 142, 247, 0.2)',
      borderRadius: '8px',
      overflowX: 'auto'
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', padding: '12px 16px', textAlign: 'left' }}>Ticket ID</th>
            <th style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px 16px', textAlign: 'left' }}>Resident From</th>
            <th style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px 16px', textAlign: 'left' }}>Classification</th>
            <th style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px 16px', textAlign: 'left' }}>Rank</th>
            <th style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px 16px', textAlign: 'left' }}>Subject Heading</th>
            <th style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px 16px', textAlign: 'left' }}>Date Submitted</th>
            <th style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px 16px', textAlign: 'left' }}>Assigned Agent</th>
            <th style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px 16px', textAlign: 'left' }}>Status State</th>
            <th style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px 16px', textAlign: 'left' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {feedbackList
            // Sorting
            .sort((a, b) => {
              const timeA = new Date(a.rawTimestamp || a.date || 0).getTime();
              const timeB = new Date(b.rawTimestamp || b.date || 0).getTime();
              if (sortFbBy === 'Oldest') {
                return timeA - timeB;
              }
              if (sortFbBy === 'PendingFirst') {
                const priorityWeight = { High: 3, Medium: 2, Low: 1 };
                const weightA = priorityWeight[a.priority] || 0;
                const weightB = priorityWeight[b.priority] || 0;
                return weightB - weightA;
              }
              return timeB - timeA; // Default to Newest First
            })
            // Filtering
            .filter((fb) => {
              const query = searchFbQuery.toLowerCase();
              const matchesSearch = (fb.sender || '').toLowerCase().includes(query) ||
                                  (fb.id || '').toLowerCase().includes(query) ||
                                  (fb.subject || '').toLowerCase().includes(query);
              const matchesType = filterFbType === 'All Types' || fb.type === filterFbType;
              const matchesStatus = filterFbStatus === 'All Status' || filterFbStatus === 'All Statuses' || fb.status === filterFbStatus;
              const matchesPriority = filterFbPriority === 'All Priorities' || fb.priority === filterFbPriority;
              return matchesSearch && matchesType && matchesStatus && matchesPriority;
            })
            .map((fb) => (
              <tr
                key={fb._id || fb.id}
                style={{
                  borderBottom: '1px solid #334155',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(79, 142, 247, 0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: '#60a5fa',
                  fontWeight: 'bold',
                  padding: '12px 16px'
                }}>
                  {fb.id}
                </td>
                <td style={{ fontWeight: '500', padding: '12px 16px' }}>{fb.sender}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span className={`badge ${fb.type === 'Complaint' ? 'r' : fb.type === 'Suggestion' ? 'b' : 'p'}`}>
                    {fb.type}
                  </span>
                </td>
                <td style={{ fontSize: '12px', padding: '12px 16px' }}>
                  {fb.priority === 'High' ? (
                    <span className="badge r" style={{ fontSize: '10px', padding: '2px 6px' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      High
                    </span>
                  ) : fb.priority === 'Medium' ? (
                    <span className="badge a" style={{ fontSize: '10px', padding: '2px 6px' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      Medium
                    </span>
                  ) : (
                    <span className="badge g" style={{ fontSize: '10px', padding: '2px 6px' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      Low
                    </span>
                  )}
                </td>
                <td style={{
                  fontSize: '12px',
                  maxWidth: '220px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  padding: '12px 16px'
                }} title={fb.subject}>
                  {fb.subject}
                </td>
                <td style={{ fontSize: '11px', color: '#94a3b8', padding: '12px 16px' }}>{fb.date}</td>
                <td style={{
                  fontSize: '12px',
                  color: fb.assignedTo === 'Unassigned' ? '#94a3b8' : '#cbd5e1',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  {fb.assignedTo}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span className="badge" style={{
                    background: fb.status === 'Pending' ? '#7f1d1d' :
                               fb.status === 'Under Review' ? '#1e3a8a' :
                               fb.status === 'Responded' ? '#78350f' : '#065f46',
                    color: fb.status === 'Pending' ? '#fca5a5' :
                          fb.status === 'Under Review' ? '#93c5fd' :
                          fb.status === 'Responded' ? '#fde047' : '#34d399',
                  }}>
                    {fb.status}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${fb.status === 'Pending' || fb.status === 'Under Review' ? 'btn-p' : 'btn-g'}`}
                    onClick={() => handleOpenFeedbackDetails(fb)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {fb.status === 'Pending' || fb.status === 'Under Review' ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                          <path d="M12 18v-6" />
                          <path d="M9 15h6" />
                        </svg>
                        Respond
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                          <path d="M12 18v-6" />
                          <path d="M9 15h6" />
                        </svg>
                        View Details
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {/* NO MATCH ENCOUNTERED BANNER */}
      {feedbackList.filter(fb => {
        const matchesSearch = fb.sender.toLowerCase().includes(searchFbQuery.toLowerCase()) ||
                            fb.id.toLowerCase().includes(searchFbQuery.toLowerCase()) ||
                            fb.subject.toLowerCase().includes(searchFbQuery.toLowerCase());
        const matchesType = filterFbType === 'All Types' || fb.type === filterFbType;
        const matchesStatus = filterFbStatus === 'All Status' || fb.status === filterFbStatus;
        const matchesPriority = filterFbPriority === 'All Priorities' || fb.priority === filterFbPriority;
        return matchesSearch && matchesType && matchesStatus && matchesPriority;
      }).length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '32px',
          color: '#94a3b8',
          border: '1px dashed #334155',
          borderRadius: '0 0 8px 8px',
          background: '#1e293b',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          No active feedback logs found matching the filtering conditions.
        </div>
      )}
    </div>

    {/* =============================================
         📋 CENTRAL DIAGNOSTIC FULL WORKFLOW MODAL DIALOG
         ============================================= */}
    {selectedFeedback && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999
      }}>
        <div style={{
          background: '#1e293b',
          border: '1px solid #3b82f6',
          width: '90%',
          maxWidth: '600px',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)'
        }}>
          {/* MODAL HEADER CARD */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #334155',
            paddingBottom: '12px',
            marginBottom: '16px'
          }}>
            <div>
              <span style={{
                fontSize: '11px',
                background: '#3b82f6',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '4px',
                marginRight: '6px',
                fontFamily: 'var(--mono)'
              }}>
                {selectedFeedback.id}
              </span>
              <strong style={{ fontSize: '16px', color: '#f8fafc' }}>
                {selectedFeedback.type} Details Log
              </strong>
            </div>
            <button
              type="button"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '20px',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedFeedback(null)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
          </div>

          {/* SYSTEM INFORMATIONAL METADATA */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '14px',
            fontSize: '13px',
            background: '#0f172a',
            padding: '12px',
            borderRadius: '6px'
          }}>
            <div>
              <span style={{ color: '#94a3b8' }}>Resident Submitter:</span>
              <strong style={{ color: 'white' }}>{selectedFeedback.sender}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Rank Priority:</span>
              <strong>
                {selectedFeedback.priority === 'High' ? (
                  <span className="badge r" style={{ fontSize: '10px', padding: '2px 6px' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    High
                  </span>
                ) : selectedFeedback.priority === 'Medium' ? (
                  <span className="badge a" style={{ fontSize: '10px', padding: '2px 6px' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    Medium
                  </span>
                ) : (
                  <span className="badge g" style={{ fontSize: '10px', padding: '2px 6px' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    Low
                  </span>
                )}
              </strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Timeline Stamp:</span>
              <span style={{ color: '#cbd5e1' }}>{selectedFeedback.date}</span>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Attachment Field:</span>
              {' '}
              {selectedFeedback.attachment ? (
                <span style={{
                  color: '#60a5fa',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                  onClick={() => alert(`Opening system dynamic link placeholder: ${selectedFeedback.attachment}`)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  {selectedFeedback.attachment}
                </span>
              ) : (
                <span style={{ color: '#64748b' }}>None</span>
              )}
            </div>
          </div>

          {/* MAIN MESSAGE STATEMENT AREA */}
          <div style={{ marginBottom: '16px' }}>
            <label className="fl" style={{
              color: '#94a3b8',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M12 18v-6" />
                <path d="M9 15h6" />
              </svg>
              Subject Heading
            </label>
            <div style={{
              background: '#334155',
              padding: '8px 12px',
              borderRadius: '4px',
              color: 'white',
              fontWeight: '600',
              fontSize: '13px',
              marginBottom: '8px'
            }}>
              {selectedFeedback.subject}
            </div>

            <label className="fl" style={{
              color: '#94a3b8',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Original Input Context Message
            </label>
            <div style={{
              background: '#334155',
              padding: '12px',
              borderRadius: '6px',
              color: '#cbd5e1',
              fontSize: '13px',
              lineHeight: '1.6',
              maxHeight: '120px',
              overflowY: 'auto'
            }}>
              "{selectedFeedback.message}"
            </div>
          </div>

          {/* SYSTEM MANAGEMENT FORM AUDIT BLOCK */}
          <form onSubmit={handleSubmitFeedbackAction}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '12px'
            }}>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4" />
                    <path d="M12 18v4" />
                    <path d="M4.93 4.93l2.83 2.83" />
                    <path d="M16.24 16.24l2.83 2.83" />
                    <path d="M2 12h2" />
                    <path d="M20 12h2" />
                    <path d="M4.93 19.07l2.83-2.83" />
                    <path d="M16.24 7.76l2.83-2.83" />
                  </svg>
                  Update Workflow Status
                </label>
                <select
                  className="fc"
                  value={fbStatusUpdate}
                  onChange={(e) => setFbStatusUpdate(e.target.value)}
                >
                  <option value="Pending">Pending</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Responded">Responded</option>
                  <option value="Resolved">Resolved & Closed</option>
                </select>
              </div>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  Assign Staff Operations Agent
                </label>
                <select
                  className="fc"
                  value={fbStaffAssignment}
                  onChange={(e) => setFbStaffAssignment(e.target.value)}
                >
                  <option value="Unassigned">Unassigned</option>
                  <option value="Mark Gian Cortero">Mark Gian Cortero</option>
                  <option value="Juhairo Macabangon">Juhairo Macabangon</option>
                  <option value="Denver Napagal">Denver Napagal</option>
                </select>
              </div>
            </div>

            <div className="fg">
              <label className="fl" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M12 18v-6" />
                  <path d="M9 15h6" />
                </svg>
                Official Response Statement (To be broadcast to Resident Portal Logs)
              </label>
              <textarea
                className="fc"
                required
                style={{ minHeight: '80px', fontSize: '13px' }}
                placeholder="Provide a clean clear response guidelines message context here..."
                value={fbResponseText}
                onChange={(e) => setFbResponseText(e.target.value)}
              />
            </div>

            {/* AUDIT TRAIL FIELD FOOTNOTE */}
            {selectedFeedback.status === 'Resolved' && (
              <div style={{
                fontSize: '11px',
                color: '#10b981',
                background: '#065f46',
                padding: '8px',
                borderRadius: '4px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M12 18v-6" />
                  <path d="M9 15h6" />
                </svg>
                Historical Audit Track: Resolved by <strong>{selectedFeedback.handledBy}</strong> on <em>{selectedFeedback.dateResolved}</em>
              </div>
            )}

            {/* ACTION TRIGGERS CONTROLLER AREA */}
            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
              borderTop: '1px solid #334155',
              paddingTop: '12px'
            }}>
              <button
                type="button"
                className="btn btn-g"
                style={{ background: '#475569' }}
                onClick={() => setSelectedFeedback(null)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
                Discard
              </button>
              <button
                type="submit"
                className="btn btn-p"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5" />
                  <path d="M19 3H5" />
                  <path d="M19 12H5" />
                  <path d="M5 21V3" />
                </svg>
                Commit Changes & Notify
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
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
                      <option>All Modules</option>
                      <option>Residents</option>
                      <option>Certificates</option>
                      <option>Aid Distribution</option>
                      <option>Blotter</option>
                    </select>
                    <select className="fc" style={{ width: '130px' }}>
                      <option>All Actions</option>
                      <option>CREATE</option>
                      <option>UPDATE</option>
                      <option>ARCHIVE</option>
                      <option>APPROVE</option>
                      <option>LOGIN</option>
                      <option>SYNC</option>
                      <option>RESOLVE</option>
                    </select>
                  </div>

                  {auditLogs.length === 0 ? (
                    <div className="al-row" style={{ justifyContent: 'center', color: 'var(--muted)', padding: '24px' }}>
                      No audit logs found.
                    </div>
                  ) : (
                    auditLogs.map((log) => {
                      const meta = getActionMeta(log.action);
                      return (
                        <div key={log._id} className="al-row">
                          <div className="al-ico" style={{ background: meta.bg }}>
                            {meta.ico}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="al-a">
                              {log.action}
                              {log.module ? ` — ${log.module}` : ''}
                              {log.recordId ? ` · ${log.recordId}` : ''}
                            </div>
                            <div className="al-d">
                              User: {log.actor?.username || 'System'} ({log.actor?.role || 'N/A'})
                              {log.details ? ` · ${log.details}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span
                              className={`badge ${meta.bClass}`}
                              style={{ fontSize: '9px', marginBottom: '3px', display: 'inline-flex' }}
                            >
                              {meta.badge}
                            </span>
                            <div className="al-t">
                              {log.timestamp
                                ? new Date(log.timestamp).toLocaleString('en-PH', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true,
                                  })
                                : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
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

          </div>
          <footer style={{
            textAlign: 'center',
            padding: '20px 0',
            marginTop: 'auto', 
            borderTop: '1px solid #1e293b',
            color: '#64748b',
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%'
          }}>
            <div>
              <strong>Bustrac Hub</strong> v1.0.0 — {role === 'admin' ? 'Admin Portal' : 'Staff Portal'}
            </div>
            <div>
              © 2026 Brgy. Bustrac, Nabua, Camarines Sur. All Rights Reserved.
            </div>
          </footer>
        </div>{/* /main */}
      </div>{/* /app */}
    </div>/* /dashboard-shell-container */
  );
}
const dropdownItemStyle = {
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  padding: '10px 14px',
  color: '#e5e7eb',
  fontSize: '12px',
  cursor: 'pointer',
  transition: 'background 0.2s',
  display: 'block'
};
