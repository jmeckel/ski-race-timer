/**
 * E2E Tests - Export Functionality
 *
 * Tests for CSV export and Race Horology format
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { setupPage, setupPageFullMode, clickToggle, isToggleOn, navigateTo, waitForConfirmationToHide } from './helpers.js';

// Helper to add test entries
async function addTestEntries(page, count = 3) {
  for (let i = 1; i <= count; i++) {
    // Wait for clear button to be ready (not covered by overlay)
    await page.waitForSelector('[data-action="clear"]', { state: 'visible' });
    await page.click('[data-action="clear"]');
    const bib = String(i).padStart(3, '0');
    for (const digit of bib) {
      await page.click(`[data-num="${digit}"]`);
    }
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);
    // Small buffer after confirmation to ensure app is ready
    await page.waitForTimeout(100);
  }
}

test.describe('Export - Race Horology CSV', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);

    // Add test entries
    await addTestEntries(page, 3);

    // Navigate to Results
    await navigateTo(page, 'results');
  });

  test('should export Race Horology CSV file', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

    await page.click('#export-btn');

    const download = await downloadPromise;
    // Filename format is: {raceId}_{date}.csv (e.g., race_2026-01-20.csv)
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('should include correct filename with date', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

    await page.click('#export-btn');

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    // Filename format: {raceId}_{YYYY-MM-DD}.csv
    expect(filename).toMatch(/.*_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('should export CSV with correct content', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should have content
      expect(content.length).toBeGreaterThan(0);

      // Should have line breaks (multiple entries)
      expect(content.split('\n').length).toBeGreaterThan(1);
    }
  });

  test('should export entries with bib numbers', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should contain our test bib numbers
      expect(content).toContain('001');
      expect(content).toContain('002');
      expect(content).toContain('003');
    }
  });

  test('should export timestamps in correct format', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should contain time format (HH:MM:SS or similar)
      expect(content).toMatch(/\d{2}:\d{2}:\d{2}/);
    }
  });

  test('should export timestamps in Race Horology format (HH:MM:SS,ss)', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should contain time format HH:MM:SS,ss (comma decimal separator, European format)
      expect(content).toMatch(/\d{2}:\d{2}:\d{2},\d{2}/);
    }
  });

  test('should export timing point as FT for Finish entries', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Default entries use Finish point, should export as FT
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
    await page.waitForSelector('.clock-time', { timeout: 5000 });

    await navigateTo(page, 'results');

    // Export button should still work or be disabled
    const exportBtn = page.locator('#export-btn');
    const isVisible = await exportBtn.isVisible();

    if (isVisible) {
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      await exportBtn.click();
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
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Go to results and check entry exists
    await navigateTo(page, 'results');

    // Check that result items are visible
    const resultItems = page.locator('.result-item');
    await expect(resultItems.first()).toBeVisible();

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');

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
  test.beforeEach(async ({ page }) => {
    await setupPageFullMode(page);
  });

  test('should export entries with run number', async ({ page }) => {
    // Add Run 1 entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');

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
    await page.click('.run-selector [data-run="2"]');
    await page.click('[data-num="2"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');

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
    await page.click('.run-selector [data-run="1"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Add Run 2 entry
    await page.click('[data-action="clear"]');
    await page.click('.run-selector [data-run="2"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');

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
  test.beforeEach(async ({ page }) => {
    await setupPageFullMode(page);
  });

  test('should export entries with different timing points', async ({ page }) => {
    // Add Start entry
    await page.click('[data-point="S"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Add Finish entry
    await page.click('[data-action="clear"]');
    await page.click('[data-point="F"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should have both timing points represented
      expect(content.length).toBeGreaterThan(0);
      expect(content.split('\n').length).toBeGreaterThanOrEqual(2);
    }
  });

  test('should export Start timing point as ST (Race Horology format)', async ({ page }) => {
    // Add Start entry
    await page.click('[data-point="S"]');
    await page.click('[data-num="5"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Start timing point should be exported as ST
      expect(content).toContain('ST');
    }
  });

  test('should export Finish timing point as FT (Race Horology format)', async ({ page }) => {
    // Add Finish entry
    await page.click('[data-point="F"]');
    await page.click('[data-num="7"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Finish timing point should be exported as FT
      expect(content).toContain('FT');
    }
  });

  test('should export both ST and FT in same file', async ({ page }) => {
    // Add Start entry
    await page.click('[data-point="S"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Add Finish entry
    await page.click('[data-action="clear"]');
    await page.click('[data-point="F"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Export
    await navigateTo(page, 'results');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Both timing points should be represented with Race Horology format
      expect(content).toContain('ST');
      expect(content).toContain('FT');
    }
  });
});
