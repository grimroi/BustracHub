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
  getIssuedCertificates
};