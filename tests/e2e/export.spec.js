/**
 * E2E Tests - Export Functionality
 *
 * Tests for CSV export and Race Horology format
 */

import * as fs from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  addTestEntries,
  dismissToasts,
  navigateTo,
  setupPage,
  waitForConfirmationToHide,
} from './helpers.js';

test.describe('Export - Race Horology CSV', () => {
  // Export tests need more time due to multiple entry recording in beforeEach
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);

    // Add test entries (reduced to 2 for faster CI)
    await addTestEntries(page, 2);

    // Navigate to Results
    await navigateTo(page, 'results');
  });

  test('should export CSV with correct filename format', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

    await dismissToasts(page);
    await page.click('#quick-export-btn');

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    // Filename: {raceId}_{YYYY-MM-DD}.csv
    expect(filename).toMatch(/\.csv$/);
    expect(filename).toMatch(/.*_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('should export Race Horology CSV with correct content', async ({
    page,
  }) => {
    const downloadPromise = page.waitForEvent('download');

    await dismissToasts(page);
    await page.click('#quick-export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should have multiple lines (header + entries)
      expect(content.split('\n').length).toBeGreaterThan(1);

      // Should contain our test bib numbers
      expect(content).toContain('001');
      expect(content).toContain('002');

      // Timestamps in Race Horology format: HH:MM:SS,ss (comma decimal, European)
      expect(content).toMatch(/\d{2}:\d{2}:\d{2},\d{2}/);

      // Default entries use Finish point, exported as FT
      expect(content).toContain('FT');
    }
  });
});

test.describe('Export - Edge Cases', () => {
  test('should export empty results gracefully', async ({ page }) => {
    await setupPage(page);

    // Clear any existing data
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });

    await navigateTo(page, 'results');

    // Wait for any toast notifications to disappear
    await page
      .waitForFunction(
        () => {
          const toast = document.querySelector('.toast');
          return !toast || !toast.classList.contains('show');
        },
        { timeout: 5000 },
      )
      .catch(() => {});

    // Export button should still work or be disabled
    const exportBtn = page.locator('#quick-export-btn');
    const isVisible = await exportBtn.isVisible();

    if (isVisible) {
      const downloadPromise = page
        .waitForEvent('download', { timeout: 5000 })
        .catch(() => null);
      await exportBtn.click({ force: true });
      const download = await downloadPromise;

      // Either no download (disabled) or empty file
      if (download) {
        const downloadPath = await download.path();
        if (downloadPath) {
          const content = fs.readFileSync(downloadPath, 'utf-8');
          // Should be minimal content for empty export
          expect(content.length).toBeLessThan(100);
        }
      }
    }
  });

  test('should export entries with special status', async ({ page }) => {
    await setupPage(page);

    // Add entry
    await page.keyboard.press('1');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Go to results and check entry exists
    await navigateTo(page, 'results');

    // Check that result items are visible
    const resultItems = page.locator('.result-item');
    await expect(resultItems.first()).toBeVisible();

    // Export
    const downloadPromise = page.waitForEvent('download');
    await dismissToasts(page);
    await page.click('#quick-export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');
      // Entries should be included
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Export - Multiple Runs', () => {
  // Tests with multiple entries need more time in CI
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should export entries with run number', async ({ page }) => {
    // Add Run 1 entry
    await page.keyboard.press('1');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await dismissToasts(page);
    await page.click('#quick-export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // CSV should have Lauf column header
      expect(content).toContain('Lauf');
      // Should have ;1; for Run 1 (between bib and timing point)
      expect(content).toMatch(/;1;/);
    }
  });

  test('should export Run 2 entries correctly', async ({ page }) => {
    // Select Run 2
    await page.click('#radial-run-selector [data-run="2"]');
    await page.keyboard.press('2');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await dismissToasts(page);
    await page.click('#quick-export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should have ;2; for Run 2
      expect(content).toMatch(/;2;/);
    }
  });

  test('should export both Run 1 and Run 2 entries', async ({ page }) => {
    // Add Run 1 entry
    await page.click('#radial-run-selector [data-run="1"]');
    await page.keyboard.press('1');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Add Run 2 entry
    await page.keyboard.press('Delete');
    await page.click('#radial-run-selector [data-run="2"]');
    await page.keyboard.press('1');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await dismissToasts(page);
    await page.click('#quick-export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should have both ;1; and ;2; for different runs
      expect(content).toMatch(/;1;/);
      expect(content).toMatch(/;2;/);
    }
  });
});

test.describe('Export - Multiple Timing Points', () => {
  // Tests with multiple entries need more time in CI
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should export both ST and FT timing points in Race Horology format', async ({
    page,
  }) => {
    // Add Start entry
    await page.click('.radial-point-btn[data-point="S"]');
    await page.keyboard.press('1');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Add Finish entry
    await dismissToasts(page);
    await page.keyboard.press('Delete');
    await page.click('.radial-point-btn[data-point="F"]');
    await page.keyboard.press('1');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await dismissToasts(page);
    await page.click('#quick-export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Both timing points: ST (Start) and FT (Finish) in Race Horology format
      expect(content.split('\n').length).toBeGreaterThanOrEqual(2);
      expect(content).toContain('ST');
      expect(content).toContain('FT');
    }
  });
});
