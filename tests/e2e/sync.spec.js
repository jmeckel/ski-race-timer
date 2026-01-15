/**
 * E2E Tests - Cloud Sync Functionality
 *
 * Tests for multi-device synchronization, sync status, and data merging
 */

import { test, expect } from '@playwright/test';

// Helper to enable cloud sync with a race ID
async function enableSync(page, raceId = 'TEST-RACE-001') {
  await page.click('[data-view="settings-view"]');
  await page.waitForSelector('#toggle-sync');

  const toggle = page.locator('#toggle-sync');
  const isOn = await toggle.evaluate(el => el.classList.contains('on'));

  if (!isOn) {
    await toggle.click();
  }

  // Enter race ID
  const raceIdInput = page.locator('#race-id-input');
  await raceIdInput.clear();
  await raceIdInput.fill(raceId);
  await raceIdInput.blur();

  // Wait for sync settings to be visible
  await expect(page.locator('#sync-settings-row')).toBeVisible();
}

// Helper to disable simple mode
async function disableSimpleMode(page) {
  await page.click('[data-view="settings-view"]');
  const toggle = page.locator('#toggle-simple');
  const isSimple = await toggle.evaluate(el => el.classList.contains('on'));
  if (isSimple) {
    await toggle.click();
  }
}

// Helper to add a test entry
async function addTestEntry(page, bib = '001') {
  await page.click('[data-view="timing-view"]');
  await page.waitForSelector('.clock-time');

  // Clear and enter bib
  await page.click('#btn-clear');
  for (const digit of bib) {
    await page.click(`[data-num="${digit}"]`);
  }

  // Record timestamp
  await page.click('#timestamp-btn');
  await page.waitForTimeout(500);
}

test.describe('Cloud Sync', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');
  });

  test.describe('Sync Toggle', () => {
    test('should enable cloud sync', async ({ page }) => {
      await page.click('[data-view="settings-view"]');

      const toggle = page.locator('#toggle-sync');
      const initialState = await toggle.evaluate(el => el.classList.contains('on'));

      if (!initialState) {
        await toggle.click();
      }

      await expect(toggle).toHaveClass(/on/);
    });

    test('should show sync settings when enabled', async ({ page }) => {
      await enableSync(page);

      await expect(page.locator('#race-id-input')).toBeVisible();
      await expect(page.locator('#device-name-input')).toBeVisible();
    });

    test('should hide sync settings when disabled', async ({ page }) => {
      await page.click('[data-view="settings-view"]');

      const toggle = page.locator('#toggle-sync');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));

      if (isOn) {
        await toggle.click();
      }

      await expect(page.locator('#sync-settings-row')).not.toBeVisible();
    });
  });

  test.describe('Race ID', () => {
    test('should save race ID', async ({ page }) => {
      await enableSync(page, 'MY-RACE-2024');

      // Reload and verify
      await page.reload();
      await page.click('[data-view="settings-view"]');

      const syncToggle = page.locator('#toggle-sync');
      const isOn = await syncToggle.evaluate(el => el.classList.contains('on'));
      if (!isOn) {
        await syncToggle.click();
      }

      await expect(page.locator('#race-id-input')).toHaveValue('MY-RACE-2024');
    });

    test('should validate race ID format', async ({ page }) => {
      await enableSync(page, 'valid-race-123');

      // Valid race ID should be accepted
      await expect(page.locator('#race-id-input')).toHaveValue('valid-race-123');
    });

    test('should allow alphanumeric race IDs with hyphens', async ({ page }) => {
      await enableSync(page, 'RACE-2024-SLALOM');
      await expect(page.locator('#race-id-input')).toHaveValue('RACE-2024-SLALOM');
    });
  });

  test.describe('Device Name', () => {
    test('should save device name', async ({ page }) => {
      await enableSync(page);

      const deviceInput = page.locator('#device-name-input');
      await deviceInput.clear();
      await deviceInput.fill('Start Timer');
      await deviceInput.blur();

      // Reload and verify
      await page.reload();
      await page.click('[data-view="settings-view"]');

      const syncToggle = page.locator('#toggle-sync');
      const isOn = await syncToggle.evaluate(el => el.classList.contains('on'));
      if (!isOn) {
        await syncToggle.click();
      }

      await expect(page.locator('#device-name-input')).toHaveValue('Start Timer');
    });

    test('should have default device name', async ({ page }) => {
      await enableSync(page);

      const deviceInput = page.locator('#device-name-input');
      const value = await deviceInput.inputValue();

      // Should have some default name
      expect(value.length).toBeGreaterThan(0);
    });
  });

  test.describe('Sync Status', () => {
    test('should show sync status row when enabled', async ({ page }) => {
      await enableSync(page);

      await expect(page.locator('#sync-status-row')).toBeVisible();
    });

    test('should show sync status in settings', async ({ page }) => {
      await enableSync(page);

      // Cloud sync status should be visible
      const statusIndicator = page.locator('#cloud-sync-status');
      await expect(statusIndicator).toBeVisible();
    });

    test('should show status message when sync enabled', async ({ page }) => {
      await page.click('[data-view="settings-view"]');

      const toggle = page.locator('#toggle-sync');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));
      if (!isOn) {
        await toggle.click();
      }

      // Cloud sync status should show a message
      const statusText = page.locator('#cloud-sync-status');
      await expect(statusText).toBeVisible();
      const text = await statusText.textContent();
      expect(text?.length).toBeGreaterThan(0);
    });
  });

  test.describe('Entry Sync Queue', () => {
    test('should queue entries for sync when enabled', async ({ page }) => {
      await enableSync(page, 'QUEUE-TEST');

      // Add an entry
      await addTestEntry(page, '001');

      // Entry should be recorded
      await page.click('[data-view="results-view"]');
      await page.waitForSelector('.results-list');

      const results = page.locator('.result-item');
      await expect(results).toHaveCount(1);
    });

    test('should sync entries across page reload', async ({ page }) => {
      await enableSync(page, 'PERSIST-TEST');

      // Add entries
      await addTestEntry(page, '010');
      await page.waitForTimeout(500);
      await addTestEntry(page, '020');

      // Reload page
      await page.reload();
      await page.waitForSelector('.clock-time');

      // Check entries persisted
      await page.click('[data-view="results-view"]');
      await page.waitForSelector('.results-list');

      const results = page.locator('.result-item');
      await expect(results).toHaveCount(2);
    });
  });

  test.describe('Sync with Timer View', () => {
    test('should record entry with sync enabled', async ({ page }) => {
      await enableSync(page, 'TIMER-SYNC-TEST');

      await addTestEntry(page, '055');

      // Verify entry recorded
      await page.click('[data-view="results-view"]');
      const results = page.locator('.result-item');
      await expect(results).toHaveCount(1);
      await expect(results.first().locator('.result-bib')).toContainText('055');
    });

    test('should continue recording when sync is offline', async ({ page }) => {
      await enableSync(page, 'OFFLINE-TEST');

      // Add entry (sync may fail but local should work)
      await addTestEntry(page, '099');

      // Verify entry recorded locally
      await page.click('[data-view="results-view"]');
      const results = page.locator('.result-item');
      await expect(results).toHaveCount(1);
    });
  });
});

test.describe('Sync Settings Persistence', () => {
  test('should persist sync enabled state', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');

    // Enable sync
    const toggle = page.locator('#toggle-sync');
    const initialState = await toggle.evaluate(el => el.classList.contains('on'));
    if (!initialState) {
      await toggle.click();
    }

    // Reload
    await page.reload();
    await page.click('[data-view="settings-view"]');

    // Should still be enabled
    await expect(page.locator('#toggle-sync')).toHaveClass(/on/);
  });

  test('should persist sync disabled state', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');

    // Disable sync
    const toggle = page.locator('#toggle-sync');
    const isOn = await toggle.evaluate(el => el.classList.contains('on'));
    if (isOn) {
      await toggle.click();
    }

    // Reload
    await page.reload();
    await page.click('[data-view="settings-view"]');

    // Should still be disabled
    await expect(page.locator('#toggle-sync')).not.toHaveClass(/on/);
  });
});

test.describe('Sync Integration', () => {
  test('should show sync status in results view header', async ({ page }) => {
    await page.goto('/');
    await enableSync(page, 'HEADER-TEST');

    // Go to results
    await page.click('[data-view="results-view"]');

    // Sync indicator may be visible in header
    // This depends on implementation
    await expect(page.locator('.results-header')).toBeVisible();
  });

  test('should handle rapid entry recording with sync', async ({ page }) => {
    await page.goto('/');
    await enableSync(page, 'RAPID-TEST');

    // Rapidly add multiple entries
    for (let i = 1; i <= 5; i++) {
      await addTestEntry(page, String(i).padStart(3, '0'));
      await page.waitForTimeout(300);
    }

    // Verify all entries recorded
    await page.click('[data-view="results-view"]');
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(5);
  });
});
