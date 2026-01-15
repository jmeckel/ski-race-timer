/**
 * E2E Tests - Offline/PWA Functionality
 *
 * Tests for offline capabilities, data persistence, and service worker
 */

import { test, expect } from '@playwright/test';

// Helper to add test entries
async function addTestEntries(page, count = 3) {
  for (let i = 1; i <= count; i++) {
    await page.click('#btn-clear');
    const bib = String(i).padStart(3, '0');
    for (const digit of bib) {
      await page.click(`[data-num="${digit}"]`);
    }
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);
  }
}

test.describe('Data Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');
  });

  test('should persist entries across page reload', async ({ page }) => {
    // Add entries
    await addTestEntries(page, 3);

    // Reload page
    await page.reload();
    await page.waitForSelector('.clock-time');

    // Check entries persisted
    await page.click('[data-view="results-view"]');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(3);
  });

  test('should persist entries across browser close', async ({ page, context }) => {
    // Add entries
    await addTestEntries(page, 2);

    // Close and reopen
    await page.close();
    const newPage = await context.newPage();
    await newPage.goto('/');
    await newPage.waitForSelector('.clock-time');

    // Check entries persisted
    await newPage.click('[data-view="results-view"]');
    const results = newPage.locator('.result-item');
    await expect(results).toHaveCount(2);
  });

  test('should persist settings across reload', async ({ page }) => {
    // Change a setting
    await page.click('[data-view="settings-view"]');

    // Toggle sync
    const syncToggle = page.locator('#toggle-sync');
    const initialState = await syncToggle.evaluate(el => el.classList.contains('on'));
    await syncToggle.click();

    // Reload
    await page.reload();
    await page.click('[data-view="settings-view"]');

    // Setting should persist
    const newState = await page.locator('#toggle-sync').evaluate(el => el.classList.contains('on'));
    expect(newState).toBe(!initialState);
  });

  test('should persist language setting', async ({ page }) => {
    // Toggle language
    await page.click('[data-view="settings-view"]');
    const langToggle = page.locator('#lang-toggle');
    const initialText = await langToggle.textContent();
    await langToggle.click();

    // Reload
    await page.reload();
    await page.click('[data-view="settings-view"]');

    // Language should persist
    const newText = await page.locator('#lang-toggle').textContent();
    expect(newText).not.toBe(initialText);
  });
});

test.describe('LocalStorage Operations', () => {
  test('should save entries to localStorage', async ({ page }) => {
    await page.goto('/');

    // Add entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Check localStorage
    const entries = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerEntries');
      return data ? JSON.parse(data) : [];
    });

    expect(entries.length).toBe(1);
    expect(entries[0].bib).toBe('001');
  });

  test('should save settings to localStorage', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');

    // Toggle a setting
    await page.click('#toggle-sync');

    // Check localStorage
    const settings = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerSettings');
      return data ? JSON.parse(data) : {};
    });

    expect(settings).toHaveProperty('sync');
  });

  test('should handle corrupted localStorage gracefully', async ({ page }) => {
    await page.goto('/');

    // Corrupt the entries data
    await page.evaluate(() => {
      localStorage.setItem('skiTimerEntries', 'invalid json{{{');
    });

    // Reload - should handle error gracefully
    await page.reload();
    await page.waitForSelector('.clock-time');

    // App should still work
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');

    // Should show confirmation (app recovered)
    await expect(page.locator('.confirmation-overlay')).toBeVisible();
  });

  test('should handle missing localStorage gracefully', async ({ page }) => {
    await page.goto('/');

    // Clear all storage
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Reload
    await page.reload();
    await page.waitForSelector('.clock-time');

    // App should still work with defaults
    await expect(page.locator('.clock-time')).toBeVisible();
    await expect(page.locator('#timestamp-btn')).toBeVisible();
  });
});

test.describe('Offline Functionality', () => {
  test('should display app when loaded', async ({ page }) => {
    await page.goto('/');

    // Main elements should be visible
    await expect(page.locator('.clock-time')).toBeVisible();
    await expect(page.locator('.bib-display')).toBeVisible();
    await expect(page.locator('#timestamp-btn')).toBeVisible();
  });

  test('should record entries without network', async ({ page, context }) => {
    await page.goto('/');

    // Go offline
    await context.setOffline(true);

    // Record entry
    await page.click('[data-num="5"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Should still work locally
    await page.click('[data-view="results-view"]');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(1);

    // Go back online
    await context.setOffline(false);
  });

  test('should navigate between views offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');

    // Go offline
    await context.setOffline(true);

    // Navigate through views - check view containers are visible
    await page.click('[data-view="results-view"]');
    await page.waitForTimeout(200);
    await expect(page.locator('#results-view')).toBeVisible({ timeout: 5000 });

    await page.click('[data-view="settings-view"]');
    await page.waitForTimeout(200);
    await expect(page.locator('#settings-view')).toBeVisible({ timeout: 5000 });

    await page.click('[data-view="timing-view"]');
    await page.waitForTimeout(200);
    await expect(page.locator('#timing-view')).toBeVisible({ timeout: 5000 });

    await context.setOffline(false);
  });

  test('should persist data recorded offline', async ({ page, context }) => {
    await page.goto('/');

    // Go offline
    await context.setOffline(true);

    // Record entries
    await addTestEntries(page, 2);

    // Go back online
    await context.setOffline(false);

    // Reload
    await page.reload();

    // Data should persist
    await page.click('[data-view="results-view"]');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(2);
  });
});

test.describe('Service Worker', () => {
  test('should register service worker', async ({ page }) => {
    await page.goto('/');

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
    await page.goto('/');
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
  test('should handle rapid entry recording', async ({ page }) => {
    await page.goto('/');

    // Rapidly add entries
    for (let i = 0; i < 10; i++) {
      await page.click('#timestamp-btn');
      await page.waitForTimeout(100); // Very short delay
    }

    // Wait for all to process
    await page.waitForTimeout(1000);

    // Check results
    await page.click('[data-view="results-view"]');
    const results = page.locator('.result-item');

    // Should have recorded all or most entries
    const count = await results.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('should handle large number of entries', async ({ page }) => {
    await page.goto('/');

    // Pre-populate with many entries via localStorage
    await page.evaluate(() => {
      const entries = [];
      for (let i = 1; i <= 100; i++) {
        entries.push({
          id: `entry-${i}`,
          bib: String(i).padStart(3, '0'),
          point: 'F',
          timestamp: Date.now() + i * 1000,
          status: 'ok'
        });
      }
      localStorage.setItem('skiTimerEntries', JSON.stringify(entries));
    });

    // Reload
    await page.reload();
    await page.click('[data-view="results-view"]');

    // Should display entries
    const results = page.locator('.result-item');
    const count = await results.count();
    expect(count).toBe(100);
  });

  test('should handle concurrent operations', async ({ page }) => {
    await page.goto('/');

    // Add entry while navigating
    await page.click('[data-num="1"]');
    await Promise.all([
      page.click('#timestamp-btn'),
      page.click('[data-view="results-view"]')
    ]);

    await page.waitForTimeout(1000);

    // App should still be functional
    await page.click('[data-view="timing-view"]');
    await expect(page.locator('.clock-time')).toBeVisible();
  });
});

test.describe('Data Recovery', () => {
  test('should recover from invalid entry data', async ({ page }) => {
    await page.goto('/');

    // Set invalid entry
    await page.evaluate(() => {
      localStorage.setItem('skiTimerEntries', JSON.stringify([
        { id: 'valid', bib: '001', point: 'F', timestamp: Date.now(), status: 'ok' },
        { invalid: 'entry' }, // Missing required fields
        { id: 'valid2', bib: '002', point: 'F', timestamp: Date.now(), status: 'ok' }
      ]));
    });

    // Reload
    await page.reload();
    await page.click('[data-view="results-view"]');

    // Should show valid entries (invalid filtered out)
    const results = page.locator('.result-item');
    const count = await results.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should initialize with defaults after clear', async ({ page }) => {
    await page.goto('/');

    // Clear all data
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Reload
    await page.reload();
    await page.waitForSelector('.clock-time');

    // Should start fresh with defaults
    await page.click('[data-view="settings-view"]');

    // Simple mode should be on (default)
    const simpleToggle = page.locator('#toggle-simple');
    await expect(simpleToggle).toHaveClass(/on/);
  });
});

test.describe('PWA Manifest', () => {
  test('should have valid manifest link', async ({ page }) => {
    await page.goto('/');

    const manifestLink = await page.evaluate(() => {
      const link = document.querySelector('link[rel="manifest"]');
      return link ? link.getAttribute('href') : null;
    });

    expect(manifestLink).toBeTruthy();
  });

  test('should load manifest successfully', async ({ page }) => {
    await page.goto('/');

    const manifestResponse = await page.request.get('/manifest.json');
    expect(manifestResponse.ok()).toBe(true);

    const manifest = await manifestResponse.json();
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('icons');
  });
});
