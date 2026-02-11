/**
 * E2E Tests - Race Management
 *
 * Tests for the admin race management functionality
 * NOTE: Some tests require a backend server running for PIN and race list APIs.
 */

import { expect, test } from '@playwright/test';
import { navigateTo, setupPage, setupPageFullMode } from './helpers.js';

// Skip tests that require backend API
const skipBackendTests = !process.env.BACKEND_TESTS;

// Helper to navigate to settings
async function goToSettings(page) {
  await navigateTo(page, 'settings');
}

test.describe('Race Management - Admin Section', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await goToSettings(page);
  });

  test('should display admin section in settings', async ({ page }) => {
    // Admin section should be visible
    await expect(page.locator('#change-pin-btn')).toBeVisible();
    await expect(page.locator('#manage-races-btn')).toBeVisible();
  });

  test('should have admin PIN button', async ({ page }) => {
    const pinBtn = page.locator('#change-pin-btn');
    await expect(pinBtn).toBeVisible();
    // Status should show "Not set" initially
    await expect(page.locator('#admin-pin-status')).toBeVisible();
  });

  test('should have manage races button', async ({ page }) => {
    const manageBtn = page.locator('#manage-races-btn');
    await expect(manageBtn).toBeVisible();
  });
});

test.describe('Race Management - Admin PIN', () => {
  // Helper to clear PIN and set up fresh state
  async function clearPinAndSetup(page) {
    await setupPage(page);
    // Clear all related localStorage items (PIN hash and auth token)
    await page.evaluate(() => {
      localStorage.removeItem('skiTimerAdminPin');
      localStorage.removeItem('skiTimerAuthToken');
    });
    // Reload to apply changes
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });
    await goToSettings(page);
  }

  test('should open change PIN modal when clicking set PIN button', async ({
    page,
  }) => {
    await clearPinAndSetup(page);
    await page.click('#change-pin-btn');

    // Change PIN modal should be visible
    const changePinModal = page.locator('#change-pin-modal');
    await expect(changePinModal).toHaveClass(/show/);

    // New PIN input should be visible
    await expect(page.locator('#new-pin-input')).toBeVisible();
    await expect(page.locator('#confirm-pin-input')).toBeVisible();
  });

  test('should save admin PIN via modal when no PIN set', async ({ page }) => {
    await clearPinAndSetup(page);

    // Verify no PIN is set
    const status = await page.locator('#admin-pin-status').textContent();
    if (
      status?.toLowerCase().includes('set') ||
      status?.toLowerCase().includes('gesetzt')
    ) {
      // Skip if PIN is already set (can't clear it properly)
      test.skip();
      return;
    }

    // Open change PIN modal
    await page.click('#change-pin-btn');
    await expect(page.locator('#change-pin-modal')).toHaveClass(/show/);

    // Enter new PIN
    await page.locator('#new-pin-input').fill('1234');
    await page.locator('#confirm-pin-input').fill('1234');
    await page.click('#save-pin-btn');

    // Wait and verify PIN was stored
    await page.waitForTimeout(500);
    const storedPin = await page.evaluate(() =>
      localStorage.getItem('skiTimerAdminPin'),
    );
    expect(storedPin).toBeTruthy();
  });

  test('should persist admin PIN across page reloads', async ({ page }) => {
    // This test requires backend API connectivity to save PIN
    test.skip(skipBackendTests, 'Requires backend server to save PIN');

    // Start with clean state - clear any existing PIN and auth token
    await clearPinAndSetup(page);

    // Set a custom PIN via modal
    await page.click('#change-pin-btn');

    // Wait for modal to open and inputs to be ready
    const modal = page.locator('#change-pin-modal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    const newPinInput = page.locator('#new-pin-input');
    const confirmPinInput = page.locator('#confirm-pin-input');
    await expect(newPinInput).toBeVisible({ timeout: 2000 });
    await expect(confirmPinInput).toBeVisible({ timeout: 2000 });

    // Fill in a custom PIN (different from default)
    await newPinInput.fill('9876');
    await confirmPinInput.fill('9876');

    // Click save and wait for modal to close
    await page.click('#save-pin-btn');
    await expect(modal).not.toHaveClass(/show/, { timeout: 5000 });

    // Wait for auth token to be stored (PIN save triggers authentication)
    await page.waitForTimeout(500);

    // Verify auth token exists (PIN was set successfully)
    const authToken = await page.evaluate(() =>
      localStorage.getItem('skiTimerAuthToken'),
    );
    expect(authToken).toBeTruthy();

    // Navigate away and back (instead of reload which triggers addInitScript)
    await navigateTo(page, 'timer');
    await navigateTo(page, 'settings');

    // Verify auth token persists after navigation
    const authTokenAfter = await page.evaluate(() =>
      localStorage.getItem('skiTimerAuthToken'),
    );
    expect(authTokenAfter).toBeTruthy();

    // Status should still show PIN is set
    const statusAfter = await page.locator('#admin-pin-status').textContent();
    expect(statusAfter?.toLowerCase()).toMatch(/set|gesetzt/);
  });

  test('should show error for mismatched PINs', async ({ page }) => {
    await clearPinAndSetup(page);

    // Check if PIN is already set
    const status = await page.locator('#admin-pin-status').textContent();
    const pinAlreadySet =
      status?.toLowerCase().includes('set') ||
      status?.toLowerCase().includes('gesetzt');

    if (pinAlreadySet) {
      // Skip when PIN is set - can't test mismatch without knowing current PIN
      test.skip();
      return;
    }

    await page.click('#change-pin-btn');

    // Enter mismatched PINs (only works when no PIN is set)
    await page.locator('#new-pin-input').fill('1234');
    await page.locator('#confirm-pin-input').fill('5678');
    await page.click('#save-pin-btn');

    // Error should be visible (wait a bit for validation)
    await page.waitForTimeout(300);
    const mismatchVisible = await page
      .locator('#pin-mismatch-error')
      .isVisible();
    expect(mismatchVisible).toBeTruthy();
  });
});

test.describe('Race Management - PIN Verification Modal', () => {
  test.beforeEach(async ({ page }) => {
    // Set up admin PIN
    await setupPage(page);
    await page.evaluate(() => {
      // Set a known PIN hash (for "1234")
      const hash = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
          h = (h << 5) - h + str.charCodeAt(i);
          h = h & h;
        }
        return h.toString(36);
      };
      localStorage.setItem('skiTimerAdminPin', hash('1234'));
    });
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });
    await goToSettings(page);
  });

  test('should show PIN verification modal when clicking manage races', async ({
    page,
  }) => {
    await page.click('#manage-races-btn');

    // PIN modal should be visible
    const pinModal = page.locator('#admin-pin-modal');
    await expect(pinModal).toHaveClass(/show/);
  });

  test('should have PIN input focused in verification modal', async ({
    page,
  }) => {
    await page.click('#manage-races-btn');

    const pinVerifyInput = page.locator('#admin-pin-verify-input');
    await expect(pinVerifyInput).toBeFocused();
  });

  test('should close PIN modal on cancel', async ({ page }) => {
    // Skip in landscape mode - viewport layout causes modal interaction issues in test driver
    const viewport = page.viewportSize();
    if (viewport && viewport.width > viewport.height) {
      test.skip();
      return;
    }

    await page.click('#manage-races-btn');

    // Wait for modal to be fully visible first
    const pinModal = page.locator('#admin-pin-modal');
    await expect(pinModal).toHaveClass(/show/, { timeout: 5000 });

    // Wait for any toast to disappear (ambient mode notification can intercept clicks)
    await page.waitForTimeout(1000);

    // Click cancel button
    const cancelBtn = page.locator('#admin-pin-modal [data-action="cancel"]');
    await cancelBtn.click({ force: true });

    // Wait a moment for modal close animation
    await page.waitForTimeout(500);
    await expect(pinModal).not.toHaveClass(/show/, { timeout: 5000 });
  });

  test('should show error for incorrect PIN', async ({ page }) => {
    await page.click('#manage-races-btn');

    // Wait for modal to be fully visible first
    const pinModal = page.locator('#admin-pin-modal');
    await expect(pinModal).toHaveClass(/show/, { timeout: 5000 });

    // Wait for any toast to disappear
    await page.waitForTimeout(1000);

    // Enter wrong PIN
    const pinVerifyInput = page.locator('#admin-pin-verify-input');
    await pinVerifyInput.fill('9999');

    // Use Enter key to submit (more reliable than clicking in landscape)
    await pinVerifyInput.press('Enter');

    // Error should be visible (wait for validation)
    await page.waitForTimeout(500);
    const errorEl = page.locator('#admin-pin-error');
    await expect(errorEl).toBeVisible({ timeout: 5000 });
  });

  test('should open race management modal on correct PIN', async ({ page }) => {
    test.skip(skipBackendTests, 'Requires backend server for race list API');
    await page.click('#manage-races-btn');

    // Enter correct PIN
    const pinVerifyInput = page.locator('#admin-pin-verify-input');
    await pinVerifyInput.fill('1234');
    await page.click('#admin-pin-verify-btn');

    // PIN modal should close
    const pinModal = page.locator('#admin-pin-modal');
    await expect(pinModal).not.toHaveClass(/show/);

    // Race management modal should open
    const raceModal = page.locator('#race-management-modal');
    await expect(raceModal).toHaveClass(/show/);
  });

  test('should verify PIN on Enter key', async ({ page }) => {
    test.skip(skipBackendTests, 'Requires backend server for race list API');
    await page.click('#manage-races-btn');

    const pinVerifyInput = page.locator('#admin-pin-verify-input');
    await pinVerifyInput.fill('1234');
    await pinVerifyInput.press('Enter');

    // Race management modal should open
    const raceModal = page.locator('#race-management-modal');
    await expect(raceModal).toHaveClass(/show/);
  });
});

test.describe('Race Management - Race List Modal', () => {
  test.skip(
    ({ browserName }) => skipBackendTests,
    'Requires backend server for race list API',
  );

  test.beforeEach(async ({ page }) => {
    // Set up admin PIN and open race management modal
    await setupPage(page);
    await page.evaluate(() => {
      const hash = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
          h = (h << 5) - h + str.charCodeAt(i);
          h = h & h;
        }
        return h.toString(36);
      };
      localStorage.setItem('skiTimerAdminPin', hash('1234'));
    });
    await page.reload();
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });
    await goToSettings(page);

    // Open race management
    await page.click('#manage-races-btn');
    await page.locator('#admin-pin-verify-input').fill('1234');
    await page.click('#admin-pin-verify-btn');
  });

  test('should display race management modal', async ({ page }) => {
    const raceModal = page.locator('#race-management-modal');
    await expect(raceModal).toHaveClass(/show/);
  });

  test('should show loading state initially', async ({ page }) => {
    // Note: This test may be flaky if the API responds quickly
    // The loading state should be visible briefly
    const loadingEl = page.locator('#race-list-loading');
    // Just verify the element exists
    await expect(loadingEl).toBeAttached();
  });

  test('should have close button', async ({ page }) => {
    const closeBtn = page.locator(
      '#race-management-modal [data-action="cancel"]',
    );
    await expect(closeBtn).toBeVisible();

    await closeBtn.click();
    const raceModal = page.locator('#race-management-modal');
    await expect(raceModal).not.toHaveClass(/show/);
  });

  test('should have refresh button', async ({ page }) => {
    const refreshBtn = page.locator('#refresh-races-btn');
    await expect(refreshBtn).toBeVisible();
  });
});

test.describe('Race Management - Race Deleted Modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should have race deleted modal in DOM', async ({ page }) => {
    const raceDeletedModal = page.locator('#race-deleted-modal');
    await expect(raceDeletedModal).toBeAttached();
  });

  test('should have OK button in race deleted modal', async ({ page }) => {
    const okBtn = page.locator('#race-deleted-ok-btn');
    await expect(okBtn).toBeAttached();
  });

  test('race deleted modal should be hidden by default', async ({ page }) => {
    const raceDeletedModal = page.locator('#race-deleted-modal');
    await expect(raceDeletedModal).not.toHaveClass(/show/);
  });
});

test.describe('Race Management - Delete Confirmation Modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should have delete confirmation modal in DOM', async ({ page }) => {
    const deleteModal = page.locator('#delete-race-confirm-modal');
    await expect(deleteModal).toBeAttached();
  });

  test('should have cancel and delete buttons', async ({ page }) => {
    const cancelBtn = page.locator(
      '#delete-race-confirm-modal [data-action="cancel"]',
    );
    const deleteBtn = page.locator('#confirm-delete-race-btn');

    await expect(cancelBtn).toBeAttached();
    await expect(deleteBtn).toBeAttached();
  });
});

test.describe('Race Management - Translations', () => {
  test.beforeEach(async ({ page }) => {
    // Use full mode so admin section is visible
    await setupPageFullMode(page);
    await navigateTo(page, 'settings');
  });

  test('should display English labels when language is EN', async ({
    page,
  }) => {
    // Set language to English
    const langToggle = page.locator('#lang-toggle');
    const enOption = langToggle.locator('[data-lang="en"]');
    await enOption.click();

    // Wait for translations to apply
    await page.waitForTimeout(200);

    // Check admin section labels (use .first() since there may be multiple elements)
    const adminPinTitle = page.locator('[data-i18n="adminPin"]').first();
    await expect(adminPinTitle).toContainText('Race Management PIN');

    const manageRacesTitle = page.locator('[data-i18n="manageRaces"]').first();
    await expect(manageRacesTitle).toContainText('Manage Races');
  });

  test('should display German labels when language is DE', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');

    // setupPage defaults to DE, so switch to EN first to ensure clicking DE triggers a real change
    await langToggle.locator('[data-lang="en"]').click();
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-i18n="adminPin"]');
        return el && el.textContent.includes('Race Management PIN');
      },
      { timeout: 5000 },
    );

    // Now switch to German
    await langToggle.locator('[data-lang="de"]').click();

    // Check admin section labels (use .first() since there may be multiple elements)
    const adminPinTitle = page.locator('[data-i18n="adminPin"]').first();
    await expect(adminPinTitle).toContainText('Rennverwaltungs-PIN', {
      timeout: 5000,
    });

    const manageRacesTitle = page.locator('[data-i18n="manageRaces"]').first();
    await expect(manageRacesTitle).toContainText('Rennen verwalten');
  });
});

test.describe('Race Management - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await goToSettings(page);
  });

  test('change PIN button should be accessible', async ({ page }) => {
    const pinBtn = page.locator('#change-pin-btn');

    // Should be focusable
    await pinBtn.focus();
    await expect(pinBtn).toBeFocused();

    // Should be keyboard activatable
    await pinBtn.press('Enter');
    // Modal should open
    await expect(page.locator('#change-pin-modal')).toHaveClass(/show/);
  });

  test('manage races button should be keyboard accessible', async ({
    page,
  }) => {
    const manageBtn = page.locator('#manage-races-btn');

    // Should be focusable
    await manageBtn.focus();
    await expect(manageBtn).toBeFocused();

    // Should be activatable with Enter
    // (We just verify focus works since clicking requires PIN)
  });
});
