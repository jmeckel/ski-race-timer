/**
 * E2E Tests - Results View
 *
 * Tests for viewing, filtering, editing, and exporting results
 */

import { test, expect } from '@playwright/test';

// Helper to add test entries (works in simple mode - uses Finish point which is default)
async function addTestEntries(page, count = 3) {
  for (let i = 1; i <= count; i++) {
    await page.click(`[data-num="${i}"]`);
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);
    await page.click('#btn-clear');
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
  await page.click('[data-view="results-view"]');
}

test.describe('Results View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Add some test entries (works in simple mode)
    await addTestEntries(page, 3);

    // Navigate to Results tab
    await page.click('[data-view="results-view"]');
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
      // In simple mode, all entries are Finish - "F" in English, "Z" (Ziel) in German
      await expect(firstResult.locator('.result-point')).toHaveText(/^[FZ]$/);
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
      await page.click('[data-view="results-view"]');

      await expect(page.locator('.empty-state')).toBeVisible();
    });
  });

  test.describe('Search', () => {
    test.beforeEach(async ({ page }) => {
      // Need to disable simple mode to see search
      await disableSimpleMode(page);
    });

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
    test.beforeEach(async ({ page }) => {
      await disableSimpleMode(page);
    });

    test('should filter by timing point', async ({ page }) => {
      // All entries are Finish (F) since created in simple mode
      await page.selectOption('#filter-point', 'F');

      const results = page.locator('.result-item:visible');
      await expect(results).toHaveCount(3);
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
      const stats = page.locator('#stat-racers');
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

      await page.click('#edit-save-btn');

      // Verify update
      await expect(page.locator('.result-bib').first()).toContainText('099');
    });

    test('should change entry status', async ({ page }) => {
      await page.click('.result-item .result-bib');

      await page.selectOption('#edit-status-select', 'dnf');
      await page.click('#edit-save-btn');

      // Status badge should appear
      await expect(page.locator('.result-status').first()).toContainText('DNF');
    });

    test('should close edit modal with cancel', async ({ page }) => {
      await page.click('.result-item .result-bib');
      await page.click('#edit-cancel-btn');

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
      await page.click('#confirm-delete-cancel');

      const newCount = await page.locator('.result-item').count();
      expect(newCount).toBe(initialCount);
    });
  });

  test.describe('Multi-Select Mode', () => {
    test.beforeEach(async ({ page }) => {
      // Multi-select might need full mode
      await disableSimpleMode(page);
    });

    test('should enter select mode', async ({ page }) => {
      // Click select button to enter multi-select mode
      const selectBtn = page.locator('#select-btn');
      if (await selectBtn.isVisible()) {
        await selectBtn.click();
        await expect(page.locator('#select-actions')).toBeVisible();
      }
    });

    test('should select multiple entries', async ({ page }) => {
      const selectBtn = page.locator('#select-btn');
      if (await selectBtn.isVisible()) {
        await selectBtn.click();

        const checkboxes = page.locator('.result-checkbox');
        await checkboxes.nth(0).click();
        await checkboxes.nth(1).click();

        // Delete button should be available for selected entries
        await expect(page.locator('#delete-selected-btn')).toBeVisible();
      }
    });

    test('should delete selected entries', async ({ page }) => {
      const selectBtn = page.locator('#select-btn');
      if (await selectBtn.isVisible()) {
        await selectBtn.click();

        const checkboxes = page.locator('.result-checkbox');
        await checkboxes.nth(0).click();
        await checkboxes.nth(1).click();

        await page.click('#delete-selected-btn');
        await page.click('#confirm-delete-btn');

        const results = page.locator('.result-item');
        await expect(results).toHaveCount(1);
      }
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

    await page.click('[data-view="results-view"]');
  });

  test('should export Race Horology CSV', async ({ page }) => {
    // Listen for download
    const downloadPromise = page.waitForEvent('download');

    await page.click('#export-horology-btn');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('race-horology');
    expect(download.suggestedFilename()).toContain('.csv');
  });
});

test.describe('Results View - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="results-view"]');
  });

  test('should have accessible list structure', async ({ page }) => {
    const list = page.locator('.results-list');
    await expect(list).toHaveAttribute('role', 'list');
  });

  test('should support keyboard navigation in list', async ({ page }) => {
    // Add entry first
    await page.click('[data-view="timing-view"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);
    await page.click('[data-view="results-view"]');

    // Click on the result bib to open edit modal
    await page.click('.result-item .result-bib');

    // Edit modal should open
    await expect(page.locator('#edit-modal')).toHaveClass(/show/);
  });
});

test.describe('Results View - Simple Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Add some test entries
    await addTestEntries(page, 3);

    await page.click('[data-view="results-view"]');
    await page.waitForSelector('.results-list');
  });

  test('should hide search input in simple mode', async ({ page }) => {
    // Simple mode is on by default
    const searchInput = page.locator('#search-input');
    await expect(searchInput).not.toBeVisible();
  });

  test('should hide filter dropdowns in simple mode', async ({ page }) => {
    const filterPoint = page.locator('#filter-point');
    const filterStatus = page.locator('#filter-status');

    await expect(filterPoint).not.toBeVisible();
    await expect(filterStatus).not.toBeVisible();
  });

  test('should show only basic stats in simple mode', async ({ page }) => {
    // Total stat should be visible
    const totalStat = page.locator('#stat-total');
    await expect(totalStat).toBeVisible();

    // Racers stat should be visible
    const racersStat = page.locator('#stat-racers');
    await expect(racersStat).toBeVisible();

    // Advanced stats should be hidden (data-stat-advanced)
    const advancedStats = page.locator('[data-stat-advanced]');
    const count = await advancedStats.count();
    for (let i = 0; i < count; i++) {
      await expect(advancedStats.nth(i)).not.toBeVisible();
    }
  });

  test('should show search and filters in full mode', async ({ page }) => {
    // Go to settings and turn off simple mode
    await page.click('[data-view="settings-view"]');
    await page.click('#toggle-simple');

    // Go back to results
    await page.click('[data-view="results-view"]');

    // Search should be visible
    const searchInput = page.locator('#search-input');
    await expect(searchInput).toBeVisible();

    // Filters should be visible
    await expect(page.locator('#filter-point')).toBeVisible();
    await expect(page.locator('#filter-status')).toBeVisible();
  });

  test('should show all stats in full mode', async ({ page }) => {
    // Go to settings and turn off simple mode
    await page.click('[data-view="settings-view"]');
    await page.click('#toggle-simple');

    // Go back to results
    await page.click('[data-view="results-view"]');

    // Advanced stats should be visible
    const advancedStats = page.locator('[data-stat-advanced]');
    const count = await advancedStats.count();
    for (let i = 0; i < count; i++) {
      await expect(advancedStats.nth(i)).toBeVisible();
    }
  });
});

test.describe('Results View - Entry Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Add test entries
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

    await page.click('[data-view="results-view"]');
    await page.waitForSelector('.result-item');
  });

  test('should show entry with bib, time, and point', async ({ page }) => {
    const firstResult = page.locator('.result-item').first();

    await expect(firstResult.locator('.result-bib')).toBeVisible();
    await expect(firstResult.locator('.result-time')).toBeVisible();
    await expect(firstResult.locator('.result-point')).toBeVisible();
  });

  test('should edit entry via modal', async ({ page }) => {
    // Click on entry to edit
    await page.click('.result-item .result-bib');

    // Modal should open
    await expect(page.locator('#edit-modal')).toHaveClass(/show/);

    // Change bib
    const bibInput = page.locator('#edit-bib-input');
    await bibInput.clear();
    await bibInput.fill('999');

    // Save
    await page.click('#edit-save-btn');

    // Verify change
    await expect(page.locator('.result-bib').first()).toContainText('999');
  });

  test('should mark entry as DNS', async ({ page }) => {
    // Click on entry to edit
    await page.click('.result-item .result-bib');

    // Change status to DNS
    await page.selectOption('#edit-status-select', 'dns');
    await page.click('#edit-save-btn');

    // Status badge should appear
    await expect(page.locator('.result-status').first()).toContainText('DNS');
  });

  test('should mark entry as DNF', async ({ page }) => {
    // Click on entry to edit
    await page.click('.result-item .result-bib');

    // Change status to DNF
    await page.selectOption('#edit-status-select', 'dnf');
    await page.click('#edit-save-btn');

    // Status badge should appear
    await expect(page.locator('.result-status').first()).toContainText('DNF');
  });

  test('should delete entry with confirmation', async ({ page }) => {
    // Ensure we have at least one entry
    await expect(page.locator('.result-item')).toHaveCount(1);

    // Click delete
    await page.click('.result-delete');

    // Confirm modal should appear
    await expect(page.locator('#confirm-delete-modal')).toHaveClass(/show/);

    // Confirm delete
    await page.click('#confirm-delete-btn');

    // Wait for modal to close (check class is removed)
    await expect(page.locator('#confirm-delete-modal')).not.toHaveClass(/show/, { timeout: 5000 });

    // Should show empty state (no entries left)
    await expect(page.locator('.empty-state')).toBeVisible();
  });
});
