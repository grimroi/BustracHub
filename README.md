# Bustrac Hub

Barangay Management Information System (BMIS) — an **offline-first** web application for barangay BUSTRAC (Barangay Upper San Tarcisio Records Administration Center). Residents, staff and administrators manage certificates, blotter cases, announcements, feedback, financial aid and events on a single community database.

## Key capabilities

- **Offline-first sync** — every action is saved to a local PouchDB database (IndexedDB) first, then replicated to the central CouchDB through an authenticated Express proxy. The app works with no internet and catches up automatically.
- **Three roles** — `resident`, `staff`, `admin`. Residents use a mobile-first portal; staff/admin use a full dashboard.
- **E-Services** — certificate requests, blotter filing and summons updates, feedback, announcements, events, assistance requests.
- **Notifications** — server-side SMS for summons updates (when a provider is configured) plus live SSE push for the dashboard.

## Repository layout

```
├─ frontend/   React + Vite SPA (PouchDB client, dashboard & resident portal)
├─ server/     Express API, CouchDB sync proxy, auth, SMS/SSE listener
├─ docs/       Setup, architecture, API, demo script, troubleshooting, defense Q&A
└─ tools/      (maintenance tools)
```

## Quick start

Requires **Node.js 18+** and **CouchDB 3.x** running on port 5984.

1. Seed/config steps and all environment variables: see [`docs/SETUP.md`](docs/SETUP.md).
2. Start the backend: `cd server && npm start` (port 5000).
3. Start the frontend: `cd frontend && npm run dev` (port 5173).
4. Open `http://localhost:5173`.

Default demo accounts are listed in `docs/SETUP.md`.

## Documentation

| Doc | Purpose |
| --- | --- |
| [`docs/SETUP.md`](docs/SETUP.md) | Install, configure, seed, and run |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design: offline sync, auth, security model |
| [`docs/API.md`](docs/API.md) | HTTP endpoints (REST + sync proxy + SSE) |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | Step-by-step defense/demo walkthrough |
| [`docs/DEFENSE_QA.md`](docs/DEFENSE_QA.md) | Anticipated panel questions and answers |

## Tests

```bash
cd frontend
npm test          # Jest suites (unit + component)
npm run lint      # ESLint
npm run build     # Production build (vite build)
```