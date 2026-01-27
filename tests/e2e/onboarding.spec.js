import { test, expect } from '@playwright/test';

test.describe('Onboarding Flow', () => {
  // Multi-step flows need more time in CI
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to trigger onboarding
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('shows welcome screen on first visit', async ({ page }) => {
    // Wait for onboarding modal
    const modal = page.locator('#onboarding-modal');
    await expect(modal).toBeVisible();

    // Check welcome card is shown
    const welcomeCard = page.locator('[data-step="1"]');
    await expect(welcomeCard).toBeVisible();
    await expect(welcomeCard.locator('h2')).toContainText(/Welcome|Willkommen/);
  });

  test('can select language', async ({ page }) => {
    const modal = page.locator('#onboarding-modal');
    await expect(modal).toBeVisible();

    // Click English
    await page.click('.lang-btn[data-lang="en"]');
    await expect(page.locator('.lang-btn[data-lang="en"]')).toHaveClass(/selected/);

    // Click German
    await page.click('.lang-btn[data-lang="de"]');
    await expect(page.locator('.lang-btn[data-lang="de"]')).toHaveClass(/selected/);
  });

  test('shows role selection on step 2', async ({ page }) => {
    const modal = page.locator('#onboarding-modal');
    await expect(modal).toBeVisible();

    // Click Get Started
    await page.click('[data-action="next"]');

    // Check role selection card is shown
    const roleCard = page.locator('[data-step="2"]');
    await expect(roleCard).toBeVisible();

    // Check both role options are present
    await expect(page.locator('.role-card[data-role="timer"]')).toBeVisible();
    await expect(page.locator('.role-card[data-role="gateJudge"]')).toBeVisible();

    // Timer should be selected by default
    await expect(page.locator('.role-card[data-role="timer"]')).toHaveClass(/selected/);
  });

  test('can select Gate Judge role', async ({ page }) => {
    const modal = page.locator('#onboarding-modal');
    await expect(modal).toBeVisible();

    // Go to step 2
    await page.click('[data-action="next"]');
    await expect(page.locator('[data-step="2"]')).toBeVisible();

    // Click Gate Judge
    await page.click('.role-card[data-role="gateJudge"]');
    await expect(page.locator('.role-card[data-role="gateJudge"]')).toHaveClass(/selected/);
    await expect(page.locator('.role-card[data-role="timer"]')).not.toHaveClass(/selected/);
  });

  test('Timer path shows photo capture step', async ({ page }) => {
    // Step 1: Click next on welcome card
    await page.locator('[data-step="1"] [data-action="next"]').click();

    // Step 2: Role selection - Timer is default, click next
    await page.locator('[data-step="2"] [data-action="next"]').click();

    // Step 3: Fill device name and click next
    await page.fill('#onboarding-device-name', 'Test Timer');
    await page.locator('[data-step="3"] [data-action="next"]').click();

    // Should see photo capture step (step 4, timer path)
    const photoCard = page.locator('[data-step="4"][data-path="timer"]');
    await expect(photoCard).toBeVisible();
    await expect(photoCard.locator('h2')).toContainText(/Photo|Foto/);
  });

  test('Gate Judge path shows gate assignment step', async ({ page }) => {
    // Step 1: Click next
    await page.locator('[data-step="1"] [data-action="next"]').click();

    // Step 2: Select Gate Judge and click next
    await page.click('.role-card[data-role="gateJudge"]');
    await page.locator('[data-step="2"] [data-action="next"]').click();

    // Step 3: Fill device name and click next
    await page.fill('#onboarding-device-name', 'Judge Hans');
    await page.locator('[data-step="3"] [data-action="next"]').click();

    // Should see gate assignment step (step 4, gateJudge path)
    const gateCard = page.locator('[data-step="4"][data-path="gateJudge"]');
    await expect(gateCard).toBeVisible();
    await expect(gateCard.locator('h2')).toContainText(/Gate|Tor/);

    // Check gate inputs are present
    await expect(page.locator('#onboarding-gate-start')).toBeVisible();
    await expect(page.locator('#onboarding-gate-end')).toBeVisible();
  });

  test('completes full Timer onboarding flow', async ({ page }) => {
    // Step 1: Welcome - click next
    await page.locator('[data-step="1"] [data-action="next"]').click();

    // Step 2: Role (Timer is default) - click next
    await page.locator('[data-step="2"] [data-action="next"]').click();

    // Step 3: Device name - fill and click next
    await page.fill('#onboarding-device-name', 'E2E Timer');
    await page.locator('[data-step="3"] [data-action="next"]').click();

    // Step 4: Photo capture - click next
    await page.locator('[data-step="4"][data-path="timer"] [data-action="next"]').click();

    // Step 5: Race setup - skip
    await page.locator('[data-step="5"] [data-action="skip"]').click();

    // Step 6: Summary
    const readyCard = page.locator('[data-step="6"]');
    await expect(readyCard).toBeVisible();
    await expect(readyCard.locator('h2')).toContainText(/Ready|Bereit/);

    // Finish
    await page.locator('[data-step="6"] [data-action="finish"]').click();

    // Modal should close and timer view should be visible
    await expect(page.locator('#onboarding-modal')).not.toBeVisible();
    await expect(page.locator('.timer-view')).toBeVisible();
  });

  test('completes full Gate Judge onboarding flow', async ({ page }) => {
    // Step 1: Welcome - click next
    await page.locator('[data-step="1"] [data-action="next"]').click();

    // Step 2: Select Gate Judge and click next
    await page.click('.role-card[data-role="gateJudge"]');
    await page.locator('[data-step="2"] [data-action="next"]').click();

    // Step 3: Device name - fill and click next
    await page.fill('#onboarding-device-name', 'Judge Maria');
    await page.locator('[data-step="3"] [data-action="next"]').click();

    // Step 4: Gate assignment - fill and click next
    await page.fill('#onboarding-gate-start', '5');
    await page.fill('#onboarding-gate-end', '12');
    await page.locator('[data-step="4"][data-path="gateJudge"] [data-action="next"]').click();

    // Step 5: Race setup - skip
    await page.locator('[data-step="5"] [data-action="skip"]').click();

    // Step 6: Summary - should show gate judge specific text
    const readyCard = page.locator('[data-step="6"]');
    await expect(readyCard).toBeVisible();

    // Finish
    await page.locator('[data-step="6"] [data-action="finish"]').click();

    // Modal should close and gate judge view should be visible
    await expect(page.locator('#onboarding-modal')).not.toBeVisible();
    await expect(page.locator('.gate-judge-view')).toBeVisible();

    // Gate judge tab should be visible, timer tab should be hidden
    await expect(page.locator('#gate-judge-tab')).toBeVisible();
    await expect(page.locator('#timer-tab')).not.toBeVisible();
  });
});
