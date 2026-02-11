/**
 * Unit Tests for Store (State Management)
 * Tests: initialization, CRUD operations, undo/redo, sync queue,
 *        UI state, settings, cloud merge, export/import
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry, Settings } from '../../src/types';

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
    id: `dev_test-${Date.now()}-abcd1234`,
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

describe('Store', () => {
  let store: typeof import('../../src/store/index').store;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorageMock.clear();
    vi.clearAllMocks();

    // Reset module between tests for clean state
    vi.resetModules();
    const storeModule = await import('../../src/store/index');
    store = storeModule.store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const state = store.getState();

      expect(state.currentView).toBe('timer');
      expect(state.currentLang).toBe('de');
      expect(state.bibInput).toBe('');
      expect(state.selectedPoint).toBe('F');
      expect(state.selectMode).toBe(false);
      expect(state.entries).toEqual([]);
      expect(state.undoStack).toEqual([]);
      expect(state.redoStack).toEqual([]);
    });

    it('should generate device ID if not present', () => {
      const state = store.getState();

      expect(state.deviceId).toMatch(/^dev_/);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerDeviceId',
        expect.any(String),
      );
    });

    it('should load existing device ID from storage', async () => {
      localStorageMock.setItem('skiTimerDeviceId', 'dev_existing123');
      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().deviceId).toBe('dev_existing123');
    });

    it('should initialize with default settings', () => {
      const state = store.getState();

      expect(state.settings.auto).toBe(true);
      expect(state.settings.haptic).toBe(true);
      expect(state.settings.sound).toBe(false);
      expect(state.settings.sync).toBe(false);
      expect(state.settings.gps).toBe(true);
      expect(state.settings.simple).toBe(false); // Normal mode is default
      expect(state.settings.photoCapture).toBe(false);
    });

    it('should load saved settings from storage', async () => {
      const savedSettings: Partial<Settings> = { auto: false, haptic: false };
      localStorageMock.setItem(
        'skiTimerSettings',
        JSON.stringify(savedSettings),
      );
      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().settings.auto).toBe(false);
      expect(newStore.getState().settings.haptic).toBe(false);
      expect(newStore.getState().settings.sound).toBe(false); // default
    });

    it('should load saved entries from storage', async () => {
      const entries = [
        createValidEntry({ id: 'dev_test-1704067200000-entry1' }),
      ];
      localStorageMock.setItem('skiTimerEntries', JSON.stringify(entries));
      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().entries).toHaveLength(1);
      expect(newStore.getState().entries[0].id).toBe(
        'dev_test-1704067200000-entry1',
      );
    });

    it('should filter out invalid entries when loading', async () => {
      const entries = [
        createValidEntry({ id: 'dev_test-1704067200000-valid' }),
        { invalid: true },
        null,
      ];
      localStorageMock.setItem('skiTimerEntries', JSON.stringify(entries));
      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().entries).toHaveLength(1);
    });

    it('should load saved language from storage', async () => {
      localStorageMock.setItem('skiTimerLang', 'en');
      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().currentLang).toBe('en');
    });
  });

  describe('Subscription', () => {
    it('should allow subscribing to state changes', () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.setBibInput('123');

      expect(listener).toHaveBeenCalledWith(expect.any(Object), ['bibInput']);
      unsubscribe();
    });

    it('should allow unsubscribing', () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.setBibInput('123');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should notify multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      store.subscribe(listener1);
      store.subscribe(listener2);

      store.setBibInput('123');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      store.subscribe(errorListener);
      store.subscribe(goodListener);

      // Should not throw
      expect(() => store.setBibInput('123')).not.toThrow();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('Entry Operations', () => {
    describe('addEntry', () => {
      it('should add an entry', () => {
        const entry = createValidEntry();
        store.addEntry(entry);

        expect(store.getState().entries).toHaveLength(1);
        expect(store.getState().entries[0]).toEqual(entry);
      });

      it('should set lastRecordedEntry', () => {
        const entry = createValidEntry();
        store.addEntry(entry);

        expect(store.getState().lastRecordedEntry).toEqual(entry);
      });

      it('should push to undo stack', () => {
        const entry = createValidEntry();
        store.addEntry(entry);

        expect(store.getState().undoStack).toHaveLength(1);
        expect(store.getState().undoStack[0].type).toBe('ADD_ENTRY');
      });

      it('should add to sync queue when sync is enabled', async () => {
        store.updateSettings({ sync: true });
        store.setRaceId('RACE001');

        const entry = createValidEntry();
        store.addEntry(entry);

        expect(store.getState().syncQueue).toHaveLength(1);
        expect(store.getState().syncQueue[0].entry).toEqual(entry);
      });

      it('should add entry with run 1', () => {
        const entry = createValidEntry({ run: 1 });
        store.addEntry(entry);

        expect(store.getState().entries[0].run).toBe(1);
      });

      it('should add entry with run 2', () => {
        const entry = createValidEntry({ run: 2 });
        store.addEntry(entry);

        expect(store.getState().entries[0].run).toBe(2);
      });
    });

    describe('deleteEntry', () => {
      it('should delete an entry', () => {
        const entry = createValidEntry({ id: 'dev_test-1704067200000-delete' });
        store.addEntry(entry);
        store.deleteEntry('dev_test-1704067200000-delete');

        expect(store.getState().entries).toHaveLength(0);
      });

      it('should not delete non-existent entry', () => {
        const entry = createValidEntry();
        store.addEntry(entry);
        store.deleteEntry('non-existent');

        expect(store.getState().entries).toHaveLength(1);
      });

      it('should push to undo stack', () => {
        const entry = createValidEntry({
          id: 'dev_test-1704067200000-delete2',
        });
        store.addEntry(entry);
        store.deleteEntry('dev_test-1704067200000-delete2');

        expect(store.getState().undoStack).toHaveLength(2);
        expect(store.getState().undoStack[1].type).toBe('DELETE_ENTRY');
      });
    });

    describe('deleteMultiple', () => {
      it('should delete multiple entries', () => {
        const entry1 = createValidEntry({
          id: 'dev_test-1704067200000-multi1',
        });
        const entry2 = createValidEntry({
          id: 'dev_test-1704067200001-multi2',
        });
        const entry3 = createValidEntry({
          id: 'dev_test-1704067200002-multi3',
        });

        store.addEntry(entry1);
        store.addEntry(entry2);
        store.addEntry(entry3);

        store.deleteMultiple([
          'dev_test-1704067200000-multi1',
          'dev_test-1704067200002-multi3',
        ]);

        expect(store.getState().entries).toHaveLength(1);
        expect(store.getState().entries[0].id).toBe(
          'dev_test-1704067200001-multi2',
        );
      });

      it('should clear select mode after deletion', () => {
        const entry = createValidEntry({ id: 'dev_test-1704067200000-select' });
        store.addEntry(entry);
        store.setSelectMode(true);
        store.toggleEntrySelection('dev_test-1704067200000-select');

        store.deleteMultiple(['dev_test-1704067200000-select']);

        expect(store.getState().selectMode).toBe(false);
        expect(store.getState().selectedEntries.size).toBe(0);
      });
    });

    describe('clearAll', () => {
      it('should clear all entries', () => {
        store.addEntry(
          createValidEntry({ id: 'dev_test-1704067200000-clear1' }),
        );
        store.addEntry(
          createValidEntry({ id: 'dev_test-1704067200001-clear2' }),
        );

        store.clearAll();

        expect(store.getState().entries).toHaveLength(0);
      });

      it('should not push to undo if already empty', () => {
        const initialStackLength = store.getState().undoStack.length;
        store.clearAll();

        expect(store.getState().undoStack.length).toBe(initialStackLength);
      });
    });

    describe('updateEntry', () => {
      it('should update an entry', () => {
        const entry = createValidEntry({
          id: 'dev_test-1704067200000-update',
          bib: '001',
        });
        store.addEntry(entry);

        store.updateEntry('dev_test-1704067200000-update', { bib: '999' });

        expect(store.getState().entries[0].bib).toBe('999');
      });

      it('should preserve other entry fields', () => {
        const entry = createValidEntry({
          id: 'dev_test-1704067200000-preserve',
        });
        store.addEntry(entry);

        store.updateEntry('dev_test-1704067200000-preserve', { bib: '999' });

        expect(store.getState().entries[0].point).toBe(entry.point);
        expect(store.getState().entries[0].timestamp).toBe(entry.timestamp);
      });

      it('should not update non-existent entry', () => {
        const entry = createValidEntry();
        store.addEntry(entry);

        store.updateEntry('non-existent', { bib: '999' });

        expect(store.getState().entries[0].bib).toBe(entry.bib);
      });
    });
  });

  describe('Undo/Redo', () => {
    it('should report canUndo correctly', () => {
      expect(store.canUndo()).toBe(false);

      store.addEntry(createValidEntry());

      expect(store.canUndo()).toBe(true);
    });

    it('should report canRedo correctly', () => {
      expect(store.canRedo()).toBe(false);

      store.addEntry(createValidEntry());
      store.undo();

      expect(store.canRedo()).toBe(true);
    });

    it('should undo add entry', () => {
      const entry = createValidEntry({ id: 'dev_test-1704067200000-undo' });
      store.addEntry(entry);

      const result = store.undo();

      expect(store.getState().entries).toHaveLength(0);
      expect(result).toEqual({ type: 'ADD_ENTRY', data: entry });
    });

    it('should redo add entry', () => {
      const entry = createValidEntry({ id: 'dev_test-1704067200000-redo' });
      store.addEntry(entry);
      store.undo();

      const result = store.redo();

      expect(store.getState().entries).toHaveLength(1);
      expect(result).toEqual(entry);
    });

    it('should undo delete entry', () => {
      const entry = createValidEntry({
        id: 'dev_test-1704067200000-undodelete',
      });
      store.addEntry(entry);
      store.deleteEntry('dev_test-1704067200000-undodelete');

      store.undo();

      expect(store.getState().entries).toHaveLength(1);
      expect(store.getState().entries[0].id).toBe(
        'dev_test-1704067200000-undodelete',
      );
    });

    it('should undo clear all', () => {
      store.addEntry(
        createValidEntry({ id: 'dev_test-1704067200000-undoclear1' }),
      );
      store.addEntry(
        createValidEntry({ id: 'dev_test-1704067200001-undoclear2' }),
      );
      store.clearAll();

      store.undo();

      expect(store.getState().entries).toHaveLength(2);
    });

    it('should limit undo stack to 50 items', () => {
      for (let i = 0; i < 60; i++) {
        store.addEntry(createValidEntry({ id: `dev_test-${i}-limit` }));
      }

      expect(store.getState().undoStack.length).toBeLessThanOrEqual(50);
    });

    it('should clear redo stack on new action', () => {
      store.addEntry(
        createValidEntry({ id: 'dev_test-1704067200000-clearredo1' }),
      );
      store.undo();

      expect(store.canRedo()).toBe(true);

      store.addEntry(
        createValidEntry({ id: 'dev_test-1704067200001-clearredo2' }),
      );

      expect(store.canRedo()).toBe(false);
    });

    it('should return null when nothing to undo', () => {
      const result = store.undo();
      expect(result).toBeNull();
    });

    it('should return null when nothing to redo', () => {
      const result = store.redo();
      expect(result).toBeNull();
    });
  });

  describe('Sync Queue', () => {
    it('should add to sync queue', () => {
      const entry = createValidEntry();
      store.addToSyncQueue(entry);

      expect(store.getState().syncQueue).toHaveLength(1);
      expect(store.getState().syncQueue[0].retryCount).toBe(0);
    });

    it('should remove from sync queue', () => {
      const entry = createValidEntry({ id: 'dev_test-1704067200000-remove' });
      store.addToSyncQueue(entry);
      store.removeFromSyncQueue('dev_test-1704067200000-remove');

      expect(store.getState().syncQueue).toHaveLength(0);
    });

    it('should update sync queue item', () => {
      const entry = createValidEntry({
        id: 'dev_test-1704067200000-updatequeue',
      });
      store.addToSyncQueue(entry);

      store.updateSyncQueueItem('dev_test-1704067200000-updatequeue', {
        retryCount: 3,
        lastAttempt: Date.now(),
      });

      expect(store.getState().syncQueue[0].retryCount).toBe(3);
    });

    it('should clear sync queue', () => {
      store.addToSyncQueue(
        createValidEntry({ id: 'dev_test-1704067200000-clear1' }),
      );
      store.addToSyncQueue(
        createValidEntry({ id: 'dev_test-1704067200001-clear2' }),
      );

      store.clearSyncQueue();

      expect(store.getState().syncQueue).toHaveLength(0);
    });
  });

  describe('UI State', () => {
    it('should set view', () => {
      store.setView('results');
      expect(store.getState().currentView).toBe('results');

      store.setView('settings');
      expect(store.getState().currentView).toBe('settings');
    });

    it('should set language', () => {
      store.setLanguage('en');
      expect(store.getState().currentLang).toBe('en');
    });

    it('should set bib input with sanitization', () => {
      store.setBibInput('123abc');
      expect(store.getState().bibInput).toBe('123');

      store.setBibInput('12345');
      expect(store.getState().bibInput).toBe('123');
    });

    it('should set selected point', () => {
      store.setSelectedPoint('S');
      expect(store.getState().selectedPoint).toBe('S');

      store.setSelectedPoint('F');
      expect(store.getState().selectedPoint).toBe('F');
    });

    it('should set selected run', () => {
      store.setSelectedRun(1);
      expect(store.getState().selectedRun).toBe(1);

      store.setSelectedRun(2);
      expect(store.getState().selectedRun).toBe(2);
    });

    it('should default to run 1', () => {
      expect(store.getState().selectedRun).toBe(1);
    });

    it('should set select mode', () => {
      store.setSelectMode(true);
      expect(store.getState().selectMode).toBe(true);

      store.setSelectMode(false);
      expect(store.getState().selectMode).toBe(false);
      expect(store.getState().selectedEntries.size).toBe(0);
    });

    it('should toggle entry selection', () => {
      const entry = createValidEntry({ id: 'dev_test-1704067200000-toggle' });
      store.addEntry(entry);

      store.toggleEntrySelection('dev_test-1704067200000-toggle');
      expect(
        store.getState().selectedEntries.has('dev_test-1704067200000-toggle'),
      ).toBe(true);
      expect(store.getState().selectMode).toBe(true);

      store.toggleEntrySelection('dev_test-1704067200000-toggle');
      expect(
        store.getState().selectedEntries.has('dev_test-1704067200000-toggle'),
      ).toBe(false);
    });

    it('should select all entries', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1704067200000-all1' }));
      store.addEntry(createValidEntry({ id: 'dev_test-1704067200001-all2' }));

      store.selectAllEntries();

      expect(store.getState().selectedEntries.size).toBe(2);
      expect(store.getState().selectMode).toBe(true);
    });

    it('should clear selection', () => {
      store.addEntry(
        createValidEntry({ id: 'dev_test-1704067200000-clearsel' }),
      );
      store.toggleEntrySelection('dev_test-1704067200000-clearsel');

      store.clearSelection();

      expect(store.getState().selectedEntries.size).toBe(0);
      expect(store.getState().selectMode).toBe(false);
    });

    it('should set recording state', () => {
      store.setRecording(true);
      expect(store.getState().isRecording).toBe(true);

      store.setRecording(false);
      expect(store.getState().isRecording).toBe(false);
    });
  });

  describe('Settings', () => {
    it('should update settings', () => {
      store.updateSettings({ auto: false, haptic: false });

      expect(store.getState().settings.auto).toBe(false);
      expect(store.getState().settings.haptic).toBe(false);
    });

    it('should preserve other settings when updating', () => {
      store.updateSettings({ auto: false });

      expect(store.getState().settings.haptic).toBe(true);
      expect(store.getState().settings.sound).toBe(false);
    });

    it('should toggle setting', () => {
      expect(store.getState().settings.auto).toBe(true);

      store.toggleSetting('auto');
      expect(store.getState().settings.auto).toBe(false);

      store.toggleSetting('auto');
      expect(store.getState().settings.auto).toBe(true);
    });
  });

  describe('Sync State', () => {
    it('should set sync status', () => {
      store.setSyncStatus('syncing');
      expect(store.getState().syncStatus).toBe('syncing');

      store.setSyncStatus('connected');
      expect(store.getState().syncStatus).toBe('connected');
    });

    it('should set race ID', () => {
      store.setRaceId('RACE2024');
      expect(store.getState().raceId).toBe('RACE2024');
    });

    it('should set device name', () => {
      store.setDeviceName('Timer 2');
      expect(store.getState().deviceName).toBe('Timer 2');
    });

    it('should add connected device', () => {
      store.addConnectedDevice({
        id: 'dev_other123',
        name: 'Other Timer',
        lastSeen: Date.now(),
      });

      expect(store.getState().connectedDevices.has('dev_other123')).toBe(true);
    });

    it('should remove connected device', () => {
      store.addConnectedDevice({
        id: 'dev_remove123',
        name: 'Remove Timer',
        lastSeen: Date.now(),
      });

      store.removeConnectedDevice('dev_remove123');

      expect(store.getState().connectedDevices.has('dev_remove123')).toBe(
        false,
      );
    });

    it('should set cloud device count', () => {
      store.setCloudDeviceCount(3);
      expect(store.getState().cloudDeviceCount).toBe(3);

      store.setCloudDeviceCount(5);
      expect(store.getState().cloudDeviceCount).toBe(5);
    });

    it('should set cloud highest bib', () => {
      store.setCloudHighestBib(42);
      expect(store.getState().cloudHighestBib).toBe(42);

      store.setCloudHighestBib(100);
      expect(store.getState().cloudHighestBib).toBe(100);
    });

    it('should set race exists in cloud', () => {
      expect(store.getState().raceExistsInCloud).toBeNull();

      store.setRaceExistsInCloud(true);
      expect(store.getState().raceExistsInCloud).toBe(true);

      store.setRaceExistsInCloud(false);
      expect(store.getState().raceExistsInCloud).toBe(false);

      store.setRaceExistsInCloud(null);
      expect(store.getState().raceExistsInCloud).toBeNull();
    });

    it('should initialize cloud state with defaults', () => {
      const state = store.getState();
      expect(state.cloudDeviceCount).toBe(0);
      expect(state.cloudHighestBib).toBe(0);
      expect(state.raceExistsInCloud).toBeNull();
    });
  });

  describe('GPS State', () => {
    it('should set GPS status', () => {
      store.setGpsStatus('searching');
      expect(store.getState().gpsStatus).toBe('searching');

      store.setGpsStatus('active', 5.0);
      expect(store.getState().gpsStatus).toBe('active');
      expect(store.getState().gpsAccuracy).toBe(5.0);
    });
  });

  describe('Camera State', () => {
    it('should set camera ready state', () => {
      store.setCameraReady(true);
      expect(store.getState().cameraReady).toBe(true);
      expect(store.getState().cameraError).toBeNull();
    });

    it('should set camera error', () => {
      store.setCameraReady(false, 'Camera permission denied');
      expect(store.getState().cameraReady).toBe(false);
      expect(store.getState().cameraError).toBe('Camera permission denied');
    });
  });

  describe('Cloud Entry Merging', () => {
    it('should merge cloud entries', () => {
      const localEntry = createValidEntry({
        id: 'dev_local-1704067200000-local',
        deviceId: store.getState().deviceId,
      });
      store.addEntry(localEntry);

      const cloudEntry = createValidEntry({
        id: 'dev_cloud-1704067200001-cloud',
        deviceId: 'dev_cloud',
      });

      const added = store.mergeCloudEntries([cloudEntry]);

      expect(added).toBe(1);
      expect(store.getState().entries).toHaveLength(2);
    });

    it('should skip entries from same device', () => {
      const cloudEntry = createValidEntry({
        id: 'dev_same-1704067200000-same',
        deviceId: store.getState().deviceId,
      });

      const added = store.mergeCloudEntries([cloudEntry]);

      expect(added).toBe(0);
    });

    it('should skip duplicate entries', () => {
      const cloudEntry = createValidEntry({
        id: 'dev_dup-1704067200000-dup',
        deviceId: 'dev_cloud',
      });

      store.mergeCloudEntries([cloudEntry]);
      const added = store.mergeCloudEntries([cloudEntry]);

      expect(added).toBe(0);
    });

    it('should skip invalid entries', () => {
      const invalidEntry = { invalid: true } as unknown as Entry;

      const added = store.mergeCloudEntries([invalidEntry]);

      expect(added).toBe(0);
    });

    it('should sort entries by timestamp after merge', () => {
      const entry1 = createValidEntry({
        id: 'dev_cloud1-1704067200001-late',
        deviceId: 'dev_cloud1',
        timestamp: '2024-01-01T12:00:01.000Z',
      });

      const entry2 = createValidEntry({
        id: 'dev_cloud2-1704067200000-early',
        deviceId: 'dev_cloud2',
        timestamp: '2024-01-01T12:00:00.000Z',
      });

      store.mergeCloudEntries([entry1]);
      store.mergeCloudEntries([entry2]);

      const entries = store.getState().entries;
      expect(new Date(entries[0].timestamp).getTime()).toBeLessThan(
        new Date(entries[1].timestamp).getTime(),
      );
    });
  });

  describe('Export/Import', () => {
    it('should export data as JSON', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1704067200000-export' }));
      store.setRaceId('RACE001');

      const exported = store.exportData();
      const parsed = JSON.parse(exported);

      expect(parsed.entries).toHaveLength(1);
      expect(parsed.raceId).toBe('RACE001');
      expect(parsed.version).toBeDefined();
      expect(parsed.exportedAt).toBeDefined();
    });

    it('should import data from JSON', () => {
      const importData = JSON.stringify({
        version: 2,
        entries: [createValidEntry({ id: 'dev_import-1704067200000-import' })],
        settings: { auto: true },
      });

      const result = store.importData(importData);

      expect(result.success).toBe(true);
      expect(result.entriesImported).toBe(1);
    });

    it('should not overwrite existing entries on import', () => {
      const existingEntry = createValidEntry({
        id: 'dev_test-1704067200000-existing',
      });
      store.addEntry(existingEntry);

      const importData = JSON.stringify({
        version: 2,
        entries: [
          createValidEntry({ id: 'dev_test-1704067200000-existing' }),
          createValidEntry({ id: 'dev_import-1704067200001-new' }),
        ],
      });

      const result = store.importData(importData);

      expect(result.entriesImported).toBe(1);
      expect(store.getState().entries).toHaveLength(2);
    });

    it('should handle invalid JSON on import', () => {
      const result = store.importData('invalid json{');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Persistence', () => {
    it('should schedule save after state change', () => {
      store.addEntry(createValidEntry());

      vi.advanceTimersByTime(150);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerEntries',
        expect.any(String),
      );
    });

    it('should debounce multiple rapid changes', () => {
      const entriesSetItemCalls = () =>
        localStorageMock.setItem.mock.calls.filter(
          (call: [string, string]) => call[0] === 'skiTimerEntries',
        ).length;

      const initialCalls = entriesSetItemCalls();

      store.addEntry(
        createValidEntry({ id: 'dev_test-1704067200000-debounce1' }),
      );
      store.addEntry(
        createValidEntry({ id: 'dev_test-1704067200001-debounce2' }),
      );
      store.addEntry(
        createValidEntry({ id: 'dev_test-1704067200002-debounce3' }),
      );

      vi.advanceTimersByTime(50);
      expect(entriesSetItemCalls()).toBe(initialCalls);

      vi.advanceTimersByTime(100);
      expect(entriesSetItemCalls()).toBe(initialCalls + 1);
    });

    it('should only save dirty slices (entries change should not save settings)', () => {
      // Clear all previous calls
      localStorageMock.setItem.mockClear();

      // Add an entry (dirties 'entries' slice only)
      store.addEntry(createValidEntry({ id: 'dev_test-1704067200000-dirty1' }));
      vi.advanceTimersByTime(150);

      const setItemKeys = localStorageMock.setItem.mock.calls.map(
        (call: [string, string]) => call[0],
      );

      // Should save entries
      expect(setItemKeys).toContain('skiTimerEntries');
      // Should NOT save settings (settings slice was not changed)
      expect(setItemKeys).not.toContain('skiTimerSettings');
    });

    it('should only save dirty slices (settings change should not save entries)', () => {
      // Add an entry first so entries exist
      store.addEntry(createValidEntry({ id: 'dev_test-1704067200000-dirty2' }));
      vi.advanceTimersByTime(150);

      // Clear all previous calls
      localStorageMock.setItem.mockClear();

      // Change a setting (dirties 'settings' slice only)
      store.updateSettings({ sound: true });
      vi.advanceTimersByTime(150);

      const setItemKeys = localStorageMock.setItem.mock.calls.map(
        (call: [string, string]) => call[0],
      );

      // Should save settings
      expect(setItemKeys).toContain('skiTimerSettings');
      // Should NOT save entries (entries slice was not changed)
      expect(setItemKeys).not.toContain('skiTimerEntries');
    });
  });
});

describe('Store Helper Functions', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorageMock.clear();
  });

  it('getEntries should return entries array', async () => {
    const { store, getEntries } = await import('../../src/store/index');
    const entry = createValidEntry();
    store.addEntry(entry);

    expect(getEntries()).toHaveLength(1);
  });

  it('getSettings should return settings object', async () => {
    const { getSettings } = await import('../../src/store/index');

    expect(getSettings()).toHaveProperty('auto');
    expect(getSettings()).toHaveProperty('haptic');
  });

  it('getSyncStatus should return sync status', async () => {
    const { store, getSyncStatus } = await import('../../src/store/index');

    expect(getSyncStatus()).toBe('disconnected');

    store.setSyncStatus('connected');
    expect(getSyncStatus()).toBe('connected');
  });
});
