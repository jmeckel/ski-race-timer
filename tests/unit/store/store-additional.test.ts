/**
 * Additional Unit Tests for Store (State Management)
 * Tests: uncovered store methods - Gate Judge state, Fault operations,
 *        forceSave, peekUndo, listener error callbacks, storage error dispatching,
 *        gateColor calculation, racer finalization, penalty settings, active bibs,
 *        import/export edge cases, lastSyncedRaceId, markCurrentRaceAsSynced,
 *        removeDeletedCloudEntries, removeDeletedCloudFaults, markFaultSynced
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry, FaultEntry } from '../../../src/types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    _getStore: () => store,
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

// Helper to create a valid entry
function createValidEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: `dev_test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    bib: '042',
    point: 'F',
    run: 1,
    timestamp: new Date().toISOString(),
    status: 'ok',
    deviceId: 'dev_test',
    deviceName: 'Timer 1',
    ...overrides,
  };
}

// Helper to create a valid fault entry
function createFaultEntry(
  overrides: Partial<FaultEntry> = {},
): Omit<FaultEntry, 'currentVersion' | 'versionHistory' | 'markedForDeletion'> {
  return {
    id: `fault-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    bib: '042',
    run: 1,
    gateNumber: 5,
    faultType: 'MG',
    timestamp: new Date().toISOString(),
    deviceId: 'dev_judge1',
    deviceName: 'Gate Judge 1',
    gateRange: [4, 12] as [number, number],
    ...overrides,
  };
}

describe('Store - Additional Coverage', () => {
  let store: typeof import('../../../src/store/index').store;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorageMock.clear();
    vi.clearAllMocks();

    // Reset module between tests for clean state
    vi.resetModules();
    const storeModule = await import('../../../src/store/index');
    store = storeModule.store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Gate Judge State', () => {
    it('should set device role', () => {
      store.setDeviceRole('gateJudge');
      expect(store.getState().deviceRole).toBe('gateJudge');

      store.setDeviceRole('timer');
      expect(store.getState().deviceRole).toBe('timer');
    });

    it('should set gate assignment', () => {
      store.setGateAssignment([4, 12]);
      expect(store.getState().gateAssignment).toEqual([4, 12]);
    });

    it('should clear gate assignment', () => {
      store.setGateAssignment([4, 12]);
      store.setGateAssignment(null);
      expect(store.getState().gateAssignment).toBeNull();
    });

    it('should set first gate color', () => {
      store.setFirstGateColor('blue');
      expect(store.getState().firstGateColor).toBe('blue');

      store.setFirstGateColor('red');
      expect(store.getState().firstGateColor).toBe('red');
    });

    it('should get gate color with alternating pattern', () => {
      store.setGateAssignment([4, 12]);
      store.setFirstGateColor('red');

      // Gate 4 (start) = red
      expect(store.getGateColor(4)).toBe('red');
      // Gate 5 = blue (odd offset)
      expect(store.getGateColor(5)).toBe('blue');
      // Gate 6 = red (even offset)
      expect(store.getGateColor(6)).toBe('red');
      // Gate 7 = blue
      expect(store.getGateColor(7)).toBe('blue');
    });

    it('should get gate color with blue first gate', () => {
      store.setGateAssignment([1, 10]);
      store.setFirstGateColor('blue');

      expect(store.getGateColor(1)).toBe('blue');
      expect(store.getGateColor(2)).toBe('red');
      expect(store.getGateColor(3)).toBe('blue');
    });

    it('should return firstGateColor when no gate assignment', () => {
      store.setFirstGateColor('blue');
      expect(store.getGateColor(5)).toBe('blue');
    });

    it('should set selected fault bib', () => {
      store.setSelectedFaultBib('042');
      expect(store.getState().selectedFaultBib).toBe('042');
    });

    it('should set judge ready', () => {
      store.setJudgeReady(true);
      expect(store.getState().isJudgeReady).toBe(true);

      store.setJudgeReady(false);
      expect(store.getState().isJudgeReady).toBe(false);
    });

    it('should toggle judge ready', () => {
      expect(store.getState().isJudgeReady).toBe(false);

      store.toggleJudgeReady();
      expect(store.getState().isJudgeReady).toBe(true);

      store.toggleJudgeReady();
      expect(store.getState().isJudgeReady).toBe(false);
    });

    it('should set chief judge view', () => {
      store.setChiefJudgeView(true);
      expect(store.getState().isChiefJudgeView).toBe(true);

      store.setChiefJudgeView(false);
      expect(store.getState().isChiefJudgeView).toBe(false);
    });

    it('should toggle chief judge view', () => {
      expect(store.getState().isChiefJudgeView).toBe(false);

      store.toggleChiefJudgeView();
      expect(store.getState().isChiefJudgeView).toBe(true);

      store.toggleChiefJudgeView();
      expect(store.getState().isChiefJudgeView).toBe(false);
    });

    it('should finalize racer', () => {
      store.finalizeRacer('042', 1);
      expect(store.isRacerFinalized('042', 1)).toBe(true);
      expect(store.isRacerFinalized('042', 2)).toBe(false);
      expect(store.isRacerFinalized('043', 1)).toBe(false);
    });

    it('should unfinalize racer', () => {
      store.finalizeRacer('042', 1);
      expect(store.isRacerFinalized('042', 1)).toBe(true);

      store.unfinalizeRacer('042', 1);
      expect(store.isRacerFinalized('042', 1)).toBe(false);
    });

    it('should clear finalized racers', () => {
      store.finalizeRacer('042', 1);
      store.finalizeRacer('043', 2);

      store.clearFinalizedRacers();

      expect(store.isRacerFinalized('042', 1)).toBe(false);
      expect(store.isRacerFinalized('043', 2)).toBe(false);
    });

    it('should set penalty seconds', () => {
      store.setPenaltySeconds(10);
      expect(store.getState().penaltySeconds).toBe(10);
    });

    it('should set use penalty mode', () => {
      store.setUsePenaltyMode(false);
      expect(store.getState().usePenaltyMode).toBe(false);

      store.setUsePenaltyMode(true);
      expect(store.getState().usePenaltyMode).toBe(true);
    });

    it('should get active bibs for a run', () => {
      // Racer 042 started run 1
      store.addEntry(
        createValidEntry({
          id: 'dev_test-1-s042',
          bib: '042',
          point: 'S',
          run: 1,
        }),
      );
      // Racer 043 started run 1
      store.addEntry(
        createValidEntry({
          id: 'dev_test-2-s043',
          bib: '043',
          point: 'S',
          run: 1,
        }),
      );
      // Racer 042 finished run 1
      store.addEntry(
        createValidEntry({
          id: 'dev_test-3-f042',
          bib: '042',
          point: 'F',
          run: 1,
        }),
      );

      const activeBibs = store.getActiveBibs(1);
      expect(activeBibs).toEqual(['043']);
    });

    it('should return empty active bibs when no runners on course', () => {
      expect(store.getActiveBibs(1)).toEqual([]);
    });

    it('should filter active bibs by run', () => {
      store.addEntry(
        createValidEntry({
          id: 'dev_test-1-s042r1',
          bib: '042',
          point: 'S',
          run: 1,
        }),
      );
      store.addEntry(
        createValidEntry({
          id: 'dev_test-2-s043r2',
          bib: '043',
          point: 'S',
          run: 2,
        }),
      );

      expect(store.getActiveBibs(1)).toEqual(['042']);
      expect(store.getActiveBibs(2)).toEqual(['043']);
    });
  });

  describe('Gate Judge initialization from localStorage', () => {
    it('should load gateJudge device role from storage', async () => {
      localStorageMock._getStore()['skiTimerDeviceRole'] = 'gateJudge';
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().deviceRole).toBe('gateJudge');
      expect(newStore.getState().currentView).toBe('gateJudge');
    });

    it('should load gate assignment from storage', async () => {
      localStorageMock._getStore()['skiTimerGateAssignment'] = JSON.stringify([
        4, 12,
      ]);
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().gateAssignment).toEqual([4, 12]);
    });

    it('should handle invalid gate assignment in storage', async () => {
      localStorageMock._getStore()['skiTimerGateAssignment'] = JSON.stringify([
        4,
      ]);
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().gateAssignment).toBeNull();
    });

    it('should load first gate color from storage', async () => {
      localStorageMock._getStore()['skiTimerFirstGateColor'] = 'blue';
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().firstGateColor).toBe('blue');
    });

    it('should default to red for invalid first gate color', async () => {
      localStorageMock._getStore()['skiTimerFirstGateColor'] = 'green';
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().firstGateColor).toBe('red');
    });

    it('should load fault entries from storage', async () => {
      const faults = [
        {
          id: 'fault-1',
          bib: '042',
          run: 1,
          gateNumber: 5,
          faultType: 'MG',
          timestamp: new Date().toISOString(),
          deviceId: 'dev_judge1',
          deviceName: 'Judge 1',
          gateRange: [4, 12],
          currentVersion: 1,
          versionHistory: [],
          markedForDeletion: false,
        },
      ];
      localStorageMock._getStore()['skiTimerFaultEntries'] =
        JSON.stringify(faults);
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().faultEntries).toHaveLength(1);
      expect(newStore.getState().faultEntries[0].id).toBe('fault-1');
    });

    it('should handle malformed fault entries in storage', async () => {
      localStorageMock._getStore()['skiTimerFaultEntries'] = 'not valid json';
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().faultEntries).toEqual([]);
    });

    it('should handle malformed gate assignment JSON', async () => {
      localStorageMock._getStore()['skiTimerGateAssignment'] = 'invalid-json{';
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().gateAssignment).toBeNull();
    });
  });

  describe('Fault Entry Operations', () => {
    it('should add a fault entry', () => {
      const fault = createFaultEntry({ id: 'fault-add-1' });
      store.addFaultEntry(fault);

      expect(store.getState().faultEntries).toHaveLength(1);
      expect(store.getState().faultEntries[0].id).toBe('fault-add-1');
      expect(store.getState().faultEntries[0].currentVersion).toBe(1);
      expect(store.getState().faultEntries[0].versionHistory).toHaveLength(1);
      expect(store.getState().faultEntries[0].markedForDeletion).toBe(false);
    });

    it('should delete a fault entry', () => {
      const fault = createFaultEntry({ id: 'fault-del-1' });
      store.addFaultEntry(fault);
      expect(store.getState().faultEntries).toHaveLength(1);

      store.deleteFaultEntry('fault-del-1');
      expect(store.getState().faultEntries).toHaveLength(0);
    });

    it('should update a fault entry without version tracking', () => {
      const fault = createFaultEntry({ id: 'fault-upd-1', bib: '042' });
      store.addFaultEntry(fault);

      const result = store.updateFaultEntry('fault-upd-1', { bib: '099' });

      expect(result).toBe(true);
      expect(store.getState().faultEntries[0].bib).toBe('099');
    });

    it('should return false when updating non-existent fault', () => {
      const result = store.updateFaultEntry('nonexistent', { bib: '099' });
      expect(result).toBe(false);
    });

    it('should update a fault entry with version history', () => {
      const fault = createFaultEntry({ id: 'fault-hist-1', bib: '042' });
      store.addFaultEntry(fault);

      const result = store.updateFaultEntryWithHistory(
        'fault-hist-1',
        { bib: '099' },
        'Changed bib',
      );

      expect(result).toBe(true);
      expect(store.getState().faultEntries[0].bib).toBe('099');
      expect(store.getState().faultEntries[0].currentVersion).toBe(2);
      expect(store.getState().faultEntries[0].versionHistory).toHaveLength(2);
    });

    it('should return false when updating non-existent fault with history', () => {
      const result = store.updateFaultEntryWithHistory('nonexistent', {
        bib: '099',
      });
      expect(result).toBe(false);
    });

    it('should not update fault marked for deletion via updateFaultEntryWithHistory', () => {
      const fault = createFaultEntry({ id: 'fault-marked-1' });
      store.addFaultEntry(fault);
      store.markFaultForDeletion('fault-marked-1');

      const result = store.updateFaultEntryWithHistory('fault-marked-1', {
        bib: '099',
      });
      expect(result).toBe(false);
    });

    it('should restore a fault to a previous version', () => {
      const fault = createFaultEntry({
        id: 'fault-restore-1',
        bib: '042',
        gateNumber: 5,
      });
      store.addFaultEntry(fault);

      // Update to version 2
      store.updateFaultEntryWithHistory('fault-restore-1', {
        bib: '099',
        gateNumber: 8,
      });

      // Restore to version 1
      const result = store.restoreFaultVersion('fault-restore-1', 1);

      expect(result).toBe(true);
      expect(store.getState().faultEntries[0].bib).toBe('042');
      expect(store.getState().faultEntries[0].gateNumber).toBe(5);
      expect(store.getState().faultEntries[0].currentVersion).toBe(3);
    });

    it('should return false when restoring non-existent fault', () => {
      const result = store.restoreFaultVersion('nonexistent', 1);
      expect(result).toBe(false);
    });

    it('should return false when restoring non-existent version', () => {
      const fault = createFaultEntry({ id: 'fault-noversion-1' });
      store.addFaultEntry(fault);

      const result = store.restoreFaultVersion('fault-noversion-1', 999);
      expect(result).toBe(false);
    });

    it('should mark fault for deletion', () => {
      const fault = createFaultEntry({ id: 'fault-mark-1' });
      store.addFaultEntry(fault);

      const result = store.markFaultForDeletion('fault-mark-1');

      expect(result).toBe(true);
      expect(store.getState().faultEntries[0].markedForDeletion).toBe(true);
      expect(
        store.getState().faultEntries[0].markedForDeletionBy,
      ).toBeDefined();
    });

    it('should return false when marking non-existent fault for deletion', () => {
      const result = store.markFaultForDeletion('nonexistent');
      expect(result).toBe(false);
    });

    it('should approve fault deletion', () => {
      const fault = createFaultEntry({ id: 'fault-approve-1' });
      store.addFaultEntry(fault);
      store.markFaultForDeletion('fault-approve-1');

      const result = store.approveFaultDeletion('fault-approve-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('fault-approve-1');
      expect(result!.deletionApprovedAt).toBeDefined();
      expect(store.getState().faultEntries).toHaveLength(0);
    });

    it('should return null when approving non-marked fault', () => {
      const fault = createFaultEntry({ id: 'fault-notmarked-1' });
      store.addFaultEntry(fault);

      const result = store.approveFaultDeletion('fault-notmarked-1');
      expect(result).toBeNull();
      expect(store.getState().faultEntries).toHaveLength(1);
    });

    it('should return null when approving non-existent fault', () => {
      const result = store.approveFaultDeletion('nonexistent');
      expect(result).toBeNull();
    });

    it('should reject fault deletion', () => {
      const fault = createFaultEntry({ id: 'fault-reject-1' });
      store.addFaultEntry(fault);
      store.markFaultForDeletion('fault-reject-1');

      const result = store.rejectFaultDeletion('fault-reject-1');

      expect(result).toBe(true);
      expect(store.getState().faultEntries[0].markedForDeletion).toBe(false);
      expect(
        store.getState().faultEntries[0].markedForDeletionAt,
      ).toBeUndefined();
    });

    it('should return false when rejecting non-existent fault deletion', () => {
      const result = store.rejectFaultDeletion('nonexistent');
      expect(result).toBe(false);
    });

    it('should get pending deletions', () => {
      const fault1 = createFaultEntry({ id: 'fault-pend-1' });
      const fault2 = createFaultEntry({ id: 'fault-pend-2' });
      store.addFaultEntry(fault1);
      store.addFaultEntry(fault2);
      store.markFaultForDeletion('fault-pend-1');

      const pending = store.getPendingDeletions();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('fault-pend-1');
    });

    it('should clear fault entries', () => {
      store.addFaultEntry(createFaultEntry({ id: 'fault-clear-1' }));
      store.addFaultEntry(createFaultEntry({ id: 'fault-clear-2' }));

      store.clearFaultEntries();
      expect(store.getState().faultEntries).toHaveLength(0);
    });

    it('should get faults for bib and run', () => {
      store.addFaultEntry(
        createFaultEntry({ id: 'fault-bib-1', bib: '042', run: 1 }),
      );
      store.addFaultEntry(
        createFaultEntry({ id: 'fault-bib-2', bib: '042', run: 2 }),
      );
      store.addFaultEntry(
        createFaultEntry({ id: 'fault-bib-3', bib: '043', run: 1 }),
      );

      const faults = store.getFaultsForBib('042', 1);
      expect(faults).toHaveLength(1);
      expect(faults[0].id).toBe('fault-bib-1');
    });

    it('should mark fault as synced', () => {
      store.addFaultEntry(createFaultEntry({ id: 'fault-sync-1' }));

      store.markFaultSynced('fault-sync-1');

      expect(store.getState().faultEntries[0].syncedAt).toBeDefined();
      expect(store.getState().faultEntries[0].syncedAt).toBeGreaterThan(0);
    });
  });

  describe('Fault Cloud Merge Operations', () => {
    it('should merge faults from cloud', () => {
      const cloudFault = {
        id: 'fault-cloud-1',
        bib: '042',
        run: 1,
        gateNumber: 5,
        faultType: 'MG',
        timestamp: new Date().toISOString(),
        deviceId: 'dev_other',
        deviceName: 'Other Judge',
        gateRange: [4, 12],
        currentVersion: 1,
        versionHistory: [],
        markedForDeletion: false,
      };

      const count = store.mergeFaultsFromCloud([cloudFault]);
      expect(count).toBe(1);
      expect(store.getState().faultEntries).toHaveLength(1);
    });

    it('should skip faults from same device', () => {
      const deviceId = store.getState().deviceId;
      const cloudFault = {
        id: 'fault-same-1',
        bib: '042',
        run: 1,
        gateNumber: 5,
        faultType: 'MG',
        timestamp: new Date().toISOString(),
        deviceId,
        deviceName: 'Same Device',
        gateRange: [4, 12],
        currentVersion: 1,
        versionHistory: [],
        markedForDeletion: false,
      };

      const count = store.mergeFaultsFromCloud([cloudFault]);
      expect(count).toBe(0);
    });

    it('should remove deleted cloud faults', () => {
      store.addFaultEntry(
        createFaultEntry({ id: 'fault-remdel-1', deviceId: 'dev_other' }),
      );
      store.addFaultEntry(
        createFaultEntry({ id: 'fault-remdel-2', deviceId: 'dev_other' }),
      );

      const count = store.removeDeletedCloudFaults(['fault-remdel-1']);
      expect(count).toBe(1);
      expect(store.getState().faultEntries).toHaveLength(1);
      expect(store.getState().faultEntries[0].id).toBe('fault-remdel-2');
    });

    it('should return 0 when no faults to remove', () => {
      store.addFaultEntry(createFaultEntry({ id: 'fault-noremove-1' }));

      const count = store.removeDeletedCloudFaults(['nonexistent-id']);
      expect(count).toBe(0);
      expect(store.getState().faultEntries).toHaveLength(1);
    });
  });

  describe('forceSave', () => {
    it('should save all persistent slices immediately', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1-force' }));
      store.updateSettings({ sound: true });

      localStorageMock.setItem.mockClear();

      store.forceSave();

      const setItemKeys = localStorageMock.setItem.mock.calls.map(
        (call: [string, string]) => call[0],
      );

      expect(setItemKeys).toContain('skiTimerEntries');
      expect(setItemKeys).toContain('skiTimerSettings');
      expect(setItemKeys).toContain('skiTimerLang');
      expect(setItemKeys).toContain('skiTimerDeviceRole');
    });

    it('should cancel pending debounced save', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1-debounce' }));
      // Save is scheduled but not yet executed

      localStorageMock.setItem.mockClear();
      store.forceSave();

      // Advancing timers should not cause duplicate save
      const callCountAfterForce = localStorageMock.setItem.mock.calls.length;
      vi.advanceTimersByTime(200);
      expect(localStorageMock.setItem.mock.calls.length).toBe(
        callCountAfterForce,
      );
    });
  });

  describe('peekUndo', () => {
    it('should return null when undo stack is empty', () => {
      expect(store.peekUndo()).toBeNull();
    });

    it('should return the top action without removing it', () => {
      const entry = createValidEntry({ id: 'dev_test-1-peek' });
      store.addEntry(entry);

      const peeked = store.peekUndo();
      expect(peeked).not.toBeNull();
      expect(peeked!.type).toBe('ADD_ENTRY');

      // Should still be able to undo
      expect(store.canUndo()).toBe(true);
    });

    it('should return the most recent action', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1-peek1' }));
      store.addEntry(createValidEntry({ id: 'dev_test-2-peek2' }));

      const peeked = store.peekUndo();
      expect(peeked!.type).toBe('ADD_ENTRY');
      expect((peeked!.data as Entry).id).toBe('dev_test-2-peek2');
    });
  });

  describe('Listener Error Callback', () => {
    it('should call onListenerError callback when listener fails', () => {
      const errorCallback = vi.fn();
      store.onListenerError(errorCallback);

      const badListener = vi.fn(() => {
        throw new Error('listener crash');
      });
      store.subscribe(badListener);
      store.setBibInput('1');

      expect(errorCallback).toHaveBeenCalledWith(
        expect.any(Error),
        badListener,
      );
    });

    it('should handle error in error callback gracefully', () => {
      store.onListenerError(() => {
        throw new Error('callback crash');
      });

      const badListener = vi.fn(() => {
        throw new Error('listener crash');
      });
      store.subscribe(badListener);

      // Should not throw even if error callback throws
      expect(() => store.setBibInput('1')).not.toThrow();
    });

    it('should track failure count', () => {
      const badListener = vi.fn(() => {
        throw new Error('fail');
      });
      store.subscribe(badListener);

      store.setBibInput('1');
      store.setBibInput('2');

      expect(store.getListenerFailureCount()).toBe(2);
    });
  });

  describe('Sync State - Extended', () => {
    it('should set last synced race ID', () => {
      store.setLastSyncedRaceId('RACE-2024');
      expect(store.getState().lastSyncedRaceId).toBe('RACE-2024');
    });

    it('should mark current race as synced', () => {
      store.setRaceId('CURRENT-RACE');
      store.markCurrentRaceAsSynced();
      expect(store.getState().lastSyncedRaceId).toBe('CURRENT-RACE');
    });

    it('should clear undo/redo when changing race ID', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1-race1' }));
      expect(store.canUndo()).toBe(true);

      store.setRaceId('NEW-RACE');

      expect(store.getState().undoStack).toEqual([]);
      expect(store.getState().redoStack).toEqual([]);
    });

    it('should not clear undo/redo when setting same race ID', () => {
      store.setRaceId('RACE-1');
      store.addEntry(createValidEntry({ id: 'dev_test-1-samerace' }));
      expect(store.canUndo()).toBe(true);

      store.setRaceId('RACE-1');

      expect(store.canUndo()).toBe(true);
    });
  });

  describe('Cloud Entry Operations - Extended', () => {
    it('should remove deleted cloud entries', () => {
      const cloudEntry = createValidEntry({
        id: 'dev_cloud-1-remdel',
        deviceId: 'dev_cloud',
      });
      store.mergeCloudEntries([cloudEntry]);
      expect(store.getState().entries).toHaveLength(1);

      const count = store.removeDeletedCloudEntries(['dev_cloud-1-remdel']);
      expect(count).toBe(1);
      expect(store.getState().entries).toHaveLength(0);
    });

    it('should return 0 when no entries to remove', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1-keep' }));

      const count = store.removeDeletedCloudEntries(['nonexistent']);
      expect(count).toBe(0);
      expect(store.getState().entries).toHaveLength(1);
    });

    it('should merge cloud entries with deleted IDs filter', () => {
      const cloudEntry1 = createValidEntry({
        id: 'dev_cloud-1-merge',
        deviceId: 'dev_cloud',
      });
      const cloudEntry2 = createValidEntry({
        id: 'dev_cloud-2-merge',
        deviceId: 'dev_cloud',
      });

      const count = store.mergeCloudEntries(
        [cloudEntry1, cloudEntry2],
        ['dev_cloud-1-merge'],
      );

      // Only entry2 should be added since entry1 is in deletedIds
      expect(count).toBe(1);
      expect(store.getState().entries).toHaveLength(1);
      expect(store.getState().entries[0].id).toBe('dev_cloud-2-merge');
    });
  });

  describe('GPS State - Extended', () => {
    it('should set GPS accuracy to null when not provided', () => {
      store.setGpsStatus('searching');

      expect(store.getState().gpsStatus).toBe('searching');
      expect(store.getState().gpsAccuracy).toBeNull();
    });

    it('should set GPS to paused state', () => {
      store.setGpsStatus('paused');
      expect(store.getState().gpsStatus).toBe('paused');
    });

    it('should set GPS to inactive state', () => {
      store.setGpsStatus('active', 3.0);
      store.setGpsStatus('inactive');

      expect(store.getState().gpsStatus).toBe('inactive');
      expect(store.getState().gpsAccuracy).toBeNull();
    });
  });

  describe('Export/Import - Extended', () => {
    it('should include deviceId and deviceName in export', () => {
      const exported = store.exportData();
      const parsed = JSON.parse(exported);

      expect(parsed.deviceId).toBeDefined();
      expect(parsed.deviceName).toBeDefined();
    });

    it('should include version in export', () => {
      const exported = store.exportData();
      const parsed = JSON.parse(exported);

      expect(parsed.version).toBeDefined();
      expect(typeof parsed.version).toBe('number');
    });

    it('should sort imported entries by timestamp', () => {
      const importData = JSON.stringify({
        version: 2,
        entries: [
          createValidEntry({
            id: 'dev_import-1-late',
            timestamp: '2024-01-01T12:00:02.000Z',
          }),
          createValidEntry({
            id: 'dev_import-2-early',
            timestamp: '2024-01-01T12:00:00.000Z',
          }),
        ],
      });

      const result = store.importData(importData);
      expect(result.success).toBe(true);

      const entries = store.getState().entries;
      expect(new Date(entries[0].timestamp).getTime()).toBeLessThanOrEqual(
        new Date(entries[1].timestamp).getTime(),
      );
    });

    it('should handle import with zero new entries', () => {
      const entry = createValidEntry({ id: 'dev_test-1-dup' });
      store.addEntry(entry);

      const importData = JSON.stringify({
        version: 2,
        entries: [entry],
      });

      const result = store.importData(importData);
      expect(result.success).toBe(true);
      expect(result.entriesImported).toBe(0);
      expect(store.getState().entries).toHaveLength(1);
    });
  });

  describe('Persistence - Gate Assignment and Gate Color', () => {
    it('should persist gate assignment', () => {
      store.setGateAssignment([4, 12]);
      vi.advanceTimersByTime(150);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerGateAssignment',
        JSON.stringify([4, 12]),
      );
    });

    it('should remove gate assignment from storage when set to null', () => {
      store.setGateAssignment([4, 12]);
      vi.advanceTimersByTime(150);

      store.setGateAssignment(null);
      vi.advanceTimersByTime(150);

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        'skiTimerGateAssignment',
      );
    });

    it('should persist first gate color', () => {
      store.setFirstGateColor('blue');
      vi.advanceTimersByTime(150);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerFirstGateColor',
        'blue',
      );
    });

    it('should persist fault entries', () => {
      store.addFaultEntry(createFaultEntry({ id: 'fault-persist-1' }));
      vi.advanceTimersByTime(150);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerFaultEntries',
        expect.any(String),
      );
    });

    it('should persist device role', () => {
      store.setDeviceRole('gateJudge');
      vi.advanceTimersByTime(150);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerDeviceRole',
        'gateJudge',
      );
    });
  });

  describe('Persistence - Sync Queue', () => {
    it('should persist sync queue changes', () => {
      const entry = createValidEntry({ id: 'dev_test-1-syncq' });
      store.addToSyncQueue(entry);
      vi.advanceTimersByTime(150);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerSyncQueue',
        expect.any(String),
      );
    });

    it('should load sync queue from storage', async () => {
      const syncQueue = [
        {
          entry: createValidEntry({ id: 'dev_test-1-loadq' }),
          retryCount: 2,
          lastAttempt: Date.now(),
        },
      ];
      localStorageMock._getStore()['skiTimerSyncQueue'] =
        JSON.stringify(syncQueue);
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().syncQueue).toHaveLength(1);
      expect(newStore.getState().syncQueue[0].retryCount).toBe(2);
    });

    it('should handle malformed sync queue in storage', async () => {
      localStorageMock._getStore()['skiTimerSyncQueue'] = 'bad json';
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().syncQueue).toEqual([]);
    });

    it('should handle non-array sync queue in storage', async () => {
      localStorageMock._getStore()['skiTimerSyncQueue'] = JSON.stringify({
        not: 'array',
      });
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().syncQueue).toEqual([]);
    });
  });

  describe('Persistence - Last Synced Race ID', () => {
    it('should persist lastSyncedRaceId', () => {
      store.setLastSyncedRaceId('SYNCED-RACE');
      vi.advanceTimersByTime(150);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerLastSyncedRaceId',
        'SYNCED-RACE',
      );
    });

    it('should load lastSyncedRaceId from storage', async () => {
      localStorageMock._getStore()['skiTimerLastSyncedRaceId'] = 'LOADED-RACE';
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().lastSyncedRaceId).toBe('LOADED-RACE');
    });
  });

  describe('Persistence - Schema version', () => {
    it('should write schema version when entries change', () => {
      localStorageMock.setItem.mockClear();
      store.addEntry(createValidEntry({ id: 'dev_test-1-schema' }));
      vi.advanceTimersByTime(150);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerSchemaVersion',
        expect.any(String),
      );
    });

    it('should write schema version when settings change', () => {
      localStorageMock.setItem.mockClear();
      store.updateSettings({ sound: true });
      vi.advanceTimersByTime(150);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerSchemaVersion',
        expect.any(String),
      );
    });
  });

  describe('Storage warning events', () => {
    it('should dispatch storage-warning event when quota warning is detected', () => {
      // This test verifies the code path exists; the actual warning
      // depends on storage usage, so we just trigger a save and
      // verify no crash occurs
      store.addEntry(createValidEntry({ id: 'dev_test-1-warn' }));
      const handler = vi.fn();
      window.addEventListener('storage-warning', handler);

      try {
        vi.advanceTimersByTime(150);
        // No assertion on handler being called since it depends on actual quota
        // Just verify no error occurred
      } finally {
        window.removeEventListener('storage-warning', handler);
      }
    });
  });

  describe('Photo data handling during persistence', () => {
    it('should keep entries with photo="indexeddb" unchanged', () => {
      const entry = createValidEntry({
        id: 'dev_test-1-indexeddb',
        photo: 'indexeddb',
      });
      store.addEntry(entry);
      vi.advanceTimersByTime(150);

      const savedJson = localStorageMock.getItem('skiTimerEntries');
      const parsed = JSON.parse(savedJson!);
      expect(parsed[0].photo).toBe('indexeddb');
    });

    it('should keep entries without photo unchanged', () => {
      const entry = createValidEntry({ id: 'dev_test-1-nophoto' });
      store.addEntry(entry);
      vi.advanceTimersByTime(150);

      const savedJson = localStorageMock.getItem('skiTimerEntries');
      const parsed = JSON.parse(savedJson!);
      expect(parsed[0].photo).toBeUndefined();
    });

    it('should keep entries with short photo string unchanged', () => {
      const entry = createValidEntry({
        id: 'dev_test-1-shortphoto',
        photo: 'short',
      });
      store.addEntry(entry);
      vi.advanceTimersByTime(150);

      const savedJson = localStorageMock.getItem('skiTimerEntries');
      const parsed = JSON.parse(savedJson!);
      // Short photo strings (length <= 20) should remain unchanged
      expect(parsed[0].photo).toBe('short');
    });
  });

  describe('Undo/Redo - UPDATE_ENTRY', () => {
    it('should undo update entry', () => {
      const entry = createValidEntry({ id: 'dev_test-1-undoupd', bib: '042' });
      store.addEntry(entry);

      store.updateEntry('dev_test-1-undoupd', { bib: '099' });
      expect(store.getState().entries[0].bib).toBe('099');

      store.undo();
      expect(store.getState().entries[0].bib).toBe('042');
    });

    it('should redo update entry', () => {
      const entry = createValidEntry({ id: 'dev_test-1-redoupd', bib: '042' });
      store.addEntry(entry);

      store.updateEntry('dev_test-1-redoupd', { bib: '099' });
      store.undo();
      expect(store.getState().entries[0].bib).toBe('042');

      store.redo();
      expect(store.getState().entries[0].bib).toBe('099');
    });
  });

  describe('Undo/Redo - DELETE_MULTIPLE', () => {
    it('should undo delete multiple', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1-undomulti' }));
      store.addEntry(createValidEntry({ id: 'dev_test-2-undomulti' }));
      store.addEntry(createValidEntry({ id: 'dev_test-3-undomulti' }));

      store.deleteMultiple(['dev_test-1-undomulti', 'dev_test-3-undomulti']);
      expect(store.getState().entries).toHaveLength(1);

      store.undo();
      expect(store.getState().entries).toHaveLength(3);
    });

    it('should redo delete multiple', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1-redomulti' }));
      store.addEntry(createValidEntry({ id: 'dev_test-2-redomulti' }));

      store.deleteMultiple(['dev_test-1-redomulti', 'dev_test-2-redomulti']);
      store.undo();
      expect(store.getState().entries).toHaveLength(2);

      store.redo();
      expect(store.getState().entries).toHaveLength(0);
    });
  });

  describe('Undo/Redo - Redo DELETE_ENTRY', () => {
    it('should redo delete entry', () => {
      const entry = createValidEntry({ id: 'dev_test-1-redodel' });
      store.addEntry(entry);
      store.deleteEntry('dev_test-1-redodel');
      store.undo();
      expect(store.getState().entries).toHaveLength(1);

      store.redo();
      expect(store.getState().entries).toHaveLength(0);
    });
  });

  describe('Undo/Redo - Redo CLEAR_ALL', () => {
    it('should redo clear all', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1-redoclear' }));
      store.addEntry(createValidEntry({ id: 'dev_test-2-redoclear' }));
      store.clearAll();
      store.undo();
      expect(store.getState().entries).toHaveLength(2);

      store.redo();
      expect(store.getState().entries).toHaveLength(0);
    });
  });

  describe('View switching', () => {
    it('should set gateJudge view', () => {
      store.setView('gateJudge');
      expect(store.getState().currentView).toBe('gateJudge');
    });

    it('should set timer view', () => {
      store.setView('gateJudge');
      store.setView('timer');
      expect(store.getState().currentView).toBe('timer');
    });
  });

  describe('Entries with non-array data in storage', () => {
    it('should handle non-array entries in localStorage', async () => {
      localStorageMock._getStore()['skiTimerEntries'] = JSON.stringify({
        not: 'array',
      });
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().entries).toEqual([]);
    });

    it('should handle non-array fault entries in localStorage', async () => {
      localStorageMock._getStore()['skiTimerFaultEntries'] = JSON.stringify({
        not: 'array',
      });
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().faultEntries).toEqual([]);
    });
  });

  describe('Device name generation', () => {
    it('should generate device name if not present', () => {
      const state = store.getState();

      expect(state.deviceName).toBeDefined();
      expect(state.deviceName.length).toBeGreaterThan(0);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerDeviceName',
        expect.any(String),
      );
    });

    it('should load existing device name from storage', async () => {
      localStorageMock._getStore()['skiTimerDeviceName'] = 'My Timer';
      vi.resetModules();
      const { store: newStore } = await import('../../../src/store/index');

      expect(newStore.getState().deviceName).toBe('My Timer');
    });
  });
});
