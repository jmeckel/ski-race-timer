/**
 * Unit Tests for Version Module
 * Tests: getVersionInfo() with valid/invalid versions and language fallback
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the store module before importing version
vi.mock('../../src/store', () => ({
  store: {
    getState: vi.fn(() => ({ currentLang: 'en' })),
  },
}));

import { store } from '../../src/store';
import { getVersionInfo } from '../../src/version';

describe('getVersionInfo', () => {
  beforeEach(() => {
    vi.mocked(store.getState).mockReturnValue({
      currentLang: 'en',
    } as ReturnType<typeof store.getState>);
  });

  describe('valid versions', () => {
    it('should return info for a known minor version (5.18)', () => {
      const info = getVersionInfo('5.18.0');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Powder Streif');
      expect(typeof info!.description).toBe('string');
    });

    it('should return info for 5.19', () => {
      const info = getVersionInfo('5.19.0');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Firn Lauberhorn');
    });

    it('should return info for 5.20', () => {
      const info = getVersionInfo('5.20.0');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Corn Saslong');
    });

    it('should return info for 5.21', () => {
      const info = getVersionInfo('5.21.0');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Sleet Kandahar');
    });

    it('should match patch versions to their minor (5.20.3)', () => {
      const info = getVersionInfo('5.20.3');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Corn Saslong');
    });

    it('should work with two-part version strings', () => {
      const info = getVersionInfo('5.20');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Corn Saslong');
    });
  });

  describe('invalid/unknown versions', () => {
    it('should return null for unknown version', () => {
      expect(getVersionInfo('9.99.0')).toBeNull();
    });

    it('should return null for version with only one part', () => {
      expect(getVersionInfo('5')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(getVersionInfo('')).toBeNull();
    });

    it('should return null for non-existent minor version', () => {
      expect(getVersionInfo('5.0.0')).toBeNull();
    });
  });

  describe('language support', () => {
    it('should return English description when lang is en', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
      } as ReturnType<typeof store.getState>);
      const info = getVersionInfo('5.20.0');
      expect(info!.description).toContain('Offline banner');
    });

    it('should return German description when lang is de', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'de',
      } as ReturnType<typeof store.getState>);
      const info = getVersionInfo('5.20.0');
      expect(info!.description).toContain('Offline-Banner');
    });

    it('should fall back to English for unknown language', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'fr' as 'en',
      } as ReturnType<typeof store.getState>);
      const info = getVersionInfo('5.20.0');
      // Falls back to English
      expect(info!.description).toContain('Offline banner');
    });
  });
});
