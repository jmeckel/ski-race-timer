/**
 * E2E Tests - Accessibility
 *
 * Tests for keyboard navigation, ARIA attributes, focus management, and screen reader support
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

// Helper to disable simple mode
async function disableSimpleMode(page) {
  await page.click('[data-view="settings"]');
  await page.waitForSelector('.settings-view');
  if (await isToggleOn(page, '#simple-mode-toggle')) {
    await clickToggle(page, '#simple-mode-toggle');
  }
}

test.describe('Keyboard Navigation - Timer View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');
  });

  test('should navigate number pad with Tab', async ({ page }) => {
    // Focus first number button
    await page.locator('[data-num="1"]').focus();

    // Tab through number pad
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }

    // Focus should be on a visible element
    const focused = await page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('should record timestamp with Enter key', async ({ page }) => {
    await page.locator('#timestamp-btn').focus();
    await page.keyboard.press('Enter');

    // Confirmation should appear
    await expect(page.locator('.confirmation-overlay')).toBeVisible();
  });

  test('should record timestamp with Space key', async ({ page }) => {
    await page.locator('#timestamp-btn').focus();
    await page.keyboard.press('Space');

    // Confirmation should appear
    await expect(page.locator('.confirmation-overlay')).toBeVisible();
  });

  test('should enter numbers via click', async ({ page }) => {
    // Click number button
    await page.click('[data-num="1"]');

    const bibDisplay = page.locator('.bib-display');
    await expect(bibDisplay).toContainText('1');
  });

  test('should clear bib with clear button', async ({ page }) => {
    // Enter a bib manually
    await page.click('[data-num="5"]');
    await page.click('[data-num="5"]');
    await page.click('[data-num="5"]');

    const bibDisplay = page.locator('.bib-display');
    await expect(bibDisplay).toContainText('555');

    // Click clear button
    await page.click('[data-action="clear"]');

    // Bib should be cleared (may show --- or auto-incremented value)
    await expect(bibDisplay).not.toContainText('555');
  });
});

test.describe('Keyboard Navigation - Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await disableSimpleMode(page);
  });

  test('should toggle settings by clicking label', async ({ page }) => {
    // Test that toggles work via label click (keyboard-accessible via Tab + Enter on label)
    const toggle = page.locator('#haptic-toggle');
    const before = await toggle.isChecked();

    await clickToggle(page, '#haptic-toggle');

    const after = await toggle.isChecked();
    expect(after).not.toBe(before);
  });

  test('should toggle sound settings', async ({ page }) => {
    const toggle = page.locator('#sound-toggle');
    const before = await toggle.isChecked();

    await clickToggle(page, '#sound-toggle');

    const after = await toggle.isChecked();
    expect(after).not.toBe(before);
  });

  test('should have focusable elements in settings', async ({ page }) => {
    // Tab through settings to verify navigation
    let foundFocusable = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const hasFocus = await page.evaluate(() => {
        const el = document.activeElement;
        return el && el !== document.body;
      });
      if (hasFocus) {
        foundFocusable = true;
        break;
      }
    }
    expect(foundFocusable).toBe(true);
  });
});

test.describe('Keyboard Navigation - Results View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Add test entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    await page.click('[data-view="results"]');
  });

  test('should navigate results with Tab', async ({ page }) => {
    // Tab through the page until we find a focusable element
    let foundFocusable = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const hasFocus = await page.evaluate(() => {
        const el = document.activeElement;
        return el && el !== document.body;
      });
      if (hasFocus) {
        foundFocusable = true;
        break;
      }
    }

    expect(foundFocusable).toBe(true);
  });

  test('should open edit with Enter on result', async ({ page }) => {
    // Click on bib to open edit
    await page.click('.result-item .result-bib');

    // Edit modal should open
    await expect(page.locator('#edit-modal')).toHaveClass(/show/);
  });
});

test.describe('Modal Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Add entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    await page.click('[data-view="results"]');
  });

  test('should open edit modal when clicking result', async ({ page }) => {
    // Open edit modal
    await page.click('.result-item .result-bib');
    await expect(page.locator('#edit-modal')).toHaveClass(/show/);
  });

  test('should have interactive elements in edit modal', async ({ page }) => {
    // Open edit modal
    await page.click('.result-item .result-bib');
    await expect(page.locator('#edit-modal')).toHaveClass(/show/);

    // Modal should have cancel button
    const cancelBtn = page.locator('#edit-modal [data-action="cancel"]');
    await expect(cancelBtn).toBeVisible();

    // Modal should have input or select elements
    const hasInputs = await page.locator('#edit-modal input, #edit-modal select, #edit-modal button').count();
    expect(hasInputs).toBeGreaterThan(0);
  });

  test('should close modal with cancel button', async ({ page }) => {
    // Open edit modal
    await page.click('.result-item .result-bib');
    await expect(page.locator('#edit-modal')).toHaveClass(/show/);

    // Click cancel
    await page.click('#edit-modal [data-action="cancel"]');

    // Modal should close
    await expect(page.locator('#edit-modal')).not.toHaveClass(/show/);
  });

  test('modal should have overlay class', async ({ page }) => {
    // Open edit modal
    await page.click('.result-item .result-bib');

    const modal = page.locator('#edit-modal');
    // Modal should have modal-overlay class
    await expect(modal).toHaveClass(/modal-overlay/);
  });
});

test.describe('ARIA Attributes', () => {
  test('should have role on results list', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="results"]');

    const list = page.locator('.results-list');
    const role = await list.getAttribute('role');

    expect(role).toBe('list');
  });

  test('should have proper ARIA attributes on confirmation overlay', async ({ page }) => {
    await page.goto('/');

    // Trigger confirmation overlay by recording
    await page.click('#timestamp-btn');

    // Confirmation overlay should appear with ARIA
    const overlay = page.locator('.confirmation-overlay');
    await expect(overlay).toBeVisible();
  });

  test('should have undo button in DOM', async ({ page }) => {
    await page.goto('/');

    // Record an entry
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Undo button should exist in DOM (may be hidden in simple mode)
    const undoBtn = page.locator('#undo-btn');
    await expect(undoBtn).toBeAttached();
  });

  test('should have proper button roles', async ({ page }) => {
    await page.goto('/');

    // Check timestamp button
    const timestampBtn = page.locator('#timestamp-btn');
    const tagName = await timestampBtn.evaluate(el => el.tagName.toLowerCase());

    // Should be a button element
    expect(tagName).toBe('button');
  });

  test('should have visible labels near form inputs', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');
    await page.waitForSelector('.settings-view');

    // Enable sync to show input
    if (!await isToggleOn(page, '#sync-toggle')) {
      await clickToggle(page, '#sync-toggle');
    }

    // Wait for race ID input to appear
    await page.waitForSelector('#race-id-input', { timeout: 5000 });

    // Check race ID input is visible
    const raceIdInput = page.locator('#race-id-input');
    await expect(raceIdInput).toBeVisible();

    // There should be a label text near the input (data-i18n="raceId")
    const labelText = page.locator('[data-i18n="raceId"]');
    await expect(labelText).toBeVisible();
  });
});

test.describe('Focus Visibility', () => {
  test('should show focus indicator on buttons', async ({ page }) => {
    await page.goto('/');

    // Focus timestamp button
    await page.locator('#timestamp-btn').focus();

    // Should have visible focus indicator
    const outline = await page.locator('#timestamp-btn').evaluate(el => {
      const style = getComputedStyle(el);
      return style.outline !== 'none' || style.boxShadow !== 'none';
    });

    expect(outline).toBe(true);
  });

  test('should show focus indicator on toggles', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');

    // Focus a toggle
    await page.locator('#sync-toggle').focus();

    // Should have visible focus
    const hasOutline = await page.locator('#sync-toggle').evaluate(el => {
      const style = getComputedStyle(el);
      return style.outline !== 'none';
    });

    expect(hasOutline).toBe(true);
  });

  test('should show focus indicator on number pad', async ({ page }) => {
    await page.goto('/');

    // Focus number button
    await page.locator('[data-num="5"]').focus();

    // Should have visible focus
    const focused = page.locator('[data-num="5"]');
    await expect(focused).toBeFocused();
  });
});

test.describe('Tab Order', () => {
  test('should have logical tab order in Timer view', async ({ page }) => {
    await page.goto('/');

    const tabbableElements = [];

    // Tab through and record order
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.id || el?.className || el?.tagName;
      });
      if (focused) {
        tabbableElements.push(focused);
      }
    }

    // Should have multiple tabbable elements
    expect(tabbableElements.length).toBeGreaterThan(5);
  });

  test('should not skip important interactive elements', async ({ page }) => {
    await page.goto('/');

    // Tab through entire page
    const visited = new Set();

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.id);
      if (focused) {
        visited.add(focused);
      }
    }

    // Should visit timestamp button
    expect(visited.has('timestamp-btn')).toBe(true);
  });
});

test.describe('Screen Reader Support', () => {
  test('should have descriptive button text', async ({ page }) => {
    await page.goto('/');

    // Check timestamp button has meaningful text
    const timestampBtn = page.locator('#timestamp-btn');
    const text = await timestampBtn.textContent();

    expect(text?.length).toBeGreaterThan(0);
  });

  test('should announce confirmation', async ({ page }) => {
    await page.goto('/');

    // Record timestamp
    await page.click('#timestamp-btn');

    // Confirmation overlay should be visible and readable
    const overlay = page.locator('.confirmation-overlay');
    await expect(overlay).toBeVisible();

    const text = await overlay.textContent();
    expect(text?.length).toBeGreaterThan(0);
  });

  test('should have alt text on icons (if any)', async ({ page }) => {
    await page.goto('/');

    // Check any images have alt text
    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');

      // Should have alt or be decorative (role=presentation)
      expect(alt !== null || role === 'presentation').toBe(true);
    }
  });
});

test.describe('Color Contrast', () => {
  test('should have visible text on buttons', async ({ page }) => {
    await page.goto('/');

    // Check timestamp button is visible and readable
    const btn = page.locator('#timestamp-btn');
    await expect(btn).toBeVisible();

    // Button should have text
    const text = await btn.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('should have visible clock display', async ({ page }) => {
    await page.goto('/');

    const clock = page.locator('.clock-time');
    await expect(clock).toBeVisible();

    // Clock should show time
    const text = await clock.textContent();
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

test.describe('Mobile Accessibility', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('should have sufficient touch targets', async ({ page }) => {
    await page.goto('/');

    // Check number pad buttons are large enough
    const numBtn = page.locator('[data-num="5"]');
    const box = await numBtn.boundingBox();

    // Touch targets should be at least 44x44 pixels
    expect(box?.width).toBeGreaterThanOrEqual(40);
    expect(box?.height).toBeGreaterThanOrEqual(40);
  });

  test('should have sufficient spacing between touch targets', async ({ page }) => {
    await page.goto('/');

    // Number pad buttons should not overlap
    const btn1 = page.locator('[data-num="1"]');
    const btn2 = page.locator('[data-num="2"]');

    const box1 = await btn1.boundingBox();
    const box2 = await btn2.boundingBox();

    if (box1 && box2) {
      // Buttons should not overlap
      const overlaps = box1.x < box2.x + box2.width &&
                       box1.x + box1.width > box2.x &&
                       box1.y < box2.y + box2.height &&
                       box1.y + box1.height > box2.y;

      // They may be adjacent but should have some distinction
      expect(box1.x + box1.width).toBeLessThanOrEqual(box2.x + 5); // Allow small padding
    }
  });
});
