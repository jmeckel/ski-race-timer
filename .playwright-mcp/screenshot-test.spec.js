import { test, expect } from '@playwright/test';

const prodUrl = 'https://ski-race-timer.vercel.app';

test.describe('Production App Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding by setting localStorage before navigating
    await page.goto(prodUrl);
    await page.evaluate(() => {
      localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
    });
  });

  test('1. Timer view screenshot', async ({ page }) => {
    await page.goto(prodUrl);
    // Wait for the timer view to be visible
    await page.waitForSelector('.timer-clock', { timeout: 10000 });
    await page.screenshot({
      path: '.playwright-mcp/01-timer-view.png',
      fullPage: false
    });
    console.log('Timer view captured - shows radial dial UI');
  });

  test('2. Enter bib and record timestamp', async ({ page }) => {
    await page.goto(prodUrl);
    await page.waitForSelector('.timer-clock', { timeout: 10000 });

    // Enter bib number using the dial - tap on number segments
    // The dial has numbers 0-9 arranged radially
    // Let's try entering "12" by clicking the dial segments

    // Click on "1" segment of the dial
    const dial = page.locator('.timer-dial-svg');
    if (await dial.isVisible()) {
      // Try clicking dial segments for bib entry
      const segment1 = page.locator('[data-digit="1"]');
      if (await segment1.count() > 0) {
        await segment1.click();
      }
      const segment2 = page.locator('[data-digit="2"]');
      if (await segment2.count() > 0) {
        await segment2.click();
      }
    }

    // Alternative: use the number pad if dial doesn't work
    const numpad1 = page.locator('.number-pad button:has-text("1")');
    if (await numpad1.count() > 0) {
      await numpad1.click();
      const numpad2 = page.locator('.number-pad button:has-text("2")');
      await numpad2.click();
    }

    await page.screenshot({
      path: '.playwright-mcp/02-bib-entered.png',
      fullPage: false
    });

    // Record timestamp by clicking the central button
    const recordButton = page.locator('.timer-record-btn, .record-btn, button:has-text("Record")');
    if (await recordButton.count() > 0) {
      await recordButton.first().click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: '.playwright-mcp/03-timestamp-recorded.png',
      fullPage: false
    });
    console.log('Bib entry and timestamp recorded');
  });

  test('3. Results view screenshot', async ({ page }) => {
    await page.goto(prodUrl);
    await page.waitForSelector('.timer-clock', { timeout: 10000 });

    // First record a timestamp so we have something in results
    const numpad1 = page.locator('.number-pad button:has-text("5")');
    if (await numpad1.count() > 0) {
      await numpad1.click();
    }

    const recordButton = page.locator('.timer-record-btn, .record-btn, button:has-text("Record")');
    if (await recordButton.count() > 0) {
      await recordButton.first().click();
      await page.waitForTimeout(500);
    }

    // Navigate to Results tab
    const resultsTab = page.locator('.tab-btn:has-text("Results"), [data-tab="results"], button:has-text("Results")');
    if (await resultsTab.count() > 0) {
      await resultsTab.first().click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: '.playwright-mcp/04-results-view.png',
      fullPage: false
    });
    console.log('Results view captured');
  });

  test('4. Settings view screenshot', async ({ page }) => {
    await page.goto(prodUrl);
    await page.waitForSelector('.timer-clock', { timeout: 10000 });

    // Navigate to Settings tab
    const settingsTab = page.locator('.tab-btn:has-text("Settings"), [data-tab="settings"], button:has-text("Settings")');
    if (await settingsTab.count() > 0) {
      await settingsTab.first().click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: '.playwright-mcp/05-settings-view.png',
      fullPage: false
    });
    console.log('Settings view captured');
  });

  test('5. Landscape orientation', async ({ page, browserName }) => {
    // Set viewport to landscape
    await page.setViewportSize({ width: 844, height: 390 });

    await page.goto(prodUrl);
    await page.waitForSelector('.timer-clock', { timeout: 10000 });

    await page.screenshot({
      path: '.playwright-mcp/06-timer-landscape.png',
      fullPage: false
    });
    console.log('Landscape orientation captured');
  });
});
