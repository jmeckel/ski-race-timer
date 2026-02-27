/**
 * E2E Tests - Gate Judge Fault Entry Workflow
 * Tests the gate-first quick fault entry flow, role switching,
 * gate assignment, and judge ready status.
 */

import { expect, test } from '@playwright/test';
import { navigateTo, setupPageEnglish, waitForToastToHide } from './helpers.js';

/** Scoped selectors for fault type buttons inside the inline panel */
const faultBtn = (type) => `#inline-fault-types [data-fault="${type}"]`;

/**
 * Setup page as gate judge with gate assignment pre-configured
 */
async function setupGateJudge(page, { gateStart = 1, gateEnd = 10 } = {}) {
  await page.addInitScript(
    ({ gateStart, gateEnd }) => {
      localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
      localStorage.setItem(
        'skiTimerSettings',
        JSON.stringify({
          auto: true,
          haptic: true,
          sound: false,
          sync: false,
          syncPhotos: false,
          gps: false,
          simple: false,
          photoCapture: false,
        }),
      );
      localStorage.setItem('skiTimerLang', 'en');
      localStorage.setItem('skiTimerDeviceRole', 'gateJudge');
      localStorage.setItem(
        'skiTimerGateAssignment',
        JSON.stringify([gateStart, gateEnd]),
      );
      localStorage.setItem('skiTimerFirstGateColor', 'red');
    },
    { gateStart, gateEnd },
  );

  await page.goto('/');
  // Gate judge view should be visible after loading
  await page.waitForSelector('.gate-judge-view', {
    state: 'visible',
    timeout: 5000,
  });
}

test.describe('Gate Judge - Role Switching', () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnglish(page);
  });

  test('should show gate assignment modal when switching to gate judge', async ({
    page,
  }) => {
    // Navigate to settings
    await navigateTo(page, 'settings');

    // Switch to Gate Judge
    await page.click('.role-card-setting[data-role="gateJudge"]');

    // Gate assignment modal should appear
    const modal = page.locator('#gate-assignment-modal');
    await expect(modal).toBeVisible();

    // Modal should have gate range inputs
    await expect(page.locator('#gate-start-input')).toBeVisible();
    await expect(page.locator('#gate-end-input')).toBeVisible();
  });

  test('should complete gate judge setup and show gate tab', async ({
    page,
  }) => {
    await navigateTo(page, 'settings');

    // Switch to Gate Judge role
    await page.click('.role-card-setting[data-role="gateJudge"]');

    // Save gate assignment (default values)
    const modal = page.locator('#gate-assignment-modal');
    await expect(modal).toBeVisible();
    await page.click('#save-gate-assignment-btn');
    await expect(modal).toBeHidden();

    // Gate Judge tab should now be visible
    const gateTab = page.locator('#gate-judge-tab');
    await expect(gateTab).toBeVisible();

    // Role card should be selected
    const gateJudgeRole = page.locator(
      '.role-card-setting[data-role="gateJudge"]',
    );
    await expect(gateJudgeRole).toHaveAttribute('aria-checked', 'true');
  });

  test('should switch back to timer role', async ({ page }) => {
    await navigateTo(page, 'settings');

    // Switch to Gate Judge first
    await page.click('.role-card-setting[data-role="gateJudge"]');

    // Dismiss gate assignment modal
    const modal = page.locator('#gate-assignment-modal');
    await expect(modal).toBeVisible();
    await page.click('#save-gate-assignment-btn');
    await expect(modal).toBeHidden();
    await waitForToastToHide(page);

    // Switch back to Timer
    await page.click('.role-card-setting[data-role="timer"]');

    const timerRole = page.locator('.role-card-setting[data-role="timer"]');
    await expect(timerRole).toHaveAttribute('aria-checked', 'true');

    // Gate Judge tab should be hidden
    const gateTab = page.locator('#gate-judge-tab');
    await expect(gateTab).toBeHidden();
  });
});

test.describe('Gate Judge - Gate Assignment', () => {
  test('should display gate range after assignment', async ({ page }) => {
    await setupGateJudge(page, { gateStart: 5, gateEnd: 12 });

    const rangeDisplay = page.locator('#gate-range-display');
    await expect(rangeDisplay).toContainText('5–12');
  });

  test('should render correct number of gate buttons', async ({ page }) => {
    await setupGateJudge(page, { gateStart: 3, gateEnd: 8 });

    const gateButtons = page.locator('#inline-gate-selector .gate-grid-btn');
    await expect(gateButtons).toHaveCount(6); // Gates 3, 4, 5, 6, 7, 8
  });

  test('should alternate gate colors (red/blue)', async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 4 });

    const gate1 = page.locator('.gate-grid-btn[data-gate="1"]');
    const gate2 = page.locator('.gate-grid-btn[data-gate="2"]');
    const gate3 = page.locator('.gate-grid-btn[data-gate="3"]');
    const gate4 = page.locator('.gate-grid-btn[data-gate="4"]');

    await expect(gate1).toHaveClass(/red/);
    await expect(gate2).toHaveClass(/blue/);
    await expect(gate3).toHaveClass(/red/);
    await expect(gate4).toHaveClass(/blue/);
  });

  test('should change gate assignment via modal', async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 5 });

    // Open gate assignment modal
    await page.click('#gate-change-btn');
    const modal = page.locator('#gate-assignment-modal');
    await expect(modal).toBeVisible();

    // Change range to 10-20
    await page.fill('#gate-start-input', '10');
    await page.fill('#gate-end-input', '20');
    await page.click('#save-gate-assignment-btn');

    // Modal should close
    await expect(modal).toBeHidden();

    // Range display should update
    await expect(page.locator('#gate-range-display')).toContainText('10–20');

    // Gate buttons should update
    const gateButtons = page.locator('#inline-gate-selector .gate-grid-btn');
    await expect(gateButtons).toHaveCount(11); // Gates 10-20
  });

  test('should select first gate color', async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 4 });

    // Open gate assignment modal
    await page.click('#gate-change-btn');

    // Select blue as first gate color
    await page.click('.gate-color-btn[data-color="blue"]');
    await page.click('#save-gate-assignment-btn');

    // First gate should now be blue
    const gate1 = page.locator('.gate-grid-btn[data-gate="1"]');
    await expect(gate1).toHaveClass(/blue/);
  });
});

test.describe('Gate Judge - Fault Entry Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 10 });
  });

  test('should open fault detail panel when selecting a gate', async ({
    page,
  }) => {
    const panel = page.locator('#fault-detail-panel');
    await expect(panel).toBeHidden();

    await page.click('.gate-grid-btn[data-gate="5"]');

    await expect(panel).toBeVisible();

    const gateLabel = page.locator('#fault-detail-gate-label');
    await expect(gateLabel).toContainText('5');
  });

  test('should toggle gate selection (deselect on second tap)', async ({
    page,
  }) => {
    await page.click('.gate-grid-btn[data-gate="3"]');
    await expect(page.locator('#fault-detail-panel')).toBeVisible();

    await page.click('.gate-grid-btn[data-gate="3"]');
    await expect(page.locator('#fault-detail-panel')).toBeHidden();
  });

  test('should close fault detail panel with close button', async ({
    page,
  }) => {
    await page.click('.gate-grid-btn[data-gate="5"]');
    await expect(page.locator('#fault-detail-panel')).toBeVisible();

    await page.click('#fault-detail-close');
    await expect(page.locator('#fault-detail-panel')).toBeHidden();
  });

  test('should select fault types (MG, STR, BR)', async ({ page }) => {
    await page.click('.gate-grid-btn[data-gate="5"]');

    // Select MG (scoped to inline fault types panel)
    const mgBtn = page.locator(faultBtn('MG'));
    await mgBtn.click();
    await expect(mgBtn).toHaveAttribute('aria-pressed', 'true');

    // Switch to STR
    const strBtn = page.locator(faultBtn('STR'));
    await strBtn.click();
    await expect(strBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(mgBtn).toHaveAttribute('aria-pressed', 'false');

    // Switch to BR
    const brBtn = page.locator(faultBtn('BR'));
    await brBtn.click();
    await expect(brBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('should keep save button disabled until gate + fault type + bib selected', async ({
    page,
  }) => {
    const saveBtn = page.locator('#inline-save-fault-btn');

    // Initially disabled
    await expect(saveBtn).toBeDisabled();

    // Select gate - still disabled
    await page.click('.gate-grid-btn[data-gate="5"]');
    await expect(saveBtn).toBeDisabled();

    // Select fault type - still disabled (no bib)
    await page.click(faultBtn('MG'));
    await expect(saveBtn).toBeDisabled();

    // Enter bib - now enabled
    await page.fill('#inline-bib-input', '42');
    await expect(saveBtn).toBeEnabled();
  });

  test('should save fault and show in faults list', async ({ page }) => {
    await expect(page.locator('#no-faults-recorded-inline')).toBeVisible();

    // Complete fault entry: gate 5, MG, bib 42
    await page.click('.gate-grid-btn[data-gate="5"]');
    await page.click(faultBtn('MG'));
    await page.fill('#inline-bib-input', '42');
    await page.click('#inline-save-fault-btn');

    // Fault should appear in list
    const faultItem = page.locator('.gate-judge-fault-item').first();
    await expect(faultItem).toBeVisible();

    // Empty state should be hidden
    await expect(page.locator('#no-faults-recorded-inline')).toBeHidden();

    // Fault count badge should update
    await expect(page.locator('#inline-fault-count')).toContainText('1');
  });

  test('should show fault count badge on gate button after recording', async ({
    page,
  }) => {
    await page.click('.gate-grid-btn[data-gate="5"]');
    await page.click(faultBtn('MG'));
    await page.fill('#inline-bib-input', '42');
    await page.click('#inline-save-fault-btn');

    const gate5 = page.locator('.gate-grid-btn[data-gate="5"]');
    const badge = gate5.locator('.gate-fault-count');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('1');
  });

  test('should allow manual bib entry', async ({ page }) => {
    await page.click('.gate-grid-btn[data-gate="3"]');
    await page.click(faultBtn('STR'));

    await page.fill('#inline-bib-input', '99');
    await expect(page.locator('#inline-bib-input')).toHaveValue('99');

    await page.click('#inline-save-fault-btn');
    await expect(page.locator('#inline-fault-count')).toContainText('1');
  });

  test('should record multiple faults in quick succession', async ({
    page,
  }) => {
    // Helper to dismiss the fault confirmation dialog after save
    const dismissConfirmation = async () => {
      const overlay = page.locator('#fault-confirmation-overlay.show');
      await expect(overlay).toBeVisible({ timeout: 3000 });
      // Click "Done" button inside the confirmation dialog
      await overlay.locator('button', { hasText: 'Done' }).click();
      await expect(overlay).toBeHidden();
      await waitForToastToHide(page);
    };

    // Fault 1: gate 3, MG, bib 42
    await page.click('.gate-grid-btn[data-gate="3"]');
    await page.click(faultBtn('MG'));
    await page.fill('#inline-bib-input', '42');
    await page.click('#inline-save-fault-btn');
    await dismissConfirmation();

    // Fault 2: same gate, different type — gate stays selected after save
    await page.click(faultBtn('STR'));
    await page.fill('#inline-bib-input', '15');
    await page.click('#inline-save-fault-btn');
    await dismissConfirmation();

    // Fault 3: different gate
    await page.click('.gate-grid-btn[data-gate="7"]');
    await page.click(faultBtn('BR'));
    await page.fill('#inline-bib-input', '8');
    await page.click('#inline-save-fault-btn');

    // Should have 3 faults
    await expect(page.locator('#inline-fault-count')).toContainText('3');
    const faultItems = page.locator('.gate-judge-fault-item');
    await expect(faultItems).toHaveCount(3);
  });
});

test.describe('Gate Judge - Run Selection', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page);
  });

  test('should default to Run 1', async ({ page }) => {
    const run1 = page.locator('#gate-judge-run-selector [data-run="1"]');
    await expect(run1).toHaveClass(/active/);
    await expect(run1).toHaveAttribute('aria-checked', 'true');
  });

  test('should switch between runs', async ({ page }) => {
    const run1 = page.locator('#gate-judge-run-selector [data-run="1"]');
    const run2 = page.locator('#gate-judge-run-selector [data-run="2"]');

    await run2.click();
    await expect(run2).toHaveClass(/active/);
    await expect(run2).toHaveAttribute('aria-checked', 'true');
    await expect(run1).not.toHaveClass(/active/);

    await run1.click();
    await expect(run1).toHaveClass(/active/);
  });
});

test.describe('Gate Judge - Ready Status', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page);
  });

  test('should toggle ready status', async ({ page }) => {
    const readyBtn = page.locator('#ready-toggle-btn');

    await expect(readyBtn).toHaveAttribute('aria-pressed', 'false');

    await readyBtn.click();
    await expect(readyBtn).toHaveAttribute('aria-pressed', 'true');

    await readyBtn.click();
    await expect(readyBtn).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('Gate Judge - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 5 });
  });

  test('should have correct ARIA roles on gate grid', async ({ page }) => {
    const grid = page.locator('#inline-gate-selector');
    await expect(grid).toHaveAttribute('role', 'radiogroup');

    const gates = page.locator('.gate-grid-btn');
    const count = await gates.count();
    for (let i = 0; i < count; i++) {
      await expect(gates.nth(i)).toHaveAttribute('role', 'radio');
    }
  });

  test('should update aria-checked on gate selection', async ({ page }) => {
    const gate1 = page.locator('.gate-grid-btn[data-gate="1"]');
    await expect(gate1).toHaveAttribute('aria-checked', 'false');

    await gate1.click();
    await expect(gate1).toHaveAttribute('aria-checked', 'true');

    const gate2 = page.locator('.gate-grid-btn[data-gate="2"]');
    await gate2.click();
    await expect(gate2).toHaveAttribute('aria-checked', 'true');
    await expect(gate1).toHaveAttribute('aria-checked', 'false');
  });

  test('should have aria-pressed on fault type buttons', async ({ page }) => {
    await page.click('.gate-grid-btn[data-gate="1"]');

    const mgBtn = page.locator(faultBtn('MG'));
    await expect(mgBtn).toHaveAttribute('aria-pressed', 'false');

    await mgBtn.click();
    await expect(mgBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('should have aria-live on fault list', async ({ page }) => {
    const faultList = page.locator('#gate-judge-faults-list');
    await expect(faultList).toHaveAttribute('aria-live', 'polite');
  });

  test('should have aria-live on fault detail gate label', async ({ page }) => {
    const gateLabel = page.locator('#fault-detail-gate-label');
    await expect(gateLabel).toHaveAttribute('aria-live', 'polite');
  });
});

test.describe('Gate Judge - Empty States', () => {
  test('should show empty state when no faults recorded', async ({ page }) => {
    await setupGateJudge(page);

    const emptyState = page.locator('#no-faults-recorded-inline');
    await expect(emptyState).toBeVisible();
  });

  test('should show zero fault count initially', async ({ page }) => {
    await setupGateJudge(page);

    await expect(page.locator('#inline-fault-count')).toContainText('0');
  });
});
