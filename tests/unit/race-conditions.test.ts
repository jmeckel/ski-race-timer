/**
 * Race Condition Tests for Ski Race Timer
 *
 * Tests concurrency scenarios across store, broadcast, GPS,
 * and entry recording. Each test either proves the code
 * correctly guards against the race condition or documents
 * a real vulnerability.
 *
 * NOTE: Tests that require mocking the store module (sync queue,
 * camera) are in separate files to avoid vi.mock hoisting conflicts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../src/types';

// ============================================================
// Helpers
// ============================================================

/** Create a valid Entry object with optional overrides */
function createEntry(overrides: Partial<Entry> = {}): Entry {
  const id =
    overrides.id ??
    `dev_test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
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

// ============================================================
// 1. Store -- Rapid sequential state updates
// ============================================================

describe('Race Condition: Store concurrent updates', () => {
  let store: typeof import('../../src/store/index').store;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const storeModule = await import('../../src/store/index');
    store = storeModule.store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should deliver consistent state to effects during rapid sequential updates', async () => {
    const storeModule = await import('../../src/store/index');
    const states: string[] = [];

    const dispose = storeModule.effect(() => {
      states.push(storeModule.$bibInput.value);
    });

    store.setBibInput('1');
    store.setBibInput('12');
    store.setBibInput('123');

    // Each signal update should be tracked by the effect
    expect(states).toContain('1');
    expect(states).toContain('12');
    expect(states).toContain('123');
    dispose();
  });

  it('should handle an effect that triggers another state update (re-entrant)', async () => {
    const storeModule = await import('../../src/store/index');

    const dispose = storeModule.effect(() => {
      const currentView = storeModule.$currentView.value;
      // Re-entrantly trigger another state change when we see 'results'
      if (currentView === 'results') {
        store.setBibInput('9');
      }
    });

    store.setView('results');

    // Final state should reflect both updates
    expect(store.getState().currentView).toBe('results');
    expect(store.getState().bibInput).toBe('9');
    dispose();
  });

  it('should not lose entries when many are added in rapid succession', () => {
    const count = 100;
    for (let i = 0; i < count; i++) {
      store.addEntry(
        createEntry({
          id: `dev_test-${i}-rapid`,
          bib: String(i).padStart(3, '0'),
        }),
      );
    }

    expect(store.getState().entries).toHaveLength(count);

    // Verify each entry is present
    for (let i = 0; i < count; i++) {
      expect(
        store.getState().entries.find((e) => e.id === `dev_test-${i}-rapid`),
      ).toBeDefined();
    }
  });

  it('should coalesce persistence writes during rapid updates', () => {
    for (let i = 0; i < 10; i++) {
      store.addEntry(createEntry({ id: `dev_test-${i}-coalesce` }));
    }

    // Trigger the debounce timer
    vi.advanceTimersByTime(150);

    // The store writes entries with debounce -- 10 addEntry calls within 100ms
    // should result in a single write. We verify the final entries count is correct.
    expect(store.getState().entries).toHaveLength(10);
  });
});

// ============================================================
// 2. BroadcastChannel + Cloud Sync -- Duplicate entry prevention
// ============================================================

describe('Race Condition: BroadcastChannel + cloud sync conflicts', () => {
  let store: typeof import('../../src/store/index').store;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const storeModule = await import('../../src/store/index');
    store = storeModule.store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not create duplicates when the same entry arrives via broadcast and cloud sync', () => {
    const cloudEntry = createEntry({
      id: 'dev_remote-1704067200000-shared',
      deviceId: 'dev_remote',
      bib: '055',
    });

    // Simulate the entry arriving via BroadcastChannel first
    const added1 = store.mergeCloudEntries([cloudEntry]);
    expect(added1).toBe(1);

    // Then the same entry arrives via cloud sync polling
    const added2 = store.mergeCloudEntries([cloudEntry]);
    expect(added2).toBe(0);

    // Only one copy should exist
    const matching = store
      .getState()
      .entries.filter((e) => e.id === 'dev_remote-1704067200000-shared');
    expect(matching).toHaveLength(1);
  });

  it('should not create duplicates when entries arrive in different order', () => {
    const entry1 = createEntry({
      id: 'dev_remote-1-order',
      deviceId: 'dev_remote',
      timestamp: '2024-01-15T10:00:01.000Z',
    });
    const entry2 = createEntry({
      id: 'dev_remote-2-order',
      deviceId: 'dev_remote',
      timestamp: '2024-01-15T10:00:00.000Z',
    });

    // Cloud sync delivers [entry2, entry1]
    store.mergeCloudEntries([entry2, entry1]);

    // Broadcast delivers [entry1] again
    const added = store.mergeCloudEntries([entry1]);
    expect(added).toBe(0);

    expect(store.getState().entries).toHaveLength(2);
  });

  it('should handle concurrent merge of overlapping batches without duplication', () => {
    const shared = createEntry({
      id: 'dev_other-99-overlap',
      deviceId: 'dev_other',
    });
    const unique1 = createEntry({
      id: 'dev_other-100-unique1',
      deviceId: 'dev_other',
    });
    const unique2 = createEntry({
      id: 'dev_other-101-unique2',
      deviceId: 'dev_other',
    });

    // First batch (e.g. from cloud): shared + unique1
    store.mergeCloudEntries([shared, unique1]);
    expect(store.getState().entries).toHaveLength(2);

    // Second batch (e.g. from broadcast delayed): shared + unique2
    store.mergeCloudEntries([shared, unique2]);
    expect(store.getState().entries).toHaveLength(3); // shared not duplicated

    // Verify exact entries
    const ids = store.getState().entries.map((e) => e.id);
    expect(ids).toContain('dev_other-99-overlap');
    expect(ids).toContain('dev_other-100-unique1');
    expect(ids).toContain('dev_other-101-unique2');
  });

  it('should correctly handle deletedIds arriving before the entry itself', () => {
    const entryToDelete = createEntry({
      id: 'dev_remote-del-1',
      deviceId: 'dev_remote',
    });

    // First, the deletion notice arrives (no entries to remove yet)
    store.removeDeletedCloudEntries([entryToDelete.id]);

    // Then the entry itself arrives (from an older sync response).
    // mergeCloudEntries only checks the deletedIds parameter passed to that
    // specific call, not a persistent deletion log. This documents the actual
    // behavior -- the entry will be added transiently until the next sync
    // poll re-delivers the deletion.
    const added = store.mergeCloudEntries([entryToDelete]);
    expect(added).toBe(1);
  });

  it('should skip entries from the local device during merge', () => {
    const localDeviceId = store.getState().deviceId;

    const localEntry = createEntry({
      id: `${localDeviceId}-1-self`,
      deviceId: localDeviceId,
    });

    const added = store.mergeCloudEntries([localEntry]);
    expect(added).toBe(0);
    expect(store.getState().entries).toHaveLength(0);
  });

  it('should handle cloud deletedIds preventing re-add during same merge call', () => {
    const entry = createEntry({
      id: 'dev_remote-2-deletmerge',
      deviceId: 'dev_remote',
    });

    // Merge with deletedIds including the entry's ID -- should not add it
    const added = store.mergeCloudEntries([entry], [entry.id]);
    expect(added).toBe(0);
    expect(store.getState().entries).toHaveLength(0);
  });
});

// ============================================================
// 3. GPS service start/stop during rapid ambient mode toggle
// ============================================================

describe('Race Condition: GPS rapid start/stop', () => {
  let gpsService: typeof import('../../src/services/gps').gpsService;
  const mockWatchPosition = vi.fn();
  const mockClearWatch = vi.fn();
  const mockGetCurrentPosition = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Replace geolocation methods on the existing mock object (from setup.js)
    (navigator.geolocation as any).watchPosition = mockWatchPosition;
    (navigator.geolocation as any).clearWatch = mockClearWatch;
    (navigator.geolocation as any).getCurrentPosition = mockGetCurrentPosition;

    let watchIdCounter = 1;
    mockWatchPosition.mockImplementation(() => watchIdCounter++);

    const gpsModule = await import('../../src/services/gps');
    gpsService = gpsModule.gpsService;
  });

  afterEach(() => {
    gpsService.stop();
  });

  it('should not leak watch IDs when toggled rapidly', () => {
    for (let i = 0; i < 10; i++) {
      gpsService.start();
      gpsService.stop();
    }

    // Every watchPosition call should have a matching clearWatch
    const watchCalls = mockWatchPosition.mock.calls.length;
    const clearCalls = mockClearWatch.mock.calls.length;
    expect(clearCalls).toBeGreaterThanOrEqual(watchCalls);
  });

  it('should not start duplicate watchers when start() is called twice', () => {
    gpsService.start();
    const firstWatchCalls = mockWatchPosition.mock.calls.length;

    // Second start should be a no-op (already watching)
    gpsService.start();
    const secondWatchCalls = mockWatchPosition.mock.calls.length;

    expect(secondWatchCalls).toBe(firstWatchCalls);
  });

  it('should handle pause/resume cycle without leaking watchers', () => {
    gpsService.start();

    for (let i = 0; i < 5; i++) {
      gpsService.pause();
      gpsService.resume();
    }

    const totalWatchCalls = mockWatchPosition.mock.calls.length;
    const totalClearCalls = mockClearWatch.mock.calls.length;

    // Active watchers should never exceed 1
    expect(totalClearCalls).toBeGreaterThanOrEqual(totalWatchCalls - 1);
  });

  it('should correctly handle stop() when not started', () => {
    expect(() => gpsService.stop()).not.toThrow();
    expect(mockClearWatch).not.toHaveBeenCalled();
  });

  it('should track pausedByView flag correctly through start/pause/resume', () => {
    gpsService.start();
    expect(gpsService.isPaused()).toBe(false);

    gpsService.pause();
    expect(gpsService.isPaused()).toBe(true);

    gpsService.resume();
    expect(gpsService.isPaused()).toBe(false);
  });

  it('should not resume if not paused by view', () => {
    gpsService.start();
    const watchCallsAfterStart = mockWatchPosition.mock.calls.length;

    // resume() without prior pause() should be a no-op
    gpsService.resume();
    const watchCallsAfterResume = mockWatchPosition.mock.calls.length;

    expect(watchCallsAfterResume).toBe(watchCallsAfterStart);
  });
});

// ============================================================
// 4. Entry recording during view switch
// ============================================================

describe('Race Condition: Entry recording during view switch', () => {
  let store: typeof import('../../src/store/index').store;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const storeModule = await import('../../src/store/index');
    store = storeModule.store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should persist entry even if view switches during addEntry', async () => {
    const storeModule = await import('../../src/store/index');
    const entry = createEntry({ id: 'dev_test-1-viewswitch' });

    // Effect that switches view when entries change
    const dispose = storeModule.effect(() => {
      const entries = storeModule.$entries.value;
      if (entries.length > 0) {
        store.setView('results');
      }
    });

    store.addEntry(entry);

    expect(store.getState().entries).toHaveLength(1);
    expect(store.getState().entries[0].id).toBe('dev_test-1-viewswitch');
    expect(store.getState().currentView).toBe('results');
    dispose();
  });

  it('should maintain entry data integrity when recording, view switch, and undo happen together', () => {
    const entry = createEntry({ id: 'dev_test-2-integrity', bib: '077' });

    store.addEntry(entry);
    expect(store.getState().entries).toHaveLength(1);

    store.setView('results');

    const undoResult = store.undo();
    expect(undoResult).not.toBeNull();
    expect(store.getState().entries).toHaveLength(0);

    store.redo();
    expect(store.getState().entries).toHaveLength(1);
    expect(store.getState().entries[0].bib).toBe('077');
  });

  it('should handle setRecording(true) followed by view switch and then addEntry', () => {
    store.setRecording(true);
    expect(store.getState().isRecording).toBe(true);

    store.setView('results');

    const entry = createEntry({ id: 'dev_test-3-viewrecord' });
    store.addEntry(entry);

    // isRecording should be reset to false after addEntry
    expect(store.getState().isRecording).toBe(false);
    expect(store.getState().entries).toHaveLength(1);
    expect(store.getState().currentView).toBe('results');
  });

  it('should not corrupt entries when delete and view switch happen in same effect', async () => {
    const storeModule = await import('../../src/store/index');
    const entry1 = createEntry({ id: 'dev_test-4a-corrupt' });
    const entry2 = createEntry({ id: 'dev_test-4b-corrupt' });
    store.addEntry(entry1);
    store.addEntry(entry2);

    // Effect that switches view when entries change on timer view
    const dispose = storeModule.effect(() => {
      void storeModule.$entries.value;
      if (store.getState().currentView === 'timer') {
        store.setView('results');
      }
    });

    store.deleteEntry('dev_test-4a-corrupt');

    expect(store.getState().entries).toHaveLength(1);
    expect(store.getState().entries[0].id).toBe('dev_test-4b-corrupt');
    dispose();
  });
});

// ============================================================
// 5. Cloud merge rapid operations
// ============================================================

describe('Race Condition: Cloud fetch / merge rapid operations', () => {
  let store: typeof import('../../src/store/index').store;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const storeModule = await import('../../src/store/index');
    store = storeModule.store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle rapid mergeCloudEntries calls without corruption', () => {
    const batch1 = [
      createEntry({ id: 'dev_r1-1-fast', deviceId: 'dev_r1' }),
      createEntry({ id: 'dev_r1-2-fast', deviceId: 'dev_r1' }),
    ];
    const batch2 = [
      createEntry({ id: 'dev_r2-3-fast', deviceId: 'dev_r2' }),
      createEntry({ id: 'dev_r2-4-fast', deviceId: 'dev_r2' }),
    ];
    const batch3 = [
      createEntry({ id: 'dev_r1-1-fast', deviceId: 'dev_r1' }), // duplicate
      createEntry({ id: 'dev_r3-5-fast', deviceId: 'dev_r3' }),
    ];

    store.mergeCloudEntries(batch1);
    store.mergeCloudEntries(batch2);
    store.mergeCloudEntries(batch3);

    expect(store.getState().entries).toHaveLength(5);
  });

  it('should maintain sorted order after rapid merges with different timestamps', () => {
    const entries = [
      createEntry({
        id: 'dev_r1-late',
        deviceId: 'dev_r1',
        timestamp: '2024-01-15T12:00:03.000Z',
      }),
      createEntry({
        id: 'dev_r2-early',
        deviceId: 'dev_r2',
        timestamp: '2024-01-15T12:00:01.000Z',
      }),
      createEntry({
        id: 'dev_r3-mid',
        deviceId: 'dev_r3',
        timestamp: '2024-01-15T12:00:02.000Z',
      }),
    ];

    store.mergeCloudEntries([entries[0]]);
    store.mergeCloudEntries([entries[1]]);
    store.mergeCloudEntries([entries[2]]);

    const timestamps = store
      .getState()
      .entries.map((e) => new Date(e.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });
});

// ============================================================
// 6. Entry deletion during cloud merge
// ============================================================

describe('Race Condition: Entry deletion during cloud merge', () => {
  let store: typeof import('../../src/store/index').store;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const storeModule = await import('../../src/store/index');
    store = storeModule.store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle local delete followed by cloud merge of the same entry', () => {
    const entry = createEntry({
      id: 'dev_remote-1-deletmerge',
      deviceId: 'dev_remote',
    });
    store.mergeCloudEntries([entry]);
    expect(store.getState().entries).toHaveLength(1);

    store.deleteEntry('dev_remote-1-deletmerge');
    expect(store.getState().entries).toHaveLength(0);

    // Cloud re-delivers the same entry -- documents that it re-appears
    // until the deletion propagates to the server
    const added = store.mergeCloudEntries([entry]);
    expect(added).toBe(1);
    expect(store.getState().entries).toHaveLength(1);
  });

  it('should handle cloud deletedIds preventing re-add during same merge call', () => {
    const entry = createEntry({
      id: 'dev_remote-2-deletmerge',
      deviceId: 'dev_remote',
    });

    const added = store.mergeCloudEntries([entry], [entry.id]);
    expect(added).toBe(0);
    expect(store.getState().entries).toHaveLength(0);
  });

  it('should handle interleaved add and delete operations', () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      createEntry({
        id: `dev_remote-${i}-interleave`,
        deviceId: 'dev_remote',
      }),
    );

    store.mergeCloudEntries(entries);
    expect(store.getState().entries).toHaveLength(5);

    store.deleteEntry('dev_remote-1-interleave');
    store.deleteEntry('dev_remote-3-interleave');
    store.mergeCloudEntries([
      createEntry({
        id: 'dev_remote-5-interleave',
        deviceId: 'dev_remote',
      }),
    ]);

    expect(store.getState().entries).toHaveLength(4);
  });
});

// ============================================================
// 7. Sync queue + addEntry atomicity
// ============================================================

describe('Race Condition: Sync queue consistency with entry operations', () => {
  let store: typeof import('../../src/store/index').store;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const storeModule = await import('../../src/store/index');
    store = storeModule.store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add entry and enqueue for sync atomically when sync is enabled', () => {
    store.updateSettings({ sync: true });
    store.setRaceId('RACE-001');

    const entry = createEntry({ id: 'dev_test-1-atomic' });
    store.addEntry(entry);

    expect(
      store.getState().entries.find((e) => e.id === 'dev_test-1-atomic'),
    ).toBeDefined();
    expect(
      store
        .getState()
        .syncQueue.find((item) => item.entry.id === 'dev_test-1-atomic'),
    ).toBeDefined();
  });

  it('should not enqueue for sync when sync is disabled', () => {
    store.updateSettings({ sync: false });

    const entry = createEntry({ id: 'dev_test-2-nosync' });
    store.addEntry(entry);

    expect(store.getState().entries).toHaveLength(1);
    expect(store.getState().syncQueue).toHaveLength(0);
  });

  it('should handle removeFromSyncQueue for an entry that was already removed', () => {
    store.updateSettings({ sync: true });
    store.setRaceId('RACE-001');

    const entry = createEntry({ id: 'dev_test-3-doubleremove' });
    store.addEntry(entry);
    expect(store.getState().syncQueue).toHaveLength(1);

    store.removeFromSyncQueue('dev_test-3-doubleremove');
    expect(store.getState().syncQueue).toHaveLength(0);

    expect(() =>
      store.removeFromSyncQueue('dev_test-3-doubleremove'),
    ).not.toThrow();
    expect(store.getState().syncQueue).toHaveLength(0);
  });

  it('should handle rapid add-then-remove from sync queue', () => {
    store.updateSettings({ sync: true });
    store.setRaceId('RACE-001');

    for (let i = 0; i < 20; i++) {
      const entry = createEntry({ id: `dev_test-${i}-rapidqueue` });
      store.addEntry(entry);
      store.removeFromSyncQueue(`dev_test-${i}-rapidqueue`);
    }

    expect(store.getState().entries).toHaveLength(20);
    expect(store.getState().syncQueue).toHaveLength(0);
  });
});
