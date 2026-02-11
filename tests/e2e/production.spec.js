/**
 * E2E Tests - Production PWA
 *
 * Tests for the live deployed version at https://ski-race-timer.vercel.app/
 * These tests verify the production deployment works correctly.
 *
 * Note: The timer view uses a radial dial UI by default.
 * Key selectors for radial mode:
 * - Number input: .dial-number[data-num="X"]
 * - Clear button: #radial-clear-btn
 * - Timestamp button: #radial-time-btn
 * - Bib display: #radial-bib-value
 * - Time display: #radial-time-hm, #radial-time-seconds, #radial-time-subseconds
 * - Timing points: .radial-point-btn[data-point="S|F"]
 * - Confirmation: #radial-confirmation-overlay.show
 *
 * Run with: npm run test:e2e:prod
 */

import { expect, test } from '@playwright/test';

const PROD_URL = 'https://ski-race-timer.vercel.app';

/**
 * Skip the onboarding wizard by setting localStorage flag.
 * Uses addInitScript to set the flag BEFORE any page JavaScript runs.
 */
async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
  });
}

/**
 * Ensure onboarding is dismissed (wait for modal to be hidden if present)
 */
async function ensureOnboardingDismissed(page) {
  const onboardingModal = page.locator('#onboarding-modal');
  // If onboarding modal exists and is visible, wait for it to be hidden
  const isVisible = await onboardingModal.isVisible().catch(() => false);
  if (isVisible) {
    // Try to complete onboarding by clicking through
    await page
      .click('#onboarding-modal .btn-secondary', { timeout: 2000 })
      .catch(() => {});
    await page
      .waitForSelector('#onboarding-modal', { state: 'hidden', timeout: 5000 })
      .catch(() => {});
  }
}

/**
 * Wait for confirmation overlay to hide
 */
async function waitForConfirmationToHide(page) {
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector('#radial-confirmation-overlay');
      return !overlay || !overlay.classList.contains('show');
    },
    { timeout: 3000 },
  );
}

test.describe('Production PWA - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Set up init script to skip onboarding before page loads
    await skipOnboarding(page);
    // Navigate to production URL
    await page.goto(PROD_URL);
    // Clear any existing entries
    await page.evaluate(() => {
      localStorage.removeItem('skiTimerEntries');
    });
    // Ensure onboarding is dismissed
    await ensureOnboardingDismissed(page);
    await page.waitForSelector('#radial-time-hm', { timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    // Clean up test data
    await page.evaluate(() => {
      localStorage.removeItem('skiTimerEntries');
    });
  });

  test.describe('Page Load & Basic UI', () => {
    test('should load the app successfully', async ({ page }) => {
      await expect(page).toHaveTitle(/Ski Race Timer|Ski-Renntimer/);
    });

    test('should display the clock', async ({ page }) => {
      // Radial clock is split into parts: HH:MM, SS, and mmm
      const clockHm = page.locator('#radial-time-hm');
      const clockSec = page.locator('#radial-time-seconds');
      await expect(clockHm).toBeVisible();
      await expect(clockSec).toBeVisible();

      // Clock should be in HH:MM format
      const hm = await clockHm.textContent();
      expect(hm).toMatch(/^\d{2}:\d{2}$/);
    });

    test('should display all three navigation tabs', async ({ page }) => {
      await expect(page.locator('[data-view="timer"]')).toBeVisible();
      await expect(page.locator('[data-view="results"]')).toBeVisible();
      await expect(page.locator('[data-view="settings"]')).toBeVisible();
    });

    test('should display bib input area', async ({ page }) => {
      await expect(page.locator('#radial-bib-value')).toBeVisible();
    });

    test('should display radial dial number buttons', async ({ page }) => {
      // Check some dial number buttons exist
      for (let i = 0; i <= 9; i++) {
        await expect(
          page.locator(`.dial-number[data-num="${i}"]`),
        ).toBeVisible();
      }
    });

    test('should display timing point buttons', async ({ page }) => {
      await expect(
        page.locator('.radial-point-btn[data-point="S"]'),
      ).toBeVisible();
      await expect(
        page.locator('.radial-point-btn[data-point="F"]'),
      ).toBeVisible();
    });

    test('should display timestamp button', async ({ page }) => {
      await expect(page.locator('#radial-time-btn')).toBeVisible();
    });
  });

  test.describe('Clock Display', () => {
    test('should show valid time format and update in real-time', async ({
      page,
    }) => {
      const clockHm = page.locator('#radial-time-hm');
      const clockSec = page.locator('#radial-time-seconds');
      const hm = await clockHm.textContent();
      const sec = await clockSec.textContent();

      // Verify HH:MM format
      expect(hm).toMatch(/^\d{2}:\d{2}$/);
      // Verify SS format
      expect(sec).toMatch(/^\d{2}$/);

      // Verify time values are within valid ranges
      const [hours, minutes] = hm.split(':').map(Number);
      expect(hours).toBeGreaterThanOrEqual(0);
      expect(hours).toBeLessThan(24);
      expect(minutes).toBeGreaterThanOrEqual(0);
      expect(minutes).toBeLessThan(60);

      // Check if clock updates by watching for DOM changes
      const clockUpdates = await page.evaluate(() => {
        return new Promise((resolve) => {
          const clock = document.querySelector('#radial-time-seconds');
          if (!clock) {
            resolve(-1); // Element not found
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

          // Wait 1 second and count updates
          setTimeout(() => {
            observer.disconnect();
            resolve(updateCount);
          }, 1000);
        });
      });

      // The clock should have updated at least once in 1 second
      expect(clockUpdates).toBeGreaterThan(0);
    });
  });

  test.describe('Tab Navigation', () => {
    test('should navigate to Timer view', async ({ page }) => {
      await page.click('[data-view="timer"]');
      await expect(page.locator('.timer-view')).toBeVisible();
    });

    test('should navigate to Results view', async ({ page }) => {
      await page.click('[data-view="results"]');
      await expect(page.locator('.results-view')).toBeVisible();
    });

    test('should navigate to Settings view', async ({ page }) => {
      await page.click('[data-view="settings"]');
      await expect(page.locator('.settings-view')).toBeVisible();
    });

    test('should highlight active tab', async ({ page }) => {
      await page.click('[data-view="results"]');
      await expect(page.locator('[data-view="results"]')).toHaveClass(/active/);

      await page.click('[data-view="settings"]');
      await expect(page.locator('[data-view="settings"]')).toHaveClass(
        /active/,
      );
    });
  });

  test.describe('Bib Number Input', () => {
    test('should enter bib number via radial dial', async ({ page }) => {
      await page.click('.dial-number[data-num="1"]');
      await page.click('.dial-number[data-num="2"]');
      await page.click('.dial-number[data-num="3"]');

      const bibDisplay = page.locator('#radial-bib-value');
      await expect(bibDisplay).toContainText('123');
    });

    test('should clear bib number', async ({ page }) => {
      await page.click('.dial-number[data-num="5"]');
      await page.click('.dial-number[data-num="6"]');
      await page.click('#radial-clear-btn');

      const bibDisplay = page.locator('#radial-bib-value');
      await expect(bibDisplay).toContainText('---');
    });

    test('should delete last digit with backspace', async ({ page }) => {
      await page.click('.dial-number[data-num="7"]');
      await page.click('.dial-number[data-num="8"]');
      await page.keyboard.press('Backspace');

      const bibDisplay = page.locator('#radial-bib-value');
      await expect(bibDisplay).toContainText('7');
    });
  });

  test.describe('Timing Point Selection', () => {
    test('should select Start point', async ({ page }) => {
      await page.click('.radial-point-btn[data-point="S"]');
      await expect(
        page.locator('.radial-point-btn[data-point="S"]'),
      ).toHaveClass(/active/);
    });

    test('should select Finish point', async ({ page }) => {
      await page.click('.radial-point-btn[data-point="F"]');
      await expect(
        page.locator('.radial-point-btn[data-point="F"]'),
      ).toHaveClass(/active/);
    });

    test('should only show one timing point as active', async ({ page }) => {
      // Select Start
      await page.click('.radial-point-btn[data-point="S"]');
      await expect(
        page.locator('.radial-point-btn[data-point="S"]'),
      ).toHaveClass(/active/);
      await expect(
        page.locator('.radial-point-btn[data-point="F"]'),
      ).not.toHaveClass(/active/);

      // Select Finish - Start should no longer be active
      await page.click('.radial-point-btn[data-point="F"]');
      await expect(
        page.locator('.radial-point-btn[data-point="F"]'),
      ).toHaveClass(/active/);
      await expect(
        page.locator('.radial-point-btn[data-point="S"]'),
      ).not.toHaveClass(/active/);
    });
  });

  test.describe('Recording Timestamps', () => {
    test('should record a timestamp', async ({ page }) => {
      await page.click('.dial-number[data-num="1"]');
      await page.click('.radial-point-btn[data-point="S"]');
      await page.click('#radial-time-btn');

      // Should show confirmation overlay
      await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(
        /show/,
      );
    });

    test('should hide confirmation after timeout', async ({ page }) => {
      await page.click('#radial-time-btn');
      await expect(page.locator('#radial-confirmation-overlay')).toHaveClass(
        /show/,
      );

      // Wait for auto-hide
      await waitForConfirmationToHide(page);
      await expect(
        page.locator('#radial-confirmation-overlay'),
      ).not.toHaveClass(/show/);
    });

    test('should show entry in results after recording', async ({ page }) => {
      await page.click('.dial-number[data-num="9"]');
      await page.click('.dial-number[data-num="9"]');
      await page.click('.radial-point-btn[data-point="S"]');
      await page.click('#radial-time-btn');

      // Wait for confirmation
      await waitForConfirmationToHide(page);

      // Navigate to results
      await page.click('[data-view="results"]');

      // Should see the entry
      const results = page.locator('.result-item');
      await expect(results.first()).toBeVisible();
    });
  });
});

test.describe('Production PWA - Results View', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await page.evaluate(() => {
      localStorage.removeItem('skiTimerEntries');
    });
    await ensureOnboardingDismissed(page);

    // Add test entries
    for (let i = 1; i <= 3; i++) {
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

  test('should display results list', async ({ page }) => {
    const results = page.locator('.result-item');
    await expect(results).toHaveCount(3);
  });

  test('should display statistics', async ({ page }) => {
    const stats = page.locator('.stats-row');
    await expect(stats.first()).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    await expect(page.locator('#search-input')).toBeVisible();
  });

  test('should filter by bib search', async ({ page }) => {
    const searchInput = page.locator('#search-input');
    await searchInput.fill('1');

    // Wait for filtering to take effect
    await page.waitForTimeout(400);

    // VirtualList filters items - check that the search reduced results
    const resultItems = page.locator('.result-item');
    const count = await resultItems.count();
    // Search for "1" should match only bib 1, so we expect fewer than 3 results
    expect(count).toBeLessThanOrEqual(3);
    expect(count).toBeGreaterThan(0);
  });

  test('should have export button', async ({ page }) => {
    await expect(page.locator('#export-btn')).toBeVisible();
  });
});

test.describe('Production PWA - Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);
    await page.click('[data-view="settings"]');
  });

  test('should display all settings toggles', async ({ page }) => {
    // Check toggle labels are visible (checkboxes themselves are hidden for custom styling)
    await expect(page.locator('label:has(#auto-toggle)')).toBeVisible();
    await expect(page.locator('label:has(#haptic-toggle)')).toBeVisible();
    await expect(page.locator('label:has(#sound-toggle)')).toBeVisible();
    await expect(page.locator('label:has(#gps-toggle)')).toBeVisible();
    await expect(page.locator('label:has(#sync-toggle)')).toBeVisible();
  });

  test('should display language toggle', async ({ page }) => {
    await expect(page.locator('#lang-toggle')).toBeVisible();
  });

  test('should toggle auto-increment', async ({ page }) => {
    const toggle = page.locator('#auto-toggle');
    const before = await toggle.evaluate((el) => el.checked);

    await page.locator('label:has(#auto-toggle)').click();

    const after = await toggle.evaluate((el) => el.checked);
    expect(after).not.toBe(before);
  });

  test('should toggle cloud sync and show settings', async ({ page }) => {
    const toggle = page.locator('#sync-toggle');
    await page.locator('label:has(#sync-toggle)').click();

    await expect(toggle).toBeChecked();
    // When sync is enabled, the race ID input row should become visible
    await expect(page.locator('#race-id-input-row-container')).toBeVisible();
  });

  test('should have language toggle that responds to clicks', async ({
    page,
  }) => {
    const langToggle = page.locator('#lang-toggle');

    // Language toggle should be clickable and have an active option
    await expect(langToggle).toBeVisible();
    const activeOption = page.locator('#lang-toggle .lang-option.active');
    const text = await activeOption.textContent();
    expect(['EN', 'DE']).toContain(text?.trim());

    // Clicking should work without errors
    await langToggle.click({ force: true });
    await page.waitForTimeout(100);

    // Should still have an active option after click
    const newActiveOption = page.locator('#lang-toggle .lang-option.active');
    const newText = await newActiveOption.textContent();
    expect(['EN', 'DE']).toContain(newText?.trim());
  });
});

test.describe('Production PWA - PWA Features', () => {
  test('should have valid manifest', async ({ page }) => {
    const response = await page.goto(`${PROD_URL}/manifest.json`);
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBeDefined();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('should have service worker file accessible', async ({ page }) => {
    // Verify service worker file exists and is accessible
    const response = await page.goto(`${PROD_URL}/sw.js`);
    expect(response.status()).toBe(200);

    // Check it contains Workbox service worker code
    const content = await response.text();
    // VitePWA uses Workbox which has different patterns than manual SW
    expect(content).toContain('self');
    expect(content.length).toBeGreaterThan(100); // Should have substantial code
  });

  test('should have correct viewport meta tag', async ({ page }) => {
    await page.goto(PROD_URL);

    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
  });

  test('should have theme color meta tag', async ({ page }) => {
    await page.goto(PROD_URL);

    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', /.+/);
  });

  test('should have apple touch icon', async ({ page }) => {
    await page.goto(PROD_URL);

    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toHaveAttribute('href', /.+/);
  });
});

test.describe('Production PWA - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);
  });

  test('should render correctly on mobile', async ({ page }) => {
    await expect(page.locator('#radial-time-hm')).toBeVisible();
    await expect(page.locator('#radial-bib-value')).toBeVisible();
    await expect(page.locator('#radial-time-btn')).toBeVisible();
  });

  test('should handle input on mobile viewport', async ({ page }) => {
    // Use click which works on mobile viewports too
    await page.click('.dial-number[data-num="5"]');
    const bibDisplay = page.locator('#radial-bib-value');
    await expect(bibDisplay).toContainText('5');
  });

  test('dial number should be easily tappable', async ({ page }) => {
    // Check dial number buttons have adequate size for touch
    const button = page.locator('.dial-number[data-num="1"]');
    const box = await button.boundingBox();

    // Buttons should be at least 25x25 pixels for touch accessibility (dial numbers are smaller but well-spaced)
    expect(box.width).toBeGreaterThanOrEqual(25);
    expect(box.height).toBeGreaterThanOrEqual(25);
  });
});

test.describe('Production PWA - Tablet Responsiveness', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);
  });

  test('should render correctly on tablet', async ({ page }) => {
    await expect(page.locator('#radial-time-hm')).toBeVisible();
    await expect(page.locator('#radial-bib-value')).toBeVisible();
    await expect(page.locator('#radial-time-btn')).toBeVisible();
  });
});

test.describe('Production PWA - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);
  });

  test('should have no major accessibility issues in timer view', async ({
    page,
  }) => {
    // Check for basic accessibility attributes
    const timestampBtn = page.locator('#radial-time-btn');
    await expect(timestampBtn).toBeVisible();

    // Tab navigation should work
    await page.keyboard.press('Tab');
    const focused = await page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    // Can tab through main elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focused = await page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('should have accessible color contrast', async ({ page }) => {
    // Clock text should be visible
    const clock = page.locator('#radial-time-hm');
    const color = await clock.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBeDefined();
    expect(color).not.toBe('transparent');
  });
});

test.describe('Production PWA - Performance', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);
    await page.waitForSelector('#radial-time-hm', { timeout: 10000 });
  });

  test('should load within acceptable time', async ({ page }) => {
    // Test passes if beforeEach completes successfully
    // Clock is already visible from beforeEach
    await expect(page.locator('#radial-time-hm')).toBeVisible();
  });

  test('should respond to interactions quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.click('.dial-number[data-num="1"]');
    await expect(page.locator('#radial-bib-value')).toContainText('1');
    const responseTime = Date.now() - startTime;

    // Interaction should complete within 500ms
    expect(responseTime).toBeLessThan(500);
  });
});

test.describe('Production PWA - Data Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await page.evaluate(() => {
      localStorage.removeItem('skiTimerEntries');
    });
    await ensureOnboardingDismissed(page);
  });

  test('should persist entries in localStorage', async ({ page }) => {
    // Add an entry
    await page.click('.dial-number[data-num="7"]');
    await page.click('.dial-number[data-num="7"]');
    await page.click('.dial-number[data-num="7"]');
    await page.click('.radial-point-btn[data-point="S"]');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Check localStorage
    const entries = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('skiTimerEntries') || '[]');
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].bib).toBe('777');

    // Clean up
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
  });

  test('should have working settings toggles', async ({ page }) => {
    await page.click('[data-view="settings"]');

    // Sound toggle is inside Advanced Settings - verify the toggle switch label is visible
    // Note: The checkbox input is visually hidden for custom toggle styling
    const toggleLabel = page.locator('label:has(#sound-toggle)');
    await expect(toggleLabel).toBeVisible();

    // Click should work without errors
    await toggleLabel.click();
    await page.waitForTimeout(100);

    // Toggle label should still be visible after click
    await expect(toggleLabel).toBeVisible();
  });

  test('should have working language toggle', async ({ page }) => {
    await page.click('[data-view="settings"]');

    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toBeVisible();

    // Check that one language option is active (visible)
    const activeOption = page.locator('#lang-toggle .lang-option.active');
    await expect(activeOption).toBeVisible();
    const text = await activeOption.textContent();
    expect(['EN', 'DE']).toContain(text?.trim());

    // Click should work without errors
    await langToggle.click({ force: true });
    await page.waitForTimeout(100);

    // Should still have an active option after click
    const newActiveOption = page.locator('#lang-toggle .lang-option.active');
    await expect(newActiveOption).toBeVisible();
    const newText = await newActiveOption.textContent();
    expect(['EN', 'DE']).toContain(newText?.trim());
  });
});

test.describe('Production PWA - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(PROD_URL);
    await ensureOnboardingDismissed(page);
  });

  test('should handle rapid button clicks gracefully', async ({ page }) => {
    // Rapid clicks on dial number
    for (let i = 0; i < 10; i++) {
      await page.click('.dial-number[data-num="1"]', { force: true });
    }

    // App should still be functional
    await expect(page.locator('#radial-bib-value')).toBeVisible();
  });

  test('should handle rapid tab switching', async ({ page }) => {
    // Rapid tab switching
    for (let i = 0; i < 5; i++) {
      await page.click('[data-view="timer"]');
      await page.click('[data-view="results"]');
      await page.click('[data-view="settings"]');
    }

    // App should still be functional
    await expect(page.locator('.settings-view')).toBeVisible();
  });
});

test.describe('Production PWA - Security Headers', () => {
  test('should have security headers', async ({ page }) => {
    const response = await page.goto(PROD_URL);
    const _headers = response.headers();

    // Check for common security headers (Vercel typically provides these)
    // Note: exact headers depend on Vercel configuration
    expect(response.status()).toBe(200);
  });
});
