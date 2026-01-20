/**
 * Unit Tests for Validation Utilities
 * Tests: isValidEntry, isValidSettings, isValidSyncQueueItem, isValidRaceId,
 *        isValidDeviceId, isValidDataSchema, sanitizeString, sanitizeEntry,
 *        migrateSchema, calculateChecksum, verifyChecksum
 */

import { describe, it, expect } from 'vitest';
import {
  isValidEntry,
  isValidSettings,
  isValidSyncQueueItem,
  isValidRaceId,
  isValidDeviceId,
  isValidDataSchema,
  sanitizeString,
  sanitizeEntry,
  migrateSchema,
  calculateChecksum,
  verifyChecksum
} from '../../src/utils/validation';
import { SCHEMA_VERSION } from '../../src/types';
import type { Entry, Settings, SyncQueueItem } from '../../src/types';

describe('Validation Utilities', () => {
  describe('isValidEntry', () => {
    const validEntry: Entry = {
      id: 'dev_test-1704067200000-abcd1234',
      bib: '042',
      point: 'F',
      timestamp: '2024-01-01T12:00:00.000Z',
      status: 'ok',
      deviceId: 'dev_test',
      deviceName: 'Timer 1'
    };

    it('should validate a complete entry', () => {
      expect(isValidEntry(validEntry)).toBe(true);
    });

    it('should validate entry without optional bib', () => {
      const entry = { ...validEntry, bib: '' };
      expect(isValidEntry(entry)).toBe(true);
    });

    it('should validate all timing points', () => {
      expect(isValidEntry({ ...validEntry, point: 'S' })).toBe(true);
      expect(isValidEntry({ ...validEntry, point: 'F' })).toBe(true);
    });

    it('should validate all status values', () => {
      expect(isValidEntry({ ...validEntry, status: 'ok' })).toBe(true);
      expect(isValidEntry({ ...validEntry, status: 'dns' })).toBe(true);
      expect(isValidEntry({ ...validEntry, status: 'dnf' })).toBe(true);
      expect(isValidEntry({ ...validEntry, status: 'dsq' })).toBe(true);
    });

    it('should accept legacy numeric ID', () => {
      const entry = { ...validEntry, id: 1704067200000 as unknown as string };
      expect(isValidEntry(entry)).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(isValidEntry(null)).toBe(false);
      expect(isValidEntry(undefined)).toBe(false);
    });

    it('should reject invalid point', () => {
      expect(isValidEntry({ ...validEntry, point: 'X' as Entry['point'] })).toBe(false);
      expect(isValidEntry({ ...validEntry, point: 'I4' as Entry['point'] })).toBe(false);
    });

    it('should reject invalid timestamp', () => {
      expect(isValidEntry({ ...validEntry, timestamp: 'invalid' })).toBe(false);
      expect(isValidEntry({ ...validEntry, timestamp: '' })).toBe(false);
    });

    it('should reject invalid status', () => {
      expect(isValidEntry({ ...validEntry, status: 'invalid' as Entry['status'] })).toBe(false);
    });

    it('should reject bib longer than 10 chars', () => {
      expect(isValidEntry({ ...validEntry, bib: '12345678901' })).toBe(false);
    });

    it('should reject non-string bib', () => {
      const entry = { ...validEntry, bib: 123 as unknown as string };
      expect(isValidEntry(entry)).toBe(false);
    });

    // Tests for optional field validation (added for enhanced type guard)
    describe('optional field validation', () => {
      it('should validate entry with all optional fields', () => {
        const fullEntry = {
          ...validEntry,
          syncedAt: 1704067200000,
          photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          gpsCoords: {
            latitude: 48.1234,
            longitude: 11.5678,
            accuracy: 5.0
          }
        };
        expect(isValidEntry(fullEntry)).toBe(true);
      });

      it('should reject non-string deviceId', () => {
        const entry = { ...validEntry, deviceId: 123 as unknown as string };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject non-string deviceName', () => {
        const entry = { ...validEntry, deviceName: 123 as unknown as string };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject non-number syncedAt', () => {
        const entry = { ...validEntry, syncedAt: '1704067200000' as unknown as number };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject negative syncedAt', () => {
        const entry = { ...validEntry, syncedAt: -1 };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject NaN syncedAt', () => {
        const entry = { ...validEntry, syncedAt: NaN };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject Infinity syncedAt', () => {
        const entry = { ...validEntry, syncedAt: Infinity };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject non-string photo', () => {
        const entry = { ...validEntry, photo: 123 as unknown as string };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject non-object gpsCoords', () => {
        const entry = { ...validEntry, gpsCoords: 'invalid' as unknown as Entry['gpsCoords'] };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject null gpsCoords', () => {
        const entry = { ...validEntry, gpsCoords: null as unknown as Entry['gpsCoords'] };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject gpsCoords with missing latitude', () => {
        const entry = {
          ...validEntry,
          gpsCoords: { longitude: 11.5678, accuracy: 5.0 } as unknown as Entry['gpsCoords']
        };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject gpsCoords with non-number latitude', () => {
        const entry = {
          ...validEntry,
          gpsCoords: { latitude: '48.1234', longitude: 11.5678, accuracy: 5.0 } as unknown as Entry['gpsCoords']
        };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject gpsCoords with NaN latitude', () => {
        const entry = {
          ...validEntry,
          gpsCoords: { latitude: NaN, longitude: 11.5678, accuracy: 5.0 }
        };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should reject gpsCoords with negative accuracy', () => {
        const entry = {
          ...validEntry,
          gpsCoords: { latitude: 48.1234, longitude: 11.5678, accuracy: -1 }
        };
        expect(isValidEntry(entry)).toBe(false);
      });

      it('should accept entry with undefined optional fields', () => {
        const minimalEntry = {
          id: 'test-id',
          bib: '001',
          point: 'F' as const,
          timestamp: '2024-01-01T12:00:00.000Z',
          status: 'ok' as const,
          deviceId: 'dev_test',
          deviceName: 'Timer 1'
        };
        expect(isValidEntry(minimalEntry)).toBe(true);
      });
    });
  });

  describe('isValidSettings', () => {
    const validSettings: Settings = {
      auto: true,
      haptic: true,
      sound: false,
      sync: false,
      gps: false,
      simple: true,
      photoCapture: false
    };

    it('should validate complete settings', () => {
      expect(isValidSettings(validSettings)).toBe(true);
    });

    it('should validate partial settings', () => {
      expect(isValidSettings({ auto: true })).toBe(true);
      expect(isValidSettings({})).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(isValidSettings(null)).toBe(false);
      expect(isValidSettings(undefined)).toBe(false);
    });

    it('should reject non-boolean settings values', () => {
      expect(isValidSettings({ auto: 'true' })).toBe(false);
      expect(isValidSettings({ haptic: 1 })).toBe(false);
    });
  });

  describe('isValidSyncQueueItem', () => {
    const validItem: SyncQueueItem = {
      entry: {
        id: 'dev_test-1704067200000-abcd1234',
        bib: '042',
        point: 'F',
        timestamp: '2024-01-01T12:00:00.000Z',
        status: 'ok',
        deviceId: 'dev_test',
        deviceName: 'Timer 1'
      },
      retryCount: 0,
      lastAttempt: 0
    };

    it('should validate complete sync queue item', () => {
      expect(isValidSyncQueueItem(validItem)).toBe(true);
    });

    it('should validate item with error', () => {
      const item = { ...validItem, error: 'Network error' };
      expect(isValidSyncQueueItem(item)).toBe(true);
    });

    it('should reject invalid entry', () => {
      const item = { ...validItem, entry: { id: '' } };
      expect(isValidSyncQueueItem(item)).toBe(false);
    });

    it('should reject negative retryCount', () => {
      const item = { ...validItem, retryCount: -1 };
      expect(isValidSyncQueueItem(item)).toBe(false);
    });

    it('should reject negative lastAttempt', () => {
      const item = { ...validItem, lastAttempt: -1 };
      expect(isValidSyncQueueItem(item)).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidSyncQueueItem(null)).toBe(false);
      expect(isValidSyncQueueItem(undefined)).toBe(false);
    });
  });

  describe('isValidRaceId', () => {
    it('should accept valid race IDs', () => {
      expect(isValidRaceId('RACE001')).toBe(true);
      expect(isValidRaceId('my-race')).toBe(true);
      expect(isValidRaceId('race_2024')).toBe(true);
      expect(isValidRaceId('ABC123')).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidRaceId('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidRaceId(null)).toBe(false);
      expect(isValidRaceId(undefined)).toBe(false);
    });

    it('should reject special characters', () => {
      expect(isValidRaceId('race@2024')).toBe(false);
      expect(isValidRaceId('race 2024')).toBe(false);
      expect(isValidRaceId('race/2024')).toBe(false);
    });

    it('should reject IDs longer than 50 chars', () => {
      const longId = 'a'.repeat(51);
      expect(isValidRaceId(longId)).toBe(false);
    });

    it('should accept ID at max length', () => {
      const maxId = 'a'.repeat(50);
      expect(isValidRaceId(maxId)).toBe(true);
    });
  });

  describe('isValidDeviceId', () => {
    it('should accept valid device IDs', () => {
      expect(isValidDeviceId('dev_abc123')).toBe(true);
      expect(isValidDeviceId('dev_abcdef123456')).toBe(true);
    });

    it('should accept human-readable device IDs', () => {
      expect(isValidDeviceId('dev_swift-fox-42')).toBe(true);
      expect(isValidDeviceId('dev_alpine-glacier-99')).toBe(true);
      expect(isValidDeviceId('dev_ice-peak-0')).toBe(true);
    });

    it('should reject IDs not starting with dev_', () => {
      expect(isValidDeviceId('abc123')).toBe(false);
      expect(isValidDeviceId('device_abc')).toBe(false);
    });

    it('should reject empty/short IDs', () => {
      expect(isValidDeviceId('')).toBe(false);
      expect(isValidDeviceId('dev_')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidDeviceId(null)).toBe(false);
      expect(isValidDeviceId(undefined)).toBe(false);
    });
  });

  describe('isValidDataSchema', () => {
    const validSchema = {
      version: SCHEMA_VERSION,
      entries: [],
      settings: { auto: true },
      deviceId: 'dev_test',
      deviceName: 'Timer 1',
      raceId: 'RACE001',
      syncQueue: []
    };

    it('should validate complete schema', () => {
      expect(isValidDataSchema(validSchema)).toBe(true);
    });

    it('should reject future schema version', () => {
      const futureSchema = { ...validSchema, version: SCHEMA_VERSION + 1 };
      expect(isValidDataSchema(futureSchema)).toBe(false);
    });

    it('should reject non-array entries', () => {
      const invalidSchema = { ...validSchema, entries: 'not-array' };
      expect(isValidDataSchema(invalidSchema)).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidDataSchema(null)).toBe(false);
      expect(isValidDataSchema(undefined)).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should remove angle brackets', () => {
      expect(sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
    });

    it('should truncate to max length', () => {
      expect(sanitizeString('hello world', 5)).toBe('hello');
    });

    it('should handle empty/null input', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });

    it('should handle non-string input', () => {
      expect(sanitizeString(123 as unknown as string)).toBe('');
    });

    it('should preserve normal characters', () => {
      expect(sanitizeString('Hello World!')).toBe('Hello World!');
    });
  });

  describe('sanitizeEntry', () => {
    const validEntry = {
      id: 'dev_test-1704067200000-abcd1234',
      bib: '042',
      point: 'F',
      timestamp: '2024-01-01T12:00:00.000Z',
      status: 'ok',
      deviceId: 'dev_test',
      deviceName: 'Timer 1'
    };

    it('should sanitize a valid entry', () => {
      const result = sanitizeEntry(validEntry, 'dev_default');
      expect(result).not.toBeNull();
      expect(result!.bib).toBe('042');
    });

    it('should use default deviceId if not provided', () => {
      const entry = { ...validEntry, deviceId: undefined };
      const result = sanitizeEntry(entry, 'dev_default');
      expect(result!.deviceId).toBe('dev_default');
    });

    it('should sanitize HTML in bib', () => {
      const entry = { ...validEntry, bib: '<script>' };
      const result = sanitizeEntry(entry, 'dev_default');
      expect(result!.bib).not.toContain('<');
    });

    it('should return null for invalid entry', () => {
      expect(sanitizeEntry({ invalid: true }, 'dev_default')).toBeNull();
      expect(sanitizeEntry(null, 'dev_default')).toBeNull();
    });
  });

  describe('migrateSchema', () => {
    const deviceId = 'dev_test';

    it('should migrate empty/invalid data', () => {
      const result = migrateSchema(null, deviceId);
      expect(result.version).toBe(SCHEMA_VERSION);
      expect(result.entries).toEqual([]);
      expect(result.deviceId).toBe(deviceId);
    });

    it('should preserve valid entries', () => {
      const data = {
        entries: [{
          id: 'test-id',
          bib: '042',
          point: 'F',
          timestamp: '2024-01-01T12:00:00.000Z',
          status: 'ok'
        }]
      };
      const result = migrateSchema(data, deviceId);
      expect(result.entries).toHaveLength(1);
    });

    it('should filter invalid entries', () => {
      const data = {
        entries: [
          { id: 'valid', bib: '042', point: 'F', timestamp: '2024-01-01T12:00:00.000Z' },
          { invalid: true },
          null
        ]
      };
      const result = migrateSchema(data, deviceId);
      expect(result.entries).toHaveLength(1);
    });

    it('should merge settings with defaults', () => {
      const data = {
        settings: { auto: false }
      };
      const result = migrateSchema(data, deviceId);
      expect(result.settings.auto).toBe(false);
      expect(result.settings.haptic).toBe(true); // default
    });

    it('should preserve sync queue', () => {
      const data = {
        syncQueue: [{
          entry: {
            id: 'test',
            bib: '001',
            point: 'F',
            timestamp: '2024-01-01T12:00:00.000Z'
          },
          retryCount: 1,
          lastAttempt: Date.now()
        }]
      };
      const result = migrateSchema(data, deviceId);
      expect(result.syncQueue).toHaveLength(1);
    });
  });

  describe('calculateChecksum', () => {
    it('should return consistent checksum for same data', () => {
      const data = 'test data';
      const checksum1 = calculateChecksum(data);
      const checksum2 = calculateChecksum(data);
      expect(checksum1).toBe(checksum2);
    });

    it('should return different checksum for different data', () => {
      const checksum1 = calculateChecksum('data1');
      const checksum2 = calculateChecksum('data2');
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle empty string', () => {
      const checksum = calculateChecksum('');
      expect(typeof checksum).toBe('string');
    });

    it('should handle complex JSON data', () => {
      const data = JSON.stringify({ entries: [{ id: 1 }, { id: 2 }] });
      const checksum = calculateChecksum(data);
      expect(checksum.length).toBeGreaterThan(0);
    });
  });

  describe('verifyChecksum', () => {
    it('should return true for matching checksum', () => {
      const data = 'test data';
      const checksum = calculateChecksum(data);
      expect(verifyChecksum(data, checksum)).toBe(true);
    });

    it('should return false for non-matching checksum', () => {
      const data = 'test data';
      expect(verifyChecksum(data, 'wrongchecksum')).toBe(false);
    });

    it('should detect data tampering', () => {
      const originalData = 'original';
      const checksum = calculateChecksum(originalData);
      const tamperedData = 'tampered';
      expect(verifyChecksum(tamperedData, checksum)).toBe(false);
    });
  });
});
