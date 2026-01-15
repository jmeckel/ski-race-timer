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

  // Maximum time for each test
  timeout: isProduction ? 60000 : 30000,

  // Expect timeout
  expect: {
    timeout: isProduction ? 10000 : 5000
  },

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only (more retries for production due to network)
  retries: process.env.CI ? 2 : (isProduction ? 1 : 0),

  // Parallel workers
  workers: process.env.CI ? 1 : undefined,

  // Reporter
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: isProduction ? prodUrl : 'http://localhost:3000',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'on-first-retry'
  },

  // Configure projects for different browsers
  projects: isProduction ? [
    // Production tests - run on Chromium only for speed
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ] : [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },

    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] }
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] }
    }
  ],

  // Run local dev server before starting tests (not for production)
  webServer: isProduction ? undefined : {
    command: 'npx serve public -l 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
