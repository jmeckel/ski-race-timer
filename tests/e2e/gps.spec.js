/**
 * E2E Tests - GPS Functionality
 *
 * Tests for GPS synchronization, accuracy display, and timestamp integration
 */

import { test, expect } from '@playwright/test';

// Helper to disable simple mode
async function disableSimpleMode(page) {
  await page.click('[data-view="settings-view"]');
  const toggle = page.locator('#toggle-simple');
  const isSimple = await toggle.evaluate(el => el.classList.contains('on'));
  if (isSimple) {
    await toggle.click();
  }
}

// Helper to enable GPS
async function enableGPS(page) {
  await page.click('[data-view="settings-view"]');
  await disableSimpleMode(page);

  const gpsToggle = page.locator('#toggle-gps');
  const isOn = await gpsToggle.evaluate(el => el.classList.contains('on'));

  if (!isOn) {
    await gpsToggle.click();
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
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);
  });

  test('should show GPS section in full mode', async ({ page }) => {
    const gpsSection = page.locator('#gps-section');
    await expect(gpsSection).toBeVisible();
  });

  test('should hide GPS section in simple mode', async ({ page }) => {
    // Turn simple mode back on
    await page.click('#toggle-simple');

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
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);

    const gpsToggle = page.locator('#toggle-gps');

    // Ensure it starts off
    const isOn = await gpsToggle.evaluate(el => el.classList.contains('on'));
    if (isOn) {
      await gpsToggle.click();
      await page.waitForTimeout(100);
    }

    // Toggle on
    await gpsToggle.click();
    await page.waitForTimeout(500); // Wait for GPS to initialize

    await expect(gpsToggle).toHaveClass(/on/);
    await context.close();
  });

  test('should toggle GPS off', async ({ page }) => {
    const gpsToggle = page.locator('#toggle-gps');

    // Ensure it's on first
    const isOn = await gpsToggle.evaluate(el => el.classList.contains('on'));
    if (!isOn) {
      await gpsToggle.click();
    }

    // Toggle off
    await gpsToggle.click();

    await expect(gpsToggle).not.toHaveClass(/on/);
  });

  test('should persist GPS setting', async ({ browser }) => {
    // Create context with geolocation permission
    const context = await browser.newContext({
      geolocation: { latitude: 47.0707, longitude: 15.4395 },
      permissions: ['geolocation']
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);

    const gpsToggle = page.locator('#toggle-gps');

    // Ensure GPS is ON first
    const isOn = await gpsToggle.evaluate(el => el.classList.contains('on'));
    if (!isOn) {
      await gpsToggle.click();
      await page.waitForTimeout(500);
    }
    await expect(gpsToggle).toHaveClass(/on/);

    // Reload
    await page.reload();
    await page.click('[data-view="settings-view"]');
    await page.waitForSelector('#toggle-simple');

    // Disable simple mode to see GPS
    const simpleToggle = page.locator('#toggle-simple');
    const isSimple = await simpleToggle.evaluate(el => el.classList.contains('on'));
    if (isSimple) {
      await simpleToggle.click();
    }

    // GPS setting should be persisted
    await expect(page.locator('#toggle-gps')).toHaveClass(/on/);
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
    const gpsToggle = page.locator('#toggle-gps');
    await gpsToggle.click();

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
    await page.click('[data-view="results-view"]');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(1);

    await context.close();
  });

  test('should record entry even without GPS lock', async ({ page }) => {
    await page.goto('/');

    // Enable GPS but don't grant permission (no mock)
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);

    const gpsToggle = page.locator('#toggle-gps');
    const isOn = await gpsToggle.evaluate(el => el.classList.contains('on'));
    if (!isOn) {
      await gpsToggle.click();
    }

    // Record entry anyway
    await page.click('[data-view="timing-view"]');
    await page.click('[data-num="2"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Entry should still be recorded (fallback to local time)
    await page.click('[data-view="results-view"]');
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
    await page.click('#toggle-simple');

    // GPS section hidden but GPS may still be running in background
    // Recording should still work
    await page.click('[data-view="timing-view"]');
    await page.click('[data-num="3"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Entry should be recorded
    await page.click('[data-view="results-view"]');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(1);

    await context.close();
  });
});

test.describe('GPS Independence from Other Settings', () => {
  test('should toggle GPS without affecting sync', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);

    // Get initial sync state
    const syncToggle = page.locator('#toggle-sync');
    const syncInitial = await syncToggle.evaluate(el => el.classList.contains('on'));

    // Toggle GPS
    const gpsToggle = page.locator('#toggle-gps');
    await gpsToggle.click();

    // Sync should be unchanged
    const syncAfter = await syncToggle.evaluate(el => el.classList.contains('on'));
    expect(syncAfter).toBe(syncInitial);
  });

  test('should toggle GPS without affecting haptic', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');
    await disableSimpleMode(page);

    // Get initial haptic state
    const hapticToggle = page.locator('#toggle-haptic');
    const hapticInitial = await hapticToggle.evaluate(el => el.classList.contains('on'));

    // Toggle GPS
    const gpsToggle = page.locator('#toggle-gps');
    await gpsToggle.click();

    // Haptic should be unchanged
    const hapticAfter = await hapticToggle.evaluate(el => el.classList.contains('on'));
    expect(hapticAfter).toBe(hapticInitial);
  });
});
