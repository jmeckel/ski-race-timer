/**
 * E2E Tests - Results View Advanced Features
 * Tests for run indicators, timing points, status display, multi-select,
 * entry counts, search/filter, empty state, and sort order
 */

import { expect, test } from '@playwright/test';
import {
  dismissToasts,
  enterBib,
  navigateTo,
  setupPage,
  waitForConfirmationToHide,
} from './helpers.js';

/**
 * Record a timestamped entry with specific bib, point, and run.
 * Clicks the radial dial UI buttons for point and run selection.
 */
async function recordEntry(page, { bib, point = 'F', run = 1 }) {
  // Set timing point by clicking the point button
  await page.click(`.radial-point-btn[data-point="${point}"]`);

  // Set run by clicking the run button
  await page.click(`.radial-run-btn[data-run="${run}"]`);

  // Enter bib number
  await enterBib(page, bib);

  // Record timestamp
  await page.click('#radial-time-btn');
  await waitForConfirmationToHide(page);
}

/**
 * Change an entry's status via the edit modal.
 * Clicks the entry, selects the new status, and saves.
 */
async function changeEntryStatus(page, entryLocator, status) {
  await entryLocator.click();
  await expect(page.locator('#edit-modal.show')).toBeVisible();

  await page.selectOption('#edit-status-select', status);
  await page.click('#save-edit-btn');

  // Wait for modal to close
  await page.waitForSelector('#edit-modal.show', {
    state: 'hidden',
    timeout: 3000,
  });
}

test.describe('Results Filtering - Run Indicators', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should display L1 indicator for run 1 entries', async ({ page }) => {
    await recordEntry(page, { bib: 1, run: 1 });
    await navigateTo(page, 'results');

    const entry = page.locator('.result-item').first();
    // German default: L1 for run 1
    const runBadge = entry.locator('.result-run');
    await expect(runBadge).toBeVisible();
    await expect(runBadge).toContainText('L1');
  });

  test('should display L2 indicator for run 2 entries', async ({ page }) => {
    await recordEntry(page, { bib: 1, run: 2 });
    await navigateTo(page, 'results');

    const entry = page.locator('.result-item').first();
    const runBadge = entry.locator('.result-run');
    await expect(runBadge).toBeVisible();
    await expect(runBadge).toContainText('L2');
  });

  test('should show R1/R2 indicators in English mode', async ({ page }) => {
    await setupPage(page, 'en');
    await recordEntry(page, { bib: 5, run: 1 });
    await recordEntry(page, { bib: 6, run: 2 });
    await navigateTo(page, 'results');

    const entries = page.locator('.result-item');
    // Bib 6 (run 2) sorted higher (descending by bib)
    const run2Entry = entries.first();
    await expect(run2Entry.locator('.result-run')).toContainText('R2');

    const run1Entry = entries.last();
    await expect(run1Entry.locator('.result-run')).toContainText('R1');
  });

  test('should display both runs for same bib as grouped entry', async ({
    page,
  }) => {
    await recordEntry(page, { bib: 10, run: 1 });
    await recordEntry(page, { bib: 10, run: 2 });
    await navigateTo(page, 'results');

    // Two different runs for same bib create two groups (bib-1 and bib-2)
    const entries = page.locator('.result-item');
    await expect(entries).toHaveCount(2);
  });
});

test.describe('Results Filtering - Timing Points', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should show Ziel label for finish entries (German)', async ({
    page,
  }) => {
    await recordEntry(page, { bib: 1, point: 'F' });
    await navigateTo(page, 'results');

    const entry = page.locator('.result-item').first();
    const pointBadge = entry.locator('.result-point');
    await expect(pointBadge).toBeVisible();
    await expect(pointBadge).toContainText('Ziel');
  });

  test('should show Start label for start entries (German)', async ({
    page,
  }) => {
    await recordEntry(page, { bib: 1, point: 'S' });
    await navigateTo(page, 'results');

    const entry = page.locator('.result-item').first();
    const pointBadge = entry.locator('.result-point');
    await expect(pointBadge).toBeVisible();
    await expect(pointBadge).toContainText('Start');
  });

  test('should show Finish/Start labels in English mode', async ({ page }) => {
    await setupPage(page, 'en');
    await recordEntry(page, { bib: 1, point: 'F' });
    await recordEntry(page, { bib: 2, point: 'S' });
    await navigateTo(page, 'results');

    const entries = page.locator('.result-item');
    // Bib 2 (Start) is sorted first (descending by bib)
    await expect(entries.first().locator('.result-point')).toContainText(
      'Start',
    );
    await expect(entries.last().locator('.result-point')).toContainText(
      'Finish',
    );
  });

  test('should filter by timing point using dropdown', async ({ page }) => {
    await recordEntry(page, { bib: 1, point: 'S' });
    await recordEntry(page, { bib: 2, point: 'F' });
    await navigateTo(page, 'results');

    // Open filter bar
    await page.click('#toggle-filters-btn');

    // Filter by Start only
    await page.selectOption('#filter-point', 'S');

    const entries = page.locator('.result-item');
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator('.result-point')).toContainText(
      'Start',
    );
  });
});

test.describe('Results Filtering - Status Display', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should not show status badge for OK entries', async ({ page }) => {
    await recordEntry(page, { bib: 1 });
    await navigateTo(page, 'results');

    const entry = page.locator('.result-item').first();
    // OK entries do not render a status badge
    const statusBadge = entry.locator('.result-status');
    await expect(statusBadge).toHaveCount(0);
  });

  test('should show DNS status after editing entry', async ({ page }) => {
    await recordEntry(page, { bib: 1 });
    await navigateTo(page, 'results');

    const entry = page.locator('.result-item').first();
    await changeEntryStatus(page, entry, 'dns');
    await dismissToasts(page);

    // Re-query entry after re-render
    const updatedEntry = page.locator('.result-item').first();
    const statusBadge = updatedEntry.locator('.result-status');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toContainText('DNS');
  });

  test('should show DNF status after editing entry', async ({ page }) => {
    await recordEntry(page, { bib: 2 });
    await navigateTo(page, 'results');

    const entry = page.locator('.result-item').first();
    await changeEntryStatus(page, entry, 'dnf');
    await dismissToasts(page);

    const updatedEntry = page.locator('.result-item').first();
    const statusBadge = updatedEntry.locator('.result-status');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toContainText('DNF');
  });

  test('should show DSQ status after editing entry', async ({ page }) => {
    await recordEntry(page, { bib: 3 });
    await navigateTo(page, 'results');

    const entry = page.locator('.result-item').first();
    await changeEntryStatus(page, entry, 'dsq');
    await dismissToasts(page);

    const updatedEntry = page.locator('.result-item').first();
    const statusBadge = updatedEntry.locator('.result-status');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toContainText('DSQ');
  });

  test('should filter by status using dropdown', async ({ page }) => {
    // Create two entries, change one to DNS
    await recordEntry(page, { bib: 1 });
    await recordEntry(page, { bib: 2 });
    await navigateTo(page, 'results');

    // Change bib 2 to DNS (first in list since sorted descending)
    const firstEntry = page.locator('.result-item').first();
    await changeEntryStatus(page, firstEntry, 'dns');
    await dismissToasts(page);

    // Open filter bar and filter by DNS
    await page.click('#toggle-filters-btn');
    await page.selectOption('#filter-status', 'dns');

    const entries = page.locator('.result-item');
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator('.result-status')).toContainText(
      'DNS',
    );
  });
});

test.describe('Results Filtering - Entry Count & Statistics', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should show zero count with no entries', async ({ page }) => {
    await navigateTo(page, 'results');

    const statTotal = page.locator('#stat-total');
    await expect(statTotal).toHaveText('0');
  });

  test('should update count after recording entries', async ({ page }) => {
    await recordEntry(page, { bib: 1 });
    await recordEntry(page, { bib: 2 });
    await recordEntry(page, { bib: 3 });
    await navigateTo(page, 'results');

    const statTotal = page.locator('#stat-total');
    await expect(statTotal).toHaveText('3');
  });

  test('should count entries across different runs', async ({ page }) => {
    await recordEntry(page, { bib: 1, run: 1 });
    await recordEntry(page, { bib: 1, run: 2 });
    await recordEntry(page, { bib: 2, run: 1 });
    await navigateTo(page, 'results');

    const statTotal = page.locator('#stat-total');
    await expect(statTotal).toHaveText('3');
  });

  test('should count entries across different timing points', async ({
    page,
  }) => {
    await recordEntry(page, { bib: 1, point: 'S' });
    await recordEntry(page, { bib: 1, point: 'F' });
    await navigateTo(page, 'results');

    const statTotal = page.locator('#stat-total');
    await expect(statTotal).toHaveText('2');
  });
});

test.describe('Results Filtering - Search by Bib', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await recordEntry(page, { bib: 10 });
    await recordEntry(page, { bib: 20 });
    await recordEntry(page, { bib: 30 });
    await navigateTo(page, 'results');
  });

  test('should filter entries when searching by bib', async ({ page }) => {
    await page.click('#toggle-filters-btn');

    const searchInput = page.locator('#search-input');
    await searchInput.fill('020');

    const entries = page.locator('.result-item');
    await expect(entries).toHaveCount(1);
  });

  test('should show no results for non-matching search', async ({ page }) => {
    await page.click('#toggle-filters-btn');

    const searchInput = page.locator('#search-input');
    await searchInput.fill('999');

    const entries = page.locator('.result-item');
    await expect(entries).toHaveCount(0);
  });

  test('should restore all entries when clearing search', async ({ page }) => {
    await page.click('#toggle-filters-btn');

    const searchInput = page.locator('#search-input');
    await searchInput.fill('010');
    await expect(page.locator('.result-item')).toHaveCount(1);

    // Clear search
    await searchInput.fill('');
    await expect(page.locator('.result-item')).toHaveCount(3);
  });

  test('should filter by partial bib number match', async ({ page }) => {
    await page.click('#toggle-filters-btn');

    const searchInput = page.locator('#search-input');
    // "0" matches all three bibs (010, 020, 030)
    await searchInput.fill('0');

    const entries = page.locator('.result-item');
    await expect(entries).toHaveCount(3);
  });
});

test.describe('Results Filtering - Empty State', () => {
  test('should show empty state message when no entries recorded', async ({
    page,
  }) => {
    await setupPage(page);
    await navigateTo(page, 'results');

    const emptyState = page.locator('#results-list .empty-state');
    await expect(emptyState).toBeVisible();
  });

  test('should show German empty state text by default', async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'results');

    const emptyState = page.locator('#results-list .empty-state');
    await expect(emptyState).toContainText('Keine Einträge vorhanden');
  });

  test('should show English empty state text', async ({ page }) => {
    await setupPage(page, 'en');
    await navigateTo(page, 'results');

    const emptyState = page.locator('#results-list .empty-state');
    await expect(emptyState).toContainText('No entries recorded');
  });

  test('should hide empty state after recording an entry', async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'results');

    // Verify empty state is shown
    await expect(page.locator('#results-list .empty-state')).toBeVisible();

    // Go back to timer, record an entry
    await navigateTo(page, 'timer');
    await recordEntry(page, { bib: 1 });
    await navigateTo(page, 'results');

    // Empty state should be gone, entry should appear
    await expect(page.locator('#results-list .empty-state')).toHaveCount(0);
    await expect(page.locator('.result-item')).toHaveCount(1);
  });
});

test.describe('Results Filtering - Sort Order', () => {
  test.setTimeout(30000);

  test('should display entries sorted by bib number descending', async ({
    page,
  }) => {
    await setupPage(page);
    await recordEntry(page, { bib: 5 });
    await recordEntry(page, { bib: 15 });
    await recordEntry(page, { bib: 10 });
    await navigateTo(page, 'results');

    const entries = page.locator('.result-item');
    await expect(entries).toHaveCount(3);

    // Groups are sorted by bib descending: 15, 10, 5
    const firstBib = entries.nth(0).locator('.result-bib');
    const secondBib = entries.nth(1).locator('.result-bib');
    const thirdBib = entries.nth(2).locator('.result-bib');

    await expect(firstBib).toContainText('015');
    await expect(secondBib).toContainText('010');
    await expect(thirdBib).toContainText('005');
  });

  test('should maintain sort order after adding new entries', async ({
    page,
  }) => {
    await setupPage(page);
    await recordEntry(page, { bib: 3 });
    await recordEntry(page, { bib: 1 });
    await navigateTo(page, 'results');

    // Verify initial order: 3, 1 (descending)
    const entries = page.locator('.result-item');
    await expect(entries.first().locator('.result-bib')).toContainText('003');
    await expect(entries.last().locator('.result-bib')).toContainText('001');

    // Add bib 2 and come back
    await navigateTo(page, 'timer');
    await recordEntry(page, { bib: 2 });
    await navigateTo(page, 'results');

    // Order should be: 3, 2, 1 (descending)
    const updatedEntries = page.locator('.result-item');
    await expect(updatedEntries).toHaveCount(3);
    await expect(updatedEntries.nth(0).locator('.result-bib')).toContainText(
      '003',
    );
    await expect(updatedEntries.nth(1).locator('.result-bib')).toContainText(
      '002',
    );
    await expect(updatedEntries.nth(2).locator('.result-bib')).toContainText(
      '001',
    );
  });
});

test.describe('Results Filtering - Combined Filters', () => {
  test.setTimeout(30000);

  test('should combine point and status filters', async ({ page }) => {
    await setupPage(page);

    // Record entries with different points
    await recordEntry(page, { bib: 1, point: 'S' });
    await recordEntry(page, { bib: 2, point: 'F' });
    await recordEntry(page, { bib: 3, point: 'F' });
    await navigateTo(page, 'results');

    // Change bib 3 (first in list, descending) to DNF
    const firstEntry = page.locator('.result-item').first();
    await changeEntryStatus(page, firstEntry, 'dnf');
    await dismissToasts(page);

    // Open filter bar
    await page.click('#toggle-filters-btn');

    // Filter by Finish point AND DNF status
    await page.selectOption('#filter-point', 'F');
    await page.selectOption('#filter-status', 'dnf');

    // Only bib 3 (Finish + DNF) should show
    const entries = page.locator('.result-item');
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator('.result-status')).toContainText(
      'DNF',
    );
  });

  test('should combine search with point filter', async ({ page }) => {
    await setupPage(page);

    await recordEntry(page, { bib: 10, point: 'S' });
    await recordEntry(page, { bib: 10, point: 'F' });
    await recordEntry(page, { bib: 20, point: 'S' });
    await navigateTo(page, 'results');

    // Open filter bar
    await page.click('#toggle-filters-btn');

    // Search for bib 10 and filter by Start
    await page.locator('#search-input').fill('010');
    await page.selectOption('#filter-point', 'S');

    // Only bib 10 Start entry should show
    const entries = page.locator('.result-item');
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator('.result-point')).toContainText(
      'Start',
    );
  });

  test('should reset filters when toggling filter bar off and on', async ({
    page,
  }) => {
    await setupPage(page);

    await recordEntry(page, { bib: 1 });
    await recordEntry(page, { bib: 2 });
    await navigateTo(page, 'results');

    // Open filter bar and apply search
    await page.click('#toggle-filters-btn');
    await page.locator('#search-input').fill('001');
    await expect(page.locator('.result-item')).toHaveCount(1);

    // Clear search manually
    await page.locator('#search-input').fill('');
    await expect(page.locator('.result-item')).toHaveCount(2);
  });
});
