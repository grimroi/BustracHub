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