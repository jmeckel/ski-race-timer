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

  test.describe('Simple Mode', () => {
    test('should hide Start button in simple mode', async ({ page }) => {
      const startBtn = page.locator('[data-point="S"]');
      await expect(startBtn).not.toBeVisible();
    });

    test('should show Finish button in simple mode', async ({ page }) => {
      const finishBtn = page.locator('[data-point="F"]');
      await expect(finishBtn).toBeVisible();
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

      // Click undo button
      await page.click('#undo-btn');
      await expect(page.locator('.toast')).toBeVisible();
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
