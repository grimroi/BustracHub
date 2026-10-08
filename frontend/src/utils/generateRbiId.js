// src/utils/generateRbiId.js
export const generateRbiId = async (db) => {
  try {
    const year = new Date().getFullYear();
    const prefix = `05-16-${year}-`; // Palitan ang 05-16 ng tamang LGU/Barangay Code
    
    // Ensure may index para mabilis ang search
    try {
      await db.createIndex({ index: { fields: ['rbiId'] } });
    } catch (e) { /* Ignore if index exists */ }

    const result = await db.find({
      selector: {
        rbiId: { $regex: `^${prefix}` }
      },
      sort: [{ rbiId: 'desc' }],
      limit: 1
    });

    let sequence = 1;
    if (result.docs.length > 0) {
      const lastRbiId = result.docs[0].rbiId;
      const lastSeqStr = lastRbiId.split('-').pop(); 
      sequence = parseInt(lastSeqStr, 10) + 1;
    }

    const formattedSeq = String(sequence).padStart(5, '0');
    return `${prefix}${formattedSeq}`;
  } catch (err) {
    console.error("Error generating RBI ID:", err);
    // Fallback kung may error
    return `05-16-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
  }
};