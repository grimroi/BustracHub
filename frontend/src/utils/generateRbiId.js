// src/utils/generateRbiId.js

// RBI format: XX-XX-XX-XXX-XXXXXXXX (e.g. 05-17-23-005-00000001).
// NOTE: 05-17-23-005 is the LGU/Barangay code prefix. Confirm with the LGU
// before changing it; it must match the existing resident records.
const RBI_PREFIX = '05-17-23-005-';

export const generateRbiId = async (db) => {
  try {
    // Ensure may index para mabilis ang search
    try {
      await db.createIndex({ index: { fields: ['rbiId'] } });
    } catch (e) { /* Ignore if index exists */ }

    const result = await db.find({
      selector: {
        rbiId: { $regex: `^${RBI_PREFIX}` }
      },
      sort: [{ rbiId: 'desc' }],
      limit: 1
    });

    let sequence = 1;
    if (result.docs.length > 0) {
      const lastRbiId = result.docs[0].rbiId;
      const lastSeqStr = lastRbiId.split('-').pop();
      const parsed = parseInt(lastSeqStr, 10);
      if (!Number.isNaN(parsed)) sequence = parsed + 1;
    }

    const formattedSeq = String(sequence).padStart(8, '0');
    return `${RBI_PREFIX}${formattedSeq}`;
  } catch (err) {
    console.error("Error generating RBI ID:", err);
    // Fallback kung may error
    return `${RBI_PREFIX}${String(Date.now()).slice(-8)}`;
  }
};
