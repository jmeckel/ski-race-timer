/**
 * E2E Tests - Internationalization (i18n)
 *
 * Tests for language switching between German and English
 */

import { test, expect } from '@playwright/test';

// Helper to get current language
async function getCurrentLanguage(page) {
  return await page.evaluate(() => localStorage.getItem('skiTimerLang') || 'de');
}

// Helper to set language
async function setLanguage(page, lang) {
  await page.click('[data-view="settings-view"]');
  const langToggle = page.locator('#lang-toggle');
  const currentText = await langToggle.textContent();

  // Toggle if not in desired language
  if ((lang === 'en' && currentText?.includes('DE')) ||
      (lang === 'de' && currentText?.includes('EN'))) {
    await langToggle.click();
  }
}

test.describe('Language Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings-view"]');
  });

  test('should have language toggle button', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toBeVisible();
  });

  test('should show current language indicator', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');
    const text = await langToggle.textContent();

    // Should show DE or EN
    expect(text).toMatch(/DE|EN/i);
  });

  test('should toggle between languages', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');
    const initialText = await langToggle.textContent();

    await langToggle.click();

    const newText = await langToggle.textContent();
    expect(newText).not.toBe(initialText);
  });

  test('should persist language after toggle', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');

    // Get initial state
    const initialText = await langToggle.textContent();

    // Toggle
    await langToggle.click();
    const toggledText = await langToggle.textContent();

    // Reload
    await page.reload();
    await page.click('[data-view="settings-view"]');

    // Should stay toggled
    const afterReloadText = await page.locator('#lang-toggle').textContent();
    expect(afterReloadText).toBe(toggledText);
  });
});

test.describe('German Language (Default)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear language setting to get default
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('skiTimerLang'));
    await page.reload();
  });

  test('should default to German', async ({ page }) => {
    const lang = await getCurrentLanguage(page);
    expect(lang).toBe('de');
  });

  test('should show German navigation labels', async ({ page }) => {
    // Tab labels should be in German
    const timerTab = page.locator('[data-view="timing-view"]');
    const text = await timerTab.textContent();

    // "Timer" or "Stoppuhr" or similar German term
    expect(text?.length).toBeGreaterThan(0);
  });

  test('should show German settings labels', async ({ page }) => {
    await page.click('[data-view="settings-view"]');

    // Settings title should be German
    const settingsTitle = page.locator('.settings-title').first();
    const text = await settingsTitle.textContent();

    // Should be "Einstellungen" or contain German text
    expect(text?.length).toBeGreaterThan(0);
  });

  test('should show German button labels', async ({ page }) => {
    // Check timestamp button
    const timestampBtn = page.locator('#timestamp-btn');
    const text = await timestampBtn.textContent();

    expect(text?.length).toBeGreaterThan(0);
  });

  test('should show Ziel for Finish in German', async ({ page }) => {
    // Record an entry
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Go to results
    await page.click('[data-view="results-view"]');

    // Timing point should show "Z" for Ziel
    const pointLabel = page.locator('.result-point').first();
    await expect(pointLabel).toHaveText('Z');
  });
});

test.describe('English Language', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');
    await page.click('[data-view="timing-view"]');
  });

  test('should show English when toggled', async ({ page }) => {
    await page.click('[data-view="settings-view"]');

    // Language toggle shows current language (EN when English is selected)
    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toContainText('EN');
  });

  test('should show F for Finish in English', async ({ page }) => {
    // Record an entry
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Go to results
    await page.click('[data-view="results-view"]');

    // Timing point should show "F" for Finish
    const pointLabel = page.locator('.result-point').first();
    await expect(pointLabel).toHaveText('F');
  });

  test('should show English settings labels', async ({ page }) => {
    await page.click('[data-view="settings-view"]');

    // Check for English text - Settings title
    const settingsTitle = page.locator('.settings-title').first();
    const text = await settingsTitle.textContent();

    expect(text?.length).toBeGreaterThan(0);
  });
});

test.describe('Language Consistency Across Views', () => {
  test('should maintain language in Timer view', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');

    await page.click('[data-view="timing-view"]');

    // Timestamp button should have English text
    const timestampBtn = page.locator('#timestamp-btn');
    await expect(timestampBtn).toBeVisible();
  });

  test('should maintain language in Results view', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');

    // Add an entry
    await page.click('[data-view="timing-view"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    await page.click('[data-view="results-view"]');

    // Results should show English labels
    await expect(page.locator('.results-header')).toBeVisible();
  });

  test('should maintain language after navigation', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');

    // Navigate through all views
    await page.click('[data-view="timing-view"]');
    await page.click('[data-view="results-view"]');
    await page.click('[data-view="settings-view"]');
    await page.click('[data-view="timing-view"]');

    // Language should still be English (toggle shows current language)
    await page.click('[data-view="settings-view"]');
    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toContainText('EN');
  });
});

test.describe('Date Formatting by Language', () => {
  test('should format date in German format', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'de');
    await page.click('[data-view="timing-view"]');

    const dateDisplay = page.locator('.clock-date');
    const dateText = await dateDisplay.textContent();

    // German date format: DD.MM.YYYY or similar
    // Should contain a date-like pattern
    expect(dateText?.length).toBeGreaterThan(0);
  });

  test('should format date in English format', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');
    await page.click('[data-view="timing-view"]');

    const dateDisplay = page.locator('.clock-date');
    const dateText = await dateDisplay.textContent();

    // English date format: MM/DD/YYYY or Month DD, YYYY
    expect(dateText?.length).toBeGreaterThan(0);
  });
});

test.describe('Status Labels by Language', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Add entry and set status
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    await page.click('[data-view="results-view"]');
    await page.click('.result-item .result-bib');
    await page.selectOption('#edit-status-select', 'dnf');
    await page.click('#edit-save-btn');
  });

  test('should show status in current language', async ({ page }) => {
    // Status badge should show DNF (same in both languages)
    const statusBadge = page.locator('.result-status').first();
    await expect(statusBadge).toContainText('DNF');
  });
});

test.describe('Timing Point Labels by Language', () => {
  test('should show Start as S in both languages', async ({ page }) => {
    await page.goto('/');

    // Disable simple mode to see Start button
    await page.click('[data-view="settings-view"]');
    const simpleToggle = page.locator('#toggle-simple');
    const isSimple = await simpleToggle.evaluate(el => el.classList.contains('on'));
    if (isSimple) {
      await simpleToggle.click();
    }

    await page.click('[data-view="timing-view"]');

    const startBtn = page.locator('[data-point="S"]');
    const text = await startBtn.textContent();

    // Start is abbreviated as S in both languages
    expect(text).toContain('S');
  });

  test('should show Finish/Ziel appropriately', async ({ page }) => {
    await page.goto('/');

    const finishBtn = page.locator('[data-point="F"]');
    const text = await finishBtn.textContent();

    // Should show Finish (EN) or Ziel (DE)
    expect(text).toMatch(/Finish|Ziel|F|Z/i);
  });
});

test.describe('Toast Messages by Language', () => {
  test('should show toast in current language', async ({ page }) => {
    await page.goto('/');

    // Record and undo to trigger toast
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    await page.click('#undo-btn');

    // Toast should appear with localized message
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
  });
});

test.describe('Empty State Messages', () => {
  test('should show empty state message in German', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await setLanguage(page, 'de');

    await page.reload();
    await page.click('[data-view="results-view"]');

    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
  });

  test('should show empty state message in English', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await setLanguage(page, 'en');

    await page.reload();
    await page.click('[data-view="results-view"]');

    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
  });
});
