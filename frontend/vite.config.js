import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Bustrac Hub',
        short_name: 'Bustrac',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3b82f6',
      },
      workbox: {
        // 1. I-cache ang lahat ng static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff,woff2}'],
        
        // 2. THE MAGIC FIX: Sabihin sa SW na i-serve ang index.html sa anumang route (e.g., /resident)
        navigateFallback: '/index.html',
        
        // 3. Huwag i-intercept ang mga API calls o mga file na may extension (like .js, .png)
        navigateFallbackDenylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
        
        // 4. Increase cache limit para iwas error sa pag-cache ng malalaking JS files
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
      },
      // I-enable sa dev para sa testing (pero mas mainam i-test sa build)
      devOptions: {
        enabled: true,
        type: 'module',
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
    port: 5173
  }
});