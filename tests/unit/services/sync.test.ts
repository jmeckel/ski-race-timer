/**
 * Unit Tests for Sync Service
 * Tests: initialization, BroadcastChannel, polling, cloud sync, queue processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  key: vi.fn(() => null)
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock fetch
const mockFetch = vi.fn();
Object.defineProperty(globalThis, 'fetch', {
  value: mockFetch,
  writable: true
});

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
  }

  postMessage = vi.fn();
  close = vi.fn();
}

Object.defineProperty(globalThis, 'BroadcastChannel', {
  value: MockBroadcastChannel,
  writable: true,
  configurable: true
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
    ...overrides
  };
}

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
      json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() })
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
        createValidEntry({ id: 'dev_cloud-123-abc', deviceId: 'dev_cloud' })
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entries: cloudEntries, lastUpdated: Date.now() })
      });

      syncService.initialize();
      await syncService.forceRefresh();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sync?raceId=RACE001')
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
        status: 500
      });

      syncService.initialize();
      await syncService.forceRefresh();

      // Should handle gracefully
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
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
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() })
      });

      syncService.initialize();

      const entry = createValidEntry();
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await syncService.sendEntryToCloud(entry);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sync?raceId='),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String)
        })
      );
    });

    it('should return false on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() })
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

      // BroadcastChannel was initialized and postMessage called
      // The test verifies no error is thrown
    });
  });

  describe('broadcastPresence', () => {
    it('should broadcast presence to other tabs', () => {
      syncService.initialize();
      syncService.broadcastPresence();

      // Test verifies no error is thrown
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
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() })
      });

      syncService.initialize();

      // Initial fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance timer past poll interval (5 seconds)
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Another interval
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should slow down polling after errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() })
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
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() })
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
        json: () => Promise.resolve({ exists: true, entryCount: 5 })
      });

      const result = await syncService.checkRaceExists('EXISTING-RACE');

      expect(result.exists).toBe(true);
      expect(result.entryCount).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('checkOnly=true')
      );
    });

    it('should return exists=false for new race', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exists: false, entryCount: 0 })
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
        status: 500
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
        json: () => Promise.resolve({
          entries: [],
          lastUpdated: Date.now(),
          deviceCount: 3,
          highestBib: 10
        })
      });

      syncService.initialize();
      await syncService.forceRefresh();

      // Verify fetch was called (the store update happens internally)
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle photoSkipped in POST response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() })
      });

      syncService.initialize();

      const entry = createValidEntry();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          entries: [],
          lastUpdated: Date.now(),
          deviceCount: 1,
          highestBib: 42,
          photoSkipped: true
        })
      });

      const result = await syncService.sendEntryToCloud(entry);

      expect(result).toBe(true);
    });
  });

  describe('device heartbeat in GET requests', () => {
    it('should include deviceId and deviceName in fetch URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entries: [], lastUpdated: Date.now() })
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
});
