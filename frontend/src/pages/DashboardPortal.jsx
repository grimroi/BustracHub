import React, { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import ResidentsScreen from '../components/screens/ResidentsScreen';
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
import BusinessClearanceTemplate from '../components/certificates/templates/BusinessClearanceTemplate';
import { ThemeToggle } from '../components/ThemeToggle';
import CertificateLifecycle, { CertificateIssuancePrint } from './CertificateLifecycle';
import CertPrintScreen from './CertPrintScreen';
import ResidentCombobox, { formatPurok } from '../components/ResidentCombobox';
import AuditLogView from '../components/AuditLogView';
import SyncStatusIndicator from '../components/SyncStatusIndicator';
import BlotterForm from '../components/BlotterForm';
import { SummonsPanel } from '../components/SummonsPanel';
import { CaseStatusActions } from '../components/CaseStatusActions';
import BlotterCertificatePrintModal from '../components/BlotterCertificatePrintModal';
import { localDb as db, forceSyncToRemote } from '../services/db';
import { createAuditLog, logConflictResolution } from '../utils/auditLog';
import { clearToken } from '../utils/tokenStore';
import { exportToExcel } from '../utils/excelExporter';
import { calculateAge, isValidPHMobile } from '../utils/residentUtils';
import "../styles/lightmode-fix.css";
import { setupPouchDBSync, onSyncStatusChange } from '../services/db';
import '../styles/Announcements.css';
import '../styles/ConflictManagement.css';
import  ResidentForm from '../components/Resident/ResidentForm';
import Swal from 'sweetalert2';
import EditUserModal from '../components/EditUserModal';
import AddUserModal from '../components/AddUserModal';
import LinkResidentModal from '../components/LinkResidentModal';
import { generateRbiId } from '../utils/generateRbiId';
import { parseMoney, formatCurrency } from '../utils/money';
import { matchActiveBlotterCases } from '../utils/blotterMatch';
import { hashPassword } from '../utils/password';
import {
  formatClearanceNo,
  nextAvailableClearanceNo,
  nextAvailableBusinessId,
  collisionSafeId,
} from '../utils/clearanceNumber';
import { computeExpiry, resolveDocumentStatus } from '../utils/verifyDocument';
import CertificatePrintWrapper from "../components/certificates/CertificatePrintWrapper";
import Sidebar from '../components/Layout/Sidebar';
import Topbar from '../components/Layout/Topbar';
import DashboardScreen from '../components/screens/DashboardScreen';
import EventsManagerScreen from '../components/screens/EventsManagerScreen';
import {
  generateUUID,
  addDays,
  escapeHtml,
  toPHDateString,
  toPHDateTimeLocal,
} from '../utils/helpers';
import "../styles/Certificates.css";
import { getApplicantName, normalizeCertType } from '../utils/certHelpers';
import { QRCodeSVG } from 'qrcode.react';
import {
  loadBusinessQrConfig,
  saveBusinessQrConfig,
  normalizeQrConfig,
  buildVerifyUrl,
  validateBaseUrl,
  isLoopbackOrigin,
  resolveVerifyOrigin,
} from '../utils/qrConfig';

const SESSION_TIMEOUT_MIN = Number(import.meta.env.VITE_SESSION_TIMEOUT_MIN) || 15;

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const SCREEN_META = {
  dashboard:            ['Dashboard',                  ''], 
  'events-manage': ['Events Management', 'Community Module'],
  residents:            ['Manage Residents',           'Resident Registry Module'],
  'add-resident':       ['Add New Resident',          'Resident Registry'],
  households:           ['Manage Households',          'Resident Registry'],
  'cert-req':           ['Request & Approval',         'Certificate Issuance Module'],
   'cert-new':   ['New Standard Certificate', 'Certificate Issuance Module'],
  'cert-approve':       ['Certificate Approval',       'Certificate Issuance Module'],
  'cert-print':         ['Issuance & Print',           'Certificate Issuance Module'],
  business_clearance:   ['Business Clearance',       'Certificate Issuance Module'],
  brgy_clearance:       ['Barangay Clearance (Individual)', 'Certificate Issuance Module'],
  programs:             ['Distribution Programs',      'Aid Distribution Module'],
  'aid-encode':         ['Encode Distribution',        'Aid Distribution Module'],
  'aid-logs':           ['Distribution Logs',          'Aid Distribution Module'],
  'add-beneficiary':    ['Add Beneficiaries',          'Aid Distribution Module'],
  'blotter-new':        ['File Blotter Entry',         'Blotter Module'],
  'blotter-manage':     ['Manage Blotter Records',     'Blotter Module'],
  'blotter-detail':     ['Summons & Hearings',          'Blotter Module — Case Management'],
  announcements:        ['Announcements',              'Community Module'],
  feedback:             ['Feedback & Complaints',      'Community Module'],
  conflicts:            ['Conflict Resolution',        'Admin Only — CouchDB Sync Conflicts'],
  audit:                ['Audit Log',                  'Admin Only — Immutable Transaction History'],
  users:                ['Manage Users',               'Admin Only — User Accounts & Roles'],
  reports:              ['Generate Reports',           'Administration'],
  'add-household':      ['Register Household',   'Resident Registry'],
  'edit-household':     ['Edit Household',       'Resident Registry'],
  'view-household':     ['Household Profile',    'Resident Registry'],
  'view-resident':      ['Resident Profile',     'Resident Registry'],
  'edit-resident':      ['Edit Resident',        'Resident Registry'],
  'activities-manage':  ['Manage Activities', 'Community Module'],
};

export const EMPTY_RESIDENT = {
  rbiNo: '',
  philSysNo: '', 
  status: 'Active', 
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

const INITIAL_BUSINESS_STATE = {
  bcIdNo: '',
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
  status: '',
  clearanceIssueDate: '',
  expiryDate: '',
  _id: null,
  _rev: null
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

const getAge = (bdate) => {
  if (!bdate) return '—';
  const diff = Date.now() - new Date(bdate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
};

const formatCertType = (type) => {
  const map = {
    'barangay_clearance': 'Barangay Clearance',
    'business_clearance': 'Business Clearance',
    'indigency': 'Certificate of Indigency',
    'residency': 'Certificate of Residency'
  };
  return map[type] || 'Certificate';
};

// ─────────────────────────────────────────────
// CONFLICT MANAGEMENT HELPERS
// ─────────────────────────────────────────────
// Fields that never make sense to show as "changed" in a conflict diff.
const CONFLICT_IGNORED_FIELDS = new Set([
  '_id', '_rev', '_conflicts', '_revisions', '_attachments', '_deleted',
  '_conflictResolved', '_local_seq', 'history', 'synced', 'isSynced',
  'updatedAt', 'createdAt', 'passwordHash', 'password', 'userPassword', 'tempPassword',
]);

const CONFLICT_FIELD_LABELS = {
  firstName: 'First Name',
  lastName: 'Last Name',
  middleName: 'Middle Name',
  name: 'Name',
  fullName: 'Full Name',
  purok: 'Purok',
  purokZoneAddress: 'Purok',
  addressZoneAddress: 'Address',
  address: 'Address',
  contact: 'Contact Number',
  contactNumber: 'Contact Number',
  contactNumber2: 'Alternate Contact',
  status: 'Status',
  civilStatus: 'Civil Status',
  civilStatusOther: 'Civil Status (Other)',
  sex: 'Sex',
  gender: 'Gender',
  birthdate: 'Birth Date',
  birthDate: 'Birth Date',
  age: 'Age',
  citizenship: 'Citizenship',
  religion: 'Religion',
  occupation: 'Occupation',
  residentType: 'Resident Type',
  isArchived: 'Archived',
  hasAccount: 'Has Account',
  email: 'Email',
  certType: 'Certificate Type',
  certPurpose: 'Purpose',
  residentName: 'Resident Name',
};

// Record type → human module label (used for the summary chip and filter).
const CONFLICT_MODULE_LABELS = {
  resident: 'Residents',
  profile: 'Residents',
  household: 'Households',
  household_request: 'Households',
  certificate_request: 'Certificates',
  certificate: 'Certificates',
  blotter: 'Blotter',
  blotter_record: 'Blotter',
  announcement: 'Announcements',
  program: 'Programs',
  equipment: 'Equipment',
  medicine: 'Medicine',
  inventory: 'Inventory',
  user: 'Users',
  account_request: 'Account Requests',
  resident_account_request: 'Account Requests',
  feedback: 'Feedback',
  document: 'Documents',
  document_request: 'Documents',
};

const prettifyConflictField = (field) => {
  const key = String(field || '');
  if (!key) return 'Field';
  return key
    .replace(/^_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const conflictModuleLabel = (type) => {
  const key = String(type || '').toLowerCase();
  if (CONFLICT_MODULE_LABELS[key]) return CONFLICT_MODULE_LABELS[key];
  if (!key) return 'Records';
  return `${prettifyConflictField(key)}s`;
};

const conflictFieldLabel = (field) => {
  const key = String(field || '');
  if (!key || CONFLICT_IGNORED_FIELDS.has(key)) return null;
  return CONFLICT_FIELD_LABELS[key] || prettifyConflictField(key);
};

const formatConflictValue = (value) => {
  if (value === undefined || value === null) return '—';
  if (value === '') return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.length === 0 ? '(none)' : value.map((v) => formatConflictValue(v)).join(', ');
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return '[object]'; }
  }
  return String(value);
};

const normalizeConflictValue = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

// Compare two revisions and return only the fields that actually differ.
const computeConflictDiff = (docA, docB) => {
  const a = docA || {};
  const b = docB || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs = [];
  for (const key of keys) {
    const label = conflictFieldLabel(key);
    if (!label) continue;
    if (normalizeConflictValue(a[key]) === normalizeConflictValue(b[key])) continue;
    diffs.push({
      field: key,
      label,
      valueA: formatConflictValue(a[key]),
      valueB: formatConflictValue(b[key]),
    });
  }
  return diffs;
};

const conflictDocTime = (doc) => {
  const raw = doc && (doc.updatedAt || doc.createdAt);
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const formatConflictTime = (value) => {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
};

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

// ─────────────────────────────────────────────
// ADMIN-ONLY SCREEN GUARD
// ─────────────────────────────────────────────
const ADMIN_ONLY_SCREENS = ['conflicts', 'audit', 'users', 'officials'];

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
     sla: doc.sla || null,
     attachments: doc.attachments || [], 
    rawDoc: doc
  };
};

// ── Helper: Kunin ang next Business ID at i-increment ang sequence (TOTOONG SAVE) ──
const getNextBusinessSequence = async () => {
  const existing = businessMasterlist.map((r) => r.bcIdNo);
  for (let attempt = 0; attempt < 5; attempt += 1) {
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
      return nextAvailableBusinessId(existing, String(nextNumber).padStart(4, '0'));
    } catch (err) {
      if (err && (err.status === 409 || err.name === 'conflict')) continue;
      console.error('Failed to get business sequence:', err);
      break;
    }
  }
  // Fallback kung may error sa DB
  return nextAvailableBusinessId(existing, String(Date.now()).slice(-4));
};

// ── HELPER: Convert Base64 Data URL to Blob for PouchDB Native Attachments ──
const dataURLtoBlob = (dataURL) => {
  try {
    const byteString = atob(dataURL.split(',')[1]);
    const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  } catch (err) {
    console.error('Failed to convert data URL to Blob:', err);
    return null;
  }
};

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  }
});

// Shared status badge used by the clearance masterlists. Derived from the same
// resolver the public verification page uses, so it cannot drift from it.
const STATUS_BADGE_STYLES = {
  valid: { bg: 'rgba(52, 211, 153, 0.15)', fg: '#34d399' },
  invalid: { bg: 'rgba(248, 113, 113, 0.15)', fg: '#f87171' },
  expired: { bg: 'rgba(248, 113, 113, 0.15)', fg: '#f87171' },
  pending: { bg: 'rgba(251, 191, 36, 0.15)', fg: '#fbbf24' },
  unverified: { bg: 'rgba(148, 163, 184, 0.18)', fg: '#94a3b8' },
};

const StatusBadge = ({ doc }) => {
  const result = resolveDocumentStatus(doc);
  const styles = STATUS_BADGE_STYLES[result.key] || STATUS_BADGE_STYLES.unverified;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        background: styles.bg,
        color: styles.fg,
      }}
    >
      {result.label}
    </span>
  );
};

const MASTERLIST_PAGE_SIZE = 10;

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function DashboardPortal({ role = 'staff' }) {
  
  const [viewMode, setViewMode] = useState('active'); 
const hasMountedRef = useRef(false);
const [isBusinessModalOpen, setIsBusinessModalOpen] = useState(false);
const [businessModalMode, setBusinessModalMode] = useState('edit');
const [showBlotterModal, setShowBlotterModal] = useState(false);
const [credentialsModal, setCredentialsModal] = useState(null);
const [showAddResidentModal, setShowAddResidentModal] = useState(false);
const businessFormRef = useRef(null);
const businessFieldRefs = useRef({});
const navRef = useRef(null);  
const [isSavingClearance, setIsSavingClearance] = useState(false);
const [isSavingBusiness, setIsSavingBusiness] = useState(false);
const [businessErrors, setBusinessErrors] = useState({});
const [isSavingStandardCert, setIsSavingStandardCert] = useState(false);
const [showBusinessPrintModal, setShowBusinessPrintModal] = useState(false);
const [selectedBusinessCert, setSelectedBusinessCert] = useState(null);
const [businessQrConfig, setBusinessQrConfig] = useState(() => normalizeQrConfig());
const [qrConfigForm, setQrConfigForm] = useState(() => normalizeQrConfig());
const [isSavingQrConfig, setIsSavingQrConfig] = useState(false);

const qrBaseUrlValidation = useMemo(() => validateBaseUrl(qrConfigForm.baseUrl), [qrConfigForm.baseUrl]);
const qrResolvedOrigin = useMemo(() => resolveVerifyOrigin(qrConfigForm), [qrConfigForm]);
const qrPointsToLoopback = useMemo(() => isLoopbackOrigin(qrResolvedOrigin), [qrResolvedOrigin]);
 const [showCertDispatcher, setShowCertDispatcher] = useState(false);
 const [pendingStandardCert, setPendingStandardCert] = useState(false);
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
  const [blotterList, setBlotterList] = useState([]);

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
    assignedTo: 'Juhairo Macabangon', 
    attachment: null,
    response: 'Good day! You can upload 1 valid government ID in the Document Request screen panel. Processing takes 1-2 business days.',
    handledBy: 'Juhairo Macabangon', 
    dateResolved: 'Apr 5, 2026, 4:12 PM'
  }
]);

  const settledBlotterCount = blotterList.filter(b => b.status === 'Settled / Resolved' || b.status === 'Settled').length;
  const cfaBlotterCount = blotterList.filter(b => b.cfaIssued || b.status === 'Referred to PNP (CFA Issued)').length;
  const activeBlotterCount = blotterList.filter(b => b.status === 'Pending' || b.status === 'Open' || b.status === 'Under Mediation').length;

  const feedbackSummary = {
  complaint: feedbackList.filter(f => (f.type || f.feedbackType) === 'Complaint').length,
  inquiry: feedbackList.filter(f => (f.type || f.feedbackType) === 'Inquiry').length,
  suggestion: feedbackList.filter(f => (f.type || f.feedbackType) === 'Suggestion').length
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
  const [printData, setPrintData] = useState(null);
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
  const [isDbProcessing, setIsDbProcessing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);     
const [pendingCount, setPendingCount] = useState(0);  
    const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success') => {
  const VALID_TYPES = ['success', 'error', 'warning', 'info'];
  if (typeof message === 'string' && VALID_TYPES.includes(message.toLowerCase()) && typeof type === 'string' && !VALID_TYPES.includes(type.toLowerCase())) {
    const swapped = type;
    type = message;
    message = swapped;
  }
  const id = Date.now();
  setToasts((prev) => [...prev, { id, message, type }]);
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 4000);
}, []);   // ← walang external deps, kaya stable


  const notifyDesktop = useCallback((title, body, options = {}) => {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const isTabActive = document.visibilityState === 'visible' && document.hasFocus();
  if (isTabActive && !options.force) return;

  try {
    const n = new Notification(title, {
      body,
      icon: logo,
      badge: logo,
      tag: options.tag || 'bustrac-general',
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
    });
    n.onclick = () => {
      window.focus();
      if (options.onClick) options.onClick();
      n.close();
    };
    if (!options.requireInteraction) setTimeout(() => n.close(), 6000);
  } catch (err) {
    console.warn('Desktop notification failed:', err);
  }
}, []);

  // ── DESKTOP NOTIFICATION PERMISSION HANDLER ──
const requestNotificationPermission = useCallback(() => {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        if (typeof showToast === 'function') {
          showToast("✅ Desktop notifications enabled! You will now receive real-time alerts.", "success");
        }
      }
    });
  }
}, []);

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
    if (!db?.createIndex) return;
    try {
      await db.createIndex({ index: { fields: ['type', 'status'] } });
      await db.createIndex({ index: { fields: ['type', 'createdAt'] } });
      await db.createIndex({ index: { fields: ['type', 'residentId'] } });
      await db.createIndex({ index: { fields: ['type', 'updatedAt'] } });
      await db.createIndex({ index: { fields: ['type', 'timestamp'] } });
      console.log('✅ Mango indexes ready');
    } catch (err) {
      console.warn('Index creation skipped:', err.message);
    }
  };
  setupIndexes();
}, []);
  
// ═══════════════════════════════════════════════════════════
// CONSOLIDATED POUCHDB LIVE LISTENER
// Isang listener para sa lahat ng real-time updates
// ═══════════════════════════════════════════════════════════
useEffect(() => {
  if (!db || typeof db.changes !== 'function') return;
  let isMounted = true;
  let debounceTimer = null;
  const pendingUpdates = new Map(); // docId → doc

  const flushUpdates = () => {
  if (!isMounted || pendingUpdates.size === 0) return;

  const byType = new Map();
  pendingUpdates.forEach((doc) => {
    const type = doc.type || doc.docType || 'unknown';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(doc);
  });
  pendingUpdates.clear();

  byType.forEach((docs, type) => {
    switch (type) {
      case 'certificate_request':
        startTransition(() => {  // ✅ IDAGDAG
          setIssuedCertificates((prev) => {
            const map = new Map(prev.map((c) => [c._id, c]));
            docs.forEach((d) => map.set(d._id, d));
            return Array.from(map.values());
          });
        });
        break;

      case 'blotter':
      case 'blotter_record':
      case 'blotter_report':
        startTransition(() => {  // ✅ IDAGDAG
          setBlotterList((prev) => {
            const mapped = docs.map(mapDocToBlotter).filter(Boolean);
            const map = new Map(prev.map((b) => [b._id || b.id, b]));
            mapped.forEach((b) => map.set(b._id || b.id, b));
            return Array.from(map.values());
          });
        });
        break;

      case 'feedback':
      case 'feedback_report':
        startTransition(() => {  // ✅ IDAGDAG
          setFeedbackList((prev) => {
            const mapped = docs.map(mapDocToFeedback);
            const map = new Map(prev.map((f) => [f._id || f.id, f]));
            mapped.forEach((f) => map.set(f._id || f.id, f));
            return Array.from(map.values());
          });
        });
        break;

      case 'aid_distribution':
        startTransition(() => {  // ✅ IDAGDAG
          setAidLogs((prev) => {
            const map = new Map(prev.map((l) => [l._id || l.id, l]));
            docs.forEach((d) => map.set(d._id, d));
            return Array.from(map.values());
          });
        });
        break;

      case 'announcement':
        startTransition(() => {  // ✅ IDAGDAG
          setAnnouncementsList((prev) => {
            const map = new Map(prev.map((a) => [a._id || a.id, a]));
            docs.forEach((d) => map.set(d._id, d));
            return Array.from(map.values());
          });
        });
        break;

      case 'barangay_clearance':
        startTransition(() => {  // ✅ IDAGDAG
          setClearanceList((prev) => {
            const map = new Map(prev.map((c) => [c._id, c]));
            docs.forEach((d) => map.set(d._id, d));
            return Array.from(map.values());
          });
        });
        break;

      case 'business_clearance':
        startTransition(() => {  // ✅ IDAGDAG
          setBusinessMasterlist((prev) => {
            const map = new Map(prev.map((c) => [c._id, c]));
            docs.forEach((d) => map.set(d._id, d));
            return Array.from(map.values());
          });
        });
        break;

      case 'audit_log':
        startTransition(() => {  // ✅ IDAGDAG
          setRecentLogs((prev) => {
            const map = new Map(prev.map((l) => [l._id, l]));
            docs.forEach((d) => map.set(d._id, d));
            return Array.from(map.values())
              .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0))
              .slice(0, 5);
          });
        });
        break;

        case 'event_registration':
case 'barangay_event':
  window.dispatchEvent(new CustomEvent('bustrac-events-updated'));
  break;

      default:
        docs.forEach((doc) => {
          if (doc._id?.startsWith('BLT-')) {
            startTransition(() => {  // ✅ IDAGDAG
              setBlotterList((prev) => {
                const map = new Map(prev.map((b) => [b._id || b.id, b]));
                map.set(doc._id, mapDocToBlotter(doc));
                return Array.from(map.values());
              });
            });
          }
        });
        break;
    }
  });
};

  const changes = db.changes({
    since: 'now',
    live: true,
    include_docs: true,
  })
    .on('change', (change) => {
      if (!isMounted || !change.doc) return;

      // I-queue ang update
      if (change.deleted) {
        // Handle deletion — remove from pending
        pendingUpdates.delete(change.id);
      } else {
        pendingUpdates.set(change.id, change.doc);
      }

      // ✅ Debounce: i-flush pagkatapos ng 150ms ng katahimikan
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushUpdates, 500);
    })
    .on('error', (err) => {
      console.error('❌ Consolidated listener error:', err);
    });

  return () => {
    isMounted = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    changes.cancel();
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
 const [residentPhotoFile, setResidentPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [isSavingResident, setIsSavingResident] = useState(false);
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);

  // Multi-select States for the Residents
  const [selectedResidents, setSelectedResidents] = useState([]);
  
  const [archivedResidents, setArchivedResidents] = useState([]);
  // State for search input text
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('All Gender');
  
  const [residentSort, setResidentSort] = useState({
  key: null,
  direction: 'none'
  });

   // ============ PH HOLIDAY + WEEKEND GUARD ============
  const PH_FIXED_HOLIDAYS = [
    { md: '01-01', name: "New Year's Day" },
    { md: '04-09', name: 'Araw ng Kagitingan' },
    { md: '05-01', name: 'Labor Day' },
    { md: '06-12', name: 'Independence Day' },
    { md: '08-21', name: 'Ninoy Aquino Day' },
    { md: '11-01', name: "All Saints' Day" },
    { md: '11-02', name: "All Souls' Day" },
    { md: '11-30', name: 'Bonifacio Day' },
    { md: '12-08', name: 'Immaculate Conception' },
    { md: '12-25', name: 'Christmas Day' },
    { md: '12-30', name: 'Rizal Day' },
    { md: '12-31', name: "Last Day of the Year" },
  ];

// Movable holidays — i-update kada taon (Holy Week, Eid'l Fitr/Adha, National Heroes Day)
const PH_MOVABLE_HOLIDAYS = {
  2024: ['2024-03-28','2024-03-29','2024-03-30','2024-04-10','2024-06-17','2024-08-26'],
  2025: ['2025-04-17','2025-04-18','2025-04-19','2025-03-31','2025-06-06','2025-08-25'],
  2026: ['2026-04-02','2026-04-03','2026-04-04','2026-03-20','2026-05-27','2026-08-31'],
  2027: ['2027-03-25','2027-03-26','2027-03-27','2027-03-10','2027-05-17','2027-08-30'],
};

const getHolidayName = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  const md = `${m}-${d}`;

  const fixed = PH_FIXED_HOLIDAYS.find(h => h.md === md);
  if (fixed) return fixed.name;

  const yearList = PH_MOVABLE_HOLIDAYS[Number(y)];
  if (yearList && yearList.includes(dateStr)) {
    return 'Movable Holiday (Holy Week / Eid / Special)';
  }
  return null;
};

const handleScheduleDateChange = (e) => {
  const selectedValue = e.target.value;
  if (!selectedValue) {
    setScheduleDate("");
    return;
  }

  // selectedValue format: "YYYY-MM-DDTHH:mm"
  const datePart = selectedValue.split('T')[0];
  const selectedDate = new Date(`${datePart}T00:00:00`);
  const dayOfWeek = selectedDate.getDay(); // 0 = Sun, 6 = Sat

  // 1) Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
   showToast('error', 'Ang Barangay Hall ay sarado tuwing Sabado at Linggo.\n\nMangyaring pumili ng Lunes hanggang Biyernes.');
    e.target.value = scheduleDate || "";
    return;
  }

  // 2) Philippine holiday check
  const holidayName = getHolidayName(datePart);
  if (holidayName) {
   showToast('error', `Ang napiling petsa ay isang Philippine Holiday:\n\n${holidayName}\n\nMangyaring pumili ng ibang araw.`);
    e.target.value = scheduleDate || "";
    return;
  }

  // 3) Optional: office hours lang (8AM – 5PM)
  const timePart = selectedValue.split('T')[1] || "";
  const [hh] = timePart.split(':').map(Number);
  if (!Number.isNaN(hh) && (hh < 8 || hh >= 17)) {
 showToast('error', 'Ang oras ng pagtanggap ay 8:00 AM – 5:00 PM lamang (Lunes–Biyernes).');
    e.target.value = scheduleDate || "";
    return;
  }

  setScheduleDate(selectedValue);
};

const now = new Date();
now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
const minDateTime = now.toISOString().slice(0, 16);

  const [residentsList, setResidentsList] = useState([]);  
  const [isResidentsLoading, setIsResidentsLoading] = useState(true);
  const [isHouseholdsLoading, setIsHouseholdsLoading] = useState(true);
   
 const fetchResidents = useCallback(async () => {
  if (typeof db === 'undefined') return;
  setIsResidentsLoading(true);
  try {
    // ✅ Optimized: Mango indexed query instead of full DB scan
    const result = await db.find({
      selector: {
        $or: [
          { type: 'residents' },
          { type: 'resident' },
          { type: 'profile' },
          { _id: { $gte: 'RES-', $lt: 'RES-\uffff' } },
        ],
      },
      limit: 2000,
    });
    const allDocs = result.docs;

    // ✅ Lightweight conflict check (metadata only, no docs loaded)
    let conflictedIds = new Set();
    try {
      const conflictResult = await db.allDocs({ conflicts: true });
      conflictResult.rows.forEach((row) => {
        if (row.value?.conflicts?.length > 0) {
          conflictedIds.add(row.id);
        }
      });
    } catch (conflictErr) {
      console.warn('Conflict check skipped:', conflictErr.message);
    }

    const formattedResidents = allDocs.map((doc) => {
      const residentFormFields = Object.fromEntries(
        Object.keys(EMPTY_RESIDENT).map((field) => [field, doc[field] ?? EMPTY_RESIDENT[field]])
      );
      return {
        ...residentFormFields,
        id: doc._id || doc.id,
        rbiId: doc.rbiId || doc.rbiNo || '—',
        rbiNo: doc.rbiNo || doc.rbiId || '',
        name: doc.name || `${doc.firstName || ''} ${doc.lastName || ''}`.trim(),
        purok: doc.purok || doc.purokZoneAddress || 'Unassigned',
        purokZoneAddress: doc.purokZoneAddress || doc.purok || '',
        age: doc.age || '—',
        civilStatus: doc.civilStatus || 'Single',
        voter: doc.voter !== undefined ? doc.voter : Boolean(doc.isRegisteredVoter),
        household: doc.household || doc.householdNo || '—',
        householdNo: doc.householdNo || doc.household || '',
        isHouseholdHead: doc.isHouseholdHead ?? doc.householdHead ?? false,
        contactNo: doc.contactNo || doc.contact || '',
        purokClass: doc.purokClass || 'g',
        conflict: conflictedIds.has(doc._id), // ✅ Uses pre-computed Set, walang `.includes()` sa loob ng loop
        hasAccount: doc.hasAccount || false,
        isArchived: doc.isArchived || false,
        createdAt: doc.createdAt || '',
      };
    });
    setResidentsList(formattedResidents);
  } catch (err) {
    console.error('Error fetching residents:', err);
  } finally {
    setIsResidentsLoading(false);
  }
}, []);

useEffect(() => {
  fetchResidents();
}, [fetchResidents, viewMode]);   

  // ── DYNAMIC AID PROGRAMS STATE (2026 REALISTIC INITIAL DATA WITH V2 CACHE) ──
  const [programsList, setProgramsList] = useState([]);
  

useEffect(() => {
  const loadProgramsFromDB = async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const dbPrograms = result.rows
        .map(r => r.doc)
        .filter(doc => doc?.type === 'program');
      
      if (dbPrograms.length > 0) {
        const cleaned = dbPrograms.map(p => ({
          id: p.id,
          title: p.title,
          status: p.status,
          dateLabel: p.dateLabel,
          target: p.target,
          note: p.note,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
        setProgramsList(cleaned);
      }
    } catch (err) {
      console.warn('Failed to load programs from PouchDB:', err);
    }
  };
  const timer = setTimeout(loadProgramsFromDB, 1000);
  return () => clearTimeout(timer);
}, []);

  useEffect(() => {
    const loadHouseholdsFromDB = async () => {
      setIsHouseholdsLoading(true); // ✅ Set to true BEFORE fetch
      try {
        const result = await db.allDocs({ include_docs: true });
        const dbHouseholds = result.rows
          .map(r => r.doc)
          .filter(doc => doc?.type === 'household');
        
        if (dbHouseholds.length > 0) {
          const cleaned = dbHouseholds.map(h => ({
            id: h.id || h._id,
            head: h.head,
            address: h.address,
            purok: h.purok,
            purokClass: h.purokClass || 'b',
            members: h.members || 0,
            createdAt: h.createdAt || '',
          }));
          setHouseholdsList(cleaned);
        }
      } catch (err) {
        console.warn('Failed to load households from PouchDB:', err);
      } finally {
        setIsHouseholdsLoading(false); // ✅ Set to false AFTER fetch
      }
    };
    loadHouseholdsFromDB();
  }, []);

useEffect(() => {
  const loadAdvisoriesFromDB = async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const dbAdvisories = result.rows
        .map(r => r.doc)
        .filter(doc => doc?.type === 'advisory');
      
      if (dbAdvisories.length > 0) {
        setAdvisoriesList(dbAdvisories);
      }
    } catch (err) {
      console.warn('Failed to load advisories from PouchDB:', err);
    }
  };
  const timer = setTimeout(loadAdvisoriesFromDB, 1000);
  return () => clearTimeout(timer);
}, []);


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



// Control state for the inline input form of the New Program
const [showNewProgramForm, setShowNewProgramForm] = useState(false);
const [showAddProgramModal, setShowAddProgramModal] = useState(false);
const [newProgramTitle, setNewProgramTitle] = useState('');
const [newProgramTarget, setNewProgramTarget] = useState(100);
const [newProgramStatus, setNewProgramStatus] = useState('Active');

// ──FUNCTION: ADD A NEW PROGRAM TO THE REGISTRY ──
const handleCreateProgram = async (e) => {
  e.preventDefault();
  if (!newProgramTitle.trim()) {
  showToast('error', 'Please enter the Program name.');
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
    target: Number(newProgramTarget),
    note: newProgramStatus === 'Upcoming' ? `Scheduled ${months[new Date().getMonth() + 1]} 15` : ''
  };

  try {
    await db.put({
      _id: `program_${generatedId}`,
      type: 'program',
      ...newProgram,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to save program to PouchDB:', err);
  }

  setProgramsList([...programsList, newProgram]);
 showToast('success', `Program ${generatedId} created successfully!`);
  
  setNewProgramTitle('');
  setNewProgramTarget(100);
  setNewProgramStatus('Active');
  setShowNewProgramForm(false);
};



  // ──  We will use this to remember which Resident ID is currently being updated ──
  const [editingResidentId, setEditingResidentId] = useState(null);
  
  const [issuedCertificates, setIssuedCertificates] = useState([]);
  const [issuedHistorySearch, setIssuedHistorySearch] = useState('');
  const [issuedCertificateSearch, setIssuedCertificateSearch] = useState('');
  
  // Certificate / Clearance States
const [showCertRequestModal, setShowCertRequestModal] = useState(false);
const [certRequestType, setCertRequestType] = useState('');
const [certRequestForm, setCertRequestForm] = useState({
  requesterName: '',
  requesterId: '',
  businessName: '',
  businessAddress: '',
  businessType: '',
  purpose: '',
  orNumber: '',
  orDate: '',
  amountPaid: '',
  remarks: ''
});
const [standardCertForm, setStandardCertForm] = useState({
  residentId: '',
  certificateType: 'indigency',
  purpose: '',
});

const openCertRequestForm = useCallback((type) => {
  setCertRequestType(type);
  setCertRequestForm({
    requesterName: '',
    requesterId: '',
    businessName: '',
    businessAddress: '',
    businessType: '',
    purpose: '',
    orNumber: '',
    orDate: new Date().toISOString().split('T')[0],
    amountPaid: '',
    remarks: ''
  });
  setShowCertRequestModal(true);
}, []);

const closeCertRequestForm = useCallback(() => {
  setShowCertRequestModal(false);
  setCertRequestType('');
  setIsSubmittingCert(false);
}, []);

const [isSubmittingCert, setIsSubmittingCert] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
const itemsPerPage = 10;

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

const safeFilteredCerts = filteredIssuedCertificates || [];
const indexOfLastItem = currentPage * itemsPerPage;
const indexOfFirstItem = indexOfLastItem - itemsPerPage;
const currentItems = safeFilteredCerts.slice(indexOfFirstItem, indexOfLastItem);
const totalPages = Math.ceil(safeFilteredCerts.length / itemsPerPage);


const handleReleaseDocument = async (cert) => {
  try {
    const result = await Swal.fire({
      title: 'Release Certificate?',
      text: `Mark ${cert.firstName} ${cert.lastName}'s ${cert.certificateType} as officially released?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Release it!',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'rounded-xl',
        confirmButton: 'font-bold px-4 py-2 rounded-lg',
        cancelButton: 'font-bold px-4 py-2 rounded-lg',
      },
    });

    if (!result.isConfirmed) return;

    const latestDoc = await db.get(cert._id);
    const now = new Date().toISOString();

    const updatedCert = {
      ...latestDoc,
      status: 'Released',
      step: 6,
      releasedAt: now,
      updatedAt: now,
    };

    await db.put(updatedCert);

    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'RELEASE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: cert._id,
        details: `Released ${cert.certificateType || 'Certificate'} to ${cert.firstName || ''} ${cert.lastName || ''}`,
      });
    }

    if (typeof setIssuedCertificates === 'function') {
      setIssuedCertificates((prev) =>
        prev.map((c) => (c._id === cert._id ? updatedCert : c))
      );
    }

    await Swal.fire({
      icon: 'success',
      title: 'Released Successfully!',
      text: 'The certificate has been marked as released.',
      timer: 2000,
      showConfirmButton: false,
    });
  } catch (e) {
    console.error('Failed to release certificate:', e);

    await Swal.fire({
      icon: 'error',
      title: 'Failed to Release',
      text:
        e.message ||
        'An error occurred while updating the database. Please try again.',
    });
  }
};

// ════════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH: CERTIFICATE REAL-TIME LISTENER
// ════════════════════════════════════════════════════════════════

useEffect(() => {
  if (!db || typeof db.allDocs !== 'function') return;
  let isMounted = true;

  const fetchInitialCerts = async () => {
  try {
    const result = await db.find({
      selector: { type: 'certificate_request' },
      limit: 1000,
    });
    if (!isMounted) return;
    setIssuedCertificates(result.docs);
  } catch (err) {
    console.error("Error loading initial certs:", err);
  }
};
  fetchInitialCerts();

  /*
  const changes = db.changes({
    since: 'now',
    live: true,
    include_docs: true,
    filter: (doc) => doc.type === 'certificate_request'
  })
  .on('change', (change) => {
    if (!isMounted || !change.doc) return;
    const doc = change.doc;

    // ─── Notify only for BRAND-NEW requests ───
    const isNewRequest =
      doc.step === 1 &&
      ['Under Review', 'Pending', 'Proceeding'].includes(doc.status);

    // Guard: huwag i-notify kung self-created (optional but recommended)
    const isSelfCreated = doc.createdBy && doc.createdBy === currentUser?.username;

    if (isNewRequest && !isSelfCreated) {
      const applicant = `${doc.firstName || ''} ${doc.lastName || ''}`.trim() || 'Resident';
      notifyDesktop(
        '📄 New Certificate Request',
        `${applicant} — ${doc.certificateType || 'Certificate'}`,
        {
          tag: `cert-${doc._id}`,
          onClick: () => navRef.current?.('cert-approve'),
        }
      );
    }
  })
  .on('error', (err) => {
    console.error('PouchDB cert changes listener error:', err);
  });

  return () => {
    isMounted = false;
    changes.cancel();
  };
  */
}, [notifyDesktop]); 

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
  const { firstName, middleName, lastName, civilStatus, purok, household, birthdate } = residentForm;
  const updatedName = middleName ? `${lastName}, ${firstName} ${middleName}` : `${lastName}, ${firstName}`;
  
  // 1. Update React State (Instant UI Feedback)
  setResidentsList(prev => prev.map(res => {
    if (res.id === editingResidentId) {
      return {
        ...res,
        firstName,
        lastName,
        middleName,
        name: updatedName,
        civilStatus,
        purok,
        household,
        age: birthdate ? new Date().getFullYear() - new Date(birthdate).getFullYear() : res.age
      };
    }
    return res;
  }));

  // 2. Update PouchDB (Permanent Save & Sync)
  try {
    const existingDoc = await db.get(editingResidentId);
    await db.put({
      ...existingDoc,
      firstName,
      lastName,
      middleName,
      name: updatedName,
      civilStatus,
      purok,
      household,
      birthdate,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('PouchDB update skipped (might be mock data or offline):', err);
  }

  // 3. Audit Log
  await createAuditLog({
    action: 'UPDATE',
    module: 'RESIDENTS',
    recordId: editingResidentId,
    details: `Updated resident record: ${updatedName}`,
  });

 showToast('success', 'Resident record updated successfully!');
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
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  // ── Sort order for address/purok column ──
  const [addressSortOrder, setAddressSortOrder] = useState('none'); // 'none', 'asc', o 'desc'

  // ──────────────────────────────────────────────────────────────────────
  // HOUSEHOLD CORE FILTER STATES
  // ──────────────────────────────────────────────────────────────────────
  const [householdSearch, setHouseholdSearch] = useState('');
  const [purokFilter, setPurokFilter] = useState('All Puroks'); 
  const [householdPurokFilter, setHouseholdPurokFilter] = useState('All Puroks'); 
  
  
  // 1. This already includes setHouseholdsList and a localStorage loading pattern
  const [householdsList, setHouseholdsList] = useState([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState(null);
  const [selectedHousehold, setSelectedHousehold] = useState(null);
  const EMPTY_HOUSEHOLD = { head: '', address: '', purok: '' };
  const [householdForm, setHouseholdForm] = useState(EMPTY_HOUSEHOLD);
  const [householdAssignmentMode, setHouseholdAssignmentMode] = useState('existing');
  const [saving, setSaving] = useState(false);
  
  const [showEditHouseholdModal, setShowEditHouseholdModal] = useState(false);
  const [isBlottersLoading, setIsBlottersLoading] = useState(true);

// 2. Derived array for dynamic sorting based on active sort order state
const sortedHouseholds = useMemo(() => {
  return [...householdsList].sort((a, b) => {
    if (addressSortOrder === 'asc') return a.address.localeCompare(b.address);
    if (addressSortOrder === 'desc') return b.address.localeCompare(a.address);
    return 0;
  });
}, [householdsList, addressSortOrder]);
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
  const nav = useCallback((id) => {
  if (ADMIN_ONLY_SCREENS.includes(id) && role !== 'admin') {
    showToast('Access denied. Admin-only module.', 'error');
    return;
  }
  setScreen(id);
  navigate(`?page=${id}`);
  window.history.pushState({ internalScreen: id }, '', '');
}, [navigate, role, showToast]);

const handleNav = useCallback((target) => {
  if (target === 'add-resident') {
    setShowAddResidentModal(true);
    setScreen('residents');
    navigate('?page=residents');
    window.history.pushState({ internalScreen: 'residents' }, '', '');
    return;
  }
  
  nav(target);
}, [nav, navigate]);

  const logout = useCallback(() => {
  localStorage.removeItem('bustrac_user');
  localStorage.removeItem('bustrac_role');
  localStorage.removeItem('bustrac_offline_auth');
  localStorage.removeItem('bustrac_loginTime');
  sessionStorage.removeItem('bustrac_user');
  // Clear the online session token. Note: deleting the client-side
  // token does NOT revoke the server session (in-memory SESSIONS Map,
  // 8h TTL). A server logout endpoint is planned for a later phase.
  clearToken();
  navigate('/login');
}, [navigate]);

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
    showToast(
      `✓ Complaint BLT-2024-041 updated successfully!\n\nChanges saved:\n• Complainant: ${compName}\n• Respondent: ${respName}\n• Incident Type: ${incidentType}\n• Status: ${status}\n• Location: ${location}\n\nAll changes recorded in audit log.`,
      'success'
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
     showToast('error', 'Please set date and time for appearance');
      return;
    }
    const methods = [];
    if (sendSMS)   methods.push('SMS');
    if (sendEmail) methods.push('Email');
    if (methods.length === 0) {
     showToast('error', 'Please select at least one notification method');
      return;
    }
    const confirmMsg = `Send summons to ${respName} via ${methods.join(' and ')}?\n\nAppearance: ${summonDate} at ${summonTime}\n\nThis action will be recorded in the audit log.`;
    if (window.confirm(confirmMsg)) {
      showToast(
        `✓ Summons sent successfully via ${methods.join(' and ')}!\n\nNotification recorded: BLT-2024-041\nRespondent: ${respName}\nScheduled: ${summonDate} ${summonTime}`,
        'success'
      );
    }
  };

  // ─────────────────────────────────────────────
  // HANDLERS — ADMIN RESIDENT FORM
  // ─────────────────────────────────────────────
  const updateResidentField = (field, value) =>
    setResidentForm((prev) => ({ ...prev, [field]: value }));
  
  const handlePhotoChange = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 250;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else if (height > MAX_SIZE) {
        width *= MAX_SIZE / height;
        height = MAX_SIZE;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

      setResidentPhotoFile(file);
      setPhotoPreviewUrl(compressedBase64);
      updateResidentField('photoUrl', compressedBase64);
    };

    img.src = event.target.result;
  };

  reader.readAsDataURL(file);
};

  const handleRemovePhoto = () => {
    setResidentPhotoFile(null);
    setPhotoPreviewUrl('');
    updateResidentField('photoUrl', ''); 
    const fileInput = document.getElementById('resident-photo-upload');
    if (fileInput) fileInput.value = '';
  };

  // 1. Function to populate the form when Edit is clicked
 const handleStartEditResident = async (res) => {
  setEditingResidentId(res.id);
  setSelectedResidentId(res.id);
  setHouseholdAssignmentMode('existing');
  setHouseholdForm(EMPTY_HOUSEHOLD);
  
  let fName = res.firstName || '';
  let lName = res.lastName || '';
  let mName = res.middleName || '';
  
  if (!fName && !lName && res.name) {
    const nameStr = String(res.name).trim();
    if (nameStr.includes(',')) {
      const parts = nameStr.split(',');
      lName = parts[0].trim();
      const rest = (parts[1] || '').trim().split(' ').filter(Boolean);
      fName = rest[0] || '';
      mName = rest.slice(1).join(' ') || '';
    } else {
      const parts = nameStr.split(' ').filter(Boolean);
      fName = parts[0] || '';
      lName = parts.length > 1 ? parts[parts.length - 1] : '';
      mName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
    }
  }

  const existingHouseholdId = (res.household && res.household !== '—' ? res.household : res.householdNo || '').replace(/^—$/, '');
  
  setResidentForm({
    ...EMPTY_RESIDENT,
    rbiNo: res.rbiId || res.rbiNo || '',
    householdNo: existingHouseholdId,
    fileDateUpdated: res.fileDateUpdated || new Date().toISOString().split('T')[0],
    lastName: lName, firstName: fName, middleName: mName,
    suffix: res.suffix || '', alias: res.alias || '',
    birthdate: res.birthdate || '', age: res.birthdate ? calculateAge(res.birthdate) : (res.age || 0),
    birthPlace: res.birthPlace || '', sex: res.gender || res.sex || 'Male',
    isLgbtqia: res.isLgbtqia || false, lgbtqiaSpecification: res.lgbtqiaSpecification || '',
    civilStatus: res.civilStatus || 'Single', citizenship: res.citizenship || 'Filipino',
    religion: res.religion || '', indigenousTribe: res.indigenousTribe || '',
    weightKg: res.weightKg || '', heightCm: res.heightCm || '', bloodType: res.bloodType || '',
    isHouseholdHead: res.isHouseholdHead || false, isFamilyHead: res.isFamilyHead || false,
    isSoloParent: res.isSoloParent || false, relationshipToHouseholdHead: res.relationshipToHouseholdHead || '',
    isBarangayResident: res.isBarangayResident !== undefined ? res.isBarangayResident : true,
    residentSince: res.residentSince || '', residencyStatus: res.residencyStatus || 'Permanent',
    isRegisteredVoter: res.voter !== undefined ? res.voter : res.isRegisteredVoter || false,
    isVotingLocally: res.isVotingLocally || false, precinctNo: res.precinctNo || '',
    votingOtherPlace: res.votingOtherPlace || '', contactNo: res.contact || res.contactNo || '',
    email: res.email || '', purokZoneAddress: res.purok || res.purokZoneAddress || '',
    addressOutsideBarangay: res.addressOutsideBarangay || '', isBarangayOfficial: res.isBarangayOfficial || false,
    isDeceased: res.isDeceased || false, photoUrl: res.photoUrl || '',
  });

  // ✅ FIX: Auto-recover missing household from PouchDB
  if (existingHouseholdId) {
    let foundHousehold = householdsList.find(h => String(h.id) === String(existingHouseholdId));
    
    // Kung wala sa state, baka nasa PouchDB pa (legacy or unsynced data)
    if (!foundHousehold && typeof db !== 'undefined') {
      try {
        const dbResult = await db.allDocs({ include_docs: true });
        const dbDoc = dbResult.rows.find(r => r.doc && (r.doc.id === existingHouseholdId || r.doc._id === existingHouseholdId));
        if (dbDoc && dbDoc.doc) {
          foundHousehold = {
            id: dbDoc.doc.id || dbDoc.doc._id,
            head: dbDoc.doc.head || 'Unknown Head',
            address: dbDoc.doc.address || '',
            purok: dbDoc.doc.purok || '',
            purokClass: dbDoc.doc.purokClass || 'b'
          };
          // I-add sa state para lumabas sa dropdown at mawala ang warning
          setHouseholdsList(prev => [...prev, foundHousehold]);
        }
      } catch (err) {
        console.warn("Could not auto-recover household from DB:", err);
      }
    }
    setSelectedHousehold(foundHousehold || null);
  } else {
    setSelectedHousehold(null);
  }

  setPhotoPreviewUrl(res.photoUrl || '');
  setResidentPhotoFile(null);
  
  if (typeof setEditForm === 'function') {
    setEditForm({
      firstName: fName, lastName: lName, civilStatus: res.civilStatus || 'Single',
      purok: res.purok || 'Purok 1', household: existingHouseholdId, rbiId: res.rbiId || ''
    });
  }
  nav('edit-resident');
};

const handleArchiveResident = async (residentId, residentName) => {
  const result = await Swal.fire({
    title: 'Archive Resident?',
    text: `Si ${residentName} ay itatago sa Active list, ngunit mananatili ang kanyang records para sa auditing.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Yes, Archive it!',
    cancelButtonText: 'Cancel'
  });

  if (!result.isConfirmed) return;

  try {
    const existingDoc = await db.get(residentId);
    const archivedDoc = {
      ...existingDoc,
      isArchived: true,
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.put(archivedDoc);

    // ✅ OPTIMISTIC UPDATE: Update local state directly
    setResidentsList((prev) =>
      prev.map((r) =>
        (r.id === residentId || r._id === residentId)
          ? { ...r, isArchived: true, archivedAt: archivedDoc.archivedAt }
          : r
      )
    );

    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'ARCHIVE_RESIDENT',
        module: 'RESIDENTS',
        recordId: residentId,
        details: `Archived resident: ${residentName}`,
      });
    }

    Swal.fire({
      icon: 'success',
      title: 'Archived Successfully!',
      text: `${residentName} has been moved to the Archived list.`,
      timer: 2000,
      showConfirmButton: false
    });

  } catch (err) {
    console.error('Failed to archive resident:', err);
    Swal.fire({
      icon: 'error',
      title: 'Failed',
      text: 'Failed to archive resident. Please try again.'
    });
  }
};

const handleCancelResidentForm = () => {
  setResidentForm(EMPTY_RESIDENT);
  setEditingResidentId(null);
  setPhotoPreviewUrl('');
  setHouseholdAssignmentMode('existing');
  setHouseholdForm(EMPTY_HOUSEHOLD);
  nav('residents');
};


const submitAddResident = async (e) => {
  e.preventDefault();

  const { rbiNo, householdNo, lastName, firstName, middleName, birthdate, sex, civilStatus, contactNo, purokZoneAddress, isHouseholdHead, isRegisteredVoter } = residentForm;

  // 2. SPECIFIC REQUIRED FIELDS VALIDATION (Para eksaktong malaman kung ano ang kulang)
  if (!firstName?.trim()) { showToast('First Name is required.', 'error'); return false; }
  if (!lastName?.trim()) { showToast('Last Name is required.', 'error'); return false; }
  if (!birthdate) { showToast('Birthdate is required.', 'error'); return false; }
  if (!sex) { showToast('Sex is required.', 'error'); return false; }
  if (!civilStatus) { showToast('Civil Status is required.', 'error'); return false; }
  if (!contactNo?.trim()) { showToast('Contact Number is required.', 'error'); return false; }
  if (!isValidPHMobile(contactNo)) { showToast('Invalid contact number. Use 09XXXXXXXXX format.', 'error'); return false; }
  if (!purokZoneAddress?.trim()) { showToast('Purok/Zone Address is required.', 'error'); return false; }
  if (!rbiNo?.trim()) { showToast('RBI ID No. is required.', 'error'); return false; }

  const isCreatingHousehold = householdAssignmentMode === 'create';
  
  if (isCreatingHousehold) {
    if (role !== 'admin') {
      showToast('Only an administrator can create a household during resident registration.', 'error');
      return false;
    }
    if (!householdForm.head?.trim() || !householdForm.address?.trim() || !householdForm.purok?.trim()) {
      showToast('Please complete the new household head, address, and Purok.', 'error');
      return false;
    }
  } else {
    // ✅ FIX: Added check for '—' to prevent saving unassigned households
    if (!householdNo?.trim() || householdNo === '—') {
      showToast('Select an existing household before saving the resident.', 'error');
      return false;
    }
    
    const selectedHouseholdExists = householdsList.some(
      (household) => String(household.id).trim() === householdNo.trim()
    );
    
    if (!selectedHouseholdExists) {
      showToast(`Household ${householdNo} is not in the registry. Please select a valid household.`, 'error');
      return false;
    }
  }

  const normalizedRbiId = rbiNo.trim().toUpperCase();

  // 3. Prevent duplicate RBI ID
  const duplicateRbiId = residentsList.some(
    (res) => res.rbiId?.trim().toUpperCase() === normalizedRbiId && res.id !== editingResidentId
  );
  if (duplicateRbiId) {
  showToast(`RBI ID ${normalizedRbiId} is already assigned to another resident.`, 'error');
    return false;
  }

  const fullName = `${firstName.trim()} ${middleName.trim()} ${lastName.trim()}`;

  // 4. Purok badge class logic
  let dynamicPurokClass = 'b';
  const purokLower = purokZoneAddress.toLowerCase();
  if (purokLower.includes('1')) dynamicPurokClass = 'p';
  else if (purokLower.includes('2')) dynamicPurokClass = 'g';
  else if (purokLower.includes('5')) dynamicPurokClass = 'a';

  let assignedHouseholdId = householdNo.trim();
  if (isCreatingHousehold) {
    try {
      const dbResult = await db.allDocs({ include_docs: true });
      const existingHouseholdIds = new Set(
        householdsList.map((household) => String(household.id || '')).filter(Boolean)
      );
      dbResult.rows.forEach(({ doc }) => {
        if (doc?.type === 'household') {
          existingHouseholdIds.add(String(doc.id || doc._id));
        }
      });

      let idTimestamp = Date.now();
      let newHouseholdId;
      do {
        newHouseholdId = `HH-${idTimestamp.toString(36).slice(-4).toUpperCase()}`;
        idTimestamp += 1;
      } while (existingHouseholdIds.has(newHouseholdId));

      const createdAt = new Date().toISOString();
      let householdPurokClass = 'b';
      if (householdForm.purok.includes('1')) householdPurokClass = 'p';
      else if (householdForm.purok.includes('2')) householdPurokClass = 'g';
      else if (householdForm.purok.includes('5')) householdPurokClass = 'a';

      const newHousehold = {
        _id: generateUUID(),
        id: newHouseholdId,
        type: 'household',
        head: householdForm.head.trim(),
        address: householdForm.address.trim(),
        purok: householdForm.purok,
        purokClass: householdPurokClass,
        members: 0,
        createdAt,
      };

      await db.put(newHousehold);
      setHouseholdsList((previous) => previous.some((household) => household.id === newHousehold.id)
        ? previous
        : [...previous, newHousehold]);
      try {
        await createAuditLog({
          action: 'CREATE',
          module: 'HOUSEHOLDS',
          recordId: newHousehold.id,
          details: `Registered new household during resident registration: ${newHousehold.head}`,
        });
      } catch (auditError) {
        console.error('Failed to audit household creation:', auditError);
      }
      assignedHouseholdId = newHousehold.id;
    } catch (householdError) {
      console.error('Failed to create household before resident:', householdError);
      showToast('Could not save the new household. The resident was not saved. Please try again.', 'error');
      return false;
    }
  }

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
      gender: sex,
      civilStatus,
      contact: contactNo.trim(),
      purok: purokZoneAddress,
      purokClass: dynamicPurokClass,
      age: calculateAge(birthdate),
      household: assignedHouseholdId,
      householdNo: assignedHouseholdId,
      householdHead: Boolean(isHouseholdHead),
      voter: Boolean(isRegisteredVoter),
      photoUrl: residentForm.photoUrl || res.photoUrl || '',
      email: residentForm.email || res.email || '', 
    };
  });
  setResidentsList(updatedList);
  
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
      household: assignedHouseholdId,
      householdNo: assignedHouseholdId,
      householdHead: Boolean(isHouseholdHead),
      voter: Boolean(isRegisteredVoter),
      age: calculateAge(birthdate),
      photoUrl: residentForm.photoUrl || existingDoc.photoUrl || '',
      email: residentForm.email || existingDoc.email || '', 
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
 showToast('success', `Resident ${editingResidentId} updated successfully!`);
  setEditingResidentId(null);
  setResidentForm(EMPTY_RESIDENT);
  setHouseholdAssignmentMode('existing');
  setHouseholdForm(EMPTY_HOUSEHOLD);
  nav('residents');
  return true;
}

// ✅ DUPLICATE DETECTION CHECK
const normalizedFirstName = firstName.trim().toLowerCase();
const normalizedLastName = lastName.trim().toLowerCase();
const normalizedBirthdate = birthdate;

const possibleDuplicate = residentsList.find(res => {
  const resFirst = (res.firstName || '').toLowerCase();
  const resLast = (res.lastName || '').toLowerCase();
  const resBirth = res.birthdate;
  
  // Match kung pareho ang First Name, Last Name, AT Birthdate
  return resFirst === normalizedFirstName && 
         resLast === normalizedLastName && 
         resBirth === normalizedBirthdate;
});

if (possibleDuplicate && !editingResidentId) {
  // Huwag agad mag-block, magbigay ng warning para i-review ng admin
  const confirmDuplicate = await Swal.fire({
    title: 'Possible Duplicate Detected!',
    html: `May existing record na for <strong>${firstName} ${lastName}</strong> born on <strong>${birthdate}</strong>.<br><br>Gusto mo bang ituloy ang pag-add bilang bagong record, o i-review muna ang existing record?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Continue Anyway (Different Person)',
    cancelButtonText: 'Review Existing Record',
    confirmButtonColor: '#3b82f6',
    cancelButtonColor: '#ef4444'
  });

  if (!confirmDuplicate.isConfirmed) {
    // I-redirect sa view ng existing resident
    setSelectedResidentId(possibleDuplicate.id);
    nav('view-resident');
    return false; // Stop the submission
  }
}
  // =========================================================
  // SCENARIO B: CREATE NEW RESIDENT
  // =========================================================
   const newResidentId = generateUUID();
const residentDisplayId = `RES-${Date.now().toString(36).slice(-4).toUpperCase()}`;  

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
    age: calculateAge(birthdate),
    household: assignedHouseholdId,
    householdHead: Boolean(isHouseholdHead),
    voter: Boolean(isRegisteredVoter),
    conflict: false,
    photoUrl: residentForm.photoUrl || '',
    email: residentForm.email || '', 
    createdAt: new Date().toISOString(),
  };

  const updatedList = [...residentsList, newResident];
setResidentsList(updatedList);

    const residentDoc = {
  _id: newResidentId,
  type: 'resident',
  ...residentForm, // SPREAD LAHAT NG FORM FIELDS
  residentId: newResidentId,
  rbiId: normalizedRbiId,
  name: fullName,
  gender: sex,
  contact: contactNo.trim(),
  household: assignedHouseholdId,
  householdNo: assignedHouseholdId,
  householdHead: Boolean(isHouseholdHead),
  voter: Boolean(isRegisteredVoter),
  age: calculateAge(birthdate),
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
  setHouseholdAssignmentMode('existing');
  setHouseholdForm(EMPTY_HOUSEHOLD);
  nav('residents');
  return true;
};
 
 const submitAddHousehold = async (e) => {
  e.preventDefault();
  const { head, address, purok } = householdForm;

  if (!head || !address || !purok) {
    showToast('Please fill in all required fields.');
    return;
  }

  let dynamicPurokClass = 'b';
  if (purok.includes('1')) dynamicPurokClass = 'p';
  else if (purok.includes('2')) dynamicPurokClass = 'g';
  else if (purok.includes('5')) dynamicPurokClass = 'a';

  const householdUUID = generateUUID();
const newHousehold = {
  _id: householdUUID,
  id: `HH-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    head: head,
    address: address,
    purok: purok,
    purokClass: dynamicPurokClass,
    members: 0,
    createdAt: new Date().toISOString(),
  };

  try {
    await db.put({
      _id: newHousehold.id,
      type: 'household',
      ...newHousehold,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to save household:', err);
  }

  setHouseholdsList([...householdsList, newHousehold]);
  
  await createAuditLog({
    action: 'CREATE',
    module: 'HOUSEHOLDS',
    recordId: newHousehold.id,
    details: `Registered new household: ${newHousehold.head}`,
  });

showToast(
  'success',
  `Household Registered successfully!\n\nID: ${newHousehold.id}\nHead of Family: ${head}`
);
  
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
    
    try {
      const existing = await db.get(selectedHouseholdId);
      await db.put({
        ...existing,
        head,
        address,
        purok,
        purokClass: dynamicPurokClass,
        updatedAt: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn('Household edit not synced to PouchDB:', dbErr);
    }

    await createAuditLog({
      action: 'UPDATE',
      module: 'HOUSEHOLDS',
      recordId: selectedHouseholdId,
      details: `Updated household record: ${head}`,
    });

  showToast('success', `Household ${selectedHouseholdId} updated successfully!`);
    setHouseholdForm(EMPTY_HOUSEHOLD);
    setSelectedHouseholdId(null);
    nav('households');
  } catch (error) {
    console.error('Error saving household:', error);
    showToast('Failed to save household. Please try again.', 'error');
  } finally {
    setSaving(false); 
  }
};

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
  showToast(
    `✓ Complaint ${caseNum} updated successfully!\n\n` +
    `Changes saved:\n` +
    `• Complainant: ${compName}\n` +
    `• Respondent: ${respName}\n` +
    `• Status: ${caseStatus}\n\n` +
    `All changes recorded in client registry audit log.`,
    'success'
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
   showToast('error', '⚠️ Invalid Case ID. Cannot send summons.');
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

      showToast(
        `✓ Summons successfully dispatched via SMS & Email engine!\n\n` +
        `Tracking Log: ${caseId}\n` +
        `Recipient Party: ${respondentName}\n` +
        `Updated Status: ${nextStatusLabel}\n` +
        `Scheduled Date: ${summonDate} [${summonTime}]`,
        'success'
      );
    } catch (err) {
      console.error('Failed to dispatch summons:', err);
     showToast('error', `Dispatch failed: ${err.message}`);
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
showToast('error', 'Database connection is unavailable.');
    return;
  }
  if (!scheduleDate && actionType.includes('summon')) {
  showToast('error', 'Please enter a Schedule Date & Time for the summon.');
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
     else if (actionType === 'issue_bpo') {
      newStatus = 'BPO Issued';
      updatedDoc.bpoIssued = true;
      updatedDoc.bpoIssuedAt = nowIso;
      updatedDoc.bpoExpiry = addDays(new Date(), 7).toISOString(); // 7 days protection
    } else if (actionType === 'refer_pnp') {
      newStatus = 'Referred to PNP (VAWC)';
      updatedDoc.referredToPNP = true;
      updatedDoc.referredAt = nowIso;
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
    
    if (typeof forceSyncToRemote === 'function') {
  await forceSyncToRemote();
}

// Update local selected state
if (typeof setSelectedBlotter === 'function') {
  setSelectedBlotter(updatedDoc);
}
    // Update local selected state
    if (typeof setSelectedBlotter === 'function') {
      setSelectedBlotter(updatedDoc);
    }
    localStorage.setItem('active_blotter_data', JSON.stringify(updatedDoc));

    // Refresh the main blotters list
    if (typeof setBlotterList === 'function') {
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
   showToast('success', `Status successfully updated to: ${newStatus}`);

  } catch (err) {
    console.error('Failed to update blotter case status:', err);
   showToast('error', `Unable to update case status: ${err.message}`);
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
  if (!beneficiaryDraft.residentId || !beneficiaryDraft.aidType) {
    showToast('error', 'Please select a resident and specify the aid type.');
    return;
  }

  const existingIndex = beneficiaryList.findIndex(
    b => b.residentId === beneficiaryDraft.residentId && b.aidType === beneficiaryDraft.aidType
  );

  if (existingIndex !== -1) {
    if (!window.confirm(`Si ${beneficiaryDraft.name} ay nasa listahan na para sa ${beneficiaryDraft.aidType}. Gusto mo bang i-merge at dagdagan ang quantity?`)) {
      return;
    }
    const updatedList = [...beneficiaryList];
    updatedList[existingIndex].qty += Number(beneficiaryDraft.qty || 1);
    setBeneficiaryList(updatedList);
  } else {
    setBeneficiaryList([...beneficiaryList, { ...beneficiaryDraft, qty: Number(beneficiaryDraft.qty || 1) }]);
  }

  setBeneficiaryDraft(prev => ({
    ...prev,
    residentId: '',
    name: '',
    qty: 1
  }));
};

  const removeFromList = (index) =>
    setBeneficiaryList((prev) => prev.filter((_, i) => i !== index));

  const saveAll = async () => {
  if (beneficiaryList.length === 0) {
    if (typeof showToast === 'function') {
      showToast('Walang benepisyaryo na naka-queue.', 'warning');
    } else {
     showToast('error', 'No beneficiaries to save.');
    }
    return;
  }

  const totalBeneficiaries = beneficiaryList.length;
  const totalItems = beneficiaryList.reduce((acc, curr) => acc + Number(curr.qty || 1), 0);
  const targetProgram = programsList.find(p => p.id === currentProgramId);

  if (targetProgram) {
    const existingCount = programAidCount(targetProgram);
    const remainingCapacity = (targetProgram.target || 0) - existingCount;

    if (totalItems > remainingCapacity) {
      if (typeof showToast === 'function') {
        showToast(`⚠️ Kulang sa capacity! Natitira lang ang ${remainingCapacity} items sa programang ito.`, 'error');
      } else {
      showToast('error', `Kulang sa capacity! Natitira lang ang ${remainingCapacity} items sa programang ito.`);
      }
      return;
    }
  }

  setIsSavingBatch(true);

  try {
    const now = new Date().toISOString();
    const batchId = `AIDBATCH-${Date.now()}`;

    const docsToSave = beneficiaryList.map((b, index) => {
      const docId = `${batchId}-${String(index + 1).padStart(3, '0')}`;

      return {
        _id: docId,
        type: 'aid_distribution',
        refNumber: docId,
        programId: currentProgramId,
        residentId: b.residentId,
        residentName: b.name,
        aid: b.aidType,
        qty: Math.max(1, Number(b.qty || 1)),
        officer: displayName.split(' ')[0],
        status: 'OK',
        createdAt: now,
        updatedAt: now,
      };
    });

    const response = await db.bulkDocs(docsToSave);
    const errors = response.filter(res => res.error);

    if (errors.length > 0) {
      console.error('Some documents failed to save:', errors);
      throw new Error('Partial save failure');
    }

    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'BULK_ACTION',
        module: 'AID_DISTRIBUTION',
        recordId: batchId,
        details: `Encoded ${totalBeneficiaries} beneficiaries in Batch Mode for Program ${currentProgramId}. Total items: ${totalItems}`,
      });
    }

    setBeneficiaryList([]);

    if (typeof forceSyncToRemote === 'function') {
      forceSyncToRemote().catch(err => {
        console.warn('Local save successful. Background sync will handle this later:', err);
      });
    }

    if (typeof showToast === 'function') {
      showToast(`✓ Matagumpay na na-save ang ${totalBeneficiaries} benepisyaryo (${totalItems} items)!`, 'success');
    } else {
      showToast(`✓ Matagumpay na na-save ang ${totalBeneficiaries} na benepisyaryo sa queue!`, 'success');
    }
  } catch (err) {
    console.error('Failed to save beneficiaries:', err);

    if (typeof showToast === 'function') {
      showToast('⚠️ May error sa pag-save. Paki-check ang database at subukang muli.', 'error');
    } else {
     showToast('error', '⚠️ May error sa pag-save. Ang iyong queue ay naka-save pa rin sa screen at hindi mawawala.');
    }
  } finally {
    setIsSavingBatch(false);
  }
};

  const handlePrintRelease = async (req) => {
  if (
    !issuanceMeta.orNumber ||
    !String(issuanceMeta.orNumber).trim() ||
    !issuanceMeta.amountPaid
  ) {
    showToast('Please fill in required payment fields (OR No. and Amount Paid).', 'error');
    return;
  }

  try {
    const targetId = req?._id || selectedCertificate?._id;
    if (!targetId) {
      showToast('error', 'No certificate selected.');
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
   showToast('success', 'Certificate successfully issued and recorded!');
  } catch (err) {
    console.error('Print release failed:', err);
   showToast('error', 'Failed to process certificate release.');
  }
};
  // ─────────────────────────────────────────────
  // TOPBAR TITLE
  // ─────────────────────────────────────────────
  const [currentTitle, currentSubtitle] = (() => {
  if (screen === 'dashboard') {
    return [
      'Dashboard',
      role === 'admin' ? 'Barangay Bustrac • Full System View' : 'Barangay Bustrac Operations',
    ];
  }
  return SCREEN_META[screen] ?? [
    screen.replace('-', ' ').toUpperCase(), 
    'Barangay System Module'
  ];
})();

  // Dynamic computing: This looks for a match in the typed input against Name, ID, or Purok
  const filteredResidents = residentsList.filter((res) => {
  // View mode filter
  const isArchived = res.isArchived === true;
  if (viewMode === 'active' && isArchived) return false;
  if (viewMode === 'archived' && !isArchived) return false;
  
  // Search filter
  const query = searchTerm.toLowerCase();
  const fullName = res.name || `${res.firstName || ''} ${res.middleName || ''} ${res.lastName || ''}`.trim();
  const matchesSearch = fullName.toLowerCase().includes(query) ||
    (res.id && String(res.id).toLowerCase().includes(query)) ||
    (res._id && String(res._id).toLowerCase().includes(query)) ||
    (res.rbiId && String(res.rbiId).toLowerCase().includes(query)) ||
    (res.purok && String(res.purok).toLowerCase().includes(query));
  
  const matchesPurok = purokFilter === 'All Puroks' || res.purok === purokFilter;
  
  const matchesGender = genderFilter === 'All Gender' || res.gender === genderFilter;

  return matchesSearch && matchesPurok && matchesGender;
});

// Dynamic Calculations para sa Dashboard Panels
const totalResidents = residentsList.length;
const totalHouseholds = householdsList.length;
const totalVoters = residentsList.filter(r => r.voter || r.isVoter === 'Yes' || r.voterStatus === 'Yes').length;
const getHouseholdMembersCount = (householdId) => {
  return residentsList.filter(r => r.household === householdId).length;
};

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

// ── MONTH-OVER-MONTH TREND HELPERS (KPI deltas para sa Dashboard summary) ──
const getMonthKey = (value) => {
  if (!value) return '';
  const raw = String(value);
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${parsed.getMonth()}`;
};
const computeTrend = (list, dateFn) => {
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${now.getMonth()}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prevDate.getFullYear()}-${prevDate.getMonth()}`;
  let thisMonth = 0;
  let lastMonth = 0;
  (list || []).forEach((item) => {
    const key = getMonthKey(dateFn(item));
    if (key === thisKey) thisMonth += 1;
    else if (key === prevKey) lastMonth += 1;
  });
  return { delta: thisMonth - lastMonth, thisMonth, lastMonth };
};

const residentTrend = computeTrend(residentsList, (r) => r.createdAt);
const householdTrend = computeTrend(householdsList, (h) => h.createdAt);
const voterTrend = computeTrend(
  residentsList.filter((r) => r.voter || r.isVoter === 'Yes' || r.voterStatus === 'Yes'),
  (r) => r.createdAt
);
const certTrend = computeTrend(issuedCertificates, (c) => c.createdAt || c.dateSubmitted || c.date);
const blotterTrend = computeTrend(blotterList, (b) => b.dateFiled || b.date || b.incidentDate || b.createdAt);
const feedbackTrend = computeTrend(feedbackList, (f) => f.rawTimestamp || f.timestamp || f.createdAt);

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


const [aidLogs, setAidLogs] = useState([]);

useEffect(() => {
  if (!db) return;
  let mounted = true;
  const loadAidLogs = async () => {
  try {
    const res = await db.find({
      selector: { type: 'aid_distribution' },
      limit: 2000,
    });
    const docs = res.docs;
    if (!mounted) return;
    setAidLogs((prev) => {
      const map = new Map();
      prev.forEach((l) => { if (l._id) map.set(l._id, l); });
      docs.forEach((d) => map.set(d._id, d));
      return Array.from(map.values());
    });
  } catch (err) {
    console.error('Failed to load aid logs from PouchDB:', err);
  }
};
  loadAidLogs();
}, []);

const programAidCount = (prog) =>
  (aidLogs || []).filter(
    (log) => log.programId === prog?.id || log.programId === prog?._id
  ).length;

// ── BARANGAY CLEARANCE (INDIVIDUAL) STATE MANAGEMENT ──
const [clearanceList, setClearanceList] = useState([]);
const [clearanceSearch, setClearanceSearch] = useState('');
const [clearancePage, setClearancePage] = useState(1);
const [showClearancePrintModal, setShowClearancePrintModal] = useState(false);
const [selectedClearanceCert, setSelectedClearanceCert] = useState(null);

const [editingClearanceId, setEditingClearanceId] = useState(null);

// Form State matching legacy fields in modern structure
const [clearanceForm, setClearanceForm] = useState({
  _id: '',
  clearanceNo: '',
  fullName: '',
  residentId: '',
  rbiId: '',
  purok: '',
  address: '',
  purpose: '',
  remarks: '',
  validity: '(6) Six Months Validity',
  dateIssued: toPHDateString(),
  orNo: '',
  amtPaid: '',
  ctcNo: '',
  ctcName: '',
  ctcAmtPaid: '0.00',
  ctcDateIssued: toPHDateString(),
  ctcPlaceIssued: 'Nabua, Camarines Sur',
  hasBlotterRecord: false,
  blotterReviewNeeded: false,
  selectedResidentId: '',
  includeCtc: false,
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

const totalClearancePages = Math.max(1, Math.ceil(filteredClearances.length / MASTERLIST_PAGE_SIZE));
const safeClearancePage = Math.min(clearancePage, totalClearancePages);
const pagedClearances = filteredClearances.slice(
  (safeClearancePage - 1) * MASTERLIST_PAGE_SIZE,
  safeClearancePage * MASTERLIST_PAGE_SIZE
);

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
// Retries on write conflict (409) and always checks the number against the
// locally-known clearances so a duplicate reference is never issued.
const getNextClearanceSequence = async () => {
  const year = new Date().getFullYear();
  const existing = clearanceList.map((c) => c.clearanceNo);

  for (let attempt = 0; attempt < 5; attempt += 1) {
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
      return nextAvailableClearanceNo(existing, formatClearanceNo(year, nextNumber), year);
    } catch (err) {
      if (err && (err.status === 409 || err.name === 'conflict')) continue;
      console.error('Failed to get next sequence:', err);
      break;
    }
  }

  const fallback = formatClearanceNo(year, Date.now() % 10000);
  return nextAvailableClearanceNo(existing, fallback, year);
};

// ── Helper: Peek lang (hindi nag-i-increment) para sa preview sa form ──
const peekNextClearanceNo = async () => {
  const year = new Date().getFullYear();
  const existing = clearanceList.map((c) => c.clearanceNo);
  try {
    const seqDoc = await db.get('seq_brgy_clearance');
    return nextAvailableClearanceNo(existing, formatClearanceNo(year, (seqDoc.lastNumber || 0) + 1), year);
  } catch (err) {
    if (err.name === 'not_found') {
      return nextAvailableClearanceNo(existing, formatClearanceNo(year, 1), year);
    }
    console.warn('Peek sequence failed:', err);
    return nextAvailableClearanceNo(existing, formatClearanceNo(year, clearanceList.length + 1), year);
  }
};



// ── Helper: Peek lang (hindi nag-i-increment) para sa preview sa form ──
const peekNextBusinessSequence = async () => {
  const existing = businessMasterlist.map((r) => r.bcIdNo);
  try {
    const seqDoc = await db.get('seq_business_clearance');
    return nextAvailableBusinessId(existing, String((seqDoc.lastNumber || 155) + 1).padStart(4, '0'));
  } catch (err) {
    if (err.name === 'not_found') return nextAvailableBusinessId(existing, '0156');
    console.warn('Peek business sequence failed:', err);
    return nextAvailableBusinessId(existing, '0156'); // Safe fallback
  }
};

// Save or Update Clearance Record
  const handleSaveClearance = async (e) => {
  e.preventDefault();

  if (!clearanceForm.selectedResidentId) {
    showToast('Please select a registered resident from the registry.', 'error');
    return;
  }
  if (!clearanceForm.purpose.trim()) {
    showToast('Please fill in the Purpose of Clearance.', 'error');
    return;
  }
  if (!clearanceForm.orNo.trim()) {
    showToast('Please enter the Official Receipt (O.R.) Number.', 'error');
    return;
  }
  if (!/^\d{8}$/.test(clearanceForm.orNo.trim())) {
    showToast('O.R. Number must be exactly 8 digits (e.g. 08605032).', 'error');
    return;
  }
  const amtPaidCheck = parseMoney(clearanceForm.amtPaid, { required: true });
  if (!amtPaidCheck.ok) {
    showToast(`Amount Paid / Clearance Fee: ${amtPaidCheck.error}`, 'error');
    return;
  }
  if (clearanceForm.includeCtc) {
    if (!clearanceForm.ctcNo.trim()) {
      showToast('CTC Number is required when including Community Tax Certificate.', 'error');
      return;
    }
    const ctcCheck = parseMoney(clearanceForm.ctcAmtPaid, { required: true });
    if (!ctcCheck.ok) {
      showToast(`CTC Amount Paid: ${ctcCheck.error}`, 'error');
      return;
    }
  }

  setIsSavingClearance(true);
  try {
    const isEditing = Boolean(editingClearanceId);
    const docId = isEditing ? editingClearanceId : collisionSafeId('brgy_clearance_');
    const newClearanceNo = isEditing ? clearanceForm.clearanceNo : await getNextClearanceSequence();

    const issuedDate = clearanceForm.dateIssued || toPHDateString();
    const derivedExpiry = computeExpiry({ dateIssued: issuedDate, validity: clearanceForm.validity });

    const payload = {
      ...clearanceForm,
      dateIssued: issuedDate,
      clearanceNo: newClearanceNo,
      status: clearanceForm.status || 'Issued',
      secretary: settingsForm?.luponSecretary || 'MRS. MELY M. PRESADO',
      captain: settingsForm?.punongBarangay || 'HON. ANNABELLE E. RULL',
      _id: docId,
      type: 'barangay_clearance',
      updatedAt: new Date().toISOString(),
      createdAt: clearanceForm.createdAt || new Date().toISOString(),
    };
    if (derivedExpiry) payload.expiryDate = derivedExpiry.toISOString().slice(0, 10);

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

    showToast(
      isEditing
        ? 'Barangay Clearance updated successfully!'
        : `Barangay Clearance ${newClearanceNo} issued successfully!`,
      'success'
    );

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
    residentId: '',
    rbiId: '',
    purok: '',
    address: '',
    purpose: '',
    remarks: '',
    validity: '(6) Six Months Validity',
    dateIssued: toPHDateString(),
    orNo: '',
    amtPaid: '',
    ctcNo: '',
    ctcName: '',
    ctcAmtPaid: '0.00',
    ctcDateIssued: toPHDateString(),
    ctcPlaceIssued: 'Nabua, Camarines Sur',
    hasBlotterRecord: false,
    blotterReviewNeeded: false,
    selectedResidentId: '',
    includeCtc: false,
    isIssuedByBarangay: true,
  });
};

const handleEditClearance = (rec) => {
  setEditingClearanceId(rec._id);
  setClearanceForm({
    _id: rec._id || '',
    _rev: rec._rev || undefined,
    clearanceNo: rec.clearanceNo || '',
    dateIssued: rec.dateIssued || toPHDateString(),
    fullName: rec.fullName || '',
    residentId: rec.residentId || '',
    rbiId: rec.rbiId || '',
    purok: rec.purok || '',
    address: rec.address || '',
    purpose: rec.purpose || '',
    remarks: rec.remarks || '',
    validity: rec.validity || '(6) Six Months Validity',
    hasBlotterRecord: rec.hasBlotterRecord || false,
    blotterReviewNeeded: false,
    selectedResidentId: rec.selectedResidentId || '',
    includeCtc: Boolean( rec.includeCtc || rec.ctcNo || rec.ctcAmtPaid ) || false,
    orNo: rec.orNo || '',
    amtPaid: rec.amtPaid || '',
    ctcNo: rec.ctcNo || '',
    ctcAmtPaid: rec.ctcAmtPaid || '0.00',
    ctcDateIssued: rec.ctcDateIssued || toPHDateString(),
    ctcPlaceIssued: rec.ctcPlaceIssued || 'Nabua, Camarines Sur',
    isIssuedByBarangay: rec.isIssuedByBarangay ?? true,
    createdAt: rec.createdAt || new Date().toISOString(),
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const handlePrintClearance = (rec) => {
  setSelectedClearanceCert(rec);
  setShowClearancePrintModal(true);
};

// ── NEW STANDARD CERTIFICATE REQUEST SUBMIT ──
const handleSubmitStandardCert = async () => {
  if (!standardCertForm.residentId || !standardCertForm.purpose.trim()) {
    showToast('Please select a resident and enter the purpose.', 'error');
    return;
  }

  setIsSavingStandardCert(true);
  try {
    const resident = residentsList.find((r) => r.id === standardCertForm.residentId);
    const now = new Date().toISOString();

    const payload = {
      _id: `certificate_request_${Date.now()}`,
      type: 'certificate_request',
      firstName: resident?.firstName || resident?.name?.split(' ')[0] || '',
      lastName: resident?.lastName || resident?.name?.split(' ').slice(1).join(' ') || '',
      residentName: resident?.name || '',
      certificateType: formatCertType(standardCertForm.certificateType),
      certType: standardCertForm.certificateType,
      purpose: standardCertForm.purpose,
      purok: resident?.purok || 'Purok 1',
      status: 'Under Review',
      step: 1,
      createdAt: now,
      updatedAt: now,
    };

    await db.put(payload);
    showToast('Certificate request submitted successfully!', 'success');
    setStandardCertForm({ residentId: '', certificateType: 'indigency', purpose: '' });
    nav('cert-req');
  } catch (err) {
    console.error('Failed to save certificate request:', err);
    showToast('Failed to save request.', 'error');
  } finally {
    setIsSavingStandardCert(false);
  }
};

// ── TRANSACTION SUBMIT LOGIC LAYER ──
const handleLogAidEntry = async () => {
  if (!currentBeneficiaryId) {
    showToast('Mangyaring pumili muna ng residente (Beneficiary).', 'error');
    return;
  }

  if (duplicateAlert) {
    showToast('Hindi maiproseso: Ang residenteng ito ay nakatanggap na ng ayuda.', 'error');
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
      showToast(
        `Success: Na-log na ang ayuda para kay ${targetResident.name}. Umuusad na ang Batch Mode Queue!`,
        'success'
      );
    } else {
      setCurrentBeneficiaryId('');
      showToast(`Success: Aid has been successfully recorded for ${targetResident.name}!`, 'success');
    }
  } catch (err) {
    console.error('Failed to save aid log to PouchDB:', err);
    showToast('Hindi na-save ang aid entry sa offline database. Subukan muli.', 'error');
  }
};

const handleEncodeSubmit = async (e) => {
  setFormAttempted(true);
  if (e) e.preventDefault();
  
  if (!selectedProgramId) {
    showToast('Pumili muna ng Active Relief Program.', 'error');
    return;
  }
  
  if (!selectedResidentId) {
    showToast('Pumili muna ng Beneficiary Resident.', 'error');
    return;
  }

  const targetProg = programsList.find((p) => p.id === selectedProgramId);
  const targetResident = residentsList.find((r) => r.id === selectedResidentId);
  
  if (!targetResident) {
    showToast('Resident not found in list.', 'error');
    return;
  }
  
  const residentName = targetResident.name || 'Unknown Resident';

  // 1. Duplicate Check
  const isDuplicate = aidLogs.some(
    (log) => log.programId === selectedProgramId && log.residentId === selectedResidentId
  );
  
  if (isDuplicate) {
    const errorMsg = `⚠️ Si ${residentName} ay nakatanggap na ng ayuda sa ilalim ng ${targetProg?.title || 'programang ito'}.`;
    if (typeof setDuplicateAlert === 'function') {
      setDuplicateAlert(errorMsg);
    } else {
      showToast(errorMsg, 'error');
    }
    return;
  }
  
  if (typeof setDuplicateAlert === 'function') setDuplicateAlert('');

  // 2. Capacity Check (galing sa aidLogs, hindi prog.current)
  const actualCurrent = aidLogs.filter((log) => log.programId === selectedProgramId).length;
  if (targetProg && actualCurrent >= (targetProg.target || 1)) {
    showToast(`⚠️ Puno na ang capacity ng ${targetProg.title} (${actualCurrent}/${targetProg.target}).`, 'error');
    return;
  }

  // 3. Create Log Entry
  const now = new Date();
  const timeStamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const newLog = {
    _id: `aid_${generateUUID()}`,
    id: `LOG-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    type: 'aid_distribution',
    residentId: selectedResidentId,
    residentName: residentName,
    programId: selectedProgramId,
    aid: aidType || 'Relief Goods',
    qty: quantity || 1,
    remarks: remarks || '',
    officer: typeof displayName !== 'undefined' ? displayName.split(' ')[0] : 'Mark Gian Cortero',
    time: timeStamp,
    status: 'OK',
  };

  // 4. Update Local State
  setAidLogs((prev) => [newLog, ...prev]);

  // 5. Persist to PouchDB
  try {
    await db.put({
      _id: newLog._id,
      type: 'aid_distribution',
      ...newLog,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Audit log
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

    // 6. Reset Form
    setSelectedProgramId('');
    setSelectedResidentId('');
    setResidentSearch('');
    setAidType('');
    setQuantity(1);
    setRemarks('');
    setDuplicateAlert('');
    setFormAttempted(false);

    if (typeof setSuccessMessage === 'function') {
      setSuccessMessage(`Matagumpay na na-record ang ayuda para kay ${residentName}!`);
      setTimeout(() => setSuccessMessage(''), 4000);
    }
  } catch (dbErr) {
    console.error('Failed to persist aid log to PouchDB:', dbErr);
    showToast('Hindi na-save ang aid entry sa offline database. Subukan muli.', 'error');
  }
};

// ── LIVE HOUSEHOLD DETECTOR ENGINE ──
const [viewingHouseholdId, setViewingHouseholdId] = useState(null); 
const [viewingResidentId, setViewingResidentId] = useState(null);
const [selectedResidentId, setSelectedResidentId] = useState(null);

// ── AUTOMATIC DUPLICATION CHECKER LAYER (placed after selectedResidentId declaration) ──
useEffect(() => {
  if (!selectedProgramId || !selectedResidentId) {
    setDuplicateAlert('');
    return;
  }
  const alreadyReceived = aidLogs.some(log => 
    log.residentId === selectedResidentId && 
    log.programId === selectedProgramId &&
    log.status !== 'Duplicate');
  
  if (alreadyReceived) {
    const targetResident = residentsList.find(r => r.id === selectedResidentId);
    setDuplicateAlert(`Duplicate Alert: ${targetResident ? targetResident.name : 'Resident'} has already received aid under this program. Entry blocked.`);
  } else {
    setDuplicateAlert('');
  }
}, [selectedResidentId, selectedProgramId, aidLogs, residentsList]);

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
  } else {
    // ✅ BEST PRACTICE: Reset state kapag umalis sa edit screen para walang stale data
    setHouseholdForm(EMPTY_HOUSEHOLD);
    setSelectedHouseholdId(null);
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
  e.preventDefault();

  if (!editingResidentId) {
    if (typeof showToast === 'function') showToast('Error: No resident selected.', 'error');
    return;
  }

  setIsSavingResident(true);
  try {
    const fullCombinedName = `${editForm.firstName} ${editForm.lastName}`.trim();

    let newPurokClass = 'g';
    const purokLower = editForm.purok.toLowerCase();
    if (purokLower.includes('1')) newPurokClass = 'p';
    else if (purokLower.includes('2')) newPurokClass = 'g';
    else if (purokLower.includes('3')) newPurokClass = 'b';
    else if (purokLower.includes('4') || purokLower.includes('5')) newPurokClass = 'a';

    setResidentsList((prevList) => {
      const updatedList = prevList.map((r) => {
        if (r.id === editingResidentId) {
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
      return updatedList;
    });

    try {
      const existingDoc = await db.get(editingResidentId);
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
      console.warn('Resident not yet in PouchDB or DB error, local update only:', err);
    }

    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'UPDATE_RESIDENT',
        module: 'RESIDENTS',
        recordId: editingResidentId,
        details: `Quick updated resident profile: ${fullCombinedName}`,
      });
    }

    if (typeof showToast === 'function') {
      showToast(`✓ Success: Record for ${fullCombinedName} has been updated.`, 'success');
    } else {
      showToast(`✓ Success: Record for ${fullCombinedName} has been updated.`, 'success');
    }

    setEditingResidentId(null);
    setEditForm({ firstName: '', lastName: '', civilStatus: 'Single', purok: 'Purok 1', household: '', rbiId: '' });
    nav('residents');

  } catch (error) {
    console.error('Failed to update resident:', error);
    if (typeof showToast === 'function') {
      showToast('Failed to update resident. Please try again.', 'error');
    } else {
      showToast('Failed to update resident.', 'error');
    }
  } finally {
    setIsSavingResident(false);
  }
};

// ── 2. MAIN CORE BLOTTER FORM OBJECT STATE ──
const [blotterForm, setBlotterForm] = useState({
  date: toPHDateString(), 
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
  setIsBlottersLoading(true);
  try {
    // ✅ Mango indexed query
    const res = await db.find({
      selector: {
        $or: [
          { type: 'blotter' },
          { type: 'blotter_record' },
          { type: 'blotter_report' },
          { docType: 'blotter' },
          { _id: { $gte: 'BLT-', $lt: 'BLT-\uffff' } }, // ✅ Para sa legacy docs na may BLT- prefix
        ],
      },
      limit: 1000,
    });
    const blotterDocs = res.docs
      .map(mapDocToBlotter)
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    setBlotterList(blotterDocs);
  } catch (err) {
    console.error('Error fetching blotter records from PouchDB:', err);
  } finally {
    setIsBlottersLoading(false);
  }
};
    
    const timer = setTimeout(fetchBlotters, 500);
  return () => clearTimeout(timer);
  }, [db]);

const [complainantQuery, setComplainantQuery] = useState('');
const [respondentQuery, setRespondentQuery] = useState('');

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
        file: file, 
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

const handleExportBlotterToExcel = () => {
  if (filteredBlotters.length === 0) {
    showToast('Walang data na pwedeng i-export.', 'error');
    return;
  }
  
  const exportData = filteredBlotters.map(b => ({
    'Case No': b.id || b.trackingNo || b.refNumber || b._id,
    'Complainant': b.complainant || b.complainantName || 'N/A',
    'Respondent': b.respondent || b.respondentName || 'N/A',
    'Incident Type': b.type || b.incidentType || 'N/A',
    'Location': b.location || 'N/A',
    'Date': b.date || b.incidentDate || 'N/A',
    'Status': b.status || 'Pending',
    'Summons Issued': b.summonCount || 0,
    'CFA Issued': b.cfaIssued ? 'Yes' : 'No'
  }));

  const currentDate = new Date().toISOString().split('T')[0];
  const fileName = `Barangay_Bustrac_Blotter_Log_${currentDate}.xlsx`;

  // Audit Log for Export
  if (typeof createAuditLog === 'function') {
    createAuditLog({
      action: 'EXPORT_DATA',
      module: 'BLOTTER',
      recordId: fileName,
      details: `Admin exported Blotter Masterlist to Excel (${exportData.length} records).`
    });
  }

  exportToExcel(exportData, fileName, 'BlotterLog');
};

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

    if (pageFromUrl === 'blotter-detail') {
      const activeId = idFromUrl || localStorage.getItem('active_blotter_id');
      const cachedData = localStorage.getItem('active_blotter_data');

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
useEffect(() => {
  if (role === 'admin') return;
  if (!ADMIN_ONLY_SCREENS.includes(screen)) return;

  showToast('Access denied. Admin-only ang page na ito.', 'error');
  setScreen('dashboard');
  navigate('?page=dashboard', { replace: true });

  // Table 10: "Unauthorized Access Attempt Logging"
  (async () => {
    try {
      await createAuditLog({
        action: 'FLAG',
        module: 'SECURITY',
        recordId: screen,
        user: `${currentUser?.username || 'unknown'} (${role})`,
        details: `Blocked unauthorized access to "${screen}" (${navigator.onLine ? 'online' : 'offline'})`,
      });
    } catch (e) {
      console.warn('Audit log failed:', e);
    }
  })();
}, [screen, role, navigate]);

useEffect(() => {
  let timer;
  const expire = () => {
    localStorage.removeItem('bustrac_user');
    localStorage.removeItem('bustrac_role');
    localStorage.removeItem('bustrac_offline_auth');
    localStorage.removeItem('bustrac_loginTime');
    sessionStorage.removeItem('bustrac_user');
    // Clear the online session token on idle expiry. The server session
    // is not revoked (no logout endpoint in this phase); the user must
    // re-authenticate to obtain a new token.
    clearToken();
    Swal.fire({
      icon: 'info',
      title: 'Ang iyong session ay nag-expire dahil sa inactivity.',
      text: 'Mag-login ulit upang magpatuloy.',
      timer: 3000,
      showConfirmButton: false,
    });
    navigate('/login');
  };
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(expire, SESSION_TIMEOUT_MIN * 60 * 1000);
  };
  const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
  events.forEach((e) => window.addEventListener(e, reset));
  reset();
  return () => {
    clearTimeout(timer);
    events.forEach((e) => window.removeEventListener(e, reset));
  };
}, [navigate]);

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

const openIssuanceWorkspace = (cert) => {
  if (!cert) return;
  if (typeof setSelectedCertificate === 'function') {
    setSelectedCertificate(cert);
  }
  if (typeof nav === 'function') {
    nav('cert-print');
  }
};

const uniqueIssuedCertificates = useMemo(() => {
  const map = new Map();
  (issuedCertificates || []).forEach((c) => {
    if (c?._id) map.set(c._id, c);
  });
  return Array.from(map.values());
}, [issuedCertificates]);

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
    showToast('Failed to approve certificate. Please try again.', 'error');
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
const INITIAL_ANNOUNCEMENTS = useMemo(() => [
  { _id: 'announcement_seed_1', type: 'announcement', title: 'Free Medical Mission — Apr 15', category: 'Health', content: 'Free consultation, blood pressure check, medicine dispensing. All residents welcome. Bring valid ID.', body: 'Free consultation, blood pressure check, medicine dispensing. All residents welcome. Bring valid ID.', pinned: true, author: 'Cortero', date: 'Apr 5', status: 'Published', createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  { _id: 'announcement_seed_2', type: 'announcement', title: 'Barangay Assembly — Apr 20', category: 'Governance', content: 'Quarterly assembly at 8:00 AM, covered court. All residents are encouraged to attend.', body: 'Quarterly assembly at 8:00 AM, covered court. All residents are encouraged to attend.', pinned: false, author: 'Napagal', date: 'Apr 4', status: 'Published', createdAt: new Date(Date.now() - 4 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 4 * 86400000).toISOString() }
], []);

const [announcementsList, setAnnouncementsList] = useState([
  { id: 1, _id: 'announcement_seed_1', type: 'announcement', title: 'Free Medical Mission — Apr 15', category: 'Health', content: 'Free consultation, blood pressure check, medicine dispensing. All residents welcome. Bring valid ID.', body: 'Free consultation, blood pressure check, medicine dispensing. All residents welcome. Bring valid ID.', pinned: true, author: 'Cortero', date: 'Apr 5', status: 'Published' },
  { id: 2, _id: 'announcement_seed_2', type: 'announcement', title: 'Barangay Assembly — Apr 20', category: 'Governance', content: 'Quarterly assembly at 8:00 AM, covered court. All residents are encouraged to attend.', body: 'Quarterly assembly at 8:00 AM, covered court. All residents are encouraged to attend.', pinned: false, author: 'Napagal', date: 'Apr 4', status: 'Published' }
]);

const [mapResidents, setMapResidents] = useState([]);
const [mapBlotters, setMapBlotters] = useState([]);
const [mapAid, setMapAid] = useState([]);
const [mapLoading, setMapLoading] = useState(false);

// ── SCREEN ROUTING SUB-STATE ──
// 'list' (Main Board), 'new' (Creation Box), 'edit' (Modification Box)
const [announcementSubScreen, setAnnouncementSubScreen] = useState('list');

// ── CENTRALIZED FORM OBJECT STATE & SNAPSHOT REF ──
const [announcementForm, setAnnouncementForm] = useState({
  title: '', category: 'General', content: '', body: '', pinned: false, status: 'Draft'
});
const initialAnnouncementFormRef = useRef(null);

// ── STATE IDENTIFIERS FOR ENGINE MANAGEMENT ──
const [editingAnnId, setEditingAnnId] = useState(null);
const [searchAnnQuery, setSearchAnnQuery] = useState('');
const [filterAnnCategory, setFilterAnnCategory] = useState('All');
const [filterAnnStatus, setFilterAnnStatus] = useState('All');
const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
const hasNoAnnouncementsAtAll = !(announcementsList || []).length;

const loadAnnouncements = useCallback(async () => {
  if (!db) return;
  try {
    const res = await db.allDocs({ include_docs: true });
    const docs = res.rows.map((r) => r.doc).filter(Boolean);
    const annDocs = docs.filter((d) => d.type === 'announcement');
    if (annDocs.length === 0) {
      await db.bulkDocs(INITIAL_ANNOUNCEMENTS);
      setAnnouncementsList(INITIAL_ANNOUNCEMENTS);
    } else {
      setAnnouncementsList(annDocs);
    }
  } catch (e) {
    console.error('Failed to load announcements:', e);
  }
}, [INITIAL_ANNOUNCEMENTS]);

useEffect(() => {
  const timer = setTimeout(loadAnnouncements, 500);
  return () => clearTimeout(timer);
}, [loadAnnouncements]);

const handleZoneClick = useCallback((zoneName) => {
  console.log('Selected zone:', zoneName);
}, []);

const handleOpenNewAnnouncement = useCallback(() => {
  const blankForm = {
    title: '',
    category: 'General',
    content: '',
    body: '',
    pinned: false,
    status: 'Draft'
  };
  setEditingAnnId(null);
  setAnnouncementForm(blankForm);
  initialAnnouncementFormRef.current = blankForm;
  setAnnouncementSubScreen('new');
}, []);

const handleOpenEditAnnouncement = useCallback((ann) => {
  const targetId = ann._id || ann.id;
  const editData = {
    _id: targetId,
    id: targetId,
    title: ann.title || '',
    category: ann.category || 'General',
    content: ann.content || ann.body || '',
    body: ann.content || ann.body || '',
    pinned: Boolean(ann.pinned),
    status: ann.status || 'Draft'
  };
  setEditingAnnId(targetId);
  setAnnouncementForm(editData);
  initialAnnouncementFormRef.current = editData;
  setAnnouncementSubScreen('edit');
}, []);

const checkHasUnsavedChanges = useCallback(() => {
  const initial = initialAnnouncementFormRef.current;
  if (!initial) {
    return Boolean(
      (announcementForm.title || '').trim() ||
      (announcementForm.content || announcementForm.body || '').trim()
    );
  }
  const curTitle = (announcementForm.title || '').trim();
  const initTitle = (initial.title || '').trim();
  const curContent = (announcementForm.content || announcementForm.body || '').trim();
  const initContent = (initial.content || initial.body || '').trim();
  const curCategory = announcementForm.category || 'General';
  const initCategory = initial.category || 'General';
  const curPinned = Boolean(announcementForm.pinned);
  const initPinned = Boolean(initial.pinned);

  return (
    curTitle !== initTitle ||
    curContent !== initContent ||
    curCategory !== initCategory ||
    curPinned !== initPinned
  );
}, [announcementForm]);

const handleCancelOrBackAnnouncement = useCallback(() => {
  if (checkHasUnsavedChanges()) {
    Swal.fire({
      icon: 'warning',
      title: 'Unsaved Changes',
      text: 'May mga binago ka na hindi pa nasi-save. Sigurado kang nais mong umalis?',
      showCancelButton: true,
      confirmButtonText: 'Discard & Leave',
      cancelButtonText: 'Stay',
      confirmButtonColor: '#ef4444'
    }).then((result) => {
      if (result.isConfirmed) {
        setAnnouncementSubScreen('list');
        setEditingAnnId(null);
        initialAnnouncementFormRef.current = null;
      }
    });
  } else {
    setAnnouncementSubScreen('list');
    setEditingAnnId(null);
    initialAnnouncementFormRef.current = null;
  }
}, [checkHasUnsavedChanges]);

const handleSaveAnnouncement = async (e, targetStatus) => {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const title = (announcementForm.title || '').trim();
  const content = (announcementForm.content || announcementForm.body || '').trim();

  if (!title || !content) {
    Swal.fire({
      icon: 'warning',
      title: 'Required Fields',
      text: 'Title and content are required.'
    });
    return;
  }

  setIsSavingAnnouncement(true);
  try {
    const isEdit = Boolean(editingAnnId || announcementForm._id || announcementForm.id);
    const targetId = editingAnnId || announcementForm._id || announcementForm.id;
    const now = new Date().toISOString();
    const finalStatus = targetStatus || announcementForm.status || 'Draft';
    let docPayload;

    if (isEdit) {
      let existing = null;
      if (db) {
        try {
          existing = await db.get(targetId);
        } catch (getErr) {
          console.warn('Announcement document not found in PouchDB, saving fresh:', getErr);
        }
      }

      docPayload = {
        ...(existing || {}),
        _id: targetId,
        type: 'announcement',
        title,
        category: announcementForm.category || 'General',
        content,
        body: content,
        pinned: Boolean(announcementForm.pinned),
        status: finalStatus,
        updatedAt: now
      };

      if (db) {
        await db.put(docPayload);
      }

      try {
        await createAuditLog({
          action: 'UPDATE',
          module: 'ANNOUNCEMENTS',
          recordId: targetId,
          user: `${currentUser?.username || 'admin'} (${role || 'admin'})`,
          details: `Updated announcement: "${title}" (${finalStatus})`
        });
      } catch (auditErr) {
        console.warn('Audit log failed for announcement update:', auditErr);
      }

      setAnnouncementsList((prev) =>
        prev.map((a) => ((a._id || a.id) === targetId ? docPayload : a))
      );

      const isPublishedNow = finalStatus === 'Published';
      const wasDraft = initialAnnouncementFormRef.current?.status === 'Draft';
      const successMessage = isPublishedNow
        ? (wasDraft ? 'Announcement published successfully!' : 'Changes saved successfully!')
        : 'Announcement saved as draft!';
      showToast(successMessage, 'success');
    } else {
      const newId = `announcement_${Date.now()}`;
      const authorName = currentUser?.fullName || currentUser?.name || currentUser?.username || 'Administrator';
      const formattedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      docPayload = {
        _id: newId,
        type: 'announcement',
        title,
        category: announcementForm.category || 'General',
        content,
        body: content,
        pinned: Boolean(announcementForm.pinned),
        status: finalStatus,
        author: authorName,
        date: formattedDate,
        createdAt: now,
        updatedAt: now
      };

      if (db) {
        await db.put(docPayload);
      }

      try {
        await createAuditLog({
          action: 'CREATE',
          module: 'ANNOUNCEMENTS',
          recordId: newId,
          user: `${currentUser?.username || 'admin'} (${role || 'admin'})`,
          details: `Created announcement: "${title}" (${finalStatus})`
        });
      } catch (auditErr) {
        console.warn('Audit log failed for announcement create:', auditErr);
      }

      setAnnouncementsList((prev) => [docPayload, ...prev]);

      const successMessage = finalStatus === 'Published'
        ? 'Announcement published successfully!'
        : 'Draft saved successfully!';
      showToast(successMessage, 'success');
    }

    initialAnnouncementFormRef.current = null;
    setEditingAnnId(null);
    setAnnouncementSubScreen('list');
  } catch (err) {
    console.error('Failed to save announcement:', err);
    Swal.fire({
      icon: 'error',
      title: 'Save Failed',
      text: err.message || 'An error occurred while saving the announcement.'
    });
  } finally {
    setIsSavingAnnouncement(false);
  }
};

const handleTogglePinAnnouncement = async (id) => {
  if (!id) return;
  try {
    let doc = null;
    if (db) {
      try {
        doc = await db.get(id);
      } catch {
        const found = (announcementsList || []).find((a) => (a._id || a.id) === id);
        if (found) {
          doc = { ...found, _id: String(id), type: 'announcement' };
        }
      }
    } else {
      const found = (announcementsList || []).find((a) => (a._id || a.id) === id);
      if (found) doc = { ...found };
    }

    if (!doc) return;

    const newPinned = !doc.pinned;
    const updated = {
      ...doc,
      pinned: newPinned,
      updatedAt: new Date().toISOString()
    };

    if (db) {
      await db.put(updated);
    }

    try {
      await createAuditLog({
        action: 'UPDATE',
        module: 'ANNOUNCEMENTS',
        recordId: id,
        user: `${currentUser?.username || 'admin'} (${role || 'admin'})`,
        details: `${newPinned ? 'Pinned' : 'Unpinned'} announcement: "${doc.title || id}"`
      });
    } catch (auditErr) {
      console.warn('Audit log failed for toggle pin:', auditErr);
    }

    setAnnouncementsList((prev) =>
      prev.map((ann) => {
        const annId = ann._id || ann.id;
        return annId === id ? { ...ann, pinned: newPinned } : ann;
      })
    );

    showToast(newPinned ? 'Announcement pinned to top' : 'Announcement unpinned', 'success');
  } catch (err) {
    console.error('Failed to toggle pin:', err);
    showToast('Failed to update pin status', 'error');
  }
};

const handleTriggerDeleteAnnouncement = async (id, title) => {
  if (!id) return;
  const result = await Swal.fire({
    title: 'Delete Announcement?',
    text: `Are you sure you want to delete "${title || 'this announcement'}"? This action cannot be undone.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel'
  });

  if (!result.isConfirmed) return;

  try {
    let docTitle = title;
    if (db) {
      try {
        const doc = await db.get(id);
        if (doc?.title) docTitle = doc.title;
        await db.remove(doc);
      } catch (getErr) {
        console.warn('Doc not found in PouchDB, removing from state only:', getErr);
      }
    }

    setAnnouncementsList((prev) => prev.filter((ann) => (ann._id || ann.id) !== id));

    try {
      await createAuditLog({
        action: 'DELETE',
        module: 'ANNOUNCEMENTS',
        recordId: id,
        user: `${currentUser?.username || 'admin'} (${role || 'admin'})`,
        details: `Deleted announcement: "${docTitle || id}"`
      });
    } catch (auditErr) {
      console.warn('Audit log failed for delete announcement:', auditErr);
    }

    showToast('Announcement deleted successfully', 'success');
  } catch (err) {
    console.error('Failed to delete announcement:', err);
    showToast('Failed to delete announcement', 'error');
  }
};

const filteredAnnouncements = React.useMemo(() => {
  const q = searchAnnQuery.trim().toLowerCase();
  return (announcementsList || [])
    .slice()
    .sort((a, b) => {
      const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      const timeA = new Date(a.updatedAt || a.createdAt || a.date || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || b.date || 0).getTime();
      return timeB - timeA;
    })
    .filter((ann) => {
      const title = String(ann.title || '').toLowerCase();
      const content = String(ann.content || ann.body || '').toLowerCase();
      const matchesQuery = !q || title.includes(q) || content.includes(q);
      const matchesCategory = filterAnnCategory === 'All' || ann.category === filterAnnCategory;
      const annStatus = ann.status || 'Draft';
      const matchesStatus = filterAnnStatus === 'All' || annStatus === filterAnnStatus;
      return matchesQuery && matchesCategory && matchesStatus;
    });
}, [announcementsList, searchAnnQuery, filterAnnCategory, filterAnnStatus]);

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

  // ════════════════════════════════════════════════════════════════
  // 4. EFFECT #2: FEEDBACK & COMPLAINTS POUCHDB LISTENER
  // ════════════════════════════════════════════════════════════════
    useEffect(() => {
  if (!db) return;

  // Initial Load mula sa PouchDB
  const fetchFeedbacks = async () => {
    try {
      const res = await db.find({
        selector: {
          $or: [
            { type: 'feedback' },
            { type: 'feedback_report' },
          ],
        },
        limit: 500,
      });
      const dbFeedbacks = res.docs.map(mapDocToFeedback);

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

  const initialFetchTimer = setTimeout(fetchFeedbacks, 500);

  // ✅ Real-time Live Changes Listener — ISANG .changes() LANG
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

  return () => {
    clearTimeout(initialFetchTimer);   // ✅ DAGDAG — i-clear ang timer
    changes.cancel();
  };
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
      showToast('Unable to save feedback update to offline database.', 'error');
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

const [conflictSearch, setConflictSearch] = useState('');
const [conflictStatusFilter, setConflictStatusFilter] = useState('all');
const [conflictModuleFilter, setConflictModuleFilter] = useState('all');
const [conflictSort, setConflictSort] = useState('newest');
const [conflictPage, setConflictPage] = useState(1);
const [selectedConflicts, setSelectedConflicts] = useState(new Set());
const [showConflictDetail, setShowConflictDetail] = useState(null);
const conflictsPerPage = 10;
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
    setLoadingConflicts(true);
    const result = await db.allDocs({ conflicts: true, include_docs: true });
    const conflictList = [];
    for (const row of result.rows) {
      if (row.doc && row.doc._conflicts && row.doc._conflicts.length > 0) {
        for (const conflictRev of row.doc._conflicts) {
          try {
            const conflictingDoc = await db.get(row.id, { rev: conflictRev });
            
            // 🔒 XSS SANITIZATION: Prevent <script> injection
            const rawName = row.doc.name || `${row.doc.firstName || ''} ${row.doc.lastName || ''}`.trim() || 'Unknown Resident';
            const sanitizedName = String(rawName).replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            const docADate = conflictDocTime(row.doc);
const docBDate = conflictDocTime(conflictingDoc);
const detectedAt = new Date().toISOString();

const diff = computeConflictDiff(row.doc, conflictingDoc);
const moduleLabel = conflictModuleLabel(row.doc?.type);
const moduleKey = String(row.doc?.type || '').toLowerCase();
const changedFields = diff.map((d) => d.field);
const changedFieldsDisplay = diff.length === 0 ? '—' : diff.map((d) => d.label).join(', ');

const conflictRecord = {
  id: `${row.id}-${conflictRev}`,
  docId: row.id,
  residentName: sanitizedName,
  winningRev: row.doc._rev,
  conflictRev: conflictRev,
  docA: row.doc,
  docB: conflictingDoc,
  updatedAt: detectedAt,
  timeA: docADate,
  timeB: docBDate,
  latestConflictTime: Math.max(docADate, docBDate, Date.now() / 1000),
  moduleLabel,
  moduleKey,
  type: row.doc?.type || conflictingDoc?.type,
  diff,
  changedFields,
  changedFieldsDisplay,
  status: 'unresolved',
};
conflictList.push(conflictRecord);
          } catch (fetchErr) {
            console.error('Error fetching conflicting revision doc:', fetchErr);
          }
        }
      }
    }
    setConflictsList(conflictList);
    setSelectedConflicts(new Set());
  } catch (err) {
    console.error('Error fetching database conflicts:', err);
  } finally {
    setLoadingConflicts(false);
  }
};


const fetchArchivedResidents = async () => {
  try {
    const result = await db.allDocs({ include_docs: true });
    const archived = result.rows
      .filter(row => row.doc && (row.doc.type === 'resident' || row.doc.type === 'profile') && row.doc.isArchived === true)
      .map(row => ({
        id: row.doc._id,
        name: row.doc.name || `${row.doc.firstName || ''} ${row.doc.lastName || ''}`.trim(),
        purok: row.doc.purok || 'Unassigned',
        archivedAt: row.doc.archivedAt
      }));
    setArchivedResidents(archived);
  } catch (err) {
    console.error('Error fetching archived residents:', err);
  }
}
// Automatically scan for conflicts when mounting or navigating to conflict screen
useEffect(() => {
  if (screen === 'conflicts') {
    fetchDatabaseConflicts();   
  }
}, [screen]);

// Resolve Conflict: Keep Version A (Discard conflicting revision B)
const handleKeepVersionA = async (conflict) => {
  try {
    // Attempt to remove the conflicting revision
    await db.remove(conflict.docId, conflict.conflictRev);
    showToast('✓ Conflict resolved. Retained Version A.', 'success');
    
    const diffSummary = Array.isArray(conflict.diff) && conflict.diff.length > 0
  ? ` (${conflict.diff.map(d => d.label).join(', ')})`
  : '';
await logConflictResolution({
  docId: conflict.docId,
  module: conflict.moduleLabel || 'CONFLICTS',
  strategy: 'keep-a',
  winnerRev: conflict.winningRev,
  loserRevs: [conflict.conflictRev],
  mergedFields: conflict.changedFields || [],
  residentName: conflict.residentName,
  details: `Retained Version A for ${conflict.residentName}${diffSummary}`,
});
    
    // Refresh UI
    if (typeof fetchDatabaseConflicts === 'function') fetchDatabaseConflicts();
    if (typeof fetchResidents === 'function') fetchResidents();
  } catch (err) {
    console.error('Failed to purge conflict revision:', err);
    // If it's a 404 (already deleted) or 409 (already updated by sync), treat as success
    if (err.status === 404 || err.status === 409) {
      showToast('✓ Conflict was already resolved by background sync. Refreshing list...', 'success');
      if (typeof fetchDatabaseConflicts === 'function') fetchDatabaseConflicts();
      if (typeof fetchResidents === 'function') fetchResidents();
    } else {
      showToast(`Error resolving conflict: ${err.message || 'Unknown error'}`, 'error');
    }
  }
};

// ── BULK RESOLVE ALL CONFLICTS (NUCLEAR OPTION) ──
const handleResolveAllConflicts = async () => {
  if (!window.confirm("⚠️ WARNING: This will permanently delete ALL conflicting revisions (Version B) and keep only the Local Winning version (Version A). This will also force a sync and compact the database. Continue?")) {
    return;
  }
  
  setLoadingConflicts(true);
  let successCount = 0;
  let errorCount = 0;
  
  // 1. Get unique document IDs (handles docs with multiple conflicts correctly)
  const uniqueDocIds = [...new Set(conflictsList.map(c => c.docId))];

  for (const docId of uniqueDocIds) {
    try {
      // 2. Get the document WITH its conflicts array
      const currentDoc = await db.get(docId, { conflicts: true });
      
      if (currentDoc._conflicts && currentDoc._conflicts.length > 0) {
        let docResolved = true;
        
        // 3. Explicitly DELETE every single conflicting revision (Version B)
        for (const conflictRev of currentDoc._conflicts) {
          try {
            await db.remove(docId, conflictRev);
          } catch (removeErr) {
            // 404 = already deleted, 409 = already resolved by background sync
            if (removeErr.status !== 404 && removeErr.status !== 409) {
              console.warn(`⚠️ Failed to remove rev ${conflictRev} for ${docId}:`, removeErr);
              docResolved = false;
            }
          }
        }
        
        // 4. Assert the winning document (Version A) as the single source of truth
        if (docResolved) {
          try {
            // Get it again to ensure we have the latest _rev after deletions
            const winningDoc = await db.get(docId, { conflicts: true });
            
            // Create a clean payload
            const cleanPayload = { ...winningDoc };
            
            // Remove conflict metadata to prevent PouchDB from getting confused
            delete cleanPayload._conflicts;
            
            // Add resolution markers
            cleanPayload._conflictResolved = true;
            cleanPayload.updatedAt = new Date().toISOString();

            await db.put(cleanPayload);
            successCount++;
            try {
              const conflictMeta = conflictsList.find((c) => c.docId === docId) || {};
              await logConflictResolution({
                docId,
                module: conflictMeta.moduleLabel || 'CONFLICTS',
                strategy: 'keep-local',
                winnerRev: conflictMeta.winningRev || currentDoc._rev,
                loserRevs: conflictMeta.conflictRev ? [conflictMeta.conflictRev] : [],
                mergedFields: conflictMeta.changedFields || [],
                residentName: conflictMeta.residentName || '',
                details: `Bulk resolution kept local version for ${conflictMeta.residentName || docId}`,
              });
            } catch (auditErr) {
              console.warn('Bulk conflict audit log failed:', auditErr);
            }
          } catch (putErr) {
            console.warn(`⚠️ Failed to update winning doc ${docId}:`, putErr);
            // If it's a 409, the background sync might have already updated it. 
            // We still count the conflict deletions as a success.
            if (putErr.status === 409) {
              successCount++;
            } else {
              errorCount++;
            }
          }
        } else {
          errorCount++;
        }
      }
    } catch (err) {
      console.error(`❌ Failed to process document ${docId}:`, err);
      errorCount++;
    }
  }

  // 5. CRITICAL: Force sync to remote to ensure the deletions (tombstones) 
  // and the new winning revision are sent to CouchDB, preventing it from pushing old conflicts back.
  if (typeof forceSyncToRemote === 'function') {
    try {
      await forceSyncToRemote();
      
      // 🔥 CRITICAL FIX: Add a deliberate delay to allow the live replication 
      // to fully settle and process the deletions BEFORE we refresh the UI.
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (syncErr) {
      console.warn("⚠️ Force sync had issues, but local resolution is complete:", syncErr);
    }
  }

  // 6. 🔥 SECRET WEAPON: FORCE COMPACTION
  // This physically removes the deleted conflict revisions from the local database, 
  // preventing them from being flagged by allDocs({ conflicts: true }) ever again.
  try {
    await db.compact();
  } catch (compactErr) {
    console.warn("⚠️ Database compaction failed or skipped:", compactErr);
  }

  setLoadingConflicts(false);
  
  const resultMsg = `✅ Bulk Resolution Complete!\n\nSuccessfully resolved: ${successCount} documents\nErrors/Skipped: ${errorCount}`;
  showToast(resultMsg, 'success');

  // 7. FORCE REFRESH the UI and DB state
  if (typeof fetchDatabaseConflicts === 'function') {
    await fetchDatabaseConflicts();
  }
  if (typeof fetchResidents === 'function') {
    await fetchResidents();
  }
};

// Resolve Conflict: Keep Version B (Override current doc with revision B's data)
const handleKeepVersionB = async (conflict) => {
  try {
    // 1. Fetch the exact conflicting revision (Version B data)
    const docB = await db.get(conflict.docId, { rev: conflict.conflictRev });
    
    // 2. CRITICAL FIX: Fetch the CURRENT winning document to get its absolute latest _rev.
    // This prevents 409 errors if the background sync updated the document while we were looking at the UI.
    const currentDoc = await db.get(conflict.docId);
    
    // 3. Create a new document with Version B's data, but using the CURRENT winning _rev
    const newWinningDoc = {
      ...docB,
      _id: conflict.docId,
      _rev: currentDoc._rev // Overwrite the current winner safely
    };
    
    // 4. Save it to make Version B the new winner
    await db.put(newWinningDoc);
    
    // 5. Clean up the old conflicting revision (mark it as deleted)
    try {
      await db.remove(conflict.docId, conflict.conflictRev);
    } catch (removeErr) {
      console.warn('Old conflict rev already resolved or removed by sync:', removeErr);
    }
    
    showToast('✓ Conflict resolved. Successfully kept Version B data.', 'success');
    
    const diffSummary = Array.isArray(conflict.diff) && conflict.diff.length > 0
  ? ` (${conflict.diff.map(d => d.label).join(', ')})`
  : '';
await logConflictResolution({
  docId: conflict.docId,
  module: conflict.moduleLabel || 'CONFLICTS',
  strategy: 'keep-b',
  winnerRev: conflict.conflictRev,
  loserRevs: [conflict.winningRev],
  mergedFields: conflict.changedFields || [],
  residentName: conflict.residentName,
  details: `Retained Version B for ${conflict.residentName}${diffSummary}`,
});
    
    // Refresh UI
    if (typeof fetchDatabaseConflicts === 'function') fetchDatabaseConflicts();
    if (typeof fetchResidents === 'function') fetchResidents();
  } catch (err) {
    console.error('Failed to resolve with Version B:', err);
    // Graceful fallback for race conditions with background sync
    if (err.status === 404 || err.status === 409) {
      showToast('✓ Conflict was already resolved by background sync. Refreshing list...', 'success');
      if (typeof fetchDatabaseConflicts === 'function') fetchDatabaseConflicts();
      if (typeof fetchResidents === 'function') fetchResidents();
    } else {
      showToast(`Error resolving conflict: ${err.message || 'Unknown error'}`, 'error');
    }
  }
};

const handleKeepBoth = async (conflict) => {
  try {
    const newDocId = `${conflict.docId}_split_${Date.now()}`;
    const duplicateDoc = {
      ...conflict.docB,          
      _id: newDocId
    };
    delete duplicateDoc._rev;
    
    await db.put(duplicateDoc);
    await db.remove(conflict.docId, conflict.conflictRev);
    showToast('✓ Conflict resolved. Saved Version B as a distinct record.', 'success');
    
await logConflictResolution({
  docId: conflict.docId,
  module: conflict.moduleLabel || 'CONFLICTS',
  strategy: 'keep-both',
  winnerRev: conflict.winningRev,
  loserRevs: [],
  mergedFields: conflict.changedFields || [],
  residentName: conflict.residentName,
  details: `Split conflict for ${conflict.residentName}; Version B (rev ${conflict.conflictRev}) preserved as distinct record (${newDocId})`,
  meta: {
    conflict: true,
    strategy: 'keep-both',
    winnerRev: conflict.winningRev,
    loserRevs: [],
    mergedFields: conflict.changedFields || [],
    splitId: newDocId,
    originalConflictRev: conflict.conflictRev,
  },
});
    
    fetchDatabaseConflicts();
  } catch (err) {
    console.error('Failed to split conflicting document:', err);
    showToast('Error splitting conflict.', 'error');
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

const pendingRequestsCount = useMemo(() => {
  return (issuedCertificates || []).filter((c) => {
    const status = (c.status || '').toLowerCase();
    if (['issued', 'released', 'cancelled', 'needs revision', 'returned', 'denied', 'rejected'].includes(status)) return false;
    const step = Number(c.step || 1);
    if (step >= 2 && step <= 4) return true;
    if (step === 1) {
      return ['under review', 'proceeding', 'for approval', 'approved', 'pending', 'ready'].includes(status);
    }
    return false;
  }).length;
}, [issuedCertificates]);

const pendingBlotterCount = useMemo(() => {
  return blotterList.filter(
    (b) => b.status === 'Open' || b.status === 'Under Mediation'
  ).length;
}, [blotterList]);

const activeFeedbackCount = useMemo(() => {
  return feedbackList.filter(
    (f) => f.status === 'Pending' || f.status === 'Under Review'
  ).length;
}, [feedbackList]);

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
    showToast('Please select a certificate from the table first.', 'error');
    return;
  }
  setTimeout(() => window.print(), 150);
};

const handleSaveOnly = async (certOverride = null) => {
  const targetCert = certOverride || selectedCertificate;

  if (!targetCert) {
    if (typeof showToast === 'function') {
      showToast('No certificate selected.', 'error');
    }
    return;
  }

  try {
    const latestDoc = await db.get(targetCert._id);

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

    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'SAVE_CERTIFICATE',
        module: 'CERTIFICATES',
        recordId: updatedDoc.refNumber || updatedDoc._id,
        user: `${currentUser?.username || 'admin'} (${role})`,
        details: `Saved & marked as Issued: ${updatedDoc.certificateType || 'Certificate'} for ${updatedDoc.fullName || updatedDoc.residentName || 'Resident'}`,
      });
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    setIssuedCertificates((prev) => {
      const filtered = prev.filter((cert) => cert._id !== updatedDoc._id);
      return [updatedDoc, ...filtered];
    });

    if (typeof showToast === 'function') {
      showToast('Transaction saved and certificate marked as Issued!', 'success');
    } else {
      showToast('Transaction saved and certificate marked as Issued!', 'success');
    }
  } catch (err) {
    console.error('Save failed:', err);

    if (typeof showToast === 'function') {
      showToast('Failed to save transaction.', 'error');
    } else {
      showToast('Failed to save transaction.', 'error');
    }
  }
};

const onOpenPrintPreview = useCallback((cert, mode = 'copy') => {
  setPrintMode(mode);
  setPrintData(cert);
}, [setPrintMode, setPrintData]);

const issueAndPrint = async (cert) => {
  if (!cert) return;

  if (!issuanceMeta.orNumber?.trim()) {
    Swal.fire({
      icon: 'warning',
      title: 'Missing O.R. Number',
      text: 'Please enter the Official Receipt (O.R.) Number first.'
    });
    return;
  }

  setPrintMode('original');

  if (Number(cert.step) === 4) {
    try {
      const latestDoc = await db.get(cert._id);

      const updatedCert = {
        ...latestDoc,
        step: 5,
        status: 'Issued',
        issuedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        orNumber: issuanceMeta.orNumber,
        amountPaid: issuanceMeta.amountPaid,
        ctc: {
          ...(latestDoc.ctc || {}),
          number: issuanceMeta.ctcNumber || latestDoc.ctc?.number
        }
      };

      await db.put(updatedCert);

      if (typeof setIssuedCertificates === 'function') {
        setIssuedCertificates(prev =>
          prev.map(c =>
            c._id === updatedCert._id ? updatedCert : c
          )
        );
      }

      if (typeof createAuditLog === 'function') {
        await createAuditLog({
          action: 'ISSUE_CERTIFICATE',
          module: 'CERTIFICATES',
          recordId: updatedCert._id,
          details: `Issued ${updatedCert.certificateType} for ${updatedCert.firstName} ${updatedCert.lastName}`
        });
      }

      setPrintData(updatedCert);
      setSelectedCertificate(null);

      Swal.fire({
        icon: 'success',
        title: 'Certificate Issued!',
        text: 'Document printed and status updated to Issued.',
        timer: 2500,
        showConfirmButton: false
      });
    } catch (err) {
      console.error('Failed to auto-issue certificate:', err);

      Swal.fire({
        icon: 'error',
        title: 'Update Failed',
        text: 'Document printed, but failed to update status. Please check connection.'
      });
    }
  } else {
    setPrintData(cert);
    setSelectedCertificate(null);
  }
};

const executePrintAndIssue = async (targetCert) => {
  const targetId = targetCert?._id || selectedCertificate?._id;

  if (!targetId) {
    showToast('No certificate selected.', 'error');
    return;
  }

  if (
    !issuanceMeta.orNumber ||
    !String(issuanceMeta.orNumber).trim() ||
    !issuanceMeta.amountPaid
  ) {
    showToast(
      'Please fill in required payment fields (OR No. and Amount Paid) in the receipt section before printing.',
      'error'
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
    showToast('✓ Certificate successfully issued, saved, and sent to printer!', 'success');
  } catch (err) {
    console.error('Print release failed:', err);
    showToast('Failed to process certificate release.', 'error');
  }
};

// ── CTC MODAL STATE MANAGEMENT ──
const [showCtcModal, setShowCtcModal] = useState(false);
const [ctcForm, setCtcForm] = useState({
  dateIssued: toPHDateString(),
  ctcNo: '',
  rbiNo: '',
  ctcName: '',
  amtPaid: '',
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
      isIssuedByBarangay: ctcForm.isIssuedByBarangay,
      placeIssued: ctcForm.placeIssued,
      dateIssued: ctcForm.dateIssued || toPHDateString(),
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

    showToast('✓ CTC Record successfully saved!', 'success');
  } catch (err) {
    console.error('Failed to save CTC record to local database:', err);
    showToast('Error saving CTC record.', 'error');
  }
};

// ── BUSINESS CLEARANCE FORM STATE ──
const [businessForm, setBusinessForm] = useState({
  // Applicant Information
  bcIdNo: '',
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
  regDate: toPHDateString(), 
  orDateIssued: toPHDateString(), 

  // Business Information
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

  // Issuance metadata
  status: '',
  clearanceIssueDate: '',
  expiryDate: '',
});


const [businessTab, setBusinessTab] = useState('page1');
const [businessMasterlist, setBusinessMasterlist] = useState([]);
const [businessClearanceSearch, setBusinessClearanceSearch] = useState('');
const [businessPage, setBusinessPage] = useState(1);

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

const totalBusinessPages = Math.max(1, Math.ceil(filteredBusinessClearances.length / MASTERLIST_PAGE_SIZE));
const safeBusinessPage = Math.min(businessPage, totalBusinessPages);
const pagedBusinessClearances = filteredBusinessClearances.slice(
  (safeBusinessPage - 1) * MASTERLIST_PAGE_SIZE,
  safeBusinessPage * MASTERLIST_PAGE_SIZE
);

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

  // Validate in the save handler (not only the UI) so hidden-page fields and
  // programmatic submits are still checked. Collect all errors, then focus the
  // first invalid field on the right page.
  const errors = {};
  if (!businessForm.lastName?.trim()) errors.lastName = 'Last name is required.';
  if (!businessForm.firstName?.trim()) errors.firstName = 'First name is required.';
  if (!businessForm.businessName?.trim()) errors.businessName = 'Business name is required.';
  if (!/^\d{4,12}$/.test(String(businessForm.orNo || '').trim())) {
    errors.orNo = 'O.R. Number must be 4 to 12 digits (e.g. 9876543).';
  }
  const feeCheck = parseMoney(businessForm.clearanceFee, { required: true });
  if (!feeCheck.ok) errors.clearanceFee = feeCheck.error;
  const garbageCheck = parseMoney(businessForm.garbageFee);
  if (!garbageCheck.ok) errors.garbageFee = garbageCheck.error;

  if (Object.keys(errors).length > 0) {
    setBusinessErrors(errors);
    const firstInvalid = ['lastName', 'firstName', 'businessName', 'orNo', 'clearanceFee', 'garbageFee']
      .find((field) => errors[field]);
    const targetTab = (errors.lastName || errors.firstName || errors.businessName) ? 'page1' : 'page2';
    setBusinessTab(targetTab);
    showToast('Please complete the highlighted fields.', 'error');
    requestAnimationFrame(() => {
      const el = businessFieldRefs.current[firstInvalid];
      if (el && typeof el.focus === 'function') el.focus();
    });
    return;
  }
  setBusinessErrors({});

  setIsSavingBusiness(true);

  try {
    const isEditing = Boolean(businessForm._id);
    const docId = isEditing
      ? businessForm._id
      : collisionSafeId('bus_clearance_');

    const newBcIdNo = isEditing
      ? businessForm.bcIdNo
      : await getNextBusinessSequence();

    const formattedOwnerName = `${businessForm.lastName || ''}, ${businessForm.firstName || ''} ${businessForm.middleName || ''}`
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    const issueDate = businessForm.orDateIssued || toPHDateString();
    const parsedIssue = new Date(issueDate);
    const issueYear = Number.isNaN(parsedIssue.getTime())
      ? new Date().getFullYear()
      : parsedIssue.getFullYear();

    const payload = {
      ...businessForm,
      ownerName: formattedOwnerName,
      _id: docId,
      bcIdNo: newBcIdNo,
      type: 'business_clearance',
      status: businessForm.status || 'Issued',
      dateIssued: issueDate,
      clearanceIssueDate: businessForm.clearanceIssueDate || toPHDateString(),
      clearanceYear: String(issueYear),
      expiryDate: `${issueYear}-12-31`,
      clearanceFee: feeCheck.value.toFixed(2),
      garbageFee: (garbageCheck.value ?? 0).toFixed(2),
      updatedAt: new Date().toISOString(),
      createdAt: businessForm.createdAt || new Date().toISOString(),
    };

    if (!isEditing) {
      delete payload._rev;
    }

    await db.put(payload);

    await createAuditLog({
      action: isEditing
        ? 'UPDATE_BUSINESS_CLEARANCE'
        : 'CREATE_BUSINESS_CLEARANCE',
      module: 'BUSINESS_CLEARANCE',
      recordId: newBcIdNo,
      details: `${isEditing ? 'Updated' : 'Created'} Business Clearance ${newBcIdNo} for ${businessForm.businessName}`,
    });

    await fetchBusinessClearances();

    showToast(
      isEditing
        ? 'Business Clearance updated successfully!'
        : `Business Clearance ${newBcIdNo} saved successfully!`,
      'success'
    );

    await resetBusinessForm(true);
    setBusinessTab('page1');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error('Failed to save/update Business Clearance:', err);
    showToast(
      `Error saving record: ${err.message || 'Database error'}`,
      'error'
    );
  } finally {
    setIsSavingBusiness(false);
  }
};

// ── POUCHDB SAVE HANDLER: DRAFT (no O.R. / fee required, not yet issued) ──
const handleSaveBusinessDraft = async () => {
  const errors = {};
  if (!businessForm.lastName?.trim()) errors.lastName = 'Last name is required.';
  if (!businessForm.firstName?.trim()) errors.firstName = 'First name is required.';
  if (!businessForm.businessName?.trim()) errors.businessName = 'Business name is required.';

  if (Object.keys(errors).length > 0) {
    setBusinessErrors(errors);
    const firstInvalid = ['lastName', 'firstName', 'businessName'].find((field) => errors[field]);
    setBusinessTab('page1');
    showToast('Please complete the highlighted fields before saving a draft.', 'error');
    requestAnimationFrame(() => {
      const el = businessFieldRefs.current[firstInvalid];
      if (el && typeof el.focus === 'function') el.focus();
    });
    return;
  }
  setBusinessErrors({});

  setIsSavingBusiness(true);
  try {
    const isEditing = Boolean(businessForm._id);
    const docId = isEditing ? businessForm._id : collisionSafeId('bus_clearance_');

    const formattedOwnerName = `${businessForm.lastName || ''}, ${businessForm.firstName || ''} ${businessForm.middleName || ''}`
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    const payload = {
      ...businessForm,
      ownerName: formattedOwnerName,
      _id: docId,
      bcIdNo: businessForm.bcIdNo || '',
      type: 'business_clearance',
      status: 'Draft',
      updatedAt: new Date().toISOString(),
      createdAt: businessForm.createdAt || new Date().toISOString(),
    };

    if (!isEditing) delete payload._rev;

    await db.put(payload);

    await createAuditLog({
      action: isEditing ? 'UPDATE_BUSINESS_CLEARANCE' : 'CREATE_BUSINESS_CLEARANCE',
      module: 'BUSINESS_CLEARANCE',
      recordId: payload.bcIdNo || 'DRAFT',
      details: `Saved Business Clearance DRAFT for ${businessForm.businessName}`,
    });

    await fetchBusinessClearances();

    showToast('Draft saved. It will not show as valid until issued with an O.R.', 'success');
  } catch (err) {
    console.error('Failed to save Business Clearance draft:', err);
    showToast(
      `Error saving draft: ${err.message || 'Database error'}`,
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

  let lastName = record.lastName;
  let firstName = record.firstName;
  let middleName = record.middleName;

  if ((!lastName || !firstName) && record.ownerName) {
    const parts = record.ownerName.split(',');

    if (parts.length >= 2) {
      lastName = parts[0].trim();
      const nameParts = parts[1].trim().split(' ');
      firstName = nameParts[0] || '';
      middleName = nameParts.slice(1).join(' ') || '';
    }
  }

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';

    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  };

  setBusinessForm({
    ...INITIAL_BUSINESS_STATE,
    ...record,
    lastName: lastName || '',
    firstName: firstName || '',
    middleName: middleName || '',
    regDate: formatDateForInput(record.regDate),
    orDateIssued: formatDateForInput(record.orDateIssued),
    secretary:
      record.secretary ||
      settingsForm?.luponSecretary ||
      'MRS. MELY M. PRESADO',
    captain:
      record.captain ||
      settingsForm?.punongBarangay ||
      'HON. ANNABELLE E. RULL',
  });

  setBusinessTab('page1');
  showToast(`Loaded "${record.businessName}" for editing.`, 'info');

  setTimeout(() => {
    if (businessFormRef.current) {
      businessFormRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

      businessFormRef.current.style.boxShadow =
        '0 0 0 4px rgba(59, 130, 246, 0.4)';
      businessFormRef.current.style.transition = 'box-shadow 0.3s ease';

      const businessNameInput =
        businessFormRef.current.querySelector(
          'input[placeholder*="Business Name"]'
        );

      if (businessNameInput) {
        businessNameInput.focus();
      }

      setTimeout(() => {
        if (businessFormRef.current) {
          businessFormRef.current.style.boxShadow = 'none';
        }
      }, 1500);
    } else {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, 100);
};

// ── RESET BUSINESS CLEARANCE FORM ──
const resetBusinessForm = async (skipConfirm = false) => {
  setBusinessErrors({});
  if (
    !skipConfirm &&
    (
      businessForm.businessName?.trim() ||
      businessForm.lastName?.trim() ||
      businessForm.firstName?.trim()
    )
  ) {
    if (
      !window.confirm(
        'Are you sure you want to clear the form? All unsaved data will be lost.'
      )
    ) {
      return;
    }
  }

  const nextBcIdNo = await peekNextBusinessSequence();

  setBusinessForm({
    ...INITIAL_BUSINESS_STATE,
    bcIdNo: nextBcIdNo,
    regDate: new Date().toISOString().split('T')[0],
    orDateIssued: new Date().toISOString().split('T')[0],
    secretary: settingsForm?.luponSecretary || 'MRS. MELY M. PRESADO',
    captain: settingsForm?.punongBarangay || 'HON. ANNABELLE E. RULL',
    _id: null,
    _rev: null
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

const handleExportResidentsExcel = async () => { try { // Kung may selected residents, export lang ang selected // Kung wala, export lahat ng currently filtered const dataToExport = selectedResidents.length > 0 ? sortedFilteredResidents.filter((r) => selectedResidents.includes(r.id)) : sortedFilteredResidents;

if (dataToExport.length === 0) {
  showToast('warning', 'No residents to export');
  return;
}

const rows = dataToExport.map((r) => ({
  'Resident ID': r.id,
  'RBI ID': r.rbiId || '—',
  'Full Name': r.name,
  'Purok': r.purok,
  'Age': r.age,
  'Gender': r.gender || '—',
  'Civil Status': r.civilStatus,
  'Voter': r.voter ? 'Yes' : 'No',
  'Household': r.household || '—',
  'Status': viewMode === 'archived' ? 'Archived' : 'Active',
}));

await exportToExcel({
  data: rows,
  filename: `Bustrac_Residents_${viewMode}_${new Date().toISOString().slice(0, 10)}`,
  sheetName: 'Residents',
});

showToast('success', `Exported ${rows.length} residents to Excel`);
} catch (err) { console.error('Excel export failed:', err); showToast('error', 'Failed to export: ' + err.message); } };

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
  // ── INITIAL SEED ACCOUNTS FOR LOCAL POUCHDB ──
  const INITIAL_SYSTEM_USERS = [
    { 
      _id: 'user_admin', type: 'user', docType: 'user', username: 'admin', 
      name: 'System Administrator', fullName: 'System Administrator',
      role: 'Admin', purok: 'N/A', status: 'Active', contact: '09123456780', email: 'admin@bustrac.gov.ph',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() 
    },
    { 
      _id: 'user_jmacabangon', type: 'user', docType: 'user', username: 'jmacabangon', 
      name: 'Macabangon, Juhairo B.', fullName: 'Macabangon, Juhairo B.',
      role: 'Admin', purok: 'N/A', status: 'Active', contact: '09123456781', email: 'jmacabangon@bustrac.gov.ph',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() 
    },
    { 
      _id: 'user_mgcortero', type: 'user', docType: 'user', username: 'mgcortero', 
      name: 'Cortero, Mark Gian A.', fullName: 'Cortero, Mark Gian A.',
      role: 'Staff', purok: 'Purok 2', status: 'Active', contact: '09123456782', email: 'mgcortero@bustrac.gov.ph',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() 
    },
    { 
      _id: 'user_jonapagal', type: 'user', docType: 'user', username: 'jonapagal', 
      name: 'Napagal, Jay O.', fullName: 'Napagal, Jay O.',
      role: 'Staff', purok: 'Purok 4', status: 'Active', contact: '09123456783', email: 'jonapagal@bustrac.gov.ph',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() 
    },
    { 
      _id: 'user_mdregaspi', type: 'user', docType: 'user', username: 'mdregaspi', 
      name: 'Regaspi, Mark Denver S.', fullName: 'Regaspi, Mark Denver S.',
      role: 'Staff', purok: 'Purok 1', status: 'Inactive', contact: '09123456784', email: 'mdregaspi@bustrac.gov.ph',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() 
    },
    { 
      _id: 'user_kjamparado', type: 'user', docType: 'user', username: 'kjamparado', 
      name: 'Amparado, Ken Jette T.', fullName: 'Amparado, Ken Jette T.',
      role: 'Staff', purok: 'Purok 3', status: 'Active', contact: '09123456785', email: 'kjamparado@bustrac.gov.ph',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() 
    },
    { 
      _id: 'user_mdsantos', type: 'user', docType: 'user', username: 'mdsantos', 
      name: 'Santos, Maria D.', fullName: 'Santos, Maria D.',
      role: 'Resident', purok: 'Purok 5', status: 'Active', contact: '09123456786', email: 'mdsantos@bustrac.gov.ph',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() 
    },
  ];

  // ── USERS FILTER & MODAL STATES ──
  const [usersList, setUsersList] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [linkRequestTarget, setLinkRequestTarget] = useState(null);
  const [activeActionMenu, setActiveActionMenu] = useState(null);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [filterUserRole, setFilterUserRole] = useState('All');

  // Close active row action menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => setActiveActionMenu(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Fetch users from PouchDB (seed defaults if empty)
  const fetchUsers = useCallback(async () => {
    if (!db) return;
    try {
      const res = await db.find({
        selector: {
          $or: [{ type: 'user' }, { docType: 'user' }],
        },
      });

      if (!res.docs || res.docs.length === 0) {
        // Seed default system users with SHA-256 hashed password into PouchDB
        const defaultHash = await hashPassword('capstone2026');
        const docsToSeed = INITIAL_SYSTEM_USERS.map((u) => ({
          ...u,
          passwordHash: defaultHash,
        }));
        await db.bulkDocs(docsToSeed);
        setUsersList(docsToSeed);
      } else {
        // Sort: Admin first, then Staff, then Resident, then by Full Name
        const sorted = [...res.docs].sort((a, b) => {
          const roleOrder = { admin: 1, staff: 2, secretary: 2, resident: 3 };
          const orderA = roleOrder[(a.role || '').toLowerCase()] || 4;
          const orderB = roleOrder[(b.role || '').toLowerCase()] || 4;
          if (orderA !== orderB) return orderA - orderB;
          const nameA = a.fullName || a.name || a.username || '';
          const nameB = b.fullName || b.name || b.username || '';
          return nameA.localeCompare(nameB);
        });
        setUsersList(sorted);
      }
    } catch (e) {
      console.error('Failed to load users from PouchDB:', e);
    }
  }, [db]);

  useEffect(() => {
  const timer = setTimeout(fetchUsers, 1500);
  return () => clearTimeout(timer);
}, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    return (usersList || []).filter((u) => {
      const query = searchUserQuery.toLowerCase().trim();
      const uname = (u.username || u.uname || '').toLowerCase();
      const name = (u.fullName || u.name || '').toLowerCase();
      const purok = (u.purok || '').toLowerCase();

      const matchesSearch =
        !query ||
        name.includes(query) ||
        uname.includes(query) ||
        purok.includes(query);

      const userRole = (u.role || '').toLowerCase();
      const filterRole = filterUserRole.toLowerCase();
      const matchesRole =
        filterUserRole === 'All' ||
        userRole === filterRole ||
        (filterRole === 'staff' && (userRole === 'staff' || userRole === 'secretary'));

      return matchesSearch && matchesRole;
    });
  }, [usersList, searchUserQuery, filterUserRole]);

  // ── PENDING ACCOUNT REQUESTS (Manage Users section) ──
  const [accountRequests, setAccountRequests] = useState([]);

  const fetchAccountRequests = useCallback(async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const requests = result.rows
        .map((row) => row.doc)
        .filter(
          (doc) =>
            doc &&
            ['account_request', 'resident_account_request'].includes(doc.type) &&
            ['Pending', 'Pending Verification'].includes(doc.status)
        )
        .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
      setAccountRequests(requests);
    } catch (err) {
      console.error('Failed to fetch account requests:', err);
    }
  }, [db]);

  useEffect(() => {
  const timer = setTimeout(fetchAccountRequests, 1500);
  return () => clearTimeout(timer);
}, [fetchAccountRequests]);

  // ── HANDLE APPROVE RESIDENT ACCOUNT REQUEST (CONTROLLED REGISTRY LINKING) ──
  const handleApproveRequest = async (requestDoc) => {
    const normalizeName = (name) =>
      (name || '').toLowerCase().replace(/[,.-]/g, '').trim().replace(/\s+/g, ' ');
    const reqNameNormalized = normalizeName(requestDoc.fullName || requestDoc.name);
    const reqWords = reqNameNormalized.split(' ').filter((w) => w.length > 1);

    const exactMatches = [];

    (residentsList || []).forEach((r) => {
      const rNameNormalized = normalizeName(r.name || `${r.firstName || ''} ${r.lastName || ''}`);
      const isSamePurok = (r.purok || '').toLowerCase() === (requestDoc.purok || '').toLowerCase();
      if (rNameNormalized === reqNameNormalized) {
        exactMatches.push({ resident: r, isSamePurok });
      } else if (reqWords.length >= 2 && reqWords.every((w) => rNameNormalized.includes(w))) {
        exactMatches.push({ resident: r, isSamePurok });
      }
    });

    // CASE 1: Exactly One Match Found
    if (exactMatches.length === 1) {
      const candidate = exactMatches[0].resident;
      const result = await Swal.fire({
        icon: 'question',
        title: 'Link to Existing Resident?',
        html: `
          <div style="text-align: left; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">
            <p style="margin: 0 0 8px 0; color: #475569;">Natagpuan ang <strong>1 matching resident</strong> sa Registry:</p>
            <div style="margin-bottom: 6px;"><strong>Name:</strong> ${candidate.name}</div>
            <div style="margin-bottom: 6px;"><strong>RBI ID:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${candidate.rbiId || candidate.rbiNo || '—'}</code></div>
            <div style="margin-bottom: 6px;"><strong>Purok:</strong> ${candidate.purok || 'N/A'}</div>
            <div style="margin-bottom: 6px;"><strong>Contact:</strong> ${candidate.contactNo || candidate.contact || requestDoc.contact || 'N/A'}</div>
            ${candidate.hasAccount ? '<div style="color: #ea580c; font-weight: 600; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1;">⚠️ Mayroon nang aktibong portal account ang residenteng ito. Ang pag-apruba ay magreregister ng bagong credentials.</div>' : ''}
          </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Yes, Link & Approve',
        denyButtonText: 'Select Another Resident',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#10b981',
        denyButtonColor: '#3b82f6',
        cancelButtonColor: '#64748b',
      });

      if (result.isConfirmed) {
        await proceedToGenerateAndLink(requestDoc, candidate);
        return;
      }
      if (result.isDenied) {
        setLinkRequestTarget(requestDoc);
        return;
      }
      return;
    }

    // CASE 2: Multiple Matches Found (Admin Must Select)
    if (exactMatches.length > 1) {
      const inputOptions = {};
      exactMatches.forEach((m) => {
        const r = m.resident;
        const resId = r.id || r._id;
        inputOptions[resId] = `${r.name} (${r.purok || 'Purok N/A'}) — RBI: ${r.rbiId || r.rbiNo || 'N/A'}`;
      });

      const selectResult = await Swal.fire({
        title: 'Multiple Matching Residents Found',
        text: `May ${exactMatches.length} residenteng tugma sa "${requestDoc.fullName || requestDoc.name}". Piliin ang tamang resident profile upang i-link:`,
        input: 'radio',
        inputOptions,
        inputValue: exactMatches[0].resident.id || exactMatches[0].resident._id,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Link Selected Resident',
        denyButtonText: 'Search Registry Manually',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#10b981',
        denyButtonColor: '#3b82f6',
        cancelButtonColor: '#64748b',
        inputValidator: (value) => {
          if (!value) return 'Pumili muna ng resident bago magpatuloy!';
        },
      });

      if (selectResult.isConfirmed) {
        const selectedRes = residentsList.find((r) => (r.id || r._id) === selectResult.value);
        if (selectedRes) {
          await proceedToGenerateAndLink(requestDoc, selectedRes);
        }
        return;
      }
      if (selectResult.isDenied) {
        setLinkRequestTarget(requestDoc);
        return;
      }
      return;
    }

    // CASE 3: No Match Found (Controlled Link or Create Resident)
    const noMatchResult = await Swal.fire({
      icon: 'warning',
      title: 'No Matching Resident Found',
      html: `
        <div style="text-align: left; font-size: 13px; color: #475569;">
          <p style="margin: 0 0 10px 0;">Walang natagpuang resident record para kay <strong>"${requestDoc.fullName || requestDoc.name}"</strong> sa Purok <strong>${requestDoc.purok || 'N/A'}</strong>.</p>
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #0f172a;">Upang maiwasan ang duplicate records, pumili ng nais gawin:</p>
          <ul style="padding-left: 18px; margin: 0 0 10px 0; line-height: 1.5;">
            <li><strong>Search & Link Existing:</strong> Hanapin ang resident sa registry (hal. kung may typo, ibang purok, o maiden name).</li>
            <li><strong>Register as New Resident:</strong> Lumikha muna ng opisyal na Resident Profile sa Registry bago i-link.</li>
          </ul>
        </div>
      `,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: '🔍 Search & Link Existing',
      denyButtonText: '➕ Register as New Resident',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#3b82f6',
      denyButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
    });

    if (noMatchResult.isConfirmed) {
      setLinkRequestTarget(requestDoc);
      return;
    }
    if (noMatchResult.isDenied) {
      await handleCreateAndLinkResident(requestDoc);
      return;
    }
  };

  // ── CREATE NEW RESIDENT IN REGISTRY AND LINK ACCOUNT ──
  const handleCreateAndLinkResident = async (requestDoc) => {
    const reqName = requestDoc.fullName || requestDoc.name || 'Resident';
    const reqPurok = requestDoc.purok || 'Purok 1';
    const reqContact = requestDoc.contact || requestDoc.contactNumber || '';

    const confirmCreate = await Swal.fire({
      title: 'Create New Resident Profile?',
      html: `
        <div style="text-align: left; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">
          <p style="margin: 0 0 8px 0; color: #64748b;">Ang sumusunod na profile ay idaragdag sa opisyal na Barangay Registry:</p>
          <div><strong>Name:</strong> ${reqName}</div>
          <div><strong>Purok:</strong> ${reqPurok}</div>
          <div><strong>Contact:</strong> ${reqContact || 'N/A'}</div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Create & Link Account',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
    });
    if (!confirmCreate.isConfirmed) return;

    try {
      const newResidentId = `RES-${Date.now().toString().slice(-6)}`;
      const newRbiId = await generateRbiId(db);
      const nowIso = new Date().toISOString();

      const nameParts = reqName.trim().split(' ');
      const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : reqName;
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

      const newResidentDoc = {
        _id: newResidentId,
        type: 'resident',
        ...EMPTY_RESIDENT,
        residentId: newResidentId,
        rbiId: newRbiId,
        rbiNo: newRbiId,
        name: reqName,
        firstName,
        lastName,
        purok: reqPurok,
        purokZoneAddress: reqPurok,
        contact: reqContact,
        contactNo: reqContact,
        status: 'Active',
        hasAccount: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await db.put(newResidentDoc);

      try {
        await createAuditLog({
          action: 'CREATE',
          module: 'RESIDENTS',
          recordId: newResidentId,
          user: currentUser?.username || 'admin',
          details: `Created new resident ${reqName} (${newRbiId}) from account request approval`,
        });
      } catch (auditErr) {
        console.warn('Audit log error:', auditErr);
      }

      await fetchResidents();
      await proceedToGenerateAndLink(requestDoc, { ...newResidentDoc, id: newResidentId });
    } catch (err) {
      console.error('Failed to create new resident:', err);
      Swal.fire('Error', `Failed to create resident: ${err.message}`, 'error');
    }
  };

  // ── CORE ACCOUNT GENERATION & SAFE LINKING ──
  const proceedToGenerateAndLink = async (requestDoc, matchedResident) => {
    const contactToSend =
      requestDoc.contactNumber || requestDoc.contact || matchedResident.contactNo || matchedResident.contact || 'N/A';
    const residentId = matchedResident.id || matchedResident._id;

    try {
      const resName =
        matchedResident.name || `${matchedResident.firstName || ''} ${matchedResident.lastName || ''}`.trim();
      const rawFirst = (matchedResident.firstName || resName.split(' ')[0] || 'resident').trim();
      const rawLast = (matchedResident.lastName || resName.split(' ').slice(-1)[0] || 'user').trim();

      const cleanFirst = rawFirst.toLowerCase().replace(/[^a-z0-9]/g, '') || 'resident';
      const cleanLast = rawLast.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';

      let username = '';
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = `${cleanFirst}.${cleanLast}${Math.floor(100 + Math.random() * 900)}`;
        try {
          await db.get(`user_${candidate}`);
        } catch (notFound) {
          username = candidate;
          break;
        }
      }
      if (!username) {
        username = `${cleanFirst}.${cleanLast}${Date.now().toString().slice(-4)}`;
      }

      const tempPassword = `Bustrac${Math.floor(100000 + Math.random() * 900000)}`;
      const passwordHash = await hashPassword(tempPassword);
      const nowIso = new Date().toISOString();

      // 1. Update Resident Document in PouchDB
      let existingResDoc;
      try {
        existingResDoc = await db.get(residentId);
      } catch (e) {
        existingResDoc = { _id: residentId };
      }

      const updatedResDoc = {
        ...existingResDoc,
        hasAccount: true,
        username: username,
        linkedUserId: `user_${username}`,
        accountCreatedAt: nowIso,
        updatedAt: nowIso,
      };
      // Tanggalin ang plain-text password upang maging ligtas sa DB
      delete updatedResDoc.password;
      await db.put(updatedResDoc);

      // 2. Create Resident User Account document (user_<username>)
      const userDocId = `user_${username}`;
      const newUserDoc = {
        _id: userDocId,
        type: 'user',
        docType: 'user',
        username,
        passwordHash,
        role: 'resident',
        fullName: resName,
        name: resName,
        residentId: residentId,
        purok: matchedResident.purok || requestDoc.purok || 'N/A',
        contact: contactToSend,
        status: 'Active',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      // Tanggalin ang plain-text password
      delete newUserDoc.password;
      await db.put(newUserDoc);

      // 3. Offline auth cache (SHA-256 password hash for offline verification)
      try {
        const offlineAuth = JSON.parse(localStorage.getItem('bustrac_offline_auth') || '{}');
        offlineAuth[username] = {
          username,
          passwordHash,
          role: 'resident',
          user: { id: userDocId, username, role: 'resident', fullName: resName, status: 'Active' },
        };
        localStorage.setItem('bustrac_offline_auth', JSON.stringify(offlineAuth));
      } catch (storageErr) {
        console.warn('Failed to cache offline auth:', storageErr);
      }

      // 4. Update Request Document status to Approved
      await db.put({
        ...requestDoc,
        status: 'Approved',
        linkedResidentId: residentId,
        approvedBy: currentUser?.username || 'admin',
        approvedAt: nowIso,
        generatedUsername: username,
        updatedAt: nowIso,
      });

      // 5. Audit Log
      try {
        await createAuditLog({
          action: 'APPROVE_ACCOUNT_REQUEST',
          module: 'USERS',
          recordId: requestDoc._id,
          user: currentUser?.username || 'admin',
          details: `Approved account request for ${resName} linked to Resident ID: ${residentId}. Generated username: @${username}`,
        });
      } catch (auditErr) {
        console.warn('Audit log error:', auditErr);
      }

      // 6. Force Sync
      if (typeof forceSyncToRemote === 'function') {
        await forceSyncToRemote().catch(() => {});
      }

      // 7. Refresh Lists
      await fetchAccountRequests();
      await fetchResidents();
      await fetchUsers();

      // 8. Show Credentials to Admin (Copyable & Safe)
      await Swal.fire({
        icon: 'success',
        title: 'Account Linked & Credentials Generated!',
        html: `
          <div style="text-align: left; background: #f8fafc; padding: 16px; border-radius: 8px; margin-top: 12px; border: 1px solid #e2e8f0; color: #0f172a;">
            <p style="margin: 0 0 12px 0; font-size: 13px; color: #64748b;">
              Linked Resident: <strong style="color: #0f172a;">${resName}</strong> (${matchedResident.purok || 'Purok N/A'})<br/>
              📱 Send these credentials to: <strong style="color: #0f172a;">${contactToSend}</strong>
            </p>
            <div style="margin-bottom: 8px;">
              <span style="font-size: 12px; color: #64748b;">Username:</span><br/>
              <code style="display: block; background: #e2e8f0; padding: 6px 10px; border-radius: 4px; font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 4px;">${username}</code>
            </div>
            <div>
              <span style="font-size: 12px; color: #64748b;">Temporary Password:</span><br/>
              <code style="display: block; background: #e2e8f0; padding: 6px 10px; border-radius: 4px; font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 4px;">${tempPassword}</code>
            </div>
          </div>
        `,
        confirmButtonText: 'Done',
        confirmButtonColor: '#3b82f6',
      });

      showToast('Account request approved and credentials generated.', 'success');
    } catch (err) {
      console.error('Failed to link and generate credentials:', err);
      Swal.fire('Error', `Failed to generate credentials: ${err.message}`, 'error');
    }
  };

  // ── RESET PASSWORD (SECURE SHA-256 HASH IN DATABASE) ──
  const handleResetPassword = async (u) => {
    const userName = u.fullName || u.name || u.uname || u.username || 'Unknown User';
    const uname = (u.username || u.uname || '').toLowerCase();
    const userDocId = u._id?.startsWith('user_') ? u._id : `user_${uname}`;

    const confirmReset = await Swal.fire({
      title: 'Reset User Password?',
      text: `Generate a new temporary password for ${userName} (@${uname})?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Reset Password',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#64748b',
    });
    if (!confirmReset.isConfirmed) return;

    const tempPassword = `Bustrac${Math.floor(100000 + Math.random() * 900000)}`;

    try {
      const passwordHash = await hashPassword(tempPassword);
      const nowIso = new Date().toISOString();

      let doc;
      try {
        doc = await db.get(userDocId);
      } catch (notFound) {
        const findRes = await db.find({ selector: { $or: [{ username: uname }, { uname }] } });
        if (findRes.docs && findRes.docs.length > 0) doc = findRes.docs[0];
        else throw new Error('User document not found in database.');
      }

      const updatedDoc = {
        ...doc,
        passwordHash,
        updatedAt: nowIso,
      };
      // Tanggalin ang anumang plain-text password
      delete updatedDoc.password;

      await db.put(updatedDoc);

      // Offline auth cache update
      try {
        const stored = JSON.parse(localStorage.getItem('bustrac_offline_auth') || '{}');
        if (stored[uname]) {
          stored[uname].passwordHash = passwordHash;
          localStorage.setItem('bustrac_offline_auth', JSON.stringify(stored));
        }
      } catch (storageErr) {
        console.warn('Failed to update offline auth cache:', storageErr);
      }

      // Audit log
      try {
        await createAuditLog({
          action: 'RESET_USER_PASSWORD',
          module: 'USERS',
          recordId: doc._id,
          user: currentUser?.username || 'admin',
          details: `Reset password for user @${uname} (${userName})`,
        });
      } catch (auditErr) {
        console.warn('Audit log error:', auditErr);
      }

      await fetchUsers();

      await Swal.fire({
        title: 'Password Reset Successfully',
        html: `
          <div style="text-align: left; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">
            <p style="margin: 0 0 10px 0; color: #64748b;">Ang bagong temporary password para kay <strong>${userName}</strong> ay:</p>
            <code style="display: block; background: #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 16px; font-weight: 700; color: #0f172a; text-align: center; letter-spacing: 1px;">${tempPassword}</code>
            <p style="margin: 10px 0 0 0; font-size: 11px; color: #64748b;">Pakibigay ito sa user. Hinihikayat silang palitan ito sa pag-login.</p>
          </div>
        `,
        icon: 'success',
        confirmButtonText: 'Copy Password',
        showCancelButton: true,
        cancelButtonText: 'Close',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
      }).then((result) => {
        if (result.isConfirmed) {
          navigator.clipboard.writeText(tempPassword);
          showToast('Password copied to clipboard!', 'success');
        }
      });
    } catch (err) {
      console.error('Password reset failed:', err);
      Swal.fire('Error', `Failed to reset password: ${err.message}`, 'error');
    }
  };

  // ── TOGGLE DEACTIVATE / ACTIVATE USER STATUS IN DATABASE ──
  const handleToggleUserStatus = async (u) => {
    const userName = u.fullName || u.name || u.uname || u.username || 'Unknown User';
    const uname = (u.username || u.uname || '').toLowerCase();
    const userDocId = u._id?.startsWith('user_') ? u._id : `user_${uname}`;

    // Huwag pahintulutan ang pag-deactivate sa administrator account
    if (uname === 'admin' || uname === (currentUser?.username || '').toLowerCase()) {
      Swal.fire('Action Prohibited', 'Hindi maaaring i-deactivate ang administrator account.', 'warning');
      return;
    }

    const isCurrentlyActive = (u.status || 'Active').toLowerCase() === 'active';
    const targetStatus = isCurrentlyActive ? 'Inactive' : 'Active';

    const confirmResult = await Swal.fire({
      title: isCurrentlyActive ? 'Deactivate User?' : 'Activate User?',
      text: isCurrentlyActive
        ? `Sigurado ka bang nais mong i-deactivate si ${userName}? Hindi na makakapag-log in ang account na ito sa portal.`
        : `I-activate muli ang account para kay ${userName}?`,
      icon: isCurrentlyActive ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonColor: isCurrentlyActive ? '#ef4444' : '#10b981',
      cancelButtonColor: '#64748b',
      confirmButtonText: isCurrentlyActive ? 'Yes, Deactivate' : 'Yes, Activate',
      cancelButtonText: 'Cancel',
      customClass: { popup: 'rounded-xl' },
    });
    if (!confirmResult.isConfirmed) return;

    try {
      const nowIso = new Date().toISOString();
      let doc;
      try {
        doc = await db.get(userDocId);
      } catch (notFound) {
        const findRes = await db.find({ selector: { $or: [{ username: uname }, { uname }] } });
        if (findRes.docs && findRes.docs.length > 0) doc = findRes.docs[0];
        else throw new Error('User document not found in database.');
      }

      const updatedDoc = {
        ...doc,
        status: targetStatus,
        updatedAt: nowIso,
      };
      await db.put(updatedDoc);

      // Offline auth storage update
      try {
        const stored = JSON.parse(localStorage.getItem('bustrac_offline_auth') || '{}');
        if (stored[uname]) {
          stored[uname].status = targetStatus;
          if (stored[uname].user) stored[uname].user.status = targetStatus;
          localStorage.setItem('bustrac_offline_auth', JSON.stringify(stored));
        }
      } catch (storageErr) {
        console.warn('Failed to update offline auth cache:', storageErr);
      }

      // Audit log
      try {
        await createAuditLog({
          action: isCurrentlyActive ? 'DEACTIVATE_USER' : 'ACTIVATE_USER',
          module: 'USERS',
          recordId: doc._id,
          user: currentUser?.username || 'admin',
          details: `${isCurrentlyActive ? 'Deactivated' : 'Activated'} user account @${uname} (${userName})`,
        });
      } catch (auditErr) {
        console.warn('Audit log error:', auditErr);
      }

      await fetchUsers();
      showToast(`User ${userName} has been ${isCurrentlyActive ? 'deactivated' : 'activated'}.`, 'success');
    } catch (err) {
      console.error('Failed to update user status:', err);
      Swal.fire('Error', `Failed to update status: ${err.message}`, 'error');
    }
  };

// ── HANDLE REJECT RESIDENT ACCOUNT REQUEST ──
const handleRejectRequest = async (requestId) => {
  const result = await Swal.fire({
    title: 'Reject Request?',
    text: 'This action cannot be undone. The resident will need to submit a new request.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, Reject',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b'
  });
  if (!result.isConfirmed) return;

  try {
    const doc = await db.get(requestId);
    await db.put({
      ...doc,
      status: 'Rejected',
      rejectedBy: currentUser?.username || 'admin',
      rejectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await createAuditLog({
      action: 'REJECT_ACCOUNT_REQUEST',
      module: 'USERS',
      recordId: requestId,
      user: currentUser?.username || 'admin',
      details: `Rejected account request ID: ${requestId}`,
    });

    fetchAccountRequests();
    showToast('Account request has been rejected.', 'info');
  } catch (err) {
    console.error('Failed to reject request:', err);
    showToast('Failed to reject request.', 'error');
  }
};

const [generatingReport, setGeneratingReport] = useState(null);
const [reportFilters, setReportFilters] = useState({})
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
    showToast('Please allow popups to generate the report.', 'error');
    setGeneratingReport(null);
    return;
  }

  const headerCells = headers.map((h) => 
    `<th style="border:1px solid #334155;padding:10px;background:#1e293b;color:#f8fafc;text-align:left;font-size:12px;font-weight:600;">${escapeHtml(h)}</th>`
  ).join('');

  const rowCells = rows.map((row, index) => 
    `<tr style="${index % 2 === 0 ? 'background:#f8fafc' : 'background:#ffffff'}">${ 
      row.map((cell) => 
        `<td style="border:1px solid #e2e8f0;padding:8px 10px;font-size:11px;color:#334155;">${escapeHtml(cell)}</td>`
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
      case 'voters': {
  const voters = (residentsList || []).filter((r) => {
    const voterVal = String(r.voter ?? '').toLowerCase();
    const statusVal = String(r.voterStatus ?? '').toLowerCase();
    return (
      r.voter === true ||
      voterVal === 'yes' ||
      voterVal === 'true' ||
      statusVal === 'registered' ||
      statusVal === 'voter'
    );
  });
  const rows = voters.slice(0, 50).map((r) => [
    r.id || r._id || '—',
    r.name || `${r.lastName || ''}, ${r.firstName || ''} ${r.middleName || ''}`.trim() || '—',
    r.address || r.purok || '—',
    r.purok || '—',
    r.barangay || (r.isBarangayResident === false
      ? (r.otherBarangay || r.addressOutsideBarangay || 'Other Barangay')
      : 'Bustrac'),
    r.voterStatus || (r.voter ? 'Registered' : 'Non-Voter'),
    r.precinctNo || r.precinct || '—',
    r.votingLocation || r.votingPlace || '—',
    r.contact || r.contactNo || r.phone || '—',
  ]);
  openPrintWindow(
    'Voter List Report',
    ['Resident ID', 'Full Name', 'Address', 'Purok', 'Barangay', 'Voter Status', 'Precinct No.', 'Voting Location', 'Contact'],
    rows,
    `Total Registered Voters: ${voters.length}`
  );
  break;
}
      default:
        showToast('Unknown report module.', 'error');
    }
  } catch (err) {
    console.error('Report generation failed:', err);
    showToast('Failed to generate report. Please try again.', 'error');
  } finally {
    setGeneratingReport(null);
  }
};

const handleGenerateExcelReport = async (moduleType, selectedFilter = 'All') => {
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

    case 'voters':
      exportData = (residentsList || [])
        .filter(r => {
          const voterVal = String(r.voter ?? '').toLowerCase();
          const statusVal = String(r.voterStatus ?? '').toLowerCase();
          return (
            r.voter === true ||
            voterVal === 'yes' ||
            voterVal === 'true' ||
            statusVal === 'registered' ||
            statusVal === 'voter'
          );
        })
        .map(r => ({
          'Resident ID': r.id || r._id || 'N/A',
          'Full Name': r.name || `${r.lastName || ''}, ${r.firstName || ''} ${r.middleName || ''}`.trim() || 'N/A',
          'Address': r.address || r.purok || 'N/A',
          'Purok / Zone': r.purok || 'N/A',
          'Barangay': r.barangay || (r.isBarangayResident === false
            ? r.otherBarangay || r.addressOutsideBarangay || 'Other Barangay'
            : 'Bustrac'),
          'Voter Status': r.voterStatus || (r.voter ? 'Registered' : 'Non-Voter'),
          'Precinct No.': r.precinctNo || r.precinct || 'N/A',
          'Voting Location': r.votingLocation || r.votingPlace || 'N/A',
          'Contact Number': r.contact || r.contactNo || r.phone || 'N/A',
        }));
      fileName = `Barangay_Bustrac_Voter_List_${currentDate}.xlsx`;
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
        'Household No': h.id || h._id,
        'Head of Family': h.head || 'N/A',
        'Purok / Zone': h.purok || 'N/A',
        'Members Count': h.members || (h.members ? h.members.length : 0),
        'Address': h.address || 'N/A'
      }));
      break;

    case 'aid':
      exportData = (programsList || []).map(a => {
        const programLogs = (aidLogs || []).filter(
          log => log.programId === a.id || log.programId === a._id
        );
        const beneficiariesCount = programLogs.length;
        const target = a.target || 0;
        const progress = target > 0
          ? `${Math.round((beneficiariesCount / target) * 100)}%`
          : 'N/A';
        return {
          'Program Name': a.title || a.name || 'N/A',
          'Status': a.status || 'Completed',
          'Beneficiaries': `${beneficiariesCount} / ${target}`,
          'Progress': progress,
          'Date Created': a.createdAt
            ? new Date(a.createdAt).toLocaleDateString('en-PH')
            : 'N/A',
        };
      });
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
      showToast('Pumili ng tamang report type.', 'error');
      return;
  }

  // ✅ NEW: Apply filter logic bago i-export
  const isAllFilter = !selectedFilter || 
    ['All', 'All Months', 'All Puroks', 'All Status', 'All Voters', 'All Types', 'All Priorities'].includes(selectedFilter);

  if (!isAllFilter) {
    // Extract month/year mula sa filter string (hal. "April 2026")
    const monthYearMatch = selectedFilter.match(/^([A-Za-z]+)\s+(\d{4})$/);

    if (moduleType === 'certificates') {
      exportData = exportData.filter(row => {
        if (!row['Date Submitted']) return false;
        const rowDate = new Date(row['Date Submitted']);
        if (isNaN(rowDate.getTime())) return false;
        return rowDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }) === selectedFilter;
      });
    } else if (moduleType === 'blotter') {
      exportData = exportData.filter(row => {
        if (!row['Date']) return false;
        const rowDate = new Date(row['Date']);
        if (isNaN(rowDate.getTime())) return false;
        return rowDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }) === selectedFilter;
      });
    } else if (moduleType === 'aid') {
      exportData = exportData.filter(row => {
        if (!row['Date Created']) return false;
        const rowDate = new Date(row['Date Created']);
        if (isNaN(rowDate.getTime())) return false;
        return rowDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }) === selectedFilter;
      });
    } else if (moduleType === 'feedback') {
      exportData = exportData.filter(row => row['Status'] === selectedFilter);
    } else if (moduleType === 'residents' || moduleType === 'households' || moduleType === 'voters') {
      // Filter by purok para sa residents/households/voters
      if (selectedFilter.startsWith('Purok')) {
        exportData = exportData.filter(row => 
          (row['Purok / Zone'] || row['Purok'] || '').toLowerCase().includes(selectedFilter.toLowerCase())
        );
      }
    } else if (moduleType === 'audit') {
      exportData = exportData.filter(row => {
        if (!row['Timestamp']) return false;
        const rowDate = new Date(row['Timestamp']);
        if (isNaN(rowDate.getTime())) return false;
        return rowDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }) === selectedFilter;
      });
    }
  }

  if (exportData.length === 0) {
    showToast(`Walang available data para sa filter na "${selectedFilter}".`, 'warning');
    return;
  }

  try {
    await createAuditLog({
      action: 'EXPORT_DATA',
      module: moduleType.toUpperCase().replace('_', ' '),
      recordId: fileName,
      details: `Admin exported ${moduleType} Masterlist to Excel (${exportData.length} records). Filter: ${selectedFilter}`,
    });
  } catch (err) {
    console.warn('Audit log for export failed:', err);
  }

  exportToExcel(exportData, fileName, moduleType);
};

const handleExportBackup = async () => {
  setIsDbProcessing(true);

  try {
    const allDocs = await db.allDocs({ include_docs: true });

    const cleanRows = allDocs.rows.filter(
      r => r.doc && !r.doc._id.startsWith('_')
    );

    const backupPayload = {
      app: 'Bustrac Hub',
      exportDate: new Date().toISOString(),
      rows: cleanRows
    };

    const blob = new Blob(
      [JSON.stringify(backupPayload, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `bustrac_backup_${new Date().toISOString().split('T')[0]}.json`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'EXPORT_DATABASE_BACKUP',
        module: 'SYSTEM',
        recordId: 'FULL_DB',
        details: `Admin exported full database backup (${cleanRows.length} documents).`
      });
    }

    showToast(
      `Database backup exported successfully! (${cleanRows.length} docs)`,
      'success'
    );
  } catch (err) {
    console.error('Backup export failed:', err);
    showToast('Failed to export backup. Check console.', 'error');
  } finally {
    setIsDbProcessing(false);
  }
};

const handleImportBackup = async (file) => {
  setIsDbProcessing(true);
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const rawDocs = data.rows ? data.rows.map(r => r.doc) : data;

    let docsToImport = rawDocs.filter(
      doc => doc !== null && !doc._id.startsWith('_')
    );

    if (docsToImport.length === 0) {
      throw new Error('No valid documents found.');
    }

    const existingDocs = await db.allDocs({
      keys: docsToImport.map(d => d._id)
    });

    docsToImport = docsToImport.map(doc => {
      const existing = existingDocs.rows.find(r => r.id === doc._id);

      if (existing && !existing.error) {
        return { ...doc, _rev: existing.value.rev };
      }

      return doc;
    });

    await db.bulkDocs(docsToImport);

    showToast(
      `Backup restored! ${docsToImport.length} docs imported. Reloading...`,
      'success'
    );

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    setTimeout(() => window.location.reload(), 1500);
  } catch (err) {
    console.error('Backup import failed:', err);
    showToast('Failed to import backup. Invalid file or DB error.', 'error');
    setIsDbProcessing(false);
  }
};

const closePrint = useCallback(() => {
  setPrintData(null);
}, []);

const printPreviewProps = React.useMemo(() => {
  if (!printData) return null;

  const printType = normalizeCertType(
    printData.type || printData.certificateType
  );

  if (!printType) {
    return {
      valid: false,
      error: `Unknown certificate type: ${String(
        printData.type || printData.certificateType || 'undefined'
      )}`
    };
  }

  const issueDateRaw =
    printData.issueDate || printData.issuedAt || printData.dateIssued;

  const issueDate = issueDateRaw
    ? new Date(issueDateRaw).toLocaleDateString('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : new Date().toLocaleDateString('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });

  return {
    valid: true,
    printType,
    mode: printMode,
    data: {
      _id: printData._id,
      certificateType: printData.type || printData.certificateType,
      trackingCode: printData.trackingCode || printData._id || 'CERT-000000',
      fullName:
        printData.residentName ||
        (printData.firstName
          ? `${printData.firstName} ${printData.lastName}`
          : printData.fullName) ||
        '',
      firstName: printData.firstName || '',
      lastName: printData.lastName || '',
      address:
        printData.address ||
        printData.purok ||
        '',
      purpose: printData.purpose || '',
      issueDate,
      orNumber: printData.orNumber ?? '',
      ctcNumber: printData.ctc?.number ?? printData.ctcNumber ?? '',
      amountPaid: printData.amountPaid ?? printData.ctc?.amountPaid ?? 0,
      civilStatus: printData.civilStatus || '',
      age: printData.age || '',
      punongBarangay:
        printData.punongBarangay || ''
    }
  };
}, [printData, printMode]);

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

  const compName = typeof blotterForm.complainant === 'object' 
    ? blotterForm.complainant.name || blotterForm.complainant.displayName 
    : (blotterForm.complainant || blotterForm.complainantName || '');

  const respName = typeof blotterForm.respondent === 'object' 
    ? blotterForm.respondent.name || blotterForm.respondent.displayName 
    : (blotterForm.respondent || blotterForm.respondentName || '');

  if (!blotterForm.date) {
    showToast('Please select the Date of Incident.');
    document.getElementById('blotter-date')?.focus();
    return;
  }
  if (!blotterForm.time) {
    showToast('⚠️ Please enter the Time Matrix for the incident.', 'error');
    document.getElementById('blotter-time')?.focus();
    return;
  }
  if (!blotterForm.location || blotterForm.location.trim() === '') {
    showToast('⚠️ Please enter the Exact Location Address.', 'error');
    document.getElementById('blotter-location')?.focus();
    return;
  }
  if (!compName) {
    showToast('⚠️ Please select or input the Complainant (Nagrereklamo).', 'error');
    document.getElementById('blotter-complainant')?.focus();
    return;
  }
  if (!respName) {
    showToast('⚠️ Please select or input the Respondent (Inirereklamo).', 'error');
    document.getElementById('blotter-respondent')?.focus();
    return;
  }
  if (!blotterForm.narrative || blotterForm.narrative.trim() === '') {
    showToast('⚠️ Please provide the Incident Narrative Report Statement.', 'error');
    document.getElementById('blotter-narrative')?.focus();
    return;
  }

  try {
  const trackingNo =
    blotterForm.trackingNo ||
    `BLT-${new Date().getFullYear()}-${Date.now()
      .toString(36)
      .slice(-4)
      .toUpperCase()}`;

  const blotterPayload = {
    _id: trackingNo,
    type: 'blotter_record',
    trackingNo,
    id: trackingNo,
    caseNum: trackingNo,
    officer: blotterForm.officer || 'Juhairo Macabangon',
    dateLogged:
      blotterForm.dateLogged ||
      new Date().toISOString().split('T')[0],
    date:
      blotterForm.date ||
      blotterForm.incidentDate ||
      new Date().toISOString().split('T')[0],
    incidentDate:
      blotterForm.incidentDate ||
      blotterForm.date ||
      new Date().toISOString().split('T')[0],
    incidentTime:
      blotterForm.incidentTime ||
      blotterForm.time ||
      '22:30',
    time:
      blotterForm.incidentTime ||
      blotterForm.time ||
      '22:30',
    priority: blotterForm.priority || 'Medium Priority',
    incidentType:
      blotterForm.incidentType ||
      blotterForm.type ||
      'Noise Complaint',
    location: blotterForm.location || '',
    isVAWC: !!blotterForm.isVawc,
    isVawc: !!blotterForm.isVawc,
    complainant: compName,
    complainantName: compName,
    complainantId: blotterForm.complainantId || '',
    isComplainantNonResident:
      !!blotterForm.isComplainantNonResident,
    respondent: respName,
    respondentName: respName,
    respondentEmail:
      blotterForm.respondentEmail ||
      blotterForm.email ||
      '',
    respondentId: blotterForm.respondentId || '',
    isRespondentNonResident:
      !!blotterForm.isRespondentNonResident,
    witnesses: blotterForm.witnesses || '',
    narrative: blotterForm.narrative || '',
    formalAction:
      blotterForm.actionTaken ||
      blotterForm.formalAction ||
      'Summoned Parties',
    status: blotterForm.status || 'Open',
    summonCount: blotterForm.summonCount || 0,
    nextHearingDate: blotterForm.nextHearingDate || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sla: {
      startDate: new Date().toISOString(),
      mediationDeadline: addDays(new Date(), 15).toISOString(),
      luponDeadline: null,
      isBreached: false,
      escalationLevel: 'barangay',
    },
  };

  if (blotterForm.attachments?.length) {
    blotterPayload._attachments = {};

    for (const att of blotterForm.attachments) {
      const blobData = att.file || dataURLtoBlob(att.data);
      if (!blobData) continue;

      blotterPayload._attachments[att.name] = {
        content_type: att.type || 'application/octet-stream',
        data: blobData,
      };
    }
  }

  await db.put(blotterPayload);

  if (typeof setBlotterList === 'function') {
    setBlotterList((prev) => {
      const filtered = prev.filter(
        (b) => b._id !== trackingNo && b.id !== trackingNo
      );
      return [blotterPayload, ...filtered];
    });
  }

  if (typeof createAuditLog === 'function') {
    await createAuditLog({
      action: 'CREATE_BLOTTER',
      module: 'BLOTTER',
      recordId: trackingNo,
      details: `Filed blotter entry ${trackingNo} for ${compName} vs ${respName}`,
    });
  }

  showToast(
    `✓ Blotter Record successfully saved!\n\nTracking No: ${trackingNo}`,
    'success'
  );

  if (typeof nav === 'function') {
    nav('blotter-manage');
  }
} catch (err) {
  console.error('Error saving blotter record:', err);
  showToast(
    'An error occurred while saving the Blotter Record. Please try again.',
    'error'
  );
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
}, []);

  const [advisoriesList, setAdvisoriesList] = useState([]);

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
  const [advisorySearch, setAdvisorySearch] = useState('');
  const [advisoryCategoryFilter, setAdvisoryCategoryFilter] = useState('All');
  const [advisoryStatusFilter, setAdvisoryStatusFilter] = useState('All');
  const [advisoryPriorityFilter, setAdvisoryPriorityFilter] = useState('All');

    
  const handleSaveAdvisory = async (e) => {
  e.preventDefault();
  if (!advisoryForm.title.trim() || !advisoryForm.description.trim()) {
    showToast('Please fill in the Title and Description.', 'error');
    return;
  }

  const now = new Date().toISOString();
  let payload;

  if (editingAdvisoryId) {
    const existing = advisoriesList.find((a) => (a._id || a.id) === editingAdvisoryId);
    payload = {
      ...existing,
      ...advisoryForm,
      _id: existing?._id || editingAdvisoryId,
      _rev: existing?._rev,
      type: 'advisory',
      updatedAt: now,
    };
  } else {
    payload = {
      _id: `advisory_${Date.now()}`,
      type: 'advisory',
      ...advisoryForm,
      createdAt: now,
      updatedAt: now,
    };
  }

  try {
    await db.put(payload);
  } catch (err) {
    console.error('Failed to save advisory:', err);
    showToast('Failed to save advisory to database.', 'error');
    return;
  }

  if (editingAdvisoryId) {
    setAdvisoriesList((prev) =>
      prev.map((a) => ((a._id || a.id) === editingAdvisoryId ? payload : a))
    );
  } else {
    setAdvisoriesList((prev) => [payload, ...prev]);
  }

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
  
    const [activitiesList, setActivitiesList] = useState([]);

  const formatTime12hr = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
    return timeStr || ''; 
  }
  const [hours, minutes] = timeStr.split(':');
  let h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${minutes} ${ampm}`; 
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
  const [activitySearch, setActivitySearch] = useState('');
  const [activityCategoryFilter, setActivityCategoryFilter] = useState('All');
  
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

const handleSaveSettings = async (e) => {
  if (e) e.preventDefault();
  setIsSaving(true);

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
      punongBarangay: settingsForm.punongBarangay,
      luponSecretary: settingsForm.luponSecretary,
      treasurer: settingsForm.treasurer || '',
      updatedAt: new Date().toISOString(),
      ...(existingRev ? { _rev: existingRev } : {})
    };

    const response = await db.put(payload);
    const savedPayload = { ...payload, _rev: response.rev };

    // I-update ang local state para mag-match sa nai-save
    setSystemSettings(savedPayload);

    // Audit log
    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'UPDATE_OFFICIAL_SETTINGS',
        module: 'SETTINGS',
        recordId: 'setting_barangay_officials',
        details: `Updated Officials: PB ${settingsForm.punongBarangay}, Sec ${settingsForm.luponSecretary}`,
        user: currentUser?.name || currentUser?.username || 'Admin'
      });
    }

    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }

    showToast('Matagumpay na nai-save ang settings ng Barangay Officials!', 'success');
  } catch (err) {
    console.error('Error saving settings to PouchDB:', err);
    showToast(`Bigo sa pag-save: ${err.message || 'Database error'}`, 'error');
  } finally {
    setIsSaving(false);
  }
};

// ── ACTIVITY MANAGEMENT HANDLERS ──
const handleSaveActivity = async (e) => {
  e.preventDefault();
  if (!activityForm.title.trim() || !activityForm.description.trim()) {
    showToast('Please fill in the Title and Description.', 'error');
    return;
  }
  
  const now = new Date().toISOString();
  try {
    if (editingActivityId) {
      // UPDATE EXISTING
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
      
      await createAuditLog({
        action: 'UPDATE_ACTIVITY',
        module: 'ACTIVITIES',
        recordId: editingActivityId,
        details: `Updated activity: ${activityForm.title}`,
      });
    } else {
      // CREATE NEW
      const newPayload = {
        _id: `activity_${Date.now()}`,
        type: 'activity',
        ...activityForm,
        createdAt: now,
        updatedAt: now,
      };
      await db.put(newPayload);
      setActivitiesList((prev) => [newPayload, ...prev]);
      
      await createAuditLog({
        action: 'CREATE_ACTIVITY',
        module: 'ACTIVITIES',
        recordId: newPayload._id,
        details: `Created new activity: ${activityForm.title}`,
      });
    }
    
    // Reset Form
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
    showToast('Failed to save activity to local database.', 'error');
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

const handleDeleteActivity = async (id) => {
  if (!window.confirm('Are you sure you want to delete this activity?')) return;
  try {
    const docToDelete = activitiesList.find((a) => (a._id || a.id) === id);
    if (docToDelete && docToDelete._id) {
      await db.remove(docToDelete._id, docToDelete._rev);
    }
    setActivitiesList((prev) => prev.filter((a) => (a._id || a.id) !== id));
    
    await createAuditLog({
      action: 'DELETE_ACTIVITY',
      module: 'ACTIVITIES',
      recordId: id,
      details: `Deleted activity record`,
    });
  } catch (err) {
    console.error('Error deleting activity:', err);
    showToast('Failed to delete activity.', 'error');
  }
};

const [systemSettings, setSystemSettings] = useState(null);

const [isSaving, setIsSaving] = useState(false);
const [settingsForm, setSettingsForm] = useState({
  punongBarangay: 'HON. ANNABELLE E. RULL',
  luponSecretary: 'MRS. MELY M. PRESADO',
  treasurer: '',
});


  useEffect(() => {
  async function fetchBarangaySettings() {
    try {
      const savedData = await db.get('setting_barangay_officials');
      if (savedData) {
        setSystemSettings(savedData);
      }
    } catch (err) {
      if (err.status === 404) {
      } else {
        console.warn('Using default official settings:', err.message);
      }
    }
  }

  fetchBarangaySettings();
}, []);

useEffect(() => {
  if (systemSettings) {
    setSettingsForm({
      punongBarangay: systemSettings.punongBarangay || 'HON. ANNABELLE E. RULL',
      luponSecretary: systemSettings.luponSecretary || 'MRS. MELY M. PRESADO',
      treasurer: systemSettings.treasurer || '',
    });
  }
}, [systemSettings]);

// ── BUSINESS CLEARANCE: CONFIGURABLE QR VERIFICATION SETTINGS ──
useEffect(() => {
  let isMounted = true;
  (async () => {
    const loaded = await loadBusinessQrConfig(db);
    if (isMounted) {
      setBusinessQrConfig(loaded);
      setQrConfigForm(loaded);
    }
  })();
  return () => { isMounted = false; };
}, []);

const handleSaveQrConfig = async () => {
  setIsSavingQrConfig(true);
  try {
    const saved = await saveBusinessQrConfig(db, qrConfigForm);
    setBusinessQrConfig(saved);
    setQrConfigForm(saved);
    if (typeof forceSyncToRemote === 'function') {
      await forceSyncToRemote();
    }
    await createAuditLog({
      action: 'UPDATE_BUSINESS_QR_CONFIG',
      module: 'BUSINESS_CLEARANCE',
      recordId: 'setting_business_qr',
      details: `Business Clearance QR verification ${saved.enabled ? 'enabled' : 'disabled'} (base URL: ${saved.baseUrl || 'auto'})`,
      user: currentUser?.name || currentUser?.username || 'Admin',
    });
    showToast('QR verification settings saved.', 'success');
  } catch (err) {
    console.error('Failed to save Business QR config:', err);
    showToast(err?.message ? `Failed to save QR settings: ${err.message}` : 'Failed to save QR settings.', 'error');
  } finally {
    setIsSavingQrConfig(false);
  }
};

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
  /*
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
  */
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
}, []);

useEffect(() => {
  if (screen === 'business_clearance' && !businessForm._id) {
    peekNextBusinessSequence().then(nextId => {
      setBusinessForm(prev => ({ ...prev, bcIdNo: nextId }));
    });
  }
}, [screen, businessForm._id]);

useEffect(() => {
  if (screen === 'brgy_clearance' && !clearanceForm._id && !clearanceForm.clearanceNo) {
    peekNextClearanceNo().then(nextNo => {
      setClearanceForm(prev => (prev.clearanceNo ? prev : { ...prev, clearanceNo: nextNo }));
    });
  }
}, [screen, clearanceForm._id, clearanceForm.clearanceNo, clearanceList]);

useEffect(() => {
  setClearancePage(1);
}, [clearanceSearch]);

useEffect(() => {
  setBusinessPage(1);
}, [businessClearanceSearch]);

useEffect(() => {
  setupPouchDBSync();
  const unsubscribe = onSyncStatusChange(({ status, pending }) => {
    setSyncState(status);
    
    if (pending !== undefined && pending !== 999) {
      setPendingCount(pending);
    }
    
    if (status === 'synced' || status === 'success') {
      const now = new Date().toISOString();
      setLastSynced(now);
      localStorage.setItem('bustrac_last_synced', now); // ✅ DITO ANG DAGDAG
      setPendingCount(0);
    }
  });
  setSyncState(navigator.onLine ? 'synced' : 'offline');
  return () => unsubscribe();
}, []);

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

const handleGenerateCredentials = async (resident) => {
  try {
    // Auto-generate username (firstname + lastname + random numbers)
    const firstName = resident.firstName || resident.name.split(',')[1]?.trim().split(' ')[0] || '';
    const lastName = resident.lastName || resident.name.split(',')[0]?.trim() || '';
    const username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 999)}`;
    
    // Auto-generate temporary password (8 characters)
    const tempPassword = `Bustrac${Math.random().toString(36).slice(-6).toUpperCase()}`;
    
    // Update resident record with credentials
    const existingDoc = await db.get(resident.id);
    const updatedDoc = {
      ...existingDoc,
      hasAccount: true,
      username: username,
      password: tempPassword, // In production, dapat hashed ito
      accountCreatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await db.put(updatedDoc);
    
    // Audit log
    if (typeof createAuditLog === 'function') {
      await createAuditLog({
        action: 'GENERATE_RESIDENT_CREDENTIALS',
        module: 'RESIDENTS',
        recordId: resident.id,
        details: `Generated credentials for ${resident.name} (Username: ${username})`,
      });
    }
    
    // Show credentials modal
    setCredentialsModal({
      show: true,
      residentName: resident.name,
      username: username,
      password: tempPassword,
    });
    
    // Refresh residents list
    await loadData();
    
  } catch (err) {
    console.error('Failed to generate credentials:', err);
    showToast('Failed to generate credentials. Please try again.', 'error');
  }
};

  const advisoryQuery = advisorySearch.trim().toLowerCase();
  const filteredAdvisories = advisoriesList
    .filter((advisory) => {
      const searchableText = `${advisory.title || ''} ${advisory.description || advisory.content || advisory.body || ''}`.toLowerCase();
      const matchesQuery = !advisoryQuery || searchableText.includes(advisoryQuery);
      const matchesCategory = advisoryCategoryFilter === 'All' || (advisory.category || 'Relief') === advisoryCategoryFilter;
      const matchesStatus = advisoryStatusFilter === 'All' || (advisory.status || 'Active') === advisoryStatusFilter;
      const matchesPriority = advisoryPriorityFilter === 'All' || (advisory.priority || 'Medium') === advisoryPriorityFilter;
      return matchesQuery && matchesCategory && matchesStatus && matchesPriority;
    })
    .slice()
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="dashboard-shell-container">
      <div className={`app ${sidebarOpen ? 'sidebar-is-open' : 'sidebar-is-closed'}`}>
        {/* ════════════════ SIDEBAR ════════════════ */}
        <Sidebar
  sidebarOpen={sidebarOpen}
  setSidebarOpen={setSidebarOpen}
  isResidentsOpen={isResidentsOpen}
  setIsResidentsOpen={setIsResidentsOpen}
  isAidOpen={isAidOpen}
  setIsAidOpen={setIsAidOpen}
  screen={screen}
  nav={nav}
  role={role}
  displayName={displayName}
  initials={initials}
  syncState={syncState}
  pendingRequestsCount={pendingRequestsCount}
  pendingBlotterCount={pendingBlotterCount}
  activeFeedbackCount={activeFeedbackCount}
  accountRequests={accountRequests}
  conflictsList={conflictsList}
  logo={logo}
  logout={logout}
/>
        
        {/* ════════════════ MAIN CONTENT ════════════════ */}
        <div className="main">

          {/* ── Topbar ── */}
          <Topbar
            currentTitle={currentTitle}
            currentSubtitle={currentSubtitle}
            role={role}
            syncState={syncState}
            pendingCount={pendingCount}
            lastSynced={lastSynced}
            logout={logout}
            forceSync={forceSyncToRemote}
          />

          <div className="content">
            {/* ════════════════════════════════════════
                SCREEN: DASHBOARD
                ════════════════════════════════════════ */}
                {screen === 'dashboard' && (
                <DashboardScreen
                  role={role}
                  residentsList={residentsList}
                  householdsList={householdsList}
                  programsList={programsList}
                  blotterList={blotterList}
                  feedbackList={feedbackList}
                  conflictsList={conflictsList}
                  pendingRequestsCount={pendingRequestsCount}
                  pendingBlotterCount={pendingBlotterCount}
                  activeFeedbackCount={activeFeedbackCount}
                  totalResidents={totalResidents}
                  totalHouseholds={totalHouseholds}
                  totalVoters={totalVoters}
                  p1Count={p1Count}
                  p2Count={p2Count}
                  p3Count={p3Count}
                  p4Count={p4Count}
                  p5Count={p5Count}
                  settledBlotterCount={settledBlotterCount}
                  cfaBlotterCount={cfaBlotterCount}
                  activeBlotterCount={activeBlotterCount}
                  feedbackSummary={feedbackSummary}
                  residentTrend={residentTrend}
                  householdTrend={householdTrend}
                  voterTrend={voterTrend}
                  certTrend={certTrend}
                  blotterTrend={blotterTrend}
                  feedbackTrend={feedbackTrend}
                  syncState={syncState}
                  nav={handleNav}
                />
              )}
                
                {screen === 'barangay-map' && (
                  <div className="screen active certificate-lifecycle-screen" style={{ padding: '24px' }}>
                    <div style={{ marginBottom: '20px' }}>
                      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
                        Barangay Map
                      </h2>
                      <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                        Interactive view of Barangay Bustrac zones, residents, and incident locations.
                      </p>
                    </div>
                    <div className="cert-section-card" style={{ padding: '16px' }}>
                      <BarangayMap
                        residents={mapResidents}
                        blotters={mapBlotters}
                        assistance={mapAid}
                        onZoneClick={handleZoneClick}
                      />
                    </div>
                  </div>
                )}

                {/* ════════════════════════════════════════ 
                        SCREEN: MANAGE RESIDENTS 
                    ════════════════════════════════════════ */}
                    {screen === 'residents' && (
                    <ResidentsScreen
                      residentsList={residentsList}
                      filteredResidents={filteredResidents}
                      sortedFilteredResidents={sortedFilteredResidents}
                      isResidentsLoading={isResidentsLoading}
                      viewMode={viewMode}
                      role={role}
                      searchTerm={searchTerm}
                      setSearchTerm={setSearchTerm}
                      purokFilter={purokFilter}
                      setPurokFilter={setPurokFilter}
                      genderFilter={genderFilter}
                      setGenderFilter={setGenderFilter}
                      residentSort={residentSort}
                      selectedResidents={selectedResidents}
                      setSelectedResidents={setSelectedResidents}
                      showBulkDropdown={showBulkDropdown}
                      setShowBulkDropdown={setShowBulkDropdown}
                      handleResidentSort={handleResidentSort}
                      handleStartEditResident={handleStartEditResident}
                      handleArchiveResident={handleArchiveResident}
                      handleGenerateCredentials={handleGenerateCredentials}
                      setSelectedResidentId={setSelectedResidentId}
                      setSelectedHouseholdId={setSelectedHouseholdId}
                      setShowAddResidentModal={setShowAddResidentModal}
                      setEditingResidentId={setEditingResidentId}
                      setResidentForm={setResidentForm}
                      setHouseholdAssignmentMode={setHouseholdAssignmentMode}
                      setHouseholdForm={setHouseholdForm}
                      EMPTY_HOUSEHOLD={EMPTY_HOUSEHOLD}
                      EMPTY_RESIDENT={EMPTY_RESIDENT}
                      showToast={showToast}
                      nav={nav}
                      exportToExcel={exportToExcel}
                    />
                  )}

                    {/* ════════════════════════════════════════
                        SCREEN: EDIT RESIDENT
                        ════════════════════════════════════════ */}
                       {screen === 'edit-resident' && (
  <div className="screen active" style={{ padding: '0 0 24px 0' }}>
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      padding: '16px 24px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      borderRadius: '8px',
      margin: '0 24px 20px 24px'
    }}>
      <button
        className="btn btn-g"
        onClick={() => {
          setEditingResidentId(null);
          setResidentForm(EMPTY_RESIDENT);
          nav('residents');
        }}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '140px' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to Residents
      </button>

      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', textAlign: 'center', flex: 1 }}>
        Edit Resident Profile
      </div>

      <div style={{ minWidth: '140px' }}></div>
    </div>

    <ResidentForm
      residentForm={residentForm}
      setResidentForm={setResidentForm}
      editingResidentId={editingResidentId}
      photoPreviewUrl={photoPreviewUrl}
      setPhotoPreviewUrl={setPhotoPreviewUrl}
      handlePhotoChange={handlePhotoChange}
      handleRemovePhoto={handleRemovePhoto}
      updateResidentField={updateResidentField}
      submitAddResident={submitAddResident}
      households={householdsList}
      householdAssignmentMode={householdAssignmentMode}
      setHouseholdAssignmentMode={setHouseholdAssignmentMode}
      householdForm={householdForm}
      setHouseholdForm={setHouseholdForm}
      canCreateHousehold={role === 'admin'}
      nav={nav}
      setEditingResidentId={setEditingResidentId}
      EMPTY_RESIDENT={EMPTY_RESIDENT}
      onCancel={handleCancelResidentForm}
    />
  </div>
)}

            {/* ════════════════════════════════════════
                SCREEN: VIEW RESIDENT PROFILE
                ════════════════════════════════════════ */}
            {screen === 'view-resident' && (() => {
              const res = residentsList.find(r => r.id === selectedResidentId);

              if (!res) {
                return (
                  <div className="screen active">
                    <div className="ph">
                      <div className="pt">Resident Profile Not Found</div>
                      <button className="btn btn-g" onClick={() => nav('residents')}>
                        ← Back to List
                      </button>
                    </div>
                  </div>
                );
              }

              const resName = res.name || res.fullName || `${res.firstName || ''} ${res.lastName || ''}`.trim() || 'Resident Profile';
              
              const initials = resName
                .split(' ')
                .filter(Boolean)
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase() || 'RP';

              const personalAidHistory = (typeof aidLogs !== 'undefined' ? aidLogs : [])
                .filter(log => log.residentId === selectedResidentId || log.residentID === selectedResidentId);

              // Demographics & Contact
              const rawBirthdate = res.birthdate || res.dateOfBirth || res.dob || '';
              const displayAge = res.age 
                ? `${res.age} yrs old` 
                : (rawBirthdate && typeof getAge === 'function' ? `${getAge(rawBirthdate)} yrs old` : '— yrs old');

              const displayGender = res.gender || res.sex || 'N/A';
              const displayContact = res.contact || res.contactNo || res.phone || res.mobile || 'N/A';
              const displayEmail = res.email || res.emailAddress || 'N/A';
              const displayBirthdate = rawBirthdate || 'N/A';
              const displayPurok = res.purok || res.purokZoneAddress || res.zone || res.purokNumber || 'N/A';
              const displayCivilStatus = res.civilStatus || res.maritalStatus || 'N/A';
              const displayHousehold = res.household || res.householdId || res.householdNo || 'Unassigned';
              const displayBirthPlace = res.birthPlace || res.placeOfBirth || 'N/A';
              const displayResidentSince = res.residentSince || res.yearsOfResidency || res.residencyYear || 'N/A';

              // Status Booleans
              const isVoter = Boolean(res.voter || res.isVoter || res.voterStatus === 'Registered' || res.voterStatus === 'Yes');
              const isSoloParent = Boolean(res.isSoloParent || res.soloParent || res.soloParentStatus === 'Yes');
              const isBarangayOfficial = Boolean(res.isBarangayOfficial || res.barangayOfficial || res.isOfficial);

              return (
                <div className="screen active" style={{ padding: '0 0 24px 0' }}>
                  {/* Header Controls */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <button
                      className="btn btn-g"
                      onClick={() => nav('residents')}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5" />
                        <path d="M12 19l-7-7 7-7" />
                      </svg>
                      Back to Residents
                    </button>
                    <button
                      className="btn btn-p"
                      onClick={() => handleStartEditResident(res)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      Edit Resident
                    </button>
                  </div>

                  <div className="tc" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                    {/* Left Profile Card */}
                    <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
                      <div
                        style={{
                          width: '100px',
                          height: '100px',
                          borderRadius: '50%',
                          background: 'var(--surface2)',
                          margin: '0 auto 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '32px',
                          fontWeight: 'bold',
                          color: 'var(--primary)',
                          border: '3px solid var(--border)',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {res.photoUrl || res.avatar ? (
                          <img
                            src={res.photoUrl || res.avatar}
                            alt={resName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          initials
                        )}
                      </div>

                      <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text)', marginBottom: '4px' }}>
                        {resName}
                      </h2>

                      <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: '16px' }}>
                        ID: {res.id || 'N/A'} • RBI: {res.rbiId || res.rbi || 'N/A'}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          textAlign: 'left',
                          marginTop: '24px',
                          borderTop: '1px solid var(--border)',
                          paddingTop: '24px'
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                            Age & Gender
                          </span>
                          <div style={{ fontWeight: '600' }}>
                            {displayAge} • {displayGender}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                            Civil Status
                          </span>
                          <div style={{ fontWeight: '600' }}>{displayCivilStatus}</div>
                        </div>

                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                            Contact
                          </span>
                          <div style={{ fontWeight: '600' }}>{displayContact}</div>
                        </div>

                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                            Email
                          </span>
                          <div style={{ fontWeight: '600' }}>{displayEmail}</div>
                        </div>

                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                            Address
                          </span>
                          <div style={{ fontWeight: '600' }}>
                            {displayPurok}, Brgy. Bustrac
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                            Household
                          </span>
                          <div
                            style={{ fontWeight: '600', color: 'var(--primary)', cursor: 'pointer' }}
                            onClick={() => {
                              if (displayHousehold !== 'Unassigned') {
                                setSelectedHouseholdId(displayHousehold);
                                nav('view-household');
                              }
                            }}
                          >
                            {displayHousehold}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Details Column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {/* Additional Demographics Card */}
                      <div className="card" style={{ padding: '20px' }}>
                        <h3
                          style={{
                            fontSize: '14px',
                            fontWeight: '700',
                            color: 'var(--text)',
                            marginBottom: '16px',
                            borderBottom: '1px solid var(--border)',
                            paddingBottom: '8px'
                          }}
                        >
                          Additional Demographics
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Birthdate:</span>{' '}
                            <strong>{displayBirthdate}</strong>
                          </div>
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Birth Place:</span>{' '}
                            <strong>{displayBirthPlace}</strong>
                          </div>
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Voter Status:</span>{' '}
                            <span className={`badge ${isVoter ? 'g' : 'gr'}`}>
                              {isVoter ? 'Registered' : 'Non-Voter'}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Resident Since:</span>{' '}
                            <strong>{displayResidentSince}</strong>
                          </div>
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Solo Parent:</span>{' '}
                            <strong>{isSoloParent ? 'Yes' : 'No'}</strong>
                          </div>
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Barangay Official:</span>{' '}
                            <strong>{isBarangayOfficial ? 'Yes' : 'No'}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Relief & Assistance Ledger Card */}
                      <div className="card" style={{ padding: '20px', flex: 1 }}>
                        <h3
                          style={{
                            fontSize: '14px',
                            fontWeight: '700',
                            color: 'var(--text)',
                            marginBottom: '16px',
                            borderBottom: '1px solid var(--border)',
                            paddingBottom: '8px'
                          }}
                        >
                          Relief & Assistance Ledger ({personalAidHistory.length})
                        </h3>
                        {personalAidHistory.length === 0 ? (
                          <div
                            style={{
                              padding: '20px',
                              textAlign: 'center',
                              color: 'var(--muted)',
                              fontSize: '13px',
                              background: 'var(--surface2)',
                              borderRadius: '6px'
                            }}
                          >
                            No aid distribution records found for this resident.
                          </div>
                        ) : (
                          <div className="tw">
                            <table style={{ width: '100%' }}>
                              <thead>
                                <tr>
                                  <th>Log ID</th>
                                  <th>Aid Released</th>
                                  <th>Officer</th>
                                  <th>Time</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {personalAidHistory.map(log => (
                                  <tr key={log.id || log._id}>
                                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>
                                      {(log.id || log._id || '').substring(0, 8)}
                                    </td>
                                    <td>
                                      <strong>{log.aid || log.item || log.reliefType || '—'}</strong>
                                    </td>
                                    <td>{log.officer || log.releasedBy || '—'}</td>
                                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>
                                      {log.time || log.timestamp || log.date || '—'}
                                    </td>
                                    <td>
                                      <span className={`badge ${log.status === 'OK' || log.status === 'Released' ? 'g' : 't'}`}>
                                        {log.status || 'OK'}
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
                </div>
              );
            })()}
            
            {/* ════════════════════════════════════════
                SCREEN: ADD HOUSEHOLD
                ════════════════════════════════════════ */}
                {screen === 'add-household' && (
  <div className="screen active">
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

      {/* ═══ Back Button ═══ */}
      <button
        type="button"
        onClick={() => nav('households')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none',
          color: 'var(--muted)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', padding: '6px 0', marginBottom: 12,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Households
      </button>

      {/* ═══ Page Header ═══ */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.4px' }}>
          Register New Household
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
          Fill out the details below to register a family unit in the barangay registry.
        </p>
      </div>

      {/* ═══ Form Card ═══ */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}>

        {/* Card Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '18px 24px',
          background: 'linear-gradient(135deg, var(--surface2) 0%, var(--surface) 100%)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--accent-bg)', color: 'var(--accent)',
            border: '1px solid rgba(79,142,247,0.25)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              Household Information
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
              All fields are required
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={role === 'admin' ? submitAddHousehold : (e) => e.preventDefault()}>
          <div style={{ padding: '24px' }}>

            {/* ── Head of Family ── */}
            <div style={{ marginBottom: 20 }}>
              <label className="fl" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Head of Family
                <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>
              </label>
              <input
                className="fc"
                placeholder="e.g., Obrero, Jay N."
                value={householdForm.head}
                onChange={(e) => setHouseholdForm({ ...householdForm, head: e.target.value })}
                required
                style={{ fontSize: 14, padding: '11px 14px' }}
              />
              <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--hint)' }}>
                Format: <strong style={{ color: 'var(--muted)' }}>Lastname, Firstname MiddleInitial.</strong>
              </span>
            </div>

            {/* ── Complete Address ── */}
            <div style={{ marginBottom: 20 }}>
              <label className="fl" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Complete Address
                <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>
              </label>
              <input
                className="fc"
                placeholder="e.g., No. 7, Zone 1, Nabua"
                value={householdForm.address}
                onChange={(e) => setHouseholdForm({ ...householdForm, address: e.target.value })}
                required
                style={{ fontSize: 14, padding: '11px 14px' }}
              />
              <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--hint)' }}>
                Include house number, street, and zone/purok.
              </span>
            </div>

            {/* ── Purok Assignment ── */}
            <div style={{ marginBottom: 8 }}>
              <label className="fl" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
                Purok Assignment
                <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>
              </label>
              <select
                className="fc"
                value={householdForm.purok}
                onChange={(e) => setHouseholdForm({ ...householdForm, purok: e.target.value })}
                required
                style={{ fontSize: 14, padding: '11px 14px', cursor: 'pointer' }}
              >
                <option value="">— Select Purok —</option>
                <option value="Purok 1">Purok 1</option>
                <option value="Purok 2">Purok 2</option>
                <option value="Purok 3">Purok 3</option>
                <option value="Purok 4">Purok 4</option>
                <option value="Purok 5">Purok 5</option>
              </select>
              <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--hint)' }}>
                The zone where this household is officially registered.
              </span>
            </div>

          </div>

          {/* ── Form Footer / Actions ── */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '16px 24px',
            background: 'var(--surface2)',
            borderTop: '1px solid var(--border)',
          }}>
            <button
              type="button"
              className="btn btn-g"
              onClick={() => { setHouseholdForm(EMPTY_HOUSEHOLD); nav('households'); }}
              style={{ minWidth: 100, justifyContent: 'center' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-p"
              style={{ minWidth: 160, justifyContent: 'center', gap: 8 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save Household
            </button>
          </div>
        </form>
      </div>

      {/* ═══ Help Info Box ═══ */}
      <div style={{
        marginTop: 20, padding: '14px 18px',
        background: 'var(--accent-bg)',
        border: '1px solid rgba(79,142,247,0.25)',
        borderRadius: 10,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}></span>
        <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6 }}>
          <strong style={{ display: 'block', marginBottom: 2, color: 'var(--accent)' }}>Quick tip</strong>
          Make sure the head of family's name matches the format used in existing records for easier searching and matching.
        </div>
      </div>

    </div>
  </div>
)}

            {/* ════════════════════════════════════════
                 SCREEN: EDIT HOUSEHOLD
                ════════════════════════════════════════ */}
                {screen === 'edit-household' && (
  <div className="screen active" style={{ padding: '24px', maxWidth: '700px', margin: '0 auto' }}>
    
    {/* 1. Back Button */}
    <div style={{ marginBottom: '16px' }}>
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

    {/* 2. Main Form Card */}
    <div className="card" style={{ padding: '24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <form onSubmit={submitEditHousehold}>
        
        {/* Household ID - Read Only (Styled nicely) */}
        <div className="fg" style={{ marginBottom: '16px' }}>
          <label className="fl">Household ID</label>
          <div style={{ 
            padding: '10px 12px', 
            background: 'var(--surface2)', 
            border: '1px solid var(--border)', 
            borderRadius: '8px', 
            color: 'var(--muted)', 
            fontFamily: 'var(--mono)',
            fontSize: '13px',
            letterSpacing: '0.5px'
          }}>
            {selectedHouseholdId || 'N/A'}
          </div>
        </div>

        {/* Head of Family */}
        <div className="fg" style={{ marginBottom: '16px' }}>
          <label className="fl">Head of Family <span style={{ color: 'var(--red)' }}>*</span></label>
          <input 
            className="fc" 
            placeholder="e.g. SANTOS, Juan B." 
            value={householdForm.head} 
            onChange={(e) => setHouseholdForm({ ...householdForm, head: e.target.value.toUpperCase() })} 
            required 
            style={{ textTransform: 'uppercase' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            Format: LASTNAME, Firstname Middle Initial
          </span>
        </div>

        {/* Complete Address */}
        <div className="fg" style={{ marginBottom: '16px' }}>
          <label className="fl">Complete Address <span style={{ color: 'var(--red)' }}>*</span></label>
          <input 
            className="fc" 
            placeholder="e.g. No. 3, Mabini Avenue, Brgy. Bustrac" 
            value={householdForm.address} 
            onChange={(e) => setHouseholdForm({ ...householdForm, address: e.target.value })} 
            required 
          />
        </div>

        {/* Purok Assignment */}
        <div className="fg" style={{ marginBottom: '24px' }}>
          <label className="fl">Purok Assignment <span style={{ color: 'var(--red)' }}>*</span></label>
          <select 
            className="fc" 
            value={householdForm.purok} 
            onChange={(e) => setHouseholdForm({ ...householdForm, purok: e.target.value })} 
            required
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <button 
            type="button" 
            className="btn btn-g" 
            onClick={() => {
              setHouseholdForm(EMPTY_HOUSEHOLD);
              setSelectedHouseholdId(null);
              nav('households');
            }}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn btn-p" 
            disabled={saving}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              opacity: saving ? 0.7 : 1,
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? (
              <>
                <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
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

    {/* 3. Quick Tips Card (Using existing .note-i class for consistency) */}
    <div className="note note-i" style={{ marginTop: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '14px 16px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent)' }}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <div style={{ fontSize: '12px', lineHeight: '1.5', color: 'var(--text)' }}>
        <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--accent)' }}>Quick Tips:</strong>
        <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--muted)' }}>
          <li>Make sure the Head of Family name matches the resident registry.</li>
          <li>Purok assignment affects statistical reports and aid distribution.</li>
          <li>Address should be complete for proper documentation.</li>
        </ul>
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
                          {isHouseholdsLoading ? (
                            // ✅ Loading State: Maiiwasan ang "No households found" flash
                            <tr>
                              <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                  <span className="spinner" style={{ width: '24px', height: '24px', borderWidth: '3px' }} />
                                  <span>Loading household records from local database...</span>
                                </div>
                              </td>
                            </tr>
                          ) : filteredHouseholds.length === 0 ? (
                            // ✅ True Empty State: Ipapakita lang kung talagang walang data
                            <tr>
                              <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                                No households found matching your search.
                              </td>
                            </tr>
                          ) : (
                            // ✅ Normal Data Render
                            filteredHouseholds.map((h) => (
                              <tr key={h.id}>
                                <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{h.id}</td>
                                <td style={{ fontWeight: 600 }}>{h.head}</td>
                                <td>{h.address}</td>
                                <td>
                                  <span className={`badge ${h.purokClass}`}>{h.purok}</span>
                                </td>
                                <td>{getHouseholdMembersCount(h.id)}</td>
                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <button
                                    className="btn btn-g btn-sm"
                                    onClick={() => {
                                      setSelectedHouseholdId(h.id);
                                      navigate(`?page=view-household&id=${encodeURIComponent(h.id)}`);
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
                    {/* Page Header */}
                    <div className="ph">
                      <div>
                        <div className="ps">
                          ID: <span className="mono" style={{ color: 'var(--accent)' }}>{selectedHouseholdId}</span> • {familyMembers.length} registered member{familyMembers.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          className="btn btn-g"
                          onClick={() => {
                            setSelectedHouseholdId(null);
                            nav('households');
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 12H5" />
                            <path d="M12 19l-7-7 7-7" />
                          </svg>
                          Back to Households
                        </button>
                        <button
                          className="btn btn-p"
                          onClick={() => nav('edit-household')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit Details
                        </button>
                      </div>
                    </div>

                    {/* Two-Column Layout */}
                    <div className="tc">
                      {/* Left Column: Household Metadata */}
                      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="fp-t" style={{ color: 'var(--accent)', marginBottom: '8px' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                            <path d="M12 18v-6" />
                            <path d="M9 15h6" />
                          </svg>
                          Registration Specs
                        </div>
                        
                        <div>
                          <div className="fl">Household Head</div>
                          <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)' }}>{hh.head || 'N/A'}</div>
                        </div>

                        <div>
                          <div className="fl">Barangay Address</div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{hh.address || 'N/A'}</div>
                        </div>

                        <div>
                          <div className="fl">Jurisdiction Area</div>
                          <span className={`badge ${hh.purokClass || 'gr'}`}>{hh.purok || 'Unassigned'}</span>
                        </div>

                        <div>
                          <div className="fl">Registered Members</div>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--amber)' }}>
                            {getHouseholdMembersCount(selectedHouseholdId)} individual{getHouseholdMembersCount(selectedHouseholdId) !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Family Roster */}
                      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        <div className="tb" style={{ borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--green)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                            </svg>
                            <span style={{ fontSize: '13px', fontWeight: '700' }}>Dynamic Family Roster</span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            Cross-referenced from Resident Registry
                          </span>
                        </div>

                        {familyMembers.length === 0 ? (
                          <div className="empty-state" style={{ padding: '40px 20px' }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                            </svg>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>
                                No Members Found
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                                No individuals are currently linked to this Household ID.
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="tw" style={{ maxHeight: '400px', overflowY: 'auto', margin: 0, border: 'none', borderRadius: 0, boxShadow: 'none' }}>
                            <table>
                              <thead>
                                <tr>
                                  <th style={{ width: '120px' }}>Resident ID</th>
                                  <th>Full Name</th>
                                  <th style={{ width: '80px' }}>Age</th>
                                  <th style={{ width: '120px' }}>Civil Status</th>
                                  <th style={{ width: '110px' }}>Voter Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {familyMembers.map((member) => (
                                  <tr
                                    key={member.id}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                      setSelectedResidentId(member.id);
                                      nav('view-resident');
                                    }}
                                  >
                                    <td className="mono" style={{ color: 'var(--accent)', fontWeight: '600' }}>
                                      {member.id}
                                    </td>
                                    <td style={{ fontWeight: '600', color: 'var(--text)' }}>
                                      {member.name}
                                    </td>
                                    <td>{member.age || '—'}</td>
                                    <td>{member.civilStatus || '—'}</td>
                                    <td>
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
                    <CertificateLifecycle onOpenDispatcher={() => setShowCertDispatcher(true)} onOpenIssuance={openIssuanceWorkspace} />
                  </div>
                )}

                {screen === 'cert-approve' && (
                  <div className="screen active">
                    <CertificateLifecycle onOpenIssuance={openIssuanceWorkspace} />
                  </div>
                )}

                {/* ════════════════════════════════════════
                    SCREEN: NEW STANDARD CERTIFICATE REQUEST
                    ════════════════════════════════════════ */}
                    {screen === 'cert-new' && (
  <div className="screen active screen-narrow">

    {/* ── Simple Back Link ── */}
    <button
      type="button"
      className="btn btn-g"
      onClick={() => nav('cert-req')}
      style={{
        marginBottom: 20,
        padding: '6px 14px',
        fontSize: 13,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      ← Back
    </button>

    {/* ── Form Card ── */}
    <div className="card" style={{ padding: '24px' }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitStandardCert();
        }}
      >
        {/* Resident */}
        <div className="fg">
          <label className="fl" htmlFor="cert-new-resident">
            Resident <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <ResidentCombobox
            residents={residentsList}
            value={standardCertForm.residentId}
            onChange={(selected) =>
              setStandardCertForm((prev) => ({
                ...prev,
                residentId: selected?.id || '',
                residentName: selected?.name || '',
              }))
            }
            placeholder="Search registered resident…"
          />
        </div>

        {/* Certificate Type — Indigency & Residency lang */}
        <div className="fg">
          <label className="fl" htmlFor="cert-new-type">
            Certificate Type <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <select
            id="cert-new-type"
            className="fc"
            value={standardCertForm.certificateType}
            onChange={(e) =>
              setStandardCertForm((prev) => ({
                ...prev,
                certificateType: e.target.value,
              }))
            }
          >
            <option value="indigency">Certificate of Indigency</option>
            <option value="residency">Certificate of Residency</option>
          </select>
        </div>

        {/* Purpose */}
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl" htmlFor="cert-new-purpose">
            Purpose <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <textarea
            id="cert-new-purpose"
            className="fc"
            rows={3}
            placeholder="e.g. Scholarship application, employment requirement, hospital assistance"
            value={standardCertForm.purpose}
            onChange={(e) =>
              setStandardCertForm((prev) => ({
                ...prev,
                purpose: e.target.value,
              }))
            }
            style={{ resize: 'vertical', minHeight: 70 }}
          />
        </div>

        {/* Actions */}
        <div className="form-actions" style={{ marginTop: 24 }}>
          <button
            type="button"
            className="btn btn-g"
            onClick={() => nav('cert-req')}
            disabled={isSavingStandardCert}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-p"
            disabled={isSavingStandardCert}
            style={{
              opacity: isSavingStandardCert ? 0.7 : 1,
              cursor: isSavingStandardCert ? 'not-allowed' : 'pointer',
            }}
          >
            {isSavingStandardCert ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  </div>
)}

            {/* ════════════════════════════════════════
                SCREEN: ISSUANCE & PRINT
                ════════════════════════════════════════ */}
                {screen === 'cert-print' && (
                  <CertPrintScreen
                    issuedCertificates={uniqueIssuedCertificates}
                    approvedCertificates={approvedCertificates}
                    selectedCertificate={selectedCertificate}
                    setSelectedCertificate={setSelectedCertificate}
                    clearSelectedCert={() => setSelectedCertificate(null)}
                    issuanceMeta={issuanceMeta}
                    setIssuanceMeta={setIssuanceMeta}
                    blotterVerifyQuery={blotterVerifyQuery}
                    setBlotterVerifyQuery={setBlotterVerifyQuery}
                    printMode={printMode}
                    setPrintMode={setPrintMode}
                    onOpenPrintPreview={onOpenPrintPreview}
                    showToast={showToast}
                    notifyDesktop={notifyDesktop} 
                    nav={nav} 
                  />
                )}

            {/* ════════════════════════════════════════
                SCREEN: BARANGAY CLEARANCE (INDIVIDUAL)
                ════════════════════════════════════════ */}
                {screen === 'brgy_clearance' && (
                  <div className="screen active">
                      {/* ═══ BACK BUTTON ═══ */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12, 
                      marginBottom: 20,
                      paddingBottom: 16,
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <button
                        type="button"
                        className="btn btn-g"
                        onClick={() => {
                          const hasUnsavedData =
                            clearanceForm.selectedResidentId ||
                            clearanceForm.purpose?.trim() ||
                            clearanceForm.orNo?.trim() ||
                            clearanceForm.amtPaid;
                          
                          if (hasUnsavedData) {
                            Swal.fire({
                              title: 'Discard Changes?',
                              text: 'May mga hindi pa naka-save na data. Sigurado ka bang gusto mong bumalik?',
                              icon: 'warning',
                              showCancelButton: true,
                              confirmButtonColor: '#ef4444',
                              cancelButtonColor: '#64748b',
                              confirmButtonText: 'Yes, Discard',
                              cancelButtonText: 'Keep Editing',
                            }).then((result) => {
                              if (result.isConfirmed) {
                                resetClearanceForm(); 
                                nav('cert-req');
                              }
                            });
                          } else {
                            nav('cert-req');
                          }
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        Back to Requests
                      </button>
                    </div>
                    {/* ── CLEARANCE DATA CAPTURE FORM ─ */}
                    <form onSubmit={handleSaveClearance}>
                    <div className="form-2col" style={{ marginBottom: '24px' }}>

                      {/* LEFT COLUMN: RESIDENT & BLOTTER */}
                      <div className="fp" style={{ margin: 0, padding: '24px' }}>
                        <div className="fp-t" style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          APPLICANT &amp; BLOTTER VERIFICATION
                        </div>

                        {/* Clearance No & Date Issued */}
                        <div className="fg2" style={{ marginBottom: '16px' }}>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">CLEARANCE NO.</label>
                            <input type="text" className="fc" readOnly style={{ fontWeight: '700', background: 'var(--surface2)', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }} value={clearanceForm.clearanceNo} />
                          </div>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">DATE ISSUED</label>
                            <input type="text" className="fc" readOnly style={{ fontWeight: '700', background: 'var(--surface2)', opacity: 0.8 }} value={clearanceForm.dateIssued} />
                          </div>
                        </div>

                        {/* Resident Search */}
                        <div className="fg" style={{ marginBottom: '16px' }}>
                          <label className="fl">RESIDENT <span style={{ color: 'var(--red)' }}>*</span></label>
                          <ResidentCombobox
                            residents={residentsList}
                            value={clearanceForm.selectedResidentId}
                            placeholder="Search registered resident..."
                            onChange={(selected) => {
                              if (!selected) {
                                setClearanceForm(prev => ({
                                  ...prev,
                                  selectedResidentId: '',
                                  fullName: '',
                                  residentId: '',
                                  rbiId: '',
                                  purok: '',
                                  address: '',
                                  hasBlotterRecord: false,
                                  blotterReviewNeeded: false,
                                }));
                                return;
                              }

                              const { confirmed, ambiguous } = matchActiveBlotterCases(blotterList, {
                                id: selected.id,
                                name: selected.name,
                                firstName: selected.firstName,
                                lastName: selected.lastName,
                              });

                              setClearanceForm(prev => ({
                                ...prev,
                                selectedResidentId: selected.id,
                                fullName: selected.name || `${selected.firstName || ''} ${selected.lastName || ''}`.trim(),
                                residentId: selected.id,
                                rbiId: selected.rbiId || selected.rbiNo || '—',
                                purok: selected.purok || '—',
                                address: selected.purokZoneAddress || selected.purok || '—',
                                hasBlotterRecord: confirmed.length > 0,
                                blotterReviewNeeded: confirmed.length === 0 && ambiguous.length > 0,
                                ctcName: selected.name || `${selected.firstName || ''} ${selected.lastName || ''}`.trim(),
                              }));
                            }}
                          />
                        </div>

                        {/* Auto-populated Resident Details */}
                        {clearanceForm.selectedResidentId && (
                          <div className="fg3" style={{ marginBottom: '16px' }}>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">RESIDENT ID</label>
                              <input type="text" className="fc" readOnly style={{ background: 'var(--surface2)', opacity: 0.8 }} value={clearanceForm.residentId} />
                            </div>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">RBI ID</label>
                              <input type="text" className="fc" readOnly style={{ background: 'var(--surface2)', opacity: 0.8 }} value={clearanceForm.rbiId} />
                            </div>
                            <div className="fg" style={{ marginBottom: 0 }}>
                              <label className="fl">PUROK</label>
                              <input type="text" className="fc" readOnly style={{ background: 'var(--surface2)', opacity: 0.8 }} value={clearanceForm.purok} />
                            </div>
                          </div>
                        )}

                        {/* Purpose */}
                        <div className="fg" style={{ marginBottom: '16px' }}>
                          <label className="fl">PURPOSE OF CLEARANCE <span style={{ color: 'var(--red)' }}>*</span></label>
                          <input type="text" className="fc" required placeholder="e.g. Employment Requirement" value={clearanceForm.purpose} onChange={(e) => setClearanceForm({ ...clearanceForm, purpose: e.target.value.toUpperCase() })} />
                        </div>

                        {/* Remarks - Independent */}
                        <div className="fg" style={{ marginBottom: '20px' }}>
                          <label className="fl">REMARKS (Optional)</label>
                          <input type="text" className="fc" placeholder="e.g. For employment purposes only" value={clearanceForm.remarks} onChange={(e) => setClearanceForm({ ...clearanceForm, remarks: e.target.value })} />
                        </div>

                        {/* BLOTTER VERIFICATION PANEL - Read Only */}
                        {(() => {
                          const hasCase = clearanceForm.hasBlotterRecord;
                          const needsReview = !hasCase && clearanceForm.blotterReviewNeeded;
                          const accent = hasCase ? '#f87171' : needsReview ? '#fbbf24' : '#34d399';
                          const bg = hasCase ? 'rgba(248, 113, 113, 0.08)' : needsReview ? 'rgba(251, 191, 36, 0.08)' : 'rgba(52, 211, 153, 0.08)';
                          const border = hasCase ? 'rgba(248, 113, 113, 0.3)' : needsReview ? 'rgba(251, 191, 36, 0.35)' : 'rgba(52, 211, 153, 0.3)';
                          return (
                        <div style={{ padding: '16px', borderRadius: '10px', background: bg, border: `1.5px solid ${border}`, transition: 'all 0.3s ease' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: clearanceForm.selectedResidentId ? '8px' : '0' }}>
                            {hasCase ? (
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(248, 113, 113, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                              </div>
                            ) : (
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: needsReview ? 'rgba(251, 191, 36, 0.15)' : 'rgba(52, 211, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                              </div>
                            )}
                            <span style={{ fontSize: '13px', fontWeight: 700, color: accent }}>
                              Blotter Verification
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: accent, paddingLeft: clearanceForm.selectedResidentId ? '42px' : '0', lineHeight: '1.6', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {!clearanceForm.selectedResidentId ? (
                              'Select a resident to verify blotter status.'
                            ) : (
                              <>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: accent, display: 'inline-block' }} />
                                {hasCase
                                  ? 'Confirmed: active blotter case(s) found (matched by resident ID or exact name).'
                                  : needsReview
                                    ? 'Possible name match only — this does NOT confirm an active case. Review the blotter masterlist manually before issuing.'
                                    : 'Verified: no active blotter case found on the local masterlist.'}
                              </>
                            )}
                          </div>
                        </div>
                          );
                        })()}
                      </div>

                      {/* RIGHT COLUMN: RECEIPT, CTC & SIGNATORIES */}
                      <div className="fp" style={{ margin: 0, padding: '24px' }}>
                        <div className="fp-t" style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          RECEIPT, CTC & SIGNATORIES
                        </div>

                        {/* O.R. DETAILS */}
                        <div className="fg2" style={{ marginBottom: '20px' }}>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">O.R. NUMBER <span style={{ color: 'var(--red)' }}>*</span></label>
                            <input
  type="text"
  inputMode="numeric"
  className="fc"
  required
  placeholder="e.g. 08605032"
  maxLength={8}
  value={clearanceForm.orNo}
  onChange={(e) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 8);
    setClearanceForm({ ...clearanceForm, orNo: cleaned });
  }}
  style={{ fontFamily: 'var(--mono)' }}
/>
                          </div>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">CLEARANCE FEE (₱) <span style={{ color: 'var(--red)' }}>*</span></label>
                            <input type="number" className="fc" required placeholder="0.00" value={clearanceForm.amtPaid} onChange={(e) => setClearanceForm({ ...clearanceForm, amtPaid: e.target.value })} />
                          </div>
                        </div>

                        {/* CTC DETAILS SECTION - Optional */}
                        <div style={{ border: '2px dashed var(--border)', padding: '18px', borderRadius: '10px', background: 'var(--surface2)', marginBottom: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: clearanceForm.includeCtc ? '14px' : '0', paddingBottom: clearanceForm.includeCtc ? '12px' : '0', borderBottom: clearanceForm.includeCtc ? '1px solid var(--border)' : 'none' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                              COMMUNITY TAX CERTIFICATE (CTC)
                            </span>
                            {!clearanceForm.includeCtc ? (
                              <button type="button" className="btn btn-p" style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setClearanceForm(prev => ({ ...prev, includeCtc: true }))}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                Add CTC
                              </button>
                            ) : (
                              <button type="button" className="btn btn-g btn-sm" onClick={() => setClearanceForm(prev => ({ ...prev, includeCtc: false, ctcNo: '', ctcAmtPaid: '0.00', ctcDateIssued: toPHDateString(), ctcPlaceIssued: 'Nabua, Camarines Sur' }))}>
                                Remove CTC
                              </button>
                            )}
                          </div>

                          {clearanceForm.includeCtc && (
                            <>
                              <div className="fg2" style={{ marginBottom: '12px' }}>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl">CTC NO. <span style={{ color: 'var(--red)' }}>*</span></label>
                                  <input type="text" className="fc" required={clearanceForm.includeCtc} placeholder="e.g. CTC-00981" value={clearanceForm.ctcNo} onChange={(e) => setClearanceForm({ ...clearanceForm, ctcNo: e.target.value })} style={{ fontFamily: 'var(--mono)' }} />
                                </div>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl">CTC AMT. PAID (₱) <span style={{ color: 'var(--red)' }}>*</span></label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="fc"
                                    required={clearanceForm.includeCtc}
                                    placeholder="0.00"
                                    value={clearanceForm.ctcAmtPaid}
                                    onChange={(e) => {
                                      const cleaned = e.target.value
                                        .replace(/[^\d.]/g, '')
                                        .replace(/(\..*)\./g, '$1')
                                        .slice(0, 10);
                                      setClearanceForm({ ...clearanceForm, ctcAmtPaid: cleaned });
                                    }}
                                  />
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
                            </>
                          )}
                        </div>

                        {/* SIGNATORIES - Read Only from Settings */}
                        <div className="fg2" style={{ marginBottom: 0 }}>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">BARANGAY SECRETARY</label>
                            <input type="text" className="fc" readOnly style={{ background: 'var(--surface2)', opacity: 0.8 }} value={settingsForm?.luponSecretary || 'MRS. MELY M. PRESADO'} />
                          </div>
                          <div className="fg" style={{ marginBottom: 0 }}>
                            <label className="fl">PUNONG BARANGAY</label>
                            <input type="text" className="fc" readOnly style={{ background: 'var(--surface2)', opacity: 0.8 }} value={settingsForm?.punongBarangay || 'HON. ANNABELLE E. RULL'} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* FORM ACTION BUTTONS */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '32px', padding: '20px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <button type="button" className="btn btn-g" onClick={resetClearanceForm} disabled={isSavingClearance} style={{ padding: '12px 24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', opacity: isSavingClearance ? 0.6 : 1 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                        Clear Form
                      </button>
                      <button type="submit" className="btn btn-p" disabled={isSavingClearance} style={{ padding: '12px 28px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', opacity: isSavingClearance ? 0.7 : 1, cursor: isSavingClearance ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease' }}>
                        {isSavingClearance ? (
                          <><span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />Saving...</>
                        ) : (
                          <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>Save & Issue Clearance</>
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
                              <th style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}>Status</th>
                              <th style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredClearances.length === 0 ? (
                              <tr>
                                 <td colSpan="8" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)' }}>
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
                              pagedClearances.map((rec) => (
                                <tr 
                                  key={rec._id} 
                                  style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s ease' }} 
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface2)'; }} 
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  <td className="cell-nowrap" style={{ padding: '16px 20px', fontWeight: '700', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)' }} title={rec.clearanceNo}>{rec.clearanceNo}</td>
                                  <td className="cell-clip" style={{ padding: '16px 20px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text)' }} title={rec.fullName}>{rec.fullName}</td>
                                  <td className="cell-clip" style={{ padding: '16px 20px', color: 'var(--text)' }} title={rec.purpose}>{rec.purpose}</td>
                                  <td className="cell-nowrap" style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{rec.dateIssued}</td>
                                  <td className="cell-nowrap" style={{ padding: '16px 20px', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--muted)' }}>{rec.orNo || '—'}</td>
                                  <td className="cell-nowrap" style={{ padding: '16px 20px', fontWeight: 700, textAlign: 'right', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{formatCurrency(rec.amtPaid)}</td>
                                  <td style={{ padding: '16px 20px', textAlign: 'center' }}><StatusBadge doc={rec} /></td>
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
                      {/* Pagination */}
                      {filteredClearances.length > MASTERLIST_PAGE_SIZE && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            Page {safeClearancePage} of {totalClearancePages}
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" className="btn btn-g" disabled={safeClearancePage <= 1} onClick={() => setClearancePage((p) => Math.max(1, p - 1))} style={{ padding: '6px 14px', fontSize: '12px' }}>Prev</button>
                            <button type="button" className="btn btn-g" disabled={safeClearancePage >= totalClearancePages} onClick={() => setClearancePage((p) => Math.min(totalClearancePages, p + 1))} style={{ padding: '6px 14px', fontSize: '12px' }}>Next</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

            {/* ════════════════════════════════════════
                SCREEN: BUSINESS CLEARANCE DATA ENTRY
                ════════════════════════════════════════ */}
                {screen === 'business_clearance' && (
                  <div className="screen active">
                    {/* ═══ BACK BUTTON ═══ */}
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 12, 
      marginBottom: 20,
      paddingBottom: 16,
      borderBottom: '1px solid var(--border)',
    }}>
      <button
  type="button"
  className="btn btn-g"
  onClick={() => {
    const hasUnsavedData =
      businessForm.businessName?.trim() ||
      businessForm.lastName?.trim() ||
      businessForm.firstName?.trim() ||
      businessForm.orNo?.trim();
    
    if (hasUnsavedData) {
      Swal.fire({
        title: 'Discard Changes?',
        text: 'May mga hindi pa naka-save na data. Sigurado ka bang gusto mong bumalik?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Yes, Discard',
        cancelButtonText: 'Keep Editing',
      }).then((result) => {
        if (result.isConfirmed) {
          resetBusinessForm();
          setBusinessTab('page1');  
          nav('cert-req');
        }
      });
    } else {
      nav('cert-req');
    }
  }}
  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
  Back to Requests
</button>
      
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
          New Business Clearance
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Two-step form: Applicant details, then O.R. & assessment
        </div>
      </div>
    </div>
                    {/* ── STEP NAVIGATION (PAGE 1 / PAGE 2) ── */}
                    <div className="stepper" role="tablist" aria-label="Business clearance steps">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={businessTab === 'page1'}
                        className={`step ${businessTab === 'page1' ? 'active' : ''}`}
                        onClick={() => setBusinessTab('page1')}
                      >
                        <span className="step-num">1</span>
                        Applicant &amp; Business Details
                      </button>
                      <span className="step-sep" aria-hidden="true">›</span>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={businessTab === 'page2'}
                        className={`step ${businessTab === 'page2' ? 'active' : ''}`}
                        onClick={() => setBusinessTab('page2')}
                      >
                        <span className="step-num">2</span>
                        O.R. &amp; Assessment Details
                      </button>
                    </div>

                    {/* SINGLE FORM WRAPPER FOR BOTH TABS */}
                    <form ref={businessFormRef} onSubmit={handleSaveBusinessClearance} noValidate>
                      
                      {/* ── PAGE 1 CONTENT ── */}
                      <div style={{ display: businessTab === 'page1' ? 'block' : 'none' }}>
                        <div className="form-2col">
                          
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
                                <label className="fl" htmlFor="biz-lastName">LAST NAME *</label>
                                <input
                                  id="biz-lastName"
                                  ref={(el) => { businessFieldRefs.current.lastName = el; }}
                                  type="text"
                                  className={`fc ${businessErrors.lastName ? 'is-invalid' : ''}`}
                                  value={businessForm.lastName}
                                  onChange={(e) => {
                                    setBusinessForm({ ...businessForm, lastName: e.target.value.toUpperCase() });
                                    if (businessErrors.lastName) setBusinessErrors((p) => ({ ...p, lastName: undefined }));
                                  }}
                                />
                                {businessErrors.lastName && <span className="field-error">{businessErrors.lastName}</span>}
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl" htmlFor="biz-firstName">FIRST NAME *</label>
                                <input
                                  id="biz-firstName"
                                  ref={(el) => { businessFieldRefs.current.firstName = el; }}
                                  type="text"
                                  className={`fc ${businessErrors.firstName ? 'is-invalid' : ''}`}
                                  value={businessForm.firstName}
                                  onChange={(e) => {
                                    setBusinessForm({ ...businessForm, firstName: e.target.value.toUpperCase() });
                                    if (businessErrors.firstName) setBusinessErrors((p) => ({ ...p, firstName: undefined }));
                                  }}
                                />
                                {businessErrors.firstName && <span className="field-error">{businessErrors.firstName}</span>}
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
                              <label className="fl" htmlFor="biz-businessName">BUSINESS NAME *</label>
                              <input
                                id="biz-businessName"
                                ref={(el) => { businessFieldRefs.current.businessName = el; }}
                                type="text"
                                className={`fc ${businessErrors.businessName ? 'is-invalid' : ''}`}
                                placeholder="e.g. Bustrac Convenience Store"
                                value={businessForm.businessName}
                                onChange={(e) => {
                                  setBusinessForm({ ...businessForm, businessName: e.target.value.toUpperCase() });
                                  if (businessErrors.businessName) setBusinessErrors((p) => ({ ...p, businessName: undefined }));
                                }}
                              />
                              {businessErrors.businessName && <span className="field-error">{businessErrors.businessName}</span>}
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
                        <div className="form-actions" style={{ marginTop: '20px' }}>

                          <button
                            type="button"
                            className="btn btn-g"
                            onClick={handleSaveBusinessDraft}
                            disabled={isSavingBusiness}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: isSavingBusiness ? 0.6 : 1 }}
                          >
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
                            Cancel
                          </button>

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
                          <div className="form-2col">
                            
                            {/* LEFT COLUMN: OFFICIAL RECEIPT & ASSESSMENT */}
                            <div className="fp" style={{ margin: 0, padding: '16px' }}>
                              <div className="fp-t" style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                                PAYMENT & O.R. DETAILS
                              </div>
                              <div className="fg2" style={{ marginBottom: '10px' }}>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl" htmlFor="biz-orNo">O.R. NUMBER *</label>
                                  <input
                                    id="biz-orNo"
                                    ref={(el) => { businessFieldRefs.current.orNo = el; }}
                                    type="text"
                                    inputMode="numeric"
                                    className={`fc ${businessErrors.orNo ? 'is-invalid' : ''}`}
                                    placeholder="e.g. 9876543"
                                    value={businessForm.orNo || ''}
                                    onChange={(e) => {
                                      setBusinessForm({ ...businessForm, orNo: e.target.value });
                                      if (businessErrors.orNo) setBusinessErrors((p) => ({ ...p, orNo: undefined }));
                                    }}
                                  />
                                  {businessErrors.orNo && <span className="field-error">{businessErrors.orNo}</span>}
                                </div>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl">DATE ISSUED</label>
                                  <input type="date" className="fc" value={businessForm.orDateIssued || new Date().toISOString().split('T')[0]} onChange={(e) => setBusinessForm({ ...businessForm, orDateIssued: e.target.value })} />
                                </div>
                              </div>
                              <div className="fg2" style={{ marginBottom: '10px' }}>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl">CLEARANCE FEE (₱) *</label>
                                  <input
                                    id="biz-clearanceFee"
                                    ref={(el) => { businessFieldRefs.current.clearanceFee = el; }}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className={`fc ${businessErrors.clearanceFee ? 'is-invalid' : ''}`}
                                    placeholder="500.00"
                                    value={businessForm.clearanceFee || ''}
                                    onChange={(e) => {
                                      setBusinessForm({ ...businessForm, clearanceFee: e.target.value });
                                      if (businessErrors.clearanceFee) setBusinessErrors((p) => ({ ...p, clearanceFee: undefined }));
                                    }}
                                  />
                                  {businessErrors.clearanceFee && <span className="field-error">{businessErrors.clearanceFee}</span>}
                                </div>
                                <div className="fg" style={{ marginBottom: 0 }}>
                                  <label className="fl">GARBAGE FEE (₱)</label>
                                  <input
                                    id="biz-garbageFee"
                                    ref={(el) => { businessFieldRefs.current.garbageFee = el; }}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className={`fc ${businessErrors.garbageFee ? 'is-invalid' : ''}`}
                                    placeholder="200.00"
                                    value={businessForm.garbageFee || ''}
                                    onChange={(e) => {
                                      setBusinessForm({ ...businessForm, garbageFee: e.target.value });
                                      if (businessErrors.garbageFee) setBusinessErrors((p) => ({ ...p, garbageFee: undefined }));
                                    }}
                                  />
                                  {businessErrors.garbageFee && <span className="field-error">{businessErrors.garbageFee}</span>}
                                </div>
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">TOTAL FEES DUE (₱)</label>
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
                                <label className="fl">VALID UNTIL</label>
                                <input
                                  type="text"
                                  className="fc"
                                  readOnly
                                  value={
                                    businessForm.expiryDate
                                      ? new Date(businessForm.expiryDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
                                      : `December 31, ${new Date().getFullYear()}`
                                  }
                                />
                                <span className="ps" style={{ marginTop: '4px' }}>Set automatically on issue (December 31 of the approval year).</span>
                              </div>
                            </div>
                          </div>

                          {/* ACTION BUTTONS (PAGE 2) */}
                          <div className="form-actions" style={{ marginTop: '20px' }}>
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
                              type="button"
                              className="btn btn-g"
                              onClick={handleSaveBusinessDraft}
                              disabled={isSavingBusiness}
                              title="Save without issuing (no O.R. / fee required)"
                              style={{ padding: '12px 24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', opacity: isSavingBusiness ? 0.6 : 1 }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                              </svg>
                              Save as Draft
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

                    {/* ── CONFIGURABLE QR VERIFICATION SETTINGS ── */}
                    <div className="card" style={{ marginTop: '20px', padding: '16px' }}>
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', listStyle: 'none' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                            <path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2v2h-2zM19 14h2v2h-2z" />
                          </svg>
                          Business Clearance QR Verification
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 10px',
                            borderRadius: '20px',
                            border: '1px solid var(--border)',
                            color: businessQrConfig.enabled ? 'var(--green)' : 'var(--muted)',
                          }}>
                            {businessQrConfig.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </summary>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '24px', marginTop: '16px', alignItems: 'start' }}>
                          {/* LEFT: CONFIG FIELDS */}
                          <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600, marginBottom: '16px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={qrConfigForm.enabled}
                                onChange={(e) => setQrConfigForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                              />
                              Print QR code on the Business Clearance (replaces seal placeholder)
                            </label>

                            <div className="fg" style={{ marginBottom: '12px' }}>
                              <label className="fl">Verification Base URL</label>
                              <input
                                type="text"
                                className="fc"
                                placeholder="e.g. 192.168.1.10:5173 or https://bustrachub.gov.ph"
                                value={qrConfigForm.baseUrl}
                                onChange={(e) => setQrConfigForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                                style={!qrBaseUrlValidation.ok ? { borderColor: 'var(--red)' } : undefined}
                              />
                              {!qrBaseUrlValidation.ok ? (
                                <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px', fontWeight: 600 }}>
                                  {qrBaseUrlValidation.error}
                                </div>
                              ) : (
                                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                                  Leave blank to use the current site domain. The QR opens <code>/verify?id=&lt;record id&gt;</code>.
                                </div>
                              )}
                            </div>

                            {/* RESOLVED LINK + DEVICE-REACHABILITY WARNING */}
                            <div style={{
                              fontSize: '11px',
                              padding: '10px 12px',
                              borderRadius: '8px',
                              marginBottom: '12px',
                              border: `1px solid ${qrPointsToLoopback ? 'var(--amber, #f59e0b)' : 'var(--border)'}`,
                              background: qrPointsToLoopback ? 'rgba(245, 158, 11, 0.08)' : 'var(--surface2)',
                            }}>
                              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Resolved verification link</div>
                              <div style={{ fontFamily: 'var(--mono, monospace)', wordBreak: 'break-all', color: 'var(--text)' }}>
                                {buildVerifyUrl(businessMasterlist?.[0]?._id || 'bus_clearance_0000000000000', qrConfigForm)}
                              </div>
                              {qrPointsToLoopback && (
                                <div style={{ marginTop: '8px', color: '#b45309', fontWeight: 600 }}>
                                  ⚠️ This links to <strong>localhost</strong>, so it will NOT open on a phone or another computer.
                                  {' '}For Wi-Fi testing set the base URL to this computer's LAN IP (e.g. <strong>192.168.1.10:5173</strong>),
                                  {' '}or use the deployed HTTPS domain in production.
                                </div>
                              )}
                            </div>

                            <div className="fg" style={{ marginBottom: '12px' }}>
                              <label className="fl">Caption Text</label>
                              <input
                                type="text"
                                className="fc"
                                value={qrConfigForm.label}
                                onChange={(e) => setQrConfigForm((prev) => ({ ...prev, label: e.target.value }))}
                              />
                            </div>

                            <div className="fg2" style={{ marginBottom: '12px' }}>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">QR Size (px)</label>
                                <input
                                  type="number"
                                  min="48"
                                  max="200"
                                  className="fc"
                                  value={qrConfigForm.size}
                                  onChange={(e) => setQrConfigForm((prev) => ({ ...prev, size: e.target.value }))}
                                />
                              </div>
                              <div className="fg" style={{ marginBottom: 0 }}>
                                <label className="fl">Error Correction Level</label>
                                <select
                                  className="fc"
                                  value={qrConfigForm.level}
                                  onChange={(e) => setQrConfigForm((prev) => ({ ...prev, level: e.target.value }))}
                                >
                                  <option value="L">L — Low (7%)</option>
                                  <option value="M">M — Medium (15%)</option>
                                  <option value="Q">Q — Quartile (25%)</option>
                                  <option value="H">H — High (30%)</option>
                                </select>
                              </div>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600, marginBottom: '16px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={qrConfigForm.includeMargin}
                                onChange={(e) => setQrConfigForm((prev) => ({ ...prev, includeMargin: e.target.checked }))}
                              />
                              Include quiet-zone margin
                            </label>

                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button
                                type="button"
                                className="btn btn-p"
                                disabled={isSavingQrConfig || !qrBaseUrlValidation.ok}
                                onClick={handleSaveQrConfig}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: isSavingQrConfig || !qrBaseUrlValidation.ok ? 0.6 : 1 }}
                              >
                                {isSavingQrConfig ? 'Saving…' : 'Save QR Settings'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-g"
                                onClick={() => setQrConfigForm(businessQrConfig)}
                                disabled={isSavingQrConfig}
                              >
                                Reset
                              </button>
                            </div>
                          </div>

                          {/* RIGHT: LIVE PREVIEW */}
                          <div style={{ textAlign: 'center', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', background: '#ffffff' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>PREVIEW</div>
                            {qrConfigForm.enabled ? (
                              <>
                                <QRCodeSVG
                                  value={buildVerifyUrl(businessMasterlist?.[0]?._id || 'sample-business-clearance', qrConfigForm)}
                                  size={Number(qrConfigForm.size) || 92}
                                  level={qrConfigForm.level || 'H'}
                                  includeMargin={Boolean(qrConfigForm.includeMargin)}
                                  bgColor="#ffffff"
                                  fgColor="#000000"
                                />
                                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#000', marginTop: '8px' }}>
                                  {qrConfigForm.label}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                                QR printing is disabled.
                              </div>
                            )}
                          </div>
                        </div>
                      </details>
                    </div>

                    {/* ── REGISTERED BUSINESS CLEARANCES TABLE ── */}
                    <div className="card" style={{ marginTop: '20px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                          Registered Business Clearances ({filteredBusinessClearances.length} of {businessMasterlist.length})
                        </h4>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                              <circle cx="11" cy="11" r="8" />
                              <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                              type="text"
                              className="fc"
                              placeholder="Search BC ID, business, owner..."
                              value={businessClearanceSearch}
                              onChange={(e) => setBusinessClearanceSearch(e.target.value)}
                              style={{ paddingLeft: '38px', height: '36px', fontSize: '12px', width: '100%' }}
                            />
                          </div>
                          <button type="button" className="btn btn-g" onClick={() => handleGenerateExcelReport('business_clearances')} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', fontSize: '12px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <path d="M7 10l5 5 5-5" />
                              <path d="M12 15V3" />
                            </svg>
                            Export Excel
                          </button>
                        </div>
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
                              <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
                              <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredBusinessClearances.length === 0 ? (
                              <tr>
                                <td colSpan="8" style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)' }}>
                                  {businessMasterlist.length === 0
                                    ? 'No business clearance records found in local database.'
                                    : 'No business clearances match your search.'}
                                </td>
                              </tr>
                            ) : (
                              pagedBusinessClearances.map((rec, index) => (
                                <tr key={rec._id || rec.id || `bus-${index}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '8px', fontWeight: 'bold' }}>{rec.bcIdNo || 'N/A'}</td>
                                  <td style={{ padding: '8px' }}>{rec.businessName || 'N/A'}</td>
                                  <td style={{ padding: '8px' }}>
                                    {rec.ownerName || `${rec.lastName || ''}, ${rec.firstName || ''}`.replace(/^,\s*/, '') || 'N/A'}
                                  </td>
                                  <td style={{ padding: '8px' }}>{rec.natureOfBusiness || 'N/A'}</td>
                                  <td style={{ padding: '8px' }}>{rec.regDate || rec.dateIssued || 'N/A'}</td>
                                  <td style={{ padding: '8px' }}>{rec.orNo || rec.orNumber || 'N/A'}</td>
                                  <td style={{ padding: '8px', textAlign: 'center' }}><StatusBadge doc={rec} /></td>
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
                      {/* Pagination */}
                      {filteredBusinessClearances.length > MASTERLIST_PAGE_SIZE && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 8px 0' }}>
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            Page {safeBusinessPage} of {totalBusinessPages}
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" className="btn btn-g" disabled={safeBusinessPage <= 1} onClick={() => setBusinessPage((p) => Math.max(1, p - 1))} style={{ padding: '6px 14px', fontSize: '12px' }}>Prev</button>
                            <button type="button" className="btn btn-g" disabled={safeBusinessPage >= totalBusinessPages} onClick={() => setBusinessPage((p) => Math.min(totalBusinessPages, p + 1))} style={{ padding: '6px 14px', fontSize: '12px' }}>Next</button>
                          </div>
                        </div>
                      )}
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
                            <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Program Title</label>
                            <input className="fc" required placeholder="e.g., Senior Citizen Cash Subsidy" value={newProgramTitle} onChange={(e) => setNewProgramTitle(e.target.value)} />
                          </div>
                          <div style={{ flex: 1, minWidth: '100px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Target Beneficiaries</label>
                            <input className="fc" type="number" required min="1" value={newProgramTarget} onChange={(e) => setNewProgramTarget(e.target.value)} />
                          </div>
                          <div style={{ flex: 1, minWidth: '120px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Initial Status</label>
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
                    <div className="tb" style={{ background: 'transparent', border: 'none', maxWidth: '1400px', margin: '0 auto 20px', gap: '10px', flexWrap: 'wrap', padding: '0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                      <div style={{ textAlign: 'center', padding: '40px',  background: 'var(--surface)', borderRadius: '8px', color: 'var(--muted)', border: '1px dashed rgba(79, 142, 247, 0.2)' }}>
                        Walang nakitang distribution programs na tumutugma sa iyong query o filter settings.
                      </div>
                    ) : (
                      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                        <div className="thc" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                          {processedPrograms.map((prog) => {
  // Count actual progress from aidLogs instead of prog.current
  const programLogs = (aidLogs || []).filter(
    (log) => log.programId === prog.id || log.programId === prog._id
  );
  const actualCurrent = programLogs.length;

  const percent = Math.min(100, Math.round((actualCurrent / prog.target) * 100)) || 0;
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
        <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>{prog.id}</div>

        {/* Ready-to-complete hint */}
        {readyToComplete && (
          <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Target reached — ready to mark Complete
          </div>
        )}

        {/* Progress Bar */}
        <div style={{ margin: '10px 0', background: 'var(--border2)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: readyToComplete ? 'var(--green)' : prog.status === 'Completed' ? 'var(--green)' : prog.status === 'Upcoming' ? 'var(--hint)' : '#3b82f6' }} />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{actualCurrent} / {prog.target} targets</span>
          <strong>{percent}%</strong>
        </div>
      </div>

      {/* Compact action row */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '16px', borderTop: '1px solid rgba(79, 142, 247, 0.2)', paddingTop: '12px', alignItems: 'center' }}>
        {prog.status === 'Active' && (
          <>
            <button className="btn btn-p btn-sm" onClick={() => { setSelectedProgramId(prog.id); nav('aid-encode'); }}>Encode</button>
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
            <div style={{ position: 'relative', marginLeft: 'auto', zIndex: 100 }}>
              {/* Kebab button */}
              <button
                data-kebab-btn
                className="btn btn-sm"
                style={{ background: 'var(--surface2)', color: 'var(--muted)', padding: '6px 10px', display: 'flex', alignItems: 'center', zIndex: 101 }}
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
                      width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent',
                      border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', gap: '8px', fontSize: '12px', transition: 'background 0.15s ease'
                    }}
                    onClick={() => { setEditingProgram(prog); setOpenActionMenu(null); }}
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
                        width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent',
                        border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', gap: '8px', fontSize: '12px', transition: 'background 0.15s ease'
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
                      width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent',
                      border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', gap: '8px', fontSize: '12px', transition: 'background 0.15s ease'
                    }}
                    onClick={async () => {
                      const updated = programsList.map(p =>
                        p.id === prog.id ? { ...p, status: 'Archived' } : p
                      );
                      setProgramsList(updated);
                      setOpenActionMenu(null);

                      try {
                        const docId = `program_${prog.id}`;
                        const existing = await db.get(docId);
                        const cleanDoc = { ...existing };
                        delete cleanDoc.current;
                        await db.put({
                          ...cleanDoc,
                          status: 'Archived',
                          updatedAt: new Date().toISOString(),
                        });
                      } catch (err) {
                        console.error('Failed to archive program in PouchDB:', err);
                      }

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
  <div className="screen active" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
    
    {/* ── 1. GLOBAL ALERTS (Success & Batch Mode) ── */}
    {successMessage && (
      <div className="note note-s" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
        {successMessage}
      </div>
    )}

    {selectedResidents.length > 0 && (
      <div className="note note-i" style={{ marginBottom: '20px', padding: '16px', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <strong>Batch Mode Active:</strong> {selectedResidents.length} residents queued.
          </div>
          <button className="btn btn-g btn-sm" onClick={() => setSelectedResidents([])} style={{ color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            Cancel Batch
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '8px 12px', background: 'var(--surface)', borderRadius: '6px', fontFamily: 'var(--mono)', maxHeight: '50px', overflowY: 'auto' }}>
          {residentsList.filter(r => selectedResidents.includes(r.id)).map(r => r.name).join(' • ')}
        </div>
      </div>
    )}

    {/* ── 2. CONTEXT HEADER (Currently Encoding For) ── */}
    {(() => {
  const currentProg = programsList.find(p => p.id === selectedProgramId);
  if (!currentProg) return null;
  const actualCurrent = aidLogs.filter(log => log.programId === currentProg.id).length;
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Currently Encoding For</div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>{currentProg.title}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Progress</div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary)' }}>
          {actualCurrent} / {currentProg.target}
        </div>
      </div>
    </div>
  );
})()}

    {/* ── 3. MAIN GRID LAYOUT (Form Left, Logs Right) ── */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px', alignItems: 'start' }}>
      
      {/* LEFT PANEL: Distribution Entry Form */}
      <div className="card" style={{ padding: '24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <form onSubmit={(e) => { e.preventDefault(); handleEncodeSubmit(); }}>
          {/* Relief Program */}
          <div className="fg" style={{ marginBottom: '16px' }}>
            <label className="fl">Relief Program <span style={{ color: 'var(--red)' }}>*</span></label>
            <select 
              className="fc" 
              value={selectedProgramId} 
              style={{ border: (formAttempted && !selectedProgramId) ? '1px solid var(--red)' : undefined, height: '42px' }}
              onChange={(e) => {
                const progId = e.target.value;
                setSelectedProgramId(progId);
                const foundProg = programsList.find((p) => p.id === progId);
                if (foundProg) setAidType(foundProg.title.includes('Rice') ? 'Rice — 5kg Pack' : 'Financial / Cash Aid');
              }}
            >
              <option value="" disabled hidden>Select active relief program...</option>
              {programsList.filter((prog) => prog.status === 'Active').map((prog) => {
                const actualCurrent = aidLogs.filter(log => log.programId === prog.id).length;
                const isFull = actualCurrent >= (prog.target || 1);
                return (
                  <option key={prog.id} value={prog.id} disabled={isFull}>
                    {prog.title} ({prog.id}) — {actualCurrent}/{prog.target} {isFull ? '• FULL' : ''}
                  </option>
                );
              })}
            </select>
            {formAttempted && !selectedProgramId && <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>Please select a relief program.</div>}
          </div>

          {/* Beneficiary Resident */}
          <div className="fg" style={{ marginBottom: '16px' }}>
            <label className="fl">Beneficiary Resident <span style={{ color: 'var(--red)' }}>*</span></label>
            <ResidentCombobox 
  residents={residentsList} 
  value={selectedResidentId} 
  onChange={(res) => {
    const id = res?.id || res?._id || res || '';
    setSelectedResidentId(id);
  }} 
  placeholder="Search by name, ID, or purok..." 
/>
            {/* ✅ FIX: Duplicate Alert moved here for immediate feedback! */}
            {selectedResidentId && duplicateAlert && (
              <div className="note note-e" style={{ marginTop: '8px', padding: '8px 12px', fontSize: '12px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                {duplicateAlert}
              </div>
            )}
            {selectedResidentId && !duplicateAlert && (
              <div className="note note-s" style={{ marginTop: '8px', padding: '8px 12px', fontSize: '12px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                Valid: Resident not yet recorded under this program.
              </div>
            )}
          </div>

          {/* Aid Type & Quantity Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div className="fg">
              <label className="fl">Aid Type <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="text" className="fc" value={aidType} onChange={(e) => setAidType(e.target.value)} placeholder="e.g., Rice — 5kg" style={{ height: '42px' }} />
            </div>
            <div className="fg">
              <label className="fl">Qty <span style={{ color: 'var(--red)' }}>*</span></label>
              <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface2)', height: '42px' }}>
                <button type="button" onClick={() => setQuantity(prev => Math.max(1, (Number(prev) || 1) - 1))} className="btn btn-g" style={{ borderRadius: 0, border: 'none', borderRight: '1px solid var(--border)', padding: '0 12px' }}>−</button>
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="fc" style={{ textAlign: 'center', border: 'none', background: 'transparent', boxShadow: 'none', padding: 0, MozAppearance: 'textfield' }} />
                <button type="button" onClick={() => setQuantity(prev => (Number(prev) || 0) + 1)} className="btn btn-g" style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--border)', padding: '0 12px' }}>+</button>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="fg" style={{ marginBottom: '20px' }}>
            <label className="fl">Remarks (Optional)</label>
            <textarea className="fc" placeholder="Any special notes..." value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} style={{ resize: 'none' }} />
          </div>

          {/* Submit Button */}
          <button type="submit" className="btn btn-p" disabled={!selectedProgramId || !selectedResidentId} style={{ width: '100%', height: '44px', justifyContent: 'center', fontWeight: 700, fontSize: '14px', opacity: (!selectedProgramId || !selectedResidentId) ? 0.6 : 1, cursor: (!selectedProgramId || !selectedResidentId) ? 'not-allowed' : 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Entry to Log
          </button>
        </form>
      </div>

      {/* RIGHT PANEL: Recent Session Activity */}
      <div className="card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 140px)' }}>
        <div style={{ padding: '16px 20px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Recent Session Activity</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Real-time encoding logs</div>
          </div>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 10 }}>
              <tr>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Resident</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Aid</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {aidLogs.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span>No logs recorded yet for this session.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                aidLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>{log.residentName}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>{log.aid}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span className={`badge ${log.status === 'OK' ? 'g' : log.status === 'Synced' ? 't' : 'r'}`} style={{ fontSize: '11px', padding: '4px 8px' }}>
                        {log.status === 'OK' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>}
                        {log.status === 'Synced' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                        {log.status === 'Error' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>}
                        {log.status}
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
                            <td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
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
                              max={new Date().toISOString().split('T')[0]} 
                              value={blotterForm.date} 
                              onChange={(e) => setBlotterForm({ ...blotterForm, date: e.target.value })} 
                            />
                          </div>
                          <div className="fg">
                          <label className="fl">
                            Time of Incident <span style={{ color: 'var(--red)' }}>*</span>
                          </label>
                          <input 
                            className="fc" 
                            type="time" 
                            step="60" 
                            required 
                            value={blotterForm.time} 
                            onChange={(e) => setBlotterForm({ ...blotterForm, time: e.target.value })}
                            title="Click the dropdown or use Up/Down arrow keys to set time"
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
                                min={new Date().toISOString().split('T')[0]}
                                value={blotterForm.nextHearingDate}
                                onChange={(e) =>
                                  setBlotterForm({
                                    ...blotterForm,
                                    nextHearingDate: e.target.value
                                  })
                                }
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
                        <div className="fa" style={{ display: 'flex', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border2)', paddingTop: '16px' }}>
                          <button 
                            type="button" 
                            className="btn btn-p" 
                            onClick={handleSaveBlotter} 
                            style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', cursor: 'pointer' }}
                          >
                            Save Blotter Case Record
                          </button>
                          <button type="button" className="btn" onClick={handleClearBlotterForm} style={{ flex: 1, background: 'var(--surface2)', color: 'var(--text)', borderRadius: '6px' }}>
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
                      <div className="filter-bar">
                        <div className="filter-bar__filters">
                          <div className="filter-bar__search">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8" />
                              <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                              type="text"
                              placeholder="Search case #, complainant, respondent…"
                              value={blotterSearch}
                              onChange={(e) => setBlotterSearch(e.target.value)}
                            />
                          </div>

                          <select
                            className="filter-select"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                          >
                            <option value="All Types">All Types</option>
                            <option value="Noise Complaint">Noise Complaint</option>
                            <option value="Physical Altercation">Physical Altercation</option>
                            <option value="Property Dispute">Property Dispute</option>
                            <option value="Domestic Concern">Domestic Concern</option>
                            <option value="Theft">Theft</option>
                            <option value="Other">Other</option>
                          </select>

                          <select
                            className="filter-select"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                          >
                            <option value="All Status">All Status</option>
                            <option value="Pending">Pending</option>
                            <option value="Open">Open</option>
                            <option value="Under Mediation">Under Mediation / Summons</option>
                            <option value="Resolved">Resolved / Settled</option>
                            <option value="Referred to Higher Authority">Referred / CFA</option>
                          </select>

                          <div className="filter-bar__dates">
                            <label>From</label>
                            <input
                              type="date"
                              value={dateFrom}
                              onChange={(e) => setDateFrom(e.target.value)}
                              title="From Date"
                            />
                            <label>To</label>
                            <input
                              type="date"
                              value={dateTo}
                              onChange={(e) => setDateTo(e.target.value)}
                              title="To Date"
                            />
                          </div>

                          <label className={`filter-bar__chip ${filterVawc ? 'is-active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={filterVawc}
                              onChange={(e) => setFilterVawc(e.target.checked)}
                            />
                            <span>VAWC Only</span>
                          </label>

                          {(blotterSearch || filterType !== 'All Types' || filterStatus !== 'All Status' || dateFrom || dateTo || filterVawc) && (
                            <button
                              type="button"
                              className="filter-bar__reset"
                              onClick={() => {
                                setBlotterSearch('');
                                setFilterType('All Types');
                                setFilterStatus('All Status');
                                setDateFrom('');
                                setDateTo('');
                                setFilterVawc(false);
                              }}
                              title="Clear all filters"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                              Clear
                            </button>
                          )}
                        </div>

                        <div className="filter-bar__actions">
                          <button type="button" className="btn btn-g" onClick={handleExportBlotterToExcel} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9V2h12v7" />
                              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <path d="M6 14h12v8H6z" />
                            </svg>
                            Print
                          </button>

                          <button
                            type="button"
                            className="btn btn-p"
                            onClick={() => nav('blotter-new')}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            File New Entry
                          </button>
                        </div>
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
                            {isBlottersLoading ? (
                              <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                    <span className="spinner" style={{ width: '24px', height: '24px', borderWidth: '3px' }} />
                                    <span>Loading blotter records from local database...</span>
                                  </div>
                                </td>
                              </tr>
                            ) : filteredBlotters.length === 0 ? (
                              <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
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
                              const isVawc = b.isVawc || b.type === 'VAWC' || b.incidentType?.includes('VAWC') || b.isVAWC === true;

                              return (
                                <tr key={b._id || b.id}>
                                  <td style={mono10}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {b.id || b.trackingNo || b.refNumber || b._id}
                                      {b.attachments && b.attachments.length > 0 && (
                                        <span
                                          title={`${b.attachments.length} attachment(s) attached`}
                                          style={{
                                            background: 'var(--amber-bg)',
                                            color: 'var(--amber)',
                                            borderRadius: '4px',
                                            padding: '2px 4px',
                                            fontSize: '10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '2px'
                                          }}
                                        >
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                          </svg>
                                          {b.attachments.length}
                                        </span>
                                      )}
                                    </div>
                                  </td>
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
                                          {!isVawc && (
                                            <>
                                              {currentSummon === 0 && (
                                                <button className="btn btn-primary btn-sm" onClick={() => handleBlotterAction(b._id || b.id, '1st_summon')}>
                                                  1st Summon
                                                </button>
                                              )}
                                              {currentSummon === 1 && (
                                                <button className="btn btn-warning btn-sm" onClick={() => handleBlotterAction(b._id || b.id, '2nd_summon')}>
                                                  2nd Summon
                                                </button>
                                              )}
                                              {currentSummon === 2 && (
                                                <button className="btn btn-warning btn-sm" onClick={() => handleBlotterAction(b._id || b.id, '3rd_summon')}>
                                                  3rd Summon
                                                </button>
                                              )}
                                              <button className="btn btn-success btn-sm" onClick={() => handleBlotterAction(b._id || b.id, 'settled')}>
                                                Settled
                                              </button>
                                              {currentSummon >= 3 && (
                                                <button className="btn btn-danger btn-sm" onClick={() => handleBlotterAction(b._id || b.id, 'escalate_cfa')}>
                                                  Escalate / Issue CFA
                                                </button>
                                              )}
                                            </>
                                          )}

                                          {isVawc && (
                                            <>
                                              <button
                                                className="btn btn-danger btn-sm"
                                                style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed' }}
                                                onClick={() => handleBlotterAction(b._id || b.id, 'issue_bpo')}
                                              >
                                                Issue BPO
                                              </button>
                                              <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleBlotterAction(b._id || b.id, 'refer_pnp')}
                                              >
                                                Refer to PNP
                                              </button>
                                            </>
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
  
  const getPartyName = (partyData, fallbackName) => {
    if (typeof partyData === 'object' && partyData !== null) {
      return partyData.name || partyData.fullName || fallbackName || '';
    }
    if (typeof partyData === 'string' && partyData.trim() !== '') {
      return partyData;
    }
    return fallbackName || 'N/A';
  };

  const getPartyId = (partyData, fallbackId) => {
    if (typeof partyData === 'object' && partyData !== null) {
      return partyData.id || partyData.residentId || fallbackId || 'Registered Resident';
    }
    return fallbackId || 'Registered Resident';
  };

  const complainantDisplayName = getPartyName(currentCase.complainant, currentCase.complainantName || currentCase.compName);
  const respondentDisplayName = getPartyName(currentCase.respondent, currentCase.respondentName || currentCase.respName);
  const caseNarrative = currentCase.narrative || currentCase.statement || currentCase.details || 'No narrative provided.';
  
  const caseHistory = Array.isArray(currentCase.history) ? currentCase.history : [];

  return (
    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* ═══ HEADER: Case Status & Quick Actions ═══ */}
      <div className="fp" style={{ padding: '20px', background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Case Tracking Number
            </div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
              {currentCase.trackingNo || currentCase.caseNum || currentCase._id || 'N/A'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {getStatusBadge(currentCase?.status || 'Open')}
            <button
              type="button"
              className="btn btn-g"
              onClick={() => nav('blotter-manage')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              Back to List
            </button>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Date Filed</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>
              {currentCase.dateFiled || currentCase.date || 'N/A'}
            </div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Incident Type</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>
              {currentCase.incidentType || currentCase.type || 'N/A'}
            </div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Summons Issued</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--amber)' }}>
              {currentCase.summonCount || 0} / 3
            </div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Location</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>
              {currentCase.location || 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PARTIES INVOLVED ═══ */}
      <div className="fp" style={{ padding: '20px' }}>
        <div className="fp-t" style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid var(--border)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Parties Involved
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Complainant */}
          <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '700' }}>
              Complainant (Nagrereklamo)
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>
              {complainantDisplayName}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              ID: <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{getPartyId(currentCase.complainant, currentCase.compID)}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
              Status: {currentCase.complainant?.isNonResident ? 'External Party' : 'Verified Resident'}
            </div>
          </div>

          {/* Respondent */}
          <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '700' }}>
              Respondent (Inirereklamo)
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>
              {respondentDisplayName}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              ID: <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{getPartyId(currentCase.respondent, currentCase.respID)}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
              Status: {currentCase.respondent?.isNonResident ? 'External Party' : 'Verified Resident'}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ INCIDENT NARRATIVE ═══ */}
      <div className="fp" style={{ padding: '20px' }}>
        <div className="fp-t" style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid var(--border)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Incident Narrative
        </div>
        <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', lineHeight: '1.6', color: 'var(--text)' }}>
          {caseNarrative}
        </div>
      </div>
      
      {/* ═══ EVIDENCE & ATTACHMENTS ═══ */}
      {currentCase.attachments && currentCase.attachments.length > 0 && (
        <div className="fp" style={{ padding: '20px' }}>
          <div className="fp-t" style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid var(--border)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            Submitted Evidence & Attachments ({currentCase.attachments.length})
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
            {currentCase.attachments.map((att) => {
              const isImage = att.type?.startsWith('image/');
              const isVideo = att.type?.startsWith('video/');
              const isPdf = att.type === 'application/pdf';

              return (
                <div key={att.id} style={{ background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Preview Area */}
                  <div style={{ height: '140px', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {isImage && att.data ? (
                      <img src={att.data} alt={att.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : isVideo ? (
                      <div style={{ color: 'var(--muted)', textAlign: 'center' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        <div style={{ fontSize: '10px', marginTop: '4px' }}>Video File</div>
                      </div>
                    ) : isPdf ? (
                      <div style={{ color: '#ef4444', textAlign: 'center' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                        <div style={{ fontSize: '10px', marginTop: '4px' }}>PDF Document</div>
      </div>
                    ) : (
                      <div style={{ color: 'var(--muted)', textAlign: 'center' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                      </div>
                    )}
                  </div>
                  
                  {/* File Info & Action Area */}
                  <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px', wordBreak: 'break-word' }}>
                        {att.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Size: {att.size}
                      </div>
                    </div>
                    
                    {/* Download / View Button */}
                    <button 
                      onClick={() => {
                        // 1. Convert Base64 to Blob
                        const fetchImage = async () => {
                          const res = await fetch(att.data);
                          const blob = await res.blob();
                          const blobUrl = URL.createObjectURL(blob);
                          
                          // 2. Open in new tab using the safe Blob URL
                          window.open(blobUrl, '_blank');
                          
                          // 3. Clean up memory after a short delay
                          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                        };
                        fetchImage();
                      }} 
                      style={{ 
                        marginTop: '10px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '6px', 
                        padding: '8px', 
                        background: 'var(--primary)', 
                        color: '#fff', 
                        borderRadius: '6px', 
                        fontSize: '12px', 
                        fontWeight: 600, 
                        border: 'none', 
                        cursor: 'pointer', 
                        transition: 'opacity 0.2s' 
                      }} 
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'} 
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      View Full Size
                    </button>
                  </div>
                  </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ CASE ACTION PANEL ═══ */}
      <div className="fp" style={{ padding: '20px', background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)', border: '2px solid var(--border)' }}>
        <div className="fp-t" style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid var(--border)', fontSize: '16px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="M4.93 4.93l2.83 2.83" />
            <path d="M16.24 16.24l2.83 2.83" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
          </svg>
          Case Resolution Actions
        </div>
        
        {/* Summons & Hearing Panel */}
        <SummonsPanel
          currentCase={currentCase}
          db={db}
          setBlotterList={setBlotterList}
        />
        
        {/* Status Actions */}
        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
          <CaseStatusActions currentCase={currentCase} db={db} setBlotterList={setBlotterList} />
        </div>
      </div>

      {/* ═══ CASE HISTORY TIMELINE ═══ */}
      {caseHistory.length > 0 && (
        <div className="fp" style={{ padding: '20px' }}>
          <div className="fp-t" style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid var(--border)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Case History Timeline ({caseHistory.length} actions)
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {caseHistory.slice().reverse().map((action, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '12px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div style={{ flex: '1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)' }}>
                      {action.status}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                      {new Date(action.date).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {action.notes && (
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', lineHeight: '1.5' }}>
                      {action.notes}
                    </div>
                  )}
                  {action.scheduleDate && (
                    <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px' }}>
                      📅 Scheduled: {new Date(action.scheduleDate).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                    Performed by: {action.performedBy || 'Admin'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
})()}
            
            {/* ════════════════════════════════════════
                SCREEN: ANNOUNCEMENTS
                ════════════════════════════════════════ */}
                {screen === 'announcements' && (
                  <div className="screen active">
                    {announcementSubScreen === 'list' && (
                      <div>
                        <div className="ann-toolbar">
                          <div className="ann-toolbar__stats">
                            <span className="ann-stat-chip">
                              <span className="ann-stat-chip__value">{(announcementsList || []).length}</span>
                              <span className="ann-stat-chip__label">Total</span>
                            </span>
                            <span className="ann-stat-chip ann-stat-chip--green">
                              <span className="ann-stat-chip__value">
                                {(announcementsList || []).filter((a) => (a.status || 'Draft') === 'Published').length}
                              </span>
                              <span className="ann-stat-chip__label">Published</span>
                            </span>
                            <span className="ann-stat-chip ann-stat-chip--amber">
                              <span className="ann-stat-chip__value">
                                {(announcementsList || []).filter((a) => (a.status || 'Draft') === 'Draft').length}
                              </span>
                              <span className="ann-stat-chip__label">Drafts</span>
                            </span>
                            {(announcementsList || []).filter((a) => a.pinned).length > 0 && (
                              <span className="ann-stat-chip ann-stat-chip--accent">
                                <span className="ann-stat-chip__value">
                                  {(announcementsList || []).filter((a) => a.pinned).length}
                                </span>
                                <span className="ann-stat-chip__label">Pinned</span>
                              </span>
                            )}
                          </div>
                          <div className="ann-toolbar__actions">
                            <button
                              type="button"
                              className="btn btn-p"
                              onClick={handleOpenNewAnnouncement}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                              </svg>
                              New Announcement
                            </button>
                          </div>
                        </div>

                        {/* ── 2️⃣ FILTER BAR: Search + Category + Status + Clear ── */}
                        <div className="ann-filter-bar">
                          <div className="ann-filter-bar__search">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8" />
                              <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                              type="text"
                              placeholder="Search by title or content…"
                              value={searchAnnQuery}
                              onChange={(e) => setSearchAnnQuery(e.target.value)}
                            />
                          </div>
                          <select className="filter-select" value={filterAnnCategory} onChange={(e) => setFilterAnnCategory(e.target.value)}>
                            <option value="All">All Categories</option>
                            <option value="General">General</option>
                            <option value="Health">Health</option>
                            <option value="Security">Security</option>
                            <option value="Relief & Aid">Relief & Aid</option>
                            <option value="Disaster Response">Disaster Response</option>
                            <option value="Events">Events</option>
                            <option value="Activities">Activities</option>
                            <option value="Governance">Governance</option>
                          </select>
                          <select className="filter-select" value={filterAnnStatus} onChange={(e) => setFilterAnnStatus(e.target.value)}>
                            <option value="All">All Statuses</option>
                            <option value="Published">Published</option>
                            <option value="Draft">Drafts</option>
                          </select>
                          {(searchAnnQuery || filterAnnCategory !== 'All' || filterAnnStatus !== 'All') && (
                            <button
                              type="button"
                              className="filter-bar__reset"
                              onClick={() => {
                                setSearchAnnQuery('');
                                setFilterAnnCategory('All');
                                setFilterAnnStatus('All');
                              }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                              Clear
                            </button>
                          )}
                        </div>

                        {/* ── 3️⃣ ANNOUNCEMENT CARDS LIST ── */}
                        <div className="ann-list">
                          {filteredAnnouncements.length === 0 ? (
                            <div className="ann-empty">
                              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 11l19-9-9 19-2-8-8-2z" />
                              </svg>
                              <div className="ann-empty__title">
                                {hasNoAnnouncementsAtAll ? 'No announcements yet' : 'No announcements match your filters'}
                              </div>
                              <div className="ann-empty__hint">
                                {hasNoAnnouncementsAtAll ? (
                                  <>Click <strong>New Announcement</strong> to publish your first notice.</>
                                ) : (
                                  <>Try adjusting your search or filters to find what you are looking for.</>
                                )}
                              </div>
                            </div>
                          ) : (
                            filteredAnnouncements.map((ann) => (
                              <article key={ann._id || ann.id} className={`ann-card ${ann.pinned ? 'ann-card--pinned' : ''}`}>
                                <div className="ann-card__body">
                                  <header className="ann-card__meta">
                                    {ann.pinned && (
                                      <span className="ann-card__pin">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                                        </svg>
                                        Pinned
                                      </span>
                                    )}
                                    <span className="ann-card__category">{ann.category}</span>
                                    <span className={`badge ${ann.status === 'Published' ? 'g' : 'a'}`}>
                                      {ann.status || 'Draft'}
                                    </span>
                                  </header>
                                  <h3 className="ann-card__title">{ann.title}</h3>
                                  <p className="ann-card__content">{ann.content || ann.body}</p>
                                  <footer className="ann-card__footer">
                                    <span className="ann-card__author">
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="8" r="4" />
                                        <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
                                      </svg>
                                      {ann.author || 'Administrator'}
                                      {ann.date && <span className="ann-card__dot">·</span>}
                                      {ann.date && <span>{ann.date}</span>}
                                    </span>
                                  </footer>
                                </div>
                                <div className="ann-card__actions">
                                  <button
                                    type="button"
                                    className="btn btn-g btn-sm"
                                    onClick={() => handleTogglePinAnnouncement(ann._id || ann.id)}
                                    title={ann.pinned ? 'Unpin announcement' : 'Pin to top'}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M12 17v5" />
                                      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                                    </svg>
                                    {ann.pinned ? 'Unpin' : 'Pin'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-g btn-sm"
                                    onClick={() => handleOpenEditAnnouncement(ann)}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M12 20h9" />
                                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                    </svg>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-d btn-sm"
                                    onClick={() => handleTriggerDeleteAnnouncement(ann._id || ann.id, ann.title)}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                      <path d="M10 11v6M14 11v6" />
                                    </svg>
                                    Delete
                                  </button>
                                </div>
                              </article>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════ CREATE / EDIT FORM ═══════════════════════════════════════════════════════════ */}
                    {(announcementSubScreen === 'new' || announcementSubScreen === 'edit') && (
                  <div
                    className="ann-form-wrap"
                    key={announcementForm?._id || announcementForm?.id || 'new-announcement'}
                  >
                    {/* ── Form Header ── */}
                    <div className="ann-form-header">
                      <div className="ann-form-header__left">
                        <div className="ann-form-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 11l19-9-9 19-2-8-8-2z" />
                          </svg>
                        </div>
                        <div className="ann-form-titles">
                          <h2 className="ann-form-title">
                            {announcementSubScreen === 'new' ? 'Create Announcement' : 'Edit Announcement'}
                          </h2>
                          <p className="ann-form-subtitle">
                            {announcementSubScreen === 'new'
                              ? 'I-publish ang bagong notice sa barangay bulletin.'
                              : 'I-update ang nilalaman ng existing announcement.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-g btn-sm"
                        onClick={handleCancelOrBackAnnouncement}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="15 18 9 12 15 6" />
                        </svg>
                        Back
                      </button>
                    </div>

                    {/* ── Form Body ── */}
                    <form
                      onSubmit={(e) => handleSaveAnnouncement(e, 'Published')}
                      className="ann-form"
                    >
                      {/* Hidden fields for edit mode tracking */}
                      {(announcementForm._id || announcementForm.id) && (
                        <input type="hidden" value={announcementForm._id || announcementForm.id} readOnly />
                      )}

                      {/* Section: Content */}
                      <div className="ann-form-section">
                        <div className="ann-form-section__label">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 7h16M4 12h16M4 17h10" />
                          </svg>
                          Content
                        </div>

                        {/* Title */}
                        <div className="ann-form-field">
                          <div className="ann-form-field__header">
                            <label className="ann-form-label" htmlFor="ann-title">
                              Title <span className="ann-form-req">*</span>
                            </label>
                            <span className={`ann-form-counter ${(announcementForm.title || '').length >= 110 ? 'is-near-limit' : ''}`}>
                              {(announcementForm.title || '').length}/120
                            </span>
                          </div>
                          <input
                            id="ann-title"
                            name="title"
                            className="fc"
                            required
                            autoFocus
                            maxLength={120}
                            placeholder="e.g. Barangay Assembly sa Oktubre 15"
                            value={announcementForm.title || ''}
                            onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                          />
                        </div>

                        {/* Content */}
                        <div className="ann-form-field">
                          <div className="ann-form-field__header">
                            <label className="ann-form-label" htmlFor="ann-content">
                              Content <span className="ann-form-req">*</span>
                            </label>
                            <span className={`ann-form-counter ${(announcementForm.content || announcementForm.body || '').length >= 1800 ? 'is-near-limit' : ''}`}>
                              {(announcementForm.content || announcementForm.body || '').length}/2000
                            </span>
                          </div>
                          <textarea
                            id="ann-content"
                            name="content"
                            className="fc ann-form-textarea"
                            required
                            maxLength={2000}
                            rows={8}
                            placeholder="Isulat ang buong detalye ng announcement dito…"
                            value={announcementForm.content || announcementForm.body || ''}
                            onChange={(e) =>
                              setAnnouncementForm({
                                ...announcementForm,
                                content: e.target.value,
                                body: e.target.value
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="ann-form-divider" />

                      {/* Section: Settings */}
                      <div className="ann-form-section">
                        <div className="ann-form-section__label">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                          Settings
                        </div>

                        <div className="ann-form-grid">
                          {/* Category */}
                          <div className="ann-form-field">
                            <label className="ann-form-label" htmlFor="ann-category">Category</label>
                            <select
                              id="ann-category"
                              name="category"
                              className="fc"
                              value={announcementForm.category || 'General'}
                              onChange={(e) => setAnnouncementForm({ ...announcementForm, category: e.target.value })}
                            >
                              <option value="General">General</option>
                              <option value="Health">Health</option>
                              <option value="Security">Security</option>
                              <option value="Relief & Aid">Relief & Aid</option>
                              <option value="Disaster Response">Disaster Response</option>
                              <option value="Events">Events</option>
                              <option value="Activities">Activities</option>
                              <option value="Governance">Governance</option>
                            </select>
                          </div>

                          {/* Pin toggle */}
                          <div className="ann-form-field">
                            <label className="ann-form-label">Publishing Options</label>
                            <label className={`ann-pin-toggle ${announcementForm.pinned ? 'is-active' : ''}`}>
                              <input
                                type="checkbox"
                                checked={announcementForm.pinned || false}
                                onChange={(e) =>
                                  setAnnouncementForm({ ...announcementForm, pinned: e.target.checked })
                                }
                              />
                              <span className="ann-pin-toggle__box">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                              <span className="ann-pin-toggle__content">
                                <span className="ann-pin-toggle__title">Pin to top</span>
                                <span className="ann-pin-toggle__hint">Always show at the top of the list</span>
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="ann-form-divider" />

                      {/* ── Action Bar ── */}
                      <div className="ann-form-actions">
                        <div className="ann-form-actions__left">
                          <div className="ann-form-actions__hint">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 16v-4M12 8h.01" />
                            </svg>
                            <span>
                              <span className="ann-form-req">*</span> Required fields
                            </span>
                          </div>
                        </div>
                        <div className="ann-form-actions__right">
                          <button
                            type="button"
                            className="btn btn-g"
                            disabled={isSavingAnnouncement}
                            onClick={handleCancelOrBackAnnouncement}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-a"
                            disabled={isSavingAnnouncement}
                            onClick={(e) => handleSaveAnnouncement(e, 'Draft')}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                              <polyline points="17 21 17 13 7 13 7 21" />
                              <polyline points="7 3 7 8 15 8" />
                            </svg>
                            {announcementSubScreen === 'edit' && announcementForm.status === 'Published'
                              ? 'Move to Draft'
                              : 'Save as Draft'}
                          </button>
                          <button
                            type="submit"
                            className="btn btn-p"
                            disabled={isSavingAnnouncement}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="22" y1="2" x2="11" y2="13" />
                              <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                            {isSavingAnnouncement
                              ? 'Saving…'
                              : announcementSubScreen === 'new' || announcementForm.status === 'Draft'
                                ? 'Publish Announcement'
                                : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    </form>
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

                     <div className="card" style={{
                        padding: 18,
                        marginBottom: 16,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 14
                      }}>
                        <div style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'var(--text)',
                          marginBottom: 14,
                          borderBottom: '1px solid var(--border)',
                          paddingBottom: 8
                        }}>
                          Notification Preferences
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <button
                            type="button"
                            className="btn btn-g"
                            onClick={requestNotificationPermission}
                            style={{
                              width: '100%',
                              padding: '12px 14px',
                              borderRadius: 8,
                              textAlign: 'left',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                              </svg>
                              <span>
                                {typeof Notification !== 'undefined' && Notification.permission === 'granted'
                                  ? 'Desktop Notifications: Enabled'
                                  : 'Enable Desktop Notifications'}
                              </span>
                            </span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>

                          <div style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            lineHeight: 1.5,
                            paddingLeft: 4
                          }}>
                            Makakatanggap ka ng real-time alerts para sa bagong certificates, blotter updates, at announcements.
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
                          onClick={() => showToast("Feature coming soon: Change Password", 'info')} 
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
                              logout();
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
                
                {screen === 'events-manage' && (
  <EventsManagerScreen
    db={db}
    role={role}
    currentUser={currentUser}
    showToast={showToast}
    createAuditLog={createAuditLog}
    notifyDesktop={notifyDesktop}
    residentsList={residentsList}
  />
)}
            {/* ════════════════════════════════════════
                SCREEN: CONFLICT RESOLUTION (Admin only)
                ════════════════════════════════════════ */}
                {role === 'admin' && screen === 'conflicts' && (
                  <div className="screen active certificate-lifecycle-screen" style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
                    
                    {/* 1. HEADER & BULK ACTION */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                          {conflictsList.length} conflict(s) detected. Review and choose the correct version.
                        </p>
                      </div>
                      {conflictsList.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-d"
                          onClick={handleResolveAllConflicts}
                          disabled={loadingConflicts}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: loadingConflicts ? 0.6 : 1 }}
                        >
                          {loadingConflicts ? 'Resolving...' : '🧹 Resolve All (Keep Local Version)'}
                        </button>
                      )}
                    </div>

                    {conflictsList.length === 0 ? (
                      <div className="cert-section-card" style={{ padding: '40px', textAlign: 'center' }}>
                        <p style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 600, margin: 0 }}>All synced seamlessly!</p>
                        <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>No conflicting revisions detected in the local database.</p>
                      </div>
                    ) : (
                      <>
                        {/* 2. SEARCH BAR */}
                        <div className="sb-box" style={{ marginBottom: '16px', maxWidth: '400px' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                          </svg>
                          <input 
                            placeholder="Search by Resident Name or Document ID..." 
                            value={conflictSearch}
                            onChange={(e) => { setConflictSearch(e.target.value); setConflictPage(1); }} // Reset to page 1 on search
                          />
                        </div>

                        {/* 3. FILTERED & PAGINATED LIST */}
                        {(() => {
                          // Filter first
                          const filtered = conflictsList.filter(item => 
                            (item.residentName || '').toLowerCase().includes(conflictSearch.toLowerCase()) ||
                            (item.docId || '').toLowerCase().includes(conflictSearch.toLowerCase())
                          );

                          // Then paginate
                          const totalPages = Math.ceil(filtered.length / conflictsPerPage);
                          const startIndex = (conflictPage - 1) * conflictsPerPage;
                          const paginatedConflicts = filtered.slice(startIndex, startIndex + conflictsPerPage);

                          return (
                            <>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {paginatedConflicts.map((item, index) => (
                                  <div key={item.id || `${item.docId}-${item.conflictRev}`} className="cert-section-card" style={{ border: '1px solid rgba(248, 113, 113, 0.4)', padding: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                      <div>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3L2.5 20h19L12 3z" /><path d="M12 9v5" /><path d="M12 17h.01" /></svg>
                                          {item.residentName || 'Unknown Document'}
                                        </h3>
                                        <p style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)', margin: '4px 0 0' }}>ID: {item.docId || 'N/A'}</p>
                                      </div>
                                    </div>

                                    {/* Compact Comparison */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--surface2)', padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
                                      <div>
                                        <strong style={{ color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>Version A (Local/Winning)</strong>
                                        <span style={{ color: 'var(--text)' }}>Purok: {item.docA?.purok || 'N/A'}</span>
                                      </div>
                                      <div>
                                        <strong style={{ color: 'var(--amber)', display: 'block', marginBottom: '4px' }}>Version B (Conflicting)</strong>
                                        <span style={{ color: 'var(--text)' }}>Purok: {item.docB?.purok || 'N/A'}</span>
                                      </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                                      <button className="btn btn-p btn-sm" onClick={() => typeof handleKeepVersionA === 'function' && handleKeepVersionA(item)}>Keep Version A</button>
                                      <button className="btn btn-g btn-sm" onClick={() => typeof handleKeepVersionB === 'function' && handleKeepVersionB(item)}>Keep Version B</button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* 4. PAGINATION CONTROLS */}
                              {totalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '24px' }}>
                                  <button 
                                    className="btn btn-g btn-sm" 
                                    disabled={conflictPage === 1} 
                                    onClick={() => setConflictPage(p => p - 1)}
                                  >
                                    Previous
                                  </button>
                                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                                    Page {conflictPage} of {totalPages} ({filtered.length} total)
                                  </span>
                                  <button 
                                    className="btn btn-g btn-sm" 
                                    disabled={conflictPage === totalPages} 
                                    onClick={() => setConflictPage(p => p + 1)}
                                  >
                                    Next
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
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
                    {/* 0. Pending Account Requests */}
                    <div className="fp" style={{ ...formCardStyle, borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #f59e0b)' }}>
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="8.5" cy="7" r="4" />
                            <line x1="20" y1="8" x2="20" y2="14" />
                            <line x1="23" y1="11" x2="17" y2="11" />
                          </svg>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>
                            Pending Account Requests
                          </span>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: accountRequests.length > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: accountRequests.length > 0 ? '#f59e0b' : '#10b981', border: `1px solid ${accountRequests.length > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}` }}>
                            {accountRequests.length}
                          </span>
                        </div>
                        <button className="btn btn-g btn-sm" style={{ fontSize: '11px' }} onClick={() => fetchAccountRequests()}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                          Refresh
                        </button>
                      </div>

                      {accountRequests.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '24px 16px', color: 'var(--muted)', textAlign: 'center' }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>No pending account requests.</span>
                          <span style={{ fontSize: '11px' }}>Ang mga bagong registration request mula sa public portal ay lilitaw dito.</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {accountRequests.map((req) => {
                            const reqInitials = (req.fullName || req.name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                            return (
                              <div key={req._id} style={{ ...formFieldStyle, borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent, #f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                  {reqInitials}
                                </div>
                                <div style={{ flex: '1 1 180px', minWidth: '0' }}>
                                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>{req.fullName || req.name || 'Unknown'}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                                    <span>{req.purok || 'N/A'}</span>
                                    {req.contact && <span style={{ fontFamily: 'var(--mono)' }}>{req.contact}</span>}
                                    <span style={monoMuted}>{req.requestedAt ? new Date(req.requestedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                                  </div>
                                </div>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.25)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                                  {req.type === 'resident_account_request' ? 'Resident Portal' : 'Account Request'}
                                </span>
                                <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                                  <button className="btn btn-sm" style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)' }} onClick={() => handleApproveRequest(req)}>
                                    Approve
                                  </button>
                                  <button className="btn btn-sm" style={{ fontSize: '11px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)' }} onClick={() => handleRejectRequest(req._id)}>
                                    Reject
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 1. Header & Actions Toolbar */}
                    <div className="tb" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div className="sb-box" style={{ flex: '1 1 250px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-4-4" />
                        </svg>
                        <input 
                          placeholder="Search by name, username, or purok..." 
                          value={searchUserQuery} 
                          onChange={(e) => setSearchUserQuery(e.target.value)} 
                        />
                      </div>
                      
                      <select className="fc" style={{ width: '160px' }} value={filterUserRole} onChange={(e) => setFilterUserRole(e.target.value)}>
                        <option value="All">All Roles</option>
                        <option value="Admin">Admin</option>
                        <option value="Staff">Staff / Secretary</option>
                        <option value="Resident">Resident</option>
                      </select>

                      <button 
                        className="btn btn-p" 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}
                        onClick={() => setShowAddUserModal(true)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Add New User
                      </button>
                    </div>

                    {/* 2. Stats & Reset Filters */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Showing <strong style={{ color: 'var(--text)' }}>{filteredUsers.length}</strong> of <strong style={{ color: 'var(--text)' }}>{usersList.length}</strong> registered accounts
                      </span>
                      {(searchUserQuery || filterUserRole !== 'All') && (
                        <button className="btn btn-sm btn-g" onClick={() => { setSearchUserQuery(''); setFilterUserRole('All'); }}>
                          Reset Filters
                        </button>
                      )}
                    </div>

                    {/* 3. Data Table with Sticky Header & Hover Effects */}
                    <div className="tw" style={{ minHeight: '300px', maxHeight: '65vh', borderRadius: '8px', overflowX: 'auto', overflowY: 'visible' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface2)' }}>
                        <tr>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              User Profile
                            </span>
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              Role
                            </span>
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              Purok / Zone
                            </span>
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              Status
                            </span>
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              Last Active
                            </span>
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                        <tbody>
                        {filteredUsers.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--muted)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
                                  <circle cx="11" cy="11" r="7" />
                                  <path d="m20 20-4-4" />
                                </svg>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>No users found matching your criteria.</span>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredUsers.map((u, index) => {
                            const displayName = u.fullName || u.name || u.username || u.uname || 'Unknown';
                            const uname = u.username || u.uname || 'user';
                            const initials = displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                            const userRoleLower = (u.role || '').toLowerCase();
                            const roleColor = userRoleLower === 'admin' ? '#ef4444' : userRoleLower === 'staff' || userRoleLower === 'secretary' ? '#3b82f6' : '#10b981';
                            const roleBg = userRoleLower === 'admin' ? 'rgba(239, 68, 68, 0.1)' : userRoleLower === 'staff' || userRoleLower === 'secretary' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)';
                            const isCurrentlyActive = (u.status || 'Active').toLowerCase() === 'active';
                            const userKey = u._id || `user_${uname}` || `user-${index}`;

                            return (
                              <tr 
                                key={userKey} 
                                style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <td style={{ padding: '12px 16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: roleColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                      {initials}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>{displayName}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>@{uname}</div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', color: roleColor, background: roleBg, border: `1px solid ${roleColor}33`, textTransform: 'uppercase' }}>
                                    {u.role || 'Resident'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text)' }}>{u.purok || 'N/A'}</td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      color: isCurrentlyActive ? '#10b981' : '#ef4444',
                                      background: isCurrentlyActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                      border: `1px solid ${isCurrentlyActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                                      padding: '3px 8px',
                                      borderRadius: '12px',
                                    }}
                                  >
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCurrentlyActive ? '#10b981' : '#ef4444' }}></span>
                                    {u.status || 'Active'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--muted)' }}>
                                  {u.last || (u.updatedAt ? new Date(u.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently')}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'right', position: 'relative' }}>
                                  {/* KEBAB ACTION MENU */}
                                  <div style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
                                    <button 
                                      className="btn btn-g btn-sm"
                                      style={{
                                        width: '32px',
                                        height: '32px',
                                        padding: 0,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '16px',
                                        fontWeight: 800,
                                        lineHeight: 1,
                                        borderRadius: '8px',
                                      }}
                                      title="Account Actions"
                                      onClick={() => setActiveActionMenu(activeActionMenu === userKey ? null : userKey)}
                                    >
                                      ⋮
                                    </button>

                                    {activeActionMenu === userKey && (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          right: 0,
                                          top: '100%',
                                          marginTop: '6px',
                                          background: 'var(--surface, #1e293b)',
                                          border: '1px solid var(--border, #334155)',
                                          borderRadius: '10px',
                                          boxShadow: '0 10px 20px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.4)',
                                          zIndex: 100,
                                          minWidth: '170px',
                                          padding: '6px',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: '2px',
                                          textAlign: 'left',
                                        }}
                                      >
                                        <button
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: '8px 12px',
                                            color: 'var(--text, #f8fafc)',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            borderRadius: '6px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            width: '100%',
                                            textAlign: 'left',
                                          }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2, #0f172a)'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                          onClick={() => {
                                            setActiveActionMenu(null);
                                            setEditingUser(u);
                                          }}
                                        >
                                          <span>✏️</span> Edit User
                                        </button>

                                        <button
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: '8px 12px',
                                            color: 'var(--text, #f8fafc)',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            borderRadius: '6px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            width: '100%',
                                            textAlign: 'left',
                                          }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2, #0f172a)'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                          onClick={() => {
                                            setActiveActionMenu(null);
                                            handleResetPassword(u);
                                          }}
                                        >
                                          <span>🔑</span> Reset Password
                                        </button>

                                        {userRoleLower !== 'admin' && (
                                          <button
                                            style={{
                                              background: 'none',
                                              border: 'none',
                                              padding: '8px 12px',
                                              color: isCurrentlyActive ? '#ef4444' : '#10b981',
                                              fontSize: '12px',
                                              fontWeight: 500,
                                              cursor: 'pointer',
                                              borderRadius: '6px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px',
                                              width: '100%',
                                              textAlign: 'left',
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2, #0f172a)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                            onClick={() => {
                                              setActiveActionMenu(null);
                                              handleToggleUserStatus(u);
                                            }}
                                          >
                                            <span>{isCurrentlyActive ? '🚫' : '✅'}</span>
                                            {isCurrentlyActive ? 'Deactivate User' : 'Activate User'}
                                          </button>
                                        )}
                                      </div>
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

                    {/* ═══ USER MANAGEMENT MODALS ═══ */}
                    {editingUser && (
                      <EditUserModal
                        user={editingUser}
                        onClose={() => setEditingUser(null)}
                        onSave={() => fetchUsers()}
                        db={db}
                        currentUser={currentUser}
                      />
                    )}

                    {showAddUserModal && (
                      <AddUserModal
                        isOpen={showAddUserModal}
                        onClose={() => setShowAddUserModal(false)}
                        onSave={() => fetchUsers()}
                        db={db}
                        currentUser={currentUser}
                      />
                    )}

                    {linkRequestTarget && (
                      <LinkResidentModal
                        isOpen={Boolean(linkRequestTarget)}
                        requestDoc={linkRequestTarget}
                        residentsList={residentsList}
                        onClose={() => setLinkRequestTarget(null)}
                        onLinkResident={async (chosenResident) => {
                          const targetReq = linkRequestTarget;
                          setLinkRequestTarget(null);
                          await proceedToGenerateAndLink(targetReq, chosenResident);
                        }}
                        onCreateNewResident={async (targetReq) => {
                          setLinkRequestTarget(null);
                          await handleCreateAndLinkResident(targetReq);
                        }}
                      />
                    )}
                  </div>
                )}
      
            {/* ════════════════════════════════════════
                SCREEN: GENERATE REPORTS
                ════════════════════════════════════════ */}
                {screen === 'reports' && (
                  <div className="screen active">
                    <div
                      className="thc"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: '16px'
                      }}
                    >
                      {[
                        {
                          title: 'Certificate Issuance',
                          desc: 'Monthly issuance summary by type',
                          select: ['April 2026', 'March 2026', 'February 2026'],
                          module: 'certificates'
                        },
                        { title: 'Aid Distribution', desc: 'Beneficiary list per program', 
                          select: ['All Months', 'October 2026', 'September 2026', 'August 2026'], 
                          module: 'aid' },
                        { title: 'Resident Registry', desc: 'Full resident list by purok', 
                          select: ['All Puroks', 'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'], 
                          module: 'residents' },
                        {
                          title: 'Voter List',
                          desc: 'Registered voters with precinct and barangay info',
                          select: ['All Voters', 'Registered Only', 'Bustrac Residents', 'Other Barangay'],
                          module: 'voters',
                        },
                        {
                          title: 'Blotter Summary',
                          desc: 'Cases grouped by type and status',
                          select: ['September 2026', 'August 2026', 'July 2026'],
                          module: 'blotter'
                        },
                        {
                          title: 'Feedback Report',
                          desc: 'Concern submissions and resolutions',
                          select: ['All Status', 'Pending', 'Under Review', 'Resolved'],
                          module: 'feedback'
                        },
                        {
                          title: 'Household Registry',
                          desc: 'Household listing by purok',
                          select: ['All Puroks', 'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'],
                          module: 'households'
                        },
                        ...(role === 'admin'
                          ? [{
                              title: 'Audit Trail Report',
                              desc: 'Full system transaction log',
                              select: ['September 2026', 'August 2026', 'July 2026'],
                              module: 'audit',
                              adminOnly: true
                            }]
                          : [])
                      ].map((r) => (
                        <div
                          key={r.title}
                          className="fp"
                          style={{
                            margin: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '14px'
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: '8px',
                                marginBottom: '6px'
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: '15px',
                                  color: 'var(--text)'
                                }}
                              >
                                {r.title}
                              </div>

                              {r.adminOnly && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--red)',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0
                                  }}
                                >
                                  Admin Only
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                fontSize: '12px',
                                color: 'var(--muted)',
                                marginBottom: '12px'
                              }}
                            >
                              {r.desc}
                            </div>

                            <select className="fc" style={{ margin: 0 }}>
                              {r.select.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '8px'
                            }}
                          >
                            <button
                              className="btn btn-p"
                              disabled={generatingReport === r.module}
                              style={{
                                justifyContent: 'center',
                                opacity: generatingReport === r.module ? 0.7 : 1,
                                cursor: generatingReport === r.module ? 'wait' : 'pointer',
                                fontSize: '12px',
                                padding: '8px 10px'
                              }}
                              onClick={() => handleGenerateReport(r.module)}
                            >
                              {generatingReport === r.module ? (
                                <>
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      width: '12px',
                                      height: '12px',
                                      border: '2px solid rgba(255,255,255,0.3)',
                                      borderTopColor: '#fff',
                                      borderRadius: '50%',
                                      animation: 'spin 0.6s linear infinite'
                                    }}
                                  />
                                  Generating...
                                </>
                              ) : (
                                'Generate PDF'
                              )}
                            </button>

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
                              Export Excel
                            </button>
                          </div>
                        </div>
                      ))}

                      {role === 'admin' && (
                        <div
                          className="fp"
                          style={{
                            margin: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '14px',
                            border: '1px solid var(--accent)',
                            background: 'rgba(59, 130, 246, 0.05)'
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: '8px',
                                marginBottom: '6px'
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: '15px',
                                  color: 'var(--text)'
                                }}
                              >
                                Database Backup & Restore
                              </div>

                              <span
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--amber)',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0
                                }}
                              >
                                Admin Only
                              </span>
                            </div>

                            <div
                              style={{
                                fontSize: '12px',
                                color: 'var(--muted)',
                                marginBottom: '12px'
                              }}
                            >
                              Export all local PouchDB data to a JSON file, or restore data from a previous backup.
                            </div>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}
                          >
                            <button
                              type="button"
                              className="btn btn-p"
                              onClick={handleExportBackup}
                              disabled={isDbProcessing}
                              style={{
                                justifyContent: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                opacity: isDbProcessing ? 0.6 : 1,
                                cursor: isDbProcessing ? 'wait' : 'pointer'
                              }}
                            >
                              {isDbProcessing ? (
                                <>
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      width: '12px',
                                      height: '12px',
                                      border: '2px solid rgba(255,255,255,0.3)',
                                      borderTopColor: '#fff',
                                      borderRadius: '50%',
                                      animation: 'spin 0.6s linear infinite'
                                    }}
                                  />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  Export Full Database Backup
                                </>
                              )}
                            </button>

                            <label
                              className="btn btn-g"
                              style={{
                                justifyContent: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: isDbProcessing ? 'not-allowed' : 'pointer',
                                opacity: isDbProcessing ? 0.6 : 1,
                                pointerEvents: isDbProcessing ? 'none' : 'auto'
                              }}
                            >
                              {isDbProcessing ? (
                                'Restoring...'
                              ) : (
                                <>
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                  </svg>
                                  Import Database Backup
                                </>
                              )}

                              <input
                                type="file"
                                accept=".json"
                                style={{ display: 'none' }}
                                disabled={isDbProcessing}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];

                                  if (file) {
                                    if (
                                      window.confirm(
                                        'Are you sure you want to restore this database backup? Existing local data may be overwritten. This action cannot be undone.'
                                      )
                                    ) {
                                      handleImportBackup(file);
                                    }

                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}
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
              inset: 0,
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
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '900px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '24px',
                  flex: 1,
                  overflow: 'auto',
                  background: 'var(--surface2)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  id="printable-certificate-card"
                  data-print-mode={printMode}
                  style={{
                    background: '#ffffff',
                    color: '#000000',
                  }}
                >
                  {(() => {
                    const typeStr = String(
                      selectedPrintCert.certificateType ||
                        selectedPrintCert.type ||
                        ''
                    ).toLowerCase();

                    const activeDomain =
                      systemSettings?.publicDomain || settingsForm?.publicDomain;

                    if (
                      typeStr.includes('business') ||
                      typeStr.includes('permit') ||
                      selectedPrintCert.businessName
                    ) {
                      return (
                        <BusinessPermit
                          data={selectedPrintCert}
                          publicDomain={activeDomain}
                        />
                      );
                    } else if (typeStr.includes('indigency')) {
                      return (
                        <IndigencyTemplate
                          data={selectedPrintCert}
                          publicDomain={activeDomain}
                        />
                      );
                    } else if (
                      typeStr.includes('residency') ||
                      typeStr.includes('resident')
                    ) {
                      return (
                        <ResidencyCertificate
                          data={selectedPrintCert}
                          publicDomain={activeDomain}
                        />
                      );
                    } else {
                      return (
                        <BarangayClearance
                          data={selectedPrintCert}
                          publicDomain={activeDomain}
                          qrConfig={businessQrConfig}
                        />
                      );
                    }
                  })()}
                </div>
              </div>

              <div
                className="no-print"
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  padding: '16px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}
              >
                <button
                  type="button"
                  className="btn btn-g"
                  onClick={() => setShowPrintModal(false)}
                >
                  Close
                </button>

                <button
                  type="button"
                  className="btn btn-p"
                  onClick={() => window.print()}
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
          justifyContent: 'center',
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
            justifyContent: 'center',
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
                <label style={{
                  display: 'block', fontSize: '12px', fontWeight: 700,
                  color: 'var(--text)', marginBottom: '6px'
                }}>
                  Hearing / Summon Date & Time <span style={{ color: 'var(--red, #ef4444)' }}>*</span>
                </label>
                <input
                  type="datetime-local"
                  className="fc"
                  value={scheduleDate}
                  onChange={handleScheduleDateChange}  
                  min={minDateTime}                 
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: '13px'
                  }}
                />
                <small style={{
                  display: 'block', marginTop: 6, fontSize: 10,
                  color: 'var(--muted)', lineHeight: 1.4
                }}>
                  📅 Lunes–Biyernes lamang (8:00 AM – 5:00 PM). Sarado tuwing Sabado, Linggo, at mga Philippine Holiday.
                </small>
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
                  justifyContent: 'center',
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
            style={{ background: 'var(--surface)', border: '1px solid rgba(79, 142, 247, 0.3)', borderRadius: '12px', width: '90%', maxWidth: '550px', padding: '24px', color: 'var(--text)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div>
                <span className={`badge ${viewingProgram.status === 'Completed' ? 't' : 'r'}`} style={{ marginBottom: '6px', display: 'inline-block' }}>
                  {viewingProgram.status}
                </span>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                  {viewingProgram.title}
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                  ID: {viewingProgram.id}
                </div>
              </div>
              <button className="btn btn-g btn-sm" onClick={() => setViewingProgram(null)} style={{ padding: '4px 10px', fontSize: '14px', borderRadius: '50%' }}>
                �o
              </button>
            </div>

            <div style={{ background: 'var(--surface2)', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--muted)' }}>Distribution Capacity:</span> <strong>{programAidCount(viewingProgram)} / {viewingProgram.target} Beneficiaries</strong>
              </div>
              <div style={{ margin: '8px 0', background: 'var(--border2)', borderRadius: '4px', height: '10px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.round(((programAidCount(viewingProgram) || 0) / viewingProgram.target) * 100))}%`, height: '100%', background: viewingProgram.status === 'Completed' ? 'var(--green)' : '#3b82f6' }} />
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: 'var(--green)' }}>
                {Math.min(100, Math.round(((programAidCount(viewingProgram) || 0) / viewingProgram.target) * 100))}% Capacity Reached
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ color: 'var(--muted)', display: 'block' }}>Date Created / Label</label>
                <div style={{ fontWeight: 600 }}>{viewingProgram.dateLabel || 'N/A'}</div>
              </div>
              <div>
                <label style={{ color: 'var(--muted)', display: 'block' }}>Category / Type</label>
                <div style={{ fontWeight: 600 }}>{viewingProgram.category || 'Aid Distribution'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
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
      
      {/* PROGRAM EDIT MODAL */}
      {editingProgram && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }} onClick={() => setEditingProgram(null)}>
          <div className="modal-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '500px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Edit Program</h3>
            
            <div className="fg">
              <label className="fl">Program Title</label>
              <input className="fc" value={editingProgram.title} onChange={(e) => setEditingProgram({...editingProgram, title: e.target.value})} />
            </div>
            
            <div className="fg2" style={{ marginTop: '12px' }}>
              <div className="fg">
                <label className="fl">Target</label>
                <input className="fc" type="number" value={editingProgram.target} onChange={(e) => setEditingProgram({...editingProgram, target: Number(e.target.value)})} />
              </div>
              <div className="fg">
                <label className="fl">Status</label>
                <select className="fc" value={editingProgram.status} onChange={(e) => setEditingProgram({...editingProgram, status: e.target.value})}>
                  <option value="Active">Active</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Completed">Completed</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-g" onClick={() => setEditingProgram(null)}>Cancel</button>
              <button className="btn btn-p" onClick={async () => {
                try {
                  const docId = `program_${editingProgram.id}`;
                  const existing = await db.get(docId);
                  const cleanDoc = { ...existing };
                  delete cleanDoc.current;
                  await db.put({
                    ...cleanDoc,
                    ...editingProgram,
                    updatedAt: new Date().toISOString()
                  });
                  setProgramsList(prev => prev.map(p => p.id === editingProgram.id ? editingProgram : p));
                  setEditingProgram(null);
                } catch (err) {
                  console.error('Failed to update program:', err);
                  showToast('Failed to save changes.', 'error');
                }
              }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 7. BUSINESS CLEARANCE EDIT MODAL ═══ */}
      {isBusinessModalOpen && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '20px' }}
          onClick={() => setIsBusinessModalOpen(false)}
        >
          <div
            className="modal-card width-lg"
            style={{ background: 'var(--surface, #1e293b)', color: 'var(--text, #f8fafc)', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', border: '1px solid var(--border, #334155)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface2)', color: 'var(--text)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                  {businessModalMode === 'edit' ? 'Edit Business Clearance' : 'New Business Clearance'}
                </h3>
                <p className="modal-subtitle" style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  Update business details, owner information, and OR reference
                </p>
              </div>
              <button type="button" className="btn-close" onClick={() => setIsBusinessModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>
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
      <BlotterCertificatePrintModal
        isOpen={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false);
          setSelectedBlotter(null);
        }}
        blotterData={selectedBlotter ? {
          ...selectedBlotter,
          caseNum: selectedBlotter.caseNum || selectedBlotter.trackingNo || selectedBlotter.id || selectedBlotter._id || 'N/A',
          complainantName: selectedBlotter.complainantName || selectedBlotter.complainant || 'N/A',
          respondentName: selectedBlotter.respondentName || selectedBlotter.respondent || 'N/A',
          dateFiled: selectedBlotter.dateFiled || selectedBlotter.date || 'N/A',
          timeFiled: selectedBlotter.timeFiled || selectedBlotter.incidentTime || selectedBlotter.time || 'N/A',
          incidentType: selectedBlotter.incidentType || selectedBlotter.type || 'N/A',
          narrative: selectedBlotter.narrative || selectedBlotter.details || 'No narrative provided.',
          location: selectedBlotter.location || selectedBlotter.purok || 'Barangay Bustrac',
          status: selectedBlotter.status || 'Pending',
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
                <BarangayClearance
                  data={selectedClearanceCert}
                  publicDomain={systemSettings?.publicDomain || settingsForm?.publicDomain}
                  qrConfig={businessQrConfig}
                />
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
                <BusinessClearanceTemplate
                  data={selectedBusinessCert}
                  publicDomain={systemSettings?.publicDomain || settingsForm?.publicDomain}
                  qrConfig={businessQrConfig}
                />
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

      {/* ════════════════════════════════════════
              CERTIFICATE REQUEST DISPATCHER MODAL
          ════════════════════════════════════════ */}
          {showCertDispatcher && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                padding: '20px',
              }}
              onClick={() => setShowCertDispatcher(false)}
            >
              <div
                style={{
                  background: 'var(--surface, #1e293b)',
                  border: '1px solid var(--border, #334155)',
                  borderRadius: '16px',
                  width: '100%',
                  maxWidth: '850px',
                  padding: '32px',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
                      Select Certificate Workflow
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                      Choose the appropriate processing module for this request.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCertDispatcher(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '24px', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  
                  {/* Option 1: Barangay Clearance (Individual) */}
                  <button
                    onClick={() => {
                      setShowCertDispatcher(false);
                      nav('brgy_clearance');
                    }}
                    style={{
                      background: 'var(--surface2, #334155)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '24px 16px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary, #3b82f6)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(59, 130, 246, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary, #3b82f6)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Barangay Clearance</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', lineHeight: 1.4 }}>For individual residents. Includes blotter verification & CTC integration.</div>
                    </div>
                  </button>

                  {/* Option 2: Business Clearance */}
                  <button
                    onClick={() => {
                      setShowCertDispatcher(false);
                      nav('business_clearance');
                    }}
                    style={{
                      background: 'var(--surface2, #334155)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '24px 16px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--amber, #f59e0b)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(245, 158, 11, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--amber, #f59e0b)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="M9 22V12h6v10" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Business Clearance</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', lineHeight: 1.4 }}>For business permits, sari-sari stores, and commercial establishments.</div>
                    </div>
                  </button>

                  {/* Option 3: Standard Certificates */}
                  <button
                    onClick={() => {
                      setShowCertDispatcher(false);
                      nav('cert-new');// Opens the standard CertificateLifecycle screen
                    }}
                    style={{
                      background: 'var(--surface2, #334155)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '24px 16px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--green, #10b981)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(16, 185, 129, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green, #10b981)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Standard Certificates</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', lineHeight: 1.4 }}>For Indigency, Residency, and other general certificate requests.</div>
                    </div>
                  </button>

                </div>
              </div>
            </div>
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
                {/* Credentials Display Modal */}
{credentialsModal?.show && (
  <div 
    style={{ 
      position: 'fixed', 
      inset: 0, 
      background: 'rgba(0,0,0,0.75)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      zIndex: 99999, 
      padding: '20px' 
    }}
    onClick={() => setCredentialsModal(null)}
  >
    <div 
      style={{ 
        background: 'var(--surface)', 
        border: '1px solid var(--border)', 
        borderRadius: '16px', 
        width: '100%', 
        maxWidth: '480px', 
        padding: '32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ 
          width: '64px', 
          height: '64px', 
          borderRadius: '50%', 
          background: 'rgba(16, 185, 129, 0.15)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          margin: '0 auto 16px',
          color: 'var(--green, #10b981)'
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>
          Credentials Generated Successfully!
        </h3>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
          Please provide these credentials to: <strong>{credentialsModal.residentName}</strong>
        </p>
      </div>

      <div style={{ 
        background: 'var(--surface2)', 
        border: '1px solid var(--border)', 
        borderRadius: '12px', 
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>
            Username
          </label>
          <div style={{ 
            fontFamily: 'var(--mono)', 
            fontSize: '16px', 
            fontWeight: '700', 
            color: 'var(--text)',
            background: 'var(--surface)',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            wordBreak: 'break-all'
          }}>
            {credentialsModal.username}
          </div>
        </div>

        <div>
          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>
            Temporary Password
          </label>
          <div style={{ 
            fontFamily: 'var(--mono)', 
            fontSize: '16px', 
            fontWeight: '700', 
            color: 'var(--text)',
            background: 'var(--surface)',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            wordBreak: 'break-all'
          }}>
            {credentialsModal.password}
          </div>
        </div>
      </div>

      <div style={{ 
        background: 'rgba(245, 158, 11, 0.1)', 
        border: '1px solid rgba(245, 158, 11, 0.3)', 
        borderRadius: '8px', 
        padding: '12px',
        marginBottom: '20px',
        fontSize: '12px',
        color: 'var(--amber, #f59e0b)',
        lineHeight: '1.5'
      }}>
        <strong>⚠️ Important:</strong> Advise the resident to change their password immediately after first login for security purposes.
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button 
          className="btn btn-g" 
          onClick={() => {
            navigator.clipboard.writeText(`Username: ${credentialsModal.username}\nPassword: ${credentialsModal.password}`);
            showToast('Credentials copied to clipboard!', 'success');
          }}
          style={{ flex: 1 }}
        >
           Copy Credentials
        </button>
        <button 
          className="btn btn-p" 
          onClick={() => setCredentialsModal(null)}
          style={{ flex: 1 }}
        >
          Done
        </button>
      </div>
    </div>
  </div>
)}
{showAddResidentModal && (
  <div 
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }} 
    onClick={() => setShowAddResidentModal(false)}
  >
    <div 
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }} 
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>
            New Resident Information
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
            Please fill out the required fields below to register a new resident.
          </p>
        </div>
        <button onClick={() => setShowAddResidentModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '24px', cursor: 'pointer' }}>
          ✕
        </button>
      </div>
      
      {/* Modal Body (Your ResidentForm Component) */}
      <div style={{ padding: '24px' }}>
        <ResidentForm
  residentForm={residentForm}
  setResidentForm={setResidentForm}
  editingResidentId={editingResidentId}
  photoPreviewUrl={photoPreviewUrl}
  setPhotoPreviewUrl={setPhotoPreviewUrl}
  handlePhotoChange={handlePhotoChange}
  handleRemovePhoto={handleRemovePhoto}
  updateResidentField={updateResidentField}
  submitAddResident={async (e) => {
    const success = await submitAddResident(e);
    if (success) {
      setShowAddResidentModal(false);
    }
  }}
  nav={nav}
  setEditingResidentId={setEditingResidentId}
  EMPTY_RESIDENT={EMPTY_RESIDENT}
  onCancel={() => setShowAddResidentModal(false)}
/>
      </div>
    </div>
  </div>
)}

      {/* ═══════════════════════════════════════════════════════════
          GLOBAL PRINT PORTAL — outside all screen conditionals
          ═══════════════════════════════════════════════════════════ */}
      {printPreviewProps && createPortal(
        <div
          className="print-overlay"
          onClick={(e) => {
            // Click backdrop to close
            if (e.target === e.currentTarget) closePrint();
          }}
        >
          {!printPreviewProps.valid ? (
            /* ── Invalid / Error State ── */
            <div style={{
              background: 'var(--surface)',
              padding: '40px',
              borderRadius: '12px',
              textAlign: 'center',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
              <h3 style={{ margin: '0 0 8px', color: 'var(--text)' }}>
                Unable to Load Preview
              </h3>
              <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: '13px', lineHeight: 1.5 }}>
                {printPreviewProps.error}
              </p>
              <button type="button" className="btn btn-p" onClick={closePrint}>
                Close Preview
              </button>
            </div>
          ) : (
            /* ── Valid Print Wrapper ── */
            <CertificatePrintWrapper
              key={`${printData?._id || 'print'}-${printMode}`}
              type={printPreviewProps.printType}
              mode={printPreviewProps.mode}
              data={printPreviewProps.data}
              publicDomain={systemSettings?.publicDomain || settingsForm?.publicDomain}
              qrConfig={businessQrConfig}
              onClose={closePrint}
            />
          )}
        </div>,
        document.body
      )}
      {/* ═══ GLOBAL PRINT PORTAL — isang beses lang, outside all screens ═══ */}
{printData && createPortal(
  <div
    className="print-overlay"
    onClick={(e) => {
      if (e.target === e.currentTarget) {
        setPrintData(null);
        setSelectedCertificate(null);
      }
    }}
  >
    <CertificatePrintWrapper
      key={`${printData._id || 'print'}-${printMode}`}
      type={normalizeCertType(printData.certificateType || printData.certType || printData.type)}
      mode={printMode}
      data={{
        _id: printData._id,
        certificateType: printData.certificateType || printData.certType || printData.type,
        trackingCode: printData.trackingCode || printData._id || 'CERT-000000',
        fullName: printData.residentName || (printData.firstName ? `${printData.firstName} ${printData.lastName}` : printData.fullName) || '',
        firstName: printData.firstName || '',
        lastName: printData.lastName || '',
        address: printData.address || printData.purok || '',
        purpose: printData.purpose || '',
        issueDate: (() => {
          const raw = printData.issueDate || printData.issuedAt || printData.dateIssued;
          return raw
            ? new Date(raw).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
            : new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
        })(),
        orNumber: printData.orNumber ?? '',
        ctcNumber: printData.ctc?.number ?? printData.ctcNumber ?? '',
        amountPaid: printData.amountPaid ?? printData.ctc?.amountPaid ?? 0,
        civilStatus: printData.civilStatus || '',
        age: printData.age || '',
        punongBarangay: printData.punongBarangay || '',
      }}
      publicDomain={systemSettings?.publicDomain || settingsForm?.publicDomain}
      qrConfig={businessQrConfig}
      onClose={() => {
        setPrintData(null);
        setSelectedCertificate(null);
      }}
    />
  </div>,
  document.body
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
  color: 'var(--text)',
  fontSize: '12px',
  cursor: 'pointer',
  transition: 'background 0.2s',
  display: 'block'
};
