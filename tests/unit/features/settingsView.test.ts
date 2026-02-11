/**
 * Unit Tests for Settings View Module
 * Tests: updateSettingsInputs, updateTranslations, applySettings,
 *        applyGlassEffectSettings, cleanupSettingsTimeouts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Define global that Vite normally provides
(globalThis as any).__APP_VERSION__ = '5.21.0';

// Mock sub-modules
vi.mock('../../../src/features/settings/displaySettings', () => ({
  cleanupDisplaySettings: vi.fn(),
  initDisplaySettings: vi.fn(),
  updateDisplaySettingsInputs: vi.fn(),
  updateLangToggle: vi.fn(),
}));

vi.mock('../../../src/features/settings/syncSettings', () => ({
  cleanupSyncSettings: vi.fn(),
  getLastRaceExistsState: vi.fn(() => ({ exists: false, entryCount: 0 })),
  initSyncSettings: vi.fn(),
  resolvePhotoSyncWarning: vi.fn(),
  resolveRaceChangeDialog: vi.fn(),
  updateRaceExistsIndicator: vi.fn(),
  updateSyncSettingsInputs: vi.fn(),
}));

vi.mock('../../../src/features/settings/deviceSettings', () => ({
  cleanupDeviceSettings: vi.fn(),
  initDeviceSettings: vi.fn(),
  updateDeviceSettingsInputs: vi.fn(),
  updateRoleToggle: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => `translated_${key}`),
}));

const mockGetState = vi.fn();
const mockUpdateSettings = vi.fn();

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
  },
}));

vi.mock('../../../src/utils', () => ({
  getElement: vi.fn(
    (id: string) => document.getElementById(id) as HTMLElement | null,
  ),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../../src/version', () => ({
  getVersionInfo: vi.fn(() => ({
    name: 'Test Falcon',
    description: 'Test description',
  })),
}));

import { updateDeviceSettingsInputs } from '../../../src/features/settings/deviceSettings';
import { updateDisplaySettingsInputs } from '../../../src/features/settings/displaySettings';
import { updateSyncSettingsInputs } from '../../../src/features/settings/syncSettings';
import {
  applyGlassEffectSettings,
  applySettings,
  cleanupSettingsTimeouts,
  updateSettingsInputs,
  updateTranslations,
} from '../../../src/features/settingsView';

describe('Settings View Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      settings: {
        sync: false,
        gps: true,
        auto: true,
        haptic: false,
        sound: true,
        photoCapture: false,
        glassEffects: true,
        outdoorMode: false,
        ambientMode: false,
      },
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('updateSettingsInputs', () => {
    it('should delegate to sub-modules', () => {
      updateSettingsInputs();

      expect(updateDisplaySettingsInputs).toHaveBeenCalled();
      expect(updateSyncSettingsInputs).toHaveBeenCalled();
      expect(updateDeviceSettingsInputs).toHaveBeenCalled();
    });

    it('should update simple toggle inputs', () => {
      const gpsToggle = document.createElement('input');
      gpsToggle.id = 'gps-toggle';
      gpsToggle.type = 'checkbox';
      container.appendChild(gpsToggle);

      const autoToggle = document.createElement('input');
      autoToggle.id = 'auto-toggle';
      autoToggle.type = 'checkbox';
      container.appendChild(autoToggle);

      const hapticToggle = document.createElement('input');
      hapticToggle.id = 'haptic-toggle';
      hapticToggle.type = 'checkbox';
      container.appendChild(hapticToggle);

      const soundToggle = document.createElement('input');
      soundToggle.id = 'sound-toggle';
      soundToggle.type = 'checkbox';
      container.appendChild(soundToggle);

      const photoToggle = document.createElement('input');
      photoToggle.id = 'photo-toggle';
      photoToggle.type = 'checkbox';
      container.appendChild(photoToggle);

      updateSettingsInputs();

      expect(gpsToggle.checked).toBe(true);
      expect(autoToggle.checked).toBe(true);
      expect(hapticToggle.checked).toBe(false);
      expect(soundToggle.checked).toBe(true);
      expect(photoToggle.checked).toBe(false);
    });

    it('should handle missing toggle elements', () => {
      expect(() => updateSettingsInputs()).not.toThrow();
    });
  });

  describe('updateTranslations', () => {
    it('should set document language', () => {
      updateTranslations();
      expect(document.documentElement.lang).toBe('en');
    });

    it('should translate data-i18n elements', () => {
      const el = document.createElement('span');
      el.setAttribute('data-i18n', 'testKey');
      container.appendChild(el);

      updateTranslations();

      expect(el.textContent).toBe('translated_testKey');
    });

    it('should translate data-i18n-placeholder elements', () => {
      const input = document.createElement('input');
      input.setAttribute('data-i18n-placeholder', 'searchPlaceholder');
      container.appendChild(input);

      updateTranslations();

      expect(input.placeholder).toBe('translated_searchPlaceholder');
    });

    it('should translate data-i18n-aria-label elements', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-i18n-aria-label', 'deleteLabel');
      container.appendChild(btn);

      updateTranslations();

      expect(btn.getAttribute('aria-label')).toBe('translated_deleteLabel');
    });

    it('should update version description', () => {
      const versionDesc = document.createElement('span');
      versionDesc.id = 'app-version-description';
      container.appendChild(versionDesc);

      updateTranslations();

      expect(versionDesc.textContent).toBe('Test description');
    });
  });

  describe('applySettings', () => {
    it('should show all advanced elements', () => {
      const advEl = document.createElement('div');
      advEl.setAttribute('data-advanced', '');
      advEl.style.display = 'none';
      container.appendChild(advEl);

      applySettings();

      expect(advEl.style.display).toBe('');
    });

    it('should show start button', () => {
      const startBtn = document.createElement('button');
      startBtn.setAttribute('data-point', 'S');
      startBtn.style.display = 'none';
      container.appendChild(startBtn);

      applySettings();

      expect(startBtn.style.display).toBe('');
    });
  });

  describe('applyGlassEffectSettings', () => {
    it('should remove no-glass-effects class when glass enabled', () => {
      document.documentElement.classList.add('no-glass-effects');

      applyGlassEffectSettings();

      expect(
        document.documentElement.classList.contains('no-glass-effects'),
      ).toBe(false);
    });

    it('should add no-glass-effects class when glass disabled', () => {
      mockGetState.mockReturnValue({
        settings: { glassEffects: false, outdoorMode: false },
      });

      applyGlassEffectSettings();

      expect(
        document.documentElement.classList.contains('no-glass-effects'),
      ).toBe(true);
    });

    it('should add glass-enabled class to targets when glass enabled', () => {
      const target = document.createElement('div');
      target.classList.add('glass-enable-target');
      container.appendChild(target);

      applyGlassEffectSettings();

      expect(target.classList.contains('glass-enabled')).toBe(true);
    });

    it('should remove glass-enabled class when glass disabled', () => {
      mockGetState.mockReturnValue({
        settings: { glassEffects: false, outdoorMode: false },
      });

      const target = document.createElement('div');
      target.classList.add('glass-enabled');
      container.appendChild(target);

      applyGlassEffectSettings();

      expect(target.classList.contains('glass-enabled')).toBe(false);
    });

    it('should add outdoor-mode class when outdoor mode enabled', () => {
      mockGetState.mockReturnValue({
        settings: { glassEffects: true, outdoorMode: true },
      });

      applyGlassEffectSettings();

      expect(document.documentElement.classList.contains('outdoor-mode')).toBe(
        true,
      );
    });

    it('should remove outdoor-mode class when outdoor mode disabled', () => {
      document.documentElement.classList.add('outdoor-mode');

      applyGlassEffectSettings();

      expect(document.documentElement.classList.contains('outdoor-mode')).toBe(
        false,
      );
    });

    it('should always add no-motion-effects class (battery saving)', () => {
      applyGlassEffectSettings();

      expect(
        document.documentElement.classList.contains('no-motion-effects'),
      ).toBe(true);
    });
  });

  describe('cleanupSettingsTimeouts', () => {
    it('should not throw', () => {
      expect(() => cleanupSettingsTimeouts()).not.toThrow();
    });
  });
});
