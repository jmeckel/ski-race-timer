import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

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
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
      },
      output: {
        // Rolldown groups capture their modules' dependencies recursively, so
        // priority decides ownership: higher-priority groups claim modules first.
        // Shared infrastructure must outrank the view groups, otherwise a view
        // chunk (e.g. chief-judge) absorbs the store/utils it imports.
        codeSplitting: {
          groups: [
            { name: 'vendor-signals', test: /@preact[\\/]signals-core/, priority: 100 },
            // Shared infrastructure: store, services, utils, i18n, components, modals, faults.
            // Voice/camera services are excluded: they belong to the gate-judge/timer chunks.
            {
              name: 'shared',
              test: /src[\\/](store|services[\\/](?!voice|llmProvider|speechSynthesis|camera)|utils|i18n|features[\\/]faults)[\\/]?|src[\\/]components[\\/](Toast|Clock|SwipeActions|index)|src[\\/]features[\\/]modals/,
              priority: 80,
            },
            // Export module: shared between chief-judge and results views
            { name: 'export', test: /src[\\/]features[\\/]export/, priority: 70 },
            // Timer view: radial dial components, timer view, camera service
            {
              name: 'timer',
              test: /src[\\/]services[\\/]camera|src[\\/]features[\\/]radialTimerView|src[\\/]components[\\/]RadialDial/,
              priority: 10,
            },
            // Results view: results list and virtual list
            {
              name: 'results',
              test: /src[\\/]features[\\/]resultsView|src[\\/]components[\\/]VirtualList/,
              priority: 10,
            },
            // Settings view: settings orchestrator and sub-modules
            { name: 'settings', test: /src[\\/]features[\\/]settings(View|[\\/])/, priority: 10 },
            // Gate Judge view: gate judge UI, voice notes, voice/LLM/speech services
            {
              name: 'gate-judge',
              test: /src[\\/]services[\\/](voice|llmProvider|speechSynthesis)|src[\\/]features[\\/](gateJudgeView|gateJudge\.ts|voiceNoteUI)/,
              // Above other views: settings imports gate-judge modules and would absorb them
              priority: 20,
            },
            // Chief Judge view: chief judge panel
            { name: 'chief-judge', test: /src[\\/]features[\\/]chiefJudgeView/, priority: 10 },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
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
