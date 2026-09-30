// Shared utility functions for Resident modules
// Path: src/utils/residentUtils.js
// Version 2.0 — with data normalization & schema alignment

/* ── Date Formatting ── */
export const formatResidentDate = (rawTime) => {
  if (!rawTime) return 'Recently';
  // Handle both ISO strings and localized strings like "9/8/2026, 6:32:01 PM"
  const parsed = new Date(rawTime);
  if (isNaN(parsed.getTime())) return String(rawTime);
  return parsed.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const formatDateOnly = (rawTime) => {
  if (!rawTime) return 'N/A';
  const parsed = new Date(rawTime);
  if (isNaN(parsed.getTime())) return String(rawTime);
  return parsed.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

export const calculateAge = (birthdate) => {
  if (!birthdate) return 0;
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  // Adjust if birthday hasn't occurred yet this year
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : 0;
};

/* ── Status Step Helpers ── */
export const getFeedbackStep = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'resolved' || s === 'resolved & closed' || s === 'closed') return 4;
  if (s === 'responded') return 3;
  if (s === 'under review') return 2;
  return 1;
};

export const getBlotterStepProgress = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus.includes('settled') || normalizedStatus.includes('resolved')) return 4;
  if (
    normalizedStatus.includes('summon') ||
    normalizedStatus.includes('mediation') ||
    normalizedStatus.includes('pnp') ||
    normalizedStatus.includes('cfa') ||
    normalizedStatus.includes('refer') ||
    normalizedStatus.includes('hearing') ||
    normalizedStatus.includes('pangkat')
  ) return 3;
  if (
    normalizedStatus.includes('investigation') ||
    normalizedStatus.includes('open') ||
    normalizedStatus.includes('review')
  ) return 2;
  return 1;
};

export const getStepFromStatus = (status, existingStep) => {
  if (existingStep && Number(existingStep) > 0) return Number(existingStep);
  const s = (status || '').toLowerCase();
  if (s === 'released') return 6;
  if (s === 'issued') return 5;
  if (s === 'ready' || s === 'ready for pickup') return 4;
  if (s === 'approved' || s === 'for approval') return 3;
  if (s === 'under review' || s === 'review' || s === 'pending') return 2;
  if (s === 'submitted') return 1;
  return 1;
};

/* ── Location Formatting ── */
export const formatLocationDisplay = (item) => {
  const loc = item.location || item.purok || '';
  if (!loc) return 'Barangay Bustrac';
  if (loc.toLowerCase().includes('bustrac')) return loc;
  return `${loc}, Brgy. Bustrac`;
};

/* ── Certificate Document Normalization ── */
export const normalizeCertificateDoc = (doc) => {
  if (!doc) return null;
  const timestamp = doc.timestamp || doc.dateSubmitted || doc.createdAt || doc.requestedAt || new Date().toISOString();
  const status = doc.status || 'Pending';
  return {
    ...doc,
    // Normalize field names
    certType: doc.certType || doc.certificateType || 'Unknown Certificate',
    certPurpose: doc.certPurpose || doc.purpose || 'No purpose specified',
    residentName: doc.residentName || doc.fullName || `${doc.firstName || ''} ${doc.lastName || ''}`.trim() || 'Unknown',
    // Normalize timestamps
    timestamp: typeof timestamp === 'string' && timestamp.includes('T')
      ? timestamp
      : new Date(timestamp).toISOString(),
    // Ensure step exists
    step: doc.step || getStepFromStatus(status),
    status,
    // Ensure sync flags exist
    synced: doc.synced === true || doc.isSynced === true,
    isSynced: doc.synced === true || doc.isSynced === true,
    // Ensure refNumber exists
    refNumber: doc.refNumber || doc._id || 'UNKNOWN',
  };
};

/* ── Blotter Document Normalization ── */
export const normalizeBlotterDoc = (doc) => {
  if (!doc) return null;
  const timestamp = doc.timestamp || doc.createdAt || doc.dateLogged || new Date().toISOString();
  const status = doc.status || 'Pending';
  return {
    ...doc,
    subject: doc.subject || doc.incidentType || 'Untitled Incident',
    details: doc.details || doc.narrative || 'No details provided',
    complainantName: doc.complainantName || (typeof doc.complainant === 'string' ? doc.complainant : doc.complainant?.name) || 'Anonymous',
    respondentName: doc.respondentName || (typeof doc.respondent === 'string' ? doc.respondent : doc.respondent?.name) || 'Under Investigation',
    location: doc.location || doc.purok || 'Barangay Bustrac',
    timestamp: typeof timestamp === 'string' && timestamp.includes('T')
      ? timestamp
      : new Date(timestamp).toISOString(),
    step: doc.step || getBlotterStepProgress(status),
    status,
    synced: doc.synced === true || doc.isSynced === true,
    isSynced: doc.synced === true || doc.isSynced === true,
    refNumber: doc.refNumber || doc.trackingNo || doc.caseNo || doc.caseNum || doc._id || 'UNKNOWN',
    history: Array.isArray(doc.history) ? doc.history : [],
  };
};

/* ── Feedback Document Normalization ── */
export const normalizeFeedbackDoc = (doc) => {
  if (!doc) return null;
  const timestamp = doc.timestamp || doc.createdAt || new Date().toISOString();
  return {
    ...doc,
    subject: doc.subject || 'No Subject',
    details: doc.details || doc.message || doc.content || 'No details',
    feedbackType: doc.feedbackType || doc.type || 'General',
    status: doc.status || 'Pending',
    timestamp: typeof timestamp === 'string' && timestamp.includes('T')
      ? timestamp
      : new Date(timestamp).toISOString(),
    refNumber: doc.refNumber || doc._id || 'FB-UNKNOWN',
    residentName: doc.residentName || doc.sender || 'Anonymous',
    response: doc.response || '',
    handledBy: doc.handledBy || '',
  };
};

/* ── Audit Log Schema Builder ── */
export const buildAuditLogPayload = ({
  action,
  module,
  recordId = null,
  actor,
  details = '',
  ipAddress = null,
}) => ({
  type: 'audit_log',
  timestamp: new Date().toISOString(),
  action,
  module,
  recordId,
  actor: {
    username: actor.username || actor.residentId || 'resident',
    role: actor.role || 'resident',
    displayName: actor.fullName || actor.name || 'Resident',
  },
  details,
  ipAddress,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
});

/* ── Search/Filter Helper ── */
export const filterBySearch = (items, searchTerm, fields = []) => {
  if (!searchTerm || !searchTerm.trim()) return items;
  const term = searchTerm.toLowerCase().trim();
  return items.filter((item) =>
    fields.some((field) => {
      const value = item[field];
      if (value === null || value === undefined) return false;
      return String(value).toLowerCase().includes(term);
    })
  );
};

/* ── Status Color Helpers ── */
export const getStatusColor = (status) => {
  const s = (status || '').toLowerCase();
  if (s.includes('issued') || s.includes('released') || s.includes('resolved') || s.includes('settled')) {
    return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
  }
  if (s.includes('ready') || s.includes('approved')) {
    return { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)' };
  }
  if (s.includes('review') || s.includes('investigation') || s.includes('summon') || s.includes('mediation')) {
    return { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.3)' };
  }
  if (s.includes('pending') || s.includes('open')) {
    return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' };
  }
  if (s.includes('cancelled') || s.includes('rejected')) {
    return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)' };
  }
  return { color: 'var(--muted)', bg: 'var(--surface2)', border: 'var(--border)' };
};

/* ── Validation Helpers ── */
export const validatePhoneNumber = (phone) => {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  return /^09\d{9}$/.test(cleaned);
};

export const validateEmail = (email) => {
  if (!email) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validateZone = (zone) => {
  if (!zone) return false;
  return /^(Zone|Purok)\s*[1-5]$/i.test(zone.trim());
};
