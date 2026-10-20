# Encryption at Rest — Assessment

**Status: ASSESSMENT ONLY. Nothing in this document has been implemented.**

This report answers three questions:

1. What is actually protected at rest in Bustrac Hub today, and by what mechanism?
2. How feasible would it be to encrypt the full device-local PouchDB store in
   this architecture?
3. What would implementing it require?

It is written to support an honest defence answer, not to claim a capability
the system does not have.

---

## 1. What exists today

### 1.1 The local database is NOT encrypted

`frontend/src/services/db.js:11` opens the local database with:

```js
export const localDb = new PouchDB('bustrachub_db');
```

`pouchdb-browser` supplies the **IndexedDB adapter**, which stores document
bodies as plain JSON inside the browser's IndexedDB. There is no encryption
layer. Any process with access to the browser profile — or anyone who copies
the profile directory off the machine — can read every resident record,
blotter narrative, certificate request and audit entry in clear text.

**No encryption adapter is present in the project.** The installed PouchDB
packages are `pouchdb-browser`, `pouchdb-core`, `pouchdb-adapter-memory`,
`pouchdb-adapter-leveldb-core`, `pouchdb-adapter-utils`, `pouchdb-find`,
`pouchdb-mapreduce-utils`, `pouchdb-changes-filter`, `pouchdb-collate`,
`pouchdb-errors`, `pouchdb-json`, `pouchdb-md5`, `pouchdb-merge`,
`pouchdb-selector-core`, `pouchdb-utils`, `pouchdb-binary-utils`,
`pouchdb-abstract-mapreduce`, `pouchdb-fetch`. Neither `pouchdb-adapter-encryption`
nor `crypto-pouch` (the two community options) is installed.

### 1.2 The offline auth cache is NOT encrypted — but the password is hashed

`bustrac_offline_auth` lives in **`localStorage`** and is written on a
successful online login (`frontend/src/pages/LogIn.jsx:277-291`). Its shape is:

```json
{
  "<lowercased username>": {
    "username": "jmacabangon",
    "passwordHash": "$2a$10$...",
    "role": "admin",
    "user": { "fullName": "...", "residentId": "...", "...": "..." }
  }
}
```

Exactly what is protected and what is not:

| Element | Protection today | Mechanism |
| ------- | ---------------- | --------- |
| The user's **password** | **Hashed — never stored in recoverable form** | **bcrypt** via `bcryptjs` (cost factor 10), `frontend/src/utils/password.js:33-37`. Accounts created before the migration may hold a **legacy SHA-256 hex digest**, which is verified and transparently upgraded to bcrypt on the next successful offline login (`LogIn.jsx:78-87`). |
| `user` object, `role`, `username` | **Plaintext** | Stored verbatim in `localStorage` JSON. |
| The `bustrac_offline_auth` container itself | **Plaintext** | `localStorage` is not encrypted by the application. |
| The PouchDB copy of the same entry (`_local/user-<username>`, `LogIn.jsx:296-306`) | **Plaintext** (except the hash) | Stored under `_local/`, so PouchDB never replicates it, but it is not encrypted on disk. |
| The session token | **Plaintext** | `sessionStorage` (`frontend/src/utils/tokenStore.js:91`), deliberately in `sessionStorage` rather than `localStorage` so it disappears when the tab closes. |

**The precise statement for the defence:** *passwords are protected by
one-way bcrypt hashing, not by encryption; the cached account metadata, the
session token and the entire local document store are stored in clear text.*

Note that bcrypt hashing and encryption at rest solve different problems.
Password hashing stops a database dump from yielding usable credentials;
encryption at rest stops a stolen device or a copied browser profile from
yielding the **records themselves**. The barangay's data is mostly personal
information (residents' names, addresses, contact numbers, blotter narratives),
so the second problem is the one that applies here.

### 1.3 What else is in clear text on the device

| Location | Contents |
| -------- | -------- |
| `bustrachub_db` (IndexedDB) | The whole replicated dataset |
| `bustrac_sync_outbox` (IndexedDB) | A second copy of the queued documents, written by the service-worker outbox (`frontend/src/utils/syncOutbox.js`) |
| `bustrac_offline_auth` (localStorage) | Cached account credentials/metadata |
| `bustrac_session_token`, `bustrac_session_user` (sessionStorage) | The live session |
| `bustrac_device_id`, `bustrac_last_snapshot_at` (localStorage) | Device identifiers |
| Downloaded snapshot files | Plaintext JSON unless the user enables passphrase encryption |

## 2. What does NOT exist

- There is **no** encryption of the local PouchDB store.
- There is **no** full-disk or profile-level encryption performed by the
  application (that would be an operating-system responsibility — BitLocker on
  Windows, FileVault on macOS, LUKS on Linux — and is outside the application's
  control).
- There is **no** device lock, PIN or biometric unlock in the application.
- There is **no** key management, key escrow or key rotation for the device.
- The only encryption the application performs is **optional, user-initiated
  encryption of an exported snapshot file** (AES-256-GCM with PBKDF2-SHA-256),
  described in [`docs/SNAPSHOTS_AND_EXPORT.md`](SNAPSHOTS_AND_EXPORT.md). That
  protects a file *on removable media or in a download folder*; it does
  nothing for the live database on the device.

## 3. Feasibility of encrypting the full local PouchDB store

### 3.1 Mechanism options

| Option | What it means | Assessment |
| ------ | ------------- | ---------- |
| **(a) PouchDB encryption plugin** (e.g. `crypto-pouch`, `pouchdb-adapter-encryption`) | A custom adapter that encrypts each document body before it is written to IndexedDB and decrypts it on read. The application keeps working with plaintext documents. | The only approach that preserves the existing code. It is a third-party dependency, not part of PouchDB core, and is not currently installed. It must be evaluated for maintenance, browser compatibility and audit before adoption. |
| **(b) Encrypt above PouchDB** (encrypt the document before `db.put`, decrypt after `db.get`) | The application manages the ciphertext itself. | **Not viable in this codebase.** Every read path would have to be rewritten, and the `pouchdb-find` Mango indexes (§3.3) would index ciphertext. |
| **(c) Full-disk encryption of the device** (BitLocker / FileVault / LUKS) | The operating system encrypts the whole disk. | The correct, cheap, high-coverage answer for a *stolen laptop*. It protects the device as a whole but does nothing for a malware scenario or an unlocked logged-in session. It is an operational/deployment control, not an application feature. |

### 3.2 Key storage — the hard part

A key for the local store has to satisfy two requirements that pull in opposite
directions:

- **It must be recoverable** after a browser restart, a crash and a reboot,
  otherwise the device's data becomes permanently unreadable — trading a
  theoretical disclosure risk for a *guaranteed* data-loss event. That rules
  out a key derived only from something the user types at run time.
- **It must not be exfiltratable** by a script running in the page (XSS), and
  ideally not be readable by another user account on the same machine.

The practical options:

| Key model | Recoverable after reboot? | Resistant to XSS exfiltration? | Consequence for this project |
| --------- | ------------------------- | ------------------------------ | ---------------------------- |
| Passphrase-derived (PBKDF2), entered by the user | Only if the user re-enters it | Yes | Unusable as a *transparent* store key: a user who cannot recall the passphrase loses the device's records. Acceptable for exported files (already implemented), not for the live store. |
| Random key generated on the device, stored in IndexedDB | Yes | No — any script in the origin can read it | The realistic choice. Protection is then only as strong as the browser profile's own protection (OS-level disk encryption, profile password, OS account isolation). |
| Random **non-extractable** `CryptoKey` in IndexedDB | Yes | Partly — a script can *use* the key through `crypto.subtle` but cannot read its bytes | Strongest browser-native option. Requires WebCrypto, therefore a **secure context** (see §3.5). |
| Key in the OS keystore / TPM | Yes | Yes | Not reachable from a browser application. Would require a native helper or an MDM agent — i.e. option (c) plus (a). |

Note the inversion of risk that the key model creates: **a device-bound key
means that losing the key is equivalent to losing the data.** For a system
whose whole point is to survive device damage, that trade-off must be stated
explicitly in any chapter that claims encryption at rest.

### 3.3 Impact on the existing queries — the second hard part

The application relies heavily on `pouchdb-find`. `frontend/src/services/db.js:929-941`
creates **eleven Mango indexes**:

```
{ type, status, createdAt }   { type, username }   { type, residentId }
{ type, timestamp }           { docType }          { type, isArchived }
{ type, residentId, recordType }  { type, residentId, dateAdministered }
{ type, category, stockLevel }    { type }
```

and queries with `localDb.find({ selector: { type: 'certificate_request' } })`
and similar (`db.js:994` and throughout the screens).

Consequences:

- If encryption is applied **at the adapter layer** (option (a)), PouchDB
  decrypts before the index is updated, so the indexes keep working — but the
  index itself is then a **plaintext index stored in the same IndexedDB**,
  which leaks the indexed values (every `type`, `status`, `username`,
  `residentId`) even if the document bodies are encrypted. This is a
  well-known limitation of adapter-layer encryption.
- If encryption is applied **above PouchDB** (option (b)), the indexes index
  ciphertext and every query in the application breaks.
- Encrypting only a **subset of fields** (PII such as `address`, `contact`,
  `narrative`) would leave the index problem untouched but would keep the
  access-control fields — `type`, `status`, `username`, `residentId`,
  `isArchived` — in clear text, because the server-side ownership rules
  (`server/utils/syncAuthorization.js`) and the client's replication filter
  (`frontend/src/services/db.js`, `makeReplicationFilter`) depend on exactly
  those fields being readable on both sides.

### 3.4 Impact on replication and on the central database

This is the constraint that most strongly argues against encrypting the local
store in this architecture.

PouchDB replication is document-level: the same document revision must be
readable by **every** device that replicates it, and by the central CouchDB.
If each device encrypts with its own device-local key, then:

- Two devices that hold the same document produce **different ciphertext** for
  the same logical revision.
- The central CouchDB would have to store one of them, and every other device
  would be unable to decrypt what it pulled — replication would produce
  unreadable documents, spurious conflicts, and (with the `_revs_diff`/`_bulk_docs`
  protocol) duplicate or diverging revision trees.

Therefore a workable design needs a **shared key across all devices of the
barangay**, which converts the problem into key distribution: the key must
reach every authorised device (and only authorised devices) through a channel
that is at least as protected as the data itself. Options and their costs:

| Key distribution | Cost |
| ----------------- | ---- |
| Key derived from a shared barangay passphrase, entered on each device | Every device shares one secret; a single disclosure exposes every device; the passphrase must be changed on every device when staff change. It also requires the passphrase at run time, which conflicts with the "recoverable after reboot" requirement. |
| Key wrapped by a per-device public key, unwrapped by a server-held key | Requires a new server key-management service, device enrolment, revocation and a hardware-anchored device identity. This is a substantial subsystem — effectively an MDM-lite. |
| Asymmetric encryption per document, public key on the device, private key held by the server | The server could decrypt anything; the local store is protected against device theft but not against the server. It also removes end-to-end properties the current design does not have anyway, and adds real complexity to the sync path. |

A pragmatic middle ground exists and is what most deployments actually do:
**encrypt the device, not the database** (option (c) in §3.1), and encrypt the
**data at rest in transit of a copy** — the snapshot file — which this project
has now implemented.

### 3.5 Impact on the service worker outbox

The service worker keeps a **second copy** of the queued documents in a
separate IndexedDB database (`bustrac_sync_outbox`, written by
`frontend/src/utils/syncOutbox.js` and drained by `frontend/src/sw.js`). Any
plan that encrypts `bustrachub_db` must also encrypt the outbox, because the
outbox is a plaintext copy of exactly the records that are most at risk (the
unsynced ones). Practical consequences:

- The outbox and the store must use the **same key**, otherwise the worker
  cannot read what it queued. The key must therefore be available to the
  service-worker context — which shares the origin's IndexedDB, so a key
  stored there is reachable, but the *ordering* of operations matters: the
  worker must be able to obtain the key before it drains the outbox.
- The outbox also stores the **session token** in its `meta` object store so
  the worker can authenticate a background push (`frontend/src/utils/syncOutbox.js`,
  `saveSwMeta`). That token is currently plaintext in IndexedDB and is a
  higher-value target than the records themselves; it should be moved to a
  non-extractable key or a short-lived worker-specific credential.
- WebCrypto's `subtle` API — needed for a non-extractable key and for AES-GCM —
  requires a **secure context**. Bustrac Hub is routinely used over a
  plain-HTTP LAN address, where `crypto.subtle` is `undefined`. The
  application already has to work around this for the snapshot checksum
  (bundled SHA-256 in `frontend/src/utils/sha256.js`) and for snapshot
  encryption (the option is disabled with an explanatory message). A
  transparent store encryption scheme would have to work without WebCrypto in
  that deployment, which rules out the non-extractable-`CryptoKey` option
  there.

### 3.6 Other impacts

- **Performance.** Every read and write becomes an encrypt/decrypt round trip.
  The dashboard runs many `allDocs`/`find` queries per render; a large
  `allDocs({include_docs:true})` over the whole database would decrypt
  thousands of documents.
- **Storage overhead.** AES-GCM adds a nonce and an authentication tag per
  record, plus base64/JSON encoding overhead if the adapter stores the
  ciphertext as a string.
- **Backups and restore.** `docs/SNAPSHOTS_AND_EXPORT.md` describes the
  snapshot/restore flow. With an encrypted store, a snapshot would contain
  ciphertext; restoring it onto a *different* device would require the shared
  key, so the "Claim unsynced records" recovery flow would become
  key-dependent.
- **Audit trail.** The audit log is a document in the same store, so it would
  be encrypted too — but the server-side audit entries (`RESIDENT_SYNC_WRITE`)
  are written server-side and would remain readable, which is where the
  authoritative trail already lives.
- **Debuggability and support.** Encrypted local stores make field support
  materially harder ("open the tablet and read the record") unless a
  documented, audited decryption path exists.

## 4. Summary of the trade-off

| Control | Coverage | Effort | Key-management risk | Replication risk | Recommendation |
| ------- | -------- | ------ | ------------------ | --------------- | -------------- |
| OS full-disk encryption (BitLocker/FileVault/LUKS) on the barangay devices | Whole device, including the local store, the outbox, the token and any downloaded snapshot | Low (operational) | None — the OS owns the key | None | **Recommended now.** Highest coverage per unit of effort. |
| Passphrase encryption of exported snapshots | Files on removable media / in download folders only | Done | Passphrase loss ⇒ file loss (acceptable for a copy) | None | **Implemented** — see `docs/SNAPSHOTS_AND_EXPORT.md`. |
| Adapter-layer encryption of the local PouchDB store | The database — but the Mango indexes and the outbox would still leak | High (new dependency, full test pass, key management, performance) | Device-bound key ⇒ key loss equals data loss; shared key ⇒ key-distribution problem | **High** — a per-device key breaks multi-device replication; a shared key needs a distribution channel | **Not recommended in the current architecture.** Re-evaluate if a shared key service or an MDM-lite is introduced. |
| Field-level encryption of PII only | Partial; the access-control fields must stay readable | High | As above | Medium | Not recommended without a key-distribution design. |

## 5. What implementing it would require

Should the barangay decide to pursue encrypted local storage, the work breaks
down as follows. None of this is implemented today.

1. **Threat model and scope decision.** Which threat is being addressed —
   stolen device, borrowed device, malware, or lost device? The answer
   determines whether OS-level encryption is sufficient or application-level
   encryption is required at all.
2. **Key distribution design.** Decide between a shared barangay key, a
   per-device key with server-held wrapping, or server-side asymmetric
   encryption. This is the decision with the largest architectural impact and
   it must be made before any code is written.
3. **Adapter choice and evaluation.** Select and audit a PouchDB encryption
   plugin (maintenance, browser support, index leakage, throughput), or
   implement an in-house adapter over `pouchdb-adapter-utils`.
4. **Index and query strategy.** Decide which fields stay in clear text (the
   server-side ownership rules and the client-side replication filter both
   depend on `type`, `username`, `residentId` and `status` being readable) and
   document the resulting metadata leakage.
5. **Outbox and token hardening.** Extend the encryption to
   `bustrac_sync_outbox` and replace the plaintext session token in the
   outbox's metadata store with a short-lived, worker-scoped credential.
6. **Secure-context fallback.** Provide a path for plain-HTTP LAN deployments,
   where `crypto.subtle` is unavailable.
7. **Key-loss recovery procedure.** Decide and document what happens when the
   key is lost — because the honest consequence is permanent loss of the
   device's records, which is the very failure mode this project exists to
   prevent.
8. **Test coverage.** Unit tests for the adapter, plus an end-to-end test that
   a replication cycle still converges across two devices with the same key and
   that a device with a different key cannot corrupt the shared dataset.
9. **Documentation and defence evidence.** Update `docs/ARCHITECTURE.md`, the
   security-model section, and the manual QA plan with the real, observed
   behaviour.

## 6. Defence-safe statement

> "Bustrac Hub does **not** encrypt the device-local database. The local
> PouchDB store, the service-worker outbox and the session token are stored in
> clear text in the browser's own storage. What *is* protected is the
> password: it is never stored in recoverable form, but kept as a bcrypt hash
> with a legacy SHA-256 upgrade path. For data that leaves the device, the
> exported snapshot can be encrypted with a passphrase using AES-256-GCM, and
> every snapshot carries a SHA-256 integrity checksum. Encrypting the live
> local store is not implemented; the assessment in
> `docs/ENCRYPTION_AT_REST_ASSESSMENT.md` explains why — chiefly that a
> per-device key would break the multi-device replication the system depends
> on, and that the recommended control for a stolen laptop is full-disk
> encryption at the operating-system level, not inside the application."
