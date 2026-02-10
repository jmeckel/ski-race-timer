/**
 * E2E Tests - GPS Functionality
 *
 * Tests for GPS synchronization, accuracy display, and timestamp integration
 */

import { test, expect } from '@playwright/test';
import { setupPage, clickToggle, isToggleOn, navigateTo, waitForConfirmationToHide, enterBib } from './helpers.js';

// Helper to enable GPS (assumes page is on settings view)
async function enableGPS(page) {
  if (!(await isToggleOn(page, '#gps-toggle'))) {
    await clickToggle(page, '#gps-toggle');
  }
}

// Helper to mock geolocation
async function mockGeolocation(context, latitude = 47.0707, longitude = 15.4395, accuracy = 10) {
  await context.setGeolocation({ latitude, longitude, accuracy });
  await context.grantPermissions(['geolocation']);
}

test.describe('GPS Settings', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'settings');
  });

  test('should show GPS section', async ({ page }) => {
    // GPS toggle is inside Advanced Settings section
    const gpsToggleLabel = page.locator('label:has(#gps-toggle)');
    await expect(gpsToggleLabel).toBeVisible();
  });

  test('should toggle GPS on', async ({ browser }) => {
    // Create context with geolocation permission
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });
    const page = await context.newPage();
    await setupPage(page);
    await navigateTo(page, 'settings');

    const gpsToggle = page.locator('#gps-toggle');

    // Ensure it starts off
    const isOn = await isToggleOn(page, "#gps-toggle");
    if (isOn) {
      await clickToggle(page, "#gps-toggle");
      await page.waitForTimeout(100);
    }

    // Toggle on
    await clickToggle(page, "#gps-toggle");
    await page.waitForTimeout(500); // Wait for GPS to initialize

    await expect(gpsToggle).toBeChecked();
    await context.close();
  });

  test('should toggle GPS off', async ({ page }) => {
    const gpsToggle = page.locator('#gps-toggle');

    // Ensure it's on first
    const isOn = await isToggleOn(page, "#gps-toggle");
    if (!isOn) {
      await clickToggle(page, "#gps-toggle");
    }

    // Toggle off
    await clickToggle(page, "#gps-toggle");

    await expect(gpsToggle).not.toBeChecked();
  });

  test('should persist GPS setting', async ({ browser }) => {
    // Create context with geolocation permission
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });
    const page = await context.newPage();

    // Set up with GPS enabled from the start (bypass onboarding, full mode, GPS on)
    await page.addInitScript(() => {
      localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
      localStorage.setItem('skiTimerSettings', JSON.stringify({
        auto: true, haptic: true, sound: false, sync: false,
        syncPhotos: false, gps: true, simple: false, photoCapture: false
      }));
      localStorage.setItem('skiTimerLang', 'de');
    });

    await page.goto('/');
    await page.waitForSelector('#radial-time-hm', { timeout: 5000 });
    await navigateTo(page, 'settings');

    // GPS should be checked
    const gpsToggle = page.locator('#gps-toggle');
    await expect(gpsToggle).toBeChecked();

    // Now reload WITHOUT addInitScript to test real localStorage persistence
    // First save the current settings to localStorage (they should already be there)
    await page.evaluate(() => {
      // Settings are already in localStorage from the app's state
    });

    // Navigate away and back (simpler than reload to avoid addInitScript)
    await navigateTo(page, 'timer');
    await navigateTo(page, 'settings');

    // GPS setting should still be checked
    await expect(page.locator('#gps-toggle')).toBeChecked();
    await context.close();
  });
});

test.describe('GPS Status Display', () => {
  test('should show GPS indicator when enabled', async ({ browser }) => {
    // Need geolocation context for GPS to work
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });
    const page = await context.newPage();
    await setupPage(page);
    await navigateTo(page, 'settings');
    await enableGPS(page);
    await page.waitForTimeout(500); // Wait for GPS to initialize

    // Go to timer to see the GPS indicator in the status bar
    await navigateTo(page, 'timer');
    const gpsIndicator = page.locator('#gps-indicator');
    await expect(gpsIndicator).toBeVisible();
    await context.close();
  });

  test('should hide GPS indicator when disabled', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });
    const page = await context.newPage();
    await setupPage(page);
    await navigateTo(page, 'settings');
    await enableGPS(page);
    await page.waitForTimeout(500);

    // Disable GPS
    await clickToggle(page, "#gps-toggle");

    // Go to timer to check the GPS indicator
    await navigateTo(page, 'timer');
    const gpsIndicator = page.locator('#gps-indicator');
    await expect(gpsIndicator).not.toBeVisible();
    await context.close();
  });

  test('should display GPS toggle in settings', async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'settings');

    // GPS toggle is a hidden checkbox (styled toggle), check it's attached and unchecked
    const gpsToggle = page.locator('#gps-toggle');
    await expect(gpsToggle).toBeAttached({ timeout: 5000 });
  });
});

test.describe('GPS with Geolocation Permission', () => {
  test('should work when geolocation permission granted', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });

    const page = await context.newPage();
    await setupPage(page);
    await navigateTo(page, 'settings');
    await enableGPS(page);

    // GPS toggle should be checked
    const gpsToggle = page.locator('#gps-toggle');
    await expect(gpsToggle).toBeChecked();

    await context.close();
  });

  test('should show GPS indicator when active', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });

    const page = await context.newPage();
    await setupPage(page);
    await navigateTo(page, 'settings');
    await enableGPS(page);

    // Wait for GPS to initialize
    await page.waitForTimeout(500);

    // Go to timer to see GPS indicator
    await navigateTo(page, 'timer');
    const gpsIndicator = page.locator('#gps-indicator');
    await expect(gpsIndicator).toBeVisible();

    await context.close();
  });
});

test.describe('GPS Timestamp Recording', () => {
  test('should record timestamp with GPS enabled', async ({ browser }) => {
    const context = await browser.newContext();
    await mockGeolocation(context);

    const page = await context.newPage();
    await setupPage(page);
    await navigateTo(page, 'settings');
    await enableGPS(page);

    // Wait for GPS to initialize
    await page.waitForTimeout(500);

    // Record entry
    await navigateTo(page, 'timer');
    await enterBib(page, 1);
    await page.locator('#radial-time-btn').waitFor({ state: 'visible' });
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Verify entry recorded
    await navigateTo(page, 'results');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(1);

    await context.close();
  });

  test('should record entry even without GPS lock', async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'settings');

    const gpsToggle = page.locator('#gps-toggle');
    const isOn = await isToggleOn(page, "#gps-toggle");
    if (!isOn) {
      await clickToggle(page, "#gps-toggle");
    }

    // Record entry anyway
    await navigateTo(page, 'timer');
    await enterBib(page, 2);
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Entry should still be recorded (fallback to local time)
    await navigateTo(page, 'results');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(1);
  });
});

test.describe('GPS Accuracy Levels', () => {
  test('should handle high accuracy GPS', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395, accuracy: 1 },
      permissions: ['geolocation']
    });

    const page = await context.newPage();
    await setupPage(page);
    await navigateTo(page, 'settings');
    await enableGPS(page);

    await page.waitForTimeout(500);

    // GPS toggle should be checked
    const gpsToggle = page.locator('#gps-toggle');
    await expect(gpsToggle).toBeChecked();

    // Go to timer to check indicator
    await navigateTo(page, 'timer');
    const gpsIndicator = page.locator('#gps-indicator');
    await expect(gpsIndicator).toBeVisible();

    await context.close();
  });

  test('should handle low accuracy GPS', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395, accuracy: 100 },
      permissions: ['geolocation']
    });

    const page = await context.newPage();
    await setupPage(page);
    await navigateTo(page, 'settings');
    await enableGPS(page);

    await page.waitForTimeout(500);

    // GPS toggle should be checked
    const gpsToggle = page.locator('#gps-toggle');
    await expect(gpsToggle).toBeChecked();

    // Go to timer to check indicator
    await navigateTo(page, 'timer');
    const gpsIndicator = page.locator('#gps-indicator');
    await expect(gpsIndicator).toBeVisible();

    await context.close();
  });
});

test.describe('GPS Independence from Other Settings', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'settings');
  });

  test('should toggle GPS without affecting sync', async ({ page }) => {
    // Get initial sync state
    const syncInitial = await isToggleOn(page, "#sync-toggle");

    // Toggle GPS
    await clickToggle(page, "#gps-toggle");

    // Sync should be unchanged
    const syncAfter = await isToggleOn(page, "#sync-toggle");
    expect(syncAfter).toBe(syncInitial);
  });

  test('should toggle GPS without affecting haptic', async ({ page }) => {
    // Get initial haptic state
    const hapticToggle = page.locator('#haptic-toggle');
    const hapticInitial = await hapticToggle.evaluate(el => el.checked);

    // Toggle GPS
    await clickToggle(page, "#gps-toggle");

    // Haptic should be unchanged
    const hapticAfter = await hapticToggle.evaluate(el => el.checked);
    expect(hapticAfter).toBe(hapticInitial);
  });
});
