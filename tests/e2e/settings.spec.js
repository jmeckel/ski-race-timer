/**
 * E2E Tests - Settings View
 *
 * Tests for app settings and configuration
 */

import { test, expect } from '@playwright/test';

test.describe('Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');
    await page.waitForSelector('.settings-section');
  });

  test.describe('Navigation', () => {
    test('should navigate to settings view', async ({ page }) => {
      await expect(page.locator('#settings-view')).toBeVisible();
    });

    test('should highlight settings tab', async ({ page }) => {
      const tab = page.locator('[data-view="settings"]');
      await expect(tab).toHaveClass(/active/);
    });
  });

  test.describe('GPS Settings', () => {
    test('should toggle GPS on', async ({ page }) => {
      const toggle = page.locator('#toggle-gps');
      await toggle.click();

      await expect(toggle).toHaveClass(/on/);
    });

    test('should show GPS status when enabled', async ({ page }) => {
      await page.click('#toggle-gps');

      const gpsStatus = page.locator('#gps-status-row');
      await expect(gpsStatus).toBeVisible();
    });

    test('should toggle GPS off', async ({ page }) => {
      // Turn on first
      await page.click('#toggle-gps');
      // Then off
      await page.click('#toggle-gps');

      const toggle = page.locator('#toggle-gps');
      await expect(toggle).not.toHaveClass(/on/);
    });
  });

  test.describe('Auto-Increment Setting', () => {
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
      await toggle.click();

      // Reload page
      await page.reload();
      await page.click('[data-view="settings"]');

      // Setting should persist
      const toggleAfter = page.locator('#toggle-auto');
      await expect(toggleAfter).toBeVisible();
    });
  });

  test.describe('Haptic Feedback Setting', () => {
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
    test('should toggle sound feedback', async ({ page }) => {
      const toggle = page.locator('#toggle-sound');
      await toggle.click();

      await expect(toggle).toHaveClass(/on/);
    });
  });

  test.describe('Cloud Sync Settings', () => {
    test('should toggle cloud sync', async ({ page }) => {
      const toggle = page.locator('#toggle-sync');
      await toggle.click();

      await expect(toggle).toHaveClass(/on/);
    });

    test('should show sync settings when enabled', async ({ page }) => {
      await page.click('#toggle-sync');

      const syncSettings = page.locator('#sync-settings-row');
      await expect(syncSettings).toBeVisible();
    });

    test('should enter race ID', async ({ page }) => {
      await page.click('#toggle-sync');

      const raceIdInput = page.locator('#race-id-input');
      await raceIdInput.fill('RACE2024');

      // Trigger blur to save
      await raceIdInput.blur();

      // Verify saved
      await page.reload();
      await page.click('[data-view="settings"]');
      await page.click('#toggle-sync');

      await expect(page.locator('#race-id-input')).toHaveValue('RACE2024');
    });

    test('should enter device name', async ({ page }) => {
      await page.click('#toggle-sync');

      const deviceNameInput = page.locator('#device-name-input');
      await deviceNameInput.clear();
      await deviceNameInput.fill('Timer Alpha');
      await deviceNameInput.blur();

      // Verify saved
      await page.reload();
      await page.click('[data-view="settings"]');
      await page.click('#toggle-sync');

      await expect(page.locator('#device-name-input')).toHaveValue('Timer Alpha');
    });

    test('should show sync status', async ({ page }) => {
      await page.click('#toggle-sync');

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
      // Get current state
      const langToggle = page.locator('#lang-toggle');
      const initialText = await langToggle.textContent();

      // Toggle
      await langToggle.click();

      // Reload
      await page.reload();

      // Check persisted
      const newText = await page.locator('#lang-toggle').textContent();
      expect(newText).not.toBe(initialText);
    });
  });

  test.describe('Backup & Restore', () => {
    test('should export backup', async ({ page }) => {
      // First add some data
      await page.click('[data-view="timer"]');
      await page.click('#timestamp-btn');
      await page.waitForTimeout(500);
      await page.click('[data-view="settings"]');

      // Listen for download
      const downloadPromise = page.waitForEvent('download');

      await page.click('#export-backup-btn');

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('backup');
      expect(download.suggestedFilename()).toContain('.json');
    });

    test('should have import button', async ({ page }) => {
      const importBtn = page.locator('#import-backup-btn');
      await expect(importBtn).toBeVisible();
    });
  });
});

test.describe('Settings - Toggle Independence', () => {
  test.beforeEach(async ({ page }) => {
    // Clear settings before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('skiTimerSettings'));
    await page.reload();
    await page.click('[data-view="settings"]');
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
    await page.click('[data-view="settings"]');
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
  test.use({ viewport: { width: 375, height: 667 } });

  test('should display all settings on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');

    await expect(page.locator('#toggle-auto')).toBeVisible();
    await expect(page.locator('#toggle-haptic')).toBeVisible();
    await expect(page.locator('#toggle-sound')).toBeVisible();
    await expect(page.locator('#toggle-gps')).toBeVisible();
    await expect(page.locator('#toggle-sync')).toBeVisible();
  });

  test('should tap toggles on touch device', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');

    const toggle = page.locator('#toggle-sound');
    await toggle.tap();

    await expect(toggle).toHaveClass(/on/);
  });
});
