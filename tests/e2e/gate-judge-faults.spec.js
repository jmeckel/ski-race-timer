/**
 * E2E Tests - Gate Judge Fault Management
 * Tests fault recording, deletion, form clearing, run selection,
 * count badges, multiple faults, and keyboard shortcuts.
 */

import { expect, test } from '@playwright/test';
import { dismissToasts, waitForToastToHide } from './helpers.js';

/** Scoped selectors for fault type buttons inside the inline panel */
const faultBtn = (type) => `#inline-fault-types [data-fault="${type}"]`;

/**
 * Setup page as gate judge with gate assignment pre-configured.
 * Mirrors the pattern from gate-judge.spec.js.
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
  await page.waitForSelector('.gate-judge-view', {
    state: 'visible',
    timeout: 5000,
  });
}

/**
 * Record a complete fault entry: gate -> fault type -> bib -> save.
 * Dismisses the fault confirmation overlay afterwards so the next
 * interaction is not blocked.
 *
 * Handles the case where the gate is already selected (e.g. recording
 * successive faults at the same gate) by checking aria-checked before
 * clicking, since clicking an already-selected gate toggles it OFF.
 */
async function recordFault(page, { gate, type, bib }) {
  const gateBtn = page.locator(`.gate-grid-btn[data-gate="${gate}"]`);
  const isAlreadySelected =
    (await gateBtn.getAttribute('aria-checked')) === 'true';
  if (!isAlreadySelected) {
    await gateBtn.click();
  }

  // Ensure the fault detail panel is visible before interacting
  await expect(page.locator('#fault-detail-panel')).toBeVisible();

  await page.click(faultBtn(type));
  await page.fill('#inline-bib-input', String(bib));
  await page.click('#inline-save-fault-btn');

  // Dismiss the fault confirmation overlay (user must tap "Done")
  const overlay = page.locator('#fault-confirmation-overlay.show');
  await expect(overlay).toBeVisible({ timeout: 3000 });
  await overlay.locator('#fault-confirmation-done-btn').click();
  await expect(overlay).toBeHidden();
  await waitForToastToHide(page);
}

// ─── Fault Recording ──────────────────────────────────────────────

test.describe('Gate Judge Faults - Recording', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 10 });
  });

  test('should record a fault and display it in the fault list', async ({
    page,
  }) => {
    // Verify empty state visible before any faults
    await expect(page.locator('#no-faults-recorded-inline')).toBeVisible();

    // Record a fault: gate 5, MG, bib 42
    await recordFault(page, { gate: 5, type: 'MG', bib: 42 });

    // Fault should appear in the list
    const faultItems = page.locator('.gate-judge-fault-item');
    await expect(faultItems).toHaveCount(1);

    // Verify fault details: bib, gate, type
    const firstFault = faultItems.first();
    await expect(firstFault.locator('.gate-judge-fault-bib')).toContainText(
      '042',
    );
    await expect(firstFault.locator('.gate-judge-fault-gate')).toContainText(
      'T5',
    );

    // Empty state should be hidden
    await expect(page.locator('#no-faults-recorded-inline')).toBeHidden();
  });
});

// ─── Multiple Faults at Same Gate ─────────────────────────────────

test.describe('Gate Judge Faults - Multiple at Same Gate', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 10 });
  });

  test('should record two faults at the same gate and display both', async ({
    page,
  }) => {
    // Fault 1: gate 5, MG, bib 10
    await recordFault(page, { gate: 5, type: 'MG', bib: 10 });

    // Fault 2: gate 5, STR, bib 20
    await recordFault(page, { gate: 5, type: 'STR', bib: 20 });

    // Both should be in the list
    const faultItems = page.locator('.gate-judge-fault-item');
    await expect(faultItems).toHaveCount(2);

    // Fault count badge should show 2
    await expect(page.locator('#inline-fault-count')).toContainText('2');
  });
});

// ─── Fault Count Badge ────────────────────────────────────────────

test.describe('Gate Judge Faults - Count Badge', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 10 });
  });

  test('should update fault count badge after recording', async ({ page }) => {
    // Initially zero (badge hidden via CSS when data-count="0")
    await expect(page.locator('#inline-fault-count')).toContainText('0');

    // Record first fault
    await recordFault(page, { gate: 3, type: 'BR', bib: 7 });
    await expect(page.locator('#inline-fault-count')).toContainText('1');

    // Record second fault
    await recordFault(page, { gate: 4, type: 'MG', bib: 8 });
    await expect(page.locator('#inline-fault-count')).toContainText('2');
  });

  test('should show fault count badge on the gate button after recording', async ({
    page,
  }) => {
    // Record fault at gate 6
    await recordFault(page, { gate: 6, type: 'STR', bib: 15 });

    // Gate 6 button should have a badge with count 1
    const gate6 = page.locator('.gate-grid-btn[data-gate="6"]');
    const badge = gate6.locator('.gate-fault-count');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('1');

    // Record another fault at gate 6
    await recordFault(page, { gate: 6, type: 'MG', bib: 16 });

    // Badge should update to 2
    const updatedBadge = page
      .locator('.gate-grid-btn[data-gate="6"]')
      .locator('.gate-fault-count');
    await expect(updatedBadge).toContainText('2');
  });
});

// ─── Form Clearing Between Entries ────────────────────────────────

test.describe('Gate Judge Faults - Form Clearing', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 10 });
  });

  test('should reset fault type selection after saving', async ({ page }) => {
    // Select gate and fault type
    await page.click('.gate-grid-btn[data-gate="5"]');
    await page.click(faultBtn('MG'));

    // Verify MG is selected
    await expect(page.locator(faultBtn('MG'))).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Fill bib and save
    await page.fill('#inline-bib-input', '42');
    await page.click('#inline-save-fault-btn');

    // Dismiss confirmation
    const overlay = page.locator('#fault-confirmation-overlay.show');
    await expect(overlay).toBeVisible({ timeout: 3000 });
    await overlay.locator('#fault-confirmation-done-btn').click();
    await expect(overlay).toBeHidden();
    await waitForToastToHide(page);

    // After save, fault type buttons should all be deselected
    await expect(page.locator(faultBtn('MG'))).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator(faultBtn('STR'))).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator(faultBtn('BR'))).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('should keep gate selected after saving for quick successive faults', async ({
    page,
  }) => {
    // Record a fault at gate 5
    await page.click('.gate-grid-btn[data-gate="5"]');
    await page.click(faultBtn('MG'));
    await page.fill('#inline-bib-input', '42');
    await page.click('#inline-save-fault-btn');

    // Dismiss confirmation
    const overlay = page.locator('#fault-confirmation-overlay.show');
    await expect(overlay).toBeVisible({ timeout: 3000 });
    await overlay.locator('#fault-confirmation-done-btn').click();
    await expect(overlay).toBeHidden();
    await waitForToastToHide(page);

    // Gate 5 should still be selected (aria-checked="true")
    const gate5 = page.locator('.gate-grid-btn[data-gate="5"]');
    await expect(gate5).toHaveAttribute('aria-checked', 'true');

    // Fault detail panel should still be visible
    await expect(page.locator('#fault-detail-panel')).toBeVisible();
  });

  test('should disable save button after recording until fault type is re-selected', async ({
    page,
  }) => {
    // Record a full fault
    await page.click('.gate-grid-btn[data-gate="3"]');
    await page.click(faultBtn('STR'));
    await page.fill('#inline-bib-input', '10');
    await page.click('#inline-save-fault-btn');

    // Dismiss confirmation
    const overlay = page.locator('#fault-confirmation-overlay.show');
    await expect(overlay).toBeVisible({ timeout: 3000 });
    await overlay.locator('#fault-confirmation-done-btn').click();
    await expect(overlay).toBeHidden();
    await waitForToastToHide(page);

    // Save button should be disabled (fault type was cleared)
    await expect(page.locator('#inline-save-fault-btn')).toBeDisabled();

    // Select a new fault type -> save becomes enabled again
    await page.click(faultBtn('BR'));
    await expect(page.locator('#inline-save-fault-btn')).toBeEnabled();
  });
});

// ─── Run Selection for Faults ─────────────────────────────────────

test.describe('Gate Judge Faults - Run Selection', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 10 });
  });

  test('should separate faults by run', async ({ page }) => {
    // Record fault on Run 1 (default)
    await recordFault(page, { gate: 3, type: 'MG', bib: 10 });
    await expect(page.locator('#inline-fault-count')).toContainText('1');
    await expect(page.locator('.gate-judge-fault-item')).toHaveCount(1);

    // Switch to Run 2
    await page.click('#gate-judge-run-selector [data-run="2"]');
    await expect(
      page.locator('#gate-judge-run-selector [data-run="2"]'),
    ).toHaveClass(/active/);

    // Run 2 should show 0 faults (fault list is filtered by run)
    await expect(page.locator('#inline-fault-count')).toContainText('0');
    await expect(page.locator('.gate-judge-fault-item')).toHaveCount(0);
    await expect(page.locator('#no-faults-recorded-inline')).toBeVisible();

    // Record a fault on Run 2
    await recordFault(page, { gate: 4, type: 'STR', bib: 20 });
    await expect(page.locator('#inline-fault-count')).toContainText('1');
    await expect(page.locator('.gate-judge-fault-item')).toHaveCount(1);

    // Switch back to Run 1 - should still show 1 fault
    await page.click('#gate-judge-run-selector [data-run="1"]');
    await expect(page.locator('#inline-fault-count')).toContainText('1');
    await expect(page.locator('.gate-judge-fault-item')).toHaveCount(1);
  });
});

// ─── Fault Deletion ───────────────────────────────────────────────

test.describe('Gate Judge Faults - Deletion', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 10 });
  });

  test('should delete a fault via the delete button and confirmation modal', async ({
    page,
  }) => {
    // Record a fault
    await recordFault(page, { gate: 5, type: 'MG', bib: 42 });
    await expect(page.locator('.gate-judge-fault-item')).toHaveCount(1);

    // Click the delete button on the fault item
    await page.click('.gate-judge-fault-item .gate-judge-fault-delete');

    // Delete confirmation modal should appear
    const deleteModal = page.locator('#fault-delete-modal');
    await expect(deleteModal).toBeVisible();

    // Confirm deletion
    await page.click('#confirm-fault-delete-btn');
    await expect(deleteModal).toBeHidden();
    await waitForToastToHide(page);

    // Fault should be removed from the list
    await expect(page.locator('.gate-judge-fault-item')).toHaveCount(0);
    await expect(page.locator('#inline-fault-count')).toContainText('0');

    // Empty state should be visible again
    await expect(page.locator('#no-faults-recorded-inline')).toBeVisible();
  });

  test('should cancel fault deletion and keep the fault', async ({ page }) => {
    // Record a fault
    await recordFault(page, { gate: 7, type: 'BR', bib: 15 });
    await expect(page.locator('.gate-judge-fault-item')).toHaveCount(1);

    // Click delete
    await page.click('.gate-judge-fault-item .gate-judge-fault-delete');

    // Modal appears
    const deleteModal = page.locator('#fault-delete-modal');
    await expect(deleteModal).toBeVisible();

    // Cancel instead of confirming
    await page.click('#fault-delete-modal [data-action="cancel"]');
    await expect(deleteModal).toBeHidden();

    // Fault should still be there
    await expect(page.locator('.gate-judge-fault-item')).toHaveCount(1);
    await expect(page.locator('#inline-fault-count')).toContainText('1');
  });

  test('should update gate badge after deleting a fault', async ({ page }) => {
    // Record two faults at gate 5
    await recordFault(page, { gate: 5, type: 'MG', bib: 10 });
    await recordFault(page, { gate: 5, type: 'STR', bib: 20 });

    // Gate 5 badge should show 2
    const gate5Badge = page
      .locator('.gate-grid-btn[data-gate="5"]')
      .locator('.gate-fault-count');
    await expect(gate5Badge).toContainText('2');

    // Delete the first fault
    await page
      .locator('.gate-judge-fault-item')
      .first()
      .locator('.gate-judge-fault-delete')
      .click();
    const deleteModal = page.locator('#fault-delete-modal');
    await expect(deleteModal).toBeVisible();
    await page.click('#confirm-fault-delete-btn');
    await expect(deleteModal).toBeHidden();
    await waitForToastToHide(page);

    // Gate 5 badge should update to 1
    const updatedBadge = page
      .locator('.gate-grid-btn[data-gate="5"]')
      .locator('.gate-fault-count');
    await expect(updatedBadge).toContainText('1');

    // Overall count should be 1
    await expect(page.locator('#inline-fault-count')).toContainText('1');
  });
});

// ─── Keyboard Shortcuts ───────────────────────────────────────────

test.describe('Gate Judge Faults - Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateJudge(page, { gateStart: 1, gateEnd: 10 });
  });

  test('M key should select MG fault type', async ({ page }) => {
    // Select a gate first so the fault detail panel is visible
    await page.click('.gate-grid-btn[data-gate="3"]');

    // Focus the fault type area so keyboard events reach it
    await page.locator(faultBtn('MG')).focus();

    // Press M for MG
    await page.keyboard.press('m');
    await expect(page.locator(faultBtn('MG'))).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('G key should select MG fault type', async ({ page }) => {
    await page.click('.gate-grid-btn[data-gate="3"]');
    await page.locator(faultBtn('MG')).focus();

    await page.keyboard.press('g');
    await expect(page.locator(faultBtn('MG'))).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('T key should select STR fault type', async ({ page }) => {
    await page.click('.gate-grid-btn[data-gate="3"]');
    await page.locator(faultBtn('STR')).focus();

    await page.keyboard.press('t');
    await expect(page.locator(faultBtn('STR'))).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('B key should select BR fault type', async ({ page }) => {
    await page.click('.gate-grid-btn[data-gate="3"]');
    await page.locator(faultBtn('BR')).focus();

    await page.keyboard.press('b');
    await expect(page.locator(faultBtn('BR'))).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('R key should select BR fault type', async ({ page }) => {
    await page.click('.gate-grid-btn[data-gate="3"]');
    await page.locator(faultBtn('BR')).focus();

    await page.keyboard.press('r');
    await expect(page.locator(faultBtn('BR'))).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('number keys should select gates when gate grid is focused', async ({
    page,
  }) => {
    // Focus a gate button in the grid
    const gate1 = page.locator('.gate-grid-btn[data-gate="1"]');
    await gate1.focus();

    // Press 5 to select gate 5
    await page.keyboard.press('5');
    await expect(
      page.locator('.gate-grid-btn[data-gate="5"]'),
    ).toHaveAttribute('aria-checked', 'true');

    // Fault detail panel should show gate 5
    await expect(page.locator('#fault-detail-gate-label')).toContainText('5');
  });
});
