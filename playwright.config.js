import { defineConfig, devices } from '@playwright/test';

// Check if we're running production tests
const isProduction = process.env.TEST_ENV === 'production';
const prodUrl = 'https://ski-race-timer.vercel.app';

export default defineConfig({
  // Test directory
  testDir: './tests/e2e',

  // Test file patterns - filter by environment
  testMatch: isProduction ? '**/production.spec.js' : '**/*.spec.js',
  testIgnore: isProduction ? [] : '**/production.spec.js',

  // Test timeout (allows room for navigation + action timeouts under load)
  timeout: isProduction ? 30000 : 20000,

  // Expect timeout - reduced for faster failures
  expect: {
    timeout: isProduction ? 5000 : 3000,
  },

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry flaky tests (1 retry locally, 1 on CI)
  retries: 1,

  // Parallel workers - use available cores
  workers: process.env.CI ? 4 : 4,

  // Reporter
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: isProduction ? prodUrl : 'http://localhost:3000',

    // Collect trace on retry (off in CI for speed)
    trace: process.env.CI ? 'off' : 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // No video by default (speeds up tests)
    video: 'off',

    // Faster action timeout
    actionTimeout: 5000,

    // Faster navigation timeout
    navigationTimeout: 10000,
  },

  // Configure projects - MOBILE ONLY (Chrome-based and Safari-based)
  projects: isProduction
    ? [
        // Production: Mobile Chrome portrait only for quick smoke test
        {
          name: 'mobile-chrome-portrait',
          use: { ...devices['Pixel 5'] },
        },
      ]
    : [
        // Mobile Chrome - Portrait (Android)
        {
          name: 'mobile-chrome-portrait',
          use: {
            ...devices['Pixel 5'],
            viewport: { width: 393, height: 851 },
          },
        },
        // Mobile Chrome - Landscape (Android)
        {
          name: 'mobile-chrome-landscape',
          use: {
            ...devices['Pixel 5'],
            viewport: { width: 851, height: 393 },
          },
        },
        // Mobile Safari - Portrait (iPhone)
        // WebKit can be slower in CI, so increase timeouts
        {
          name: 'mobile-safari-portrait',
          use: {
            ...devices['iPhone 13'],
            viewport: { width: 390, height: 844 },
            actionTimeout: 10000,
            navigationTimeout: 15000,
          },
        },
        // Mobile Safari - Landscape (iPhone)
        {
          name: 'mobile-safari-landscape',
          use: {
            ...devices['iPhone 13'],
            viewport: { width: 844, height: 390 },
            actionTimeout: 10000,
            navigationTimeout: 15000,
          },
        },
      ],

  // Run local dev server before starting tests (not for production)
  webServer: isProduction
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
