// server/seed.js — standalone demo-account seeder (`npm run seed`).
//
// Connects to CouchDB directly (server-side credentials only) and ensures the
// known test accounts exist with the documented passwords/roles so live-demo
// logins never fail with 401. The same routine runs automatically on server
// startup via initDB() in index.js.

require('dotenv').config();
const nano = require('nano');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { seedDefaultUsers } = require('./seedUsers');

const BCRYPT_PREFIX = '$2';
const SHA256_HEX_LENGTH = 64;

const isBcryptHash = (value) =>
  typeof value === 'string' && value.startsWith(BCRYPT_PREFIX);

const isSha256Hash = (value) =>
  typeof value === 'string' &&
  value.length === SHA256_HEX_LENGTH &&
  /^[0-9a-f]{64}$/i.test(value);

const hashPassword = async (password, rounds = 10) => {
  const salt = await bcrypt.genSalt(rounds);
  return bcrypt.hash(String(password), salt);
};

const verifyPassword = async (password, storedHash) => {
  if (!storedHash) return false;
  if (isBcryptHash(storedHash)) {
    try {
      return await bcrypt.compare(String(password), storedHash);
    } catch (e) {
      return false;
    }
  }
  if (isSha256Hash(storedHash)) {
    const digest = crypto.createHash('sha256').update(String(password)).digest('hex');
    return digest === storedHash;
  }
  return false;
};

(async () => {
  const COUCHDB_URL = process.env.COUCHDB_URL;
  if (!COUCHDB_URL) {
    console.error('[seed] COUCHDB_URL environment variable is not set.');
    process.exit(1);
  }

  const couch = nano(COUCHDB_URL);
  const DB_NAME = process.env.COUCHDB_DB || 'bustrachub_db';

  const dbList = await couch.db.list();
  if (!dbList.includes(DB_NAME)) {
    await couch.db.create(DB_NAME);
    console.log(`[seed] Created missing database: "${DB_NAME}"`);
  }

  const db = couch.use(DB_NAME);
  await seedDefaultUsers(db, { hashPassword, verifyPassword });
  process.exit(0);
})().catch((err) => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});