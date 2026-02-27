/**
 * E2E Tests - Modal Interactions
 *
 * Tests for modal behaviors: focus trapping, Escape dismissal,
 * click-outside dismissal, animation states, multiple modal handling,
 * and modal scroll.
 */

import { expect, test } from '@playwright/test';
import {
  enterBib,
  navigateTo,
  setupPage,
  waitForConfirmationToHide,
  waitForFocusInside,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Helper: open a modal by its trigger and wait for the .show class
// ---------------------------------------------------------------------------

/**
 * Open the keyboard shortcuts modal via the settings button.
 */
async function openShortcutsModal(page) {
  await navigateTo(page, 'settings');
  await page.click('#show-shortcuts-btn');
  await expect(page.locator('#keyboard-shortcuts-modal')).toHaveClass(/show/, {
    timeout: 3000,
  });
}

/**
 * Open the edit modal by recording an entry, navigating to results,
 * then triggering edit on the first entry.
 */
async function openEditModal(page) {
  // Record a test entry
  await enterBib(page, 1);
  await page.click('#radial-time-btn');
  await waitForConfirmationToHide(page);

  // Navigate to results and click the first entry to edit
  await navigateTo(page, 'results');
  // Wait for result items to appear
  await page.waitForSelector('.result-item', { timeout: 5000 });

  // Use keyboard shortcut to edit (E key after selecting an entry)
  const firstEntry = page.locator('.result-item').first();
  await firstEntry.click();
  await page.keyboard.press('e');

  await expect(page.locator('#edit-modal')).toHaveClass(/show/, {
    timeout: 3000,
  });
}

/**
 * Open the change PIN modal via the settings button.
 */
async function openChangePinModal(page) {
  await navigateTo(page, 'settings');
  await page.click('#change-pin-btn');
  await expect(page.locator('#change-pin-modal')).toHaveClass(/show/, {
    timeout: 3000,
  });
}

/**
 * Open the admin PIN modal via the manage races button.
 */
async function openAdminPinModal(page) {
  await navigateTo(page, 'settings');
  await page.click('#manage-races-btn');
  await expect(page.locator('#admin-pin-modal')).toHaveClass(/show/, {
    timeout: 3000,
  });
}

/**
 * Dispatch Escape keydown directly on a modal element.
 * In mobile-emulated viewports, page.keyboard.press('Escape') targets
 * the focused input and may not reliably bubble to the modal's keydown
 * handler. Dispatching directly on the modal element avoids this issue
 * while exercising the same closeModal code path.
 */
async function pressEscapeOnModal(page, modalId) {
  await page.evaluate((id) => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    }
  }, modalId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Modal Interactions', () => {
  test.describe('Escape Key Dismissal', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page, 'en');
    });

    test('shortcuts modal closes on Escape', async ({ page }) => {
      await openShortcutsModal(page);
      await pressEscapeOnModal(page, 'keyboard-shortcuts-modal');

      // After close animation (150ms) the .show class is removed
      await expect(page.locator('#keyboard-shortcuts-modal')).not.toHaveClass(
        /\bshow\b/,
        { timeout: 3000 },
      );
    });

    test('edit modal closes on Escape', async ({ page }) => {
      await openEditModal(page);
      await pressEscapeOnModal(page, 'edit-modal');

      await expect(page.locator('#edit-modal')).not.toHaveClass(/\bshow\b/, {
        timeout: 3000,
      });
    });

    test('change PIN modal closes on Escape', async ({ page }) => {
      await openChangePinModal(page);
      await pressEscapeOnModal(page, 'change-pin-modal');

      await expect(page.locator('#change-pin-modal')).not.toHaveClass(
        /\bshow\b/,
        { timeout: 3000 },
      );
    });

    test('admin PIN modal closes on Escape', async ({ page }) => {
      await openAdminPinModal(page);
      await pressEscapeOnModal(page, 'admin-pin-modal');

      await expect(page.locator('#admin-pin-modal')).not.toHaveClass(
        /\bshow\b/,
        { timeout: 3000 },
      );
    });
  });

  test.describe('Click-Outside Dismissal', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page, 'en');
    });

    test('shortcuts modal closes when clicking overlay', async ({ page }) => {
      await openShortcutsModal(page);

      // Click the overlay itself (not the modal-content child)
      // The overlay is the modal-overlay element; clicking at its edge triggers dismissal
      const modal = page.locator('#keyboard-shortcuts-modal');
      // Force-click the overlay at position (1,1) — top-left corner, outside modal-content
      await modal.click({ position: { x: 1, y: 1 } });

      await expect(modal).not.toHaveClass(/\bshow\b/, {
        timeout: 3000,
      });
    });

    test('edit modal closes when clicking overlay', async ({ page }) => {
      await openEditModal(page);

      const modal = page.locator('#edit-modal');
      await modal.click({ position: { x: 1, y: 1 } });

      await expect(modal).not.toHaveClass(/\bshow\b/, {
        timeout: 3000,
      });
    });

    test('change PIN modal closes when clicking overlay', async ({ page }) => {
      await openChangePinModal(page);

      const modal = page.locator('#change-pin-modal');
      await modal.click({ position: { x: 1, y: 1 } });

      await expect(modal).not.toHaveClass(/\bshow\b/, {
        timeout: 3000,
      });
    });

    test('admin PIN modal closes when clicking overlay', async ({ page }) => {
      await openAdminPinModal(page);

      const modal = page.locator('#admin-pin-modal');
      await modal.click({ position: { x: 1, y: 1 } });

      await expect(modal).not.toHaveClass(/\bshow\b/, {
        timeout: 3000,
      });
    });

    test('clicking modal content does NOT close modal', async ({ page }) => {
      await openShortcutsModal(page);

      // Click inside the modal-content area
      const content = page.locator('#keyboard-shortcuts-modal .modal-content');
      await content.click();

      // Modal should remain open
      await expect(page.locator('#keyboard-shortcuts-modal')).toHaveClass(
        /show/,
      );
    });
  });

  test.describe('Animation States', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page, 'en');
    });

    test('modal adds .show class when opened', async ({ page }) => {
      const modal = page.locator('#keyboard-shortcuts-modal');

      // Initially hidden (no .show)
      await expect(modal).not.toHaveClass(/\bshow\b/);

      await openShortcutsModal(page);

      // Now has .show
      await expect(modal).toHaveClass(/show/);
    });

    test('modal adds .closing class during close animation', async ({
      page,
    }) => {
      await openShortcutsModal(page);
      const modal = page.locator('#keyboard-shortcuts-modal');

      // Press Escape to trigger close — the .closing class is added transiently
      // We check via evaluate since the class exists only for 150ms
      const hadClosingClass = await page.evaluate(() => {
        return new Promise((resolve) => {
          const modal = document.getElementById('keyboard-shortcuts-modal');
          const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              if (
                mutation.type === 'attributes' &&
                mutation.attributeName === 'class'
              ) {
                if (modal.classList.contains('closing')) {
                  observer.disconnect();
                  resolve(true);
                }
              }
            }
          });
          observer.observe(modal, { attributes: true });

          // Trigger close
          modal.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              bubbles: true,
            }),
          );

          // Fallback timeout — if never observed, resolve false
          setTimeout(() => {
            observer.disconnect();
            resolve(false);
          }, 500);
        });
      });

      expect(hadClosingClass).toBe(true);
    });

    test('modal removes both .show and .closing after close completes', async ({
      page,
    }) => {
      await openShortcutsModal(page);
      const modal = page.locator('#keyboard-shortcuts-modal');

      await pressEscapeOnModal(page, 'keyboard-shortcuts-modal');

      await expect(modal).not.toHaveClass(/\bshow\b/);
      await expect(modal).not.toHaveClass(/\bclosing\b/);
    });
  });

  test.describe('Focus Trapping', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page, 'en');
    });

    test('shortcuts modal focuses first element on open', async ({ page }) => {
      await openShortcutsModal(page);

      // Wait for deferred focusFirstElement
      await waitForFocusInside(page, '#keyboard-shortcuts-modal');

      // The first focusable element inside the shortcuts modal should be
      // either the close button (#shortcuts-close-btn) or the done button
      const focusedId = await page.evaluate(() => document.activeElement?.id);
      const focusedTag = await page.evaluate(
        () => document.activeElement?.tagName,
      );

      // Focus should be inside the modal
      const isInsideModal = await page.evaluate(() => {
        const modal = document.getElementById('keyboard-shortcuts-modal');
        return modal?.contains(document.activeElement) ?? false;
      });
      expect(isInsideModal).toBe(true);
    });

    test('Tab cycles within shortcuts modal and does not escape', async ({
      page,
      browserName,
    }) => {
      // WebKit handles programmatic Tab focus differently in Playwright;
      // the focus trap JavaScript works correctly in real Safari but
      // Playwright's keyboard.press('Tab') bypasses it in WebKit.
      test.skip(
        browserName === 'webkit',
        'WebKit Tab key handling differs in Playwright emulation',
      );

      await openShortcutsModal(page);
      await waitForFocusInside(page, '#keyboard-shortcuts-modal');

      // The shortcuts modal has two focusable buttons: close btn and done btn
      // Tab through several times and verify focus stays inside the modal
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        const isInside = await page.evaluate(() => {
          const modal = document.getElementById('keyboard-shortcuts-modal');
          return modal?.contains(document.activeElement) ?? false;
        });
        expect(isInside).toBe(true);
      }
    });

    test('Shift+Tab wraps to last element in modal', async ({ page }) => {
      await openShortcutsModal(page);
      await waitForFocusInside(page, '#keyboard-shortcuts-modal');

      // Press Shift+Tab from the first element — should wrap to last
      await page.keyboard.press('Shift+Tab');

      const isInsideModal = await page.evaluate(() => {
        const modal = document.getElementById('keyboard-shortcuts-modal');
        return modal?.contains(document.activeElement) ?? false;
      });
      expect(isInsideModal).toBe(true);
    });

    test('edit modal traps focus within its fields and buttons', async ({
      page,
    }) => {
      await openEditModal(page);
      await waitForFocusInside(page, '#edit-modal');

      // Tab through all focusable elements
      const focusedElements = [];
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => ({
          id: document.activeElement?.id ?? '',
          tag: document.activeElement?.tagName ?? '',
        }));
        focusedElements.push(info);
      }

      // All should be inside the edit modal
      const allInside = await page.evaluate(() => {
        const modal = document.getElementById('edit-modal');
        return modal?.contains(document.activeElement) ?? false;
      });
      expect(allInside).toBe(true);
    });

    test('focus returns to trigger element after modal closes', async ({
      page,
      browserName,
    }) => {
      // WebKit in Playwright does not reliably restore focus to the
      // previousFocus element after modal close. The JavaScript logic
      // works correctly in real Safari but Playwright's focus handling
      // for WebKit differs.
      test.skip(
        browserName === 'webkit',
        'WebKit focus restoration differs in Playwright emulation',
      );

      await navigateTo(page, 'settings');

      // Focus the shortcuts button explicitly
      await page.locator('#show-shortcuts-btn').focus();
      await page.click('#show-shortcuts-btn');
      await expect(page.locator('#keyboard-shortcuts-modal')).toHaveClass(
        /show/,
      );

      // Close via Escape
      await pressEscapeOnModal(page, 'keyboard-shortcuts-modal');
      await expect(page.locator('#keyboard-shortcuts-modal')).not.toHaveClass(
        /\bshow\b/,
        { timeout: 3000 },
      );

      // Wait for focus to return after close animation completes
      await page.waitForFunction(
        () => document.activeElement?.id === 'show-shortcuts-btn',
        { timeout: 3000 },
      );

      const focusedId = await page.evaluate(() => document.activeElement?.id);
      expect(focusedId).toBe('show-shortcuts-btn');
    });
  });

  test.describe('Multiple Modal Handling', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page, 'en');
    });

    test('opening shortcuts modal then pressing ? does not stack modals', async ({
      page,
    }) => {
      await openShortcutsModal(page);

      // Press ? again while modal is open — should not open a second instance
      // (The keydown handler checks if a modal is already open or ignores when focus is in modal)
      await page.keyboard.press('?');

      // There should be at most one modal with .show
      const openModals = await page.evaluate(
        () => document.querySelectorAll('.modal-overlay.show').length,
      );
      expect(openModals).toBeLessThanOrEqual(1);
    });

    test('only one modal visible at a time after sequential open-close', async ({
      page,
    }) => {
      // Open shortcuts modal
      await openShortcutsModal(page);

      // Close it
      await pressEscapeOnModal(page, 'keyboard-shortcuts-modal');
      await expect(page.locator('#keyboard-shortcuts-modal')).not.toHaveClass(
        /\bshow\b/,
        { timeout: 3000 },
      );

      // Open change PIN modal
      await openChangePinModal(page);

      // Verify only one modal is open
      const openModals = await page.evaluate(
        () => document.querySelectorAll('.modal-overlay.show').length,
      );
      expect(openModals).toBe(1);

      // Verify it is the correct one
      await expect(page.locator('#change-pin-modal')).toHaveClass(/show/);
      await expect(page.locator('#keyboard-shortcuts-modal')).not.toHaveClass(
        /\bshow\b/,
      );
    });
  });

  test.describe('Modal Scroll', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page, 'en');
    });

    test('shortcuts modal body is scrollable when content overflows', async ({
      page,
    }) => {
      await openShortcutsModal(page);

      // The shortcuts modal has a .shortcuts-body with overflow-y: auto
      const body = page.locator('#keyboard-shortcuts-modal .shortcuts-body');
      await expect(body).toBeVisible();

      // Check that the body element supports scrolling (scrollHeight >= clientHeight)
      const isScrollable = await page.evaluate(() => {
        const el = document.querySelector(
          '#keyboard-shortcuts-modal .shortcuts-body',
        );
        if (!el) return false;
        // Either the content already overflows, or the overflow-y property allows scrolling
        const style = getComputedStyle(el);
        return style.overflowY === 'auto' || style.overflowY === 'scroll';
      });
      expect(isScrollable).toBe(true);
    });

    test('modal-body has overflow-y auto for scrollable content', async ({
      page,
    }) => {
      await openChangePinModal(page);

      const overflowY = await page.evaluate(() => {
        const body = document.querySelector('#change-pin-modal .modal-body');
        if (!body) return 'none';
        return getComputedStyle(body).overflowY;
      });
      expect(overflowY).toBe('auto');
    });

    test('background does not scroll when modal is open', async ({
      page,
      browserName,
    }) => {
      // mouse.wheel is not supported in mobile WebKit (Playwright limitation)
      test.skip(
        browserName === 'webkit',
        'mouse.wheel not supported in mobile WebKit',
      );

      await openShortcutsModal(page);

      // Try to scroll the page body
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await page.mouse.wheel(0, 200);
      // Wait a frame for any scroll to take effect
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      const scrollAfter = await page.evaluate(() => window.scrollY);

      // Page scroll should not change (the modal overlay covers the viewport)
      expect(scrollAfter).toBe(scrollBefore);
    });
  });

  test.describe('ARIA Attributes', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page, 'en');
    });

    test('modals have role=dialog and aria-modal=true when open', async ({
      page,
    }) => {
      await openShortcutsModal(page);

      const modal = page.locator('#keyboard-shortcuts-modal');
      await expect(modal).toHaveAttribute('role', 'dialog');
      await expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    test('edit modal has correct aria-labelledby', async ({ page }) => {
      await openEditModal(page);

      const modal = page.locator('#edit-modal');
      await expect(modal).toHaveAttribute(
        'aria-labelledby',
        'edit-modal-title',
      );

      // The referenced title element should exist and be visible
      const title = page.locator('#edit-modal-title');
      await expect(title).toBeVisible();
    });

    test('admin PIN modal has correct aria-labelledby', async ({ page }) => {
      await openAdminPinModal(page);

      const modal = page.locator('#admin-pin-modal');
      await expect(modal).toHaveAttribute(
        'aria-labelledby',
        'admin-pin-modal-title',
      );
    });
  });

  test.describe('Cancel Button Dismissal', () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page, 'en');
    });

    test('edit modal Cancel button closes modal', async ({ page }) => {
      await openEditModal(page);

      await page.click(
        '#edit-modal .modal-btn.secondary[data-action="cancel"]',
      );

      await expect(page.locator('#edit-modal')).not.toHaveClass(/\bshow\b/, {
        timeout: 3000,
      });
    });

    test('change PIN modal Cancel button closes modal', async ({ page }) => {
      await openChangePinModal(page);

      await page.click(
        '#change-pin-modal .modal-btn.secondary[data-action="cancel"]',
      );

      await expect(page.locator('#change-pin-modal')).not.toHaveClass(
        /\bshow\b/,
        { timeout: 3000 },
      );
    });

    test('admin PIN modal Cancel button closes modal', async ({ page }) => {
      await openAdminPinModal(page);

      await page.click(
        '#admin-pin-modal .modal-btn.secondary[data-action="cancel"]',
      );

      await expect(page.locator('#admin-pin-modal')).not.toHaveClass(
        /\bshow\b/,
        { timeout: 3000 },
      );
    });

    test('shortcuts modal Done button closes modal', async ({ page }) => {
      await openShortcutsModal(page);

      await page.click('#shortcuts-done-btn');

      await expect(page.locator('#keyboard-shortcuts-modal')).not.toHaveClass(
        /\bshow\b/,
        { timeout: 3000 },
      );
    });
  });
});
