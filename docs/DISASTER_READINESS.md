# Disaster Readiness

**What this is.** A read-only status display and checklist that tells a staff
member or administrator whether **this device** is prepared to keep working
when the network, the power or a typhoon takes it offline. It is shown in the
administrator portal under **Data Protection → Disaster Readiness**.

**What this is NOT.** It is **not** an offline-sync mechanism, and it does not
change how the system synchronises. It reads state that already exists and
reports it. It never writes to the database, never touches replication,
authentication or the PouchDB configuration, and it never substitutes for the
offline-first architecture described in `docs/ARCHITECTURE.md`.

The honest limitation: **the panel cannot make a device more ready.** It can
only tell you, in advance, that a device is *not* ready — and that a record
created offline and not yet replicated still lives only on that device. The
panel is a preparation aid; the actual protection comes from the end-of-day
sync checkpoint, the scheduled snapshot and the offline login cache.

---

## The checks

Seven checks are evaluated. The three marked **critical** carry 25 points each;
the other four carry 5 points each. The total (95) is normalised to 100 for the
score. The **ready** verdict is true only when *every critical check passes* —
a low battery or a stale sync lowers the score and is named in the
recommendation, but does not block deployment.

| Check | Critical | What it reads | Why it matters before a calamity |
| ----- | -------- | ------------- | ------------------------------------ |
| `offline_auth_cached` | **yes** | `localStorage['bustrac_offline_auth']` has at least one entry | Without a cached credential the device cannot sign in at an evacuation centre with no internet, and staff fall back to paper |
| `service_worker_active` | **yes** | `navigator.serviceWorker.controller !== null` | The application shell is served from the local cache, so the app opens without a network |
| `local_db_healthy` | **yes** | `db.info()` on the local PouchDB succeeds | The local store is where offline records live; if it is unhealthy, offline entry is not possible |
| `recent_sync` | no | the last successful sync was within 24 hours | Confirms the server held the latest records before the network went away |
| `no_pending_changes` | no | `getPendingSyncCount() === 0` | **The most important non-critical check.** Records still queued exist only on this device; if the device is lost, they are lost |
| `storage_available` | no | at least 50 MB of device storage is free | Offline records need somewhere to be written; a full disk silently fails to save |
| `battery_ok` | no | battery at or above 20 %, **or** the device does not report its battery | A flat battery during a long evacuation means the device stops working |

### Battery

The Battery Status API (`navigator.getBattery()`) is not available on every
browser and not at all on desktop Chrome. The helper
`getBatteryStatus()` in `frontend/src/services/disasterReadiness.js`:

- uses `navigator.getBattery()` when it is available,
- returns `{ level, charging, supported }`, with `level` as a percentage (0–100),
- resolves cleanly to `{ level: null, charging: null, supported: false }` when
  the API is missing **or** when it rejects or throws — it never throws,
- and the card renders **"Battery status unavailable"** in that case.

A device that cannot report its battery is **not** penalised: the
`battery_ok` check passes, because an unavailable measurement is not evidence
of a flat battery.

---

## Practical pre-disaster checklist

Run this on **every device that will be used** — a tablet in an evacuation
centre is not the same device as the one in the office.

1. **Charge every device to 100 %** and start it on mains power where the
   evacuation centre has a generator. A device at 20 % will not survive a
   shift. Re-check with the *Battery* line in the panel.
2. **Sync before landfall.** Open the app while there is still a connection
   and press **Sync Now** in the top bar. The panel's *No pending unsynced
   changes* check must pass: any record still queued exists only on that
   device.
3. **Log in online on each device that will be used.** The offline credential
   cache is per device, and it is only written during a successful online
   login. A device that has never logged in online cannot sign in offline, so
   the *Offline credential cached* check will fail.
4. **Install the app to the home screen** (Add to Home Screen / Install app)
   on each device, then reopen it once. This is what registers and activates
   the service worker, so the *Service worker active* check passes and the
   app opens with no network. Verify by turning the Wi-Fi off and reopening it.
5. **Free up device storage** on each device so the *Sufficient device
   storage* check passes. A device with a full disk cannot save an offline
   record.
6. **Open Data Protection → Disaster Readiness on every device** and confirm
   the badge reads **READY** before the storm arrives. Anything short of READY
   is named in the one-line recommendation underneath.
7. **Take a local snapshot** (Data Protection → Back Up Now) on each device,
   and copy the file to a USB drive or the office server. The snapshot is the
   only copy of any record that has not yet replicated.

### If the panel says NEEDS ATTENTION

The recommendation line names the failing checks. The two that matter most are
*Offline credential cached* and *No pending unsynced changes*:

- **No cached credential** → log in online on that device (step 3).
- **Pending unsynced changes** → sync now (step 2). Until that happens, the
  queued records are on the device and nowhere else.

---

## Where the code lives

| Piece | File |
| ----- | ---- |
| Policy (pure) and collection | `frontend/src/services/disasterReadiness.js` |
| Battery Status API helper | `frontend/src/services/disasterReadiness.js` (`getBatteryStatus`) |
| Admin card | `frontend/src/pages/DashboardPortal.jsx` (Data Protection screen) |
| Unit tests | `frontend/src/services/__tests__/disasterReadiness.test.js` |

The policy layer is covered by unit tests; the card itself is verified in the
headless-browser runtime check described in `MANUAL_QA_PLAN.md`.
