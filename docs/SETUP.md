# Setup Guide

## 1. Prerequisites

| Software | Version | Notes |
| -------- | ------- | ----- |
| Node.js | 18.x or newer | Required by both Express and Vite |
| CouchDB | 3.x | Community edition; listen on port 5984 |
| A browser | Chrome/Edge recommended | The app uses IndexedDB (PouchDB) |

## 2. Install the database

1. Install CouchDB with the default admin setup (creates `admin` and an admin password).
2. Verify: open `http://127.0.0.1:5984/_utils/` and log in.
3. The app and seed script create the `bustrachub_db` database automatically — you do not need to create it manually.

> **Windows note:** use `127.0.0.1` (IPv4) in every config file. `localhost` on some Windows setups resolves to `::1` (IPv6), which CouchDB does not listen on by default and shows up as a 502 error.

## 3. Install dependencies

```bash
cd frontend
npm install

cd ../server
npm install
```

## 4. Configure environment variables

### `server/.env` (required)

```
COUCHDB_URL=http://admin:YOUR_ADMIN_PASSWORD@127.0.0.1:5984
PORT=5000
```

- `COUCHDB_URL` — CouchDB admin URL. The credentials appear **here only**; they are never sent to the browser.
- `PORT` — backend port (defaults to `5000`).

Optional SMTP/SMS settings for the email service (`server/services/emailService.js`) and SMS service (`server/services/smsService.js`). Blotter/SMS features are optional; the core app runs without them.

### `frontend/.env`

```
VITE_API_URL=http://localhost:5000
VITE_COUCHDB_DB=bustrachub_db
```

- `VITE_API_URL` — backend base URL.
- `VITE_COUCHDB_DB` — CouchDB database name routed through the sync proxy.

The frontend re-uses this file's values; edit and **restart** the Vite dev server after changing them.

## 5. Seed the database

Seeding is **automatic**: the server creates `bustrachub_db` and the demo accounts on startup (`initDB()` in `server/index.js`). A standalone `npm run seed` is available if you want to create them without starting the server:

```bash
cd server
npm run seed      # node seed.js — ensures the demo accounts exist
```

## 6. Run

```bash
# Terminal 1 — backend
cd server
npm start        # http://0.0.0.0:5000

# Terminal 2 — frontend
cd frontend
npm run dev      # http://localhost:5173
```

Open `http://localhost:5173`. The login page loads.

## 7. Demo accounts

| Role | Username | Password |
| ---- | -------- | -------- |
| Resident | `juan2026` | `password` |
| Staff | `mgcortero` | `password` |
| Admin | `jmacabangon` | `password` |

**Important:** login **must** go through the app UI (or `/api/login`). The client only ever holds an opaque session token — never the CouchDB admin credentials.

## 8. Verifying the stack is healthy

```bash
# Backend health
curl http://localhost:5000/api/status
# → {"status":"online","message":"BustracHub Backend Server is active!"}

# CouchDB reachable (from the server machine)
curl http://127.0.0.1:5984/_up
```

## 9. Running tests / build

```bash
cd frontend
npm test          # Jest suites
npm run lint      # ESLint (note: repo has many pre-existing warnings)
npm run build     # Production bundle
```

## 10. Viewing data in CouchDB

Open `http://127.0.0.1:5984/_utils/` (Fauxton) → `bustrachub_db`.

## Common errors

See [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) for the most common problems (502 on sync, CORS, 403 on offline writes, `localhost` vs `127.0.0.1`).