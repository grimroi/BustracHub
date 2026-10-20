# API Reference

Base URL: `http://localhost:5000` (default backend port; see `VITE_API_URL`).

All authenticated endpoints use:

```
Authorization: Bearer <sessionToken>
```

The token comes from `POST /api/login`. The client never holds CouchDB credentials.

---

## Health & status

### `GET /api/status`
Unauthenticated. Returns backend liveness.

```json
{ "status": "online", "message": "BustracHub Backend Server is active!" }
```

---

## Auth

### `POST /api/login`
Body: `{ "username": "juan2026", "password": "password" }`

Success → `200`:
```json
{
  "success": true,
  "sessionToken": "<opaque token>",
  "user": { "id": "user_juan2026", "username": "juan2026", "role": "resident",
            "fullName": "...", "residentId": "RES-0001", "purok": 1,
            "contact": "09170000001", "email": "...", "status": "Active" }
}
```

Failures: `400` missing fields, `401` bad credentials, `403` deactivated account.

### `GET /api/me`
Authenticated. Returns the current session user (same shape as the `user` above). Used by the SPA to rehydrate after refresh.

### `POST /api/register`
Public. Creates a resident account.
Body: `{ "username", "password", "fullName", "firstName", "lastName", "purok", "contact" }`

---

## Certificate & blotter REST

### `POST /api/blotter`  *(admin/staff)*
Body: creates a `blotter_report` document. Role-gated by `requireRole('admin','staff')`. Response includes the generated case/tracking number.

### `POST /api/blotter/send-summons`  *(admin/staff)*
From `server/routes/blotterRoutes.js`. Marks a case as summoned (updates `summonCount`/`nextHearingDate` etc.).

Certificate routes (`server/routes/certificateRoutes.js`):
- `POST /certificate/issue` *(admin/staff)* — issue a certificate.
- `GET /certificate/issued` *(admin/staff)* — list issued certificates.
- `GET /certificate/verify/:id` — public verification (QR link) lookup.

---

## Statistics

- `GET /api/stats/pending-certificates` *(admin/staff)* — pending certificate requests.
- `GET /api/stats/blotter-summary` — blotter totals across `blotter_report` and `blotter_record`.
- `GET /api/stats/monthly-feedback` — feedback counts by month.

## `GET /api/public`
Public data endpoint (announcements etc. for unauthenticated browsing).

---

## Notifications (SSE)

### `GET /api/notifications`
Server-Sent Events stream. Sends an initial `CONNECTED` frame, then events for new data. Broadcast payloads for blotter updates are deliberately **PII-free**:

```json
{ "type": "BLOTTER_UPDATE", "message": "May bagong update ang isang blotter case..." }
```

> The SSE feed is unauthenticated, so it never carries case numbers, names, or schedules.

---

## CouchDB sync proxy

All replication goes through the authenticated proxy. PouchDB points at:

```
http://localhost:5000/api/sync/bustrachub_db
```

Route pattern (each method registered for the DB root and any `/*rest` subpath):

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| GET/HEAD | `/api/sync/bustrachub_db[(*)]` | `info()`, reads, `_changes`, `_all_docs`, `_find`, `_local/*` |
| POST | `/api/sync/bustrachub_db/(_bulk_docs\|_revs_diff\|_design/*\|...)` | writes, replication bulk ops |
| PUT | `/api/sync/bustrachub_db/<doc>` | create/update single doc |
| DELETE | `/api/sync/bustrachub_db/<doc>` | delete |

Authorization (see `docs/ARCHITECTURE.md`):

- **Admin/Staff:** full access to every route.
- **Resident:**
  - Reads: authenticated reads allowed (filtered client-side by the replication filter).
  - Writes: must be one of `RESIDENT_WRITE_TYPES` **and** owned by the resident (`username`/`residentId`). For `blotter_record`, protected case-lifecycle fields are enforced server-side.
  - Violations → `403` `{ error: "forbidden", reason: "Residents may only write documents they own." }`, and a `[SYNC 403]` server log with metadata only.

### `GET /api/sync/`
PouchDB probe. Returns `{ "ok": true, "db_name": "bustrachub_db" }` (plus a `HEAD` variant).

---

## Device registry

Lets the server answer *"which devices still hold unsynced records?"*. A staff/admin device posts a heartbeat and the server keeps the last report per device in a `device_registry_<deviceId>` document. Because a device that is offline or lost cannot send a heartbeat, the last report still describes the state it was in when it went silent.

### `POST /api/devices/heartbeat` — report this device's state

**Access:** `admin`, `staff` (any other role → `403`; no token → `401`).

Request body:

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `deviceId` | string | yes | stable per-device id generated on first load; sanitised server-side. Invalid/missing → `400` |
| `label` | string | no | human-readable device name |
| `pendingChangeCount` | number | no | unsynced local documents at the time of the report; normalised to a non-negative integer |
| `lastSuccessfulSyncAt` | ISO string | no | timestamp of the last successful replication |

`assignedUser` is taken from the **authenticated session**, never from the request body, so a device cannot be attributed to a different user.

Response `200`:

```json
{
  "success": true,
  "device": {
    "deviceId": "dev_abc123",
    "label": "Chrome on Windows",
    "assignedUser": "mgcortero",
    "lastHeartbeatAt": "2026-10-20T12:00:00.000Z",
    "pendingChangeCount": 4,
    "lastSuccessfulSyncAt": "2026-10-20T11:00:00.000Z"
  }
}
```

A repeated heartbeat for the same `deviceId` updates the existing document (it does not create a second one).

### `GET /api/devices` — the administrative device list

**Access:** `admin` only. A `staff` token → `403`; no token → `401`.

Query parameter: `staleHours` (optional) — overrides the staleness threshold for this request. Precedence: `?staleHours=` → `DEVICE_STALE_HOURS` environment variable → default `24`.

Response `200`:

```json
{
  "success": true,
  "staleHours": 24,
  "summary": {
    "total": 3,
    "online": 1,
    "stale": 1,
    "possiblyLost": 1,
    "devicesHoldingUnsynced": 1
  },
  "devices": [
    {
      "deviceId": "dev_abc123",
      "label": "Chrome on Windows",
      "assignedUser": "mgcortero",
      "lastHeartbeatAt": "2026-10-20T12:00:00.000Z",
      "pendingChangeCount": 4,
      "lastSuccessfulSyncAt": "2026-10-20T11:00:00.000Z",
      "status": "possibly-lost",
      "staleHours": 24,
      "minutesSinceHeartbeat": 2880
    }
  ]
}
```

`status` is one of:

- `online` — a heartbeat was received inside the staleness window.
- `stale` — no heartbeat inside the window and the last report had `pendingChangeCount = 0`.
- `possibly-lost` — no heartbeat inside the window and the last report had `pendingChangeCount > 0` (the device went silent while holding unsynced records).

The list is sorted with `possibly-lost` first, then `stale`, then `online`.

---

## Cookie/header CORS notes

- CORS allows explicit origins only (`http://localhost:5173`, `127.0.0.1:5173`, `localhost:3000`, and a configurable LAN IP), with `credentials: true`.
- `OPTIONS` preflight is short-circuited before auth.
- Exposed response headers include `Content-Type`, `ETag`, `Cache-Control`, `Content-Length` (needed by PouchDB).
- Raw body handling: `/api/sync` uses an `express.raw({ inflate:false, type:()=>true, limit:'50mb' })` parser so replication payloads reach CouchDB byte-for-byte (including compressed bodies).

---

## Session & error codes used by the SPA

| Status | Meaning | Client behavior |
| ------ | ------- | --------------- |
| 200 | OK | success |
| 400 | bad request / malformed payload | surface error, keep session |
| 401 | invalid/expired token | clear session, send to login |
| 403 | not allowed / deactivated | **keep** session; sync stays paused (does not log out) |
| 500 | upstream/unavailable | retry later |

For every resident reject, metadata-only `[SYNC 403]` + `[SYNC DENY]` logs are written on the server (no document bodies, hashes, or tokens).