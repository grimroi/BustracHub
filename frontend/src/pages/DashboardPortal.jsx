import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import logo from '../assets/logo.png';
import './DashboardLayout.css';
import nabuaLogo from "../assets/nabua-logo.jpg";
import bustracLogo from "../assets/bustrac-logo.png";
import IndigencyTemplate from '../components/certificates/templates/IndigencyTemplate';
import BarangayClearance from '../components/certificates/templates/BarangayClearance';
import BusinessPermit from '../components/certificates/templates/BusinessPermit';
import ResidencyCertificate from '../components/certificates/templates/ResidencyCertificate';
import { ThemeToggle } from '../components/ThemeToggle';
import CertificateLifecycle, { CertificateIssuancePrint } from './CertificateLifecycle';
import CertPrintScreen from './CertPrintScreen';
import ResidentCombobox, { formatPurok } from '../components/ResidentCombobox';
import AuditLogView from '../components/AuditLogView';
import { localDb as db, forceSyncToRemote } from '../services/db';
import { createAuditLog } from '../utils/auditLog';
import { exportToExcel } from '../utils/excelExporter';
import SyncStatusIndicator from '../components/SyncStatusIndicator';
import BlotterForm from '../components/BlotterForm';
import { SummonsPanel } from '../components/SummonsPanel';
import { CaseStatusActions } from '../components/CaseStatusActions';
import A4PreviewWrapper from '../components/A4PreviewWrapper';
import BlotterCertificatePrintModal from '../components/BlotterCertificatePrintModal';
import BusinessClearanceTemplate from '../components/certificates/templates/BusinessClearanceTemplate';
import "../styles/Certificates.css";


const remoteCouchDB = import.meta.env.VITE_COUCHDB_URL || 'http://admin:capstone2026@192.168.1.3:5984/bustrachub_db';

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
  'add-household':   ['Register Household',   'Resident Registry'],
  'edit-household':  ['Edit Household',       'Resident Registry'],
  'view-household':  ['Household Profile',    'Resident Registry'],
  'view-resident':   ['Resident Profile',     'Resident Registry'],
  'edit-resident':   ['Edit Resident',        'Resident Registry'],
  'aid-advisories': ['Relief & Aid Advisories', 'Community Module'],
    'activities-manage': ['Manage Activities', 'Community Module'],
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
// SHARED FORM STYLE CONSTANTS (CSS Variable-driven)
// ─────────────────────────────────────────────
const formCardStyle  = { backgroundColor: 'var(--surface)',  color: 'var(--text)', border: '1px solid var(--border)' };
const formFieldStyle = { backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' };
const formLabelStyle = { color: 'var(--text)' };
// ─────────────────────────────────────────────
// DYNAMIC NAME DICTIONARY
// ─────────────────────────────────────────────
const NAME_MAP = {
  mgcortero:    'Mark Gian Cortero',
  jmacabangon:  'Juhairo Macabangon',
};

const ACTION_META = {
  LOGIN: { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>, 
    bg: 'rgba(59, 130, 246, 0.1)', 
    badge: 'Online', 
    bClass: 't' 
  },
  USER_LOGIN: { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>, 
    bg: 'rgba(59, 130, 246, 0.1)', 
    badge: 'Online', 
    bClass: 't' 
  },
  CREATE: { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>, 
    bg: 'rgba(239, 68, 68, 0.1)', 
    badge: 'New', 
    bClass: 'g' 
  },
  UPDATE: { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>, 
    bg: 'rgba(245, 158, 11, 0.1)', 
    badge: 'Modified', 
    bClass: 'g' 
  },
  ARCHIVE: { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>, 
    bg: 'rgba(20, 184, 166, 0.1)', 
    badge: 'Archived', 
    bClass: 'a' 
  },
  APPROVE: { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, 
    bg: 'rgba(16, 185, 129, 0.1)', 
    badge: 'Approved', 
    bClass: 't' 
  },
  SYNC: { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>, 
    bg: 'rgba(20, 184, 166, 0.1)', 
    badge: 'Synced', 
    bClass: 'b' 
  },
  RESOLVE: { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>, 
    bg: 'rgba(245, 158, 11, 0.1)', 
    badge: 'Resolved', 
    bClass: 'g' 
  },
  FLAG: { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>, 
    bg: 'rgba(239, 68, 68, 0.1)', 
    badge: 'Flagged', 
    bClass: 'g' 
  },
};

function getActionMeta(action = '') {
  const key = action.toUpperCase();
  return ACTION_META[key] || { 
    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, 
    bg: 'rgba(148, 163, 184, 0.1)', 
    badge: 'Info', 
    bClass: 'g' 
  };
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

const searchResidentHelper = (queryStr, residents) => {
  if (!queryStr) return [];
  const q = queryStr.toLowerCase().trim();
  
  return residents.filter((res) => {
    // 1. Kuhanin ang buong pangalan sa lahat ng posibleng format
    const fullFirstLast = `${res.firstName || ''} ${res.middleName || ''} ${res.lastName || ''}`.toLowerCase();
    const fullLastFirst = `${res.lastName || ''}, ${res.firstName || ''}`.toLowerCase();
    const directName = String(res.name || '').toLowerCase();
    
    // 2. Kuhanin ang mga IDs
    const resId = String(res.id || res._id || '').toLowerCase();
    const rbiId = String(res.rbiId || '').toLowerCase();
    
    // 3. I-check kung may nag-match sa query
    return (
      fullFirstLast.includes(q) ||
      fullLastFirst.includes(q) ||
      directName.includes(q) ||
      resId.includes(q) ||
      rbiId.includes(q)
    );
  });
};

// ── Helper Mapper Function outside the component ──
export const mapDocToBlotter = (doc) => {
  if (!doc) return null;

  // Extract Complainant Name (String or Object)
  const complainantName = typeof doc.complainant === 'object'
    ? (doc.complainant?.name || doc.complainant?.displayName || 'Resident')
    : (doc.complainant || doc.complainantName || doc.compName || 'Resident');

  // Extract Respondent Name (String or Object)
  const respondentName = typeof doc.respondent === 'object'
    ? (doc.respondent?.name || doc.respondent?.displayName || 'N/A')
    : (doc.respondent || doc.respondentName || doc.respName || 'N/A');

  // Extract Case/Ref Number
  const caseId = doc.refNumber || doc.trackingNo || doc.caseNo || doc.caseNum || doc.id || doc._id;

  // Extract Type / Subject
  const caseType = doc.subject || doc.incidentType || doc.type || doc.docType || 'General Complaint';

  // Extract Date
  const caseDate = doc.incidentDate || doc.dateFiled || doc.createdAt || doc.date || 'N/A';

  // Extract Timestamp for Sorting (Latest edit or creation)
  const lastUpdated = doc.updatedAt || doc.timestamp || doc.createdAt || doc.dateFiled || new Date().toISOString();

  return {
    _id: doc._id,
    id: caseId,
    trackingNo: caseId,
    type: caseType,
    incidentType: caseType,
    complainant: complainantName,
    respondent: respondentName,
    location: doc.location || doc.purok || 'Barangay Bustrac',
    date: caseDate,
    updatedAt: lastUpdated, 
    status: doc.status || 'Pending',
    summonCount: Number(doc.summonCount || 0),
    cfaIssued: Boolean(doc.cfaIssued),
    details: doc.details || doc.narrative || doc.description || '',
    isVawc: Boolean(doc.isVawc || doc.type === 'VAWC' || caseType.includes('VAWC')),
    rawDoc: doc
  };
};
// ── Helper: Kunin ang next Business ID at i-increment ang sequence (TOTOONG SAVE) ──
const getNextBusinessSequence = async () => {
  try {
    let seqDoc;
    try {
      seqDoc = await db.get('seq_business_clearance');
    } catch (err) {
      if (err.name === 'not_found') {
        // Start at 155 para ang next ay maging 0156
        seqDoc = { _id: 'seq_business_clearance', lastNumber: 155 }; 
      } else {
        throw err;
      }
    }
    const nextNumber = (seqDoc.lastNumber || 155) + 1;
    await db.put({ ...seqDoc, lastNumber: nextNumber });
    return String(nextNumber).padStart(4, '0');
  } catch (err) {
    console.error('Failed to get business sequence:', err);
    // Fallback kung may error sa DB
    return String(Date.now()).slice(-4); 
  }
};


// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function DashboardPortal({ role = 'staff' }) {
const businessFormRef = useRef(null);
const [isSavingClearance, setIsSavingClearance] = useState(false);
const [isSavingBusiness, setIsSavingBusiness] = useState(false);
const [showBusinessPrintModal, setShowBusinessPrintModal] = useState(false);
const [selectedBusinessCert, setSelectedBusinessCert] = useState(null);
const handlePrintBusinessClearance = (record) => {
  if (!record) {
    console.error('No record provided for printing');
    return;
  }

  // Format owner name
  const ownerName = (
    record.ownerName ||
    `${record.lastName || ''}, ${record.firstName || ''} ${record.middleName || ''}`.trim() ||
    `${record.firstName || ''} ${record.lastName || ''}`.trim()
  ).toUpperCase();

  const certData = {
    ...record,
    certType: 'Business Clearance',
    certificateType: 'Business Clearance',
    type: 'business_clearance',
    ownerName: ownerName,
    applicantName: ownerName,
    fullName: ownerName,
    firstName: record.firstName || '',
    lastName: record.lastName || '',
    middleName: record.middleName || '',
    businessName: record.businessName || '',
    natureOfBusiness: record.natureOfBusiness || '',
    businessAddress: record.businessAddress || '',
    contactNo: record.contactNo || '',
    civilStatus: record.civilStatus || '',
    occupation: record.occupation || '',
    nationality: record.nationality || 'Filipino',
    address: record.applicantAddress || '',
    purok: record.purok || record.applicantAddress || '',
    applicantAddress: record.applicantAddress || '',
    bcIdNo: record.bcIdNo || '',
    orNo: record.orNo || '',
    orNumber: record.orNo || '',
    clearanceFee: record.clearanceFee || '0.00',
    amount: record.clearanceFee || '0.00',
    amountPaid: record.clearanceFee || '0.00',
    garbageFee: record.garbageFee || '0.00',
    dateIssued: record.orDateIssued || record.regDate || new Date().toISOString().split('T')[0],
    issuedAt: record.orDateIssued || record.regDate || new Date().toISOString(),
    regDate: record.regDate || new Date().toISOString().split('T')[0],
    createdAt: record.createdAt || new Date().toISOString(),
    secretary: record.secretary || settingsForm?.luponSecretary || 'MRS. MELY M. PRESADO',
    captain: record.captain || settingsForm?.punongBarangay || 'HON. ANNABELLE E. RULL',
    punongBarangay: record.captain || settingsForm?.punongBarangay || 'HON. ANNABELLE E. RULL',
    photoUrl: record.photoUrl || null,
    purpose: record.natureOfBusiness || 'Business Clearance Registration',
    clearanceYear: record.regDate ? new Date(record.regDate).getFullYear() : new Date().getFullYear(),
    clearanceExpires: 'DECEMBER 31',
    kindOfTransaction: 'Renewal',
    status: record.status || 'Issued',
    printMode: 'original',
    isDuplicate: false,
  };

  // I-set ang Modal State para lumabas ang Preview Overlay
  setSelectedBusinessCert(certData);
  setShowBusinessPrintModal(true);
};

const handlePrintBusinessDocument = async () => {
  if (!selectedBusinessCert) {
    console.warn('Walang napiling business certificate para i-print.');
    return;
  }

  try {
    if (selectedBusinessCert._id && selectedBusinessCert.type === 'business_clearance') {
      const latestDoc = await db.get(selectedBusinessCert._id);
      const updatedDoc = {
        ...latestDoc,
        status: 'Issued',
        printedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.put(updatedDoc);

      try {
        await createAuditLog({
          action: 'PRINT_BUSINESS_CLEARANCE',
          module: 'BUSINESS_CLEARANCE',
          recordId: updatedDoc.bcIdNo || updatedDoc._id,
          user: `${currentUser?.username || 'admin'} (${role})`,
          details: `Printed Business Clearance for ${updatedDoc.businessName || 'Business'}`,
        });
      } catch (auditErr) {
        console.warn('Bumagsak ang audit log sa business clearance print:', auditErr);
      }

      if (typeof forceSyncToRemote === 'function') {
        await forceSyncToRemote();
      }
    }

    // Patakbuhin ang browser print dialog
    setTimeout(() => {
      window.print();
    }, 300);
  } catch (err) {
    console.error('Bumagsak ang DB update (magpapatuloy pa rin sa pag-print):', err);
    setTimeout(() => {
      window.print();
    }, 300);
  }
};
  const [blotterList, setBlotterList] = useState(() => {
  try {
    const saved = localStorage.getItem('bustrac_blotter');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
});

const getStatusBadge = (status) => {
  switch (status) {
    case 'Settled / Closed':
      return <span style={{ padding: '4px 8px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 'bold' }}>✓ Settled</span>;
    case 'Referred to Lupon':
      return <span style={{ padding: '4px 8px', borderRadius: '4px', background: '#fef3c7', color: '#b45309', fontWeight: 'bold' }}>⚠️ Referred to Lupon</span>;
    case 'Dismissed':
      return <span style={{ padding: '4px 8px', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c', fontWeight: 'bold' }}>✕ Dismissed</span>;
    default:
      return <span style={{ padding: '4px 8px', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', fontWeight: 'bold' }}>🔵 {status || 'Open'}</span>;
  }
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

  const settledBlotterCount = blotterList.filter(b => b.status === 'Settled / Resolved' || b.status === 'Settled').length;
  const cfaBlotterCount = blotterList.filter(b => b.cfaIssued || b.status === 'Referred to PNP (CFA Issued)').length;
  const activeBlotterCount = blotterList.filter(b => b.status === 'Pending' || b.status === 'Open' || b.status === 'Under Mediation').length;

  const feedbackSummary = {
    complaint: feedbackList.filter(f => f.feedbackType === 'Complaint').length,
    inquiry: feedbackList.filter(f => f.feedbackType === 'Inquiry').length,
    suggestion: feedbackList.filter(f => f.feedbackType === 'Suggestion').length
  };

const [printModalOpen, setPrintModalOpen] = useState(false);
const [selectedPrintData, setSelectedPrintData] = useState(null);

const handleOpenPrint = (blotterItem) => {
    setSelectedBlotter(blotterItem);
    setIsPrintModalOpen(true);
};

  // ── INDIGENCY PRINT MODAL STATES ──
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedPrintCert, setSelectedPrintCert] = useState(null);
  
  const [printMode, setPrintMode] = useState('original');
  const handleOpenPrintModal = useCallback((certData) => {
  setSelectedPrintCert(certData);
  setShowPrintModal(true);
}, []);

  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // ── Dynamic User Identity ──
const rawUser = localStorage.getItem('bustrac_user');

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
  
    const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
  const handleOnline = () => {
  setSyncState('syncing');
  setTimeout(() => setSyncState('synced'), 1500);
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

  // ── POUCHDB PERFORMANCE INDEXING ──
useEffect(() => {
  const setupIndexes = async () => {
    try {
      // Check kung may function na createIndex bago tawagin
      if (typeof db?.createIndex === 'function') {
        await db.createIndex({ index: { fields: ['type', 'status', 'createdAt'] } });
        await db.createIndex({ index: { fields: ['clearanceNo', 'type'] } });
        console.log(' PouchDB indexes created successfully.');
      }
    } catch (err) {
      // Silent fail lang, hindi ito critical dahil gumagana ang allDocs
      console.warn('PouchDB index creation skipped:', err.message);
    }
  };
  setupIndexes();
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
  
  const [residentSort, setResidentSort] = useState({
  key: null,
  direction: 'none'
  });

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
const [confirmDeleteId, setConfirmDeleteId] = useState(null); 

// Target ID for the safe delete prompt
const [openActionMenu, setOpenActionMenu] = useState(null);
const [selectedProgramId, setSelectedProgramId] = useState('');

useEffect(() => {
  const handleClickOutside = (event) => {
    // Close if clicking outside of any kebab button or menu
    const isKebabButton = event.target.closest('[data-kebab-btn]');
    const isMenu = event.target.closest('[data-kebab-menu]');
    
    if (!isKebabButton && !isMenu) {
      setOpenActionMenu(null);
    }
  };
  
  if (openActionMenu) {
    document.addEventListener('mousedown', handleClickOutside);
  }
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, [openActionMenu]);

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
  
  const [issuedCertificates, setIssuedCertificates] = useState([]);
const [issuedHistorySearch, setIssuedHistorySearch] = useState('');
const [issuedCertificateSearch, setIssuedCertificateSearch] = useState('');



const filteredIssuedCertificates = issuedCertificates.filter((cert) => {
  const query = issuedCertificateSearch.toLowerCase().trim();

  return (
    String(cert._id || '').toLowerCase().includes(query) ||
    `${cert.firstName || ''} ${cert.lastName || ''}`
      .toLowerCase()
      .includes(query) ||
    String(cert.certificateType || '').toLowerCase().includes(query) ||
    String(cert.purpose || '').toLowerCase().includes(query)
  );
});

const handleIssueCertificate = async (cert) => {
  try {
    const now = new Date().toISOString();

    const updated = {
      ...cert,
      step: 5,
      status: 'Issued',
      issuedAt: now,
      updatedAt: now,
    };

    await db.put(updated);

    // ➔ Add Audit Log Call
    try {
      await createAuditLog({
        action: 'APPROVE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: updated.refNumber || updated._id,
        user: `${currentUser?.username || 'admin'} (${role})`,
        details: `Issued ${updated.certificateType || updated.certType || 'Certificate'} for ${
          updated.firstName || updated.lastName
            ? `${updated.firstName || ''} ${updated.lastName || ''}`.trim()
            : updated.fullName || updated.residentName || 'Resident'
        }`,
      });
    } catch (auditErr) {
      console.warn('Audit log failed for Certificate:', auditErr);
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    setIssuedCertificates((prev) =>
      prev.map((item) => (item._id === cert._id ? updated : item))
    );
  } catch (error) {
    console.error('Unable to issue certificate:', error);
  }
};

const handleReleaseDocument = async (cert) => {
  try {
    const now = new Date().toISOString();

    const updated = {
      ...cert,
      step: 6,
      status: 'Released',
      releasedAt: now,
      updatedAt: now,
    };

    await db.put(updated);

    // ➔ Add Audit Log Call
    try {
      await createAuditLog({
        action: 'APPROVE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: updated.refNumber || updated._id,
        user: `${currentUser?.username || 'admin'} (${role})`,
        details: `Released ${updated.certificateType || updated.certType || 'Certificate'} for ${
          updated.firstName || updated.lastName
            ? `${updated.firstName || ''} ${updated.lastName || ''}`.trim()
            : updated.fullName || updated.residentName || 'Resident'
        }`,
      });
    } catch (auditErr) {
      console.warn('Audit log failed for Certificate release:', auditErr);
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    setIssuedCertificates((prev) =>
      prev.map((item) => (item._id === cert._id ? updated : item))
    );
  } catch (error) {
    console.error('Unable to release certificate:', error);
  }
};

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
    console.log('🔴 submitEditResident TINAWAG!');
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
  const [beneficiarySearch, setBeneficiarySearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  // Admin: Beneficiary List
  const [beneficiaryDraft, setBeneficiaryDraft] = useState({
    name:    '',
    residentId: '',
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
  const [saving, setSaving] = useState(false);

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
      showToast('Please fill in all required fields (names and narrative)');
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
    firstName: res.firstName || nameParts[0] || '',
    middleName: res.middleName || '',
    lastName: res.lastName || nameParts[nameParts.length - 1] || '',
    birthdate: res.birthdate || '2026-01-01',
    gender: res.gender || 'Male',
    civilStatus: res.civilStatus,
    contact: res.contact || '09123456789',
    purok: res.purok,
    household: res.household,
    rbiId: res.rbiId || ''
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
    rbiNo,
    householdNo,
    lastName,
    firstName,
    middleName,
    birthdate,
    sex,               // Dating: gender
    civilStatus,
    contactNo,         // Dating: contact
    purokZoneAddress,  // Dating: purok
    isHouseholdHead,   // Dating: householdHead
    isRegisteredVoter  // Dating: voter
  } = residentForm;

  // 2. Required fields validation (gamit ang tamang variable names)
  if (
    !firstName?.trim() ||
    !middleName?.trim() ||
    !lastName?.trim() ||
    !birthdate ||
    !sex ||
    !civilStatus ||
    !contactNo?.trim() ||
    !purokZoneAddress?.trim() ||
    !householdNo?.trim() ||
    !rbiNo?.trim()
  ) {
    showToast('Please fill in all required fields, including RBI ID.');
    return;
  }

  const normalizedRbiId = rbiNo.trim().toUpperCase();

  // 3. Prevent duplicate RBI ID
  const duplicateRbiId = residentsList.some(
    (res) => res.rbiId?.trim().toUpperCase() === normalizedRbiId && res.id !== editingResidentId
  );
  if (duplicateRbiId) {
    alert(`RBI ID ${normalizedRbiId} is already assigned to another resident.`);
    return;
  }

  const fullName = `${firstName.trim()} ${middleName.trim()} ${lastName.trim()}`;

  // 4. Purok badge class logic
  let dynamicPurokClass = 'b';
  const purokLower = purokZoneAddress.toLowerCase();
  if (purokLower.includes('1')) dynamicPurokClass = 'p';
  else if (purokLower.includes('2')) dynamicPurokClass = 'g';
  else if (purokLower.includes('5')) dynamicPurokClass = 'a';

  // =========================================================
  // SCENARIO A: UPDATE EXISTING RESIDENT
  // =========================================================
  if (editingResidentId) {
    const updatedList = residentsList.map((res) => {
      if (res.id !== editingResidentId) return res;
      return {
        ...res,
        rbiId: normalizedRbiId,
        firstName: firstName.trim(),
        middleName: middleName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        birthdate,
        gender: sex, // Map sex to gender for list consistency
        civilStatus,
        contact: contactNo.trim(), // Map contactNo to contact
        purok: purokZoneAddress, // Map purokZoneAddress to purok
        purokClass: dynamicPurokClass,
        age: new Date().getFullYear() - new Date(birthdate).getFullYear(),
        household: householdNo, // Map householdNo to household
        householdHead: Boolean(isHouseholdHead),
        voter: Boolean(isRegisteredVoter),
      };
    });
    
    setResidentsList(updatedList);
    localStorage.setItem('bustrac_residents', JSON.stringify(updatedList));

    try {
      const existingDoc = await db.get(editingResidentId);
      await db.put({
        ...existingDoc,
        rbiId: normalizedRbiId,
        firstName: firstName.trim(),
        middleName: middleName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        birthdate,
        gender: sex,
        civilStatus,
        contact: contactNo.trim(),
        purok: purokZoneAddress,
        household: householdNo,
        householdHead: Boolean(isHouseholdHead),
        voter: Boolean(isRegisteredVoter),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Resident not yet in PouchDB (local update only):', err);
    }

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
  // SCENARIO B: CREATE NEW RESIDENT
  // =========================================================
  const newResidentId = `RES-${String(residentsList.length + 1).padStart(4, '0')}`;

  const newResident = {
    id: newResidentId,
    rbiId: normalizedRbiId,
    firstName: firstName.trim(),
    middleName: middleName.trim(),
    lastName: lastName.trim(),
    name: fullName,
    birthdate,
    gender: sex,
    civilStatus,
    contact: contactNo.trim(),
    purok: purokZoneAddress,
    purokClass: dynamicPurokClass,
    age: new Date().getFullYear() - new Date(birthdate).getFullYear(),
    household: householdNo,
    householdHead: Boolean(isHouseholdHead),
    voter: Boolean(isRegisteredVoter),
    conflict: false,
  };

  const updatedList = [...residentsList, newResident];
  setResidentsList(updatedList);
  localStorage.setItem('bustrac_residents', JSON.stringify(updatedList));

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
    gender: sex,
    civilStatus,
    contact: contactNo.trim(),
    purok: purokZoneAddress,
    household: householdNo,
    householdHead: Boolean(isHouseholdHead),
    voter: Boolean(isRegisteredVoter),
    conflict: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await db.put(residentDoc);
  } catch (error) {
    console.error('Failed to save resident to PouchDB:', error);
  }

  await createAuditLog({
    action: 'CREATE',
    module: 'RESIDENTS',
    recordId: newResidentId,
    details: `Added new resident record: ${fullName} (${normalizedRbiId})`,
  });

  showToast(`Resident added successfully!\n\nResident ID: ${newResidentId}\nRBI ID: ${normalizedRbiId}\nName: ${fullName}`);
  setResidentForm(EMPTY_RESIDENT);
  nav('residents');
};
 
 const submitAddHousehold = async (e) => {
  e.preventDefault();
  const { head, address, purok } = householdForm;

  if (!head || !address || !purok) {
    showToast('Please fill in all required fields.');
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
};

const submitEditHousehold = async (e) => {
  e.preventDefault();
  setSaving(true);
  
  try {
    const { head, address, purok } = householdForm;
    if (!head || !address || !purok) {
      showToast('Please fill in all required fields.');
      return;
    }

    let dynamicPurokClass = 'b';
    if (purok.includes('1')) dynamicPurokClass = 'p';
    else if (purok.includes('2')) dynamicPurokClass = 'g';
    else if (purok.includes('5')) dynamicPurokClass = 'a';

    setHouseholdsList(prev => prev.map(h => {
      if (h.id === selectedHouseholdId) {
        return { ...h, head, address, purok, purokClass: dynamicPurokClass };
      }
      return h;
    }));

    await createAuditLog({
      action: 'UPDATE',
      module: 'HOUSEHOLDS',
      recordId: selectedHouseholdId,
      details: `Updated household record: ${head}`,
    });

    alert(`Household ${selectedHouseholdId} updated successfully!`);
    setHouseholdForm(EMPTY_HOUSEHOLD);
    setSelectedHouseholdId(null);
    nav('households');
  } catch (error) {
    console.error('Error saving household:', error);
    alert('Failed to save household. Please try again.');
  } finally {
    setSaving(false); 
  }
};

// ─────────────────────────────────────────────
// HANDLERS — ANNOUNCEMENTS
// ─────────────────────────────────────────────
const handleSaveAnnouncement = async (e, status = 'Published') => {
  e.preventDefault();
  const { title, category, content, pinned } = announcementForm;
  if (!title.trim() || !content.trim()) {
    alert('Title and Content are required.');
    return;
  }

  const loggedInUser = JSON.parse(
    sessionStorage.getItem('bustrac_user') || '{}'
  );
  const now = new Date().toISOString();

  const newAnnouncement = {
    _id: `announcement_${Date.now()}`,
    type: 'announcement',
    title: title.trim(),
    category: category || 'General',
    body: content.trim(),
    content: content.trim(),
    pinned: Boolean(pinned),
    author: loggedInUser?.fullName || loggedInUser?.name || 'Barangay Office',
    date: now,
    status,
    timestamp: now,
    createdAt: now,
  };

  try {
    await db.put(newAnnouncement);

    if (typeof db.replicate === 'function') {
      await db.replicate.to(remoteCouchDB);
    }

    setAnnouncementsList((prev) => [
      newAnnouncement,
      ...prev.filter((a) => a._id !== newAnnouncement._id),
    ]);

    await createAuditLog({
      action: 'CREATE',
      module: 'ANNOUNCEMENTS',
      recordId: newAnnouncement._id,
      details: `Published announcement: "${newAnnouncement.title}"`,
    });

    alert(
      `Announcement "${newAnnouncement.title}" ${
        status === 'Published' ? 'published' : 'saved as draft'
      }.`
    );

    setAnnouncementForm({
      title: '',
      category: 'General',
      content: '',
      pinned: false,
      status: 'Published',
    });
    setAnnouncementSubScreen('list');
  } catch (err) {
    console.error('Failed to save announcement:', err);
    alert('Error saving announcement. Check console.');
  }
};

// Sync announcements with PouchDB
useEffect(() => {
  const fetchAnnouncements = async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const announcements = result.rows
        .map(row => row.doc)
        .filter(doc => doc?.type === 'announcement')
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setAnnouncementsList(announcements);
      localStorage.setItem('bustrac_announcements', JSON.stringify(announcements));
    } catch (err) {
      console.error('Error loading announcements:', err);
    }
  };
  fetchAnnouncements();

  const changes = db.changes({
    since: 'now',
    live: true,
    include_docs: true,
    filter: (doc) => doc.type === 'announcement'
  }).on('change', (change) => {
    if (change.doc?.type === 'announcement') {
      setAnnouncementsList(prev => {
        const filtered = prev.filter(a => a._id !== change.doc._id);
        return [change.doc, ...filtered];
      });
    }
  }).on('error', console.error);

  return () => changes.cancel();
}, []);

  // ─────────────────────────────────────────────
// HANDLERS — DYNAMIC ADMIN COMPLAINT / SUMMONS
// ─────────────────────────────────────────────
const updateComplaintField = (field, value) =>
  setComplaint((prev) => ({ ...prev, [field]: value }));

const saveComplaintChanges = () => {
  const { caseNum, compName, respName, narrative, incidentType, caseStatus, location } = complaint;
  
  if (!compName || !respName || !narrative) {
    showToast(' Please fill in all required fields (names and narrative)');
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

const sendSummons = async (caseRecord) => {
  // 1. Get the correct record from the parameter or state
  const targetCase = caseRecord || selectedBlotter || complaint || {};
  const caseId = targetCase._id || targetCase.trackingNo || targetCase.id || targetCase.caseNo;
  const respondentName = typeof targetCase.respondent === 'object'
    ? (targetCase.respondent.name || targetCase.respondent.displayName)
    : (targetCase.respondent || targetCase.respondentName || targetCase.respName || 'Respondent');

  const summonDate = targetCase.nextHearingDate || targetCase.summonDate || '2026-09-30';
  const summonTime = targetCase.timeFiled || '02:00 PM';

  if (!caseId) {
    alert('⚠️ Invalid Case ID. Cannot send summons.');
    return;
  }

  // 2. Determine which Summon number is next based on the current count
  const currentCount = typeof targetCase.summonCount === 'number'
    ? targetCase.summonCount
    : (targetCase.status?.includes('1st') ? 1 : targetCase.status?.includes('2nd') ? 2 : targetCase.status?.includes('3rd') ? 3 : 0);

  let nextActionType = '1st_summon';
  let nextStatusLabel = '1st Summon Issued';

  if (currentCount === 1) {
    nextActionType = '2nd_summon';
    nextStatusLabel = '2nd Summon Issued';
  } else if (currentCount >= 2) {
    nextActionType = '3rd_summon';
    nextStatusLabel = '3rd Summon Issued';
  }

  // 3. Confirmation Dialog
  const confirmMsg = `Send official summons (${nextStatusLabel}) to ${respondentName} via SMS and Email?\n\n` +
    `Appearance Schedule: ${summonDate} at ${summonTime}\n\n` +
    `This operational transaction will toggle data logs and sync to Resident Portal.`;

  if (window.confirm(confirmMsg)) {
    try {
      // 4. Execute the PouchDB Update and State Refresh
      await handleBlotterAction(caseId, nextActionType);

      alert(
        `✓ Summons successfully dispatched via SMS & Email engine!\n\n` +
        `Tracking Log: ${caseId}\n` +
        `Recipient Party: ${respondentName}\n` +
        `Updated Status: ${nextStatusLabel}\n` +
        `Scheduled Date: ${summonDate} [${summonTime}]`
      );
    } catch (err) {
      console.error('Failed to dispatch summons:', err);
      alert(`⚠️ Dispatch failed: ${err.message}`);
    }
  }
};

// 1. Trigger Function: Just opens the modal and sets the initial states
const handleBlotterAction = (blotterId, actionType) => {
  setSelectedBlotterForAction(blotterId);
  setActionType(actionType);
  setScheduleDate('');
  setActionNotes('');
  setActionModalOpen(true);
};

// 2. Submit Function: This is what saves to PouchDB
const submitBlotterAction = async () => {
  if (!db) {
    alert('Database connection is unavailable.');
    return;
  }
  if (!scheduleDate && actionType.includes('summon')) {
    alert('Please enter a Schedule Date & Time for the summon.');
    return;
  }
  setActionSaving(true);
  try {
    const blotterId = selectedBlotterForAction;
    let doc;
    try {
      doc = await db.get(blotterId);
    } catch (getErr) {
      const allRes = await db.allDocs({ include_docs: true });
      const foundRow = allRes.rows.find(r => r.doc && (
        r.doc._id === blotterId || r.doc.trackingNo === blotterId || r.doc.caseNo === blotterId || r.doc.id === blotterId
      ));
      if (foundRow) {
        doc = foundRow.doc;
      } else {
        throw new Error(`Record with ID ${blotterId} not found in database.`);
      }
    }
    const nowIso = new Date().toISOString();
    let updatedDoc = { ...doc, updatedAt: nowIso };

    if (!Array.isArray(updatedDoc.history)) {
      updatedDoc.history = [];
    }

    let newStatus = doc.status;
    let newSummonCount = doc.summonCount || 0;

    if (actionType === '1st_summon') {
      newStatus = '1st Summon Issued';
      newSummonCount = 1;
      updatedDoc.nextHearingDate = scheduleDate;
    } else if (actionType === '2nd_summon') {
      newStatus = '2nd Summon Issued';
      newSummonCount = 2;
      updatedDoc.nextHearingDate = scheduleDate;
    } else if (actionType === '3rd_summon') {
      newStatus = '3rd Summon Issued';
      newSummonCount = 3;
      updatedDoc.nextHearingDate = scheduleDate;
    } else if (actionType === 'settled') {
      newStatus = 'Settled / Resolved';
      updatedDoc.resolution = actionNotes || 'Amicable Settlement Reached';
      updatedDoc.resolvedAt = nowIso;
    } else if (actionType === 'escalate_cfa') {
      newStatus = 'Referred to PNP (CFA Issued)';
      updatedDoc.cfaIssued = true;
      updatedDoc.cfaIssuedAt = nowIso;
    }

    updatedDoc.status = newStatus;
    updatedDoc.summonCount = newSummonCount;
    updatedDoc.lastSummonDate = nowIso.split('T')[0];

    updatedDoc.history.push({
      action: actionType,
      status: newStatus,
      date: nowIso,
      scheduleDate: scheduleDate || null,
      notes: actionNotes,
      performedBy: 'Admin'
    });

    const putRes = await db.put(updatedDoc);
    updatedDoc._rev = putRes.rev;

    // Update local selected state
    if (typeof setSelectedBlotter === 'function') {
      setSelectedBlotter(updatedDoc);
    }
    localStorage.setItem('active_blotter_data', JSON.stringify(updatedDoc));

    // Refresh the main blotters list
    if (typeof setBlotters === 'function') {
      setBlotters(prev => prev.map(item => (item._id === updatedDoc._id ? updatedDoc : item)));
    } else if (typeof setBlotterList === 'function') {
      setBlotterList(prev => prev.map(item => (item._id === updatedDoc._id ? updatedDoc : item)));
    }

    try {
      await createAuditLog({
        action: 'UPDATE_BLOTTER_STATUS',
        module: 'BLOTTER',
        recordId: doc.refNumber || doc._id,
        user: `${currentUser?.username || 'admin'} (admin)`,
        details: `Updated Blotter status to "${newStatus}" for Case Ref: ${doc.refNumber || doc._id}`
      });
    } catch (auditErr) {
      console.warn('Audit log creation failed:', auditErr);
    }

    setActionModalOpen(false);
    setSelectedBlotterForAction(null);
    alert(`Status successfully updated to: ${newStatus}`);

  } catch (err) {
    console.error('Failed to update blotter case status:', err);
    alert(`Unable to update case status: ${err.message}`);
  } finally {
    setActionSaving(false);
  }
};

const handleStatusDropdownChange = async (newStatus) => {
  if (!selectedBlotter) return;

  const caseId = selectedBlotter._id || selectedBlotter.trackingNo || selectedBlotter.id;

  let actionType = '';
  if (newStatus === '1st Summon Issued') actionType = '1st_summon';
  else if (newStatus === '2nd Summon Issued') actionType = '2nd_summon';
  else if (newStatus === '3rd Summon Issued') actionType = '3rd_summon';
  else if (newStatus === 'Settled / Resolved') actionType = 'settled';
  else if (newStatus === 'Referred to PNP (CFA Issued)') actionType = 'escalate_cfa';

  if (actionType) {
    await handleBlotterAction(caseId, actionType);
  } else {
    try {
      const doc = await db.get(caseId);
      const updatedDoc = {
        ...doc,
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      const putRes = await db.put(updatedDoc);
      updatedDoc._rev = putRes.rev;
      
      setSelectedBlotter(updatedDoc);
      localStorage.setItem('active_blotter_data', JSON.stringify(updatedDoc));
    } catch (err) {
      console.error('Failed to update status via dropdown:', err);
    }
  }
};

  // ─────────────────────────────────────────────
  // HANDLERS — ADMIN BENEFICIARY LIST
  // ─────────────────────────────────────────────
  const addToList = () => {
  if (!beneficiaryDraft.residentId) {
    alert('Please select a resident from the list.');
    return;
  }
  if (!beneficiaryDraft.aidType.trim()) {
    alert('Please enter an aid type.');
    return;
  }
  setBeneficiaryList((prev) => [...prev, beneficiaryDraft]);
  setBeneficiaryDraft({ name: '', residentId: '', aidType: 'Rice 5kg', qty: 1 });
  setBeneficiarySearch('');
};

  const removeFromList = (index) =>
    setBeneficiaryList((prev) => prev.filter((_, i) => i !== index));

  const saveAll = async () => {
  if (beneficiaryList.length === 0) {
    alert('No beneficiaries to save.');
    return;
  }

  try {
    const now = new Date().toISOString();
    const batchId = `AIDBATCH-${Date.now()}`;

    // Persist each beneficiary as its own doc so it replicates + gets audited
    for (let i = 0; i < beneficiaryList.length; i++) {
      const b = beneficiaryList[i];
      const docId = `${batchId}-${String(i + 1).padStart(3, '0')}`;

      const aidPayload = {
        _id: docId,
        type: 'aid_distribution',
        refNumber: docId,
        programId: currentProgramId,
        residentId: b.residentId,
        residentName: b.name,
        aid: b.aidType,
        qty: b.qty,
        officer: displayName.split(' ')[0],
        status: 'OK',
        createdAt: now,
        updatedAt: now,
      };

      await db.put(aidPayload);

      // ➔ Add Audit Log Call per beneficiary
      try {
        await createAuditLog({
          action: 'CREATE_AID_DISTRIBUTION',
          module: 'AID_DISTRIBUTION',
          recordId: aidPayload.refNumber,
          user: `${currentUser?.username || 'admin'} (${role})`,
          details: `Saved aid "${aidPayload.aid}" (x${aidPayload.qty}) for ${aidPayload.residentName}`,
        });
      } catch (auditErr) {
        console.warn('Audit log failed for Aid Distribution:', auditErr);
      }
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    alert(`✓ Saved ${beneficiaryList.length} beneficiary record(s).`);
    setBeneficiaryList([]);
  } catch (err) {
    console.error('Failed to save beneficiaries:', err);
    alert('Failed to save beneficiaries. Please try again.');
  }
};

  const handlePrintRelease = async (req) => {
  if (
    !issuanceMeta.orNumber ||
    !String(issuanceMeta.orNumber).trim() ||
    !issuanceMeta.amountPaid
  ) {
    alert('Please fill in required payment fields (OR No. and Amount Paid).');
    return;
  }

  try {
    const targetId = req?._id || selectedCertificate?._id;
    if (!targetId) {
      alert('No certificate selected.');
      return;
    }

    const latestDoc = await db.get(targetId);
    const updatedDoc = {
      ...latestDoc,
      status: 'Issued',
      issuanceMeta: {
        ...issuanceMeta,
        issuedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    await db.put(updatedDoc);

    // ➔ Add Audit Log Call
    try {
      await createAuditLog({
        action: 'APPROVE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: updatedDoc.refNumber || updatedDoc._id,
        user: `${currentUser?.username || 'admin'} (${role})`,
        details: `Issued & printed ${
          updatedDoc.certificateType || updatedDoc.certType || 'Certificate'
        } for ${
          updatedDoc.firstName || updatedDoc.lastName
            ? `${updatedDoc.firstName || ''} ${updatedDoc.lastName || ''}`.trim()
            : updatedDoc.fullName || updatedDoc.residentName || 'Resident'
        } (OR#: ${issuanceMeta.orNumber})`,
      });
    } catch (auditErr) {
      console.warn('Audit log failed for Certificate print-release:', auditErr);
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    setApprovedCertificates((prev) =>
      prev.map((item) =>
        item._id === targetId ? { ...item, status: 'Issued' } : item
      )
    );

    window.print();
    alert('Certificate successfully issued and recorded!');
  } catch (err) {
    console.error('Print release failed:', err);
    alert('Failed to process certificate release.');
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
          ? 'Barangay Bustrac • Full System View'
          : 'Barangay Bustrac Operations',
      ];
    }
    return SCREEN_META[screen] ?? [screen, ''];
  })();
  // Dynamic computing: This looks for a match in the typed input against Name, ID, or Purok
  const filteredResidents = residentsList.filter((res) => {
  const query = searchTerm.toLowerCase();
  
  // Buuin ang Buong Pangalan mula sa available fields
  const fullName = res.name || `${res.firstName || ''} ${res.middleName || ''} ${res.lastName || ''}`.trim();
  
  const matchesSearch = 
    fullName.toLowerCase().includes(query) || 
    (res.id && String(res.id).toLowerCase().includes(query)) || 
    (res._id && String(res._id).toLowerCase().includes(query)) ||
    (res.rbiId && String(res.rbiId).toLowerCase().includes(query)) || 
    (res.purok && String(res.purok).toLowerCase().includes(query));

  return matchesSearch;
});

// Dynamic Calculations para sa Dashboard Panels
const totalResidents = residentsList.length;
const totalHouseholds = householdsList.length;
const totalVoters = residentsList.filter(r => r.voter || r.isVoter === 'Yes' || r.voterStatus === 'Yes').length;

// Safe Purok Counter (Ina-extract at pino-format ang Purok kahit may kasamang Zone o Address text)
const getPurokCount = (purokNumber) => {
  return residentsList.filter(r => {
    const p = String(r.purok || r.address || '').toLowerCase();
    return p.includes(`purok ${purokNumber}`) || p.includes(`purok${purokNumber}`);
  }).length;
};

// Tamang Breakdown para sa 5 Puroks ng Barangay Bustrac
const p1Count = getPurokCount(1);
const p2Count = getPurokCount(2);
const p3Count = getPurokCount(3);
const p4Count = getPurokCount(4);
const p5Count = getPurokCount(5);

// Helper function para sa tamang Percentage computation
const getPurokPercent = (count) => {
  if (!totalResidents || totalResidents === 0) return '0%';
  return `${Math.round((count / totalResidents) * 100)}%`;
};
const [currentBeneficiaryId, setCurrentBeneficiaryId] = useState('');
const [formAttempted, setFormAttempted] = useState(false);

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
const [clearanceSearch, setClearanceSearch] = useState('');
const [showClearancePrintModal, setShowClearancePrintModal] = useState(false);
const [selectedClearanceCert, setSelectedClearanceCert] = useState(null);

const [editingClearanceId, setEditingClearanceId] = useState(null);

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

const filteredClearances = clearanceList.filter((rec) => {
  const query = clearanceSearch.toLowerCase().trim();
  return (
    String(rec.clearanceNo || '').toLowerCase().includes(query) ||
    String(rec.fullName || '').toLowerCase().includes(query) ||
    String(rec.purpose || '').toLowerCase().includes(query) ||
    String(rec.dateIssued || '').toLowerCase().includes(query) ||
    String(rec.orNo || '').toLowerCase().includes(query)
  );
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

// ── Helper: Kunin ang next ID at i-increment ang sequence (TOTOONG SAVE) ──
const getNextClearanceSequence = async () => {
  try {
    let seqDoc;
    try {
      seqDoc = await db.get('seq_brgy_clearance');
    } catch (err) {
      if (err.name === 'not_found') {
        seqDoc = { _id: 'seq_brgy_clearance', lastNumber: 0 };
      } else {
        throw err;
      }
    }
    const nextNumber = (seqDoc.lastNumber || 0) + 1;
    await db.put({ ...seqDoc, lastNumber: nextNumber });
    return `BC-2026-${String(nextNumber).padStart(4, '0')}`;
  } catch (err) {
    console.error('Failed to get next sequence:', err);
    return `BC-2026-${String(Date.now()).slice(-4)}`;
  }
};

// ── Helper: Peek lang (hindi nag-i-increment) para sa preview sa form ──
const peekNextClearanceNo = async () => {
  try {
    const seqDoc = await db.get('seq_brgy_clearance');
    return `BC-2026-${String((seqDoc.lastNumber || 0) + 1).padStart(4, '0')}`;
  } catch (err) {
    if (err.name === 'not_found') return 'BC-2026-0001';
    console.warn('Peek sequence failed:', err);
    return `BC-2026-${String(clearanceList.length + 1).padStart(4, '0')}`;
  }
};



// ── Helper: Peek lang (hindi nag-i-increment) para sa preview sa form ──
const peekNextBusinessSequence = async () => {
  try {
    const seqDoc = await db.get('seq_business_clearance');
    return String((seqDoc.lastNumber || 155) + 1).padStart(4, '0');
  } catch (err) {
    if (err.name === 'not_found') return '0156';
    console.warn('Peek business sequence failed:', err);
    return '0156'; // Safe fallback
  }
};

// Save or Update Clearance Record
  const handleSaveClearance = async (e) => {
    e.preventDefault();
    if (!clearanceForm.fullName.trim() || !clearanceForm.purpose.trim()) {
      showToast('Please fill in the Resident Full Name and Purpose.', 'error'); // ⬅️ Toast Error
      return;
    }
    setIsSavingClearance(true); 
    try {
      const isEditing = Boolean(editingClearanceId);
      const docId = isEditing ? editingClearanceId : `brgy_clearance_${Date.now()}`;
      const newClearanceNo = isEditing ? clearanceForm.clearanceNo : await getNextClearanceSequence();
      
      const payload = {
        ...clearanceForm,
        clearanceNo: newClearanceNo,
        _id: docId,
        type: 'barangay_clearance',
        updatedAt: new Date().toISOString(),
        createdAt: clearanceForm.createdAt || new Date().toISOString(),
      };
      
      if (!isEditing) delete payload._rev;
      if (typeof db !== 'undefined' && db.put) {
        await db.put(payload);
      }

      if (typeof createAuditLog === 'function') {
        await createAuditLog({
          action: isEditing ? 'UPDATE' : 'CREATE',
          module: 'BARANGAY_CLEARANCE',
          recordId: newClearanceNo,
          details: `${isEditing ? 'Updated' : 'Issued'} Barangay Clearance ${newClearanceNo} for ${clearanceForm.fullName}`,
        });
      }

      showToast(isEditing ? 'Barangay Clearance updated successfully!' : `Barangay Clearance ${newClearanceNo} issued successfully!`, 'success');
      
      await resetClearanceForm();
      window.scrollTo({ top: 0, behavior: 'smooth' }); 
    } catch (err) {
      console.error('Failed to save barangay clearance:', err);
      showToast(`Error saving record: ${err.message || 'Database error'}`, 'error');
      } finally {
       setIsSavingClearance(false);
    }
  };


const resetClearanceForm = async () => {
  setEditingClearanceId(null);
  const nextNo = await peekNextClearanceNo();

  setClearanceForm({
    _id: '',
    _rev: undefined,
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
  setEditingClearanceId(rec._id);
  setClearanceForm({
    _id: rec._id || '',
    _rev: rec._rev || undefined, // Required for PouchDB updates
    clearanceNo: rec.clearanceNo || '',
    dateIssued: rec.dateIssued || new Date().toISOString().split('T')[0],
    fullName: rec.fullName || '',
    purpose: rec.purpose || '',
    remarks: rec.remarks || 'No Derogatory Record',
    validity: rec.validity || '(6) Six Months Validity',
    hasBlotterRecord: rec.hasBlotterRecord || false,
    orNo: rec.orNo || '',
    amtPaid: rec.amtPaid || '',
    ctcNo: rec.ctcNo || '',
    ctcAmtPaid: rec.ctcAmtPaid || '',
    ctcDateIssued: rec.ctcDateIssued || '',
    ctcPlaceIssued: rec.ctcPlaceIssued || '',
    secretary: rec.secretary || '',
    captain: rec.captain || '',
    createdAt: rec.createdAt || new Date().toISOString()
  });

  // Smooth scroll to top form section
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

  const targetResident = residentsList.find((r) => r.id === currentBeneficiaryId);
  if (!targetResident) return;

  const now = new Date();
  const timeStamp = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  const newLogEntry = {
    id: `LOG-${Date.now()}`,
    programId: currentProgramId,
    residentName: targetResident.name,
    residentId: targetResident.id,
    aid: aidType,
    officer: displayName.split(' ')[0],
    time: timeStamp,
    status: 'OK',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    // Persist to PouchDB so it survives refresh + replicates to CouchDB
    await db.put({
      _id: newLogEntry.id,
      type: 'aid_distribution',
      ...newLogEntry,
    });

    // ➔ Add Audit Log Call
    try {
      await createAuditLog({
        action: 'CREATE_AID_DISTRIBUTION',
        module: 'AID_DISTRIBUTION',
        recordId: newLogEntry.id,
        user: `${currentUser?.username || 'admin'} (${role})`,
        details: `Distributed "${newLogEntry.aid}" to ${newLogEntry.residentName} under program ${currentProgramId}`,
      });
    } catch (auditErr) {
      console.warn('Audit log failed for Aid Distribution:', auditErr);
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    setAidLogs([newLogEntry, ...aidLogs]);
    setRemarks('');

    if (selectedResidents.length > 0) {
      setSelectedResidents((prev) => prev.slice(1));
      alert(
        `Success: Na-log na ang ayuda para kay ${targetResident.name}. Umuusad na ang Batch Mode Queue!`
      );
    } else {
      setCurrentBeneficiaryId('');
      alert(`Success: Aid has been successfully recorded for ${targetResident.name}!`);
    }
  } catch (err) {
    console.error('Failed to save aid log to PouchDB:', err);
    alert('Hindi na-save ang aid entry sa offline database. Subukan muli.');
  }
};

const handleEncodeSubmit = async (e) => {
  setFormAttempted(true);
  if (e) e.preventDefault();

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

    // 8. Persist aid log to PouchDB + Audit Trace
  try {
    await db.put({
      _id: newLog.id,
      type: 'aid_distribution',
      ...newLog,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // ➔ Add Audit Log Call
    try {
      await createAuditLog({
        action: 'CREATE_AID_DISTRIBUTION',
        module: 'AID_DISTRIBUTION',
        recordId: newLog.id,
        user: `${currentUser?.username || 'admin'} (${role})`,
        details: `Saved aid program entry: distributed "${newLog.aid}" to ${newLog.residentName} under ${selectedProgramId}`,
      });
    } catch (auditErr) {
      console.warn('Audit log failed for Aid Distribution:', auditErr);
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }
  } catch (dbErr) {
    console.error('Failed to persist aid log to PouchDB:', dbErr);
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

// Load household data into form when entering edit mode
useEffect(() => {
  if (screen === 'edit-household' && selectedHouseholdId) {
    const hh = householdsList.find(h => h.id === selectedHouseholdId);
    if (hh) {
      setHouseholdForm({
        head: hh.head || '',
        address: hh.address || '',
        purok: hh.purok || ''
      });
    }
  }
}, [screen, selectedHouseholdId, householdsList]);

  // ── HOUSEHOLD VIEW DATA RESOLVER (Ilagay dito, bago ang return statement) ──
  const activeHousehold = householdsList.find(h => h.id === selectedHouseholdId);
  const activeFamilyMembers = residentsList.filter(r => r.household === selectedHouseholdId);

  // Fallback values para hindi maging 'undefined' at mag-trigger ng error
  const hh = activeHousehold || { 
    head: 'Unknown Head', 
    address: 'Unknown Address', 
    purok: 'N/A', 
    purokClass: '', 
    members: 0 
  };

  const familyMembers = activeFamilyMembers || [];

const handleUpdateResidentChanges = async (e) => {
  console.log('🔵 handleUpdateResidentChanges TINAWAG!');
  e.preventDefault();
  if (!selectedResidentId) return;

  const fullCombinedName = `${editForm.firstName} ${editForm.lastName}`.trim();
  const newPurokClass =
    editForm.purok === 'Purok 1'
      ? 'p'
      : editForm.purok === 'Purok 3'
      ? 'b'
      : editForm.purok === 'Purok 5'
      ? 'a'
      : 'g';

  // 1. Update React state at localStorage
  setResidentsList((prevList) => {
    const updatedList = prevList.map((r) => {
      if (r.id === selectedResidentId) {
        return {
          ...r,
          name: fullCombinedName,
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          civilStatus: editForm.civilStatus,
          purok: editForm.purok,
          household: editForm.household,
          rbiId: editForm.rbiId,
          purokClass: newPurokClass,
        };
      }
      return r;
    });
    localStorage.setItem('bustrac_residents', JSON.stringify(updatedList));
    return updatedList;
  });

  // 2. Update PouchDB kung naka-sync (ITO ANG KULANG)
  try {
    const existingDoc = await db.get(selectedResidentId);
    await db.put({
      ...existingDoc,
      name: fullCombinedName,
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      civilStatus: editForm.civilStatus,
      purok: editForm.purok,
      household: editForm.household,
      rbiId: editForm.rbiId,
      purokClass: newPurokClass,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Kapag hindi pa naka-save sa PouchDB (e.g. mock data lang), log lang
    console.warn('Resident not yet in PouchDB, local update only:', err);
  }

  alert(`✓ Success: Record for ${selectedResidentId} has been updated.`);
  nav('residents');
};

// ── 2. MAIN CORE BLOTTER FORM OBJECT STATE ──
const [blotterForm, setBlotterForm] = useState({
  date: new Date().toISOString().split('T')[0],
  time: '',
  type: 'Noise Complaint',
  location: '',
  isComplainantNonResident: false,
  complainant: '',
  complainantId: '',
  isRespondentNonResident: false,
  respondent: '',
  respondentId: '',
  respondentEmail: '', 
  witnesses: '',
  priority: 'Medium',
  actionTaken: 'Summoned Parties',
  narrative: '',
  status: 'Open',
  nextHearingDate: '',
  attachments: [],
  isVawc: false
});

// Master Effect para sa Admin Blotter Management sa DashboardPortal.jsx
useEffect(() => {
  if (!db) return;

  const fetchBlotters = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const blotterDocs = res.rows
        .map((row) => row.doc)
        .filter((doc) => {
          if (!doc) return false;

          // Exclude Certificate Documents
          if (doc.docType === 'certificate' || doc.type === 'certificate_request') {
            return false;
          }

          // Strict Blotter Document Identification
          const isExplicitBlotter =
            doc.docType === 'blotter' ||
            doc.type === 'blotter' ||
            doc.type === 'blotter_report';

          const hasBlotterRef = Boolean(
            doc.trackingNo?.startsWith('BLT') ||
            doc.caseNo?.startsWith('BLT') ||
            doc.refNumber?.startsWith('BLT') ||
            doc.id?.startsWith('BLT')
          );

          return isExplicitBlotter || hasBlotterRef;
        })
        .map(mapDocToBlotter)
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

      console.log(' Consolidated Admin Blotters Loaded:', blotterDocs.length, blotterDocs);
      setBlotterList(blotterDocs);
    } catch (err) {
      console.error(' Error fetching blotter records from PouchDB:', err);
    }
  };

  fetchBlotters();

  const changes = db.changes({ live: true, since: 'now', include_docs: true });
  changes.on('change', (changeInfo) => {
    const doc = changeInfo.doc;
    const isBlotter =
      doc &&
      (doc.docType === 'blotter' ||
        doc.type === 'blotter' ||
        doc.type === 'blotter_report' ||
        doc.trackingNo?.startsWith('BLT') ||
        doc.caseNo?.startsWith('BLT'));

    if (isBlotter || changeInfo.deleted) {
      console.log('⚡ Real-time blotter update detected in Admin Dashboard:', changeInfo.id);
      fetchBlotters();
    }
  });

  changes.on('error', (err) => {
    console.error('❌ Admin blotter changes listener error:', err);
  });

  return () => {
    changes.cancel();
  };
}, [db]);

// ── 3. LOOKUP TEXT INPUT QUERIES (Eksaktong tugma sa variable ng JSX mo!) ──
const [complainantQuery, setComplainantQuery] = useState('');
const [respondentQuery, setRespondentQuery] = useState('');

// ── 4. DROPDOWN BOOLED CONTROLS (Eksaktong tugma sa variable ng JSX mo!) ──
const [showComplainantDropdown, setShowComplainantDropdown] = useState(false);
const [showRespondentDropdown, setShowRespondentDropdown] = useState(false);

const handleSearchResident = (inputQuery) => {
  if (!inputQuery.trim()) return [];
  
  const cleanQuery = inputQuery.toLowerCase().trim();
  
  return residentsList.filter((res) => {
    // Kinukuha ang lahat ng posibleng pagkakabuo ng pangalan
    const fName = String(res.firstName || '').toLowerCase();
    const mName = String(res.middleName || '').toLowerCase();
    const lName = String(res.lastName || '').toLowerCase();
    
    const combineFirstLast = `${fName} ${lName}`; // "juan reyes"
    const combineFull = `${fName} ${mName} ${lName}`; // "juan b. reyes"
    const combineLastFirst = `${lName}, ${fName}`; // "reyes, juan"
    const directName = String(res.name || '').toLowerCase();
    const idNum = String(res.id || res._id || '').toLowerCase();

    return (
      combineFirstLast.includes(cleanQuery) ||
      combineFull.includes(cleanQuery) ||
      combineLastFirst.includes(cleanQuery) ||
      directName.includes(cleanQuery) ||
      idNum.includes(cleanQuery)
    );
  });
};
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

const handleClearBlotterForm = () => {
  if (blotterForm.attachments && blotterForm.attachments.length > 0) {
    blotterForm.attachments.forEach((att) => {
      if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
    });
  }
  
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
    nextHearingDate: '',
    isVawc: false,
    attachments: [], 
  });

  setComplainantQuery('');
  setRespondentQuery('');
  setShowComplainantDropdown(false);
  setShowRespondentDropdown(false);
};

const handleViewBlotter = (blotterRecord) => {
  const caseId = blotterRecord._id || blotterRecord.trackingNo || blotterRecord.id || blotterRecord.caseNo;
  
  const mappedCase = {
    ...blotterRecord,
    _id: caseId,
    caseNum: blotterRecord.trackingNo || blotterRecord.caseNum || blotterRecord.caseNo || blotterRecord.id || caseId,
    status: blotterRecord.status || 'Open',
    dateFiled: blotterRecord.dateLogged || blotterRecord.dateFiled || blotterRecord.date || blotterRecord.incidentDate || '',
    timeFiled: blotterRecord.incidentTime || blotterRecord.timeFiled || blotterRecord.time || '10:30 PM',
    type: blotterRecord.incidentType || blotterRecord.type || 'N/A',
    location: blotterRecord.location || 'Barangay Bustrac',
    complainantName: typeof blotterRecord.complainant === 'object' 
      ? (blotterRecord.complainant.name || blotterRecord.complainant.displayName) 
      : (blotterRecord.complainant || blotterRecord.complainantName || blotterRecord.compName || 'N/A'),
    respondentName: typeof blotterRecord.respondent === 'object' 
      ? (blotterRecord.respondent.name || blotterRecord.respondent.displayName) 
      : (blotterRecord.respondent || blotterRecord.respondentName || blotterRecord.respName || 'N/A'),
    narrative: blotterRecord.narrative || blotterRecord.statement || blotterRecord.details || blotterRecord.description || 'No narrative provided.',
    summonCount: typeof blotterRecord.summonCount === 'number' 
      ? blotterRecord.summonCount 
      : (blotterRecord.status?.includes('1st') ? 1 : blotterRecord.status?.includes('2nd') ? 2 : blotterRecord.status?.includes('3rd') ? 3 : 0),
    nextHearingDate: blotterRecord.nextHearingDate || blotterRecord.nextMediationDate || blotterRecord.summonDate || 'N/A',
    witnesses: blotterRecord.witnesses || ''
  };

  // 1. I-update ang Active React States
  setSelectedBlotter(mappedCase);
  setSelectedBlotterId(caseId);
  if (typeof setStaffCase === 'function') {
    setStaffCase(mappedCase);
  }

  // 2. LocalStorage Persistence
  localStorage.setItem('active_blotter_id', caseId);
  localStorage.setItem('active_blotter_data', JSON.stringify(mappedCase));


  const baseUrl = window.location.pathname; 
  const cleanUrl = `${baseUrl}?page=blotter-detail&id=${encodeURIComponent(caseId)}`;
  
  window.history.pushState({ internalScreen: 'blotter-detail', id: caseId }, '', cleanUrl);

  if (typeof setScreen === 'function') {
    setScreen('blotter-detail');
  }
};

const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

const handleFileUpload = async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const processedFiles = await Promise.all(
    files.map(async (file) => {
      const base64Data = await fileToBase64(file);
      return {
        id: 'ATT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        type: file.type,
        data: base64Data, 
        previewUrl: file.type.startsWith('image/') ? base64Data : null,
      };
    })
  );

  setBlotterForm((prev) => ({
    ...prev,
    attachments: [...(prev.attachments || []), ...processedFiles],
  }));

  e.target.value = '';
};

// ── BROWSER BACK/FORWARD BUTTON LISTENER ──
useEffect(() => {
  if (!window.history.state) {
    window.history.replaceState({ internalScreen: 'dashboard' }, '', '');
  }

  const handleBrowserNavigation = (event) => {
    if (event.state && event.state.internalScreen) {
      setScreen(event.state.internalScreen);
    } else {
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

const sortedBlotters = useMemo(() => {
  if (!blotterList || !Array.isArray(blotterList)) return [];

  return [...blotterList].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || a.timestamp || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || b.timestamp || 0).getTime();
    return timeB - timeA; // Pinakabago sa taas
  });
}, [blotterList]);

const filteredBlotters = sortedBlotters.filter((b) => {
  const query = (blotterSearch || '').toLowerCase().trim();
  const caseId = (b.id || b.trackingNo || b.refNumber || b.caseNo || b._id || '').toLowerCase();
  const complainantStr = (b.complainant || b.complainantName || '').toLowerCase();
  const respondentStr = (b.respondent || b.respondentName || '').toLowerCase();
  const locationStr = (b.location || b.purok || '').toLowerCase();
  const matchesSearch = !query || caseId.includes(query) || complainantStr.includes(query) || respondentStr.includes(query) || locationStr.includes(query);

  // 2. Incident Type Filtering
  const matchesType = !filterType || filterType === 'All Types' || filterType === 'All' || b.type === filterType || b.incidentType === filterType;

  // 3. Status Filtering
  const matchesStatus = !filterStatus || filterStatus === 'All Status' || filterStatus === 'All' || b.status === filterStatus || (filterStatus === 'Under Mediation' && (b.status?.includes('Mediation') || b.status?.includes('Summon')));

  // 4. Date Range Filtering
  const rawDate = b.date || b.incidentDate || b.dateFiled || b.createdAt;
  let caseDate = null;
  if (rawDate && rawDate !== 'N/A' && rawDate !== 'Recently') {
      const formattedDateStr = String(rawDate).split('T')[0];
      caseDate = new Date(formattedDateStr);
  }
  const fromDate = dateFrom ? new Date(dateFrom) : null;
  const toDate = dateTo ? new Date(dateTo) : null;
  const matchesDateFrom = !fromDate || (caseDate && caseDate >= fromDate);
  const matchesDateTo = !toDate || (caseDate && caseDate <= toDate);

  // 5. VAWC Toggle Filtering
  const matchesVawc = !filterVawc || b.isVawc === true || b.vawc === true || b.type === 'VAWC';

  return (
    matchesSearch && matchesType && matchesStatus && matchesDateFrom && matchesDateTo && matchesVawc
  );
});

 const [isPrintModalOpen, setIsPrintModalOpen] = React.useState(false);
const [selectedBlotter, setSelectedBlotter] = useState(null);
const [selectedBlotterId, setSelectedBlotterId] = useState(null);
const [blotterVerifyQuery, setBlotterVerifyQuery] = useState('');
const [blotterMatches, setBlotterMatches] = useState([]);
const [actionModalOpen, setActionModalOpen] = useState(false);
const [selectedBlotterForAction, setSelectedBlotterForAction] = useState(null);
const [actionType, setActionType] = useState(''); // '1st_summon', '2nd_summon', '3rd_summon', 'settled', 'escalate_cfa'
const [scheduleDate, setScheduleDate] = useState('');
const [actionNotes, setActionNotes] = useState('');
const [actionSaving, setActionSaving] = useState(false);

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
  const params = new URLSearchParams(window.location.search);
  const pageFromUrl = params.get('page');
  const idFromUrl = params.get('id');

  if (pageFromUrl) {
    setScreen(pageFromUrl);

    // ✅ FIX: Kapag blotter-detail ang nasa URL, siguraduhing nai-load ang tamang record state!
    if (pageFromUrl === 'blotter-detail') {
      const activeId = idFromUrl || localStorage.getItem('active_blotter_id');
      const cachedData = localStorage.getItem('active_blotter_data');

      // 1. Unang subukang i-load mula sa cached LocalStorage data para mabilis (No flicker)
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          setSelectedBlotter(parsed);
          setSelectedBlotterId(parsed._id || activeId);
          if (typeof setStaffCase === 'function') setStaffCase(parsed);
        } catch (err) {
          console.error('Failed to parse cached blotter data:', err);
        }
      }

      // 2. I-verify/Fall back sa blotterList kapag available na ito mula sa PouchDB
      if (activeId && blotterList && blotterList.length > 0) {
        const foundCase = blotterList.find(
          (b) => b._id === activeId || b.id === activeId || b.trackingNo === activeId || b.caseNo === activeId
        );
        if (foundCase) {
          setSelectedBlotter(foundCase);
          setSelectedBlotterId(foundCase._id || foundCase.trackingNo || activeId);
          if (typeof setStaffCase === 'function') setStaffCase(foundCase);
        }
      }
    }
  } else {
    setScreen('dashboard');
  }
}, [location, blotterList]);

const currentBlotterRoster = Array.isArray(blotterList) ? blotterList : [];

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

const approvedCertificates = useMemo(() => 
  (issuedCertificates || []).filter(cert => 
    (Number(cert.step) === 4 || cert.status === 'Approved' || cert.status?.toLowerCase() === 'approved') && 
    cert.status !== 'Issued' && 
    cert.status !== 'Released'
  ), 
  [issuedCertificates]
);

const strictlyIssuedCertificates = issuedCertificates.filter(cert => cert.step === 5 || cert.status === 'Issued');
const filteredIssuedHistory = strictlyIssuedCertificates.filter((cert) => {
  const query = issuedHistorySearch.toLowerCase().trim();
  const residentName = `${cert.firstName || ''} ${cert.lastName || ''}`.toLowerCase();
  const certType = (cert.certificateType || cert.certType || '').toLowerCase();
  const certId = (cert._id || '').toLowerCase();
  return (
    residentName.includes(query) ||
    certType.includes(query) ||
    certId.includes(query)
  );
});

const handleApproveCertificate = async (currentRequest) => {
  if (!currentRequest) return;
  try {
    const latestDoc = await db.get(currentRequest._id);
    const formattedPayload = {
      ...latestDoc,
      status: 'Approved',
      step: 4, // Step 4 = Approved, waiting for issuance
      orNumber: currentRequest.orNumber || latestDoc.orNumber || `OR-${Date.now()}`,
      updatedAt: new Date().toISOString()
    };

    // 1. I-save sa CouchDB / PouchDB Database
    await db.put(formattedPayload);

    // 2. I-update ang issuedCertificates state agad (Dahil dito nakadepende ang approvedCertificates useMemo!)
    if (typeof setIssuedCertificates === 'function') {
      setIssuedCertificates(prev => {
        const filtered = prev.filter(cert => cert._id !== formattedPayload._id);
        return [formattedPayload, ...filtered];
      });
    }

    // 3. I-update din ang ibang states kung mayroon
    if (typeof setApprovedCertificates === 'function') {
      setApprovedCertificates(prev => {
        const filtered = prev.filter(cert => cert._id !== formattedPayload._id);
        return [formattedPayload, ...filtered];
      });
    }

    if (typeof setCertificates === 'function') {
      setCertificates(prev => 
        prev.map(c => c._id === formattedPayload._id ? formattedPayload : c)
      );
    }

    // 4. Audit Log Entry
    await createAuditLog({
      action: 'APPROVE',
      module: 'CERTIFICATES',
      recordId: currentRequest._id,
      details: `Approved certificate request for ${currentRequest.firstName || ''} ${currentRequest.lastName || ''}`,
    });

    // 5. Navigate pabalik sa Issuance & Print screen
    if (typeof nav === 'function') {
      nav('cert-print');
    }
  } catch (err) {
    console.error('Failed to approve certificate:', err);
    alert('Failed to approve certificate. Please try again.');
  }
};

const fetchIssuedCertificates = useCallback(async () => {
  try {
    const result = await db.allDocs({ include_docs: true });
    const docs = result.rows
      .map(r => r.doc)
      .filter(d => d && d.type === 'certificate_request');
    setIssuedCertificates(docs);
  } catch (err) {
    console.error('Failed to fetch certificates:', err);
  }
}, []);

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
        const filtered = prevCerts.filter(c => c._id !== change.doc._id);
        return [change.doc, ...filtered];
      });
    }
  }).on('error', (err) => {
    console.error("PouchDB change listener error:", err);
  });
  return () => changes.cancel();
}, []);
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

// ── CONFLICT CHECKER ──
async function checkForConflicts() {
  try {
    const allDocs = await db.allDocs({ include_docs: true, conflicts: true });
    const conflictedDocs = allDocs.rows.filter(
      (row) => row.doc._conflicts && row.doc._conflicts.length > 0
    );

    if (conflictedDocs.length > 0) {
      const conflicts = conflictedDocs.map((row) => ({
        docId: row.doc._id,
        currentVersion: row.doc,
        conflictRevs: row.doc._conflicts,
      }));
      setConflictsList(conflicts);

      for (const c of conflicts) {
        await createAuditLog({
          action: 'CONFLICT_FLAGGED',
          module: 'RESIDENTS',
          recordId: c.docId,
          details: `Conflicting revisions detected on resident record`,
        });
      }
    } else {
      setConflictsList([]);
    }
  } catch (err) {
    console.error('Error checking conflicts:', err);
  }
}




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
  // ── STRICT SAFETY GUARD ──
  if (
    !db ||
    typeof db.allDocs !== 'function' ||
    typeof db.changes !== 'function'
  ) {
    console.warn('[DashboardPortal] Database instance is unavailable in this environment.');
    return;
  }

  const fetchAllCerts = async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const certs = (result?.rows || [])
        .map(row => row?.doc)
        .filter(doc => doc && doc.type === 'certificate_request');
      setIssuedCertificates(certs);
    } catch (err) {
      console.error('Error loading initial certs:', err);
    }
  };

  fetchAllCerts();

  // Listen for real-time database changes (Insert, Update, Delete)
  const changes = db.changes({
    since: 'now',
    live: true,
    include_docs: true
  });

  if (changes && typeof changes.on === 'function') {
    changes
      .on('change', (change) => {
        if (change?.doc && change.doc.type === 'certificate_request') {
          setIssuedCertificates((prevCerts) => {
            const filtered = (prevCerts || []).filter(
              c => c?._id !== change.doc._id
            );
            return [change.doc, ...filtered];
          });
        }
      })
      .on('error', (err) => {
        console.error('PouchDB change listener error:', err);
      });
  }

  return () => {
    if (changes && typeof changes.cancel === 'function') {
      changes.cancel();
    }
  };
}, []);

// Automatically scan for conflicts when mounting or navigating to conflict screen
useEffect(() => {
  if (screen === 'conflicts') {
    fetchDatabaseConflicts();   
  }
}, [screen]);

// Resolve Conflict: Keep Version A (Discard conflicting revision B)
const handleKeepVersionA = async (conflict) => {
  try {
    await db.remove(conflict.docId, conflict.conflictRev);
    alert('✓ Conflict resolved. Retained Version A.');
    
    await createAuditLog({
      action: 'RESOLVE',
      module: 'CONFLICTS',
      recordId: conflict.docId,
      details: `Kept Version A during conflict resolution for ${conflict.residentName}`,
    });
    
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
      ...conflict.docB,           // ✅ FIX: ginamit ang docB imbes na versionB
      _rev: conflict.docA._rev,   // ✅ FIX: ginamit ang docA._rev
    };
    await db.put(updatedDoc);
    await db.remove(conflict.docId, conflict.conflictRev);
    alert('✓ Conflict resolved. Overwritten with Version B.');
    
    await createAuditLog({
      action: 'RESOLVE',
      module: 'CONFLICTS',
      recordId: conflict.docId,
      details: `Kept Version B during conflict resolution for ${conflict.residentName}`,
    });
    
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
      ...conflict.docB,           // ✅ FIX: ginamit ang docB
      _id: newDocId
    };
    delete duplicateDoc._rev;
    
    await db.put(duplicateDoc);
    await db.remove(conflict.docId, conflict.conflictRev);
    alert('✓ Conflict resolved. Saved Version B as a distinct record.');
    
    await createAuditLog({
      action: 'RESOLVE',
      module: 'CONFLICTS',
      recordId: conflict.docId,
      details: `Split and kept both versions for ${conflict.residentName}`,
    });
    
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



// ── AUDIT LOGS LOADER ──
useEffect(() => {

}, [role]);

useEffect(() => {
  let cancelled = false;

  const seedResidents = async () => {
    for (const res of residentsList) {
      if (!res?.id) continue;
      try {
        await db.get(res.id); // Check kung existing na
      } catch (err) {
        if (err.name === 'not_found' && !cancelled) {
          try {
            await db.put({
              _id: res.id,
              type: 'resident',
              ...res,
              createdAt: res.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          } catch (putErr) {
            console.warn('Failed to seed resident:', res.id, putErr);
          }
        }
      }
    }
  };

  seedResidents();

  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);



const [isAidOpen, setIsAidOpen] = useState(true);
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
  if (!selectedCertificate) {
    alert('Please select a certificate from the table first.');
    return;
  }
  setTimeout(() => window.print(), 150);
};

const handleSaveOnly = async () => {
  if (!selectedCertificate) return;

  try {
    const latestDoc = await db.get(selectedCertificate._id);
    const updatedDoc = {
      ...latestDoc,
      status: 'Issued',
      step: 5,
      issuanceMeta: {
        ...issuanceMeta,
        savedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    await db.put(updatedDoc);

    // ➔ Add Audit Log Call
    try {
      await createAuditLog({
        action: 'APPROVE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: updatedDoc.refNumber || updatedDoc._id,
        user: `${currentUser?.username || 'admin'} (${role})`,
        details: `Saved & marked as Issued: ${
          updatedDoc.certificateType || updatedDoc.certType || 'Certificate'
        } for ${
          updatedDoc.firstName || updatedDoc.lastName
            ? `${updatedDoc.firstName || ''} ${updatedDoc.lastName || ''}`.trim()
            : updatedDoc.fullName || updatedDoc.residentName || 'Resident'
        }`,
      });
    } catch (auditErr) {
      console.warn('Audit log failed for Certificate save:', auditErr);
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    // ✅ IMMEDIATE STATE UPDATE
    setIssuedCertificates((prev) => {
      const filtered = prev.filter((cert) => cert._id !== updatedDoc._id);
      return [updatedDoc, ...filtered];
    });

    alert('Transaction saved and certificate marked as Issued!');

    if (typeof clearSelectedCert === 'function') {
      clearSelectedCert();
    }
  } catch (err) {
    console.error('Save failed:', err);
    alert('Failed to save transaction.');
  }
};

const handlePrintDocument = async () => {
  const targetCert = selectedCertificate || selectedPrintCert;
  if (!targetCert) {
    console.warn('No certificate selected for printing.');
    return;
  }

  try {
    if (targetCert._id && targetCert.type === 'certificate_request') {
      const latestDoc = await db.get(targetCert._id);
      const updatedDoc = {
        ...latestDoc,
        status: 'Issued',
        step: 5,
        issuanceMeta: {
          ...issuanceMeta,
          printedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };

      await db.put(updatedDoc);

      // ➔ Add Audit Log Call
      try {
        await createAuditLog({
          action: 'APPROVE_CERTIFICATE',
          module: 'CERTIFICATES',
          recordId: updatedDoc.refNumber || updatedDoc._id,
          user: `${currentUser?.username || 'admin'} (${role})`,
          details: `Printed & issued ${
            updatedDoc.certificateType || updatedDoc.certType || 'Certificate'
          } for ${
            updatedDoc.firstName || updatedDoc.lastName
              ? `${updatedDoc.firstName || ''} ${updatedDoc.lastName || ''}`.trim()
              : updatedDoc.fullName || updatedDoc.residentName || 'Resident'
          }`,
        });
      } catch (auditErr) {
        console.warn('Audit log failed for Certificate print:', auditErr);
      }

      if (typeof forceSyncToRemote === 'function') {
        await forceSyncToRemote();
      }

      setIssuedCertificates((prev) => {
        const filtered = prev.filter((cert) => cert._id !== updatedDoc._id);
        return [updatedDoc, ...filtered];
      });
    }

    setTimeout(() => {
      window.print();
    }, 300);
  } catch (err) {
    console.error('Print DB update failed (falling back to print only):', err);
    setTimeout(() => {
      window.print();
    }, 300);
  }
};

const executePrintAndIssue = async (targetCert) => {
  const targetId = targetCert?._id || selectedCertificate?._id;

  if (!targetId) {
    alert('No certificate selected.');
    return;
  }

  if (
    !issuanceMeta.orNumber ||
    !String(issuanceMeta.orNumber).trim() ||
    !issuanceMeta.amountPaid
  ) {
    alert(
      'Please fill in required payment fields (OR No. and Amount Paid) in the receipt section before printing.'
    );
    return;
  }

  try {
    const latestDoc = await db.get(targetId);
    const now = new Date().toISOString();

    const updatedDoc = {
      ...latestDoc,
      status: 'Issued',
      step: 5,
      issuanceMeta: {
        ...issuanceMeta,
        issuedAt: now,
      },
      updatedAt: now,
    };

    await db.put(updatedDoc);

    // ➔ Add Audit Log Call
    try {
      await createAuditLog({
        action: 'APPROVE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: updatedDoc.refNumber || updatedDoc._id,
        user: `${currentUser?.username || 'admin'} (${role})`,
        details: `Issued ${
          updatedDoc.certificateType || updatedDoc.certType || 'Certificate'
        } for ${
          updatedDoc.firstName || updatedDoc.lastName
            ? `${updatedDoc.firstName || ''} ${updatedDoc.lastName || ''}`.trim()
            : updatedDoc.fullName || updatedDoc.residentName || 'Resident'
        } (OR#: ${issuanceMeta.orNumber}, Paid: ₱${issuanceMeta.amountPaid})`,
      });
    } catch (auditErr) {
      console.warn('Audit log failed for Certificate issuance:', auditErr);
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    if (typeof setApprovedCertificates === 'function') {
      setApprovedCertificates((prev) =>
        prev.map((item) =>
          item._id === targetId
            ? {
                ...item,
                status: 'Issued',
                step: 5,
                issuanceMeta: updatedDoc.issuanceMeta,
              }
            : item
        )
      );
    }

    setSelectedCertificate(updatedDoc);

    window.print();
    alert('✓ Certificate successfully issued, saved, and sent to printer!');
  } catch (err) {
    console.error('Print release failed:', err);
    alert('Failed to process certificate release.');
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

    // Create audit log after successful CTC save
    try {
      if (typeof createAuditLog === 'function') {
        await createAuditLog({
          action: 'CREATE_CTC_RECORD',
          module: 'CTC_MANAGEMENT',
          recordId: ctcPayload.ctcNo,
          user: `${currentUser?.username || 'admin'} (${role || 'admin'})`,
          details: `Issued CTC #${ctcPayload.ctcNo} for ${ctcPayload.ctcName} (Amount: ₱${ctcPayload.amtPaid})`
        });
      }
    } catch (auditErr) {
      console.warn('CTC Audit log failed:', auditErr);
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
const [businessClearanceSearch, setBusinessClearanceSearch] = useState('');

const filteredBusinessClearances = businessMasterlist.filter((record) => {
  const query = businessClearanceSearch.toLowerCase().trim();

  return (
    String(record.bcIdNo || '').toLowerCase().includes(query) ||
    `${record.lastName || ''} ${record.firstName || ''} ${record.middleName || ''}`
      .toLowerCase()
      .includes(query) ||
    String(record.businessName || '').toLowerCase().includes(query) ||
    String(record.businessCategory || '').toLowerCase().includes(query) ||
    String(record.businessAddress || '').toLowerCase().includes(query) ||
    String(record.orNo || '').toLowerCase().includes(query)
  );
});

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

  // 1. Validate Page 1 Fields
  if (
    !businessForm.businessName?.trim() ||
    !businessForm.lastName?.trim() ||
    !businessForm.firstName?.trim()
  ) {
    showToast(
      'Please complete the required Applicant and Business Name fields.',
      'error'
    );
    setBusinessTab('page1');
    return;
  }

  // 2. Validate Page 2 Fields (OR No. and Fee)
  const hasOrNo =
    businessForm.orNo &&
    String(businessForm.orNo).trim().length > 0;

  const hasFee =
    businessForm.clearanceFee !== undefined &&
    businessForm.clearanceFee !== null &&
    String(businessForm.clearanceFee).trim().length > 0;

  if (!hasOrNo || !hasFee) {
    showToast(
      'Please complete the O.R. Number and Clearance Fee on Page 2.',
      'error'
    );
    setBusinessTab('page2');

    setTimeout(() => {
      const orInput = document.querySelector(
        'input[placeholder="e.g. 9876543"]'
      );

      if (orInput) {
        orInput.focus();
      }
    }, 300);

    return;
  }

  setIsSavingBusiness(true);

  try {
    const isEditing = Boolean(businessForm._id);

    const docId = isEditing
      ? businessForm._id
      : `bus_clearance_${Date.now()}`;

    const newBcIdNo = isEditing
      ? businessForm.bcIdNo
      : await getNextBusinessSequence();

    const payload = {
      ...businessForm,

      bcIdNo: newBcIdNo,
      _id: docId,
      type: 'business_clearance',

      clearanceFee: Number(
        businessForm.clearanceFee || 0
      ).toFixed(2),

      garbageFee: Number(
        businessForm.garbageFee || 0
      ).toFixed(2),

      updatedAt: new Date().toISOString(),

      createdAt:
        businessForm.createdAt ||
        new Date().toISOString(),
    };

    // Remove revision when creating a new record
    if (!isEditing) {
      delete payload._rev;
    }

    // Save to local database
    if (typeof db !== 'undefined' && db.put) {
      await db.put(payload);
    }

    // Create audit log
    try {
      await createAuditLog({
        action: isEditing
          ? 'UPDATE_BUSINESS_CLEARANCE'
          : 'CREATE_BUSINESS_CLEARANCE',

        module: 'BUSINESS_CLEARANCE',

        recordId: newBcIdNo,

        details: `${
          isEditing ? 'Updated' : 'Created'
        } Business Clearance ${newBcIdNo} for ${
          businessForm.businessName
        }`,
      });
    } catch (auditErr) {
      console.warn(
        'Audit log failed:',
        auditErr
      );
    }

    // Success notification
    showToast(
      isEditing
        ? 'Business Clearance updated successfully!'
        : `Business Clearance ${newBcIdNo} saved successfully!`,
      'success'
    );

    // Reset form without confirmation after successful save/update
    await resetBusinessForm(true);

    // Return to Page 1
    setBusinessTab('page1');

    // Scroll back to the top
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });

  } catch (err) {
    console.error(
      'Failed to save/update Business Clearance record:',
      err
    );

    showToast(
      'Error saving record to local database: ' +
        err.message,
      'error'
    );

  } finally {
    setIsSavingBusiness(false);
  }
};

const handleEditBusinessClearance = (record) => {
  if (!record || !record._id) {
    showToast('Error: Cannot edit. Record ID is missing.', 'error');
    return;
  }
  
  setBusinessForm({
    bcIdNo: record.bcIdNo || '',
    civilStatus: record.civilStatus || '',
    lastName: record.lastName || '',
    firstName: record.firstName || '',
    middleName: record.middleName || '',
    contactNo: record.contactNo || '',
    email: record.email || '',
    applicantAddress: record.applicantAddress || '',
    applicantBgyCityProv: record.applicantBgyCityProv || '',
    occupation: record.occupation || '',
    nationality: record.nationality || '',
    isFemale: record.isFemale || false,
    remarks: record.remarks || '',
    photoUrl: record.photoUrl || null,
    regDate: record.regDate || '',
    storeAreaSqm: record.storeAreaSqm || '',
    businessName: record.businessName || '',
    natureOfBusiness: record.natureOfBusiness || '',
    businessCategory: record.businessCategory || '',
    typeOfBusiness: record.typeOfBusiness || '',
    businessAddress: record.businessAddress || '',
    businessBgyCityProv: record.businessBgyCityProv || '',
    businessContactNo: record.businessContactNo || '',
    businessEmail: record.businessEmail || '',
    cctvEnabled: record.cctvEnabled || false,
    sanitaryWasteDisposal: record.sanitaryWasteDisposal || false,
    hasFireExtinguisher: record.hasFireExtinguisher || false,
    hasFireExit: record.hasFireExit || false,
    sanitaryCompliant: record.sanitaryCompliant || false,
    employeeCount: record.employeeCount || 0,
    employeeMasterlistName: record.employeeMasterlistName || '',
    orNo: record.orNo || '',
    orDateIssued: record.orDateIssued || new Date().toISOString().split('T')[0],
    clearanceFee: record.clearanceFee || '',
    garbageFee: record.garbageFee || '',
    _id: record._id,   
    _rev: record._rev   
  });

  setBusinessTab('page1'); 
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Record loaded for editing.', 'success');

    // Scroll smoothly papunta sa form after ng state update
  setTimeout(() => {
    if (businessFormRef.current) {
      businessFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' }); // Fallback
    }
  }, 100); // 100ms delay para siguradong na-render na ang Page 1
};

// ── RESET BUSINESS CLEARANCE FORM ──
const resetBusinessForm = async (skipConfirm = false) => {
  if (!skipConfirm && (businessForm.businessName.trim() || businessForm.lastName.trim() || businessForm.firstName.trim())) {
    if (!window.confirm('Are you sure you want to clear the form? All unsaved data will be lost.')) {
      return;
    }
  }

  const nextBcIdNo = await peekNextBusinessSequence();
  setBusinessForm({
    bcIdNo: nextBcIdNo,
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
    orDateIssued: new Date().toISOString().split('T')[0],
    clearanceFee: '',
    garbageFee: '',
    secretary: settingsForm?.luponSecretary || 'MRS. MELY M. PRESADO',
    captain: settingsForm?.punongBarangay || 'HON. ANNABELLE E. RULL',
    _id: '',
    _rev: undefined
  });
  setBusinessTab('page1');
};

const [printingCert, setPrintingCert] = useState(null);



const handleOpenIndigencyPrintModal = (record) => {
  setSelectedIndigencyCert(record);
  setShowIndigencyPrintModal(true);
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

const handleResidentSort = (key) => {
  setResidentSort((current) => {
    if (current.key !== key) {
      return {
        key,
        direction: 'asc'
      };
    }

    if (current.direction === 'asc') {
      return {
        key,
        direction: 'desc'
      };
    }

    return {
      key: null,
      direction: 'none'
    };
  });
};

const sortedFilteredResidents = [...filteredResidents].sort((a, b) => {
  if (!residentSort.key || residentSort.direction === 'none') {
    return 0;
  }

  const key = residentSort.key;
  let valueA = a[key];
  let valueB = b[key];

  // Boolean: No -> Yes / Yes -> No
  if (key === 'voter') {
    valueA = valueA ? 1 : 0;
    valueB = valueB ? 1 : 0;
  }

  // Numeric: Age
  if (key === 'age') {
    valueA = Number(valueA) || 0;
    valueB = Number(valueB) || 0;
  }

  // Purok: Purok 1, Purok 2, etc.
  if (key === 'purok') {
    const purokA = Number(String(valueA || '').match(/\d+/)?.[0]) || 0;
    const purokB = Number(String(valueB || '').match(/\d+/)?.[0]) || 0;

    return residentSort.direction === 'asc'
      ? purokA - purokB
      : purokB - purokA;
  }

  // Resident ID / RBI ID / names / civil status
  if (typeof valueA === 'string' || typeof valueB === 'string') {
    const result = String(valueA ?? '').localeCompare(
      String(valueB ?? ''),
      undefined,
      {
        numeric: true,
        sensitivity: 'base'
      }
    );

    return residentSort.direction === 'asc' ? result : -result;
  }

  if (valueA < valueB) {
    return residentSort.direction === 'asc' ? -1 : 1;
  }

  if (valueA > valueB) {
    return residentSort.direction === 'asc' ? 1 : -1;
  }

  return 0;
});

const isBlotterFormValid = useMemo(() => {
  const getPartyName = (party) => {
    if (!party) return '';
    if (typeof party === 'string') return party.trim();
    if (typeof party === 'object') return (party.name || party.displayName || party.firstName || '').trim();
    return '';
  };

  const hasComplainant = getPartyName(blotterForm.complainant) !== '' || getPartyName(blotterForm.complainantName) !== '';
  const hasRespondent = getPartyName(blotterForm.respondent) !== '' || getPartyName(blotterForm.respondentName) !== '';
  const hasDate = Boolean(blotterForm.date);
  const hasTime = Boolean(blotterForm.time);
  const hasLocation = Boolean(blotterForm.location && blotterForm.location.trim() !== '');
  const hasNarrative = Boolean(blotterForm.narrative && blotterForm.narrative.trim() !== '');

  return hasComplainant && hasRespondent && hasDate && hasTime && hasLocation && hasNarrative;
}, [blotterForm]);

const filteredFeedback = feedbackList
  .slice()
  .sort((a, b) => {
    const timeA = new Date(a.rawTimestamp || a.date || 0).getTime();
    const timeB = new Date(b.rawTimestamp || b.date || 0).getTime();
    if (sortFbBy === 'Oldest') return timeA - timeB;
    if (sortFbBy === 'PendingFirst') {
      const priorityWeight = { High: 3, Medium: 2, Low: 1 };
      return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
    }
    return timeB - timeA;
  })
  .filter((fb) => {
    const query = searchFbQuery.toLowerCase();
    const matchesSearch =
      (fb.sender || '').toLowerCase().includes(query) ||
      (fb.id || '').toLowerCase().includes(query) ||
      (fb.subject || '').toLowerCase().includes(query);
    const matchesType = filterFbType === 'All Types' || fb.type === filterFbType;
    const matchesStatus = filterFbStatus === 'All Status' || filterFbStatus === 'All Statuses' || fb.status === filterFbStatus;
    const matchesPriority = filterFbPriority === 'All Priorities' || fb.priority === filterFbPriority;
    return matchesSearch && matchesType && matchesStatus && matchesPriority;
  });

  // ── USERS FILTER STATES ──
const [searchUserQuery, setSearchUserQuery] = useState('');
const [filterUserRole, setFilterUserRole] = useState('All');

const usersList = [
  { id: 'USR-001', name: 'Macabangon, Juhairo B.', uname: 'jmacabangon', role: 'Admin',    rClass: 'r', status: 'Active', last: 'Apr 7, 07:30' },
  { id: 'USR-002', name: 'Cortero, Mark Gian A.',    uname: 'mgcortero',   role: 'Staff',   rClass: 'p', status: 'Active', last: 'Apr 7, 08:00' },
  { id: 'USR-003', name: 'Napagal, Jay O.',          uname: 'jonapagal',   role: 'Staff',   rClass: 'p', status: 'Active', last: 'Apr 7, 07:45' },
  { id: 'USR-004', name: 'Regaspi, Mark Denver S.',  uname: 'mdregaspi',   role: 'Staff',   rClass: 'p', status: 'Active', last: 'Apr 6, 05:00' },
  { id: 'USR-005', name: 'Amparado, Ken Jette T.',   uname: 'kjamparado',  role: 'Staff',   rClass: 'p', status: 'Active', last: 'Apr 7, 09:00' },
  { id: 'USR-006', name: 'Santos, Maria D.',         uname: 'mdsantos',    role: 'Resident', rClass: 't', status: 'Active', last: 'Apr 5, 10:00' },
];

const filteredUsers = usersList.filter((u) => {
  const q = searchUserQuery.toLowerCase();
  const matchesSearch =
    !q ||
    u.name.toLowerCase().includes(q) ||
    u.uname.toLowerCase().includes(q) ||
    u.id.toLowerCase().includes(q);
  const matchesRole = filterUserRole === 'All' || u.role === filterUserRole;
  return matchesSearch && matchesRole;
});

const [generatingReport, setGeneratingReport] = useState(null);
const handleGenerateReport = async (module) => {
  const today = new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  setGeneratingReport(module);

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  await delay(800);

  const openPrintWindow = (title, headers, rows, summary = '') => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to generate the report.');
    setGeneratingReport(null);
    return;
  }

  const headerCells = headers.map((h) => 
    `<th style="border:1px solid #334155;padding:10px;background:#1e293b;color:#f8fafc;text-align:left;font-size:12px;font-weight:600;">${h}</th>`
  ).join('');

  const rowCells = rows.map((row, index) => 
    `<tr style="${index % 2 === 0 ? 'background:#f8fafc' : 'background:#ffffff'}">${
      row.map((cell) => 
        `<td style="border:1px solid #e2e8f0;padding:8px 10px;font-size:11px;color:#334155;">${cell ?? ''}</td>`
      ).join('')
    }</tr>`
  ).join('');

  const today = new Date().toLocaleDateString('en-PH', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title} — Barangay Bustrac</title>
      <style>
        @media print {
          @page { margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          margin: 0; 
          padding: 20px;
          color: #1e293b;
        }
        .header {
          text-align: center;
          border-bottom: 3px solid #1e293b;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .barangay-name {
          font-size: 24px;
          font-weight: bold;
          color: #1e293b;
          margin: 0;
        }
        .report-title {
          font-size: 20px;
          color: #334155;
          margin: 10px 0;
        }
        .meta {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .summary {
          margin-top: 20px;
          padding: 15px;
          background: #f1f5f9;
          border-left: 4px solid #3b82f6;
          font-weight: 600;
          color: #1e293b;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 11px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="barangay-name">BARANGAY BUSTRAC</div>
        <div style="font-size: 14px; color: #64748b;">Nabua, Camarines Sur</div>
        <div class="report-title">${title}</div>
      </div>
      
      <div class="meta">
        Generated on: ${today}<br/>
        Prepared by: Barangay Information System
      </div>
      
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rowCells}</tbody>
      </table>
      
      ${summary ? `<div class="summary">${summary}</div>` : ''}
      
      <div class="footer">
        Barangay Bustrac Information System © ${new Date().getFullYear()}
      </div>
      
      <script>
        window.onload = () => { 
          setTimeout(() => { 
            window.print(); 
          }, 300); 
        };
      </script>
    </body>
    </html>
  `);
  
  printWindow.document.close();
};

  try {
    switch (module) {
      case 'certificates': {
        const data = filteredIssuedCertificates.length > 0 ? filteredIssuedCertificates : issuedCertificates;
        const rows = data.slice(0, 50).map((c) => [
          c._id?.replace('certificate_request_', '') || '—',
          `${c.firstName || ''} ${c.lastName || ''}`.trim() || '—',
          c.certificateType || '—',
          c.purpose || '—',
          c.status || 'Pending',
          c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-PH') : '—'
        ]);
        openPrintWindow(
          'Certificate Issuance Report',
          ['Request ID', 'Resident', 'Type', 'Purpose', 'Status', 'Date'],
          rows,
          `Total Records: ${rows.length}`
        );
        break;
      }

      case 'aid': {
        const rows = aidLogs.slice(0, 50).map((log) => [
          log.id,
          log.residentName,
          log.aid,
          log.officer,
          log.time,
          log.status
        ]);
        openPrintWindow(
          'Aid Distribution Report',
          ['Log ID', 'Beneficiary', 'Aid Type', 'Officer', 'Time', 'Status'],
          rows,
          `Total Distribution Entries: ${rows.length}`
        );
        break;
      }

      case 'residents': {
        const rows = residentsList.slice(0, 50).map((r) => [
          r.id,
          r.name,
          r.purok,
          r.age,
          r.civilStatus,
          r.voter ? 'Yes' : 'No'
        ]);
        openPrintWindow(
          'Resident Registry Report',
          ['Resident ID', 'Name', 'Purok', 'Age', 'Civil Status', 'Voter'],
          rows,
          `Total Registered Residents: ${rows.length} · Total Households: ${householdsList.length}`
        );
        break;
      }

      case 'blotter': {
        const rows = blotterList.slice(0, 50).map((b) => [
          b.id,
          b.type,
          b.complainant,
          b.respondent,
          b.location,
          b.date,
          b.status
        ]);
        openPrintWindow(
          'Blotter Summary Report',
          ['Case #', 'Type', 'Complainant', 'Respondent', 'Location', 'Date', 'Status'],
          rows,
          `Total Cases: ${rows.length} · Open: ${blotterList.filter(x => x.status === 'Open').length} · Resolved: ${blotterList.filter(x => x.status === 'Resolved').length}`
        );
        break;
      }

      case 'feedback': {
        const rows = feedbackList.slice(0, 50).map((f) => [
          f.id,
          f.sender,
          f.type,
          f.priority,
          f.subject,
          f.status,
          f.assignedTo
        ]);
        openPrintWindow(
          'Feedback & Complaints Report',
          ['Ticket ID', 'Sender', 'Type', 'Priority', 'Subject', 'Status', 'Assigned'],
          rows,
          `Total Feedback Entries: ${rows.length}`
        );
        break;
      }

      case 'households': {
        const rows = householdsList.slice(0, 50).map((h) => [
          h.id,
          h.head,
          h.address,
          h.purok,
          h.members
        ]);
        openPrintWindow(
          'Household Registry Report',
          ['Household ID', 'Head', 'Address', 'Purok', 'Members'],
          rows,
          `Total Households: ${rows.length}`
        );
        break;
      }

      case 'audit': {
        const rows = filteredAuditLogs.length > 0 ? filteredAuditLogs.slice(0, 50) : auditLogs.slice(0, 50);
        const formattedRows = rows.map((log) => [
          log.action,
          log.module,
          log.recordId || '—',
          log.actor?.username || 'System',
          log.details || '—',
          log.timestamp ? new Date(log.timestamp).toLocaleString('en-PH') : '—'
        ]);
        openPrintWindow(
          'Audit Trail Report',
          ['Action', 'Module', 'Record ID', 'Actor', 'Details', 'Timestamp'],
          formattedRows,
          `Total Audit Entries: ${formattedRows.length} · Filtered View: ${filteredAuditLogs.length !== auditLogs.length ? 'Yes' : 'No'}`
        );
        break;
      }

      default:
        alert('Unknown report module.');
    }
  } catch (err) {
    console.error('Report generation failed:', err);
    alert('Failed to generate report. Please try again.');
  } finally {
    setGeneratingReport(null);
  }
};

const handleGenerateExcelReport = (moduleType) => {
  let exportData = [];
  const currentDate = new Date().toISOString().split('T')[0];
  let fileName = `Barangay_Bustrac_${moduleType}_${currentDate}.xlsx`;

  switch (moduleType) {
    case 'residents':
      exportData = (residentsList || []).map(r => ({
        'Resident ID': r.id || r._id,
        'Full Name': r.name || `${r.lastName || ''}, ${r.firstName || ''} ${r.middleName || ''}`.trim(),
        'Purok / Zone': r.purok || 'N/A',
        'Civil Status': r.civilStatus || 'N/A',
        'Gender': r.gender || r.sex || 'N/A',
        'Contact Number': r.contact || r.contactNo || 'N/A',
        'Voter Status': r.voter || r.voterStatus ? 'Registered' : 'Non-Voter'
      }));
      break;

    case 'blotter':
      exportData = (blotterList || []).map(b => ({
        'Case No': b.id || b.trackingNo || b.refNumber || b._id,
        'Complainant': b.complainant || b.complainantName || 'N/A',
        'Respondent': b.respondent || b.respondentName || 'N/A',
        'Incident Type': b.type || b.incidentType || 'N/A',
        'Location': b.location || 'N/A',
        'Date': b.date || b.incidentDate || 'N/A',
        'Status': b.status || 'Pending',
        'Summons': b.summonCount || 0,
        'CFA Issued': b.cfaIssued ? 'Yes' : 'No'
      }));
      break;

    case 'certificates':
      // Pinagsama ang issuedCertificates at pending certRequestsList kung mayroon
      const allCerts = typeof issuedCertificates !== 'undefined' ? issuedCertificates : (certRequestsList || []);
      exportData = allCerts.map(c => ({
        'Reference No': c.refNumber || c.trackingNo || c._id,
        'Resident Name': c.residentName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'N/A',
        'Certificate Type': c.certificateType || c.certType || 'N/A',
        'Purpose': c.purpose || c.certPurpose || 'N/A',
        'Date Submitted': c.dateSubmitted || c.createdAt || 'N/A',
        'Status': c.status || 'Pending',
        'Date Issued': c.issuedAt || 'N/A'
      }));
      break;

    case 'feedback':
      exportData = (feedbackList || []).map(f => ({
        'Reference No': f.id || f.refNumber || f._id,
        'Resident Name': f.sender || f.residentName || 'Anonymous',
        'Type': f.feedbackType || f.type || 'Inquiry',
        'Subject': f.subject || 'N/A',
        'Details': f.message || f.details || '',
        'Status': f.status || 'Pending',
        'Handled By': f.assignedTo || f.handledBy || 'Unassigned',
        'Timestamp': f.timestamp || f.rawTimestamp || f.date || ''
      }));
      break;

    case 'households':
      exportData = (householdsList || []).map(h => ({
        'Household No': h.householdNo || h.id || h._id,
        'Head of Family': h.headName || h.headOfFamily || 'N/A',
        'Purok / Zone': h.purok || 'N/A',
        'Members Count': h.membersCount || (h.members ? h.members.length : 1),
        'Address': h.address || 'N/A'
      }));
      break;

    case 'aid':
      exportData = (programsList || []).map(a => ({
        'Program Name': a.title || a.name || 'N/A',
        'Category': a.category || a.type || 'Aid Distribution',
        'Beneficiaries Count': a.beneficiariesCount || (a.beneficiaries ? a.beneficiaries.length : 0),
        'Status': a.status || 'Completed',
        'Date Distributed': a.date || a.createdAt || 'N/A'
      }));
      break;

    case 'audit':
      exportData = (recentLogs || []).map(l => ({
        'Log ID': l._id || l.id,
        'Action': l.action || 'N/A',
        'Module': l.module || 'N/A',
        'User': l.user || l.actor?.username || 'System',
        'Details': l.details || '',
        'Timestamp': l.timestamp || ''
      }));
      break;

    case 'clearances':
      exportData = (clearanceList || []).map(c => ({
        'Clearance No': c.clearanceNo || 'N/A',
        'Full Name': c.fullName || 'N/A',
        'Purpose': c.purpose || 'N/A',
        'Date Issued': c.dateIssued || 'N/A',
        'O.R. No.': c.orNo || 'N/A',
        'Amount Paid (₱)': parseFloat(c.amtPaid || 0).toFixed(2),
        'CTC No.': c.ctcNo || 'N/A',
        'Blotter Status': c.hasBlotterRecord ? 'With Active Case' : 'Clean Record'
      }));
      break;
    
    case 'business_clearances':
      exportData = (businessMasterlist || []).map(b => ({
        'BC ID No': b.bcIdNo || 'N/A',
        'Business Name': b.businessName || 'N/A',
        'Owner Name': `${b.lastName || ''}, ${b.firstName || ''} ${b.middleName || ''}`.trim() || 'N/A',
        'Nature of Business': b.natureOfBusiness || 'N/A',
        'Business Address': b.businessAddress || 'N/A',
        'Date Registered': b.regDate || 'N/A',
        'O.R. No.': b.orNo || 'N/A',
        'Clearance Fee (₱)': parseFloat(b.clearanceFee || 0).toFixed(2),
        'Garbage Fee (₱)': parseFloat(b.garbageFee || 0).toFixed(2),
        'Status': b.status || 'Active'
      }));
      break;

    default:
      alert('Pumili ng tamang report type.');
      return;
  }

  if (exportData.length === 0) {
    alert('Walang available data para i-export sa piniling report category.');
    return;
  }

  exportToExcel(exportData, fileName, moduleType);
};

const getPageTitle = () => {
  const currentScreen = typeof screen !== 'undefined' ? screen : (typeof activeScreen !== 'undefined' ? activeScreen : '');
  if (currentScreen === 'profile' || currentScreen === 's-profile') return 'My Profile';
  if (currentScreen === 'dashboard') return 'Dashboard Overview';
  if (currentScreen === 'residents') return 'Residents Directory';
  if (currentScreen === 'certificates') return 'Certificates & Clearances';
  return title || 'Dashboard';
};

const getPageSubtitle = () => {
  const currentScreen = typeof screen !== 'undefined' ? screen : (typeof activeScreen !== 'undefined' ? activeScreen : '');
  if (currentScreen === 'profile' || currentScreen === 's-profile') return 'Manage your account and credentials';
  return subtitle || '';
};

const [printData, setPrintData] = useState(null);

const closePrint = useCallback(() => {
  setPrintData(null);
}, []);

const handleTriggerPrint = () => {
  setTimeout(() => {
    window.print();
  }, 150);
};

const clearSelectedCert = useCallback(() => {
  setSelectedCertificate(null);
  const url = new URL(window.location.href);
  url.searchParams.delete('id');
  window.history.pushState({}, '', url.toString());
}, []);

const handleSaveBlotter = async (e) => {
  if (e) e.preventDefault();

  // Extract names safely
  const compName = typeof blotterForm.complainant === 'object' 
    ? blotterForm.complainant.name || blotterForm.complainant.displayName 
    : (blotterForm.complainant || blotterForm.complainantName || '');

  const respName = typeof blotterForm.respondent === 'object' 
    ? blotterForm.respondent.name || blotterForm.respondent.displayName 
    : (blotterForm.respondent || blotterForm.respondentName || '');

  // Detailed Required Fields Validation with Auto-Focus
  if (!blotterForm.date) {
    showToast(' Please select the Date of Incident.');
    document.getElementById('blotter-date')?.focus();
    return;
  }

  if (!blotterForm.time) {
    alert('⚠️ Please enter the Time Matrix for the incident.');
    document.getElementById('blotter-time')?.focus();
    return;
  }

  if (!blotterForm.location || blotterForm.location.trim() === '') {
    alert('⚠️ Please enter the Exact Location Address.');
    document.getElementById('blotter-location')?.focus();
    return;
  }

  if (!compName) {
    alert('⚠️ Please select or input the Complainant (Nagrereklamo).');
    document.getElementById('blotter-complainant')?.focus();
    return;
  }

  if (!respName) {
    alert('⚠️ Please select or input the Respondent (Inirereklamo).');
    document.getElementById('blotter-respondent')?.focus();
    return;
  }

  if (!blotterForm.narrative || blotterForm.narrative.trim() === '') {
    alert('⚠️ Please provide the Incident Narrative Report Statement.');
    document.getElementById('blotter-narrative')?.focus();
    return;
  }

  try {
    const trackingNo = blotterForm.trackingNo || `BLT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Complete payload mapped for both old & new table views
    const blotterPayload = {
      _id: trackingNo,
      type: 'blotter_record',
      trackingNo: trackingNo,
      id: trackingNo,
      caseNum: trackingNo, // Fallback for older table components
      officer: blotterForm.officer || 'Juhairo Macabangon',
      dateLogged: blotterForm.dateLogged || new Date().toISOString().split('T')[0],
      date: blotterForm.date || blotterForm.incidentDate || new Date().toISOString().split('T')[0],
      incidentDate: blotterForm.incidentDate || blotterForm.date || new Date().toISOString().split('T')[0],
      incidentTime: blotterForm.incidentTime || blotterForm.time || '22:30',
      time: blotterForm.incidentTime || blotterForm.time || '22:30',
      priority: blotterForm.priority || 'Medium Priority',
      incidentType: blotterForm.incidentType || blotterForm.type || 'Noise Complaint',
      location: blotterForm.location || '',
      isVAWC: !!blotterForm.isVawc,
      isVawc: !!blotterForm.isVawc,

      // Parties Data (Dual-key mapping)
      complainant: compName,
      complainantName: compName,
      complainantId: blotterForm.complainantId || '',
      isComplainantNonResident: !!blotterForm.isComplainantNonResident,

      respondent: respName,
      respondentName: respName,
      respondentEmail: blotterForm.respondentEmail || blotterForm.email || '', // Respondent email
      respondentId: blotterForm.respondentId || '',
      isRespondentNonResident: !!blotterForm.isRespondentNonResident,

      witnesses: blotterForm.witnesses || '',
      narrative: blotterForm.narrative || '',
      formalAction: blotterForm.actionTaken || blotterForm.formalAction || 'Summoned Parties',
      status: blotterForm.status || 'Open',
      summonCount: blotterForm.summonCount || 0,
      nextHearingDate: blotterForm.nextHearingDate || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 1. Save directly to PouchDB
    await db.put(blotterPayload);

    // 2. React state instant update
    if (typeof setBlotterList === 'function') {
      setBlotterList(prev => {
        const filtered = prev.filter(b => b._id !== trackingNo && b.id !== trackingNo);
        return [blotterPayload, ...filtered];
      });
    }

    // 3. System Audit Log
    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'CREATE_BLOTTER',
        module: 'BLOTTER',
        recordId: trackingNo,
        details: `Filed blotter entry ${trackingNo} for ${compName} vs ${respName}`,
      });
    }

    // 4. Trigger Backend Email Notification Service
    let emailStatusMessage = '';
    const targetEmail = blotterForm.respondentEmail || blotterForm.email;

    if (targetEmail && targetEmail.trim() !== '') {
      try {
        const response = await fetch('http://localhost:5000/api/blotter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseNumber: trackingNo,
            respondentName: respName,
            respondentEmail: targetEmail,
            scheduleDate: blotterForm.nextHearingDate || blotterForm.date || 'TBA',
            incidentType: blotterForm.incidentType || blotterForm.type || 'General Incident',
            details: blotterForm.narrative || ''
          })
        });

        const resData = await response.json();
        if (resData.success && resData.emailSent) {
          emailStatusMessage = `\n\n📧 Summons Notification Email successfully sent to ${targetEmail}!`;
        }
      } catch (emailErr) {
        console.warn('Backend Email Service offline or unreachable:', emailErr);
      }
    }

    alert(`✓ Blotter Record successfully saved!\nTracking No: ${trackingNo}${emailStatusMessage}`);

    if (typeof nav === 'function') {
      nav('blotter-manage');
    }
  } catch (err) {
    console.error('Error saving blotter record:', err);
    alert(' An error occurred while saving the Blotter Record. Please try again.');
  }
};

const activeCase = selectedBlotter || staffCase || INITIAL_COMPLAINT;
const [recentLogs, setRecentLogs] = useState([]);

useEffect(() => {
  const fetchRecentLogs = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const logs = res.rows
        .map((r) => r.doc)
        .filter((doc) => doc && (doc.type === 'audit_log' || doc.docType === 'audit_log'))
        .sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt))
        .slice(0, 5); // Kukunin lang ang top 5
      setRecentLogs(logs);
    } catch (e) {
      console.error('Error loading recent logs widget:', e);
    }
  };

  fetchRecentLogs();

  const changes = db.changes({ live: true, since: 'now', include_docs: true });
  changes.on('change', (change) => {
    if (change.doc && (change.doc.type === 'audit_log' || change.doc.docType === 'audit_log')) {
      fetchRecentLogs();
    }
  });

  return () => changes.cancel();
}, []);
const [isBusinessModalOpen, setIsBusinessModalOpen] = useState(false);
const [businessModalMode, setBusinessModalMode] = useState('edit');
const [showBlotterModal, setShowBlotterModal] = useState(false);
  // ── ADVISORIES STATE ──
  const [advisoriesList, setAdvisoriesList] = useState(() => {
    try {
      const saved = localStorage.getItem('bustrac_advisories');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [advisoryForm, setAdvisoryForm] = useState({
    title: '',
    category: 'Relief',
    description: '',
    date: new Date().toISOString().split('T')[0],
    priority: 'Medium',
    status: 'Active',
  });

  const [advisorySubScreen, setAdvisorySubScreen] = useState('list'); // 'list' | 'new' | 'edit'
  const [editingAdvisoryId, setEditingAdvisoryId] = useState(null);

  // Auto-save advisories to localStorage
  useEffect(() => {
    localStorage.setItem('bustrac_advisories', JSON.stringify(advisoriesList));
  }, [advisoriesList]);
    const handleSaveAdvisory = (e) => {
    e.preventDefault();
    if (!advisoryForm.title.trim() || !advisoryForm.description.trim()) {
      alert('Please fill in the Title and Description.');
      return;
    }

    const now = new Date().toISOString();
    const payload = editingAdvisoryId
      ? {
          ...advisoriesList.find((a) => (a._id || a.id) === editingAdvisoryId),
          ...advisoryForm,
          updatedAt: now,
        }
      : {
          _id: `advisory_${Date.now()}`,
          type: 'advisory',
          ...advisoryForm,
          createdAt: now,
          updatedAt: now,
        };

    if (editingAdvisoryId) {
      setAdvisoriesList((prev) =>
        prev.map((a) => ((a._id || a.id) === editingAdvisoryId ? payload : a))
      );
    } else {
      setAdvisoriesList((prev) => [payload, ...prev]);
    }

    // Reset
    setAdvisoryForm({
      title: '',
      category: 'Relief',
      description: '',
      date: new Date().toISOString().split('T')[0],
      priority: 'Medium',
      status: 'Active',
    });
    setEditingAdvisoryId(null);
    setAdvisorySubScreen('list');
  };

  const handleEditAdvisory = (adv) => {
    setEditingAdvisoryId(adv._id || adv.id);
    setAdvisoryForm({
      title: adv.title || '',
      category: adv.category || 'Relief',
      description: adv.description || adv.content || adv.body || '',
      date: adv.date ? adv.date.split('T')[0] : new Date().toISOString().split('T')[0],
      priority: adv.priority || 'Medium',
      status: adv.status || 'Active',
    });
    setAdvisorySubScreen('edit');
  };

  const handleDeleteAdvisory = (id) => {
    if (window.confirm('Are you sure you want to delete this advisory?')) {
      setAdvisoriesList((prev) => prev.filter((a) => (a._id || a.id) !== id));
    }
  };
  
    const [activitiesList, setActivitiesList] = useState(() => {
    try {
      const saved = localStorage.getItem('bustrac_activities');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

    const handleSaveActivity = async (e) => {
  e.preventDefault();
  if (!activityForm.title.trim() || !activityForm.description.trim()) {
    alert('Please fill in the Title and Description.');
    return;
  }

  const now = new Date().toISOString();
  
  try {
    if (editingActivityId) {
  const existingDoc = activitiesList.find((a) => (a._id || a.id) === editingActivityId);
  const updatedPayload = {
    ...existingDoc,
    ...activityForm,
    updatedAt: now,
  };

  const res = await db.put(updatedPayload);

  const finalDoc = { ...updatedPayload, _rev: res.rev };
  setActivitiesList((prev) =>
    prev.map((a) => ((a._id || a.id) === editingActivityId ? finalDoc : a))
  );
} else {
      const newPayload = {
        _id: `activity_${Date.now()}`,
        type: 'activity',
        ...activityForm,
        createdAt: now,
        updatedAt: now,
      };

      await db.put(newPayload);

      setActivitiesList((prev) => [newPayload, ...prev]);
    }

    setActivityForm({
      title: '',
      category: 'Events',
      description: '',
      date: new Date().toISOString().split('T')[0],
      time: '',
      location: '',
    });
    setEditingActivityId(null);
    setActivitySubScreen('list');
  } catch (err) {
    console.error('Error saving activity:', err);
    alert('Failed to save activity to local database.');
  }
    };

  const handleEditActivity = (act) => {
  setEditingActivityId(act._id || act.id);
  setActivityForm({
    _id: act._id,       
    _rev: act._rev,   
    title: act.title || '',
    category: act.category || 'Events',
    description: act.description || act.content || act.body || '',
    date: act.date ? act.date.split('T')[0] : new Date().toISOString().split('T')[0],
    time: act.time || '',
    location: act.location || '',
  });
  setActivitySubScreen('edit');
};
  
  const formatTime12hr = (timeStr) => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  let h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `@ ${h}:${minutes} ${ampm}`;
};

    const handleDeleteActivity = async (id) => {
  if (!window.confirm('Are you sure you want to delete this activity?')) return;

  try {
    const docToDelete = activitiesList.find((a) => (a._id || a.id) === id);
    if (docToDelete && docToDelete._id) {
      await db.remove(docToDelete._id, docToDelete._rev);
    }

    setActivitiesList((prev) => prev.filter((a) => (a._id || a.id) !== id));
  } catch (err) {
    console.error('Error deleting activity:', err);
    alert('Failed to delete activity.');
  }
};
  
    const [activityForm, setActivityForm] = useState({
    title: '',
    category: 'Events',
    description: '',
    date: new Date().toISOString().split('T')[0],
    location: '',
  });
  const [activitySubScreen, setActivitySubScreen] = useState('list');
  const [editingActivityId, setEditingActivityId] = useState(null);

  useEffect(() => {
    localStorage.setItem('bustrac_activities', JSON.stringify(activitiesList));
  }, [activitiesList]);
  
    useEffect(() => {
      async function loadActivities() {
        try {
          const result = await db.find({
            selector: { type: 'activity' }
          });
          if (result.docs) {
            setActivitiesList(result.docs);
          }
        } catch (err) {
          console.error('Failed to load activities:', err);
        }
      }

      if (screen === 'activities-manage') {
        loadActivities();
      }
    }, [screen]);

const saveSettings = async (updatedSettings) => {
  try {
    let existingRev = systemSettings?._rev;

    try {
      const docInDb = await db.get('setting_barangay_officials');
      if (docInDb) {
        existingRev = docInDb._rev;
      }
    } catch (getErr) {
      if (getErr.status !== 404) {
        console.warn('Unable to fetch existing settings rev:', getErr);
      }
    }

    const payload = {
      _id: 'setting_barangay_officials',
      type: 'barangay_settings',
      punongBarangay: updatedSettings.punongBarangay,
      luponSecretary: updatedSettings.luponSecretary,
      treasurer: updatedSettings.treasurer || '',
      publicDomain: updatedSettings.publicDomain || '',
      updatedAt: new Date().toISOString(),
      ...(existingRev ? { _rev: existingRev } : {})
    };

    const response = await db.put(payload);

    const savedPayload = { ...payload, _rev: response.rev };
    setSystemSettings(savedPayload);

    await createAuditLog({
      action: 'UPDATE_OFFICIAL_SETTINGS',
      category: 'SETTINGS',
      targetId: 'setting_barangay_officials',
      details: `Updated Officials: PB ${updatedSettings.punongBarangay}, Sec ${updatedSettings.luponSecretary}`,
      user: currentUser?.name || currentUser?.username || 'Admin'
    });

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    alert('Barangay settings saved successfully!');
  } catch (err) {
    console.error('Error saving settings to PouchDB:', err);
    alert(`Failed to save settings: ${err.message || 'Database error'}`);
  }
};

const [systemSettings, setSystemSettings] = useState(null);

const [settingsForm, setSettingsForm] = useState({
  punongBarangay: 'HON. ANNABELLE E. RULL',
  luponSecretary: 'MRS. MELY M. PRESADO',
  treasurer: '',
  publicDomain: ''
});

  useEffect(() => {
  async function fetchBarangaySettings() {
    try {
      const savedData = await db.get('setting_barangay_officials');
      if (savedData) {
        setSystemSettings(savedData);
        setSettingsForm({
          punongBarangay: savedData.punongBarangay || 'HON. ANNABELLE E. RULL',
          luponSecretary: savedData.luponSecretary || 'MRS. MELY M. PRESADO',
          treasurer: savedData.treasurer || '',
          publicDomain: savedData.publicDomain || ''
        });
      }
    } catch (err) {
      if (err.status === 404) {
        console.log('No saved settings found. Using defaults.');
      } else {
        console.warn('Using default official settings:', err.message);
      }
    }
  }

  fetchBarangaySettings();
}, []);

// ── BARANGAY CLEARANCE: REAL-TIME POUCHDB LISTENER ──
useEffect(() => {
  const loadClearances = async () => {
    try {
      if (!db || typeof db.allDocs !== 'function') {
        console.warn('PouchDB not ready for clearances');
        return;
      }
      const result = await db.allDocs({
        include_docs: true,
        startkey: 'brgy_clearance_',
        endkey: 'brgy_clearance_\uffff'
      });
      const docs = result.rows.map(r => r.doc).filter(Boolean);
      setClearanceList(docs);
    } catch (err) {
      console.error('Failed to fetch barangay clearances:', err);
    }
  };

  loadClearances();

  const changes = db.changes({
    since: 'now',
    live: true,
    include_docs: true
  }).on('change', (change) => {
    if (change.doc && change.doc._id && change.doc._id.startsWith('brgy_clearance_')) {
      setClearanceList(prev => {
        const filtered = prev.filter(c => c._id !== change.doc._id);
        if (change.deleted) return filtered;
        return [change.doc, ...filtered];
      });
    }
  }).on('error', (err) => {
    console.error('Barangay clearance changes error:', err);
  });

  return () => changes.cancel();
}, []);

// ── BUSINESS CLEARANCE: REAL-TIME POUCHDB LISTENER ──
useEffect(() => {
  const loadBusiness = async () => {
    try {
      if (!db || typeof db.allDocs !== 'function') {
        console.warn('PouchDB not ready for business clearances');
        return;
      }
      const result = await db.allDocs({
        include_docs: true,
        startkey: 'bus_clearance_',
        endkey: 'bus_clearance_\uffff'
      });
      const docs = result.rows.map(r => r.doc).filter(Boolean);
      setBusinessMasterlist(docs);
    } catch (err) {
      console.error('Failed to fetch business clearances:', err);
    }
  };

  loadBusiness();

    const changes = db.changes({ since: 'now', live: true, include_docs: true })
    .on('change', (change) => {
      if (change.doc && change.doc._id && change.doc._id.startsWith('bus_clearance_')) {
        setBusinessMasterlist((prev) => {
          const filtered = prev.filter((c) => c._id !== change.doc._id);
          if (change.deleted) return filtered;
          return [change.doc, ...filtered];
        });
      }
    })
    .on('error', (err) => {
      console.error('Business clearance changes error:', err);
    });

  return () => {
    changes.cancel();
  };
}, []);

useEffect(() => {
  if (screen === 'business_clearance' && !businessForm._id) {
    peekNextBusinessSequence().then(nextId => {
      setBusinessForm(prev => ({ ...prev, bcIdNo: nextId }));
    });
  }
}, [screen, businessForm._id]);

useEffect(() => {
  if (role === 'admin' && db) {
    fetchDatabaseConflicts();
  }
  // Auto-refresh every 30 seconds while on dashboard
  const interval = setInterval(() => {
    if (role === 'admin' && db) fetchDatabaseConflicts();
  }, 30000);
  return () => clearInterval(interval);
}, [role, db]);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="dashboard-shell-container">
      <div className={`app ${sidebarOpen ? 'sidebar-is-open' : 'sidebar-is-closed'}`}>
        {/* ════════════════ SIDEBAR ════════════════ */}
        <aside 
          className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`} 
          style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
        >
          {/* 1. SIDEBAR HEADER / LOGO */}
          <div 
            className="sb-logo" 
            style={{ cursor: sidebarOpen ? 'default' : 'pointer', transition: 'cursor 0.2s ease', flexShrink: 0 }} 
            onClick={() => { if (!sidebarOpen) setSidebarOpen(true); }}
          >
            {/* Close / Collapse Button */}
            <button 
              type="button" 
              className="sidebar-close-btn" 
              onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }} 
              aria-label="Collapse sidebar" 
              title="Collapse sidebar"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            
            {/* Logo Image */}
            <img src={logo} alt="Barangay Bustrac Official Seal" className="sb-logo-img" />
            
            {/* Logo Text */}
            <div>
              <div className="sb-title">Bustrac Hub</div>
              <div className="sb-sub">{role === 'admin' ? 'Administrator Portal' : 'Staff Portal'}</div>
            </div>
          </div>

          {/* 2. SCROLLABLE NAVIGATION AREA */}
          <nav 
            className="sb-nav" 
            style={{ flex: 1, overflowY: sidebarOpen ? 'auto' : 'hidden', paddingBottom: '16px' }}
          >
            {/* OVERVIEW */}
            <div className="sb-sec">Overview</div>
            <button 
              className={`nav-btn${screen === 'dashboard' ? ' active' : ''}`} 
              onClick={() => nav('dashboard')} 
              data-tooltip="Dashboard"
            >
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3h8v8H3z" />
                  <path d="M3 13h6v8H3z" />
                  <path d="M13 3h8v6h-8z" />
                  <path d="M13 13h8v8h-8z" />
                </svg>
              </span>
              <span className="nav-label">Dashboard</span>
            </button>

            {/* RESIDENTS MANAGEMENT */}
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
                <span className="nav-label" style={{ flex: 1, textAlign: 'left' }}>Residents Profile</span>
                <span className="submenu-arrow" style={{ transform: isResidentsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
              </button>

              {isResidentsOpen && sidebarOpen && (
                <div className="sb-submenu-zone" style={{ paddingLeft: '14px' }}>
                  <button className={`nav-btn sub-btn${screen === 'residents' ? ' active' : ''}`} onClick={() => nav('residents')}>
                    <span className="nav-ico">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                    </span>
                    <span className="nav-label">Manage Ledger</span>
                  </button>
                  
                  <button className={`nav-btn sub-btn${screen === 'households' ? ' active' : ''}`} onClick={() => nav('households')}>
                    <span className="nav-ico">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="M9 22V12h6v10" />
                      </svg>
                    </span>
                    <span className="nav-label">Manage Households</span>
                  </button>

                  <button className={`nav-btn sub-btn${screen === 'add-resident' ? ' active' : ''}`} onClick={() => nav('add-resident')}>
                    <span className="nav-ico">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                    <span className="nav-label">Add Resident</span>
                  </button>
                </div>
              )}
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
              <span className="nav-label">Request & Approval</span>
              {pendingRequestsCount > 0 && (
                <span className="nb nb-amber">{pendingRequestsCount}</span>
              )}
            </button>

            <button className={`nav-btn${screen === 'cert-print' ? ' active' : ''}`} onClick={() => nav('cert-print')}>
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
                  <path d="M7 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H7" />
                  <path d="M12 7V5" />
                  <path d="M10 19h4" />
                  <path d="M7 9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                </svg>
              </span>
              <span className="nav-label">Issuance & Print</span>
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
              <span className="nav-label">Barangay Clearance</span>
            </button>

            <button className={`nav-btn${screen === 'business_clearance' ? ' active' : ''}`} onClick={() => nav('business_clearance')}>
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <path d="M9 22V12h6v10" />
                </svg>
              </span>
              <span className="nav-label">Business Clearance</span>
            </button>

            {/* AID DISTRIBUTION */}
            <div className="sb-sec">Aid Distribution</div>
            <div className="sb-nav-group">
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
                <span className="nav-label" style={{ flex: 1, textAlign: 'left' }}>Aid Distribution</span>
                <span className="submenu-arrow" style={{ transform: isAidOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
              </button>

              {isAidOpen && sidebarOpen && (
                <div className="sb-submenu-zone" style={{ paddingLeft: '14px' }}>
                  <button className={`nav-btn sub-btn${screen === 'programs' ? ' active' : ''}`} onClick={() => nav('programs')}>
                    <span className="nav-ico">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                    </span>
                    <span className="nav-label">Programs</span>
                  </button>

                  <button className={`nav-btn sub-btn${screen === 'aid-encode' ? ' active' : ''}`} onClick={() => nav('aid-encode')}>
                    <span className="nav-ico">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                    <span className="nav-label">Encode Distribution</span>
                  </button>

                  <button className={`nav-btn sub-btn${screen === 'aid-logs' ? ' active' : ''}`} onClick={() => nav('aid-logs')}>
                    <span className="nav-ico">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                    </span>
                    <span className="nav-label">Distribution Logs</span>
                  </button>

                  {role === 'admin' && (
                    <button className={`nav-btn sub-btn${screen === 'add-beneficiary' ? ' active' : ''}`} onClick={() => nav('add-beneficiary')}>
                      <span className="nav-ico">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                      <span className="nav-label">Add Beneficiary</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* PEACE & ORDER / INCIDENTS */}
            <div className="sb-sec">Peace & Order</div>
            <button className={`nav-btn${screen === 'blotter-new' ? ' active' : ''}`} onClick={() => nav('blotter-new')}>
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </span>
              <span className="nav-label">File Incident / Complaint</span>
            </button>

            <button className={`nav-btn${screen === 'blotter-manage' ? ' active' : ''}`} onClick={() => nav('blotter-manage')}>
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M12 18v-6" />
                  <path d="M9 15h6" />
                </svg>
              </span>
              <span className="nav-label">Manage Incident Cases</span>
              {pendingBlotterCount > 0 && (
                <span className="nb nb-red">{pendingBlotterCount}</span>
              )}
            </button>

            {role === 'staff' && (
              <button className={`nav-btn${screen === 'blotter-detail' ? ' active' : ''}`} onClick={() => nav('blotter-detail')}>
                <span className="nav-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <span className="nav-label">Summons & Hearings</span>
              </button>
            )}

            {/* COMMUNITY */}
            <div className="sb-sec">Community</div>
            <button className={`nav-btn${screen === 'announcements' ? ' active' : ''}`} onClick={() => nav('announcements')}>
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </span>
              <span className="nav-label">Announcements</span>
            </button>

            <button className={`nav-btn${screen === 'feedback' ? ' active' : ''}`} onClick={() => nav('feedback')}>
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="nav-label">Feedback</span>
              {activeFeedbackCount > 0 && (
                <span className="nb nb-red">{activeFeedbackCount}</span>
              )}
            </button>

            <button className={`nav-btn${screen === 'activities-manage' ? ' active' : ''}`} onClick={() => nav('activities-manage')}>
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
              <span className="nav-label">Manage Activities</span>
            </button>

            <button className={`nav-btn${screen === 'aid-advisories' ? ' active' : ''}`} onClick={() => nav('aid-advisories')}>
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <span className="nav-label">Relief & Aid Advisories</span>
            </button>

            {/* ADMIN-ONLY SECTION */}
            {role === 'admin' && (
              <>
                <div className="sb-sec">Admin Only</div>
                <button className={`nav-btn${screen === 'conflicts' ? ' active' : ''}`} onClick={() => nav('conflicts')}>
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                  </span>
                  <span className="nav-label">Conflict Resolution</span>
                  {conflictsList?.length > 0 && (
                    <span className="nb nb-red">{conflictsList.length}</span>
                  )}
                </button>

                <button className={`nav-btn${screen === 'audit' ? ' active' : ''}`} onClick={() => nav('audit')}>
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
                    </svg>
                  </span>
                  <span className="nav-label">Audit Log</span>
                </button>

                <button className={`nav-btn${screen === 'officials' ? ' active' : ''}`} onClick={() => nav('officials')}>
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </span>
                  <span className="nav-label">Barangay Officials</span>
                </button>

                <button className={`nav-btn${screen === 'users' ? ' active' : ''}`} onClick={() => nav('users')}>
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  <span className="nav-label">Manage Users</span>
                </button>
              </>
            )}

            {/* REPORTS */}
            <div className="sb-sec">Reports</div>
            <button className={`nav-btn${screen === 'reports' ? ' active' : ''}`} onClick={() => nav('reports')}>
              <span className="nav-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3h18v18H3z" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
              </span>
              <span className="nav-label">Generate Reports</span>
            </button>
          </nav>

          {/* 3. SIDEBAR FOOTER (USER PROFILE & SYNC STATUS) */}
          <div 
            className="sb-foot" 
            onClick={() => {
              if (typeof setScreen === 'function') {
                setScreen('profile');
              } else if (typeof setShowUserMenu === 'function') {
                setShowUserMenu(prev => !prev);
              }
            }} 
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (typeof setScreen === 'function') setScreen('profile');
              }
            }} 
            role="button" 
            tabIndex={0}
          >
            <div className="sb-ava">{initials}</div>
            <div className="sb-info" style={{ flex: 1, minWidth: 0 }}>
              <div className="sb-uname" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </div>
              <div className="sb-urole">
                {role === 'admin' ? 'Administrator' : 'Staff'}
              </div>
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
                background: syncState === 'offline' ? 'var(--red)' : syncState === 'syncing' ? 'var(--amber)' : 'var(--green)',
                boxShadow: syncState === 'offline' ? '0 0 0 2px var(--red-bg)' : syncState === 'syncing' ? '0 0 0 2px var(--amber-bg)' : '0 0 0 2px var(--green-bg)',
              }} 
            />
          </div>
        </aside>
        
        {/* ════════════════ MAIN CONTENT ════════════════ */}
        <div className="main">

          {/* ── Topbar ── */}
          <header className="topbar">
            <div style={{ flex: 1 }}>
              <div className="tb-title">{getPageTitle()}</div>
              <div className="tb-sub">{getPageSubtitle()}</div>
            </div>

            {role === 'admin' && (
              <div className="role-admin">🔑 Admin</div>
            )}

            {/* Real-time Dynamic Sync Status Indicator */}
            <SyncStatusIndicator syncState={syncState} />

            <ThemeToggle />
            
            <button className="btn btn-g btn-sm" onClick={logout}>
              Sign Out
            </button>
          </header>

          <div className="content">

            {/* ════════════════════════════════════════
                SCREEN: DASHBOARD
                ════════════════════════════════════════ */}
                {screen === 'dashboard' && (
                  <div className="screen active" style={{ padding: '24px', width: '100%', boxSizing: 'border-box', maxWidth: '1600px', margin: '0 auto' }}> 
                    {/* 1. TOP METRICS GRID */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                      {[
                        { label: 'Total Residents', value: totalResidents, sub: 'Registered', color: 'var(--text)' },
                        { label: 'Households', value: totalHouseholds, sub: 'Family units', color: 'var(--green)' },
                        { label: 'Reg. Voters', value: totalVoters, sub: `${totalResidents > 0 ? ((totalVoters / totalResidents) * 100).toFixed(0) : 0}% of total`, color: 'var(--amber)' },
                        { label: 'Pending Certs', value: pendingRequestsCount, sub: 'Awaiting approval', color: 'var(--accent)' },
                        { label: 'Open Blotter', value: typeof blotterList !== 'undefined' ? blotterList.filter(b => b.status === 'Open' || b.status === 'Under Mediation').length : 0, sub: 'Active cases', color: 'var(--red)' },
                        ...(role === 'admin' ? [{ label: 'Sync Conflicts', value: conflictsList.length, sub: conflictsList.length > 0 ? 'Needs fix' : 'All synced', color: conflictsList.length > 0 ? 'var(--amber)' : 'var(--muted)' }] : []),
                        { label: 'Feedback', value: activeFeedbackCount, sub: 'Submissions', color: 'var(--teal)' }
                      ].map((stat, i) => (
                        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</span>
                          <span style={{ fontSize: '26px', fontWeight: 800, color: stat.color, lineHeight: 1.1 }}>{stat.value}</span>
                          <span style={{ fontSize: '11px', color: 'var(--hint)' }}>{stat.sub}</span>
                        </div>
                      ))}
                    </div>

                    {/* 2. MIDDLE ROW (Pending Actions & Audit Trail) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                      {/* Pending Actions */}
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                          {role === 'admin' ? 'Pending Admin Actions' : 'Pending Actions'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                          {role === 'admin' && conflictsList.length > 0 && (
                            <div onClick={() => nav('conflicts')} style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber-text)' }}>Sync Conflicts Detected</div>
                                <div style={{ fontSize: '12px', color: 'var(--text)' }}>{conflictsList.length} record(s) need resolution</div>
                              </div>
                              <span style={{ background: 'var(--amber)', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '11px', padding: '6px 14px', borderRadius: '6px' }}>Resolve</span>
                            </div>
                          )}
                          {[
                            { title: 'Certificate Requests', count: pendingRequestsCount, desc: 'Pending approval by authorized officer', color: 'var(--accent-text)', border: 'var(--accent)', bg: 'var(--accent-bg)', nav: 'cert-approve', btnText: 'Review' },
                            { title: 'Unread Feedback', count: activeFeedbackCount, desc: 'Resident submissions awaiting response', color: 'var(--teal-text)', border: 'var(--teal)', bg: 'var(--teal-bg)', nav: 'feedback', btnText: 'View' },
                            { title: 'Open Blotter Cases', count: typeof blotterList !== 'undefined' ? blotterList.filter(b => b.status === 'Open' || b.status === 'Under Mediation').length : 0, desc: 'Active cases requiring mediation', color: 'var(--red-text)', border: 'var(--red)', bg: 'var(--red-bg)', nav: 'blotter-manage', btnText: 'Manage' }
                          ].map((action, i) => (
                            <div key={i} onClick={() => nav(action.nav)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }}>
                              <div style={{ paddingRight: '12px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                  {action.title}
                                  {action.count > 0 && (
                                    <span style={{ background: action.bg, color: action.color, fontSize: '10px', padding: '2px 8px', borderRadius: '12px', fontWeight: 800, border: `1px solid ${action.border}` }}>
                                      {action.count}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{action.desc}</div>
                              </div>
                              <button style={{ background: action.bg, color: action.color, border: `1px solid ${action.border}`, fontWeight: 700, fontSize: '11px', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}>
                                {action.btnText}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Audit Trail */}
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                          {role === 'admin' ? 'Recent Audit Trail' : 'Recent Activity'}
                        </div>

                        {recentLogs.length === 0 ? (
                          <div style={{ textAlign: 'center', color: 'var(--hint)', padding: '30px', fontSize: '12px', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                            No recent activity recorded.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                            {recentLogs.map((log) => {
                              // Fallback helper kung wala ang getActionMeta sa file
                              const getMeta = typeof getActionMeta === 'function' 
                                ? getActionMeta 
                                : (act = '') => ({
                                    bg: 'rgba(59, 130, 246, 0.15)',
                                    ico: '📋'
                                  });

                              const meta = getMeta(log.action);
                              const userText = log.user || log.actor?.username || 'System';

                              return (
                                <div key={log._id || log.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                                  <div style={{ width: '30px', height: '30px', borderRadius: '6px', background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {meta.ico}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                      <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '12px' }}>{log.action}</span>
                                      {log.module && <span style={{ color: 'var(--muted)', fontSize: '11px' }}>• {log.module}</span>}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {userText} {log.details ? `• ${log.details}` : ''}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: '10px', color: 'var(--hint)', flexShrink: 0, fontFamily: 'var(--mono)' }}>
                                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {role === 'admin' && (
                          <button onClick={() => setScreen('audit')} style={{ width: '100%', padding: '8px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700, fontSize: '12px', borderRadius: '6px', cursor: 'pointer' }}>
                            View Full Audit Log
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                      
                      {/* Blotter Case Outcomes Visual Card */}
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Blotter Case Outcomes</div>
                            <div style={{ fontSize: '11px', color: 'var(--hint)' }}>Settled vs Escalated (CFA) vs Pending</div>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                            Total: {blotterList.length}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {[
                            { label: 'Settled / Amicable', count: settledBlotterCount, color: 'var(--green)', bg: 'var(--green-bg)' },
                            { label: 'Referred to PNP (CFA)', count: cfaBlotterCount, color: 'var(--red)', bg: 'var(--red-bg)' },
                            { label: 'Active / Mediation', count: activeBlotterCount, color: 'var(--amber)', bg: 'var(--amber-bg)' }
                          ].map((item) => {
                            const total = blotterList.length || 1;
                            const pct = Math.round((item.count / total) * 100);
                            return (
                              <div key={item.label}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                  <span style={{ color: 'var(--text)' }}>{item.label}</span>
                                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{item.count} ({pct}%)</span>
                                </div>
                                <div style={{ background: 'var(--surface2)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                                  <div style={{ background: item.color, height: '100%', width: `${pct}%`, transition: 'width 0.5s ease' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Feedback Reports Breakdown Visual Card */}
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Feedback Submissions</div>
                            <div style={{ fontSize: '11px', color: 'var(--hint)' }}>Categorized by report type</div>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                            Total: {feedbackList.length}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '10px' }}>
                          {[
                            { label: 'Complaints', count: feedbackSummary.complaint, color: 'var(--red)', bg: 'rgba(239, 68, 68, 0.1)' },
                            { label: 'Inquiries', count: feedbackSummary.inquiry, color: 'var(--accent)', bg: 'rgba(59, 130, 246, 0.1)' },
                            { label: 'Suggestions', count: feedbackSummary.suggestion, color: 'var(--teal)', bg: 'rgba(20, 184, 166, 0.1)' }
                          ].map((fb, idx) => (
                            <div key={idx} style={{ background: fb.bg, border: `1px solid ${fb.color}`, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                              <div style={{ fontSize: '22px', fontWeight: 800, color: fb.color }}>{fb.count}</div>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>{fb.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                    
                    {/* 3. BOTTOM ROW (Purok Population & System Status) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
                      {/* Purok Population */}
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
                          </div>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Population per Purok</div>
                            <div style={{ fontSize: '11px', color: 'var(--hint)' }}>Resident distribution</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {[
                            { label: 'Purok 1', count: p1Count, color: 'var(--accent)' },
                            { label: 'Purok 2', count: p2Count, color: 'var(--teal)' },
                            { label: 'Purok 3', count: p3Count, color: 'var(--primary)' },
                            { label: 'Purok 4', count: getPurokCount('Purok 4'), color: 'var(--red)' },
                            { label: 'Purok 5', count: p5Count, color: 'var(--amber)' }
                          ].map((purok) => {
                            const percentage = totalResidents > 0 ? Math.round((purok.count / totalResidents) * 100) : 0;
                            return (
                              <div key={purok.label}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{purok.label}</span>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{purok.count} ({percentage}%)</span>
                                </div>
                                <div style={{ background: 'var(--surface2)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ background: purok.color, height: '100%', width: `${percentage}%`, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* System Status */}
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--teal-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4" /><path d="M12 18v4" /><path d="M2 12h2" /><path d="M20 12h2" /></svg>
                            </div>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>System Status</div>
                              <div style={{ fontSize: '11px', color: 'var(--hint)' }}>Local database & sync</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[
                              { label: 'Sync Engine', value: 'PouchDB → CouchDB', color: 'var(--text)' },
                              { label: 'Local Documents', value: `${residentsList.length + householdsList.length + programsList.length} records`, color: 'var(--text)' },
                              { label: 'Sync Mode', value: syncState === 'offline' ? 'Offline' : syncState === 'syncing' ? 'Syncing...' : 'Live Replication', color: syncState === 'offline' ? 'var(--amber)' : 'var(--green)' }
                            ].map((row, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{row.label}</span>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: row.color }}>{row.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: 'var(--green-text)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)' }} />
                            {syncState === 'offline' ? 'Offline' : 'Synchronization Active'}
                          </span>
                          <button onClick={() => nav('residents')} style={{ background: 'var(--primary)', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                            Masterlist →
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
                  {/* Search & Filters Bar */}
                  <div className="tw" style={{ marginBottom: '16px' }}>
                    <div className="tb">
                      <div className="sb-box">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                          placeholder="Search by name, purok, Resident ID, or RBI ID..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                      <select className="fc" style={{ width: '130px' }} value={purokFilter} onChange={(e) => setPurokFilter(e.target.value)}>
                        <option value="All Puroks">All Puroks</option>
                        <option value="Purok 1">Purok 1</option>
                        <option value="Purok 2">Purok 2</option>
                        <option value="Purok 3">Purok 3</option>
                        <option value="Purok 4">Purok 4</option>
                        <option value="Purok 5">Purok 5</option>
                        <option value="Purok 6">Purok 6</option>
                      </select>
                      <select className="fc" style={{ width: '110px' }} value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
                        <option value="All Gender">All Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>

                  {/* Selected Residents Bar */}
                  {selectedResidents.length > 0 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      marginBottom: '16px',
                      fontSize: '13px',
                      position: 'relative',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
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
                        <button className="btn btn-p btn-sm" onClick={() => setShowBulkDropdown(!showBulkDropdown)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                          Bulk Actions <span style={{ fontSize: '10px' }}>{showBulkDropdown ? '▲' : '▼'}</span>
                        </button>
                        <button className="btn btn-g btn-sm" onClick={() => { setSelectedResidents([]); setShowBulkDropdown(false); }}>
                          Cancel
                        </button>
                        {showBulkDropdown && (
                          <div style={{
                            position: 'absolute',
                            top: '40px',
                            right: '0',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                            zIndex: 50,
                            minWidth: '240px',
                            overflow: 'hidden',
                            animation: 'dp-fadeIn 0.2s ease-out'
                          }}>
                            <button className="bulk-menu-item" onClick={() => { nav('aid-encode'); setShowBulkDropdown(false); }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              </svg>
                              Encode to Aid Program
                            </button>
                            <button className="bulk-menu-item" onClick={() => { nav('cert-print'); setShowBulkDropdown(false); }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6" />
                                <path d="M12 18v-6" />
                                <path d="M9 15h6" />
                              </svg>
                              Prepare Bulk Certificates
                            </button>
                            <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
                            <button className="bulk-menu-item bulk-menu-export" onClick={() => {
                              const selectedData = residentsList.filter(r => selectedResidents.includes(r.id));
                              const csvHeaders = "Resident ID,RBI ID,Name,Purok,Age,Civil Status,Voter\n";
                              const csvRows = selectedData
                                .map((r) => `"${r.id}","${r.rbiId || ''}","${r.name}","${r.purok}",${r.age},"${r.civilStatus}","${r.voter ? 'Yes' : 'No'}"`)
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
                            }}>
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

                  {/* Residents Table */}
                  <div className="tw" style={{ borderRadius: '8px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>
                            <input type="checkbox" style={{ cursor: 'pointer' }}
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
                          <th onClick={() => handleResidentSort('id')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            Resident ID{' '}{residentSort.key === 'id' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </th>
                          <th onClick={() => handleResidentSort('rbiId')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            RBI ID{' '}{residentSort.key === 'rbiId' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </th>
                          <th onClick={() => handleResidentSort('name')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            Full Name{' '}{residentSort.key === 'name' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </th>
                          <th onClick={() => handleResidentSort('purok')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            Purok{' '}{residentSort.key === 'purok' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </th>
                          <th onClick={() => handleResidentSort('age')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            Age{' '}{residentSort.key === 'age' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </th>
                          <th onClick={() => handleResidentSort('civilStatus')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            Civil Status{' '}{residentSort.key === 'civilStatus' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </th>
                          <th onClick={() => handleResidentSort('voter')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            Voter{' '}{residentSort.key === 'voter' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </th>
                          {role === 'admin' && <th>Household</th>}
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedFilteredResidents.map((res) => {
                          const isChecked = selectedResidents.includes(res.id);
                          return (
                            <tr key={res.id} className={isChecked ? 'row-selected' : ''}>
                              <td style={{ textAlign: 'center' }}>
                                <input type="checkbox" checked={isChecked} onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedResidents([...selectedResidents, res.id]);
                                  } else {
                                    setSelectedResidents(selectedResidents.filter(id => id !== res.id));
                                  }
                                }} />
                              </td>
                              <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{res.id}</td>
                              <td style={{ fontFamily: 'var(--mono)' }}>{res.rbiId || '—'}</td>
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
                              <td>
                                <span className={`badge ${res.purokClass}`}>{res.purok}</span>
                              </td>
                              <td>{res.age}</td>
                              <td>{res.civilStatus}</td>
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
                              {role === 'admin' && <td style={{ fontFamily: 'var(--mono)' }}>{res.household}</td>}
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <button className="btn btn-sm action-btn-view" onClick={() => { setSelectedResidentId(res.id); nav('view-resident'); }} title="View">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <path d="M14 2v6h6" />
                                    <path d="M12 18v-6" />
                                    <path d="M9 15h6" />
                                  </svg>
                                </button>
                                <button className="btn btn-sm action-btn-edit" onClick={() => { setSelectedResidentId(res.id); nav('edit-resident'); }} title="Edit">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                {role === 'admin' && (
                                  <button className="btn btn-sm action-btn-delete" onClick={() => handleDeleteResident(res.id, res.name)} title="Delete">
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
                          ...formCardStyle,
                          backdropFilter: 'blur(8px)',
                          padding: '24px',
                          borderRadius: '12px',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px' }}>

                          {/* ── LEFT SIDEBAR: PHOTO & BARANGAY STATUS ── */}
                          <div style={{ borderRight: '1px solid var(--border)', paddingRight: '20px' }}>
                            <div style={{
                              width: '100%',
                              height: '180px',
                              border: '2px dashed var(--border)',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginBottom: '12px',
                              backgroundColor: 'var(--surface2)',
                              color: 'var(--text)',
                              overflow: 'hidden',
                            }}>
                              {residentForm.photoUrl ? (
                                <img src={residentForm.photoUrl} alt="Resident" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Picture (.Jpg)</span>
                              )}
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                              <input
                                type="file"
                                accept="image/*"
                                id="resident-photo-upload"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    if (file.size > 2 * 1024 * 1024) {
                                      alert('Masyadong malaki ang larawan. Paki-upload ng file na mas mababa sa 2MB.');
                                      return;
                                    }
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      updateResidentField('photoUrl', reader.result);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                              
                              <label
                                htmlFor="resident-photo-upload"
                                className="btn btn-g"
                                style={{ width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                  <circle cx="12" cy="13" r="4" />
                                </svg>
                                {residentForm.photoUrl ? 'Change Photo' : 'Upload / Take Photo'}
                              </label>

                              {/* SVG REMOVE PHOTO BUTTON */}
                              {residentForm.photoUrl && (
                                <button
                                  type="button"
                                  className="btn btn-g btn-sm"
                                  style={{
                                    width: '100%',
                                    marginTop: '8px',
                                    color: 'var(--red, #ef4444)',
                                    borderColor: 'rgba(239, 68, 68, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                  }}
                                  onClick={() => updateResidentField('photoUrl', '')}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    <line x1="10" y1="11" x2="10" y2="17" />
                                    <line x1="14" y1="11" x2="14" y2="17" />
                                  </svg>
                                  Remove Photo
                                </button>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text)' }}>
                                <input type="checkbox" checked={residentForm.isBarangayOfficial} onChange={(e) => updateResidentField('isBarangayOfficial', e.target.checked)} />
                                Barangay Official
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--red)' }}>
                                <input type="checkbox" checked={residentForm.isDeceased} onChange={(e) => updateResidentField('isDeceased', e.target.checked)} />
                                Mark as Deceased
                              </label>
                            </div>
                          </div>

                          {/* ── MAIN FORM CONTENT ── */}
                          <div>
                            {/* Header / ID Info */}
                            <div className="fg3" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>RBI ID NO. *</label>
                                <input
                                  type="text"
                                  className="fc"
                                  required
                                  placeholder="05-17-23-005-00000868"
                                  style={formFieldStyle}
                                  value={residentForm.rbiNo}
                                  onChange={(e) => updateResidentField('rbiNo', e.target.value.toUpperCase())}
                                />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>HOUSEHOLD NUMBER</label>
                                <input
                                  type="text"
                                  className="fc"
                                  placeholder="HH-2026-001"
                                  style={formFieldStyle}
                                  value={residentForm.householdNo}
                                  onChange={(e) => updateResidentField('householdNo', e.target.value)}
                                />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>FILE DATE UPDATED</label>
                                <input
                                  type="date"
                                  className="fc"
                                  style={formFieldStyle}
                                  value={residentForm.fileDateUpdated}
                                  onChange={(e) => updateResidentField('fileDateUpdated', e.target.value)}
                                />
                              </div>
                            </div>

                            {/* Full Name Fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 120px', gap: '10px', marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>LAST NAME *</label>
                                <input type="text" className="fc" required style={formFieldStyle} value={residentForm.lastName} onChange={(e) => updateResidentField('lastName', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>FIRST NAME *</label>
                                <input type="text" className="fc" required style={formFieldStyle} value={residentForm.firstName} onChange={(e) => updateResidentField('firstName', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>MIDDLE NAME</label>
                                <input type="text" className="fc" style={formFieldStyle} value={residentForm.middleName} onChange={(e) => updateResidentField('middleName', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>SUFFIX</label>
                                <input type="text" className="fc" placeholder="Jr / Sr / III" style={formFieldStyle} value={residentForm.suffix} onChange={(e) => updateResidentField('suffix', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>ALIAS</label>
                                <input type="text" className="fc" style={formFieldStyle} value={residentForm.alias} onChange={(e) => updateResidentField('alias', e.target.value)} />
                              </div>
                            </div>

                            {/* Birthdate, Age, Birth Place */}
                            <div className="fg3" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>BIRTHDATE *</label>
                                <input
                                  type="date"
                                  className="fc"
                                  required
                                  style={formFieldStyle}
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
                                <label className="fl" style={formLabelStyle}>AGE</label>
                                <input type="number" className="fc" readOnly style={formFieldStyle} value={residentForm.age} />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>BIRTH PLACE</label>
                                <input type="text" className="fc" style={formFieldStyle} value={residentForm.birthPlace} onChange={(e) => updateResidentField('birthPlace', e.target.value)} />
                              </div>
                            </div>

                            {/* Sex / LGBTQIA+ */}
                            <div className="fg2" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>SEX *</label>
                                <select className="fc" style={formFieldStyle} value={residentForm.sex} onChange={(e) => updateResidentField('sex', e.target.value)}>
                                  <option value="Male">Male</option>
                                  <option value="Female">Female</option>
                                </select>
                              </div>
                              <div className="fg" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: 'var(--text)' }}>
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
                                    style={formFieldStyle}
                                    value={residentForm.lgbtqiaSpecification}
                                    onChange={(e) => updateResidentField('lgbtqiaSpecification', e.target.value)}
                                  />
                                )}
                              </div>
                            </div>

                            {/* Civil Status, Citizenship */}
                            <div className="fg2" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>CIVIL STATUS *</label>
                                <select className="fc" style={formFieldStyle} value={residentForm.civilStatus} onChange={(e) => updateResidentField('civilStatus', e.target.value)}>
                                  <option value="Single">Single</option>
                                  <option value="Married">Married</option>
                                  <option value="Widowed">Widowed</option>
                                  <option value="Separated">Separated</option>
                                  <option value="Divorced">Divorced</option>
                                </select>
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>CITIZENSHIP</label>
                                <input type="text" className="fc" style={formFieldStyle} value={residentForm.citizenship} onChange={(e) => updateResidentField('citizenship', e.target.value)} />
                              </div>
                            </div>

                            {/* Religion, Tribe */}
                            <div className="fg2" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>RELIGION</label>
                                <input type="text" className="fc" style={formFieldStyle} value={residentForm.religion} onChange={(e) => updateResidentField('religion', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>INDIGENOUS TRIBE</label>
                                <input type="text" className="fc" style={formFieldStyle} value={residentForm.indigenousTribe} onChange={(e) => updateResidentField('indigenousTribe', e.target.value)} />
                              </div>
                            </div>

                            {/* Physical Attributes */}
                            <div className="fg3" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>WEIGHT (kg)</label>
                                <input type="number" step="0.1" className="fc" style={formFieldStyle} value={residentForm.weightKg} onChange={(e) => updateResidentField('weightKg', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>HEIGHT (cm)</label>
                                <input type="number" step="0.1" className="fc" style={formFieldStyle} value={residentForm.heightCm} onChange={(e) => updateResidentField('heightCm', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>BLOOD TYPE</label>
                                <select className="fc" style={formFieldStyle} value={residentForm.bloodType} onChange={(e) => updateResidentField('bloodType', e.target.value)}>
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
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                                <input type="checkbox" checked={residentForm.isHouseholdHead} onChange={(e) => updateResidentField('isHouseholdHead', e.target.checked)} />
                                Head of Household
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                                <input type="checkbox" checked={residentForm.isFamilyHead} onChange={(e) => updateResidentField('isFamilyHead', e.target.checked)} />
                                Head of Family
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                                <input type="checkbox" checked={residentForm.isSoloParent} onChange={(e) => updateResidentField('isSoloParent', e.target.checked)} />
                                Solo Parent
                              </label>
                            </div>

                            {/* Relationship to Household Head */}
                            <div className="fg" style={{ marginBottom: '16px' }}>
                              <label className="fl" style={formLabelStyle}>RELATIONSHIP TO HOUSEHOLD HEAD</label>
                              <input
                                type="text"
                                className="fc"
                                placeholder="e.g. Spouse, Son, Daughter, Self"
                                style={formFieldStyle}
                                value={residentForm.relationshipToHouseholdHead}
                                onChange={(e) => updateResidentField('relationshipToHouseholdHead', e.target.value)}
                              />
                            </div>

                            {/* Residency Information */}
                            <div style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                              <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
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
                                  <label className="fl" style={formLabelStyle}>RESIDENT SINCE WHEN?</label>
                                  <input
                                    type="date"
                                    className="fc"
                                    style={formFieldStyle}
                                    value={residentForm.residentSince}
                                    onChange={(e) => updateResidentField('residentSince', e.target.value)}
                                  />
                                </div>
                                <div className="fg">
                                  <label className="fl" style={formLabelStyle}>STATUS OF RESIDENCY</label>
                                  <select
                                    className="fc"
                                    style={formFieldStyle}
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
                            <div style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                              <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                                  <input type="checkbox" checked={residentForm.isRegisteredVoter} onChange={(e) => updateResidentField('isRegisteredVoter', e.target.checked)} />
                                  Registered Voter?
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                                  <input type="checkbox" checked={residentForm.isVotingLocally} onChange={(e) => updateResidentField('isVotingLocally', e.target.checked)} />
                                  Voting Here?
                                </label>
                              </div>
                              <div className="fg2">
                                <div className="fg">
                                  <label className="fl" style={formLabelStyle}>PRECINCT NO.</label>
                                  <input type="text" className="fc" style={formFieldStyle} value={residentForm.precinctNo} onChange={(e) => updateResidentField('precinctNo', e.target.value)} />
                                </div>
                                <div className="fg">
                                  <label className="fl" style={formLabelStyle}>VOTING IN OTHER PLACE? (Indicate Place)</label>
                                  <input type="text" className="fc" style={formFieldStyle} value={residentForm.votingOtherPlace} onChange={(e) => updateResidentField('votingOtherPlace', e.target.value)} />
                                </div>
                              </div>
                            </div>

                            {/* Address & Contact Info */}
                            <div className="fg2" style={{ marginBottom: '16px' }}>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>CONTACT NOS.</label>
                                <input type="text" className="fc" placeholder="09XX-XXX-XXXX" style={formFieldStyle} value={residentForm.contactNo} onChange={(e) => updateResidentField('contactNo', e.target.value)} />
                              </div>
                              <div className="fg">
                                <label className="fl" style={formLabelStyle}>EMAIL ADD</label>
                                <input type="email" className="fc" style={formFieldStyle} value={residentForm.email} onChange={(e) => updateResidentField('email', e.target.value)} />
                              </div>
                            </div>

                            <div className="fg" style={{ marginBottom: '16px' }}>
                              <label className="fl" style={formLabelStyle}>ST., LOT NO., SUBD., PUROK/ZONE</label>
                              <input type="text" className="fc" placeholder="Purok 3, Zone 1" style={formFieldStyle} value={residentForm.purokZoneAddress} onChange={(e) => updateResidentField('purokZoneAddress', e.target.value)} />
                            </div>

                            <div className="fg" style={{ marginBottom: '20px' }}>
                              <label className="fl" style={formLabelStyle}>ADDRESS OUTSIDE IN THIS BARANGAY</label>
                              <input type="text" className="fc" style={formFieldStyle} value={residentForm.addressOutsideBarangay} onChange={(e) => updateResidentField('addressOutsideBarangay', e.target.value)} />
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
                        <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold'}}>
                          {res.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--text)' }}>{res.name}</div>
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
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: '13px', background: 'var(--surface2)', borderRadius: '6px' }}>
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
            
            {/* ════════════════════════════════════════
                SCREEN: ADD HOUSEHOLD
                ════════════════════════════════════════ */}
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
                 SCREEN: EDIT HOUSEHOLD
                ════════════════════════════════════════ */}
                {screen === 'edit-household' && (
                <div className="screen active">
                  <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                    {/* Header with Back Button */}
                    <div className="ph" style={{ marginBottom: '16px' }}>
                      <button 
                        className="btn btn-g" 
                        onClick={() => {
                          setHouseholdForm(EMPTY_HOUSEHOLD);
                          setSelectedHouseholdId(null);
                          nav('households');
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 12H5" />
                          <path d="M12 19l-7-7 7-7" />
                        </svg>
                        Back to Households
                      </button>
                    </div>

                    <div className="fp" style={{ padding: '24px' }}>
                      {/* Form Header */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        marginBottom: '24px',
                        paddingBottom: '16px',
                        borderBottom: '2px solid var(--border)'
                      }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>
                            Edit Household
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            Update household information
                          </div>
                        </div>
                      </div>

                      <form onSubmit={submitEditHousehold}>
                        {/* Household ID - Read Only */}
                        <div className="fg" style={{ marginBottom: '16px' }}>
                          <label className="fl" style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>
                            Household ID
                          </label>
                          <div style={{
                            padding: '10px 12px',
                            background: 'var(--surface2)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            fontFamily: 'var(--mono)',
                            fontSize: '13px',
                            color: 'var(--text)',
                            opacity: 0.7
                          }}>
                            {selectedHouseholdId || 'N/A'}
                          </div>
                        </div>

                        {/* Head of Family */}
                        <div className="fg" style={{ marginBottom: '16px' }}>
                          <label className="fl" style={{ fontSize: '12px', fontWeight: '600' }}>
                            Head of Family
                            <span style={{ color: 'var(--red)', marginLeft: '4px' }}>*</span>
                          </label>
                          <input
                            className="fc"
                            placeholder="Lastname, Firstname Middle Initial"
                            value={householdForm.head}
                            onChange={(e) => setHouseholdForm({ ...householdForm, head: e.target.value })}
                            required
                            style={{ padding: '10px 12px' }}
                          />
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                            Format: Santos, Juan B.
                          </div>
                        </div>

                        {/* Complete Address */}
                        <div className="fg" style={{ marginBottom: '16px' }}>
                          <label className="fl" style={{ fontSize: '12px', fontWeight: '600' }}>
                            Complete Address
                            <span style={{ color: 'var(--red)', marginLeft: '4px' }}>*</span>
                          </label>
                          <input
                            className="fc"
                            placeholder="No. 3, Mabini Avenue"
                            value={householdForm.address}
                            onChange={(e) => setHouseholdForm({ ...householdForm, address: e.target.value })}
                            required
                            style={{ padding: '10px 12px' }}
                          />
                        </div>

                        {/* Purok Assignment */}
                        <div className="fg" style={{ marginBottom: '24px' }}>
                          <label className="fl" style={{ fontSize: '12px', fontWeight: '600' }}>
                            Purok Assignment
                            <span style={{ color: 'var(--red)', marginLeft: '4px' }}>*</span>
                          </label>
                          <select
                            className="fc"
                            value={householdForm.purok}
                            onChange={(e) => setHouseholdForm({ ...householdForm, purok: e.target.value })}
                            required
                            style={{ padding: '10px 12px' }}
                          >
                            <option value="">-- Select Purok --</option>
                            <option value="Purok 1">Purok 1</option>
                            <option value="Purok 2">Purok 2</option>
                            <option value="Purok 3">Purok 3</option>
                            <option value="Purok 4">Purok 4</option>
                            <option value="Purok 5">Purok 5</option>
                            <option value="Purok 6">Purok 6</option>
                          </select>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ 
                          display: 'flex', 
                          gap: '12px', 
                          justifyContent: 'flex-end',
                          paddingTop: '16px',
                          borderTop: '1px solid var(--border)'
                        }}>
                          <button
                            type="button"
                            className="btn btn-g"
                            onClick={() => {
                              setHouseholdForm(EMPTY_HOUSEHOLD);
                              setSelectedHouseholdId(null);
                              nav('households');
                            }}
                            style={{ padding: '10px 20px' }}
                          >
                            Cancel
                          </button>
                         <button 
                          type="submit" 
                          className="btn btn-p" 
                          disabled={saving}
                          style={{ 
                            padding: '10px 24px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            opacity: saving ? 0.7 : 1,
                            cursor: saving ? 'wait' : 'pointer'
                          }}
                        >
                          {saving ? (
                            <>
                              <span style={{ 
                                display: 'inline-block', 
                                width: '16px', 
                                height: '16px', 
                                border: '2px solid rgba(255,255,255,0.3)', 
                                borderTopColor: '#fff', 
                                borderRadius: '50%', 
                                animation: 'spin 0.6s linear infinite' 
                              }} />
                              Saving...
                            </>
                          ) : (
                            <>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                                <polyline points="7 3 7 8 12 8" />
                              </svg>
                              Save Changes
                            </>
                          )}
                        </button>
                        </div>
                      </form>
                    </div>

                    {/* Additional Info Card */}
                    <div className="card" style={{ 
                      marginTop: '16px', 
                      padding: '16px',
                      background: 'var(--surface2)'
                    }}>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
                        <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '6px' }}>
                          Quick Tips:
                        </strong>
                        • Make sure the Head of Family name matches the resident registry<br/>
                        • Purok assignment affects statistical reports and aid distribution<br/>
                        • Address should be complete for proper documentation
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* ════════════════════════════════════════
                SCREEN: MANAGE HOUSEHOLDS
                ════════════════════════════════════════ */}
                {screen === 'households' && (
  <div className="screen active">
    <div className="tw" style={{ borderRadius: '8px' }}>
      <div className="tb">
        <div className="sb-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
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
            <option key={purok} value={purok}>{purok}</option>
          ))}
        </select>
        <button
          className="btn btn-p btn-sm"
          onClick={() => {
            setHouseholdForm(EMPTY_HOUSEHOLD);
            setSelectedHouseholdId(null);
            nav('add-household');
          }}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Household
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Head of Family</th>
            <th
              className="sortable"
              onClick={() => {
                if (addressSortOrder === 'none') setAddressSortOrder('asc');
                else if (addressSortOrder === 'asc') setAddressSortOrder('desc');
                else setAddressSortOrder('none');
              }}
            >
              ADDRESS{' '}
              {addressSortOrder === 'asc' ? '▲' : addressSortOrder === 'desc' ? '▼' : '↕'}
            </th>
            <th>Purok</th>
            <th>Members</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredHouseholds.length === 0 ? (
            <tr>
              <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                No households found matching your search.
              </td>
            </tr>
          ) : (
            filteredHouseholds.map((h) => (
              <tr key={h.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{h.id}</td>
                <td style={{ fontWeight: 600 }}>{h.head}</td>
                <td>{h.address}</td>
                <td>
                  <span className={`badge ${h.purokClass}`}>{h.purok}</span>
                </td>
                <td>{h.members}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    className="btn btn-g btn-sm"
                    onClick={() => {
                      setSelectedHouseholdId(h.id);
                      nav('view-household');
                    }}
                    style={{ marginRight: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    View
                  </button>
                  <button
                    className="btn btn-a btn-sm"
                    onClick={() => {
                      setSelectedHouseholdId(h.id);
                      nav('edit-household');
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit
                  </button>
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
                SCREEN: VIEW HOUSEHOLD PROFILE
                ════════════════════════════════════════ */}
                {screen === 'view-household' && (
                  <div className="screen active">
                    {/* Header */}
                    <div className="ph">
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

                    {/* Two-Column Layout */}
                    <div className="tc" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                      {/* Left Column: Household Metadata */}
                      <div
                        className="card"
                        style={{
                          padding: '16px',
                          height: 'fit-content'
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 'bold',
                            marginBottom: '14px',
                            color: 'var(--accent)',
                            borderBottom: '1px solid var(--border)',
                            paddingBottom: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                            <path d="M12 18v-6" />
                            <path d="M9 15h6" />
                          </svg>
                          Registration Specs
                        </div>

                        <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                          <div style={{ color: 'var(--muted)', marginBottom: '2px' }}>Household Head:</div>
                          <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--text)' }}>{hh.head}</div>
                        </div>

                        <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                          <div style={{ color: 'var(--muted)', marginBottom: '2px' }}>Barangay Address:</div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>{hh.address}</div>
                        </div>

                        <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                          <div style={{ color: 'var(--muted)', marginBottom: '2px' }}>Jurisdiction Area:</div>
                          <span className={`badge ${hh.purokClass}`}>{hh.purok}</span>
                        </div>

                        <div style={{ fontSize: '13px' }}>
                          <div style={{ color: 'var(--muted)', marginBottom: '2px' }}>Declared Members Count:</div>
                          <div style={{ fontWeight: 'bold', color: 'var(--amber)' }}>{hh.members} individuals</div>
                        </div>
                      </div>

                      {/* Right Column: Family Roster */}
                      <div
                        className="card"
                        style={{ padding: '16px' }}
                      >
                        <div
                          style={{
                            fontWeight: 'bold',
                            marginBottom: '12px',
                            color: 'var(--green)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                            </svg>
                            Dynamic Family Roster ({familyMembers.length})
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            Cross-referenced from Resident Registry
                          </span>
                        </div>

                        {familyMembers.length === 0 ? (
                          <div
                            style={{
                              padding: '24px',
                              textAlign: 'center',
                              color: 'var(--muted)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '12px'
                            }}
                          >
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                            </svg>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text)' }}>
                                No Members Found
                              </div>
                              <div style={{ fontSize: '12px' }}>
                                No individuals are currently linked to this Household ID.
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="tw"
                            style={{
                              borderRadius: '6px',
                              overflow: 'hidden',
                              marginBottom: 0
                            }}
                          >
                            <table style={{ width: '100%' }}>
                              <thead>
                                <tr>
                                  <th style={{ fontFamily: 'var(--mono)', fontSize: '11px', padding: '10px 12px', textAlign: 'left' }}>
                                    ID
                                  </th>
                                  <th style={{ fontSize: '11px', padding: '10px 12px', textAlign: 'left' }}>Name</th>
                                  <th style={{ fontSize: '11px', padding: '10px 12px', textAlign: 'left' }}>Age</th>
                                  <th style={{ fontSize: '11px', padding: '10px 12px', textAlign: 'left' }}>Civil Status</th>
                                  <th style={{ fontSize: '11px', padding: '10px 12px', textAlign: 'left' }}>Voter</th>
                                </tr>
                              </thead>
                              <tbody>
                                {familyMembers.map((member) => (
                                  <tr
                                    key={member.id}
                                    style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                    onClick={() => {
                                      setSelectedResidentId(member.id);
                                      nav('view-resident');
                                    }}
                                  >
                                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)', padding: '10px 12px' }}>
                                      {member.id}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                      <strong>{member.name}</strong>
                                    </td>
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
                )}
          
            {/* ════════════════════════════════════════
                SCREEN: CERTIFICATE REQUEST
                ════════════════════════════════════════ */}
                {screen === 'cert-req' && (
                  <div className="screen active">
                    <CertificateLifecycle />
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
                  <CertPrintScreen 
                    approvedCertificates={approvedCertificates}
                    selectedCertificate={selectedCertificate}
                    setSelectedCertificate={setSelectedCertificate}
                    issuanceMeta={issuanceMeta}
                    setIssuanceMeta={setIssuanceMeta}
                    blotterVerifyQuery={blotterVerifyQuery}
                    setBlotterVerifyQuery={setBlotterVerifyQuery}
                    blotterMatches={blotterMatches}
                    handlePrintFormat={handlePrintFormat}
                    handleSaveOnly={handleSaveOnly}
                    handlePrintDocument={handlePrintDocument}
                    issuedCertificates={issuedCertificates}
                    showPrintModal={showPrintModal}
                    setShowPrintModal={setShowPrintModal}
                    selectedPrintCert={selectedPrintCert}
                    setSelectedPrintCert={setSelectedPrintCert}
                    printMode={printMode}
                    setPrintMode={setPrintMode}
                    showToast={showToast}
                  />
                )}

            {/* ════════════════════════════════════════
                SCREEN: BARANGAY CLEARANCE (INDIVIDUAL)
                ════════════════════════════════════════ */}
                {screen === 'brgy_clearance' && (
                  <div className="screen active">
                    {/* ── CLEARANCE DATA CAPTURE FORM ─ */}
                    <form onSubmit={handleSaveClearance}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                        
                        {/* LEFT COLUMN: RESIDENT & BLOTTER VERIFICATION */}
                        <div className="fp" style={{ margin: 0, padding: '24px' }}>
                          <div className="fp-t" style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            APPLICANT & BLOTTER VERIFICATION
                          </div>
                          
                          <div className="fg2" style={{ marginBottom: '16px' }}>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">CLEARANCE NO. *</label>
                              <input type="text" className="fc" readOnly style={{ fontWeight: '700', background: 'var(--surface2)', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }} value={clearanceForm.clearanceNo} />
                            </div>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">DATE ISSUED</label>
                              <input type="date" className="fc" value={clearanceForm.dateIssued} onChange={(e) => setClearanceForm({ ...clearanceForm, dateIssued: e.target.value })} />
                            </div>
                          </div>

                          <div className="fg" style={{ marginBottom: '16px' }}>
                            <label className="fl">RESIDENT FULL NAME (LAST NAME, FIRST NAME MIDDLE) *</label>
                            <input type="text" className="fc" required placeholder="e.g. PANIZAL, JOAN REBUSQUILLO" value={clearanceForm.fullName} onChange={(e) => setClearanceForm({ ...clearanceForm, fullName: e.target.value })} style={{ textTransform: 'uppercase' }} />
                          </div>

                          <div className="fg" style={{ marginBottom: '16px' }}>
                            <label className="fl">PURPOSE OF CLEARANCE *</label>
                            <input type="text" className="fc" required placeholder="e.g. Employment Requirement" value={clearanceForm.purpose} onChange={(e) => setClearanceForm({ ...clearanceForm, purpose: e.target.value.toUpperCase() })} />
                          </div>

                          <div className="fg2" style={{ marginBottom: '20px' }}>
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
                          <div style={{ padding: '16px', borderRadius: '10px', background: clearanceForm.hasBlotterRecord ? 'rgba(248, 113, 113, 0.08)' : 'rgba(52, 211, 153, 0.08)', border: `1.5px solid ${clearanceForm.hasBlotterRecord ? 'rgba(248, 113, 113, 0.3)' : 'rgba(52, 211, 153, 0.3)'}`, transition: 'all 0.3s ease' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {clearanceForm.hasBlotterRecord ? (
                                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(248, 113, 113, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5">
                                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                      <line x1="12" y1="9" x2="12" y2="13"/>
                                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                  </div>
                                ) : (
                                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(52, 211, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
                                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                      <polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                  </div>
                                )}
                                <span style={{ fontSize: '13px', fontWeight: 700, color: clearanceForm.hasBlotterRecord ? '#f87171' : '#34d399' }}>
                                  Blotter Record Status
                                </span>
                              </div>
                              <label style={{ fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, userSelect: 'none', padding: '6px 12px', borderRadius: '6px', background: 'var(--surface2)' }}>
                                <input type="checkbox" checked={clearanceForm.hasBlotterRecord} onChange={(e) => setClearanceForm({ ...clearanceForm, hasBlotterRecord: e.target.checked, remarks: e.target.checked ? 'With Active Blotter Case' : 'No Derogatory Record' })} />
                                <span>With Blotter</span>
                              </label>
                            </div>
                            <div style={{ fontSize: '12px', color: clearanceForm.hasBlotterRecord ? '#f87171' : '#34d399', paddingLeft: '42px', lineHeight: '1.6', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: clearanceForm.hasBlotterRecord ? '#f87171' : '#34d399', display: 'inline-block' }} />
                              {clearanceForm.hasBlotterRecord ? 'Warning: Applicant has pending blotter entries' : 'Verified: Clean record on local blotter masterlist'}
                            </div>
                          </div>
                        </div>

                        {/* RIGHT COLUMN: RECEIPT, CTC & SIGNATORIES */}
                        <div className="fp" style={{ margin: 0, padding: '24px' }}>
                          <div className="fp-t" style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                            RECEIPT, CTC & SIGNATORIES
                          </div>

                          {/* O.R. DETAILS */}
                          <div className="fg2" style={{ marginBottom: '20px' }}>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">O.R. NUMBER</label>
                              <input type="text" className="fc" placeholder="e.g. 1234567" value={clearanceForm.orNo} onChange={(e) => setClearanceForm({ ...clearanceForm, orNo: e.target.value })} style={{ fontFamily: 'var(--mono)' }} />
                            </div>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">CLEARANCE FEE (₱)</label>
                              <input type="number" className="fc" value={clearanceForm.amtPaid} onChange={(e) => setClearanceForm({ ...clearanceForm, amtPaid: e.target.value })} />
                            </div>
                          </div>

                          {/* CTC DETAILS SECTION */}
                          <div style={{ border: '2px dashed var(--border)', padding: '18px', borderRadius: '10px', background: 'var(--surface2)', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                                COMMUNITY TAX CERTIFICATE (CTC)
                              </span>
                              <button type="button" className="btn btn-p" style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setShowCtcModal(true)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <line x1="12" y1="5" x2="12" y2="19" />
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Add CTC
                              </button>
                            </div>
                            <div className="fg2" style={{ marginBottom: '12px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">CTC NO.</label>
                                <input type="text" className="fc" placeholder="e.g. CTC-00981" value={clearanceForm.ctcNo} onChange={(e) => setClearanceForm({ ...clearanceForm, ctcNo: e.target.value })} style={{ fontFamily: 'var(--mono)' }} />
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
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '32px', padding: '20px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        
                        {/* Clear Form Button */}
                        <button 
                          type="button" 
                          className="btn btn-g" 
                          onClick={resetClearanceForm} 
                          disabled={isSavingClearance}
                          style={{ padding: '12px 24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', opacity: isSavingClearance ? 0.6 : 1 }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                          </svg>
                          Clear Form
                        </button>

                        <button 
                          type="submit" 
                          className="btn btn-p" 
                          disabled={isSavingClearance}
                          style={{ 
                            padding: '12px 28px', 
                            fontWeight: 700, 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                            opacity: isSavingClearance ? 0.7 : 1,
                            cursor: isSavingClearance ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {isSavingClearance ? (
                            <>
                              {/* Loading Spinner */}
                              <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                              Saving...
                            </>
                          ) : (
                            <>
                              {/* Normal Icon */}
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                                <polyline points="7 3 7 8 15 8" />
                              </svg>
                              Save & Issue Clearance
                            </>
                          )}
                        </button>
                      </div>
                    </form>

                    {/* ─ REGISTERED BARANGAY CLEARANCES MASTERLIST TABLE ── */}
                    <div className="tw" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginTop: '20px' }}>
                      {/* Table Header / Toolbar */}
                      <div style={{ padding: '20px 24px', background: 'var(--surface2)', borderBottom: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                          Issued Individual Barangay Clearances
                          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500, background: 'var(--surface)', padding: '4px 12px', borderRadius: '20px', border: '1px solid var(--border)' }}>
                            {filteredClearances.length} of {clearanceList.length}
                          </span>
                        </h4>
                        
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button 
                            type="button" 
                            className="btn btn-g" 
                            onClick={() => handleGenerateExcelReport('clearances')} 
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '42px', fontSize: '13px', fontWeight: 600 }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <path d="M7 10l5 5 5-5" />
                              <path d="M12 15V3" />
                            </svg>
                            Export Excel
                          </button>
                          
                          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                              <circle cx="11" cy="11" r="8" />
                              <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input 
                              type="text" 
                              className="fc" 
                              placeholder="Search clearance no., name, purpose..." 
                              value={clearanceSearch} 
                              onChange={(e) => setClearanceSearch(e.target.value)} 
                              style={{ paddingLeft: '44px', paddingRight: '14px', height: '42px', borderRadius: '8px', border: '1.5px solid var(--border)', fontWeight: 500, width: '100%' }} 
                            />
                          </div>
                        </div>
                      </div>

                      {/* Table Content with Scroll */}
                      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '65vh' }}>
                        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                            <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                              <th style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>Clearance No.</th>
                              <th style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Resident Full Name</th>
                              <th style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Purpose</th>
                              <th style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Date Issued</th>
                              <th style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>O.R. No.</th>
                              <th style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'right' }}>Amount</th>
                              <th style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredClearances.length === 0 ? (
                              <tr>
                                <td colSpan="7" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" style={{ opacity: 0.6 }}>
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <path d="M14 2v6h6" />
                                        <path d="M12 18v-6" />
                                        <path d="M9 15h6" />
                                      </svg>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px', color: 'var(--text)' }}>
                                        {clearanceList.length === 0 ? 'No Clearances Found' : 'No Results Found'}
                                      </div>
                                      <div style={{ fontSize: '13px', opacity: 0.8 }}>
                                        {clearanceList.length === 0 ? 'No individual barangay clearances found in database' : 'No clearances match your search criteria'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              filteredClearances.map((rec) => (
                                <tr 
                                  key={rec._id} 
                                  style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s ease' }} 
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface2)'; }} 
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  <td style={{ padding: '16px 20px', fontWeight: '700', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)' }}>{rec.clearanceNo}</td>
                                  <td style={{ padding: '16px 20px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text)' }}>{rec.fullName}</td>
                                  <td style={{ padding: '16px 20px', color: 'var(--text)' }}>{rec.purpose}</td>
                                  <td style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{rec.dateIssued}</td>
                                  <td style={{ padding: '16px 20px', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--muted)' }}>{rec.orNo || '—'}</td>
                                  <td style={{ padding: '16px 20px', fontWeight: 700, textAlign: 'right', color: 'var(--green)', fontFamily: 'var(--mono)' }}>₱{parseFloat(rec.amtPaid || 0).toFixed(2)}</td>
                                  <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                      <button 
                                        type="button" 
                                        className="btn btn-g" 
                                        style={{ padding: '8px 14px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }} 
                                        onClick={() => handleEditClearance(rec)}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                        Edit
                                      </button>
                                      <button 
                                        type="button" 
                                        className="btn btn-p" 
                                        style={{ padding: '8px 14px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }} 
                                        onClick={() => handlePrintClearance(rec)}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <polyline points="6 9 6 2 18 2 18 9" />
                                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                          <rect x="6" y="14" width="12" height="8" />
                                        </svg>
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
                    <form onSubmit={handleSaveBusinessClearance} noValidate>
                      
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
                                <input type="text" className="fc" value={businessForm.lastName} onChange={(e) => setBusinessForm({ ...businessForm, lastName: e.target.value.toUpperCase() })} />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">FIRST NAME *</label>
                                <input type="text" className="fc" value={businessForm.firstName} onChange={(e) => setBusinessForm({ ...businessForm, firstName: e.target.value.toUpperCase() })} />
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
                              <input type="text" className="fc" placeholder="e.g. Bustrac Convenience Store" value={businessForm.businessName} onChange={(e) => setBusinessForm({ ...businessForm, businessName: e.target.value.toUpperCase() })} />
                            </div>

                            <div className="fg3" style={{ marginBottom: '10px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">NATURE OF BUSINESS</label>
                                <input type="text" className="fc" placeholder="Retail / Wholesale" value={businessForm.natureOfBusiness} onChange={(e) => setBusinessForm({ ...businessForm, natureOfBusiness: e.target.value.toUpperCase() })} />
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
                          <button 
                            type="button" 
                            className="btn btn-g" 
                            onClick={() => showToast('Draft saving feature is coming soon!', 'info')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          > 
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                              <polyline points="17 21 17 13 7 13 7 21" />
                              <polyline points="7 3 7 8 15 8" />
                            </svg>
                            Save as Draft 
                          </button>

                          <button 
                            type="button" 
                            className="btn btn-g" 
                            onClick={() => {
                              if (businessForm.businessName.trim() || businessForm.lastName.trim() || businessForm.firstName.trim()) {
                                if (window.confirm('Are you sure you want to cancel? All unsaved data will be lost.')) {
                                  resetBusinessForm();
                                }
                              } else {
                                resetBusinessForm();
                              }
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            Cancel
                          </button>

                          {/* NEXT BUTTON (Auto-disabled kung kulang ang required fields) */}
                          <button 
                            type="button" 
                            className="btn btn-p" 
                            disabled={!businessForm.businessName?.trim() || !businessForm.lastName?.trim() || !businessForm.firstName?.trim()} 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              opacity: (!businessForm.businessName?.trim() || !businessForm.lastName?.trim() || !businessForm.firstName?.trim()) ? 0.5 : 1, 
                              cursor: (!businessForm.businessName?.trim() || !businessForm.lastName?.trim() || !businessForm.firstName?.trim()) ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s ease'
                            }} 
                            onClick={() => setBusinessTab('page2')}
                          >
                            Next: O.R. & Assessment Details
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M5 12h14" />
                              <path d="M12 5l7 7-7 7" />
                            </svg>
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
                                <select 
                                  className="fc" 
                                  value={businessForm.secretary || settingsForm.luponSecretary || ''} 
                                  onChange={(e) => setBusinessForm({ ...businessForm, secretary: e.target.value })}
                                >
                                  <option>{settingsForm.luponSecretary || 'Barangay Secretary'}</option>
                                </select>
                              </div>
                              <div className="fg" style={{ marginBottom: '10px' }}>
                                <label className="fl">PUNONG BARANGAY</label>
                                <select 
                                  className="fc" 
                                  value={businessForm.captain || settingsForm.punongBarangay || ''} 
                                  onChange={(e) => setBusinessForm({ ...businessForm, captain: e.target.value })}
                                >
                                  <option>{settingsForm.punongBarangay || 'Punong Barangay'}</option>
                                </select>
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">PERMIT VALIDITY / EXPIRATION</label>
                                <input type="text" className="fc" readOnly value="Valid until December 31, 2026" />
                              </div>
                            </div>
                          </div>

                          {/* ACTION BUTTONS (PAGE 2) */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                            {/* Back to Page 1 Button */}
                            <button 
                              type="button" 
                              className="btn btn-g" 
                              onClick={() => setBusinessTab('page1')}
                              style={{ padding: '12px 24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 12H5" />
                                <path d="M12 19l-7-7 7-7" />
                              </svg>
                              Back to Page 1
                            </button>

                            {/* Clear Form Button */}
                            <button 
                              type="button" 
                              className="btn btn-g" 
                              onClick={() => {
                                if (businessForm.businessName.trim() || businessForm.lastName.trim() || businessForm.firstName.trim()) {
                                  if (window.confirm('Are you sure you want to clear the form? All unsaved data will be lost.')) {
                                    resetBusinessForm();
                                  }
                                } else {
                                  resetBusinessForm(); 
                                }
                              }} 
                              style={{ padding: '12px 24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="1 4 1 10 7 10" />
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                              </svg> 
                              Clear Form 
                            </button>

                            <button 
                              type="submit" 
                              className="btn btn-p" 
                              disabled={isSavingBusiness} 
                              style={{ 
                                padding: '12px 28px', 
                                fontWeight: 700, 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', 
                                opacity: isSavingBusiness ? 0.7 : 1, 
                                cursor: isSavingBusiness ? 'not-allowed' : 'pointer', 
                                transition: 'all 0.2s ease' 
                              }}
                            >
                              {isSavingBusiness ? (
                                <>
                                  <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                                  {businessForm._id ? 'Updating...' : 'Saving...'}
                                </>
                              ) : (
                                <>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                    <polyline points="17 21 17 13 7 13 7 21" />
                                    <polyline points="7 3 7 8 15 8" />
                                  </svg>
                                  {businessForm._id ? 'Update Business Clearance' : 'Save & Issue Business Clearance'}
                                </>
                              )}
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
                         <button type="button" className="btn btn-g" onClick={() => handleGenerateExcelReport('business_clearances')} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', fontSize: '12px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <path d="M7 10l5 5 5-5" />
                            <path d="M12 15V3" />
                          </svg>
                          Export Excel
                        </button>
                      </div>
                      
                      
                      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '50vh' }}>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)' }}>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
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
                              businessMasterlist.map((rec, index) => (
                                <tr key={rec._id || rec.id || `bus-${index}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '8px', fontWeight: 'bold' }}>{rec.bcIdNo || 'N/A'}</td>
                                  <td style={{ padding: '8px' }}>{rec.businessName || 'N/A'}</td>
                                  <td style={{ padding: '8px' }}>
                                    {rec.ownerName || `${rec.lastName || ''}, ${rec.firstName || ''}`.replace(/^,\s*/, '') || 'N/A'}
                                  </td>
                                  <td style={{ padding: '8px' }}>{rec.natureOfBusiness || 'N/A'}</td>
                                  <td style={{ padding: '8px' }}>{rec.regDate || rec.dateIssued || 'N/A'}</td>
                                  <td style={{ padding: '8px' }}>{rec.orNo || rec.orNumber || 'N/A'}</td>
                                  <td style={{ padding: '8px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                      {/* Edit Button */}
                                      <button
                                        type="button"
                                        className="btn btn-g"
                                        style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (typeof handleEditBusinessClearance === 'function') {
                                            handleEditBusinessClearance(rec);
                                          }
                                        }}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                        Edit
                                      </button>

                                      {/* Print Button */}
                                      <button
                                        type="button"
                                        className="btn btn-p"
                                        style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handlePrintBusinessClearance(rec);
                                        }}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                          <rect x="6" y="14" width="12" height="8"></rect>
                                        </svg>
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
                SCREEN: DISTRIBUTION PROGRAMS
                ════════════════════════════════════════ */}
                {screen === 'programs' && (
                  <div className="screen active">
                    {showNewProgramForm && (
                      <form onSubmit={handleCreateProgram} className="form-card-glass" style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(79, 142, 247, 0.2)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          </svg>
                          Register New Distribution Campaign
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <div style={{ flex: 2, minWidth: '200px' }}>
                            <label style={{ fontSize: '11px', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>Program Title</label>
                            <input className="fc" required placeholder="e.g., Senior Citizen Cash Subsidy" value={newProgramTitle} onChange={(e) => setNewProgramTitle(e.target.value)} />
                          </div>
                          <div style={{ flex: 1, minWidth: '100px' }}>
                            <label style={{ fontSize: '11px', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>Target Beneficiaries</label>
                            <input className="fc" type="number" required min="1" value={newProgramTarget} onChange={(e) => setNewProgramTarget(e.target.value)} />
                          </div>
                          <div style={{ flex: 1, minWidth: '120px' }}>
                            <label style={{ fontSize: '11px', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>Initial Status</label>
                            <select className="fc" value={newProgramStatus} onChange={(e) => setNewProgramStatus(e.target.value)}>
                              <option value="Active">Active</option>
                              <option value="Upcoming">Upcoming</option>
                            </select>
                          </div>
                          <div>
                            <button type="submit" className="btn btn-p" style={{ height: '38px' }}>Save Program</button>
                          </div>
                        </div>
                      </form>
                    )}

                    {/* TOOLBAR: Search, Filter, Sort + Register Trigger */}
                    <div className="tb" style={{ background: 'rgba(26, 29, 36, 0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(79, 142, 247, 0.2)', marginBottom: '20px', gap: '10px', flexWrap: 'wrap', padding: '12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
                        <div className="sb-box" style={{ flex: 2, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                          </svg>
                          <input placeholder="Search campaign name, ID, or aid type..." value={programSearchQuery} onChange={(e) => setProgramSearchQuery(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <select className="fc" style={{ width: '130px' }} value={programStatusFilter} onChange={(e) => setProgramStatusFilter(e.target.value)}>
                            <option value="All">All Status</option>
                            <option value="Active">Active</option>
                            <option value="Upcoming">Upcoming</option>
                            <option value="Completed">Completed</option>
                            <option value="Archived">Archived</option>
                          </select>
                          <select className="fc" style={{ width: '160px' }} value={programSortOption} onChange={(e) => setProgramSortOption(e.target.value)}>
                            <option value="Newest">Newest Created</option>
                            <option value="Oldest">Oldest Created</option>
                            <option value="Alphabetical">Alphabetical (A-Z)</option>
                            <option value="MostBeneficiaries">Target Capacity</option>
                          </select>
                        </div>
                      </div>

                      <button
                        className="btn btn-p"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                        onClick={() => setShowNewProgramForm(!showNewProgramForm)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        {showNewProgramForm ? 'Close Form' : 'Register Program'}
                      </button>
                    </div>

                    {/* GRID DISPLAY */}
                    {processedPrograms.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px',  background: 'var(--surface)', borderRadius: '8px', color: '#94a3b8', border: '1px dashed rgba(79, 142, 247, 0.2)' }}>
                        Walang nakitang distribution programs na tumutugma sa iyong query o filter settings.
                      </div>
                    ) : (
                      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                        <div className="thc" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                          {processedPrograms.map((prog) => {
                            const percent = Math.min(100, Math.round((prog.current / prog.target) * 100)) || 0;
                            const readyToComplete = prog.status === 'Active' && percent >= 100;
                            let statusBadgeClass = "badge g";
                            if (prog.status === 'Completed') statusBadgeClass = "badge t";
                            else if (prog.status === 'Upcoming') statusBadgeClass = "badge a";
                            else if (prog.status === 'Archived') statusBadgeClass = "badge r";

                            return (
                              <div
                                className="card"
                                key={prog.id}
                                style={{
                                  border: readyToComplete ? '1px solid #10b981' : '1px solid rgba(79, 142, 247, 0.2)',
                                  boxShadow: readyToComplete ? '0 0 6px rgba(16, 185, 129, 0.2)' : 'none',
                                   background: 'var(--surface)',
                                  backdropFilter: 'blur(8px)',
                                  borderRadius: '8px',
                                  padding: '16px',
                                  position: 'relative'
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                                    <span className={statusBadgeClass}>{prog.status}</span>
                                    <span className="badge gr">{prog.dateLabel || 'Campaign'}</span>
                                  </div>
                                  <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--text)', marginBottom: '4px' }}>{prog.title}</div>
                                  <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>{prog.id}</div>

                                  {/* NEW: Ready-to-complete hint */}
                                  {readyToComplete && (
                                    <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      Target reached — ready to mark Complete
                                    </div>
                                  )}

                                  {/* Progress Bar */}
                                  <div style={{ margin: '10px 0', background: '#334155', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                                    <div style={{ width: `${percent}%`, height: '100%', background: readyToComplete ? '#10b981' : prog.status === 'Completed' ? '#10b981' : prog.status === 'Upcoming' ? '#64748b' : '#3b82f6' }} />
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{prog.current} / {prog.target} targets</span>
                                    <strong>{percent}%</strong>
                                  </div>
                                </div>

                                {/* Compact action row */}
                                <div style={{ display: 'flex', gap: '6px', marginTop: '16px', borderTop: '1px solid rgba(79, 142, 247, 0.2)', paddingTop: '12px', alignItems: 'center' }}>
                                  {prog.status === 'Active' && (
                                  <>
                                    <button className="btn btn-p btn-sm" onClick={() => nav('aid-encode')}>Encode</button>
                                    <button className="btn btn-g btn-sm" onClick={() => nav('aid-logs')}>Logs</button>

                                    {readyToComplete && (
                                      <button
                                        className="btn btn-sm"
                                        style={{ background: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => {
                                          const updated = programsList.map(p => p.id === prog.id ? { ...p, status: 'Completed' } : p);
                                          setProgramsList(updated);
                                        }}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        Complete
                                      </button>
                                    )}

                                        {/* Kebab menu for secondary actions */}
                                        <div style={{ 
                                          position: 'relative', 
                                          marginLeft: 'auto',
                                          zIndex: 100 
                                        }}>
                                        {/* Kebab button */}
                                        <button 
                                          data-kebab-btn 
                                          className="btn btn-sm" 
                                          style={{ background: '#475569', color: '#cbd5e1', padding: '6px 10px', display: 'flex', alignItems: 'center', zIndex: 101 }} 
                                          onClick={() => setOpenActionMenu(openActionMenu === prog.id ? null : prog.id)}
                                        >
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                            <circle cx="12" cy="5" r="2" />
                                            <circle cx="12" cy="12" r="2" />
                                            <circle cx="12" cy="19" r="2" />
                                          </svg>
                                        </button>

                                        {/* Dropdown menu */}
                                      {openActionMenu === prog.id && (
                                      <div 
                                        data-kebab-menu 
                                        style={{ 
                                          position: 'absolute', 
                                          right: 0, 
                                          top: '100%',
                                          marginTop: '4px',
                                          background: 'var(--surface)', 
                                          border: '1px solid rgba(79, 142, 247, 0.3)', 
                                          borderRadius: '6px', 
                                          minWidth: '150px', 
                                          zIndex: 9999, 
                                          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', 
                                          overflow: 'hidden', 
                                          animation: 'dp-fadeIn 0.15s ease' 
                                        }}
                                      >
                                        {/* Edit Button */}
                                        <button 
                                          style={{ 
                                            width: '100%', 
                                            textAlign: 'left', 
                                            padding: '8px 12px', 
                                            background: 'transparent', 
                                            border: 'none', 
                                            color: '#f1f5f9', 
                                            cursor: 'pointer', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px', 
                                            fontSize: '12px',
                                            transition: 'background 0.15s ease'
                                          }}
                                          onClick={() => { 
                                            setEditingProgram(prog); 
                                            setOpenActionMenu(null); 
                                          }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(79, 142, 247, 0.1)'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                          </svg>
                                          Edit
                                        </button>

                                        {/* Mark Complete Button (only if not ready to complete) */}
                                        {!readyToComplete && (
                                          <button 
                                            style={{ 
                                              width: '100%', 
                                              textAlign: 'left', 
                                              padding: '8px 12px', 
                                              background: 'transparent', 
                                              border: 'none', 
                                              color: '#f1f5f9', 
                                              cursor: 'pointer', 
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              gap: '8px', 
                                              fontSize: '12px',
                                              transition: 'background 0.15s ease'
                                            }}
                                            onClick={() => { 
                                              const updated = programsList.map(p => 
                                                p.id === prog.id ? { ...p, status: 'Completed' } : p
                                              ); 
                                              setProgramsList(updated); 
                                              setOpenActionMenu(null); 
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(79, 142, 247, 0.1)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                            Mark Complete
                                          </button>
                                        )}

                                        {/* Archive Button */}
                                        <button 
                                          style={{ 
                                            width: '100%', 
                                            textAlign: 'left', 
                                            padding: '8px 12px', 
                                            background: 'transparent', 
                                            border: 'none', 
                                            color: '#f87171', 
                                            cursor: 'pointer', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px', 
                                            fontSize: '12px',
                                            transition: 'background 0.15s ease'
                                          }}
                                          onClick={async () => { 
                                            const updated = programsList.map(p => 
                                              p.id === prog.id ? { ...p, status: 'Archived' } : p
                                            ); 
                                            setProgramsList(updated); 
                                            setOpenActionMenu(null); 
                                            await createAuditLog({ 
                                              action: 'ARCHIVE', 
                                              module: 'PROGRAMS', 
                                              recordId: prog.id, 
                                              details: `Archived program: ${prog.title}` 
                                            }); 
                                          }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="21 8 21 21 3 21 3 8" />
                                            <rect x="1" y="3" width="22" height="5" />
                                            <line x1="10" y1="12" x2="14" y2="12" />
                                          </svg>
                                          Archive
                                        </button>
                                      </div>
                                    )}
                                        </div>
                                  </>
                                )}

                                  {prog.status === 'Upcoming' && (
                                    <>
                                      <button className="btn btn-p btn-sm" onClick={() => {
                                        const updated = programsList.map(p => p.id === prog.id ? { ...p, status: 'Active' } : p);
                                        setProgramsList(updated);
                                      }}>Activate</button>
                                      <button className="btn btn-a btn-sm" onClick={() => setEditingProgram(prog)}>Edit</button>
                                    </>
                                  )}
                                  
                                  {prog.status === 'Completed' && (
                                    <>
                                      <button 
                                        className="btn btn-p btn-sm" 
                                        style={{ background: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px' }} 
                                        onClick={() => setViewingProgram(prog)}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                          <circle cx="12" cy="12" r="3" />
                                        </svg>
                                        View
                                      </button>

                                      <button 
                                        className="btn btn-a btn-sm" 
                                        onClick={() => {
                                          const updated = programsList.map(p => 
                                            p.id === prog.id ? { ...p, status: 'Active' } : p
                                          );
                                          setProgramsList(updated);
                                          // Optional: Add audit log
                                          createAuditLog({
                                            action: 'REOPEN',
                                            module: 'PROGRAMS',
                                            recordId: prog.id,
                                            details: `Reopened completed program: ${prog.title}`
                                          });
                                        }}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                        Reopen
                                      </button>
                                    </>
                                  )}

                                  {prog.status === 'Archived' && (
                                    <>
                                      <button className="btn btn-p btn-sm" style={{ background: '#6366f1' }} onClick={() => setViewingProgram(prog)}>View</button>
                                      <button className="btn btn-g btn-sm" onClick={() => {
                                        const updated = programsList.map(p => p.id === prog.id ? { ...p, status: 'Active' } : p);
                                        setProgramsList(updated);
                                      }}>Restore</button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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
                      <label className="fl">
                        Relief Program <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <select
                        className="fc"
                        value={selectedProgramId}
                        style={{
                          border: (formAttempted && !selectedProgramId)
                            ? '1px solid var(--red)'
                            : undefined
                        }}
                        onChange={(e) => {
                          const progId = e.target.value;
                          setSelectedProgramId(progId);
                          const foundProg = programsList.find((p) => p.id === progId);
                          if (foundProg) {
                            setAidType(
                              foundProg.title.includes('Rice')
                                ? 'Rice — 5kg Pack'
                                : 'Financial / Cash Aid'
                            );
                          }
                        }}
                      >
                        <option value="" disabled hidden>
                          Select active relief program...
                        </option>
                        {programsList
                          .filter((prog) => prog.status === 'Active')
                          .map((prog) => {
                            const isFull = (prog.current || 0) >= (prog.target || 1);
                            return (
                              <option key={prog.id} value={prog.id} disabled={isFull}>
                                {prog.title} ({prog.id}) — {prog.current}/{prog.target}{' '}
                                {isFull ? '• FULL' : ''}
                              </option>
                            );
                          })}
                      </select>
                      
                      {/* Error message only shows after submit attempt */}
                      {formAttempted && !selectedProgramId && (
                        <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>
                          Please select a relief program to continue.
                        </div>
                      )}
                    </div>

                    {/* Beneficiary Resident Selector */}
                    <div className="fg">
                      <label className="fl">
                        Beneficiary Resident <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <ResidentCombobox
                        residents={residentsList}
                        value={selectedResidentId}
                        onChange={(res) => setSelectedResidentId(res ? res.id : '')}
                        placeholder="Search by name, resident ID, or purok..."
                      />
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

                      {/* Quantity Field */}
                      <div className="fg">
                        <label className="fl">Quantity <span style={{ color: 'var(--red)' }}>*</span></label>
                        <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface2)', height: '38px' }}>
                          <button
                            type="button"
                            onClick={() => setQuantity(prev => Math.max(1, (Number(prev) || 1) - 1))}
                            className="btn btn-g"
                            style={{ borderRadius: 0, border: 'none', borderRight: '1px solid var(--border)', padding: '0 12px', height: '100%' }}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            className="fc"
                            style={{ textAlign: 'center', border: 'none', background: 'transparent', boxShadow: 'none', height: '100%', padding: 0, MozAppearance: 'textfield' }}
                          />
                          <button
                            type="button"
                            onClick={() => setQuantity(prev => (Number(prev) || 0) + 1)}
                            className="btn btn-g"
                            style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--border)', padding: '0 12px', height: '100%' }}
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

                  {/* AID LOGS TABLE */}
                  <div>
                    <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      Recent Session Activity
                    </div>

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
                      <div className="sb-box">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"> <circle cx="11" cy="11" r="8" /> <path d="M21 21l-4.35-4.35" /> </svg>
                        <input 
                          placeholder="Search beneficiary or log ID..." 
                          value={logSearchQuery}
                          onChange={(e) => setLogSearchQuery(e.target.value)}
                        />
                      </div>
                      
                      {/* DYNAMIC PROGRAM FILTER DROPDOWN */}
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
                  <div className="fg2">
                    <div className="fg">
                      <label className="fl">
                        Resident <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <ResidentCombobox
                        residents={residentsList}
                        value={beneficiaryDraft.residentId}
                        onChange={(res) => setBeneficiaryDraft((prev) => ({
                          ...prev,
                          residentId: res ? res.id : '',
                          name: res ? res.name : '',
                        }))}
                      />
                    </div>

                    <div className="fg">
                      <label className="fl">Aid Type <span style={{ color: 'var(--red)' }}>*</span></label>
                      <input
                        className="fc"
                        value={beneficiaryDraft.aidType}
                        onChange={(e) => setBeneficiaryDraft((prev) => ({ ...prev, aidType: e.target.value }))}
                      />
                    </div>
                  </div>
     
                  <div className="fg2" style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    
                    {/* Quantity Field */}
                    <div className="fg">
                      <label className="fl">Quantity <span style={{ color: 'var(--red)' }}>*</span></label>
                      <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface2)', height: '38px' }}>
                        <button
                          type="button"
                          onClick={() => setBeneficiaryDraft(prev => ({ 
                            ...prev, 
                            qty: Math.max(1, (Number(prev.qty) || 1) - 1) 
                          }))}
                          className="btn btn-g"
                          style={{ borderRadius: 0, border: 'none', borderRight: '1px solid var(--border)', padding: '0 12px', height: '100%' }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={beneficiaryDraft.qty}
                          onChange={(e) => setBeneficiaryDraft(prev => ({ 
                            ...prev, 
                            qty: Math.max(1, parseInt(e.target.value) || 1) 
                          }))}
                          className="fc"
                          style={{ textAlign: 'center', border: 'none', background: 'transparent', boxShadow: 'none', height: '100%', padding: 0, MozAppearance: 'textfield' }}
                        />
                        <button
                          type="button"
                          onClick={() => setBeneficiaryDraft(prev => ({ 
                            ...prev, 
                            qty: (Number(prev.qty) || 0) + 1 
                          }))}
                          className="btn btn-g"
                          style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--border)', padding: '0 12px', height: '100%' }}
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
                          gap: '6px'
                        }}
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
                  <button
                    className="btn btn-p"
                    onClick={saveAll}
                    disabled={beneficiaryList.length === 0}
                    style={{ opacity: beneficiaryList.length === 0 ? 0.5 : 1, cursor: beneficiaryList.length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Save All Beneficiaries
                  </button>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: FILE BLOTTER ENTRY
                ════════════════════════════════════════ */}
              {screen === 'blotter-new' && (
              <div className="screen active" style={{ position: 'relative' }}>
                <form onSubmit={(e) => e.preventDefault()}>
                  {/* System Metadata - Header Panel */}
                  <div className="fp" style={{ marginBottom: '16px' }}>
                    <div className="fp-t">System Metadata (Read-Only)</div>
                    <div className="fg3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '8px' }}>
                      <div className="fg">
                        <label className="fl">Blotter Tracking No.</label>
                        <input 
                          className="fc" 
                          readOnly 
                          value={`BLT-2026-${String((blotterList?.length || 0) + 125).padStart(5, '0')}`} 
                          style={{ fontFamily: 'var(--mono)', fontWeight: 'bold', color: 'var(--accent)' }} 
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">Officer Handling Case</label>
                        <input className="fc" readOnly value="Juhairo Macabangon" />
                      </div>
                      <div className="fg">
                        <label className="fl">Date Logged</label>
                        <input className="fc" readOnly value={new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} />
                      </div>
                    </div>
                  </div>

                  {/* 2-Column Main Form Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    {/* LEFT COLUMN: Incident Parameters & Parties */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      
                      {/* Incident Parameters */}
                      <div className="fp" style={{ background: 'rgba(26, 29, 36, 0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(79, 142, 247, 0.2)', borderRadius: '8px', margin: 0 }}>
                        <div className="fp-t">Incident Parameters & Priority</div>
                        
                        <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
                          <div className="fg">
                            <label className="fl">Date of Incident <span style={{ color: 'var(--red)' }}>*</span></label>
                            <input 
                              className="fc" 
                              type="date" 
                              required 
                              value={blotterForm.date} 
                              onChange={(e) => setBlotterForm({ ...blotterForm, date: e.target.value })} 
                            />
                          </div>
                          <div className="fg">
                            <label className="fl">Time Matrix <span style={{ color: 'var(--red)' }}>*</span></label>
                            <input 
                              className="fc" 
                              type="time" 
                              required 
                              value={blotterForm.time} 
                              onChange={(e) => setBlotterForm({ ...blotterForm, time: e.target.value })} 
                            />
                          </div>
                        </div>

                        <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                          <div className="fg">
                            <label className="fl">Case Priority Rank</label>
                            <select className="fc" value={blotterForm.priority} onChange={(e) => setBlotterForm({ ...blotterForm, priority: e.target.value })}>
                              <option value="Low">Low Priority</option>
                              <option value="Medium">Medium Priority</option> <option value="High">High Priority</option>
                            </select>
                          </div>
                          <div className="fg">
                            <label className="fl">Incident Type Classification</label>
                            <select 
                              className="fc" 
                              value={blotterForm.type} 
                              onChange={(e) => {
                                const selectedType = e.target.value;
                                setBlotterForm({ 
                                  ...blotterForm, 
                                  type: selectedType, 
                                  isVawc: selectedType === 'Domestic Violence' ? true : blotterForm.isVawc 
                                });
                              }}
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
                        </div>

                        <div className="fg" style={{ marginTop: '12px' }}>
                          <label className="fl">Exact Location Address <span style={{ color: 'var(--red)' }}>*</span></label>
                          <input 
                            className="fc" 
                            required 
                            placeholder="e.g. Purok 5, near the public plaza" 
                            value={blotterForm.location} 
                            onChange={(e) => setBlotterForm({ ...blotterForm, location: e.target.value })} 
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: blotterForm.isVawc ? 'rgba(239, 68, 68, 0.15)' : 'var(--surface2)', border: blotterForm.isVawc ? '1px solid #ef4444' : '1px solid var(--border)', padding: '10px 12px', borderRadius: '6px', marginTop: '16px', transition: 'all 0.2s ease' }}>
                          <div>
                            <strong style={{ fontSize: '13px', display: 'block', color: blotterForm.isVawc ? '#fca5a5' : 'var(--text)' }}>
                              RA 9262 / VAWC Incident Flag
                            </strong>
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              Is this case related to Violence Against Women and Their Children?
                            </span>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>
                            <input 
                              type="checkbox" 
                              checked={blotterForm.isVawc || false} 
                              onChange={(e) => setBlotterForm({ ...blotterForm, isVawc: e.target.checked })} 
                            />
                            <span style={{ color: blotterForm.isVawc ? '#ef4444' : 'inherit' }}>
                              {blotterForm.isVawc ? 'FLAGGED AS VAWC' : 'Mark as VAWC'}
                            </span>
                          </label>
                        </div>
                      </div>

                      {/* Legal Parties Involved */}
                        <div className="fp" style={{ background: 'rgba(26, 29, 36, 0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(79, 142, 247, 0.2)', borderRadius: '8px', margin: 0 }}>
                          <div className="fp-t">Legal Parties Involved</div>
                          
                          {/* Complainant sa Tulong ni ResidentCombobox */}
                          <div className="fg" style={{ marginTop: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <label className="fl" style={{ margin: 0 }}>Complainant (Nagrereklamo) <span style={{ color: 'var(--red)' }}>*</span></label>
                              <label style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={blotterForm.isComplainantNonResident} onChange={(e) => setBlotterForm({ ...blotterForm, isComplainantNonResident: e.target.checked, complainant: '' })} /> Non-resident
                              </label>
                            </div>
                            {blotterForm.isComplainantNonResident ? (
                              <input className="fc" required placeholder="Enter full name of non-resident complainant" value={blotterForm.complainant} onChange={(e) => setBlotterForm({ ...blotterForm, complainant: e.target.value })} />
                            ) : (
                              <ResidentCombobox residents={residentsList} value={blotterForm.complainantId} placeholder="Search resident name, ID, or purok..." onChange={(selected) => { setBlotterForm({ ...blotterForm, complainant: selected ? selected.name : '', complainantId: selected ? selected.id : '', }); }} />
                            )}
                          </div>

                          {/* Respondent Field with Auto-Filled Email */}
                          <div className="fg" style={{ marginTop: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <label className="fl" style={{ margin: 0 }}>
                                Respondent (Inirereklamo) <span style={{ color: 'var(--red)' }}>*</span>
                              </label>
                              <label style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={blotterForm.isRespondentNonResident}
                                  onChange={(e) => setBlotterForm({
                                    ...blotterForm,
                                    isRespondentNonResident: e.target.checked,
                                    respondent: '',
                                    respondentEmail: ''
                                  })}
                                />
                                Non-resident
                              </label>
                            </div>

                            {blotterForm.isRespondentNonResident ? (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <input
                                  id="blotter-respondent"
                                  className="fc"
                                  required
                                  placeholder="Full name of non-resident respondent"
                                  value={blotterForm.respondent}
                                  onChange={(e) => setBlotterForm({ ...blotterForm, respondent: e.target.value })}
                                />
                                <input
                                  className="fc"
                                  type="email"
                                  placeholder="Respondent Email (for Summons)"
                                  value={blotterForm.respondentEmail || ''}
                                  onChange={(e) => setBlotterForm({ ...blotterForm, respondentEmail: e.target.value })}
                                />
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <ResidentCombobox
                                  residents={residentsList}
                                  value={blotterForm.respondentId}
                                  placeholder="Search resident name, ID, or purok..."
                                  onChange={(selected) => {
                                    const autoEmail = selected ? (selected.email || selected.contactEmail || '') : '';
                                    setBlotterForm({
                                      ...blotterForm,
                                      respondent: selected ? selected.name : '',
                                      respondentId: selected ? selected.id : '',
                                      respondentEmail: autoEmail || blotterForm.respondentEmail || ''
                                    });
                                  }}
                                />
                                <input
                                  className="fc"
                                  type="email"
                                  placeholder="Respondent Email (Auto-filled if available from Resident Profile)"
                                  value={blotterForm.respondentEmail || ''}
                                  onChange={(e) => setBlotterForm({ ...blotterForm, respondentEmail: e.target.value })}
                                />
                              </div>
                            )}
                          </div>

                          {/* Witnesses */}
                          <div className="fg" style={{ marginTop: '12px' }}>
                            <label className="fl">Witnesses Block (Optional)</label>
                            <input className="fc" placeholder="Comma-separated names" value={blotterForm.witnesses} onChange={(e) => setBlotterForm({ ...blotterForm, witnesses: e.target.value })} />
                          </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Case Narrative & Action */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div className="fp" style={{ background: 'rgba(26, 29, 36, 0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(79, 142, 247, 0.2)', borderRadius: '8px', margin: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div className="fp-t">Narrative & Executive Barangay Action</div>
                          
                          <div className="fg" style={{ marginTop: '8px' }}>
                            <label className="fl">Incident Narrative Report Statement <span style={{ color: 'var(--red)' }}>*</span></label>
                            <textarea 
                              className="fc" 
                              required 
                              style={{ minHeight: '140px' }} 
                              placeholder="Provide a detailed chronological presentation statement of the incident..." 
                              value={blotterForm.narrative} 
                              onChange={(e) => setBlotterForm({ ...blotterForm, narrative: e.target.value })} 
                            />
                          </div>

                          <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                            <div className="fg">
                              <label className="fl">Formal Action Taken</label>
                              <select className="fc" value={blotterForm.actionTaken} onChange={(e) => setBlotterForm({ ...blotterForm, actionTaken: e.target.value })}>
                                <option value="Summoned Parties">Summoned Parties</option>
                                <option value="Conducted Mediation">Conducted Mediation</option>
                                <option value="Issued Certification">Issued Certification to File Action</option>
                                <option value="Referred to PNP">Referred to PNP Authorities</option>
                                <option value="Referred to Lupon">Referred to Lupon Tagapamayapa</option>
                                <option value="Others">Others</option>
                              </select>
                            </div>
                            <div className="fg">
                              <label className="fl">Case Management Status</label>
                              <select className="fc" value={blotterForm.status} onChange={(e) => setBlotterForm({ ...blotterForm, status: e.target.value })}>
                                <option value="Open">Open (Pending Mediation)</option>
                                <option value="Under Mediation">Under Mediation Process</option>
                                <option value="Resolved">Resolved & Closed Case</option>
                                <option value="Referred to Higher Authority">Referred to Higher Authority</option>
                              </select>
                            </div>
                          </div>

                          {(blotterForm.status === 'Open' || blotterForm.status === 'Under Mediation') && (
                            <div className="fg" style={{ marginTop: '12px' }}>
                              <label className="fl">Next Mediation Hearing Date</label>
                              <input 
                                className="fc" 
                                type="date" 
                                value={blotterForm.nextHearingDate} 
                                onChange={(e) => setBlotterForm({ ...blotterForm, nextHearingDate: e.target.value })} 
                              />
                            </div>
                          )}

                          {/* Attachments Section */}
                          <div className="fg" style={{ marginTop: '12px' }}>
                            <label className="fl" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Evidence Attachments</span>
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {blotterForm.attachments?.length || 0} file(s) attached
                              </span>
                            </label>
                            <input type="file" id="blotter-file-input" multiple accept="image/*,.pdf,video/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                            
                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                              <button 
                                type="button" 
                                className="btn btn-g btn-sm" 
                                onClick={() => document.getElementById('blotter-file-input').click()}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                📎 Upload Media / Document
                              </button>
                            </div>

                            {blotterForm.attachments && blotterForm.attachments.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                                {blotterForm.attachments.map((att) => (
                                  <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                      <span style={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                        {att.name}
                                      </span>
                                      <span style={{ fontSize: '10px', color: 'var(--muted)' }}>({att.size})</span>
                                    </div>
                                    <button 
                                      type="button" 
                                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 4px', fontSize: '14px' }}
                                      onClick={() => {
                                        if (att.previewUrl && att.previewUrl.startsWith('blob:')) {
                                          URL.revokeObjectURL(att.previewUrl);
                                        }
                                        setBlotterForm((prev) => ({
                                          ...prev,
                                          attachments: prev.attachments.filter((item) => item.id !== att.id),
                                        }));
                                      }}
                                      title="Remove attachment"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Integrated Action Buttons */}
                        <div className="fa" style={{ display: 'flex', gap: '10px', marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                          <button 
                            type="button" 
                            className="btn btn-p" 
                            onClick={handleSaveBlotter} 
                            style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', cursor: 'pointer' }}
                          >
                            Save Blotter Case Record
                          </button>
                          <button type="button" className="btn" onClick={handleClearBlotterForm} style={{ flex: 1, background: 'rgba(71, 85, 105, 0.6)', color: '#e2e8f0', borderRadius: '6px' }}>
                            Clear
                          </button>
                          <button type="button" className="btn btn-g" style={{ flex: 1 }} onClick={() => nav('blotter-manage')}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: MANAGE BLOTTER
                ════════════════════════════════════════ */}
                {screen === 'blotter-manage' && (
                <div className="screen active">
                  <div className="tw">
                    {/* ── SEARCH, FILTERS & ACTIONS ROW ── */}
                    <div className="tb" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                      {/* Search Bar */}
                      <div className="sb-box" style={{ flex: '1 1 220px' }}>
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

                      {/* Type Filter */}
                      <select className="fc" style={{ width: '150px' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                        <option value="All Types">All Types</option>
                        <option value="Noise Complaint">Noise Complaint</option>
                        <option value="Physical Altercation">Physical Altercation</option>
                        <option value="Property Dispute">Property Dispute</option>
                        <option value="Domestic Concern">Domestic Concern</option>
                        <option value="Theft">Theft</option>
                        <option value="Other">Other</option>
                      </select>

                      {/* Status Filter */}
                      <select className="fc" style={{ width: '165px' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                        <option value="All Status">All Status</option>
                        <option value="Pending">Pending</option>
                        <option value="Open">Open</option>
                        <option value="Under Mediation">Under Mediation / Summons</option>
                        <option value="Resolved">Resolved / Settled</option>
                        <option value="Referred to Higher Authority">Referred / CFA</option>
                      </select>

                      {/* Date Filters */}
                      <input type="date" className="fc" style={{ width: '135px' }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From Date" />
                      <input type="date" className="fc" style={{ width: '135px' }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To Date" />

                      {/* VAWC Filter */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: 'var(--surface2)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <input type="checkbox" checked={filterVawc} onChange={(e) => setFilterVawc(e.target.checked)} />
                        <span>VAWC Only</span>
                      </label>

                      {/* Spacer */}
                      <div style={{ flex: '1 1 auto' }} />

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button className="btn btn-g" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9V2h12v7" />
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            <path d="M6 14h12v8H6z" />
                          </svg>
                          Export / Print Log
                        </button>
                        <button className="btn btn-p" onClick={() => nav('blotter-new')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          File New Entry
                        </button>
                      </div>
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
                          filteredBlotters.map((b) => {
                          let currentSummon = Number(b.summonCount || 0);
                          
                          if (currentSummon === 0 && b.status) {
                            const statusLower = b.status.toLowerCase();
                            if (statusLower.includes('1st summon')) currentSummon = 1;
                            else if (statusLower.includes('2nd summon')) currentSummon = 2;
                            else if (statusLower.includes('3rd summon')) currentSummon = 3;
                          }

                          const isSettled = b.status === 'Settled / Resolved' || b.status === 'Resolved' || b.status === 'Settled';
                          const isCfaIssued = b.cfaIssued || b.status === 'Referred to PNP (CFA Issued)' || b.status === 'Referred to Higher Authority';

                          return (
                            <tr key={b._id || b.id}>
                              <td style={mono10}>{b.id || b.trackingNo || b.refNumber || b._id}</td>
                              <td>{b.type || b.incidentType ? (b.type || b.incidentType).replace('_', ' ') : 'N/A'}</td>
                              <td><strong>{b.complainant || b.complainantName || 'N/A'}</strong></td>
                              <td>{b.respondent || b.respondentName || 'Under Investigation'}</td>
                              <td><strong>{b.location || b.purok || 'Brgy. Bustrac'}</strong></td>
                              <td style={{ fontSize: '11px' }}>{b.date || b.incidentDate || 'N/A'}</td>
                              <td>
                                <span className={`badge ${isSettled ? 'g' : isCfaIssued ? 'r' : 'a'}`}>
                                  {b.status}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                  <button 
                                    className="btn btn-g btn-sm" 
                                    onClick={() => {
                                      const caseId = b._id || b.id;
                                      setSelectedBlotterId(caseId);
                                      if (typeof setSelectedBlotter === 'function') setSelectedBlotter(b);
                                      if (typeof handleViewBlotter === 'function') handleViewBlotter(b);
                                      else nav('blotter-detail');
                                    }}
                                  >
                                    View
                                  </button>

                                  {!isSettled && !isCfaIssued && (
                                    <>
                                      {currentSummon === 0 && (
                                        <button 
                                          className="btn btn-primary btn-sm" 
                                          onClick={() => handleBlotterAction(b._id || b.id, '1st_summon')}
                                        >
                                          1st Summon
                                        </button>
                                      )}

                                      {currentSummon === 1 && (
                                        <button 
                                          className="btn btn-warning btn-sm" 
                                          onClick={() => handleBlotterAction(b._id || b.id, '2nd_summon')}
                                        >
                                          2nd Summon
                                        </button>
                                      )}

                                      {currentSummon === 2 && (
                                        <button 
                                          className="btn btn-warning btn-sm" 
                                          onClick={() => handleBlotterAction(b._id || b.id, '3rd_summon')}
                                        >
                                          3rd Summon
                                        </button>
                                      )}

                                      <button 
                                        className="btn btn-success btn-sm" 
                                        onClick={() => handleBlotterAction(b._id || b.id, 'settled')}
                                      >
                                        Settled
                                      </button>

                                      {currentSummon >= 3 && (
                                        <button 
                                          className="btn btn-danger btn-sm" 
                                          style={{ backgroundColor: '#dc2626', color: '#fff' }} 
                                          onClick={() => handleBlotterAction(b._id || b.id, 'escalate_cfa')}
                                        >
                                          Escalate / Issue CFA
                                        </button>
                                      )}
                                    </>
                                  )}

                                  {(isSettled || isCfaIssued) && (
                                    <button 
                                      className="btn btn-sm" 
                                      style={{ 
                                        backgroundColor: isCfaIssued ? '#7f1d1d' : '#047857', 
                                        color: '#ffffff', 
                                        fontWeight: 600, 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '5px' 
                                      }} 
                                      onClick={() => handleOpenPrint(b)}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M6 9V2h12v7" />
                                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                        <path d="M6 14h12v8H6z" />
                                      </svg>
                                      {isCfaIssued ? 'Print CFA' : 'Print Certificate'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                        )}
                      </tbody>
                    </table>

                    {/* ── RECORD COUNT & FILTER RESET ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '0 4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>
                        Showing <strong style={{ color: 'var(--text)' }}>{filteredBlotters.length}</strong> of <strong style={{ color: 'var(--text)' }}>{blotterList.length}</strong> records
                        {(filterType !== 'All Types' || filterStatus !== 'All Status' || blotterSearch || dateFrom || dateTo || filterVawc) && ' (filtered)'}
                      </span>
                      {(filterType !== 'All Types' || filterStatus !== 'All Status' || blotterSearch || dateFrom || dateTo || filterVawc) && (
                        <button 
                          className="btn btn-sm btn-g" 
                          onClick={() => {
                            setBlotterSearch('');
                            setFilterType('All Types');
                            setFilterStatus('All Status');
                            setDateFrom('');
                            setDateTo('');
                            setFilterVawc(false);
                          }} 
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* ════════════════════════════════════════
                SCREEN: BLOTTER DETAIL (DYNAMIC LOGIC ROUTE)
                ════════════════════════════════════════ */}
                {screen === 'blotter-detail' && (() => {
                  const currentCase = selectedBlotter || complaint || staffCase || {};

                  // Helper function para makuha ang Pangalan ng Party (Complainant / Respondent)
                  const getPartyName = (partyData, fallbackName) => {
                    if (typeof partyData === 'object' && partyData !== null) {
                      return partyData.name || partyData.fullName || fallbackName || '';
                    }
                    if (typeof partyData === 'string' && partyData.trim() !== '') {
                      return partyData;
                    }
                    return fallbackName || 'N/A';
                  };

                  // Helper function para makuha ang Resident ID
                  const getPartyId = (partyData, fallbackId) => {
                    if (typeof partyData === 'object' && partyData !== null) {
                      return partyData.id || partyData.residentId || fallbackId || 'Registered Resident';
                    }
                    return fallbackId || 'Registered Resident';
                  };

                  const complainantDisplayName = getPartyName(currentCase.complainant, currentCase.complainantName || currentCase.compName);
                  const respondentDisplayName = getPartyName(currentCase.respondent, currentCase.respondentName || currentCase.respName);
                  const caseNarrative = currentCase.narrative || currentCase.statement || currentCase.details || 'No narrative provided.';

                  return (
                    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* TWO-COLUMN LAYOUT */}
                      <div className="tc" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'stretch' }}>
                        
                        {/* LEFT COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {/* Case Information */}
                          <div className="fp">
                            <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              Case Information
                            </div>
                            <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            fontSize: '12px',
                            fontWeight: 700 
                          }}>
                            <span style={{ color: 'var(--muted)' }}>Current Status:</span>
                            {getStatusBadge(currentCase?.status || 'Open')}
                          </div>
                            <div className="fg2">
                              <div className="fg">
                                <label className="fl">Case Number</label>
                                <input 
                                  className="fc" 
                                  value={currentCase.trackingNo || currentCase.caseNum || currentCase._id || currentCase.id || selectedBlotterId || ''} 
                                  readOnly 
                                  style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }} 
                                />
                              </div>
                              <div className="fg">
                                <label className="fl">Current Status</label>
                                <select 
                                  className="fc" 
                                  value={currentCase.status || currentCase.caseStatus || 'Open'} 
                                  onChange={(e) => handleStatusDropdownChange(e.target.value)}
                                >
                                  <option value="Open">Open</option> <option value="1st Summon Issued">1st Summon Issued</option>
                                  <option value="2nd Summon Issued">2nd Summon Issued</option>
                                  <option value="3rd Summon Issued">3rd Summon Issued</option>
                                  <option value="Under Mediation">Under Mediation</option>
                                  <option value="Settled / Resolved">Settled / Resolved</option>
                                  <option value="Referred to PNP (CFA Issued)">Referred to PNP (CFA Issued)</option>
                                </select>
                              </div>
                            </div>
                            <div className="fg2">
                              <div className="fg">
                                <label className="fl">Date Filed</label>
                                <input className="fc" type="text" value={currentCase.dateFiled || currentCase.dateLogged || currentCase.date || ''} readOnly />
                              </div>
                              <div className="fg">
                                <label className="fl">Time Filed</label>
                                <input className="fc" type="text" value={currentCase.timeFiled || currentCase.incidentTime || currentCase.time || ''} readOnly />
                              </div>
                            </div>
                            <div className="fg">
                              <label className="fl">Incident Type</label>
                              <input className="fc" value={currentCase.incidentType || currentCase.type || 'N/A'} readOnly />
                            </div>
                            <div className="fg">
                              <label className="fl">Location of Incident</label>
                              <input className="fc" value={currentCase.location || ''} readOnly />
                            </div>
                          </div>

                          {/* Complainant Information */}
                          <div className="fp">
                            <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              Complainant Information
                            </div>
                            <div className="fg">
                              <label className="fl">Full Name</label>
                              <input className="fc" value={complainantDisplayName} readOnly />
                            </div>
                            <div className="fg2">
                              <div className="fg">
                                <label className="fl">Resident ID / Non-Resident</label>
                                <input 
                                  className="fc" 
                                  value={getPartyId(currentCase.complainant, currentCase.compID)} 
                                  readOnly 
                                  style={{ color: 'var(--muted)' }} 
                                />
                              </div>
                              <div className="fg">
                                <label className="fl">Verification</label>
                                <input 
                                  className="fc" 
                                  value={currentCase.complainant?.isNonResident ? 'External Party' : 'Verified Resident'} 
                                  readOnly 
                                  style={{ color: 'var(--muted)' }} 
                                />
                              </div>
                            </div>
                          </div>

                          {/* Narrative */}
                          <div className="fp" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              Incident Narrative
                            </div>
                            <div className="fg">
                              <label className="fl">Official Narrative Statement</label>
                              <textarea className="fc" rows={4} value={caseNarrative} readOnly />
                            </div>
                          </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {/* Respondent Information */}
                          <div className="fp">
                            <div className="fp-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              Respondent Information
                            </div>
                            <div className="fg">
                              <label className="fl">Full Name</label>
                              <input className="fc" value={respondentDisplayName} readOnly />
                            </div>
                            <div className="fg2">
                              <div className="fg">
                                <label className="fl">Resident ID / Non-Resident</label>
                                <input 
                                  className="fc" 
                                  value={getPartyId(currentCase.respondent, currentCase.respID)} 
                                  readOnly 
                                  style={{ color: 'var(--muted)' }} 
                                />
                              </div>
                              <div className="fg">
                                <label className="fl">Status</label>
                                <input 
                                  className="fc" 
                                  value={currentCase.respondent?.isNonResident ? 'External Party' : 'Verified Resident'} 
                                  readOnly 
                                  style={{ color: 'var(--muted)' }} 
                                />
                              </div>
                            </div>
                          </div>

                          {/* Summons & Hearing Panel */}
                          <SummonsPanel 
                            currentCase={currentCase} 
                            db={db} 
                            setBlotterList={setBlotterList} 
                          />

                          {/* Status Update Action Bar */}
                          <div className="fp" style={{ marginTop: '16px', padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text)' }}>
                            Case Resolution Actions
                          </div>
                          <CaseStatusActions currentCase={currentCase} db={db} setBlotterList={setBlotterList} />
                        </div>
                          

                        </div>
                      </div>

                      {/* FOOTER ACTION BAR */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid var(--border)', gap: 12 }}>
                        <button 
                          type="button" 
                          className="btn btn-g" 
                          onClick={() => nav('blotter-manage')} 
                          style={{ padding: '9px 16px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          ← Back to Blotter Roster
                        </button>
                      </div>
                    </div>
                  );
                })()}
            
            {/* ════════════════════════════════════════
                SCREEN: ANNOUNCEMENTS
                ════════════════════════════════════════ */}
                {screen === 'announcements' && (
                  <div className="screen active">
                    {/* LIST VIEW */}
                    {announcementSubScreen === 'list' && (
                      <div>
                        {/* Header with Add Button - INALIS NA ANG HEADER TEXT DITO */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px' }}>
                          <button 
                            type="button" 
                            className="btn btn-p" 
                            onClick={() => {
                              if (typeof handleOpenNewAnnouncement === 'function') {
                                handleOpenNewAnnouncement();
                              } else {
                                setAnnouncementForm({ title: '', category: 'General', content: '', pinned: false });
                                setAnnouncementSubScreen('new');
                              }
                            }}
                          >
                            + New Announcement
                          </button>
                        </div>

                        {/* Filters */}
                        <div className="fp" style={{ marginBottom: '20px', padding: '12px 16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                            <div className="fg" style={{ margin: 0 }}>
                              <label className="fl">Search</label>
                              <input
                                className="fc"
                                placeholder="Search by title or content..."
                                value={searchAnnQuery}
                                onChange={(e) => setSearchAnnQuery(e.target.value)}
                              />
                            </div>
                            <div className="fg" style={{ margin: 0 }}>
                              <label className="fl">Category</label>
                              <select className="fc" value={filterAnnCategory} onChange={(e) => setFilterAnnCategory(e.target.value)}>
                                <option value="All">All Categories</option>
                                <option value="General">General</option>
                                <option value="Health">Health</option>
                                <option value="Security">Security</option>
                                <option value="Events">Events</option>
                                <option value="Governance">Governance</option>
                              </select>
                            </div>
                            <div className="fg" style={{ margin: 0 }}>
                              <label className="fl">Status</label>
                              <select className="fc" value={filterAnnStatus} onChange={(e) => setFilterAnnStatus(e.target.value)}>
                                <option value="All">All Statuses</option>
                                <option value="Published">Published</option>
                                <option value="Draft">Drafts</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Announcement Cards List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {announcementsList
                            .slice()
                            .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
                            .filter((ann) => {
                              const title = String(ann.title || '').toLowerCase();
                              const content = String(ann.content || '').toLowerCase();
                              const q = searchAnnQuery.toLowerCase();
                              return (
                                (title.includes(q) || content.includes(q)) &&
                                (filterAnnCategory === 'All' || ann.category === filterAnnCategory) &&
                                (filterAnnStatus === 'All' || ann.status === filterAnnStatus)
                              );
                            })
                            .map((ann) => (
                              <div
                                key={ann.id || ann._id}
                                className="fp"
                                style={{
                                  margin: 0,
                                  background: ann.pinned ? 'rgba(79, 142, 247, 0.04)' : undefined,
                                  border: ann.pinned ? '1px solid rgba(79, 142, 247, 0.12)' : undefined,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                      {ann.pinned && (
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
                                           Pinned
                                        </span>
                                      )}
                                      <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {ann.category}
                                      </span>
                                      <span
                                        className={`badge ${ann.status === 'Published' ? 'g' : ''}`}
                                        style={{ fontSize: '10px' }}
                                      >
                                        {ann.status || 'Draft'}
                                      </span>
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '6px', lineHeight: 1.4 }}>
                                      {ann.title}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
                                      {ann.content || ann.body}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                      Posted by {ann.author || 'Administrator'}{ann.date ? ` · ${ann.date}` : ''}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, paddingTop: '2px' }}>
                                    <button className="btn btn-g btn-sm" onClick={() => handleTogglePinAnnouncement(ann.id || ann._id)}>
                                      {ann.pinned ? 'Unpin' : 'Pin'}
                                    </button>
                                    <button className="btn btn-g btn-sm" onClick={() => handleOpenEditAnnouncement(ann)}>
                                      Edit
                                    </button>
                                    <button className="btn btn-d btn-sm" onClick={() => handleTriggerDeleteAnnouncement(ann.id || ann._id)}>
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}

                          {/* Empty State */}
                          {announcementsList.filter((ann) => {
                            const title = String(ann.title || '').toLowerCase();
                            const content = String(ann.content || '').toLowerCase();
                            const q = searchAnnQuery.toLowerCase();
                            return (
                              (title.includes(q) || content.includes(q)) &&
                              (filterAnnCategory === 'All' || ann.category === filterAnnCategory) &&
                              (filterAnnStatus === 'All' || ann.status === filterAnnStatus)
                            );
                          }).length === 0 && (
                            <div className="fp" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
                              <div style={{ fontWeight: 600, marginBottom: '4px' }}>No announcements found</div>
                              <div style={{ fontSize: '12px' }}>Click "+ New Announcement" above to publish your first notice.</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* CREATE / EDIT FORM */}
                    {(announcementSubScreen === 'new' || announcementSubScreen === 'edit') && (
                      <div className="fp" style={{ maxWidth: '720px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                          <h3 style={{ margin: 0, fontSize: '18px' }}>
                            {announcementSubScreen === 'new' ? 'Create Announcement' : 'Edit Announcement'}
                          </h3>
                          <button type="button" className="btn btn-g" onClick={() => setAnnouncementSubScreen('list')}>
                            Back to List
                          </button>
                        </div>

                        <form onSubmit={(e) => handleSaveAnnouncement(e, 'Published')}>
                          <div className="fg">
                            <label className="fl">Title <span style={{ color: 'var(--red)' }}>*</span></label>
                            <input
                              className="fc"
                              required
                              placeholder="Enter announcement title"
                              value={announcementForm.title || ''}
                              onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="fg">
                              <label className="fl">Category</label>
                              <select
                                className="fc"
                                value={announcementForm.category || 'General'}
                                onChange={(e) =>
                                  setAnnouncementForm({ ...announcementForm, category: e.target.value })
                                }
                              >
                                <option value="General">General</option> <option value="Health">Health</option>
                                <option value="Security">Security</option>
                                <option value="Relief & Aid">Relief & Aid</option>
                                <option value="Disaster Response">Disaster Response</option>
                                <option value="Events">Events</option>
                                <option value="Activities">Activities</option>
                                <option value="Governance">Governance</option>
                              </select>
                            </div>
                            <div className="fg" style={{ display: 'flex', alignItems: 'center', paddingTop: '28px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={announcementForm.pinned || false}
                                  onChange={(e) => setAnnouncementForm({ ...announcementForm, pinned: e.target.checked })}
                                />
                                Pin to top of list
                              </label>
                            </div>
                          </div>

                          <div className="fg">
                            <label className="fl">Content <span style={{ color: 'var(--red)' }}>*</span></label>
                            <textarea
                              className="fc"
                              required
                              style={{ minHeight: '180px', lineHeight: 1.6, resize: 'vertical' }}
                              placeholder="Write the announcement details..."
                              value={announcementForm.content || announcementForm.body || ''}
                              onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value, body: e.target.value })}
                            />
                          </div>

                          <div className="fa" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                            <button type="button" className="btn btn-g" onClick={() => setAnnouncementSubScreen('list')}>
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-g"
                              onClick={(e) => handleSaveAnnouncement(e, 'Draft')}
                            >
                              Save as Draft
                            </button>
                            <button
                              type="submit"
                              className="btn btn-p"
                            >
                              {announcementSubScreen === 'new' ? 'Publish' : 'Save Changes'}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* DELETE CONFIRMATION */}
                    {showAnnDeleteModal && (
                      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}>
                        <div className="fp" style={{ maxWidth: '400px', width: '100%', padding: '20px' }}>
                          <h4 style={{ margin: '0 0 8px' }}>Delete announcement?</h4>
                          <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                            This will permanently remove the announcement from the bulletin. This action cannot be undone.
                          </p>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-g"
                              onClick={() => { setShowAnnDeleteModal(false); setAnnIdToDelete(null); }}
                            >
                              Cancel
                            </button>
                            <button type="button" className="btn btn-d" onClick={handleConfirmDeleteAnnouncement}>
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

            {/* ════════════════════════════════════════
                SCREEN: PROFILE
                ════════════════════════════════════════ */}
                {screen === 'profile' && (() => {
                const profileUser = typeof loggedInUser !== 'undefined' ? loggedInUser 
                  : typeof user !== 'undefined' ? user 
                  : typeof currentUser !== 'undefined' ? currentUser 
                  : null;

                const userPurok = profileUser?.purok || profileUser?.zone || profileUser?.address || profileUser?.purok_zone || 'N/A';
                const userFullName = profileUser?.fullName || profileUser?.name || profileUser?.displayName || displayName || 'N/A';
                const userContact = profileUser?.contact || profileUser?.phone || profileUser?.mobile || profileUser?.phoneNumber || profileUser?.contact_no || profileUser?.contactNo || 'N/A';
                const userBirthdate = profileUser?.birthdate || profileUser?.dob || profileUser?.birth_date || profileUser?.birthDate || 'N/A';
                const userAge = profileUser?.age ? `(${profileUser.age} y/o)` : '';

                return (
                  <div className="screen active" style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0, display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

                    <div className="card" style={{ padding: 20, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--primary, #3b82f6)', fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
                          {displayName}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '3px 8px', borderRadius: 6, color: 'var(--primary, #3b82f6)', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                            {role === 'admin' ? 'Administrator' : 'Barangay Staff / Resident'}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            Purok / Zone: <strong style={{ color: 'var(--text)' }}>{userPurok}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 2. Personal Details Card */}
                    <div className="card" style={{ padding: 18, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                        Personal Information
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 16px', fontSize: 13 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Full Name</label>
                          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{userFullName}</div>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Contact Number</label>
                          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{userContact}</div>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Purok / Zone</label>
                          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{userPurok}</div>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Birthdate / Age</label>
                          <div style={{ color: 'var(--text)', fontWeight: 600 }}>
                            {userBirthdate} {userAge}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. Security & Account Actions Card */}
                    <div className="card" style={{ padding: 18, marginBottom: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                        Account Security
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button 
                          type="button" 
                          className="btn btn-outline" 
                          onClick={() => alert("Feature coming soon: Change Password")} 
                          style={{ width: '100%', padding: '12px 14px', borderRadius: 8, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <span>Change Password</span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>

                        <button 
                          type="button" 
                          className="btn btn-outline" 
                          onClick={() => { 
                            if (window.confirm("Gusto mo bang mag-log out sa account na ito?")) { 
                              if (typeof handleLogout === 'function') handleLogout(); 
                            } 
                          }} 
                          style={{ width: '100%', padding: '12px 14px', borderRadius: 8, fontWeight: 700, color: 'var(--red, #ef4444)', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <span>Log Out Account</span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            {/* ════════════════════════════════════════
                SCREEN: FEEDBACK & COMPLAINTS
                ════════════════════════════════════════ */}
                {screen === 'feedback' && (
                  <div className="screen active" style={{ position: 'relative' }}>

                    {/* Toast */}
                    {showFbSuccessToast && (
                      <div style={{ position: 'fixed', top: '20px', right: '20px', background: '#059669', padding: '12px 24px', borderRadius: '6px', zIndex: 99999, fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <path d="M22 4L12 14.01l-3-3" />
                        </svg>
                        {fbToastMessage}
                      </div>
                    )}

                    {/* Stat Cards Section */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                      
                      {/* 1. Pending */}
                      <div className="fp" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>Pending</div>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
                            {feedbackList.filter(f => (f.status || '').toLowerCase() === 'pending').length}
                          </div>
                        </div>
                      </div>

                      {/* 2. Under Review / Responded */}
                      <div className="fp" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>In Process / Responded</div>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>
                            {feedbackList.filter(f => ['under review', 'responded'].includes((f.status || '').toLowerCase())).length}
                          </div>
                        </div>
                      </div>

                      {/* 3. Resolved */}
                      <div className="fp" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>Resolved</div>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                            {feedbackList.filter(f => ['resolved', 'settled'].includes((f.status || '').toLowerCase())).length}
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Filters */}
                    <div className="fp" style={{ marginBottom: '16px', padding: '12px 16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '10px', alignItems: 'end' }}>
                        <div className="fg" style={{ margin: 0 }}>
                          <label className="fl">Search</label>
                          <input
                            className="fc"
                            placeholder="Search resident, ID or subject..."
                            value={searchFbQuery}
                            onChange={(e) => setSearchFbQuery(e.target.value)}
                          />
                        </div>
                        <div className="fg" style={{ margin: 0 }}>
                          <label className="fl">Type</label>
                          <select className="fc" value={filterFbType} onChange={(e) => setFilterFbType(e.target.value)}>
                            <option value="All Types">All Types</option>
                            <option value="Complaint">Complaint</option>
                            <option value="Suggestion">Suggestion</option>
                            <option value="Inquiry">Inquiry</option>
                          </select>
                        </div>
                        <div className="fg" style={{ margin: 0 }}>
                          <label className="fl">Status</label>
                          <select className="fc" value={filterFbStatus} onChange={(e) => setFilterFbStatus(e.target.value)}>
                            <option value="All Status">All Statuses</option>
                            <option value="Pending">Pending</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Responded">Responded</option>
                            <option value="Resolved">Resolved</option>
                          </select>
                        </div>
                        <div className="fg" style={{ margin: 0 }}>
                          <label className="fl">Priority</label>
                          <select className="fc" value={filterFbPriority} onChange={(e) => setFilterFbPriority(e.target.value)}>
                            <option value="All Priorities">All Priorities</option>
                            <option value="High">High Priority</option>
                            <option value="Medium">Medium Priority</option>
                            <option value="Low">Low Priority</option>
                          </select>
                        </div>
                        <div className="fg" style={{ margin: 0 }}>
                          <label className="fl">Sort</label>
                          <select className="fc" value={sortFbBy} onChange={(e) => setSortFbBy(e.target.value)}>
                            <option value="Newest">Newest First</option>
                            <option value="Oldest">Oldest First</option>
                            <option value="PendingFirst">Pending Priority</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Table */}
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}> 
                      
                      {/* Scrollable Table Wrapper (Horizontal + Vertical Scrolling) */} 
                      <div style={{ maxHeight: '480px', overflowY: 'auto', overflowX: 'auto', width: '100%' }}> 
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}> 
                          <thead style={{ position: 'sticky', top: 0, zIndex: 5, boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}>
                            <tr>
                              <th style={{ background: 'var(--surface2)' }}>Ticket ID</th>
                              <th style={{ background: 'var(--surface2)' }}>Resident</th>
                              <th style={{ background: 'var(--surface2)' }}>Type</th>
                              <th style={{ background: 'var(--surface2)' }}>Priority</th>
                              <th style={{ background: 'var(--surface2)' }}>Subject</th>
                              <th style={{ background: 'var(--surface2)' }}>Date</th>
                              <th style={{ background: 'var(--surface2)' }}>Assigned</th>
                              <th style={{ background: 'var(--surface2)' }}>Status</th>
                              <th style={{ background: 'var(--surface2)', textAlign: 'right', paddingRight: '16px' }}>Action</th>
                            </tr>
                          </thead> 
                          <tbody> 
                            {filteredFeedback.map((fb) => ( 
                              <tr key={fb._id || fb.id}> 
                                <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)', fontWeight: 'bold' }}>{fb.id}</td> 
                                <td style={{ fontWeight: 500 }}>{fb.sender}</td> 
                                <td> 
                                  <span className={`badge ${fb.type === 'Complaint' ? 'r' : fb.type === 'Suggestion' ? 'b' : 'p'}`}> 
                                    {fb.type} 
                                  </span> 
                                </td> 
                                <td> 
                                  {fb.priority === 'High' ? ( 
                                    <span className="badge r" style={{ fontSize: '10px' }}>High</span> 
                                  ) : fb.priority === 'Medium' ? ( 
                                    <span className="badge a" style={{ fontSize: '10px' }}>Medium</span> 
                                  ) : ( 
                                    <span className="badge g" style={{ fontSize: '10px' }}>Low</span> 
                                  )} 
                                </td> 
                                <td style={{ fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fb.subject}> 
                                  {fb.subject} 
                                </td> 
                                <td style={{ fontSize: '11px', color: 'var(--muted)' }}>{fb.date}</td> 
                                <td style={{ fontSize: '12px', color: fb.assignedTo === 'Unassigned' ? 'var(--muted)' : 'inherit' }}>{fb.assignedTo}</td> 
                                <td> 
                                  <span className={`badge ${ fb.status === 'Pending' ? 'r' : fb.status === 'Under Review' ? 'b' : fb.status === 'Responded' ? 'a' : 'g' }`}> 
                                    {fb.status} 
                                  </span> 
                                </td> 
                                <td style={{ textAlign: 'right', paddingRight: '16px' }}> 
                                  <button type="button" className={`btn btn-sm ${fb.status === 'Pending' || fb.status === 'Under Review' ? 'btn-p' : 'btn-g'}`} onClick={() => handleOpenFeedbackDetails(fb)}> 
                                    {fb.status === 'Pending' || fb.status === 'Under Review' ? 'Respond' : 'View'} 
                                  </button> 
                                </td> 
                              </tr> 
                            ))} 
                          </tbody> 
                        </table> 

                        {/* Empty State Inside the Scrollable View */} 
                        {filteredFeedback.length === 0 && ( 
                          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}> 
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>No feedback logs found</div> 
                            <div style={{ fontSize: '12px' }}>Try adjusting the search or filter options.</div> 
                          </div> 
                        )}
                      </div> 

                      {/* Record Counter & Footer (Fixed at Bottom) */} 
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', fontSize: '12px', color: 'var(--muted)', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}> 
                        <span> 
                          Showing <strong style={{ color: 'var(--text)' }}>{filteredFeedback.length}</strong> of <strong style={{ color: 'var(--text)' }}>{feedbackList.length}</strong> feedback logs {(searchFbQuery || filterFbType !== 'All Types' || filterFbStatus !== 'All Status' || filterFbPriority !== 'All Priorities') && ' (filtered)'} 
                        </span> 
                        {(searchFbQuery || filterFbType !== 'All Types' || filterFbStatus !== 'All Status' || filterFbPriority !== 'All Priorities') && ( 
                          <button className="btn btn-sm btn-g" onClick={() => { setSearchFbQuery(''); setFilterFbType('All Types'); setFilterFbStatus('All Status'); setFilterFbPriority('All Priorities'); setSortFbBy('Newest'); }} style={{ fontSize: '11px', padding: '4px 10px' }}> 
                            Clear Filters 
                          </button> 
                        )} 
                      </div> 
                    </div>

                    {/* Modal */}
                    {selectedFeedback && (
                      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}>
                        <div className="fp" style={{ width: '100%', maxWidth: '600px', margin: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="badge" style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{selectedFeedback.id}</span>
                              <strong>{selectedFeedback.type} Details</strong>
                            </div>
                            <button type="button" className="btn btn-g btn-sm" onClick={() => setSelectedFeedback(null)}>Close</button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px', fontSize: '13px' }}>
                            <div><span style={{ color: 'var(--muted)' }}>From:</span> <strong>{selectedFeedback.sender}</strong></div>
                            <div><span style={{ color: 'var(--muted)' }}>Priority:</span> <strong>{selectedFeedback.priority}</strong></div>
                            <div><span style={{ color: 'var(--muted)' }}>Date:</span> {selectedFeedback.date}</div>
                            <div><span style={{ color: 'var(--muted)' }}>Attachment:</span> {selectedFeedback.attachment || 'None'}</div>
                          </div>

                          <div style={{ marginBottom: '16px' }}>
                            <label className="fl">Subject</label>
                            <div style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: '6px', fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>
                              {selectedFeedback.subject}
                            </div>
                            <label className="fl">Message</label>
                            <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '6px', fontSize: '13px', lineHeight: 1.6, maxHeight: '140px', overflowY: 'auto' }}>
                              {selectedFeedback.message}
                            </div>
                          </div>

                          <form onSubmit={handleSubmitFeedbackAction}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                              <div className="fg" style={{ margin: 0 }}>
                                <label className="fl">Update Status</label>
                                <select className="fc" value={fbStatusUpdate} onChange={(e) => setFbStatusUpdate(e.target.value)}>
                                  <option value="Pending">Pending</option>
                                  <option value="Under Review">Under Review</option>
                                  <option value="Responded">Responded</option>
                                  <option value="Resolved">Resolved & Closed</option>
                                </select>
                              </div>
                              <div className="fg" style={{ margin: 0 }}>
                                <label className="fl">Assign To</label>
                                <select className="fc" value={fbStaffAssignment} onChange={(e) => setFbStaffAssignment(e.target.value)}>
                                  <option value="Unassigned">Unassigned</option>
                                  <option value="Mark Gian Cortero">Mark Gian Cortero</option>
                                  <option value="Juhairo Macabangon">Juhairo Macabangon</option>
                                  <option value="Denver Napagal">Denver Napagal</option>
                                </select>
                              </div>
                            </div>
                            <div className="fg">
                              <label className="fl">Official Response</label>
                              <textarea
                                className="fc"
                                required
                                style={{ minHeight: '80px', fontSize: '13px' }}
                                placeholder="Write the response to be recorded..."
                                value={fbResponseText}
                                onChange={(e) => setFbResponseText(e.target.value)}
                              />
                            </div>

                            {selectedFeedback.status === 'Resolved' && (
                              <div className="note note-s" style={{ marginTop: '12px', fontSize: '11px' }}>
                                Resolved by <strong>{selectedFeedback.handledBy}</strong> on {selectedFeedback.dateResolved}
                              </div>
                            )}

                            <div className="fa" style={{ justifyContent: 'flex-end', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                              <button type="button" className="btn btn-g" onClick={() => setSelectedFeedback(null)}>Discard</button>
                              <button type="submit" className="btn btn-p">Save Changes</button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                  </div>
                )}
            
            {/* ════════════════════════════════════════
                SCREEN: MANAGE ACTIVITIES
                ════════════════════════════════════════ */}
            {screen === 'activities-manage' && (
              <div className="screen active">
                {/* Header Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                      Community Calendar
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
                      {activitySubScreen === 'list' ? 'Barangay Activities' : editingActivityId ? 'Edit Activity' : 'New Activity'}
                    </div>
                  </div>
                  {activitySubScreen === 'list' ? (
                    <button 
                      className="btn btn-p" 
                      onClick={() => {
                        setEditingActivityId(null);
                        setActivityForm({
                          title: '',
                          category: 'Events',
                          description: '',
                          date: new Date().toISOString().split('T')[0],
                          location: '',
                        });
                        setActivitySubScreen('new');
                      }}
                    >
                      + Add Activity
                    </button>
                  ) : (
                    <button 
                      className="btn btn-g" 
                      onClick={() => setActivitySubScreen('list')}
                    >
                      ← Back to List
                    </button>
                  )}
                </div>

                {/* LIST VIEW */}
                {activitySubScreen === 'list' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {activitiesList.length === 0 ? (
                      <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>No activities found</div>
                        <div style={{ fontSize: '12px' }}>Click "+ Add Activity" to publish a new community event or program.</div>
                      </div>
                    ) : (
                      activitiesList
                        .slice()
                        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
                        .map((act) => (
                          <div
                            key={act._id || act.id}
                            className="card"
                            style={{
                              display: 'flex',
                              justify: 'space-between',
                              alignItems: 'flex-start',
                              gap: '16px',
                              padding: '16px 20px',
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span className="badge b" style={{ fontSize: '10px' }}>
                                  {act.category || 'Events'}
                                </span>

                                {/* DATE & TIME */}
                                <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                  </svg>
                                  {act.date} {act.time ? formatTime12hr(act.time) : ''}
                                </span>

                                {/* LOCATION WITH SVG ICON */}
                                {act.location && (
                                  <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                      <circle cx="12" cy="10" r="3" />
                                    </svg>
                                    {act.location}
                                  </span>
                                )}
                              </div>

                              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)', marginBottom: '4px' }}>
                                {act.title}
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                                {act.description}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                              <button className="btn btn-g btn-sm" onClick={() => handleEditActivity(act)}>
                                Edit
                              </button>
                              <button className="btn btn-d btn-sm" onClick={() => handleDeleteActivity(act._id || act.id)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}

                {/* NEW / EDIT FORM */}
                {(activitySubScreen === 'new' || activitySubScreen === 'edit') && (
                  <div className="fp" style={{ maxWidth: '640px', margin: '0 auto', padding: '24px' }}>
                    <form onSubmit={handleSaveActivity}>
                      {/* TITLE */}
                      <div className="fg">
                        <label className="fl">Activity Title <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input 
                          className="fc" 
                          required 
                          placeholder="e.g. Barangay Assembly, Clean-up Drive, Medical Mission" 
                          value={activityForm.title} 
                          onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} 
                        />
                      </div>

                      {/* CATEGORY & LOCATION (Side-by-Side) */}
                      <div className="fg2" style={{ marginTop: '12px' }}>
                        <div className="fg">
                          <label className="fl">Category</label>
                          <select 
                            className="fc" 
                            value={activityForm.category} 
                            onChange={(e) => setActivityForm({ ...activityForm, category: e.target.value })}
                          >
                            <option value="Events">Events</option>
                            <option value="Meetings">Meetings</option>
                            <option value="Programs">Programs</option>
                            <option value="Health">Health</option>
                            <option value="Governance">Governance</option>
                            <option value="Sports">Sports</option>
                            <option value="Others">Others</option>
                          </select>
                        </div>
                        <div className="fg">
                          <label className="fl">Location</label>
                          <input 
                            className="fc" 
                            placeholder="e.g. Barangay Covered Court, Purok 3" 
                            value={activityForm.location} 
                            onChange={(e) => setActivityForm({ ...activityForm, location: e.target.value })} 
                          />
                        </div>
                      </div>

                      {/* DATE & TIME (Side-by-Side) */}
                      <div className="fg2" style={{ marginTop: '12px' }}>
                        <div className="fg">
                          <label className="fl">Date <span style={{ color: 'var(--red)' }}>*</span></label>
                          <input 
                            className="fc" 
                            type="date" 
                            required 
                            value={activityForm.date} 
                            onChange={(e) => setActivityForm({ ...activityForm, date: e.target.value })} 
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">Time (Optional)</label>
                          <input 
                            className="fc" 
                            type="time" 
                            value={activityForm.time || ''} 
                            onChange={(e) => setActivityForm({ ...activityForm, time: e.target.value })} 
                          />
                        </div>
                      </div>

                      {/* DESCRIPTION */}
                      <div className="fg" style={{ marginTop: '12px' }}>
                        <label className="fl">Description / Details <span style={{ color: 'var(--red)' }}>*</span></label>
                        <textarea 
                          className="fc" 
                          required 
                          rows={4} 
                          placeholder="Describe the activity, schedule, and any instructions for residents..." 
                          value={activityForm.description} 
                          onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })} 
                        />
                      </div>

                      {/* BUTTONS */}
                      <div className="fa" style={{ marginTop: '20px', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-g" onClick={() => setActivitySubScreen('list')} style={{ marginRight: '10px' }}>
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-p">
                          {editingActivityId ? 'Save Changes' : 'Publish Activity'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════
                SCREEN: RELIEF & AID ADVISORIES
                ════════════════════════════════════════ */}
            {screen === 'aid-advisories' && (
              <div className="screen active">
                
                {/* Header Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                      Community Advisories
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
                      {advisorySubScreen === 'list' ? 'Relief & Aid Advisories' : editingAdvisoryId ? 'Edit Advisory' : 'New Advisory'}
                    </div>
                  </div>
                  {advisorySubScreen === 'list' ? (
                    <button 
                      className="btn btn-p" 
                      onClick={() => {
                        setEditingAdvisoryId(null);
                        setAdvisoryForm({
                          title: '',
                          category: 'Relief',
                          description: '',
                          date: new Date().toISOString().split('T')[0],
                          priority: 'Medium',
                          status: 'Active',
                        });
                        setAdvisorySubScreen('new');
                      }}
                    >
                      + Create Advisory
                    </button>
                  ) : (
                    <button 
                      className="btn btn-g" 
                      onClick={() => setAdvisorySubScreen('list')}
                    >
                      ← Back to List
                    </button>
                  )}
                </div>

                {/* LIST VIEW */}
                {advisorySubScreen === 'list' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {advisoriesList.length === 0 ? (
                      <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>No advisories found</div>
                        <div style={{ fontSize: '12px' }}>Click "+ Create Advisory" to publish relief operations or assistance program information.</div>
                      </div>
                    ) : (
                      advisoriesList
                        .slice()
                        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
                        .map((adv) => (
                          <div 
                            key={adv._id || adv.id} 
                            className="card"
                            style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'flex-start',
                              gap: '16px',
                              padding: '16px 20px',
                              borderLeft: adv.priority === 'High' ? '4px solid var(--red)' : adv.priority === 'Medium' ? '4px solid var(--amber)' : '4px solid var(--green)'
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                <span className="badge a" style={{ fontSize: '10px' }}>
                                  {adv.category || 'Relief'}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                                  {adv.date}
                                </span>
                                <span className={`badge ${adv.priority === 'High' ? 'r' : adv.priority === 'Medium' ? 'a' : 'g'}`} style={{ fontSize: '10px' }}>
                                  {adv.priority} Priority
                                </span>
                                <span className="badge t" style={{ fontSize: '10px' }}>
                                  {adv.status}
                                </span>
                              </div>
                              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)', marginBottom: '4px' }}>
                                {adv.title}
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                                {adv.description}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                              <button className="btn btn-g btn-sm" onClick={() => handleEditAdvisory(adv)}>
                                Edit
                              </button>
                              <button 
                                className="btn btn-d btn-sm" 
                                onClick={() => handleDeleteAdvisory(adv._id || adv.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}

                {/* NEW / EDIT FORM */}
                {(advisorySubScreen === 'new' || advisorySubScreen === 'edit') && (
                  <div className="fp" style={{ maxWidth: '640px', margin: '0 auto', padding: '24px' }}>
                    <form onSubmit={handleSaveAdvisory}>
                      <div className="fg">
                        <label className="fl">Advisory Title <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input
                          className="fc"
                          required
                          placeholder="e.g. Typhoon Preparedness Advisory, Rice Distribution Schedule"
                          value={advisoryForm.title}
                          onChange={(e) => setAdvisoryForm({ ...advisoryForm, title: e.target.value })}
                        />
                      </div>

                      <div className="fg2" style={{ marginTop: '12px' }}>
                        <div className="fg">
                          <label className="fl">Category</label>
                          <select
                            className="fc"
                            value={advisoryForm.category}
                            onChange={(e) => setAdvisoryForm({ ...advisoryForm, category: e.target.value })}
                          >
                            <option value="Relief">Relief</option>
                            <option value="Aid">Aid</option>
                            <option value="Disaster">Disaster</option>
                            <option value="Health">Health</option>
                            <option value="Emergency">Emergency</option>
                            <option value="General">General</option>
                          </select>
                        </div>
                        <div className="fg">
                          <label className="fl">Date <span style={{ color: 'var(--red)' }}>*</span></label>
                          <input
                            className="fc"
                            type="date"
                            required
                            value={advisoryForm.date}
                            onChange={(e) => setAdvisoryForm({ ...advisoryForm, date: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="fg2" style={{ marginTop: '12px' }}>
                        <div className="fg">
                          <label className="fl">Priority</label>
                          <select
                            className="fc"
                            value={advisoryForm.priority}
                            onChange={(e) => setAdvisoryForm({ ...advisoryForm, priority: e.target.value })}
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                          </select>
                        </div>
                        <div className="fg">
                          <label className="fl">Status</label>
                          <select
                            className="fc"
                            value={advisoryForm.status}
                            onChange={(e) => setAdvisoryForm({ ...advisoryForm, status: e.target.value })}
                          >
                            <option value="Active">Active</option>
                            <option value="Ongoing">Ongoing</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>

                      <div className="fg" style={{ marginTop: '12px' }}>
                        <label className="fl">Description / Details <span style={{ color: 'var(--red)' }}>*</span></label>
                        <textarea
                          className="fc"
                          required
                          rows={5}
                          placeholder="Provide details about the relief operation, eligibility, schedule, distribution points..."
                          value={advisoryForm.description}
                          onChange={(e) => setAdvisoryForm({ ...advisoryForm, description: e.target.value })}
                        />
                      </div>

                      <div className="fa" style={{ marginTop: '20px', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-g" onClick={() => setAdvisorySubScreen('list')} style={{ marginRight: '10px' }}>
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-p">
                          {editingAdvisoryId ? 'Save Changes' : 'Publish Advisory'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

              </div>
            )}
            {/* ════════════════════════════════════════
                SCREEN: CONFLICT RESOLUTION (Admin only)
             ════════════════════════════════════════ */}
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
                  <AuditLogView />
                )}

            {/* ════════════════════════════════════════
                SCREEN: MANAGE USERS (Admin only)
                ════════════════════════════════════════ */}
                {role === 'admin' && screen === 'users' && (
                <div className="screen active">
                  <div className="tb" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div className="sb-box">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-4-4" />
                      </svg>
                      <input placeholder="Search users..." value={searchUserQuery} onChange={(e) => setSearchUserQuery(e.target.value)} />
                    </div>
                    <select className="fc" style={{ width: '150px' }} value={filterUserRole} onChange={(e) => setFilterUserRole(e.target.value)}>
                      <option value="All">All Roles</option>
                      <option value="Admin">Admin</option>
                      <option value="Barangay Captain">Barangay Captain</option>
                      <option value="Staff">Staff</option>
                      <option value="Resident">Resident</option>
                    </select>
                    <div style={{ flex: '1 1 auto' }} />
                    <button className="btn btn-p">+ Add User</button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Showing <strong>{filteredUsers.length}</strong> of <strong>{usersList.length}</strong> registered user accounts
                      {filteredUsers.length !== usersList.length && ' (filtered)'}
                    </span>
                    {(searchUserQuery || filterUserRole !== 'All') && (
                      <button className="btn btn-sm btn-g" onClick={() => { setSearchUserQuery(''); setFilterUserRole('All'); }}>
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="tw" style={{ maxHeight: '60vh' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>User ID</th>
                          <th>User</th>
                          <th>Username</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Last Login</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.length === 0 ? (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                              <div style={{ fontWeight: 600, marginBottom: '4px' }}>No users found</div>
                              <div style={{ fontSize: '12px' }}>Try adjusting the search or filter options.</div>
                            </td>
                          </tr>
                        ) : (
                          filteredUsers.map((u) => {
                            const initials = u.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase();
                            return (
                              <tr key={u.id}>
                                <td style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--muted)' }}>{u.id}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '50%',
                                      background: 'var(--accent)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      flexShrink: 0,
                                      fontFamily: 'var(--mono)',
                                      color: '#fff'
                                    }}>
                                      {initials}
                                    </div>
                                    <strong>{u.name}</strong>
                                  </div>
                                </td>
                                <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{u.uname}</td>
                                <td>
                                  <span className={`badge ${u.rClass}`}>{u.role}</span>
                                </td>
                                <td>
                                  <span className="badge g">{u.status}</span>
                                </td>
                                <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{u.last}</td>
                                <td>
                                  <button className="btn btn-g btn-sm">Edit</button>
                                  {u.role !== 'Admin' && (
                                    <button className="btn btn-d btn-sm" style={{ marginLeft: '6px' }}>Deactivate</button>
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
              )}
                
                {role === 'admin' && screen === 'officials' && (
                <div className="screen active">
                  <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <div className="card" style={{ padding: '24px' }}>
                      <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                        Barangay Officials & System Configuration
                      </h3>
                      
                      <div className="fg" style={{ marginTop: '12px' }}>
                        <label className="fl">Punong Barangay (Lupon Chairman)</label>
                        <input 
                          className="fc" 
                          value={settingsForm.punongBarangay || ''} 
                          onChange={(e) => setSettingsForm({...settingsForm, punongBarangay: e.target.value})} 
                          placeholder="e.g. HON. ANNABELLE E. RULL" 
                        />
                      </div>
                      
                      <div className="fg" style={{ marginTop: '16px' }}>
                        <label className="fl">Barangay Secretary / Lupon Secretary</label>
                        <input 
                          className="fc" 
                          value={settingsForm.luponSecretary || ''} 
                          onChange={(e) => setSettingsForm({...settingsForm, luponSecretary: e.target.value})} 
                          placeholder="e.g. MRS. MELY M. PRESADO" 
                        />
                      </div>

                      <div className="fg" style={{ marginTop: '16px' }}>
                        <label className="fl">Barangay Treasurer (optional)</label>
                        <input 
                          className="fc" 
                          value={settingsForm.treasurer || ''} 
                          onChange={(e) => setSettingsForm({...settingsForm, treasurer: e.target.value})} 
                          placeholder="e.g. JUAN DELA CRUZ"
                        />
                      </div>

                      {/* Dynamic Verification Domain para sa QR Scanner */}
                      <div className="fg" style={{ marginTop: '16px' }}>
                        <label className="fl">Public Verification URL (for Live Tunnel/Domain)</label>
                        <input 
                          className="fc" 
                          value={settingsForm.publicDomain || ''} 
                          onChange={(e) => setSettingsForm({...settingsForm, publicDomain: e.target.value})} 
                          placeholder="e.g. https://brave-ducks-love.loca.lt" 
                        />
                        <small style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                          Ipasok dito ang inyong Localtunnel / Ngrok URL para mabuksan ang QR Verification sa Mobile Phone.
                        </small>
                      </div>

                      <button 
                        className="btn btn-p" 
                        style={{ marginTop: '24px', width: '100%' }} 
                        onClick={() => saveSettings(settingsForm)}
                      >
                        Save Official Settings
                      </button>
                    </div>

                    {/* Preview ng Current Saved Settings */}
                    <div className="card" style={{ marginTop: '16px', padding: '20px', background: 'var(--surface2)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '12px' }}>
                        Currently Active Configuration
                      </div>
                      <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                        <div><strong>Punong Barangay:</strong> {systemSettings?.punongBarangay || settingsForm.punongBarangay || 'Not set'}</div>
                        <div><strong>Secretary:</strong> {systemSettings?.luponSecretary || settingsForm.luponSecretary || 'Not set'}</div>
                        <div><strong>Public URL:</strong> {systemSettings?.publicDomain || 'Localhost (Default)'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* ════════════════════════════════════════
                SCREEN: GENERATE REPORTS
                ════════════════════════════════════════ */}
                {screen === 'reports' && (
                  <div className="screen active">
                    <div className="thc" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                      {[
                        { title: 'Certificate Issuance', desc: 'Monthly issuance summary by type', select: ['April 2026', 'March 2026', 'February 2026'], module: 'certificates' },
                        { title: 'Aid Distribution', desc: 'Beneficiary list per program', select: ['Ayuda Rice Distribution', 'Financial Assistance', 'Medical Aid'], module: 'aid' },
                        { title: 'Resident Registry', desc: 'Full resident list by purok', select: ['All Puroks', 'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'], module: 'residents' },
                        { title: 'Blotter Summary', desc: 'Cases grouped by type and status', select: ['September 2026', 'August 2026', 'July 2026'], module: 'blotter' },
                        { title: 'Feedback Report', desc: 'Concern submissions and resolutions', select: ['All Status', 'Pending', 'Under Review', 'Resolved'], module: 'feedback' },
                        { title: 'Household Registry', desc: 'Household listing by purok', select: ['All Puroks', 'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'], module: 'households' },
                        ...(role === 'admin' ? [{ title: 'Audit Trail Report', desc: 'Full system transaction log', select: ['September 2026', 'August 2026', 'July 2026'], module: 'audit', adminOnly: true }] : [])
                      ].map((r) => (
                        <div key={r.title} className="fp" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                              <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text)' }}>{r.title}</div>
                              {r.adminOnly && (
                                <span style={{ fontSize: '10px', color: 'var(--red)', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  Admin Only
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>{r.desc}</div>
                            <select className="fc" style={{ margin: 0 }}>
                              {r.select.map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          </div>

                          {/* Action Buttons Row: PDF & Excel */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {/* Generate PDF Button */}
                            <button
                              className="btn btn-p"
                              disabled={generatingReport === r.module}
                              style={{ justifyContent: 'center', opacity: generatingReport === r.module ? 0.7 : 1, cursor: generatingReport === r.module ? 'wait' : 'pointer', fontSize: '12px', padding: '8px 10px' }}
                              onClick={() => handleGenerateReport(r.module)}
                            >
                              {generatingReport === r.module ? (
                                <>
                                  <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                                  Generating...
                                </>
                              ) : (
                                '📄 Generate PDF'
                              )}
                            </button>

                            {/* Export Excel Button */}
                            <button
                              className="btn"
                              style={{
                                justifyContent: 'center',
                                background: 'var(--green-bg, #dcfce7)',
                                color: 'var(--green-text, #15803d)',
                                border: '1px solid var(--green, #22c55e)',
                                fontWeight: 700,
                                fontSize: '12px',
                                padding: '8px 10px',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleGenerateExcelReport(r.module)}
                            >
                              📊 Export Excel
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

          </div>
          <footer className="app-footer">
            <div>
              <strong>Bustrac Hub</strong> v1.0.0 — {role === 'admin' ? 'Admin Portal' : 'Staff Portal'}
            </div>
            <div>
              © 2026 Brgy. Bustrac, Nabua, Camarines Sur. All Rights Reserved.
            </div>
          </footer>
        </div>{/* /main */}

        {/* ═══ 1. GENERAL PRINT MODAL (FOR ALL CERTIFICATES / PERMITS) ═══ */}
        {showPrintModal && selectedPrintCert && (
          <div 
            className="print-modal-overlay" 
            style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              backgroundColor: 'rgba(0, 0, 0, 0.85)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              zIndex: 99999, 
              backdropFilter: 'blur(6px)', 
              padding: '20px', 
            }} 
            onClick={() => setShowPrintModal(false)}
          >
            <div 
              className="print-modal-content" 
              style={{ 
                background: '#fff', 
                borderRadius: '12px', 
                width: '100%', 
                maxWidth: '900px', 
                maxHeight: '92vh', 
                display: 'flex', 
                flexDirection: 'column', 
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', 
                overflow: 'auto', 
              }} 
              onClick={(e) => e.stopPropagation()}
            >
              {/* Print Preview Area */}
              <div style={{ padding: '20px', flex: 1, overflow: 'auto' }}>
                <div id="printable-certificate-card" data-print-mode={printMode}>
                  {(() => {
                    const typeStr = String(
                      selectedPrintCert.certificateType || 
                      selectedPrintCert.type || 
                      selectedPrintCert.clearanceType || 
                      selectedPrintCert.certType || 
                      ''
                    ).toLowerCase();
                    
                    if (typeStr.includes('business') || typeStr.includes('permit') || selectedPrintCert.businessName) {
                      return <BusinessPermit data={selectedPrintCert} />;
                    } else if (typeStr.includes('indigency')) {
                      return <IndigencyTemplate data={selectedPrintCert} />;
                    } else if (typeStr.includes('residency') || typeStr.includes('resident')) {
                      return <ResidencyCertificate data={selectedPrintCert} />;
                    } else {
                      return <BarangayClearance data={selectedPrintCert} />;
                    }
                  })()}
                </div>
              </div>

              {/* Modal Action Controls - Hidden during print via CSS */}
              <div className="no-print" style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: '10px', 
                padding: '16px', 
                borderTop: '1px solid #e2e8f0', 
                background: '#f8fafc', 
              }}>
                <button 
                  type="button" 
                  className="btn btn-g" 
                  onClick={() => setShowPrintModal(false)} 
                  style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Close
                </button>
                <button 
                  type="button" 
                  className="btn btn-p" 
                  onClick={() => window.print()} 
                  style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  🖨️ Print Document
                </button>
              </div>
            </div>
          </div>
        )}

      

      {/* ═══ 3. ADD NEW CTC RECORD MODAL ═══ */}
      {showCtcModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justify: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(3px)',
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '480px',
            padding: '20px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                Add New CTC Record
              </h3>
              <button
                type="button"
                onClick={() => setShowCtcModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCtc}>
              <div className="fg2" style={{ marginBottom: '12px' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">RBI ID NO.</label>
                  <input type="text" className="fc" placeholder="e.g. RBI-2026-001" value={ctcForm.rbiNo} onChange={updateCtcField('rbiNo')} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">CTC NUMBER *</label>
                  <input type="text" className="fc" required placeholder="e.g. CTC-12345678" value={ctcForm.ctcNo} onChange={updateCtcField('ctcNo')} />
                </div>
              </div>

              <div className="fg" style={{ marginBottom: '12px' }}>
                <label className="fl">FULL NAME / RESIDENT *</label>
                <input type="text" className="fc" required placeholder="LAST NAME, FIRST NAME MIDDLE NAME" value={ctcForm.ctcName} onChange={updateCtcField('ctcName')} />
              </div>

              <div className="fg2" style={{ marginBottom: '12px' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">AMOUNT PAID (₱) *</label>
                  <input type="number" className="fc" required placeholder="0.00" value={ctcForm.amtPaid} onChange={updateCtcField('amtPaid')} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">DATE ISSUED</label>
                  <input type="date" className="fc" value={ctcForm.dateIssued} onChange={updateCtcField('dateIssued')} />
                </div>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                  <input type="checkbox" checked={ctcForm.isIssuedByBarangay} onChange={handleBarangayToggle} /> ISSUED BY THIS BARANGAY
                </label>
              </div>

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

      {/* ═══ 4. BAGONG BLOTTER FORM MODAL ═══ */}
      {showBlotterModal && (
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
            justify: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)',
            padding: '20px',
          }}
          onClick={() => setShowBlotterModal(false)}
        >
          <div
            style={{
              background: 'var(--surface, #1e293b)',
              color: 'var(--text, #f8fafc)',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              border: '1px solid var(--border, #334155)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                Mag-encode ng Bagong Blotter Record
              </h3>
              <button type="button" onClick={() => setShowBlotterModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '20px' }}>
                ✕
              </button>
            </div>
            <BlotterForm
              onSuccess={(newDoc) => {
                setShowBlotterModal(false);
                if (typeof fetchBlotterRecords === 'function') fetchBlotterRecords();
              }}
            />
          </div>
        </div>
      )}

      {/* ═══ 5. BLOTTER ACTION MODAL / DIALOG ═══ */}
      {actionModalOpen && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0, 0, 0, 0.65)', 
          backdropFilter: 'blur(4px)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',  
          zIndex: 9999, 
          padding: '16px', 
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '480px',
            background: 'var(--surface, #1a1d24)',
            border: '1px solid var(--border, #2a2f3d)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border, #2a2f3d)' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                {actionType === '1st_summon' && ' Issue 1st Summon'}
                {actionType === '2nd_summon' && ' Issue 2nd Summon'}
                {actionType === '3rd_summon' && ' Issue 3rd Summon'}
                {actionType === 'settled' && ' Mark Case as Settled'}
                {actionType === 'escalate_cfa' && ' Escalate / Issue CFA'}
              </h3>
              <button onClick={() => setActionModalOpen(false)} disabled={actionSaving} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {actionType.includes('summon') && (
                <div className="fg">
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
                    Hearing / Summon Date & Time <span style={{ color: 'var(--red, #ef4444)' }}>*</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="fc"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px' }}
                  />
                </div>
              )}

              <div className="fg">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
                  {actionType === 'settled' ? 'Settlement / Resolution Agreement Details' : actionType === 'escalate_cfa' ? 'Reason for Escalation / Referral Notes' : 'Official Remarks / Hearing Instructions'}
                </label>
                <textarea
                  className="fc"
                  rows="4"
                  placeholder={actionType === 'settled' ? 'Isulat ang napagkasunduang kasunduan...' : 'Maglagay ng karagdagang paalala...'}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--surface2, #20242e)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                <span><strong>Real-Time Sync:</strong> Ang aksyong ito ay awtomatikong magse-save at mag-a-update sa Resident UI.</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setActionModalOpen(false)}
                disabled={actionSaving}
                style={{ padding: '10px', borderRadius: '8px', background: 'var(--border)', color: 'var(--text)', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={submitBlotterAction}
                disabled={actionSaving}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  background: actionType === 'escalate_cfa' ? '#dc2626' : actionType === 'settled' ? '#059669' : 'var(--primary, #3b82f6)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  gap: '6px',
                }}
              >
                {actionSaving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 6. VIEW PROGRAM DETAILS MODAL ═══ */}
      {viewingProgram && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}
          onClick={() => setViewingProgram(null)}
        >
          <div
            className="modal-card"
            style={{ background: '#1e293b', border: '1px solid rgba(79, 142, 247, 0.3)', borderRadius: '12px', width: '90%', maxWidth: '550px', padding: '24px', color: '#f8fafc', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <div>
                <span className={`badge ${viewingProgram.status === 'Completed' ? 't' : 'r'}`} style={{ marginBottom: '6px', display: 'inline-block' }}>
                  {viewingProgram.status}
                </span>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f1f5f9' }}>
                  {viewingProgram.title}
                </h3>
                <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                  ID: {viewingProgram.id}
                </div>
              </div>
              <button className="btn btn-g btn-sm" onClick={() => setViewingProgram(null)} style={{ padding: '4px 10px', fontSize: '14px', borderRadius: '50%' }}>
                ✕
              </button>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: '#94a3b8' }}>Distribution Capacity:</span> <strong>{viewingProgram.current || 0} / {viewingProgram.target} Beneficiaries</strong>
              </div>
              <div style={{ margin: '8px 0', background: '#334155', borderRadius: '4px', height: '10px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.round(((viewingProgram.current || 0) / viewingProgram.target) * 100))}%`, height: '100%', background: viewingProgram.status === 'Completed' ? '#10b981' : '#3b82f6' }} />
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: '#10b981' }}>
                {Math.min(100, Math.round(((viewingProgram.current || 0) / viewingProgram.target) * 100))}% Capacity Reached
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ color: '#94a3b8', display: 'block' }}>Date Created / Label</label>
                <div style={{ fontWeight: 600 }}>{viewingProgram.dateLabel || 'N/A'}</div>
              </div>
              <div>
                <label style={{ color: '#94a3b8', display: 'block' }}>Category / Type</label>
                <div style={{ fontWeight: 600 }}>{viewingProgram.category || 'Aid Distribution'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
              <button className="btn btn-g" onClick={() => { nav('aid-logs'); setViewingProgram(null); }}>
                View Distribution Logs
              </button>
              <button className="btn btn-p" onClick={() => setViewingProgram(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 7. BUSINESS CLEARANCE EDIT MODAL ═══ */}
      {isBusinessModalOpen && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', alignItems: 'center', justify: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '20px' }}
          onClick={() => setIsBusinessModalOpen(false)}
        >
          <div
            className="modal-card width-lg"
            style={{ background: 'var(--surface, #1e293b)', color: 'var(--text, #f8fafc)', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', border: '1px solid var(--border, #334155)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card, #ffffff)', color: 'var(--text-main, inherit)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-main, inherit)' }}>
                  {businessModalMode === 'edit' ? 'Edit Business Clearance' : 'New Business Clearance'}
                </h3>
                <p className="modal-subtitle" style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                  Update business details, owner information, and OR reference
                </p>
              </div>
              <button type="button" className="btn-close" onClick={() => setIsBusinessModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-main, var(--muted))', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <form onSubmit={handleSaveBusinessClearance} id="business-clearance-form" noValidate> 
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary, #3b82f6)', marginBottom: '8px' }}>
                  1. Business Information
                </div>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div className="fg">
                    <label className="fl">BC ID No.</label>
                    <input type="text" className="fc" value={businessForm.bcIdNo || ''} onChange={(e) => setBusinessForm(p => ({ ...p, bcIdNo: e.target.value }))} placeholder="e.g. BC-2026-001" />
                  </div>
                  <div className="fg">
                    <label className="fl">Business Name *</label>
                    <input type="text" className="fc" value={businessForm.businessName || ''} onChange={(e) => setBusinessForm(p => ({ ...p, businessName: e.target.value.toUpperCase() }))} placeholder="e.g. Macabangon General Store" />
                  </div>
                  <div className="fg">
                    <label className="fl">Nature / Type of Business</label>
                    <input type="text" className="fc" value={businessForm.natureOfBusiness || ''} onChange={(e) => setBusinessForm(p => ({ ...p, natureOfBusiness: e.target.value }))} placeholder="e.g. Retail / Sari-sari Store" />
                  </div>
                  <div className="fg">
                    <label className="fl">Business Address</label>
                    <input type="text" className="fc" value={businessForm.businessAddress || ''} onChange={(e) => setBusinessForm(p => ({ ...p, businessAddress: e.target.value }))} placeholder="Zone / Street Address" />
                  </div>
                </div>

                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary, #3b82f6)', marginBottom: '8px' }}>
                  2. Owner / Applicant Details
                </div>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div className="fg">
                    <label className="fl">First Name *</label>
                    <input type="text" className="fc" value={businessForm.firstName || ''} onChange={(e) => setBusinessForm(p => ({ ...p, firstName: e.target.value.toUpperCase() }))} />
                  </div>
                  <div className="fg">
                    <label className="fl">Middle Name</label>
                    <input type="text" className="fc" value={businessForm.middleName || ''} onChange={(e) => setBusinessForm(p => ({ ...p, middleName: e.target.value }))} />
                  </div>
                  <div className="fg">
                    <label className="fl">Last Name *</label>
                    <input type="text" className="fc" value={businessForm.lastName || ''} onChange={(e) => setBusinessForm(p => ({ ...p, lastName: e.target.value.toUpperCase() }))} />
                  </div>
                </div>

                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary, #3b82f6)', marginBottom: '8px' }}>
                  3. Official Receipt & Fee
                </div>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="fg">
                    <label className="fl">O.R. Number *</label>
                    <input type="text" className="fc" value={businessForm.orNo || ''} onChange={(e) => setBusinessForm(p => ({ ...p, orNo: e.target.value }))} placeholder="e.g. 1234567" />
                  </div>
                  <div className="fg">
                    <label className="fl">Clearance Fee (₱)</label>
                    <input type="number" className="fc" value={businessForm.clearanceFee || ''} onChange={(e) => setBusinessForm(p => ({ ...p, clearanceFee: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div className="fg">
                    <label className="fl">OR Date Issued</label>
                    <input type="date" className="fc" value={businessForm.orDateIssued || ''} onChange={(e) => setBusinessForm(p => ({ ...p, orDateIssued: e.target.value }))} />
                  </div>
                </div>
              </form>
            </div>

            <div className="modal-footer" style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-g" onClick={() => setIsBusinessModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" form="business-clearance-form" className="btn btn-p">
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 8. BLOTTER CERTIFICATE PRINT MODAL CALL ═══ */}
      {/* ═══ 8. BLOTTER CERTIFICATE PRINT MODAL CALL ═══ */}
<BlotterCertificatePrintModal
  isOpen={isPrintModalOpen}
  onClose={() => {
    setIsPrintModalOpen(false);
    setSelectedBlotter(null);
  }}
  blotterData={selectedBlotter ? {
    ...selectedBlotter,
    // ✅ Safe Fallback Mappings para maiwasan ang "undefined" errors sa loob ng Modal
    caseNum: selectedBlotter.caseNum || selectedBlotter.trackingNo || selectedBlotter.id || selectedBlotter._id || 'N/A',
    complainantName: selectedBlotter.complainantName || selectedBlotter.complainant || 'N/A',
    respondentName: selectedBlotter.respondentName || selectedBlotter.respondent || 'N/A',
    dateFiled: selectedBlotter.dateFiled || selectedBlotter.date || 'N/A',
    timeFiled: selectedBlotter.timeFiled || selectedBlotter.incidentTime || selectedBlotter.time || 'N/A',
    incidentType: selectedBlotter.incidentType || selectedBlotter.type || 'N/A',
    narrative: selectedBlotter.narrative || selectedBlotter.details || 'No narrative provided.',
    location: selectedBlotter.location || selectedBlotter.purok || 'Barangay Bustrac',
    status: selectedBlotter.status || 'Pending',
    // ✅ Siguraduhing may laman ang mga signatories
    captainName: systemSettings?.punongBarangay || settingsForm?.punongBarangay || 'HON. ANNABELLE E. RULL',
    secretaryName: systemSettings?.luponSecretary || settingsForm?.luponSecretary || 'MRS. MELY M. PRESADO',
    publicDomain: systemSettings?.publicDomain || settingsForm?.publicDomain || ''
  } : null}
/>
      
      {/* ═══ BARANGAY CLEARANCE PRINT MODAL PORTAL ═══ */}
      {showClearancePrintModal && selectedClearanceCert && createPortal(
        <div 
          className="clearance-print-overlay"
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            backgroundColor: 'rgba(0, 0, 0, 0.85)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            zIndex: 999999, padding: '20px', backdropFilter: 'blur(6px)' 
          }}
          onClick={() => setShowClearancePrintModal(false)}
        >
          <div 
            className="clearance-modal-content"
            style={{ 
              background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '900px', 
              maxHeight: '90vh', display: 'flex', flexDirection: 'column', 
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', overflow: 'hidden', margin: 'auto' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview Wrapper (Gray background para parang tunay na papel) */}
            <div 
              className="print-preview-wrapper"
              style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', justifyContent: 'center', backgroundColor: '#525659' }}
            >
              <div id="printable-certificate-card" style={{ width: '210mm', minHeight: '297mm', backgroundColor: '#ffffff', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                <A4PreviewWrapper>
                  <BarangayClearance data={selectedClearanceCert} />
                </A4PreviewWrapper>
              </div>
            </div>

            {/* Action Buttons (Mawawala ito pag nag-print) */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button type="button" className="btn btn-g" onClick={() => setShowClearancePrintModal(false)}>Close</button>
              <button type="button" className="btn btn-p" onClick={() => window.print()}>🖨️ Print Certificate</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ═══ BUSINESS CLEARANCE PRINT PORTAL / OVERLAY ═══ */}
      {showBusinessPrintModal && selectedBusinessCert && createPortal(
        <div 
          className="business-print-portal" 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999, padding: '20px', backdropFilter: 'blur(6px)' }} 
          onClick={() => setShowBusinessPrintModal(false)}
        >
          <div 
            className="business-print-modal-content" 
            style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '950px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', overflow: 'hidden', margin: 'auto' }} 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview Wrapper (Maging transparent ito pag nag-print) */}
            <div 
              className="business-print-preview-wrapper" 
              style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', justifyContent: 'center', backgroundColor: '#525659' }}
            >
              <div id="printable-business-certificate-card" style={{ width: '210mm', minHeight: '297mm', backgroundColor: '#ffffff', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                <BusinessClearanceTemplate data={selectedBusinessCert} />
              </div>
            </div>
            
            {/* Action Buttons (Mawawala ito pag nag-print) */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button type="button" className="btn btn-g" onClick={() => setShowBusinessPrintModal(false)}>Close</button>
              <button type="button" className="btn btn-p" onClick={handlePrintBusinessDocument}>🖨️ Print Certificate</button>
            </div>
          </div>
        </div>,
        document.body
      )}
                
                <div className="toast-container" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {toasts.map((toast) => (
                    <div 
                      key={toast.id} 
                      className={`toast-notification toast-${toast.type}`}
                      style={{
                        background: toast.type === 'success' ? '#10b981' : '#ef4444',
                        color: '#ffffff',
                        padding: '14px 20px',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        fontWeight: 600,
                        fontSize: '14px',
                        animation: 'slideIn 0.3s ease-out forwards',
                        minWidth: '300px',
                        whiteSpace: 'pre-line'
                      }}
                    >
                      {toast.type === 'success' ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      )}
                      {toast.message}
                    </div>
                  ))}
                </div>

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
