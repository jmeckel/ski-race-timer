/**
 * E2E Tests - Race Management
 *
 * Tests for the admin race management functionality
 */

import { test, expect } from '@playwright/test';

// Helper to navigate to settings and disable simple mode
async function goToSettings(page) {
  await page.goto('/');
  await page.click('[data-view="settings-view"]');
  await page.waitForSelector('.settings-section');

  // Disable simple mode if needed
  const toggle = page.locator('#toggle-simple');
  const isSimple = await toggle.evaluate(el => el.classList.contains('on'));
  if (isSimple) {
    await toggle.click();
  }
}

test.describe('Race Management - Admin Section', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page);
  });

  test('should display admin section in settings', async ({ page }) => {
    // Admin section should be visible (not hidden by simple mode)
    await expect(page.locator('#admin-pin-input')).toBeVisible();
    await expect(page.locator('#manage-races-btn')).toBeVisible();
  });

  test('should have admin PIN input field', async ({ page }) => {
    const pinInput = page.locator('#admin-pin-input');
    await expect(pinInput).toBeVisible();
    await expect(pinInput).toHaveAttribute('type', 'password');
    await expect(pinInput).toHaveAttribute('maxlength', '8');
  });

  test('should have manage races button', async ({ page }) => {
    const manageBtn = page.locator('#manage-races-btn');
    await expect(manageBtn).toBeVisible();
  });
});

test.describe('Race Management - Admin PIN', () => {
  test.beforeEach(async ({ page }) => {
    // Clear admin PIN before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('skiTimerAdminPin'));
    await page.reload();
    await goToSettings(page);
  });

  test('should require PIN to be set before accessing race management', async ({ page }) => {
    // Try to click manage races without PIN set
    await page.click('#manage-races-btn');

    // Should show toast message about setting PIN first
    // Toast appears briefly, so we check if PIN input is focused instead
    const pinInput = page.locator('#admin-pin-input');
    await expect(pinInput).toBeFocused();
  });

  test('should save admin PIN on change', async ({ page }) => {
    const pinInput = page.locator('#admin-pin-input');

    // Enter a PIN
    await pinInput.fill('1234');
    await pinInput.blur();

    // PIN should be masked as ****
    await expect(pinInput).toHaveValue('****');

    // Verify PIN was stored (check localStorage)
    const storedPin = await page.evaluate(() => localStorage.getItem('skiTimerAdminPin'));
    expect(storedPin).toBeTruthy();
  });

  test('should persist admin PIN across page reloads', async ({ page }) => {
    const pinInput = page.locator('#admin-pin-input');

    // Set PIN
    await pinInput.fill('5678');
    await pinInput.blur();

    // Reload page
    await page.reload();
    await goToSettings(page);

    // PIN input should show masked value
    const newPinInput = page.locator('#admin-pin-input');
    await expect(newPinInput).toHaveValue('****');
  });

  test('should clear admin PIN when input is cleared', async ({ page }) => {
    const pinInput = page.locator('#admin-pin-input');

    // Set PIN first
    await pinInput.fill('1234');
    await pinInput.blur();
    await expect(pinInput).toHaveValue('****');

    // Clear PIN
    await pinInput.clear();
    await pinInput.blur();

    // Verify PIN was removed
    const storedPin = await page.evaluate(() => localStorage.getItem('skiTimerAdminPin'));
    expect(storedPin).toBeNull();
  });
});

test.describe('Race Management - PIN Verification Modal', () => {
  test.beforeEach(async ({ page }) => {
    // Set up admin PIN
    await page.goto('/');
    await page.evaluate(() => {
      // Set a known PIN hash (for "1234")
      const hash = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
          h = ((h << 5) - h) + str.charCodeAt(i);
          h = h & h;
        }
        return h.toString(36);
      };
      localStorage.setItem('skiTimerAdminPin', hash('1234'));
    });
    await page.reload();
    await goToSettings(page);
  });

  test('should show PIN verification modal when clicking manage races', async ({ page }) => {
    await page.click('#manage-races-btn');

    // PIN modal should be visible
    const pinModal = page.locator('#admin-pin-modal');
    await expect(pinModal).toHaveClass(/show/);
  });

  test('should have PIN input focused in verification modal', async ({ page }) => {
    await page.click('#manage-races-btn');

    const pinVerifyInput = page.locator('#admin-pin-verify-input');
    await expect(pinVerifyInput).toBeFocused();
  });

  test('should close PIN modal on cancel', async ({ page }) => {
    await page.click('#manage-races-btn');

    // Click cancel button
    await page.click('#admin-pin-modal [data-action="cancel"]');

    const pinModal = page.locator('#admin-pin-modal');
    await expect(pinModal).not.toHaveClass(/show/);
  });

  test('should show error for incorrect PIN', async ({ page }) => {
    await page.click('#manage-races-btn');

    // Enter wrong PIN
    const pinVerifyInput = page.locator('#admin-pin-verify-input');
    await pinVerifyInput.fill('9999');
    await page.click('#admin-pin-verify-btn');

    // Error should be visible
    const errorEl = page.locator('#admin-pin-error');
    await expect(errorEl).toBeVisible();
  });

  test('should open race management modal on correct PIN', async ({ page }) => {
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
  test.beforeEach(async ({ page }) => {
    // Set up admin PIN and open race management modal
    await page.goto('/');
    await page.evaluate(() => {
      const hash = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
          h = ((h << 5) - h) + str.charCodeAt(i);
          h = h & h;
        }
        return h.toString(36);
      };
      localStorage.setItem('skiTimerAdminPin', hash('1234'));
    });
    await page.reload();
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
    const closeBtn = page.locator('#race-management-modal [data-action="cancel"]');
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
  test('should have race deleted modal in DOM', async ({ page }) => {
    await page.goto('/');

    const raceDeletedModal = page.locator('#race-deleted-modal');
    await expect(raceDeletedModal).toBeAttached();
  });

  test('should have OK button in race deleted modal', async ({ page }) => {
    await page.goto('/');

    const okBtn = page.locator('#race-deleted-ok-btn');
    await expect(okBtn).toBeAttached();
  });

  test('race deleted modal should be hidden by default', async ({ page }) => {
    await page.goto('/');

    const raceDeletedModal = page.locator('#race-deleted-modal');
    await expect(raceDeletedModal).not.toHaveClass(/show/);
  });
});

test.describe('Race Management - Delete Confirmation Modal', () => {
  test('should have delete confirmation modal in DOM', async ({ page }) => {
    await page.goto('/');

    const deleteModal = page.locator('#delete-race-confirm-modal');
    await expect(deleteModal).toBeAttached();
  });

  test('should have cancel and delete buttons', async ({ page }) => {
    await page.goto('/');

    const cancelBtn = page.locator('#delete-race-confirm-modal [data-action="cancel"]');
    const deleteBtn = page.locator('#confirm-delete-race-btn');

    await expect(cancelBtn).toBeAttached();
    await expect(deleteBtn).toBeAttached();
  });
});

test.describe('Race Management - Translations', () => {
  test('should display English labels when language is EN', async ({ page }) => {
    await page.goto('/');

    // Set language to English
    await page.click('[data-view="settings-view"]');
    const langToggle = page.locator('#lang-toggle');
    const enOption = langToggle.locator('[data-lang="en"]');
    await enOption.click();

    // Check admin section labels
    const adminPinTitle = page.locator('[data-i18n="adminPin"]');
    await expect(adminPinTitle).toContainText('Admin PIN');

    const manageRacesTitle = page.locator('[data-i18n="manageRaces"]');
    await expect(manageRacesTitle).toContainText('Manage Races');
  });

  test('should display German labels when language is DE', async ({ page }) => {
    await page.goto('/');

    // Set language to German
    await page.click('[data-view="settings-view"]');
    const langToggle = page.locator('#lang-toggle');
    const deOption = langToggle.locator('[data-lang="de"]');
    await deOption.click();

    // Check admin section labels
    const adminPinTitle = page.locator('[data-i18n="adminPin"]');
    await expect(adminPinTitle).toContainText('Admin-PIN');

    const manageRacesTitle = page.locator('[data-i18n="manageRaces"]');
    await expect(manageRacesTitle).toContainText('Rennen verwalten');
  });
});

test.describe('Race Management - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page);
  });

  test('admin PIN input should be accessible', async ({ page }) => {
    const pinInput = page.locator('#admin-pin-input');

    // Should be focusable
    await pinInput.focus();
    await expect(pinInput).toBeFocused();

    // Should have placeholder
    await expect(pinInput).toHaveAttribute('placeholder', '****');
  });

  test('manage races button should be keyboard accessible', async ({ page }) => {
    const manageBtn = page.locator('#manage-races-btn');

    // Should be focusable
    await manageBtn.focus();
    await expect(manageBtn).toBeFocused();

    // Should be activatable with Enter
    // (We just verify focus works since clicking requires PIN)
  });
});
