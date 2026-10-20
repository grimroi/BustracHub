# Scalability Assessment — Bustrac Hub

**Scope.** This document records (a) what in the current architecture scales by
design, (b) the **measured** baseline at the scale of one barangay, (c) the
concrete single-instance assumptions that would break first if the system were
extended to a whole municipality, and (d) what would be required to make that
extension safe. It is an engineering assessment; it is not a deployment report,
and it does not claim that a municipality-scale deployment has been performed.

---

## 1. What scales by design

**Offline-first distributes the read and write load onto the devices.**
`frontend/src/services/db.js` writes every record to a local PouchDB database
first and replicates to the central server asynchronously
(`setupPouchDBSync()`, `db.js:711`; live replication configured at
`db.js:616`). The dashboard therefore reads from the *local* store, not from
the server, so the number of concurrent server reads does not grow with the
number of staff using the system — it grows only with the number of devices
holding unsynced work. This is the single most important scaling property of
the design.

**The backend is stateless and can be replicated horizontally.** Sessions are
stateless HS256 JWTs — `jwt.sign()` at `server/index.js:257` and
`jwt.verify()` at `server/index.js:273`. No session state is held in the Node
process, so any number of identical Node processes can serve the same
requests behind a load balancer. `docs/ARCHITECTURE.md` → *Backend*
(L32) and *Auth* (L34) describe the same arrangement.

**CouchDB clusters natively.** CouchDB 3.x supports a multi-node cluster with
replicated shards, so the storage tier is not the constraint — the
*deployment* of it is (see §3(a)).

**Conflict resolution is naturally per-barangay.** The conflict-resolution
screen and the `device_registry`/`_conflicts` handling operate on documents
that belong to one barangay's administrative area, and the replication filter
is role- and ownership-aware (`docs/ARCHITECTURE.md` → *Replication filter
(role-aware)*, L76; `makeReplicationFilter()` in `frontend/src/services/db.js`).
If each barangay's data lived in its own database, the conflict surface would
not grow with the number of barangays.

---

## 2. What is the measured baseline

The following numbers were **measured** on this machine, against a local
CouchDB 3.5.2 at `127.0.0.1:5984`, using `server/scripts/loadtest.js`
against a **dedicated, throwaway** database (`bustrachub_loadtest_<timestamp>`)
that the script drops when it finishes. The production database
`bustrachub_db` was not read for writes or modified at any point.

Command:

```
cd server
node scripts/loadtest.js --docs=10000
```

| Measurement | Result (run 1) | Result (run 2, reproducibility) |
| ----------- | -------------- | --------------------------------- |
| Bulk insert, 10 000 synthetic docs in batches of 500 | **931 ms — 10 741 docs/s** | 955 ms — 10 471 docs/s |
| Mango `find` on `['type','status']` (avg of 10 runs) | **43.9 ms** | 42.9 ms |
| Mango `find` on `['type','residentId']` (avg of 10 runs) | **51.6 ms** | 55.4 ms |
| `allDocs` with `include_docs`, limit 100 (avg of 10 runs) | **15.7 ms** | 18.7 ms |
| `db.info().doc_count` | 10 002 (10 000 synthetic + 2 Mango index design docs) | 10 002 |

Defense-slide summary line:

```
N=10000 | insert 0.9s (10741 docs/s) | find(type,status) 44ms |
find(type,residentId) 52ms | allDocs(100) 16ms
```

**How to read these numbers honestly — three caveats:**

1. **This is ONE barangay's scale, not a municipality load test.** 10 000
   synthetic documents is the order of magnitude of a single barangay's
   certificate-request history, not the order of magnitude of a municipality.
   The document does **not** establish a municipality capacity figure.
2. **The `_find` measurements are the default-limit query.** CouchDB's `_find`
   returns at most **25 rows** unless a `limit` is supplied, and the
   application does not supply one
   (`frontend/src/services/db.js:994`, `db.find({ selector: { type:
   'certificate_request' } })`). The run confirms this: *rows returned by
   find(type,status) : 25*. These numbers therefore measure **indexed lookup
   plus a 25-row fetch** — which is what the application actually does — and
   they must not be presented as "a 10 000-document search completed in 44 ms".
   A municipality-scale dashboard that needs to page through all matching
   records is a different workload, quantified in §3(e).
3. **The first of the ten runs is an index warm-up** (293 ms and 426 ms
   respectively; the steady-state samples are 15–21 ms and 3–17 ms). The
   averages above include that one-off cost, as specified. The per-run samples
   are printed by the script so the warm-up is visible rather than hidden.

**What was measured and what was not.** Measured: bulk write throughput, the
two Mango index patterns the application actually uses, a bounded `allDocs`
read, and the document-count confirmation. **Not** measured: end-to-end
replication throughput from many devices, the behaviour of the Node sync proxy
under hundreds of concurrent long-poll connections, behaviour at volumes
beyond 10 000 documents, and any multi-node or clustered deployment.

---

## 3. What would break first at municipality scale

Ordered by how soon the limit is reached, with the code that currently encodes
the assumption.

**(a) A single CouchDB instance — one point of failure.**
The endpoint is a single URL read from the environment: `COUCHDB_URL` in
`server/.env`, consumed at `server/index.js` and used by
`server/scripts/backup.js` (`const COUCHDB_URL = process.env.COUCHDB_URL`).
There is no cluster configuration, no shard definition, and no replica set in
the deployment. The instance is also the only copy of the replicated data: a
device that has synced holds no second copy of *other* devices' writes, so an
outage of this instance is an outage of the shared dataset, not merely of the
sync path. *This is the first thing to break, and it breaks by data loss
rather than by slowness.*

**(b) One shared database `bustrachub_db` for the whole installation.**
`server/index.js:215` hard-codes `const DB_NAME = 'bustrachub_db'`, and the
sync proxy explicitly restricts the proxy to that one database
(`ALLOWED_DB`, `server/index.js:322`; the check at `server/index.js:702`
rejects any other `dbId`). `server/scripts/backup.js` and
`server/scripts/restore.js` likewise default to the same single name. The
natural sharding boundary for a municipality is one database per barangay, and
the current design cannot express that: the proxy would refuse a second
database, the backup script would back up only one, and every dashboard query
would have to filter by barangay to avoid returning another barangay's
residents.

**(c) A single Node.js process proxying all sync traffic.**
`server/index.js:1719` — `app.listen(PORT, '0.0.0.0', ...)`. The
`/api/sync/:dbId/*` proxy (`server/index.js:306`) streams every replicated
change through that one process's event loop. Each replicating device holds a
long-lived `_changes` connection, so a municipality's worth of devices
(hundreds of concurrent long-polls) would be served by a single-threaded
process that is simultaneously doing JSON transformation, role-based
authorization per document, and audit-log writes. Event-loop saturation appears
first as replication latency, then as failed heartbeats and timeouts.

**(d) Unbounded audit-log growth.**
Every write is recorded as a separate `audit_log` document
(`server/index.js:385` and `server/index.js:652`, and the client-side
`createAuditLog()` in `frontend/src/utils/auditLog.js`). There is no
retention, archival, or rollup policy. The audit trail grows monotonically and
is replicated to every device, so its cost is paid in three places: storage,
replication volume, and the device's own IndexedDB.

**(e) Mango queries with an `allDocs` fallback — a full scan at volume.**
`frontend/src/pages/DashboardPortal.jsx:1086-1092` falls back to a full
`allDocs` scan of the local database whenever the Mango path returns nothing,
and logs `[dashboard-stats] Mango path failed, using allDocs fallback:` — a
message that appears repeatedly in the application's own console output. At
municipality scale the local store per device is also much larger, so this
fallback turns a bounded indexed read into an unbounded scan on the device.
This is the failure most likely to be *seen* by a user, because it is logged.

**(f) No rate limiting on the sync proxy.**
`server/index.js` contains no rate-limiting middleware, and `server/package.json`
depends on no rate-limiting library. The proxy is therefore bounded only by
the CouchDB server's own timeouts. The client-side throttle exists
(`frontend/src/services/db.js:66-68`, a 5 s retry with a 60 s ceiling) but a
client is not a security control against a misbehaving or compromised one.

**(g) No server-side session revocation.**
`jwt.sign()` (`server/index.js:257`) and `jwt.verify()`
(`server/index.js:273`) are the whole of the session implementation: there is
no denylist, no `jti` claim, and no revocation store, and the server exposes
no logout endpoint that invalidates a token. A token therefore remains valid
for its full 8-hour lifetime (`JWT_EXPIRES_IN`) even after the holder reports
the device lost — which is precisely the window in which a stolen device is
most useful to an attacker.

---

## 4. What would be required for municipality scale

1. **A CouchDB cluster** (three or more nodes, sharded by database) behind a
   load balancer, with the current single-database deployment replaced by
   **one database per barangay** — the natural sharding boundary, and one that
   also contains the conflict surface.
2. **Multiple Node.js processes** of the same server behind a load balancer.
   The stateless JWT session makes this a configuration change rather than a
   code change, provided the load balancer terminates TLS and the
   `COUCHDB_URL` and `JWT_SECRET` are shared across the pool.
3. **TLS everywhere** — between the browser and the API, and between the API
   and CouchDB. The server already reports the endpoint's transport posture
   (`GET /api/health/couchdb`, surfaced in the admin *CouchDB Connection*
   card) and warns at boot when a remote endpoint is reached without TLS; the
   deployment must then enforce it.
4. **Scheduled per-database off-site backup with a tested restore.** The
   existing plan (daily `couchdb-dump`/`couchbackup` plus a `_changes` log)
   becomes per-barangay, and the restore drill must be executed and recorded,
   because replication is not a backup: deletions and corruption replicate too.
5. **Audit-log archival.** A retention window with periodic rollup to cold
   storage, so the replicated audit trail stops growing without bound.
6. **Rate limiting** on the sync proxy and on the public API, with the
   per-device client throttle treated as a courtesy rather than a control.
7. **Pagination** on every list and dashboard query, and the removal of the
   `allDocs` full-scan fallback in favour of a bounded, indexed query.
8. **Server-side session revocation**, so a reported-lost device can be
   cut off immediately rather than at token expiry.
9. **A real load test at the target volume** — many concurrent replicating
   devices against the clustered deployment, measuring replication latency and
   proxy CPU, not only database insert throughput.
10. **Monitoring** of replication lag, proxy event-loop delay, database
    document counts, and device-registry "possibly lost" status, so that the
    limits above are observed before they are reached.

---

## 5. What is NOT claimed

- **No municipality-scale deployment exists or has been tested.** The evidence
  in §2 is a single-barangay database benchmark against a local CouchDB.
- **No load test beyond the baseline in §2 was executed.** In particular there
  is no measurement of many-device replication, of the Node proxy under
  hundreds of concurrent long-poll connections, of behaviour above 10 000
  documents, or of any clustered or multi-node arrangement.
- **No per-barangay sharding exists.** The system uses a single shared
  database, `bustrachub_db` (`server/index.js:215`), and the sync proxy
  refuses any other database (`server/index.js:702`).
- **The 10 000-document figures are not a capacity ceiling.** They are one
  measurement on one machine against one local CouchDB; the numbers in §2
  include the caveat that the Mango queries are default-limit (25-row) reads.
- **No claim is made about the availability or durability of the current
  single CouchDB instance** beyond what §3(a) states.

---

## 6. Paste-ready paragraph for Chapter 5 Recommendations

> The study recommends that any extension of Bustrac Hub beyond a single
> barangay be undertaken only after the single-instance assumptions identified
> in this chapter have been removed. Specifically, the central CouchDB service
> should be deployed as a multi-node cluster behind a load balancer with the
> present single shared database replaced by one database per barangay — the
> natural sharding boundary, which also contains the conflict-resolution
> surface — and the Node/Express synchronization proxy should be replicated
> across multiple processes behind the same load balancer, an arrangement the
> existing stateless JSON Web Token session model already permits without
> modification to the application code. Transport encryption should be
> enforced between the browser and the API and between the API and the
> database, and each per-barangay database should be subject to a scheduled
> off-site backup with a periodically rehearsed restore drill, given that
> replication alone propagates deletions and corruption in the same manner as
> ordinary writes. In addition, the system requires a retention and archival
> policy for the audit trail, which currently grows without bound, rate
> limiting at the synchronization proxy, the removal of the full-collection
> fallback in the dashboard query path, and the introduction of server-side
> session revocation so that a device reported lost can be withdrawn
> immediately rather than at the expiry of its token. Finally, any such
> extension should be validated by a load test at the intended operating
> volume, measuring replication latency and proxy resource occupancy from
> many concurrent devices rather than database write throughput alone, together
> with continuous monitoring of replication lag and device-registry status; the
> benchmark reported in this chapter constitutes a single-barangay baseline
> only and does not establish a capacity figure for municipal deployment.
