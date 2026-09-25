// @desc    Issue & Save Certificate Record (Save Record / Print Document)
// @route   POST /api/certificates/issue
// @access  Private / Public
exports.issueCertificate = async (req, res) => {
  try {
    // Kukunin ang 'db' instance mula sa express app setup
    const db = req.app.get('db');

    if (!db) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection is not ready.' 
      });
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

    // Validation para sa mandatory fields
    if (!issuanceMeta || !issuanceMeta.orNumber) {
      return res.status(400).json({
        success: false,
        message: 'Kailangan ang Official Receipt (OR) Number bago mag-save o mag-print.'
      });
    }

    const targetRequestId = requestId || _id || `REQ-${Date.now()}`;
    const docId = `issued_cert_${targetRequestId}`;

    // Titingnan muna kung may umiiral nang document sa CouchDB para sa `_rev` (revision key)
    let existingRev = undefined;
    try {
      const existingDoc = await db.get(docId);
      existingRev = existingDoc._rev;
    } catch (err) {
      // Kapag wala pa ang doc (404), tuloy lang sa paglikha ng bago
    }

    // Bubuoin ang CouchDB Document Format
    const certDocument = {
      _id: docId,
      _rev: existingRev, // Required sa CouchDB kapag mag-u-update ng umiiral na record
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

    // I-i-save sa CouchDB
    const response = await db.insert(certDocument);

    return res.status(200).json({
      success: true,
      message: 'Matagumpay na naisa-save ang certificate record sa CouchDB!',
      data: { ...certDocument, _rev: response.rev }
    });

  } catch (error) {
    console.error('Error in issueCertificate:', error);
    return res.status(500).json({
      success: false,
      message: 'Nagkaroon ng error habang sine-save ang certificate record.',
      error: error.message
    });
  }
};

// @desc    Get All Issued & Released Certificates (Para sa Reprint Queue)
// @route   GET /api/certificates/issued
// @access  Private / Public
exports.getIssuedCertificates = async (req, res) => {
  try {
    const db = req.app.get('db');

    if (!db) {
      return res.status(503).json({
        success: false,
        message: 'Database connection is not ready.'
      });
    }

    // Kukunin ang lahat ng documents mula sa CouchDB at i-fi-filter sa type === 'issued_certificate'
    const allDocs = await db.list({ include_docs: true });
    
    const issuedList = allDocs.rows
      .map((row) => row.doc)
      .filter((doc) => doc && doc.type === 'issued_certificate')
      .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

    return res.status(200).json({
      success: true,
      count: issuedList.length,
      data: issuedList
    });

  } catch (error) {
    console.error('Error fetching issued certificates:', error);
    return res.status(500).json({
      success: false,
      message: 'Hindi makuha ang listahan ng issued certificates.',
      error: error.message
    });
  }
};