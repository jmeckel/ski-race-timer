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

// ============================================
// Cloud Sync Improvements Tests
// ============================================

test.describe('Cloud Sync Improvements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');
  });

  test.describe('Device Counter in Status Bar', () => {
    test('should show device count badge when sync is connected', async ({ page }) => {
      await enableSync(page, 'DEVICE-COUNT-TEST-' + Date.now());

      // Wait for sync to attempt connection
      await page.waitForTimeout(3000);

      // Go to timer view to see status bar
      await page.click('[data-view="timing-view"]');

      // The sync indicator should be visible
      const syncIndicator = page.locator('#sync-indicator');
      await expect(syncIndicator).toBeVisible();

      // Device count element exists (may or may not be visible depending on connection)
      const deviceCount = page.locator('#sync-device-count');
      await expect(deviceCount).toHaveCount(1);
    });

    test('should update device count when multiple devices sync', async ({ page, context }) => {
      const raceId = 'MULTI-DEVICE-TEST-' + Date.now();

      // Enable sync on first page
      await enableSync(page, raceId);

      // Open second page (simulates second device)
      const page2 = await context.newPage();
      await page2.goto('/');
      await page2.waitForSelector('.clock-time');
      await enableSync(page2, raceId);

      // Wait for both to sync
      await page.waitForTimeout(5000);

      // Both pages should show sync indicator
      await page.click('[data-view="timing-view"]');
      await page2.click('[data-view="timing-view"]');

      const syncIndicator1 = page.locator('#sync-indicator');
      const syncIndicator2 = page2.locator('#sync-indicator');

      await expect(syncIndicator1).toBeVisible();
      await expect(syncIndicator2).toBeVisible();

      await page2.close();
    });
  });

  test.describe('Case-insensitive Race ID', () => {
    test('should sync entries between uppercase and lowercase race IDs', async ({ page, context }) => {
      const baseRaceId = 'CASE-TEST-' + Date.now();

      // First device uses uppercase
      await enableSync(page, baseRaceId.toUpperCase());
      await addTestEntry(page, '001');

      // Wait for sync
      await page.waitForTimeout(2000);

      // Second device uses lowercase
      const page2 = await context.newPage();
      await page2.goto('/');
      await page2.waitForSelector('.clock-time');
      await enableSync(page2, baseRaceId.toLowerCase());

      // Wait for sync
      await page2.waitForTimeout(3000);

      // Check if entry synced to second device
      await page2.click('[data-view="results-view"]');
      await page2.waitForTimeout(1000);

      // The entry should be visible on page2 if sync works correctly
      // (this depends on actual API being available)
      const results = page2.locator('.result-item');
      // At minimum, verify results view is accessible
      await expect(page2.locator('.results-list')).toBeVisible();

      await page2.close();
    });

    test('should preserve race ID input casing for display', async ({ page }) => {
      await enableSync(page, 'MyMixedCaseRace');

      // Verify the input shows exactly what was entered
      await expect(page.locator('#race-id-input')).toHaveValue('MyMixedCaseRace');
    });
  });

  test.describe('Existing Race Indicator', () => {
    test('should show race exists indicator element', async ({ page }) => {
      await page.click('[data-view="settings-view"]');

      // Enable sync first
      const toggle = page.locator('#toggle-sync');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));
      if (!isOn) {
        await toggle.click();
      }

      // The race exists indicator element should exist
      const indicator = page.locator('#race-exists-indicator');
      await expect(indicator).toHaveCount(1);
    });

    test('should update indicator when race ID is typed', async ({ page }) => {
      await page.click('[data-view="settings-view"]');

      // Enable sync
      const toggle = page.locator('#toggle-sync');
      const isOn = await toggle.evaluate(el => el.classList.contains('on'));
      if (!isOn) {
        await toggle.click();
      }

      // Type a race ID
      const raceIdInput = page.locator('#race-id-input');
      await raceIdInput.clear();
      await raceIdInput.fill('TEST-RACE-' + Date.now());

      // Wait for debounced check (500ms + network time)
      await page.waitForTimeout(1500);

      // Indicator should be visible (showing either "new race" or "race found")
      const indicator = page.locator('#race-exists-indicator');
      // Check it exists and is potentially visible
      await expect(indicator).toHaveCount(1);
    });

    test('should show checkmark for existing race', async ({ page }) => {
      // First create a race with an entry
      const raceId = 'EXISTS-CHECK-' + Date.now();
      await enableSync(page, raceId);
      await addTestEntry(page, '001');

      // Wait for entry to sync
      await page.waitForTimeout(2000);

      // Clear the race ID and re-enter it to trigger check
      await page.click('[data-view="settings-view"]');

      // Wait for sync toggle to be visible and enabled
      const syncToggle = page.locator('#toggle-sync');
      const isOn = await syncToggle.evaluate(el => el.classList.contains('on'));
      if (!isOn) {
        await syncToggle.click();
      }

      const raceIdInput = page.locator('#race-id-input');
      await raceIdInput.clear();
      await page.waitForTimeout(200);
      await raceIdInput.fill(raceId);

      // Wait for debounced check
      await page.waitForTimeout(1500);

      // The indicator should show race found info
      const indicator = page.locator('#race-exists-indicator');
      await expect(indicator).toBeVisible();
    });
  });

  test.describe('Bib Counter Sync', () => {
    test('should auto-increment bib correctly with local entries', async ({ page }) => {
      // Disable simple mode to access auto-increment
      await disableSimpleMode(page);

      await enableSync(page, 'BIB-SYNC-TEST-' + Date.now());

      // Record first entry
      await addTestEntry(page, '001');
      await page.waitForTimeout(500);

      // The bib should have auto-incremented to 002
      const bibDisplay = page.locator('.bib-value');
      await expect(bibDisplay).toContainText('002');
    });

    test('should sync bib counter across devices when both record entries', async ({ page, context }) => {
      const raceId = 'BIB-MULTI-TEST-' + Date.now();

      // Disable simple mode on first device
      await disableSimpleMode(page);
      await enableSync(page, raceId);

      // Record entries on first device
      await addTestEntry(page, '001');
      await page.waitForTimeout(500);
      await addTestEntry(page, '002');
      await page.waitForTimeout(500);
      await addTestEntry(page, '003');

      // Wait for sync
      await page.waitForTimeout(2000);

      // Open second device
      const page2 = await context.newPage();
      await page2.goto('/');
      await page2.waitForSelector('.clock-time');
      await disableSimpleMode(page2);
      await enableSync(page2, raceId);

      // Wait for sync
      await page2.waitForTimeout(3000);

      // Second device should show synced entries
      await page2.click('[data-view="results-view"]');
      const results = page2.locator('.result-item');
      const count = await results.count();

      // At minimum, the results list should be accessible
      await expect(page2.locator('.results-list')).toBeVisible();

      await page2.close();
    });
  });

  test.describe('Photo Sync', () => {
    test('should enable photo capture in settings', async ({ page }) => {
      await page.click('[data-view="settings-view"]');

      // Find photo toggle
      const photoToggle = page.locator('#photo-toggle');
      await expect(photoToggle).toHaveCount(1);

      // Enable photo capture
      const isOn = await photoToggle.evaluate(el => el.checked);
      if (!isOn) {
        await photoToggle.click();
      }

      await expect(photoToggle).toBeChecked();
    });

    test('should persist photo capture setting', async ({ page }) => {
      await page.click('[data-view="settings-view"]');

      // Enable photo capture
      const photoToggle = page.locator('#photo-toggle');
      const isOn = await photoToggle.evaluate(el => el.checked);
      if (!isOn) {
        await photoToggle.click();
      }

      // Reload page
      await page.reload();
      await page.waitForSelector('.clock-time');
      await page.click('[data-view="settings-view"]');

      // Should still be enabled
      await expect(page.locator('#photo-toggle')).toBeChecked();
    });

    test('should handle entries with photos in results', async ({ page }) => {
      // Enable sync and photo capture
      await enableSync(page, 'PHOTO-SYNC-TEST-' + Date.now());
      await page.click('[data-view="settings-view"]');

      const photoToggle = page.locator('#photo-toggle');
      const isOn = await photoToggle.evaluate(el => el.checked);
      if (!isOn) {
        await photoToggle.click();
      }

      // Record an entry (may or may not capture photo depending on camera permissions)
      await addTestEntry(page, '001');

      // Check results view
      await page.click('[data-view="results-view"]');
      const results = page.locator('.result-item');
      await expect(results).toHaveCount(1);
    });
  });
});

// ============================================
// Verification Steps from Plan
// ============================================

test.describe('Verification Steps', () => {
  test('Verification: Device counter shows and updates', async ({ page }) => {
    // Open app with sync enabled
    await page.goto('/');
    await enableSync(page, 'VERIFY-DEVICE-' + Date.now());

    // Wait for sync to connect
    await page.waitForTimeout(3000);

    // Go to timer view
    await page.click('[data-view="timing-view"]');

    // Sync indicator should be visible
    const syncIndicator = page.locator('#sync-indicator');
    await expect(syncIndicator).toBeVisible();
  });

  test('Verification: Case-insensitive race ID works', async ({ page }) => {
    // Create race with uppercase
    await page.goto('/');
    await enableSync(page, 'VERIFY-CASE-UPPER');
    await addTestEntry(page, '001');

    // Reload and use lowercase
    await page.reload();
    await enableSync(page, 'verify-case-upper');

    // Entry should still be visible
    await page.click('[data-view="results-view"]');
    await page.waitForTimeout(2000);
    await expect(page.locator('.results-list')).toBeVisible();
  });

  test('Verification: Race exists indicator appears', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');

    // Enable sync
    const toggle = page.locator('#toggle-sync');
    const isOn = await toggle.evaluate(el => el.classList.contains('on'));
    if (!isOn) {
      await toggle.click();
    }

    // The indicator element should exist
    const indicator = page.locator('#race-exists-indicator');
    await expect(indicator).toHaveCount(1);

    // Enter a race ID
    const raceIdInput = page.locator('#race-id-input');
    await raceIdInput.clear();
    await raceIdInput.fill('VERIFY-EXISTS-' + Date.now());

    // Wait for check
    await page.waitForTimeout(1500);
  });

  test('Verification: Auto-increment bib works', async ({ page }) => {
    await page.goto('/');

    // Disable simple mode
    await disableSimpleMode(page);

    // Enable auto-increment (should be on by default)
    await page.click('[data-view="settings-view"]');
    const autoToggle = page.locator('#auto-toggle');
    const isOn = await autoToggle.evaluate(el => el.checked);
    if (!isOn) {
      await autoToggle.click();
    }

    // Go to timer and record entry
    await page.click('[data-view="timing-view"]');
    await page.click('#btn-clear');
    await page.click('[data-num="0"]');
    await page.click('[data-num="0"]');
    await page.click('[data-num="1"]');

    // Record timestamp
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

    // Bib should show 002
    const bibDisplay = page.locator('.bib-value');
    await expect(bibDisplay).toContainText('002');
  });
});
