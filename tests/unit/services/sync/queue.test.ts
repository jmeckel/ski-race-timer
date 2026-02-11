/**
 * Unit Tests for Queue Processor Module
 * Tests: initialize, start, stop, isProcessing, processQueue, getQueueLength, cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock store
const mockGetState = vi.fn();
const mockRemoveFromSyncQueue = vi.fn();
const mockUpdateSyncQueueItem = vi.fn();

vi.mock('../../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    removeFromSyncQueue: (...args: unknown[]) =>
      mockRemoveFromSyncQueue(...args),
    updateSyncQueueItem: (...args: unknown[]) =>
      mockUpdateSyncQueueItem(...args),
  },
}));

vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Queue Processor', () => {
  let queueProcessor: typeof import('../../../../src/services/sync/queue').queueProcessor;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.resetModules();

    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'RACE-2024',
      syncQueue: [],
    });

    const module = await import('../../../../src/services/sync/queue');
    queueProcessor = module.queueProcessor;
  });

  afterEach(() => {
    queueProcessor.cleanup();
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('should accept a send callback', () => {
      const callback = vi.fn(() => Promise.resolve(true));
      expect(() => queueProcessor.initialize(callback)).not.toThrow();
    });
  });

  describe('start', () => {
    it('should start interval processing', () => {
      queueProcessor.start();
      expect(queueProcessor.isProcessing()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop interval processing', () => {
      queueProcessor.start();
      queueProcessor.stop();
      expect(queueProcessor.isProcessing()).toBe(false);
    });

    it('should be safe to call when not started', () => {
      expect(() => queueProcessor.stop()).not.toThrow();
    });
  });

  describe('isProcessing', () => {
    it('should return false initially', () => {
      expect(queueProcessor.isProcessing()).toBe(false);
    });
  });

  describe('getQueueLength', () => {
    it('should return 0 when queue is empty', () => {
      expect(queueProcessor.getQueueLength()).toBe(0);
    });

    it('should return actual queue length', () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: 'RACE',
        syncQueue: [
          { entry: { id: '1' }, retryCount: 0, lastAttempt: 0 },
          { entry: { id: '2' }, retryCount: 0, lastAttempt: 0 },
        ],
      });
      expect(queueProcessor.getQueueLength()).toBe(2);
    });
  });

  describe('processQueue', () => {
    it('should do nothing when sync is disabled', async () => {
      mockGetState.mockReturnValue({
        settings: { sync: false },
        raceId: 'RACE',
        syncQueue: [
          { entry: { id: '1' }, retryCount: 0, lastAttempt: 0 },
        ],
      });

      const callback = vi.fn(() => Promise.resolve(true));
      queueProcessor.initialize(callback);
      await queueProcessor.processQueue();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should do nothing when raceId is empty', async () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: '',
        syncQueue: [
          { entry: { id: '1' }, retryCount: 0, lastAttempt: 0 },
        ],
      });

      const callback = vi.fn(() => Promise.resolve(true));
      queueProcessor.initialize(callback);
      await queueProcessor.processQueue();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should do nothing when queue is empty', async () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: 'RACE',
        syncQueue: [],
      });

      const callback = vi.fn(() => Promise.resolve(true));
      queueProcessor.initialize(callback);
      await queueProcessor.processQueue();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should send entries via callback', async () => {
      const entry = {
        id: '1',
        bib: '042',
        point: 'F',
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok',
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      };

      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: 'RACE',
        syncQueue: [{ entry, retryCount: 0, lastAttempt: 0 }],
      });

      const callback = vi.fn(() => Promise.resolve(true));
      queueProcessor.initialize(callback);
      await queueProcessor.processQueue();

      expect(callback).toHaveBeenCalledWith(entry);
    });

    it('should remove entries that exceed max retries', async () => {
      const entry = {
        id: '1',
        bib: '042',
        point: 'F',
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok',
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      };

      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: 'RACE',
        syncQueue: [{ entry, retryCount: 5, lastAttempt: 0 }],
      });

      const callback = vi.fn(() => Promise.resolve(true));
      queueProcessor.initialize(callback);
      await queueProcessor.processQueue();

      expect(mockRemoveFromSyncQueue).toHaveBeenCalledWith('1');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should skip entries still in backoff period', async () => {
      const entry = {
        id: '1',
        bib: '042',
        point: 'F',
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok',
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      };

      const now = Date.now();
      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: 'RACE',
        syncQueue: [
          { entry, retryCount: 1, lastAttempt: now }, // Recently attempted
        ],
      });

      const callback = vi.fn(() => Promise.resolve(true));
      queueProcessor.initialize(callback);
      await queueProcessor.processQueue();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should update queue item on send failure', async () => {
      const entry = {
        id: '1',
        bib: '042',
        point: 'F',
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok',
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      };

      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: 'RACE',
        syncQueue: [{ entry, retryCount: 0, lastAttempt: 0 }],
      });

      const callback = vi.fn(() => Promise.resolve(false));
      queueProcessor.initialize(callback);
      await queueProcessor.processQueue();

      expect(mockUpdateSyncQueueItem).toHaveBeenCalledWith('1', {
        retryCount: 1,
        lastAttempt: expect.any(Number),
        error: 'Failed to sync',
      });
    });

    it('should prevent concurrent processing', async () => {
      const entry = {
        id: '1',
        bib: '042',
        point: 'F',
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok',
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      };

      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: 'RACE',
        syncQueue: [{ entry, retryCount: 0, lastAttempt: 0 }],
      });

      let resolveCallback: (() => void) | undefined;
      const callback = vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveCallback = () => resolve(true);
          }),
      );

      queueProcessor.initialize(callback);

      // Start first processing
      const firstProcess = queueProcessor.processQueue();

      // Start second processing (should be no-op)
      const secondProcess = queueProcessor.processQueue();

      // Only one call should have been made
      expect(callback).toHaveBeenCalledTimes(1);

      // Resolve the first call
      resolveCallback?.();
      await firstProcess;
      await secondProcess;
    });

    it('should warn when no send callback configured', async () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: 'RACE',
        syncQueue: [
          {
            entry: { id: '1', bib: '042' },
            retryCount: 0,
            lastAttempt: 0,
          },
        ],
      });

      // Don't initialize - no callback
      await queueProcessor.processQueue();
      // Should log warning
    });
  });

  describe('cleanup', () => {
    it('should stop processing and clear callback', () => {
      const callback = vi.fn(() => Promise.resolve(true));
      queueProcessor.initialize(callback);
      queueProcessor.start();

      queueProcessor.cleanup();

      expect(queueProcessor.isProcessing()).toBe(false);
    });
  });
});
