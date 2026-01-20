/**
 * E2E Tests - Settings View
 * Tests for app settings and configuration
 */

import { test, expect } from '@playwright/test';
import { setupPage, setupPageFullMode, clickToggle, isToggleOn, navigateTo } from './helpers.js';

test.describe('Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'settings');
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
      await expect(page.locator('#gps-section')).not.toBeVisible();
      await clickToggle(page, '#simple-mode-toggle');
      await expect(page.locator('#gps-section')).toBeVisible();
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

      const raceIdInput = page.locator('#race-id-input');
      await expect(raceIdInput).toBeVisible();
    });
  });

  test.describe('Language Settings', () => {
    test('should toggle language', async ({ page }) => {
      const langToggle = page.locator('#lang-toggle');
      const initialActiveLang = await langToggle.locator('.lang-option.active').getAttribute('data-lang');

      const inactiveOption = langToggle.locator('.lang-option:not(.active)');
      await inactiveOption.click();

      const newActiveLang = await langToggle.locator('.lang-option.active').getAttribute('data-lang');
      expect(newActiveLang).not.toBe(initialActiveLang);
    });
  });
});

test.describe('Settings View - Full Mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupPageFullMode(page);
    await navigateTo(page, 'settings');
  });

  test.describe('GPS Settings', () => {
    test('should toggle GPS on', async ({ page }) => {
      const toggle = page.locator('#gps-toggle');
      const isOn = await isToggleOn(page, '#gps-toggle');

      if (!isOn) {
        await clickToggle(page, '#gps-toggle');
        await expect(toggle).toBeChecked();
      }
    });

    test('should toggle GPS off', async ({ page }) => {
      const toggle = page.locator('#gps-toggle');
      const isOn = await isToggleOn(page, '#gps-toggle');

      if (!isOn) {
        await clickToggle(page, '#gps-toggle');
      }
      await clickToggle(page, '#gps-toggle');
      await expect(toggle).not.toBeChecked();
    });
  });

  test.describe('Haptic Feedback Setting', () => {
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
});

test.describe('Settings - Keyboard Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupPageFullMode(page);
    await navigateTo(page, 'settings');
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

    const outline = await toggle.evaluate(el => getComputedStyle(el).outline);
    expect(outline).not.toBe('none');
  });
});

test.describe('Settings - Toggle Independence', () => {
  test.beforeEach(async ({ page }) => {
    await setupPageFullMode(page);
    await navigateTo(page, 'settings');
  });

  test('should toggle GPS without affecting sync', async ({ page }) => {
    const syncInitial = await isToggleOn(page, '#sync-toggle');
    await clickToggle(page, '#gps-toggle');
    const syncAfter = await isToggleOn(page, '#sync-toggle');
    expect(syncAfter).toBe(syncInitial);
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
