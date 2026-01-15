/**
 * E2E Tests - Results View
 *
 * Tests for viewing, filtering, editing, and exporting results
 */

import { test, expect } from '@playwright/test';

test.describe('Results View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Add some test entries first
    for (let i = 1; i <= 3; i++) {
      await page.click(`[data-num="${i}"]`);
      await page.click('[data-point="S"]');
      await page.click('#timestamp-btn');
      await page.waitForTimeout(500);
      await page.click('[data-action="clear"]');
    }

    // Navigate to Results tab
    await page.click('[data-view="results"]');
    await page.waitForSelector('.results-list');
  });

  test.describe('Results List', () => {
    test('should display recorded entries', async ({ page }) => {
      const results = page.locator('.result-item');
      await expect(results).toHaveCount(3);
    });

    test('should show bib number for each entry', async ({ page }) => {
      const firstResult = page.locator('.result-item').first();
      await expect(firstResult.locator('.result-bib')).toBeVisible();
    });

    test('should show timing point for each entry', async ({ page }) => {
      const firstResult = page.locator('.result-item').first();
      await expect(firstResult.locator('.result-point')).toContainText('S');
    });

    test('should show timestamp for each entry', async ({ page }) => {
      const firstResult = page.locator('.result-item').first();
      const time = firstResult.locator('.result-time');
      await expect(time).toBeVisible();
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state when no entries', async ({ page }) => {
      // Clear localStorage and reload
      await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
      await page.reload();
      await page.click('[data-view="results"]');

      await expect(page.locator('.empty-state')).toBeVisible();
    });
  });

  test.describe('Search', () => {
    test('should filter entries by bib number', async ({ page }) => {
      const searchInput = page.locator('#search-input');
      await searchInput.fill('001');

      // Only matching entries should be visible
      const results = page.locator('.result-item:visible');
      await expect(results).toHaveCount(1);
    });

    test('should show all entries when search cleared', async ({ page }) => {
      const searchInput = page.locator('#search-input');
      await searchInput.fill('001');
      await searchInput.clear();

      const results = page.locator('.result-item');
      await expect(results).toHaveCount(3);
    });
  });

  test.describe('Filters', () => {
    test('should filter by timing point', async ({ page }) => {
      // First add a Finish entry
      await page.click('[data-view="timer"]');
      await page.click('[data-num="9"]');
      await page.click('[data-point="F"]');
      await page.click('#timestamp-btn');
      await page.waitForTimeout(500);

      // Go back to results
      await page.click('[data-view="results"]');

      // Filter by Start only
      await page.selectOption('#filter-point', 'S');

      const results = page.locator('.result-item:visible');
      await expect(results).toHaveCount(3); // Only S entries
    });

    test('should filter by status', async ({ page }) => {
      await page.selectOption('#filter-status', 'ok');

      const results = page.locator('.result-item:visible');
      await expect(results).toHaveCount(3);
    });
  });

  test.describe('Statistics', () => {
    test('should display total count', async ({ page }) => {
      const totalStat = page.locator('.stat-value').first();
      await expect(totalStat).toContainText('3');
    });

    test('should display racers count', async ({ page }) => {
      const stats = page.locator('.stats-row');
      await expect(stats).toContainText('3'); // 3 different bibs
    });
  });

  test.describe('Edit Entry', () => {
    test('should open edit modal when clicking entry', async ({ page }) => {
      await page.click('.result-item .result-bib');

      await expect(page.locator('#edit-modal')).toHaveClass(/show/);
    });

    test('should edit bib number', async ({ page }) => {
      await page.click('.result-item .result-bib');

      const bibInput = page.locator('#edit-bib-input');
      await bibInput.clear();
      await bibInput.fill('099');

      await page.click('#save-edit-btn');

      // Verify update
      await expect(page.locator('.result-bib').first()).toContainText('099');
    });

    test('should change entry status', async ({ page }) => {
      await page.click('.result-item .result-bib');

      await page.selectOption('#edit-status-select', 'dnf');
      await page.click('#save-edit-btn');

      // Status badge should appear
      await expect(page.locator('.result-status').first()).toContainText('DNF');
    });

    test('should close edit modal with cancel', async ({ page }) => {
      await page.click('.result-item .result-bib');
      await page.click('#cancel-edit-btn');

      await expect(page.locator('#edit-modal')).not.toHaveClass(/show/);
    });
  });

  test.describe('Delete Entry', () => {
    test('should show delete confirmation', async ({ page }) => {
      await page.click('.result-delete');

      await expect(page.locator('#confirm-delete-modal')).toHaveClass(/show/);
    });

    test('should delete entry after confirmation', async ({ page }) => {
      const initialCount = await page.locator('.result-item').count();

      await page.click('.result-delete');
      await page.click('#confirm-delete-btn');

      const newCount = await page.locator('.result-item').count();
      expect(newCount).toBe(initialCount - 1);
    });

    test('should cancel delete', async ({ page }) => {
      const initialCount = await page.locator('.result-item').count();

      await page.click('.result-delete');
      await page.click('#cancel-delete-btn');

      const newCount = await page.locator('.result-item').count();
      expect(newCount).toBe(initialCount);
    });
  });

  test.describe('Multi-Select Mode', () => {
    test('should enter select mode', async ({ page }) => {
      await page.click('.result-checkbox');

      await expect(page.locator('.select-mode-bar')).toBeVisible();
    });

    test('should select multiple entries', async ({ page }) => {
      const checkboxes = page.locator('.result-checkbox');
      await checkboxes.nth(0).click();
      await checkboxes.nth(1).click();

      // Should show count of selected
      await expect(page.locator('.select-mode-bar')).toContainText('2');
    });

    test('should delete selected entries', async ({ page }) => {
      const checkboxes = page.locator('.result-checkbox');
      await checkboxes.nth(0).click();
      await checkboxes.nth(1).click();

      await page.click('#delete-selected-btn');
      await page.click('#confirm-delete-btn');

      const results = page.locator('.result-item');
      await expect(results).toHaveCount(1);
    });
  });
});

test.describe('Results Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Add test entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

    await page.click('[data-view="results"]');
  });

  test('should export CSV', async ({ page }) => {
    // Listen for download
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-csv-btn');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('should export JSON', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-json-btn');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.json');
  });
});

test.describe('Results View - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="results"]');
  });

  test('should have accessible list structure', async ({ page }) => {
    const list = page.locator('.results-list');
    await expect(list).toHaveAttribute('role', 'list');
  });

  test('should support keyboard navigation in list', async ({ page }) => {
    // Add entry first
    await page.click('[data-view="timer"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);
    await page.click('[data-view="results"]');

    // Tab to first result
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Press Enter to edit
    await page.keyboard.press('Enter');

    // Edit modal should open
    await expect(page.locator('#edit-modal')).toHaveClass(/show/);
  });
});
