import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use jsdom for DOM simulation
    environment: 'jsdom',

    // Setup files run before each test file
    setupFiles: ['./tests/setup.js'],

    // Test file patterns
    include: [
      'tests/unit/**/*.test.js',
      'tests/api/**/*.test.js',
      'tests/integration/**/*.test.js'
    ],

    // Exclude E2E tests (handled by Playwright)
    exclude: ['tests/e2e/**/*', 'node_modules/**/*'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['api/**/*.js', 'public/**/*.js'],
      exclude: ['tests/**/*', 'node_modules/**/*']
    },

    // Global test timeout
    testTimeout: 10000,

    // Reporter options
    reporters: ['verbose'],

    // Watch mode configuration
    watch: false
  }
});
