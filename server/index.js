require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nano = require('nano');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const certificateRoutes = require('./routes/certificateRoutes');
const blotterRoutes = require('./routes/blotterRoutes');
const { sendBlotterNotification } = require('./services/emailService');
const { sendResidentSMS } = require('./services/smsService');
const deviceRegistry = require('./utils/deviceRegistry');

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

// ──────────────────────────────────────────────────────────────
// SECURITY HEADERS
// ──────────────────────────────────────────────────────────────
// Applied first (before CORS, body parsers and every route) so the
// headers are present on ALL responses — including 4xx/5xx errors and
// CORS rejections. Deliberately dependency-free (no helmet) so the
// existing, minimal dependency set is untouched.
//
// CSP design notes (BUSTRAC HUB):
//   - This Express server only serves /api/* JSON and streams. The React
//     SPA itself is served by Vite (dev) / a static host (prod), which set
//     their own headers. A CSP here documents and constrains the API
//     responses (which are never rendered as documents), so it is kept
//     restrictive: no scripts, no frames, API origin only for connect.
//   - default-src 'none' means an API JSON body can never be interpreted as
//     an active document (defense-in-depth against MIME confusion).
//   - frame-ancestors 'none' is the CSP equivalent of X-Frame-Options:DENY.
//   - No 'unsafe-eval' / 'unsafe-inline' are used here.
const API_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "script-src 'none'",
  "connect-src 'self'",
].join('; ');

app.use((req, res, next) => {
  // Anti-clickjacking (legacy header) + modern CSP equivalent.
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', API_CSP);
  // Stop MIME-sniffing of API responses.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Do not leak the full URL (may contain verification ids) cross-origin.
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Deny powerful browser features the MIS does not use.
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
  // Isolate browsing context (mitigates XS-Leaks / tab-nabbing).
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // NOTE: the SSE stream (/api/notifications) and sync proxy set their own
  // streaming headers later; none of the headers above conflict with them.
  next();
});

// ──────────────────────────────────────────────────────────────
// JWT SECRET — fail closed on missing OR weak secrets.
// A short/guessable secret lets anyone forge a session token (and thus a
// role), so a minimum length is enforced. This NEVER prints the secret.
// ──────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
const MIN_JWT_SECRET_LENGTH = 32;
const WEAK_JWT_SECRETS = new Set([
  'secret', 'jwtsecret', 'changeme', 'password', 'test', 'dev',
  'your_jwt_secret', 'supersecret', 'bustrachub', 'bustrac',
]);

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}
if (JWT_SECRET.length < MIN_JWT_SECRET_LENGTH || WEAK_JWT_SECRETS.has(JWT_SECRET.toLowerCase())) {
  console.error(
    `❌ JWT_SECRET is too weak: it must be at least ${MIN_JWT_SECRET_LENGTH} characters and not a common/default value. Refusing to start.`
  );
  process.exit(1);
}
const JWT_EXPIRES_IN = '8h';

// Middlewares
// ──────────────────────────────────────────────────────────────
// CORS CONFIGURATION — CRITICAL FOR SYNC TO WORK WITH CREDENTIALS
// ──────────────────────────────────────────────────────────────
app.use(
  cors({
    // 1. Allowed origins are listed EXPLICITLY (never '*'). Credentials: true
    //    is only valid when the origin is explicit, so these two go together.
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:4173',
        'http://localhost:4174',
        'http://localhost:4175',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:4173',
        'http://127.0.0.1:4174',
        'http://127.0.0.1:4175',
        'http://192.168.1.4:4173',
        'http://192.168.1.4:4174',
        'http://192.168.1.4:4175',
        'http://192.168.1.4:5173',
        'http://192.168.56.1:4173',
        'http://192.168.56.1:4174',
        'http://192.168.56.1:4175',
        'http://192.168.56.1:5173',
      ];

      // SINGLE callback invocation: either allow (true) or reject (Error).
      // Never call callback twice — doing so raises ERR_HTTP_HEADERS_SENT.
      const isAllowed =
        allowedOrigins.indexOf(origin) !== -1 ||
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
        /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin);

      if (isAllowed) {
        return callback(null, true);
      }
      // Reject ONLY the disallowed origin — never fall back to allow-all.
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    // At minimum the headers PouchDB/login send. Origin/Referer are included
    // because some clients list them in Access-Control-Request-Headers.
    allowedHeaders: ['Accept', 'Content-Type', 'Authorization', 'Origin', 'Referer', 'X-Requested-With'],
    // Headers the browser is allowed to read off the response (PouchDB needs
    // ETag/Cache-Control; Content-Length helps with body framing).
    exposedHeaders: ['Content-Type', 'ETag', 'Cache-Control', 'Content-Length'],
    credentials: true, // REQUIRED for Bearer tokens/Cookies to work cross-origin
    maxAge: 86400, // Cache preflight response for 24 hours (reduces OPTIONS spam)
    optionsSuccessStatus: 200 // Some legacy browsers choke on 204
    // NOTE: this middleware short-circuits OPTIONS preflight requests (default
    // preflightContinue:false) BEFORE any route or authenticate() runs, so
    // OPTIONS /api/sync/* never requires a Bearer token.
  })
);

// NOTE: express.json() MUST NOT run for the /api/sync proxy routes.
// It consumes the request stream and, for compressed bodies, inflates
// them — both of which corrupt the verbatim replication payloads CouchDB
// expects (POST /_revs_diff, /_bulk_docs, ...). The proxy mounts its own
// raw parser below (see syncRawParser) so those bytes reach CouchDB
// exactly as PouchDB sent them.
const jsonParser = express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    // Capture the raw body for non-sync routes that still need it.
    req.rawBody = buf;
  },
});
const urlencodedParser = express.urlencoded({ extended: true });

app.use((req, res, next) => {
  if (req.path === '/api/sync' || req.path.startsWith('/api/sync/')) {
    return next();
  }
  jsonParser(req, res, (err) => {
    if (err) return next(err);
    urlencodedParser(req, res, next);
  });
});

const COUCHDB_URL = process.env.COUCHDB_URL;
if (!COUCHDB_URL) {
  console.error('❌ COUCHDB_URL environment variable is not set. Cannot connect to CouchDB.');
  process.exit(1);
}
const couch = nano(COUCHDB_URL);
const DB_NAME = 'bustrachub_db';
let db;

// ──────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE — Bearer JWT issued by /api/login
// Token is a stateless HS256-signed JWT bound to a role. It does NOT
// carry CouchDB credentials. CouchDB admin credentials stay in
// COUCHDB_URL on the server only. PouchDB sync fires dozens of
// sequential requests per cycle; each verifies the signature with no
// Map lookup and no DB read, so auth stays O(1) per request.
// ──────────────────────────────────────────────────────────────
const issueSessionToken = (user) => {
  return jwt.sign(
    { user: user },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'No session token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    req.sessionToken = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid session token.' });
  }
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
//   - WRITE_METHODS require an admin or staff session; residents may only
//     read. This prevents an authenticated resident from mutating any
//     CouchDB document through the proxy.
//   - CouchDB admin credentials are read from COUCHDB_URL (server-side
//     only) and never reach the client.
// ──────────────────────────────────────────────────────────────
const { URL } = require('url');

const ALLOWED_DB = DB_NAME;
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// ──────────────────────────────────────────────────────────────
// SYNC PROXY AUTHORIZATION
// ──────────────────────────────────────────────────────────────
// The policy (RESIDENT_WRITE_TYPES, RESIDENT_ACCOUNT_DOC_TYPES) and the
// enforcement helper (assessResidentWrite, which combines docOwnedBy and
// verifyExistingDocOwnership) live in ./utils/syncAuthorization so they can
// be unit-tested in isolation. RESIDENT_WRITE_TYPES deliberately excludes
// 'user': residents must never write account/identity documents (which hold
// role/passwordHash/status) through the sync proxy — their own profile is a
// separate `resident`/`resident_profile` document.
const { assessResidentWrite, assessStoredDocWrite, fetchExistingDoc } = require('./utils/syncAuthorization');

// Read-only CouchDB endpoints that PouchDB sometimes calls with POST but that
// never mutate documents. Residents are allowed to call these through sync.
const RESIDENT_READONLY_ENDPOINTS = new Set([
  '_bulk_get', '_all_docs', '_find', '_explain', '_index',
]);

const logSync403 = (req, offenders) => {
  console.error('[SYNC 403] Resident write denied');
  console.error(`method=${req.method}`);
  console.error(`path=${req.originalUrl}`);
  console.error(`session.username=${req.user?.username}`);
  console.error(`session.residentId=${req.user?.residentId}`);
  console.error(`offendingDocs=${JSON.stringify(
    offenders.map((o) => ({
      _id: o._id,
      type: o.type,
      docType: o.docType,
      username: o.username,
      residentId: o.residentId,
      reason: o.reason,
    })),
    null,
    2
  )}`);
};

// Record a lightweight audit entry SERVER-SIDE for resident sync writes.
// A resident's own audit docs live as `_local/` docs (never replicated), so an
// admin cannot see them; this gives admins attribution for resident actions
// that DO sync. Fire-and-forget: must never block or fail the write.
const recordResidentAudit = (req, docs) => {
  try {
    if (!db || !Array.isArray(docs) || docs.length === 0) return;
    const user = req.user || {};
    const affected = docs.map((d) => ({
      id: d?._id,
      type: d?.type || d?.docType || 'unknown',
      deleted: d?._deleted === true,
    }));
    const now = new Date().toISOString();
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    db.insert({
      _id: auditId,
      type: 'audit_log',
      docType: 'audit_log',
      action: 'RESIDENT_SYNC_WRITE',
      module: 'SYNC',
      recordId: affected[0]?.id || null,
      actor: {
        username: user.username,
        role: user.role || 'resident',
        residentId: user.residentId || null,
      },
      details: `Resident @${user.username} synced ${affected.length} document(s): ${affected
        .map((a) => `${a.type}${a.deleted ? ' (delete)' : ''}`)
        .join(', ')}`,
      affected,
      timestamp: now,
      createdAt: now,
      immutable: true,
      source: 'server-sync-proxy',
    }).catch((err) => {
      if (err && err.statusCode !== 409) {
        console.warn('[AUDIT] Failed to record resident sync audit:', err.message || err);
      }
    });
  } catch (err) {
    console.warn('[AUDIT] Resident sync audit skipped:', err?.message || err);
  }
};

// Gate for resident-originated writes. admin/staff never reach this point.
const authorizeResidentWrite = (req, res, next) => {
  const segments = Array.isArray(req.params.rest) ? req.params.rest : [];
  const head = String(segments[0] || '').toLowerCase();

  // Replication bookkeeping + read helpers are always safe to pass through.
  if (head === '_local' || head === '_revs_diff' || head === '_ensure_full_commit' || head === '_changes') {
    return next();
  }

  // Read-only bulk/query endpoints. PouchDB sends several of these as POST
  // (notably _bulk_get), but they never mutate documents, so residents are
  // allowed to call them.
  if (RESIDENT_READONLY_ENDPOINTS.has(head)) {
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
    // NOTE: assess ownership for EVERY document and reject the whole batch if
    // ANY document is not owned/authorized (mixed authorized/unauthorized bulk
    // batches are denied atomically — the proxy never forwards a partial push).
    return Promise.all(
      docs.map((doc) => assessResidentWrite(nanoDb, doc, req.user))
    )
      .then((results) => {
        const offenders = [];
        for (let i = 0; i < results.length; i++) {
          if (!results[i].allowed) {
            offenders.push({
              _id: docs[i]?._id,
              type: docs[i]?.type,
              docType: docs[i]?.docType,
              username: docs[i]?.username,
              residentId: docs[i]?.residentId,
              reason: results[i].reason,
            });
          }
        }
        if (offenders.length > 0) {
          logSync403(req, offenders);
          return res.status(403).json({
            error: 'forbidden',
            reason: 'Residents may only write documents they own.',
          });
        }
        recordResidentAudit(req, docs);
        return next();
      })
      .catch(() => res.status(500).json({ error: 'unavailable', reason: 'Ownership check failed.' }));
  }

  // Single-document create/update/delete under /db/:id.
  if (!head.startsWith('_')) {
    const nanoDb = req.app.get('db');
    const pathId = String(head);

    // PouchDB's remove() issues `DELETE /db/:id?rev=...` with NO request body
    // (the doc id lives only in the path). Authorize deletes by fetching the
    // STORED document and checking ownership + type, then forwarding verbatim.
    // FAIL CLOSED: only a genuine 404 means "absent"; any lookup failure
    // (timeout, 5xx, 401/403) must deny the mutation, never be treated as a
    // harmless delete of a missing id.
    if (String(req.method || '').toUpperCase() === 'DELETE') {
      return fetchExistingDoc(nanoDb, pathId)
        .then(({ found, doc: existing }) => {
          const verdict = found
            ? assessStoredDocWrite(existing, req.user)
            : { allowed: true, reason: null }; // deleting an absent id is a no-op
          if (!verdict.allowed) {
            logSync403(req, [{ _id: pathId, type: existing?.type, reason: verdict.reason }]);
            return res.status(403).json({ error: 'forbidden', reason: 'Residents may only delete documents they own.' });
          }
          recordResidentAudit(req, [{ _id: pathId, type: existing?.type, _deleted: true }]);
          return next();
        })
        .catch(() => res.status(500).json({ error: 'unavailable', reason: 'Ownership check failed.' }));
    }

    let parsed;
    try {
      parsed = JSON.parse((req.rawBody || '').toString() || '{}');
    } catch (e) {
      return res.status(400).json({ error: 'bad_request', reason: 'Malformed document payload.' });
    }
    // The {id} route segment (PUT /db/:id) carries the document id in the same
    // position as `head`. A resident must not be able to write under an id
    // other than the doc's own id — reject an id/body mismatch outright
    // (blocks e.g. PUT /db/someone_elses_id with a forged body).
    const bodyId = String(parsed?._id || '');
    if (bodyId && bodyId !== pathId) {
      logSync403(req, [{ _id: pathId, type: parsed?.type, reason: 'path/_id mismatch' }]);
      return res.status(403).json({ error: 'forbidden', reason: 'Document id does not match request path.' });
    }
    return assessResidentWrite(nanoDb, parsed, req.user)
      .then(({ allowed, reason }) => {
        if (!allowed) {
          logSync403(req, [{
            _id: parsed?._id,
            type: parsed?.type,
            docType: parsed?.docType,
            username: parsed?.username,
            residentId: parsed?.residentId,
            reason,
          }]);
          return res.status(403).json({
            error: 'forbidden',
            reason: 'Residents may only write documents they own.',
          });
        }
        recordResidentAudit(req, [parsed]);
        return next();
      })
      .catch(() => res.status(500).json({ error: 'unavailable', reason: 'Ownership check failed.' }));
  }

  logSync403(req, [{ _id: req.originalUrl, type: head, reason: 'resource not writable by residents' }]);
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
const UPSTREAM_TIMEOUT_MS = 30000;

// Hop-by-hop headers must not be forwarded verbatim.
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

// Headers that are always overridden by the proxy implementation.
const OVERRIDE_HEADERS = new Set(['host', 'content-length']);

const proxyCouch = (req, res) => {
  // 1. Database allowlist
  const dbId = req.params.dbId;
  if (dbId !== ALLOWED_DB) {
    return res.status(404).json({ error: 'not_found', reason: 'database not allowed' });
  }

  // 2. Reconstruct path
  const segments = Array.isArray(req.params.rest) ? req.params.rest : [];
  const subPath = segments.join('/');
  const couchPath = subPath ? `/${dbId}/${subPath}` : `/${dbId}`;

  // 3. Preserve query string
  const originalUrl = req.originalUrl || req.url || '';
  const queryIndex = originalUrl.indexOf('?');
  const queryString = queryIndex >= 0 ? originalUrl.slice(queryIndex + 1) : '';
  const upstreamPath = queryString ? `${couchPath}?${queryString}` : couchPath;

  // 4. Body handling
  // req.rawBody is populated by the dedicated raw parser mounted on
  // /api/sync — NOT by express.json (which is skipped for these routes).
  // It therefore holds the exact bytes the client sent, unmodified.
  const hasBody = !(req.method === 'GET' || req.method === 'HEAD');
  const bodyBuffer = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.alloc(0);
  // Measured ONCE and reused for BOTH the Content-Length header and the
  // write below — never measure one buffer and write a different one.
  const bodyLength = Buffer.byteLength(bodyBuffer);

  // Fallback: a write method advertised bytes but none were captured.
  // Return a clear 400 instead of letting CouchDB fail into a 502.
  if (hasBody && bodyLength === 0) {
    const declaredLength = Number(req.headers['content-length'] || 0);
    if (declaredLength > 0) {
      console.error(`[PROXY] ${req.method} ${upstreamPath}: request body missing (declared ${declaredLength} bytes).`);
      return res.status(400).json({
        error: 'bad_request',
        reason: 'Request body could not be read.',
      });
    }
  }

  // 5. Prepare Headers
  // Strip (case-insensitively, because every key is lowercased) ALL
  // hop-by-hop headers plus every header the proxy itself owns:
  //   hop-by-hop : connection, keep-alive, proxy-authenticate,
  //                proxy-authorization, proxy-connection, te, trailers,
  //                transfer-encoding, upgrade
  //   proxy-owned: host, authorization (replaced by server-side Basic Auth),
  //                cookie, content-length (recomputed once, below)
  // Everything else — CRITICALLY content-type AND content-encoding — is
  // preserved EXACTLY as PouchDB sent it.
  const forwardHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP.has(lowerKey)) continue;      // connection, keep-alive, te, trailer, transfer-encoding, upgrade, ...
    if (lowerKey === 'proxy-connection') continue;
    if (lowerKey === 'host') continue;           // set by the http client
    if (lowerKey === 'authorization') continue;  // replaced by server-side Basic Auth
    if (lowerKey === 'cookie') continue;         // never forward client cookies upstream
    if (lowerKey === 'content-length') continue; // recalculated below
    forwardHeaders[lowerKey] = value;
  }

  // NOTE (Content-Length, rule 1): it is deliberately NOT set here and must
  // never be added to forwardHeaders. It is set EXACTLY ONCE on the
  // proxyReq below (see the GUARD). Setting it in both places produces a
  // DUPLICATE Content-Length and a malformed upstream request that surfaces
  // as "Data after `Connection: close`".
  //
  // NOTE (Content-Encoding, rule 4): syncRawParser uses inflate:false, so a
  // content-encoding header (if any) is forwarded VERBATIM — never stripped,
  // never added — keeping the bytes and the encoding label consistent.

  const options = {
    hostname: COUCH_HOST,
    port: COUCH_PORT,
    path: upstreamPath,
    method: req.method,
    headers: forwardHeaders,
    agent: false,
  };

  // Add Basic Auth from env (Server-to-CouchDB)
  if (couchUrl.username) {
    options.auth = `${decodeURIComponent(couchUrl.username)}:${decodeURIComponent(couchUrl.password || '')}`;
  }

  // 6. Create Request
  const proxyReq = COUCH_PROTOCOL.request(options, (proxyRes) => {
    // An aborted/ill-framed upstream response (e.g. a parser error such as
    // "Data after `Connection: close`") fires here. Without this handler it
    // becomes an uncaught 'error' and the request hangs / crashes; instead
    // we surface a clean 502.
    proxyRes.on('error', (err) => {
      console.error(`[PROXY RESPONSE ERROR] ${req.method} ${upstreamPath}: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({ error: 'bad_gateway', reason: 'Invalid response from CouchDB' });
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    res.status(proxyRes.statusCode);

    // Forward response headers (excluding hop-by-hop)
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      const lowerKey = key.toLowerCase();
      if (HOP_BY_HOP.has(lowerKey)) continue;
      // Never forward upstream CORS headers: the `cors` middleware above owns
      // Access-Control-Allow-Origin / -Credentials / -Expose-Headers. If
      // CouchDB answers with `Access-Control-Allow-Origin: *`, forwarding it
      // would OVERWRITE our explicit origin and break credentialed requests.
      if (lowerKey.startsWith('access-control-')) continue;
      res.setHeader(key, value);
    }

    // Stream response back to client
    proxyRes.pipe(res);
  });

  // GUARD (rule 1): Content-Length is set EXACTLY ONCE, here — and only here.
  // Do NOT also place it in options.headers / forwardHeaders above; a second
  // copy (or a value measured from a different buffer) corrupts the upstream
  // request framing.
  if (hasBody) {
    proxyReq.setHeader('Content-Length', String(bodyLength));
  }

  // 7. Handle Errors — log everything so the real cause is visible.
  proxyReq.on('error', (err) => {
    console.error(`[PROXY ERROR] ${req.method} ${upstreamPath}`);
    console.error(`  message: ${err.message}`);
    console.error(`  code:    ${err.code}`);
    console.error('  stack:', err.stack);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'bad_gateway',
        reason: 'Failed to communicate with CouchDB',
        detail: err.message,
      });
    } else {
      res.end();
    }
  });

  // 8. Timeout
  proxyReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    proxyReq.destroy(new Error('Upstream timeout'));
  });

  // 9. Client Disconnect Cleanup
  // Listen on res 'close', NOT req 'close'. In modern Node, req 'close'
  // fires as soon as the request body is fully received, which would
  // destroy the upstream request before CouchDB replies — producing a
  // spurious 502 on POST /_revs_diff and /_bulk_docs. res 'close' only
  // fires on a real client disconnect, so guard on the response not
  // being finished yet.
  res.on('close', () => {
    if (!res.writableFinished && !proxyReq.destroyed) {
      proxyReq.destroy();
    }
  });

  // 10. Forward Body Verbatim (critical for _revs_diff / _bulk_docs)
  if (hasBody && bodyLength > 0) {
    proxyReq.write(bodyBuffer);
  }
  proxyReq.end();
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

    // ── Demo-user seeding ──────────────────────────────────────────────
    // SECURITY: these accounts share the well-known password 'password'
    // (and 'password123'). They MUST NOT exist in production, where an
    // attacker could log in as admin/staff. Seeding is therefore limited to
    // non-production environments and can be force-disabled with
    // SEED_DEMO_USERS=false. Never enable this in a production deployment.
    const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    const seedDemoUsers = process.env.SEED_DEMO_USERS !== 'false' && !isProduction;

    if (seedDemoUsers) {
      const demoUsers = [
        { _id: 'user_mgcortero', type: 'user', username: 'mgcortero', passwordHash: await hashPassword('password'), role: 'staff', path: '/staff' },
        { _id: 'user_jmacabangon', type: 'user', username: 'jmacabangon', passwordHash: await hashPassword('password'), role: 'admin', path: '/admin' },
        {
          _id: 'user_juan_resident', type: 'user', username: 'juan2026', passwordHash: await hashPassword('password'), role: 'resident', path: '/',
          fullName: 'Juan Dela Cruz', firstName: 'Juan', lastName: 'Dela Cruz', residentId: 'RES-0001',
          purok: '3', age: 34, birthdate: '1990-03-12', gender: 'Male', civilStatus: 'Married',
          contact: '09171234567', household: 'HH-0012 — Dela Cruz Family', voterStatus: 'Registered Voter'
        },
        {
          _id: 'user_juanreyes', type: 'user', username: 'juanreyes', passwordHash: await hashPassword('password123'), role: 'resident', path: '/',
          fullName: 'Juan Reyes', firstName: 'Juan', lastName: 'Reyes', residentId: 'RES-0002', purok: '1', contact: '09181234567'
        }
      ];

      for (const u of demoUsers) {
        try {
          await db.get(u._id);
          console.log(`User existing: ${u.username}`);
        } catch (err) {
          if (err.statusCode === 404 || err.status === 404) {
            await db.insert(u);
            console.log(`Successfully injected account: ${u.username}`);
          } else {
            console.error(`Error checking user ${u.username}:`, err.message);
          }
        }
      }
    } else {
      console.log('Demo-user seeding disabled (production or SEED_DEMO_USERS=false).');
    }

    // CouchDB Mango Index
    try {
      await db.createIndex({ index: { fields: ['type', 'username'] }, name: 'user-type-username-index' });
      console.log('CouchDB Mango Index created/verified!');
    } catch (idxErr) {
      console.warn('Index warning:', idxErr.message);
    }
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
  const { username, password } = req.body || {};
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
      firstName: userDoc.firstName || '',
      lastName: userDoc.lastName || '',
      residentId: userDoc.residentId || null,
      purok: userDoc.purok || null,
      contact: userDoc.contact || null,
      email: userDoc.email || null,
      status: accountStatus,
    });

    console.log(`[AUTH] Issued JWT for ${userDoc.username} (role: ${userDoc.role})`);

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
// CURRENT SESSION USER — lets the frontend rehydrate its user
// object after a refresh (or when localStorage was cleared) without
// requiring another login. The payload is exactly what was signed
// into the JWT at login, so it includes residentId/purok/contact.
// ──────────────────────────────────────────────────────────────
app.get('/api/me', authenticate, (req, res) => {
  return res.json({ success: true, user: req.user });
});

// ──────────────────────────────────────────────────────────────
// HANDLE ROOT SYNC REQUEST (/api/sync/)
// PouchDB often probes the base URL to detect available databases 
// or check connectivity before starting replication.
// We return a minimal valid JSON response so CORS works correctly.
// ──────────────────────────────────────────────────────────────
app.get('/api/sync/', (req, res) => {
  // Return empty object or list of allowed DBs if needed.
  // Since we only have one DB, returning {} is safe enough for probe.
  res.json({ ok: true, db_name: ALLOWED_DB });
});

// Also handle HEAD request for root just in case
app.head('/api/sync/', (req, res) => {
  res.status(200).end();
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
// Read methods (GET, HEAD) are open to authenticated non-resident users.
// Write methods (POST, PUT, DELETE) additionally require admin or staff.
// Residents are denied at every route by requireNonResident, placed
// immediately after authenticate so the denial happens before any
// upstream CouchDB request is constructed.
// Read methods (GET, HEAD) are open to any authenticated user.
// Write methods (POST, PUT, DELETE) are unrestricted for admin/staff;
// residents may only write documents they own (see authorizeSyncAccess).
//
// Body parsing for the proxy: express.json() is skipped for /api/sync,
// so this middleware reads the exact incoming bytes and exposes them as
// req.rawBody. `inflate: false` keeps compressed bodies verbatim and
// `type: () => true` captures every content-type, so Content-Type,
// Content-Encoding and the recalculated Content-Length stay consistent
// when the bytes are forwarded to CouchDB.
const syncRawParser = express.raw({
  type: () => true,
  limit: '50mb',
  inflate: false,
});

app.use('/api/sync', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    req.rawBody = Buffer.alloc(0);
    return next();
  }
  syncRawParser(req, res, (err) => {
    if (err) {
      console.error(`[sync] Failed to read request body for ${req.method} ${req.originalUrl}:`, err.message);
      return res.status(400).json({ error: 'bad_request', reason: 'Unable to read request body.' });
    }
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    next();
  });
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

// ============================================================
// DEVICE REGISTRY
//
// Lets the server answer "which devices still hold unsynced records?".
// A device reports a heartbeat (with its current pending-change count) on
// app load, on reconnect and after every replication cycle. The server keeps
// the last report per device, so a device that went silent while holding
// unsynced changes is flagged "possibly-lost".
// ============================================================

// POST /api/devices/heartbeat — a device reports its state.
// Admin/staff only: the registry is an administrative inventory of the
// barangay's shared staff devices.
app.post('/api/devices/heartbeat', authenticate, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not initialized.' });
    }

    const deviceId = deviceRegistry.normalizeDeviceId(req.body?.deviceId);
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'A valid deviceId is required.',
      });
    }

    const heartbeat = {
      deviceId,
      label: req.body?.label,
      // The assigned user comes from the authenticated session, never from
      // the request body, so a device cannot be attributed to someone else.
      assignedUser: req.user?.username || req.user?.email || 'unknown',
      pendingChangeCount: req.body?.pendingChangeCount,
      lastSuccessfulSyncAt: req.body?.lastSuccessfulSyncAt || null,
      lastSnapshotAt: req.body?.lastSnapshotAt || null,
    };

    const docId = deviceRegistry.deviceRegistryDocId(deviceId);
    let existing = null;
    try {
      existing = await db.get(docId);
    } catch (err) {
      // 404 simply means the device is registering for the first time.
      const status = err?.statusCode || err?.status;
      if (status !== 404 && status !== 'not_found') throw err;
      existing = null;
    }

    const doc = deviceRegistry.applyHeartbeat(existing, heartbeat);

    const written = await db.insert(doc);
    const saved = written?.ok
      ? { ...doc, _rev: written.rev }
      : await db.get(docId);

    return res.json({
      success: true,
      device: {
        deviceId: saved.deviceId,
        label: saved.label,
        assignedUser: saved.assignedUser,
        lastHeartbeatAt: saved.lastHeartbeatAt,
        pendingChangeCount: saved.pendingChangeCount,
        lastSuccessfulSyncAt: saved.lastSuccessfulSyncAt,
        lastSnapshotAt: saved.lastSnapshotAt || null,
      },
    });
  } catch (err) {
    console.error('[bustrac-server] Device heartbeat failed:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/devices — the administrative device list. Admin only.
// ?staleHours=<n> overrides the default staleness threshold (24h).
app.get('/api/devices', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not initialized.' });
    }

    const staleHours = deviceRegistry.resolveStaleHours({
      envValue: process.env.DEVICE_STALE_HOURS,
      queryValue: req.query?.staleHours,
    });

    const result = await db
      .find({ selector: { type: deviceRegistry.DEVICE_REGISTRY_TYPE } })
      .catch(() => ({ docs: [] }));

    const devices = deviceRegistry.buildDeviceList(result.docs || [], { staleHours });
    const summary = deviceRegistry.summarizeDeviceList(devices);

    return res.json({
      success: true,
      staleHours,
      summary,
      devices,
    });
  } catch (err) {
    console.error('[bustrac-server] Device list failed:', err.message);
    return res.status(500).json({ success: false, error: err.message });
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
            doc.status.includes('Summons') ||
            // SummonsPanel writes this status when a summons is issued; without
            // it the SMS/SSE trigger never fired for summons.
            doc.status.includes('Under Mediation')
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
// Only bootstrap (connect to CouchDB + listen) when this file is the entry
// point. Requiring the module in tests must NOT open a DB connection or bind
// a port — the test suite injects its own `app.set('db', stub)` and listens on
// an ephemeral port itself. Runtime behavior is unchanged.
if (require.main === module) {
  initDB()
    .then(() => {
      startBlotterSMSListener();
      app.listen(PORT, '0.0.0.0', () => {
        console.log(` Server is listening live on http://0.0.0.0:${PORT}`);
        console.log('[bustrac-server] backend patch loaded: sync-auth-cors-framing-2026-10-12');
      });
    })
    .catch((err) => {
      console.error(' Failed to initialize DB. Server not started.', err);
      process.exit(1);
    });
}

module.exports = { app, JWT_SECRET, authenticate, requireRole, ALLOWED_DB, initDB };