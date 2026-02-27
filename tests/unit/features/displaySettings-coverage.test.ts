/**
 * Extended coverage tests for Display Settings Module
 * Tests: toggle handlers, language keyboard navigation, voice mode toggle
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  voiceModeService: {
    isSupported: vi.fn(() => true),
    isActive: vi.fn(() => false),
    enable: vi.fn(() => true),
    disable: vi.fn(),
  },
}));

const mockGetState = vi.fn();

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    updateSettings: vi.fn(),
    setLanguage: vi.fn(),
  },
}));

vi.mock('../../../src/utils', () => ({
  getElement: vi.fn((id: string) => document.getElementById(id)),
}));

vi.mock('../../../src/utils/listenerManager', () => {
  // Use a real listener approach: actually add the event listeners
  return {
    ListenerManager: vi.fn().mockImplementation(() => {
      const tracked: Array<{
        el: EventTarget;
        event: string;
        handler: EventListener;
      }> = [];
      return {
        add: vi.fn((el: EventTarget, event: string, handler: EventListener) => {
          el.addEventListener(event, handler);
          tracked.push({ el, event, handler });
        }),
        removeAll: vi.fn(() => {
          tracked.forEach(({ el, event, handler }) =>
            el.removeEventListener(event, handler),
          );
          tracked.length = 0;
        }),
      };
    }),
  };
});

import { showToast } from '../../../src/components';
import {
  cleanupDisplaySettings,
  initDisplaySettings,
  updateDisplaySettingsInputs,
  updateLangToggle,
} from '../../../src/features/settings/displaySettings';
import { voiceModeService } from '../../../src/services';
import { store } from '../../../src/store';

describe('Display Settings — handler coverage', () => {
  let container: HTMLDivElement;

  function setupDOM(): void {
    // Simple mode toggle
    const simpleModeToggle = document.createElement('input');
    simpleModeToggle.type = 'checkbox';
    simpleModeToggle.id = 'simple-mode-toggle';
    container.appendChild(simpleModeToggle);

    // Admin section
    const adminSection = document.createElement('div');
    adminSection.id = 'admin-section';
    container.appendChild(adminSection);

    // Ambient mode toggle
    const ambientModeToggle = document.createElement('input');
    ambientModeToggle.type = 'checkbox';
    ambientModeToggle.id = 'ambient-mode-toggle';
    container.appendChild(ambientModeToggle);

    // Voice mode
    const voiceModeRow = document.createElement('div');
    voiceModeRow.id = 'voice-mode-row';
    container.appendChild(voiceModeRow);
    const voiceModeToggle = document.createElement('input');
    voiceModeToggle.type = 'checkbox';
    voiceModeToggle.id = 'voice-mode-toggle';
    container.appendChild(voiceModeToggle);

    // Language toggle
    const langToggle = document.createElement('div');
    langToggle.id = 'lang-toggle';
    for (const lang of ['de', 'fr', 'en']) {
      const opt = document.createElement('div');
      opt.className = 'lang-option';
      opt.setAttribute('data-lang', lang);
      opt.tabIndex = 0;
      langToggle.appendChild(opt);
    }
    container.appendChild(langToggle);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    mockGetState.mockReturnValue({
      currentLang: 'de',
      settings: { simple: false, ambientMode: false },
    });
    vi.mocked(voiceModeService.isSupported).mockReturnValue(true);
    vi.mocked(voiceModeService.isActive).mockReturnValue(false);
    vi.mocked(voiceModeService.enable).mockReturnValue(true);
  });

  afterEach(() => {
    cleanupDisplaySettings();
    container.remove();
  });

  describe('simple mode toggle', () => {
    it('should call store.updateSettings when toggled', () => {
      setupDOM();
      const applySettings = vi.fn();
      initDisplaySettings(applySettings);

      const toggle = document.getElementById(
        'simple-mode-toggle',
      ) as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(store.updateSettings).toHaveBeenCalledWith({ simple: true });
      expect(applySettings).toHaveBeenCalled();
    });
  });

  describe('ambient mode toggle', () => {
    it('should update ambient mode setting', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      const toggle = document.getElementById(
        'ambient-mode-toggle',
      ) as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(store.updateSettings).toHaveBeenCalledWith({
        ambientMode: true,
      });
    });
  });

  describe('voice mode toggle', () => {
    it('should enable voice mode on check', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      const toggle = document.getElementById(
        'voice-mode-toggle',
      ) as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(vi.mocked(voiceModeService.enable)).toHaveBeenCalled();
    });

    it('should disable voice mode on uncheck', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      const toggle = document.getElementById(
        'voice-mode-toggle',
      ) as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));

      expect(vi.mocked(voiceModeService.disable)).toHaveBeenCalled();
    });

    it('should revert toggle and show toast when offline', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      // Simulate offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      const toggle = document.getElementById(
        'voice-mode-toggle',
      ) as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(toggle.checked).toBe(false);
      expect(showToast).toHaveBeenCalledWith('voiceOffline', 'warning');

      // Restore
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });
    });

    it('should revert toggle when enable fails', () => {
      setupDOM();
      vi.mocked(voiceModeService.enable).mockReturnValue(false);
      initDisplaySettings(vi.fn());

      const toggle = document.getElementById(
        'voice-mode-toggle',
      ) as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(toggle.checked).toBe(false);
      expect(showToast).toHaveBeenCalledWith('voiceError', 'error');
    });

    it('should hide voice mode row when not supported', () => {
      setupDOM();
      vi.mocked(voiceModeService.isSupported).mockReturnValue(false);
      initDisplaySettings(vi.fn());

      const row = document.getElementById('voice-mode-row')!;
      expect(row.style.display).toBe('none');
    });
  });

  describe('language toggle', () => {
    it('should change language on click', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      const enOpt = document.querySelector('[data-lang="en"]') as HTMLElement;
      enOpt.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(store.setLanguage).toHaveBeenCalledWith('en');
    });

    it('should not change language when clicking same language', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      const deOpt = document.querySelector('[data-lang="de"]') as HTMLElement;
      deOpt.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // currentLang is 'de', clicking 'de' should be no-op
      expect(store.setLanguage).not.toHaveBeenCalled();
    });

    it('should navigate with ArrowRight and wrap around', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      const options = document.querySelectorAll('.lang-option');
      const lastOpt = options[2] as HTMLElement; // 'en'

      lastOpt.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );

      // Should wrap to first option (de) — but de is current lang, no setLanguage call
      // The focus should move to first option
      expect(document.activeElement).toBe(options[0]);
    });

    it('should navigate with ArrowLeft', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      const firstOpt = document.querySelectorAll(
        '.lang-option',
      )[0] as HTMLElement;

      firstOpt.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      );

      // Should wrap to last option (en)
      const options = document.querySelectorAll('.lang-option');
      expect(document.activeElement).toBe(options[2]);
      expect(store.setLanguage).toHaveBeenCalledWith('en');
    });

    it('should select language with Enter key', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      const enOpt = document.querySelector('[data-lang="en"]') as HTMLElement;
      enOpt.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );

      expect(store.setLanguage).toHaveBeenCalledWith('en');
    });

    it('should select language with Space key', () => {
      setupDOM();
      initDisplaySettings(vi.fn());

      const frOpt = document.querySelector('[data-lang="fr"]') as HTMLElement;
      frOpt.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
      );

      expect(store.setLanguage).toHaveBeenCalledWith('fr');
    });
  });

  describe('updateDisplaySettingsInputs', () => {
    it('should sync toggle states from store', () => {
      setupDOM();
      mockGetState.mockReturnValue({
        currentLang: 'en',
        settings: { simple: true, ambientMode: true },
      });

      updateDisplaySettingsInputs();

      expect(
        (document.getElementById('simple-mode-toggle') as HTMLInputElement)
          .checked,
      ).toBe(true);
      expect(
        (document.getElementById('ambient-mode-toggle') as HTMLInputElement)
          .checked,
      ).toBe(true);
    });
  });

  describe('updateLangToggle', () => {
    it('should set active class and aria-checked on current lang', () => {
      setupDOM();
      mockGetState.mockReturnValue({ currentLang: 'fr' });

      updateLangToggle();

      const frOpt = document.querySelector('[data-lang="fr"]')!;
      const deOpt = document.querySelector('[data-lang="de"]')!;
      expect(frOpt.classList.contains('active')).toBe(true);
      expect(frOpt.getAttribute('aria-checked')).toBe('true');
      expect(deOpt.classList.contains('active')).toBe(false);
      expect(deOpt.getAttribute('aria-checked')).toBe('false');
    });
  });
});
