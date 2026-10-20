# Cloud Deployment Guide

**Scope of this document.** It describes how the Bustrac Hub stack is pointed
at a cloud-hosted CouchDB, and what must be true for that to be acceptable in
production. It is a deployment and hardening guide, **not** a record of a
completed cloud deployment. See the "What is proven in this study" section
below for exactly what has and has not been executed.

---

## 1. Pointing `COUCHDB_URL` at a cloud CouchDB

The central database is reached only through the server's sync proxy. The
server reads its endpoint from a single environment variable, `COUCHDB_URL`,
which is a full CouchDB URL **including credentials**:

```
# server/.env
COUCHDB_URL=https://<account>:<password>@<account>.cloudantnosqldb.cloud.ibm.com:443
JWT_SECRET=<a long random secret>
PORT=5000
```

Supported targets:

- **IBM Cloudant** (managed) — use the `https://<account>:<password>@<host>:443`
  form. Cloudant is API-compatible with CouchDB 3.x, so no server change is
  required; only the URL changes.
- **Self-hosted CouchDB behind a TLS-terminating proxy** — point
  `COUCHDB_URL` at the proxy's public `https://` URL, and reverse-proxy
  `/_db/<name>`, `/_utils` and `/_session` to the CouchDB container.

The database name is fixed in the server (`bustrachub_db`,
`server/index.js`) and must exist on the target instance; the server creates
it on start-up if it is missing.

### 1.1 The boot log reports the classification

On start-up the server logs exactly one classification line for the configured
endpoint. It never prints the credentials or the full URL — only the host and
the classification:

```
[couchdb] endpoint: <host> (LOCAL)
[couchdb] endpoint: <host> (REMOTE, HTTPS)
[couchdb] WARNING: remote endpoint without TLS — not acceptable for production.
```

A `REMOTE` + `HTTP` combination is a misconfiguration and is reported as a
warning on every boot. The same classification is exposed to administrators
through the **CouchDB Connection** card in the admin portal
(*Data Protection* screen) and through `GET /api/health/couchdb`
(`server/index.js:1489`).

## 2. TLS is mandatory for any remote endpoint

**A remote CouchDB endpoint must use `https://`.** HTTP to a remote host sends
the CouchDB admin credentials in clear text on every request, because the
credentials are part of the URL the server uses. The server warns about this
at boot, and the administrator-facing health card shows the `HTTP` badge in
red.

Additional requirements for a TLS deployment:

- The certificate must be issued for the hostname used in `COUCHDB_URL`, and
  the full chain must be served — browsers and Node's TLS stack reject
  self-signed certificates without an explicit trust configuration.
- The **server's own** public endpoint should also be served over `https://`
  (behind a reverse proxy with `X-Forwarded-Proto` handled), because the
  session token travels in the `Authorization` header of every API call.
- `JWT_SECRET` must be a long random value, unique per deployment, and must
  never be the development default.

## 3. CORS origins

Two separate allowlists must both admit the origin that serves the SPA.

### 3.1 The server's allowlist (`server/index.js:125-166`)

The CORS middleware never allows `*`. An origin is accepted when it appears
in the explicit list, or when it matches one of:

```
/^http:\/\/localhost:\d+$/
/^http:\/\/127\.0\.0\.1:\d+$/
/^http:\/\/192\.168\.\d+\.\d+:\d+$/
```

The explicit list covers the fixed development and preview ports
(`5173`, `4173`, `4174`, `4175`, `3000`) plus the LAN addresses used in
testing. Requests with **no** `Origin` header (curl, Postman, native clients)
are allowed through; requests from a disallowed origin are rejected with
`Not allowed by CORS` — there is no fallback to allow-all.

**For a cloud deployment the production origin must be added explicitly**, for
example `https://bustrac.barangay.gov.ph`. The regular expressions above are
HTTP-only, so an HTTPS production origin can only be admitted through the
explicit list. Note that the LAN pattern is deliberately permissive for
`192.168.x.x` on any port; for an internet-facing deployment this should be
narrowed to the specific production origin.

### 3.2 The frontend's CSP allowlist (`frontend/vite.config.js:42-57`)

The Content-Security-Policy `connect-src` directive is built from
`API_ORIGINS`, which lists the backend API origins the SPA may call
(`http://localhost:5000`, `http://127.0.0.1:5000`, and the LAN API origins).
`'self'` is always included, which covers a same-origin deployment where the
reverse proxy serves the SPA and the API from one host.

**For a cloud deployment the API origin must be added to `API_ORIGINS`** (or
the SPA and API must be served from the same origin under `'self'`). A missing
entry produces a browser-level CSP refusal that the application cannot
distinguish from a network failure.

The two lists are independent and must be updated together; an origin allowed
by only one of them still fails.

## 4. Credentials

- **Never use the development defaults.** The CouchDB admin credentials and
  `JWT_SECRET` must be generated for the deployment, stored in the hosting
  platform's secret store (or a `.env` file that is not in version control),
  and never committed. `server/.env` is git-ignored.
- **Never place the credentials in the browser.** The browser only ever holds
  an opaque session token; the CouchDB credentials stay in `COUCHDB_URL` on
  the server and are injected by the sync proxy. Nothing in the frontend
  bundle may contain the CouchDB URL.
- **Rotate on deploy.** A new `JWT_SECRET` invalidates all existing sessions
  (acceptable at deploy time, and the desired behaviour when a session token
  may have leaked). A new CouchDB password requires updating `COUCHDB_URL` and
  restarting the server.
- **Use least privilege where the target supports it.** The sync proxy needs
  read/write on the application database and administrative rights to create
  it; the `_users` and `_config` endpoints are not required by the application
  and should be restricted at the proxy if the provider allows it.
- The `GET /api/health/couchdb` endpoint deliberately returns **no** URL, no
  credentials and no error detail beyond a sanitized message.

## 5. Replication is not backup

This is the distinction most often stated incorrectly, so it is stated
precisely here.

**Replication keeps a live copy.** Every write a device makes is replicated to
the central CouchDB, and every write made centrally is pulled back down to the
devices. The central database is therefore a live mirror of the working set.

**Replication does not protect against deletion or corruption**, because those
changes replicate too:

- A document deleted on one device is deleted centrally, and the deletion
  propagates back to every other device.
- A corrupted or wrongly-edited document replicates exactly like a correct
  one, and the corruption becomes the shared state.
- Replication provides no point-in-time copy: there is no "yesterday's"
  version to return to.

A **scheduled, off-site backup** is therefore a separate and mandatory
control. The minimum plan already identified for the project is:

| Control | Purpose |
| ------- | ------- |
| **Daily** `couchdb-dump` or `couchbackup` to off-site storage | A point-in-time copy that replication cannot provide |
| **Incremental** `_changes` feed log | Narrows the recovery window between full dumps |
| **Restore drill** (rehearsed, on a schedule) | Proves the backup is actually restorable — an unverified backup is not a backup |

The backup must be stored **off-site** (a different failure domain from the
CouchDB instance) and encrypted at rest, and the restore drill must be
recorded, because a dump that has never been restored is an unverified
assumption.

## 6. What is proven in this study

Being explicit about this is part of the deliverable.

**Covered by automated tests.** The endpoint classification and the health
check are covered by **9 automated tests** in `server/test/couchHealth.test.js`
(verified: the server suite passes 146/146). These tests cover the
classification logic (LOCAL vs REMOTE, HTTP vs HTTPS, the boot-log warning
condition) and the health endpoint's authorization, response shape and
failure sanitization.

**Not executed.** The following have **not** been performed and must not be
claimed:

- The system has **not** been deployed to a cloud CouchDB endpoint. All
  testing was performed against a **local** CouchDB (`localhost:5984`), which
  is why the administrator-facing health card shows the `LOCAL` and `HTTP`
  badges in the study environment.
- **No end-to-end cloud deployment testing has been executed** — no
  provisioning of an IBM Cloudant instance or a self-hosted TLS proxy, no
  TLS handshake against a remote endpoint, no credential rotation exercise, no
  restore drill against a cloud-hosted dump.
- The cloud backup tooling (`couchdb-dump` / `couchbackup`) is **specified but
  not exercised**; the project ships the scripts `server/scripts/backup.js`
  and `server/scripts/restore.js`, but no restore drill has been performed.

**Therefore:** the classification and health-check *code paths* are verified;
the *cloud deployment* is not. A defence claim must be limited to the former.

## 7. Paste-ready paragraph for Chapter 5 Recommendations

> The study recommends that production deployment of Bustrac Hub place the
> central CouchDB instance on a cloud-hosted service, such as IBM Cloudant or
> an equivalently managed CouchDB offering, rather than on-premises hardware
> within the barangay. Such a deployment must be configured exclusively over
> TLS, since the server's CouchDB administrative credentials are transmitted
> on every replication request and any remote HTTP endpoint would expose them
> in clear text; the application is instrumented to classify the configured
> endpoint as local or remote and to report the security posture
> administrators, and the server logs a warning at start-up whenever a remote
> endpoint is reached without TLS. In addition, and as a control that is
> logically distinct from replication, the study recommends the establishment
> of a scheduled off-site backup of the central database — using a daily
> `couchdb-dump` or `couchbackup` together with an incremental changes-feed
> log — together with a periodically rehearsed restore drill, because
> replication propagates deletions and corruption in the same manner as
> ordinary writes and therefore cannot substitute for a point-in-time
> recovery copy. The health-check and endpoint-classification mechanisms
> described in this chapter are supported by automated test evidence, whereas
> the deployment of the system to a cloud-hosted endpoint and the associated
> end-to-end validation, credential-rotation exercise and restore drill remain
> to be undertaken as a subsequent implementation phase.
