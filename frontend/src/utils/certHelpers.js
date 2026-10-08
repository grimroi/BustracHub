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