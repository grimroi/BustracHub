# Local Snapshots and Export Hardening

This document describes the snapshot artifact produced by Bustrac Hub, how its
integrity is protected, how it can be encrypted, and how the scheduled snapshot
is configured.

---

## 1. What a snapshot is

A snapshot is a JSON file containing the whole local PouchDB database. It is
the artefact used for two different purposes:

1. **Manual export** — an administrator downloads it to keep an off-device copy.
2. **Scheduled snapshot** — the application writes it automatically on an
   interval so that a copy exists even if nobody remembers to export.

Both use **exactly the same artifact format**, so a file produced by the
scheduler can be restored by the same "Claim unsynced records" flow as a
manually downloaded file.

## 2. Artifact format

```json
{
  "app": "Bustrac Hub",
  "schema": "bustrac.snapshot",
  "schemaVersion": 2,
  "exportDate": "2026-10-20T18:00:00.000Z",
  "deviceId": "dev_tablet01",
  "deviceLabel": "Chrome on Windows",
  "docCount": 2,
  "rows": [ { "id": "resident_1", "doc": { "_id": "resident_1", "...": "..." } } ],
  "integrity": {
    "algorithm": "SHA-256",
    "value": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
  }
}
```

- `schema` / `schemaVersion` — the schema header. A file with an unexpected
  `schema` is refused on restore.
- `deviceId` / `deviceLabel` — which device produced the file. This makes a
  recovered backup traceable to its origin.
- `rows` — the exported documents, at the **top level**. This keeps the format
  compatible with the original manual export, so files exported by earlier
  versions of the application can still be imported.
- `integrity` — the integrity block (see below).

### 2.1 File name

```
bustrac_snapshot_<deviceId>_<YYYYMMDD-HHMMSS>.json
```

for example `bustrac_snapshot_dev_tablet01_20261020-180509.json`.

The timestamp is rendered in **UTC** so that snapshots produced on devices in
different time zones sort correctly against one another and the name identifies
an unambiguous point in time. The device id is sanitised (only
`A–Z a–z 0–9 . _ -` survive, dot runs are collapsed and leading/trailing dots
are removed) so a file name can never contain a path separator.

## 3. Integrity checksum

The checksum is a **SHA-256** digest over a canonical serialisation of the
payload fields (`app`, `schema`, `schemaVersion`, `exportDate`, `deviceId`,
`deviceLabel`, `docCount`, `rows`) in a fixed key order.

- A file that was truncated, partially written, or edited after the fact fails
  verification and is **refused** on restore.
- A legacy export that predates the integrity block is still accepted (it is
  simply not verifiable); the restore is audited as `integrityChecked: false`.
- A refused file is audited with action `CLAIM_UNSYNCED_RECORDS` and
  `meta.refused: true`.

### 3.1 Why a bundled SHA-256 rather than `crypto.subtle`

The WebCrypto `subtle` API is only exposed in a **secure context** (`https`, or
`http://localhost`). Bustrac Hub is routinely used over a plain-HTTP LAN address
(`http://192.168.x.x:5173`) while a phone or a second laptop is testing the
app, and there `window.crypto.subtle` is `undefined`. The checksum must still
work there, so the digest is computed by a small bundled implementation
(`frontend/src/utils/sha256.js`) that is verified against the published
FIPS 180-4 test vectors in `frontend/src/utils/__tests__/sha256.test.js`.

## 4. Encryption (optional)

A snapshot may be encrypted with a passphrase using **AES-256-GCM** and a
**PBKDF2-SHA-256** key derivation (210 000 iterations, 16-byte random salt,
12-byte random IV). The encrypted envelope looks like this:

```json
{
  "app": "Bustrac Hub",
  "schema": "bustrac.snapshot.encrypted",
  "schemaVersion": 2,
  "encryption": {
    "algorithm": "AES-256-GCM",
    "kdf": "PBKDF2-SHA-256",
    "iterations": 210000,
    "salt": "<base64>",
    "iv": "<base64>"
  },
  "data": "<base64 ciphertext>"
}
```

### 4.1 Availability limitation (important)

`crypto.subtle` requires a secure context. **Encryption is therefore only
offered when the application is served from `https://` or `http://localhost`.**
On a plain-HTTP LAN address the browser does not expose WebCrypto, the
"Encrypt snapshots with a passphrase" option is disabled in the UI, and an
explanatory message is displayed instead. The integrity checksum is unaffected
— it does not depend on WebCrypto.

The passphrase is never stored: it is held in component state for the duration
of the session and supplied to the backup routine at the moment the snapshot
is written. A forgotten passphrase means the file cannot be decrypted.

## 5. Scheduled snapshots

- The scheduler runs `handleAutoBackup()` on an interval.
- The interval is configurable in **Data Protection → Automated local backups**
  and stored in the `setting_data_protection` document
  (`autoBackupIntervalHours`). The default is **24 hours (daily)**.
- The scheduler can be disabled entirely (`autoBackupEnabled`).
- The destination is, in order of preference:
  1. the connected backup folder (File System Access API — Chromium browsers), or
  2. an automatic browser download, or
  3. the configured cloud endpoint (S3-compatible / Google Drive) when one is
     configured with an API key.
- Every run writes an `audit_log` entry with action `AUTO_BACKUP` recording the
  mode, the file name, the document count, whether the file was encrypted, and
  the integrity block.

### 5.1 Recording the snapshot time in the device registry

After a snapshot is written, the time is stored on the device
(`bustrac_last_snapshot_at`) and is reported to the server with the next
device heartbeat. The server stores it in the `device_registry_<deviceId>`
document as `lastSnapshotAt`, and returns it in `GET /api/devices`. An
administrator can therefore see, per device, both **when it last synced** and
**when it last produced a local backup**.

## 6. Restoring a snapshot

**Data Protection → Claim unsynced records** accepts a snapshot file:

1. The file is parsed. A file that is not valid JSON is rejected.
2. If the file carries an `integrity` block, the checksum is verified. A
   mismatch aborts the restore and is audited.
3. Every document is merged into the local database:
   - a document that does not exist locally is inserted as-is;
   - a document that exists locally is replaced **only** when the backup copy
     is newer (by `updatedAt`); otherwise the local copy wins.
4. The outcome is audited with action `CLAIM_UNSYNCED_RECORDS`, recording the
   number of documents imported, kept and left for conflict review, and
   whether the integrity check was performed.

Because the restore writes into the local database, the normal replication
carries the recovered documents to the central CouchDB.
