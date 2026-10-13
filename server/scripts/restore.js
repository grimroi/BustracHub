// server/scripts/restore.js
// Restore a BUSTRAC HUB CouchDB backup from JSON.
//
// Usage:   npm run restore -- <backup-file.json> [--force]
// Example: npm run restore -- backups/bustrachub_db_2026-10-13T14-05-32.json

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

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npm run restore -- <backup-file.json> [--force]');
  process.exit(1);
}

const backupFile = path.resolve(args[0]);
const force = args.includes('--force');

if (!fs.existsSync(backupFile)) {
  console.error(`❌ Backup file not found: ${backupFile}`);
  process.exit(1);
}

const couch = nano(COUCHDB_URL);
const safeUrl = COUCHDB_URL.replace(/\/\/[^@]+@/, '//***:***@');

const main = async () => {
  const raw = fs.readFileSync(backupFile, 'utf8');
  const payload = JSON.parse(raw);
  const meta = payload._meta || {};
  const docs = Array.isArray(payload.docs) ? payload.docs : [];

  console.log(`📥 BUSTRAC HUB restore`);
  console.log(`   Backup file:  ${backupFile}`);
  console.log(`   Exported at:  ${meta.exportedAt || 'unknown'}`);
  console.log(`   Target:       ${safeUrl}/${DB_NAME}`);
  console.log(`   Documents:    ${docs.length}`);
  console.log('');

  // Ensure DB exists
  const dbs = await couch.db.list();
  if (!dbs.includes(DB_NAME)) {
    await couch.db.create(DB_NAME);
    console.log(`   Created database: ${DB_NAME}`);
  }

  const db = couch.use(DB_NAME);

  // Safety check: refuse if DB has existing docs unless --force
  const existing = await db.list({ limit: 1 });
  const existingCount = Array.isArray(existing?.rows) ? existing.rows.length : 0;
  if (existingCount > 0 && !force) {
    console.error(`❌ Target DB "${DB_NAME}" already has documents.`);
    console.error(`   Re-run with --force to merge (docs with same _id will be replaced).`);
    process.exit(2);
  }

  // Bulk insert preserving _revs for a true 1:1 restore
 await db.bulk({ docs, new_edits: false });
  const ok = Array.isArray(result)
    ? result.filter((r) => r && (r.ok || r.id)).length
    : 0;

  console.log(`✅ Restore complete`);
  console.log(`   Documents written: ${ok}/${docs.length}`);
  console.log('');
  console.log(`   Next steps:`);
  console.log(`     1. Restart the server:  npm start`);
  console.log(`     2. Reload the browser to trigger PouchDB pull.`);
};

main().catch((err) => {
  console.error('❌ Restore failed:', err?.message || err);
  process.exit(1);
});