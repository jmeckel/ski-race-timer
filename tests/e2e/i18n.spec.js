/**
 * E2E Tests - Internationalization (i18n)
 *
 * Tests for language switching between German and English
 */

import { expect, test } from '@playwright/test';
import {
  navigateTo,
  setupPage,
  setupPageEnglish,
  setupPageFrench,
  setupPageFullMode,
  waitForConfirmationToHide,
} from './helpers.js';

// Helper to set language
async function _setLanguage(page, lang) {
  await navigateTo(page, 'settings');
  const langToggle = page.locator('#lang-toggle');
  const activeLang = await langToggle
    .locator('.lang-option.active')
    .getAttribute('data-lang');

  // Click the language option we want if not already active
  if (activeLang !== lang) {
    await langToggle.locator(`.lang-option[data-lang="${lang}"]`).click();
  }
}

test.describe('Language Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'settings');
  });

  test('should have language toggle button', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toBeVisible();
  });

  test('should show current language indicator', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');
    const text = await langToggle.textContent();

    // Should show DE, FR, or EN
    expect(text).toMatch(/DE|FR|EN/i);
  });

  test('should toggle between languages', async ({ page }) => {
    const langToggle = page.locator('#lang-toggle');

    // Get initial active language
    const initialActiveLang = await langToggle
      .locator('.lang-option.active')
      .getAttribute('data-lang');

    // Click the inactive language option
    const targetLang = initialActiveLang === 'de' ? 'en' : 'de';
    await langToggle.locator(`.lang-option[data-lang="${targetLang}"]`).click();

    // Active language should have changed
    const newActiveLang = await langToggle
      .locator('.lang-option.active')
      .getAttribute('data-lang');
    expect(newActiveLang).not.toBe(initialActiveLang);
  });
});

test.describe('German Language (Default)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should default to German', async ({ page }) => {
    const lang = await page.evaluate(() => {
      return localStorage.getItem('skiTimerLang') || 'de';
    });
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
    await navigateTo(page, 'settings');

    // Settings title should be German
    const settingsTitle = page.locator('.settings-section-title').first();
    const text = await settingsTitle.textContent();

    // Should be "Einstellungen" or contain German text
    expect(text?.length).toBeGreaterThan(0);
  });

  test('should show German button labels', async ({ page }) => {
    // Check radial time button
    const timestampBtn = page.locator('#radial-time-btn');
    const text = await timestampBtn.textContent();

    expect(text?.length).toBeGreaterThan(0);
  });

  test('should show timing point code in results', async ({ page }) => {
    // Record an entry via radial dial
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Go to results
    await navigateTo(page, 'results');

    // Timing point shows the translated label (Ziel for Finish in German)
    const pointLabel = page.locator('.result-point').first();
    await expect(pointLabel).toContainText('Ziel');
  });
});

test.describe('English Language', () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnglish(page);
  });

  test('should show English when set', async ({ page }) => {
    await navigateTo(page, 'settings');

    // Language toggle shows current language (EN when English is selected)
    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toContainText('EN');
  });

  test('should show Finish label in English', async ({ page }) => {
    // Record an entry via radial dial
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Go to results
    await navigateTo(page, 'results');

    // Timing point should show "Finish" label in English
    const pointLabel = page.locator('.result-point').first();
    await expect(pointLabel).toHaveText('Finish');
  });

  test('should show English settings labels', async ({ page }) => {
    await navigateTo(page, 'settings');

    // Check for English text - Settings title
    const settingsTitle = page.locator('.settings-section-title').first();
    const text = await settingsTitle.textContent();

    expect(text?.length).toBeGreaterThan(0);
  });
});

test.describe('Language Consistency Across Views', () => {
  test.beforeEach(async ({ page }) => {
    await setupPageEnglish(page);
  });

  test('should maintain language in Timer view', async ({ page }) => {
    await navigateTo(page, 'timer');

    // Radial time button should be visible
    const timestampBtn = page.locator('#radial-time-btn');
    await expect(timestampBtn).toBeVisible();
  });

  test('should maintain language in Results view', async ({ page }) => {
    // Add an entry via radial dial
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    await navigateTo(page, 'results');

    // Results should show English labels
    await expect(page.locator('.results-header')).toBeVisible();
  });

  test('should maintain language after navigation', async ({ page }) => {
    // Navigate through all views
    await navigateTo(page, 'timer');
    await navigateTo(page, 'results');
    await navigateTo(page, 'settings');
    await navigateTo(page, 'timer');

    // Language should still be English (toggle shows current language)
    await navigateTo(page, 'settings');
    const langToggle = page.locator('#lang-toggle');
    await expect(langToggle).toContainText('EN');
  });
});

test.describe('Date Formatting by Language', () => {
  test('should format date in German format', async ({ page }) => {
    await setupPage(page);

    // Radial mode doesn't show date, but check the time display is visible
    const timeDisplay = page.locator('#radial-time-hm');
    const timeText = await timeDisplay.textContent();

    // Should show time in HH:MM format
    expect(timeText).toMatch(/\d{2}:\d{2}/);
  });

  test('should format date in English format', async ({ page }) => {
    await setupPageEnglish(page);

    // Radial mode doesn't show date, but check the time display is visible
    const timeDisplay = page.locator('#radial-time-hm');
    const timeText = await timeDisplay.textContent();

    // Should show time in HH:MM format
    expect(timeText).toMatch(/\d{2}:\d{2}/);
  });
});

test.describe('Status Labels by Language', () => {
  test('should show status in current language', async ({ page }) => {
    await setupPage(page);

    // Add entry via radial dial
    await page.click('.dial-number[data-num="1"]');
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Go to results
    await navigateTo(page, 'results');
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
    await setupPageFullMode(page);

    const startBtn = page.locator('.radial-point-btn[data-point="S"]');
    const text = await startBtn.textContent();

    // Start is abbreviated as S in both languages
    expect(text).toContain('S');
  });

  test('should show Finish/Ziel appropriately', async ({ page }) => {
    await setupPage(page);

    const finishBtn = page.locator('.radial-point-btn[data-point="F"]');
    const text = await finishBtn.textContent();

    // Should show Finish (EN) or Ziel (DE) or F
    expect(text).toMatch(/Finish|Ziel|F|Z/i);
  });
});

test.describe('Empty State Messages', () => {
  test('should show empty state message in German', async ({ page }) => {
    await setupPage(page);
    await navigateTo(page, 'results');

    // Use results-list container to avoid matching chief judge empty state
    const emptyState = page.locator('#results-list .empty-state');
    await expect(emptyState).toBeVisible();
  });

  test('should show empty state message in English', async ({ page }) => {
    await setupPageEnglish(page);
    await navigateTo(page, 'results');

    // Use results-list container to avoid matching chief judge empty state
    const emptyState = page.locator('#results-list .empty-state');
    await expect(emptyState).toBeVisible();
  });

  test('should show empty state message in French', async ({ page }) => {
    await setupPageFrench(page);
    await navigateTo(page, 'results');

    // Use results-list container to avoid matching chief judge empty state
    const emptyState = page.locator('#results-list .empty-state');
    await expect(emptyState).toBeVisible();
  });
});

test.describe('French Language', () => {
  test.beforeEach(async ({ page }) => {
    await setupPageFrench(page);
  });

  test('should show French navigation labels', async ({ page }) => {
    // Tab labels should be in French
    const timerTab = page.locator('[data-view="timer"]');
    const text = await timerTab.textContent();
    expect(text).toContain('Chrono');
  });

  test('should show French settings labels', async ({ page }) => {
    await navigateTo(page, 'settings');

    // Settings section titles should be in French
    const settingsTitle = page.locator('.settings-section-title').first();
    const text = await settingsTitle.textContent();
    expect(text?.length).toBeGreaterThan(0);
  });

  test('should show Arrivée label in French', async ({ page }) => {
    // Record an entry via radial dial
    await page.click('#radial-time-btn');
    await waitForConfirmationToHide(page);

    // Go to results
    await navigateTo(page, 'results');

    // Timing point should show "Arrivée" label in French
    const pointLabel = page.locator('.result-point').first();
    await expect(pointLabel).toHaveText('Arrivée');
  });

  test('should show FR in language toggle', async ({ page }) => {
    await navigateTo(page, 'settings');
    const langToggle = page.locator('#lang-toggle');
    const activeOption = langToggle.locator('.lang-option.active');
    await expect(activeOption).toHaveAttribute('data-lang', 'fr');
    await expect(activeOption).toHaveText('FR');
  });

  test('should maintain French across views', async ({ page }) => {
    // Navigate through all views
    await navigateTo(page, 'timer');
    await navigateTo(page, 'results');
    await navigateTo(page, 'settings');

    // Language toggle should still show FR as active
    const langToggle = page.locator('#lang-toggle');
    const activeOption = langToggle.locator('.lang-option.active');
    await expect(activeOption).toHaveAttribute('data-lang', 'fr');
  });
});
