/**
 * Unit Tests for Store Edge Cases
 * Tests: QuotaExceededError handling, notification queue overflow,
 *        state serialization/deserialization round-trip
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry, Settings } from '../../src/types';

// Mock localStorage with QuotaExceeded support
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  let throwOnNextSetItem = false;
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      if (throwOnNextSetItem) {
        const error = new DOMException(
          'Storage quota exceeded',
          'QuotaExceededError',
        );
        Object.defineProperty(error, 'name', { value: 'QuotaExceededError' });
        throw error;
      }
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
    _setThrowOnNextSetItem: (shouldThrow: boolean) => {
      throwOnNextSetItem = shouldThrow;
    },
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

describe('Store Edge Cases', () => {
  let store: typeof import('../../src/store/index').store;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorageMock.clear();
    localStorageMock._setThrowOnNextSetItem(false);
    vi.clearAllMocks();

    // Reset module between tests for clean state
    vi.resetModules();
    const storeModule = await import('../../src/store/index');
    store = storeModule.store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('QuotaExceededError handling during persistence', () => {
    it('should not throw when localStorage.setItem raises QuotaExceededError', () => {
      // Add an entry so there is something to persist
      store.addEntry(createValidEntry());

      // Now make localStorage throw on next setItem
      localStorageMock._setThrowOnNextSetItem(true);

      // Trigger save (should not throw)
      expect(() => {
        vi.advanceTimersByTime(150);
      }).not.toThrow();
    });

    it('should handle QuotaExceededError gracefully without crashing', () => {
      // StorageService.flush() catches errors internally, so the store
      // continues operating even when localStorage throws QuotaExceededError.
      store.addEntry(createValidEntry());
      localStorageMock._setThrowOnNextSetItem(true);

      // Should not throw - error is caught by StorageService.flush()
      expect(() => {
        vi.advanceTimersByTime(150);
      }).not.toThrow();

      // Store state should still be intact despite storage failure
      expect(store.getState().entries.length).toBeGreaterThan(0);
    });

    it('should continue operating after QuotaExceededError', () => {
      store.addEntry(createValidEntry({ id: 'dev_test-1-first' }));
      localStorageMock._setThrowOnNextSetItem(true);
      vi.advanceTimersByTime(150);

      // Re-enable storage
      localStorageMock._setThrowOnNextSetItem(false);

      // Should still be able to add entries
      store.addEntry(createValidEntry({ id: 'dev_test-2-second' }));
      expect(store.getState().entries).toHaveLength(2);

      // Should successfully persist after recovery
      vi.advanceTimersByTime(150);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerEntries',
        expect.any(String),
      );
    });
  });

  describe('Notification queue overflow behavior', () => {
    it('should handle many rapid state changes without crashing', () => {
      // Subscribe a listener to track notifications
      const listener = vi.fn();
      store.subscribe(listener);

      // Fire 200 rapid state changes (exceeds MAX_NOTIFICATION_QUEUE of 100)
      expect(() => {
        for (let i = 0; i < 200; i++) {
          store.setBibInput(String(i % 10));
        }
      }).not.toThrow();

      // Listener should have been called (exact count depends on queue draining)
      expect(listener).toHaveBeenCalled();
    });

    it('should drain oldest notifications when queue overflows during re-entrant changes', () => {
      let reentrantCount = 0;
      const maxReentrant = 150; // more than MAX_NOTIFICATION_QUEUE (100)

      const reentrantListener = vi.fn(
        (
          state: unknown,
          keys: (keyof import('../../src/types').AppState)[],
        ) => {
          if (keys.includes('bibInput') && reentrantCount < maxReentrant) {
            reentrantCount++;
            // Re-entrant state change during notification
            store.setBibInput(String(reentrantCount % 10));
          }
        },
      );

      store.subscribe(reentrantListener);

      // This should trigger the re-entrant listener cascade
      expect(() => {
        store.setBibInput('0');
      }).not.toThrow();

      // Should have processed some notifications (may not be all due to draining)
      expect(reentrantListener).toHaveBeenCalled();
    });

    it('should preserve listener error isolation when queue is stressed', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener crash');
      });
      const goodListener = vi.fn();

      store.subscribe(errorListener);
      store.subscribe(goodListener);

      // Rapid changes that stress the notification queue
      for (let i = 0; i < 50; i++) {
        store.setBibInput(String(i % 10));
      }

      // Good listener should still receive notifications despite error listener
      expect(goodListener).toHaveBeenCalled();
    });

  });

  describe('State serialization/deserialization round-trip', () => {
    it('should round-trip entries through localStorage', async () => {
      const entry1 = createValidEntry({
        id: 'dev_test-1000-roundtrip1',
        bib: '042',
        point: 'S',
        run: 1,
        status: 'ok',
      });
      const entry2 = createValidEntry({
        id: 'dev_test-2000-roundtrip2',
        bib: '099',
        point: 'F',
        run: 2,
        status: 'dns',
      });

      store.addEntry(entry1);
      store.addEntry(entry2);
      vi.advanceTimersByTime(150);

      // Verify entries were saved
      const savedJson = localStorageMock.getItem('skiTimerEntries');
      expect(savedJson).not.toBeNull();

      // Re-import store to test deserialization
      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      const loadedEntries = newStore.getState().entries;
      expect(loadedEntries).toHaveLength(2);
      expect(loadedEntries[0].bib).toBe('042');
      expect(loadedEntries[0].point).toBe('S');
      expect(loadedEntries[0].run).toBe(1);
      expect(loadedEntries[1].bib).toBe('099');
      expect(loadedEntries[1].status).toBe('dns');
    });

    it('should round-trip settings through localStorage', async () => {
      store.updateSettings({
        auto: false,
        haptic: false,
        sound: true,
        sync: true,
        gps: false,
        photoCapture: true,
      });
      vi.advanceTimersByTime(150);

      const savedJson = localStorageMock.getItem('skiTimerSettings');
      expect(savedJson).not.toBeNull();

      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      const settings = newStore.getState().settings;
      expect(settings.auto).toBe(false);
      expect(settings.haptic).toBe(false);
      expect(settings.sound).toBe(true);
      expect(settings.sync).toBe(true);
      expect(settings.gps).toBe(false);
      expect(settings.photoCapture).toBe(true);
    });

    it('should round-trip language through localStorage', async () => {
      store.setLanguage('en');
      vi.advanceTimersByTime(150);

      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().currentLang).toBe('en');
    });

    it('should round-trip device name through localStorage', async () => {
      store.setDeviceName('My Custom Timer');
      vi.advanceTimersByTime(150);

      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().deviceName).toBe('My Custom Timer');
    });

    it('should round-trip race ID through localStorage', async () => {
      store.setRaceId('SEASON-2024-RACE-03');
      vi.advanceTimersByTime(150);

      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().raceId).toBe('SEASON-2024-RACE-03');
    });

    it('should handle malformed JSON in localStorage gracefully', async () => {
      localStorageMock._getStore()['skiTimerEntries'] = 'not valid json{{{';
      localStorageMock._getStore()['skiTimerSettings'] = '{broken}';

      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      // Should fall back to defaults, not crash
      expect(newStore.getState().entries).toEqual([]);
      expect(newStore.getState().settings.auto).toBe(true); // default
    });

    it('should filter out invalid entries during deserialization', async () => {
      const entriesWithInvalid = [
        createValidEntry({ id: 'dev_test-1-good' }),
        { bad: 'entry' },
        null,
        42,
        createValidEntry({ id: 'dev_test-2-alsogood' }),
      ];
      localStorageMock._getStore()['skiTimerEntries'] =
        JSON.stringify(entriesWithInvalid);

      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().entries).toHaveLength(2);
      expect(newStore.getState().entries[0].id).toBe('dev_test-1-good');
      expect(newStore.getState().entries[1].id).toBe('dev_test-2-alsogood');
    });

    it('should replace photo data with "indexeddb" marker during persistence', () => {
      const entryWithPhoto = createValidEntry({
        id: 'dev_test-photo-1',
        photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDA...',
      });
      store.addEntry(entryWithPhoto);
      vi.advanceTimersByTime(150);

      const savedJson = localStorageMock.getItem('skiTimerEntries');
      expect(savedJson).not.toBeNull();
      const parsed = JSON.parse(savedJson!);
      expect(parsed[0].photo).toBe('indexeddb');
    });

    it('should preserve run field default of 1 during deserialization', async () => {
      // Entry without run field (legacy format)
      const legacyEntry = {
        id: 'dev_test-legacy-1',
        bib: '001',
        point: 'S',
        timestamp: new Date().toISOString(),
        status: 'ok',
        deviceId: 'dev_test',
        deviceName: 'Test',
      };
      localStorageMock._getStore()['skiTimerEntries'] = JSON.stringify([
        legacyEntry,
      ]);

      vi.resetModules();
      const { store: newStore } = await import('../../src/store/index');

      expect(newStore.getState().entries[0].run).toBe(1);
    });
  });

  describe('Dirty-slice persistence isolation', () => {
    it('should only persist entries slice when entries change', () => {
      localStorageMock.setItem.mockClear();

      store.addEntry(createValidEntry());
      vi.advanceTimersByTime(150);

      const setItemKeys = localStorageMock.setItem.mock.calls.map(
        (call: [string, string]) => call[0],
      );

      expect(setItemKeys).toContain('skiTimerEntries');
      expect(setItemKeys).not.toContain('skiTimerSettings');
      expect(setItemKeys).not.toContain('skiTimerLang');
    });

    it('should only persist settings slice when settings change', () => {
      // First add entry to make entries non-empty
      store.addEntry(createValidEntry());
      vi.advanceTimersByTime(150);
      localStorageMock.setItem.mockClear();

      store.updateSettings({ sound: true });
      vi.advanceTimersByTime(150);

      const setItemKeys = localStorageMock.setItem.mock.calls.map(
        (call: [string, string]) => call[0],
      );

      expect(setItemKeys).toContain('skiTimerSettings');
      expect(setItemKeys).not.toContain('skiTimerEntries');
    });

    it('should not save if no slices are dirty', () => {
      vi.advanceTimersByTime(150);
      localStorageMock.setItem.mockClear();

      // Reading state should not trigger a save
      store.getState();
      vi.advanceTimersByTime(150);

      // Only deviceId and deviceName get saved during initialization
      // After that, no more setItem calls should occur
      const postClearCalls = localStorageMock.setItem.mock.calls;
      expect(postClearCalls).toHaveLength(0);
    });
  });
});
