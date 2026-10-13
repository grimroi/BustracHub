# Defense Q&A — anticipated panel questions

Short, verifiable answers. Each is anchored in the code (`docs/ARCHITECTURE.md`, `docs/API.md`).

---

### Q1. How does the "offline-first" claim actually work?
Every write goes to the local PouchDB first (`frontend/src/services/db.js`, `localDb`), so the UI works with zero connectivity. PouchDB replication then reconciles with CouchDB through the proxy (`/api/sync/bustrachub_db`). Offline changes carry counters (saved locally, ordered by revision) and sync automatically on reconnect. The sync badge (🟠 Offline • Queued / 🟡 Syncing… / 🟢 Online • Synced) reflects live PouchDB sync events.

### Q2. Why do PouchDB and CouchDB instead of fetching from MySQL/PHP?
The core requirement is a system that works in a barangay where internet is unreliable. PouchDB gives offline storage + conflict-capable replication out of the box. MySQL is fine online but doesn't give automatic offline queues and device-local writes.

### Q3. Isn't replicating a full CouchDB to every browser insecure?
We make replication filtered and role-scoped:
- Residents replicate only documents they own / need (replication filter in `db.js`).
- `audit_log` and `offline_auth` never replicate to residents.
- The proxy (`authorizeSyncAccess`) blocks residents from writing what they don't own, and blocks tampering with case-lifecycle fields on blotter records.

### Q4. How is authentication done? (security)
- The browser authenticates to our Express server only.
- `POST /api/login` verifies bcrypt and issues an **opaque, in-memory session token** (8h TTL, `server/index.js` `SESSIONS`).
- CouchDB admin credentials (`COUCHDB_URL`) stay in `server/.env` and are injected server-side; the browser never sees them.
- Password hashing is bcrypt (legacy SHA-256 hashes are upgraded on next login).

### Q5. Why did residents previously get 403s when filing a blotter, and how was it fixed?
The proxy's write allowlist (`RESIDENT_WRITE_TYPES`) didn't include the document type residents actually file — `blotter_record` (resident UI writes `blotter_record`, staff/admin write `blotter_report`). Additive change: residents may now write owned `blotter_record` docs. A protected-field guard (`RESIDENT_PROTECTED_BLOTTER_FIELDS` in `verifyExistingDocOwnership`) still prevents self-advancing the case lifecycle.

### Q6. Can a resident change the status of their own blotter case?
No. Even for their own doc, the proxy compares every write against the current doc and rejects any change to `status`, `summonCount`, `nextHearingDate`, `summonDate`, `cfaIssued`, `cfaIssuedAt`, `lastSmsStatus`, `smsSent`, `smsSentAt`, or `resolution`. The rejection is logged as `[SYNC DENY]` (metadata only) and the client simply retries — it never logs them out.

### Q7. How does the administrator know what a resident did while offline?
Two audit layers:
1. In-app admin actions: client-authored `audit_log` docs.
2. Resident sync writes: the server inserts an `audit_log` entry (`recordResidentAudit`, action `RESIDENT_SYNC_WRITE`) at the proxy. Because residents keep their *own* audit as `_local/` docs (never replicated), it is this server-side entry that admin actually sees — the fix for the attribution gap.

### Q8. What is the `_local/` vs normal document split?
`_local/` docs exist only on one device (sessions, per-device audit entries). They are excluded from replication by the filter, so they never leak and never conflict. The real shared records (`user_*`, `blotter*`, `certificate_request`, `audit_log`) are normal docs that replicate.

### Q9. How do you handle the "Settled" status inconsistency (audit finding)?
Two bugs were corrected: (a) one module wrote `'Settled / Closed'` and another read it, and (b) the summon-writing module (`SummonsPanel`) issued `'Under Mediation'` but the server's SMS/SSE listener only watched for `'Summons'`. Fixes: `'Settled / Closed'` → `'Settled / Resolved'` everywhere (front-end rendering + case-finalized checks), and `'Under Mediation'` was added to the listener's trigger statuses.

### Q10. What happens on a 401 vs 403 during sync?
- `401` → the session token is invalid/expired (`isAuthError` in `db.js`); the app clears state and routes to login.
- `403` → the write is not allowed (ownership / role); the app **keeps** the session, the document stays queued locally, and sync retries. Only 401 is terminal for the session.

### Q11. Why is the SSE notification payload generic ("May bagong update…")?
`/api/notifications` is unauthenticated (browser EventSource can't easily send headers). Broadcasting case numbers, names, or schedules would leak PII to anyone who connects. The stream therefore only signals *that* something changed; details come from the authenticated app (PouchDB live changes / dashboard query).

### Q12. How is data stored — one database or per-role?
One CouchDB database (`bustrachub_db`). Role separation is enforced at the replication filter (what each client pulls) and at the proxy (what each client may push). Admin/staff replicate nearly everything; residents get a scoped subset.

### Q13. How does the SMS/summons flow work?
The server listens on CouchDB's `_changes` continuous feed. When a blotter reaches a summon status (1st/2nd/3rd Summon or `Under Mediation`), it checks `lastSmsStatus` (dedup, so a case texts once per new status), sends the SMS when a provider and phone are configured, then records `lastSmsStatus`/`smsSentAt` and broadcasts the generic SSE update. The listener auto-reconnects every 5 s on failure.

### Q14. What if two people edit the same record at once?
PouchDB/CouchDB use revision (MVCC) conflict handling. PouchDB marks a conflict when revisions diverge; the app exposes conflict management (DashboardPortal conflict tools) and `resolveDbConflicts()` in `db.js`. For the demo we keep per-record ownership, which minimizes real conflicts.

### Q15. How do I prove sync works in the demo?
- Network tab: replication traffic to `/api/sync/bustrachub_db` (200/201).
- IndexedDB: new docs exist the moment the resident saves, even offline.
- After reconnect, verify the same record in Fauxton (`bustrachub_db`) and in the admin dashboard.

### Q16. What's the deployment topology?
Dev: React+Vite (5173) → Express (5000) → CouchDB (5984), all on one machine; the LAN IP origin is allowed for phone testing. Production could host Express+CouchDB on one server (or a RasPi) and serve the built frontend as static files from Express.

### Q17. Known limitations (be honest)
- SSE stream is unauthenticated → intentionally PII-free payloads.
- In-memory sessions reset on server restart (users must log in again).
- SMS requires an external provider + phone configured; otherwise only the SSE nudge + audit trail happen.
- ESLint baseline in the large screen files has many pre-existing warnings (scope of the polish pass was targeted).

### Q18. How did you fix the modal accessibility issue?
The blotter edit modal is now rendered with `createPortal(..., document.body)` (`frontend/src/pages/ResidentUI.jsx`) instead of inline inside `#root`, and it declares `role="dialog"`, `aria-modal="true"`, `aria-label`, and `tabIndex={-1}`. A focus-management effect moves focus into the dialog on open and restores it to the opener button on close. `blurActiveElement()` is called before every SweetAlert2 popup in the flow, so no focused element ever sits inside a subtree that gets hidden. As a result the "Blocked aria-hidden … descendant retained focus" console violation no longer occurs.

### Q19. Why was SweetAlert2 causing aria-hidden warnings?
SweetAlert2 marks the rest of the page (including `#root`) as `aria-hidden` while its popup is open, to keep screen readers focused on the dialog. Previously the modal — and the focused Save button inside it — lived inside `#root`, so the browser blocked the aria-hidden and logged a violation. Portaling the modal out of `#root` plus blurring before opening the popup (and lowering the modal's `z-index` to `1000`, below SweetAlert2's ~`1060`, so the dialog renders on top) resolves it.

### Q20. How do you ensure residents cannot self-advance blotter lifecycle?
Two independent guards. (1) The proxy's write allowlist (`RESIDENT_WRITE_TYPES`) permits residents to write only owned `blotter_record` docs. (2) `verifyExistingDocOwnership` compares each write against the server copy and rejects any change to `status`, `summonCount`, `nextHearingDate`, `summonDate`, `cfaIssued`, `cfaIssuedAt`, `lastSmsStatus`, `smsSent`, `smsSentAt`, or `resolution`, logging `[SYNC DENY]`. The resident's client keeps the local copy queued and retries; it never logs them out (only `401` is terminal). See Q6.

### Q21. How does automatic offline sync work?
`setupPouchDBSync` (`db.js`) starts a live, bidirectional PouchDB ↔ CouchDB replication and is idempotent — repeated calls reuse the existing handler and log "Live replication already running for this session." A `syncSessionToken` tracks the active handler; `stopPouchDBSync` clears it and removes listeners. Transient failures retry automatically with exponential backoff (`scheduleRetry`, 5s→60s), `403` keeps the session and retries, `401` clears the session and dispatches `auth:logout-required`, and `online`/`offline` plus `bustrac:token-changed` events drive reconnection. The badge reflects `{ status, pending, detail }` from `onSyncStatusChange`; there is a **Retry Sync** button only for a forced immediate cycle.

### Q22. Why is the replication filter owner-aware?
To honour least privilege on a shared database. `makeReplicationFilter` excludes `_local/` and `_design/` docs and (for residents) server-only data — `audit_log`, `offline_auth`, `user`/`user_*` accounts, and `event_registration` — while allowing resident-owned `certificate_request`, `feedback_report`, `feedback`, `blotter_record`, `resident`/`resident_profile`/`profile` docs and the public read-only types the portal needs (`announcement`, `advisory`, `activity`, `hotline`, `settings`, `barangay_info`, `news`, `aid_distribution`). Unknown types are **default-denied**. Identity is read lazily inside the filter because `LogIn.jsx` calls `setToken()` before it writes `bustrac_user`, so an eager read at setup time would see an unknown role.