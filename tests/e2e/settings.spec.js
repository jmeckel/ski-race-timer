/**
 * E2E Tests - Settings View
 *
 * Tests for app settings and configuration
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

// Helper to disable simple mode for tests that need full settings UI
async function disableSimpleMode(page) {
  if (await isToggleOn(page, '#simple-mode-toggle')) {
    await clickToggle(page, '#simple-mode-toggle');
  }
}

test.describe('Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');
    await page.waitForSelector('.settings-section');
  });

  test.describe('Navigation', () => {
    test('should navigate to settings view', async ({ page }) => {
      await expect(page.locator('.settings-view')).toBeVisible();
    });

    test('should highlight settings tab', async ({ page }) => {
      const tab = page.locator('[data-view="settings"]');
      await expect(tab).toHaveClass(/active/);
    });
  });

  test.describe('Simple Mode Toggle', () => {
    test('should be on by default', async ({ page }) => {
      const toggle = page.locator('#simple-mode-toggle');
      await expect(toggle).toBeChecked();
    });

    test('should toggle simple mode off', async ({ page }) => {
      const toggle = page.locator('#simple-mode-toggle');
      await clickToggle(page, '#simple-mode-toggle');
      await expect(toggle).not.toBeChecked();
    });

    test('should show hidden settings when simple mode is off', async ({ page }) => {
      // GPS section should be hidden in simple mode
      await expect(page.locator('#gps-section')).not.toBeVisible();

      // Turn off simple mode
      await clickToggle(page, '#simple-mode-toggle');

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
      const toggle = page.locator('#gps-toggle');
      const isOn = await isToggleOn(page, '#gps-toggle');

      if (!isOn) {
        await clickToggle(page, '#gps-toggle');
        await expect(toggle).toBeChecked();
      } else {
        // Already on, toggle off then on
        await clickToggle(page, '#gps-toggle');
        await clickToggle(page, '#gps-toggle');
        await expect(toggle).toBeChecked();
      }
    });

    test('should show GPS indicator when enabled', async ({ page }) => {
      const isOn = await isToggleOn(page, '#gps-toggle');

      if (!isOn) {
        await clickToggle(page, '#gps-toggle');
      }

      // GPS indicator appears in header when GPS is enabled
      const gpsIndicator = page.locator('#gps-indicator');
      await expect(gpsIndicator).toBeVisible();
    });

    test('should toggle GPS off', async ({ page }) => {
      const toggle = page.locator('#gps-toggle');

      // Turn on first if not already
      const isOn = await isToggleOn(page, '#gps-toggle');
      if (!isOn) {
        await clickToggle(page, '#gps-toggle');
      }

      // Then off
      await clickToggle(page, '#gps-toggle');

      await expect(toggle).not.toBeChecked();
    });
  });

  test.describe('Auto-Increment Setting', () => {
    test.beforeEach(async ({ page }) => {
      await disableSimpleMode(page);
    });

    test('should toggle auto-increment on', async ({ page }) => {
      const toggle = page.locator('#auto-toggle');

      // May be on by default, so check current state
      const isOn = await isToggleOn(page, '#auto-toggle');

      await clickToggle(page, '#auto-toggle');

      if (isOn) {
        await expect(toggle).not.toBeChecked();
      } else {
        await expect(toggle).toBeChecked();
      }
    });

  });

  test.describe('Haptic Feedback Setting', () => {
    test.beforeEach(async ({ page }) => {
      await disableSimpleMode(page);
    });

    test('should toggle haptic feedback', async ({ page }) => {
      const toggle = page.locator('#haptic-toggle');
      const initialState = await isToggleOn(page, '#haptic-toggle');

      await clickToggle(page, '#haptic-toggle');

      if (initialState) {
        await expect(toggle).not.toBeChecked();
      } else {
        await expect(toggle).toBeChecked();
      }
    });
  });

  test.describe('Sound Feedback Setting', () => {
    test.beforeEach(async ({ page }) => {
      await disableSimpleMode(page);
    });

    test('should toggle sound feedback', async ({ page }) => {
      const toggle = page.locator('#sound-toggle');
      const initialState = await isToggleOn(page, '#sound-toggle');

      await clickToggle(page, '#sound-toggle');

      if (initialState) {
        await expect(toggle).not.toBeChecked();
      } else {
        await expect(toggle).toBeChecked();
      }
    });
  });

  test.describe('Cloud Sync Settings', () => {
    test('should toggle cloud sync', async ({ page }) => {
      const toggle = page.locator('#sync-toggle');
      const isOn = await isToggleOn(page, '#sync-toggle');

      await clickToggle(page, '#sync-toggle');

      if (isOn) {
        await expect(toggle).not.toBeChecked();
      } else {
        await expect(toggle).toBeChecked();
      }
    });

    test('should show sync settings when enabled', async ({ page }) => {
      const isOn = await isToggleOn(page, '#sync-toggle');

      if (!isOn) {
        await clickToggle(page, '#sync-toggle');
      }

      // Sync settings are visible when sync is enabled (race ID input area)
      const raceIdInput = page.locator('#race-id-input');
      await expect(raceIdInput).toBeVisible();
    });

    test('should show sync indicator when enabled', async ({ page }) => {
      const isOn = await isToggleOn(page, '#sync-toggle');

      if (!isOn) {
        await clickToggle(page, '#sync-toggle');
      }

      // Sync indicator appears in header when sync is enabled
      const syncIndicator = page.locator('#sync-indicator');
      await expect(syncIndicator).toBeVisible();
    });
  });

  test.describe('Language Settings', () => {
    test('should toggle language to English', async ({ page }) => {
      // Language toggle is a div with .lang-option children
      const langToggle = page.locator('#lang-toggle');
      const initialActiveLang = await langToggle.locator('.lang-option.active').getAttribute('data-lang');

      // Click the inactive language option
      const inactiveOption = langToggle.locator('.lang-option:not(.active)');
      await inactiveOption.click();

      // Check that language changed
      const newActiveLang = await langToggle.locator('.lang-option.active').getAttribute('data-lang');
      expect(newActiveLang).not.toBe(initialActiveLang);
    });

  });

  test.describe('Export Results', () => {
    test('should export results as CSV', async ({ page }) => {
      // First add some data
      await page.click('[data-view="timer"]');
      await page.waitForSelector('.clock-time');
      await page.click('#timestamp-btn');
      await page.waitForTimeout(500);

      // Go to results view where export button is
      await page.click('[data-view="results"]');
      await page.waitForSelector('.results-view');

      // Listen for download
      const downloadPromise = page.waitForEvent('download');

      // Click the export button
      await page.click('#export-btn');

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('race-horology');
      expect(download.suggestedFilename()).toContain('.csv');
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
    // Disable simple mode to access all toggles
    await disableSimpleMode(page);
  });

  test('should toggle GPS without affecting sync', async ({ page }) => {
    // Get initial states
    const syncInitial = await isToggleOn(page, '#sync-toggle');

    // Toggle GPS
    await clickToggle(page, '#gps-toggle');

    // Sync should be unchanged
    const syncAfter = await isToggleOn(page, '#sync-toggle');
    expect(syncAfter).toBe(syncInitial);
  });

  test('should toggle sync without affecting GPS', async ({ page }) => {
    // Get initial states
    const gpsInitial = await isToggleOn(page, '#gps-toggle');

    // Toggle sync
    await clickToggle(page, '#sync-toggle');

    // GPS should be unchanged
    const gpsAfter = await isToggleOn(page, '#gps-toggle');
    expect(gpsAfter).toBe(gpsInitial);
  });

  test('should toggle each setting independently', async ({ page }) => {
    const toggles = ['#auto-toggle', '#haptic-toggle', '#sound-toggle'];

    for (const selector of toggles) {
      const before = await isToggleOn(page, selector);

      await clickToggle(page, selector);

      const after = await isToggleOn(page, selector);
      expect(after).not.toBe(before);
    }
  });
});

test.describe('Settings - Keyboard Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');
    // Disable simple mode to access all toggles
    await disableSimpleMode(page);
  });

  test('should toggle by clicking label', async ({ page }) => {
    // Standard checkbox inputs respond to Space but not Enter
    // Test that clicking label works (accessible alternative)
    const before = await isToggleOn(page, '#haptic-toggle');

    await clickToggle(page, '#haptic-toggle');

    const after = await isToggleOn(page, '#haptic-toggle');
    expect(after).not.toBe(before);
  });

  test('should toggle with Space key', async ({ page }) => {
    const toggle = page.locator('#sound-toggle');
    const before = await toggle.evaluate(el => el.checked);

    await toggle.focus();
    await page.keyboard.press('Space');

    const after = await toggle.evaluate(el => el.checked);
    expect(after).not.toBe(before);
  });

  test('should have focus visible on toggles', async ({ page }) => {
    const toggle = page.locator('#haptic-toggle');
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
    await page.click('[data-view="settings"]');

    // Simple mode toggle label should be visible
    await expect(page.locator('label:has(#simple-mode-toggle)')).toBeVisible();
    // Sync toggle label should be visible (not hidden in simple mode)
    await expect(page.locator('label:has(#sync-toggle)')).toBeVisible();
  });

  test('should handle touch interactions on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');

    // Verify toggle label is clickable/touchable on mobile viewport
    const toggleLabel = page.locator('label:has(#simple-mode-toggle)');
    await expect(toggleLabel).toBeVisible();

    const toggle = page.locator('#simple-mode-toggle');
    const before = await toggle.isChecked();

    // Use click instead of tap - more reliable in Playwright
    await toggleLabel.click();
    await page.waitForTimeout(100);

    const after = await toggle.isChecked();
    expect(after).not.toBe(before);
  });
});

test.describe('Simple Mode Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');
  });

  test('should be on by default', async ({ page }) => {
    const toggle = page.locator('#simple-mode-toggle');
    await expect(toggle).toBeChecked();
  });

  test('should hide advanced settings in simple mode', async ({ page }) => {
    // Verify simple mode is on
    const toggle = page.locator('#simple-mode-toggle');
    await expect(toggle).toBeChecked();

    // GPS section, Timing section, and Backup section should be hidden
    await expect(page.locator('#gps-section')).not.toBeVisible();
    await expect(page.locator('#timing-section')).not.toBeVisible();
  });

  test('should show all settings when simple mode is off', async ({ page }) => {
    // Turn off simple mode
    await page.locator("label:has(#simple-mode-toggle)").click();

    // Verify toggle is off
    const toggle = page.locator('#simple-mode-toggle');
    await expect(toggle).not.toBeChecked();

    // All sections should be visible
    await expect(page.locator('#gps-section')).toBeVisible();
    await expect(page.locator('#timing-section')).toBeVisible();
  });

  test('should toggle between simple and full mode', async ({ page }) => {
    const toggle = page.locator('#simple-mode-toggle');

    // Start in simple mode
    await expect(toggle).toBeChecked();
    await expect(page.locator('#gps-section')).not.toBeVisible();

    // Toggle to full mode
    await page.locator("label:has(#simple-mode-toggle)").click();
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('#gps-section')).toBeVisible();

    // Toggle back to simple mode
    await page.locator("label:has(#simple-mode-toggle)").click();
    await expect(toggle).toBeChecked();
    await expect(page.locator('#gps-section')).not.toBeVisible();
  });

  test('should keep cloud sync and language visible in simple mode', async ({ page }) => {
    // Verify simple mode is on
    await expect(page.locator('#simple-mode-toggle')).toBeChecked();

    // Cloud sync and language toggle should still be visible
    await expect(page.locator('label:has(#sync-toggle)')).toBeVisible();
    await expect(page.locator('#lang-toggle')).toBeVisible();
  });
});
