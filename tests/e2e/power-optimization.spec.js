/**
 * E2E Tests - Power Optimization & Battery Management
 *
 * Tests for battery-aware power saving features:
 * - .power-saver CSS class toggling on low battery
 * - Animation disabling in power-saver mode
 * - RAF clock still ticking after battery changes
 * - Graceful degradation when Battery API unavailable
 */

import { expect, test } from '@playwright/test';
import { navigateTo, setupPage } from './helpers.js';

/**
 * Mock the Battery Status API before page load.
 * Returns a mock battery object that can be externally controlled.
 */
function mockBatteryAPI(page, { level = 1.0, charging = true } = {}) {
  return page.addInitScript(
    ({ level, charging }) => {
      // Create a mock battery manager with event dispatch support
      const listeners = {};
      const mockBattery = {
        level,
        charging,
        chargingTime: charging ? 0 : Infinity,
        dischargingTime: charging ? Infinity : 3600,
        addEventListener(type, fn) {
          if (!listeners[type]) listeners[type] = [];
          listeners[type].push(fn);
        },
        removeEventListener(type, fn) {
          if (listeners[type]) {
            listeners[type] = listeners[type].filter((l) => l !== fn);
          }
        },
        // Expose method to simulate battery changes
        _setLevel(newLevel) {
          this.level = newLevel;
          (listeners.levelchange || []).forEach((fn) => fn());
        },
        _setCharging(newCharging) {
          this.charging = newCharging;
          (listeners.chargingchange || []).forEach((fn) => fn());
        },
      };

      // Expose mock battery globally for test manipulation
      window.__mockBattery = mockBattery;

      // Override navigator.getBattery
      navigator.getBattery = () => Promise.resolve(mockBattery);
    },
    { level, charging },
  );
}

test.describe('Power Saver - Battery API Integration', () => {
  test('should NOT have power-saver class when battery is normal', async ({
    page,
  }) => {
    await mockBatteryAPI(page, { level: 0.8, charging: false });
    await setupPage(page);

    // Battery is at 80% (normal) - no power saver
    const hasPowerSaver = await page.evaluate(() =>
      document.body.classList.contains('power-saver'),
    );
    expect(hasPowerSaver).toBe(false);
  });

  test('should add power-saver class when battery is low', async ({ page }) => {
    await mockBatteryAPI(page, { level: 0.15, charging: false });
    await setupPage(page);

    // Battery at 15% not charging = low
    // Wait for battery service init + subscriber notification
    await page.waitForTimeout(500);

    const hasPowerSaver = await page.evaluate(() =>
      document.body.classList.contains('power-saver'),
    );
    expect(hasPowerSaver).toBe(true);
  });

  test('should add power-saver class when battery is critical', async ({
    page,
  }) => {
    await mockBatteryAPI(page, { level: 0.05, charging: false });
    await setupPage(page);

    await page.waitForTimeout(500);

    const hasPowerSaver = await page.evaluate(() =>
      document.body.classList.contains('power-saver'),
    );
    expect(hasPowerSaver).toBe(true);
  });

  test('should NOT add power-saver when low battery but charging', async ({
    page,
  }) => {
    // Low level but charging = normal (battery recovering)
    await mockBatteryAPI(page, { level: 0.1, charging: true });
    await setupPage(page);

    await page.waitForTimeout(500);

    const hasPowerSaver = await page.evaluate(() =>
      document.body.classList.contains('power-saver'),
    );
    expect(hasPowerSaver).toBe(false);
  });

  test('should toggle power-saver when battery level changes dynamically', async ({
    page,
  }) => {
    await mockBatteryAPI(page, { level: 0.8, charging: false });
    await setupPage(page);

    // Initially normal - no power saver
    await page.waitForTimeout(300);
    let hasPowerSaver = await page.evaluate(() =>
      document.body.classList.contains('power-saver'),
    );
    expect(hasPowerSaver).toBe(false);

    // Simulate battery dropping to low
    await page.evaluate(() => {
      window.__mockBattery._setLevel(0.15);
    });
    await page.waitForTimeout(300);

    hasPowerSaver = await page.evaluate(() =>
      document.body.classList.contains('power-saver'),
    );
    expect(hasPowerSaver).toBe(true);

    // Simulate plugging in charger (restores normal)
    await page.evaluate(() => {
      window.__mockBattery._setCharging(true);
    });
    await page.waitForTimeout(300);

    hasPowerSaver = await page.evaluate(() =>
      document.body.classList.contains('power-saver'),
    );
    expect(hasPowerSaver).toBe(false);
  });
});

test.describe('Power Saver - CSS Animation Disabling', () => {
  test('power-saver class should disable breathe animations', async ({
    page,
  }) => {
    await mockBatteryAPI(page, { level: 0.05, charging: false });
    await setupPage(page);
    await page.waitForTimeout(500);

    // Verify power-saver is active
    const hasPowerSaver = await page.evaluate(() =>
      document.body.classList.contains('power-saver'),
    );
    expect(hasPowerSaver).toBe(true);

    // Check that the CSS rule for .power-saver disables animations
    const animationRule = await page.evaluate(() => {
      // Create a test element to check computed style
      const el = document.createElement('div');
      el.className = 'breathe-glow';
      document.body.appendChild(el);
      const style = getComputedStyle(el);
      const animation = style.animationName || style.animation;
      document.body.removeChild(el);
      return animation;
    });

    // Animation should be 'none' when power-saver is active
    expect(animationRule).toContain('none');
  });

  test('power-saver class should disable snowflake spinner', async ({
    page,
  }) => {
    await mockBatteryAPI(page, { level: 0.05, charging: false });
    await setupPage(page);
    await page.waitForTimeout(500);

    const animationRule = await page.evaluate(() => {
      const spinner = document.createElement('div');
      spinner.className = 'snowflake-spinner';
      const flake = document.createElement('div');
      flake.className = 'flake';
      spinner.appendChild(flake);
      document.body.appendChild(spinner);
      const style = getComputedStyle(flake);
      const animation = style.animationName || style.animation;
      document.body.removeChild(spinner);
      return animation;
    });

    expect(animationRule).toContain('none');
  });
});

test.describe('Power Saver - Clock Still Works', () => {
  test('clock should still update when battery is low', async ({ page }) => {
    await mockBatteryAPI(page, { level: 0.15, charging: false });
    await setupPage(page);

    // Clock should be running even in power-saver mode
    const clockSec = page.locator('#radial-time-seconds');
    const initialSec = await clockSec.textContent();

    // Wait for clock to tick (may skip frames, so wait longer)
    await page.waitForTimeout(2000);
    const newSec = await clockSec.textContent();

    expect(newSec).not.toBe(initialSec);
  });

  test('clock should still update when battery is critical', async ({
    page,
  }) => {
    await mockBatteryAPI(page, { level: 0.05, charging: false });
    await setupPage(page);

    const clockSec = page.locator('#radial-time-seconds');
    const initialSec = await clockSec.textContent();

    // Frame skipping at critical = 15fps, so seconds still change within 2s
    await page.waitForTimeout(2000);
    const newSec = await clockSec.textContent();

    expect(newSec).not.toBe(initialSec);
  });

  test('recording timestamps should work in power-saver mode', async ({
    page,
  }) => {
    await mockBatteryAPI(page, { level: 0.05, charging: false });
    await setupPage(page);

    // Record a timestamp
    await page.click('#radial-time-btn');
    await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(
      /show/,
    );
  });
});

test.describe('Power Saver - Battery API Unavailable', () => {
  test('app should work normally without Battery API', async ({ page }) => {
    // Explicitly remove Battery API before app loads
    await page.addInitScript(() => {
      delete navigator.getBattery;
    });
    await setupPage(page);

    // No power-saver class should be present
    const hasPowerSaver = await page.evaluate(() =>
      document.body.classList.contains('power-saver'),
    );
    expect(hasPowerSaver).toBe(false);

    // Clock should still work
    const clockSec = page.locator('#radial-time-seconds');
    const initialSec = await clockSec.textContent();
    await page.waitForTimeout(1500);
    const newSec = await clockSec.textContent();
    expect(newSec).not.toBe(initialSec);
  });

  test('all views should be accessible without Battery API', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      delete navigator.getBattery;
    });
    await setupPage(page);

    // Navigate through all views
    await navigateTo(page, 'results');
    await expect(page.locator('.results-view')).toBeVisible();

    await navigateTo(page, 'settings');
    await expect(page.locator('.settings-view')).toBeVisible();

    await navigateTo(page, 'timer');
    await expect(page.locator('.timer-view')).toBeVisible();
  });
});
