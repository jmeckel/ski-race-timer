/**
 * E2E Tests - Results View
 * Tests for viewing, filtering, editing, and exporting results
 */

import { test, expect } from '@playwright/test';
import { setupPage, setupPageFullMode, navigateTo, enterBib, waitForConfirmationToHide } from './helpers.js';

test.describe('Results View', () => {
  test.describe('Empty State', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
      await navigateTo(page, 'results');
    });

    test('should show empty state when no entries', async ({ page }) => {
      const emptyState = page.locator('.results-view .empty-state');
      await expect(emptyState).toBeVisible();
    });
  });

  test.describe('Results List', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
      // Add test entries
      for (let i = 1; i <= 3; i++) {
        await enterBib(page, i);
        await page.click('#timestamp-btn');
        await waitForConfirmationToHide(page);
      }
      await navigateTo(page, 'results');
    });

    test('should display recorded entries', async ({ page }) => {
      const entries = page.locator('.result-item');
      await expect(entries).toHaveCount(3);
    });

    test('should show bib number for each entry', async ({ page }) => {
      const firstEntry = page.locator('.result-item').first();
      // Should contain bib number
      await expect(firstEntry).toContainText(/00[123]/);
    });

    test('should show timing point for each entry', async ({ page }) => {
      const firstEntry = page.locator('.result-item').first();
      // Timing point shows "Ziel" (Finish in German, which is default)
      await expect(firstEntry).toContainText('Ziel');
    });

    test('should show timestamp for each entry', async ({ page }) => {
      const firstEntry = page.locator('.result-item').first();
      const text = await firstEntry.textContent();
      expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  test.describe('Search', () => {
    test.beforeEach(async ({ page }) => {
      // Need full mode for search bar to be visible (has data-advanced attribute)
      await setupPageFullMode(page);
      await enterBib(page, 10);
      await page.click('#timestamp-btn');
      await waitForConfirmationToHide(page);
      await enterBib(page, 20);
      await page.click('#timestamp-btn');
      await waitForConfirmationToHide(page);
      await navigateTo(page, 'results');
    });

    test('should filter entries by bib number', async ({ page }) => {
      const searchInput = page.locator('#search-input');
      await searchInput.fill('010');

      const entries = page.locator('.result-item');
      await expect(entries).toHaveCount(1);
    });

    test('should show all entries when search cleared', async ({ page }) => {
      const searchInput = page.locator('#search-input');
      await searchInput.fill('010');
      await searchInput.fill('');

      const entries = page.locator('.result-item');
      await expect(entries).toHaveCount(2);
    });
  });

  test.describe('Edit Entry', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
      await enterBib(page, 55);
      await page.click('#timestamp-btn');
      await waitForConfirmationToHide(page);
      await navigateTo(page, 'results');
    });

    test('should open edit modal when clicking entry', async ({ page }) => {
      const entry = page.locator('.result-item').first();
      await entry.click();

      const modal = page.locator('.modal-overlay.show');
      await expect(modal).toBeVisible();
    });

    test('should close modal with cancel button', async ({ page }) => {
      await page.locator('.result-item').first().click();
      await expect(page.locator('.modal-overlay.show')).toBeVisible();

      await page.click('.modal-btn:not(.primary):not(.danger)');
      await page.waitForTimeout(200);
      await expect(page.locator('.modal-overlay.show')).not.toBeVisible();
    });
  });

  test.describe('Statistics', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
      for (let i = 1; i <= 5; i++) {
        await enterBib(page, i);
        await page.click('#timestamp-btn');
        await waitForConfirmationToHide(page);
      }
      await navigateTo(page, 'results');
    });

    test('should show total count', async ({ page }) => {
      const stats = page.locator('.stats-row');
      await expect(stats).toContainText('5');
    });
  });
});

test.describe('Results View - Export', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await enterBib(page, 42);
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);
    await navigateTo(page, 'results');
  });

  test('should export results as CSV', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.csv');
  });
});
