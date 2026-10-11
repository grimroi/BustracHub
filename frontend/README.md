# BUSTRAC HUB
## An Offline-First Integrated Management Information System for Barangay Service Operations

###  Project Overview
Bustrac Hub is a comprehensive, offline-first web application designed to digitize and streamline barangay service operations. It features real-time synchronization, conflict resolution, and a dual-portal system (Admin/Staff and Resident) to ensure uninterrupted service delivery even in areas with unstable internet connectivity.

###  Key Features
- **Offline-First Architecture:** Powered by PouchDB & CouchDB for seamless local data storage and background synchronization.
- **Automated Conflict Resolution:** Advanced UI for detecting and resolving database sync conflicts (Keep Version A/B).
- **Comprehensive Modules:** Resident Registry, Household Management, Certificate Issuance (with CTC/Blotter verification), Blotter/Case Management, Aid Distribution, and Feedback System.
- **Real-time Audit Trail:** Immutable logging of all system actions for transparency and security.
- **Responsive Design:** Fully optimized for both desktop (Admin/Staff) and mobile (Resident Portal) views.

###  Tech Stack
- **Frontend:** React 18, Vite, React Router, Tailwind CSS / Custom CSS Variables
- **Database:** PouchDB (Local) ↔ CouchDB (Remote)
- **Utilities:** SheetJS (Excel Export), Date-fns / Custom Helpers

###  How to Run Locally
1. Clone the repository.
2. Install dependencies: `npm install`
3. Create a `.env` file based on `.env.example` (Ensure CouchDB URL is configured).
4. Start the development server: `npm run dev`
5. (Optional) Start the backend notification service: `cd server && npm start`

###  Development Team
- [Your Name / Team Members]
- Adviser: [Adviser Name]
- Institution: Camarines Sur Polytechnic Colleges

## Performance

Last optimized: 2026-10-09

### Core Web Vitals (Lighthouse)
- LCP: 0.16s (Excellent)
- CLS: 0.03 (Excellent)  
- INP: 160ms (Good)

### Optimizations Applied
1. **Query optimization** — Mango indexes + `db.find()` instead of `db.allDocs()`
2. **Consolidated PouchDB listeners** — 11 → 1 subscription
3. **Component extraction** — Topbar, DashboardScreen, ResidentsScreen memoized
4. **Filter memoization** — `useMemo` for derived state
5. **GPU-friendly CSS** — Animations use `opacity`/`transform` only
6. **React 18 features** — `startTransition` for non-urgent updates
7. **Debounced live updates** — 500ms batch for listener flushes

### Remaining Opportunities
- Extract remaining screens (CertificatesScreen, BlotterScreen, etc.)
- Consider `React.lazy` for code splitting
- Consider React Router for route-based rendering