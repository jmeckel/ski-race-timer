import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    cssMinify: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks(id) {
          // Vendor chunks
          if (id.includes('@preact/signals-core')) {
            return 'vendor-signals';
          }

          // Voice services: gate-judge only (voice commands, voice notes, LLM, speech)
          // Must be checked BEFORE the shared rule to exclude from shared chunk
          if (
            id.includes('src/services/voice') ||
            id.includes('src/services/voiceNote') ||
            id.includes('src/services/llmProvider') ||
            id.includes('src/services/speechSynthesis')
          ) {
            return 'gate-judge';
          }

          // Camera service: timer views only, lazy-loaded elsewhere
          if (id.includes('src/services/camera')) {
            return 'timer';
          }

          // Shared infrastructure: store, services, utils, i18n, components, modals
          // Prevents Vite from inlining shared code into view chunks
          if (
            id.includes('src/store/') ||
            id.includes('src/services/') ||
            id.includes('src/utils/') ||
            id.includes('src/i18n/') ||
            id.includes('src/components/Toast') ||
            id.includes('src/components/Clock') ||
            id.includes('src/components/SwipeActions') ||
            id.includes('src/components/index') ||
            id.includes('src/features/modals') ||
            id.includes('src/features/faults/')
          ) {
            return 'shared';
          }

          // Timer view: radial dial components and timer view
          if (
            id.includes('src/features/radialTimerView') ||
            id.includes('src/components/RadialDial.ts') ||
            id.includes('src/components/RadialDialAnimation') ||
            id.includes('src/components/RadialDialInteraction')
          ) {
            return 'timer';
          }

          // Results view: results list and virtual list
          if (
            id.includes('src/features/resultsView') ||
            id.includes('src/components/VirtualList')
          ) {
            return 'results';
          }

          // Settings view: settings orchestrator and sub-modules
          if (
            id.includes('src/features/settingsView') ||
            id.includes('src/features/settings/')
          ) {
            return 'settings';
          }

          // Gate Judge view: gate judge UI and voice notes
          // Note: faults/ moved to shared — used by app orchestrators and multiple views
          if (
            id.includes('src/features/gateJudgeView') ||
            id.includes('src/features/gateJudge.ts') ||
            id.includes('src/features/voiceNoteUI')
          ) {
            return 'gate-judge';
          }

          // Export module: shared between chief-judge and results views
          if (id.includes('src/features/export')) {
            return 'export';
          }

          // Chief Judge view: chief judge panel
          if (id.includes('src/features/chiefJudgeView')) {
            return 'chief-judge';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      manifestFilename: 'manifest.json',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'CHRONO',
        short_name: 'CHRONO',
        description: 'Precision race timing, GPS-synchronized',
        theme_color: '#0a1628',
        background_color: '#0a1628',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        categories: ['sports', 'utilities'],
        shortcuts: [
          {
            name: 'Timer',
            url: '/?view=timer',
            description: 'Open race timer',
          },
          {
            name: 'Results',
            url: '/?view=results',
            description: 'View race results',
          },
        ],
        icons: [
          { src: 'icons/icon-72.png', sizes: '72x72', type: 'image/png' },
          { src: 'icons/icon-96.png', sizes: '96x96', type: 'image/png' },
          { src: 'icons/icon-128.png', sizes: '128x128', type: 'image/png' },
          { src: 'icons/icon-144.png', sizes: '144x144', type: 'image/png' },
          { src: 'icons/icon-152.png', sizes: '152x152', type: 'image/png' },
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          { src: 'icons/icon-384.png', sizes: '384x384', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Exclude authenticated API requests from SW caching entirely.
            // Authenticated responses must not be cached — stale tokens, race data freshness,
            // and potential for serving another user's data make this unsafe.
            urlPattern: /\/api\/v1\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
    ...(process.env.ANALYZE
      ? [
          visualizer({
            open: true,
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  server: {
    port: 3000,
    host: true,
  },
});
