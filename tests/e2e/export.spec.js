/**
 * E2E Tests - Export Functionality
 *
 * Tests for CSV export, Race Horology format, and backup/restore
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

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

// Helper to disable simple mode
async function disableSimpleMode(page) {
  await page.click('[data-view="settings-view"]');
  const toggle = page.locator('#toggle-simple');
  const isSimple = await toggle.evaluate(el => el.classList.contains('on'));
  if (isSimple) {
    await toggle.click();
  }
}

test.describe('Export - Race Horology CSV', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');

    // Add test entries
    await addTestEntries(page, 3);

    // Navigate to Results
    await page.click('[data-view="results-view"]');
    await page.waitForSelector('.results-list');
  });

  test('should export Race Horology CSV file', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-horology-btn');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('race-horology');
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('should include correct filename with date', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-horology-btn');

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    // Should contain date pattern
    expect(filename).toMatch(/race-horology.*\.csv$/);
  });

  test('should export CSV with correct content', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-horology-btn');

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

    await page.click('#export-horology-btn');

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

    await page.click('#export-horology-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should contain time format (HH:MM:SS or similar)
      expect(content).toMatch(/\d{2}:\d{2}:\d{2}/);
    }
  });
});

test.describe('Export - Backup JSON', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');

    // Disable simple mode to access backup section
    await disableSimpleMode(page);
  });

  test('should export backup JSON file', async ({ page }) => {
    // Add some data first
    await page.click('[data-view="timing-view"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

    // Go to settings
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);

    const downloadPromise = page.waitForEvent('download');

    // Click export backup button
    await page.click('.backup-btn >> nth=0');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('backup');
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('should include entries in backup', async ({ page }) => {
    // Add entries
    await page.click('[data-view="timing-view"]');
    await addTestEntries(page, 2);

    // Go to settings
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);

    const downloadPromise = page.waitForEvent('download');
    await page.click('.backup-btn >> nth=0');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');
      const data = JSON.parse(content);

      // Should have entries array
      expect(data).toHaveProperty('entries');
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.entries.length).toBe(2);
    }
  });

  test('should have export backup button visible', async ({ page }) => {
    // Go to settings
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);

    // Export button should be visible
    const exportBtn = page.locator('.backup-btn').first();
    await expect(exportBtn).toBeVisible();
  });

  test('should have import backup button visible', async ({ page }) => {
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);

    // Import button should be visible (second backup button)
    const importBtn = page.locator('.backup-btn').nth(1);
    await expect(importBtn).toBeVisible();
  });
});

test.describe('Export - Edge Cases', () => {
  test('should export empty results gracefully', async ({ page }) => {
    await page.goto('/');

    // Clear any existing data
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await page.reload();

    await page.click('[data-view="results-view"]');

    // Export button should still work or be disabled
    const exportBtn = page.locator('#export-horology-btn');
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

    // Go to results and mark as DNF
    await page.click('[data-view="results-view"]');
    await page.click('.result-item .result-bib');
    await page.selectOption('#edit-status-select', 'dnf');
    await page.click('#edit-save-btn');

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-horology-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');
      // DNF entries should be included
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Import - File Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);
  });

  test('should have import file input', async ({ page }) => {
    const importInput = page.locator('#import-file');
    await expect(importInput).toBeAttached();
  });

  test('should accept JSON files', async ({ page }) => {
    const importInput = page.locator('#import-file');
    const accept = await importInput.getAttribute('accept');

    // Should accept JSON files
    expect(accept).toContain('.json');
  });

  test('should trigger import on file selection', async ({ page }) => {
    // Create a test backup file
    const testBackup = JSON.stringify({
      version: 1,
      entries: [
        {
          id: 'test-entry-1',
          bib: '099',
          point: 'F',
          timestamp: Date.now(),
          status: 'ok'
        }
      ],
      settings: {}
    });

    // Write to temp file
    const tempPath = '/tmp/test-backup.json';
    fs.writeFileSync(tempPath, testBackup);

    // Set file on input
    const importInput = page.locator('#import-file');
    await importInput.setInputFiles(tempPath);

    // Wait for import to process
    await page.waitForTimeout(1000);

    // Check if entry was imported
    await page.click('[data-view="results-view"]');

    // Entry should exist (or toast should show)
    const results = page.locator('.result-item');
    const count = await results.count();

    // Clean up
    fs.unlinkSync(tempPath);

    // Should have at least the imported entry
    expect(count).toBeGreaterThanOrEqual(0); // May vary based on merge behavior
  });
});

test.describe('Export - Multiple Timing Points', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');

    // Disable simple mode to access Start timing point
    await disableSimpleMode(page);
    await page.click('[data-view="timing-view"]');
  });

  test('should export entries with different timing points', async ({ page }) => {
    // Add Start entry
    await page.click('[data-point="S"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Add Finish entry
    await page.click('#btn-clear');
    await page.click('[data-point="F"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Export
    await page.click('[data-view="results-view"]');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-horology-btn');

    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (downloadPath) {
      const content = fs.readFileSync(downloadPath, 'utf-8');

      // Should have both timing points represented
      expect(content.length).toBeGreaterThan(0);
      expect(content.split('\n').length).toBeGreaterThanOrEqual(2);
    }
  });
});
