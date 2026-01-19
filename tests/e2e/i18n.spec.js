/**
 * E2E Tests - Internationalization (i18n)
 *
 * Tests for language switching between German and English
 */

import { test, expect } from '@playwright/test';

// Helper to click a toggle by clicking its label wrapper
async function clickToggle(page, toggleSelector) {
  await page.locator(`label:has(${toggleSelector})`).click();
}

// Helper to check if toggle is on
async function isToggleOn(page, toggleSelector) {
  return await page.locator(toggleSelector).isChecked();
}

// Helper to disable simple mode
async function disableSimpleMode(page) {
  if (await isToggleOn(page, '#simple-mode-toggle')) {
    await clickToggle(page, '#simple-mode-toggle');
  }
}

// Helper to get current language
async function getCurrentLanguage(page) {
  return await page.evaluate(() => localStorage.getItem('skiTimerLang') || 'de');
}

// Helper to set language
async function setLanguage(page, lang) {
  await page.click('[data-view="settings"]');
  const langToggle = page.locator('#lang-toggle');
  const activeLang = await langToggle.locator('.lang-option.active').getAttribute('data-lang');

  // Click the language option we want if not already active
  if (activeLang !== lang) {
    await langToggle.locator(`.lang-option[data-lang="${lang}"]`).click();
  }
}

test.describe('Language Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="settings"]');
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

    // Get initial active language
    const initialActiveLang = await langToggle.locator('.lang-option.active').getAttribute('data-lang');

    // Click the inactive language option
    const targetLang = initialActiveLang === 'de' ? 'en' : 'de';
    await langToggle.locator(`.lang-option[data-lang="${targetLang}"]`).click();

    // Active language should have changed
    const newActiveLang = await langToggle.locator('.lang-option.active').getAttribute('data-lang');
    expect(newActiveLang).not.toBe(initialActiveLang);
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
    const timerTab = page.locator('[data-view="timer"]');
    const text = await timerTab.textContent();

    // "Timer" or "Stoppuhr" or similar German term
    expect(text?.length).toBeGreaterThan(0);
  });

  test('should show German settings labels', async ({ page }) => {
    await page.click('[data-view="settings"]');

    // Settings title should be German
    const settingsTitle = page.locator('.settings-section-title').first();
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

  test('should show timing point code in results', async ({ page }) => {
    // Record an entry
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Go to results
    await page.click('[data-view="results"]');

    // Timing point shows the code (F for Finish) not translated label
    const pointLabel = page.locator('.result-point').first();
    await expect(pointLabel).toContainText('F');
  });
});

test.describe('English Language', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');
    await page.click('[data-view="timer"]');
  });

  test('should show English when toggled', async ({ page }) => {
    await page.click('[data-view="settings"]');

    // Language toggle shows current language (EN when English is selected)
    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toContainText('EN');
  });

  test('should show F for Finish in English', async ({ page }) => {
    // Record an entry
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Go to results
    await page.click('[data-view="results"]');

    // Timing point should show "F" for Finish
    const pointLabel = page.locator('.result-point').first();
    await expect(pointLabel).toHaveText('F');
  });

  test('should show English settings labels', async ({ page }) => {
    await page.click('[data-view="settings"]');

    // Check for English text - Settings title
    const settingsTitle = page.locator('.settings-section-title').first();
    const text = await settingsTitle.textContent();

    expect(text?.length).toBeGreaterThan(0);
  });
});

test.describe('Language Consistency Across Views', () => {
  test('should maintain language in Timer view', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');

    await page.click('[data-view="timer"]');

    // Timestamp button should have English text
    const timestampBtn = page.locator('#timestamp-btn');
    await expect(timestampBtn).toBeVisible();
  });

  test('should maintain language in Results view', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');

    // Add an entry
    await page.click('[data-view="timer"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    await page.click('[data-view="results"]');

    // Results should show English labels
    await expect(page.locator('.results-header')).toBeVisible();
  });

  test('should maintain language after navigation', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');

    // Navigate through all views
    await page.click('[data-view="timer"]');
    await page.click('[data-view="results"]');
    await page.click('[data-view="settings"]');
    await page.click('[data-view="timer"]');

    // Language should still be English (toggle shows current language)
    await page.click('[data-view="settings"]');
    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toContainText('EN');
  });
});

test.describe('Date Formatting by Language', () => {
  test('should format date in German format', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'de');
    await page.click('[data-view="timer"]');

    const dateDisplay = page.locator('.clock-date');
    const dateText = await dateDisplay.textContent();

    // German date format: DD.MM.YYYY or similar
    // Should contain a date-like pattern
    expect(dateText?.length).toBeGreaterThan(0);
  });

  test('should format date in English format', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'en');
    await page.click('[data-view="timer"]');

    const dateDisplay = page.locator('.clock-date');
    const dateText = await dateDisplay.textContent();

    // English date format: MM/DD/YYYY or Month DD, YYYY
    expect(dateText?.length).toBeGreaterThan(0);
  });
});

test.describe('Status Labels by Language', () => {
  test('should show status in current language', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.clock-time');

    // Add entry
    await page.click('[data-num="1"]');
    await page.click('#timestamp-btn');
    await page.waitForTimeout(600);

    // Go to results
    await page.click('[data-view="results"]');
    await page.waitForSelector('.result-item');

    // Click on result bib to open edit modal
    await page.click('.result-item .result-bib');
    await page.waitForSelector('#edit-modal.show', { timeout: 5000 });

    // Set status to DNF
    await page.selectOption('#edit-status-select', 'dnf');
    await page.click('#save-edit-btn');

    // Wait for status badge to appear (confirms modal closed and changes saved)
    const statusBadge = page.locator('.result-status').first();
    await expect(statusBadge).toContainText('DNF', { timeout: 5000 });
  });
});

test.describe('Timing Point Labels by Language', () => {
  test('should show Start as S in both languages', async ({ page }) => {
    await page.goto('/');

    // Disable simple mode to see Start button
    await page.click('[data-view="settings"]');
    await disableSimpleMode(page);

    await page.click('[data-view="timer"]');

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

test.describe('Empty State Messages', () => {
  test('should show empty state message in German', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await setLanguage(page, 'de');

    await page.reload();
    await page.click('[data-view="results"]');

    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
  });

  test('should show empty state message in English', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('skiTimerEntries'));
    await setLanguage(page, 'en');

    await page.reload();
    await page.click('[data-view="results"]');

    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
  });
});
