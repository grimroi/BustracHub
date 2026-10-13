# Troubleshooting

## 502 Bad Gateway on sync / login works but sync fails

**Symptom:** the browser shows `502` errors for `/api/sync/...`, or CouchDB admin UI is unreachable.

**Cause:** on some Windows setups `localhost` resolves to `::1` (IPv6) while CouchDB listens only on `127.0.0.1` (IPv4). The Express proxy forwards to `COUCHDB_URL`, and if that uses `localhost`, the connection is refused.

**Fix:** use the IPv4 address in `server/.env`:

```
COUCHDB_URL=http://admin:<password>@127.0.0.1:5984
```

Restart the backend after editing. Verify with `curl http://127.0.0.1:5984/_up`.

## CORS errors in the console

**Cause:** the browser is blocked because the requesting origin is not in the allowlist.

**Fix:** allowed origins are defined in `server/index.js` (`cors({ origin: ... })`): `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`, and a LAN IP. If testing on a phone or a different port, add that origin and restart the server.

Remember: `credentials:true` means `Access-Control-Allow-Origin: *` is **not** allowed — the origin must be listed explicitly.

## Resident gets 403 when filing/editing a blotter

**After the fix:** residents can write their own `blotter_record` documents (previously an upgrade 403). The write must be **owned** — the document must carry the resident's own `username`/`residentId` that matches their session.

**Protected fields:** a resident cannot change case-lifecycle fields on their own blotter (`status`, `summonCount`, `nextHearingDate`, `summonDate`, `cfaIssued`, `cfaIssuedAt`, `lastSmsStatus`, `smsSent`, `smsSentAt`, `resolution`). If one of these differs from the server copy, the server rejects the write with `403` and logs `[SYNC DENY]`. This is intentional: only staff/admin advance a case.

> If you see a persistent `[SYNC DENY]` in the server log, it usually means the resident's local blotter is stale (staff advanced the case while the resident was offline). Sync is automatic and retries on its own; the optional **Retry Sync** button forces an immediate cycle — the pull half will bring in the latest staff update.

## A resident's changes don't appear for the admin

Check in Fauxton (`http://127.0.0.1:5984/_utils/` → `bustrachub_db`):

1. Does the document exist? If sync is still "queued", go online — sync resumes automatically (press **Retry Sync** only for an immediate manual cycle).
2. Confirm the doc type: residents write `blotter_record`; staff/admin write `blotter_report`. The dashboard reads both.
3. Confirm role: residents do not replicate admin-only data (see replication filter).

## Resident sync shows "Error" but app still works

- `401` → token expired; log in again.
- `403` → a document was rejected (ownership or protected field). It stays queued locally. Fix the offending doc or use the server log to identify the reject.
- Network offline → the badge shows 🟠 Offline • Queued. Everything is stored locally; it will sync automatically when back online.

**Note:** a 403 does **not** log the user out — only 401 clears the session.

## Login works in the app but direct API calls fail

Use a token from `POST /api/login` in the `Authorization: Bearer` header. Direct CouchDB access from the browser is not a thing here — the proxy is the only CouchDB path.

## "Database connection not initialized"

The server didn't connect to CouchDB at boot. Check:

- CouchDB is actually running (`curl http://127.0.0.1:5984/_up`).
- `server/.env` exists with a valid `COUCHDB_URL`.
- The admin user is `admin` and the password matches (or update `COUCHDB_URL`).
- Server logs at startup: `Server is listening live on http://0.0.0.0:5000` means boot succeeded.

## The SMS for summons is not sent

- SMS is optional; a provider must be configured in `server/services/smsService.js`.
- Only **new** summon statuses trigger SMS (`lastSmsStatus` dedup). Setting `Under Mediation` triggers it once (see `docs/ARCHITECTURE.md` listener).
- Check the server log for `[SYNC]`/`SMS` lines; `sendResidentSMS` requires a valid `respondentPhone`/`contact`.

## Live blotter updates not appearing in dashboard

- The SSE stream (`/api/notifications`) is PII-free by design — it only nudges the UI (`BLOTTER_UPDATE`). The dashboard refreshes its own data from the database.
- The changes listener auto-reconnects every 5 s; a temporary drop shows `❌ CouchDB changes stream error`/`ended` in the server log.

## Blotter edit modal cannot be closed, or is hidden behind a dialog

**Symptom:** after saving (or cancelling) a blotter edit, the modal stays open, or a confirmation/success popup appears *behind* the modal and cannot be clicked.

**Cause:** two layers were fighting:
- The modal overlay used `zIndex: 9999`, while SweetAlert2 dialogs render at ~`1060`. Any SweetAlert opened *while the modal was open* (e.g. the "Discard changes?" prompt) rendered **below** the modal and was unreachable.
- After a successful save, the code called `closeEditModal()`, which re-computed `isModified` against the now-stale report and wrongly opened a "Discard changes?" prompt, stacking a second hidden dialog and leaving the edit state set.

**Fix:** the modal overlay `zIndex` was lowered to `1000` (below SweetAlert2's `1060`), and a successful save now resets the modal state directly (`resetEditModal`) *before* showing the success alert. So the save → close path never triggers a discard prompt, and the discard/confirmation dialog (cancel path) now renders **above** the modal where it can be clicked.

**If the modal still cannot close:** open DevTools and check whether a SweetAlert2 `.swal2-container` is present in the DOM but visually behind the modal. If so, a new dialog is opening without the modal being closed first — capture the steps and console output (see below).

## "Blocked aria-hidden on an element because its descendant retained focus"

**Symptom:** console warning mentioning `aria-hidden="true"` on `<div id="root">` (or a modal container) and "descendant retained focus".

**Cause:** SweetAlert2 marks the app background as `aria-hidden` while its popup is open. If a focused element (e.g. the Save button) lives inside a subtree that gets hidden, the browser refuses to hide it and logs the violation. The `[Violation] 'click' handler took 187ms` message is unrelated and not the cause.

**Fix:** the blotter edit modal is now rendered with `createPortal(..., document.body)` and `blurActiveElement()` is called before every SweetAlert2 popup in that flow, so no focused descendant is ever inside a hidden subtree. The modal also carries `role="dialog"`, `aria-modal="true"`, and `aria-label`, and focus is returned to the opener button on close.

## Frontend lint shows many errors that "I didn't write"

The repository's ESLint baseline already reports dozens of `no-unused-vars`/`no-undef` in the large screen files (e.g. `DashboardPortal.jsx`). These pre-date the polish pass; the relevant sync/audit modules (`services/db.js`, etc.) lint clean. Review with:

```bash
cd frontend
npx eslint src/services/db.js
```

## Tests

```bash
cd frontend
npm test
```

If a run is slow/out of memory, the test script already raises the heap (`--max-old-space-size=3072`).

### Known: `npm test` → `Cannot find module 'pouchdb'` at `jest.setup.js`

The repo's Jest setup mocks the Node `pouchdb` dev-dependency. A corrupted/partial install (missing `node_modules/pouchdb/lib/`) breaks that mock. This is an **environment/install** issue, not a code issue — the browser runtime uses `pouchdb-browser` (unchanged).

Repair (close running dev servers first so native binaries aren't locked):

```bash
cd frontend
npm install --legacy-peer-deps
```

If that still reports the missing `lib/index.js`, remove the package and reinstall it:

```bash
Remove-Item -Recurse -Force node_modules/pouchdb
npm install --no-save --no-package-lock --legacy-peer-deps pouchdb@9.0.0
```

> `--legacy-peer-deps` is required because the repo's `@babel/preset-typescript@8` declares a peer of `@babel/core@^8` that isn't present.