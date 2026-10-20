# BustracHub Manual QA & Evidence Plan

## Context
- **Branch/Commit**: Current working state (post Option B patch)
- **Boot Markers**:
  - Server: `sync-auth-cors-framing-2026-10-12`
  - Frontend: `owner-filter-event-registration-2026-10-12`
- **Static Verification**: ✅ Passed (node --check, esbuild, eslint)

---

## Test Matrix

| ID | Area | Scenario | Expected Result | Evidence to Capture |
|----|------|----------|-----------------|---------------------|
| QA-01 | Resident Create Registration | Resident registers for a barangay_event with status "Pending" | Doc created with `eventId`, `status: "Pending"`, resident as owner; `approvedAt/By`, `rejectedAt/By`, `attendedAt/By` absent | Console log of created doc, PouchDB inspector screenshot |
| QA-02 | Resident Cancel Own Registration | Resident cancels their own "Pending" registration | Status changes to "Cancelled"; protected fields remain absent | Before/after doc diff, console log |
| QA-03 | Resident Cannot Modify Protected Fields | Resident attempts to set `approvedAt`, `approvedBy`, `rejectedAt`, `rejectedBy`, `attendedAt`, `attendedBy` | Write rejected (403/validation error); doc unchanged | Error response, doc version unchanged |
| QA-04 | Resident Cannot Change Status to Invalid Value | Resident tries to set status to "Approved", "Rejected", "Attended" | Write rejected; only "Pending"/"Cancelled" allowed for resident writes | Error response |
| QA-05 | Resident Cannot Register for Non-Existent Event | Resident submits registration with invalid/missing `eventId` | Write rejected; `verifyExistingDocOwnership` enforces eventId existence | Error response |
| QA-06 | Staff/Admin Can Approve/Reject | Staff user updates registration to "Approved"/"Rejected" with timestamps | Write succeeds; `approvedAt/By` or `rejectedAt/By` populated | Updated doc, audit trail |
| QA-07 | Staff/Admin Can Mark Attended | Staff user updates registration to "Attended" | Write succeeds; `attendedAt/By` populated | Updated doc |
| QA-08 | Sync Queue Includes event_registration | Resident creates registration offline → comes online | Doc appears in sync queue, replicates to server | `window.__BUSTRAC_SYNC_PATCH__.inspectLocalSyncQueue()` output |
| QA-09 | Owner-Aware Filter Works | Resident logs in → views registrations | Only their own event_registration docs visible (not others') | Console log of query results, doc count |
| QA-10 | Public barangay_event Read | Any authenticated user views events | All barangay_event docs readable (RESIDENT_PUBLIC_READ_TYPES) | Query result count matches server |
| QA-11 | CORS/Proxy/CouchDB Framing | Frontend → Server → CouchDB request chain | No CORS errors; framing headers present; proxy works | Network tab HAR, server logs |
| QA-12 | Certificate/Blotter Unaffected | Existing certificate/blotter flows still work | No regression in create/read/update for those types | Spot-check 1-2 operations per type |
| QA-13 | Device heartbeat sent | Staff logs in → app load → heartbeat reaches the server | `POST /api/devices/heartbeat` returns 200; a `device_registry_<deviceId>` doc exists with `deviceId`, `label`, `assignedUser`, `lastHeartbeatAt`, `pendingChangeCount`, `lastSuccessfulSyncAt`, `status` | Network tab (200), Fauxton `device_registry_*` doc |
| QA-14 | Heartbeat pending count is accurate | Device holds N unsynced local changes → heartbeat reports N | The reported `pendingChangeCount` equals the number shown in the dashboard sync badge | Network tab body vs. badge value |
| QA-15 | Heartbeat on reconnect | Device is offline → edit a record → connectivity restored | A heartbeat is posted after reconnect with the current pending count | Network tab (POST after "online") |
| QA-16 | Heartbeat after replication cycle | A replication cycle completes | A heartbeat is posted carrying `pendingChangeCount = 0` and the new `lastSuccessfulSyncAt` | Network tab body |
| QA-17 | Device list visible to admin | Admin → Data Protection → Registered devices | Each device listed with label, assigned user, last heartbeat, pending count, last successful sync and a status badge | Screenshot of the panel |
| QA-18 | Device list hidden from staff | Staff account requests the device list | `GET /api/devices` returns `403` | Network tab (403) |
| QA-19 | Stale device flagged | Stop the server-side reports for > 24 h (or set `staleHours=1` and wait) | The device shows status `stale` when it had no queued changes | Panel screenshot, API response |
| QA-20 | Device holding unsynced records flagged | A device stops reporting while it still holds queued changes | The device shows status `possibly-lost` and the summary counts it under `devicesHoldingUnsynced` | Panel screenshot, API response |
| QA-21 | Close for the day passes when synced | Admin → Data Protection → Close for the day with an empty queue | Success message; an `audit_log` entry with action `END_OF_DAY_SYNC_CONFIRMED` is written | Audit log screenshot, doc in Fauxton |
| QA-22 | Close for the day is blocked when unsynced | Go offline, create a resident record, then trigger Close for the day | A **non-dismissible** warning appears stating the pending count, with a "Sync Now" action; the close is reported as blocked; **no** `END_OF_DAY_SYNC_CONFIRMED` entry is written | Screenshot of the warning, audit log (entry absent) |
| QA-23 | Checkpoint records the checkpoint details | Complete a checkpoint that had pending changes | The audit entry records `deviceId`, `actor`, `pendingAtStart`, `syncedCount` and a timestamp | Audit log detail, doc in Fauxton |
| QA-24 | Checkpoint unblocks after a successful sync | From the blocked warning, restore the connection and press "Sync Now" | The checkpoint passes, the pending count reaches 0 and the audit entry is written | Screenshot, audit log screenshot |
| QA-25 | Snapshot export format | Admin → Data Protection → Download Snapshot | The file contains `schema: "bustrac.snapshot"`, `schemaVersion`, `deviceId`, `docCount`, `rows` and an `integrity` block with a 64-hex SHA-256 value; the file name is `bustrac_snapshot_<deviceId>_<timestamp>.json` | Open the file in a text editor, screenshot |
| QA-26 | Snapshot integrity is verified on restore | Download a snapshot, edit one record's name in the file, then use "Claim unsynced records" | The restore is **refused** (`integrity-check-failed`) and a `CLAIM_UNSYNCED_RECORDS` audit entry with `refused: true` is written; no document is imported | Error message, audit log screenshot |
| QA-27 | Restore round-trip | Download a snapshot, delete a resident locally, then import the snapshot | The resident is re-imported with its original field values | Screenshot before/after |
| QA-28 | Scheduled snapshot fires and records its time | Set the interval to 1 hour (or wait for the default daily run) | A snapshot file is written, an `AUTO_BACKUP` audit entry is recorded, and the device's `lastSnapshotAt` appears in the registry document / the Devices panel | File listing, audit log, Fauxton `device_registry_*` doc |
| QA-29 | Encrypted snapshot round-trip | Enable "Encrypt snapshots with a passphrase", set a passphrase and take a backup | The file is an encrypted envelope (`schema: "bustrac.snapshot.encrypted"`, `encryption.algorithm: "AES-256-GCM"`) and no document content is readable in it; decrypting with the correct passphrase restores the data, a wrong passphrase fails | File content screenshot, decryption result |
| QA-30 | Encryption availability is reported honestly | Open Data Protection over a plain-HTTP LAN address (not localhost) | The encryption option is disabled with a message explaining that a secure context is required; the backup still succeeds and the checksum still applies | Screenshot of the disabled option |
| QA-31 | Disaster Readiness panel renders | Admin → Data Protection → scroll to the Disaster Readiness card | The card appears **above** the CouchDB Connection card with a status badge (READY or NEEDS ATTENTION), a readiness score out of 100, seven check rows each with a ✔ or ⚠ icon, the battery line and a one-line recommendation | Screenshot of the card |
| QA-32 | Readiness verdict reflects the critical checks | Log in online on the device first, then reopen Data Protection | With a cached offline credential, an active service worker and a healthy local database the badge reads **READY** | Screenshot of the badge |
| QA-33 | Missing offline credential is detected | Use a device that has never logged in online (or clear `bustrac_offline_auth`), then refresh the panel | The badge reads **NEEDS ATTENTION** and the recommendation names "Offline credential cached" | Screenshot of the badge and recommendation |
| QA-34 | Pending unsynced changes are detected | Go offline, create a resident record, then press Refresh on the panel | The "No pending unsynced changes" row shows ⚠ with the pending count in its detail, and the recommendation names it | Screenshot |
| QA-35 | Battery line renders | Open the panel on a device that reports a battery, and on one that does not (desktop Chrome) | A reporting device shows "Battery: N% (charging)" or "Battery: N% (not charging)"; a non-reporting device shows "Battery status unavailable" and the battery check is not failed | Screenshots of both |
| QA-36 | The panel is read-only | Record the document count and sync status, open and refresh the Disaster Readiness panel, then re-check | No document, audit entry, sync attempt or configuration change is produced by opening or refreshing the panel | Document count before/after, audit log unchanged |
| QA-37 | Battery Status API failure is handled | Run on a browser where `navigator.getBattery` is absent or rejects | The panel still renders; the battery line shows "Battery status unavailable" and no uncaught error appears in the console | Screenshot, console output |
| QA-31 | VAWC server-side read redaction (staff) | Staff token fetches a VAWC blotter doc (`vawcFlag:true`) through `/api/sync/bustrachub_db/<id>` | Sensitive fields (`narrative`, `complainantName`, `complainantAddress`, `respondentName`, `respondentAddress`, `contactNumber`) return `[REDACTED — VAWC]`; no raw PII anywhere in the body. **Automated:** `server/test/vawcSync.test.js` — *staff GET of a VAWC doc → sensitive fields are REDACTED* | Test output; curl response |
| QA-32 | VAWC unmask for authorized roles | `vawc_officer` and `admin` tokens fetch the same VAWC doc | Fields returned unmasked (full PII). **Automated:** `server/test/vawcSync.test.js` — *vawc_officer GET … UNMASKED*, *admin GET … UNMASKED* | Test output |
| QA-33 | VAWC unmask is audited | `vawc_officer` reads a VAWC doc | A `VAWC_UNMASK_ACCESS` `audit_log` doc is written (`actor.role: vawc_officer`, `source: server-sync-proxy`). **Automated:** `server/test/vawcSync.test.js` — *writes a VAWC_UNMASK_ACCESS audit entry* | Test output; Fauxton `audit_log` |
| QA-34 | Non-VAWC docs untouched | Staff fetches a normal blotter doc | No field is redacted. **Automated:** `server/test/vawcSync.test.js` — *NON-VAWC blotter doc → unchanged* | Test output |
| QA-35 | VAWC redacted in list reads | Staff fetches `_all_docs?include_docs=true` containing VAWC rows | Each VAWC `row.doc` is redacted; non-VAWC rows untouched. **Automated:** `server/test/vawcSync.test.js` — *_all_docs … each row.doc is redacted* | Test output |
| QA-36 | VAWC render/export boundary (client) | Staff user views the blotter masterlist/detail, exports Excel, and prints a VAWC certificate | VAWC-sensitive fields show the redaction marker; the exported/printed values are masked. **Automated (policy):** `frontend/src/utils/__tests__/vawcAccess.test.js` | Jest output; UI screenshot |
| QA-37 | Content-Length correct after redaction | Staff fetches a VAWC doc with a long narrative | The response `Content-Length` equals the rewritten body length (client does not hang/over-read). **Automated:** `server/test/vawcSync.test.js` — *Content-Length matching the rewritten body* | Test output |
| QA-38 | Security headers on every path (dev + preview) | Request `/`, `/robots.txt`, `/src/main.jsx`, `/@vite/client`, `/favicon.svg`, and an unknown path from both `:5173` and `:4173` | Each response carries `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` | curl/Invoke-WebRequest header dump |
| QA-39 | ZAP rules 10038/10020/10021 cleared | Re-run ZAP active scan against the dev server | No `CSP Header Not Set`, no `Missing Anti-clickjacking Header`, no `X-Content-Type-Options Header Missing` alerts (only informational `Modern Web Application` + Low `CSP: Notices` tuning notes remain) | ZAP alert report before/after |

---

## Execution Procedure

### Prerequisites
1. Start CouchDB (local or Docker)
2. Start server: `node server/index.js` (port 3000)
3. Start frontend: `npm run dev` (port 5173)
4. Create test accounts:
   - Resident: `resident_test@barangay.gov` / `password123`
   - Staff: `staff_test@barangay.gov` / `password123`
   - Admin: `admin_test@barangay.gov` / `password123`

### Test Execution Order
1. **QA-01 → QA-05** (Resident write restrictions)
2. **QA-06 → QA-07** (Staff/Admin elevated writes)
3. **QA-08** (Sync queue verification)
4. **QA-09 → QA-10** (Filter/read verification)
5. **QA-11** (Infrastructure)
6. **QA-12** (Regression check)

### Evidence Collection Commands

```bash
# Server boot marker verification
grep "sync-auth-cors-framing-2026-10-12" server/index.js

# Frontend boot marker verification
grep "owner-filter-event-registration-2026-10-12" frontend/src/services/db.js

# Sync queue inspection (in browser console)
window.__BUSTRAC_SYNC_PATCH__.inspectLocalSyncQueue()

# Resident-owned write types check
grep "RESIDENT_OWNED_WRITE_TYPES" frontend/src/services/db.js

# Protected fields constant check
grep "RESIDENT_PROTECTED_EVENT_FIELDS" server/index.js
```

### Browser Console Checks
```javascript
// Verify resident identity resolution
await db.getCurrentResidentId()

// Check event_registration query filter
const regs = await db.allDocs({ include_docs: true, keys: ['event_registration'] })
console.log(regs.rows.map(r => r.doc))
```

---

## Acceptance Criteria

| Criterion | Pass Condition |
|-----------|----------------|
| Resident write isolation | QA-01..05 all pass |
| Staff/Admin elevated writes | QA-06..07 pass |
| Sync replication | QA-08 shows queued+replicated docs |
| Owner filtering | QA-09 shows only own docs; QA-10 shows all events |
| Infrastructure | QA-11 no CORS/framing errors |
| No regression | QA-12 passes |

---

## Evidence Package (Deliverable)

Collect into `qa-evidence/<timestamp>/`:
- `console-logs.txt` - All browser console output
- `network.har` - HAR export from DevTools Network tab
- `server-logs.txt` - Server stdout/stderr during tests
- `db-inspector-screenshots/` - PouchDB/CouchDB doc views
- `sync-queue-output.json` - Output of `inspectLocalSyncQueue()`
- `test-results.md` - Checklist with ✅/❌ per QA-ID

---

## Rollback Triggers

If any QA-ID fails:
1. Document failure with evidence
2. Identify root cause (code vs config vs data)
3. **Do not fix in this session** - report to planner for next iteration