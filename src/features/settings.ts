/**
 * Settings Feature Module
 * Handles settings state management and UI updates
 */

import { t } from '../i18n/translations';
import type { AppState, Language, Settings } from '../types';

// Dependencies interface
export interface SettingsDependencies {
  getState: () => AppState;
  updateSettings: (settings: Partial<Settings>) => void;
  setLanguage: (lang: Language) => void;
}

let deps: SettingsDependencies | null = null;

/**
 * Initialize the Settings module with dependencies
 */
export function initSettings(dependencies: SettingsDependencies): void {
  deps = dependencies;
}

/**
 * Get toggle element by ID and verify it's an input
 */
export function getToggleElement(id: string): HTMLInputElement | null {
  const element = document.getElementById(id);
  if (element && element instanceof HTMLInputElement) {
    return element;
  }
  return null;
}

/**
 * Update all settings inputs to match current state
 */
export function updateSettingsInputs(): void {
  if (!deps) return;

  const state = deps.getState();
  const settings = state.settings;

  // Simple mode
  const simpleModeToggle = getToggleElement('simple-mode-toggle');
  if (simpleModeToggle) {
    simpleModeToggle.checked = settings.simple;
  }

  // GPS
  const gpsToggle = getToggleElement('gps-toggle');
  if (gpsToggle) {
    gpsToggle.checked = settings.gps;
  }

  // Sync
  const syncToggle = getToggleElement('sync-toggle');
  if (syncToggle) {
    syncToggle.checked = settings.sync;
  }

  // Sync photos
  const syncPhotosToggle = getToggleElement('sync-photos-toggle');
  if (syncPhotosToggle) {
    syncPhotosToggle.checked = settings.syncPhotos;
    syncPhotosToggle.disabled = !settings.sync;
  }

  // Auto increment
  const autoToggle = getToggleElement('auto-toggle');
  if (autoToggle) {
    autoToggle.checked = settings.auto;
  }

  // Haptic
  const hapticToggle = getToggleElement('haptic-toggle');
  if (hapticToggle) {
    hapticToggle.checked = settings.haptic;
  }

  // Sound
  const soundToggle = getToggleElement('sound-toggle');
  if (soundToggle) {
    soundToggle.checked = settings.sound;
  }

  // Photo capture
  const photoToggle = getToggleElement('photo-toggle');
  if (photoToggle) {
    photoToggle.checked = settings.photoCapture;
  }

  // Race ID
  const raceIdInput = document.getElementById(
    'race-id-input',
  ) as HTMLInputElement;
  if (raceIdInput && state.raceId) {
    raceIdInput.value = state.raceId;
  }

  // Device name
  const deviceNameInput = document.getElementById(
    'device-name-input',
  ) as HTMLInputElement;
  if (deviceNameInput && state.deviceName) {
    deviceNameInput.value = state.deviceName;
  }
}

/**
 * Update language toggle UI to match current state
 */
export function updateLangToggle(): void {
  if (!deps) return;

  const langToggle = document.getElementById('lang-toggle');
  if (!langToggle) return;

  const lang = deps.getState().currentLang;
  const buttons = langToggle.querySelectorAll('[data-lang]');

  buttons.forEach((btn) => {
    const btnLang = btn.getAttribute('data-lang');
    btn.classList.toggle('active', btnLang === lang);
  });
}

/**
 * Apply visual settings (simple mode, glass effects, etc.)
 */
export function applyVisualSettings(): void {
  if (!deps) return;

  const state = deps.getState();
  const { simple } = state.settings;

  // Simple mode - hide/show number pad
  const numberPad = document.getElementById('number-pad');
  if (numberPad) {
    numberPad.style.display = simple ? 'none' : '';
  }

  // Simple mode - adjust bib input
  const bibInput = document.getElementById('bib-input');
  if (bibInput) {
    if (simple) {
      bibInput.removeAttribute('readonly');
      bibInput.setAttribute('inputmode', 'numeric');
    } else {
      bibInput.setAttribute('readonly', 'readonly');
      bibInput.removeAttribute('inputmode');
    }
  }
}

/**
 * Apply glass effect settings
 */
export function applyGlassEffectSettings(): void {
  if (!deps) return;

  const state = deps.getState();
  const glassEnabled = state.settings.glassEffects !== false;

  // Apply/remove glass class on body
  document.body.classList.toggle('glass-enabled', glassEnabled);

  // Update glass elements
  const glassElements = document.querySelectorAll('.glass-panel, .glass-card');
  glassElements.forEach((el) => {
    el.classList.toggle('glass-disabled', !glassEnabled);
  });
}

/**
 * Get settings summary for display
 */
export function getSettingsSummary(lang: Language): string {
  if (!deps) return '';

  const settings = deps.getState().settings;
  const active: string[] = [];

  if (settings.gps) active.push(t('gpsEnabled', lang));
  if (settings.sync) active.push(t('syncEnabled', lang));
  if (settings.auto) active.push(t('autoIncrement', lang));
  if (settings.haptic) active.push(t('hapticFeedback', lang));
  if (settings.sound) active.push(t('soundFeedback', lang));
  if (settings.photoCapture) active.push(t('photoCapture', lang));

  return active.join(', ') || t('noActiveSettings', lang);
}

/**
 * Validate device name
 */
export function isValidDeviceName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 50;
}

/**
 * Sanitize device name for storage
 */
export function sanitizeDeviceName(name: string): string {
  return name.trim().slice(0, 50);
}

/**
 * Check if sync can be enabled (requires race ID)
 */
export function canEnableSync(): boolean {
  if (!deps) return false;
  const state = deps.getState();
  return !!state.raceId && state.raceId.trim().length > 0;
}

/**
 * Get current settings state
 */
export function getCurrentSettings(): Settings | null {
  if (!deps) return null;
  return { ...deps.getState().settings };
}
