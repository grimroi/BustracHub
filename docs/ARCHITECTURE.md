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
- Middleware: `authenticate` (Bearer token → 401), `requireRole('admin','staff')` for privileged REST endpoints, `authorizeSyncAccess` for the sync proxy.

### Sync proxy with authorization

The proxy at `/api/sync/:dbId/*` exposes the full CouchDB HTTP surface to PouchDB.

- **Residents (role `resident`):**
  - Read endpoints (`_all_docs`, `_find`, `_bulk_get`, `_changes`, GET/PUT of own docs) are allowed. Residents replicate only data scoped to them by the client replication filter.
  - Write endpoints are checked by `authorizeResidentWrite`: the document type must be in `RESIDENT_WRITE_TYPES` (e.g. `certificate_request`, `feedback_report`, `blotter_record`, `user` for the resident's own account) **and** the document must be owned by the resident (`username`/`residentId` match).
  - `blotter_record` writes are additionally guarded by `RESIDENT_PROTECTED_BLOTTER_FIELDS` inside `verifyExistingDocOwnership` — a resident cannot change case-lifecycle fields shipped by staff/admin (`status`, `summonCount`, `nextHearingDate`, `cfaIssued*`, `resolution`, …). This both fixes the previous 403 (residents may now file their own blotter) and keeps the case lifecycle authoritative.
  - `_bulk_docs` (the write path PouchDB replication actually uses) is fully covered, including tombstones for owned docs.
- **Admin/Staff:** unrestricted through the proxy.
- Every resident sync write is annotated **server-side** into an `audit_log` document (`recordResidentAudit`, action `RESIDENT_SYNC_WRITE`). This is important because resident clients keep their own audit entries as `_local/` docs that never replicate — the server-side entry is what admins actually see.

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

## Document model (CouchDB `bustrachub_db`)

- `user_<username>` — account record (role, `passwordHash`, profile fields, `residentId`).
- `blotter_report` / `blotter_record` — blotter cases (staff/admin file `blotter_report`; residents file their own `blotter_record`; both are read by the dashboard).
- `certificate_request` — resident certificate requests.
- `feedback_report` / `feedback` — resident feedback.
- `audit_log` — audit trail (server-generated for sync writes; client-generated for in-app admin actions).
- `offline_auth`, helper docs — operational/diagnostic.

## Failure handling

- Replication failures (network, 403/401) never log the user out; sessions persist (`isAuthError` treats only 401 as terminal).
- The changes listener auto-reconnects every 5 s.
- Legacy local data that should not have replicated (older `audit_log`/`offline_auth` docs in resident stores) is purged one time on boot.