# Ski Race Timer - Testing Guide

This document describes the testing infrastructure, test categories, and how to run tests for the Ski Race Timer application.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Unit Tests](#unit-tests)
- [API Tests](#api-tests)
- [E2E Tests](#e2e-tests)
- [UI Testing Strategy](#ui-testing-strategy)
- [Writing New Tests](#writing-new-tests)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Quick Start

```bash
# Install dependencies
npm install

# Run all unit tests
npm test

# Run E2E tests
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

## Test Structure

```
tests/
├── setup.js                 # Test setup, mocks, utilities
├── unit/
│   ├── utils.test.js        # Utility function tests
│   └── validation.test.js   # Validation function tests
├── api/
│   └── sync.test.js         # API endpoint tests
├── integration/
│   └── (future)             # Integration tests
└── e2e/
    ├── timer.spec.js        # Timer view E2E tests
    ├── results.spec.js      # Results view E2E tests
    └── settings.spec.js     # Settings view E2E tests
```

## Running Tests

### Unit Tests (Vitest)

```bash
# Run all unit tests
npm test

# Run in watch mode
npm run test:watch

# Run specific file
npm test -- tests/unit/utils.test.js

# Run with coverage
npm run test:coverage
```

### API Tests

```bash
# Run API tests
npm run test:api

# Run with verbose output
npm run test:api -- --reporter=verbose
```

### E2E Tests (Playwright)

```bash
# Install Playwright browsers (first time)
npx playwright install

# Run all E2E tests
npm run test:e2e

# Run specific browser
npm run test:e2e -- --project=chromium

# Run in headed mode (see browser)
npm run test:e2e -- --headed

# Run specific test file
npm run test:e2e -- tests/e2e/timer.spec.js

# Debug mode
npm run test:e2e -- --debug
```

## Unit Tests

Unit tests cover isolated functions from the application.

### Utility Functions (`tests/unit/utils.test.js`)

| Function | Description | Test Count |
|----------|-------------|------------|
| `escapeHtml()` | XSS prevention | 8 tests |
| `formatTime()` | Time formatting | 6 tests |
| `formatDate()` | Date formatting | 3 tests |
| `formatDuration()` | Duration formatting | 6 tests |
| `generateEntryId()` | ID generation | 3 tests |
| `generateDeviceId()` | Device ID generation | 3 tests |
| `getPointColor()` | Timing point colors | 4 tests |
| `t()` | Translation helper | 3 tests |

### Validation Functions (`tests/unit/validation.test.js`)

| Function | Description | Test Count |
|----------|-------------|------------|
| `isValidRaceId()` | Race ID validation | 15 tests |
| `isValidEntry()` | Entry object validation | 18 tests |
| `sanitizeString()` | String sanitization | 9 tests |
| `safeJsonParse()` | Safe JSON parsing | 8 tests |
| `checkDuplicate()` | Duplicate detection | 6 tests |

## API Tests

API tests verify the `/api/sync` endpoint behavior.

### GET /api/sync

- Returns empty entries for new race
- Returns existing entries for valid race
- Returns 400 for missing raceId
- Returns 400 for invalid raceId format
- Handles corrupted data gracefully

### POST /api/sync

- Creates new entry successfully
- Prevents duplicate entries
- Validates entry format
- Sanitizes device name
- Enforces max entries limit
- Sets CORS headers

### OPTIONS /api/sync

- Returns CORS preflight response

## E2E Tests

End-to-end tests verify complete user flows using Playwright.

### Timer View (`tests/e2e/timer.spec.js`)

- Clock display and updates
- Bib number input via number pad
- Timing point selection
- Recording timestamps
- Confirmation overlay
- Duplicate warnings
- Undo functionality
- Keyboard navigation
- Mobile touch interactions

### Results View (`tests/e2e/results.spec.js`)

- Results list display
- Search by bib number
- Filter by timing point
- Filter by status
- Edit entry
- Delete entry
- Multi-select mode
- CSV export
- JSON export

### Settings View (`tests/e2e/settings.spec.js`)

- GPS toggle
- Auto-increment toggle
- Haptic feedback toggle
- Sound feedback toggle
- Cloud sync toggle
- Race ID input
- Device name input
- Language toggle
- Backup/restore
- Toggle independence
- Keyboard accessibility

## UI Testing Strategy

### Recommended Approach: Playwright

We use Playwright for E2E testing because:

1. **Cross-browser support** - Chrome, Firefox, Safari, Mobile
2. **PWA support** - Service worker testing capability
3. **Network mocking** - API response simulation
4. **Visual regression** - Screenshot comparison
5. **Mobile emulation** - Touch and viewport testing

### Test Categories

#### 1. Functional Tests
Test user workflows and interactions:
```javascript
test('should record timestamp', async ({ page }) => {
  await page.click('#timestamp-btn');
  await expect(page.locator('.confirmation-overlay')).toBeVisible();
});
```

#### 2. Visual Regression Tests
Compare screenshots for UI consistency:
```javascript
test('should match screenshot', async ({ page }) => {
  await expect(page).toHaveScreenshot('timer-view.png');
});
```

#### 3. Accessibility Tests
Verify keyboard navigation and ARIA:
```javascript
test('should support keyboard', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});
```

#### 4. Mobile Tests
Test on mobile viewports:
```javascript
test.use({ viewport: { width: 375, height: 667 } });
test('should work on mobile', async ({ page }) => {
  await page.tap('#timestamp-btn');
});
```

### Browser Matrix

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | ✅ | ✅ (Pixel 5) |
| Firefox | ✅ | - |
| Safari | ✅ | ✅ (iPhone 12) |

## Writing New Tests

### Unit Test Template

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('MyFunction', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });

  it('should handle edge case', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### E2E Test Template

```javascript
import { test, expect } from '@playwright/test';

test.describe('Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should do something', async ({ page }) => {
    await page.click('#button');
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

### Mocking in Tests

```javascript
// Mock fetch
globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'test' })
  })
);

// Mock localStorage
localStorageMock.setItem('key', 'value');

// Mock in Playwright
await page.route('/api/*', route => {
  route.fulfill({ json: { entries: [] } });
});
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### Coverage Thresholds

| Category | Target | Current |
|----------|--------|---------|
| Statements | 80% | - |
| Branches | 75% | - |
| Functions | 80% | - |
| Lines | 80% | - |

## Troubleshooting

### Tests Failing Locally

1. **Clear cache**: `rm -rf node_modules && npm install`
2. **Update browsers**: `npx playwright install`
3. **Check Node version**: Requires Node 18+

### E2E Tests Timeout

1. Increase timeout in test: `test.setTimeout(60000)`
2. Check if dev server is running
3. Check network conditions

### Flaky Tests

1. Add explicit waits: `await page.waitForSelector('.element')`
2. Use `expect.poll()` for async assertions
3. Check for race conditions

### Mock Not Working

1. Ensure mock is set up before import
2. Check mock scope (global vs local)
3. Verify mock function is called

## Test Utilities

### Available Mocks (tests/setup.js)

- `localStorageMock` - localStorage simulation
- `geolocationMock` - GPS simulation
- `AudioContextMock` - Web Audio simulation
- `BroadcastChannelMock` - Inter-tab communication
- `FileReaderMock` - File import simulation

### Helper Functions

```javascript
import {
  createMockEntry,
  createMockSettings,
  waitFor,
  simulateClick,
  simulateKeydown
} from '../setup.js';

// Create mock data
const entry = createMockEntry({ bib: '042' });
const settings = createMockSettings({ sync: true });

// Wait for async
await waitFor(100);

// Simulate events
simulateClick(element);
simulateKeydown(element, 'Enter');
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
- [Web Test Runner](https://modern-web.dev/docs/test-runner/overview/)
