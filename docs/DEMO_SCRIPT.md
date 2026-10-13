# Defense / Live Demo Script

A 8–12 minute walkthrough. Do the **happy path first**, then the offline story, then the security guard. Have the server terminal visible so the panel can see `[SYNC 403]` / `[AUDIT]` / SMS/SSE logs.

Pre-requisites: server + frontend running, DB seeded, CouchDB up (see `docs/SETUP.md`).

---

## Part 0 — Prologue (≤1 min)

"Bustrac Hub is an offline-first barangay MIS. Every action is stored on the device first and synced to a central CouchDB through an authenticated Express proxy — so residents still work with no internet, and admin/staff see everything."

Open DevTools → **Application → IndexedDB → `bustrachub_db`** to preview the local database.

---

## Part 1 — Resident happy path (≤3 min)

1. Log in as **`juan2026` / `password`** (resident).
2. Point at the header: sync badge is 🟢 **Online • Synced**. Sync is **automatic** — there is nothing to press; a **Retry Sync** button exists only to force an immediate cycle.
3. **Blotter** → file a complaint (subject, details, respondent, date).
   - Note: devtools IndexedDB instantly contains the new `blotter_record`, even before an internet round-trip.
4. **Profile** → edit a detail (e.g. add/update a digit of the contact no.), **Save**.
5. Watch the badge: 🟡 Syncing… → 🟢 **Online • Synced** with **no manual action**. Explanation: `_bulk_docs` went through `/api/sync` → proxy → CouchDB automatically.

## Part 1b — Certificate + blotter edit modal (≤2 min)

1. **Certificates** → submit a request; watch the badge auto-sync 🟡 Syncing… → 🟢 **Online • Synced** (same automatic path).
2. **Blotter** → open an editable report → **Edit Report Details**.
3. Edit a field and **Save Changes**: the modal closes and the success alert appears **above** it; the badge auto-syncs.
4. Reopen → edit → close via **✕**, **Cancel**, **Escape**, or a **backdrop** click: the "Discard changes?" dialog appears **above** the modal. **Keep editing** leaves it open; **Yes, discard** closes it.
5. Open the Console: no `Blocked aria-hidden ... descendant retained focus` warning; focus returns to the **Edit Report Details** button after close.

## Part 2 — Admin sees the resident's work (≤1 min)

1. Sign out, log in as **`jmacabangon` / `password`** (admin).
2. Open **Blotter**: the resident's newly filed case appears (the dashboard queries both `blotter_report` and `blotter_record`).
3. Open **Audit Log** and filter `RESIDENT_SYNC_WRITE` — the server-side audit entries that record the resident's sync writes (action, actor, record id). This is the fix for "admin cannot see what residents did offline."

## Part 3 — Offline-first story (≤2.5 min)

1. Log in as `juan2026`. In DevTools → Network, check **Offline** (or unplug/whitelist).
2. Badge flips to 🟠 **Offline • Queued**.
3. File another blotter + post a feedback. Both save locally; badge shows the queued count.
4. Re-enable networking. Watch the badge automatically return: 🟡 Syncing… → 🟢 **Online • Synced**, queue count → 0 — no button pressed.
5. Back in admin: both offline-created records are now in the dashboard.
   - Message: zero data loss — offline created facts, online reconciled them.

## Part 4 — Blotter lifecycle + security guard (≤3 min)

1. As admin, open a resident's blotter → staff actions: issue **1st Summon** (sets `Under Mediation`, `summonCount`, `nextHearingDate`).
   - Server log shows the changes-listener fired and an SMS was sent + a **PII-free** `BLOTTER_UPDATE` over SSE.
2. **Mark case Settled** → admin sees ✓ **Settled** (standardized `Settled / Resolved` status).
3. Resident scenario:
   - Show the resident's view of the same case (they can read the status/date).
   - Explanation: even if a resident edited the raw object, the proxy's `verifyExistingDocOwnership` **rejects** any change to `status/summonCount/nextHearingDate/cfaIssued/resolution/...` — server log shows `[SYNC DENY]`. Case lifecycle is authoritative; the resident cannot self-advance it.
4. (Optional) Role guard: show 403 log line + the app keeps the session (no forced logout) on a denied write.

## Part 5 — Admin management + e-services (≤2.5 min, ad lib)

Pick any 2 of:
- **Certificates** — resident requests → admin approves/prints; QR verification on `VerifyDocument` page.
- **Users** (`Add User`) — a `user_<username>` account is created locally and pushed via replication (this is the real account record).
- **Audit log** — browse actions across modules.
- **Residents / announcements / events / aid** — CRUD with audit entries.

## Part 6 — Close (≤0.5 min)

"Everything the panel saw is backed by the docs: `docs/ARCHITECTURE.md` (offline sync + security model), `docs/API.md` (endpoints), `docs/TROUBLESHOOTING.md` (reproduced issues + fixes)."

---

## Key facts to have ready

| Fix | What to say |
| --- | ----------- |
| Sync proxy auth | "PouchDB talks only to `/api/sync`; the server injects the CouchDB credentials, so the browser never has them." |
| 403 → no logout | "Only `401` clears the session; a denied write stays queued and retries." |
| Replication filter | "Residents pull only what they own; `audit_log`/`offline_auth` never reach a resident device." |
| Server audit | "Resident sync writes are recorded server-side as `RESIDENT_SYNC_WRITE` — that's what the admin audit log shows." |
| Blotter ownership | "Residents write `blotter_record`; staff/admin write `blotter_report`; both are read by the dashboard." |
| Status standardization | `'Settled / Closed'` was renamed to `'Settled / Resolved'` everywhere; `Under Mediation` now also triggers the summon notification listener. |