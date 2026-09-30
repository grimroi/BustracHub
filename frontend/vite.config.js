import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg}']
      },
      manifest: false // Walang standalone PWA install prompt ayon sa instruction ng panel
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
})