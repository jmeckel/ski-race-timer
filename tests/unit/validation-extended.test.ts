/**
 * Extended Unit Tests for Validation Utilities
 * Tests: isValidFaultVersion, isValidFaultEntry, sanitizeFaultEntry,
 *        makeNumericInput, and edge cases for existing functions
 */

import { describe, expect, it } from 'vitest';
import type { FaultEntry, FaultVersion } from '../../src/types';
import {
  isValidFaultEntry,
  isValidFaultVersion,
  makeNumericInput,
  sanitizeFaultEntry,
  sanitizeString,
} from '../../src/utils/validation';

describe('Extended Validation Utilities', () => {
  describe('isValidFaultVersion', () => {
    const validVersion: FaultVersion = {
      version: 1,
      timestamp: '2024-01-15T10:00:00.000Z',
      editedBy: 'Judge 1',
      editedByDeviceId: 'dev_judge1',
      changeType: 'create',
      data: {
        id: 'fault-1',
        bib: '042',
        run: 1,
        gateNumber: 4,
        faultType: 'MG',
        timestamp: '2024-01-15T10:00:00.000Z',
        deviceId: 'dev_judge1',
        deviceName: 'Judge 1',
        gateRange: [1, 10] as [number, number],
      } as FaultVersion['data'],
    };

    it('should validate a complete fault version', () => {
      expect(isValidFaultVersion(validVersion)).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(isValidFaultVersion(null)).toBe(false);
      expect(isValidFaultVersion(undefined)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(isValidFaultVersion('string')).toBe(false);
      expect(isValidFaultVersion(42)).toBe(false);
    });

    it('should reject version < 1', () => {
      expect(isValidFaultVersion({ ...validVersion, version: 0 })).toBe(false);
      expect(isValidFaultVersion({ ...validVersion, version: -1 })).toBe(false);
    });

    it('should reject non-integer version', () => {
      expect(isValidFaultVersion({ ...validVersion, version: 1.5 })).toBe(
        false,
      );
    });

    it('should reject non-number version', () => {
      expect(isValidFaultVersion({ ...validVersion, version: '1' })).toBe(
        false,
      );
    });

    it('should reject invalid timestamp', () => {
      expect(
        isValidFaultVersion({ ...validVersion, timestamp: 'not-a-date' }),
      ).toBe(false);
      expect(isValidFaultVersion({ ...validVersion, timestamp: 123 })).toBe(
        false,
      );
    });

    it('should reject editedBy longer than 100 chars', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          editedBy: 'x'.repeat(101),
        }),
      ).toBe(false);
    });

    it('should reject non-string editedBy', () => {
      expect(isValidFaultVersion({ ...validVersion, editedBy: 42 })).toBe(
        false,
      );
    });

    it('should reject editedByDeviceId longer than 100 chars', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          editedByDeviceId: 'x'.repeat(101),
        }),
      ).toBe(false);
    });

    it('should reject non-string editedByDeviceId', () => {
      expect(
        isValidFaultVersion({ ...validVersion, editedByDeviceId: 42 }),
      ).toBe(false);
    });

    it('should reject invalid changeType', () => {
      expect(
        isValidFaultVersion({ ...validVersion, changeType: 'invalid' }),
      ).toBe(false);
    });

    it('should accept all valid changeTypes', () => {
      expect(
        isValidFaultVersion({ ...validVersion, changeType: 'create' }),
      ).toBe(true);
      expect(isValidFaultVersion({ ...validVersion, changeType: 'edit' })).toBe(
        true,
      );
      expect(
        isValidFaultVersion({ ...validVersion, changeType: 'restore' }),
      ).toBe(true);
    });

    it('should reject when data is missing', () => {
      const v = { ...validVersion };
      delete (v as Record<string, unknown>).data;
      expect(isValidFaultVersion(v)).toBe(false);
    });

    it('should reject when data is not an object', () => {
      expect(isValidFaultVersion({ ...validVersion, data: 'string' })).toBe(
        false,
      );
    });

    it('should reject data with non-string id', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, id: 42 },
        }),
      ).toBe(false);
    });

    it('should reject data with bib longer than 10 chars', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, bib: '12345678901' },
        }),
      ).toBe(false);
    });

    it('should reject data with invalid run', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, run: 0 },
        }),
      ).toBe(false);
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, run: -1 },
        }),
      ).toBe(false);
    });

    it('should reject data with invalid gateNumber', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, gateNumber: -1 },
        }),
      ).toBe(false);
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, gateNumber: 1.5 },
        }),
      ).toBe(false);
    });

    it('should reject data with invalid faultType', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, faultType: 'INVALID' },
        }),
      ).toBe(false);
    });

    it('should reject data with invalid timestamp', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, timestamp: 'invalid' },
        }),
      ).toBe(false);
    });

    it('should reject data with non-string deviceId', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, deviceId: 42 },
        }),
      ).toBe(false);
    });

    it('should reject data with deviceName longer than 100 chars', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, deviceName: 'x'.repeat(101) },
        }),
      ).toBe(false);
    });

    it('should reject data with invalid gateRange', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, gateRange: [1] },
        }),
      ).toBe(false);
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, gateRange: 'invalid' },
        }),
      ).toBe(false);
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, gateRange: ['a', 'b'] },
        }),
      ).toBe(false);
      expect(
        isValidFaultVersion({
          ...validVersion,
          data: { ...validVersion.data, gateRange: [1.5, 10] },
        }),
      ).toBe(false);
    });

    it('should accept valid changeDescription', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          changeDescription: 'Corrected gate number',
        }),
      ).toBe(true);
    });

    it('should reject non-string changeDescription', () => {
      expect(
        isValidFaultVersion({ ...validVersion, changeDescription: 42 }),
      ).toBe(false);
    });

    it('should reject changeDescription longer than 500 chars', () => {
      expect(
        isValidFaultVersion({
          ...validVersion,
          changeDescription: 'x'.repeat(501),
        }),
      ).toBe(false);
    });
  });

  describe('isValidFaultEntry', () => {
    const validFaultEntry: FaultEntry = {
      id: 'fault-1',
      bib: '042',
      run: 1,
      gateNumber: 4,
      faultType: 'MG',
      timestamp: '2024-01-15T10:00:00.000Z',
      deviceId: 'dev_judge1',
      deviceName: 'Judge 1',
      gateRange: [1, 10],
      currentVersion: 1,
      versionHistory: [],
      markedForDeletion: false,
    };

    it('should validate a complete fault entry', () => {
      expect(isValidFaultEntry(validFaultEntry)).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(isValidFaultEntry(null)).toBe(false);
      expect(isValidFaultEntry(undefined)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(isValidFaultEntry('string')).toBe(false);
      expect(isValidFaultEntry(42)).toBe(false);
    });

    it('should reject empty id', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, id: '' })).toBe(false);
    });

    it('should reject non-string id', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, id: 42 })).toBe(false);
    });

    it('should reject bib longer than 10', () => {
      expect(
        isValidFaultEntry({ ...validFaultEntry, bib: '12345678901' }),
      ).toBe(false);
    });

    it('should reject non-string bib', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, bib: 42 })).toBe(false);
    });

    it('should reject non-string deviceId', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, deviceId: 42 })).toBe(
        false,
      );
    });

    it('should reject deviceName longer than 100 chars', () => {
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          deviceName: 'x'.repeat(101),
        }),
      ).toBe(false);
    });

    it('should reject non-string deviceName', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, deviceName: 42 })).toBe(
        false,
      );
    });

    it('should reject invalid timestamp', () => {
      expect(
        isValidFaultEntry({ ...validFaultEntry, timestamp: 'invalid' }),
      ).toBe(false);
      expect(isValidFaultEntry({ ...validFaultEntry, timestamp: 42 })).toBe(
        false,
      );
    });

    it('should reject invalid run', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, run: 0 })).toBe(false);
      expect(isValidFaultEntry({ ...validFaultEntry, run: -1 })).toBe(false);
      expect(isValidFaultEntry({ ...validFaultEntry, run: 1.5 })).toBe(false);
    });

    it('should reject invalid gateNumber', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, gateNumber: -1 })).toBe(
        false,
      );
      expect(isValidFaultEntry({ ...validFaultEntry, gateNumber: 1.5 })).toBe(
        false,
      );
      expect(isValidFaultEntry({ ...validFaultEntry, gateNumber: 'a' })).toBe(
        false,
      );
    });

    it('should reject invalid faultType', () => {
      expect(
        isValidFaultEntry({ ...validFaultEntry, faultType: 'INVALID' }),
      ).toBe(false);
    });

    it('should accept all valid fault types', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, faultType: 'MG' })).toBe(
        true,
      );
      expect(isValidFaultEntry({ ...validFaultEntry, faultType: 'STR' })).toBe(
        true,
      );
      expect(isValidFaultEntry({ ...validFaultEntry, faultType: 'BR' })).toBe(
        true,
      );
    });

    it('should reject invalid gateRange', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, gateRange: [1] })).toBe(
        false,
      );
      expect(
        isValidFaultEntry({ ...validFaultEntry, gateRange: 'invalid' }),
      ).toBe(false);
      expect(
        isValidFaultEntry({ ...validFaultEntry, gateRange: ['a', 'b'] }),
      ).toBe(false);
      expect(
        isValidFaultEntry({ ...validFaultEntry, gateRange: [1.5, 10] }),
      ).toBe(false);
    });

    it('should reject invalid currentVersion', () => {
      expect(isValidFaultEntry({ ...validFaultEntry, currentVersion: 0 })).toBe(
        false,
      );
      expect(
        isValidFaultEntry({ ...validFaultEntry, currentVersion: -1 }),
      ).toBe(false);
      expect(
        isValidFaultEntry({ ...validFaultEntry, currentVersion: 1.5 }),
      ).toBe(false);
    });

    it('should reject non-array versionHistory', () => {
      expect(
        isValidFaultEntry({ ...validFaultEntry, versionHistory: 'invalid' }),
      ).toBe(false);
    });

    it('should reject versionHistory with invalid entries', () => {
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          versionHistory: [{ invalid: true }],
        }),
      ).toBe(false);
    });

    it('should reject non-boolean markedForDeletion', () => {
      expect(
        isValidFaultEntry({ ...validFaultEntry, markedForDeletion: 'yes' }),
      ).toBe(false);
    });

    it('should validate optional deletion timestamps', () => {
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          markedForDeletionAt: '2024-01-15T10:00:00.000Z',
        }),
      ).toBe(true);
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          markedForDeletionAt: 'invalid',
        }),
      ).toBe(false);
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          markedForDeletionAt: 42,
        }),
      ).toBe(false);
    });

    it('should validate optional deletionApprovedAt', () => {
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          deletionApprovedAt: '2024-01-15T10:00:00.000Z',
        }),
      ).toBe(true);
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          deletionApprovedAt: 'invalid',
        }),
      ).toBe(false);
    });

    it('should validate optional string fields', () => {
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          markedForDeletionBy: 'Chief Judge',
        }),
      ).toBe(true);
      expect(
        isValidFaultEntry({ ...validFaultEntry, markedForDeletionBy: 42 }),
      ).toBe(false);
    });

    it('should validate optional markedForDeletionByDeviceId', () => {
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          markedForDeletionByDeviceId: 'dev_chief1',
        }),
      ).toBe(true);
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          markedForDeletionByDeviceId: 42,
        }),
      ).toBe(false);
    });

    it('should validate optional deletionApprovedBy', () => {
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          deletionApprovedBy: 'Chief Judge',
        }),
      ).toBe(true);
      expect(
        isValidFaultEntry({ ...validFaultEntry, deletionApprovedBy: 42 }),
      ).toBe(false);
    });

    it('should validate optional syncedAt', () => {
      expect(
        isValidFaultEntry({
          ...validFaultEntry,
          syncedAt: 1704067200000,
        }),
      ).toBe(true);
      expect(
        isValidFaultEntry({ ...validFaultEntry, syncedAt: 'invalid' }),
      ).toBe(false);
      expect(isValidFaultEntry({ ...validFaultEntry, syncedAt: NaN })).toBe(
        false,
      );
      expect(
        isValidFaultEntry({ ...validFaultEntry, syncedAt: Infinity }),
      ).toBe(false);
    });
  });

  describe('sanitizeFaultEntry', () => {
    const validFaultEntry: FaultEntry = {
      id: 'fault-1',
      bib: '042',
      run: 1,
      gateNumber: 4,
      faultType: 'MG',
      timestamp: '2024-01-15T10:00:00.000Z',
      deviceId: 'dev_judge1',
      deviceName: 'Judge 1',
      gateRange: [1, 10],
      currentVersion: 1,
      versionHistory: [
        {
          version: 1,
          timestamp: '2024-01-15T10:00:00.000Z',
          editedBy: 'Judge 1',
          editedByDeviceId: 'dev_judge1',
          changeType: 'create',
          data: {
            id: 'fault-1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:00:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge 1',
            gateRange: [1, 10] as [number, number],
          } as FaultVersion['data'],
        },
      ],
      markedForDeletion: false,
    };

    it('should sanitize a valid fault entry', () => {
      const result = sanitizeFaultEntry(validFaultEntry);
      expect(result).not.toBeNull();
      expect(result!.bib).toBe('042');
    });

    it('should return null for invalid fault entry', () => {
      expect(sanitizeFaultEntry(null)).toBeNull();
      expect(sanitizeFaultEntry({ invalid: true })).toBeNull();
    });

    it('should strip HTML from string fields', () => {
      const dirty = {
        ...validFaultEntry,
        bib: '<img>42',
        deviceName: '<script>x</script>',
        versionHistory: [
          {
            ...validFaultEntry.versionHistory[0],
            editedBy: '<b>Judge</b>',
            editedByDeviceId: '<i>dev</i>',
            data: {
              ...validFaultEntry.versionHistory[0]!.data,
              bib: '<a>42</a>',
              deviceId: '<div>id</div>',
              deviceName: '<span>name</span>',
            },
          },
        ],
      };

      const result = sanitizeFaultEntry(dirty);
      expect(result).not.toBeNull();
      expect(result!.bib).not.toContain('<');
      expect(result!.deviceName).not.toContain('<');
    });

    it('should sanitize optional deletion fields', () => {
      const entry = {
        ...validFaultEntry,
        markedForDeletionBy: '<script>alert</script>',
        markedForDeletionByDeviceId: '<img src=x>',
        deletionApprovedBy: '<div>approver</div>',
      };

      const result = sanitizeFaultEntry(entry);
      expect(result).not.toBeNull();
      if (result?.markedForDeletionBy) {
        expect(result.markedForDeletionBy).not.toContain('<');
      }
    });

    it('should handle version with changeDescription', () => {
      const entry = {
        ...validFaultEntry,
        versionHistory: [
          {
            ...validFaultEntry.versionHistory[0],
            changeDescription: 'Fixed gate number',
          },
        ],
      };

      const result = sanitizeFaultEntry(entry);
      expect(result).not.toBeNull();
    });
  });

  describe('makeNumericInput', () => {
    it('should strip non-numeric characters on input', () => {
      const input = document.createElement('input');
      makeNumericInput(input);

      input.value = 'abc123def';
      input.dispatchEvent(new Event('input'));
      expect(input.value).toBe('123');
    });

    it('should enforce max length', () => {
      const input = document.createElement('input');
      makeNumericInput(input, 3);

      input.value = '12345';
      input.dispatchEvent(new Event('input'));
      expect(input.value).toBe('123');
    });

    it('should allow empty input', () => {
      const input = document.createElement('input');
      makeNumericInput(input);

      input.value = '';
      input.dispatchEvent(new Event('input'));
      expect(input.value).toBe('');
    });

    it('should allow all-numeric input', () => {
      const input = document.createElement('input');
      makeNumericInput(input);

      input.value = '42';
      input.dispatchEvent(new Event('input'));
      expect(input.value).toBe('42');
    });

    it('should strip special characters', () => {
      const input = document.createElement('input');
      makeNumericInput(input);

      input.value = '1+2=3';
      input.dispatchEvent(new Event('input'));
      expect(input.value).toBe('123');
    });

    it('should work without maxLength parameter', () => {
      const input = document.createElement('input');
      makeNumericInput(input);

      input.value = '123456789012345';
      input.dispatchEvent(new Event('input'));
      expect(input.value).toBe('123456789012345');
    });
  });

  describe('sanitizeString edge cases', () => {
    it('should remove control characters', () => {
      const result = sanitizeString('hello\x00world\x07');
      expect(result).toBe('helloworld');
    });

    it('should remove angle brackets and ampersands but preserve quotes', () => {
      const result = sanitizeString('test\'value"with&chars');
      expect(result).toBe('test\'value"withchars');
    });

    it('should handle max length of 0', () => {
      const result = sanitizeString('hello', 0);
      expect(result).toBe('');
    });

    it('should handle very long string', () => {
      const longStr = 'a'.repeat(500);
      const result = sanitizeString(longStr, 100);
      expect(result.length).toBe(100);
    });
  });
});
