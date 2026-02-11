/**
 * Unit Tests for Display Settings Module
 * Tests: updateDisplaySettingsInputs, updateLangToggle, cleanupDisplaySettings
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../../src/services', () => ({
  voiceModeService: {
    isSupported: vi.fn(() => false),
    isActive: vi.fn(() => false),
    enable: vi.fn(() => true),
    disable: vi.fn(),
  },
}));

const mockGetState = vi.fn();

vi.mock('../../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    updateSettings: vi.fn(),
    setLanguage: vi.fn(),
  },
}));

vi.mock('../../../../src/utils', () => ({
  getElement: vi.fn(
    (id: string) => document.getElementById(id) as HTMLElement | null,
  ),
}));

vi.mock('../../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

import {
  cleanupDisplaySettings,
  initDisplaySettings,
  updateDisplaySettingsInputs,
  updateLangToggle,
} from '../../../../src/features/settings/displaySettings';

describe('Display Settings Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      settings: {
        simple: false,
        ambientMode: true,
      },
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('initDisplaySettings', () => {
    it('should not throw when elements missing', () => {
      expect(() => initDisplaySettings(() => {})).not.toThrow();
    });

    it('should not throw when simple mode toggle exists', () => {
      const toggle = document.createElement('input');
      toggle.id = 'simple-mode-toggle';
      toggle.type = 'checkbox';
      container.appendChild(toggle);

      expect(() => initDisplaySettings(() => {})).not.toThrow();
    });

    it('should not throw when ambient mode toggle exists', () => {
      const toggle = document.createElement('input');
      toggle.id = 'ambient-mode-toggle';
      toggle.type = 'checkbox';
      container.appendChild(toggle);

      expect(() => initDisplaySettings(() => {})).not.toThrow();
    });

    it('should handle lang toggle with options', () => {
      const langToggle = document.createElement('div');
      langToggle.id = 'lang-toggle';
      const deOpt = document.createElement('span');
      deOpt.className = 'lang-option';
      deOpt.setAttribute('data-lang', 'de');
      langToggle.appendChild(deOpt);
      const enOpt = document.createElement('span');
      enOpt.className = 'lang-option';
      enOpt.setAttribute('data-lang', 'en');
      langToggle.appendChild(enOpt);
      container.appendChild(langToggle);

      expect(() => initDisplaySettings(() => {})).not.toThrow();
    });
  });

  describe('updateDisplaySettingsInputs', () => {
    it('should set simple mode toggle checked state', () => {
      const toggle = document.createElement('input');
      toggle.id = 'simple-mode-toggle';
      toggle.type = 'checkbox';
      container.appendChild(toggle);

      updateDisplaySettingsInputs();

      expect(toggle.checked).toBe(false);
    });

    it('should set ambient mode toggle checked state', () => {
      const toggle = document.createElement('input');
      toggle.id = 'ambient-mode-toggle';
      toggle.type = 'checkbox';
      container.appendChild(toggle);

      updateDisplaySettingsInputs();

      expect(toggle.checked).toBe(true);
    });

    it('should show admin section', () => {
      const adminSection = document.createElement('div');
      adminSection.id = 'admin-section';
      adminSection.style.display = 'none';
      container.appendChild(adminSection);

      updateDisplaySettingsInputs();

      expect(adminSection.style.display).toBe('block');
    });

    it('should handle missing elements', () => {
      expect(() => updateDisplaySettingsInputs()).not.toThrow();
    });
  });

  describe('updateLangToggle', () => {
    it('should set active class on current language option', () => {
      const langToggle = document.createElement('div');
      langToggle.id = 'lang-toggle';

      const deOpt = document.createElement('span');
      deOpt.className = 'lang-option';
      deOpt.setAttribute('data-lang', 'de');
      langToggle.appendChild(deOpt);

      const enOpt = document.createElement('span');
      enOpt.className = 'lang-option';
      enOpt.setAttribute('data-lang', 'en');
      langToggle.appendChild(enOpt);

      container.appendChild(langToggle);

      updateLangToggle();

      expect(enOpt.classList.contains('active')).toBe(true);
      expect(deOpt.classList.contains('active')).toBe(false);
      expect(enOpt.getAttribute('aria-checked')).toBe('true');
      expect(deOpt.getAttribute('aria-checked')).toBe('false');
    });

    it('should handle missing lang toggle', () => {
      expect(() => updateLangToggle()).not.toThrow();
    });
  });

  describe('cleanupDisplaySettings', () => {
    it('should not throw', () => {
      expect(() => cleanupDisplaySettings()).not.toThrow();
    });
  });
});
