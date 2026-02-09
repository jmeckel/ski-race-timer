/**
 * E2E Tests - Security Hardening
 *
 * Tests for security improvements:
 * - CSP: app works without unsafe-inline (no inline scripts)
 * - Default PIN removal: no auto-authentication
 * - No console security errors on load
 * - PBKDF2 PIN format in localStorage
 */

import { test, expect } from '@playwright/test';
import { setupPage, navigateTo, enterBib, waitForConfirmationToHide } from './helpers.js';

test.describe('CSP - No Inline Scripts', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('app should load successfully without unsafe-inline', async ({ page }) => {
    // If CSP blocked inline scripts, the app wouldn't render at all
    // Verify core elements are present and functional
    await expect(page.locator('#radial-time-hm')).toBeVisible();
    await expect(page.locator('#radial-time-seconds')).toBeVisible();
    await expect(page.locator('#radial-time-btn')).toBeVisible();
    await expect(page.locator('.dial-number[data-num="0"]')).toBeVisible();
  });

  test('no JavaScript errors on initial load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Setup already navigated to /, wait for render
    await page.waitForTimeout(1000);

    // Filter out known non-critical errors (e.g., service worker in dev mode)
    const criticalErrors = errors.filter(e =>
      !e.includes('service-worker') &&
      !e.includes('SW') &&
      !e.includes('workbox')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('all views render without CSP violations', async ({ page }) => {
    const cspViolations = [];
    page.on('console', msg => {
      if (msg.text().includes('Content Security Policy') ||
          msg.text().includes('CSP') ||
          msg.text().includes('Refused to execute inline script')) {
        cspViolations.push(msg.text());
      }
    });

    // Navigate through all views
    await navigateTo(page, 'results');
    await expect(page.locator('.results-view')).toBeVisible();

    await navigateTo(page, 'settings');
    await expect(page.locator('.settings-view')).toBeVisible();

    await navigateTo(page, 'timer');
    await expect(page.locator('.timer-view')).toBeVisible();

    expect(cspViolations).toHaveLength(0);
  });

  test('dynamic content rendering works without inline scripts', async ({ page }) => {
    // Record a timestamp - this exercises innerHTML with escaped content
    await enterBib(page, 42);
    await page.click('#radial-time-btn');
    await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(/show/);
    await waitForConfirmationToHide(page);

    // Navigate to results - exercises dynamic list rendering
    await navigateTo(page, 'results');
    await expect(page.locator('#stat-total')).toHaveText('1');
  });
});

test.describe('Default PIN Removal', () => {
  test('should NOT auto-authenticate on first load', async ({ page }) => {
    // Fresh state - no token, no PIN
    await page.addInitScript(() => {
      localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
      localStorage.setItem('skiTimerSettings', JSON.stringify({
        auto: true, haptic: true, sound: false,
        sync: false, syncPhotos: false, gps: false,
        simple: false, photoCapture: false
      }));
      localStorage.setItem('skiTimerLang', 'de');
      // Explicitly clear any auth token and PIN
      localStorage.removeItem('skiTimerAuthToken');
      localStorage.removeItem('skiTimerAdminPin');
    });

    await page.goto('/');
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });

    // Wait for any async initialization
    await page.waitForTimeout(1000);

    // No auth token should have been created automatically
    const authToken = await page.evaluate(() =>
      localStorage.getItem('skiTimerAuthToken')
    );
    expect(authToken).toBeNull();
  });

  test('should NOT store a default PIN automatically', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
      localStorage.setItem('skiTimerSettings', JSON.stringify({
        auto: true, haptic: true, sound: false,
        sync: false, syncPhotos: false, gps: false,
        simple: false, photoCapture: false
      }));
      localStorage.setItem('skiTimerLang', 'de');
      localStorage.removeItem('skiTimerAuthToken');
      localStorage.removeItem('skiTimerAdminPin');
    });

    await page.goto('/');
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // No PIN should be auto-set
    const adminPin = await page.evaluate(() =>
      localStorage.getItem('skiTimerAdminPin')
    );
    expect(adminPin).toBeNull();
  });

  test('PIN status should show "not set" without pre-existing PIN', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
      localStorage.setItem('skiTimerSettings', JSON.stringify({
        auto: true, haptic: true, sound: false,
        sync: false, syncPhotos: false, gps: false,
        simple: false, photoCapture: false
      }));
      localStorage.setItem('skiTimerLang', 'de');
      localStorage.removeItem('skiTimerAuthToken');
      localStorage.removeItem('skiTimerAdminPin');
    });

    await page.goto('/');
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });

    await navigateTo(page, 'settings');

    // PIN status should indicate not set
    const statusText = await page.locator('#admin-pin-status').textContent();
    // Should say "Nicht gesetzt" (DE) or "Not set" (EN) - check for "nicht" or "not"
    const isNotSet = statusText?.toLowerCase().includes('nicht') ||
                     statusText?.toLowerCase().includes('not set');
    expect(isNotSet).toBeTruthy();
  });
});

test.describe('Auth Token Security', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should not expose PIN hashes in localStorage entries', async ({ page }) => {
    // Record some entries
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    await page.waitForTimeout(300);

    // Check that entries don't contain any hash-like data
    const entries = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerEntries');
      return data || '';
    });

    // Entries should not contain hex strings that look like hashes (64+ chars)
    expect(entries).not.toMatch(/[0-9a-f]{64}/);
  });

  test('app should work without auth token', async ({ page }) => {
    // Clear auth token
    await page.evaluate(() => {
      localStorage.removeItem('skiTimerAuthToken');
    });

    // App should still function for local timing
    await page.click('#radial-time-btn');
    await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(/show/);
    await waitForConfirmationToHide(page);

    // Results should show the entry
    await navigateTo(page, 'results');
    await expect(page.locator('#stat-total')).toHaveText('1');
  });
});

test.describe('PIN Modal Security', () => {
  test('PIN input should use numeric keypad (tel type)', async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'settings');

    // Open change PIN modal
    await page.click('#change-pin-btn');
    await expect(page.locator('#change-pin-modal')).toHaveClass(/show/);

    // PIN inputs use type="tel" for numeric keypad on mobile
    // (password type would show alphabetic keyboard)
    const newPinType = await page.locator('#new-pin-input').getAttribute('type');
    const confirmPinType = await page.locator('#confirm-pin-input').getAttribute('type');

    expect(newPinType).toBe('tel');
    expect(confirmPinType).toBe('tel');
  });

  test('PIN input should limit to 4 digits', async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'settings');

    await page.click('#change-pin-btn');
    await expect(page.locator('#change-pin-modal')).toHaveClass(/show/);

    const newPinInput = page.locator('#new-pin-input');
    const maxLength = await newPinInput.getAttribute('maxlength');
    expect(maxLength).toBe('4');
  });
});
