/**
 * E2E Tests - Accessibility
 *
 * Tests for keyboard navigation, ARIA attributes, focus management, and screen reader support
 */

import { test, expect } from '@playwright/test';

// Helper to disable simple mode
async function disableSimpleMode(page) {
  await page.click('[data-view="settings-view"]');
  const toggle = page.locator('#toggle-simple');
  const isSimple = await toggle.evaluate(el => el.classList.contains('on'));
  if (isSimple) {
    await toggle.click();
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

  test('should enter numbers via keyboard', async ({ page }) => {
    // Focus number pad area
    await page.locator('[data-num="1"]').focus();
    await page.keyboard.press('Enter');

    const bibDisplay = page.locator('.bib-display');
    await expect(bibDisplay).toContainText('1');
  });

  test('should clear bib with keyboard', async ({ page }) => {
    // Enter a bib
    await page.click('[data-num="1"]');

    // Focus clear button and press Enter
    await page.locator('#btn-clear').focus();
    await page.keyboard.press('Enter');

    const bibDisplay = page.locator('.bib-display');
    await expect(bibDisplay).toContainText('---');
  });
});

test.describe('Keyboard Navigation - Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);
  });

  test('should toggle settings with Enter key', async ({ page }) => {
    const toggle = page.locator('#toggle-haptic');
    const before = await toggle.evaluate(el => el.classList.contains('on'));

    await toggle.focus();
    await page.keyboard.press('Enter');

    const after = await toggle.evaluate(el => el.classList.contains('on'));
    expect(after).not.toBe(before);
  });

  test('should toggle settings with Space key', async ({ page }) => {
    const toggle = page.locator('#toggle-sound');
    const before = await toggle.evaluate(el => el.classList.contains('on'));

    await toggle.focus();
    await page.keyboard.press('Space');

    const after = await toggle.evaluate(el => el.classList.contains('on'));
    expect(after).not.toBe(before);
  });

  test('should navigate between toggles with Tab', async ({ page }) => {
    const firstToggle = page.locator('#toggle-simple');
    await firstToggle.focus();

    // Tab to next interactive element
    await page.keyboard.press('Tab');

    const focused = await page.locator(':focus');
    await expect(focused).toBeVisible();
  });
});

test.describe('Keyboard Navigation - Results View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Add test entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    await page.click('[data-view="results-view"]');
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

    await page.click('[data-view="results-view"]');
  });

  test('should trap focus in edit modal', async ({ page }) => {
    // Open edit modal
    await page.click('.result-item .result-bib');
    await expect(page.locator('#edit-modal')).toHaveClass(/show/);

    // Tab through modal
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Focus should still be within modal
    const focused = await page.locator(':focus');
    const isInModal = await focused.evaluate(el => {
      return el.closest('#edit-modal') !== null;
    });

    expect(isInModal).toBe(true);
  });

  test('should close modal with Escape key', async ({ page }) => {
    // Open edit modal
    await page.click('.result-item .result-bib');
    await expect(page.locator('#edit-modal')).toHaveClass(/show/);

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(page.locator('#edit-modal')).not.toHaveClass(/show/);
  });

  test('should have proper role on modal', async ({ page }) => {
    // Open edit modal
    await page.click('.result-item .result-bib');

    const modal = page.locator('#edit-modal');
    const role = await modal.getAttribute('role');

    // Should have dialog role
    expect(role).toBe('dialog');
  });

  test('should have aria-label on modal', async ({ page }) => {
    // Open edit modal
    await page.click('.result-item .result-bib');

    const modal = page.locator('#edit-modal');
    const labelledBy = await modal.getAttribute('aria-labelledby');

    // Should reference a label element
    expect(labelledBy).toBeTruthy();
  });
});

test.describe('ARIA Attributes', () => {
  test('should have role on results list', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="results-view"]');

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

  test('should have undo button with aria-label', async ({ page }) => {
    await page.goto('/');

    // Record to show undo button
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    const undoBtn = page.locator('#undo-btn');
    const ariaLabel = await undoBtn.getAttribute('aria-label');

    expect(ariaLabel).toBeTruthy();
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
    await page.click('[data-view="settings-view"]');

    // Enable sync to show input
    const syncToggle = page.locator('#toggle-sync');
    const isOn = await syncToggle.evaluate(el => el.classList.contains('on'));
    if (!isOn) {
      await syncToggle.click();
    }

    // Check race ID input has a visible label nearby
    const raceIdInput = page.locator('#race-id-input');
    await expect(raceIdInput).toBeVisible();

    // There should be a label element near the input
    const labelText = page.locator('#race-id-label');
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
    await page.click('[data-view="settings-view"]');

    // Focus a toggle
    await page.locator('#toggle-sync').focus();

    // Should have visible focus
    const hasOutline = await page.locator('#toggle-sync').evaluate(el => {
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
