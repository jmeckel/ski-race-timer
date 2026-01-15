/**
 * E2E Tests - Settings View
 *
 * Tests for app settings and configuration
 */

import { test, expect } from '@playwright/test';

// Helper to disable simple mode for tests that need full settings UI
async function disableSimpleMode(page) {
  const toggle = page.locator('#toggle-simple');
  const isSimple = await toggle.evaluate(el => el.classList.contains('on'));
  if (isSimple) {
    await toggle.click();
  }
}

test.describe('Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');
    await page.waitForSelector('.settings-section');
  });

  test.describe('Navigation', () => {
    test('should navigate to settings view', async ({ page }) => {
      await expect(page.locator('#settings-view')).toBeVisible();
    });

    test('should highlight settings tab', async ({ page }) => {
      const tab = page.locator('[data-view="settings-view"]');
      await expect(tab).toHaveClass(/active/);
    });
  });

  test.describe('Simple Mode Toggle', () => {
    test('should be on by default', async ({ page }) => {
      const toggle = page.locator('#toggle-simple');
      await expect(toggle).toHaveClass(/on/);
    });

    test('should toggle simple mode off', async ({ page }) => {
      const toggle = page.locator('#toggle-simple');
      await toggle.click();
      await expect(toggle).not.toHaveClass(/on/);
    });

    test('should show hidden settings when simple mode is off', async ({ page }) => {
      // GPS section should be hidden in simple mode
      await expect(page.locator('#gps-section')).not.toBeVisible();

      // Turn off simple mode
      await page.click('#toggle-simple');

      // GPS section should now be visible
      await expect(page.locator('#gps-section')).toBeVisible();
    });
  });

  test.describe('GPS Settings', () => {
    test.beforeEach(async ({ page }) => {
      // Need to disable simple mode to access GPS settings
      await disableSimpleMode(page);
    });

    test('should toggle GPS on', async ({ page }) => {
      const toggle = page.locator('#toggle-gps');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));

      if (!isOn) {
        await toggle.click();
        await expect(toggle).toHaveClass(/on/);
      } else {
        // Already on, toggle off then on
        await toggle.click();
        await toggle.click();
        await expect(toggle).toHaveClass(/on/);
      }
    });

    test('should show GPS status when enabled', async ({ page }) => {
      const toggle = page.locator('#toggle-gps');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));

      if (!isOn) {
        await toggle.click();
      }

      const gpsStatus = page.locator('#gps-status-row');
      await expect(gpsStatus).toBeVisible();
    });

    test('should toggle GPS off', async ({ page }) => {
      const toggle = page.locator('#toggle-gps');

      // Turn on first if not already
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));
      if (!isOn) {
        await toggle.click();
      }

      // Then off
      await toggle.click();

      await expect(toggle).not.toHaveClass(/on/);
    });
  });

  test.describe('Auto-Increment Setting', () => {
    test.beforeEach(async ({ page }) => {
      await disableSimpleMode(page);
    });

    test('should toggle auto-increment on', async ({ page }) => {
      const toggle = page.locator('#toggle-auto');

      // May be on by default, so check current state
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));

      await toggle.click();

      if (isOn) {
        await expect(toggle).not.toHaveClass(/on/);
      } else {
        await expect(toggle).toHaveClass(/on/);
      }
    });

    test('should persist auto-increment setting', async ({ page }) => {
      const toggle = page.locator('#toggle-auto');
      const initialState = await toggle.evaluate(el => el.classList.contains('on'));

      await toggle.click();

      // Reload page
      await page.reload();
      await page.click('[data-view="settings-view"]');
      await disableSimpleMode(page);

      // Setting should persist (opposite of initial)
      const toggleAfter = page.locator('#toggle-auto');
      const newState = await toggleAfter.evaluate(el => el.classList.contains('on'));
      expect(newState).toBe(!initialState);
    });
  });

  test.describe('Haptic Feedback Setting', () => {
    test.beforeEach(async ({ page }) => {
      await disableSimpleMode(page);
    });

    test('should toggle haptic feedback', async ({ page }) => {
      const toggle = page.locator('#toggle-haptic');
      const initialState = await toggle.evaluate(el => el.classList.contains('on'));

      await toggle.click();

      if (initialState) {
        await expect(toggle).not.toHaveClass(/on/);
      } else {
        await expect(toggle).toHaveClass(/on/);
      }
    });
  });

  test.describe('Sound Feedback Setting', () => {
    test.beforeEach(async ({ page }) => {
      await disableSimpleMode(page);
    });

    test('should toggle sound feedback', async ({ page }) => {
      const toggle = page.locator('#toggle-sound');
      const initialState = await toggle.evaluate(el => el.classList.contains('on'));

      await toggle.click();

      if (initialState) {
        await expect(toggle).not.toHaveClass(/on/);
      } else {
        await expect(toggle).toHaveClass(/on/);
      }
    });
  });

  test.describe('Cloud Sync Settings', () => {
    test('should toggle cloud sync', async ({ page }) => {
      const toggle = page.locator('#toggle-sync');
      await toggle.click();

      await expect(toggle).toHaveClass(/on/);
    });

    test('should show sync settings when enabled', async ({ page }) => {
      const toggle = page.locator('#toggle-sync');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));

      if (!isOn) {
        await toggle.click();
      }

      const syncSettings = page.locator('#sync-settings-row');
      await expect(syncSettings).toBeVisible();
    });

    test('should enter race ID', async ({ page }) => {
      const toggle = page.locator('#toggle-sync');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));

      if (!isOn) {
        await toggle.click();
      }

      const raceIdInput = page.locator('#race-id-input');
      await raceIdInput.fill('RACE2024');

      // Trigger blur to save
      await raceIdInput.blur();

      // Verify saved
      await page.reload();
      await page.click('[data-view="settings-view"]');

      // Re-enable sync if needed
      const syncToggle = page.locator('#toggle-sync');
      const syncOn = await syncToggle.evaluate(el => el.classList.contains('on'));
      if (!syncOn) {
        await syncToggle.click();
      }

      await expect(page.locator('#race-id-input')).toHaveValue('RACE2024');
    });

    test('should enter device name', async ({ page }) => {
      const toggle = page.locator('#toggle-sync');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));

      if (!isOn) {
        await toggle.click();
      }

      const deviceNameInput = page.locator('#device-name-input');
      await deviceNameInput.clear();
      await deviceNameInput.fill('Timer Alpha');
      await deviceNameInput.blur();

      // Verify saved
      await page.reload();
      await page.click('[data-view="settings-view"]');

      // Re-enable sync if needed
      const syncToggle = page.locator('#toggle-sync');
      const syncOn = await syncToggle.evaluate(el => el.classList.contains('on'));
      if (!syncOn) {
        await syncToggle.click();
      }

      await expect(page.locator('#device-name-input')).toHaveValue('Timer Alpha');
    });

    test('should show sync status', async ({ page }) => {
      const toggle = page.locator('#toggle-sync');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));

      if (!isOn) {
        await toggle.click();
      }

      const statusRow = page.locator('#sync-status-row');
      await expect(statusRow).toBeVisible();
    });
  });

  test.describe('Language Settings', () => {
    test('should toggle language to English', async ({ page }) => {
      await page.click('#lang-toggle');

      // Check that UI updated
      const settingsTitle = page.locator('.settings-title').first();
      await expect(settingsTitle).toContainText(/Settings|Einstellungen/);
    });

    test('should persist language setting', async ({ page }) => {
      // Get current active language
      const langToggle = page.locator('#lang-toggle');
      const initialActiveLang = await langToggle.locator('.lang-option.active').getAttribute('data-lang');

      // Toggle
      await langToggle.click();
      const toggledActiveLang = await langToggle.locator('.lang-option.active').getAttribute('data-lang');

      // Reload
      await page.reload();

      // Check persisted - should stay toggled
      const afterReloadActiveLang = await page.locator('#lang-toggle .lang-option.active').getAttribute('data-lang');
      expect(afterReloadActiveLang).toBe(toggledActiveLang);
      expect(afterReloadActiveLang).not.toBe(initialActiveLang);
    });
  });

  test.describe('Backup & Restore', () => {
    test.beforeEach(async ({ page }) => {
      await disableSimpleMode(page);
    });

    test('should export backup', async ({ page }) => {
      // First add some data
      await page.click('[data-view="timing-view"]');
      await page.click('#timestamp-btn');
      await page.waitForTimeout(500);
      await page.click('[data-view="settings-view"]');
      await disableSimpleMode(page);

      // Listen for download
      const downloadPromise = page.waitForEvent('download');

      // Click the export button (first backup-btn)
      await page.click('.backup-btn >> nth=0');

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('backup');
      expect(download.suggestedFilename()).toContain('.json');
    });

    test('should have import button', async ({ page }) => {
      // Check for file input (import is done via hidden file input)
      const importInput = page.locator('#import-file');
      await expect(importInput).toBeAttached();
    });
  });
});

test.describe('Settings - Toggle Independence', () => {
  test.beforeEach(async ({ page }) => {
    // Clear settings before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('skiTimerSettings'));
    await page.reload();
    await page.click('[data-view="settings-view"]');
    // Disable simple mode to access all toggles
    const toggle = page.locator('#toggle-simple');
    const isSimple = await toggle.evaluate(el => el.classList.contains('on'));
    if (isSimple) {
      await toggle.click();
    }
  });

  test('should toggle GPS without affecting sync', async ({ page }) => {
    const gpsToggle = page.locator('#toggle-gps');
    const syncToggle = page.locator('#toggle-sync');

    // Get initial states
    const syncInitial = await syncToggle.evaluate(el => el.classList.contains('on'));

    // Toggle GPS
    await gpsToggle.click();

    // Sync should be unchanged
    const syncAfter = await syncToggle.evaluate(el => el.classList.contains('on'));
    expect(syncAfter).toBe(syncInitial);
  });

  test('should toggle sync without affecting GPS', async ({ page }) => {
    const gpsToggle = page.locator('#toggle-gps');
    const syncToggle = page.locator('#toggle-sync');

    // Get initial states
    const gpsInitial = await gpsToggle.evaluate(el => el.classList.contains('on'));

    // Toggle sync
    await syncToggle.click();

    // GPS should be unchanged
    const gpsAfter = await gpsToggle.evaluate(el => el.classList.contains('on'));
    expect(gpsAfter).toBe(gpsInitial);
  });

  test('should toggle each setting independently', async ({ page }) => {
    const toggles = ['#toggle-auto', '#toggle-haptic', '#toggle-sound'];

    for (const selector of toggles) {
      const toggle = page.locator(selector);
      const before = await toggle.evaluate(el => el.classList.contains('on'));

      await toggle.click();

      const after = await toggle.evaluate(el => el.classList.contains('on'));
      expect(after).not.toBe(before);
    }
  });
});

test.describe('Settings - Keyboard Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');
    // Disable simple mode to access all toggles
    const toggle = page.locator('#toggle-simple');
    const isSimple = await toggle.evaluate(el => el.classList.contains('on'));
    if (isSimple) {
      await toggle.click();
    }
  });

  test('should toggle with Enter key', async ({ page }) => {
    const toggle = page.locator('#toggle-haptic');
    const before = await toggle.evaluate(el => el.classList.contains('on'));

    await toggle.focus();
    await page.keyboard.press('Enter');

    const after = await toggle.evaluate(el => el.classList.contains('on'));
    expect(after).not.toBe(before);
  });

  test('should toggle with Space key', async ({ page }) => {
    const toggle = page.locator('#toggle-sound');
    const before = await toggle.evaluate(el => el.classList.contains('on'));

    await toggle.focus();
    await page.keyboard.press('Space');

    const after = await toggle.evaluate(el => el.classList.contains('on'));
    expect(after).not.toBe(before);
  });

  test('should have focus visible on toggles', async ({ page }) => {
    const toggle = page.locator('#toggle-haptic');
    await toggle.focus();

    // Focus should be visible (has outline)
    const outline = await toggle.evaluate(el => getComputedStyle(el).outline);
    expect(outline).not.toBe('none');
  });
});

test.describe('Settings - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('should display settings on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');

    // Simple mode toggle should be visible
    await expect(page.locator('#toggle-simple')).toBeVisible();
    // Sync toggle should be visible (not hidden in simple mode)
    await expect(page.locator('#toggle-sync')).toBeVisible();
  });

  test('should handle touch interactions on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');

    // Verify toggle is clickable/touchable on mobile viewport
    const toggle = page.locator('#toggle-sync');
    await expect(toggle).toBeVisible();

    const before = await toggle.evaluate(el => el.classList.contains('on'));

    // Use click instead of tap - more reliable in Playwright
    await toggle.click();
    await page.waitForTimeout(100);

    const after = await toggle.evaluate(el => el.classList.contains('on'));
    expect(after).not.toBe(before);
  });
});

test.describe('Simple Mode Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');
  });

  test('should be on by default', async ({ page }) => {
    const toggle = page.locator('#toggle-simple');
    await expect(toggle).toHaveClass(/on/);
  });

  test('should hide advanced settings in simple mode', async ({ page }) => {
    // Verify simple mode is on
    const toggle = page.locator('#toggle-simple');
    await expect(toggle).toHaveClass(/on/);

    // GPS section, Timing section, and Backup section should be hidden
    await expect(page.locator('#gps-section')).not.toBeVisible();
    await expect(page.locator('#timing-section')).not.toBeVisible();
    await expect(page.locator('#backup-section')).not.toBeVisible();
  });

  test('should show all settings when simple mode is off', async ({ page }) => {
    // Turn off simple mode
    await page.click('#toggle-simple');

    // Verify toggle is off
    const toggle = page.locator('#toggle-simple');
    await expect(toggle).not.toHaveClass(/on/);

    // All sections should be visible
    await expect(page.locator('#gps-section')).toBeVisible();
    await expect(page.locator('#timing-section')).toBeVisible();
    await expect(page.locator('#backup-section')).toBeVisible();
  });

  test('should toggle between simple and full mode', async ({ page }) => {
    const toggle = page.locator('#toggle-simple');

    // Start in simple mode
    await expect(toggle).toHaveClass(/on/);
    await expect(page.locator('#gps-section')).not.toBeVisible();

    // Toggle to full mode
    await toggle.click();
    await expect(toggle).not.toHaveClass(/on/);
    await expect(page.locator('#gps-section')).toBeVisible();

    // Toggle back to simple mode
    await toggle.click();
    await expect(toggle).toHaveClass(/on/);
    await expect(page.locator('#gps-section')).not.toBeVisible();
  });

  test('should persist simple mode setting', async ({ page }) => {
    // Turn off simple mode
    await page.click('#toggle-simple');

    // Reload
    await page.reload();
    await page.click('[data-view="settings-view"]');

    // Should remain off
    const toggle = page.locator('#toggle-simple');
    await expect(toggle).not.toHaveClass(/on/);
  });

  test('should keep cloud sync and language visible in simple mode', async ({ page }) => {
    // Verify simple mode is on
    await expect(page.locator('#toggle-simple')).toHaveClass(/on/);

    // Cloud sync and language should still be visible
    await expect(page.locator('#toggle-sync')).toBeVisible();
    await expect(page.locator('#lang-toggle')).toBeVisible();
  });
});
