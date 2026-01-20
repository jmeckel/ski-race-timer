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
      const clock = page.locator('.clock-time');
      const initialTime = await clock.textContent();

      await page.waitForTimeout(150);
      const newTime = await clock.textContent();

      expect(newTime).not.toBe(initialTime);
    });

    test('should display time in HH:MM:SS.mmm format', async ({ page }) => {
      const clock = page.locator('.clock-time');
      const time = await clock.textContent();
      expect(time).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    test('should display current date', async ({ page }) => {
      const date = page.locator('.clock-date');
      await expect(date).toBeVisible();
    });
  });

  test.describe('Bib Number Input', () => {
    test('should enter bib number via number pad', async ({ page }) => {
      await page.click('[data-num="1"]');
      await page.click('[data-num="2"]');
      await page.click('[data-num="3"]');

      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('123');
    });

    test('should limit bib to 3 digits', async ({ page }) => {
      await page.click('[data-num="1"]');
      await page.click('[data-num="2"]');
      await page.click('[data-num="3"]');
      await page.click('[data-num="4"]');

      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('123');
    });

    test('should clear bib with clear button', async ({ page }) => {
      await page.click('[data-num="1"]');
      await page.click('[data-num="2"]');
      await page.click('[data-action="clear"]');

      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('---');
    });

    test('should delete last digit with delete button', async ({ page }) => {
      await page.click('[data-num="1"]');
      await page.click('[data-num="2"]');
      await page.click('[data-num="3"]');
      await page.click('[data-action="delete"]');

      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('12');
    });
  });

  test.describe('Recording Timestamps', () => {
    test('should record timestamp with bib number', async ({ page }) => {
      await enterBib(page, 42);
      await page.click('#timestamp-btn');

      await expect(page.locator('.confirmation-overlay')).toBeVisible();
    });

    test('should record timestamp without bib number', async ({ page }) => {
      await page.click('#timestamp-btn');
      await expect(page.locator('.confirmation-overlay')).toBeVisible();
    });

    test('should show confirmation overlay after recording', async ({ page }) => {
      await page.click('#timestamp-btn');

      const overlay = page.locator('.confirmation-overlay');
      await expect(overlay).toBeVisible();

      await waitForConfirmationToHide(page);
      await expect(overlay).not.toBeVisible();
    });

    test('should auto-increment bib after recording', async ({ page }) => {
      await enterBib(page, 1);
      await page.click('#timestamp-btn');
      await waitForConfirmationToHide(page);

      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('002');
    });
  });

  test.describe('Timing Controls', () => {
    test('should show Start button', async ({ page }) => {
      const startBtn = page.locator('[data-point="S"]');
      await expect(startBtn).toBeVisible();
    });

    test('should show Finish button', async ({ page }) => {
      const finishBtn = page.locator('[data-point="F"]');
      await expect(finishBtn).toBeVisible();
    });

    test('should show run selector', async ({ page }) => {
      const runSelector = page.locator('.run-selector');
      await expect(runSelector).toBeVisible();
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should record timestamp with Enter key', async ({ page }) => {
      await page.focus('#timestamp-btn');
      await page.keyboard.press('Enter');
      await expect(page.locator('.confirmation-overlay')).toBeVisible();
    });
  });

  test.describe('Undo Functionality', () => {
    test('should undo last entry', async ({ page }) => {
      // Record an entry
      await page.click('[data-num="1"]');
      await page.click('#timestamp-btn');
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
      await expect(page.locator('[data-point="S"]')).toBeVisible();
      await expect(page.locator('[data-point="F"]')).toBeVisible();
    });

    test('should select Start point', async ({ page }) => {
      await page.click('[data-point="S"]');
      const button = page.locator('[data-point="S"]');
      await expect(button).toHaveClass(/active/);
    });

    test('should select Finish point', async ({ page }) => {
      await page.click('[data-point="S"]');
      await page.click('[data-point="F"]');
      const button = page.locator('[data-point="F"]');
      await expect(button).toHaveClass(/active/);
    });
  });

  test.describe('Run Selection', () => {
    test('should show run selector in full mode', async ({ page }) => {
      await expect(page.locator('.run-selector')).toBeVisible();
    });

    test('should show both Run 1 and Run 2 buttons', async ({ page }) => {
      await expect(page.locator('.run-selector [data-run="1"]')).toBeVisible();
      await expect(page.locator('.run-selector [data-run="2"]')).toBeVisible();
    });

    test('should default to Run 1', async ({ page }) => {
      const run1Button = page.locator('.run-selector [data-run="1"]');
      await expect(run1Button).toHaveClass(/active/);
    });

    test('should select Run 2', async ({ page }) => {
      await page.click('.run-selector [data-run="2"]');
      const run2Button = page.locator('.run-selector [data-run="2"]');
      await expect(run2Button).toHaveClass(/active/);
    });

    test('should switch back to Run 1', async ({ page }) => {
      await page.click('.run-selector [data-run="2"]');
      await page.click('.run-selector [data-run="1"]');
      const run1Button = page.locator('.run-selector [data-run="1"]');
      await expect(run1Button).toHaveClass(/active/);
    });

    test('should record entry with selected run', async ({ page }) => {
      // Select Run 2
      await page.click('.run-selector [data-run="2"]');

      // Enter bib and record
      await enterBib(page, 42);
      await page.click('#timestamp-btn');
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
      await page.click('#timestamp-btn');
      await waitForConfirmationToHide(page);

      // Switch to Run 2 and record same bib
      await page.click('.run-selector [data-run="2"]');
      await page.click('[data-action="clear"]');
      await enterBib(page, 1);
      await page.click('#timestamp-btn');

      // Should NOT show duplicate warning (different run)
      const duplicateWarning = page.locator('.confirmation-duplicate');
      await expect(duplicateWarning).not.toBeVisible();
    });
  });
});

test.describe('Timer View - Duplicate Warning', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should show warning for duplicate entry', async ({ page }) => {
    // Record first entry with bib 001
    await page.click('[data-num="0"]');
    await page.click('[data-num="0"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await waitForConfirmationToHide(page);

    // Record duplicate entry with same bib
    await page.click('[data-action="clear"]');
    await page.click('[data-num="0"]');
    await page.click('[data-num="0"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');

    // Duplicate warning should be visible in the confirmation overlay
    const duplicateWarning = page.locator('.confirmation-duplicate');
    await expect(duplicateWarning).toBeVisible();
  });
});
