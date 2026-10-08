export const checkDailyRequestLimit = async (db, residentId, limit = 5) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const res = await db.allDocs({
    include_docs: true,
    startkey: 'CERT-',
    endkey: 'CERT-\ufff0'
  });
  
  const count = res.rows
    .map(r => r.doc)
    .filter(doc => 
      doc && 
      doc.residentId === residentId &&
      (doc.createdAt || doc.requestedAt || '') >= oneDayAgo &&
      doc.status !== 'Cancelled'
    ).length;
    
  return count >= limit;
};

export const checkPendingTypeLimit = async (db, residentId, certType, limit = 3) => {
  const res = await db.allDocs({
    include_docs: true,
    startkey: 'CERT-',
    endkey: 'CERT-\ufff0'
  });
  
  const count = res.rows
    .map(r => r.doc)
    .filter(doc =>
      doc &&
      doc.residentId === residentId &&
      doc.certificateType === certType &&
      ['Submitted', 'Under Review', 'Pending'].includes(doc.status)
    ).length;
    
  return count >= limit;
};