/**
 * E2E Tests - Offline/PWA Functionality
 *
 * Tests for offline capabilities, data persistence, and service worker
 */

import { test, expect } from '@playwright/test';
import { setupPage, clickToggle, navigateTo, waitForConfirmationToHide } from './helpers.js';

// Helper to add test entries via radial dial
async function addTestEntries(page, count = 3) {
  for (let i = 1; i <= count; i++) {
    await page.click('#radial-clear-btn');
    const bib = String(i).padStart(3, '0');
    for (const digit of bib) {
      await page.click(`.dial-number[data-num="${digit}"]`);
    }
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);
  }
}

test.describe('Data Persistence', () => {
  // Tests with multiple entries need more time in CI
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should persist entries across page reload', async ({ page }) => {
    // Add entries
    await addTestEntries(page, 2);

    // Reload page
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });

    // Check entries persisted via stats counter
    await navigateTo(page, 'results');
    await expect(page.locator('#stat-total')).toHaveText('2');
  });

  test('should persist entries across browser close', async ({ page, context }) => {
    // Add entries
    await addTestEntries(page, 2);

    // Close and reopen
    await page.close();
    const newPage = await context.newPage();
    await setupPage(newPage);

    // Check entries persisted via stats counter
    await navigateTo(newPage, 'results');
    await expect(newPage.locator('#stat-total')).toHaveText('2');
  });

});

test.describe('LocalStorage Operations', () => {
  test('should save entries to localStorage', async ({ page }) => {
    await setupPage(page);

    // Add entry via radial dial
    await page.click('.dial-number[data-num="1"]');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Check localStorage
    const entries = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerEntries');
      return data ? JSON.parse(data) : [];
    });

    expect(entries.length).toBe(1);
    expect(entries[0].bib).toBe('001');
  });

  test('should save settings to localStorage', async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'settings');

    // Toggle sync (visible in simple mode)
    await clickToggle(page, '#sync-toggle');

    // Wait for save (app debounces saves)
    await page.waitForTimeout(500);

    // Check localStorage
    const settings = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerSettings');
      return data ? JSON.parse(data) : {};
    });

    // Settings object should exist with some property
    expect(Object.keys(settings).length).toBeGreaterThan(0);
  });

  test('should handle corrupted localStorage gracefully', async ({ page }) => {
    await setupPage(page);

    // Corrupt the entries data
    await page.evaluate(() => {
      localStorage.setItem('skiTimerEntries', 'invalid json{{{');
    });

    // Reload - should handle error gracefully
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });

    // App should still work
    await page.click('.dial-number[data-num="1"]');
    await page.click('#radial-time-btn');

    // Should show confirmation (app recovered)
    await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(/show/);
  });

  test('should handle missing localStorage gracefully', async ({ page }) => {
    await setupPage(page);

    // Clear all storage
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Reload
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });

    // App should still work with defaults
    await expect(page.locator('#radial-time-hm')).toBeVisible();
    await expect(page.locator('#radial-time-btn')).toBeVisible();
  });
});

test.describe('Offline Functionality', () => {
  // Tests with multiple entries need more time in CI
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should display app when loaded', async ({ page }) => {
    // Main elements should be visible (radial mode)
    await expect(page.locator('#radial-time-hm')).toBeVisible();
    await expect(page.locator('#radial-bib-value')).toBeVisible();
    await expect(page.locator('#radial-time-btn')).toBeVisible();
  });

  test('should record entries without network', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);

    // Record entry via radial dial
    await page.click('.dial-number[data-num="5"]');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Should still work locally
    await navigateTo(page, 'results');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(1);

    // Go back online
    await context.setOffline(false);
  });

  test('should navigate between views offline', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);

    // Navigate through views - check view containers are visible
    await navigateTo(page, 'results');
    await page.waitForTimeout(200);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 5000 });

    await navigateTo(page, 'settings');
    await page.waitForTimeout(200);
    await expect(page.locator('.settings-view')).toBeVisible({ timeout: 5000 });

    await navigateTo(page, 'timer');
    await page.waitForTimeout(200);
    await expect(page.locator('.timer-view')).toBeVisible({ timeout: 5000 });

    await context.setOffline(false);
  });

  test('should persist data recorded offline', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);

    // Record entries
    await addTestEntries(page, 2);

    // Go back online
    await context.setOffline(false);

    // Reload
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });

    // Data should persist
    await navigateTo(page, 'results');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(2);
  });
});

test.describe('Service Worker', () => {
  // In dev mode, service workers aren't registered by VitePWA
  // We test browser support and PWA setup instead of actual registration
  const isDevMode = !process.env.PROD_TESTS;

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should register service worker', async ({ page }) => {
    // Wait for potential service worker registration
    await page.waitForTimeout(1000);

    const result = await page.evaluate(async () => {
      // Check if Service Worker API is supported
      const hasSupport = 'serviceWorker' in navigator;
      if (!hasSupport) {
        return { hasSupport: false, registered: false };
      }

      const registrations = await navigator.serviceWorker.getRegistrations();
      return {
        hasSupport: true,
        registered: registrations.length > 0
      };
    });

    // Browser must support Service Workers
    expect(result.hasSupport).toBe(true);

    if (isDevMode) {
      // In dev mode, SW may not be registered - just verify API support
      // The actual registration is tested in production builds
    } else {
      // In production, SW should be registered
      expect(result.registered).toBe(true);
    }
  });

  test('should cache essential resources', async ({ page }) => {
    await page.waitForTimeout(1000);

    const result = await page.evaluate(async () => {
      // Check if Cache API is supported
      const hasSupport = 'caches' in window;
      if (!hasSupport) {
        return { hasSupport: false, hasCaches: false };
      }

      const cacheNames = await caches.keys();
      return {
        hasSupport: true,
        hasCaches: cacheNames.length > 0
      };
    });

    // Browser must support Cache API
    expect(result.hasSupport).toBe(true);

    if (isDevMode) {
      // In dev mode, caches may not exist - just verify API support
      // The actual caching is tested in production builds
    } else {
      // In production, caches should exist
      expect(result.hasCaches).toBe(true);
    }
  });
});

test.describe('Edge Cases', () => {
  // Tests with multiple entries need more time in CI
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should handle rapid entry recording', async ({ page }) => {
    // Record multiple entries quickly (5 entries is sufficient to test)
    for (let i = 0; i < 5; i++) {
      await page.click('#radial-time-btn');
      // Wait for confirmation overlay to hide before next entry
      await waitForConfirmationToHide(page);
    }

    // Check results - all entries are grouped since they have no bib
    await navigateTo(page, 'results');

    // Check total count in stats display (more reliable than counting DOM elements)
    const totalStat = page.locator('#stat-total');
    await expect(totalStat).toHaveText('5');
  });

  test('should handle concurrent operations', async ({ page }) => {
    // Add entry while navigating
    await page.click('.dial-number[data-num="1"]');
    const timestampButton = page.locator('#radial-time-btn');
    await expect(timestampButton).toBeVisible();
    await Promise.all([
      timestampButton.click({ force: true }),
      page.click('[data-view="results"]')
    ]);

    await page.waitForTimeout(1000);

    // App should still be functional
    await navigateTo(page, 'timer');
    await expect(page.locator('#radial-time-hm')).toBeVisible();
  });
});

test.describe('Data Recovery', () => {
  test('should initialize with defaults after clear', async ({ page }) => {
    await setupPage(page);

    // Clear all data
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Reload
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });

    // Should start fresh with defaults
    await navigateTo(page, 'settings');

    // Normal mode should be default (GPS toggle visible in Advanced Settings)
    const gpsToggleLabel = page.locator('label:has(#gps-toggle)');
    await expect(gpsToggleLabel).toBeVisible();
  });
});

test.describe('PWA Manifest', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should have valid manifest link', async ({ page }) => {
    const manifestLink = await page.evaluate(() => {
      const link = document.querySelector('link[rel="manifest"]');
      return link ? link.getAttribute('href') : null;
    });

    expect(manifestLink).toBeTruthy();
  });

  test('should load manifest successfully', async ({ page }) => {
    const manifestResponse = await page.request.get('/manifest.json');
    expect(manifestResponse.ok()).toBe(true);

    const manifest = await manifestResponse.json();
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('icons');
  });
});
