/**
 * E2E Tests - Visual Regression
 * Screenshot comparison tests for key UI states.
 * Uses Playwright's built-in toHaveScreenshot() matcher.
 *
 * First run creates baseline screenshots in __snapshots__ directory.
 * Subsequent runs compare against baselines.
 *
 * Dynamic elements (clock, timestamps) are masked to prevent false failures.
 */

import { expect, test } from '@playwright/test';
import {
  enterBib,
  navigateTo,
  setupPage,
  waitForConfirmationToHide,
} from './helpers.js';

/** Elements that change every frame/second and must be masked in screenshots */
function getTimerMasks(page) {
  return [
    page.locator('#radial-time-hm'),
    page.locator('#radial-time-seconds'),
    page.locator('#radial-time-subseconds'),
    page.locator('#radial-last-time'),
    page.locator('#radial-stats-count'),
  ];
}

/** Mask dynamic elements in the results view (timestamps, counts) */
function getResultsMasks(page) {
  return [
    page.locator('.result-time'),
    page.locator('#stat-total'),
    page.locator('#stat-racers'),
    page.locator('#stat-finished'),
    page.locator('#entry-count-badge'),
  ];
}

/** Mask header-level dynamic elements */
function getHeaderMasks(page) {
  return [page.locator('#entry-count-badge')];
}

test.describe('Visual Regression', () => {
  // Visual regression tests only run on portrait projects.
  // Landscape uses CSS `display: contents` on view containers,
  // making element-level screenshots impossible (zero-size box).
  // WebKit is also skipped due to radial dial test driver issues.
  test.skip(
    ({ browserName, viewport }) =>
      browserName === 'webkit' ||
      (viewport && viewport.width > viewport.height),
    'Visual regression runs on portrait Chromium only',
  );

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    // Let all animations and transitions settle
    await page.waitForTimeout(500);
  });

  test.describe('Timer View', () => {
    test('default state', async ({ page }) => {
      await expect(page.locator('.timer-view')).toHaveScreenshot(
        'timer-default.png',
        {
          maxDiffPixelRatio: 0.01,
          mask: [...getTimerMasks(page), ...getHeaderMasks(page)],
        },
      );
    });

    test('with bib entered', async ({ page, browserName }) => {
      // Enter bib number via dial
      await page.waitForSelector('.dial-number[data-num="1"]', {
        state: 'visible',
        timeout: 5000,
      });
      await page.click('.dial-number[data-num="1"]');
      await page.click('.dial-number[data-num="2"]');
      await page.click('.dial-number[data-num="3"]');
      await page.waitForTimeout(300);

      await expect(page.locator('.timer-view')).toHaveScreenshot(
        'timer-with-bib.png',
        {
          maxDiffPixelRatio: 0.01,
          mask: [...getTimerMasks(page), ...getHeaderMasks(page)],
        },
      );
    });

    test('start point selected', async ({ page }) => {
      await page.click('.radial-point-btn[data-point="S"]');
      await page.waitForTimeout(300);

      await expect(page.locator('.timer-view')).toHaveScreenshot(
        'timer-start-selected.png',
        {
          maxDiffPixelRatio: 0.01,
          mask: [...getTimerMasks(page), ...getHeaderMasks(page)],
        },
      );
    });

    test('run 2 selected', async ({ page }) => {
      await page.click('#radial-run-selector [data-run="2"]');
      await page.waitForTimeout(300);

      await expect(page.locator('.timer-view')).toHaveScreenshot(
        'timer-run2-selected.png',
        {
          maxDiffPixelRatio: 0.01,
          mask: [...getTimerMasks(page), ...getHeaderMasks(page)],
        },
      );
    });

    test('confirmation overlay after recording', async ({ page }) => {
      await enterBib(page, 42);
      await page.click('#radial-time-btn');

      // Wait for the confirmation overlay to fully appear
      await page.waitForSelector('#radial-confirmation-overlay.show', {
        timeout: 2000,
      });
      await page.waitForTimeout(300);

      await expect(page.locator('.timer-view')).toHaveScreenshot(
        'timer-confirmation-overlay.png',
        {
          maxDiffPixelRatio: 0.01,
          mask: [
            ...getTimerMasks(page),
            ...getHeaderMasks(page),
            // Mask the confirmation time since it varies
            page.locator('#radial-confirm-time'),
          ],
        },
      );
    });
  });

  test.describe('Results View', () => {
    test('empty state', async ({ page }) => {
      await navigateTo(page, 'results');
      await page.waitForTimeout(500);

      await expect(page.locator('.results-view')).toHaveScreenshot(
        'results-empty.png',
        {
          maxDiffPixelRatio: 0.01,
          mask: [...getHeaderMasks(page)],
        },
      );
    });

    test('with entries', async ({ page }) => {
      // Add test entries
      for (let i = 1; i <= 3; i++) {
        await enterBib(page, i);
        await page.click('#radial-time-btn');
        await waitForConfirmationToHide(page);
      }

      await navigateTo(page, 'results');
      await page.waitForTimeout(500);

      // Wait for result items to render
      await page.waitForSelector('.result-item', { timeout: 3000 });

      await expect(page.locator('.results-view')).toHaveScreenshot(
        'results-with-entries.png',
        {
          maxDiffPixelRatio: 0.01,
          mask: [...getResultsMasks(page), ...getHeaderMasks(page)],
        },
      );
    });
  });

  test.describe('Settings View', () => {
    test('default state', async ({ page }) => {
      await navigateTo(page, 'settings');
      await page.waitForTimeout(500);

      await expect(page.locator('.settings-view')).toHaveScreenshot(
        'settings-default.png',
        {
          maxDiffPixelRatio: 0.01,
          mask: [...getHeaderMasks(page)],
        },
      );
    });
  });

  test.describe('Modals', () => {
    test('edit entry modal', async ({ page }) => {
      // Add an entry first
      await enterBib(page, 55);
      await page.click('#radial-time-btn');
      await waitForConfirmationToHide(page);

      // Navigate to results and open edit modal
      await navigateTo(page, 'results');
      await page.waitForTimeout(500);
      await page.waitForSelector('.result-item', { timeout: 3000 });
      await page.locator('.result-item').first().click();

      // Wait for modal to be visible and animation to settle
      await page.waitForSelector('#edit-modal.show', { timeout: 3000 });
      await page.waitForTimeout(500);

      await expect(page.locator('#edit-modal')).toHaveScreenshot(
        'modal-edit-entry.png',
        {
          maxDiffPixelRatio: 0.01,
        },
      );
    });
  });

  test.describe('Tab Navigation', () => {
    test('bottom tab bar - timer active', async ({ page }) => {
      const tabBar = page.locator('.tab-bar');
      await expect(tabBar).toHaveScreenshot('tab-bar-timer-active.png', {
        maxDiffPixelRatio: 0.01,
      });
    });

    test('bottom tab bar - results active', async ({ page }) => {
      await navigateTo(page, 'results');
      await page.waitForTimeout(300);

      const tabBar = page.locator('.tab-bar');
      await expect(tabBar).toHaveScreenshot('tab-bar-results-active.png', {
        maxDiffPixelRatio: 0.01,
      });
    });

    test('bottom tab bar - settings active', async ({ page }) => {
      await navigateTo(page, 'settings');
      await page.waitForTimeout(300);

      const tabBar = page.locator('.tab-bar');
      await expect(tabBar).toHaveScreenshot('tab-bar-settings-active.png', {
        maxDiffPixelRatio: 0.01,
      });
    });
  });
});
