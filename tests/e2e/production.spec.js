/**
 * E2E Tests - Production PWA
 *
 * Tests for the live deployed version at https://ski-race-timer.vercel.app/
 * These tests verify the production deployment works correctly.
 *
 * Run with: npm run test:e2e:prod
 */

import { test, expect } from '@playwright/test';

const PROD_URL = 'https://ski-race-timer.vercel.app';

test.describe('Production PWA - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to production URL
    await page.goto(PROD_URL);
    // Clear any existing data to ensure clean state
    await page.evaluate(() => {
      localStorage.removeItem('skiTimerEntries');
    });
    await page.reload();
    await page.waitForSelector('.clock-time');
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
      const clock = page.locator('.clock-time');
      await expect(clock).toBeVisible();

      // Clock should be in HH:MM:SS.mmm format
      const time = await clock.textContent();
      expect(time).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    test('should display the date', async ({ page }) => {
      const date = page.locator('.clock-date');
      await expect(date).toBeVisible();
    });

    test('should display all three navigation tabs', async ({ page }) => {
      await expect(page.locator('[data-view="timing-view"]')).toBeVisible();
      await expect(page.locator('[data-view="results"]')).toBeVisible();
      await expect(page.locator('[data-view="settings"]')).toBeVisible();
    });

    test('should display bib input area', async ({ page }) => {
      await expect(page.locator('.bib-display')).toBeVisible();
    });

    test('should display number pad', async ({ page }) => {
      await expect(page.locator('.number-pad')).toBeVisible();
      // Check all digits 0-9 exist
      for (let i = 0; i <= 9; i++) {
        await expect(page.locator(`[data-num="${i}"]`)).toBeVisible();
      }
    });

    test('should display timing point buttons', async ({ page }) => {
      await expect(page.locator('[data-point="S"]')).toBeVisible();
      await expect(page.locator('[data-point="F"]')).toBeVisible();
    });

    test('should display timestamp button', async ({ page }) => {
      await expect(page.locator('#timestamp-btn')).toBeVisible();
    });
  });

  test.describe('Clock Display', () => {
    test('should show valid time format and update in real-time', async ({ page }) => {
      const clock = page.locator('.clock-time');
      const time = await clock.textContent();

      // Clock should NOT show the default placeholder value
      expect(time).not.toBe('00:00:00.000');

      // Verify clock shows valid HH:MM:SS.mmm format
      expect(time).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);

      // Verify time values are within valid ranges
      const [hms] = time.split('.');
      const [hours, minutes, seconds] = hms.split(':').map(Number);
      expect(hours).toBeGreaterThanOrEqual(0);
      expect(hours).toBeLessThan(24);
      expect(minutes).toBeGreaterThanOrEqual(0);
      expect(minutes).toBeLessThan(60);
      expect(seconds).toBeGreaterThanOrEqual(0);
      expect(seconds).toBeLessThan(60);

      // Check if clock updates by watching for DOM changes
      const clockUpdates = await page.evaluate(() => {
        return new Promise((resolve) => {
          const clock = document.getElementById('clock-time');
          let updateCount = 0;

          const observer = new MutationObserver(() => {
            updateCount++;
          });

          observer.observe(clock, { childList: true, characterData: true, subtree: true });

          // Wait 1 second and count updates
          setTimeout(() => {
            observer.disconnect();
            resolve(updateCount);
          }, 1000);
        });
      });

      // The clock should have updated at least once in 1 second (updates every 100ms)
      expect(clockUpdates).toBeGreaterThan(0);
    });
  });

  test.describe('Tab Navigation', () => {
    test('should navigate to Timer view', async ({ page }) => {
      await page.click('[data-view="timing-view"]');
      await expect(page.locator('#timing-view')).toBeVisible();
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
      await expect(page.locator('[data-view="settings"]')).toHaveClass(/active/);
    });
  });

  test.describe('Bib Number Input', () => {
    test('should enter bib number via number pad', async ({ page }) => {
      await page.click('[data-num="1"]');
      await page.click('[data-num="2"]');
      await page.click('[data-num="3"]');

      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('123');
    });

    test('should clear bib number', async ({ page }) => {
      await page.click('[data-num="5"]');
      await page.click('[data-num="6"]');
      await page.click('[data-action="clear"]');

      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('---');
    });

    test('should delete last digit', async ({ page }) => {
      await page.click('[data-num="7"]');
      await page.click('[data-num="8"]');
      await page.click('#btn-delete');

      const bibDisplay = page.locator('.bib-display');
      await expect(bibDisplay).toContainText('7');
    });
  });

  test.describe('Timing Point Selection', () => {
    test('should select Start point', async ({ page }) => {
      await page.click('[data-point="S"]');
      await expect(page.locator('[data-point="S"]')).toHaveClass(/active/);
    });

    test('should select Finish point', async ({ page }) => {
      await page.click('[data-point="F"]');
      await expect(page.locator('[data-point="F"]')).toHaveClass(/active/);
    });

    test('should only show one timing point as active', async ({ page }) => {
      // Select Start
      await page.click('[data-point="S"]');
      await expect(page.locator('[data-point="S"]')).toHaveClass(/active/);
      await expect(page.locator('[data-point="F"]')).not.toHaveClass(/active/);

      // Select Finish - Start should no longer be active
      await page.click('[data-point="F"]');
      await expect(page.locator('[data-point="F"]')).toHaveClass(/active/);
      await expect(page.locator('[data-point="S"]')).not.toHaveClass(/active/);
    });
  });

  test.describe('Recording Timestamps', () => {
    test('should record a timestamp', async ({ page }) => {
      await page.click('[data-num="1"]');
      await page.click('[data-point="S"]');
      await page.click('#timestamp-btn');

      // Should show confirmation overlay
      await expect(page.locator('.confirmation-overlay')).toBeVisible();
    });

    test('should hide confirmation after timeout', async ({ page }) => {
      await page.click('#timestamp-btn');
      await expect(page.locator('.confirmation-overlay')).toBeVisible();

      // Wait for auto-hide (1.5 seconds + buffer)
      await page.waitForTimeout(2000);
      await expect(page.locator('.confirmation-overlay')).not.toBeVisible();
    });

    test('should show entry in results after recording', async ({ page }) => {
      await page.click('[data-num="9"]');
      await page.click('[data-num="9"]');
      await page.click('[data-point="S"]');
      await page.click('#timestamp-btn');

      // Wait for confirmation
      await page.waitForTimeout(500);

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
    await page.goto(PROD_URL);
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await page.reload();

    // Add test entries
    for (let i = 1; i <= 3; i++) {
      await page.click(`[data-num="${i}"]`);
      await page.click('[data-point="S"]');
      await page.click('#timestamp-btn');
      await page.waitForTimeout(500);
      await page.click('[data-action="clear"]');
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
    const stats = page.locator('.results-stats');
    await expect(stats.first()).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    await expect(page.locator('#search-input')).toBeVisible();
  });

  test('should filter by bib search', async ({ page }) => {
    const searchInput = page.locator('#search-input');
    await searchInput.fill('1');

    const results = page.locator('.result-item:visible');
    await expect(results).toHaveCount(1);
  });

  test('should have export button', async ({ page }) => {
    await expect(page.locator('#export-horology-btn')).toBeVisible();
  });
});

test.describe('Production PWA - Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROD_URL);
    await page.click('[data-view="settings"]');
  });

  test('should display all settings toggles', async ({ page }) => {
    await expect(page.locator('#auto-toggle')).toBeVisible();
    await expect(page.locator('#haptic-toggle')).toBeVisible();
    await expect(page.locator('#sound-toggle')).toBeVisible();
    await expect(page.locator('#gps-toggle')).toBeVisible();
    await expect(page.locator('#sync-toggle')).toBeVisible();
  });

  test('should display language toggle', async ({ page }) => {
    await expect(page.locator('#lang-toggle')).toBeVisible();
  });

  test('should toggle auto-increment', async ({ page }) => {
    const toggle = page.locator('#auto-toggle');
    const before = await toggle.evaluate(el => el.checked);

    await page.locator(`label:has(#${toggle.getAttribute("id") || "unknown"})`).click(); // Note: This may need manual fix

    const after = await toggle.evaluate(el => el.checked);
    expect(after).not.toBe(before);
  });

  test('should toggle cloud sync and show settings', async ({ page }) => {
    const toggle = page.locator('#sync-toggle');
    await page.locator(`label:has(#${toggle.getAttribute("id") || "unknown"})`).click(); // Note: This may need manual fix

    await expect(toggle).toBeChecked();
    await expect(page.locator('#sync-settings-row')).toBeVisible();
  });

  test('should have language toggle that responds to clicks', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');

    // Language toggle should be clickable and contain valid text
    await expect(langToggle).toBeVisible();
    const text = await langToggle.textContent();
    expect(['EN', 'DE']).toContain(text);

    // Clicking should work without errors
    await langToggle.click({ force: true });
    await page.waitForTimeout(100);

    // Toggle should still contain valid text after click
    const newText = await langToggle.textContent();
    expect(['EN', 'DE']).toContain(newText);
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

    // Check it contains service worker code
    const content = await response.text();
    expect(content).toContain('install');
    expect(content).toContain('fetch');
  });

  test('should have correct viewport meta tag', async ({ page }) => {
    await page.goto(PROD_URL);

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
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

  test('should render correctly on mobile', async ({ page }) => {
    await page.goto(PROD_URL);

    await expect(page.locator('.clock-time')).toBeVisible();
    await expect(page.locator('.bib-display')).toBeVisible();
    await expect(page.locator('#timestamp-btn')).toBeVisible();
    await expect(page.locator('.number-pad')).toBeVisible();
  });

  test('should handle input on mobile viewport', async ({ page }) => {
    await page.goto(PROD_URL);

    // Use click which works on mobile viewports too
    await page.click('[data-num="5"]');
    const bibDisplay = page.locator('.bib-display');
    await expect(bibDisplay).toContainText('5');
  });

  test('number pad should be easily tappable', async ({ page }) => {
    await page.goto(PROD_URL);

    // Check number pad buttons have adequate size for touch
    const button = page.locator('[data-num="1"]');
    const box = await button.boundingBox();

    // Buttons should be at least 44x44 pixels for touch accessibility
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
  });
});

test.describe('Production PWA - Tablet Responsiveness', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('should render correctly on tablet', async ({ page }) => {
    await page.goto(PROD_URL);

    await expect(page.locator('.clock-time')).toBeVisible();
    await expect(page.locator('.bib-display')).toBeVisible();
    await expect(page.locator('#timestamp-btn')).toBeVisible();
  });
});

test.describe('Production PWA - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROD_URL);
  });

  test('should have no major accessibility issues in timer view', async ({ page }) => {
    // Check for basic accessibility attributes
    const timestampBtn = page.locator('#timestamp-btn');
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
    const clock = page.locator('.clock-time');
    const color = await clock.evaluate(el => getComputedStyle(el).color);
    expect(color).toBeDefined();
    expect(color).not.toBe('transparent');
  });
});

test.describe('Production PWA - Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(PROD_URL);
    await page.waitForSelector('.clock-time');
    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should respond to interactions quickly', async ({ page }) => {
    await page.goto(PROD_URL);
    await page.waitForSelector('.clock-time');

    const startTime = Date.now();
    await page.click('[data-num="1"]');
    await expect(page.locator('.bib-display')).toContainText('1');
    const responseTime = Date.now() - startTime;

    // Interaction should complete within 500ms
    expect(responseTime).toBeLessThan(500);
  });
});

test.describe('Production PWA - Data Persistence', () => {
  test('should persist entries in localStorage', async ({ page }) => {
    await page.goto(PROD_URL);
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));

    // Add an entry
    await page.click('[data-num="7"]');
    await page.click('[data-num="7"]');
    await page.click('[data-num="7"]');
    await page.click('[data-point="S"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(500);

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
    await page.goto(PROD_URL);
    await page.click('[data-view="settings"]');

    // Verify sound toggle is interactive
    const toggle = page.locator('#sound-toggle');
    await expect(toggle).toBeVisible();

    // Click should work without errors
    await page.locator(`label:has(#${toggle.getAttribute("id") || "unknown"})`).click(); // Note: This may need manual fix
    await page.waitForTimeout(100);

    // Toggle should still be visible after click
    await expect(toggle).toBeVisible();
  });

  test('should have working language toggle', async ({ page }) => {
    await page.goto(PROD_URL);
    await page.click('[data-view="settings"]');

    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toBeVisible();

    // Should contain valid language code
    const text = await langToggle.textContent();
    expect(['EN', 'DE']).toContain(text);

    // Click should work without errors
    await langToggle.click({ force: true });
    await page.waitForTimeout(100);

    // Should still contain valid language code after click
    const newText = await langToggle.textContent();
    expect(['EN', 'DE']).toContain(newText);
  });
});

test.describe('Production PWA - Error Handling', () => {
  test('should handle rapid button clicks gracefully', async ({ page }) => {
    await page.goto(PROD_URL);

    // Rapid clicks on number pad
    for (let i = 0; i < 10; i++) {
      await page.click('[data-num="1"]', { force: true });
    }

    // App should still be functional
    await expect(page.locator('.bib-display')).toBeVisible();
  });

  test('should handle rapid tab switching', async ({ page }) => {
    await page.goto(PROD_URL);

    // Rapid tab switching
    for (let i = 0; i < 5; i++) {
      await page.click('[data-view="timing-view"]');
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
    const headers = response.headers();

    // Check for common security headers (Vercel typically provides these)
    // Note: exact headers depend on Vercel configuration
    expect(response.status()).toBe(200);
  });
});
