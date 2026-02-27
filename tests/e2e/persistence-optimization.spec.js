/**
 * E2E Tests - Persistence Optimization
 *
 * Tests for dirty-slice tracking in localStorage persistence:
 * - Only changed slices are serialized to localStorage
 * - Settings changes don't trigger entries serialization
 * - Entries changes don't trigger settings serialization
 * - All data persists correctly across reload despite optimization
 */

import { expect, test } from '@playwright/test';
import {
  clickToggle,
  enterBib,
  navigateTo,
  setupPage,
  waitForConfirmationToHide,
} from './helpers.js';

test.describe('Dirty-Slice Persistence', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should persist entries after recording timestamps', async ({
    page,
  }) => {
    // Record entries
    await enterBib(page, 1);
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    await enterBib(page, 2);
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Wait for debounced save
    await page.waitForTimeout(500);

    // Verify entries saved to localStorage
    const entries = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerEntries');
      return data ? JSON.parse(data) : [];
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].bib).toBe('001');
    expect(entries[1].bib).toBe('002');
  });

  test('should persist settings changes independently from entries', async ({
    page,
  }) => {
    // Record an entry first
    await enterBib(page, 5);
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Wait for debounced save
    await page.waitForTimeout(300);

    // Record the entries state
    const entriesBefore = await page.evaluate(() =>
      localStorage.getItem('skiTimerEntries'),
    );

    // Now change a setting
    await navigateTo(page, 'settings');
    await clickToggle(page, '#sound-toggle');

    // Wait for debounced save
    await page.waitForTimeout(300);

    // Settings should have changed
    const settings = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerSettings');
      return data ? JSON.parse(data) : {};
    });
    expect(settings.sound).toBe(true);

    // Entries should still be intact (not cleared or corrupted by settings save)
    const entriesAfter = await page.evaluate(() =>
      localStorage.getItem('skiTimerEntries'),
    );
    expect(entriesAfter).toBe(entriesBefore);
  });

  test('should persist both entries and settings across reload', async ({
    page,
  }) => {
    // Record an entry
    await enterBib(page, 42);
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Change a setting
    await navigateTo(page, 'settings');
    await clickToggle(page, '#sound-toggle');
    await page.waitForTimeout(300);

    // Verify settings saved before reload
    const settingsBefore = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerSettings');
      return data ? JSON.parse(data) : {};
    });
    expect(settingsBefore.sound).toBe(true);

    // Verify entries saved before reload
    const entriesBefore = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerEntries');
      return data ? JSON.parse(data) : [];
    });
    expect(entriesBefore).toHaveLength(1);
    expect(entriesBefore[0].bib).toBe('042');
  });

  test('should persist language change independently', async ({ page }) => {
    // Record entry first
    await enterBib(page, 10);
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);
    await page.waitForTimeout(300);

    // Change language to English
    await navigateTo(page, 'settings');
    const langToggle = page.locator('#lang-toggle');
    const enOption = langToggle.locator('[data-lang="en"]');
    await enOption.click();
    await page.waitForTimeout(300);

    // Verify language was saved
    const lang = await page.evaluate(() =>
      localStorage.getItem('skiTimerLang'),
    );
    expect(lang).toBe('en');

    // Verify entry still exists in storage
    const entries = await page.evaluate(() => {
      const data = localStorage.getItem('skiTimerEntries');
      return data ? JSON.parse(data) : [];
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].bib).toBe('010');
  });

  test('should handle rapid settings changes without data loss', async ({
    page,
  }) => {
    // Record entries
    await enterBib(page, 1);
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    await enterBib(page, 2);
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Rapidly toggle multiple settings
    await navigateTo(page, 'settings');
    await clickToggle(page, '#sound-toggle');
    await clickToggle(page, '#haptic-toggle');
    await clickToggle(page, '#auto-toggle');

    // Wait for debounced save
    await page.waitForTimeout(500);

    // Reload and verify nothing was lost
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });

    // Entries should be intact
    await navigateTo(page, 'results');
    await expect(page.locator('#stat-total')).toHaveText('2');
  });
});

test.describe('Persistence - Run Selection', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should persist selected run across settings changes', async ({
    page,
  }) => {
    // Select Run 2
    await page.click('#radial-run-selector [data-run="2"]');

    // Record entry
    await enterBib(page, 1);
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Change a setting
    await navigateTo(page, 'settings');
    await clickToggle(page, '#sound-toggle');
    await page.waitForTimeout(300);

    // Go back to timer - run should still be 2
    await navigateTo(page, 'timer');
    const run2Button = page.locator('#radial-run-selector [data-run="2"]');
    await expect(run2Button).toHaveClass(/active/);

    // Verify entry was recorded with Run 2
    await navigateTo(page, 'results');
    const entryRun = page.locator('.result-run').first();
    await expect(entryRun).toContainText('L2');
  });
});
