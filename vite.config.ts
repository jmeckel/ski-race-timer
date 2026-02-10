import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import { resolve } from 'path';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.json',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Ski Race Timer',
        short_name: 'Ski Race Timer',
        description: 'GPS-synchronized race timing for ski races',
        theme_color: '#0D0D0D',
        background_color: '#0D0D0D',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icons/icon-72.png', sizes: '72x72', type: 'image/png' },
          { src: 'icons/icon-96.png', sizes: '96x96', type: 'image/png' },
          { src: 'icons/icon-128.png', sizes: '128x128', type: 'image/png' },
          { src: 'icons/icon-144.png', sizes: '144x144', type: 'image/png' },
          { src: 'icons/icon-152.png', sizes: '152x152', type: 'image/png' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-384.png', sizes: '384x384', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            // Stale-while-revalidate for sync API GET requests
            // Returns cached response immediately while fetching fresh data in background
            // Enables offline-first reads for race data on slow/spotty cellular connections
            urlPattern: /\/api\/v1\/sync\?.*$/i,
            handler: 'StaleWhileRevalidate',
            method: 'GET',
            options: {
              cacheName: 'api-sync-cache',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 5 // Short TTL: cached data is only valid for 5 seconds
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    }),
    ...(process.env.ANALYZE ? [visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true
    })] : [])
  ],
  server: {
    port: 3000,
    host: true
  }
});
