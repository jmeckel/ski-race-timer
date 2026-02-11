/**
 * Race Condition Tests: Sync Queue concurrent processing
 *
 * Separated from the main race-conditions test file because
 * vi.mock('../../src/store') is hoisted to file scope and would
 * conflict with tests that need the real store.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../src/types';

// ============================================================
// Top-level mocks (hoisted by vi.mock)
// ============================================================

const mockGetState = vi.fn();
const mockRemoveFromSyncQueue = vi.fn();
const mockUpdateSyncQueueItem = vi.fn();

vi.mock('../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    removeFromSyncQueue: (...args: unknown[]) =>
      mockRemoveFromSyncQueue(...args),
    updateSyncQueueItem: (...args: unknown[]) =>
      mockUpdateSyncQueueItem(...args),
  },
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================
// Helpers
// ============================================================

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
// Tests
// ============================================================

describe('Race Condition: Sync Queue concurrent processing', () => {
  let queueProcessor: typeof import('../../src/services/sync/queue').queueProcessor;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.resetModules();

    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'RACE-2024',
      syncQueue: [],
    });

    const module = await import('../../src/services/sync/queue');
    queueProcessor = module.queueProcessor;
  });

  afterEach(() => {
    queueProcessor.cleanup();
    vi.useRealTimers();
  });

  it('should prevent double-processing when processQueue is called while already running', async () => {
    const entry = createEntry({ id: 'dev_test-1-doubleproc' });
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'RACE-2024',
      syncQueue: [{ entry, retryCount: 0, lastAttempt: 0 }],
    });

    let resolveFirst: (() => void) | undefined;
    const sendCallback = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = () => resolve(true);
        }),
    );
    queueProcessor.initialize(sendCallback);

    // Fire two processQueue calls concurrently
    const p1 = queueProcessor.processQueue();
    const p2 = queueProcessor.processQueue();

    // The second call should bail out due to the isProcessingQueue guard
    expect(sendCallback).toHaveBeenCalledTimes(1);

    resolveFirst?.();
    await p1;
    await p2;

    // Confirm only one callback invocation total
    expect(sendCallback).toHaveBeenCalledTimes(1);
  });

  it('should allow processing again after the first run completes', async () => {
    const entry = createEntry({ id: 'dev_test-2-sequential' });
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'RACE-2024',
      syncQueue: [{ entry, retryCount: 0, lastAttempt: 0 }],
    });

    const sendCallback = vi.fn(() => Promise.resolve(true));
    queueProcessor.initialize(sendCallback);

    await queueProcessor.processQueue();
    expect(sendCallback).toHaveBeenCalledTimes(1);

    await queueProcessor.processQueue();
    expect(sendCallback).toHaveBeenCalledTimes(2);
  });

  it('should release the processing lock even when the send callback throws', async () => {
    const entry = createEntry({ id: 'dev_test-3-throw' });
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'RACE-2024',
      syncQueue: [{ entry, retryCount: 0, lastAttempt: 0 }],
    });

    const sendCallback = vi.fn(() => Promise.reject(new Error('network down')));
    queueProcessor.initialize(sendCallback);

    // processQueue should not leave the lock held even after rejection
    await queueProcessor.processQueue().catch(() => {});

    // A subsequent call should be allowed (lock released in finally block)
    const sendCallback2 = vi.fn(() => Promise.resolve(true));
    queueProcessor.initialize(sendCallback2);
    await queueProcessor.processQueue();

    expect(sendCallback2).toHaveBeenCalledTimes(1);
  });

  it('should not process same entries twice via concurrent processQueue calls', async () => {
    const entries = [
      createEntry({ id: 'dev_test-4a-overlap' }),
      createEntry({ id: 'dev_test-4b-overlap' }),
    ];
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'RACE-2024',
      syncQueue: entries.map((e) => ({
        entry: e,
        retryCount: 0,
        lastAttempt: 0,
      })),
    });

    // Track all resolve callbacks so we can resolve them all
    const resolvers: (() => void)[] = [];
    const sendCallback = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvers.push(() => resolve(true));
        }),
    );

    queueProcessor.initialize(sendCallback);

    const p1 = queueProcessor.processQueue();
    const p2 = queueProcessor.processQueue();

    // Only one call to sendCallback so far (for first entry)
    expect(sendCallback).toHaveBeenCalledTimes(1);

    // Resolve all pending callbacks to let processing complete
    while (resolvers.length > 0) {
      resolvers.shift()?.();
      // Allow microtasks to process so the next sendCallback can fire
      await Promise.resolve();
    }

    await p1;
    await p2;
  });

  it('should handle batch processing guard correctly', async () => {
    const entries = [
      createEntry({ id: 'dev_test-5a-batch' }),
      createEntry({ id: 'dev_test-5b-batch' }),
      createEntry({ id: 'dev_test-5c-batch' }),
    ];
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'RACE-2024',
      syncQueue: entries.map((e) => ({
        entry: e,
        retryCount: 0,
        lastAttempt: 0,
      })),
    });

    let resolveCallback: (() => void) | undefined;
    const batchCallback = vi.fn(
      () =>
        new Promise<Map<string, boolean>>((resolve) => {
          resolveCallback = () => {
            const results = new Map<string, boolean>();
            entries.forEach((e) => results.set(e.id, true));
            resolve(results);
          };
        }),
    );

    queueProcessor.initialize(vi.fn(() => Promise.resolve(true)));
    queueProcessor.initializeBatch(batchCallback);

    const p1 = queueProcessor.processQueue();
    const p2 = queueProcessor.processQueue();

    // Batch callback should be called once (3 items >= 2 threshold)
    expect(batchCallback).toHaveBeenCalledTimes(1);

    resolveCallback?.();
    await p1;
    await p2;
  });

  it('should handle three concurrent processQueue calls -- only first runs', async () => {
    const entry = createEntry({ id: 'dev_test-6-triple' });
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'RACE-2024',
      syncQueue: [{ entry, retryCount: 0, lastAttempt: 0 }],
    });

    let resolveCallback: (() => void) | undefined;
    const sendCallback = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCallback = () => resolve(true);
        }),
    );
    queueProcessor.initialize(sendCallback);

    const p1 = queueProcessor.processQueue();
    const p2 = queueProcessor.processQueue();
    const p3 = queueProcessor.processQueue();

    expect(sendCallback).toHaveBeenCalledTimes(1);

    resolveCallback?.();
    await Promise.all([p1, p2, p3]);

    expect(sendCallback).toHaveBeenCalledTimes(1);
  });
});
