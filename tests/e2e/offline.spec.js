/**
 * E2E Tests - Offline/PWA Functionality
 *
 * Tests for offline capabilities, data persistence, and service worker
 */

import { test, expect } from '@playwright/test';
import { setupPage, clickToggle, navigateTo, waitForConfirmationToHide } from './helpers.js';

// Helper to add test entries
async function addTestEntries(page, count = 3) {
  for (let i = 1; i <= count; i++) {
    await page.click('[data-action="clear"]');
    const bib = String(i).padStart(3, '0');
    for (const digit of bib) {
      await page.click(`[data-num="${digit}"]`);
    }
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);
  }
}

test.describe('Data Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should persist entries across page reload', async ({ page }) => {
    // Add entries
    await addTestEntries(page, 3);

    // Reload page
    await page.reload();
    await page.waitForSelector('.clock-time', { timeout: 5000 });

    // Check entries persisted
    await navigateTo(page, 'results');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(3);
  });

  test('should persist entries across browser close', async ({ page, context }) => {
    // Add entries
    await addTestEntries(page, 2);

    // Close and reopen
    await page.close();
    const newPage = await context.newPage();
    await setupPage(newPage);

    // Check entries persisted
    await navigateTo(newPage, 'results');
    const results = newPage.locator('.result-item');
    await expect(results).toHaveCount(2);
  });

});

test.describe('LocalStorage Operations', () => {
  test('should save entries to localStorage', async ({ page }) => {
    await setupPage(page);

    // Add entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
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
    await page.waitForSelector('.clock-time', { timeout: 5000 });

    // App should still work
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');

    // Should show confirmation (app recovered)
    await expect(page.locator('.confirmation-overlay')).toBeVisible();
  });

  test('should handle missing localStorage gracefully', async ({ page }) => {
    await setupPage(page);

    // Clear all storage
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Reload
    await page.reload();
    await page.waitForSelector('.clock-time', { timeout: 5000 });

    // App should still work with defaults
    await expect(page.locator('.clock-time')).toBeVisible();
    await expect(page.locator('#timestamp-btn')).toBeVisible();
  });
});

test.describe('Offline Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should display app when loaded', async ({ page }) => {
    // Main elements should be visible
    await expect(page.locator('.clock-time')).toBeVisible();
    await expect(page.locator('.bib-display')).toBeVisible();
    await expect(page.locator('#timestamp-btn')).toBeVisible();
  });

  test('should record entries without network', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);

    // Record entry
    await page.click('[data-num="5"]');
    await page.click('#timestamp-btn');
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
    await page.waitForSelector('.clock-time', { timeout: 5000 });

    // Data should persist
    await navigateTo(page, 'results');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(2);
  });
});

test.describe('Service Worker', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should register service worker', async ({ page }) => {
    // Wait for service worker registration
    await page.waitForTimeout(1000);

    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.length > 0;
      }
      return false;
    });

    expect(swRegistered).toBe(true);
  });

  test('should cache essential resources', async ({ page }) => {
    await page.waitForTimeout(1000);

    // Check if caches exist
    const hasCaches = await page.evaluate(async () => {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        return cacheNames.length > 0;
      }
      return false;
    });

    expect(hasCaches).toBe(true);
  });
});

test.describe('Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should handle rapid entry recording', async ({ page }) => {
    // Record multiple entries quickly (5 entries is sufficient to test)
    for (let i = 0; i < 5; i++) {
      await page.click('#timestamp-btn');
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
    await page.click('[data-num="1"]');
    const timestampButton = page.locator('#timestamp-btn');
    await expect(timestampButton).toBeVisible();
    await Promise.all([
      timestampButton.click({ force: true }),
      page.click('[data-view="results"]')
    ]);

    await page.waitForTimeout(1000);

    // App should still be functional
    await navigateTo(page, 'timer');
    await expect(page.locator('.clock-time')).toBeVisible();
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
    await page.waitForSelector('.clock-time', { timeout: 5000 });

    // Should start fresh with defaults
    await navigateTo(page, 'settings');

    // Normal mode should be default (GPS section visible)
    const gpsSection = page.locator('#gps-section');
    await expect(gpsSection).toBeVisible();
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
