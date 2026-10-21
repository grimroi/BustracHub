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

// ─────────────────────────────────────────────────────────────────────────────
// Secure verification tokens.
//
// The public QR carries an UNPREDICTABLE server-minted token, not the
// document id. Only the token's SHA-256 hash is stored, and the verification
// registry is server-owned (the sync proxy refuses client writes to it), so a
// device can never mint its own "valid" certificate.
// ─────────────────────────────────────────────────────────────────────────────
const {
  generateVerificationToken,
  hashVerificationToken,
  isValidVerificationToken,
  verificationRecordId,
  verificationAliasId,
  buildVerificationRecord,
  buildVerificationAlias,
  isRecordRevoked,
  markRecordRevoked,
} = require('../utils/verificationTokens');
const { VERIFICATION_RECORD_PREFIX } = require('../utils/verificationTokens');
const { createRateLimiter, clientKey } = require('../utils/rateLimit');

// The public verification endpoint is unauthenticated, so it is throttled.
// 30 requests per minute per client address is generous for a human holding
// a certificate and tight enough to stop enumeration.
const verifyRateLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

// Certificates that may carry a verification token.
const TOKEN_VERIFIABLE_TYPES = [
  'business_clearance',
  'barangay_clearance',
  'certificate_request',
  'issued_certificate',
];

// Writes a server-side audit entry for issuance / revocation events. The
// audit_log documents live in the shared database and are replicated to the
// administrator's own devices, so they show up in the existing Audit Log view.
async function recordCertificateAudit({ db, action, actor, recordId, details, affected }) {
  try {
    const timestamp = new Date().toISOString();
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    await db.insert({
      _id: id,
      type: 'audit_log',
      docType: 'audit_log',
      action,
      module: 'CERTIFICATES',
      recordId: recordId || null,
      actor: {
        username: actor?.username || 'unknown',
        role: actor?.role || 'unknown',
        residentId: actor?.residentId || null,
      },
      details,
      affected: affected || [],
      timestamp,
      createdAt: timestamp,
      immutable: true,
      source: 'server-certificate-verification',
    });
  } catch (err) {
    // A failed audit write must never fail the operation it describes.
    console.warn('[certificate] Audit write failed:', err?.message || err);
  }
}

// @desc    Mint (or re-issue) the verification token for an issued certificate
// @route   POST /api/certificates/verification-token
// @access  Private — admin/staff only
async function mintVerificationToken(req, res) {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database connection is not ready.' });
    }

    const certificateId = String(req.body?.certificateId || '').trim();
    if (!certificateId) {
      return res.status(400).json({ success: false, message: 'A certificateId is required.' });
    }
    if (certificateId.length > 128 || certificateId.startsWith('_')) {
      return res.status(400).json({ success: false, message: 'Invalid certificate id.' });
    }

    let certificate;
    try {
      certificate = await db.get(certificateId);
    } catch (err) {
      const status = err?.statusCode || err?.status;
      if (status === 404 || status === 'not_found') {
        return res.status(404).json({ success: false, message: 'Certificate not found.' });
      }
      throw err;
    }

    const type = String(certificate.type || '').toLowerCase();
    if (!TOKEN_VERIFIABLE_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: 'This document type cannot be verified.' });
    }

    // A token is only ever minted for a certificate that is genuinely ISSUED.
    // The same policy module backs the public endpoint, so drafts, pending
    // requests, rejected and cancelled records can never obtain one.
    const status = resolveDocumentStatus(certificate);
    if (!status.valid) {
      return res.status(409).json({
        success: false,
        message: 'This certificate is not in a verifiable issued state.',
        status: status.key,
      });
    }

    // Idempotency. The certificate may already carry a token (the issuing
    // device stores it so a reprint can reuse the same QR). When it does, the
    // SAME token is returned — reprinting must never create a second
    // identity for one certificate, and must never invalidate the original.
    //
    // The server-side ALIAS record maps certificateId → token hash, so the
    // server can tell whether a certificate already has a token even when
    // the device no longer has it.
    const aliasId = verificationAliasId(certificateId);
    let alias = null;
    try {
      alias = await db.get(aliasId);
    } catch {
      alias = null;
    }

    let existingRecord = null;
    if (alias?.tokenHash) {
      try {
        existingRecord = await db.get(`${VERIFICATION_RECORD_PREFIX}${alias.tokenHash}`);
      } catch {
        existingRecord = null;
      }
    }

    const suppliedToken = req.body?.verificationToken;
    const hasSuppliedToken = isValidVerificationToken(suppliedToken);

    if (hasSuppliedToken && existingRecord && !isRecordRevoked(existingRecord)) {
      const suppliedHash = hashVerificationToken(suppliedToken);
      if (suppliedHash === alias.tokenHash && existingRecord.certificateId === certificateId) {
        // The device still holds the token we issued: reuse it verbatim.
        return res.status(200).json({
          success: true,
          reused: true,
          token: suppliedToken,
          certificateId,
        });
      }
    }

    if (existingRecord && !isRecordRevoked(existingRecord) && !hasSuppliedToken) {
      // A live token already exists for this certificate and the device did
      // not supply it. Minting a second one would create a second identity,
      // so refuse and ask the device to present the token it holds.
      return res.status(409).json({
        success: false,
        message:
          'This certificate already has a verification token. Supply the existing token to reuse it.',
        existing: true,
      });
    }

    // Mint a new token. The record id IS the token hash, so a collision is
    // impossible in practice — but a 409 is still handled rather than thrown.
    let token = generateVerificationToken();
    const makeRecord = () =>
      buildVerificationRecord({
        token,
        certificateId,
        certificateType: documentTypeLabel(certificate),
        certificateNumber: documentReference(certificate),
        issuedAt: certificate.issuedAt || certificate.dateIssued || null,
        issuedBy: req.user?.username || 'unknown',
      });

    let record = makeRecord();
    let inserted = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await db.insert(record);
        inserted = { ...record, _rev: response.rev };
        break;
      } catch (err) {
        const status = err?.statusCode || err?.status;
        if (status === 409) {
          // Token collision (astronomically unlikely) — mint a fresh one.
          token = generateVerificationToken();
          record = makeRecord();
          continue;
        }
        throw err;
      }
    }
    if (!inserted) {
      return res.status(503).json({ success: false, message: 'Could not create the verification record.' });
    }

    // Point the certificate at the new token so revocation and reprinting can
    // find it without a scan.
    try {
      const aliasPayload = buildVerificationAlias({ certificateId, token });
      let aliasRev;
      try {
        const currentAlias = await db.get(aliasId);
        aliasRev = currentAlias._rev;
      } catch {
        aliasRev = undefined;
      }
      await db.insert(aliasRev ? { ...aliasPayload, _rev: aliasRev } : aliasPayload);
    } catch (err) {
      console.warn('[certificate] Could not write the verification alias:', err?.message || err);
    }

    await recordCertificateAudit({
      db,
      action: 'ISSUE_CERTIFICATE_VERIFICATION_TOKEN',
      actor: req.user,
      recordId: certificateId,
      details:
        `Verification token issued for ${documentTypeLabel(certificate)} ` +
        `${documentReference(certificate) || certificateId}.`,
      affected: [{ id: certificateId, type: certificate.type || '' }],
    });

    // The raw token is returned EXACTLY ONCE. The server keeps only its hash.
    return res.status(200).json({
      success: true,
      reused: false,
      token,
      certificateId,
    });
  } catch (error) {
    console.error('Error in mintVerificationToken:', error?.message || error);
    return res.status(500).json({ success: false, message: 'An error occurred while issuing the verification token.' });
  }
}

// @desc    Revoke a certificate (and its verification record)
// @route   POST /api/certificates/revoke
// @access  Private — admin/staff only
async function revokeCertificate(req, res) {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database connection is not ready.' });
    }

    const certificateId = String(req.body?.certificateId || '').trim();
    if (!certificateId) {
      return res.status(400).json({ success: false, message: 'A certificateId is required.' });
    }
    if (certificateId.length > 128 || certificateId.startsWith('_')) {
      return res.status(400).json({ success: false, message: 'Invalid certificate id.' });
    }

    let certificate;
    try {
      certificate = await db.get(certificateId);
    } catch (err) {
      const status = err?.statusCode || err?.status;
      if (status === 404 || status === 'not_found') {
        return res.status(404).json({ success: false, message: 'Certificate not found.' });
      }
      throw err;
    }

    const revokedAt = new Date().toISOString();
    const revokedBy = req.user?.username || 'unknown';

    // 1. Revoke the verification record — this is the authoritative public
    //    signal. It is a server-owned document, so no replication race can
    //    resurrect it.
    //
    //    The record is found through the certificate→token alias, so
    //    revocation works even when the device no longer holds the token.
    const token = certificate.verificationToken;
    let verificationRevoked = false;

    const tokenCandidates = [];
    if (isValidVerificationToken(token)) {
      tokenCandidates.push(hashVerificationToken(token));
    }
    try {
      const alias = await db.get(verificationAliasId(certificateId));
      if (alias?.tokenHash) tokenCandidates.push(alias.tokenHash);
    } catch {
      // No alias — the certificate may never have been issued a token.
    }

    for (const tokenHash of tokenCandidates) {
      const recordId = `${VERIFICATION_RECORD_PREFIX}${tokenHash}`;
      try {
        const record = await db.get(recordId);
        if (record.certificateId && record.certificateId !== certificateId) continue;
        const revoked = markRecordRevoked(record, { revokedBy, now: revokedAt });
        await db.insert({ ...revoked, _rev: record._rev });
        verificationRevoked = true;
      } catch (err) {
        const status = err?.statusCode || err?.status;
        if (status !== 404 && status !== 'not_found') throw err;
      }
    }

    // 2. Best-effort: also mark the certificate document itself. The client
    //    owns that document, so this may be overwritten by a later
    //    replication — which is exactly why the verification record above is
    //    the authoritative signal.
    let certificateMarked = false;
    try {
      const updated = {
        ...certificate,
        status: 'Revoked',
        revokedAt,
        revokedBy,
        updatedAt: revokedAt,
      };
      await db.insert(updated);
      certificateMarked = true;
    } catch (err) {
      console.warn('[certificate] Could not mark the certificate document as revoked:', err?.message || err);
    }

    await recordCertificateAudit({
      db,
      action: 'REVOKE_CERTIFICATE',
      actor: req.user,
      recordId: certificateId,
      details:
        `Certificate ${documentReference(certificate) || certificateId} revoked by ${revokedBy}.` +
        (verificationRevoked ? ' Verification record revoked.' : ' No verification record existed.'),
      affected: [{ id: certificateId, type: certificate.type || '' }],
    });

    return res.status(200).json({
      success: true,
      certificateId,
      verificationRevoked,
      certificateMarked,
      revokedAt,
    });
  } catch (error) {
    console.error('Error in revokeCertificate:', error?.message || error);
    return res.status(500).json({ success: false, message: 'An error occurred while revoking the certificate.' });
  }
}

// @desc    Verify a certificate by its secure verification token
// @route   GET /api/certificates/verify-token/:token
// @access  Public (rate limited)
async function verifyByToken(req, res) {
  try {
    const limit = verifyRateLimiter.check(clientKey(req));
    if (!limit.allowed) {
      res.set('Retry-After', String(limit.retryAfterSeconds || 60));
      return res.status(429).json({
        success: false,
        message: 'Too many verification requests. Please wait and try again.',
      });
    }

    const db = req.app.get('db');
    if (!db) {
      return res.status(503).json({ success: false, message: 'Verification service is not ready.' });
    }

    const token = String(req.params.token || '').trim();
    // A malformed token and an unknown token get the same neutral answer:
    // the endpoint never reveals whether a token was ever issued.
    if (!isValidVerificationToken(token)) {
      return res.status(404).json({ success: false, message: 'Certificate not found.' });
    }

    const recordId = verificationRecordId(token);
    let record = null;
    try {
      record = await db.get(recordId);
    } catch (err) {
      const status = err?.statusCode || err?.status;
      if (status === 404 || status === 'not_found') {
        return res.status(404).json({ success: false, message: 'Certificate not found.' });
      }
      throw err;
    }

    // The record is looked up by the token's hash, so a record that belongs to
    // a different certificate can never be reached with this token.
    const certificateId = record.certificateId;
    let certificate = null;
    try {
      certificate = await db.get(certificateId);
    } catch {
      certificate = null;
    }

    // The verification record is the authoritative revocation signal.
    if (isRecordRevoked(record)) {
      return res.status(200).json({
        success: true,
        data: {
          valid: false,
          status: 'invalid',
          statusLabel: 'Revoked',
          documentType: record.certificateType || 'Barangay Certificate',
          referenceNo: record.certificateNumber || '',
          issuedTo: certificate ? issuedToName(certificate) : '',
          dateIssued: safeDate(record.issuedAt || (certificate && (certificate.dateIssued || certificate.issuedAt)) || ''),
        },
      });
    }

    if (!certificate) {
      return res.status(404).json({ success: false, message: 'Certificate not found.' });
    }

    // Re-check the certificate itself: the same policy the id-based endpoint
    // uses. This keeps a hand-written certificate document from being reported
    // as valid, and it is what turns a revoked/expired certificate into the
    // right public status.
    const status = resolveDocumentStatus(certificate);

    return res.status(200).json({
      success: true,
      data: {
        valid: status.valid,
        status: status.key,
        statusLabel: status.label,
        documentType: record.certificateType || documentTypeLabel(certificate),
        referenceNo: record.certificateNumber || documentReference(certificate),
        issuedTo: issuedToName(certificate),
        dateIssued: safeDate(record.issuedAt || certificate.dateIssued || certificate.issuedAt || certificate.createdAt),
      },
    });
  } catch (error) {
    console.error('Error in verifyByToken:', error?.message || error);
    return res.status(500).json({ success: false, message: 'An error occurred while verifying the certificate.' });
  }
}

module.exports = {
  issueCertificate,
  getIssuedCertificates,
  verifyCertificate,
  mintVerificationToken,
  revokeCertificate,
  verifyByToken,
  // Exposed so the test suite can reset the shared limiter between cases.
  verifyRateLimiter
};