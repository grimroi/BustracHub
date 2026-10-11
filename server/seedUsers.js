// server/seedUsers.js
// Startup seeding for known test accounts in CouchDB.
//
// Unlike the old inline seeder, this routine does NOT only insert missing
// accounts: it also realigns EXISTING accounts whose password hash, role, or
// profile fields no longer match the documented demo credentials. This
// guarantees `admin` / `staff` / `resident` (password `password`) never fail
// live-demo logins with a 401 even if a stale document exists in CouchDB.

// Fields from a spec that are persisted onto the user document.
const PROFILE_FIELDS = [
  'path',
  'fullName',
  'firstName',
  'lastName',
  'residentId',
  'purok',
  'age',
  'birthdate',
  'gender',
  'civilStatus',
  'contact',
  'household',
  'voterStatus',
  'email',
  'status',
];

// Required demo accounts plus the original legacy demo accounts (kept so
// existing demos and display-name maps in the frontend keep working).
const SEED_USERS = [
  {
    username: 'admin',
    password: 'password',
    role: 'admin',
    path: '/admin',
    fullName: 'System Administrator',
    contact: '09170000000',
    email: 'admin@bustrac.gov.ph',
  },
  {
    username: 'staff',
    password: 'password',
    role: 'staff',
    path: '/staff',
    fullName: 'Barangay Staff',
    contact: '09170000001',
    email: 'staff@bustrac.gov.ph',
  },
  {
    username: 'resident',
    password: 'password',
    role: 'resident',
    path: '/',
    fullName: 'Juan Dela Cruz',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    residentId: 'RES-0001',
    purok: '3',
    age: 34,
    birthdate: '1990-03-12',
    gender: 'Male',
    civilStatus: 'Married',
    contact: '09171234567',
    household: 'HH-0012 — Dela Cruz Family',
    voterStatus: 'Registered Voter',
  },
  // Legacy demo accounts for backward compatibility.
  { username: 'mgcortero', password: 'password', role: 'staff', path: '/staff', fullName: 'Mark Gian Cortero' },
  { username: 'jmacabangon', password: 'password', role: 'admin', path: '/admin', fullName: 'Juhairo Macabangon' },
  { username: 'juan2026', password: 'password', role: 'resident', path: '/', fullName: 'Juan Dela Cruz', residentId: 'RES-0001', purok: '3', contact: '09171234567' },
  { username: 'juanreyes', password: 'password123', role: 'resident', path: '/', fullName: 'Juan Reyes', residentId: 'RES-0002', purok: '1', contact: '09181234567' },
];

const buildProfilePatch = (spec) => {
  const patch = {};
  for (const field of PROFILE_FIELDS) {
    if (spec[field] !== undefined) patch[field] = spec[field];
  }
  patch.status = 'Active'; // seeded accounts must never start deactivated
  return patch;
};

const hasProfileDiff = (doc, patch) =>
  Object.keys(patch).some((key) => doc[key] !== patch[key]);

const is404 = (err) => Boolean(err && (err.statusCode === 404 || err.status === 404));

/**
 * Seeds/verifies every known test account.
 *
 * @param {object} db                  nano database handle (couch.use(DB_NAME))
 * @param {Function} hashPassword      async (password) => bcrypt hash (server's)
 * @param {Function} verifyPassword    async (password, storedHash) => boolean
 * @returns {Promise<{seeded:number,updated:number,verified:number,failed:number}>}
 */
const seedDefaultUsers = async (db, { hashPassword, verifyPassword }) => {
  const results = { seeded: 0, updated: 0, verified: 0, failed: 0 };

  for (const spec of SEED_USERS) {
    const normalizedUsername = String(spec.username).toLowerCase();
    const id = `user_${normalizedUsername}`;
    const patch = buildProfilePatch(spec);
    const role = String(spec.role).toLowerCase();

    try {
      // 1. Resolve the existing document (primary: canonical _id, secondary:
      //    any user doc carrying the same username).
      let userDoc = null;
      try {
        userDoc = await db.get(id);
      } catch (err) {
        if (!is404(err)) throw err;
      }

      if (!userDoc) {
        try {
          const found = await db.find({
            selector: { type: 'user', username: spec.username },
            limit: 1,
          });
          if (found.docs && found.docs.length > 0) userDoc = found.docs[0];
        } catch (findErr) {
          // Fallback is best-effort; the canonical _id lookup is authoritative.
          console.warn(`[seed] Username lookup for "${spec.username}" failed, falling back to canonical id only.`, findErr.message);
        }
      }

      if (!userDoc) {
        // ── NEW ACCOUNT ──────────────────────────────────────────────
        const created = {
          _id: id,
          type: 'user',
          username: normalizedUsername,
          passwordHash: await hashPassword(spec.password),
          role,
          ...patch,
        };
        await db.insert(created);
        results.seeded++;
        console.log(`[seed] Created test account: ${normalizedUsername} (role: ${role}, password: ${spec.password})`);
        continue;
      }

      // ── EXISTING ACCOUNT ───────────────────────────────────────────
      const samePassword = await verifyPassword(spec.password, userDoc.passwordHash);
      if (samePassword && String(userDoc.role || '').toLowerCase() === role && !hasProfileDiff(userDoc, patch)) {
        results.verified++;
        console.log(`[seed] Verified test account: ${normalizedUsername} (role: ${role}, password: ${spec.password}) — no changes needed.`);
        continue;
      }

      const updated = {
        ...userDoc,
        ...patch,
        _id: userDoc._id,
        _rev: userDoc._rev,
        type: 'user',
        username: normalizedUsername,
        role,
        passwordHash: await hashPassword(spec.password),
      };
      await db.insert(updated);
      results.updated++;
      console.log(`[seed] Updated test account: ${normalizedUsername} (role: ${role}, password: ${spec.password}) to match demo credentials.`);
    } catch (err) {
      results.failed++;
      console.error(`[seed] Failed to seed/verify account: ${spec.username}`, err.message);
    }
  }

  console.log(
    `[seed] Demo accounts ready → created: ${results.seeded}, updated: ${results.updated}, verified: ${results.verified}, failed: ${results.failed}`
  );
  return results;
};

module.exports = { seedDefaultUsers, SEED_USERS };