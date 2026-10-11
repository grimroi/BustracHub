require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nano = require('nano');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const certificateRoutes = require('./routes/certificateRoutes');
const blotterRoutes = require('./routes/blotterRoutes');
const { seedDefaultUsers } = require('./seedUsers');
const { sendBlotterNotification } = require('./services/emailService');
const { sendResidentSMS } = require('./services/smsService');

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
      console.warn('bcrypt compare failed:', e?.message);
      return false;
    }
  }
  if (isSha256Hash(storedHash)) {
    const digest = crypto.createHash('sha256').update(String(password)).digest('hex');
    return digest === storedHash;
  }
  return false;
};

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
// ──────────────────────────────────────────────────────────────
// CORS — origin reflection instead of the wildcard "*".
//
// The frontend (Vite on :5173, or a phone on the same Wi-Fi) and PouchDB
// replication send `Authorization` headers, which browsers treat as
// credentialed requests. The spec forbids `Access-Control-Allow-Origin: *`
// for such requests, so we:
//   1. Echo back the specific requesting origin.
//   2. Send `Access-Control-Allow-Credentials: true`.
//   3. Only echo origins we trust (configured list + loopback/LAN dev hosts).
//   4. Allow OPTIONS preflight with the headers/methods the app actually uses
//      (Content-Type, Authorization, Accept) for every /api/* route.
// ──────────────────────────────────────────────────────────────
const DEFAULT_FRONTEND_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
];

const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .concat(DEFAULT_FRONTEND_ORIGINS);

const isLoopbackHost = (hostname) =>
  !hostname ||
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]' ||
  hostname === '::1' ||
  hostname.startsWith('127.');

const isAllowedOrigin = (origin) => {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    // The frontend rewrites its API base to the page's own host when opened
    // from another device on the same LAN, so allow loopback/LAN dev hosts.
    return isLoopbackHost(new URL(origin).hostname);
  } catch {
    return false;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      return callback(null, true); // echo the request origin
    }
    return callback(null, false); // block: no CORS headers sent
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
}));
// PouchDB replication issues POST/PUT requests with bodies (`_revs_diff`,
// `_bulk_docs`, `_ensure_full_commit`, document writes). The sync proxy must
// forward those bytes verbatim, so capture the raw stream for every /api/sync
// request BEFORE body-parser runs. Consuming the stream marks the request as
// finished, which makes body-parser (read.js onFinished.isFinished) skip it,
// so non-JSON content is preserved and req.rawBody stays available to both the
// proxy and the resident ownership checks in authorizeResidentWrite().
const captureSyncBody = (req, res, next) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
    req._body = true; // belt-and-suspenders guard for older body-parser builds
    next();
  });
  req.on('error', (err) => {
    req.rawBody = Buffer.alloc(0);
    req._body = true;
    next(err);
  });
};
app.use('/api/sync', captureSyncBody);

app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    // Capture the raw body so other API routes can forward it verbatim
    // without re-serializing (which corrupts binary payloads and drops
    // the original Content-Length).
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

const COUCHDB_URL = process.env.COUCHDB_URL;
if (!COUCHDB_URL) {
  console.error('❌ COUCHDB_URL environment variable is not set. Cannot connect to CouchDB.');
  process.exit(1);
}
const couch = nano(COUCHDB_URL);
const DB_NAME = 'bustrachub_db';
let db;

// ──────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE — Bearer token issued by /api/login
// Token is a signed opaque session id bound to a role. It does NOT
// carry CouchDB credentials. CouchDB admin credentials stay in
// COUCHDB_URL on the server only.
// ──────────────────────────────────────────────────────────────
const SESSIONS = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

const issueSessionToken = (user) => {
  const token = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  SESSIONS.set(token, { user, expiresAt });
  setTimeout(() => SESSIONS.delete(token), SESSION_TTL_MS + 1000);
  return token;
};

const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !SESSIONS.has(token)) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  const session = SESSIONS.get(token);
  if (Date.now() > session.expiresAt) {
    SESSIONS.delete(token);
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
  req.user = session.user;
  req.sessionToken = token;
  next();
};

const requireRole = (...allowedRoles) => (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
  }
  next();
};

// Authorization for the sync proxy is role-aware:
//   - admin / staff  → unrestricted read + write within the app DB.
//   - residents       → may read replicated data and write ONLY documents
//                       they own (certificate requests, feedback, their own
//                       profile). See authorizeSyncAccess below.
// The implementation lives after ALLOWED_DB/WRITE_METHODS are defined.

// ──────────────────────────────────────────────────────────────
// COUCHDB SYNC PROXY — /api/sync/:dbId/*
// Streams every CouchDB request through the server so the browser
// never holds admin credentials. Supports reads, writes, bulk docs,
// changes feeds, and replication because it is a 1:1 proxy.
//
// Security boundaries:
//   - ALLOWED_DB restricts the proxy to the single application database.
//     Any other dbId is rejected with 404 (not 403) to avoid fingerprinting.
//   - admin/staff write access is unrestricted within the app DB.
//   - Residents may only write documents they own (certificate requests,
//     feedback, their own profile), enforced by authorizeResidentWrite on
//     the payload before any upstream CouchDB request is constructed.
//   - CouchDB admin credentials are read from COUCHDB_URL (server-side
//     only) and never reach the client.
// ──────────────────────────────────────────────────────────────
const { URL } = require('url');

const ALLOWED_DB = DB_NAME;
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// ──────────────────────────────────────────────────────────────
// SYNC PROXY AUTHORIZATION
// ──────────────────────────────────────────────────────────────

// Document types a resident may legitimately create/update. Anything else
// (blotter reports, announcements, issued certificates, users, settings,
// other residents' data) requires an admin/staff session.
const RESIDENT_WRITE_TYPES = new Set([
  'certificate_request',
  'certificate',
  'feedback_report',
  'feedback',
  'resident_profile',
  'resident',
  'profile',
  'user', // restricted further below to the resident's own account
]);

// True when `doc` can be attributed to the authenticated resident.
const docOwnedBy = (doc, user) => {
  if (!doc || typeof doc !== 'object') return false;

  const username = String(doc.username || '').toLowerCase();
  const residentId = String(doc.residentId || '');
  const userUsername = String(user.username || '').toLowerCase();
  const userResidentId = String(user.residentId || '');

  const sameUsername = Boolean(username) && username === userUsername && Boolean(userUsername);
  const sameResidentId = Boolean(residentId) && userResidentId && residentId === userResidentId;

  // A resident may only touch their own account document.
  if (doc.type === 'user') {
    const expectedId = `user_${userUsername}`;
    return (doc._id === expectedId || sameUsername) && sameUsername;
  }

  if (!RESIDENT_WRITE_TYPES.has(doc.type)) return false;
  return sameUsername || sameResidentId;
};

// For updates to an existing document, also confirm the CURRENT document
// belongs to the resident (prevents overwriting another resident's record
// whose id happens to be known).
const verifyExistingDocOwnership = async (nanoDb, doc, user) => {
  if (!doc || !doc._id) return true;
  const existing = await nanoDb.get(doc._id).catch(() => null);
  if (!existing) return true; // new document
  return docOwnedBy(existing, user);
};

// Gate for resident-originated writes. admin/staff never reach this point.
const authorizeResidentWrite = (req, res, next) => {
  const segments = Array.isArray(req.params.rest) ? req.params.rest : [];
  const head = String(segments[0] || '').toLowerCase();

  // Replication bookkeeping + read helpers are always safe to pass through.
  if (head === '_local' || head === '_revs_diff' || head === '_ensure_full_commit' || head === '_changes') {
    return next();
  }

  // Bulk write — inspect every document in the batch.
  if (head === '_bulk_docs') {
    let parsed;
    try {
      parsed = JSON.parse((req.rawBody || '').toString() || '{}');
    } catch (e) {
      return res.status(400).json({ error: 'bad_request', reason: 'Malformed _bulk_docs payload.' });
    }
    const docs = Array.isArray(parsed.docs) ? parsed.docs : [];
    if (docs.length === 0) return next();

    const nanoDb = req.app.get('db');
    return Promise.all(docs.map((doc) => verifyExistingDocOwnership(nanoDb, doc, req.user)))
      .then((owned) => {
        for (let i = 0; i < docs.length; i++) {
          if (!docOwnedBy(docs[i], req.user) || !owned[i]) {
            return res.status(403).json({
              error: 'forbidden',
              reason: 'Residents may only write documents they own.',
            });
          }
        }
        return next();
      })
      .catch(() => res.status(500).json({ error: 'unavailable', reason: 'Ownership check failed.' }));
  }

  // Single-document create/update (including POST to the DB root).
  if (!head.startsWith('_')) {
    let parsed;
    try {
      parsed = JSON.parse((req.rawBody || '').toString() || '{}');
    } catch (e) {
      return res.status(400).json({ error: 'bad_request', reason: 'Malformed document payload.' });
    }
    const nanoDb = req.app.get('db');
    return verifyExistingDocOwnership(nanoDb, parsed, req.user)
      .then((owned) => {
        if (!docOwnedBy(parsed, req.user) || !owned) {
          return res.status(403).json({
            error: 'forbidden',
            reason: 'Residents may only write documents they own.',
          });
        }
        return next();
      })
      .catch(() => res.status(500).json({ error: 'unavailable', reason: 'Ownership check failed.' }));
  }

  return res.status(403).json({ error: 'forbidden', reason: 'Residents may not write this resource.' });
};

// Master gate for every sync proxy route. Only reached after `authenticate`.
const authorizeSyncAccess = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();

  if (role === 'admin' || role === 'staff') {
    return next();
  }

  if (role === 'resident') {
    const isWrite = WRITE_METHODS.has(String(req.method || '').toUpperCase());
    if (isWrite) return authorizeResidentWrite(req, res, next);
    return next(); // authenticated residents may read replicated data
  }

  return res.status(403).json({ error: 'forbidden', reason: 'Unknown role.' });
};

const couchUrl = new URL(COUCHDB_URL);
const COUCH_HOST = couchUrl.hostname;
const COUCH_PORT = Number(couchUrl.port) || (couchUrl.protocol === 'https:' ? 443 : 5984);
const COUCH_PROTOCOL = couchUrl.protocol === 'https:' ? require('https') : require('http');
const UPSTREAM_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS) || 120000;

// Hop-by-hop headers must not be forwarded verbatim.
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

// Headers that are always overridden by the proxy implementation.
const OVERRIDE_HEADERS = new Set(['host', 'content-length']);

const proxyCouch = (req, res) => {
  // 1. Database allowlist — reject any database that is not the app DB.
  const dbId = req.params.dbId;
  if (dbId !== ALLOWED_DB) {
    return res.status(404).json({ error: 'not_found', reason: 'database not allowed' });
  }

  // 2. Reconstruct the nested CouchDB path from the Express wildcard.
  //    Express 5 / path-to-regexp 8.x populates req.params.rest as an
  //    array of path segments, so join them explicitly to preserve
  //    URL encoding (each segment is already decoded by Express). Guard
  //    against older/other Express versions that may deliver a raw string
  //    so the db name and sub-path are never dropped.
  const rawRest = req.params.rest;
  const segments = Array.isArray(rawRest)
    ? rawRest
    : typeof rawRest === 'string' && rawRest.length > 0
      ? rawRest.split('/')
      : [];
  const subPath = segments.map((s) => String(s)).filter(Boolean).join('/');
  const couchPath = subPath ? `/${dbId}/${subPath}` : `/${dbId}`;

  // 3. Preserve the original query string (e.g. feed=continuous&since=0).
  const originalUrl = req.originalUrl || req.url || '';
  const queryIndex = originalUrl.indexOf('?');
  const queryString = queryIndex >= 0 ? originalUrl.slice(queryIndex + 1) : '';

  const upstreamPath = queryString ? `${couchPath}?${queryString}` : couchPath;

  // 4. Forward only the headers CouchDB actually needs. Hop-by-hop and
  //    overridden headers are excluded; Content-Length is recomputed
  //    from the streamed body below.
  const forwardHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (OVERRIDE_HEADERS.has(lower)) continue;
    if (lower === 'authorization') continue; // never forward client auth
    forwardHeaders[key] = value;
  }
  if (!forwardHeaders['content-type']) {
    forwardHeaders['content-type'] = 'application/json';
  }
  if (!forwardHeaders['accept']) {
    forwardHeaders['accept'] = 'application/json, text/plain';
  }

  const options = {
    hostname: COUCH_HOST,
    port: COUCH_PORT,
    path: upstreamPath,
    method: req.method,
    headers: forwardHeaders,
  };

  // Server-side CouchDB admin credentials only.
  if (couchUrl.username) {
    options.auth = `${decodeURIComponent(couchUrl.username)}:${decodeURIComponent(couchUrl.password || '')}`;
  }

  // 5. Forward the request body. Replication writes (_revs_diff, _bulk_docs,
  //    _ensure_full_commit, document puts) carry a payload, and the global
  //    express.json() consumed the original stream, so we write the raw buffer
  //    captured by captureSyncBody() (req.rawBody) verbatim with an explicit
  //    Content-Length. Recomputing the length avoids falling back to
  //    Transfer-Encoding: chunked, which some CouchDB setups/reverse proxies
  //    reject for these endpoints.
  const hasBody = !(req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE');
  const rawBody = hasBody ? (req.rawBody || Buffer.alloc(0)) : null;
  if (hasBody) {
    forwardHeaders['content-length'] = String(rawBody.length);
  }

  let timedOut = false;

  const respondUpstreamError = (status, reason, detail) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json({
      error: status === 504 ? 'gateway_timeout' : 'bad_gateway',
      reason,
      detail,
    });
  };

  const proxyReq = COUCH_PROTOCOL.request(options, (proxyRes) => {
    // Copy status and response headers (skip hop-by-hop).
    res.status(proxyRes.statusCode);
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP.has(lower)) continue;
      res.setHeader(key, value);
    }
    // Surface mid-stream upstream failures instead of leaving the client with
    // a truncated/opaque response.
    proxyRes.on('error', (err) => {
      respondUpstreamError(502, 'Upstream stream error.', err.message);
    });
    // Pipe the upstream response body to the client. This preserves
    // streaming responses such as continuous _changes feeds.
    proxyRes.pipe(res);
  });

  // 6. Upstream timeout — abort if CouchDB stays silent past the threshold
  //    (generous default for slow _revs_diff/_bulk_docs under load, tunable
  //    via PROXY_TIMEOUT_MS).
  proxyReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    timedOut = true;
    proxyReq.destroy(new Error(`upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`));
  });

  // 7. Always answer with structured JSON rather than leaking a raw 502.
  //    Distinguish a genuine timeout (504) from a connection failure (502).
  proxyReq.on('error', (err) => {
    if (res.writableEnded) return;
    if (timedOut) {
      return respondUpstreamError(504, 'CouchDB did not respond before the proxy timeout.', err.message);
    }
    return respondUpstreamError(502, 'CouchDB unreachable or the connection failed.', err.message);
  });

  // 8. Abort the upstream request only when the CLIENT actually disconnects.
  //    Listening on `req` 'close' is wrong: in modern Node it fires as soon as
  //    the request body is fully received, which destroyed slow upstream
  //    requests (e.g. _revs_diff, _local checkpoints) and produced spurious
  //    502 Bad Gateway responses. `res` 'close' fires on a real disconnect, so
  //    guard on the response not having finished.
  res.on('close', () => {
    if (!res.writableFinished && !proxyReq.destroyed) {
      proxyReq.destroy();
    }
  });

  // 9. Forward the captured raw body, or end the request if there is none.
  if (hasBody) {
    if (rawBody.length > 0) {
      proxyReq.write(rawBody);
    }
    proxyReq.end();
  } else {
    proxyReq.end();
  }
};

// Public read-only endpoints (verification + issued list) stay unauthenticated.
// The certificate and blotter routers are factories that receive the
// authentication and authorization middleware at mount time. This
// defers their construction until after authenticate and requireRole
// are defined, avoiding a temporal dead zone error.
app.use('/api/certificates', certificateRoutes(authenticate, requireRole));
app.use('/api/blotter', blotterRoutes(authenticate, requireRole));

async function initDB() {
  try {
    const dbList = await couch.db.list();
    if (!dbList.includes(DB_NAME)) {
      await couch.db.create(DB_NAME);
      console.log(`Created missing database: "${DB_NAME}"`);
    } else {
      console.log(`Connected to existing CouchDB database: "${DB_NAME}"`);
    }
    db = couch.use(DB_NAME);
    app.set('db', db);

    // CouchDB Mango Index (created/verified BEFORE seeding so the username
    // lookup fallback inside the seeder is reliable).
    try {
      await db.createIndex({ index: { fields: ['type', 'username'] }, name: 'user-type-username-index' });
      console.log('CouchDB Mango Index created/verified!');
    } catch (idxErr) {
      console.warn('Index warning:', idxErr.message);
    }

    // Seed/verify the known demo accounts. Existing documents are realigned
    // (password hash, role, profile fields) if they drift from the documented
    // credentials, so demo logins never 401 because of a stale user doc.
    await seedDefaultUsers(db, { hashPassword, verifyPassword });
  } catch (error) {
    console.error('CouchDB Connection Failed!', error);
    throw error; // ⬅️ I-throw para hindi tumuloy ang listener kung sabog ang DB
  }
}

// API Routes
app.get('/api/status', (req, res) => {
  res.json({ status: "online", message: "BustracHub Backend Server is active!" });
});

// ──────────────────────────────────────────────────────────────
// Login Endpoint — issues a server-side session token (no CouchDB
// credentials exposed to the client).
// ──────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing username or password' });
  }

  try {
    const db = req.app.get('db');
    let userDoc = null;

    try {
      userDoc = await db.get(`user_${username.toLowerCase()}`);
    } catch (e) { /* fallthrough */ }

    if (!userDoc) {
      const query = { selector: { type: 'user', username: username.trim() }, limit: 1 };
      const result = await db.find(query);
      if (result.docs && result.docs.length > 0) {
        userDoc = result.docs[0];
      }
    }

    if (!userDoc) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const trimmedPassword = String(password).trim();
    const passwordMatchesHash = userDoc.passwordHash
      ? await verifyPassword(trimmedPassword, userDoc.passwordHash)
      : false;

    if (!passwordMatchesHash) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Upgrade legacy SHA-256 hashes to bcrypt on successful login.
    if (userDoc.passwordHash && !isBcryptHash(userDoc.passwordHash)) {
      try {
        await db.put({ ...userDoc, passwordHash: await hashPassword(trimmedPassword) });
      } catch (rehashErr) {
        console.warn('Failed to rehash legacy password:', rehashErr?.message);
      }
    }

    const accountStatus = userDoc.status || 'Active';
    if (String(accountStatus).toLowerCase() === 'deactivated') {
      return res.status(403).json({ success: false, message: 'This account has been deactivated. Please contact the administrator.' });
    }

    const sessionToken = issueSessionToken({
      id: userDoc._id,
      username: userDoc.username,
      role: userDoc.role,
      fullName: userDoc.fullName || `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim(),
    });

    return res.json({
      success: true,
      message: 'Login successful',
      sessionToken,
      user: {
        id: userDoc._id,
        username: userDoc.username,
        role: userDoc.role,
        fullName: userDoc.fullName || `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim(),
        residentId: userDoc.residentId || null,
        purok: userDoc.purok || null,
        contact: userDoc.contact || null,
        email: userDoc.email || null,
        status: accountStatus,
        createdAt: userDoc.createdAt || null
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during login' });
  }
});

// ──────────────────────────────────────────────────────────────
// CouchDB sync proxy — authenticated, streams the full CouchDB
// HTTP surface so PouchDB replication works without client creds.
// Two patterns per method are required: the database root (used by
// PouchDB info()/get() calls) and nested paths (used by _changes,
// _bulk_docs, _design, _local, etc.). Express 5.2.1's path-to-regexp
// 8.x rejects the legacy ":path*" syntax, so the "*rest" wildcard
// form is used instead. The wildcard captures the remainder of the
// path including any internal slashes.
//
// Read methods (GET, HEAD) are open to any authenticated user.
// Write methods (POST, PUT, DELETE) are unrestricted for admin/staff;
// residents may only write documents they own (see authorizeSyncAccess),
// enforced before any upstream CouchDB request is constructed.
//
// Fallback for a bare `/api/sync` (with or without a trailing slash).
// PouchDB derives sub-request URLs from the endpoint's last path segment; a
// misconfigured endpoint that drops the database name would otherwise land on
// this prefix and throw an unhandled 404. Redirect (307 preserves the method
// and request body) to the canonical database endpoint so replication can
// recover instead of failing permanently.
app.all(['/api/sync', '/api/sync/'], (req, res) => {
  const originalUrl = req.originalUrl || req.url || '';
  const queryIndex = originalUrl.indexOf('?');
  const queryString = queryIndex >= 0 ? originalUrl.slice(queryIndex) : '';
  return res.redirect(307, `/api/sync/${DB_NAME}${queryString}`);
});

app.get('/api/sync/:dbId', authenticate, authorizeSyncAccess, proxyCouch);
app.get('/api/sync/:dbId/*rest', authenticate, authorizeSyncAccess, proxyCouch);
app.head('/api/sync/:dbId', authenticate, authorizeSyncAccess, proxyCouch);
app.head('/api/sync/:dbId/*rest', authenticate, authorizeSyncAccess, proxyCouch);
app.post('/api/sync/:dbId', authenticate, authorizeSyncAccess, proxyCouch);
app.post('/api/sync/:dbId/*rest', authenticate, authorizeSyncAccess, proxyCouch);
app.put('/api/sync/:dbId', authenticate, authorizeSyncAccess, proxyCouch);
app.put('/api/sync/:dbId/*rest', authenticate, authorizeSyncAccess, proxyCouch);
app.delete('/api/sync/:dbId', authenticate, authorizeSyncAccess, proxyCouch);
app.delete('/api/sync/:dbId/*rest', authenticate, authorizeSyncAccess, proxyCouch);

// Registration Endpoint
app.post('/api/register', async (req, res) => {
  const { username, password, fullName, firstName, lastName, purok, contact } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection not initialized.' });
    }

    const cleanUsername = String(username).trim();
    const existing = await db.find({ selector: { type: 'user', username: cleanUsername }, limit: 1 });
    if (existing.docs && existing.docs.length > 0) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    const newUser = {
      _id: `user_res_${Date.now()}`,
      type: 'user',
      role: 'resident',
      username: cleanUsername,
      passwordHash: await hashPassword(String(password).trim()),
      fullName: fullName || `${firstName || ''} ${lastName || ''}`.trim(),
      firstName: firstName || '',
      lastName: lastName || '',
      residentId: `RES-${Math.floor(1000 + Math.random() * 9000)}`,
      purok: purok || '',
      contact: contact || '',
      createdAt: new Date().toISOString()
    };

    const response = await db.insert(newUser);
    return res.status(201).json({ success: true, message: 'Registration successful!', id: response.id });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
});

// Blotter Endpoint with Email Notification
// Restricted to admin and staff. Blotter records contain respondent PII
// and are administrative in nature; residents must not create or read them.
app.post('/api/blotter', authenticate, requireRole('admin', 'staff'), async (req, res) => {
  const { respondentName, respondentEmail, caseNumber, scheduleDate, incidentType, details } = req.body;
  if (!respondentName || !caseNumber) {
    return res.status(400).json({ success: false, message: 'Respondent name and case number are required.' });
  }

  try {
    const db = req.app.get('db');
    const newBlotter = {
      _id: `blotter_${Date.now()}`,
      type: 'blotter_report',
      caseNumber,
      respondentName,
      respondentEmail: respondentEmail || '',
      scheduleDate: scheduleDate || '',
      incidentType: incidentType || 'General Incident',
      details: details || '',
      status: 'Pending / Issued Summons',
      createdAt: new Date().toISOString()
    };

    const response = await db.insert(newBlotter);

    let emailSent = false;
    if (respondentEmail && respondentEmail.trim() !== '') {
      try {
        await sendBlotterNotification(respondentEmail, respondentName, caseNumber, scheduleDate);
        emailSent = true;
        console.log(`Email notification successfully sent to ${respondentEmail}`);
      } catch (mailErr) {
        console.error('Failed to send email notification:', mailErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: emailSent ? 'Blotter record saved and email notification sent!' : 'Blotter record saved successfully.',
      id: response.id,
      emailSent
    });
  } catch (error) {
    console.error('Error saving blotter record:', error);
    return res.status(500).json({ success: false, message: 'Internal server error while saving blotter.' });
  }
});

// Stats Endpoints
// Pending certificates returns full document data including resident PII,
// so it is restricted to admin and staff. Aggregate summary endpoints
// remain public because they return only counts, not document contents.
app.get('/api/stats/pending-certificates', authenticate, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const db = req.app.get('db');
    const result = await db.find({ selector: { type: 'certificate_request', status: 'Pending' } });
    res.json({ success: true, count: result.docs.length, data: result.docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats/blotter-summary', async (req, res) => {
  try {
    const db = req.app.get('db');
    const result = await db.find({ selector: { type: { $in: ['blotter_report', 'blotter_record'] } } });
    const summary = { settled: 0, cfa: 0, pending: 0, total: result.docs.length };
    result.docs.forEach(doc => {
      if (doc.status === 'Settled / Resolved' || doc.status === 'Settled') {
        summary.settled++;
      } else if (doc.cfaIssued || doc.status === 'Referred to PNP (CFA Issued)') {
        summary.cfa++;
      } else {
        summary.pending++;
      }
    });
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats/monthly-feedback', async (req, res) => {
  try {
    const db = req.app.get('db');
    const result = await db.find({ selector: { type: 'feedback_report' } });
    const monthlyCounts = {};
    result.docs.forEach(doc => {
      if (doc.timestamp) {
        const date = new Date(doc.timestamp);
        const monthKey = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
      }
    });
    res.json({ success: true, monthlyCounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public Portal Endpoint
app.get('/api/public', async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not initialized.' });
    }

    const announcements = await db.find({ selector: { type: 'announcement' } }).catch(() => ({ docs: [] }));
    const activities = await db.find({ selector: { type: 'activity' } }).catch(() => ({ docs: [] }));
    const advisories = await db.find({ selector: { type: 'advisory' } }).catch(() => ({ docs: [] }));
    const hotlines = await db.find({ selector: { type: 'hotline' } }).catch(() => ({ docs: [] }));

    return res.json({
      success: true,
      announcements: announcements.docs || [],
      activities: activities.docs || [],
      advisories: advisories.docs || [],
      hotlines: hotlines.docs && hotlines.docs.length > 0 ? hotlines.docs : [
        { id: 'h1', name: 'Barangay Hotline / Emergency Unit', number: '0917-123-4567 / (054) 881-2345', service: '24/7 Response' },
        { id: 'h2', name: 'MDRRMO Nabua / Rescue', number: '0998-765-4321', service: 'Disaster & Rescue' },
        { id: 'h3', name: 'PNP Nabua Station', number: '(054) 477-1122', service: 'Police Assistance' },
        { id: 'h4', name: 'BFP Fire Station', number: '(054) 477-3344', service: 'Fire Emergency' }
      ],
      office: {
        barangay: 'Barangay Bustrac',
        municipality: 'Nabua, Camarines Sur',
        officeHours: 'Monday - Friday (8:00 AM - 5:00 PM)',
        publicUpdates: 'Open for Public Assistance & Certificate Issuance'
      }
    });
  } catch (error) {
    console.error('Error fetching public portal data:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
// ============================================================
// SERVER-SENT EVENTS (SSE) FOR PUSH NOTIFICATIONS
// ============================================================
const sseClients = new Map(); // Stores connected frontend clients

// SSE Endpoint for Frontend to listen to
app.get('/api/notifications', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Isara ang buffering
  // Note: no manual Access-Control-Allow-Origin here — the global cors()
  // middleware above already reflects the requesting origin with
  // credentials:true, which is what credentialed SSE connections require.

  // 🟢 MAHALAGA: Magpadala agad ng 200 OK header at initial data
  res.writeHead(200);
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE Connection Active' })}\n\n`);

  const clientId = Date.now().toString();
  sseClients.set(clientId, res);
  console.log(`📡 New SSE client connected: ${clientId}`);

  req.on('close', () => {
    sseClients.delete(clientId);
    console.log(`❌ SSE client disconnected: ${clientId}`);
  });
});

// Function to broadcast message to all connected clients
function sendPushNotification(data) {
  const eventData = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    res.write(eventData);
  });
}
// ============================================================
// CouchDB Changes Listener para sa Blotter SMS at Push Notification
// ============================================================
function startBlotterSMSListener() {
  if (!db) {
    console.warn('⚠️ startBlotterSMSListener: DB not initialized, skipping.');
    return;
  }
  console.log('📡 Starting CouchDB Changes Listener for Blotter SMS & SSE...');
  const processingCases = new Set();
  const axios = require('axios');
  const changesUrl = `${COUCHDB_URL}/${DB_NAME}/_changes?feed=continuous&since=now&include_docs=true&heartbeat=10000`;

  let streamBuffer = '';

  axios({
    method: 'GET',
    url: changesUrl,
    responseType: 'stream',
    timeout: 0 
  }).then((response) => {
    response.data.on('data', (chunk) => {
      streamBuffer += chunk.toString();
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop(); 

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const change = JSON.parse(line);
          const doc = change.doc;
          if (!doc) continue;

          const isBlotter = doc.type === 'blotter_report' || doc.type === 'blotter_record' || doc.docType === 'blotter';
          const isSummonStatus = doc.status && (
            doc.status.includes('1st Summon') || 
            doc.status.includes('2nd Summon') || 
            doc.status.includes('3rd Summon') ||
            doc.status.includes('Summons')
          );

          if (!isBlotter || !isSummonStatus) continue;

          const caseNum = doc.caseNumber || doc.trackingNo || doc.refNumber || doc._id;
          const currentStatus = doc.status;
          
          const processingKey = `${caseNum}_${currentStatus}`;

          if (processingCases.has(processingKey)) continue;
          processingCases.add(processingKey);

          console.log(`🔔 Summons Update Detected: ${caseNum} [${currentStatus}]`);

          const phone = doc.respondentPhone || doc.contact || (typeof doc.respondent === 'object' ? doc.respondent.phone : null);
          const name = doc.respondentName || (typeof doc.respondent === 'object' ? doc.respondent.name : 'Respondent');
          const schedule = doc.scheduleDate || doc.nextHearingDate || doc.summonDate || 'TBA';

          // 🟢 FIX 3: Magpapadala lang ng SMS kapag BAGO ang Summon Status
          const needsSms = doc.lastSmsStatus !== currentStatus;

          if (needsSms && phone) {
            sendResidentSMS(phone, name, `Ang inyong blotter case ${caseNum} ay may bagong update. Status: ${currentStatus}. ${schedule ? `Patawag: ${schedule}.` : ''}`).then(success => {
              if (success) {
                console.log(`✅ SMS successfully sent to ${name} (${phone})`);
                doc.smsSent = true;
                doc.lastSmsStatus = currentStatus; // Itala ang huling naisa-text na status
                doc.smsSentAt = new Date().toISOString();
                
                db.insert(doc).catch(err => {
                  if (err.statusCode !== 409) console.error('Failed to update doc with lastSmsStatus:', err.message);
                });
              }
              processingCases.delete(processingKey);
            }).catch(err => {
              console.error(`❌ Failed to send SMS for ${caseNum}:`, err.message);
              processingCases.delete(processingKey);
            });
          } else {
            processingCases.delete(processingKey);
          }

          // Security: the SSE feed is unauthenticated, so broadcasts must not
          // carry PII (case number, names, schedules). Residents learn their
          // own case status via the authenticated app (PouchDB/live changes),
          // not from this public stream.
          sendPushNotification({
            type: 'BLOTTER_UPDATE',
            message: `May bagong update ang isang blotter case. Para sa detalye, buksan ang iyong Inbox sa Bustrac Hub.`
          });

        } catch (err) {
        }
      }
    });

    response.data.on('error', (err) => {
      console.error('❌ CouchDB changes stream error:', err.message);
      setTimeout(startBlotterSMSListener, 5000);
    });

    response.data.on('end', () => {
      console.log('⚠️ CouchDB changes stream ended. Reconnecting in 5 seconds...');
      setTimeout(startBlotterSMSListener, 5000);
    });
  }).catch((err) => {
    console.error('❌ Failed to connect to CouchDB changes feed:', err.message);
    setTimeout(startBlotterSMSListener, 5000);
  });
}

// ============================================================
// Bootstrap: isang initDB() lang, tapos saka simulan ang listener
// ============================================================
initDB()
  .then(() => {
    startBlotterSMSListener();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(` Server is listening live on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(' Failed to initialize DB. Server not started.', err);
    process.exit(1);
  });