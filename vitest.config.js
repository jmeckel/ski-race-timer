import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'virtual:pwa-register': resolve(__dirname, 'tests/__mocks__/virtualPwaRegister.ts'),
    },
  },
  test: {
    // Use jsdom for DOM simulation
    environment: 'jsdom',

    // Setup files run before each test file
    setupFiles: ['./tests/setup.js', './tests/setup.ts'],

    // Test file patterns - include both JS and TS
    include: [
      'tests/unit/**/*.test.{js,ts}',
      'tests/api/**/*.test.{js,ts}',
      'tests/integration/**/*.test.{js,ts}',
    ],

    // Exclude E2E tests (handled by Playwright)
    exclude: ['tests/e2e/**/*', 'node_modules/**/*'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['api/**/*.{js,ts}', 'public/**/*.js', 'src/**/*.ts'],
      exclude: ['tests/**/*', 'node_modules/**/*', 'src/**/*.d.ts'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },

    // Global test timeout
    testTimeout: 10000,

    // Reporter options
    reporters: ['verbose'],

    // Watch mode configuration
    watch: false,

    // Globals for describe, it, expect etc
    globals: true,
  },
});
