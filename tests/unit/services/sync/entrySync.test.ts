/**
 * Unit Tests for Entry Sync Module
 * Tests: initializeEntrySync, getLastSyncTimestamp, fetchCloudEntries,
 *        deleteEntryFromCloud, sendEntryToCloud, pushLocalEntries, cleanupEntrySync
 *
 * Internal functions tested via exported behavior:
 *   processCloudPhotos, fetchCloudEntriesImpl, classifySyncError
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEntry } from '../../../helpers/factories';

// ---------------------------------------------------------------------------
// Mocks (must be declared before the module-under-test import)
// ---------------------------------------------------------------------------

const mockGetState = vi.fn();
const mockSetSyncStatus = vi.fn();
const mockSetCloudDeviceCount = vi.fn();
const mockSetCloudHighestBib = vi.fn();
const mockMergeCloudEntries = vi.fn(() => 0);
const mockRemoveDeletedCloudEntries = vi.fn();
const mockRemoveFromSyncQueue = vi.fn();

vi.mock('../../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    setSyncStatus: (...args: unknown[]) => mockSetSyncStatus(...args),
    setCloudDeviceCount: (...args: unknown[]) =>
      mockSetCloudDeviceCount(...args),
    setCloudHighestBib: (...args: unknown[]) => mockSetCloudHighestBib(...args),
    mergeCloudEntries: (...args: unknown[]) => mockMergeCloudEntries(...args),
    removeDeletedCloudEntries: (...args: unknown[]) =>
      mockRemoveDeletedCloudEntries(...args),
    removeFromSyncQueue: (...args: unknown[]) =>
      mockRemoveFromSyncQueue(...args),
  },
}));

vi.mock('../../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../../src/utils/errors', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../../../src/utils/format', () => ({
  getPointLabel: vi.fn((point: string) => (point === 'S' ? 'Start' : 'Finish')),
}));

vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/recentRaces', () => ({
  addRecentRace: vi.fn(),
}));

vi.mock('../../../../src/utils/validation', () => ({
  isValidEntry: vi.fn(() => true),
}));

vi.mock('../../../../src/services/auth', () => ({
  clearAuthToken: vi.fn(),
  dispatchAuthExpired: vi.fn(),
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
  getTokenExpiryMs: vi.fn(() => Infinity),
}));

vi.mock('../../../../src/services/photoStorage', () => ({
  photoStorage: {
    hasPhoto: vi.fn(() => Promise.resolve(false)),
    savePhoto: vi.fn(() => Promise.resolve(true)),
    getPhoto: vi.fn(() => Promise.resolve(null)),
    deletePhoto: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('../../../../src/services/sync/types', () => ({
  API_BASE: 'https://test.api/v1/sync',
  FETCH_TIMEOUT: 5000,
}));

// ---------------------------------------------------------------------------
// Import module-under-test AFTER mocks
// ---------------------------------------------------------------------------

// Import mocked modules for assertions
import {
  clearAuthToken,
  dispatchAuthExpired,
} from '../../../../src/services/auth';
import { photoStorage } from '../../../../src/services/photoStorage';
import {
  cleanupEntrySync,
  deleteEntryFromCloud,
  fetchCloudEntries,
  getLastSyncTimestamp,
  initializeEntrySync,
  pushLocalEntries,
  sendEntryToCloud,
} from '../../../../src/services/sync/entrySync';
import { fetchWithTimeout } from '../../../../src/utils/errors';
import { addRecentRace } from '../../../../src/utils/recentRaces';
import { isValidEntry } from '../../../../src/utils/validation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = fetchWithTimeout as ReturnType<typeof vi.fn>;

const mockResponse = (data: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: () => Promise.resolve(data),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Entry Sync Module', () => {
  const mockCallbacks = {
    onPollingAdjust: vi.fn(),
    onResetFastPolling: vi.fn(),
    onCleanup: vi.fn(),
    showToast: vi.fn(),
    fetchFaults: vi.fn(() => Promise.resolve()),
  };

  const baseState = {
    settings: { sync: true, syncPhotos: false },
    raceId: 'test-race',
    deviceId: 'dev_local',
    deviceName: 'Local Device',
    syncStatus: 'connected' as const,
    currentLang: 'en',
    entries: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({ ...baseState });
    initializeEntrySync(mockCallbacks);
  });

  afterEach(() => {
    cleanupEntrySync();
  });

  // =========================================================================
  // 1. initializeEntrySync / cleanupEntrySync
  // =========================================================================

  describe('initializeEntrySync / cleanupEntrySync', () => {
    it('should store callbacks and use them during fetch', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [createEntry()],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );
      mockMergeCloudEntries.mockReturnValueOnce(1);

      await fetchCloudEntries();

      // Callbacks should have been invoked
      expect(mockCallbacks.showToast).toHaveBeenCalled();
      expect(mockCallbacks.onPollingAdjust).toHaveBeenCalledWith(true, true);
      expect(mockCallbacks.fetchFaults).toHaveBeenCalled();
    });

    it('should not call callbacks after cleanup', async () => {
      cleanupEntrySync();

      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [createEntry()],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );
      mockMergeCloudEntries.mockReturnValueOnce(1);

      // Re-enable sync without callbacks
      await fetchCloudEntries();

      // showToast is only called via callbacks?.showToast, so after cleanup
      // the optional chain should short-circuit
      expect(mockCallbacks.showToast).not.toHaveBeenCalled();
    });

    it('should reset lastSyncTimestamp on cleanup', async () => {
      // Force a successful sync to set lastSyncTimestamp
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: 12345,
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      expect(getLastSyncTimestamp()).toBe(12345);

      cleanupEntrySync();
      expect(getLastSyncTimestamp()).toBe(0);
    });
  });

  // =========================================================================
  // 2. getLastSyncTimestamp
  // =========================================================================

  describe('getLastSyncTimestamp', () => {
    it('should return 0 initially', () => {
      expect(getLastSyncTimestamp()).toBe(0);
    });

    it('should return updated timestamp after successful fetch', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: 999999,
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      expect(getLastSyncTimestamp()).toBe(999999);
    });

    it('should fall back to 0 when lastUpdated is null/falsy (triggers full sync next poll)', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: null,
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      const ts = getLastSyncTimestamp();
      expect(ts).toBe(0);
    });
  });

  // =========================================================================
  // 3. fetchCloudEntries - skip conditions and coalescing
  // =========================================================================

  describe('fetchCloudEntries - skip conditions', () => {
    it('should skip when sync is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, sync: false },
      });

      await fetchCloudEntries();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip when raceId is empty', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        raceId: '',
      });

      await fetchCloudEntries();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should coalesce duplicate concurrent calls', async () => {
      let resolveFirst!: (value: unknown) => void;
      const firstCallPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      mockFetch.mockImplementation(() => firstCallPromise);

      // Fire two concurrent calls
      const p1 = fetchCloudEntries();
      const p2 = fetchCloudEntries();

      // Resolve the underlying fetch
      resolveFirst(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await Promise.all([p1, p2]);

      // fetchWithTimeout should only have been called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should allow a new fetch after the first completes', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      await fetchCloudEntries();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 4. fetchCloudEntries - successful fetch
  // =========================================================================

  describe('fetchCloudEntries - successful fetch', () => {
    it('should set syncing status during fetch', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      // Should have set 'syncing' first, then 'connected'
      expect(mockSetSyncStatus).toHaveBeenCalledWith('syncing');
      expect(mockSetSyncStatus).toHaveBeenCalledWith('connected');
    });

    it('should not set syncing when previous status is error/offline', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        syncStatus: 'error',
      });

      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      // Should NOT have set 'syncing' (only sets it when connected or connecting)
      const syncingCalls = mockSetSyncStatus.mock.calls.filter(
        (call: unknown[]) => call[0] === 'syncing',
      );
      expect(syncingCalls).toHaveLength(0);

      // Should still set 'connected' after success
      expect(mockSetSyncStatus).toHaveBeenCalledWith('connected');
    });

    it('should merge cloud entries into store', async () => {
      const entries = [
        createEntry({ bib: '001' }),
        createEntry({ bib: '002' }),
      ];

      mockFetch.mockResolvedValue(
        mockResponse({
          entries,
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      expect(mockMergeCloudEntries).toHaveBeenCalled();
      // First arg is processed entries, second is deletedIds
      const callArgs = mockMergeCloudEntries.mock.calls[0];
      expect(callArgs[0]).toHaveLength(2);
      expect(callArgs[1]).toEqual([]);
    });

    it('should show toast when entries are added', async () => {
      const entries = [createEntry()];

      mockFetch.mockResolvedValue(
        mockResponse({
          entries,
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      mockMergeCloudEntries.mockReturnValueOnce(1);

      await fetchCloudEntries();

      expect(mockCallbacks.showToast).toHaveBeenCalledWith(
        'syncedEntriesFromCloud',
      );
    });

    it('should not show toast when no entries are added', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [createEntry()],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      mockMergeCloudEntries.mockReturnValueOnce(0);

      await fetchCloudEntries();

      expect(mockCallbacks.showToast).not.toHaveBeenCalled();
    });

    it('should update device count from response', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
          deviceCount: 3,
        }),
      );

      await fetchCloudEntries();
      expect(mockSetCloudDeviceCount).toHaveBeenCalledWith(3);
    });

    it('should update highest bib from response', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
          highestBib: 42,
        }),
      );

      await fetchCloudEntries();
      expect(mockSetCloudHighestBib).toHaveBeenCalledWith(42);
    });

    it('should remove deleted cloud entries', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: ['id-1', 'id-2'],
        }),
      );

      await fetchCloudEntries();
      expect(mockRemoveDeletedCloudEntries).toHaveBeenCalledWith([
        'id-1',
        'id-2',
      ]);
    });

    it('should filter non-string and empty deletedIds', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: ['id-1', 42, null, '', 'id-2'],
        }),
      );

      await fetchCloudEntries();
      expect(mockRemoveDeletedCloudEntries).toHaveBeenCalledWith([
        'id-1',
        'id-2',
      ]);
    });

    it('should update lastSyncTimestamp after success', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: 55555,
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      expect(getLastSyncTimestamp()).toBe(55555);
    });

    it('should track race as recently synced', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [createEntry()],
          lastUpdated: 77777,
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      expect(addRecentRace).toHaveBeenCalledWith('test-race', 77777, 1);
    });

    it('should call fetchFaults callback', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      expect(mockCallbacks.fetchFaults).toHaveBeenCalled();
    });

    it('should call onPollingAdjust(true, hasChanges) on success', async () => {
      // No changes scenario
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      expect(mockCallbacks.onPollingAdjust).toHaveBeenCalledWith(true, false);
    });

    it('should report hasChanges=true when deletedIds are present', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: ['id-1'],
        }),
      );

      await fetchCloudEntries();
      expect(mockCallbacks.onPollingAdjust).toHaveBeenCalledWith(true, true);
    });

    it('should report hasChanges=true when entries are merged', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [createEntry()],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      mockMergeCloudEntries.mockReturnValueOnce(1);

      await fetchCloudEntries();
      expect(mockCallbacks.onPollingAdjust).toHaveBeenCalledWith(true, true);
    });

    it('should filter invalid entries from cloud', async () => {
      const validEntry = createEntry({ bib: '001' });
      const invalidEntry = createEntry({ bib: '002' });

      (isValidEntry as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [validEntry, invalidEntry],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      // mergeCloudEntries should receive only the valid entry
      const processedEntries = mockMergeCloudEntries.mock.calls[0]?.[0];
      expect(processedEntries).toHaveLength(1);
    });

    it('should handle entries array being absent', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          lastUpdated: Date.now(),
        }),
      );

      await fetchCloudEntries();
      // Should not call mergeCloudEntries with empty array but also not throw
      expect(mockMergeCloudEntries).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. fetchCloudEntries - 401 with expired token
  // =========================================================================

  describe('fetchCloudEntries - 401 expired token', () => {
    it('should clear auth, dispatch expired event, and call cleanup', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ expired: true }),
      });

      await fetchCloudEntries();

      expect(clearAuthToken).toHaveBeenCalled();
      expect(mockSetSyncStatus).toHaveBeenCalledWith('disconnected');
      expect(dispatchAuthExpired).toHaveBeenCalled();
      expect(mockCallbacks.onCleanup).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. fetchCloudEntries - 401 without expired flag
  // =========================================================================

  describe('fetchCloudEntries - 401 without expired flag', () => {
    it('should throw and be caught as error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });

      await fetchCloudEntries();

      // Should not clear auth or dispatch expired
      expect(clearAuthToken).not.toHaveBeenCalled();
      expect(dispatchAuthExpired).not.toHaveBeenCalled();

      // The thrown error is caught by the try/catch and results in error status
      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
      expect(mockCallbacks.onPollingAdjust).toHaveBeenCalledWith(false);
    });

    it('should handle 401 with unparseable JSON body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await fetchCloudEntries();

      // With parse failure, data becomes {}, no expired flag
      // So it should throw and be classified as error
      expect(clearAuthToken).not.toHaveBeenCalled();
      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });
  });

  // =========================================================================
  // 7. fetchCloudEntries - non-ok response
  // =========================================================================

  describe('fetchCloudEntries - non-ok response', () => {
    it('should handle 500 error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
      expect(mockCallbacks.onPollingAdjust).toHaveBeenCalledWith(false);
    });

    it('should handle 503 service unavailable', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      });

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });
  });

  // =========================================================================
  // 8. fetchCloudEntries - race deletion
  // =========================================================================

  describe('fetchCloudEntries - race deletion', () => {
    it('should dispatch race-deleted event and call cleanup', async () => {
      const raceDeletedHandler = vi.fn();
      window.addEventListener('race-deleted', raceDeletedHandler);

      mockFetch.mockResolvedValue(
        mockResponse({
          deleted: true,
          deletedAt: 123456,
          message: 'Race was deleted',
        }),
      );

      await fetchCloudEntries();

      expect(raceDeletedHandler).toHaveBeenCalled();
      const event = raceDeletedHandler.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({
        raceId: 'test-race',
        deletedAt: 123456,
        message: 'Race was deleted',
      });
      expect(mockCallbacks.onCleanup).toHaveBeenCalled();

      window.removeEventListener('race-deleted', raceDeletedHandler);
    });

    it('should return early after race-deleted without merging', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          deleted: true,
          deletedAt: Date.now(),
          message: 'Deleted',
          entries: [createEntry()],
        }),
      );

      await fetchCloudEntries();

      expect(mockMergeCloudEntries).not.toHaveBeenCalled();
      expect(mockCallbacks.onPollingAdjust).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 9. fetchCloudEntries - error classification
  // =========================================================================

  describe('fetchCloudEntries - error classification', () => {
    it('should classify timeout as error', async () => {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'FetchTimeoutError';
      mockFetch.mockRejectedValue(timeoutError);

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });

    it('should classify "timed out" message as error', async () => {
      mockFetch.mockRejectedValue(new Error('Request timed out'));

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });

    it('should classify 500 error message as error', async () => {
      mockFetch.mockRejectedValue(new Error('HTTP 500'));

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });

    it('should classify 503 error message as error', async () => {
      mockFetch.mockRejectedValue(new Error('HTTP 503'));

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });

    it('should classify "Failed to fetch" as offline', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('offline');
    });

    it('should classify "NetworkError" as offline', async () => {
      mockFetch.mockRejectedValue(new Error('NetworkError when fetching'));

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('offline');
    });

    it('should classify unknown errors as error', async () => {
      mockFetch.mockRejectedValue(new Error('Something unexpected'));

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });

    it('should classify non-Error thrown values as error', async () => {
      mockFetch.mockRejectedValue('string error');

      await fetchCloudEntries();

      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });

    it('should call onPollingAdjust(false) on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await fetchCloudEntries();

      expect(mockCallbacks.onPollingAdjust).toHaveBeenCalledWith(false);
    });
  });

  // =========================================================================
  // 10. fetchCloudEntries - delta sync
  // =========================================================================

  describe('fetchCloudEntries - delta sync', () => {
    it('should NOT include "since" param on first sync', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: 10000,
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain('since=');
    });

    it('should include "since" param after first successful sync', async () => {
      // First sync sets lastSyncTimestamp
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: 10000,
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      expect(getLastSyncTimestamp()).toBe(10000);

      // Second sync should include since=10000
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: 20000,
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      const url = mockFetch.mock.calls[1][0] as string;
      expect(url).toContain('since=10000');
    });

    it('should include deviceId and deviceName in URL params', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('raceId=test-race');
      expect(url).toContain('deviceId=dev_local');
      expect(url).toContain('deviceName=Local+Device');
    });

    it('should include auth headers in fetch request', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      const options = mockFetch.mock.calls[0][1] as RequestInit;
      expect(options.headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      );
    });
  });

  // =========================================================================
  // 11. deleteEntryFromCloud
  // =========================================================================

  describe('deleteEntryFromCloud', () => {
    it('should return false when sync is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, sync: false },
      });

      const result = await deleteEntryFromCloud('entry-1');
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false when no raceId', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        raceId: '',
      });

      const result = await deleteEntryFromCloud('entry-1');
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return true on successful delete', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, true, 200));

      const result = await deleteEntryFromCloud('entry-1');
      expect(result).toBe(true);
    });

    it('should send DELETE request with correct body', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, true, 200));

      await deleteEntryFromCloud('entry-1', 'dev_other');

      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('https://test.api/v1/sync?raceId=test-race');
      expect(options.method).toBe('DELETE');

      const body = JSON.parse(options.body);
      expect(body).toEqual({
        entryId: 'entry-1',
        deviceId: 'dev_other',
        deviceName: 'Local Device',
      });
    });

    it('should use own deviceId when entryDeviceId is not provided', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, true, 200));

      await deleteEntryFromCloud('entry-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.deviceId).toBe('dev_local');
    });

    it('should return false on HTTP error', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, false, 500));

      const result = await deleteEntryFromCloud('entry-1');
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await deleteEntryFromCloud('entry-1');
      expect(result).toBe(false);
    });

    it('should include auth headers', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, true, 200));

      await deleteEntryFromCloud('entry-1');

      const options = mockFetch.mock.calls[0][1] as RequestInit;
      expect(options.headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      );
    });
  });

  // =========================================================================
  // 12. sendEntryToCloud
  // =========================================================================

  describe('sendEntryToCloud', () => {
    it('should return false when sync is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, sync: false },
      });

      const entry = createEntry();
      const result = await sendEntryToCloud(entry);
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false when no raceId', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        raceId: '',
      });

      const entry = createEntry();
      const result = await sendEntryToCloud(entry);
      expect(result).toBe(false);
    });

    it('should send entry and return true on success', async () => {
      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      const entry = createEntry({ bib: '042' });
      const result = await sendEntryToCloud(entry);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalled();

      const options = mockFetch.mock.calls[0][1] as RequestInit;
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.entry.bib).toBe('042');
      expect(body.deviceId).toBe('dev_local');
      expect(body.deviceName).toBe('Local Device');
    });

    it('should remove entry from sync queue on success', async () => {
      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      const entry = createEntry({ id: 'entry-x' });
      await sendEntryToCloud(entry);

      expect(mockRemoveFromSyncQueue).toHaveBeenCalledWith('entry-x');
    });

    it('should call onResetFastPolling on success', async () => {
      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      const entry = createEntry();
      await sendEntryToCloud(entry);

      expect(mockCallbacks.onResetFastPolling).toHaveBeenCalled();
    });

    it('should return false on HTTP error', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, false, 500));

      const entry = createEntry();
      const result = await sendEntryToCloud(entry);
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const entry = createEntry();
      const result = await sendEntryToCloud(entry);
      expect(result).toBe(false);
    });

    // Photo handling

    it('should load photo from IndexedDB when photo is "indexeddb" marker and syncPhotos enabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, syncPhotos: true },
      });

      (photoStorage.getPhoto as ReturnType<typeof vi.fn>).mockResolvedValue(
        'data:image/jpeg;base64,/9j/photo-data-here',
      );

      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      const entry = createEntry({ photo: 'indexeddb' });
      await sendEntryToCloud(entry);

      expect(photoStorage.getPhoto).toHaveBeenCalledWith(entry.id);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.entry.photo).toBe(
        'data:image/jpeg;base64,/9j/photo-data-here',
      );
    });

    it('should send without photo when IndexedDB lookup fails', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, syncPhotos: true },
      });

      (photoStorage.getPhoto as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      const entry = createEntry({ photo: 'indexeddb' });
      await sendEntryToCloud(entry);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.entry.photo).toBeUndefined();
    });

    it('should strip photo data when syncPhotos is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, syncPhotos: false },
      });

      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      const entry = createEntry({
        photo: 'data:image/jpeg;base64,/9j/some-photo',
      });
      await sendEntryToCloud(entry);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.entry.photo).toBeUndefined();
    });

    it('should strip indexeddb marker when syncPhotos is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, syncPhotos: false },
      });

      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      const entry = createEntry({ photo: 'indexeddb' });
      await sendEntryToCloud(entry);

      // Should not even attempt to load from IndexedDB
      expect(photoStorage.getPhoto).not.toHaveBeenCalled();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.entry.photo).toBeUndefined();
    });

    it('should send entry without photo field when entry has no photo', async () => {
      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      const entry = createEntry({ photo: undefined });
      await sendEntryToCloud(entry);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.entry.photo).toBeUndefined();
    });

    // photoSkipped warning

    it('should show warning toast when photoSkipped flag is set', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ success: true, photoSkipped: true }),
      );

      const entry = createEntry();
      await sendEntryToCloud(entry);

      expect(mockCallbacks.showToast).toHaveBeenCalledWith(
        'photoTooLarge',
        'warning',
      );
    });

    // Cross-device duplicate warning

    it('should show warning toast on cross-device duplicate', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          success: true,
          crossDeviceDuplicate: {
            bib: '042',
            point: 'S',
            deviceName: 'Other Timer',
          },
        }),
      );

      const entry = createEntry({ bib: '042', point: 'S' });
      await sendEntryToCloud(entry);

      expect(mockCallbacks.showToast).toHaveBeenCalledWith(
        'crossDeviceDuplicate',
        'warning',
        5000,
      );
    });

    it('should update deviceCount and highestBib from send response', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          success: true,
          deviceCount: 5,
          highestBib: 99,
        }),
      );

      const entry = createEntry();
      await sendEntryToCloud(entry);

      expect(mockSetCloudDeviceCount).toHaveBeenCalledWith(5);
      expect(mockSetCloudHighestBib).toHaveBeenCalledWith(99);
    });

    it('should succeed even when response body is unparseable', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Bad JSON')),
      });

      const entry = createEntry();
      const result = await sendEntryToCloud(entry);

      // Should still succeed - parse error is logged but not fatal
      expect(result).toBe(true);
      expect(mockRemoveFromSyncQueue).toHaveBeenCalledWith(entry.id);
    });

    // Deleted race handling

    it('should return false and NOT remove from sync queue when server responds with deleted flag', async () => {
      mockFetch.mockResolvedValue(mockResponse({ deleted: true }));

      const entry = createEntry({ id: 'entry-deleted-race' });
      const result = await sendEntryToCloud(entry);

      // deleted: true means race was deleted — entry was NOT saved
      expect(result).toBe(false);

      // Must NOT remove from sync queue — entry might be re-associated later
      expect(mockRemoveFromSyncQueue).not.toHaveBeenCalled();

      // Should show error toast about deleted race
      expect(mockCallbacks.showToast).toHaveBeenCalledWith(
        'raceDeleted',
        'error',
        5000,
      );
    });

    it('should not call onResetFastPolling when server responds with deleted flag', async () => {
      mockFetch.mockResolvedValue(mockResponse({ deleted: true }));

      const entry = createEntry();
      await sendEntryToCloud(entry);

      // Polling should NOT be reset since the entry was not accepted
      expect(mockCallbacks.onResetFastPolling).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 13. pushLocalEntries
  // =========================================================================

  describe('pushLocalEntries', () => {
    it('should skip when sync is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, sync: false },
      });

      await pushLocalEntries();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip when no raceId', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        raceId: '',
      });

      await pushLocalEntries();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should only push own device unsynced entries', async () => {
      const ownUnsynced = createEntry({
        id: 'own-1',
        deviceId: 'dev_local',
        syncedAt: undefined,
      });
      const ownSynced = createEntry({
        id: 'own-2',
        deviceId: 'dev_local',
        syncedAt: Date.now(),
      });
      const otherUnsynced = createEntry({
        id: 'other-1',
        deviceId: 'dev_other',
        syncedAt: undefined,
      });

      mockGetState.mockReturnValue({
        ...baseState,
        entries: [ownUnsynced, ownSynced, otherUnsynced],
      });

      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      await pushLocalEntries();

      // Should only send the own unsynced entry
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.entry.id).toBe('own-1');
    });

    it('should skip entries from other devices', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        entries: [createEntry({ deviceId: 'dev_other', syncedAt: undefined })],
      });

      await pushLocalEntries();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip already synced entries', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        entries: [createEntry({ deviceId: 'dev_local', syncedAt: Date.now() })],
      });

      await pushLocalEntries();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should push multiple unsynced entries sequentially', async () => {
      const entry1 = createEntry({
        id: 'e1',
        deviceId: 'dev_local',
        syncedAt: undefined,
      });
      const entry2 = createEntry({
        id: 'e2',
        deviceId: 'dev_local',
        syncedAt: undefined,
      });

      mockGetState.mockReturnValue({
        ...baseState,
        entries: [entry1, entry2],
      });

      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      await pushLocalEntries();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle empty entries array', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        entries: [],
      });

      await pushLocalEntries();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // processCloudPhotos (tested via fetchCloudEntries)
  // =========================================================================

  describe('processCloudPhotos (via fetchCloudEntries)', () => {
    it('should save full photo data to IndexedDB when syncPhotos enabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, syncPhotos: true },
      });

      const entryWithPhoto = createEntry({
        photo: 'data:image/jpeg;base64,/9j/long-enough-photo-data-here',
      });

      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [entryWithPhoto],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      expect(photoStorage.savePhoto).toHaveBeenCalledWith(
        entryWithPhoto.id,
        entryWithPhoto.photo,
      );

      // mergeCloudEntries should receive the entry with 'indexeddb' marker
      const mergedEntries = mockMergeCloudEntries.mock.calls[0]?.[0];
      expect(mergedEntries?.[0]?.photo).toBe('indexeddb');
    });

    it('should skip download when photo is already cached', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, syncPhotos: true },
      });

      (photoStorage.hasPhoto as ReturnType<typeof vi.fn>).mockResolvedValue(
        true,
      );

      const entryWithPhoto = createEntry({
        photo: 'data:image/jpeg;base64,/9j/some-photo-data-that-is-long',
      });

      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [entryWithPhoto],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      // Should check if cached
      expect(photoStorage.hasPhoto).toHaveBeenCalledWith(entryWithPhoto.id);
      // Should NOT save (already cached)
      expect(photoStorage.savePhoto).not.toHaveBeenCalled();
      // Should still set marker
      const mergedEntries = mockMergeCloudEntries.mock.calls[0]?.[0];
      expect(mergedEntries?.[0]?.photo).toBe('indexeddb');
    });

    it('should discard photo when syncPhotos is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, syncPhotos: false },
      });

      const entryWithPhoto = createEntry({
        photo: 'data:image/jpeg;base64,/9j/long-enough-photo-data-here',
      });

      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [entryWithPhoto],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      expect(photoStorage.savePhoto).not.toHaveBeenCalled();

      const mergedEntries = mockMergeCloudEntries.mock.calls[0]?.[0];
      expect(mergedEntries?.[0]?.photo).toBeUndefined();
    });

    it('should clear photo when IndexedDB save fails', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { ...baseState.settings, syncPhotos: true },
      });

      (photoStorage.savePhoto as ReturnType<typeof vi.fn>).mockResolvedValue(
        false,
      );

      const entryWithPhoto = createEntry({
        photo: 'data:image/jpeg;base64,/9j/long-enough-photo-data-here',
      });

      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [entryWithPhoto],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      const mergedEntries = mockMergeCloudEntries.mock.calls[0]?.[0];
      expect(mergedEntries?.[0]?.photo).toBeUndefined();
    });

    it('should pass through entries without photos unchanged', async () => {
      const entryNoPhoto = createEntry({ photo: undefined });

      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [entryNoPhoto],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      expect(photoStorage.savePhoto).not.toHaveBeenCalled();

      const mergedEntries = mockMergeCloudEntries.mock.calls[0]?.[0];
      expect(mergedEntries?.[0]?.photo).toBeUndefined();
    });

    it('should pass through entries with indexeddb marker unchanged', async () => {
      const entryWithMarker = createEntry({ photo: 'indexeddb' });

      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [entryWithMarker],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();

      const mergedEntries = mockMergeCloudEntries.mock.calls[0]?.[0];
      expect(mergedEntries?.[0]?.photo).toBe('indexeddb');
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle invalid response format (non-JSON)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Unexpected token')),
      });

      await fetchCloudEntries();

      // Should be classified as error
      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });

    it('should handle null response data', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));

      await fetchCloudEntries();

      // null is not a valid object, should throw 'Invalid data structure'
      expect(mockSetSyncStatus).toHaveBeenCalledWith('error');
    });

    it('should clear activeFetchPromise even on error', async () => {
      mockFetch.mockRejectedValue(new Error('Fail'));

      await fetchCloudEntries();

      // A new call should trigger a new fetch (not coalesced)
      mockFetch.mockResolvedValue(
        mockResponse({
          entries: [],
          lastUpdated: Date.now(),
          deletedIds: [],
        }),
      );

      await fetchCloudEntries();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
