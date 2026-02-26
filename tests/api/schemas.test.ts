/**
 * Unit Tests for Valibot Schemas (api/lib/schemas.ts)
 * Tests all schema exports: valid inputs, invalid inputs, edge cases,
 * and the validate() helper function.
 */

import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  BibSchema,
  ChangePinBodySchema,
  DeviceIdSchema,
  DeviceNameSchema,
  EntrySchema,
  EntryStatusSchema,
  FaultDeleteBodySchema,
  FaultEntrySchema,
  FaultPostBodySchema,
  FaultTypeSchema,
  GateRangeSchema,
  PinSchema,
  RaceIdSchema,
  ResetPinBodySchema,
  RoleSchema,
  RunSchema,
  SyncDeleteBodySchema,
  SyncPostBodySchema,
  TimestampSchema,
  TimingPointSchema,
  TokenRequestSchema,
  validate,
} from '../../api/lib/schemas';

// Helper: shorthand for safeParse success check
function isValid<T>(
  schema: v.GenericSchema<unknown, T>,
  data: unknown,
): boolean {
  return v.safeParse(schema, data).success;
}

describe('Valibot Schemas', () => {
  // ─── Shared Schemas ───

  describe('RaceIdSchema', () => {
    it('should accept valid alphanumeric race IDs', () => {
      expect(isValid(RaceIdSchema, 'RACE001')).toBe(true);
      expect(isValid(RaceIdSchema, 'my-race')).toBe(true);
      expect(isValid(RaceIdSchema, 'race_2024')).toBe(true);
      expect(isValid(RaceIdSchema, 'ABC123')).toBe(true);
      expect(isValid(RaceIdSchema, 'a')).toBe(true);
    });

    it('should accept race IDs at max length (50)', () => {
      expect(isValid(RaceIdSchema, 'a'.repeat(50))).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValid(RaceIdSchema, '')).toBe(false);
    });

    it('should reject IDs longer than 50 chars', () => {
      expect(isValid(RaceIdSchema, 'a'.repeat(51))).toBe(false);
    });

    it('should reject IDs with special characters', () => {
      expect(isValid(RaceIdSchema, 'race 2024')).toBe(false);
      expect(isValid(RaceIdSchema, 'race@2024')).toBe(false);
      expect(isValid(RaceIdSchema, 'race/2024')).toBe(false);
      expect(isValid(RaceIdSchema, 'race.2024')).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(isValid(RaceIdSchema, 123)).toBe(false);
      expect(isValid(RaceIdSchema, null)).toBe(false);
      expect(isValid(RaceIdSchema, undefined)).toBe(false);
    });
  });

  describe('PinSchema', () => {
    it('should accept 4-digit PINs', () => {
      expect(isValid(PinSchema, '1234')).toBe(true);
      expect(isValid(PinSchema, '0000')).toBe(true);
      expect(isValid(PinSchema, '9999')).toBe(true);
    });

    it('should reject PINs with wrong length', () => {
      expect(isValid(PinSchema, '123')).toBe(false);
      expect(isValid(PinSchema, '12345')).toBe(false);
      expect(isValid(PinSchema, '')).toBe(false);
    });

    it('should reject non-numeric PINs', () => {
      expect(isValid(PinSchema, 'abcd')).toBe(false);
      expect(isValid(PinSchema, '12ab')).toBe(false);
      expect(isValid(PinSchema, '12.4')).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(isValid(PinSchema, 1234)).toBe(false);
      expect(isValid(PinSchema, null)).toBe(false);
    });
  });

  describe('DeviceIdSchema', () => {
    it('should accept valid device IDs up to 50 chars', () => {
      expect(isValid(DeviceIdSchema, 'dev_abc123')).toBe(true);
      expect(isValid(DeviceIdSchema, 'a'.repeat(50))).toBe(true);
    });

    it('should accept empty string (minLength not enforced)', () => {
      expect(isValid(DeviceIdSchema, '')).toBe(true);
    });

    it('should reject strings longer than 50 chars', () => {
      expect(isValid(DeviceIdSchema, 'a'.repeat(51))).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(isValid(DeviceIdSchema, 123)).toBe(false);
    });
  });

  describe('DeviceNameSchema', () => {
    it('should accept valid device names up to 100 chars', () => {
      expect(isValid(DeviceNameSchema, 'Timer 1')).toBe(true);
      expect(isValid(DeviceNameSchema, 'a'.repeat(100))).toBe(true);
    });

    it('should reject strings longer than 100 chars', () => {
      expect(isValid(DeviceNameSchema, 'a'.repeat(101))).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(isValid(DeviceNameSchema, 42)).toBe(false);
    });
  });

  describe('BibSchema', () => {
    it('should accept valid bibs', () => {
      expect(isValid(BibSchema, '1')).toBe(true);
      expect(isValid(BibSchema, '042')).toBe(true);
      expect(isValid(BibSchema, '1234567890')).toBe(true); // 10 chars max
    });

    it('should reject empty bib', () => {
      expect(isValid(BibSchema, '')).toBe(false);
    });

    it('should reject bib longer than 10 chars', () => {
      expect(isValid(BibSchema, '12345678901')).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(isValid(BibSchema, 42)).toBe(false);
    });
  });

  describe('RunSchema', () => {
    it('should accept 1 and 2', () => {
      expect(isValid(RunSchema, 1)).toBe(true);
      expect(isValid(RunSchema, 2)).toBe(true);
    });

    it('should reject other numbers', () => {
      expect(isValid(RunSchema, 0)).toBe(false);
      expect(isValid(RunSchema, 3)).toBe(false);
    });

    it('should reject string versions', () => {
      expect(isValid(RunSchema, '1')).toBe(false);
    });
  });

  describe('TimingPointSchema', () => {
    it('should accept S and F', () => {
      expect(isValid(TimingPointSchema, 'S')).toBe(true);
      expect(isValid(TimingPointSchema, 'F')).toBe(true);
    });

    it('should reject other values', () => {
      expect(isValid(TimingPointSchema, 'X')).toBe(false);
      expect(isValid(TimingPointSchema, 's')).toBe(false);
      expect(isValid(TimingPointSchema, '')).toBe(false);
    });
  });

  describe('EntryStatusSchema', () => {
    it('should accept all valid status values', () => {
      expect(isValid(EntryStatusSchema, 'ok')).toBe(true);
      expect(isValid(EntryStatusSchema, 'dns')).toBe(true);
      expect(isValid(EntryStatusSchema, 'dnf')).toBe(true);
      expect(isValid(EntryStatusSchema, 'dsq')).toBe(true);
      expect(isValid(EntryStatusSchema, 'flt')).toBe(true);
    });

    it('should reject invalid status', () => {
      expect(isValid(EntryStatusSchema, 'invalid')).toBe(false);
      expect(isValid(EntryStatusSchema, 'OK')).toBe(false);
      expect(isValid(EntryStatusSchema, '')).toBe(false);
    });
  });

  describe('FaultTypeSchema', () => {
    it('should accept MG, STR, BR', () => {
      expect(isValid(FaultTypeSchema, 'MG')).toBe(true);
      expect(isValid(FaultTypeSchema, 'STR')).toBe(true);
      expect(isValid(FaultTypeSchema, 'BR')).toBe(true);
    });

    it('should reject invalid fault types', () => {
      expect(isValid(FaultTypeSchema, 'mg')).toBe(false);
      expect(isValid(FaultTypeSchema, 'XX')).toBe(false);
      expect(isValid(FaultTypeSchema, '')).toBe(false);
    });
  });

  describe('RoleSchema', () => {
    it('should accept all valid roles', () => {
      expect(isValid(RoleSchema, 'timer')).toBe(true);
      expect(isValid(RoleSchema, 'gateJudge')).toBe(true);
      expect(isValid(RoleSchema, 'chiefJudge')).toBe(true);
    });

    it('should reject invalid roles', () => {
      expect(isValid(RoleSchema, 'admin')).toBe(false);
      expect(isValid(RoleSchema, 'Timer')).toBe(false);
      expect(isValid(RoleSchema, '')).toBe(false);
    });
  });

  // ─── Entry Schemas ───

  describe('TimestampSchema', () => {
    it('should accept valid ISO timestamps', () => {
      expect(isValid(TimestampSchema, '2024-01-01T12:00:00.000Z')).toBe(true);
      expect(isValid(TimestampSchema, '2024-12-31T23:59:59Z')).toBe(true);
      expect(isValid(TimestampSchema, '2024-06-15')).toBe(true);
    });

    it('should reject invalid date strings', () => {
      expect(isValid(TimestampSchema, 'not-a-date')).toBe(false);
      expect(isValid(TimestampSchema, '')).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(isValid(TimestampSchema, 1704067200000)).toBe(false);
      expect(isValid(TimestampSchema, null)).toBe(false);
    });
  });

  describe('EntrySchema', () => {
    const validEntry = {
      id: 'test-entry-1',
      bib: '042',
      point: 'F' as const,
      timestamp: '2024-01-01T12:00:00.000Z',
      status: 'ok' as const,
      run: 1 as const,
    };

    it('should accept a complete valid entry', () => {
      expect(isValid(EntrySchema, validEntry)).toBe(true);
    });

    it('should accept entry with numeric id', () => {
      expect(isValid(EntrySchema, { ...validEntry, id: 1704067200000 })).toBe(
        true,
      );
    });

    it('should accept entry without optional fields', () => {
      const minimalEntry = {
        id: 'test-1',
        point: 'S',
        timestamp: '2024-01-01T12:00:00.000Z',
      };
      expect(isValid(EntrySchema, minimalEntry)).toBe(true);
    });

    it('should accept entry with gpsCoords', () => {
      const entryWithGps = {
        ...validEntry,
        gpsCoords: {
          latitude: 48.1234,
          longitude: 11.5678,
          accuracy: 5.0,
        },
      };
      expect(isValid(EntrySchema, entryWithGps)).toBe(true);
    });

    it('should accept entry with photo', () => {
      expect(
        isValid(EntrySchema, {
          ...validEntry,
          photo: 'data:image/jpeg;base64,abc',
        }),
      ).toBe(true);
    });

    it('should reject entry without id', () => {
      const { id, ...noId } = validEntry;
      expect(isValid(EntrySchema, noId)).toBe(false);
    });

    it('should reject entry without point', () => {
      const { point, ...noPoint } = validEntry;
      expect(isValid(EntrySchema, noPoint)).toBe(false);
    });

    it('should reject entry without timestamp', () => {
      const { timestamp, ...noTs } = validEntry;
      expect(isValid(EntrySchema, noTs)).toBe(false);
    });

    it('should reject entry with invalid point', () => {
      expect(isValid(EntrySchema, { ...validEntry, point: 'X' })).toBe(false);
    });

    it('should reject entry with invalid status', () => {
      expect(isValid(EntrySchema, { ...validEntry, status: 'invalid' })).toBe(
        false,
      );
    });

    it('should reject entry with invalid run', () => {
      expect(isValid(EntrySchema, { ...validEntry, run: 3 })).toBe(false);
    });

    it('should reject entry with id of 0', () => {
      expect(isValid(EntrySchema, { ...validEntry, id: 0 })).toBe(false);
    });

    it('should reject entry with empty string id', () => {
      expect(isValid(EntrySchema, { ...validEntry, id: '' })).toBe(false);
    });
  });

  describe('SyncPostBodySchema', () => {
    const validBody = {
      entry: {
        id: 'test-1',
        point: 'S' as const,
        timestamp: '2024-01-01T12:00:00.000Z',
      },
      deviceId: 'dev_abc',
      deviceName: 'Timer 1',
    };

    it('should accept valid body', () => {
      expect(isValid(SyncPostBodySchema, validBody)).toBe(true);
    });

    it('should accept body without optional deviceId/deviceName', () => {
      expect(isValid(SyncPostBodySchema, { entry: validBody.entry })).toBe(
        true,
      );
    });

    it('should reject body without entry', () => {
      expect(isValid(SyncPostBodySchema, { deviceId: 'dev_abc' })).toBe(false);
    });

    it('should reject body with invalid entry', () => {
      expect(isValid(SyncPostBodySchema, { entry: {} })).toBe(false);
    });
  });

  describe('SyncDeleteBodySchema', () => {
    it('should accept string entryId', () => {
      expect(isValid(SyncDeleteBodySchema, { entryId: 'test-1' })).toBe(true);
    });

    it('should accept numeric entryId', () => {
      expect(isValid(SyncDeleteBodySchema, { entryId: 12345 })).toBe(true);
    });

    it('should accept with optional fields', () => {
      expect(
        isValid(SyncDeleteBodySchema, {
          entryId: 'test-1',
          deviceId: 'dev_abc',
          deviceName: 'Timer 1',
        }),
      ).toBe(true);
    });

    it('should reject missing entryId', () => {
      expect(isValid(SyncDeleteBodySchema, {})).toBe(false);
    });
  });

  // ─── Fault Schemas ───

  describe('GateRangeSchema', () => {
    it('should accept array of exactly 2 numbers', () => {
      expect(isValid(GateRangeSchema, [1, 30])).toBe(true);
      expect(isValid(GateRangeSchema, [0, 0])).toBe(true);
    });

    it('should reject array with wrong length', () => {
      expect(isValid(GateRangeSchema, [1])).toBe(false);
      expect(isValid(GateRangeSchema, [1, 2, 3])).toBe(false);
      expect(isValid(GateRangeSchema, [])).toBe(false);
    });

    it('should reject non-number elements', () => {
      expect(isValid(GateRangeSchema, ['a', 'b'])).toBe(false);
    });

    it('should reject non-array types', () => {
      expect(isValid(GateRangeSchema, 'not-array')).toBe(false);
      expect(isValid(GateRangeSchema, null)).toBe(false);
    });
  });

  describe('FaultEntrySchema', () => {
    const validFault = {
      id: 'fault-1',
      bib: '042',
      run: 1 as const,
      gateNumber: 5,
      faultType: 'MG' as const,
      timestamp: '2024-01-01T12:00:00.000Z',
      gateRange: [1, 30],
    };

    it('should accept a valid fault entry', () => {
      expect(isValid(FaultEntrySchema, validFault)).toBe(true);
    });

    it('should accept fault with numeric id', () => {
      expect(isValid(FaultEntrySchema, { ...validFault, id: 42 })).toBe(true);
    });

    it('should accept fault with all optional fields', () => {
      const fullFault = {
        ...validFault,
        notes: 'Gate miss',
        notesSource: 'voice' as const,
        notesTimestamp: '2024-01-01T12:01:00Z',
        currentVersion: 2,
        versionHistory: [{ version: 1 }],
        markedForDeletion: true,
        markedForDeletionAt: '2024-01-01T12:05:00Z',
        markedForDeletionBy: 'Chief Judge A',
        markedForDeletionByDeviceId: 'dev_chief',
        deletionApprovedAt: '2024-01-01T12:10:00Z',
        deletionApprovedBy: 'Chief Judge B',
      };
      expect(isValid(FaultEntrySchema, fullFault)).toBe(true);
    });

    it('should accept fault with null optional fields', () => {
      const faultWithNulls = {
        ...validFault,
        notes: null,
        notesSource: null,
        notesTimestamp: null,
        markedForDeletionAt: null,
        markedForDeletionBy: null,
        markedForDeletionByDeviceId: null,
        deletionApprovedAt: null,
        deletionApprovedBy: null,
      };
      expect(isValid(FaultEntrySchema, faultWithNulls)).toBe(true);
    });

    it('should reject fault without required fields', () => {
      const { bib, ...noBib } = validFault;
      expect(isValid(FaultEntrySchema, noBib)).toBe(false);

      const { gateNumber, ...noGate } = validFault;
      expect(isValid(FaultEntrySchema, noGate)).toBe(false);

      const { faultType, ...noType } = validFault;
      expect(isValid(FaultEntrySchema, noType)).toBe(false);
    });

    it('should reject fault with gateNumber < 1', () => {
      expect(isValid(FaultEntrySchema, { ...validFault, gateNumber: 0 })).toBe(
        false,
      );
      expect(isValid(FaultEntrySchema, { ...validFault, gateNumber: -1 })).toBe(
        false,
      );
    });

    it('should reject fault with invalid faultType', () => {
      expect(
        isValid(FaultEntrySchema, { ...validFault, faultType: 'XX' }),
      ).toBe(false);
    });

    it('should reject fault with invalid notesSource', () => {
      expect(
        isValid(FaultEntrySchema, { ...validFault, notesSource: 'keyboard' }),
      ).toBe(false);
    });

    it('should accept notesSource of voice or manual', () => {
      expect(
        isValid(FaultEntrySchema, { ...validFault, notesSource: 'voice' }),
      ).toBe(true);
      expect(
        isValid(FaultEntrySchema, { ...validFault, notesSource: 'manual' }),
      ).toBe(true);
    });
  });

  describe('FaultPostBodySchema', () => {
    const validFault = {
      id: 'fault-1',
      bib: '042',
      run: 1 as const,
      gateNumber: 5,
      faultType: 'MG' as const,
      timestamp: '2024-01-01T12:00:00.000Z',
      gateRange: [1, 30],
    };

    it('should accept valid fault post body', () => {
      expect(isValid(FaultPostBodySchema, { fault: validFault })).toBe(true);
    });

    it('should accept with all optional fields', () => {
      expect(
        isValid(FaultPostBodySchema, {
          fault: validFault,
          deviceId: 'dev_abc',
          deviceName: 'Gate Judge 1',
          gateRange: [1, 30],
          isReady: true,
          firstGateColor: 'red',
        }),
      ).toBe(true);
    });

    it('should accept firstGateColor red or blue', () => {
      expect(
        isValid(FaultPostBodySchema, {
          fault: validFault,
          firstGateColor: 'red',
        }),
      ).toBe(true);
      expect(
        isValid(FaultPostBodySchema, {
          fault: validFault,
          firstGateColor: 'blue',
        }),
      ).toBe(true);
    });

    it('should reject invalid firstGateColor', () => {
      expect(
        isValid(FaultPostBodySchema, {
          fault: validFault,
          firstGateColor: 'green',
        }),
      ).toBe(false);
    });

    it('should reject missing fault', () => {
      expect(isValid(FaultPostBodySchema, { deviceId: 'dev_abc' })).toBe(false);
    });
  });

  describe('FaultDeleteBodySchema', () => {
    it('should accept string faultId', () => {
      expect(isValid(FaultDeleteBodySchema, { faultId: 'fault-1' })).toBe(true);
    });

    it('should accept numeric faultId', () => {
      expect(isValid(FaultDeleteBodySchema, { faultId: 42 })).toBe(true);
    });

    it('should accept with optional fields', () => {
      expect(
        isValid(FaultDeleteBodySchema, {
          faultId: 'fault-1',
          deviceId: 'dev_chief',
          deviceName: 'Chief Judge',
          approvedBy: 'Judge A',
        }),
      ).toBe(true);
    });

    it('should reject missing faultId', () => {
      expect(isValid(FaultDeleteBodySchema, {})).toBe(false);
    });
  });

  // ─── Auth Schemas ───

  describe('TokenRequestSchema', () => {
    it('should accept valid pin', () => {
      expect(isValid(TokenRequestSchema, { pin: '1234' })).toBe(true);
    });

    it('should accept pin with optional role', () => {
      expect(isValid(TokenRequestSchema, { pin: '1234', role: 'timer' })).toBe(
        true,
      );
      expect(
        isValid(TokenRequestSchema, { pin: '1234', role: 'gateJudge' }),
      ).toBe(true);
      expect(
        isValid(TokenRequestSchema, { pin: '1234', role: 'chiefJudge' }),
      ).toBe(true);
    });

    it('should reject invalid pin', () => {
      expect(isValid(TokenRequestSchema, { pin: '123' })).toBe(false);
      expect(isValid(TokenRequestSchema, { pin: 'abcd' })).toBe(false);
    });

    it('should reject invalid role', () => {
      expect(isValid(TokenRequestSchema, { pin: '1234', role: 'admin' })).toBe(
        false,
      );
    });

    it('should reject missing pin', () => {
      expect(isValid(TokenRequestSchema, {})).toBe(false);
    });
  });

  describe('ChangePinBodySchema', () => {
    it('should accept valid currentPin and newPin', () => {
      expect(
        isValid(ChangePinBodySchema, { currentPin: '1234', newPin: '5678' }),
      ).toBe(true);
    });

    it('should reject invalid currentPin', () => {
      expect(
        isValid(ChangePinBodySchema, { currentPin: 'abc', newPin: '5678' }),
      ).toBe(false);
    });

    it('should reject invalid newPin', () => {
      expect(
        isValid(ChangePinBodySchema, { currentPin: '1234', newPin: 'bad' }),
      ).toBe(false);
    });

    it('should reject missing fields', () => {
      expect(isValid(ChangePinBodySchema, { currentPin: '1234' })).toBe(false);
      expect(isValid(ChangePinBodySchema, { newPin: '5678' })).toBe(false);
    });
  });

  describe('ResetPinBodySchema', () => {
    it('should accept non-empty serverPin', () => {
      expect(isValid(ResetPinBodySchema, { serverPin: 'my-secret' })).toBe(
        true,
      );
    });

    it('should reject empty serverPin', () => {
      expect(isValid(ResetPinBodySchema, { serverPin: '' })).toBe(false);
    });

    it('should reject missing serverPin', () => {
      expect(isValid(ResetPinBodySchema, {})).toBe(false);
    });
  });

  // ─── validate() helper ───

  describe('validate()', () => {
    it('should return success with parsed data for valid input', () => {
      const result = validate(RaceIdSchema, 'RACE-001');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('RACE-001');
      }
    });

    it('should return error for invalid input', () => {
      const result = validate(RaceIdSchema, '');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }
    });

    it('should include path in error message for nested schemas', () => {
      const result = validate(EntrySchema, {
        id: 'test',
        point: 'INVALID',
        timestamp: '2024-01-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('point');
      }
    });

    it('should return generic message when no path available', () => {
      const result = validate(PinSchema, 123);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }
    });

    it('should handle complex object validation', () => {
      const result = validate(SyncPostBodySchema, {
        entry: {
          id: 'test-1',
          point: 'S',
          timestamp: '2024-01-01T12:00:00.000Z',
        },
        deviceId: 'dev_abc',
      });
      expect(result.success).toBe(true);
    });

    it('should return first issue error for deeply nested invalid data', () => {
      const result = validate(FaultPostBodySchema, {
        fault: {
          id: '',
          bib: '',
          run: 99,
          gateNumber: 0,
          faultType: 'XX',
          timestamp: 'invalid',
          gateRange: [],
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
