/**
 * Unit Tests for ID Utilities
 * Tests: generateEntryId, generateDeviceId, parseEntryId, isNewIdFormat,
 *        migrateId, generateRaceId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateEntryId,
  generateDeviceId,
  generateDeviceName,
  parseEntryId,
  isNewIdFormat,
  migrateId,
  generateRaceId
} from '../../src/utils/id';

describe('ID Utilities', () => {
  describe('generateEntryId', () => {
    it('should generate ID in format deviceId-timestamp-random', () => {
      const deviceId = 'dev_abc123';
      const id = generateEntryId(deviceId);

      expect(id).toContain(deviceId);
      expect(id.split('-').length).toBeGreaterThanOrEqual(3);
    });

    it('should include timestamp', () => {
      const deviceId = 'dev_test';
      const before = Date.now();
      const id = generateEntryId(deviceId);
      const after = Date.now();

      const parsed = parseEntryId(id);
      expect(parsed).not.toBeNull();
      expect(parsed!.timestamp).toBeGreaterThanOrEqual(before);
      expect(parsed!.timestamp).toBeLessThanOrEqual(after);
    });

    it('should generate unique IDs', () => {
      const deviceId = 'dev_test';
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        ids.add(generateEntryId(deviceId));
      }

      expect(ids.size).toBe(100);
    });

    it('should include random component', () => {
      const deviceId = 'dev_test';
      const id = generateEntryId(deviceId);
      const parsed = parseEntryId(id);

      expect(parsed).not.toBeNull();
      expect(parsed!.random).toHaveLength(8);
    });
  });

  describe('generateDeviceId', () => {
    it('should generate ID starting with dev_', () => {
      const id = generateDeviceId();
      expect(id).toMatch(/^dev_/);
    });

    it('should generate human-readable ID in adjective-noun-number format', () => {
      const id = generateDeviceId();
      // Format: dev_{adjective}-{noun}-{number}
      expect(id).toMatch(/^dev_[a-z]+-[a-z]+-\d{1,2}$/);
    });

    it('should generate reasonably unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 50; i++) {
        ids.add(generateDeviceId());
      }

      // With 24*24*100 = 57600 combinations, 50 samples should be mostly unique
      // Allow for rare birthday-problem collisions (~2% chance of 1+ collision)
      expect(ids.size).toBeGreaterThanOrEqual(48);
    });

    it('should generate IDs of reasonable length', () => {
      const id = generateDeviceId();

      // dev_ + adjective (3-7) + - + noun (3-7) + - + number (1-2)
      // Min: dev_ice-fox-0 = 11, Max: dev_alpine-glacier-99 = 21
      expect(id.length).toBeGreaterThanOrEqual(11);
      expect(id.length).toBeLessThanOrEqual(25);
    });

    it('should be human-readable', () => {
      const id = generateDeviceId();
      const parts = id.replace('dev_', '').split('-');

      expect(parts.length).toBe(3);
      // Adjective and noun should be lowercase words
      expect(parts[0]).toMatch(/^[a-z]+$/);
      expect(parts[1]).toMatch(/^[a-z]+$/);
      // Number should be 0-99
      const num = parseInt(parts[2], 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThan(100);
    });
  });

  describe('generateDeviceName', () => {
    it('should generate human-readable name with capitalized words', () => {
      const name = generateDeviceName();
      // Format: "Adjective Noun Number"
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d{1,2}$/);
    });

    it('should generate names with spaces between words', () => {
      const name = generateDeviceName();
      const parts = name.split(' ');
      expect(parts.length).toBe(3);
    });

    it('should generate reasonably unique names', () => {
      const names = new Set<string>();
      for (let i = 0; i < 50; i++) {
        names.add(generateDeviceName());
      }
      // Allow for rare birthday-problem collisions
      expect(names.size).toBeGreaterThanOrEqual(48);
    });

    it('should have capitalized adjective and noun', () => {
      const name = generateDeviceName();
      const parts = name.split(' ');
      // First letter uppercase, rest lowercase
      expect(parts[0]).toMatch(/^[A-Z][a-z]+$/);
      expect(parts[1]).toMatch(/^[A-Z][a-z]+$/);
    });

    it('should end with a number 0-99', () => {
      const name = generateDeviceName();
      const parts = name.split(' ');
      const num = parseInt(parts[2], 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThan(100);
    });
  });

  describe('parseEntryId', () => {
    it('should parse valid entry ID', () => {
      const id = 'dev_abc123-1704067200000-abcd1234';
      const parsed = parseEntryId(id);

      expect(parsed).not.toBeNull();
      expect(parsed!.deviceId).toBe('dev_abc123');
      expect(parsed!.timestamp).toBe(1704067200000);
      expect(parsed!.random).toBe('abcd1234');
    });

    it('should handle device IDs with hyphens', () => {
      const id = 'dev_abc-123-1704067200000-abcd1234';
      const parsed = parseEntryId(id);

      expect(parsed).not.toBeNull();
      expect(parsed!.deviceId).toBe('dev_abc-123');
    });

    it('should return null for invalid format', () => {
      expect(parseEntryId('invalid')).toBeNull();
      expect(parseEntryId('only-two-parts')).toBeNull();
    });

    it('should return null for non-numeric timestamp', () => {
      expect(parseEntryId('dev_abc-notanumber-random')).toBeNull();
    });

    it('should handle empty string', () => {
      expect(parseEntryId('')).toBeNull();
    });
  });

  describe('isNewIdFormat', () => {
    it('should return true for new format IDs', () => {
      expect(isNewIdFormat('dev_abc123-1704067200000-abcd1234')).toBe(true);
      expect(isNewIdFormat('dev_test-123-xyz')).toBe(true);
    });

    it('should return false for old numeric IDs', () => {
      expect(isNewIdFormat('1704067200000')).toBe(false);
      expect(isNewIdFormat('123456')).toBe(false);
    });

    it('should return false for IDs not starting with dev_', () => {
      expect(isNewIdFormat('abc-123-456')).toBe(false);
      expect(isNewIdFormat('device-123-456')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isNewIdFormat(123 as unknown as string)).toBe(false);
      expect(isNewIdFormat(null as unknown as string)).toBe(false);
      expect(isNewIdFormat(undefined as unknown as string)).toBe(false);
    });
  });

  describe('migrateId', () => {
    it('should migrate old numeric ID to new format', () => {
      const deviceId = 'dev_test';
      const oldId = 1704067200000;
      const newId = migrateId(oldId, deviceId);

      expect(newId).toContain(deviceId);
      expect(newId).toContain('1704067200000');
      expect(isNewIdFormat(newId)).toBe(true);
    });

    it('should migrate string numeric ID', () => {
      const deviceId = 'dev_test';
      const oldId = '1704067200000';
      const newId = migrateId(oldId, deviceId);

      expect(newId).toContain(deviceId);
      expect(isNewIdFormat(newId)).toBe(true);
    });

    it('should return existing new format ID unchanged', () => {
      const deviceId = 'dev_test';
      const existingId = 'dev_other-1704067200000-abcd1234';
      const result = migrateId(existingId, deviceId);

      expect(result).toBe(existingId);
    });

    it('should add random component', () => {
      const deviceId = 'dev_test';
      const oldId = 1704067200000;
      const newId = migrateId(oldId, deviceId);
      const parsed = parseEntryId(newId);

      expect(parsed).not.toBeNull();
      expect(parsed!.random).toHaveLength(8);
    });
  });

  describe('generateRaceId', () => {
    it('should generate 8 character race ID', () => {
      const id = generateRaceId();
      expect(id).toHaveLength(8);
    });

    it('should only contain allowed characters', () => {
      const id = generateRaceId();
      // Excludes I, O, 0, 1 to avoid confusion
      expect(id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        ids.add(generateRaceId());
      }

      expect(ids.size).toBe(100);
    });

    it('should be suitable for use as race identifier', () => {
      const id = generateRaceId();

      // Should be easy to read/type
      expect(id).not.toContain('0'); // No zero
      expect(id).not.toContain('O'); // No capital O
      expect(id).not.toContain('1'); // No one
      expect(id).not.toContain('I'); // No capital I
    });
  });
});
