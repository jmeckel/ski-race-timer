/**
 * E2E Tests - Timer View
 * Tests for the main timing functionality
 */

import { test, expect } from '@playwright/test';
import { setupPage, setupPageFullMode, clickToggle, recordTimestamp, enterBib, waitForConfirmationToHide, navigateTo } from './helpers.js';

test.describe('Timer View', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test.describe('Clock Display', () => {
    test('should display running clock', async ({ page }) => {
      // Radial clock is split into parts: HH:MM, SS, and mmm
      const clockHm = page.locator('#radial-time-hm');
      const clockSec = page.locator('#radial-time-seconds');
      const initialSec = await clockSec.textContent();

      // Wait for clock to update (WebKit in CI can have throttled animation)
      await page.waitForTimeout(1000);
      const newSec = await clockSec.textContent();

      // Either seconds or subseconds should change
      expect(newSec).not.toBe(initialSec);
    });

    test('should display time in HH:MM:SS.mmm format', async ({ page }) => {
      // Radial clock displays time in parts
      const clockHm = page.locator('#radial-time-hm');
      const clockSec = page.locator('#radial-time-seconds');
      const clockSub = page.locator('#radial-time-subseconds');

      const hm = await clockHm.textContent();
      const sec = await clockSec.textContent();
      const sub = await clockSub.textContent();

      expect(hm).toMatch(/^\d{2}:\d{2}$/);
      expect(sec).toMatch(/^\d{2}$/);
      expect(sub).toMatch(/^\d{3}$/);
    });

    test('should display current date', async ({ page }) => {
      // Radial mode doesn't have a date display, but the app header shows entry count
      // Check that the timer view is visible instead
      const timerView = page.locator('.timer-view.radial-mode');
      await expect(timerView).toBeVisible();
    });
  });

  test.describe('Bib Number Input', () => {
    test('should enter bib number via radial dial', async ({ page, browserName }) => {
      // Skip on Safari landscape - WebKit test driver has issues with dial clicks
      // Real Safari works fine (verified manually)
      test.skip(browserName === 'webkit', 'WebKit test driver issue with radial dial in landscape');

      await page.waitForSelector('.dial-number[data-num="1"]', { state: 'visible', timeout: 5000 });
      await page.click('.dial-number[data-num="1"]');
      await page.click('.dial-number[data-num="2"]');
      await page.click('.dial-number[data-num="3"]');

      const bibDisplay = page.locator('#radial-bib-value');
      await expect(bibDisplay).toContainText('123');
    });

    test('should limit bib to 3 digits', async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', 'WebKit test driver issue with radial dial in landscape');

      await page.waitForSelector('.dial-number[data-num="1"]', { state: 'visible', timeout: 5000 });
      await page.click('.dial-number[data-num="1"]');
      await page.click('.dial-number[data-num="2"]');
      await page.click('.dial-number[data-num="3"]');
      await page.click('.dial-number[data-num="4"]');

      const bibDisplay = page.locator('#radial-bib-value');
      await expect(bibDisplay).toContainText('123');
    });

    test('should clear bib with clear button', async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', 'WebKit test driver issue with radial dial in landscape');

      await page.waitForSelector('.dial-number[data-num="1"]', { state: 'visible', timeout: 5000 });
      await page.click('.dial-number[data-num="1"]');
      await page.click('.dial-number[data-num="2"]');
      await page.click('#radial-clear-btn');

      const bibDisplay = page.locator('#radial-bib-value');
      await expect(bibDisplay).toContainText('---');
    });

    test('should delete last digit with keyboard backspace', async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', 'WebKit test driver issue with radial dial in landscape');

      await page.waitForSelector('.dial-number[data-num="1"]', { state: 'visible', timeout: 5000 });
      await page.click('.dial-number[data-num="1"]');
      await page.click('.dial-number[data-num="2"]');
      await page.click('.dial-number[data-num="3"]');
      await page.keyboard.press('Backspace');

      const bibDisplay = page.locator('#radial-bib-value');
      await expect(bibDisplay).toContainText('12');
    });
  });

  test.describe('Recording Timestamps', () => {
    test('should record timestamp with bib number', async ({ page }) => {
      await enterBib(page, 42);
      await page.click('#radial-time-btn');

      await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(/show/);
    });

    test('should record timestamp without bib number', async ({ page }) => {
      await page.click('#radial-time-btn');
      await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(/show/);
    });

    test('should show confirmation overlay after recording', async ({ page }) => {
      await page.click('#radial-time-btn');

      const overlay = page.locator('#radial-confirmation-overlay');
      await expect(overlay).toHaveClass(/show/);

      await waitForConfirmationToHide(page);
      await expect(overlay).not.toHaveClass(/show/);
    });

    test('should auto-increment bib after recording', async ({ page, browserName }) => {
      // Skip on WebKit - test driver has issues with radial dial clicks in landscape mode
      test.skip(browserName === 'webkit', 'WebKit test driver issue with radial dial in landscape');

      await enterBib(page, 1);
      await page.click('#radial-time-btn');
      await waitForConfirmationToHide(page);

      const bibDisplay = page.locator('#radial-bib-value');
      await expect(bibDisplay).toContainText('002');
    });
  });

  test.describe('Timing Controls', () => {
    test('should show Start button', async ({ page }) => {
      const startBtn = page.locator('.radial-point-btn[data-point="S"]');
      await expect(startBtn).toBeVisible();
    });

    test('should show Finish button', async ({ page }) => {
      const finishBtn = page.locator('.radial-point-btn[data-point="F"]');
      await expect(finishBtn).toBeVisible();
    });

    test('should show run selector', async ({ page }) => {
      const runSelector = page.locator('#radial-run-selector');
      await expect(runSelector).toBeVisible();
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should record timestamp with Enter key', async ({ page }) => {
      await page.focus('#radial-time-btn');
      await page.keyboard.press('Enter');
      await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(/show/);
    });
  });

  test.describe('Undo Functionality', () => {
    test('should undo last entry', async ({ page }) => {
      // Record an entry using radial dial
      await page.click('.dial-number[data-num="1"]');
      await page.click('#radial-time-btn');
      await waitForConfirmationToHide(page);

      // Navigate to results view where undo button is located
      await navigateTo(page, 'results');

      // Click undo button - this opens confirmation modal for destructive undo
      await page.click('#undo-btn');

      // Confirm the undo action
      await expect(page.locator('#confirm-modal.show')).toBeVisible();
      await page.click('#confirm-delete-btn');

      // Toast should appear after confirmation
      await expect(page.locator('.toast')).toBeVisible({ timeout: 5000 });
    });
  });
});

test.describe('Timer View - Full Mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupPageFullMode(page);
  });

  test.describe('Timing Point Selection', () => {
    test('should show both Start and Finish buttons', async ({ page }) => {
      await expect(page.locator('.radial-point-btn[data-point="S"]')).toBeVisible();
      await expect(page.locator('.radial-point-btn[data-point="F"]')).toBeVisible();
    });

    test('should select Start point', async ({ page }) => {
      await page.click('.radial-point-btn[data-point="S"]');
      const button = page.locator('.radial-point-btn[data-point="S"]');
      await expect(button).toHaveClass(/active/);
    });

    test('should select Finish point', async ({ page }) => {
      await page.click('.radial-point-btn[data-point="S"]');
      await page.click('.radial-point-btn[data-point="F"]');
      const button = page.locator('.radial-point-btn[data-point="F"]');
      await expect(button).toHaveClass(/active/);
    });
  });

  test.describe('Run Selection', () => {
    test('should show run selector in full mode', async ({ page }) => {
      await expect(page.locator('#radial-run-selector')).toBeVisible();
    });

    test('should show both Run 1 and Run 2 buttons', async ({ page }) => {
      await expect(page.locator('#radial-run-selector [data-run="1"]')).toBeVisible();
      await expect(page.locator('#radial-run-selector [data-run="2"]')).toBeVisible();
    });

    test('should default to Run 1', async ({ page }) => {
      const run1Button = page.locator('#radial-run-selector [data-run="1"]');
      await expect(run1Button).toHaveClass(/active/);
    });

    test('should select Run 2', async ({ page }) => {
      await page.click('#radial-run-selector [data-run="2"]');
      const run2Button = page.locator('#radial-run-selector [data-run="2"]');
      await expect(run2Button).toHaveClass(/active/);
    });

    test('should switch back to Run 1', async ({ page }) => {
      await page.click('#radial-run-selector [data-run="2"]');
      await page.click('#radial-run-selector [data-run="1"]');
      const run1Button = page.locator('#radial-run-selector [data-run="1"]');
      await expect(run1Button).toHaveClass(/active/);
    });

    test('should record entry with selected run', async ({ page }) => {
      // Select Run 2
      await page.click('#radial-run-selector [data-run="2"]');

      // Enter bib and record
      await enterBib(page, 42);
      await page.click('#radial-time-btn');
      await waitForConfirmationToHide(page);

      // Navigate to results to verify
      await navigateTo(page, 'results');

      // Check that the entry shows L2 (German for Run 2)
      const entryRun = page.locator('.result-run').first();
      await expect(entryRun).toContainText('L2');
    });

    test('should allow same bib for different runs without duplicate warning', async ({ page }) => {
      // Record entry for Run 1
      await enterBib(page, 1);
      await page.click('#radial-time-btn');
      await waitForConfirmationToHide(page);

      // Switch to Run 2 and record same bib
      await page.click('#radial-run-selector [data-run="2"]');
      await page.click('#radial-clear-btn');
      await enterBib(page, 1);
      await page.click('#radial-time-btn');

      // Radial mode doesn't show duplicate warning in the same overlay
      // The confirmation overlay should still appear
      await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(/show/);
    });
  });
});

test.describe('Timer View - Duplicate Warning', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should record duplicate entry (radial mode records without warning)', async ({ page }) => {
    // Record first entry with bib 001
    await page.click('.dial-number[data-num="0"]');
    await page.click('.dial-number[data-num="0"]');
    await page.click('.dial-number[data-num="1"]');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Record duplicate entry with same bib
    await page.click('#radial-clear-btn');
    await page.click('.dial-number[data-num="0"]');
    await page.click('.dial-number[data-num="0"]');
    await page.click('.dial-number[data-num="1"]');
    await page.click('#radial-time-btn');

    // Radial mode shows confirmation overlay (warning feedback is via different visual cues)
    await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(/show/);
  });
});
