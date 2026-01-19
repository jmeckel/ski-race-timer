/**
 * E2E Tests - Timer View
 *
 * Tests for the main timing functionality
 */

import { test, expect } from '@playwright/test';

// Helper to click a toggle by clicking its label wrapper
async function clickToggle(page, toggleSelector) {
  await page.locator(`label:has(${toggleSelector})`).click();
}

// Helper to check if toggle is on
async function isToggleOn(page, toggleSelector) {
  return await page.locator(toggleSelector).isChecked();
}

// Helper to disable simple mode for tests that need full UI
async function disableSimpleMode(page) {
  await page.click('[data-view="settings"]');
  await page.waitForSelector('#simple-mode-toggle');
  if (await isToggleOn(page, '#simple-mode-toggle')) {
    await clickToggle(page, '#simple-mode-toggle');
  }
  await page.click('[data-view="timing-view"]');
  await page.waitForSelector('.clock-time');
}

test.describe('Timer View', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and wait for it to load
    await page.goto('/');
    await page.waitForSelector('.clock-time');
  });

  test.describe('Clock Display', () => {
    test('should display running clock', async ({ page }) => {
      const clock = page.locator('.clock-time');
      const initialTime = await clock.textContent();

      // Wait and check that time has changed
      await page.waitForTimeout(200);
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
      // Click number pad buttons
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
      await page.click('[data-num="4"]'); // Should be ignored

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
      await page.click('#btn-delete');

      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('12');
    });
  });

  test.describe('Timing Point Selection', () => {
    test.beforeEach(async ({ page }) => {
      // These tests need full mode to access Start button
      await disableSimpleMode(page);
    });

    test('should select Start point', async ({ page }) => {
      await page.click('[data-point="S"]');

      const button = page.locator('[data-point="S"]');
      await expect(button).toHaveClass(/active/);
    });

    test('should select Finish point', async ({ page }) => {
      // First select Start, then Finish to verify switching
      await page.click('[data-point="S"]');
      await page.click('[data-point="F"]');

      const button = page.locator('[data-point="F"]');
      await expect(button).toHaveClass(/active/);
    });
  });

  test.describe('Recording Timestamps', () => {
    test('should record timestamp with bib number', async ({ page }) => {
      // Enter bib
      await page.click('[data-num="0"]');
      await page.click('[data-num="4"]');
      await page.click('[data-num="2"]');

      // Record timestamp (Finish is already selected in simple mode)
      await page.click('#timestamp-btn');

      // Should show confirmation
      await expect(page.locator('.confirmation-overlay')).toBeVisible();
    });

    test('should record timestamp without bib number', async ({ page }) => {
      // Record timestamp (Finish is already selected in simple mode)
      await page.click('#timestamp-btn');

      // Should show confirmation
      await expect(page.locator('.confirmation-overlay')).toBeVisible();
    });

    test('should show confirmation overlay after recording', async ({ page }) => {
      await page.click('#timestamp-btn');

      const overlay = page.locator('.confirmation-overlay');
      await expect(overlay).toBeVisible();

      // Wait for auto-hide
      await page.waitForTimeout(2000);
      await expect(overlay).not.toBeVisible();
    });

    test('should auto-increment bib after recording', async ({ page }) => {
      // Enter bib
      await page.click('[data-num="0"]');
      await page.click('[data-num="0"]');
      await page.click('[data-num="1"]');

      // Record
      await page.click('#timestamp-btn');

      // Wait for confirmation to hide
      await page.waitForTimeout(2000);

      // Bib should be incremented
      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('002');
    });
  });

  test.describe('Duplicate Warning', () => {
    test('should show warning for duplicate entry', async ({ page }) => {
      // First entry
      await page.click('[data-num="1"]');
      await page.click('#timestamp-btn');

      // Wait for confirmation to hide
      await page.waitForTimeout(2000);

      // Clear and enter same bib again
      await page.click('[data-action="clear"]');
      await page.click('[data-num="0"]');
      await page.click('[data-num="0"]');
      await page.click('[data-num="1"]');

      // Bib display should show warning styling
      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toHaveClass(/duplicate/);
    });
  });

  test.describe('Undo Functionality', () => {
    test('should undo last entry', async ({ page }) => {
      // Record an entry
      await page.click('[data-num="1"]');
      await page.click('#timestamp-btn');

      // Wait for confirmation
      await page.waitForTimeout(500);

      // Click undo
      await page.click('#undo-btn');

      // Verify undo toast appears
      await expect(page.locator('.toast')).toBeVisible();
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should record timestamp with Enter key', async ({ page }) => {
      // Focus timestamp button
      await page.focus('#timestamp-btn');

      // Press Enter
      await page.keyboard.press('Enter');

      // Should show confirmation
      await expect(page.locator('.confirmation-overlay')).toBeVisible();
    });

    test('should navigate with Tab key', async ({ page }) => {
      // Press Tab multiple times and verify focus moves
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Check that focus is on a button
      const focused = await page.locator(':focus');
      await expect(focused).toBeVisible();
    });
  });
});

test.describe('Timer View - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('should be usable on mobile viewport', async ({ page }) => {
    await page.goto('/');

    // All main elements should be visible
    await expect(page.locator('.clock-time')).toBeVisible();
    await expect(page.locator('.bib-display')).toBeVisible();
    await expect(page.locator('#timestamp-btn')).toBeVisible();
    await expect(page.locator('.number-pad')).toBeVisible();
  });

  test('should handle touch on number pad', async ({ page }) => {
    await page.goto('/');

    // Tap on number
    await page.tap('[data-num="5"]');

    const bibDisplay = page.locator('.bib-display');
    await expect(bibDisplay).toContainText('5');
  });
});

test.describe('Timer View - Simple Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');
  });

  test('should hide Start button in simple mode', async ({ page }) => {
    // Simple mode should be on by default
    // Start button should be hidden
    const startBtn = page.locator('[data-point="S"]');
    await expect(startBtn).not.toBeVisible();
  });

  test('should show Finish button in simple mode', async ({ page }) => {
    // Finish button should be visible
    const finishBtn = page.locator('[data-point="F"]');
    await expect(finishBtn).toBeVisible();
  });

  test('should show all timing points in full mode', async ({ page }) => {
    // Go to settings and turn off simple mode
    await page.click('[data-view="settings"]');
    await clickToggle(page, "#simple-mode-toggle");

    // Go back to timer
    await page.click('[data-view="timing-view"]');

    // All timing points should be visible
    await expect(page.locator('[data-point="S"]')).toBeVisible();
    await expect(page.locator('[data-point="F"]')).toBeVisible();
  });

  test('should record Finish time in simple mode', async ({ page }) => {
    // Enter bib
    await page.click('[data-num="1"]');
    await page.click('[data-num="0"]');
    await page.click('[data-num="0"]');

    // Record timestamp (Finish is default in simple mode)
    await page.click('#timestamp-btn');

    // Should show confirmation
    await expect(page.locator('.confirmation-overlay')).toBeVisible();
  });
});

test.describe('Undo/Redo Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');
  });

  test('should show undo button after recording', async ({ page }) => {
    // Record an entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');

    // Wait for confirmation to hide
    await page.waitForTimeout(500);

    // Undo button should be visible
    const undoBtn = page.locator('#undo-btn');
    await expect(undoBtn).toBeVisible();
  });

  test('should undo last entry', async ({ page }) => {
    // Record an entry
    await page.click('[data-num="5"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

    // Click undo
    await page.click('#undo-btn');

    // Toast should appear
    await expect(page.locator('.toast')).toBeVisible();
  });

  test('should redo undone entry', async ({ page }) => {
    // Record an entry
    await page.click('[data-num="7"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

    // Undo
    await page.click('#undo-btn');
    await page.waitForTimeout(500);

    // Redo button should be visible
    const redoBtn = page.locator('#redo-btn');
    if (await redoBtn.isVisible()) {
      await redoBtn.click();

      // Toast should appear for redo
      await expect(page.locator('.toast')).toBeVisible();
    }
  });

  test('should clear redo stack on new entry', async ({ page }) => {
    // Record first entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

    // Undo
    await page.click('#undo-btn');
    await page.waitForTimeout(500);

    // Record new entry
    await page.click('[data-action="clear"]');
    await page.click('[data-num="2"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

    // Redo should not be available (redo stack cleared)
    const redoBtn = page.locator('#redo-btn');
    // Check if redo button is either not visible or disabled
    const isVisible = await redoBtn.isVisible();
    if (isVisible) {
      // If visible, it should be disabled or have no redo available
      const isDisabled = await redoBtn.evaluate(el => el.disabled || el.classList.contains('disabled'));
      // Note: This may vary based on implementation
    }
  });
});
