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
├── setup.js                          # Test setup, mocks, utilities
├── unit/
│   ├── utils.test.js                 # Utility function tests
│   ├── validation.test.js            # Validation function tests (JS)
│   ├── validation.test.ts            # Validation function tests (TS)
│   ├── validation-extended.test.ts   # Extended validation tests
│   ├── store.test.ts                 # State management and persistence tests
│   ├── store-edge-cases.test.ts      # Store edge case tests
│   ├── format.test.ts                # Format utility tests
│   ├── id.test.ts                    # ID generation tests
│   ├── version.test.ts               # Version management tests
│   ├── onboarding.test.ts            # Onboarding wizard tests
│   ├── app.test.ts                   # App initialization tests
│   ├── appEventListeners.test.ts     # App event listener tests
│   ├── appInitServices.test.ts       # App service initialization tests
│   ├── appModalHandlers.test.ts      # App modal handler tests
│   ├── appStateHandlers.test.ts      # App state handler tests
│   └── appUiUpdates.test.ts          # App UI update tests
├── api/
│   ├── sync.test.js                  # Sync API endpoint tests (JS)
│   ├── sync-handler.test.ts          # Sync handler tests (TS)
│   ├── faults-role.test.js           # Faults role-based access control tests
│   ├── faults-handler.test.ts        # Faults handler tests (TS)
│   ├── pin-hashing.test.js           # PBKDF2 PIN hashing and verification tests
│   ├── voice-auth.test.js            # Voice API fail-closed auth tests
│   ├── auth-token.test.js            # Auth token exchange tests (JS)
│   ├── auth-token-ts.test.ts         # Auth token tests (TS)
│   ├── admin-races.test.js           # Admin race management tests
│   ├── admin-pin.test.ts             # Admin PIN management tests
│   ├── admin-reset-pin.test.ts       # Admin PIN reset tests
│   ├── apiLogger.test.js             # API logger tests
│   ├── security-patterns.test.js     # Security pattern tests
│   ├── schemas.test.ts               # API schema validation tests
│   ├── redis.test.ts                 # Redis integration tests
│   └── validation.test.ts            # API validation tests
├── integration/
│   └── (future)                      # Integration tests
└── e2e/
    ├── helpers.js                    # Shared E2E test utilities
    ├── timer.spec.js                 # Timer view E2E tests
    ├── results.spec.js               # Results view E2E tests
    ├── settings.spec.js              # Settings view E2E tests
    ├── offline.spec.js               # Offline functionality E2E tests
    ├── race-management.spec.js       # Race management E2E tests
    ├── power-optimization.spec.js    # Battery power saver E2E tests
    ├── persistence-optimization.spec.js # Dirty-slice persistence E2E tests
    ├── security-hardening.spec.js    # CSP, PIN security E2E tests
    ├── accessibility.spec.js         # Accessibility and ARIA tests
    ├── i18n.spec.js                  # Internationalization tests
    ├── onboarding.spec.js            # Onboarding wizard E2E tests
    ├── gps.spec.js                   # GPS functionality E2E tests
    ├── export.spec.js                # Export functionality E2E tests
    ├── sync.spec.js                  # Cloud sync E2E tests
    ├── voice-note.spec.js            # Voice note E2E tests
    ├── visual-regression.spec.js     # Visual regression tests
    └── production.spec.js            # Production build verification tests
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

### Store (`tests/unit/store.test.ts`)

| Function | Description | Test Count |
|----------|-------------|------------|
| State management | State updates and subscriptions | 12+ tests |
| Persistence | Dirty-slice tracking, localStorage save | 6+ tests |
| Dirty-slice isolation | Entries don't trigger settings save and vice versa | 2 tests |

### Validation Functions (`tests/unit/validation.test.js`)

| Function | Description | Test Count |
|----------|-------------|------------|
| `isValidRaceId()` | Race ID validation | 15 tests |
| `isValidEntry()` | Entry object validation | 18 tests |
| `sanitizeString()` | String sanitization | 9 tests |
| `safeJsonParse()` | Safe JSON parsing | 8 tests |
| `checkDuplicate()` | Duplicate detection | 6 tests |

## API Tests

API tests verify the `/api/v1/*` endpoint behavior. All API endpoints use v1 versioning.

### GET /api/v1/sync

- Returns empty entries for new race
- Returns existing entries for valid race
- Returns 400 for missing raceId
- Returns 400 for invalid raceId format
- Handles corrupted data gracefully

### POST /api/v1/sync

- Creates new entry successfully
- Prevents duplicate entries
- Validates entry format
- Sanitizes device name
- Enforces max entries limit
- Sets CORS headers

### OPTIONS /api/v1/sync

- Returns CORS preflight response

### PIN Hashing (`tests/api/pin-hashing.test.js`)

Tests for PBKDF2 PIN hashing and verification.

| Test | Description |
|------|-------------|
| hashPin produces PBKDF2 format | Output contains `pbkdf2$` prefix with salt and hash |
| hashPin generates unique salts | Same PIN produces different hashes each time |
| verifyPin validates correct PIN | Correct PIN returns true |
| verifyPin rejects wrong PIN | Wrong PIN returns false |
| Legacy SHA-256 migration | Old SHA-256 hashes are still accepted for migration |
| Malformed hash handling | Returns false for invalid hash format |
| Empty PIN handling | Empty input handled gracefully |
| PIN upgrade path | Legacy hash verified, new PBKDF2 hash can replace it |

### Voice API Auth (`tests/api/voice-auth.test.js`)

Tests for fail-closed authentication on the voice API endpoint.

| Test | Description |
|------|-------------|
| Source code fail-closed pattern | `voice.js` denies access when Redis is unavailable |
| No skip-auth pattern | Source code does not contain patterns that skip auth |
| Auth required for requests | Unauthenticated requests return 401 |
| Valid token accepted | Authenticated requests proceed normally |

### Faults Role Validation (`tests/api/faults-role.test.js`)

Tests for role-based access control on the `/api/v1/faults` endpoint.

| Test | Description | Expected |
|------|-------------|----------|
| DELETE with timer role | User with timer role attempts to delete fault | 403 Forbidden |
| DELETE with gateJudge role | User with gateJudge role attempts to delete fault | 403 Forbidden |
| DELETE with chiefJudge role | User with chiefJudge role deletes fault | 200 OK |
| DELETE without auth | Unauthenticated request | 401 Unauthorized |
| DELETE with invalid token | Invalid JWT token | 401 Unauthorized |
| GET with timer role | Fetch faults with timer role | 200 OK |
| GET with gateJudge role | Fetch faults with gateJudge role | 200 OK |
| GET with chiefJudge role | Fetch faults with chiefJudge role | 200 OK |

**Key Security Principle**: Only `chiefJudge` role can delete faults. All other roles (timer, gateJudge) can read but not delete.

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

### Power Optimization (`tests/e2e/power-optimization.spec.js`)

- Battery API integration: `.power-saver` class on normal, medium, low, and critical battery levels
- Power saver not applied when charging (even at low battery)
- Dynamic battery level changes toggle power-saver in real time
- CSS animation disabling: breathe glow and snowflake spinner paused in power-saver mode
- Clock continues updating at low and critical battery (frame skipping)
- Timestamp recording works in power-saver mode
- Graceful degradation when Battery API is unavailable
- All views accessible without Battery API

### Persistence Optimization (`tests/e2e/persistence-optimization.spec.js`)

- Entries persist after recording timestamps
- Settings changes are independent from entries (dirty-slice isolation)
- Both entries and settings persist correctly
- Language changes persist independently
- Rapid settings changes do not cause data loss
- Selected run persists across settings changes

### Security Hardening (`tests/e2e/security-hardening.spec.js`)

- App loads without CSP `unsafe-inline` (no inline scripts)
- No JavaScript errors on initial load
- All views render without CSP violations
- Dynamic content rendering works without inline scripts
- No auto-authentication on first load (no default PIN)
- No default PIN stored automatically
- PIN status shows "not set" without pre-existing PIN
- PIN input uses numeric keypad (type=tel) with 4-digit limit
- Auth token not exposed in localStorage entries

### Accessibility (`tests/e2e/accessibility.spec.js`)

- ARIA labels on interactive elements
- Keyboard navigation between views
- Focus management in modals
- Screen reader compatibility

### Internationalization (`tests/e2e/i18n.spec.js`)

- Language switching between EN and DE
- Date and time formatting per locale
- All UI text translates correctly

### Onboarding (`tests/e2e/onboarding.spec.js`)

- Complete onboarding wizard flow
- Role selection (Timer, Gate Judge)
- Device name configuration
- Cloud sync setup
- Skip functionality

### GPS (`tests/e2e/gps.spec.js`)

- GPS toggle and permission handling
- Time synchronization display
- Graceful degradation without GPS

### Export (`tests/e2e/export.spec.js`)

- CSV export in Race Horology format
- JSON export
- Export with filters applied

### Sync (`tests/e2e/sync.spec.js`)

- Cloud sync initialization
- Race ID configuration
- Sync status indicators

### Voice Notes (`tests/e2e/voice-note.spec.js`)

- Voice recording in gate judge mode
- Note attachment to fault entries
- Manual text input fallback

### Visual Regression (`tests/e2e/visual-regression.spec.js`)

- Screenshot comparison for UI consistency
- Cross-browser visual checks

### Production (`tests/e2e/production.spec.js`)

- Production build verification
- Service worker registration
- PWA manifest validation

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

The app is mobile-first, so E2E tests run on mobile viewports only:

| Browser | Portrait | Landscape |
|---------|----------|-----------|
| Chrome (Pixel 5) | ✅ 393x851 | ✅ 851x393 |
| Safari (iPhone 13) | ✅ 390x844 | ✅ 844x390 |

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
await page.route('/api/v1/*', route => {
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
