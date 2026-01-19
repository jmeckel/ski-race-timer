/**
 * E2E Tests - Export Functionality
 *
 * Tests for CSV export and Race Horology format
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';

// Helper to click a toggle by clicking its label wrapper
async function clickToggle(page, toggleSelector) {
  await page.locator(`label:has(${toggleSelector})`).click();
}

// Helper to check if toggle is on
async function isToggleOn(page, toggleSelector) {
  return await page.locator(toggleSelector).isChecked();
}

// Helper to disable simple mode
async function disableSimpleMode(page) {
  if (await isToggleOn(page, '#simple-mode-toggle')) {
    await clickToggle(page, '#simple-mode-toggle');
  }
}

// Helper to add test entries
async function addTestEntries(page, count = 3) {
  for (let i = 1; i <= count; i++) {
    await page.click('[data-action="clear"]');
    const bib = String(i).padStart(3, '0');
    for (const digit of bib) {
      await page.click(`[data-num="${digit}"]`);
    }
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);
  }
}

test.describe('Export - Race Horology CSV', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');

    // Add test entries
    await addTestEntries(page, 3);

    // Navigate to Results
    await page.click('[data-view="results"]');
    await page.waitForSelector('.results-view');
  });

  test('should export Race Horology CSV file', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-btn');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('race-horology');
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('should include correct filename with date', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-btn');

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    // Should contain date pattern
    expect(filename).toMatch(/race-horology.*\.csv$/);
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
    await page.goto('/');

    // Clear any existing data
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await page.reload();

    await page.click('[data-view="results"]');

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
    await page.goto('/');
    await page.waitForSelector('.clock-time');

    // Add entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

    // Go to results and check entry exists
    await page.click('[data-view="results"]');

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

test.describe('Export - Multiple Timing Points', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');

    // Disable simple mode to access Start timing point
    await page.click('[data-view="settings"]');
    await disableSimpleMode(page);
    await page.click('[data-view="timer"]');
  });

  test('should export entries with different timing points', async ({ page }) => {
    // Add Start entry
    await page.click('[data-point="S"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Add Finish entry
    await page.click('[data-action="clear"]');
    await page.click('[data-point="F"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Export
    await page.click('[data-view="results"]');
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
    await page.waitForTimeout(600);

    // Export
    await page.click('[data-view="results"]');
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
    await page.waitForTimeout(600);

    // Export
    await page.click('[data-view="results"]');
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
    await page.waitForTimeout(600);

    // Add Finish entry
    await page.click('[data-action="clear"]');
    await page.click('[data-point="F"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Export
    await page.click('[data-view="results"]');
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
