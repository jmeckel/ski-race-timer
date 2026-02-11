/**
 * Settings View Orchestrator
 * Delegates to sub-modules: syncSettings, displaySettings, deviceSettings
 * Keeps applySettings, updateTranslations, updateSettingsInputs, and simple toggles
 */

import { t } from '../i18n/translations';
import { store } from '../store';
import type { Language } from '../types';
import { getElement } from '../utils';
import { ListenerManager } from '../utils/listenerManager';
import { getVersionInfo } from '../version';
import {
  cleanupDeviceSettings,
  initDeviceSettings,
  updateDeviceSettingsInputs,
} from './settings/deviceSettings';
// Sub-modules
import {
  cleanupDisplaySettings,
  initDisplaySettings,
  updateDisplaySettingsInputs,
  updateLangToggle,
} from './settings/displaySettings';
import {
  cleanupSyncSettings,
  getLastRaceExistsState,
  initSyncSettings,
  updateRaceExistsIndicator,
  updateSyncSettingsInputs,
} from './settings/syncSettings';

export { updateRoleToggle } from './settings/deviceSettings';
export { updateLangToggle } from './settings/displaySettings';
// Re-export everything that consumers import from this module
export {
  resolvePhotoSyncWarning,
  resolveRaceChangeDialog,
} from './settings/syncSettings';

// Module state for remaining simple toggles
const listeners = new ListenerManager();

/**
 * Initialize settings view
 */
export function initSettingsView(): void {
  // Initialize sub-modules
  initDisplaySettings(applySettings);
  initSyncSettings();
  initDeviceSettings();

  // Listen for language change from display settings
  listeners.add(window, 'settings-language-changed', () => {
    updateTranslations();
    updateLangToggle();
  });

  // GPS toggle
  const gpsToggle = getElement<HTMLInputElement>('gps-toggle');
  if (gpsToggle) {
    listeners.add(gpsToggle, 'change', () => {
      store.updateSettings({ gps: gpsToggle.checked });
    });
  }

  // Auto-increment toggle
  const autoToggle = getElement<HTMLInputElement>('auto-toggle');
  if (autoToggle) {
    listeners.add(autoToggle, 'change', () => {
      store.updateSettings({ auto: autoToggle.checked });
    });
  }

  // Haptic toggle
  const hapticToggle = getElement<HTMLInputElement>('haptic-toggle');
  if (hapticToggle) {
    listeners.add(hapticToggle, 'change', () => {
      store.updateSettings({ haptic: hapticToggle.checked });
    });
  }

  // Sound toggle
  const soundToggle = getElement<HTMLInputElement>('sound-toggle');
  if (soundToggle) {
    listeners.add(soundToggle, 'change', () => {
      store.updateSettings({ sound: soundToggle.checked });
    });
  }

  // Photo capture toggle
  const photoToggle = getElement<HTMLInputElement>('photo-toggle');
  if (photoToggle) {
    listeners.add(photoToggle, 'change', () => {
      store.updateSettings({ photoCapture: photoToggle.checked });
    });
  }
}

/**
 * Update settings inputs
 */
export function updateSettingsInputs(): void {
  const state = store.getState();
  const { settings } = state;

  // Delegate to sub-modules
  updateDisplaySettingsInputs();
  updateSyncSettingsInputs();
  updateDeviceSettingsInputs();

  // Update remaining simple toggles
  const gpsToggle = getElement<HTMLInputElement>('gps-toggle');
  const autoToggle = getElement<HTMLInputElement>('auto-toggle');
  const hapticToggle = getElement<HTMLInputElement>('haptic-toggle');
  const soundToggle = getElement<HTMLInputElement>('sound-toggle');
  const photoToggle = getElement<HTMLInputElement>('photo-toggle');

  if (gpsToggle) gpsToggle.checked = settings.gps;
  if (autoToggle) autoToggle.checked = settings.auto;
  if (hapticToggle) hapticToggle.checked = settings.haptic;
  if (soundToggle) soundToggle.checked = settings.sound;
  if (photoToggle) photoToggle.checked = settings.photoCapture;
}

/**
 * Update translations
 */
export function updateTranslations(): void {
  const lang = store.getState().currentLang as Language;
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key, lang);
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      (el as HTMLInputElement).placeholder = t(key, lang);
    }
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) {
      el.setAttribute('aria-label', t(key, lang));
    }
  });

  // Update dynamically set text that depends on language
  const raceExistsState = getLastRaceExistsState();
  updateRaceExistsIndicator(raceExistsState.exists, raceExistsState.entryCount);

  // Update version description for new language
  const versionDescEl = document.getElementById('app-version-description');
  if (versionDescEl) {
    const vInfo = getVersionInfo(__APP_VERSION__);
    versionDescEl.textContent = vInfo?.description ?? '';
  }
}

/**
 * Apply settings (show/hide UI based on simple mode)
 */
export function applySettings(): void {
  // Simple mode deprecated: always show advanced UI and timing points.
  const advancedElements = document.querySelectorAll('[data-advanced]');
  advancedElements.forEach((el) => {
    (el as HTMLElement).style.display = '';
  });

  const startBtn = document.querySelector('[data-point="S"]') as HTMLElement;
  if (startBtn) {
    startBtn.style.display = '';
  }

  // Apply Liquid Glass UI settings
  applyGlassEffectSettings();
}

/**
 * Apply glass and motion effect settings to the UI
 */
export function applyGlassEffectSettings(): void {
  const settings = store.getState().settings;
  const root = document.documentElement;

  // Glass effects toggle
  if (settings.glassEffects) {
    root.classList.remove('no-glass-effects');
    // Add glass-enabled class to key elements for motion-reactive styles
    document.querySelectorAll('.glass-enable-target').forEach((el) => {
      el.classList.add('glass-enabled');
    });
  } else {
    root.classList.add('no-glass-effects');
    document.querySelectorAll('.glass-enabled').forEach((el) => {
      el.classList.remove('glass-enabled');
    });
  }

  // DISABLED: Motion effects disabled to save battery
  root.classList.add('no-motion-effects');

  // Outdoor mode toggle (high contrast)
  if (settings.outdoorMode) {
    root.classList.add('outdoor-mode');
  } else {
    root.classList.remove('outdoor-mode');
  }
}

/**
 * Cleanup settings timeouts (for page unload)
 */
export function cleanupSettingsTimeouts(): void {
  cleanupSyncSettings();
  cleanupDisplaySettings();
  cleanupDeviceSettings();
  listeners.removeAll();
}
