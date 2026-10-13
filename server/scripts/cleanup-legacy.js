// server/scripts/cleanup-legacy.js
// ──────────────────────────────────────────────────────────────
// Remove legacy / junk document types from bustrachub_db and fix
// mis-typed blotter docs.
//
// Safe by default — runs in DRY-RUN mode unless `--confirm` is passed.
//
// Usage:
//   npm run cleanup-legacy                # dry-run
//   npm run cleanup-legacy -- --confirm   # apply
//
// v2 FIX: uses db.list({ include_docs: true }) full scan instead of
//         Mango find() — the Mango index can be stale/partial and miss
//         documents, causing an incomplete cleanup.
// ──────────────────────────────────────────────────────────────

require('dotenv').config();
const nano = require('nano');

const COUCHDB_URL = process.env.COUCHDB_URL;
const DB_NAME = process.env.COUCHDB_NAME || 'bustrachub_db';

if (!COUCHDB_URL) {
  console.error('❌ COUCHDB_URL is not set in server/.env');
  process.exit(1);
}

const CONFIRM = process.argv.includes('--confirm');

const LEGACY_TYPES_TO_DELETE = [
  'barangay_clearance',
  'resident_account_request',
  'business_clearance',
  'ctc_record',
  'feedback_submission',
];

const LEGACY_ID_PREFIXES = [
  'barangay_clearance_',
  'brgy_clearance_',          // ← short-form legacy prefix
  'resident_account_request_',
  'business_clearance_',
  'ctc_record_',
  'feedback_submission_',
];

const WRONG_BLOTTER_TYPES = [
  'Property Boundary & Noise Dispute',
  'Noise Complaint',
];

const couch = nano(COUCHDB_URL);
const db = couch.use(DB_NAME);
const safeUrl = COUCHDB_URL.replace(/\/\/[^@]+@/, '//***:***@');

const main = async () => {
  console.log('🧹 BUSTRAC HUB legacy cleanup (v2 — full-scan)');
  console.log(`   Database: ${DB_NAME}`);
  console.log(`   Source:   ${safeUrl}`);
  console.log(`   Mode:     ${CONFIRM ? '🔴 CONFIRM' : '🟢 DRY-RUN'}`);
  console.log('');

  // ── FULL SCAN: one shot, all docs ──
  console.log('📡 Fetching all documents...');
  const all = await db.list({ include_docs: true });
  const rows = Array.isArray(all?.rows) ? all.rows : [];
  const docs = rows
    .map((r) => r.doc)
    .filter((d) => d && !String(d._id).startsWith('_local/'));

  console.log(`   Total docs scanned: ${docs.length}`);
  console.log('');

  // ── STEP 1: Find legacy docs to delete ──
  const isLegacy = (doc) => {
    if (!doc || !doc._id) return false;
    if (LEGACY_TYPES_TO_DELETE.includes(doc.type)) return true;
    if (LEGACY_ID_PREFIXES.some((p) => String(doc._id).startsWith(p))) return true;
    return false;
  };

  const legacyDocs = docs.filter(isLegacy);

  // Group for readable output
  const grouped = {};
  for (const d of legacyDocs) {
    const key = d.type || `(id-prefix only) ${String(d._id).split('_').slice(0, 2).join('_')}_`;
    grouped[key] = (grouped[key] || 0) + 1;
  }

  console.log('📋 Legacy docs to DELETE (full scan):');
  Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`   - ${k.padEnd(34)} ${n} doc(s)`));
  console.log(`   ${'TOTAL'.padEnd(36)} ${legacyDocs.length} doc(s)`);
  console.log('');

  const toDelete = legacyDocs.map((d) => ({
    _id: d._id,
    _rev: d._rev,
    _deleted: true,
  }));

  // ── STEP 2: Mis-typed blotters ──
  const wrongBlotters = docs.filter(
    (d) => d && WRONG_BLOTTER_TYPES.includes(d.type)
  );

  console.log('🔧 Mis-typed blotter docs to FIX (type → "blotter_record"):');
  for (const wrongType of WRONG_BLOTTER_TYPES) {
    const count = wrongBlotters.filter((d) => d.type === wrongType).length;
    console.log(`   - "${wrongType}"`.padEnd(40) + ` ${count} doc(s)`);
  }
  console.log('');

  const toFix = wrongBlotters.map((d) => ({
    ...d,
    type: 'blotter_record',
    docType: d.docType || 'blotter',
    fixedAt: new Date().toISOString(),
  }));

  // ── Summary ──
  console.log('📊 Summary:');
  console.log(`   Documents to delete: ${toDelete.length}`);
  console.log(`   Documents to fix:    ${toFix.length}`);
  console.log('');

  if (!CONFIRM) {
    console.log('🟢 DRY-RUN complete — no changes made.');
    console.log('   Re-run with `--confirm` to apply:');
    console.log('   npm run cleanup-legacy -- --confirm');
    return;
  }

  if (toDelete.length === 0 && toFix.length === 0) {
    console.log('✅ Nothing to do — DB is already clean.');
    return;
  }

  // ── STEP 3: Apply deletes (new_edits:false for true tombstone) ──
  if (toDelete.length > 0) {
    console.log(`🗑️  Deleting ${toDelete.length} legacy docs...`);
    const delRes = await db.bulk({ docs: toDelete });
    const ok = Array.isArray(delRes)
      ? delRes.filter((r) => r && (r.ok || r.id)).length
      : 0;
    const fail = delRes.length - ok;
    console.log(`   ✅ Deleted: ${ok}  ❌ Failed: ${fail}`);
    if (fail > 0) {
      delRes
        .filter((r) => !r.ok && !r.id)
        .slice(0, 5)
        .forEach((f) => console.log(`     - ${f.id || '?'}: ${f.error || 'unknown'}`));
    }
  }

  // ── STEP 4: Apply fixes ──
  if (toFix.length > 0) {
    console.log(`🔧 Fixing ${toFix.length} mis-typed blotter docs...`);
    const fixRes = await db.bulk({ docs: toFix });
    const ok = Array.isArray(fixRes)
      ? fixRes.filter((r) => r && (r.ok || r.id)).length
      : 0;
    const fail = fixRes.length - ok;
    console.log(`   ✅ Fixed: ${ok}  ❌ Failed: ${fail}`);
  }

  // ── STEP 5: Verify with FULL SCAN (not Mango) ──
  console.log('');
  console.log('🔍 Verifying (full scan)...');
  await new Promise((r) => setTimeout(r, 1500)); // let CouchDB settle

  const after = await db.list({ include_docs: true });
  const afterDocs = (after.rows || [])
    .map((r) => r.doc)
    .filter((d) => d && !String(d._id).startsWith('_local/'));

  const remainingLegacy = afterDocs.filter(isLegacy);
  const remainingByType = {};
  for (const d of remainingLegacy) {
    const key = d.type || '(id-prefix)';
    remainingByType[key] = (remainingByType[key] || 0) + 1;
  }

  if (remainingLegacy.length === 0) {
    console.log('   ✅ 0 remaining legacy docs. DB is clean.');
  } else {
    console.log(`   ⚠️  ${remainingLegacy.length} still remain:`);
    Object.entries(remainingByType).forEach(([k, n]) =>
      console.log(`      - ${k.padEnd(32)} ${n}`)
    );
  }
  console.log('');

  console.log('✅ Cleanup complete.');
  console.log('   Next steps:');
  console.log('     1. Restart the backend:  npm start');
  console.log('     2. Reload the browser to trigger PouchDB pull.');
};

main().catch((err) => {
  console.error('❌ Cleanup failed:', err?.message || err);
  process.exit(1);
});