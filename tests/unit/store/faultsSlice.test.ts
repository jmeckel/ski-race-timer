/**
 * Unit Tests for Faults Slice
 * Tests: CRUD operations, version history, deletion workflow,
 *        cloud sync/merge, filtering, sorting
 */

import { describe, expect, it } from 'vitest';
import {
  addFaultEntry,
  appendToVersionHistory,
  approveFaultDeletion,
  createFaultVersion,
  deleteFaultEntry,
  extractFaultVersionData,
  getFaultsForBib,
  getPendingDeletions,
  markFaultForDeletion,
  markFaultSynced,
  mergeFaultsFromCloud,
  rejectFaultDeletion,
  removeDeletedCloudFaults,
  restoreFaultVersion,
  updateFaultEntry,
  updateFaultEntryWithHistory,
} from '../../../src/store/slices/faultsSlice';
import type { FaultEntry, FaultVersion } from '../../../src/types';

// Helper to create a valid fault entry for testing
function createTestFault(overrides: Partial<FaultEntry> = {}): FaultEntry {
  return {
    id: `fault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    bib: '042',
    run: 1,
    gateNumber: 5,
    faultType: 'MG',
    timestamp: new Date().toISOString(),
    deviceId: 'dev_judge1',
    deviceName: 'Judge 1',
    gateRange: [1, 10] as [number, number],
    currentVersion: 1,
    versionHistory: [],
    markedForDeletion: false,
    ...overrides,
  };
}

// Helper to create a fault without version fields (for addFaultEntry input)
function createTestFaultInput(
  overrides: Partial<
    Omit<FaultEntry, 'currentVersion' | 'versionHistory' | 'markedForDeletion'>
  > = {},
): Omit<FaultEntry, 'currentVersion' | 'versionHistory' | 'markedForDeletion'> {
  return {
    id: `fault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    bib: '042',
    run: 1,
    gateNumber: 5,
    faultType: 'MG',
    timestamp: new Date().toISOString(),
    deviceId: 'dev_judge1',
    deviceName: 'Judge 1',
    gateRange: [1, 10] as [number, number],
    ...overrides,
  };
}

describe('Faults Slice', () => {
  describe('extractFaultVersionData', () => {
    it('should extract all relevant data fields from a fault entry', () => {
      const fault = createTestFault({
        id: 'fault-1',
        bib: '099',
        run: 2,
        gateNumber: 7,
        faultType: 'STR',
        timestamp: '2024-01-15T10:30:00.000Z',
        deviceId: 'dev_judge2',
        deviceName: 'Judge 2',
        gateRange: [5, 15],
        syncedAt: 1705312200000,
        notes: 'Racer straddled the gate',
        notesSource: 'manual',
        notesTimestamp: '2024-01-15T10:31:00.000Z',
      });

      const data = extractFaultVersionData(fault);

      expect(data.id).toBe('fault-1');
      expect(data.bib).toBe('099');
      expect(data.run).toBe(2);
      expect(data.gateNumber).toBe(7);
      expect(data.faultType).toBe('STR');
      expect(data.timestamp).toBe('2024-01-15T10:30:00.000Z');
      expect(data.deviceId).toBe('dev_judge2');
      expect(data.deviceName).toBe('Judge 2');
      expect(data.gateRange).toEqual([5, 15]);
      expect(data.syncedAt).toBe(1705312200000);
      expect(data.notes).toBe('Racer straddled the gate');
      expect(data.notesSource).toBe('manual');
      expect(data.notesTimestamp).toBe('2024-01-15T10:31:00.000Z');
    });

    it('should handle fault entry without optional fields', () => {
      const fault = createTestFault();
      const data = extractFaultVersionData(fault);

      expect(data.notes).toBeUndefined();
      expect(data.notesSource).toBeUndefined();
      expect(data.notesTimestamp).toBeUndefined();
      expect(data.syncedAt).toBeUndefined();
    });

    it('should work with fault input (without version fields)', () => {
      const input = createTestFaultInput({ bib: '001', gateNumber: 3 });
      const data = extractFaultVersionData(input);

      expect(data.bib).toBe('001');
      expect(data.gateNumber).toBe(3);
    });
  });

  describe('createFaultVersion', () => {
    it('should create a version record with all fields', () => {
      const data: FaultVersion['data'] = {
        id: 'fault-1',
        bib: '042',
        run: 1,
        gateNumber: 5,
        faultType: 'MG',
        timestamp: '2024-01-15T10:00:00.000Z',
        deviceId: 'dev_judge1',
        deviceName: 'Judge 1',
        gateRange: [1, 10],
      };

      const version = createFaultVersion(
        1,
        'create',
        data,
        'Judge 1',
        'dev_judge1',
      );

      expect(version.version).toBe(1);
      expect(version.changeType).toBe('create');
      expect(version.data).toEqual(data);
      expect(version.editedBy).toBe('Judge 1');
      expect(version.editedByDeviceId).toBe('dev_judge1');
      expect(version.timestamp).toBeDefined();
      expect(version.changeDescription).toBeUndefined();
    });

    it('should include changeDescription when provided', () => {
      const data: FaultVersion['data'] = {
        id: 'fault-1',
        bib: '042',
        run: 1,
        gateNumber: 5,
        faultType: 'MG',
        timestamp: '2024-01-15T10:00:00.000Z',
        deviceId: 'dev_judge1',
        deviceName: 'Judge 1',
        gateRange: [1, 10],
      };

      const version = createFaultVersion(
        2,
        'edit',
        data,
        'Judge 1',
        'dev_judge1',
        'Changed gate number',
      );

      expect(version.changeDescription).toBe('Changed gate number');
      expect(version.changeType).toBe('edit');
      expect(version.version).toBe(2);
    });

    it('should generate ISO timestamp', () => {
      const data: FaultVersion['data'] = {
        id: 'fault-1',
        bib: '042',
        run: 1,
        gateNumber: 5,
        faultType: 'MG',
        timestamp: '2024-01-15T10:00:00.000Z',
        deviceId: 'dev_judge1',
        deviceName: 'Judge 1',
        gateRange: [1, 10],
      };

      const version = createFaultVersion(
        1,
        'create',
        data,
        'Judge 1',
        'dev_judge1',
      );

      // Should be a valid ISO date
      expect(Number.isNaN(Date.parse(version.timestamp))).toBe(false);
    });
  });

  describe('appendToVersionHistory', () => {
    it('should append to empty history', () => {
      const newVersion: FaultVersion = {
        version: 1,
        timestamp: new Date().toISOString(),
        editedBy: 'Judge 1',
        editedByDeviceId: 'dev_judge1',
        changeType: 'create',
        data: {
          id: 'fault-1',
          bib: '042',
          run: 1,
          gateNumber: 5,
          faultType: 'MG',
          timestamp: '2024-01-15T10:00:00.000Z',
          deviceId: 'dev_judge1',
          deviceName: 'Judge 1',
          gateRange: [1, 10],
        },
      };

      const result = appendToVersionHistory(undefined, newVersion);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(newVersion);
    });

    it('should append to existing history', () => {
      const existingVersion: FaultVersion = {
        version: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        editedBy: 'Judge 1',
        editedByDeviceId: 'dev_judge1',
        changeType: 'create',
        data: {
          id: 'fault-1',
          bib: '042',
          run: 1,
          gateNumber: 5,
          faultType: 'MG',
          timestamp: '2024-01-15T10:00:00.000Z',
          deviceId: 'dev_judge1',
          deviceName: 'Judge 1',
          gateRange: [1, 10],
        },
      };

      const newVersion: FaultVersion = {
        ...existingVersion,
        version: 2,
        changeType: 'edit',
      };

      const result = appendToVersionHistory([existingVersion], newVersion);

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(1);
      expect(result[1].version).toBe(2);
    });

    it('should trim history when exceeding MAX_VERSION_HISTORY (50)', () => {
      const versions: FaultVersion[] = [];
      for (let i = 1; i <= 50; i++) {
        versions.push({
          version: i,
          timestamp: new Date().toISOString(),
          editedBy: 'Judge 1',
          editedByDeviceId: 'dev_judge1',
          changeType: 'edit',
          data: {
            id: 'fault-1',
            bib: '042',
            run: 1,
            gateNumber: 5,
            faultType: 'MG',
            timestamp: '2024-01-15T10:00:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
          },
        });
      }

      const newVersion: FaultVersion = {
        ...versions[0],
        version: 51,
      };

      const result = appendToVersionHistory(versions, newVersion);

      expect(result).toHaveLength(50);
      // Should keep the most recent 50, dropping version 1
      expect(result[0].version).toBe(2);
      expect(result[result.length - 1].version).toBe(51);
    });

    it('should not trim when exactly at MAX_VERSION_HISTORY', () => {
      const versions: FaultVersion[] = [];
      for (let i = 1; i <= 49; i++) {
        versions.push({
          version: i,
          timestamp: new Date().toISOString(),
          editedBy: 'Judge 1',
          editedByDeviceId: 'dev_judge1',
          changeType: 'edit',
          data: {
            id: 'fault-1',
            bib: '042',
            run: 1,
            gateNumber: 5,
            faultType: 'MG',
            timestamp: '2024-01-15T10:00:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
          },
        });
      }

      const newVersion: FaultVersion = {
        ...versions[0],
        version: 50,
      };

      const result = appendToVersionHistory(versions, newVersion);

      expect(result).toHaveLength(50);
      expect(result[0].version).toBe(1);
    });
  });

  describe('addFaultEntry', () => {
    it('should add a fault entry with version tracking to empty array', () => {
      const input = createTestFaultInput({ id: 'fault-new', bib: '010' });
      const result = addFaultEntry([], input);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('fault-new');
      expect(result[0].bib).toBe('010');
      expect(result[0].currentVersion).toBe(1);
      expect(result[0].versionHistory).toHaveLength(1);
      expect(result[0].versionHistory[0].changeType).toBe('create');
      expect(result[0].versionHistory[0].version).toBe(1);
      expect(result[0].markedForDeletion).toBe(false);
    });

    it('should add a fault entry to existing array', () => {
      const existing = [createTestFault({ id: 'fault-existing' })];
      const input = createTestFaultInput({ id: 'fault-new' });
      const result = addFaultEntry(existing, input);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('fault-existing');
      expect(result[1].id).toBe('fault-new');
    });

    it('should preserve voice notes in version data', () => {
      const input = createTestFaultInput({
        notes: 'Missed the blue gate',
        notesSource: 'voice',
        notesTimestamp: '2024-01-15T10:30:00.000Z',
      });

      const result = addFaultEntry([], input);

      expect(result[0].versionHistory[0].data.notes).toBe(
        'Missed the blue gate',
      );
      expect(result[0].versionHistory[0].data.notesSource).toBe('voice');
    });

    it('should not mutate the original array', () => {
      const original: FaultEntry[] = [];
      const input = createTestFaultInput();
      const result = addFaultEntry(original, input);

      expect(original).toHaveLength(0);
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteFaultEntry', () => {
    it('should remove a fault by id', () => {
      const faults = [
        createTestFault({ id: 'fault-1' }),
        createTestFault({ id: 'fault-2' }),
        createTestFault({ id: 'fault-3' }),
      ];

      const result = deleteFaultEntry(faults, 'fault-2');

      expect(result).toHaveLength(2);
      expect(result.find((f) => f.id === 'fault-2')).toBeUndefined();
    });

    it('should return original array if id not found', () => {
      const faults = [createTestFault({ id: 'fault-1' })];
      const result = deleteFaultEntry(faults, 'nonexistent');

      expect(result).toHaveLength(1);
    });

    it('should handle empty array', () => {
      const result = deleteFaultEntry([], 'fault-1');
      expect(result).toHaveLength(0);
    });

    it('should not mutate the original array', () => {
      const faults = [createTestFault({ id: 'fault-1' })];
      const result = deleteFaultEntry(faults, 'fault-1');

      expect(faults).toHaveLength(1);
      expect(result).toHaveLength(0);
    });
  });

  describe('updateFaultEntry', () => {
    it('should update a fault entry with provided fields', () => {
      const faults = [
        createTestFault({ id: 'fault-1', bib: '042', gateNumber: 5 }),
      ];

      const result = updateFaultEntry(faults, 'fault-1', {
        bib: '099',
        gateNumber: 8,
      });

      expect(result).not.toBeNull();
      expect(result![0].bib).toBe('099');
      expect(result![0].gateNumber).toBe(8);
    });

    it('should return null if fault not found', () => {
      const faults = [createTestFault({ id: 'fault-1' })];
      const result = updateFaultEntry(faults, 'nonexistent', { bib: '099' });

      expect(result).toBeNull();
    });

    it('should preserve unchanged fields', () => {
      const faults = [
        createTestFault({
          id: 'fault-1',
          bib: '042',
          gateNumber: 5,
          faultType: 'MG',
        }),
      ];

      const result = updateFaultEntry(faults, 'fault-1', { bib: '099' });

      expect(result![0].gateNumber).toBe(5);
      expect(result![0].faultType).toBe('MG');
    });

    it('should not mutate the original array', () => {
      const faults = [createTestFault({ id: 'fault-1', bib: '042' })];
      updateFaultEntry(faults, 'fault-1', { bib: '099' });

      expect(faults[0].bib).toBe('042');
    });
  });

  describe('updateFaultEntryWithHistory', () => {
    it('should update fault with version history tracking', () => {
      const fault = createTestFault({
        id: 'fault-1',
        bib: '042',
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
              gateNumber: 5,
              faultType: 'MG',
              timestamp: '2024-01-15T10:00:00.000Z',
              deviceId: 'dev_judge1',
              deviceName: 'Judge 1',
              gateRange: [1, 10],
            },
          },
        ],
      });

      const result = updateFaultEntryWithHistory(
        [fault],
        'fault-1',
        { bib: '099', gateNumber: 8 },
        'Judge 2',
        'dev_judge2',
        'Corrected bib and gate',
      );

      expect(result).not.toBeNull();
      expect(result![0].bib).toBe('099');
      expect(result![0].gateNumber).toBe(8);
      expect(result![0].currentVersion).toBe(2);
      expect(result![0].versionHistory).toHaveLength(2);
      expect(result![0].versionHistory[1].changeType).toBe('edit');
      expect(result![0].versionHistory[1].editedBy).toBe('Judge 2');
      expect(result![0].versionHistory[1].changeDescription).toBe(
        'Corrected bib and gate',
      );
    });

    it('should return null if fault not found', () => {
      const result = updateFaultEntryWithHistory(
        [],
        'nonexistent',
        { bib: '099' },
        'Judge 1',
        'dev_judge1',
      );

      expect(result).toBeNull();
    });

    it('should return null if fault is marked for deletion', () => {
      const fault = createTestFault({
        id: 'fault-1',
        markedForDeletion: true,
      });

      const result = updateFaultEntryWithHistory(
        [fault],
        'fault-1',
        { bib: '099' },
        'Judge 1',
        'dev_judge1',
      );

      expect(result).toBeNull();
    });

    it('should update notes fields', () => {
      const fault = createTestFault({
        id: 'fault-1',
        currentVersion: 1,
        versionHistory: [],
      });

      const result = updateFaultEntryWithHistory(
        [fault],
        'fault-1',
        {
          notes: 'Gate was missed',
          notesSource: 'manual',
          notesTimestamp: '2024-01-15T11:00:00.000Z',
        },
        'Judge 1',
        'dev_judge1',
      );

      expect(result).not.toBeNull();
      expect(result![0].notes).toBe('Gate was missed');
      expect(result![0].notesSource).toBe('manual');
    });

    it('should work without changeDescription', () => {
      const fault = createTestFault({
        id: 'fault-1',
        currentVersion: 1,
        versionHistory: [],
      });

      const result = updateFaultEntryWithHistory(
        [fault],
        'fault-1',
        { bib: '099' },
        'Judge 1',
        'dev_judge1',
      );

      expect(result).not.toBeNull();
      expect(result![0].versionHistory[0].changeDescription).toBeUndefined();
    });
  });

  describe('restoreFaultVersion', () => {
    it('should restore fault to a previous version', () => {
      const v1Data: FaultVersion['data'] = {
        id: 'fault-1',
        bib: '042',
        run: 1,
        gateNumber: 5,
        faultType: 'MG',
        timestamp: '2024-01-15T10:00:00.000Z',
        deviceId: 'dev_judge1',
        deviceName: 'Judge 1',
        gateRange: [1, 10],
        notes: 'Original note',
        notesSource: 'manual' as const,
        notesTimestamp: '2024-01-15T10:01:00.000Z',
      };

      const fault = createTestFault({
        id: 'fault-1',
        bib: '099', // Changed from v1
        gateNumber: 8, // Changed from v1
        currentVersion: 2,
        versionHistory: [
          {
            version: 1,
            timestamp: '2024-01-15T10:00:00.000Z',
            editedBy: 'Judge 1',
            editedByDeviceId: 'dev_judge1',
            changeType: 'create',
            data: v1Data,
          },
          {
            version: 2,
            timestamp: '2024-01-15T10:30:00.000Z',
            editedBy: 'Judge 2',
            editedByDeviceId: 'dev_judge2',
            changeType: 'edit',
            data: {
              ...v1Data,
              bib: '099',
              gateNumber: 8,
            },
          },
        ],
      });

      const result = restoreFaultVersion(
        [fault],
        'fault-1',
        1,
        'Chief Judge',
        'dev_chief',
      );

      expect(result).not.toBeNull();
      expect(result![0].bib).toBe('042');
      expect(result![0].gateNumber).toBe(5);
      expect(result![0].currentVersion).toBe(3);
      expect(result![0].versionHistory).toHaveLength(3);
      expect(result![0].versionHistory[2].changeType).toBe('restore');
      expect(result![0].versionHistory[2].changeDescription).toBe(
        'Restored to version 1',
      );
      expect(result![0].notes).toBe('Original note');
      expect(result![0].notesSource).toBe('manual');
      expect(result![0].notesTimestamp).toBe('2024-01-15T10:01:00.000Z');
    });

    it('should return null if fault not found', () => {
      const result = restoreFaultVersion(
        [],
        'nonexistent',
        1,
        'Chief',
        'dev_chief',
      );
      expect(result).toBeNull();
    });

    it('should return null if fault is marked for deletion', () => {
      const fault = createTestFault({
        id: 'fault-1',
        markedForDeletion: true,
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
              gateNumber: 5,
              faultType: 'MG',
              timestamp: '2024-01-15T10:00:00.000Z',
              deviceId: 'dev_judge1',
              deviceName: 'Judge 1',
              gateRange: [1, 10],
            },
          },
        ],
      });

      const result = restoreFaultVersion(
        [fault],
        'fault-1',
        1,
        'Chief',
        'dev_chief',
      );
      expect(result).toBeNull();
    });

    it('should return null if version number not found in history', () => {
      const fault = createTestFault({
        id: 'fault-1',
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
              gateNumber: 5,
              faultType: 'MG',
              timestamp: '2024-01-15T10:00:00.000Z',
              deviceId: 'dev_judge1',
              deviceName: 'Judge 1',
              gateRange: [1, 10],
            },
          },
        ],
      });

      const result = restoreFaultVersion(
        [fault],
        'fault-1',
        99,
        'Chief',
        'dev_chief',
      );
      expect(result).toBeNull();
    });
  });

  describe('markFaultForDeletion', () => {
    it('should mark a fault for deletion', () => {
      const faults = [createTestFault({ id: 'fault-1' })];

      const result = markFaultForDeletion(
        faults,
        'fault-1',
        'Judge 1',
        'dev_judge1',
      );

      expect(result).not.toBeNull();
      expect(result![0].markedForDeletion).toBe(true);
      expect(result![0].markedForDeletionBy).toBe('Judge 1');
      expect(result![0].markedForDeletionByDeviceId).toBe('dev_judge1');
      expect(result![0].markedForDeletionAt).toBeDefined();
      // Verify it is a valid ISO date
      expect(Number.isNaN(Date.parse(result![0].markedForDeletionAt!))).toBe(
        false,
      );
    });

    it('should return null if fault not found', () => {
      const result = markFaultForDeletion(
        [],
        'nonexistent',
        'Judge 1',
        'dev_judge1',
      );
      expect(result).toBeNull();
    });

    it('should not mutate the original array', () => {
      const faults = [createTestFault({ id: 'fault-1' })];
      markFaultForDeletion(faults, 'fault-1', 'Judge 1', 'dev_judge1');

      expect(faults[0].markedForDeletion).toBe(false);
    });
  });

  describe('approveFaultDeletion', () => {
    it('should remove the fault and return the approved fault', () => {
      const faults = [
        createTestFault({
          id: 'fault-1',
          markedForDeletion: true,
          markedForDeletionBy: 'Judge 1',
        }),
      ];

      const result = approveFaultDeletion(faults, 'fault-1', 'Chief Judge');

      expect(result.faultEntries).toHaveLength(0);
      expect(result.approvedFault).not.toBeNull();
      expect(result.approvedFault!.deletionApprovedBy).toBe('Chief Judge');
      expect(result.approvedFault!.deletionApprovedAt).toBeDefined();
    });

    it('should return null for approvedFault if fault not found', () => {
      const result = approveFaultDeletion([], 'nonexistent', 'Chief');

      expect(result.faultEntries).toHaveLength(0);
      expect(result.approvedFault).toBeNull();
    });

    it('should return null for approvedFault if fault not marked for deletion', () => {
      const faults = [
        createTestFault({ id: 'fault-1', markedForDeletion: false }),
      ];

      const result = approveFaultDeletion(faults, 'fault-1', 'Chief');

      expect(result.faultEntries).toHaveLength(1);
      expect(result.approvedFault).toBeNull();
    });

    it('should only remove the approved fault, keeping others', () => {
      const faults = [
        createTestFault({
          id: 'fault-1',
          markedForDeletion: true,
        }),
        createTestFault({ id: 'fault-2' }),
      ];

      const result = approveFaultDeletion(faults, 'fault-1', 'Chief');

      expect(result.faultEntries).toHaveLength(1);
      expect(result.faultEntries[0].id).toBe('fault-2');
    });
  });

  describe('rejectFaultDeletion', () => {
    it('should unmark fault and add version record', () => {
      const fault = createTestFault({
        id: 'fault-1',
        markedForDeletion: true,
        markedForDeletionAt: '2024-01-15T10:00:00.000Z',
        markedForDeletionBy: 'Judge 1',
        markedForDeletionByDeviceId: 'dev_judge1',
        currentVersion: 1,
        versionHistory: [],
      });

      const result = rejectFaultDeletion(
        [fault],
        'fault-1',
        'Chief Judge',
        'dev_chief',
      );

      expect(result).not.toBeNull();
      expect(result![0].markedForDeletion).toBe(false);
      expect(result![0].markedForDeletionAt).toBeUndefined();
      expect(result![0].markedForDeletionBy).toBeUndefined();
      expect(result![0].markedForDeletionByDeviceId).toBeUndefined();
      expect(result![0].currentVersion).toBe(2);
      expect(result![0].versionHistory).toHaveLength(1);
      expect(result![0].versionHistory[0].changeDescription).toBe(
        'Deletion rejected by Chief Judge',
      );
    });

    it('should return null if fault not found', () => {
      const result = rejectFaultDeletion(
        [],
        'nonexistent',
        'Chief',
        'dev_chief',
      );
      expect(result).toBeNull();
    });
  });

  describe('getPendingDeletions', () => {
    it('should return faults marked for deletion', () => {
      const faults = [
        createTestFault({ id: 'fault-1', markedForDeletion: true }),
        createTestFault({ id: 'fault-2', markedForDeletion: false }),
        createTestFault({ id: 'fault-3', markedForDeletion: true }),
      ];

      const result = getPendingDeletions(faults);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('fault-1');
      expect(result[1].id).toBe('fault-3');
    });

    it('should return empty array when no pending deletions', () => {
      const faults = [
        createTestFault({ id: 'fault-1', markedForDeletion: false }),
      ];

      const result = getPendingDeletions(faults);
      expect(result).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
      expect(getPendingDeletions([])).toHaveLength(0);
    });
  });

  describe('getFaultsForBib', () => {
    it('should return faults matching bib and run', () => {
      const faults = [
        createTestFault({ id: 'f1', bib: '042', run: 1 }),
        createTestFault({ id: 'f2', bib: '042', run: 2 }),
        createTestFault({ id: 'f3', bib: '099', run: 1 }),
        createTestFault({ id: 'f4', bib: '042', run: 1 }),
      ];

      const result = getFaultsForBib(faults, '042', 1);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('f1');
      expect(result[1].id).toBe('f4');
    });

    it('should return empty array for no matches', () => {
      const faults = [createTestFault({ bib: '042', run: 1 })];
      const result = getFaultsForBib(faults, '099', 1);

      expect(result).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
      expect(getFaultsForBib([], '042', 1)).toHaveLength(0);
    });
  });

  describe('markFaultSynced', () => {
    it('should set syncedAt timestamp', () => {
      const before = Date.now();
      const faults = [createTestFault({ id: 'fault-1' })];

      const result = markFaultSynced(faults, 'fault-1');

      expect(result[0].syncedAt).toBeDefined();
      expect(result[0].syncedAt!).toBeGreaterThanOrEqual(before);
    });

    it('should return original array if fault not found', () => {
      const faults = [createTestFault({ id: 'fault-1' })];
      const result = markFaultSynced(faults, 'nonexistent');

      expect(result).toBe(faults); // Same reference
    });

    it('should not mutate the original array', () => {
      const faults = [createTestFault({ id: 'fault-1' })];
      const result = markFaultSynced(faults, 'fault-1');

      expect(faults[0].syncedAt).toBeUndefined();
      expect(result[0].syncedAt).toBeDefined();
    });
  });

  describe('mergeFaultsFromCloud', () => {
    it('should add new faults from cloud', () => {
      const localFaults: FaultEntry[] = [];
      const cloudFaults = [
        createTestFault({
          id: 'cloud-fault-1',
          deviceId: 'dev_remote',
          timestamp: '2024-01-15T10:00:00.000Z',
        }),
      ];

      const result = mergeFaultsFromCloud(
        localFaults,
        cloudFaults,
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(1);
      expect(result.faultEntries).toHaveLength(1);
      expect(result.faultEntries[0].id).toBe('cloud-fault-1');
    });

    it('should skip faults from local device', () => {
      const cloudFaults = [
        createTestFault({
          id: 'local-fault-1',
          deviceId: 'dev_local',
        }),
      ];

      const result = mergeFaultsFromCloud([], cloudFaults, [], 'dev_local');

      expect(result.addedCount).toBe(0);
      expect(result.faultEntries).toHaveLength(0);
    });

    it('should skip deleted faults (using id:deviceId key)', () => {
      const cloudFaults = [
        createTestFault({
          id: 'deleted-fault',
          deviceId: 'dev_remote',
        }),
      ];

      const result = mergeFaultsFromCloud(
        [],
        cloudFaults,
        ['deleted-fault:dev_remote'],
        'dev_local',
      );

      expect(result.addedCount).toBe(0);
    });

    it('should skip deleted faults (using plain id)', () => {
      const cloudFaults = [
        createTestFault({
          id: 'deleted-fault',
          deviceId: 'dev_remote',
        }),
      ];

      const result = mergeFaultsFromCloud(
        [],
        cloudFaults,
        ['deleted-fault'],
        'dev_local',
      );

      expect(result.addedCount).toBe(0);
    });

    it('should skip invalid cloud faults', () => {
      const invalidFaults = [{ invalid: true }, null, 42, 'not a fault'];

      const result = mergeFaultsFromCloud(
        [],
        invalidFaults as unknown[],
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(0);
    });

    it('should update existing fault when cloud version is newer', () => {
      const localFault = createTestFault({
        id: 'fault-1',
        deviceId: 'dev_remote',
        bib: '042',
        currentVersion: 1,
      });

      const cloudFault = createTestFault({
        id: 'fault-1',
        deviceId: 'dev_remote',
        bib: '099',
        currentVersion: 2,
      });

      const result = mergeFaultsFromCloud(
        [localFault],
        [cloudFault],
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(1); // counts as updated
      expect(result.faultEntries).toHaveLength(1);
      expect(result.faultEntries[0].bib).toBe('099');
    });

    it('should update when markedForDeletion status differs', () => {
      const localFault = createTestFault({
        id: 'fault-1',
        deviceId: 'dev_remote',
        markedForDeletion: false,
        currentVersion: 1,
      });

      const cloudFault = createTestFault({
        id: 'fault-1',
        deviceId: 'dev_remote',
        markedForDeletion: true,
        currentVersion: 1,
      });

      const result = mergeFaultsFromCloud(
        [localFault],
        [cloudFault],
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(1);
      expect(result.faultEntries[0].markedForDeletion).toBe(true);
    });

    it('should not update when cloud version is same and same deletion status', () => {
      const localFault = createTestFault({
        id: 'fault-1',
        deviceId: 'dev_remote',
        bib: '042',
        currentVersion: 1,
      });

      const cloudFault = createTestFault({
        id: 'fault-1',
        deviceId: 'dev_remote',
        bib: '099',
        currentVersion: 1,
      });

      const result = mergeFaultsFromCloud(
        [localFault],
        [cloudFault],
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(0);
      // Original kept as-is
      expect(result.faultEntries[0].bib).toBe('042');
    });

    it('should sort merged faults by timestamp', () => {
      const localFaults: FaultEntry[] = [];
      const cloudFaults = [
        createTestFault({
          id: 'fault-late',
          deviceId: 'dev_remote1',
          timestamp: '2024-01-15T12:00:00.000Z',
        }),
        createTestFault({
          id: 'fault-early',
          deviceId: 'dev_remote2',
          timestamp: '2024-01-15T08:00:00.000Z',
        }),
      ];

      const result = mergeFaultsFromCloud(
        localFaults,
        cloudFaults,
        [],
        'dev_local',
      );

      expect(result.faultEntries[0].id).toBe('fault-early');
      expect(result.faultEntries[1].id).toBe('fault-late');
    });

    it('should return original faultEntries when no new or updated faults', () => {
      const localFaults = [
        createTestFault({ id: 'fault-1', deviceId: 'dev_remote' }),
      ];
      // No cloud faults
      const result = mergeFaultsFromCloud(localFaults, [], [], 'dev_local');

      expect(result.addedCount).toBe(0);
      expect(result.faultEntries).toBe(localFaults); // Same reference
    });

    it('should handle faults with undefined currentVersion (default to 1)', () => {
      const localFault = createTestFault({
        id: 'fault-1',
        deviceId: 'dev_remote',
        currentVersion: undefined as unknown as number,
      });

      const cloudFault = createTestFault({
        id: 'fault-1',
        deviceId: 'dev_remote',
        currentVersion: 2,
      });

      const result = mergeFaultsFromCloud(
        [localFault],
        [cloudFault],
        [],
        'dev_local',
      );

      // Cloud version 2 > default 1, so should update
      expect(result.addedCount).toBe(1);
    });
  });

  describe('removeDeletedCloudFaults', () => {
    it('should remove faults matching deleted id:deviceId keys', () => {
      const faults = [
        createTestFault({ id: 'fault-1', deviceId: 'dev_remote' }),
        createTestFault({ id: 'fault-2', deviceId: 'dev_remote' }),
      ];

      const result = removeDeletedCloudFaults(faults, ['fault-1:dev_remote']);

      expect(result.removedCount).toBe(1);
      expect(result.faultEntries).toHaveLength(1);
      expect(result.faultEntries[0].id).toBe('fault-2');
    });

    it('should remove faults matching deleted plain ids', () => {
      const faults = [
        createTestFault({ id: 'fault-1', deviceId: 'dev_remote' }),
      ];

      const result = removeDeletedCloudFaults(faults, ['fault-1']);

      expect(result.removedCount).toBe(1);
      expect(result.faultEntries).toHaveLength(0);
    });

    it('should return zero removedCount when no matches', () => {
      const faults = [createTestFault({ id: 'fault-1' })];

      const result = removeDeletedCloudFaults(faults, ['nonexistent']);

      expect(result.removedCount).toBe(0);
      expect(result.faultEntries).toHaveLength(1);
    });

    it('should handle empty deletedIds', () => {
      const faults = [createTestFault({ id: 'fault-1' })];

      const result = removeDeletedCloudFaults(faults, []);

      expect(result.removedCount).toBe(0);
      expect(result.faultEntries).toHaveLength(1);
    });

    it('should handle empty faultEntries', () => {
      const result = removeDeletedCloudFaults([], ['fault-1']);

      expect(result.removedCount).toBe(0);
      expect(result.faultEntries).toHaveLength(0);
    });

    it('should remove multiple faults at once', () => {
      const faults = [
        createTestFault({ id: 'fault-1', deviceId: 'dev_r1' }),
        createTestFault({ id: 'fault-2', deviceId: 'dev_r2' }),
        createTestFault({ id: 'fault-3', deviceId: 'dev_r3' }),
      ];

      const result = removeDeletedCloudFaults(faults, [
        'fault-1:dev_r1',
        'fault-3',
      ]);

      expect(result.removedCount).toBe(2);
      expect(result.faultEntries).toHaveLength(1);
      expect(result.faultEntries[0].id).toBe('fault-2');
    });
  });
});

// Test the re-export from slices/index.ts
describe('Slices Index Re-exports', () => {
  it('should re-export faultsSlice', async () => {
    const slices = await import('../../../src/store/slices/index');
    expect(slices.faultsSlice).toBeDefined();
    expect(slices.faultsSlice.addFaultEntry).toBeDefined();
    expect(slices.faultsSlice.deleteFaultEntry).toBeDefined();
  });

  it('should re-export gateJudgeSlice', async () => {
    const slices = await import('../../../src/store/slices/index');
    expect(slices.gateJudgeSlice).toBeDefined();
    expect(slices.gateJudgeSlice.getGateColor).toBeDefined();
  });

  it('should re-export all expected slices', async () => {
    const slices = await import('../../../src/store/slices/index');
    expect(slices.entriesSlice).toBeDefined();
    expect(slices.faultsSlice).toBeDefined();
    expect(slices.gateJudgeSlice).toBeDefined();
    expect(slices.settingsSlice).toBeDefined();
    expect(slices.syncSlice).toBeDefined();
    expect(slices.uiSlice).toBeDefined();
  });
});
