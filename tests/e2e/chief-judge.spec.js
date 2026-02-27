/**
 * E2E Tests - Chief Judge View
 * Tests the Chief Judge panel structure, fault summary, export buttons,
 * pending deletions, penalty configuration, and accessibility attributes.
 *
 * The Chief Judge panel lives inside the Results view and is activated
 * by clicking the chief-judge-toggle-btn. The toggle and its initialization
 * are part of the gate judge role views, so the device must be set up as
 * a gate judge with sync enabled for the chief judge toggle to appear.
 */

import { expect, test } from '@playwright/test';
import { navigateTo } from './helpers.js';

/**
 * Setup page as gate judge with sync enabled so chief judge toggle is available.
 *
 * Key requirements for the chief judge toggle to work without a backend:
 * - deviceRole = 'gateJudge' (triggers initRoleViews which initializes the toggle)
 * - settings.sync = true (toggle visibility check)
 * - NO raceId set (avoids the sync init path that would disable sync without auth token,
 *   and also bypasses PIN verification on toggle click since the condition is
 *   `state.settings.sync && state.raceId`)
 *
 * Injects optional fault entries into localStorage so the panel has data.
 */
async function setupChiefJudge(page, { lang = 'en', faults = [] } = {}) {
  await page.addInitScript(
    ({ lang, faults }) => {
      localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
      localStorage.setItem(
        'skiTimerSettings',
        JSON.stringify({
          auto: true,
          haptic: true,
          sound: false,
          sync: true, // Sync must be enabled for chief judge toggle to show
          syncPhotos: false,
          gps: false,
          simple: false,
          photoCapture: false,
        }),
      );
      localStorage.setItem('skiTimerLang', lang);
      // Deliberately NO raceId — avoids sync init (which disables sync without
      // auth token) and bypasses PIN verification on toggle click

      // Gate judge role is required for chief judge toggle initialization
      localStorage.setItem('skiTimerDeviceRole', 'gateJudge');
      localStorage.setItem('skiTimerGateAssignment', JSON.stringify([1, 10]));
      localStorage.setItem('skiTimerFirstGateColor', 'red');

      if (faults.length > 0) {
        localStorage.setItem('skiTimerFaultEntries', JSON.stringify(faults));
      }
    },
    { lang, faults },
  );

  await page.goto('/');
  // Gate judge view loads by default for gateJudge role
  await page.waitForSelector('.gate-judge-view', {
    state: 'visible',
    timeout: 5000,
  });
}

/**
 * Navigate to Results and activate Chief Judge mode.
 * Since no raceId is set, the toggle click bypasses PIN verification
 * (condition: state.settings.sync && state.raceId — raceId is falsy).
 */
async function activateChiefJudgePanel(page) {
  await navigateTo(page, 'results');

  // The toggle row should be visible because sync is enabled
  const toggleBtn = page.locator('#chief-judge-toggle-btn');
  await expect(toggleBtn).toBeVisible();

  // Click the toggle to enter Chief Judge mode (no PIN required without raceId)
  await toggleBtn.click();

  // Wait for the chief judge panel to become visible
  await expect(page.locator('#chief-judge-panel')).toBeVisible();
}

/**
 * Create a minimal fault entry object for test data injection
 */
function createTestFault({
  id,
  bib,
  run = 1,
  gateNumber,
  faultType = 'MG',
  deviceName = 'Judge A',
  markedForDeletion = false,
  markedForDeletionBy = undefined,
  markedForDeletionAt = undefined,
  notes = undefined,
}) {
  return {
    id: id || `fault-${bib}-${gateNumber}-${Date.now()}`,
    bib: String(bib),
    run,
    gateNumber,
    faultType,
    timestamp: new Date().toISOString(),
    deviceId: 'test-device-001',
    deviceName,
    gateRange: [1, 10],
    currentVersion: 1,
    versionHistory: [],
    markedForDeletion,
    markedForDeletionBy,
    markedForDeletionAt,
    notes,
  };
}

// ---------------------------------------------------------------
// Test: View Structure
// ---------------------------------------------------------------

test.describe('Chief Judge - View Structure', () => {
  test.beforeEach(async ({ page }) => {
    await setupChiefJudge(page);
  });

  test('should show chief judge toggle button when sync is enabled', async ({
    page,
  }) => {
    await navigateTo(page, 'results');

    const toggleRow = page.locator('#chief-judge-toggle-row');
    await expect(toggleRow).toBeVisible();

    const toggleBtn = page.locator('#chief-judge-toggle-btn');
    await expect(toggleBtn).toBeVisible();
  });

  test('should hide chief judge toggle when sync is disabled', async ({
    page,
  }) => {
    // First verify it is visible with sync enabled
    await navigateTo(page, 'results');
    await expect(page.locator('#chief-judge-toggle-row')).toBeVisible();

    // Disable sync via settings
    await navigateTo(page, 'settings');

    const syncToggle = page.locator('#sync-toggle');
    if (await syncToggle.isChecked()) {
      await page.locator('label:has(#sync-toggle)').click();
    }

    await navigateTo(page, 'results');

    // Toggle row should be hidden
    const toggleRow = page.locator('#chief-judge-toggle-row');
    await expect(toggleRow).toBeHidden();
  });

  test('should show chief judge panel when toggle is clicked', async ({
    page,
  }) => {
    await activateChiefJudgePanel(page);

    // Panel should be visible
    const panel = page.locator('#chief-judge-panel');
    await expect(panel).toBeVisible();

    // Normal results list should be hidden
    const resultsList = page.locator('.results-list');
    await expect(resultsList).toBeHidden();
  });

  test('should hide chief judge panel when toggle is clicked again', async ({
    page,
  }) => {
    await activateChiefJudgePanel(page);

    // Click toggle again to exit
    await page.click('#chief-judge-toggle-btn');

    // Panel should be hidden
    const panel = page.locator('#chief-judge-panel');
    await expect(panel).toBeHidden();

    // Normal results list should be visible again
    const resultsList = page.locator('.results-list');
    await expect(resultsList).toBeVisible();
  });

  test('should have correct structural sections', async ({ page }) => {
    await activateChiefJudgePanel(page);

    // Judges overview section (visible at top)
    await expect(page.locator('#judges-overview')).toBeVisible();
    await expect(page.locator('#judges-overview-list')).toBeVisible();

    // Penalty configuration (visible at top)
    await expect(page.locator('#penalty-config-row')).toBeVisible();

    // Fault summary section (may require scrolling in landscape)
    await expect(page.locator('.fault-summary-header')).toBeAttached();
    await expect(page.locator('#fault-summary-list')).toBeAttached();
    await expect(page.locator('#fault-summary-count')).toBeAttached();

    // Export actions (at bottom, may require scrolling)
    await expect(page.locator('#chief-export-actions')).toBeAttached();
  });
});

// ---------------------------------------------------------------
// Test: Empty State
// ---------------------------------------------------------------

test.describe('Chief Judge - Empty State', () => {
  test('should show empty state when no faults exist', async ({ page }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    const emptyState = page.locator('#chief-empty-state');
    await expect(emptyState).toBeVisible();

    // Fault count should be 0
    await expect(page.locator('#fault-summary-count')).toContainText('0');
  });

  test('should show current device as a connected judge', async ({ page }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    // The current device is a gate judge, so it counts as 1 connected judge
    await expect(page.locator('#judges-overview-count')).toContainText('1');

    // A judge card should be visible with the gate range
    const judgeCard = page.locator('.judge-card');
    await expect(judgeCard).toHaveCount(1);
    await expect(judgeCard).toContainText('1\u201310'); // en-dash: 1–10
  });
});

// ---------------------------------------------------------------
// Test: Fault Summary Display
// ---------------------------------------------------------------

test.describe('Chief Judge - Fault Summary', () => {
  const testFaults = [
    createTestFault({
      id: 'f1',
      bib: '42',
      gateNumber: 5,
      faultType: 'MG',
      deviceName: 'Judge A',
    }),
    createTestFault({
      id: 'f2',
      bib: '42',
      gateNumber: 8,
      faultType: 'STR',
      deviceName: 'Judge B',
    }),
    createTestFault({
      id: 'f3',
      bib: '15',
      gateNumber: 3,
      faultType: 'BR',
      deviceName: 'Judge A',
    }),
  ];

  test('should display fault summary cards when faults exist', async ({
    page,
  }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    // Empty state should be hidden
    const emptyState = page.locator('#chief-empty-state');
    await expect(emptyState).toBeHidden();

    // Should have fault summary cards (grouped by bib-run)
    const cards = page.locator('.fault-summary-card');
    await expect(cards).toHaveCount(2); // bib 42 and bib 15
  });

  test('should show correct fault count (grouped by racer)', async ({
    page,
  }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    // Count shows number of unique bib-run groups, not total faults
    await expect(page.locator('#fault-summary-count')).toContainText('2');
  });

  test('should display bib numbers in fault cards', async ({ page }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    const bibLabels = page.locator('.fault-card-bib');
    // Bib 15 should appear first (sorted numerically)
    await expect(bibLabels.first()).toContainText('015');
    await expect(bibLabels.last()).toContainText('042');
  });

  test('should display fault entry rows within cards', async ({ page }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    // Bib 42 has 2 faults, bib 15 has 1 fault = 3 total rows
    const faultRows = page.locator('.fault-entry-row');
    await expect(faultRows).toHaveCount(3);
  });

  test('should show fault type badges', async ({ page }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    const badges = page.locator('.fault-type-badge');
    await expect(badges).toHaveCount(3);
  });

  test('should show gate numbers in fault rows', async ({ page }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    const gateNums = page.locator('.fault-gate-num');
    await expect(gateNums).toHaveCount(3);
  });

  test('should show judge names in fault rows', async ({ page }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    const judgeNames = page.locator('.fault-judge-name');
    await expect(judgeNames).toHaveCount(3);
  });
});

// ---------------------------------------------------------------
// Test: Fault Card Actions (Edit / Delete Buttons)
// ---------------------------------------------------------------

test.describe('Chief Judge - Fault Card Actions', () => {
  const testFaults = [
    createTestFault({ id: 'f1', bib: '42', gateNumber: 5, faultType: 'MG' }),
  ];

  test('should have edit and delete buttons on each fault row', async ({
    page,
  }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    const editBtn = page.locator('.edit-fault-btn').first();
    await expect(editBtn).toBeVisible();

    const deleteBtn = page.locator('.delete-fault-btn').first();
    await expect(deleteBtn).toBeVisible();
  });

  test('should have finalize button on fault cards', async ({ page }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    const finalizeBtn = page.locator('.finalize-btn').first();
    await expect(finalizeBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------
// Test: Pending Deletions
// ---------------------------------------------------------------

test.describe('Chief Judge - Pending Deletions', () => {
  test('should hide pending deletions section when none exist', async ({
    page,
  }) => {
    const faults = [createTestFault({ id: 'f1', bib: '42', gateNumber: 5 })];
    await setupChiefJudge(page, { faults });
    await activateChiefJudgePanel(page);

    const section = page.locator('#pending-deletions-section');
    await expect(section).toBeHidden();
  });

  test('should show pending deletions section when faults are marked for deletion', async ({
    page,
  }) => {
    const faults = [
      createTestFault({
        id: 'f1',
        bib: '42',
        gateNumber: 5,
        markedForDeletion: true,
        markedForDeletionBy: 'Judge B',
        markedForDeletionAt: new Date().toISOString(),
      }),
    ];
    await setupChiefJudge(page, { faults });
    await activateChiefJudgePanel(page);

    const section = page.locator('#pending-deletions-section');
    await expect(section).toBeVisible();

    // Count badge should show 1
    await expect(page.locator('#pending-deletions-count')).toContainText('1');
  });

  test('should show approve and reject buttons for pending deletions', async ({
    page,
  }) => {
    const faults = [
      createTestFault({
        id: 'f1',
        bib: '42',
        gateNumber: 5,
        markedForDeletion: true,
        markedForDeletionBy: 'Judge B',
        markedForDeletionAt: new Date().toISOString(),
      }),
    ];
    await setupChiefJudge(page, { faults });
    await activateChiefJudgePanel(page);

    const approveBtn = page.locator('.pending-deletion-btn.approve');
    await expect(approveBtn).toBeVisible();

    const rejectBtn = page.locator('.pending-deletion-btn.reject');
    await expect(rejectBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------
// Test: Export Buttons
// ---------------------------------------------------------------

test.describe('Chief Judge - Export Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);
  });

  test('should display CSV export button', async ({ page }) => {
    const csvBtn = page.locator('#export-csv-btn');
    await expect(csvBtn).toBeVisible();
  });

  test('should display Summary export button', async ({ page }) => {
    const summaryBtn = page.locator('#export-summary-btn');
    await expect(summaryBtn).toBeVisible();
  });

  test('should display WhatsApp export button', async ({ page }) => {
    const whatsappBtn = page.locator('#export-whatsapp-btn');
    await expect(whatsappBtn).toBeVisible();
    await expect(whatsappBtn).toHaveClass(/whatsapp/);
  });

  test('should have all three export buttons in the actions bar', async ({
    page,
  }) => {
    const exportActions = page.locator('#chief-export-actions');
    await expect(exportActions).toBeVisible();

    const buttons = exportActions.locator('.chief-export-btn');
    await expect(buttons).toHaveCount(3);
  });
});

// ---------------------------------------------------------------
// Test: Penalty Configuration
// ---------------------------------------------------------------

test.describe('Chief Judge - Penalty Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);
  });

  test('should show penalty mode toggle with Penalty and DSQ options', async ({
    page,
  }) => {
    const modeToggle = page.locator('#penalty-mode-toggle');
    await expect(modeToggle).toBeVisible();

    const penaltyBtn = page.locator('.penalty-mode-btn[data-mode="penalty"]');
    await expect(penaltyBtn).toBeVisible();

    const dsqBtn = page.locator('.penalty-mode-btn[data-mode="dsq"]');
    await expect(dsqBtn).toBeVisible();
  });

  test('should default to penalty mode active', async ({ page }) => {
    const penaltyBtn = page.locator('.penalty-mode-btn[data-mode="penalty"]');
    await expect(penaltyBtn).toHaveClass(/active/);
    await expect(penaltyBtn).toHaveAttribute('aria-pressed', 'true');

    const dsqBtn = page.locator('.penalty-mode-btn[data-mode="dsq"]');
    await expect(dsqBtn).not.toHaveClass(/active/);
    await expect(dsqBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('should switch to DSQ mode', async ({ page }) => {
    const dsqBtn = page.locator('.penalty-mode-btn[data-mode="dsq"]');
    await dsqBtn.click();

    await expect(dsqBtn).toHaveClass(/active/);
    await expect(dsqBtn).toHaveAttribute('aria-pressed', 'true');

    const penaltyBtn = page.locator('.penalty-mode-btn[data-mode="penalty"]');
    await expect(penaltyBtn).not.toHaveClass(/active/);
    await expect(penaltyBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('should show penalty seconds selector', async ({ page }) => {
    const selector = page.locator('#penalty-seconds-selector');
    await expect(selector).toBeVisible();

    // Default value should be 5
    await expect(page.locator('#penalty-seconds-value')).toContainText('5');
  });

  test('should have increment and decrement buttons', async ({ page }) => {
    const minusBtn = page.locator('.penalty-adj-btn[data-adj="-1"]');
    await expect(minusBtn).toBeVisible();

    const plusBtn = page.locator('.penalty-adj-btn[data-adj="+1"]');
    await expect(plusBtn).toBeVisible();
  });

  test('should increment penalty seconds', async ({ page }) => {
    const plusBtn = page.locator('.penalty-adj-btn[data-adj="+1"]');
    await plusBtn.click();

    await expect(page.locator('#penalty-seconds-value')).toContainText('6');
  });

  test('should decrement penalty seconds', async ({ page }) => {
    const minusBtn = page.locator('.penalty-adj-btn[data-adj="-1"]');
    await minusBtn.click();

    await expect(page.locator('#penalty-seconds-value')).toContainText('4');
  });

  test('should dim penalty seconds when DSQ mode is active', async ({
    page,
  }) => {
    // Switch to DSQ mode
    await page.click('.penalty-mode-btn[data-mode="dsq"]');

    // The config row should have dsq-mode class
    const configRow = page.locator('#penalty-config-row');
    await expect(configRow).toHaveClass(/dsq-mode/);
  });
});

// ---------------------------------------------------------------
// Test: Fault Card Status Display
// ---------------------------------------------------------------

test.describe('Chief Judge - Fault Card Status', () => {
  const testFaults = [
    createTestFault({ id: 'f1', bib: '42', gateNumber: 5, faultType: 'MG' }),
  ];

  test('should show penalty time in penalty mode', async ({ page }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    // Default is penalty mode with 5s
    const penaltySpan = page.locator('.fault-card-penalty');
    await expect(penaltySpan.first()).toContainText('+5s');

    const resultBadge = page.locator('.fault-card-result.flt');
    await expect(resultBadge.first()).toBeVisible();
  });

  test('should show DSQ in DSQ mode', async ({ page }) => {
    await setupChiefJudge(page, { faults: testFaults });
    await activateChiefJudgePanel(page);

    // Switch to DSQ mode
    await page.click('.penalty-mode-btn[data-mode="dsq"]');

    const resultBadge = page.locator('.fault-card-result.dsq');
    await expect(resultBadge.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------
// Test: Marked-for-Deletion Styling
// ---------------------------------------------------------------

test.describe('Chief Judge - Deletion Marking UI', () => {
  test('should show strikethrough on fault marked for deletion', async ({
    page,
  }) => {
    const faults = [
      createTestFault({
        id: 'f1',
        bib: '42',
        gateNumber: 5,
        markedForDeletion: true,
        markedForDeletionBy: 'Judge B',
        markedForDeletionAt: new Date().toISOString(),
      }),
    ];
    await setupChiefJudge(page, { faults });
    await activateChiefJudgePanel(page);

    // The fault entry row should have marked-for-deletion class
    const row = page.locator('.fault-entry-row.marked-for-deletion');
    await expect(row).toBeVisible();

    // Gate number should have strikethrough
    const gateNum = row.locator('.fault-gate-num.strikethrough');
    await expect(gateNum).toBeVisible();

    // Deletion pending badge should be visible
    const pendingBadge = row.locator('.deletion-pending-badge');
    await expect(pendingBadge).toBeVisible();
  });

  test('should disable edit button on fault marked for deletion', async ({
    page,
  }) => {
    const faults = [
      createTestFault({
        id: 'f1',
        bib: '42',
        gateNumber: 5,
        markedForDeletion: true,
        markedForDeletionBy: 'Judge B',
        markedForDeletionAt: new Date().toISOString(),
      }),
    ];
    await setupChiefJudge(page, { faults });
    await activateChiefJudgePanel(page);

    const editBtn = page.locator('.edit-fault-btn').first();
    await expect(editBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------
// Test: Toggle State
// ---------------------------------------------------------------

test.describe('Chief Judge - Toggle State', () => {
  test.beforeEach(async ({ page }) => {
    await setupChiefJudge(page);
  });

  test('should toggle aria-pressed on the toggle button', async ({ page }) => {
    await navigateTo(page, 'results');

    const toggleBtn = page.locator('#chief-judge-toggle-btn');
    await expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');

    // Activate
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(toggleBtn).toHaveClass(/active/);

    // Deactivate
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(toggleBtn).not.toHaveClass(/active/);
  });

  test('should add chief-mode class to results view when active', async ({
    page,
  }) => {
    await navigateTo(page, 'results');

    const resultsView = page.locator('.results-view');
    await expect(resultsView).not.toHaveClass(/chief-mode/);

    await page.click('#chief-judge-toggle-btn');
    await expect(resultsView).toHaveClass(/chief-mode/);
  });
});

// ---------------------------------------------------------------
// Test: Accessibility
// ---------------------------------------------------------------

test.describe('Chief Judge - Accessibility', () => {
  test('should have aria-pressed on toggle button', async ({ page }) => {
    await setupChiefJudge(page);
    await navigateTo(page, 'results');

    const toggleBtn = page.locator('#chief-judge-toggle-btn');
    await expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('should have aria-pressed on penalty mode buttons', async ({ page }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    const penaltyBtn = page.locator('.penalty-mode-btn[data-mode="penalty"]');
    await expect(penaltyBtn).toHaveAttribute('aria-pressed', 'true');

    const dsqBtn = page.locator('.penalty-mode-btn[data-mode="dsq"]');
    await expect(dsqBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('should have role=group on penalty mode toggle', async ({ page }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    const modeToggle = page.locator('#penalty-mode-toggle');
    await expect(modeToggle).toHaveAttribute('role', 'group');
  });

  test('should have aria-label on penalty adjustment buttons', async ({
    page,
  }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    const minusBtn = page.locator('.penalty-adj-btn[data-adj="-1"]');
    await expect(minusBtn).toHaveAttribute('aria-label');

    const plusBtn = page.locator('.penalty-adj-btn[data-adj="+1"]');
    await expect(plusBtn).toHaveAttribute('aria-label');
  });

  test('should have aria-live on penalty seconds value', async ({ page }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    const value = page.locator('#penalty-seconds-value');
    await expect(value).toHaveAttribute('aria-live', 'polite');
  });

  test('should have aria-live on judges overview list', async ({ page }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    const list = page.locator('#judges-overview-list');
    await expect(list).toHaveAttribute('aria-live', 'polite');
  });

  test('should have aria-label on edit and delete buttons in fault rows', async ({
    page,
  }) => {
    const faults = [createTestFault({ id: 'f1', bib: '42', gateNumber: 5 })];
    await setupChiefJudge(page, { faults });
    await activateChiefJudgePanel(page);

    const editBtn = page.locator('.edit-fault-btn').first();
    await expect(editBtn).toHaveAttribute('aria-label');

    const deleteBtn = page.locator('.delete-fault-btn').first();
    await expect(deleteBtn).toHaveAttribute('aria-label');
  });

  test('should have aria-label on pending deletion action buttons', async ({
    page,
  }) => {
    const faults = [
      createTestFault({
        id: 'f1',
        bib: '42',
        gateNumber: 5,
        markedForDeletion: true,
        markedForDeletionBy: 'Judge B',
        markedForDeletionAt: new Date().toISOString(),
      }),
    ];
    await setupChiefJudge(page, { faults });
    await activateChiefJudgePanel(page);

    const approveBtn = page.locator('.pending-deletion-btn.approve').first();
    await expect(approveBtn).toHaveAttribute('aria-label');

    const rejectBtn = page.locator('.pending-deletion-btn.reject').first();
    await expect(rejectBtn).toHaveAttribute('aria-label');
  });

  test('should have aria-hidden on SVG icons in export buttons', async ({
    page,
  }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    const svgs = page.locator('#chief-export-actions svg');
    const count = await svgs.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      await expect(svgs.nth(i)).toHaveAttribute('aria-hidden', 'true');
    }
  });
});

// ---------------------------------------------------------------
// Test: Notes Indicator
// ---------------------------------------------------------------

test.describe('Chief Judge - Notes Indicator', () => {
  test('should show note icon for faults with notes', async ({ page }) => {
    const faults = [
      createTestFault({
        id: 'f1',
        bib: '42',
        gateNumber: 5,
        notes: 'Racer missed gate completely',
      }),
    ];
    await setupChiefJudge(page, { faults });
    await activateChiefJudgePanel(page);

    const noteIcon = page.locator('.fault-note-icon');
    await expect(noteIcon).toBeVisible();
  });

  test('should not show note icon for faults without notes', async ({
    page,
  }) => {
    const faults = [createTestFault({ id: 'f1', bib: '42', gateNumber: 5 })];
    await setupChiefJudge(page, { faults });
    await activateChiefJudgePanel(page);

    const noteIcon = page.locator('.fault-note-icon');
    await expect(noteIcon).toHaveCount(0);
  });
});

// ---------------------------------------------------------------
// Test: Judges Overview Section
// ---------------------------------------------------------------

test.describe('Chief Judge - Judges Overview', () => {
  test('should show judges overview section header', async ({ page }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    const title = page.locator('.judges-overview-title');
    await expect(title).toBeVisible();

    const count = page.locator('#judges-overview-count');
    await expect(count).toBeVisible();
    // The current device is a gate judge, so count includes itself
    await expect(count).toContainText('1');
  });

  test('should show judge card with gate range for current device', async ({
    page,
  }) => {
    await setupChiefJudge(page);
    await activateChiefJudgePanel(page);

    // The current device is configured as a gate judge with gates 1-10
    const judgeCard = page.locator('.judge-card');
    await expect(judgeCard).toBeVisible();

    // Should show the gate range
    const gateRange = judgeCard.locator('.judge-gates');
    await expect(gateRange).toContainText('1\u201310'); // en-dash: 1–10
  });
});
