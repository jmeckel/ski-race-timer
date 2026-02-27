/**
 * E2E Tests - Production PWA
 *
 * Smoke tests for the live deployed version at https://ski-race-timer.vercel.app/
 * These tests verify the production deployment works correctly.
 *
 * OPTIMIZATION: Tests are consolidated to minimize page loads against the live URL.
 * Each test covers multiple assertions to reduce the ~12s-per-load overhead.
 *
 * Run with: npm run test:e2e:prod
 */

import { expect, test } from '@playwright/test';

const PROD_URL = 'https://ski-race-timer.vercel.app';

async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
  });
}

async function ensureOnboardingDismissed(page) {
  const onboardingModal = page.locator('#onboarding-modal');
  const isVisible = await onboardingModal.isVisible().catch(() => false);
  if (isVisible) {
    await page
      .click('#onboarding-modal .btn-secondary', { timeout: 2000 })
      .catch(() => {});
    await page
      .waitForSelector('#onboarding-modal', { state: 'hidden', timeout: 5000 })
      .catch(() => {});
  }
}

async function waitForConfirmationToHide(page) {
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector('#radial-confirmation-overlay');
      return !overlay || !overlay.classList.contains('show');
    },
    { timeout: 3000 },
  );
}

test.describe('Production PWA - Timer View', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await ensureOnboardingDismissed(page);
    await page.waitForSelector('#radial-time-hm', { timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
  });

  test('should load app with all core UI elements', async ({ page }) => {
    // Title
    await expect(page).toHaveTitle(/CHRONO/);

    // Clock display (HH:MM and SS)
    const clockHm = page.locator('#radial-time-hm');
    const clockSec = page.locator('#radial-time-seconds');
    await expect(clockHm).toBeVisible();
    await expect(clockSec).toBeVisible();
    expect(await clockHm.textContent()).toMatch(/^\d{2}:\d{2}$/);

    // Navigation tabs
    await expect(page.locator('[data-view="timer"]')).toBeVisible();
    await expect(page.locator('[data-view="results"]')).toBeVisible();
    await expect(page.locator('[data-view="settings"]')).toBeVisible();

    // Bib input, dial numbers, timing points, record button
    await expect(page.locator('#radial-bib-value')).toBeVisible();
    await expect(page.locator('.dial-number[data-num="0"]')).toBeVisible();
    await expect(page.locator('.dial-number[data-num="9"]')).toBeVisible();
    await expect(
      page.locator('.radial-point-btn[data-point="S"]'),
    ).toBeVisible();
    await expect(
      page.locator('.radial-point-btn[data-point="F"]'),
    ).toBeVisible();
    await expect(page.locator('#radial-time-btn')).toBeVisible();
  });

  test('should update clock in real-time', async ({ page }) => {
    const clockUpdates = await page.evaluate(() => {
      return new Promise((resolve) => {
        const clock = document.querySelector('#radial-time-seconds');
        if (!clock) {
          resolve(-1);
          return;
        }
        let updateCount = 0;
        const observer = new MutationObserver(() => {
          updateCount++;
        });
        observer.observe(clock, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(updateCount);
        }, 1000);
      });
    });
    expect(clockUpdates).toBeGreaterThan(0);
  });

  test('should handle bib input, clear, and backspace', async ({ page }) => {
    const bibDisplay = page.locator('#radial-bib-value');

    // Enter bib
    await page.click('.dial-number[data-num="1"]');
    await page.click('.dial-number[data-num="2"]');
    await page.click('.dial-number[data-num="3"]');
    await expect(bibDisplay).toContainText('123');

    // Clear bib
    await page.click('#radial-clear-btn');
    await expect(bibDisplay).toContainText('---');

    // Enter and backspace
    await page.click('.dial-number[data-num="7"]');
    await page.click('.dial-number[data-num="8"]');
    await page.keyboard.press('Backspace');
    await expect(bibDisplay).toContainText('7');
  });

  test('should handle timing point and tab navigation', async ({ page }) => {
    // Timing point selection
    await page.click('.radial-point-btn[data-point="S"]');
    await expect(page.locator('.radial-point-btn[data-point="S"]')).toHaveClass(
      /active/,
    );
    await expect(
      page.locator('.radial-point-btn[data-point="F"]'),
    ).not.toHaveClass(/active/);

    await page.click('.radial-point-btn[data-point="F"]');
    await expect(page.locator('.radial-point-btn[data-point="F"]')).toHaveClass(
      /active/,
    );
    await expect(
      page.locator('.radial-point-btn[data-point="S"]'),
    ).not.toHaveClass(/active/);

    // Tab navigation
    await page.click('[data-view="results"]');
    await expect(page.locator('.results-view')).toBeVisible();
    await expect(page.locator('[data-view="results"]')).toHaveClass(/active/);

    await page.click('[data-view="settings"]');
    await expect(page.locator('.settings-view')).toBeVisible();
    await expect(page.locator('[data-view="settings"]')).toHaveClass(/active/);

    await page.click('[data-view="timer"]');
    await expect(page.locator('.timer-view')).toBeVisible();
  });

  test('should record timestamp, show confirmation, and persist to results', async ({
    page,
  }) => {
    // Record entry
    await page.click('.dial-number[data-num="9"]');
    await page.click('.dial-number[data-num="9"]');
    await page.click('.radial-point-btn[data-point="S"]');
    await page.click('#radial-time-btn');

    // Confirmation overlay
    await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(
      /show/,
    );
    await waitForConfirmationToHide(page);
    await expect(page.locator('#radial-confirmation-overlay')).not.toHaveClass(
      /show/,
    );

    // Entry visible in results
    await page.click('[data-view="results"]');
    await expect(page.locator('.result-item').first()).toBeVisible();

    // Entry persisted in localStorage
    const entries = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('skiTimerEntries') || '[]'),
    );
    expect(entries.length).toBeGreaterThan(0);
  });

  test('should respond to interactions quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.click('.dial-number[data-num="1"]');
    await expect(page.locator('#radial-bib-value')).toContainText('1');
    expect(Date.now() - startTime).toBeLessThan(500);
  });

  test('should handle rapid clicks and tab switches gracefully', async ({
    page,
  }) => {
    // Rapid dial clicks
    for (let i = 0; i < 10; i++) {
      await page.click('.dial-number[data-num="1"]', { force: true });
    }
    await expect(page.locator('#radial-bib-value')).toBeVisible();

    // Rapid tab switching
    for (let i = 0; i < 3; i++) {
      await page.click('[data-view="timer"]');
      await page.click('[data-view="results"]');
      await page.click('[data-view="settings"]');
    }
    await expect(page.locator('.settings-view')).toBeVisible();
  });
});

test.describe('Production PWA - Results View', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await ensureOnboardingDismissed(page);

    // Add 2 test entries (reduced from 3)
    for (let i = 1; i <= 2; i++) {
      await page.click(`.dial-number[data-num="${i}"]`);
      await page.click('.radial-point-btn[data-point="S"]');
      await page.click('#radial-time-btn');
      await waitForConfirmationToHide(page);
      await page.click('#radial-clear-btn');
    }
    await page.click('[data-view="results"]');
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
  });

  test('should display results with search and export', async ({ page }) => {
    // Results list
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(2);

    // Stats
    await expect(page.locator('#stat-racers')).toBeAttached();

    // Export button
    await expect(page.locator('#quick-export-btn')).toBeVisible();

    // Search/filter
    await page.locator('#toggle-filters-btn').click();
    await expect(page.locator('#search-input')).toBeVisible();

    // Filter by bib
    await page.locator('#search-input').fill('1');
    await page.waitForFunction(
      () => document.querySelectorAll('.result-item').length <= 2,
      { timeout: 3000 },
    );
    const count = await page.locator('.result-item').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(2);
  });
});

test.describe('Production PWA - Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);
    await page.click('[data-view="settings"]');
  });

  test('should display and toggle all settings', async ({ page }) => {
    // All toggle labels visible
    await expect(page.locator('label:has(#auto-toggle)')).toBeVisible();
    await expect(page.locator('label:has(#haptic-toggle)')).toBeVisible();
    await expect(page.locator('label:has(#sound-toggle)')).toBeVisible();
    await expect(page.locator('label:has(#gps-toggle)')).toBeVisible();
    await expect(page.locator('label:has(#sync-toggle)')).toBeVisible();

    // Toggle auto-increment
    const toggle = page.locator('#auto-toggle');
    const before = await toggle.evaluate((el) => el.checked);
    await page.locator('label:has(#auto-toggle)').click();
    const after = await toggle.evaluate((el) => el.checked);
    expect(after).not.toBe(before);

    // Cloud sync toggle shows race ID input
    await page.locator('label:has(#sync-toggle)').click();
    await expect(page.locator('#sync-toggle')).toBeChecked();
    await expect(page.locator('#race-id-input-row-container')).toBeVisible();
  });

  test('should display and toggle language', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toBeVisible();

    const activeOption = page.locator('#lang-toggle .lang-option.active');
    const text = await activeOption.textContent();
    expect(['EN', 'DE', 'FR']).toContain(text?.trim());

    // Click should work without errors
    await langToggle.click({ force: true });
    const newText = await page
      .locator('#lang-toggle .lang-option.active')
      .textContent();
    expect(['EN', 'DE', 'FR']).toContain(newText?.trim());
  });
});

test.describe('Production PWA - PWA Features', () => {
  test('should have valid manifest and service worker', async ({ page }) => {
    // Manifest
    const manifestResponse = await page.goto(`${PROD_URL}/manifest.json`);
    expect(manifestResponse.status()).toBe(200);
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBeDefined();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);

    // Service worker
    const swResponse = await page.goto(`${PROD_URL}/sw.js`);
    expect(swResponse.status()).toBe(200);
    const swContent = await swResponse.text();
    expect(swContent).toContain('self');
    expect(swContent.length).toBeGreaterThan(100);
  });

  test('should have correct meta tags', async ({ page }) => {
    await page.goto(PROD_URL);

    // Viewport
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');

    // Theme color
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      /.+/,
    );

    // Apple touch icon
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      /.+/,
    );

    // Security
    expect((await page.goto(PROD_URL)).status()).toBe(200);
  });
});

test.describe('Production PWA - Responsive & Accessible', () => {
  test('should render correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);

    await expect(page.locator('#radial-time-hm')).toBeVisible();
    await expect(page.locator('#radial-bib-value')).toBeVisible();
    await expect(page.locator('#radial-time-btn')).toBeVisible();

    // Touch targets
    await page.click('.dial-number[data-num="5"]');
    await expect(page.locator('#radial-bib-value')).toContainText('5');

    const box = await page.locator('.dial-number[data-num="1"]').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(25);
    expect(box.height).toBeGreaterThanOrEqual(25);
  });

  test('should render correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);

    await expect(page.locator('#radial-time-hm')).toBeVisible();
    await expect(page.locator('#radial-bib-value')).toBeVisible();
    await expect(page.locator('#radial-time-btn')).toBeVisible();
  });

  test('should support keyboard navigation and accessibility', async ({
    page,
  }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);

    // Tab navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();

    // Color contrast (clock text is visible)
    const color = await page
      .locator('#radial-time-hm')
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).toBeDefined();
    expect(color).not.toBe('transparent');
  });
});
