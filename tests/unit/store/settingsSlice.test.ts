/**
 * Unit Tests for Settings Slice
 * Tests: DEFAULT_SETTINGS, updateSettings, toggleSetting
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  type BooleanSettingKey,
  toggleSetting,
  updateSettings,
} from '../../../src/store/slices/settingsSlice';
import type { Settings } from '../../../src/types';

/** All boolean setting keys for exhaustive testing */
const ALL_BOOLEAN_KEYS: BooleanSettingKey[] = [
  'auto',
  'haptic',
  'sound',
  'sync',
  'syncPhotos',
  'gps',
  'simple',
  'photoCapture',
  'motionEffects',
  'glassEffects',
  'outdoorMode',
  'ambientMode',
];

describe('DEFAULT_SETTINGS', () => {
  it('has correct default values for all keys', () => {
    expect(DEFAULT_SETTINGS).toEqual({
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
    });
  });

  it('contains exactly the expected keys', () => {
    const keys = Object.keys(DEFAULT_SETTINGS).sort();
    expect(keys).toEqual([...ALL_BOOLEAN_KEYS].sort());
  });

  it('has all values as booleans', () => {
    for (const key of ALL_BOOLEAN_KEYS) {
      expect(typeof DEFAULT_SETTINGS[key]).toBe('boolean');
    }
  });
});

describe('updateSettings', () => {
  it('applies a partial update', () => {
    const result = updateSettings(DEFAULT_SETTINGS, { sound: true });
    expect(result.sound).toBe(true);
    // other values remain unchanged
    expect(result.auto).toBe(DEFAULT_SETTINGS.auto);
    expect(result.haptic).toBe(DEFAULT_SETTINGS.haptic);
    expect(result.gps).toBe(DEFAULT_SETTINGS.gps);
  });

  it('applies multiple updates at once', () => {
    const result = updateSettings(DEFAULT_SETTINGS, {
      sound: true,
      sync: true,
      simple: true,
    });
    expect(result.sound).toBe(true);
    expect(result.sync).toBe(true);
    expect(result.simple).toBe(true);
    // unchanged keys
    expect(result.auto).toBe(DEFAULT_SETTINGS.auto);
    expect(result.haptic).toBe(DEFAULT_SETTINGS.haptic);
  });

  it('returns identical values when updates is empty', () => {
    const result = updateSettings(DEFAULT_SETTINGS, {});
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('does not mutate the original settings object', () => {
    const original: Settings = { ...DEFAULT_SETTINGS };
    const originalSnapshot = { ...original };
    updateSettings(original, { sound: true, sync: true });
    expect(original).toEqual(originalSnapshot);
  });

  it('returns a new object reference', () => {
    const result = updateSettings(DEFAULT_SETTINGS, {});
    expect(result).not.toBe(DEFAULT_SETTINGS);
  });

  it('overrides a value that was already true to false', () => {
    const result = updateSettings(DEFAULT_SETTINGS, { auto: false });
    expect(result.auto).toBe(false);
  });

  it('setting a value to the same value it already has', () => {
    const result = updateSettings(DEFAULT_SETTINGS, { auto: true });
    expect(result.auto).toBe(true);
    expect(result).toEqual(DEFAULT_SETTINGS);
  });
});

describe('toggleSetting', () => {
  it('toggles each boolean key from its default', () => {
    for (const key of ALL_BOOLEAN_KEYS) {
      const result = toggleSetting(DEFAULT_SETTINGS, key);
      expect(result[key]).toBe(!DEFAULT_SETTINGS[key]);
    }
  });

  it('double toggle returns to original value', () => {
    for (const key of ALL_BOOLEAN_KEYS) {
      const toggled = toggleSetting(DEFAULT_SETTINGS, key);
      const restored = toggleSetting(toggled, key);
      expect(restored[key]).toBe(DEFAULT_SETTINGS[key]);
    }
  });

  it('does not mutate the original settings object', () => {
    const original: Settings = { ...DEFAULT_SETTINGS };
    const originalSnapshot = { ...original };
    toggleSetting(original, 'sound');
    expect(original).toEqual(originalSnapshot);
  });

  it('returns a new object reference', () => {
    const result = toggleSetting(DEFAULT_SETTINGS, 'auto');
    expect(result).not.toBe(DEFAULT_SETTINGS);
  });

  it('only changes the targeted key', () => {
    const result = toggleSetting(DEFAULT_SETTINGS, 'sync');
    for (const key of ALL_BOOLEAN_KEYS) {
      if (key === 'sync') {
        expect(result[key]).toBe(!DEFAULT_SETTINGS[key]);
      } else {
        expect(result[key]).toBe(DEFAULT_SETTINGS[key]);
      }
    }
  });

  it('toggles a false value to true', () => {
    const result = toggleSetting(DEFAULT_SETTINGS, 'sound');
    expect(result.sound).toBe(true);
  });

  it('toggles a true value to false', () => {
    const result = toggleSetting(DEFAULT_SETTINGS, 'auto');
    expect(result.auto).toBe(false);
  });
});
