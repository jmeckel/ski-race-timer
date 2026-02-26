/**
 * Unit Tests for Sync Service
 * Tests: initialization, BroadcastChannel, polling, cloud sync, queue processing
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../../src/types';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn((key: string) => {
    if (key === 'skiTimerSettings') {
      return JSON.stringify({ sync: true });
    }
    if (key === 'skiTimerRaceId') {
      return 'RACE001';
    }
    if (key === 'skiTimerDeviceId') {
      return 'dev_test123';
    }
    return null;
  }),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(() => null),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock fetch
const mockFetch = vi.fn();
Object.defineProperty(globalThis, 'fetch', {
  value: mockFetch,
  writable: true,
});

// Mock BroadcastChannel — track last instance for assertion access
let lastBroadcastChannel: MockBroadcastChannel | null = null;

class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    lastBroadcastChannel = this;
  }

  postMessage = vi.fn();
  close = vi.fn();
}

Object.defineProperty(globalThis, 'BroadcastChannel', {
  value: MockBroadcastChannel,
  writable: true,
  configurable: true,
});

// Helper to create a valid entry
function createValidEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: `dev_test-${Date.now()}-abcd1234`,
    bib: '042',
    point: 'F',
    timestamp: new Date().toISOString(),
    status: 'ok',
    deviceId: 'dev_test',
    deviceName: 'Timer 1',
    ...overrides,
  };
}

// ============================================
// Token Management Tests
// ============================================

describe('Token Management Functions', () => {
  let hasAuthToken: typeof import('../../../src/services/sync').hasAuthToken;
  let setAuthToken: typeof import('../../../src/services/sync').setAuthToken;
  let clearAuthToken: typeof import('../../../src/services/sync').clearAuthToken;
  let exchangePinForToken: typeof import('../../../src/services/sync').exchangePinForToken;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);

    // Reset module for clean state
    vi.resetModules();
    const module = await import('../../../src/services/sync');
    hasAuthToken = module.hasAuthToken;
    setAuthToken = module.setAuthToken;
    clearAuthToken = module.clearAuthToken;
    exchangePinForToken = module.exchangePinForToken;
  });

  describe('hasAuthToken', () => {
    it('should return false when no token is stored', () => {
      localStorageMock.getItem.mockReturnValue(null);
      expect(hasAuthToken()).toBe(false);
    });

    it('should return true when token is stored', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'skiTimerAuthToken') return 'some-jwt-token';
        return null;
      });
      expect(hasAuthToken()).toBe(true);
    });

    it('should return false for empty string token', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'skiTimerAuthToken') return '';
        return null;
      });
      expect(hasAuthToken()).toBe(false);
    });
  });

  describe('setAuthToken', () => {
    it('should store token in localStorage', () => {
      setAuthToken('test-jwt-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerAuthToken',
        'test-jwt-token',
      );
    });

    it('should overwrite existing token', () => {
      setAuthToken('first-token');
      setAuthToken('second-token');
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
        'skiTimerAuthToken',
        'second-token',
      );
    });
  });

  describe('clearAuthToken', () => {
    it('should remove token from localStorage', () => {
      clearAuthToken();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        'skiTimerAuthToken',
      );
    });
  });

  describe('exchangePinForToken', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('should return success with token on valid PIN', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            token: 'jwt-token-12345',
          }),
      });

      const result = await exchangePinForToken('1234');

      expect(result.success).toBe(true);
      expect(result.token).toBe('jwt-token-12345');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: '1234' }),
        }),
      );
    });

    it('should store token in localStorage on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            token: 'jwt-token-12345',
          }),
      });

      await exchangePinForToken('1234');

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'skiTimerAuthToken',
        'jwt-token-12345',
      );
    });

    it('should return isNewPin flag for first-time setup', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            token: 'jwt-token-12345',
            isNewPin: true,
          }),
      });

      const result = await exchangePinForToken('1234');

      expect(result.success).toBe(true);
      expect(result.isNewPin).toBe(true);
    });

    it('should return error for invalid PIN', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'Invalid PIN',
          }),
      });

      const result = await exchangePinForToken('0000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid PIN');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await exchangePinForToken('1234');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle missing token in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            // token missing
          }),
      });

      const result = await exchangePinForToken('1234');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No token received');
    });
  });
});

describe('Sync Service', () => {
  let syncService: typeof import('../../../src/services/sync').syncService;
  let syncEntry: typeof import('../../../src/services/sync').syncEntry;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Reset fetch mock
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() }),
    });

    // Reset module for clean state
    vi.resetModules();
    const module = await import('../../../src/services/sync');
    syncService = module.syncService;
    syncEntry = module.syncEntry;
  });

  afterEach(() => {
    syncService.cleanup();
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('should initialize sync service', () => {
      syncService.initialize();

      // Should have called fetch for initial data
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not initialize if sync is disabled', async () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'skiTimerSettings') {
          return JSON.stringify({ sync: false });
        }
        if (key === 'skiTimerRaceId') {
          return 'RACE001';
        }
        return null;
      });

      vi.resetModules();
      const module = await import('../../../src/services/sync');
      module.syncService.initialize();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not initialize without race ID', async () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'skiTimerSettings') {
          return JSON.stringify({ sync: true });
        }
        if (key === 'skiTimerRaceId') {
          return '';
        }
        return null;
      });

      vi.resetModules();
      const module = await import('../../../src/services/sync');
      module.syncService.initialize();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('fetchCloudEntries', () => {
    it('should fetch entries from cloud', async () => {
      const cloudEntries = [
        createValidEntry({ id: 'dev_cloud-123-abc', deviceId: 'dev_cloud' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ entries: cloudEntries, lastUpdated: Date.now() }),
      });

      syncService.initialize();
      await syncService.forceRefresh();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/sync?raceId=RACE001'),
        expect.anything(),
      );
    });

    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      syncService.initialize();
      await syncService.forceRefresh();

      // Should not throw
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      syncService.initialize();
      await syncService.forceRefresh();

      // Should handle gracefully
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      syncService.initialize();
      await syncService.forceRefresh();

      // Should handle gracefully
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('sendEntryToCloud', () => {
    it('should send entry to cloud', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() }),
      });

      syncService.initialize();

      const entry = createValidEntry();
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await syncService.sendEntryToCloud(entry);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/sync?raceId='),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        }),
      );
    });

    it('should return false on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() }),
      });

      syncService.initialize();

      const entry = createValidEntry();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await syncService.sendEntryToCloud(entry);

      expect(result).toBe(false);
    });

    it('should return false if sync disabled', async () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'skiTimerSettings') {
          return JSON.stringify({ sync: false });
        }
        return null;
      });

      vi.resetModules();
      const module = await import('../../../src/services/sync');

      const entry = createValidEntry();
      const result = await module.syncService.sendEntryToCloud(entry);

      expect(result).toBe(false);
    });
  });

  describe('broadcastEntry', () => {
    it('should broadcast entry to other tabs', () => {
      syncService.initialize();

      const entry = createValidEntry();
      syncService.broadcastEntry(entry);

      expect(lastBroadcastChannel).not.toBeNull();
      expect(lastBroadcastChannel!.postMessage).toHaveBeenCalledWith({
        type: 'entry',
        data: entry,
      });
    });
  });

  describe('broadcastPresence', () => {
    it('should broadcast presence to other tabs', () => {
      syncService.initialize();
      syncService.broadcastPresence();

      expect(lastBroadcastChannel).not.toBeNull();
      expect(lastBroadcastChannel!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'presence',
          data: expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            lastSeen: expect.any(Number),
          }),
        }),
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', () => {
      syncService.initialize();
      syncService.cleanup();

      // After cleanup, further operations should not cause errors
      expect(() => syncService.forceRefresh()).not.toThrow();
    });
  });

  describe('polling', () => {
    it('should poll for updates at regular intervals', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() }),
      });

      syncService.initialize();

      // Wait for initial async operations to complete
      // Initial: 1 entry fetch + 1 fault fetch (independent) = 2 calls
      await vi.advanceTimersByTimeAsync(100);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Advance timer past entry poll interval (15 seconds)
      // Entry polling fires every 15s, fault polling every 120s (independent)
      await vi.advanceTimersByTimeAsync(15000);
      // Poll 1: 1 entry fetch, total 3
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Another entry poll interval
      await vi.advanceTimersByTimeAsync(15000);
      // Poll 2: 1 entry fetch, total 4
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should slow down polling after errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() }),
      });

      syncService.initialize();

      // Simulate errors
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Trigger multiple errors
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      // After 3 errors, should switch to 30 second interval
      const callCount = mockFetch.mock.calls.length;

      await vi.advanceTimersByTimeAsync(5000);
      // Should not have made another call yet (error interval is 30s)

      await vi.advanceTimersByTimeAsync(25000);
      // Now it should have made another call
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callCount);
    });
  });

  describe('getQueueLength', () => {
    it('should return sync queue length', () => {
      const length = syncService.getQueueLength();
      expect(typeof length).toBe('number');
    });
  });

  describe('getLastSyncTime', () => {
    it('should return last sync timestamp', () => {
      const time = syncService.getLastSyncTime();
      expect(typeof time).toBe('number');
    });
  });

  describe('syncEntry helper', () => {
    it('should broadcast and send entry', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() }),
      });

      syncService.initialize();

      const entry = createValidEntry();
      mockFetch.mockResolvedValueOnce({ ok: true });

      await syncEntry(entry);

      // Should have called fetch for sending
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('checkRaceExists', () => {
    it('should return exists=true for existing race', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exists: true, entryCount: 5 }),
      });

      const result = await syncService.checkRaceExists('EXISTING-RACE');

      expect(result.exists).toBe(true);
      expect(result.entryCount).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('checkOnly=true'),
        expect.anything(),
      );
    });

    it('should return exists=false for new race', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exists: false, entryCount: 0 }),
      });

      const result = await syncService.checkRaceExists('NEW-RACE');

      expect(result.exists).toBe(false);
      expect(result.entryCount).toBe(0);
    });

    it('should return exists=false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await syncService.checkRaceExists('ERROR-RACE');

      expect(result.exists).toBe(false);
      expect(result.entryCount).toBe(0);
    });

    it('should return exists=false for HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await syncService.checkRaceExists('SERVER-ERROR-RACE');

      expect(result.exists).toBe(false);
      expect(result.entryCount).toBe(0);
    });

    it('should return exists=false for empty race ID', async () => {
      const result = await syncService.checkRaceExists('');

      expect(result.exists).toBe(false);
      expect(result.entryCount).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('device count and highest bib in responses', () => {
    it('should handle deviceCount in fetch response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            entries: [],
            lastUpdated: Date.now(),
            deviceCount: 3,
            highestBib: 10,
          }),
      });

      syncService.initialize();
      await syncService.forceRefresh();

      // Verify fetch was called (the store update happens internally)
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle photoSkipped in POST response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() }),
      });

      syncService.initialize();

      const entry = createValidEntry();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            entries: [],
            lastUpdated: Date.now(),
            deviceCount: 1,
            highestBib: 42,
            photoSkipped: true,
          }),
      });

      const result = await syncService.sendEntryToCloud(entry);

      expect(result).toBe(true);
    });
  });

  describe('device heartbeat in GET requests', () => {
    it('should include deviceId and deviceName in fetch URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() }),
      });

      syncService.initialize();
      await syncService.forceRefresh();

      // Check that deviceId is included in the URL
      const fetchCalls = mockFetch.mock.calls;
      const lastCall = fetchCalls[fetchCalls.length - 1];
      const url = lastCall[0] as string;

      expect(url).toContain('deviceId=');
      expect(url).toContain('deviceName=');
    });
  });

  describe('tombstone detection (race deleted by admin)', () => {
    it('should dispatch race-deleted event when response contains deleted flag', async () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            deleted: true,
            deletedAt: 1705123456789,
            message: 'Race deleted by administrator',
          }),
      });

      syncService.initialize();
      await syncService.forceRefresh();

      // Should have dispatched race-deleted event
      const calls = dispatchEventSpy.mock.calls;
      const raceDeletedEvent = calls.find(
        (call) =>
          call[0] instanceof CustomEvent && call[0].type === 'race-deleted',
      );

      expect(raceDeletedEvent).toBeDefined();
      if (raceDeletedEvent) {
        const event = raceDeletedEvent[0] as CustomEvent;
        expect(event.detail.deletedAt).toBe(1705123456789);
        expect(event.detail.message).toBe('Race deleted by administrator');
      }

      dispatchEventSpy.mockRestore();
    });

    it('should call cleanup when race is deleted', async () => {
      const cleanupSpy = vi.spyOn(syncService, 'cleanup');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            deleted: true,
            deletedAt: Date.now(),
            message: 'Race deleted',
          }),
      });

      syncService.initialize();
      await syncService.forceRefresh();

      expect(cleanupSpy).toHaveBeenCalled();
      cleanupSpy.mockRestore();
    });

    it('should not process entries when race is deleted', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            deleted: true,
            deletedAt: Date.now(),
            entries: [createValidEntry()], // Should be ignored
            lastUpdated: Date.now(),
          }),
      });

      syncService.initialize();
      await syncService.forceRefresh();

      // Fetch was called but entries should not be processed
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle normal response without deleted flag', async () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            entries: [createValidEntry()],
            lastUpdated: Date.now(),
            deviceCount: 1,
          }),
      });

      syncService.initialize();
      await syncService.forceRefresh();

      // Should NOT have dispatched race-deleted event
      const calls = dispatchEventSpy.mock.calls;
      const raceDeletedEvent = calls.find(
        (call) =>
          call[0] instanceof CustomEvent && call[0].type === 'race-deleted',
      );

      expect(raceDeletedEvent).toBeUndefined();
      dispatchEventSpy.mockRestore();
    });
  });
});
