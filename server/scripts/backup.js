// server/scripts/backup.js
// ──────────────────────────────────────────────────────────────
// Full JSON backup of the BUSTRAC HUB CouchDB database.
//
// Usage:   npm run backup
// Output:  server/backups/bustrachub_db_YYYY-MM-DDTHH-mm-ss.json
//
// - Dumps EVERY document (including design docs and audit_log docs)
// - Includes attachment bodies (base64-encoded) so it is a true 1:1 dump
// - Skips _local/ docs (per-device replication checkpoints — never restore these)
// ──────────────────────────────────────────────────────────────

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nano = require('nano');

const COUCHDB_URL = process.env.COUCHDB_URL;
const DB_NAME = process.env.COUCHDB_NAME || 'bustrachub_db';

if (!COUCHDB_URL) {
  console.error('❌ COUCHDB_URL is not set in server/.env');
  process.exit(1);
}

const couch = nano(COUCHDB_URL);
const db = couch.use(DB_NAME);

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .slice(0, 19); // e.g. 2026-10-13T14-05-32

const backupDir = path.join(__dirname, '..', 'backups');
const backupFile = path.join(backupDir, `${DB_NAME}_${timestamp}.json`);

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Mask admin credentials so the log never prints them
const safeUrl = COUCHDB_URL.replace(/\/\/[^@]+@/, '//***:***@');

const main = async () => {
  ensureDir(backupDir);

  console.log(`📦 BUSTRAC HUB backup`);
  console.log(`   Database: ${DB_NAME}`);
  console.log(`   Source:   ${safeUrl}`);
  console.log(`   Target:   ${backupFile}`);
  console.log('');

  const startedAt = Date.now();

  // Fetch every doc, INCLUDING attachments (base64 body), EXCLUDING _local/
  const result = await db.list({
    include_docs: true,
    attachments: true,
  });

  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const docs = rows
    .map((row) => row.doc)
    .filter((doc) => doc && !String(doc._id).startsWith('_local/'));

  const skipped = rows.length - docs.length;

  // Group a tiny per-type summary so the backup log is thesis-useful
  const counts = {};
  for (const doc of docs) {
    const t = String(doc.type || doc.docType || '_design/unknown');
    counts[t] = (counts[t] || 0) + 1;
  }

  const payload = {
    _meta: {
      system: 'BUSTRAC HUB',
      database: DB_NAME,
      source: safeUrl,
      exportedAt: new Date().toISOString(),
      format: 'couchdb-json-dump-v1',
      docCount: docs.length,
      skippedLocalDocs: skipped,
      docCountsByType: counts,
    },
    docs,
  };

  fs.writeFileSync(backupFile, JSON.stringify(payload, null, 2), 'utf8');

  const sizeBytes = fs.statSync(backupFile).size;
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
  const duration = ((Date.now() - startedAt) / 1000).toFixed(2);

  console.log('✅ Backup complete');
  console.log(`   Documents backed up: ${docs.length}`);
  console.log(`   Skipped _local/:     ${skipped}`);
  console.log(`   File size:           ${sizeMB} MB`);
  console.log(`   Duration:            ${duration}s`);
  console.log('');
  console.log('   Documents per type:');
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`     - ${t.padEnd(28)} ${n}`));
  console.log('');
  console.log(`   Saved to: ${backupFile}`);
};

main().catch((err) => {
  console.error('❌ Backup failed:', err?.message || err);
  process.exit(1);
});