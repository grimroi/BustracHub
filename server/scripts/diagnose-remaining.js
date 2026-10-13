// server/scripts/diagnose-remaining.js
// Diagnose remaining barangay_clearance docs after cleanup.
require('dotenv').config();
const nano = require('nano');

const couch = nano(process.env.COUCHDB_URL);
const db = couch.use(process.env.COUCHDB_NAME || 'bustrachub_db');

(async () => {
  console.log('🔍 Diagnosing remaining barangay_clearance docs...\n');

  // Query 1: by type
  const byType = await db.find({ selector: { type: 'barangay_clearance' } });
  console.log(`📊 Found via type:"barangay_clearance"  → ${byType.docs.length} docs\n`);

  byType.docs.forEach((d) => {
    console.log(`  _id:       ${d._id}`);
    console.log(`  _rev:      ${d._rev}`);
    console.log(`  type:      ${d.type}`);
    console.log(`  docType:   ${d.docType || '(none)'}`);
    console.log(`  _deleted:  ${d._deleted === true ? '⚠️ TRUE' : 'false'}`);
    console.log(`  _conflicts:${d._conflicts ? ' ⚠️ ' + JSON.stringify(d._conflicts) : ' none'}`);
    console.log('');
  });

  // Query 2: check by docType variant
  const byDocType = await db.find({ selector: { docType: 'barangay_clearance' } });
  console.log(`📊 Found via docType:"barangay_clearance" → ${byDocType.docs.length} docs\n`);

  // Query 3: full list scan (compare)
  const all = await db.list({ include_docs: true });
  const scan = (all.rows || [])
    .map((r) => r.doc)
    .filter((d) => d && (d.type === 'barangay_clearance' || d.docType === 'barangay_clearance'));
  console.log(`📊 Full scan (type OR docType) → ${scan.length} docs\n`);

  console.log('✅ Diagnosis complete.');
})().catch((e) => console.error('❌', e?.message || e));