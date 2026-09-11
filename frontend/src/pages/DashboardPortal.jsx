import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PouchDB from 'pouchdb';
import logo from '../assets/logo.png';
import CertificateLifecycle from './CertificateLifecycle';
import './DashboardLayout.css';
import { createAuditLog, getAuditLogs } from '../utils/auditLog';

const db = new PouchDB('bustrachub_db');

const remoteCouchDB = import.meta.env.VITE_COUCHDB_URL || 'http://admin:capstone2026@localhost:5984/bustrachub_db';

if (typeof window !== 'undefined') {
  window.db = db;
}


// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const SCREEN_META = {
  dashboard:        ['Dashboard',                  ''],            // subtitle rendered per role in JSX
  residents:        ['Manage Residents',           'Resident Registry Module'],
  'add-resident':   ['Add New Resident',          'Resident Registry'],
  households:       ['Manage Households',          'Resident Registry'],
  'cert-req':       ['Request & Approval',         'Certificate Issuance Module'],
  'cert-approve':   ['Certificate Approval',       'Certificate Issuance Module'],
  'cert-print':     ['Issuance & Print',           'Certificate Issuance Module'],
  business_clearance: ['Business Clearance',       'Certificate Issuance Module'],
  brgy_clearance:   ['Barangay Clearance (Individual)', 'Certificate Issuance Module'],
  programs:         ['Distribution Programs',      'Aid Distribution Module'],
  'aid-encode':     ['Encode Distribution',        'Aid Distribution Module'],
  'aid-logs':       ['Distribution Logs',          'Aid Distribution Module'],
  'add-beneficiary':['Add Beneficiaries',          'Aid Distribution Module'],
  'blotter-new':    ['File Blotter Entry',         'Blotter Module'],
  'blotter-manage': ['Manage Blotter Records',     'Blotter Module'],
  'blotter-detail': ['Complaint Details',          'Blotter Module — Case Management'],
  announcements:    ['Announcements',              'Community Module'],
  feedback:         ['Feedback & Complaints',      'Community Module'],
  conflicts:        ['Conflict Resolution',        'Admin Only — CouchDB Sync Conflicts'],
  audit:            ['Audit Log',                  'Admin Only — Immutable Transaction History'],
  users:            ['Manage Users',               'Admin Only — User Accounts & Roles'],
  reports:          ['Generate Reports',           'Administration'],
};

export const EMPTY_RESIDENT = {
  rbiNo: '',
  householdNo: '',
  fileDateUpdated: new Date().toISOString().split('T')[0],

  lastName: '',
  firstName: '',
  middleName: '',
  suffix: '',
  alias: '',
  birthdate: '',
  age: 0,
  birthPlace: '',
  sex: 'Male',
  isLgbtqia: false,
  lgbtqiaSpecification: '',
  civilStatus: 'Single',
  citizenship: 'Filipino',
  religion: '',
  indigenousTribe: '',

  weightKg: '',
  heightCm: '',
  bloodType: '',

  isFamilyHead: false,
  isSoloParent: false,
  isHouseholdHead: false,
  relationshipToHouseholdHead: '',

  isRegisteredVoter: false,
  isVotingLocally: false,
  precinctNo: '',
  votingOtherPlace: '',

  isBarangayResident: true,
  residentSince: '',
  residencyStatus: 'Permanent',
  contactNo: '',
  email: '',
  purokZoneAddress: '',
  addressOutsideBarangay: '',

  isBarangayOfficial: false,
  isDeceased: false,
  photoUrl: '',
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
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
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
      { id: 'RES-0001', rbiId: '05-17-23-005-00000001', firstName: 'Maria', middleName: 'D.', lastName: 'Santos', name: 'Maria D. Santos', birthdate: '1990-03-12', gender: 'Female', civilStatus: 'Married', contact: '0917-123-4567', purok: 'Purok 3', household: 'HH-0012', householdHead: false, voter: true, conflict: false },
      { id: 'RES-0002', rbiId: '05-17-23-005-00000002', firstName: 'Juan', middleName: 'B.', lastName: 'Reyes', name: 'Juan B. Reyes', birthdate: '1959-05-20', gender: 'Male', civilStatus: 'Widowed', contact: '0917-000-0002', purok: 'Purok 1', household: 'HH-0003', householdHead: true, voter: true, conflict: false },
      { id: 'RES-0003', rbiId: '05-17-23-005-00000003', name: 'Garcia, Ana L.', firstName: 'Ana', lastName: 'Garcia', purok: 'Purok 2', purokClass: 't', age: 28, civilStatus: 'Single', voter: false, household: 'HH-0007', householdHead: true, conflict: false },
      { id: 'RES-0412', rbiId: '05-17-23-005-00000412', name: 'Dela Cruz, Maria', firstName: 'Maria', lastName: 'Dela Cruz', purok: 'Purok 1', purokClass: 'p', age: 29, civilStatus: 'Married', voter: true, household: 'HH-0015', householdHead: true, conflict: true },
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
      birthdate: res.birthdate || '',
      gender: res.gender || '',
      civilStatus: res.civilStatus || '',
      contact: res.contact || '',
      purok: res.purok || '',
      household: res.household || '',
      householdHead: res.householdHead === true,
      rbiId: res.rbiId || ''
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
  const [householdPurokFilter, setHouseholdPurokFilter] = useState('All Puroks'); 
  
  
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
  const matchesPurok = householdPurokFilter === 'All Puroks' || h.purok === householdPurokFilter;
  
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
        rbiId,
        voter,
        householdHead
    } = residentForm;
 
    console.log('RESIDENT FORM BEFORE SAVE:', residentForm);       
    // Required fields
    if (
        !firstName?.trim() ||
        !middleName?.trim() ||
        !lastName?.trim() ||
        !birthdate ||
        !gender ||
        !civilStatus ||
        !contact?.trim() ||
        !purok ||
        !household ||
        !rbiId?.trim()
    ) {
        alert('Please fill in all required fields, including RBI ID.');
        return;
    }

    const normalizedRbiId = rbiId.trim().toUpperCase();

    // Prevent duplicate RBI ID
    const duplicateRbiId = residentsList.some(
        (res) =>
            res.rbiId?.trim().toUpperCase() === normalizedRbiId &&
            res.id !== editingResidentId
    );

    if (duplicateRbiId) {
        alert(
            `RBI ID ${normalizedRbiId} is already assigned to another resident.`
        );
        return;
    }

    const fullName = `${firstName.trim()} ${middleName.trim()} ${lastName.trim()}`;

    // Purok badge class
    let dynamicPurokClass = 'b';

    if (purok.includes('1')) {
        dynamicPurokClass = 'p';
    } else if (purok.includes('2')) {
        dynamicPurokClass = 'g';
    } else if (purok.includes('5')) {
        dynamicPurokClass = 'a';
    }

    // =========================================================
    // UPDATE EXISTING RESIDENT
    // =========================================================
    if (editingResidentId) {
    const updatedList = residentsList.map((res) => {
      if (res.id !== editingResidentId) {
        return res;
      }

      return {
        ...res,
        rbiId: normalizedRbiId,
        firstName: firstName.trim(),
        middleName: middleName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        birthdate,
        gender,
        civilStatus,
        contact: contact.trim(),
        purok,
        purokClass: dynamicPurokClass,
        age: new Date().getFullYear() - new Date(birthdate).getFullYear(),
        household,
        householdHead: Boolean(householdHead),
        voter: Boolean(voter),
      };
    });

    setResidentsList(updatedList);

    await createAuditLog({
      action: 'UPDATE',
      module: 'RESIDENTS',
      recordId: editingResidentId,
      details: `Updated resident record: ${fullName}`,
    });

    alert(`Resident ${editingResidentId} updated successfully!`);
    setEditingResidentId(null);
    setResidentForm(EMPTY_RESIDENT);
    nav('residents');
    return;
  }

    // =========================================================
    // CREATE NEW RESIDENT
    // =========================================================

    const newResidentId = `RES-${String(
        residentsList.length + 1
    ).padStart(4, '0')}`;

    const newResident = {
        id: newResidentId,

        // Official Record of Barangay Inhabitants identifier
        rbiId: normalizedRbiId,

        firstName: firstName.trim(),
        middleName: middleName.trim(),
        lastName: lastName.trim(),

        name: fullName,

        birthdate,
        gender,
        civilStatus,
        contact: contact.trim(),

        purok,
        purokClass: dynamicPurokClass,

        age: new Date().getFullYear() - new Date(birthdate).getFullYear(),

        household,
        householdHead: Boolean(householdHead),

        voter: Boolean(voter),

        conflict: false,
    };

    const updatedList = [
        ...residentsList,
        newResident
    ];

    setResidentsList(updatedList);

    // Persist locally
    localStorage.setItem(
        'bustrac_residents',
        JSON.stringify(updatedList)
    );
    
    const residentDoc = {
      _id: newResidentId,
      type: 'resident',
      residentId: newResidentId,
      rbiId: normalizedRbiId,
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      name: fullName,
      birthdate,
      gender,
      civilStatus,
      contact: contact.trim(),
      purok,
      household,
      householdHead: Boolean(householdHead),
      voter: Boolean(voter),
      conflict: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    try {
      await db.put(residentDoc);
    } catch (error) {
      console.error(
        'Failed to save resident to PouchDB:',
        error
      );
    }

    await createAuditLog({
        action: 'CREATE',
        module: 'RESIDENTS',
        recordId: newResidentId,
        details: `Added new resident record: ${fullName} (${normalizedRbiId})`,
    });

    alert(
        `Resident added successfully!\n\n` +
        `Resident ID: ${newResidentId}\n` +
        `RBI ID: ${normalizedRbiId}\n` +
        `Name: ${fullName}`
    );

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
  if (!issuanceMeta.orNumber.trim() || !issuanceMeta.ctcNumber.trim() || !issuanceMeta.amountPaid) {
    alert('Please fill in all required issuance fields (OR No., CTC No., Amount Paid).');
    return;
  }

  try {
    const latestDoc = await db.get(req._id);
    const updatedDoc = {
      ...latestDoc,
      status: 'Issued',
      issuedAt: new Date().toISOString(),
      step: 5,
      purpose: issuanceMeta.purpose || latestDoc.purpose,
      remarks: issuanceMeta.remarks,
      validity: issuanceMeta.validity,
      noDerogatoryRecord: issuanceMeta.noDerogatoryRecord,
      orNumber: issuanceMeta.orNumber,
      ctc: {
        name: issuanceMeta.ctcName || `${latestDoc.firstName || ''} ${latestDoc.lastName || ''}`.trim(),
        number: issuanceMeta.ctcNumber,
        amountPaid: parseFloat(issuanceMeta.ctcAmountPaid || issuanceMeta.amountPaid) || 0,
        dateIssued: issuanceMeta.ctcDateIssued || issuanceMeta.dateIssued,
        placeIssued: issuanceMeta.placeIssued,
      },
      signatories: {
        secretary: issuanceMeta.secretary || barangaySettings.signatories?.secretary,
        punongBarangay: issuanceMeta.punongBarangay || barangaySettings.signatories?.punongBarangay,
      },
      issuanceMeta: { ...issuanceMeta, printedAt: new Date().toISOString() },
    };

    await db.put(updatedDoc);

    await createAuditLog({
      action: 'UPDATE',
      module: 'CERTIFICATES',
      recordId: req._id,
      details: `Issued and printed certificate for ${latestDoc.firstName || ''} ${latestDoc.lastName || ''}`,
    });

    setSelectedCertificate(updatedDoc);
    setTimeout(() => window.print(), 350);
  } catch (err) {
    console.error('Failed to update certificate status:', err);
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
  // Dynamic computing: This looks for a match in the typed input against Name, ID, or Purok
  const filteredResidents = residentsList.filter((res) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      res.name.toLowerCase().includes(query) ||
      res.id.toLowerCase().includes(query) ||
      res.rbiId?.toLowerCase().includes(query) ||
      res.purok.toLowerCase().includes(query) ||
      res.household?.toLowerCase().includes(query);

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

// ── BARANGAY CLEARANCE (INDIVIDUAL) STATE MANAGEMENT ──
const [clearanceList, setClearanceList] = useState([]);
const [showClearancePrintModal, setShowClearancePrintModal] = useState(false);
const [selectedClearanceCert, setSelectedClearanceCert] = useState(null);

// Form State matching legacy fields in modern structure
const [clearanceForm, setClearanceForm] = useState({
  _id: '',
  clearanceNo: 'BC-2026-0001',
  fullName: 'PANIZAL, JOAN REBUSQUILLO',
  purpose: 'Employment Requirement',
  remarks: 'No Derogatory Record',
  validity: '(6) Six Months Validity',
  dateIssued: new Date().toISOString().split('T')[0],
  orNo: '',
  amtPaid: '50.00',
  // CTC Details
  ctcNo: '',
  ctcName: '',
  ctcAmtPaid: '0.00',
  ctcDateIssued: new Date().toISOString().split('T')[0],
  ctcPlaceIssued: 'Nabua, Camarines Sur',
  // Signatories
  secretary: 'MRS. MELY M. PRESADO',
  captain: 'HON. ANNABELLE E. RULL',
  // Blotter Check Status
  hasBlotterRecord: false,
  selectedResidentId: '', 
  isIssuedByBarangay: true, 
});

// Fetch Barangay Clearances from PouchDB
const fetchClearances = async () => {
  try {
    if (typeof db !== 'undefined' && db.allDocs) {
      const res = await db.allDocs({ include_docs: true, startkey: 'brgy_clearance_', endkey: 'brgy_clearance_\uffff' });
      const docs = res.rows.map(r => r.doc);
      setClearanceList(docs);
    }
  } catch (err) {
    console.error('Failed to fetch barangay clearances:', err);
  }
};

// Save or Update Clearance Record
const handleSaveClearance = async (e) => {
  e.preventDefault();
  if (!clearanceForm.fullName.trim() || !clearanceForm.purpose.trim()) {
    alert('Please fill in the Resident Full Name and Purpose.');
    return;
  }

  try {
    const payload = {
      ...clearanceForm,
      _id: clearanceForm._id || `brgy_clearance_${Date.now()}`,
      type: 'barangay_clearance',
      updatedAt: new Date().toISOString(),
      createdAt: clearanceForm.createdAt || new Date().toISOString(),
    };

    if (typeof db !== 'undefined' && db.put) {
      await db.put(payload);
    }

    await fetchClearances();
    alert(clearanceForm._id ? '✓ Barangay Clearance updated successfully!' : '✓ Barangay Clearance issued successfully!');
    
    // Reset Form
    resetClearanceForm();
  } catch (err) {
    console.error('Failed to save barangay clearance:', err);
    alert('Error saving record to local database.');
  }
};

const resetClearanceForm = () => {
  const nextNo = `BC-2026-${String(clearanceList.length + 1).padStart(4, '0')}`;
  setClearanceForm({
    _id: '',
    clearanceNo: nextNo,
    fullName: '',
    purpose: '',
    remarks: 'No Derogatory Record',
    validity: '(6) Six Months Validity',
    dateIssued: new Date().toISOString().split('T')[0],
    orNo: '',
    amtPaid: '50.00',
    ctcNo: '',
    ctcName: '',
    ctcAmtPaid: '0.00',
    ctcDateIssued: new Date().toISOString().split('T')[0],
    ctcPlaceIssued: 'Nabua, Camarines Sur',
    secretary: 'MRS. MELY M. PRESADO',
    captain: 'HON. ANNABELLE E. RULL',
    hasBlotterRecord: false,
  });
};

const handleEditClearance = (rec) => {
  setClearanceForm(rec);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const handlePrintClearance = (rec) => {
  setSelectedClearanceCert(rec);
  setShowClearancePrintModal(true);
};

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
  household: '',
  rbiId: ''
});

// Awtomatikong hihilahin ang lumang data ni resident tuwing bubuksan ang Edit screen
useEffect(() => {
  if (screen === 'edit-resident' && selectedResidentId) {
    const targetRes = residentsList.find(r => r.id === selectedResidentId);
    if (targetRes) {
      const nameParts = targetRes.name ? targetRes.name.split(' ') : ['', ''];
      setEditForm({
        firstName: targetRes.firstName || nameParts[0] || '',
        lastName: targetRes.lastName || nameParts[nameParts.length - 1] || '',
        civilStatus: targetRes.civilStatus || 'Single',
        purok: targetRes.purok || 'Purok 1',
        household: targetRes.household || '',
        rbiId: targetRes.rbiId || ''  
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
          rbiId: editForm.rbiId, 
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
const [dateFrom, setDateFrom] = useState('');
const [dateTo, setDateTo] = useState('');
const [filterVawc, setFilterVawc] = useState(false);
const [selectedBlotterId, setSelectedBlotterId] = useState(null);
const [blotterVerifyQuery, setBlotterVerifyQuery] = useState('');
const [blotterMatches, setBlotterMatches] = useState([]);

// ── CTC MASTERLIST STATES ──
const [ctcQuery, setCtcQuery] = useState('');
const [showCtcMatches, setShowCtcMatches] = useState(false);
const [ctcMasterlist, setCtcMasterlist] = useState([
  { _id: 'ctc_001', ctcNo: 'CTC-2026-001', ctcName: 'Juan Dela Cruz', amountPaid: 50, dateIssued: '2026-08-01', placeIssued: 'Barangay Bustrac, Nabua, Camarines Sur' },
  { _id: 'ctc_002', ctcNo: 'CTC-2026-002', ctcName: 'Maria Santos', amountPaid: 65, dateIssued: '2026-08-05', placeIssued: 'Barangay Bustrac, Nabua, Camarines Sur' }
]);

useEffect(() => {
  if (!blotterVerifyQuery.trim()) {
    setBlotterMatches([]);
    return;
  }
  const q = blotterVerifyQuery.toLowerCase();
  const matches = blotterList.filter(b => {
    const resp = (b.respondent || b.respName || '').toLowerCase();
    const comp = (b.complainant || b.compName || '').toLowerCase();
    return resp.includes(q) || comp.includes(q);
  });
  setBlotterMatches(matches);
}, [blotterVerifyQuery, blotterList]);

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

const filteredBlotters = (currentBlotterRoster || []).filter((b) => {
  const query = blotterSearch.toLowerCase().trim();

  // 1. Search Box (Null-Safe for ID, Complainant, Respondent)
  const matchesSearch =
    !query ||
    (b.id && b.id.toLowerCase().includes(query)) ||
    (b.complainant && b.complainant.toLowerCase().includes(query)) ||
    (b.respondent && b.respondent.toLowerCase().includes(query));

  // 2. Incident Type & Status
  const matchesType = filterType === 'All Types' || b.type === filterType;
  const matchesStatus =
    filterStatus === 'All Status' ||
    b.status === filterStatus ||
    (filterStatus === 'Under Mediation' && b.status === 'Mediation');

  // 3. Date Range Filtering (Mula sa UI inputs: dateFrom at dateTo)
  const caseDate = b.date ? new Date(b.date) : null;
  const matchesDateFrom = !dateFrom || (caseDate && caseDate >= new Date(dateFrom));
  const matchesDateTo = !dateTo || (caseDate && caseDate <= new Date(dateTo));

  // 4. VAWC Filter Toggle (Mula sa UI input: filterVawc)
  const matchesVawc = !filterVawc || b.isVawc === true || b.vawc === true;

  return (
    matchesSearch &&
    matchesType &&
    matchesStatus &&
    matchesDateFrom &&
    matchesDateTo &&
    matchesVawc
  );
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

  try {
    const latestDoc = await db.get(currentRequest._id);

    const formattedPayload = {
      ...latestDoc,
      status: 'Approved',
      step: 3,
      orNumber: currentRequest.orNumber || latestDoc.orNumber || `OR-${Date.now()}`,
      updatedAt: new Date().toISOString().split('T')[0]
    };

    await db.put(formattedPayload);

    await createAuditLog({
      action: 'APPROVE',
      module: 'CERTIFICATES',
      recordId: currentRequest._id,
      details: `Approved certificate request for ${currentRequest.firstName || ''} ${currentRequest.lastName || ''}`,
    });

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

const [issuanceMeta, setIssuanceMeta] = useState({
  orNumber: '',
  ctcNumber: '',
  ctcName: '',
  amountPaid: '',
  ctcAmountPaid: '',
  dateIssued: new Date().toISOString().split('T')[0],
  ctcDateIssued: new Date().toISOString().split('T')[0],
  placeIssued: 'Barangay Bustrac, Nabua, Camarines Sur',
  purpose: '',
  remarks: 'No Derogatory Record',
  validity: '6 months',
  noDerogatoryRecord: true,
  secretary: '',
  punongBarangay: '',
});

// ── CONFLICT RESOLUTION STATE & LOGIC ──
const [conflictsList, setConflictsList] = useState([]);
const [loadingConflicts, setLoadingConflicts] = useState(false);
const [syncInstance, setSyncInstance] = useState(null);

useEffect(() => {
  if (typeof db === 'undefined' || !remoteCouchDB) return;

  const sync = db.sync(remoteCouchDB, {
    live: true,
    retry: true,
    ajax: { withCredentials: true }
  });

  setSyncInstance(sync);

  return () => {
    sync.cancel();
  };
}, []);

// Fetch all conflicted documents from PouchDB
const fetchDatabaseConflicts = async () => {
  if (typeof db === 'undefined') return;
  try {
    const result = await db.allDocs({ conflicts: true, include_docs: true });
    const conflictList = [];
    
    for (const row of result.rows) {
      if (row.doc && row.doc._conflicts && row.doc._conflicts.length > 0) {
        for (const conflictRev of row.doc._conflicts) {
          try {
            const conflictingDoc = await db.get(row.id, { rev: conflictRev });
            conflictList.push({
              id: `${row.id}-${conflictRev}`,
              docId: row.id,
              residentName: row.doc.name || `${row.doc.firstName || ''} ${row.doc.lastName || ''}`.trim() || 'Maria Santos',
              winningRev: row.doc._rev,
              conflictRev: conflictRev,
              docA: row.doc,          // Version A (Winning Revision)
              docB: conflictingDoc,   // Version B (Conflicting Revision)
              updatedAt: new Date().toLocaleTimeString()
            });
          } catch (fetchErr) {
            console.error('Error fetching conflicting revision doc:', fetchErr);
          }
        }
      }
    }
    
    console.log("🔥 Active Conflicts Found for UI:", conflictList);
    // SIGURUHING SETCONFLICTCET ANG GINAMIT DAHIL ITO ANG STATE VARIABLE NG UI
    setConflictsList(conflictList);
  } catch (err) {
    console.error('Error fetching database conflicts:', err);
  }
};

const fetchResidents = async () => {
  if (typeof db === 'undefined') return;
  try {
    const result = await db.allDocs({ include_docs: true, conflicts: true });
    const formattedResidents = result.rows
      .filter(row => row.doc && (row.doc.type === 'residents' || row.id.startsWith('RES-')))
      .map(row => {
        const doc = row.doc;
        return {
          id: doc._id,
          rbiId: doc.rbiId || '—',
          name: doc.name || `${doc.firstName || ''} ${doc.lastName || ''}`.trim(),
          purok: doc.purok || 'Unassigned',
          age: doc.age || '—',
          civilStatus: doc.civilStatus || 'Single',
          voter: doc.voter || false,
          household: doc.household || '—',
          purokClass: doc.purokClass || 'g',
          // Once the conflicting revision is removed via db.remove(), the _conflicts array will become empty or undefined, so this will evaluate to false.
          conflict: Boolean(doc._conflicts && doc._conflicts.length > 0)
        };
      });
    setResidentsList(formattedResidents);
  } catch (err) {
    console.error('Error fetching residents:', err);
  }
};

useEffect(() => {
  if (!syncInstance) return;

  const handleChange = (info) => {
    console.log('⚡ Replication change detected:', info);
    if (typeof fetchDatabaseConflicts === 'function') fetchDatabaseConflicts();
    if (typeof fetchResidents === 'function') fetchResidents();
  };

  const handleError = (err) => {
    console.error('⚠️ CouchDB Sync Error:', err);
  };

  syncInstance.on('change', handleChange);
  syncInstance.on('error', handleError);

  return () => {
    syncInstance.removeListener('change', handleChange);
    syncInstance.removeListener('error', handleError);
  };
}, [syncInstance]); 

// Automatically scan for conflicts when mounting or navigating to conflict screen
useEffect(() => {
  if (screen === 'conflicts') {
    if (typeof fetchDatabaseConflicts === 'function') {
      fetchDatabaseConflicts();
    }
  }
}, [screen]);

// Resolve Conflict: Keep Version A (Discard conflicting revision B)
const handleKeepVersionA = async (conflict) => {
  try {
    await db.remove(conflict.docId, conflict.conflictRev);
    alert('✓ Conflict resolved. Retained Version A.');

    if (typeof fetchDatabaseConflicts === 'function') fetchDatabaseConflicts();
    if (typeof fetchResidents === 'function') fetchResidents();
  } catch (err) {
    console.error('Failed to purge conflict revision:', err);
    alert('Error resolving conflict.');
  }
};

// Resolve Conflict: Keep Version B (Override current doc with revision B)
const handleKeepVersionB = async (conflict) => {
  try {
    const updatedDoc = {
      ...conflict.versionB,
      _rev: conflict.versionA._rev // Overwrite main document revision
    };
    await db.put(updatedDoc);
    await db.remove(conflict.docId, conflict.conflictRev);
    alert('✓ Conflict resolved. Overwritten with Version B.');
    fetchDatabaseConflicts();
  } catch (err) {
    console.error('Failed to resolve with Version B:', err);
    alert('Error resolving conflict.');
  }
};

// Resolve Conflict: Keep Both (Save Version B as a new separate document)
const handleKeepBoth = async (conflict) => {
  try {
    const newDocId = `${conflict.docId}_split_${Date.now()}`;
    const duplicateDoc = {
      ...conflict.versionB,
      _id: newDocId
    };
    delete duplicateDoc._rev;
    
    await db.put(duplicateDoc);
    await db.remove(conflict.docId, conflict.conflictRev);
    alert('✓ Conflict resolved. Saved Version B as a distinct record.');
    fetchDatabaseConflicts();
  } catch (err) {
    console.error('Failed to split conflicting document:', err);
    alert('Error splitting conflict.');
  }
};
// ── Barangay Settings / Signatories ──
const [barangaySettings, setBarangaySettings] = useState({
  signatories: {
    secretary: 'MRS. MELY M. PRESADO',
    punongBarangay: 'HON. ANNABELLE E. RULL'
  }
});

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
useEffect(() => {
  const loadSettings = async () => {
    try {
      const doc = await db.get('barangay_settings');
      setBarangaySettings(doc);
    } catch (err) {
      if (err.name === 'not_found') {
        const defaultSettings = {
          _id: 'barangay_settings',
          type: 'barangay_settings',
          signatories: {
            secretary: 'MRS. MELY M. PRESADO',
            punongBarangay: 'HON. ANNABELLE E. RULL'
          }
        };
        await db.put(defaultSettings);
        setBarangaySettings(defaultSettings);
      }
    }
  };
  loadSettings();
}, []);
const pendingRequestsCount = (issuedCertificates || []).filter(
  (c) => c.status === 'Under Review' || c.status === 'Pending' || c.step === 1
).length;

const pendingBlotterCount = blotterList.filter(
  (b) => b.status === 'Open' || b.status === 'Under Mediation'
).length;

const activeFeedbackCount = feedbackList.filter(
  (f) => f.status === 'Pending' || f.status === 'Under Review'
).length;

const handleSelectCtc = (ctc) => {
  setIssuanceMeta(prev => ({
    ...prev,
    ctcNumber: ctc.ctcNo,
    ctcName: ctc.ctcName,
    ctcAmountPaid: ctc.amountPaid,
    ctcDateIssued: ctc.dateIssued,
    placeIssued: ctc.placeIssued
  }));
  setCtcQuery(ctc.ctcNo);
  setShowCtcMatches(false);
};

const handlePrintFormat = (format) => {
  console.log(`Printing format: ${format}`);
  window.print();
};

const handleSaveOnly = async () => {
  if (!selectedCertificate) return;
  try {
    const latestDoc = await db.get(selectedCertificate._id);
    await db.put({
      ...latestDoc,
      issuanceMeta: { ...issuanceMeta, savedAt: new Date().toISOString() },
    });
    alert('Transaction saved successfully.');
  } catch (err) {
    console.error('Save failed:', err);
    alert('Failed to save transaction.');
  }
};


// ── CTC MODAL STATE MANAGEMENT ──
const [showCtcModal, setShowCtcModal] = useState(false);
const [ctcForm, setCtcForm] = useState({
  ctcNo: '',
  rbiNo: '',
  ctcName: '',
  amtPaid: '',
  dateIssued: new Date().toISOString().split('T')[0],
  placeIssued: 'Nabua, Camarines Sur',
  isIssuedByBarangay: true,
});

// Handle saving new CTC record locally to PouchDB engine
const handleSaveCtc = async (e) => {
  e.preventDefault();
  if (!ctcForm.ctcNo.trim() || !ctcForm.amtPaid.trim()) return;

  try {
    const ctcPayload = {
      _id: `ctc_${Date.now()}`,
      type: 'ctc_record',
      rbiNo: ctcForm.rbiNo.trim(),
      ctcNo: ctcForm.ctcNo.trim(),
      ctcName: ctcForm.ctcName.trim() || 'Resident',
      amtPaid: ctcForm.amtPaid,
      dateIssued: ctcForm.dateIssued,
      isIssuedByBarangay: ctcForm.isIssuedByBarangay,
      placeIssued: ctcForm.placeIssued,
      createdAt: new Date().toISOString(),
    };

    // Save record to local offline database (PouchDB)
    if (typeof db !== 'undefined' && db.put) {
      await db.put(ctcPayload);
    }

    // Auto-close modal and fully reset state
    setShowCtcModal(false);
    setCtcForm({
      rbiNo: '',
      ctcNo: '',
      ctcName: '',
      amtPaid: '',
      dateIssued: new Date().toISOString().split('T')[0],
      placeIssued: 'Nabua, Camarines Sur',
      isIssuedByBarangay: true,
    });

    alert('✓ CTC Record successfully saved!');
  } catch (err) {
    console.error('Failed to save CTC record to local database:', err);
    alert('Error saving CTC record.');
  }
};

// ── BUSINESS CLEARANCE FORM STATE ──
const [businessForm, setBusinessForm] = useState({
  // Applicant Information
  bcIdNo: '0156',
  lastName: '',
  firstName: '',
  middleName: '',
  contactNo: '',
  email: '',
  applicantAddress: '',
  applicantBgyCityProv: 'Bustrac, Nabua, Camarines Sur',
  civilStatus: '',
  occupation: '',
  nationality: 'Filipino',
  isFemale: false,
  remarks: '',
  photoUrl: null,

  // Business Information
  regDate: new Date().toISOString().split('T')[0],
  businessName: '',
  natureOfBusiness: '',
  businessCategory: '',
  typeOfBusiness: '',
  storeAreaSqm: '',
  businessAddress: '',
  businessBgyCityProv: 'BUSTRAC, NABUA, CAMARINES SUR',
  businessContactNo: '',
  businessEmail: '',

  // Requirements & Compliance
  cctvEnabled: false,
  sanitaryWasteDisposal: false,
  hasFireExtinguisher: false,
  hasFireExit: false,
  sanitaryCompliant: false,

  // Employee Masterlist
  employeeCount: 0,
  employeeMasterlistName: '',
});


const [businessTab, setBusinessTab] = useState('page1');
const [businessMasterlist, setBusinessMasterlist] = useState([]);

const fetchBusinessClearances = async () => {
  if (typeof db === 'undefined') return;
  try {
    const result = await db.allDocs({ include_docs: true });
    const records = result.rows
      .map(row => row.doc)
      .filter(doc => doc && doc.type === 'business_clearance');
    setBusinessMasterlist(records);
  } catch (err) {
    console.error('Failed to fetch business clearances:', err);
  }
};

// Auto-fetch records when navigating to business clearance screen
useEffect(() => {
  if (screen === 'business_clearance') {
    fetchBusinessClearances();
  }
}, [screen]);

// ── POUCHDB SAVE / UPDATE HANDLER ──
const handleSaveBusinessClearance = async (e) => {
  e.preventDefault();
  
  if (!businessForm.businessName.trim() || !businessForm.lastName.trim()) {
    alert('Please complete the required Applicant and Business Name fields.');
    return;
  }

  try {
    // Preserve existing _id and _rev if editing, or create new _id if new record
    const payload = {
      ...businessForm,
      _id: businessForm._id || `bus_clearance_${Date.now()}`,
      type: 'business_clearance',
      updatedAt: new Date().toISOString(),
      createdAt: businessForm.createdAt || new Date().toISOString(),
    };

    if (typeof db !== 'undefined' && db.put) {
      await db.put(payload);
    }

    // Refresh masterlist automatically
    await fetchBusinessClearances();
    
    alert(businessForm._id ? '✓ Business Clearance updated successfully!' : '✓ Business Clearance entry saved successfully!');

    // Reset Form & Set Next ID
    const nextId = String(parseInt(businessForm.bcIdNo || '156') + 1).padStart(4, '0');
    setBusinessForm({
      bcIdNo: nextId,
      lastName: '',
      firstName: '',
      middleName: '',
      contactNo: '',
      email: '',
      applicantAddress: '',
      applicantBgyCityProv: 'Bustrac, Nabua, Camarines Sur',
      civilStatus: '',
      occupation: '',
      nationality: 'Filipino',
      isFemale: false,
      remarks: '',
      photoUrl: null,
      regDate: new Date().toISOString().split('T')[0],
      businessName: '',
      natureOfBusiness: '',
      businessCategory: '',
      typeOfBusiness: '',
      storeAreaSqm: '',
      businessAddress: '',
      businessBgyCityProv: 'BUSTRAC, NABUA, CAMARINES SUR',
      businessContactNo: '',
      businessEmail: '',
      cctvEnabled: false,
      sanitaryWasteDisposal: false,
      hasFireExtinguisher: false,
      hasFireExit: false,
      sanitaryCompliant: false,
      employeeCount: 0,
      employeeMasterlistName: '',
      orNo: '',
      clearanceFee: '',
      garbageFee: '',
    });
    setBusinessTab('page1');
  } catch (err) {
    console.error('Failed to save/update Business Clearance record:', err);
    alert('Error saving record to local database.');
  }
};

const handleEditBusinessClearance = (record) => {
  setBusinessForm(record);
  setBusinessTab('page1');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ── PRINT BUSINESS CLEARANCE STATE & HANDLER ──
const [selectedBusinessCert, setSelectedBusinessCert] = useState(null);
const [showBusinessPrintModal, setShowBusinessPrintModal] = useState(false);

const handlePrintBusinessClearance = (record) => {
  setSelectedBusinessCert(record);
  setShowBusinessPrintModal(true);
};

const handleBarangayToggle = (e) => {
  const isChecked = e.target.checked;
  setCtcForm((prev) => ({
    ...prev,
    isIssuedByBarangay: isChecked,
    placeIssued: isChecked ? 'Nabua, Camarines Sur' : '',
  }));
}; 

const updateCtcField = (field) => (e) => {
  setCtcForm((prev) => ({ ...prev, [field]: e.target.value }));
};
  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="dashboard-shell-container">
      <div className={`app ${sidebarOpen ? 'sidebar-is-open' : 'sidebar-is-closed'}`}>
        {/* ════════════════ SIDEBAR ════════════════ */}
        <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        {/* Logo / App Name */}
        <div className="sb-logo">
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
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
          <div className="sb-nav-group">
          <button
            type="button"
            className={`nav-btn toggle-parent ${['residents', 'households', 'add-resident'].includes(screen) ? 'active-parent' : ''}`}
            onClick={() => {
              if (!sidebarOpen) {
                setSidebarOpen(true);
                setIsResidentsOpen(true);
              } else {
                setIsResidentsOpen(!isResidentsOpen);
              }
            }}
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
        </div>
          

          {/* CERTIFICATES */}
          <div className="sb-sec">Certificates</div>
          <button className={`nav-btn${screen === 'cert-req' ? ' active' : ''}`} onClick={() => nav('cert-req')}>
          <span className="nav-ico">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="M9 15h6" />
            </svg>
          </span>
          Request & Approval 
          {pendingRequestsCount > 0 && (
            <span className="nb nb-amber">{pendingRequestsCount}</span>
          )}
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

          <button className={`nav-btn${screen === 'brgy_clearance' ? ' active' : ''}`} onClick={() => nav('brgy_clearance')}>
            <span className="nav-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M12 18v-6" />
                <path d="M9 15h6" />
              </svg>
            </span>
            Barangay Clearance (Individual)
          </button>

          <button className={`nav-btn${screen === 'business_clearance' ? ' active' : ''}`} onClick={() => nav('business_clearance')}>
          <span className="nav-ico">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <path d="M9 22V12h6v10" />
              <path d="M8 6h.01" />
              <path d="M16 6h.01" />
              <path d="M12 6h.01" />
              <path d="M12 10h.01" />
              <path d="M8 10h.01" />
              <path d="M16 10h.01" />
            </svg>
          </span>
          Business Clearance
        </button>

          {/* AID DISTRIBUTION */}
          <div className="sb-sec">Aid Distribution</div>
          <button
            type="button"
            className={`nav-btn toggle-parent ${['programs', 'aid-encode', 'aid-logs', 'add-beneficiary'].includes(screen) ? 'active-parent' : ''}`}
            onClick={() => {
              if (!sidebarOpen) {
                setSidebarOpen(true);
                setIsAidOpen(true);
              } else {
                setIsAidOpen(!isAidOpen);
              }
            }}
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
            {pendingBlotterCount > 0 && (
              <span className="nb nb-red">{pendingBlotterCount}</span>
            )}
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
            {activeFeedbackCount > 0 && (
              <span className="nb nb-red">{activeFeedbackCount}</span>
            )}
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
                <span className="badge g" style={{ fontSize: '10px' }}>
                  {conflictsList.length}
                </span>
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
                            <div style={{ flex: 1 }}>
                              <div className="al-a">APPROVE_CERT — CERT-2024-088</div>
                              <div className="al-d">Juhairo Macabangon · Approved for Lim, Ana G.</div>
                            </div>
                            <div className="al-t">09:14</div>
                          </div>

                          {/* SYNC OFFLINE */}
                          <div className="al-row">
                            <div style={{ flex: 1 }}>
                              <div className="al-a">SYNC_OFFLINE — 14 records</div>
                              <div className="al-d">Jay Napagal · CouchDB sync completed</div>
                            </div>
                            <div className="al-t">07:45</div>
                          </div>

                          {/* CONFLICT FLAGGED */}
                          <div className="al-row">
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
                        placeholder="Search by name, purok, Resident ID, or RBI ID..."
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
                              const csvHeaders = "Resident ID,RBI ID,Name,Purok,Age,Civil Status,Voter\n";
                              const csvRows = selectedData
                              .map(
                                (r) =>
                                  `"${r.id}","${r.rbiId || ''}","${r.name}","${r.purok}",${r.age},"${r.civilStatus}","${r.voter ? 'Yes' : 'No'}"`
                              )
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
                        <th>RBI ID</th>
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

                            <td style={{ fontFamily: 'var(--mono)' }}> {res.rbiId || '—'} </td>

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
                    <form onSubmit={submitAddResident}>
                      <div
                        className="fp"
                        style={{
                          background: 'var(--surface, rgba(26, 29, 36, 0.4))',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid var(--border, rgba(79, 142, 247, 0.2))',
                          padding: '24px',
                          borderRadius: '12px',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px' }}>
                          
                          {/* ── LEFT SIDEBAR: PHOTO & BARANGAY STATUS ── */}
                          <div style={{ borderRight: '1px solid var(--border)', paddingRight: '20px' }}>
                            <div
                              style={{
                                width: '100%',
                                height: '180px',
                                border: '2px dashed var(--border)',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '12px',
                                background: 'var(--surface2, #111)',
                                overflow: 'hidden',
                              }}
                            >
                              {residentForm.photoUrl ? (
                                <img src={residentForm.photoUrl} alt="Resident" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Picture (.Jpg)</span>
                              )}
                            </div>

                            <button
                              type="button"
                              className="btn btn-g"
                              style={{ width: '100%', marginBottom: '16px' }}
                              onClick={() => {
                                const samplePhoto = prompt('Enter Image URL / Base64 String:');
                                if (samplePhoto) updateResidentField('photoUrl', samplePhoto);
                              }}
                            >
                              📷 Take / Set Photo
                            </button>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={residentForm.isBarangayOfficial}
                                  onChange={(e) => updateResidentField('isBarangayOfficial', e.target.checked)}
                                />
                                Barangay Official
                              </label>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#ef4444' }}>
                                <input
                                  type="checkbox"
                                  checked={residentForm.isDeceased}
                                  onChange={(e) => updateResidentField('isDeceased', e.target.checked)}
                                />
                                Mark as Deceased
                              </label>
                            </div>
                          </div>

                          {/* ── MAIN FORM CONTENT (RBI SECTIONS) ── */}
                          <div>
                            {/* Header / ID Info */}
                            <div className="fg3" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl">RBI ID NO. *</label>
                                <input
                                  type="text"
                                  className="fc"
                                  required
                                  placeholder="05-17-23-005-00000868"
                                  value={residentForm.rbiNo}
                                  onChange={(e) => updateResidentField('rbiNo', e.target.value.toUpperCase())}
                                />
                              </div>
                              <div className="fg">
                                <label className="fl">HOUSEHOLD NUMBER</label>
                                <input
                                  type="text"
                                  className="fc"
                                  placeholder="HH-2026-001"
                                  value={residentForm.householdNo}
                                  onChange={(e) => updateResidentField('householdNo', e.target.value)}
                                />
                              </div>
                              <div className="fg">
                                <label className="fl">FILE DATE UPDATED</label>
                                <input
                                  type="date"
                                  className="fc"
                                  value={residentForm.fileDateUpdated}
                                  onChange={(e) => updateResidentField('fileDateUpdated', e.target.value)}
                                />
                              </div>
                            </div>

                            {/* Full Name Fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 120px', gap: '10px', marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl">LAST NAME *</label>
                                <input type="text" className="fc" required value={residentForm.lastName} onChange={(e) => updateResidentField('lastName', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl">FIRST NAME *</label>
                                <input type="text" className="fc" required value={residentForm.firstName} onChange={(e) => updateResidentField('firstName', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl">MIDDLE NAME</label>
                                <input type="text" className="fc" value={residentForm.middleName} onChange={(e) => updateResidentField('middleName', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl">SUFFIX</label>
                                <input type="text" className="fc" placeholder="Jr / Sr / III" value={residentForm.suffix} onChange={(e) => updateResidentField('suffix', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl">ALIAS</label>
                                <input type="text" className="fc" value={residentForm.alias} onChange={(e) => updateResidentField('alias', e.target.value)} />
                              </div>
                            </div>

                            {/* Birthdate, Age, Sex, LGBTQIA+ */}
                            <div className="fg3" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl">BIRTHDATE *</label>
                                <input
                                  type="date"
                                  className="fc"
                                  required
                                  value={residentForm.birthdate}
                                  onChange={(e) => {
                                    const bdate = e.target.value;
                                    const calculatedAge = bdate ? Math.floor((new Date() - new Date(bdate)) / 31557600000) : 0;
                                    updateResidentField('birthdate', bdate);
                                    updateResidentField('age', calculatedAge > 0 ? calculatedAge : 0);
                                  }}
                                />
                              </div>
                              <div className="fg">
                                <label className="fl">AGE</label>
                                <input type="number" className="fc" readOnly value={residentForm.age} />
                              </div>
                              <div className="fg">
                                <label className="fl">BIRTH PLACE</label>
                                <input type="text" className="fc" value={residentForm.birthPlace} onChange={(e) => updateResidentField('birthPlace', e.target.value)} />
                              </div>
                            </div>

                            <div className="fg2" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl">SEX *</label>
                                <select className="fc" value={residentForm.sex} onChange={(e) => updateResidentField('sex', e.target.value)}>
                                  <option value="Male">Male</option>
                                  <option value="Female">Female</option>
                                </select>
                              </div>
                              <div className="fg" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={residentForm.isLgbtqia}
                                    onChange={(e) => updateResidentField('isLgbtqia', e.target.checked)}
                                  />
                                  LGBTQIA+
                                </label>
                                {residentForm.isLgbtqia && (
                                  <input
                                    type="text"
                                    className="fc"
                                    placeholder="If Yes, Pls. Specify..."
                                    value={residentForm.lgbtqiaSpecification}
                                    onChange={(e) => updateResidentField('lgbtqiaSpecification', e.target.value)}
                                  />
                                )}
                              </div>
                            </div>

                            {/* Civil Status, Citizenship, Religion, Tribe */}
                            <div className="fg2" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl">CIVIL STATUS *</label>
                                <select className="fc" value={residentForm.civilStatus} onChange={(e) => updateResidentField('civilStatus', e.target.value)}>
                                  <option value="Single">Single</option>
                                  <option value="Married">Married</option>
                                  <option value="Widowed">Widowed</option>
                                  <option value="Separated">Separated</option>
                                  <option value="Divorced">Divorced</option>
                                </select>
                              </div>
                              <div className="fg">
                                <label className="fl">CITIZENSHIP</label>
                                <input type="text" className="fc" value={residentForm.citizenship} onChange={(e) => updateResidentField('citizenship', e.target.value)} />
                              </div>
                            </div>

                            <div className="fg2" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl">RELIGION</label>
                                <input type="text" className="fc" value={residentForm.religion} onChange={(e) => updateResidentField('religion', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl">INDIGENOUS TRIBE</label>
                                <input type="text" className="fc" value={residentForm.indigenousTribe} onChange={(e) => updateResidentField('indigenousTribe', e.target.value)} />
                              </div>
                            </div>

                            {/* Physical Attributes */}
                            <div className="fg3" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl">WEIGHT (kg)</label>
                                <input type="number" step="0.1" className="fc" value={residentForm.weightKg} onChange={(e) => updateResidentField('weightKg', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl">HEIGHT (cm)</label>
                                <input type="number" step="0.1" className="fc" value={residentForm.heightCm} onChange={(e) => updateResidentField('heightCm', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl">BLOOD TYPE</label>
                                <select className="fc" value={residentForm.bloodType} onChange={(e) => updateResidentField('bloodType', e.target.value)}>
                                  <option value="">-- Select --</option>
                                  <option value="A+">A+</option>
                                  <option value="A-">A-</option>
                                  <option value="B+">B+</option>
                                  <option value="B-">B-</option>
                                  <option value="AB+">AB+</option>
                                  <option value="AB-">AB-</option>
                                  <option value="O+">O+</option>
                                  <option value="O-">O-</option>
                                </select>
                              </div>
                            </div>

                            {/* Family Roles & Household Status */}
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', background: 'var(--surface2)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={residentForm.isHouseholdHead} onChange={(e) => updateResidentField('isHouseholdHead', e.target.checked)} />
                                Head of Household
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={residentForm.isFamilyHead} onChange={(e) => updateResidentField('isFamilyHead', e.target.checked)} />
                                Head of Family
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={residentForm.isSoloParent} onChange={(e) => updateResidentField('isSoloParent', e.target.checked)} />
                                Solo Parent
                              </label>
                            </div>
                            
                            {/* Relationship to Household Head */}
                            <div className="fg" style={{ marginBottom: '16px' }}>
                              <label className="fl">RELATIONSHIP TO HOUSEHOLD HEAD</label>
                              <input
                                type="text"
                                className="fc"
                                placeholder="e.g. Spouse, Son, Daughter, Self"
                                value={residentForm.relationshipToHouseholdHead}
                                onChange={(e) => updateResidentField('relationshipToHouseholdHead', e.target.value)}
                              />
                            </div>

                            {/* Residency Information */}
                            <div style={{ background: 'var(--surface2)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                              <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={residentForm.isBarangayResident}
                                    onChange={(e) => updateResidentField('isBarangayResident', e.target.checked)}
                                  />
                                  Resident of Barangay?
                                </label>
                              </div>
                              <div className="fg2">
                                <div className="fg">
                                  <label className="fl">RESIDENT SINCE WHEN?</label>
                                  <input
                                    type="date"
                                    className="fc"
                                    value={residentForm.residentSince}
                                    onChange={(e) => updateResidentField('residentSince', e.target.value)}
                                  />
                                </div>
                                <div className="fg">
                                  <label className="fl">STATUS OF RESIDENCY</label>
                                  <select
                                    className="fc"
                                    value={residentForm.residencyStatus}
                                    onChange={(e) => updateResidentField('residencyStatus', e.target.value)}
                                  >
                                    <option value="Permanent">Permanent</option>
                                    <option value="Temporary">Temporary</option>
                                    <option value="Transient">Transient</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* Voter Registration Info */}
                            <div style={{ background: 'var(--surface2)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                              <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                  <input type="checkbox" checked={residentForm.isRegisteredVoter} onChange={(e) => updateResidentField('isRegisteredVoter', e.target.checked)} />
                                  Registered Voter?
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                  <input type="checkbox" checked={residentForm.isVotingLocally} onChange={(e) => updateResidentField('isVotingLocally', e.target.checked)} />
                                  Voting Here?
                                </label>
                              </div>
                              <div className="fg2">
                                <div className="fg">
                                  <label className="fl">PRECINCT NO.</label>
                                  <input type="text" className="fc" value={residentForm.precinctNo} onChange={(e) => updateResidentField('precinctNo', e.target.value)} />
                                </div>
                                <div className="fg">
                                  <label className="fl">VOTING IN OTHER PLACE? (Indicate Place)</label>
                                  <input type="text" className="fc" value={residentForm.votingOtherPlace} onChange={(e) => updateResidentField('votingOtherPlace', e.target.value)} />
                                </div>
                              </div>
                            </div>

                            {/* Address & Contact Info */}
                            <div className="fg2" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl">CONTACT NOS.</label>
                                <input type="text" className="fc" placeholder="09XX-XXX-XXXX" value={residentForm.contactNo} onChange={(e) => updateResidentField('contactNo', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl">EMAIL ADD</label>
                                <input type="email" className="fc" value={residentForm.email} onChange={(e) => updateResidentField('email', e.target.value)} />
                              </div>
                            </div>

                            <div className="fg" style={{ marginBottom: '16px' }}>
                              <label className="fl">ST., LOT NO., SUBD., PUROK/ZONE</label>
                              <input type="text" className="fc" placeholder="Purok 3, Zone 1" value={residentForm.purokZoneAddress} onChange={(e) => updateResidentField('purokZoneAddress', e.target.value)} />
                            </div>

                            <div className="fg" style={{ marginBottom: '20px' }}>
                              <label className="fl">ADDRESS OUTSIDE IN THIS BARANGAY</label>
                              <input type="text" className="fc" value={residentForm.addressOutsideBarangay} onChange={(e) => updateResidentField('addressOutsideBarangay', e.target.value)} />
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                              <button type="button" className="btn btn-g" onClick={() => nav('residents')}>
                                Cancel
                              </button>
                              <button type="submit" className="btn btn-p">
                                 Save Resident Record
                              </button>
                            </div>

                          </div>
                        </div>
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
                           Save Modifications
                        </button>
                      </div>
                    </form>
                  </div>
                )}
           
            {screen === 'add-household' && (
              <div className="screen active">
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
              <div className="tw">
                <div className="tb">
                  <div className="sb-box">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" > <circle cx="11" cy="11" r="7" /> <path d="m21 21-4.3-4.3" /> </svg>
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
                    value={householdPurokFilter}
                    onChange={(e) => setHouseholdPurokFilter(e.target.value)}
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
            const hh = householdsList.find(h => h.id === selectedHouseholdId);
            const familyMembers = residentsList.filter(r => r.household === selectedHouseholdId);

            if (!hh) {
              return (
                <div className="screen active">
                  {/* Error Header with SVG */}
                  <div className="ph">
                    <div>
                      <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                        Household Not Found
                      </div>
                    </div>
                    <button
                      className="btn btn-g"
                      onClick={() => nav('households')}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5" />
                        <path d="M12 19l-7-7 7-7" />
                      </svg>
                      Back to Households
                    </button>
                  </div>

                  {/* Error Card with Glass-Morphism */}
                  <div style={{
                    background: 'rgba(79, 41, 59, 0.4)',
                    border: '1px solid rgba(248, 113, 113, 0.3)',
                    borderRadius: '8px',
                    padding: '24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    backdropFilter: 'blur(8px)',
                    margin: '20px auto',
                    maxWidth: '400px'
                  }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fca5a5', marginBottom: '4px' }}>
                        No Household Found
                      </div>
                      <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                        Please select a valid Household from the list.
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div className="screen active">
                {/* Header with SVG */}
                <div className="ph">
                  <div>
                    <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="M9 22V12h6v10" />
                      </svg>
                      Household Profile Dashboard
                    </div>
                    <div className="ps">Detailed management index for {hh.id}</div>
                  </div>
                  <button
                    className="btn btn-g"
                    onClick={() => nav('households')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5" />
                      <path d="M12 19l-7-7 7-7" />
                    </svg>
                    Back to Households
                  </button>
                </div>

                {/* Two-Column Layout with Glass-Morphism */}
                <div className="tc" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                  {/* Left Column: Household Metadata */}
                  <div style={{
                    background: 'rgba(30, 41, 59, 0.4)',
                    border: '1px solid rgba(79, 142, 247, 0.2)',
                    borderRadius: '8px',
                    padding: '16px',
                    backdropFilter: 'blur(8px)',
                    height: 'fit-content'
                  }}>
                    <div style={{
                      fontWeight: 'bold',
                      marginBottom: '14px',
                      color: '#3b82f6',
                      borderBottom: '1px solid #334155',
                      paddingBottom: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                      Registration Specs
                    </div>

                    <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                      <div style={{ color: '#94a3b8', marginBottom: '2px' }}>Household Head:</div>
                      <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#f8fafc' }}>{hh.head}</div>
                    </div>

                    <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                      <div style={{ color: '#94a3b8', marginBottom: '2px' }}>Barangay Address:</div>
                      <div style={{ fontWeight: 'bold', color: '#cbd5e1' }}>{hh.address}</div>
                    </div>

                    <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                      <div style={{ color: '#94a3b8', marginBottom: '2px' }}>Jurisdiction Area:</div>
                      <span className={`badge ${hh.purokClass}`}>{hh.purok}</span>
                    </div>

                    <div style={{ fontSize: '13px' }}>
                      <div style={{ color: '#94a3b8', marginBottom: '2px' }}>Declared Members Count:</div>
                      <div style={{ fontWeight: 'bold', color: '#eab308' }}>{hh.members} individuals</div>
                    </div>
                  </div>

                  {/* Right Column: Family Roster */}
                  <div style={{
                    background: 'rgba(30, 41, 59, 0.4)',
                    border: '1px solid rgba(79, 142, 247, 0.2)',
                    borderRadius: '8px',
                    padding: '16px',
                    backdropFilter: 'blur(8px)'
                  }}>
                    <div style={{
                      fontWeight: 'bold',
                      marginBottom: '12px',
                      color: '#10b981',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                        Dynamic Family Roster ({familyMembers.length})
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Cross-referenced from Resident Registry</span>
                    </div>

                    {familyMembers.length === 0 ? (
                      <div style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: '#94a3b8',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fafc' }}>No Members Found</div>
                          <div style={{ fontSize: '12px' }}>No individuals are currently linked to this Household ID.</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        background: 'rgba(15, 23, 42, 0.3)',
                        borderRadius: '6px',
                        overflow: 'hidden'
                      }}>
                        <table style={{ width: '100%' }}>
                          <thead>
                            <tr>
                              <th style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: '#94a3b8', padding: '10px 12px', textAlign: 'left' }}>ID</th>
                              <th style={{ fontSize: '11px', color: '#94a3b8', padding: '10px 12px', textAlign: 'left' }}>Name</th>
                              <th style={{ fontSize: '11px', color: '#94a3b8', padding: '10px 12px', textAlign: 'left' }}>Age</th>
                              <th style={{ fontSize: '11px', color: '#94a3b8', padding: '10px 12px', textAlign: 'left' }}>Civil Status</th>
                              <th style={{ fontSize: '11px', color: '#94a3b8', padding: '10px 12px', textAlign: 'left' }}>Voter</th>
                            </tr>
                          </thead>
                          <tbody>
                            {familyMembers.map((member) => (
                              <tr
                                key={member.id}
                                style={{
                                  cursor: 'pointer',
                                  transition: 'background 0.2s ease',
                                  borderBottom: '1px solid rgba(79, 142, 247, 0.1)'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(79, 142, 247, 0.05)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                onClick={() => {
                                  setSelectedResidentId(member.id);
                                  nav('view-resident');
                                }}
                              >
                                <td style={{ fontFamily: 'var(--mono)', color: '#94a3b8', padding: '10px 12px' }}>{member.id}</td>
                                <td style={{ padding: '10px 12px' }}><strong>{member.name}</strong></td>
                                <td style={{ padding: '10px 12px' }}>{member.age}</td>
                                <td style={{ padding: '10px 12px' }}>{member.civilStatus}</td>
                                <td style={{ padding: '10px 12px' }}>
                                  <span className={`badge ${member.voter ? 'g' : 'gr'}`} style={{ fontSize: '10px' }}>
                                    {member.voter ? (
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                        <path d="M22 4L12 14.01l-3-3" />
                                      </svg>
                                    ) : (
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                      </svg>
                                    )}
                                    {member.voter ? 'Voter' : 'Non-Voter'}
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

                <div style={{ marginBottom: '16px' }}>
                  <select
                    className="fc"
                    style={{ width: '100%', maxWidth: '600px' }}
                    value={selectedCertificate?._id || ''}
                    onChange={(e) => {
                      const cert = approvedCertificates.find(c => c._id === e.target.value);
                      setSelectedCertificate(cert || null);
                    }}
                  >
                    <option value="">-- Select Approved Certificate --</option>
                    {approvedCertificates.map((req) => (
                      <option key={req._id} value={req._id}>
                        {req._id} - {req.firstName} {req.lastName} ({req.certificateType})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCertificate ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'start', marginBottom: '24px' }}>
                      {/* LEFT COLUMN: BLOTTER VERIFICATION */}
                      <div className="fp" style={{ margin: 0, background: 'rgba(26, 29, 36, 0.4)', backdropFilter: 'blur(8px)' }}>
                        <div className="fp-t">Blotters Verification</div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', marginBottom: '12px', cursor: 'pointer', color: 'var(--text)', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={issuanceMeta.noDerogatoryRecord}
                            onChange={(e) => setIssuanceMeta({ ...issuanceMeta, noDerogatoryRecord: e.target.checked })}
                          />
                          Respondents Files
                        </label>

                        <input
                          className="fc"
                          placeholder="SEARCH FOR LAST NAME"
                          value={blotterVerifyQuery}
                          onChange={(e) => setBlotterVerifyQuery(e.target.value)}
                          style={{ marginBottom: '10px', fontFamily: 'var(--mono)', fontSize: '12px' }}
                        />

                        <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--surface)', maxHeight: '300px', overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ background: 'var(--surface2)' }}>
                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Last Name</th>
                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>First Name</th>
                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {blotterMatches.length > 0 ? (
                                blotterMatches.map((b, idx) => {
                                  const parts = (b.respondent || b.respName || '').split(',');
                                  return (
                                    <tr key={b.id || b._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                      <td style={{ padding: '8px', color: 'var(--text)' }}>{parts[0]?.trim() || '-'}</td>
                                      <td style={{ padding: '8px', color: 'var(--text)' }}>{parts[1]?.trim() || ''}</td>
                                      <td style={{ padding: '8px' }}>
                                        <span className={`badge ${b.status === 'Resolved' ? 'g' : b.status === 'Under Mediation' ? 'a' : 'r'}`}>
                                          {b.status || 'Open'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan="3" style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: '11px' }}>
                                    {blotterVerifyQuery ? 'No records found.' : 'Type above to search respondents.'}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div style={{ marginTop: '12px', padding: '10px', background: 'var(--surface2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', color: 'var(--text)', fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              id="blotter-check"
                              checked={issuanceMeta.noDerogatoryRecord}
                              onChange={(e) => setIssuanceMeta({ ...issuanceMeta, noDerogatoryRecord: e.target.checked })}
                            />
                            No Derogatory / Respondent Record Found
                          </label>
                        </div>

                        <div style={{ marginTop: '10px', fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Report
                        </div>
                      </div>

                      {/* RIGHT COLUMN: TRANSACTION FORM */}
                      <div>
                        {/* Resident Name Display */}
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '14px 18px', fontSize: '18px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '16px', borderRadius: '8px', fontFamily: 'var(--mono)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                          {`${selectedCertificate.lastName || ''}, ${selectedCertificate.firstName || ''} ${selectedCertificate.middleName || ''}`.trim()}
                        </div>

                        {/* RECEIPT DETAILS */}
                        <div className="fp" style={{ marginBottom: '16px', marginTop: 0 }}>
                          <div className="fp-t" style={{ background: 'rgba(79, 142, 247, 0.15)', color: 'var(--accent)', padding: '8px 12px', margin: '-20px -20px 14px -20px', borderRadius: '8px 8px 0 0', borderBottom: '1px solid rgba(79, 142, 247, 0.2)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                            Receipt Details and other Information
                          </div>
                          <div className="fg2">
                            <div className="fg">
                              <label className="fl">PURPOSE <span style={{ color: 'var(--red)' }}>*</span></label>
                              <input className="fc" value={issuanceMeta.purpose || selectedCertificate.purpose || ''} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, purpose: e.target.value })} />
                            </div>
                            <div className="fg">
                              <label className="fl">REMARKS</label>
                              <input className="fc" value={issuanceMeta.remarks} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, remarks: e.target.value })} />
                            </div>
                          </div>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">VALIDITY <span style={{ color: 'var(--red)' }}>*</span></label>
                            <select className="fc" value={issuanceMeta.validity} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, validity: e.target.value })}>
                              <option value="6 months">(6) Six Months Validity</option>
                              <option value="1 year">(12) One Year Validity</option>
                            </select>
                          </div>
                          <div className="fg3" style={{ marginTop: '12px', marginBottom: 0 }}>
                            <div className="fg">
                              <label className="fl">DATE ISSUED <span style={{ color: 'var(--red)' }}>*</span></label>
                              <input type="date" className="fc" value={issuanceMeta.dateIssued} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, dateIssued: e.target.value })} />
                            </div>
                            <div className="fg">
                              <label className="fl">OR NO. <span style={{ color: 'var(--red)' }}>*</span></label>
                              <input className="fc" value={issuanceMeta.orNumber} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, orNumber: e.target.value })} />
                            </div>
                            <div className="fg">
                              <label className="fl">AMT. PAID <span style={{ color: 'var(--red)' }}>*</span></label>
                              <input type="number" className="fc" value={issuanceMeta.amountPaid} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, amountPaid: e.target.value })} />
                            </div>
                          </div>
                        </div>

                        {/* CTC DETAILS */}
                        <div className="fp" style={{ marginBottom: '16px', marginTop: 0 }}>
                          <div className="fp-t" style={{ background: 'rgba(79, 142, 247, 0.15)', color: 'var(--accent)', padding: '8px 12px', margin: '-20px -20px 14px -20px', borderRadius: '8px 8px 0 0', borderBottom: '1px solid rgba(79, 142, 247, 0.2)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                            CTC Details
                          </div>
                          <div style={{ position: 'relative', marginBottom: '14px' }}>
                            <label className="fl">SELECT CTC NO. from CTC TABLE</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input 
                                className="fc" 
                                style={{ fontSize: '13px' }} 
                                placeholder="Select CTC Number..." 
                                value={ctcQuery} 
                                onChange={(e) => { 
                                  setCtcQuery(e.target.value); 
                                  setShowCtcMatches(true); 
                                }} 
                                onFocus={() => setShowCtcMatches(true)} 
                              />
                              {/* SVG Add CTC Modal Trigger Button */}
                              <button 
  type="button" 
  className="btn btn-g" 
  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 10px', fontWeight: 600, fontSize: '12px' }} 
  onClick={() => setShowCtcModal(true)}
  title="Add New CTC Record"
>
  {/* SVG Plus Icon */}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
  Add CTC
</button>
                            </div>

                            {/* Auto-complete Matches Dropdown */}
                            {showCtcMatches && ctcQuery && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', zIndex: 50, maxHeight: '160px', overflowY: 'auto', marginTop: '4px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}>
                                {ctcMasterlist
                                  .filter(c => c.ctcNo.includes(ctcQuery) || c.ctcName.toLowerCase().includes(ctcQuery.toLowerCase()))
                                  .map(ctc => (
                                    <div 
                                      key={ctc._id} 
                                      onClick={() => handleSelectCtc(ctc)} 
                                      style={{ padding: '10px 12px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(79, 142, 247, 0.1)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                      <strong>{ctc.ctcNo}</strong> - {ctc.ctcName}
                                    </div>
                                  ))}
                                {ctcMasterlist.filter(c => c.ctcNo.includes(ctcQuery) || c.ctcName.toLowerCase().includes(ctcQuery.toLowerCase())).length === 0 && (
                                  <div style={{ padding: '10px', fontSize: '12px', color: 'var(--muted)' }}>No CTC records found.</div>
                                )}
                              </div>
                            )}
                            </div>
                            <div className="fp" style={{ background: 'var(--surface)', border: '1px solid var(--border)', margin: 0 }}>
                              <div className="fp-t" style={{ fontSize: '12px', marginBottom: '10px' }}>CTC INFORMATION</div>
                              <div className="fg">
                                <label className="fl">CTC / NAME</label>
                                <input className="fc" value={issuanceMeta.ctcName || `${selectedCertificate.firstName || ''} ${selectedCertificate.lastName || ''}`.trim()} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, ctcName: e.target.value })} />
                              </div>
                              <div className="fg3">
                                <div className="fg">
                                  <label className="fl">CTC NO.</label>
                                  <input className="fc" value={issuanceMeta.ctcNumber} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, ctcNumber: e.target.value })} />
                                </div>
                                <div className="fg">
                                  <label className="fl">CTC AMT. PAID</label>
                                  <input type="number" className="fc" value={issuanceMeta.ctcAmountPaid} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, ctcAmountPaid: e.target.value })} />
                                </div>
                                <div className="fg">
                                  <label className="fl">CTC DATE ISSUED</label>
                                  <input type="date" className="fc" value={issuanceMeta.ctcDateIssued || issuanceMeta.dateIssued} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, ctcDateIssued: e.target.value })} />
                                </div>
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">PLACE ISSUED</label>
                                <input className="fc" value={issuanceMeta.placeIssued} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, placeIssued: e.target.value })} />
                              </div>
                            </div>
                            </div>

                            {/* REPORT SIGNATORIES */}
                            <div className="fp" style={{ marginBottom: '16px', marginTop: 0 }}>
                              <div className="fp-t" style={{ background: 'rgba(79, 142, 247, 0.15)', color: 'var(--accent)', padding: '8px 12px', margin: '-20px -20px 14px -20px', borderRadius: '8px 8px 0 0', borderBottom: '1px solid rgba(79, 142, 247, 0.2)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                                Report Signatories
                              </div>
                              <div className="fg2" style={{ marginBottom: 0 }}>
                                <div className="fg">
                                  <label className="fl">SECRETARY</label>
                                  <select className="fc" value={issuanceMeta.secretary || barangaySettings.signatories?.secretary || 'MRS. MELY M. PRESADO'} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, secretary: e.target.value })}>
                                    <option>MRS. MELY M. PRESADO</option>
                                    <option>Other Secretary</option>
                                  </select>
                                </div>
                                <div className="fg">
                                  <label className="fl">PUNONG BARANGAY</label>
                                  <select className="fc" value={issuanceMeta.punongBarangay || barangaySettings.signatories?.punongBarangay || 'HON. ANNABELLE E. RULL'} onChange={(e) => setIssuanceMeta({ ...issuanceMeta, punongBarangay: e.target.value })}>
                                    <option>HON. ANNABELLE E. RULL</option>
                                    <option>Other Punong Barangay</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* ACTION BUTTONS: PRINT(a), PRINT(b), SAVE */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                              <button type="button" className="btn btn-g" onClick={() => handlePrintFormat('a')} style={{ minWidth: '100px', justifyContent: 'center' }}>
                                PRINT(a)
                              </button>
                              <button type="button" className="btn btn-g" onClick={() => handlePrintFormat('b')} style={{ minWidth: '100px', justifyContent: 'center' }}>
                                PRINT(b)
                              </button>
                              <button type="button" className="btn btn-p" onClick={handleSaveOnly} style={{ minWidth: '100px', justifyContent: 'center' }}>
                                SAVE
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* CERTIFICATE PREVIEW */}
                        {selectedCertificate && (
                          <div style={{ marginTop: '24px' }}>
                            <div className="cert-p" id="printable-certificate-card" style={{ position: 'relative', padding: '40px', background: '#ffffff', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', color: '#1e293b', overflow: 'hidden', marginBottom: '24px' }}>
                              {Number(selectedCertificate.step) === 5 && (
                                <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%) rotate(-25deg)', fontSize: '75px', fontWeight: '900', color: 'rgba(22, 163, 74, 0.09)', border: '8px double rgba(22, 163, 74, 0.15)', padding: '10px 40px', borderRadius: '16px', letterSpacing: '6px', pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap', zIndex: 1 }}>
                                  RELEASED / ISSUED
                                </div>
                              )}
                              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                <h2 style={{ fontSize: '14px', margin: 0, color: '#475569', fontWeight: 'normal', textTransform: 'uppercase' }}>Republic of the Philippines</h2>
                                <h2 style={{ fontSize: '18px', margin: '4px 0', color: '#0f172a', fontWeight: 'bold', textTransform: 'uppercase' }}>Barangay Bustrac</h2>
                                <h3 style={{ fontSize: '13px', margin: 0, color: '#64748b', fontStyle: 'italic' }}>Municipality of Nabua, Camarines Sur</h3>
                              </div>
                              <hr style={{ borderColor: '#0f172a', borderWidth: '1.5px', margin: '12px 0' }} />
                              <h2 style={{ textAlign: 'center', margin: '24px 0', color: '#2563eb', letterSpacing: '1.5px', fontSize: '22px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                {((selectedCertificate.certificateType || 'CERTIFICATE').toString()).toUpperCase()}
                              </h2>
                              <hr style={{ borderColor: '#0f172a', borderWidth: '1.5px', margin: '12px 0' }} />
                              <p style={{ marginTop: '28px', lineHeight: '2', color: '#1e293b', textIndent: '40px', textAlign: 'justify', fontSize: '15px' }}>
                                This is to certify that <strong>{`${selectedCertificate.firstName || ''} ${selectedCertificate.lastName || ''}`.trim().toUpperCase()}</strong>, of legal age, a <em>bona fide</em> resident of <strong>{selectedCertificate.purok || (typeof residentsList !== 'undefined' && residentsList.find(r => r.name?.toLowerCase().includes(selectedCertificate.lastName?.toLowerCase() || ''))?.purok) || 'Purok 1'}</strong>, Barangay Bustrac, Nabua, Camarines Sur, has been found to be of <strong>good moral character</strong> and has no derogatory record or pending criminal case on file in this jurisdiction as of this date.
                              </p>
                              <p style={{ marginTop: '20px', lineHeight: '2', color: '#1e293b', textIndent: '40px', textAlign: 'justify', fontSize: '15px' }}>
                                This certification is issued upon the request of the above-named person for <strong>{selectedCertificate.purpose || 'any legal purpose'}</strong> and for whatever legal intent it may serve.
                              </p>
                              {(selectedCertificate.ctc || issuanceMeta.ctcNumber) && (
                                <div style={{ marginTop: '24px', padding: '14px 18px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#334155' }}>
                                  <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#0f172a', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Community Tax Certificate (CTC)</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', lineHeight: '1.6' }}>
                                    <div><strong>Name:</strong> {selectedCertificate.ctc?.name || issuanceMeta.ctcName}</div>
                                    <div><strong>O.R. No.:</strong> {selectedCertificate.ctc?.number || issuanceMeta.ctcNumber}</div>
                                    <div><strong>Amount Paid:</strong> PHP {Number(selectedCertificate.ctc?.amountPaid || issuanceMeta.ctcAmountPaid || 0).toFixed(2)}</div>
                                    <div><strong>Date Issued:</strong> {selectedCertificate.ctc?.dateIssued || issuanceMeta.ctcDateIssued}</div>
                                    <div style={{ gridColumn: '1 / -1' }}><strong>Place Issued:</strong> {selectedCertificate.ctc?.placeIssued || issuanceMeta.placeIssued}</div>
                                  </div>
                                </div>
                              )}
                              <div style={{ marginTop: '60px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <div style={{ textAlign: 'center', marginRight: '20px' }}>
                                  {selectedCertificate.orNumber && (
                                    <div style={{ color: '#475569', fontSize: '13px', marginBottom: '8px', fontFamily: 'var(--mono)' }}>O.R. No.: <strong>{selectedCertificate.orNumber}</strong></div>
                                  )}
                                  <div style={{ color: '#475569', fontSize: '13px', marginBottom: '35px' }}>Issued on: {selectedCertificate.date_issued || selectedCertificate.updatedAt || selectedCertificate.createdAt || 'Today'}</div>
                                  <strong style={{ color: '#0f172a', display: 'block', borderTop: '1px solid #0f172a', paddingTop: '8px', minWidth: '240px', fontSize: '15px', textTransform: 'uppercase' }}>
                                    {issuanceMeta.punongBarangay || barangaySettings.signatories?.punongBarangay || 'HON. ANNABELLE E. RULL'}
                                  </strong>
                                  <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>Punong Barangay</div>
                                </div>
                              </div>
                            </div>

                            {/* ISSUED HISTORY LOG */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div>
                                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    Issued History Log
                                  </div>
                                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Official registry of previously printed and released community certificates</div>
                                </div>
                                <span className="badge gr" style={{ padding: '6px 12px' }}>Total Issued: {strictlyIssuedCertificates.length}</span>
                              </div>
                              <div className="tw" style={{ background: 'rgba(26, 29, 36, 0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(79, 142, 247, 0.2)', borderRadius: '8px' }}>
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
                                        <td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>No historical issuance records found.</td>
                                      </tr>
                                    ) : (
                                      strictlyIssuedCertificates.map((req) => {
                                        const residentName = `${req.firstName || ''} ${req.lastName || ''}`.trim();
                                        const certificateType = req.certificateType || req.certType || 'Certificate';
                                        const isSelected = selectedCertificate?._id === req._id;
                                        return (
                                          <tr key={req._id} onClick={() => setSelectedCertificate(req)} style={{ cursor: 'pointer', background: isSelected ? 'rgba(59, 130, 246, 0.12)' : undefined, borderLeft: isSelected ? '3px solid var(--accent)' : 'none' }}>
                                            <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{req._id}</td>
                                            <td><strong>{residentName || 'Unnamed Resident'}</strong></td>
                                            <td><span className="badge t">{certificateType}</span></td>
                                            <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{req.issuedAt ? new Date(req.issuedAt).toLocaleDateString() : 'Recent'}</td>
                                            <td>
                                              <button className="btn btn-g btn-sm" onClick={(event) => { event.stopPropagation(); setSelectedCertificate(req); setTimeout(() => { window.print(); }, 350); }} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                      </>
                    ) : (
                      <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                        Please select an approved certificate from the dropdown above to proceed.
                      </div>
                    )}
                  </div>
              )}
            
                {screen === 'brgy_clearance' && (
                <div className="screen active">

                  {/* ── CLEARANCE DATA CAPTURE FORM ── */}
                  <form onSubmit={handleSaveClearance}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

                      {/* LEFT COLUMN: RESIDENT & BLOTTER VERIFICATION */}
                      <div className="fp" style={{ margin: 0, padding: '16px' }}>
                        <div className="fp-t" style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                          APPLICANT & BLOTTER VERIFICATION
                        </div>

                        <div className="fg2" style={{ marginBottom: '10px' }}>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">CLEARANCE NO. *</label>
                            <input type="text" className="fc" readOnly style={{ fontWeight: 'bold', opacity: 0.8 }} value={clearanceForm.clearanceNo} />
                          </div>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">DATE ISSUED</label>
                            <input type="date" className="fc" value={clearanceForm.dateIssued} onChange={(e) => setClearanceForm({ ...clearanceForm, dateIssued: e.target.value })} />
                          </div>
                        </div>

                        <div className="fg" style={{ marginBottom: '10px' }}>
                          <label className="fl">RESIDENT FULL NAME (LAST NAME, FIRST NAME MIDDLE) *</label>
                          <input type="text" className="fc" required placeholder="e.g. PANIZAL, JOAN REBUSQUILLO" value={clearanceForm.fullName} onChange={(e) => setClearanceForm({ ...clearanceForm, fullName: e.target.value })} />
                        </div>

                        <div className="fg" style={{ marginBottom: '10px' }}>
                          <label className="fl">PURPOSE OF CLEARANCE *</label>
                          <input type="text" className="fc" required placeholder="e.g. Employment Requirement, Local Travel, License" value={clearanceForm.purpose} onChange={(e) => setClearanceForm({ ...clearanceForm, purpose: e.target.value })} />
                        </div>

                        <div className="fg2" style={{ marginBottom: '10px' }}>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">REMARKS</label>
                            <input type="text" className="fc" value={clearanceForm.remarks} onChange={(e) => setClearanceForm({ ...clearanceForm, remarks: e.target.value })} />
                          </div>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">VALIDITY</label>
                            <input type="text" className="fc" value={clearanceForm.validity} onChange={(e) => setClearanceForm({ ...clearanceForm, validity: e.target.value })} />
                          </div>
                        </div>

                        {/* BLOTTER RECORD STATUS CARD */}
                        <div style={{ padding: '12px', borderRadius: '6px', background: clearanceForm.hasBlotterRecord ? '#fef2f2' : 'var(--surface)', border: `1px solid ${clearanceForm.hasBlotterRecord ? '#fca5a5' : 'var(--border)'}`, marginTop: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: clearanceForm.hasBlotterRecord ? '#b91c1c' : 'var(--text)' }}>
                              BLOTTER RECORD STATUS:
                            </div>
                            <label style={{ fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                              <input type="checkbox" checked={clearanceForm.hasBlotterRecord} onChange={(e) => setClearanceForm({ ...clearanceForm, hasBlotterRecord: e.target.checked, remarks: e.target.checked ? 'With Active Blotter Case' : 'No Derogatory Record' })} />
                              Mark as Respondent/With Blotter
                            </label>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                            {clearanceForm.hasBlotterRecord ? '⚠️ Warning: Applicant has pending blotter entries on local registry.' : '✓ Verified: Clean record on local barangay blotter masterlist.'}
                          </div>
                        </div>
                      </div>

                      {/* RIGHT COLUMN: RECEIPT, CTC & SIGNATORIES */}
                      <div className="fp" style={{ margin: 0, padding: '16px' }}>
                        <div className="fp-t" style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                          RECEIPT, CTC & REPORT SIGNATORIES
                        </div>

                        {/* O.R. DETAILS */}
                        <div className="fg2" style={{ marginBottom: '10px' }}>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">O.R. NUMBER</label>
                            <input type="text" className="fc" placeholder="e.g. 1234567" value={clearanceForm.orNo} onChange={(e) => setClearanceForm({ ...clearanceForm, orNo: e.target.value })} />
                          </div>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">CLEARANCE FEE (₱)</label>
                            <input type="number" className="fc" value={clearanceForm.amtPaid} onChange={(e) => setClearanceForm({ ...clearanceForm, amtPaid: e.target.value })} />
                          </div>
                        </div>

                        {/* CTC DETAILS SECTION */}
                        <div style={{ border: '1px dashed var(--border)', padding: '12px', borderRadius: '6px', background: 'var(--surface)', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700 }}>COMMUNITY TAX CERTIFICATE (CTC) DETAILS</span>
                            <button type="button" className="btn btn-g" style={{ padding: '2px 8px', fontSize: '10px', fontWeight: 700 }} onClick={() => setShowCtcModal(true)}>
                              + Issue / Record CTC
                            </button>
                          </div>

                          <div className="fg2" style={{ marginBottom: '6px' }}>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">CTC NO.</label>
                              <input type="text" className="fc" placeholder="e.g. CTC-00981" value={clearanceForm.ctcNo} onChange={(e) => setClearanceForm({ ...clearanceForm, ctcNo: e.target.value })} />
                            </div>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">CTC AMT. PAID (₱)</label>
                              <input type="number" className="fc" value={clearanceForm.ctcAmtPaid} onChange={(e) => setClearanceForm({ ...clearanceForm, ctcAmtPaid: e.target.value })} />
                            </div>
                          </div>

                          <div className="fg2" style={{ marginBottom: 0 }}>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">CTC DATE ISSUED</label>
                              <input type="date" className="fc" value={clearanceForm.ctcDateIssued} onChange={(e) => setClearanceForm({ ...clearanceForm, ctcDateIssued: e.target.value })} />
                            </div>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">PLACE ISSUED</label>
                              <input type="text" className="fc" value={clearanceForm.ctcPlaceIssued} onChange={(e) => setClearanceForm({ ...clearanceForm, ctcPlaceIssued: e.target.value })} />
                            </div>
                          </div>
                        </div>

                        {/* SIGNATORIES */}
                        <div className="fg2" style={{ marginBottom: 0 }}>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">BARANGAY SECRETARY</label>
                            <input type="text" className="fc" value={clearanceForm.secretary} onChange={(e) => setClearanceForm({ ...clearanceForm, secretary: e.target.value })} />
                          </div>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">PUNONG BARANGAY</label>
                            <input type="text" className="fc" value={clearanceForm.captain} onChange={(e) => setClearanceForm({ ...clearanceForm, captain: e.target.value })} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* FORM ACTION BUTTONS */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '24px' }}>
                      <button type="button" className="btn btn-g" onClick={resetClearanceForm}>
                        Clear Form
                      </button>
                      <button type="submit" className="btn btn-p" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {clearanceForm._id ? 'Update Clearance Record' : 'Save & Issue Clearance'}
                      </button>
                    </div>
                  </form>

                  {/* ── REGISTERED BARANGAY CLEARANCES MASTERLIST TABLE ── */}
                  <div className="card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                        Issued Individual Barangay Clearances ({clearanceList.length})
                      </h4>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '8px' }}>Clearance No.</th>
                            <th style={{ padding: '8px' }}>Resident Full Name</th>
                            <th style={{ padding: '8px' }}>Purpose</th>
                            <th style={{ padding: '8px' }}>Date Issued</th>
                            <th style={{ padding: '8px' }}>O.R. No.</th>
                            <th style={{ padding: '8px' }}>Amount</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clearanceList.length === 0 ? (
                            <tr>
                              <td colSpan="7" style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)' }}>
                                No individual barangay clearances found in local database.
                              </td>
                            </tr>
                          ) : (
                            clearanceList.map((rec) => (
                              <tr key={rec._id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px', fontWeight: 'bold' }}>{rec.clearanceNo}</td>
                                <td style={{ padding: '8px', textTransform: 'uppercase' }}>{rec.fullName}</td>
                                <td style={{ padding: '8px' }}>{rec.purpose}</td>
                                <td style={{ padding: '8px' }}>{rec.dateIssued}</td>
                                <td style={{ padding: '8px' }}>{rec.orNo || 'N/A'}</td>
                                <td style={{ padding: '8px' }}>₱{parseFloat(rec.amtPaid || 0).toFixed(2)}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                    <button type="button" className="btn btn-g" style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => handleEditClearance(rec)}>
                                      Edit
                                    </button>
                                    <button type="button" className="btn btn-p" style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => handlePrintClearance(rec)}>
                                      Print
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                )}

            {/* ════════════════════════════════════════
                SCREEN: BUSINESS CLEARANCE DATA ENTRY
                ════════════════════════════════════════ */}
                {screen === 'business_clearance' && (
                  <div className="screen active">

                    {/* ── TAB BUTTONS (PAGE 1 / PAGE 2) ── */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '2px solid var(--border)', paddingBottom: '2px' }}>
                      <button 
                        type="button" 
                        className={`btn ${businessTab === 'page1' ? 'btn-p' : 'btn-g'}`} 
                        style={{ padding: '6px 18px', fontWeight: 700, fontSize: '12px' }} 
                        onClick={() => setBusinessTab('page1')} 
                      > 
                        Page 1 (Data Entry) 
                      </button> 
                      <button 
                        type="button" 
                        className={`btn ${businessTab === 'page2' ? 'btn-p' : 'btn-g'}`} 
                        style={{ padding: '6px 18px', fontWeight: 700, fontSize: '12px' }} 
                        onClick={() => setBusinessTab('page2')} 
                      > 
                        Page 2 (O.R. & Assessment Details) 
                      </button> 
                    </div>

                    {/* SINGLE FORM WRAPPER FOR BOTH TABS */}
                    <form onSubmit={handleSaveBusinessClearance}>
                      
                      {/* ── PAGE 1 CONTENT ── */}
                      <div style={{ display: businessTab === 'page1' ? 'block' : 'none' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                          
                          {/* LEFT COLUMN: APPLICANT INFORMATION */}
                          <div className="fp" style={{ margin: 0, padding: '16px' }}>
                            <div className="fp-t" style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                              APPLICANTS INFORMATION
                            </div>

                            <div className="fg2" style={{ marginBottom: '10px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">BC ID NO. *</label>
                                <input type="text" className="fc" readOnly style={{ fontWeight: 'bold', opacity: 0.8 }} value={businessForm.bcIdNo} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">CIVIL STATUS</label>
                                <input type="text" className="fc" placeholder="Single / Married" value={businessForm.civilStatus} onChange={(e) => setBusinessForm({ ...businessForm, civilStatus: e.target.value })} />
                              </div>
                            </div>

                            <div className="fg3" style={{ marginBottom: '10px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">LAST NAME *</label>
                                <input type="text" className="fc" required value={businessForm.lastName} onChange={(e) => setBusinessForm({ ...businessForm, lastName: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">FIRST NAME *</label>
                                <input type="text" className="fc" required value={businessForm.firstName} onChange={(e) => setBusinessForm({ ...businessForm, firstName: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">MIDDLE NAME</label>
                                <input type="text" className="fc" value={businessForm.middleName} onChange={(e) => setBusinessForm({ ...businessForm, middleName: e.target.value })} />
                              </div>
                            </div>

                            <div className="fg2" style={{ marginBottom: '10px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">CONTACT NOS.</label>
                                <input type="text" className="fc" placeholder="09123456789" value={businessForm.contactNo} onChange={(e) => setBusinessForm({ ...businessForm, contactNo: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">EMAIL ADDRESS</label>
                                <input type="email" className="fc" placeholder="applicant@email.com" value={businessForm.email} onChange={(e) => setBusinessForm({ ...businessForm, email: e.target.value })} />
                              </div>
                            </div>

                            <div className="fg" style={{ marginBottom: '10px' }}>
                              <label className="fl">HOUSE NO./BLDG./PUROK/STREET/SUBDIVISION</label>
                              <input type="text" className="fc" value={businessForm.applicantAddress} onChange={(e) => setBusinessForm({ ...businessForm, applicantAddress: e.target.value })} />
                            </div>

                            <div className="fg" style={{ marginBottom: '10px' }}>
                              <label className="fl">BARANGAY / CITY-MUNICIPALITY / PROVINCE</label>
                              <input type="text" className="fc" value={businessForm.applicantBgyCityProv} onChange={(e) => setBusinessForm({ ...businessForm, applicantBgyCityProv: e.target.value })} />
                            </div>

                            <div className="fg2" style={{ marginBottom: '10px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">OCCUPATION</label>
                                <input type="text" className="fc" value={businessForm.occupation} onChange={(e) => setBusinessForm({ ...businessForm, occupation: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">NATIONALITY</label>
                                <input type="text" className="fc" value={businessForm.nationality} onChange={(e) => setBusinessForm({ ...businessForm, nationality: e.target.value })} />
                              </div>
                            </div>

                            <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input type="checkbox" id="isFemaleCheck" checked={businessForm.isFemale} onChange={(e) => setBusinessForm({ ...businessForm, isFemale: e.target.checked })} />
                              <label htmlFor="isFemaleCheck" style={{ fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}> GENDER: is Female? </label>
                            </div>

                            <div className="fg2" style={{ marginTop: '12px', marginBottom: 0 }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">REMARKS</label>
                                <textarea className="fc" rows="3" style={{ resize: 'none' }} value={businessForm.remarks} onChange={(e) => setBusinessForm({ ...businessForm, remarks: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0, textAlign: 'center' }}>
                                <label className="fl">PICTURE (.JPG)</label>
                                <div style={{ border: '1px dashed var(--border)', borderRadius: '6px', padding: '12px', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', overflow: 'hidden' }}>
                                  {businessForm.photoUrl ? (
                                    <img src={businessForm.photoUrl} alt="Applicant" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                                  ) : (
                                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>No Image Captured</span>
                                  )}
                                </div>
                                <label className="btn btn-g" style={{ width: '100%', marginTop: '6px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                    <circle cx="12" cy="13" r="4"/>
                                  </svg> Upload / Take Picture
                                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onloadend = () => setBusinessForm(prev => ({ ...prev, photoUrl: reader.result }));
                                      reader.readAsDataURL(file);
                                    }
                                  }} />
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* RIGHT COLUMN: BUSINESS INFORMATION & REQUIREMENTS */}
                          <div className="fp" style={{ margin: 0, padding: '16px' }}>
                            <div className="fp-t" style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                              BUSINESS INFORMATION AND OTHER REQUIREMENTS
                            </div>

                            <div className="fg2" style={{ marginBottom: '10px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">DATE OF REGISTRATION</label>
                                <input type="date" className="fc" value={businessForm.regDate} onChange={(e) => setBusinessForm({ ...businessForm, regDate: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">STORE AREA (SQM)</label>
                                <input type="number" className="fc" placeholder="e.g. 25" value={businessForm.storeAreaSqm} onChange={(e) => setBusinessForm({ ...businessForm, storeAreaSqm: e.target.value })} />
                              </div>
                            </div>

                            <div className="fg" style={{ marginBottom: '10px' }}>
                              <label className="fl">BUSINESS NAME *</label>
                              <input type="text" className="fc" required placeholder="e.g. Bustrac Convenience Store" value={businessForm.businessName} onChange={(e) => setBusinessForm({ ...businessForm, businessName: e.target.value })} />
                            </div>

                            <div className="fg3" style={{ marginBottom: '10px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">NATURE OF BUSINESS</label>
                                <input type="text" className="fc" placeholder="Retail / Wholesale" value={businessForm.natureOfBusiness} onChange={(e) => setBusinessForm({ ...businessForm, natureOfBusiness: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">BUSINESS CATEGORY</label>
                                <input type="text" className="fc" value={businessForm.businessCategory} onChange={(e) => setBusinessForm({ ...businessForm, businessCategory: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">TYPE OF BUSINESS</label>
                                <input type="text" className="fc" placeholder="Single Prop / Corp" value={businessForm.typeOfBusiness} onChange={(e) => setBusinessForm({ ...businessForm, typeOfBusiness: e.target.value })} />
                              </div>
                            </div>

                            <div className="fg" style={{ marginBottom: '10px' }}>
                              <label className="fl">BUSINESS ADDRESS (HOUSE/BLDG/PUROK/STREET)</label>
                              <input type="text" className="fc" value={businessForm.businessAddress} onChange={(e) => setBusinessForm({ ...businessForm, businessAddress: e.target.value })} />
                            </div>

                            <div className="fg" style={{ marginBottom: '10px' }}>
                              <label className="fl">BARANGAY / CITY-MUNICIPALITY / PROVINCE</label>
                              <input type="text" className="fc" value={businessForm.businessBgyCityProv} onChange={(e) => setBusinessForm({ ...businessForm, businessBgyCityProv: e.target.value })} />
                            </div>

                            <div className="fg2" style={{ marginBottom: '12px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">CONTACT NOS.</label>
                                <input type="text" className="fc" value={businessForm.businessContactNo} onChange={(e) => setBusinessForm({ ...businessForm, businessContactNo: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">EMAIL ADDRESS</label>
                                <input type="email" className="fc" value={businessForm.businessEmail} onChange={(e) => setBusinessForm({ ...businessForm, businessEmail: e.target.value })} />
                              </div>
                            </div>

                            {/* CHECKBOXES & COMPLIANCE */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '12px' }}>
                              <label style={{ fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input type="checkbox" checked={businessForm.cctvEnabled} onChange={(e) => setBusinessForm({ ...businessForm, cctvEnabled: e.target.checked })} /> CCTV Enable?
                              </label>
                              <label style={{ fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input type="checkbox" checked={businessForm.sanitaryWasteDisposal} onChange={(e) => setBusinessForm({ ...businessForm, sanitaryWasteDisposal: e.target.checked })} /> Sanitary Waste Disposal
                              </label>
                              <label style={{ fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input type="checkbox" checked={businessForm.hasFireExtinguisher} onChange={(e) => setBusinessForm({ ...businessForm, hasFireExtinguisher: e.target.checked })} /> With Fire Extinguisher
                              </label>
                              <label style={{ fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input type="checkbox" checked={businessForm.hasFireExit} onChange={(e) => setBusinessForm({ ...businessForm, hasFireExit: e.target.checked })} /> With Fire Exit
                              </label>
                              <label style={{ fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', gridColumn: 'span 2' }}>
                                <input type="checkbox" checked={businessForm.sanitaryCompliant} onChange={(e) => setBusinessForm({ ...businessForm, sanitaryCompliant: e.target.checked })} /> Sanitary/Health Compliant
                              </label>
                            </div>

                            <div className="fg2" style={{ marginBottom: 0 }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">NO. OF EMPLOYEES</label>
                                <input type="number" className="fc" value={businessForm.employeeCount} onChange={(e) => setBusinessForm({ ...businessForm, employeeCount: e.target.value })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">EMPLOYEES MASTERLIST FILE</label>
                                <input type="text" className="fc" placeholder="Excel/Word File Name" value={businessForm.employeeMasterlistName} onChange={(e) => setBusinessForm({ ...businessForm, employeeMasterlistName: e.target.value })} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ACTION BUTTONS (PAGE 1) */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                          <button type="button" className="btn btn-g" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}> SAVE AS DRAFT
                          </button>
                          <button type="button" className="btn btn-p" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={() => setBusinessTab('page2')}>
                            Next: O.R. & Assessment Details ➔
                          </button>
                        </div>
                      </div>

                      {/* ── PAGE 2 CONTENT ── */}
                      <div style={{ display: businessTab === 'page2' ? 'block' : 'none' }}>
                        <div className="card" style={{ padding: '20px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            
                            {/* LEFT COLUMN: OFFICIAL RECEIPT & ASSESSMENT */}
                            <div className="fp" style={{ margin: 0, padding: '16px' }}>
                              <div className="fp-t" style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                                PAYMENT & O.R. DETAILS
                              </div>
                              <div className="fg2" style={{ marginBottom: '10px' }}>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl">O.R. NUMBER *</label>
                                  <input type="text" className="fc" placeholder="e.g. 9876543" value={businessForm.orNo || ''} onChange={(e) => setBusinessForm({ ...businessForm, orNo: e.target.value })} />
                                </div>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl">DATE ISSUED</label>
                                  <input type="date" className="fc" value={businessForm.orDateIssued || new Date().toISOString().split('T')[0]} onChange={(e) => setBusinessForm({ ...businessForm, orDateIssued: e.target.value })} />
                                </div>
                              </div>
                              <div className="fg2" style={{ marginBottom: '10px' }}>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl">CLEARANCE FEE (₱) *</label>
                                  <input type="number" className="fc" placeholder="500.00" value={businessForm.clearanceFee || ''} onChange={(e) => setBusinessForm({ ...businessForm, clearanceFee: e.target.value })} />
                                </div>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl">GARBAGE FEE (₱)</label>
                                  <input type="number" className="fc" placeholder="200.00" value={businessForm.garbageFee || ''} onChange={(e) => setBusinessForm({ ...businessForm, garbageFee: e.target.value })} />
                                </div>
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">TOTAL AMOUNT PAID (₱)</label>
                                <input type="number" className="fc" readOnly style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '14px' }} value={(parseFloat(businessForm.clearanceFee || 0) + parseFloat(businessForm.garbageFee || 0)).toFixed(2)} />
                              </div>
                            </div>

                            {/* RIGHT COLUMN: SIGNATORIES & APPROVAL */}
                            <div className="fp" style={{ margin: 0, padding: '16px' }}>
                              <div className="fp-t" style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                                REPORT SIGNATORIES & PERMIT VALIDITY
                              </div>
                              <div className="fg" style={{ marginBottom: '10px' }}>
                                <label className="fl">SECRETARY</label>
                                <select className="fc">
                                  <option>MRS. MELY M. PRESADO</option>
                                </select>
                              </div>
                              <div className="fg" style={{ marginBottom: '10px' }}>
                                <label className="fl">PUNONG BARANGAY</label>
                                <select className="fc">
                                  <option>HON. ANNABELLE E. RULL</option>
                                </select>
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">PERMIT VALIDITY / EXPIRATION</label>
                                <input type="text" className="fc" readOnly value="Valid until December 31, 2026" />
                              </div>
                            </div>
                          </div>

                          {/* ACTION BUTTONS (PAGE 2) */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                            <button type="button" className="btn btn-g" onClick={() => setBusinessTab('page1')}>
                              ◄ Back to Page 1
                            </button>
                            <button type="submit" className="btn btn-p" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                              </svg> Save & Complete Record
                            </button>
                          </div>
                        </div>
                      </div>
                    </form>

                    {/* ── REGISTERED BUSINESS CLEARANCES TABLE ── */}
                    <div className="card" style={{ marginTop: '20px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                          Registered Business Clearances ({businessMasterlist.length})
                        </h4>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                              <th style={{ padding: '8px' }}>BC ID</th>
                              <th style={{ padding: '8px' }}>Business Name</th>
                              <th style={{ padding: '8px' }}>Owner Name</th>
                              <th style={{ padding: '8px' }}>Nature</th>
                              <th style={{ padding: '8px' }}>Date Issued</th>
                              <th style={{ padding: '8px' }}>O.R. No.</th>
                              <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {businessMasterlist.length === 0 ? (
                              <tr>
                                <td colSpan="7" style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)' }}>
                                  No business clearance records found in local database.
                                </td>
                              </tr>
                            ) : (
                              businessMasterlist.map((rec) => (
                                <tr key={rec._id} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '8px', fontWeight: 'bold' }}>{rec.bcIdNo}</td>
                                  <td style={{ padding: '8px' }}>{rec.businessName}</td>
                                  <td style={{ padding: '8px' }}>{`${rec.lastName}, ${rec.firstName}`}</td>
                                  <td style={{ padding: '8px' }}>{rec.natureOfBusiness || 'N/A'}</td>
                                  <td style={{ padding: '8px' }}>{rec.regDate}</td>
                                  <td style={{ padding: '8px' }}>{rec.orNo || 'N/A'}</td>
                                  <td style={{ padding: '8px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                      <button 
                                        type="button" 
                                        className="btn btn-g" 
                                        style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => handleEditBusinessClearance(rec)}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg> Edit
                                      </button>
                                      <button 
                                        type="button" 
                                        className="btn btn-p" 
                                        style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => handlePrintBusinessClearance(rec)}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                          <rect x="6" y="14" width="12" height="8"></rect>
                                        </svg> Print
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
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
                  PROGRAMS GRID 
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
                  MODAL 1: VIEW PROGRAM DETAILS
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

                {/* Success Message Banner */}
                {successMessage && (
                  <div className="note note-s" style={{ marginBottom: '16px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {successMessage}
                  </div>
                )}

                {/* Batch Mode Indicator */}
                {selectedResidents.length > 0 && (
                  <div className="note note-i" style={{ marginBottom: '16px', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', width: '100%' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <strong>Batch Mode Active:</strong> {selectedResidents.length} residents queued.
                      <button 
                        className="btn btn-g btn-sm" 
                        onClick={() => setSelectedResidents([])} 
                        style={{ marginLeft: 'auto', color: 'var(--red)', borderColor: 'rgba(248, 113, 113, 0.3)' }}
                      >
                        Cancel Batch
                      </button>
                    </div>
                    <div style={{ width: '100%', maxHeight: '60px', overflowY: 'auto', fontSize: '11px', color: 'var(--muted)', padding: '8px', background: 'var(--surface2)', borderRadius: '6px', fontFamily: 'var(--mono)' }}>
                      {residentsList.filter(r => selectedResidents.includes(r.id)).map(r => r.name).join(', ')}
                    </div>
                  </div>
                )}

                <div className="tc">
                  {/* FORM PANEL */}
                  <div className="fp">
                    <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Distribution Entry Form
                    </div>

                    {/* Relief Program Field */}
                    <div className="fg">
                      <label className="fl">Relief Program <span style={{ color: 'var(--red)' }}>*</span></label>
                      <select 
                        className="fc" 
                        value={selectedProgramId} 
                        onChange={(e) => {
                          const progId = e.target.value;
                          setSelectedProgramId(progId);
                          const foundProg = programsList.find((p) => p.id === progId);
                          if (foundProg) {
                            setAidType(foundProg.title.includes('Rice') ? 'Rice — 5kg Pack' : 'Financial / Cash Aid');
                          }
                        }}
                      >
                        <option value="" disabled hidden>Choose active relief campaign...</option>
                        {programsList
                          .filter((prog) => prog.status === 'Active')
                          .map((prog) => {
                            const isFull = (prog.current || 0) >= (prog.target || 1);
                            return (
                              <option key={prog.id} value={prog.id} disabled={isFull}>
                                {prog.title} ({prog.id}) — {prog.current}/{prog.target} {isFull ? '• FULL' : ''}
                              </option>
                            );
                          })}
                      </select>
                    </div>

                    {/* Beneficiary Resident Selector */}
                    <div className="fg">
                      <label className="fl">Beneficiary Resident <span style={{ color: 'var(--red)' }}>*</span></label>
                      <div style={{ position: 'relative', marginBottom: '8px' }}>
                        <input
                          type="text"
                          className="fc"
                          placeholder="Type to filter name, ID, or purok..."
                          value={residentSearch}
                          onChange={(e) => setResidentSearch(e.target.value)}
                          style={{ paddingLeft: '32px' }}
                        />
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        {residentSearch && (
                          <button
                            type="button"
                            onClick={() => setResidentSearch('')}
                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <select 
                        className="fc" 
                        value={selectedResidentId} 
                        onChange={(e) => setSelectedResidentId(e.target.value)}
                      >
                        <option value="" disabled hidden>
                          {filteredBeneficiaries.length > 0 ? "Select beneficiary from filtered list..." : "No matching resident found..."}
                        </option>
                        {filteredBeneficiaries.map((res) => (
                          <option key={res.id} value={res.id}>
                            {res.name} ({res.id || 'Resident'}) — {res.purok?.toString().toLowerCase().startsWith('purok') ? res.purok : `Purok ${res.purok || '1'}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Aid Type & Quantity Grid */}
                    <div className="fg2">
                      <div className="fg">
                        <label className="fl">Aid Type <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input
                          type="text"
                          className="fc"
                          value={aidType}
                          onChange={(e) => setAidType(e.target.value)}
                          placeholder="e.g., Rice — 5kg"
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Quantity <span style={{ color: 'var(--red)' }}>*</span></label>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface2)' }}>
                          <button
                            type="button"
                            onClick={() => setQuantity(prev => Math.max(1, (Number(prev) || 1) - 1))}
                            className="btn btn-g"
                            style={{ borderRadius: 0, border: 'none', borderRight: '1px solid var(--border)', padding: '8px 12px' }}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            className="fc"
                            style={{ textAlign: 'center', border: 'none', background: 'transparent', boxShadow: 'none' }}
                          />
                          <button
                            type="button"
                            onClick={() => setQuantity(prev => (Number(prev) || 0) + 1)}
                            className="btn btn-g"
                            style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--border)', padding: '8px 12px' }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Remarks */}
                    <div className="fg">
                      <label className="fl">Remarks</label>
                      <textarea
                        className="fc"
                        placeholder="Optional notes..."
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        rows={3}
                      />
                    </div>

                    {/* Duplicate Validation Status */}
                    {!duplicateAlert && selectedResidentId && (
                      <div className="note note-s" style={{ marginTop: '12px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <path d="M22 4L12 14.01l-3-3" />
                        </svg>
                        No duplicate — resident not yet recorded under this program.
                      </div>
                    )}

                    {/* Submit Button */}
                    <div className="fa" style={{ marginTop: '16px' }}>
                      <button
                        type="button"
                        className="btn btn-p"
                        onClick={handleEncodeSubmit}
                        disabled={!selectedProgramId || !selectedResidentId}
                        style={{ width: '100%', justifyContent: 'center', opacity: (!selectedProgramId || !selectedResidentId) ? 0.5 : 1 }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Entry
                      </button>
                    </div>
                  </div>

                  {/* 📊 AID LOGS TABLE */}
                  <div>
                    {duplicateAlert && (
                      <div className="note note-e" style={{ marginBottom: '14px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                        <strong>{duplicateAlert}</strong>
                      </div>
                    )}

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
                          {aidLogs.length === 0 ? (
                            <tr>
                              <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                                No logs recorded yet for this session.
                              </td>
                            </tr>
                          ) : (
                            aidLogs.map((log) => (
                              <tr key={log.id}>
                                <td style={{ fontWeight: 600 }}>{log.residentName}</td>
                                <td>{log.aid}</td>
                                <td>{log.officer}</td>
                                <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{log.time}</td>
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
                            ))
                          )}
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
                  
                  <div className="tw">
                    <div className="tb">
                      {/* 🔍 GUMAGANANG SEARCH INPUT */}
                      <div className="sb-box">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"> <circle cx="11" cy="11" r="8" /> <path d="M21 21l-4.35-4.35" /> </svg>
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
                ════════════════════════════════════════ */}
              {screen === 'blotter-new' && (
                <div className="screen active" style={{ position: 'relative' }}>

                  <form onSubmit={handleCreateBlotterEntry}>
                    {/* System Metadata */}
                    <div className="fp" style={{ marginBottom: '16px' }}>
                      <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        System Metadata (Read-Only)
                      </div>
                      <div
                        className="fg3"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '12px',
                          marginTop: '8px',
                        }}
                      >
                        <div className="fg">
                          <label className="fl">Blotter Tracking No.</label>
                          <input
                            className="fc"
                            readOnly
                            value={`BLT-2026-${String(blotterList.length + 125).padStart(5, '0')}`}
                            style={{ fontFamily: 'var(--mono)', fontWeight: 'bold', color: 'var(--accent)' }}
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">Officer Handling Case</label>
                          <input className="fc" readOnly value="Juhairo Macabangon" />
                        </div>
                        <div className="fg">
                          <label className="fl">Date Logged</label>
                          <input
                            className="fc"
                            readOnly
                            value={new Date().toLocaleDateString('en-PH', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Incident Parameters & Priority */}
                    <div
                      className="fp"
                      style={{
                        background: 'rgba(26, 29, 36, 0.4)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(79, 142, 247, 0.2)',
                        borderRadius: '8px',
                        marginBottom: '16px',
                      }}
                    >
                      <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Incident Parameters & Priority
                      </div>

                      <div
                        className="fg3"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '12px',
                        }}
                      >
                        <div className="fg">
                          <label className="fl">Date of Incident</label>
                          <input
                            className="fc"
                            type="date"
                            required
                            value={blotterForm.date}
                            onChange={(e) => setBlotterForm({ ...blotterForm, date: e.target.value })}
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">Time Matrix</label>
                          <input
                            className="fc"
                            type="time"
                            required
                            value={blotterForm.time}
                            onChange={(e) => setBlotterForm({ ...blotterForm, time: e.target.value })}
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">Case Priority Rank</label>
                          <select
                            className="fc"
                            value={blotterForm.priority}
                            onChange={(e) => setBlotterForm({ ...blotterForm, priority: e.target.value })}
                          >
                            <option value="Low">Low Priority</option>
                            <option value="Medium">Medium Priority</option>
                            <option value="High">High Priority</option>
                          </select>
                        </div>
                      </div>

                      <div
                        className="fg2"
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}
                      >
                        <div className="fg">
                          <label className="fl">Incident Type Classification</label>
                          <select
                            className="fc"
                            value={blotterForm.type}
                            onChange={(e) => setBlotterForm({ ...blotterForm, type: e.target.value })}
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
                            onChange={(e) => setBlotterForm({ ...blotterForm, location: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Parties Involved */}
                    <div
                      className="fp"
                      style={{
                        background: 'rgba(26, 29, 36, 0.4)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(79, 142, 247, 0.2)',
                        borderRadius: '8px',
                        marginBottom: '16px',
                      }}
                    >
                      <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Legal Parties Involved
                      </div>

                      <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Complainant */}
                        <div className="fg" style={{ position: 'relative' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '4px',
                            }}
                          >
                            <label className="fl" style={{ margin: 0 }}>
                              Complainant (Nagrereklamo)
                            </label>
                            <label
                              style={{
                                fontSize: '11px',
                                color: '#64748b',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={blotterForm.isComplainantNonResident}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setBlotterForm({
                                    ...blotterForm,
                                    isComplainantNonResident: checked,
                                    complainant: '',
                                  });
                                  setComplainantQuery('');
                                }}
                              />
                              Non-resident
                            </label>
                          </div>

                          {blotterForm.isComplainantNonResident ? (
                            <input
                              className="fc"
                              required
                              placeholder="Enter full name of non-resident complainant"
                              value={blotterForm.complainant}
                              onChange={(e) =>
                                setBlotterForm({ ...blotterForm, complainant: e.target.value })
                              }
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
                                  <div
                                    style={{
                                      fontSize: '11px',
                                      color: '#10b981',
                                      marginTop: '2px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    </svg>
                                    Linked Profile: <strong>{blotterForm.complainant}</strong>
                                  </div>
                                )}
                              </div>

                              {showComplainantDropdown && complainantQuery && (
                                <div
                                  style={{
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
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                                  }}
                                >
                                  {residentsRegistry
                                    .filter((r) =>
                                      r.name.toLowerCase().includes(complainantQuery.toLowerCase())
                                    )
                                    .map((res) => (
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
                                          transition: 'background 0.2s ease',
                                        }}
                                        onClick={() => {
                                          setBlotterForm({ ...blotterForm, complainant: res.name });
                                          setComplainantQuery(res.name);
                                          setShowComplainantDropdown(false);
                                        }}
                                        onMouseEnter={(e) =>
                                          (e.currentTarget.style.background = 'rgba(79, 142, 247, 0.1)')
                                        }
                                        onMouseLeave={(e) =>
                                          (e.currentTarget.style.background = 'transparent')
                                        }
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                          <circle cx="9" cy="7" r="4" />
                                        </svg>
                                        {res.name} ({res.purok}) —{' '}
                                        <span style={{ color: '#64748b', fontSize: '10px' }}>{res.id}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Respondent */}
                        <div className="fg" style={{ position: 'relative' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '4px',
                            }}
                          >
                            <label className="fl" style={{ margin: 0 }}>
                              Respondent (Inirereklamo)
                            </label>
                            <label
                              style={{
                                fontSize: '11px',
                                color: '#64748b',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={blotterForm.isRespondentNonResident}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setBlotterForm({
                                    ...blotterForm,
                                    isRespondentNonResident: checked,
                                    respondent: '',
                                  });
                                  setRespondentQuery('');
                                }}
                              />
                              Non-resident
                            </label>
                          </div>

                          {blotterForm.isRespondentNonResident ? (
                            <input
                              className="fc"
                              required
                              placeholder="Enter full name of non-resident respondent"
                              value={blotterForm.respondent}
                              onChange={(e) =>
                                setBlotterForm({ ...blotterForm, respondent: e.target.value })
                              }
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
                                  <div
                                    style={{
                                      fontSize: '11px',
                                      color: '#10b981',
                                      marginTop: '2px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    </svg>
                                    Linked Profile: <strong>{blotterForm.respondent}</strong>
                                  </div>
                                )}
                              </div>

                              {showRespondentDropdown && respondentQuery && (
                                <div
                                  style={{
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
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                                  }}
                                >
                                  {residentsRegistry
                                    .filter((r) =>
                                      r.name.toLowerCase().includes(respondentQuery.toLowerCase())
                                    )
                                    .map((res) => (
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
                                          transition: 'background 0.2s ease',
                                        }}
                                        onClick={() => {
                                          setBlotterForm({ ...blotterForm, respondent: res.name });
                                          setRespondentQuery(res.name);
                                          setShowRespondentDropdown(false);
                                        }}
                                        onMouseEnter={(e) =>
                                          (e.currentTarget.style.background = 'rgba(79, 142, 247, 0.1)')
                                        }
                                        onMouseLeave={(e) =>
                                          (e.currentTarget.style.background = 'transparent')
                                        }
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                          <circle cx="9" cy="7" r="4" />
                                        </svg>
                                        {res.name} ({res.purok}) —{' '}
                                        <span style={{ color: '#64748b', fontSize: '10px' }}>{res.id}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Witnesses */}
                      <div className="fg" style={{ marginTop: '12px' }}>
                        <label className="fl">Witnesses Block (Optional)</label>
                        <input
                          className="fc"
                          placeholder="Comma-separated names (e.g. Pedro Oliver, Maria Santos)"
                          value={blotterForm.witnesses}
                          onChange={(e) => setBlotterForm({ ...blotterForm, witnesses: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Case Narrative & Resolution */}
                    <div
                      className="fp"
                      style={{
                        background: 'rgba(26, 29, 36, 0.4)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(79, 142, 247, 0.2)',
                        borderRadius: '8px',
                        marginBottom: '16px',
                      }}
                    >
                      <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                          onChange={(e) => setBlotterForm({ ...blotterForm, narrative: e.target.value })}
                        />
                      </div>

                      <div
                        className="fg2"
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}
                      >
                        <div className="fg">
                          <label className="fl">Barangay Formal Action Taken</label>
                          <select
                            className="fc"
                            value={blotterForm.actionTaken}
                            onChange={(e) => setBlotterForm({ ...blotterForm, actionTaken: e.target.value })}
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
                            onChange={(e) => setBlotterForm({ ...blotterForm, status: e.target.value })}
                          >
                            <option value="Open">Open (Pending Mediation)</option>
                            <option value="Under Mediation">Under Mediation Process</option>
                            <option value="Resolved">Resolved & Closed Case</option>
                            <option value="Referred to Higher Authority">Referred to Higher Authority</option>
                          </select>
                        </div>
                      </div>

                      {/* Next Mediation Hearing */}
                      {(blotterForm.status === 'Open' || blotterForm.status === 'Under Mediation') && (
                        <div className="fg" style={{ marginTop: '16px' }}>
                          <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Scheduled Next Mediation Hearing Date
                          </label>
                          <input
                            className="fc"
                            type="date"
                            value={blotterForm.nextHearingDate}
                            onChange={(e) =>
                              setBlotterForm({ ...blotterForm, nextHearingDate: e.target.value })
                            }
                          />
                        </div>
                      )}

                      {/* Evidence Attachments */}
                      <div className="fg" style={{ marginTop: '12px' }}>
                        <label className="fl" style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Evidence Attachments (Future Enhancement)
                        </label>
                        <div style={{ display: 'flex', gap: '8px', opacity: 0.6 }}>
                          <button
                            type="button"
                            disabled
                            className="btn btn-g btn-sm"
                            style={{ cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px' }}
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
                            style={{ cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px' }}
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
                            style={{ cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px' }}
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

                    {/* Form Actions */}
                    <div
                      className="fa"
                      style={{
                        display: 'flex',
                        gap: '10px',
                        marginTop: '20px',
                        borderTop: '1px solid #334155',
                        paddingTop: '16px',
                      }}
                    >
                      <button
                        type="submit"
                        className="btn btn-p"
                        style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                      >
                        Save Blotter Case Record
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={handleClearBlotterForm}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'center',
                          background: 'rgba(71, 85, 105, 0.6)',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                          color: '#e2e8f0',
                          fontWeight: 600,
                          borderRadius: '6px',
                          padding: '8px 14px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(71, 85, 105, 0.8)';
                          e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(71, 85, 105, 0.6)';
                          e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                        }}
                      >
                        Clear Form
                      </button>
                      <button
                        type="button"
                        className="btn btn-g"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                        onClick={() => nav('blotter-manage')}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>

                  {/* Success Modal */}
                  {showSuccessModal && (
                    <div
                      style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 99999,
                      }}
                    >
                      <div
                        style={{
                          background: '#1e293b',
                          border: '1px solid #10b981',
                          padding: '30px',
                          borderRadius: '12px',
                          width: '90%',
                          maxWidth: '420px',
                          textAlign: 'center',
                          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
                          backdropFilter: 'blur(10px)',
                        }}
                      >
                        <div style={{ fontSize: '42px', marginBottom: '12px', color: '#10b981' }}>
                          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <path d="M22 4L12 14.01l-3-3" />
                          </svg>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '4px' }}>
                          Blotter Successfully Recorded
                        </div>
                        <div
                          style={{
                            fontSize: '13px',
                            color: '#60a5fa',
                            fontFamily: 'var(--mono)',
                            marginBottom: '16px',
                            fontWeight: 'bold',
                          }}
                        >
                          {recentlyFiledId}
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '24px' }}>
                          The formal incident report context has been cataloged into Nabua's local database schema registry successfully.
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <button
                            className="btn btn-p"
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
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
                            style={{ width: '100%', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
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
                            style={{ width: '100%', background: '#334155', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
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
                  <div className="tw">
                    {/* ── SEARCH & FILTER CONTROLS (UNIFIED & UPDATED) ── */}
                    <div className="tb" style={{ flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                      {/* Search Input */}
                      <div className="sb-box">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                          placeholder="Search case #, complainant, respondent..."
                          value={blotterSearch}
                          onChange={(e) => setBlotterSearch(e.target.value)}
                        />
                      </div>

                      {/* Crime Type Filter */}
                      <select className="fc" style={{ width: '150px' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                        <option value="All Types">All Types</option>
                        <option value="Noise Complaint">Noise Complaint</option> <option value="Physical Altercation">Physical Altercation</option>
                        <option value="Property Dispute">Property Dispute</option>
                        <option value="Domestic Concern">Domestic Concern</option>
                        <option value="Theft">Theft</option>
                        <option value="Other">Other</option>
                      </select>

                      {/* Status Filter */}
                      <select className="fc" style={{ width: '140px' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                        <option value="All Status">All Status</option>
                        <option value="Open">Open</option>
                        <option value="Under Mediation">Under Mediation</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Referred to Higher Authority">Referred</option>
                      </select>

                      {/* Date Range Filters (From / To) */}
                      <input
                        type="date"
                        className="fc"
                        style={{ width: '130px' }}
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        title="From Date"
                      />
                      <input
                        type="date"
                        className="fc"
                        style={{ width: '130px' }}
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        title="To Date"
                      />

                      {/* VAWC Filter Toggle */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: 'var(--surface2)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <input
                          type="checkbox"
                          checked={filterVawc}
                          onChange={(e) => setFilterVawc(e.target.checked)}
                        />
                        <span> VAWC Only</span>
                      </label>

                      {/* Export / Print Action */}
                      <button className="btn btn-g" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                         Export / Print Log
                      </button>
                    </div>

                    {/* ── MAIN LEDGER TABLE ── */}
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

                    {/* TWO-COLUMN LAYOUT */}
                    <div className="tc" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
                      
                      {/* LEFT COLUMN */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        
                        {/* Case Information */}
                        <div className="fp">
                          <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Case Information
                          </div>
                          <div className="fg2">
                            <div className="fg">
                              <label className="fl">Case Number</label>
                              <input className="fc" value={selectedBlotterId || ''} readOnly style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }} />
                            </div>
                            <div className="fg">
                              <label className="fl">Current Status</label>
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
                            <div className="fg">
                              <label className="fl">Date Filed</label>
                              <input className="fc" type="date" value={role === 'admin' ? (complaint?.dateFiled || '') : (staffCase?.dateFiled || '')} onChange={(e) => role === 'admin' ? updateComplaintField('dateFiled', e.target.value) : updateCase('dateFiled', e.target.value)} />
                            </div>
                            <div className="fg">
                              <label className="fl">Time Filed</label>
                              <input className="fc" type="time" value={role === 'admin' ? (complaint?.timeFiled || '') : (staffCase?.timeFiled || '')} onChange={(e) => role === 'admin' ? updateComplaintField('timeFiled', e.target.value) : updateCase('timeFiled', e.target.value)} />
                            </div>
                          </div>
                          <div className="fg">
                            <label className="fl">Incident Type</label>
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

                        {/* Complainant */}
                        <div className="fp">
                          <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Complainant Information
                          </div>
                          <div className="fg">
                            <label className="fl">Full Name</label>
                            <input className="fc" value={role === 'admin' ? (complaint?.compName || '') : (staffCase?.compName || '')} onChange={(e) => role === 'admin' ? updateComplaintField('compName', e.target.value) : updateCase('compName', e.target.value)} />
                          </div>
                          <div className="fg2">
                            <div className="fg">
                              <label className="fl">Resident ID</label>
                              <input className="fc" value={role === 'admin' ? (complaint?.compID || 'RES-XXXX') : (staffCase?.compID || 'RES-XXXX')} readOnly style={{ color: 'var(--muted)' }} />
                            </div>
                            <div className="fg">
                              <label className="fl">Verification</label>
                              <input className="fc" value="Registered Resident" readOnly style={{ color: 'var(--muted)' }} />
                            </div>
                          </div>
                          <div className="fg2">
                            <div className="fg">
                              <label className="fl">Contact Number</label>
                              <input className="fc" value={role === 'admin' ? (complaint?.compContact || '') : (staffCase?.compContact || '')} onChange={(e) => role === 'admin' ? updateComplaintField('compContact', e.target.value) : updateCase('compContact', e.target.value)} />
                            </div>
                            <div className="fg">
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

                        {/* Narrative */}
                        <div className="fp">
                          <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Incident Narrative
                          </div>
                          <div className="fg">
                            <label className="fl">Official Narrative Statement</label>
                            <textarea className="fc" rows={4} value={role === 'admin' ? (complaint?.narrative || '') : (staffCase?.narrative || '')} onChange={(e) => role === 'admin' ? updateComplaintField('narrative', e.target.value) : updateCase('narrative', e.target.value)} />
                          </div>
                          <div className="fg">
                            <label className="fl">Action & Status Notes</label>
                            <textarea className="fc" rows={3} value={role === 'admin' ? (complaint?.statusNotes || '') : (staffCase?.statusNotes || '')} onChange={(e) => role === 'admin' ? updateComplaintField('statusNotes', e.target.value) : updateCase('statusNotes', e.target.value)} />
                          </div>
                        </div>
                      </div>

                      {/* RIGHT COLUMN */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        
                        {/* Respondent */}
                        <div className="fp">
                          <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Respondent Information
                          </div>
                          <div className="fg">
                            <label className="fl">Full Name</label>
                            <input className="fc" value={role === 'admin' ? (complaint?.respName || '') : (staffCase?.respName || '')} onChange={(e) => role === 'admin' ? updateComplaintField('respName', e.target.value) : updateCase('respName', e.target.value)} />
                          </div>
                          <div className="fg2">
                            <div className="fg">
                              <label className="fl">Resident ID</label>
                              <input className="fc" value={role === 'admin' ? (complaint?.respID || 'RES-YYYY') : (staffCase?.respID || 'RES-YYYY')} readOnly style={{ color: 'var(--muted)' }} />
                            </div>
                            <div className="fg">
                              <label className="fl">Status</label>
                              <input className="fc" value="Registered Resident" readOnly style={{ color: 'var(--muted)' }} />
                            </div>
                          </div>
                          <div className="fg">
                            <label className="fl">Contact Number</label>
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

                        {/* Summons */}
                        <div className="fp" style={{ borderLeft: '3px solid var(--accent)' }}>
                          <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            Send Official Summons
                          </div>
                          <div className="note note-i" style={{ marginBottom: '14px', fontSize: '12px' }}>
                            Dispatch automated SMS and Email notification to the respondent for the scheduled barangay hearing.
                          </div>
                          <div className="fg2">
                            <div className="fg">
                              <label className="fl">Appearance Date</label>
                              <input className="fc" type="date" value={role === 'admin' ? (complaint?.summonDate || '') : (staffCase?.summonDate || '')} onChange={(e) => role === 'admin' ? updateComplaintField('summonDate', e.target.value) : updateCase('summonDate', e.target.value)} />
                            </div>
                            <div className="fg">
                              <label className="fl">Appearance Time</label>
                              <input className="fc" type="time" value={role === 'admin' ? (complaint?.summonTime || '') : (staffCase?.summonTime || '')} onChange={(e) => role === 'admin' ? updateComplaintField('summonTime', e.target.value) : updateCase('summonTime', e.target.value)} />
                            </div>
                          </div>
                          <div className="fg">
                            <label className="fl">Message Content</label>
                            <textarea className="fc" rows={3} value={role === 'admin' ? (complaint?.summonMsg || '') : (staffCase?.summonMsg || '')} onChange={(e) => role === 'admin' ? updateComplaintField('summonMsg', e.target.value) : updateCase('summonMsg', e.target.value)} />
                          </div>
                          <button type="button" className="btn btn-p" style={{ width: '100%', marginTop: '4px', justifyContent: 'center' }} onClick={sendSummons}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                              <path d="M22 2L11 13" />
                              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                            </svg>
                            Send Summons Now
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* FOOTER ACTIONS */}
                    <div className="fa" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                      <button className="btn btn-s" onClick={() => { alert('Case configuration saved successfully.'); nav('blotter-manage'); }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        Save Changes
                      </button>
                      <button className="btn btn-g" onClick={() => nav('blotter-manage')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 15l-6-6-6 6" />
                        </svg>
                        Cancel Updates
                      </button>
                      <button className="btn btn-a" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => alert('Hearing date posted to operational calendar.')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <path d="M16 2v4" />
                          <path d="M8 2v4" />
                          <path d="M3 10h18" />
                        </svg>
                        Schedule Mediation
                      </button>
                      <button className="btn btn-g" onClick={() => nav('blotter-manage')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 12H5" />
                          <path d="M12 19l-7-7 7-7" />
                        </svg>
                        Close View
                      </button>
                    </div>
                  </div>
                )}
            
            {/* ════════════════════════════════════════
                SCREEN: ANNOUNCEMENTS
                ════════════════════════════════════════ */}
               {screen === 'announcements' && (
                <div className="screen active">

                  {/* ANNOUNCEMENT LIST */}
                  {announcementSubScreen === 'list' && (
                    <div>

                      {/* ACTION BAR */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          marginBottom: '16px'
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-p"
                          onClick={() => {
                            setAnnouncementForm({
                              title: '',
                              category: 'General',
                              content: '',
                              pinned: false,
                              status: 'Published'
                            });
                            setAnnouncementSubScreen('new');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px'
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M12 5v14" />
                            <path d="M5 12h14" />
                          </svg>
                          New Announcement
                        </button>
                      </div>

                      {/* FILTER BAR */}
                      <div
                        className="fp"
                        style={{
                          marginBottom: '16px',
                          padding: '16px'
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 1fr 1fr',
                            gap: '12px'
                          }}
                        >

                          {/* SEARCH */}
                          <div className="fg" style={{ margin: 0 }}>
                            <label className="fl">
                              Search Announcements
                            </label>

                            <div style={{ position: 'relative' }}>
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  position: 'absolute',
                                  left: '10px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  opacity: 0.6,
                                  pointerEvents: 'none'
                                }}
                                aria-hidden="true"
                              >
                                <circle cx="11" cy="11" r="7" />
                                <path d="m20 20-4-4" />
                              </svg>

                              <input
                                className="fc"
                                style={{ paddingLeft: '34px' }}
                                placeholder="Search by title or content..."
                                value={searchAnnQuery}
                                onChange={(e) => setSearchAnnQuery(e.target.value)}
                              />
                            </div>
                          </div>

                          {/* CATEGORY */}
                          <div className="fg" style={{ margin: 0 }}>
                            <label className="fl">
                              Category
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

                          {/* STATUS */}
                          <div className="fg" style={{ margin: 0 }}>
                            <label className="fl">
                              Status
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

                      {/* ANNOUNCEMENT LIST */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        {announcementsList
                          .slice()
                          .sort(
                            (a, b) =>
                              (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
                          )
                          .filter((ann) => {
                            const title = String(ann.title || '').toLowerCase();
                            const content = String(ann.content || '').toLowerCase();
                            const query = searchAnnQuery.toLowerCase();

                            const matchQuery =
                              title.includes(query) ||
                              content.includes(query);

                            const matchCat =
                              filterAnnCategory === 'All' ||
                              ann.category === filterAnnCategory;

                            const matchStatus =
                              filterAnnStatus === 'All' ||
                              ann.status === filterAnnStatus;

                            return matchQuery && matchCat && matchStatus;
                          })
                          .map((ann) => (
                            <div
                              key={ann.id}
                              className={`ann ${ann.pinned ? 'pinned' : ''}`}
                            >

                              {/* CONTENT */}
                              <div style={{ flex: 1, minWidth: 0 }}>

                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '7px',
                                    marginBottom: '6px'
                                  }}
                                >
                                  {ann.pinned && (
                                    <span
                                      className="badge"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      Pinned
                                    </span>
                                  )}

                                  <span className="ann-cat">
                                    {ann.category || 'General'}
                                  </span>

                                  <span
                                    className="badge"
                                    style={{
                                      fontSize: '9px'
                                    }}
                                  >
                                    {ann.status || 'Draft'}
                                  </span>
                                </div>

                                <div className="ann-t">
                                  {ann.title}
                                </div>

                                <div className="ann-b">
                                  {ann.content}
                                </div>

                                <div className="ann-f">

                                  Posted by {ann.author || 'Administrator'}
                                  {ann.date ? ` · ${ann.date}` : ''}
                                </div>

                              </div>

                              {/* ACTIONS */}
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '6px',
                                  flexShrink: 0,
                                  flexWrap: 'wrap',
                                  justifyContent: 'flex-end'
                                }}
                              >

                                <button
                                  type="button"
                                  className="btn btn-g btn-sm"
                                  onClick={() =>
                                    handleTogglePinAnnouncement(ann.id)
                                  }
                                >
                                  {ann.pinned ? 'Unpin' : 'Pin'}
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-g btn-sm"
                                  onClick={() =>
                                    handleOpenEditAnnouncement(ann)
                                  }
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-g btn-sm"
                                  onClick={() =>
                                    handleTriggerDeleteAnnouncement(ann.id)
                                  }
                                >
                                  Delete
                                </button>

                              </div>

                            </div>
                          ))}

                        {/* EMPTY STATE */}
                        {announcementsList
                          .filter((ann) => {
                            const title = String(ann.title || '').toLowerCase();
                            const content = String(ann.content || '').toLowerCase();
                            const query = searchAnnQuery.toLowerCase();

                            const matchQuery =
                              title.includes(query) ||
                              content.includes(query);

                            const matchCat =
                              filterAnnCategory === 'All' ||
                              ann.category === filterAnnCategory;

                            const matchStatus =
                              filterAnnStatus === 'All' ||
                              ann.status === filterAnnStatus;

                            return matchQuery && matchCat && matchStatus;
                          })
                          .length === 0 && (
                            <div
                              className="fp"
                              style={{
                                textAlign: 'center',
                                padding: '40px 20px'
                              }}
                            >
                              <svg
                                width="32"
                                height="32"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                style={{ opacity: 0.6, marginBottom: '10px' }}
                                aria-hidden="true"
                              >
                                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                              </svg>

                              <div style={{ fontWeight: 700 }}>
                                No announcements found
                              </div>

                              <div
                                style={{
                                  marginTop: '4px',
                                  fontSize: '12px',
                                  color: 'var(--muted)'
                                }}
                              >
                                Try adjusting the search or filter options.
                              </div>
                            </div>
                          )}

                      </div>
                    </div>
                  )}

                  {/* CREATE / EDIT ANNOUNCEMENT */}
                  {(announcementSubScreen === 'new' ||
                    announcementSubScreen === 'edit') && (
                    <div
                      className="fp"
                      style={{
                        maxWidth: '700px',
                        margin: '0 auto'
                      }}
                    >

                      {/* FORM HEADER */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '16px',
                          marginBottom: '20px',
                          paddingBottom: '14px',
                          borderBottom: '1px solid var(--border)'
                        }}
                      >
                        <div>
                          <div
                            className="fp-t"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              margin: 0
                            }}
                          >
                            <svg
                              width="19"
                              height="19"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              {announcementSubScreen === 'new' ? (
                                <>
                                  <path d="M12 5v14" />
                                  <path d="M5 12h14" />
                                </>
                              ) : (
                                <>
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </>
                              )}
                            </svg>

                            {announcementSubScreen === 'new'
                              ? 'Create Announcement'
                              : 'Edit Announcement'}
                          </div>

                          <div
                            style={{
                              marginTop: '5px',
                              fontSize: '12px',
                              color: 'var(--muted)'
                            }}
                          >
                            Publish official barangay information for residents.
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-g"
                          onClick={() =>
                            setAnnouncementSubScreen('list')
                          }
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexShrink: 0
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M19 12H5" />
                            <path d="m12 19-7-7 7-7" />
                          </svg>
                          Back
                        </button>
                      </div>

                      <form
                        onSubmit={(e) =>
                          handleSaveAnnouncement(
                            e,
                            announcementForm.status
                          )
                        }
                      >

                        {/* TITLE */}
                        <div className="fg">
                          <label className="fl">
                            Announcement Title
                          </label>

                          <input
                            className="fc"
                            required
                            placeholder="Enter announcement title"
                            value={announcementForm.title}
                            onChange={(e) =>
                              setAnnouncementForm({
                                ...announcementForm,
                                title: e.target.value
                              })
                            }
                          />
                        </div>

                        {/* CATEGORY + PIN */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '12px'
                          }}
                        >

                          <div className="fg">
                            <label className="fl">
                              Category
                            </label>

                            <select
                              className="fc"
                              value={announcementForm.category}
                              onChange={(e) =>
                                setAnnouncementForm({
                                  ...announcementForm,
                                  category: e.target.value
                                })
                              }
                            >
                              <option value="General">General</option>
                              <option value="Health">Health</option>
                              <option value="Security">Security</option>
                              <option value="Events">Events</option>
                              <option value="Governance">Governance</option>
                            </select>
                          </div>

                          <div
                            className="fg"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              paddingTop: '24px'
                            }}
                          >
                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={announcementForm.pinned}
                                onChange={(e) =>
                                  setAnnouncementForm({
                                    ...announcementForm,
                                    pinned: e.target.checked
                                  })
                                }
                              />

                              Pin announcement
                            </label>
                          </div>

                        </div>

                        {/* CONTENT */}
                        <div className="fg">
                          <label className="fl">
                            Announcement Content
                          </label>

                          <textarea
                            className="fc"
                            required
                            style={{
                              minHeight: '160px',
                              lineHeight: '1.6',
                              resize: 'vertical'
                            }}
                            placeholder="Write the announcement details..."
                            value={announcementForm.content}
                            onChange={(e) =>
                              setAnnouncementForm({
                                ...announcementForm,
                                content: e.target.value
                              })
                            }
                          />
                        </div>

                        {/* FORM ACTIONS */}
                        <div
                          className="fa"
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '8px',
                            marginTop: '20px',
                            paddingTop: '16px',
                            borderTop: '1px solid var(--border)'
                          }}
                        >

                          <button
                            type="button"
                            className="btn btn-g"
                            onClick={() =>
                              setAnnouncementSubScreen('list')
                            }
                          >
                            Cancel
                          </button>

                          <button
                            type="submit"
                            className="btn btn-g"
                            onClick={() => {
                              setAnnouncementForm((prev) => ({
                                ...prev,
                                status: 'Draft'
                              }));
                            }}
                          >
                            Save Draft
                          </button>

                          <button
                            type="submit"
                            className="btn btn-p"
                            onClick={() => {
                              setAnnouncementForm((prev) => ({
                                ...prev,
                                status: 'Published'
                              }));
                            }}
                          >
                            Publish Announcement
                          </button>

                        </div>

                      </form>
                    </div>
                  )}

                  {/* DELETE CONFIRMATION */}
                  {showAnnDeleteModal && (
                    <div
                      style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.65)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 99999,
                        padding: '20px'
                      }}
                    >
                      <div
                        className="fp"
                        style={{
                          width: '100%',
                          maxWidth: '420px',
                          padding: '24px'
                        }}
                      >

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            marginBottom: '16px'
                          }}
                        >
                          <div
                            style={{
                              flexShrink: 0
                            }}
                          >
                            <svg
                              width="30"
                              height="30"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                              <path d="M12 9v4" />
                              <path d="M12 17h.01" />
                            </svg>
                          </div>

                          <div>
                            <div
                              style={{
                                fontSize: '16px',
                                fontWeight: 800
                              }}
                            >
                              Delete announcement?
                            </div>

                            <div
                              style={{
                                marginTop: '5px',
                                fontSize: '12px',
                                color: 'var(--muted)',
                                lineHeight: '1.5'
                              }}
                            >
                              This action will remove the announcement
                              from the bulletin list.
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '8px'
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-g"
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
                              background: 'var(--red)',
                              color: '#fff'
                            }}
                            onClick={handleConfirmDeleteAnnouncement}
                          >
                            Delete
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
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
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
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
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
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
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
                                      High
                                    </span>
                                  ) : fb.priority === 'Medium' ? (
                                    <span className="badge a" style={{ fontSize: '10px', padding: '2px 6px' }}>
                                      Medium
                                    </span>
                                  ) : (
                                    <span className="badge g" style={{ fontSize: '10px', padding: '2px 6px' }}>
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
                                        Respond
                                      </>
                                    ) : (
                                      <>
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
                                Discard
                              </button>
                              <button
                                type="submit"
                                className="btn btn-p"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
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
             {/* ── SCREEN: CONFLICT RESOLUTION (Admin only) ── */}
                {screen === 'conflicts' && (
                <div className="screen active">
                  {conflictsList.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '40px',
                        background: 'var(--surface)',
                        borderRadius: '12px',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <p
                        style={{
                          color: 'var(--muted)',
                          fontSize: '14px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <svg
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M9 12l2 2 4-4" />
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                        No conflicts detected. All offline changes have synced seamlessly to the cloud.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {conflictsList.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid rgba(248, 113, 113, 0.4)',
                            padding: '20px',
                            borderRadius: '12px'
                          }}
                        >
                          <h3
                            style={{
                              color: 'var(--red)',
                              marginBottom: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M12 3L2.5 20h19L12 3z" />
                              <path d="M12 9v5" />
                              <path d="M12 17h.01" />
                            </svg>
                            Conflict Detected: {item.residentName}
                          </h3>

                          <p
                            style={{
                              fontSize: '13px',
                              color: 'var(--muted)',
                              marginBottom: '12px'
                            }}
                          >
                            Document ID: {item.docId}
                          </p>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '16px',
                              marginBottom: '16px'
                            }}
                          >
                            <div
                              style={{
                                background: 'var(--surface2)',
                                padding: '12px',
                                borderRadius: '8px'
                              }}
                            >
                              <strong style={{ color: 'var(--accent)' }}>
                                Version A (Local Winning):
                              </strong>
                              <p style={{ fontSize: '13px', marginTop: '4px' }}>
                                Purok: {item.docA.purok}
                              </p>
                              <p
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--mono)',
                                  color: 'var(--muted)'
                                }}
                              >
                                Rev: {item.winningRev}
                              </p>
                            </div>

                            <div
                              style={{
                                background: 'var(--surface2)',
                                padding: '12px',
                                borderRadius: '8px'
                              }}
                            >
                              <strong style={{ color: 'var(--amber)' }}>
                                Version B (Conflicting):
                              </strong>
                              <p style={{ fontSize: '13px', marginTop: '4px' }}>
                                Purok: {item.docB.purok}
                              </p>
                              <p
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--mono)',
                                  color: 'var(--muted)'
                                }}
                              >
                                Rev: {item.conflictRev}
                              </p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn btn-p btn-sm"
                              onClick={() => handleKeepVersionA(item)}
                            >
                              Keep Version A
                            </button>

                            <button
                              className="btn btn-g btn-sm"
                              onClick={() => handleKeepVersionB(item)}
                            >
                              Keep Version B
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}

            {/* ════════════════════════════════════════
                SCREEN: AUDIT LOG (Admin only)
                ════════════════════════════════════════ */}
            {role === 'admin' && screen === 'audit' && (
              <div className="screen active">
                <div className="tw">
                  <div className="tb">
                    <div className="sb-box">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-4-4" />
                      </svg>
                      <input placeholder="Search user, action, module..." />
                    </div>

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
                    <div
                      className="al-row"
                      style={{
                        justifyContent: 'center',
                        color: 'var(--muted)',
                        padding: '24px'
                      }}
                    >
                      No audit logs found.
                    </div>
                  ) : (
                    auditLogs.map((log) => {
                      const meta = getActionMeta(log.action);

                      return (
                        <div key={log._id} className="al-row">
                          <div
                            className="al-ico"
                            style={{ background: meta.bg }}
                          >
                            {meta.ico}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="al-a">
                              {log.action}
                              {log.module ? ` — ${log.module}` : ''}
                              {log.recordId ? ` · ${log.recordId}` : ''}
                            </div>

                            <div className="al-d">
                              User: {log.actor?.username || 'System'}
                              {' '}
                              ({log.actor?.role || 'N/A'})
                              {log.details ? ` · ${log.details}` : ''}
                            </div>
                          </div>

                          <div
                            style={{
                              textAlign: 'right',
                              flexShrink: 0
                            }}
                          >
                            <span
                              className={`badge ${meta.bClass}`}
                              style={{
                                fontSize: '9px',
                                marginBottom: '3px',
                                display: 'inline-flex'
                              }}
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
                                    hour12: true
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
                    <div className="pt" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                      Generate Reports
                    </div>
                    <div className="ps">
                      {role === 'admin'
                        ? 'Printable reports for all modules — admin full access'
                        : 'Printable summary reports for all modules'}
                    </div>
                  </div>
                </div>

                {/* =============================================
                    📄 REPORT CARDS GRID (Glass-Morphism + SVG Icons)
                    ============================================= */}
                <div className="thc" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {[
                    {
                      icon: (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                          <path d="M12 18v-6" />
                          <path d="M9 15h6" />
                        </svg>
                      ),
                      title: 'Certificate Issuance',
                      desc: 'Monthly issuance summary by type',
                      select: ['April 2026', 'March 2026', 'February 2026'],
                      module: 'certificates'
                    },
                    {
                      icon: (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                      ),
                      title: 'Aid Distribution',
                      desc: 'Beneficiary list per program',
                      select: ['Ayuda Rice Distribution', 'Financial Assistance', 'Medical Aid'],
                      module: 'aid'
                    },
                    {
                      icon: (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      ),
                      title: 'Resident Registry',
                      desc: 'Full resident list by purok',
                      select: ['All Puroks', 'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'],
                      module: 'residents'
                    },
                    {
                      icon: (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                      ),
                      title: 'Blotter Summary',
                      desc: 'Cases grouped by type and status',
                      select: ['September 2026', 'August 2026', 'July 2026'],
                      module: 'blotter'
                    },
                    {
                      icon: (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      ),
                      title: 'Feedback Report',
                      desc: 'Concern submissions and resolutions',
                      select: ['All Status', 'Pending', 'Under Review', 'Resolved'],
                      module: 'feedback'
                    },
                    {
                      icon: (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <path d="M9 22V12h6v10" />
                        </svg>
                      ),
                      title: 'Household Registry',
                      desc: 'Household listing by purok',
                      select: ['All Puroks', 'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'],
                      module: 'households'
                    },
                    ...(role === 'admin'
                      ? [{
                          icon: (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                              <path d="M12 18v-6" />
                              <path d="M9 15h6" />
                              <path d="M12 6v6l4 4" />
                            </svg>
                          ),
                          title: 'Audit Trail Report',
                          desc: 'Admin-only — full system log',
                          select: ['September 2026', 'August 2026', 'July 2026'],
                          module: 'audit'
                        }]
                      : [])
                  ].map((r) => (
                    <div
                      key={r.title}
                      className="card"
                      style={{
                        background: 'rgba(30, 41, 59, 0.4)',
                        border: '1px solid rgba(79, 142, 247, 0.2)',
                        borderRadius: '8px',
                        padding: '16px',
                        backdropFilter: 'blur(8px)',
                        transition: 'all 0.3s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(79, 142, 247, 0.2)';
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: '40px',
                        height: '40px',
                        background: 'rgba(79, 142, 247, 0.1)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '12px',
                        color: '#3b82f6'
                      }}>
                        {r.icon}
                      </div>

                      {/* Title */}
                      <div className="ct" style={{
                        fontWeight: 'bold',
                        fontSize: '14px',
                        color: '#f8fafc',
                        marginBottom: '4px'
                      }}>
                        {r.title}
                      </div>

                      {/* Description */}
                      <div className="cm" style={{
                        fontSize: '12px',
                        color: '#94a3b8',
                        marginBottom: '12px'
                      }}>
                        {r.desc}
                      </div>

                      {/* Select Dropdown */}
                      <select
                        className="fc"
                        style={{
                          marginBottom: '12px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          color: '#cbd5e1'
                        }}
                      >
                        {r.select.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>

                      {/* Generate Button */}
                      <button
                        className="btn btn-p"
                        style={{
                          width: '100%',
                          justifyContent: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: 'auto'
                        }}
                        onClick={() => handleGenerateReport(r.module)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <path d="M7 10l5 5 5-5" />
                          <path d="M12 15v-6" />
                        </svg>
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

        {showCtcModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              width: '100%',
              maxWidth: '480px',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                ➕ Add New CTC Record
              </h3>
              <button
                type="button"
                onClick={() => setShowCtcModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCtc}>
              {/* RBI ID NO. & CTC NUMBER */}
              <div className="fg2" style={{ marginBottom: '12px' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">RBI ID NO.</label>
                  <input
                    type="text"
                    className="fc"
                    placeholder="e.g. RBI-2026-001"
                    value={ctcForm.rbiNo}
                    onChange={updateCtcField('rbiNo')}
                  />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">CTC NUMBER *</label>
                  <input
                    type="text"
                    className="fc"
                    required
                    placeholder="e.g. CTC-12345678"
                    value={ctcForm.ctcNo}
                    onChange={updateCtcField('ctcNo')}
                  />
                </div>
              </div>

              {/* FULL NAME */}
              <div className="fg" style={{ marginBottom: '12px' }}>
                <label className="fl">FULL NAME / RESIDENT *</label>
                <input
                  type="text"
                  className="fc"
                  required
                  placeholder="LAST NAME, FIRST NAME MIDDLE NAME"
                  value={ctcForm.ctcName}
                  onChange={updateCtcField('ctcName')}
                />
              </div>

              {/* AMOUNT PAID & DATE ISSUED */}
              <div className="fg2" style={{ marginBottom: '12px' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">AMOUNT PAID (₱) *</label>
                  <input
                    type="number"
                    className="fc"
                    required
                    placeholder="0.00"
                    value={ctcForm.amtPaid}
                    onChange={updateCtcField('amtPaid')}
                  />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">DATE ISSUED</label>
                  <input
                    type="date"
                    className="fc"
                    value={ctcForm.dateIssued}
                    onChange={updateCtcField('dateIssued')}
                  />
                </div>
              </div>

              {/* ISSUED BY THIS BARANGAY CHECKBOX */}
              <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={ctcForm.isIssuedByBarangay}
                    onChange={handleBarangayToggle}
                  />
                  ISSUED BY THIS BARANGAY
                </label>
              </div>

              {/* PLACE ISSUED */}
              <div className="fg" style={{ marginBottom: '16px' }}>
                <label className="fl">PLACE ISSUED</label>
                <input
                  type="text"
                  className="fc"
                  readOnly={ctcForm.isIssuedByBarangay}
                  style={{ opacity: ctcForm.isIssuedByBarangay ? 0.8 : 1 }}
                  value={ctcForm.placeIssued}
                  onChange={updateCtcField('placeIssued')}
                  placeholder="e.g. Nabua, Camarines Sur"
                />
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button type="button" className="btn btn-g" onClick={() => setShowCtcModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-p">
                  Save CTC Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

        {/* ── PRINT BUSINESS CLEARANCE MODAL OVERLAY ── */}
        {showBusinessPrintModal && selectedBusinessCert && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
            <div id="printable-certificate-card" style={{ background: '#ffffff', color: '#000000', borderRadius: '8px', width: '100%', maxWidth: '620px', padding: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
              
              {/* Header */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '16px' }}>
                <h5 style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Republic of the Philippines</h5>
                <h4 style={{ margin: '2px 0', fontSize: '14px', fontWeight: 700 }}>BARANGAY BUSTRAC</h4>
                <p style={{ margin: 0, fontSize: '11px' }}>Municipality of Nabua, Province of Camarines Sur</p>
                <h2 style={{ margin: '14px 0 4px 0', fontSize: '17px', fontWeight: 800, textDecoration: 'underline' }}> BARANGAY BUSINESS CLEARANCE </h2>
              </div>

              {/* Certificate Body */}
              <div style={{ fontSize: '12px', lineHeight: '1.6', textAlign: 'justify' }}>
                <p style={{ marginBottom: '12px' }}><strong>TO WHOM IT MAY CONCERN:</strong></p>
                <p style={{ textIndent: '24px', marginBottom: '12px' }}>
                  This certification and clearance is hereby granted to <strong>{selectedBusinessCert.businessName}</strong>, owned and operated by <strong>{`${selectedBusinessCert.firstName} ${selectedBusinessCert.lastName}`}</strong>, located at <strong>{selectedBusinessCert.businessAddress || 'Barangay Bustrac, Nabua, Camarines Sur'}</strong>.
                </p>
                <p style={{ textIndent: '24px', marginBottom: '16px' }}>
                  This clearance is issued upon compliance with local barangay health, safety, and regulatory requirements for business operation within this jurisdiction.
                </p>

                {/* Details Box */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px 12px', border: '1px solid #000', borderRadius: '4px', fontSize: '11px', background: '#f9f9f9', marginBottom: '24px' }}>
                  <div><strong>BC ID No.:</strong> {selectedBusinessCert.bcIdNo}</div>
                  <div><strong>O.R. Number:</strong> {selectedBusinessCert.orNo || 'N/A'}</div>
                  <div><strong>Date Issued:</strong> {selectedBusinessCert.regDate}</div>
                  <div><strong>Total Fee Paid:</strong> ₱{(parseFloat(selectedBusinessCert.clearanceFee || 0) + parseFloat(selectedBusinessCert.garbageFee || 0)).toFixed(2)}</div>
                </div>

                {/* Official Signatories */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '36px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: 0, fontWeight: 700, textDecoration: 'underline' }}>MRS. MELY M. PRESADO</p>
                    <small style={{ fontSize: '10px' }}>Barangay Secretary</small>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: 0, fontWeight: 700, textDecoration: 'underline' }}>HON. ANNABELLE E. RULL</p>
                    <small style={{ fontSize: '10px' }}>Punong Barangay</small>
                  </div>
                </div>
              </div>

              {/* 📍 DITO IPAPALIT ANG BAGO MO: Action Buttons with "no-print" */}
              <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '12px' }}>
                <button 
                  type="button" 
                  style={{
                    padding: '6px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: '#e5e7eb',
                    color: '#1f2937',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => setShowBusinessPrintModal(false)}
                >
                  Close
                </button>
                <button type="button" className="btn btn-p" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  🖨️ Print Clearance
                </button>
              </div>

            </div>
          </div>
        )}
        {/* ── PRINT INDIVIDUAL BARANGAY CLEARANCE MODAL OVERLAY ── */}
{showClearancePrintModal && selectedClearanceCert && (
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
    <div id="printable-certificate-card" style={{ background: '#ffffff', color: '#000000', borderRadius: '8px', width: '100%', maxWidth: '620px', padding: '30px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
      
      {/* Printable Header */}
      <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '20px' }}>
        <h5 style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Republic of the Philippines</h5>
        <h4 style={{ margin: '2px 0', fontSize: '14px', fontWeight: 700 }}>BARANGAY BUSTRAC</h4>
        <p style={{ margin: 0, fontSize: '11px' }}>Municipality of Nabua, Province of Camarines Sur</p>
        <h2 style={{ margin: '14px 0 4px 0', fontSize: '18px', fontWeight: 800, textDecoration: 'underline' }}>
          BARANGAY CLEARANCE
        </h2>
      </div>

      {/* Certificate Body */}
      <div style={{ fontSize: '12px', lineHeight: '1.7', textAlign: 'justify' }}>
        <p style={{ marginBottom: '14px' }}><strong>TO WHOM IT MAY CONCERN:</strong></p>
        <p style={{ textIndent: '24px', marginBottom: '14px' }}>
          This is to certify that <strong>{selectedClearanceCert.fullName}</strong>, a bonafide resident of Barangay Bustrac, Nabua, Camarines Sur, has undergone character and record background verification in this office.
        </p>
        <p style={{ textIndent: '24px', marginBottom: '14px' }}>
          Based on existing records, the above-named individual has <strong>{selectedClearanceCert.remarks || 'No Derogatory Record'}</strong> filed against him/her in this barangay as of date.
        </p>
        <p style={{ textIndent: '24px', marginBottom: '16px' }}>
          This certification is being issued upon the request of the interested party for <strong>{selectedClearanceCert.purpose}</strong> and for whatever legal intent it may serve.
        </p>

        {/* Receipt & CTC Footer Box */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px 12px', border: '1px solid #000', borderRadius: '4px', fontSize: '11px', background: '#f9f9f9', marginBottom: '24px' }}>
          <div><strong>Clearance No.:</strong> {selectedClearanceCert.clearanceNo}</div>
          <div><strong>O.R. Number:</strong> {selectedClearanceCert.orNo || 'N/A'}</div>
          <div><strong>Date Issued:</strong> {selectedClearanceCert.dateIssued}</div>
          <div><strong>Amount Paid:</strong> ₱{parseFloat(selectedClearanceCert.amtPaid || 0).toFixed(2)}</div>
          <div><strong>CTC No.:</strong> {selectedClearanceCert.ctcNo || 'N/A'}</div>
          <div><strong>CTC Date:</strong> {selectedClearanceCert.ctcDateIssued || 'N/A'}</div>
        </div>

        {/* Signatories */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: 700, textDecoration: 'underline' }}>{selectedClearanceCert.secretary || 'MRS. MELY M. PRESADO'}</p>
            <small style={{ fontSize: '10px' }}>Barangay Secretary</small>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: 700, textDecoration: 'underline' }}>{selectedClearanceCert.captain || 'HON. ANNABELLE E. RULL'}</p>
            <small style={{ fontSize: '10px' }}>Punong Barangay</small>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px', borderTop: '1px solid #ddd', paddingTop: '12px' }}>
        <button 
          type="button" 
          style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 600, backgroundColor: '#e5e7eb', color: '#1f2937', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}
          onClick={() => setShowClearancePrintModal(false)}
        >
          Close
        </button>
        <button 
          type="button" 
          className="btn btn-p" 
          onClick={() => window.print()} 
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          🖨️ Print Clearance
        </button>
      </div>

    </div>
  </div>
)}
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
