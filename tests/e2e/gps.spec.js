/**
 * E2E Tests - GPS Functionality
 *
 * Tests for GPS synchronization, accuracy display, and timestamp integration
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

// Helper to disable simple mode
async function disableSimpleMode(page) {
  await page.click('[data-view="settings"]');
  if (await isToggleOn(page, '#simple-mode-toggle')) {
    await clickToggle(page, '#simple-mode-toggle');
  }
}

// Helper to enable GPS
async function enableGPS(page) {
  await page.click('[data-view="settings"]');
  await disableSimpleMode(page);

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
    await page.goto('/');
    await page.click('[data-view="settings"]');
    await disableSimpleMode(page);
  });

  test('should show GPS section in full mode', async ({ page }) => {
    const gpsSection = page.locator('#gps-section');
    await expect(gpsSection).toBeVisible();
  });

  test('should hide GPS section in simple mode', async ({ page }) => {
    // Turn simple mode back on
    await clickToggle(page, "#simple-mode-toggle");

    const gpsSection = page.locator('#gps-section');
    await expect(gpsSection).not.toBeVisible();
  });

  test('should toggle GPS on', async ({ browser }) => {
    // Create context with geolocation permission
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.click('[data-view="settings"]');
    await disableSimpleMode(page);

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
    await page.goto('/');
    await page.click('[data-view="settings"]');
    await disableSimpleMode(page);

    const gpsToggle = page.locator('#gps-toggle');

    // Ensure GPS is ON first
    const isOn = await isToggleOn(page, "#gps-toggle");
    if (!isOn) {
      await clickToggle(page, "#gps-toggle");
      await page.waitForTimeout(500);
    }
    await expect(gpsToggle).toBeChecked();

    // Reload
    await page.reload();
    await page.click('[data-view="settings"]');
    await page.waitForSelector('#simple-mode-toggle');

    // Disable simple mode to see GPS
    const simpleToggle = page.locator('#simple-mode-toggle');
    const isSimple = await isToggleOn(page, "#simple-mode-toggle");
    if (isSimple) {
      await clickToggle(page, "#simple-mode-toggle");
    }

    // GPS setting should be persisted
    await expect(page.locator('#gps-toggle')).toBeChecked();
    await context.close();
  });
});

test.describe('GPS Status Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await enableGPS(page);
  });

  test('should show GPS status row when enabled', async ({ page }) => {
    const statusRow = page.locator('#gps-status-row');
    await expect(statusRow).toBeVisible();
  });

  test('should hide GPS status row when disabled', async ({ page }) => {
    // Disable GPS
    const gpsToggle = page.locator('#gps-toggle');
    await clickToggle(page, "#gps-toggle");

    const statusRow = page.locator('#gps-status-row');
    await expect(statusRow).not.toBeVisible();
  });

  test('should display GPS status in settings', async ({ page }) => {
    // GPS status is in settings row
    const settingsGpsStatus = page.locator('#settings-gps-status');
    await expect(settingsGpsStatus).toBeVisible();
  });
});

test.describe('GPS with Geolocation Permission', () => {
  test('should work when geolocation permission granted', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });

    const page = await context.newPage();
    await page.goto('/');
    await enableGPS(page);

    // GPS status should be visible in settings
    const settingsStatus = page.locator('#settings-gps-status');
    await expect(settingsStatus).toBeVisible();

    await context.close();
  });

  test('should show GPS status when active', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });

    const page = await context.newPage();
    await page.goto('/');
    await enableGPS(page);

    // Wait for GPS to initialize
    await page.waitForTimeout(1000);

    // Settings GPS status should be visible
    const settingsStatus = page.locator('#settings-gps-status');
    await expect(settingsStatus).toBeVisible();

    await context.close();
  });
});

test.describe('GPS Timestamp Recording', () => {
  test('should record timestamp with GPS enabled', async ({ browser }) => {
    const context = await browser.newContext();
    await mockGeolocation(context);

    const page = await context.newPage();
    await page.goto('/');
    await enableGPS(page);

    // Wait for GPS to initialize
    await page.waitForTimeout(500);

    // Record entry
    await page.click('[data-view="timing-view"]');
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Verify entry recorded
    await page.click('[data-view="results"]');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(1);

    await context.close();
  });

  test('should record entry even without GPS lock', async ({ page }) => {
    await page.goto('/');

    // Enable GPS but don't grant permission (no mock)
    await page.click('[data-view="settings"]');
    await disableSimpleMode(page);

    const gpsToggle = page.locator('#gps-toggle');
    const isOn = await isToggleOn(page, "#gps-toggle");
    if (!isOn) {
      await clickToggle(page, "#gps-toggle");
    }

    // Record entry anyway
    await page.click('[data-view="timing-view"]');
    await page.click('[data-num="2"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Entry should still be recorded (fallback to local time)
    await page.click('[data-view="results"]');
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
    await page.goto('/');
    await enableGPS(page);

    await page.waitForTimeout(500);

    // GPS status should be visible
    const settingsStatus = page.locator('#settings-gps-status');
    await expect(settingsStatus).toBeVisible();

    await context.close();
  });

  test('should handle low accuracy GPS', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395, accuracy: 100 },
      permissions: ['geolocation']
    });

    const page = await context.newPage();
    await page.goto('/');
    await enableGPS(page);

    await page.waitForTimeout(500);

    // GPS status should still be visible
    const settingsStatus = page.locator('#settings-gps-status');
    await expect(settingsStatus).toBeVisible();

    await context.close();
  });
});

test.describe('GPS and Simple Mode', () => {
  test('should keep GPS running in simple mode', async ({ browser }) => {
    const context = await browser.newContext();
    await mockGeolocation(context);

    const page = await context.newPage();
    await page.goto('/');

    // Enable GPS in full mode
    await enableGPS(page);
    await page.waitForTimeout(500);

    // Switch to simple mode
    await clickToggle(page, "#simple-mode-toggle");

    // GPS section hidden but GPS may still be running in background
    // Recording should still work
    await page.click('[data-view="timing-view"]');
    await page.click('[data-num="3"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Entry should be recorded
    await page.click('[data-view="results"]');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(1);

    await context.close();
  });
});

test.describe('GPS Independence from Other Settings', () => {
  test('should toggle GPS without affecting sync', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');
    await disableSimpleMode(page);

    // Get initial sync state
    const syncToggle = page.locator('#sync-toggle');
    const syncInitial = await isToggleOn(page, "#sync-toggle");

    // Toggle GPS
    const gpsToggle = page.locator('#gps-toggle');
    await clickToggle(page, "#gps-toggle");

    // Sync should be unchanged
    const syncAfter = await isToggleOn(page, "#sync-toggle");
    expect(syncAfter).toBe(syncInitial);
  });

  test('should toggle GPS without affecting haptic', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');
    await disableSimpleMode(page);

    // Get initial haptic state
    const hapticToggle = page.locator('#haptic-toggle');
    const hapticInitial = await hapticToggle.evaluate(el => el.checked);

    // Toggle GPS
    const gpsToggle = page.locator('#gps-toggle');
    await clickToggle(page, "#gps-toggle");

    // Haptic should be unchanged
    const hapticAfter = await hapticToggle.evaluate(el => el.checked);
    expect(hapticAfter).toBe(hapticInitial);
  });
});
