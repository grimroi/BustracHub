# Remote Wipe — Feasibility Note

**Status: FEASIBILITY ASSESSMENT ONLY. No remote-wipe capability is
implemented, and none is claimed.**

This note answers the question "can Bustrac Hub remotely wipe a lost or stolen
device?" and explains what the correct control for that scenario actually is.

---

## 1. The question, stated precisely

A barangay laptop or tablet is lost or stolen. The operator wants to remove
Bustrac Hub's data from it remotely.

Two very different outcomes are being conflated, and the distinction decides
the whole answer:

| Outcome | What it means | Is it achievable? |
| ------- | ------------- | ----------------- |
| **(A) Stop the device** — prevent the finder from using the app, reading new data, or pushing data into the central database | Revoke the session; refuse further sync from that device | **Yes, and this is the control that matters.** It is the server-side revocation described in §5. It is *not* implemented today (§5.3). |
| **(B) Destroy the data on the device** — delete the local database so a finder cannot extract it | Wipe the origin's storage from a distance | **Partially, and with large caveats** (§3). It also **destroys the unsynced records**, which is the opposite of what the barangay wants (§4). |

## 2. Can a browser-hosted client be remotely wiped at all?

**Not in the sense an administrator of a managed fleet would expect.** The
application runs in a normal browser tab and is constrained by the browser
sandbox. A remote wipe would have to be executed by code running **on the
device**, which means the device must (a) be running the application or its
service worker, and (b) be able to reach the server.

Concretely, the wipe cannot:

- Erase anything outside the application's **origin** (the scheme + host +
  port). It cannot touch other applications, other browser profiles, the
  operating system, or other user accounts on the machine.
- Wipe the disk at the block level, defeat full-disk encryption, or recover
  data that has already been copied elsewhere.
- Prevent a finder from powering the device on, opening a browser, browsing
  the web, or reading the screen. It only removes *this application's* data.
- Run at all if the browser is closed, the OS is wiped, the disk is
  encrypted and locked, the application was never opened on that device, or
  the service worker was unregistered.
- Be relied upon to complete: browsers terminate service workers aggressively
  (idle shutdown, and on navigation), so a long-running wipe may be cut short.
  The Background Sync `sync` event provides a longer execution window, but it
  is still bounded and best-effort.

## 3. What the service worker can and cannot do

The project already ships a hand-written service worker (`frontend/src/sw.js`,
built through `vite-plugin-pwa`'s `injectManifest` strategy) that handles a
`bustrac-sync` Background Sync tag. Its capabilities are exactly the browser
sanctioned set:

### Can do

- **Delete the application's Cache Storage entries** — `caches.keys()` and
  `caches.delete()` are available in a service worker. This removes the
  precached application shell and the runtime cache.
- **Delete the application's IndexedDB databases** —
  `indexedDB.deleteDatabase('bustrachub_db')` and
  `indexedDB.deleteDatabase('bustrac_sync_outbox')` are available in a worker
  context. This is where the replicated dataset and the queued (unsynced)
  documents live.
- **Receive a command** through either channel the worker already handles: a
  `message` event from a controlling page, or a `sync` event fired by the
  browser when connectivity returns. A wipe instruction would be delivered as
  one of these.
- **Ask a controlled page to clear `localStorage`** by posting a message to
  it. This requires an open page — a service worker has **no** access to
  `localStorage` (it is not part of `ServiceWorkerGlobalScope`). If no page is
  open, the `localStorage` copy of the offline auth cache, the device id and
  the last-snapshot timestamp **cannot** be removed by the worker alone.

### Cannot do

- **Wipe `localStorage` or `sessionStorage` without a cooperating page.**
- **Revoke the session token.** The worker cannot invalidate a JWT; only the
  server can, and the server has no revocation mechanism today (§5.3).
- **Reach a device that is offline.** See §4.
- **Guarantee completion**, or run at all, on a closed browser.
- **Wipe other origins, other profiles, or the operating system.**

### Net effect

The most a browser-hosted wipe can achieve is: *delete this application's
IndexedDB databases and Cache Storage entries, and — if a tab is open — ask
that tab to clear its `localStorage`.* It is best-effort, origin-scoped, and
only possible while the browser is running on that device.

## 4. The constraint that makes remote wipe the wrong control here

**A wipe command can only reach a device that is online.** A device that is
lost in a way that prompts a wipe is, by definition, the device whose state is
unknown to the server. Two cases:

- **The device is offline** (powered off, out of coverage, or the browser
  never opened) — the command is not delivered. Nothing happens until the
  device happens to come online, at which point the wipe may execute at an
  inconvenient moment. The stolen device remains able to read whatever it
  holds in the meantime.
- **The device is online** — the wipe can execute, but so could a replication:
  the device is, right now, in contact with the server.

Now the decisive point. In an offline-first system the data on a lost device
splits into two parts:

| Data | Where it lives after a device is lost | At risk from the finder? | Does a wipe help? |
| ---- | -------------------------------------- | ------------------------ | ----------------- |
| **Already replicated records** | In the central CouchDB **and** on the device | Yes — the finder can read the local copy | The central copy is unaffected; a wipe only removes the device's copy |
| **Unsynced records** (created offline, not yet replicated) | **Only on the device** | Yes, and they are the records the barangay most wants to keep | **A wipe destroys them permanently.** They cannot be recovered from anywhere else |

So the very scenario that makes an administrator think "I must wipe it" — a
device that was lost while holding unsynced records — is the one scenario in
which wiping is **actively harmful**: it converts a recoverable loss (the
records are on the device, and a snapshot might restore them) into a
permanent one.

The controls that actually protect the unsynced records are the ones already
built or specified in this project:

- **Device registry with a "possibly lost" status** — the server learns that a
  device went silent while holding queued changes, and flags it
  (`docs/ARCHITECTURE.md`, `GET /api/devices`).
- **Mandatory end-of-day sync checkpoint** — the device is not closed for the
  day with unsynced records, and the confirmation is audited
  (`frontend/src/services/syncCheckpoint.js`).
- **Scheduled local snapshots** with an integrity checksum and optional
  passphrase encryption (`docs/SNAPSHOTS_AND_EXPORT.md`).
- **"Claim unsynced records"** — a backup file recovered from a lost device is
  merged back into the central database (`claimUnsyncedRecords()`).
- **Operating-system full-disk encryption** on the device, which protects the
  unsynced records against a finder without destroying them
  (`docs/ENCRYPTION_AT_REST_ASSESSMENT.md`).

## 5. The control that does work: server-side revocation

Outcome **(A)** — stopping the device — is achievable, and it is the correct
first response to a lost or stolen device. It requires no cooperation from the
device at all: the server simply refuses to talk to it.

### 5.1 What already works

- The session is a **stateless HS256 JWT** issued by `/api/login`, verified
  on every request by `authenticate()` (`server/index.js:232-251`).
- Every route and every sync-proxy request is role-checked
  (`requireRole()`, `server/index.js:253-259`).
- The sync proxy is the only way to reach CouchDB; the browser never holds
  the CouchDB credentials (`docs/ARCHITECTURE.md`).
- The device registry records each staff device, so the server can identify
  which device stopped reporting and whether it was holding unsynced changes.

### 5.2 What a revocation design would add

1. **A server-side denylist** of revoked session identifiers (a `jti` claim
   plus a store, or a per-user "sessions valid after" timestamp), checked in
   `authenticate()` before the request is served.
2. **An administrative endpoint** — e.g. `POST /api/devices/:deviceId/revoke` —
   that invalidates the session(s) bound to a device and records the action in
   the server-side audit log.
3. **A device-scoped credential** so that a device can be revoked individually
   without revoking the user's other sessions. The current JWT carries only
   `{ user }`; it has no device binding, so today a device cannot be
   distinguished from the user's other sessions.
4. **Automatic expiry of the risk window.** The token lifetime is currently
   8 hours (`JWT_EXPIRES_IN`, `server/index.js:119`). A stolen device's token
   therefore remains usable for up to eight hours after the theft is noticed.

### 5.3 The gap, stated precisely

**Server-side session revocation is not implemented.** There is no `/api/logout`
endpoint that invalidates a token, no denylist, and no `jti` claim: the
server verifies the signature and the expiry and nothing else. The client
clears its own copy of the token on logout (`frontend/src/utils/tokenStore.js`),
but that is a **client-side** action — the token remains valid on the server
until it expires. A stolen device with a valid token can therefore continue to
sync for the remainder of the token's lifetime.

This is the single most valuable addition to make in response to a lost or
stolen device, and it is a server-side change, not a browser-side one.

## 6. Recommendation

1. **Do not build a remote wipe for Bustrac Hub as it stands.** Its coverage
   is partial (origin-scoped storage only), its reliability is low (it needs
   the browser to be running and the device to be online), it cannot touch
   `localStorage` without an open page, and — most importantly — for the
   scenario that actually threatens the barangay's data it **destroys the
   unsynced records** that the organisation is trying to save.
2. **Implement server-side session revocation instead** (§5.2). It works
   whether or not the device is online, it stops a stolen device from reading
   new data or pushing new data, it is auditable, and it does not destroy
   anything. This should be the "lost device" response procedure.
3. **Enrol the devices in the registry** and monitor the "possibly lost"
   status. A device that goes silent while holding unsynced changes is the
   trigger for a human to act (revoke the session, recover the snapshot file,
   re-issue the account).
4. **Protect the data that a wipe would destroy** — the scheduled snapshot
   with its integrity checksum and optional passphrase encryption — and keep
   the end-of-day checkpoint so the "device closed with unsynced records"
   window is as short as possible.
5. **Enforce full-disk encryption at the operating-system level** on the
   barangay's devices. For a stolen laptop this is the control that actually
   protects the unsynced records, and it does so without destroying them.
6. **If a managed-fleet wipe is still required**, it must be delivered by a
   **device-management agent** (MDM/EMM) operating outside the browser — not
   by the web application. The application can at most cooperate with such an
   agent by exposing a "wipe local data" action; it cannot substitute for one.

## 7. Defence-safe statement

> "A browser-hosted application cannot genuinely remotely wipe a device. At
> most, the service worker can delete this application's own IndexedDB
> databases and cache, and only while the browser is running — and a lost
> device is by definition the one that is not reporting. More importantly, a
> wipe would destroy the very records we are trying to recover: the unsynced
> records exist only on that device, whereas everything already replicated
> lives safely in the central CouchDB. The control that does work is
> server-side: revoking the session so the device cannot read or push
> anything, which the device registry and the 'possibly lost' status now make
> actionable. Protecting the unsynced records is handled by the end-of-day
> checkpoint, the scheduled snapshot with an integrity checksum, and
> operating-system disk encryption — not by a wipe."
