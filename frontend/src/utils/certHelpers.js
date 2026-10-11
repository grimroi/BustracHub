// src/utils/certHelpers.js
export const getApplicantName = (cert) => {
  if (!cert) return 'Unnamed Applicant';
  if (cert.applicantType === 'Business' || cert.businessName) {
    return `${cert.businessName || 'Business'} (${cert.ownerName || 'No Owner'})`;
  }
  const fullName = `${cert.firstName || ''} ${cert.lastName || ''}`.trim();
  return fullName || cert.fullName || 'Unnamed Applicant';
};

export const normalizeCertType = (type) => {
  if (!type) return 'clearance';
  const t = String(type).toLowerCase().trim();

  if (t.includes('business')) return 'business';
  if (t.includes('indigency') || t.includes('job seeker') || t.includes('jobseeker')) return 'indigency';
  if (t.includes('residency') || t.includes('resident')) return 'residency';
  if (t.includes('clearance')) return 'clearance';

  return 'clearance'; // safest fallback
};

/**
 * Validates certificate data for required fields per certificate type.
 * Returns { valid: true } if all required fields are present, otherwise
 * returns { valid: false, missing: [...] } listing every missing field.
 *
 * Required fields by type:
 *   - clearance / indigency / residency (individual): firstName, lastName, dateIssued, purpose
 *   - business: businessName, ownerName, dateIssued, purpose
 * All types: certificateType
 */
export const validateCertificateData = (cert) => {
  if (!cert) return { valid: false, missing: ['certificate data'] };

  const missing = [];
  const certType = normalizeCertType(cert.certificateType);

  if (!cert.certificateType) missing.push('Certificate Type');

  const isBusiness = certType === 'business' || cert.applicantType === 'Business' || cert.businessName;

  if (isBusiness) {
    if (!cert.businessName) missing.push('Business Name');
    if (!cert.ownerName) missing.push('Owner Name');
  } else {
    // Accept either explicit first/last name fields OR a composed full name.
    const hasExplicitName = cert.firstName || cert.lastName;
    const hasComposedName =
      cert.fullName || cert.applicantName ||
      `${cert.firstName || ''} ${cert.lastName || ''}`.trim();
    if (!hasExplicitName && !hasComposedName) {
      missing.push('Applicant Name');
    }
  }

  if (!cert.dateIssued && !cert.issuedAt && !cert.issueDate && !cert.createdAt) missing.push('Date Issued');
  if (!cert.purpose) missing.push('Purpose');

  return missing.length === 0 ? { valid: true } : { valid: false, missing };
};