/**
 * Settings Slice
 * Handles user settings and preferences
 */

import type { Settings } from '../../types';

// Boolean setting keys
export type BooleanSettingKey =
  | 'auto'
  | 'haptic'
  | 'sound'
  | 'sync'
  | 'syncPhotos'
  | 'gps'
  | 'simple'
  | 'photoCapture'
  | 'motionEffects'
  | 'glassEffects'
  | 'outdoorMode'
  | 'ambientMode';

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: Settings = {
  auto: true,
  haptic: true,
  sound: false,
  sync: false,
  syncPhotos: false,
  gps: true,
  simple: false,
  photoCapture: false,
  motionEffects: true,
  glassEffects: true,
  outdoorMode: false,
  ambientMode: true,
};

/**
 * Update settings with partial updates
 */
export function updateSettings(
  currentSettings: Settings,
  updates: Partial<Settings>,
): Settings {
  return { ...currentSettings, ...updates };
}

/**
 * Toggle a boolean setting
 */
export function toggleSetting(
  currentSettings: Settings,
  key: BooleanSettingKey,
): Settings {
  return {
    ...currentSettings,
    [key]: !currentSettings[key],
  };
}
