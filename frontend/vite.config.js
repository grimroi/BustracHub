import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// ──────────────────────────────────────────────────────────────
// SECURITY HEADERS (SPA layer)
// ──────────────────────────────────────────────────────────────
// The React app is served by Vite, so the document-level security headers
// must be emitted here — the Express server (port 5000) only serves /api/*.
//
// CSP is built from the app's ACTUAL needs:
//   script-src : self + 'unsafe-inline'. The app needs inline script in two
//                places: (1) the index.html bootstrap (global = globalThis)
//                and (2) the print templates (SummonsPanel, BHS Inventory/
//                Health, DashboardPortal reports) which window.open('') an
//                about:blank popup and document.write a full document with an
//                inline <script> (window.onload→print()) and inline handlers
//                (onclick/onerror). A Chromium about:blank popup INHERITS the
//                opener's CSP, so a hash-only policy would silently break
//                certificate / summons / CFA / BHS printing. Externalizing
//                those templates is out of scope, so 'unsafe-inline' is kept.
//   style-src  : self + 'unsafe-inline' — the app uses inline <style> blocks
//                (Tailwind/Vite inject), React style attributes and print
//                popups.
//   img-src    : self + data: (SVG data-URI backgrounds, base64 photos) +
//                blob: (photo previews / generated files).
//   connect-src: self + the API origins below + ws: for Vite HMR (dev only).
//                PouchDB sync + SSE + login all use this.
//   font-src   : self + data:.
//   frame-ancestors 'none' + X-Frame-Options DENY = anti-clickjacking.
//
// No 'unsafe-eval' is allowed in production (it is needed only by Vite's dev
// HMR / React Fast Refresh, so it is confined to the dev policy).
// connect-src is an explicit allowlist (never *).
//
// Origins the SPA is allowed to fetch from. The backend API is on :5000 and
// apiBase.js rewrites the loopback URL to the PAGE's own host when the app is
// opened from another device on the Wi-Fi (see utils/apiBase.js), so the LAN
// hosts the server already trusts in its CORS allowlist are mirrored here.
// `'self'` is always included, covering same-origin requests.
const API_ORIGINS = [
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://192.168.1.4:5000',
  'http://192.168.1.6:5000',
  'http://192.168.56.1:5000',
];

const buildCsp = ({ dev }) => {
  const scriptSrc = dev
    ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] // Vite HMR / Fast Refresh
    : ["'self'", "'unsafe-inline'"]; // inline print templates (see above)

  const connectSrc = dev
    ? ["'self'", ...API_ORIGINS, 'ws:', 'wss:']
    : ["'self'", ...API_ORIGINS];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Anti-clickjacking: equivalent to X-Frame-Options: DENY (and covers
    // browsers that only honor the CSP directive).
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
};

const securityHeaders = (csp) => ({
  'Content-Security-Policy': csp,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
});

export default defineConfig(() => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // Walang PWA install prompt / app branding
      // The service worker is hand written (src/sw.js) so it can implement the
      // Background Sync event: when the browser regains connectivity it wakes
      // the worker, which drains the durable outbox straight to CouchDB even
      // though the tab was closed.
      //
      // `injectManifest` replaces `self.__WB_MANIFEST` in src/sw.js with the
      // list of files to precache. The worker is emitted as a classic script
      // (rollupFormat: 'iife') so the generated registerSW.js keeps working
      // without a `{ type: 'module' }` option.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        injectionPoint: 'self.__WB_MANIFEST',
        rollupFormat: 'iife',
      },
      devOptions: {
        enabled: false, // Gawing false para hindi mag-conflict ang dev mode sa preview/production!
      }
    })
  ],
  define: {
    global: 'window',
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('pouchdb')) return 'pouchdb-vendor';
            if (id.includes('react')) return 'react-vendor';
          }
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    headers: securityHeaders(buildCsp({ dev: true })),
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    headers: securityHeaders(buildCsp({ dev: false })),
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}));