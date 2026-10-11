// server/controllers/certificateController.js

// @desc    Issue & Save Certificate Record (Save Record / Print Document)
// @route   POST /api/certificates/issue
// @access  Private / Public
async function issueCertificate(req, res) {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database connection is not ready.' });
    }

    const {
      _id,
      requestId,
      certificateType,
      certType,
      purpose,
      firstName,
      lastName,
      fullName,
      businessName,
      ownerName,
      applicantType,
      issuanceMeta,
      blotterVerifyQuery,
      blotterMatches
    } = req.body;

    if (!issuanceMeta || !issuanceMeta.orNumber) {
      return res.status(400).json({ success: false, message: 'An Official Receipt (OR) Number is required before saving or printing.' });
    }

    const targetRequestId = requestId || _id || `REQ-${Date.now()}`;
    const docId = `issued_cert_${targetRequestId}`;

    let existingRev = undefined;
    try {
      const existingDoc = await db.get(docId);
      existingRev = existingDoc._rev;
    } catch (err) {
      // Document does not exist yet; proceed with creation
    }

    const certDocument = {
      _id: docId,
      _rev: existingRev,
      type: 'issued_certificate',
      requestId: targetRequestId,
      applicantType: applicantType || (businessName ? 'Business' : 'Individual'),
      firstName: firstName || '',
      lastName: lastName || '',
      fullName: fullName || `${firstName || ''} ${lastName || ''}`.trim(),
      businessName: businessName || '',
      ownerName: ownerName || '',
      certificateType: certificateType || certType || 'Barangay Clearance',
      purpose: issuanceMeta.purpose || purpose || 'General Purpose',
      remarks: issuanceMeta.remarks || '',
      status: 'Issued',
      step: 5,
      isIssued: true,
      issuanceMeta: {
        dateIssued: issuanceMeta.dateIssued || new Date().toISOString(),
        orNumber: issuanceMeta.orNumber,
        amountPaid: Number(issuanceMeta.amountPaid) || 0,
        noDerogatoryRecord: Boolean(issuanceMeta.noDerogatoryRecord),
        ctcNumber: issuanceMeta.ctcNumber || '',
        ctcAmountPaid: Number(issuanceMeta.ctcAmountPaid) || 0,
        ctcDateIssued: issuanceMeta.ctcDateIssued || issuanceMeta.dateIssued || null
      },
      blotterCheckQuery: blotterVerifyQuery || '',
      blotterMatchesFound: Array.isArray(blotterMatches) ? blotterMatches.length : 0,
      issuedBy: 'Admin Staff',
      issuedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const response = await db.insert(certDocument);
    return res.status(200).json({
      success: true,
      message: 'Certificate record saved successfully in CouchDB!',
      data: { ...certDocument, _rev: response.rev }
    });
  } catch (error) {
    console.error('Error in issueCertificate:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while saving the certificate record.',
      error: error.message
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public QR verification (privacy-preserving). The public page only needs to
// confirm authenticity, so this returns the MINIMUM set of non-sensitive fields.
// ─────────────────────────────────────────────────────────────────────────────
const { resolveDocumentStatus } = require('../utils/verifyStatus');

const VERIFIABLE_ID_PREFIXES = ['bus_clearance_', 'brgy_clearance_', 'CERT-', 'issued_cert_'];
const VERIFIABLE_TYPES = ['business_clearance', 'barangay_clearance', 'certificate_request', 'issued_certificate'];

function isVerifiableId(id) {
  if (typeof id !== 'string') return false;
  const value = id.trim();
  if (!value || value.length > 128 || value.startsWith('_')) return false;
  return VERIFIABLE_ID_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function documentTypeLabel(doc) {
  const raw = String(doc.certificateType || doc.certType || doc.type || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  const map = {
    'business clearance': 'Barangay Business Clearance',
    'business permit': 'Barangay Business Permit',
    'barangay clearance': 'Barangay Clearance',
    'certificate request': 'Barangay Certificate',
    indigency: 'Certificate of Indigency',
    residency: 'Certificate of Residency',
    'issued certificate': 'Barangay Certificate'
  };
  return map[raw] || (raw ? raw.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Barangay Certificate');
}

function documentReference(doc) {
  const ref = doc.bcIdNo || doc.clearanceNo || doc.refNumber || doc.referenceNo || doc.controlNo;
  return ref ? String(ref).trim() : '';
}

function issuedToName(doc) {
  const direct = [doc.fullName, doc.applicantName, doc.residentName, doc.ownerName];
  for (const value of direct) {
    if (value && String(value).trim()) return String(value).trim();
  }
  const person = `${doc.firstName || ''} ${doc.lastName || ''}`.trim();
  const business = doc.businessName ? String(doc.businessName).trim() : '';
  if (business && person) return `${business} (${person})`;
  if (business) return business;
  if (person) return person;
  return '';
}

function safeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// @desc    Verify a certificate/document by id for the public QR page
// @route   GET /api/certificates/verify/:id
// @access  Public
async function verifyCertificate(req, res) {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database connection is not ready.' });
    }

    const id = String(req.params.id || '').trim();
    if (!isVerifiableId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid document id.' });
    }

    let doc;
    try {
      doc = await db.get(id);
    } catch (err) {
      if (err.statusCode === 404 || err.status === 404) {
        return res.status(404).json({ success: false, message: 'Document not found.' });
      }
      throw err;
    }

    const type = String(doc.type || '').toLowerCase();
    if (!VERIFIABLE_TYPES.includes(type)) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const status = resolveDocumentStatus(doc);

    return res.status(200).json({
      success: true,
      data: {
        valid: status.valid,
        status: status.key,
        statusLabel: status.label,
        documentType: documentTypeLabel(doc),
        referenceNo: documentReference(doc),
        issuedTo: issuedToName(doc),
        dateIssued: safeDate(doc.dateIssued || doc.issuedAt || doc.issuedDate || doc.createdAt)
      }
    });
  } catch (error) {
    console.error('Error in verifyCertificate:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while verifying the document.' });
  }
}

// @desc    Get All Issued & Released Certificates (For the Reprint Queue)
// @route   GET /api/certificates/issued
// @access  Private / Public
async function getIssuedCertificates(req, res) {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database connection is not ready.' });
    }

    const allDocs = await db.list({ include_docs: true });
    const issuedList = allDocs.rows
      .map((row) => row.doc)
      .filter((doc) => doc && doc.type === 'issued_certificate')
      .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

    return res.status(200).json({ success: true, count: issuedList.length, data: issuedList });
  } catch (error) {
    console.error('Error fetching issued certificates:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve the list of issued certificates.',
      error: error.message
    });
  }
}

module.exports = {
  issueCertificate,
  getIssuedCertificates,
  verifyCertificate
};