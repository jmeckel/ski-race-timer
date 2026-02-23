/**
 * Unit Tests for Version Module
 * Tests: getVersionInfo() with valid/invalid versions and language fallback
 */

import { describe, expect, it } from 'vitest';

import { getVersionInfo } from '../../src/version';

describe('getVersionInfo', () => {
  describe('valid versions', () => {
    it('should return info for a known minor version (5.18)', () => {
      const info = getVersionInfo('5.18.0', 'en');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Powder Streif');
      expect(typeof info!.description).toBe('string');
    });

    it('should return info for 5.19', () => {
      const info = getVersionInfo('5.19.0', 'en');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Firn Lauberhorn');
    });

    it('should return info for 5.20', () => {
      const info = getVersionInfo('5.20.0', 'en');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Corn Saslong');
    });

    it('should return info for 5.21', () => {
      const info = getVersionInfo('5.21.0', 'en');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Sleet Kandahar');
    });

    it('should match patch versions to their minor (5.20.3)', () => {
      const info = getVersionInfo('5.20.3', 'en');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Corn Saslong');
    });

    it('should work with two-part version strings', () => {
      const info = getVersionInfo('5.20', 'en');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('Corn Saslong');
    });

    it('should default to English when no lang provided', () => {
      const info = getVersionInfo('5.20.0');
      expect(info).not.toBeNull();
      expect(info!.description).toContain('Offline banner');
    });
  });

  describe('invalid/unknown versions', () => {
    it('should return null for unknown version', () => {
      expect(getVersionInfo('9.99.0', 'en')).toBeNull();
    });

    it('should return null for version with only one part', () => {
      expect(getVersionInfo('5', 'en')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(getVersionInfo('', 'en')).toBeNull();
    });

    it('should return null for non-existent minor version', () => {
      expect(getVersionInfo('5.0.0', 'en')).toBeNull();
    });
  });

  describe('language support', () => {
    it('should return English description when lang is en', () => {
      const info = getVersionInfo('5.20.0', 'en');
      expect(info!.description).toContain('Offline banner');
    });

    it('should return German description when lang is de', () => {
      const info = getVersionInfo('5.20.0', 'de');
      expect(info!.description).toContain('Offline-Banner');
    });

    it('should return French description for French language', () => {
      const info = getVersionInfo('5.20.0', 'fr');
      expect(info!.description).toContain('Bannière hors ligne');
    });
  });
});
