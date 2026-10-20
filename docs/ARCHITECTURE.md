# Architecture

## High-level view

```
┌──────────────────────────┐      HTTPS/AJAX/Sync      ┌───────────────────────────┐
│   Browser (PouchDB)      │ ────────────────────────▶ │  Express API (server)     │
│   React + Vite (5173)    │                           │  :5000                    │
│   · localDb (IndexedDB)  │ ◀──────────────────────── │   · /api/login, /api/me   │
│   · remoteDb→/api/sync   │      response/SSE         │   · /api/sync/* proxy     │
└──────────────────────────┘                           │   · /api/blotter, stats   │
                                                       └───────────┬───────────────┘
                                                                   │  nano (server-side)
                                                                   ▼
                                                          ┌───────────────────────┐
                                                          │   CouchDB 3.x          │
                                                          │   bustrachub_db        │
                                                          │   (5984)               │
                                                          └───────────────────────┘
```

## Data flow — offline-first writes

1. The user performs an action (file a blotter, request a certificate, …).
2. The record is written **immediately** to the local PouchDB database (`bustrachub_db` in IndexedDB via `frontend/src/services/db.js`).
3. PouchDB replicates to `remoteDb`, whose URL is the Express proxy `http://localhost:5000/api/sync/bustrachub_db`.
4. The Express proxy authenticates the session token, enforces authorization rules, then forwards the exact bytes to CouchDB with a **server-side** Basic Auth header.
5. When online, changes sync automatically; when offline they stay queued locally and sync on reconnect. The UI shows a sync badge (`frontend/src/components/SyncStatusIndicator.jsx`).

**Why no direct CouchDB access?** PouchDB never sees the CouchDB URL or credentials. All CouchDB traffic is tunneled through the authenticated proxy, so the browser holds only an opaque, short-lived session token.

## Backend (`server/index.js`)

### Auth

- `POST /api/login` verifies the password (bcrypt, with legacy SHA‑256 upgrade path) and issues a random opaque `sessionToken` stored in an in-memory `SESSIONS` map (TTL 8h). The token payload includes `username`, `role`, `residentId`, `purok`, `contact`, etc.
- `GET /api/me` returns the current session user so the frontend rehydrates after a refresh.
- Middleware: `authenticate` (Bearer token → 401), `requireRole('admin','staff')` for privileged REST endpoints, `authorizeSyncAccess` for the sync proxy. `vawc_officer` is a specialised **staff** role: `requireRole` treats it as satisfying any allow-list that grants `'staff'`, and `authorizeSyncAccess` treats it as privileged (full read + write). Its only extra capability is reading **unmasked** VAWC records (see below).

### Sync proxy with authorization

The proxy at `/api/sync/:dbId/*` exposes the full CouchDB HTTP surface to PouchDB.

- **Residents (role `resident`):**
  - Read endpoints (`_all_docs`, `_find`, `_bulk_get`, `_changes`, GET/PUT of own docs) are allowed. Residents replicate only data scoped to them by the client replication filter.
  - Write endpoints are checked by `authorizeResidentWrite`: the document type must be in `RESIDENT_WRITE_TYPES` (e.g. `certificate_request`, `feedback_report`, `blotter_record`, `user` for the resident's own account) **and** the document must be owned by the resident (`username`/`residentId` match).
  - `blotter_record` writes are additionally guarded by `RESIDENT_PROTECTED_BLOTTER_FIELDS` inside `verifyExistingDocOwnership` — a resident cannot change case-lifecycle fields shipped by staff/admin (`status`, `summonCount`, `nextHearingDate`, `cfaIssued*`, `resolution`, …). This both fixes the previous 403 (residents may now file their own blotter) and keeps the case lifecycle authoritative.
  - `_bulk_docs` (the write path PouchDB replication actually uses) is fully covered, including tombstones for owned docs.
- **Admin/Staff:** unrestricted through the proxy.
- **VAWC officer (`vawc_officer`):** inherits every staff permission and is one of only two roles (`admin`, `vawc_officer`) permitted to read **unmasked** VAWC records.
- Every resident sync write is annotated **server-side** into an `audit_log` document (`recordResidentAudit`, action `RESIDENT_SYNC_WRITE`). This is important because resident clients keep their own audit entries as `_local/` docs that never replicate — the server-side entry is what admins actually see.

### VAWC confidentiality (RA 9262 §44 / DPA 2012)

A blotter document is VAWC-sensitive when `vawcFlag === true`. Client-side masking alone is **not** a security boundary (a user can call the proxy with curl), so the same redaction is enforced **server-side** in the sync proxy.

- **Policy (single source, two copies):** `server/utils/vawcAccess.js` and `frontend/src/utils/vawcAccess.js` hold the identical policy — `VAWC_SENSITIVE_FIELDS` (`narrative`, `complainantName`, `complainantAddress`, `respondentName`, `respondentAddress`, `contactNumber`) are replaced with `VAWC_REDACTION_MARKER` (`[REDACTED — VAWC]`) for viewers who are **neither** `admin` **nor** `vawc_officer`. `_id`, `type`, `status`, `caseNumber`, `createdAt` stay visible so the case can still be tracked.
- **Server read redaction (`proxyCouch`):** JSON read responses are buffered and rewritten for non-authorized viewers (single-doc GET, `_all_docs`, `_bulk_get`, `_changes`). `Content-Length` is recomputed after rewriting. Writes and error responses stream through untouched.
- **Server unmask audit:** when an `admin`/`vawc_officer` is served a read that carries VAWC docs, the proxy writes a `VAWC_UNMASK_ACCESS` `audit_log` entry (`source: 'server-sync-proxy'`), fire-and-forget.
- **Client render/export boundaries (`frontend/src/pages/DashboardPortal.jsx`):** the blotter masterlist renders from `displayBlotters` (masked), and the blotter detail screen, the Excel export (`handleExportBlotterToExcel`), and the certificate print modal all apply `maskVawcRecords(...)` before any field reaches the DOM or a file. Authorized exports of unmasked VAWC rows are audited (`VAWC_UNMASK_ACCESS`, `via: 'EXPORT'`).

### Listener

`startBlotterSMSListener` watches the CouchDB `_changes` continuous feed and, when a blotter reaches a *summons* status (`1st/2nd/3rd Summon`, `Summons`, or `Under Mediation` — written by `frontend/src/components/SummonsPanel.jsx`), sends an SMS (if a provider + phone are available, guarded by `lastSmsStatus` dedup) and broadcasts a **PII‑free** `BLOTTER_UPDATE` event over SSE at `/api/notifications`.

## Frontend (`frontend/src`)

| Area | Files |
| ---- | ----- |
| Data layer | `services/db.js` — PouchDB setup, `setupPouchDBSync`, `forceSyncToRemote`, `onSyncStatusChange`, replication filter, legacy purge |
| Administrator/Staff | `pages/DashboardPortal.jsx`, `pages/DashboardLayout.css`, screen components under `components/screens/*` |
| Resident portal | `pages/ResidentUI.jsx` + `components/Resident/*` |
| Auth | `pages/LogIn.jsx`, `pages/ProtectedRoute.jsx`, `utils/tokenStore.js`, `utils/api.js` |
| Sync UI | `components/SyncStatusIndicator.jsx`, `components/Layout/Topbar.jsx` |

### Replication filter (role-aware)

`makeReplicationFilter` (in `services/db.js`) is applied to both directions of replication:

- `_local/` documents are never replicated (they are device‑local: sessions, private audit).
- For **residents**, `audit_log` and `offline_auth` documents are not pulled/pushed (privacy — residents only receive data they need).
- `user_*` account documents and `certificate_request` docs still sync (they are the real account records used by `AddUserModal`/`EditUserModal`).
- Tombstones (`_deleted:true`) are handled by the filter so deletes propagate correctly.

### Sync status events

`db.js` emits `{ status, pending, detail }` (`onSyncStatusChange`). Coarse states: `syncing`, `synced`, `error`, `offline`. Pages subscribe and render the badge: 🟢 Online • Synced, 🟡 Syncing…, 🟠 Offline • Queued, 🔴 Sync Error • Retrying… (or "Waiting for permission • retrying" on a 403). Sync is **automatic** (with exponential-backoff retry); an optional **Retry Sync** button forces an immediate cycle.

## Security model summary

1. **No client credentials** — CouchDB admin credentials live only in `server/.env` and are injected server-side.
2. **Session tokens** — opaque, in-memory, 8h TTL; renewed by login.
3. **Authorization at the proxy** — residents can only read/write what they own; lifecycle fields are protected.
4. **PII‑safe SSE** — the public event stream carries no case/name/schedule data.
5. **Server-side audit** for resident sync writes; server audit docs only replicate to admin/staff.
6. **Filtered replication** keeps resident clients from pulling unrelated or privileged data.
7. **VAWC confidentiality enforced server-side** — the sync proxy redacts VAWC-sensitive fields for anyone who is not `admin`/`vawc_officer` (RA 9262 §44), and logs a `VAWC_UNMASK_ACCESS` audit entry whenever an authorized viewer receives unmasked VAWC data.
8. **Response security headers** — both the Vite dev server (`server.headers`) and the preview/production server (`preview.headers`, plus the backend) send `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Permissions-Policy` on every path (ZAP rules 10038/10020/10021 satisfied).

## Document model (CouchDB `bustrachub_db`)

- `user_<username>` — account record (role, `passwordHash`, profile fields, `residentId`).
- `blotter_report` / `blotter_record` — blotter cases (staff/admin file `blotter_report`; residents file their own `blotter_record`; both are read by the dashboard). A record with `vawcFlag === true` is a VAWC case and is subject to server-side read redaction (see *VAWC confidentiality* above).
- `certificate_request` — resident certificate requests.
- `feedback_report` / `feedback` — resident feedback.
- `audit_log` — audit trail (server-generated for sync writes; client-generated for in-app admin actions).
- `device_registry_<deviceId>` — server-side registry entry for one staff/admin device (`type: 'device_registry'`). Written **by the server** when the device posts a heartbeat to `POST /api/devices/heartbeat`. Fields: `deviceId`, `label`, `assignedUser` (taken from the authenticated session, never from the request body), `lastHeartbeatAt`, `pendingChangeCount`, `lastSuccessfulSyncAt`, `lastSnapshotAt` (when the device last produced a local snapshot), `status`, `createdAt`, `updatedAt`.
- `device_status_<deviceId>` — client-written, replicated copy of the same heartbeat state (`type: 'device_status'`). It is an offline convenience copy: it stays visible to other staff devices when the server is unreachable. The **server-side `device_registry` is the authoritative source** for the administrative device list.
- `offline_auth`, helper docs — operational/diagnostic.

### Device registry and the "possibly lost" status

A staff/admin device reports a heartbeat (device id, label, current pending-change count, last successful sync time) to the server on application load, when connectivity returns, and after every replication cycle. The server keeps the last report per device, which means it can answer the question *"which devices still hold unsynced records?"*.

Because a device that is offline — or lost — cannot send a heartbeat, the **last** report the server received still describes the state that device was in when it went silent. The server derives a status from that (policy in `server/utils/deviceRegistry.js`):

| Status | Condition | Meaning |
| ------ | --------- | ------- |
| `online` | heartbeat received within the staleness window | the device is reporting normally |
| `stale` | no heartbeat within the window, and the last report had `pendingChangeCount = 0` | the device is silent, but it had nothing queued |
| `possibly-lost` | no heartbeat within the window, and the last report had `pendingChangeCount > 0` | the device went silent **while holding unsynced records** — the device-loss scenario |

The staleness window defaults to 24 hours and is configurable per request (`?staleHours=`) or per deployment (`DEVICE_STALE_HOURS`).

**Scope limit:** only `admin` and `staff` devices are registered (`POST /api/devices/heartbeat` is restricted to those roles), and only `admin` may read the list (`GET /api/devices`). Resident devices are not registered; see `docs/REMOTE_WIPE_FEASIBILITY.md` and the Chapter 5 recommendations for the follow-up.

### Mandatory end-of-day sync checkpoint

The replication queue is the one place where a record exists on exactly one device. The checkpoint (`frontend/src/services/syncCheckpoint.js`) turns that into an explicit procedure:

1. The **Close for the day** control (admin portal → Data Protection) measures the queue with `getPendingSyncCount()`.
2. If the queue is **not** empty, a **non-dismissible** warning is raised (`buildSyncCheckpointAlertOptions()`: no cancel button, no outside-click dismissal, no Escape dismissal) that states the pending count and offers a **Sync Now** action.
3. A replication cycle is attempted. The checkpoint passes **only** when the queue is empty afterwards.
4. On success an `audit_log` entry with action **`END_OF_DAY_SYNC_CONFIRMED`** is written, carrying `deviceId`, `actor`, `pendingAtStart`, `syncedCount` and `timestamp` (both in the structured `meta` payload and in the human-readable `details`).
5. On a blocked close **no** audit entry is written, and the queued records are left untouched — the checkpoint never discards data.

The policy is implemented in a service module rather than in the page component so that it is unit-testable and can be reused by any future surface.

### Local snapshots and export hardening

The device database can be exported as a JSON snapshot. The artifact carries a schema header (`schema: 'bustrac.snapshot'`, `schemaVersion`), the originating `deviceId`, an **SHA-256 integrity checksum** over the payload, and a file name that carries the device id and a UTC timestamp (`bustrac_snapshot_<deviceId>_<YYYYMMDD-HHMMSS>.json`). A scheduled snapshot runs on a configurable interval (default: daily) and records its time in the `device_registry` document as `lastSnapshotAt`. Snapshots can optionally be encrypted with a passphrase (AES-256-GCM, PBKDF2-SHA-256) where the browser exposes WebCrypto. Full description, format and restore procedure: [`docs/SNAPSHOTS_AND_EXPORT.md`](SNAPSHOTS_AND_EXPORT.md).

### Disaster Readiness (read-only status display)

The **Disaster Readiness** card (admin portal → Data Protection) answers one operational question before a calamity: *is this device prepared to keep working when the network, the power or the typhoon takes it offline?*

It is a **status display and checklist only**. It reads state that already exists and reports it; it does not touch synchronisation, replication, PouchDB, authentication or any offline-first behaviour, and it never writes to the database.

The policy lives in `frontend/src/services/disasterReadiness.js`:

- `assessDisasterReadiness({ checks })` is **pure** — it takes already-collected values and returns `{ ready, score, checks, recommendation }`.
- `collectDisasterReadinessChecks()` gathers those values from the browser, with every dependency injectable so the whole thing is unit-testable without a browser.
- `getBatteryStatus()` reads the Battery Status API and never throws; an unavailable API resolves cleanly to `supported: false`.

Seven checks are evaluated. The three **critical** checks (`offline_auth_cached`, `service_worker_active`, `local_db_healthy`) carry 25 points each; the remaining four carry 5 points each. The total (95) is normalised to 100 for the score. `ready` is true **only** when every critical check passes — a low battery or a stale sync lowers the score and is named in the recommendation without blocking deployment.

| Check | Critical | Meaning |
| ----- | -------- | ------- |
| `offline_auth_cached` | yes | `bustrac_offline_auth` holds a cached credential, so the device can authenticate with no server |
| `service_worker_active` | yes | `navigator.serviceWorker.controller` is set, so the app shell opens offline |
| `local_db_healthy` | yes | `db.info()` on the local PouchDB succeeds |
| `recent_sync` | no | the last successful sync was within 24 hours |
| `no_pending_changes` | no | `getPendingSyncCount()` is 0 — no record lives only on this device |
| `storage_available` | no | at least 50 MB of device storage is free |
| `battery_ok` | no | battery is at or above 20 %, or the device does not report its battery |

Full description, the honest limitation and the practical pre-disaster checklist: [`docs/DISASTER_READINESS.md`](DISASTER_READINESS.md).

### Related assessments

- [`docs/ENCRYPTION_AT_REST_ASSESSMENT.md`](ENCRYPTION_AT_REST_ASSESSMENT.md) — what is protected at rest today (passwords are bcrypt-hashed; the local database, the outbox and the session token are **not** encrypted), the feasibility of encrypting the local PouchDB store, and the trade-offs.
- [`docs/REMOTE_WIPE_FEASIBILITY.md`](REMOTE_WIPE_FEASIBILITY.md) — why a browser-hosted client cannot be meaningfully remotely wiped, and why server-side session revocation is the correct response to a lost or stolen device.

## Failure handling

- Replication failures (network, 403/401) never log the user out; sessions persist (`isAuthError` treats only 401 as terminal).
- The changes listener auto-reconnects every 5 s.
- Legacy local data that should not have replicated (older `audit_log`/`offline_auth` docs in resident stores) is purged one time on boot.