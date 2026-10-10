/**
 * Unit Tests for Entry Deletion Module
 * Tests: deleteEntriesWithCleanup (single, multiple, sync/no-sync)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDeleteEntry = vi.fn();
const mockDeleteMultiple = vi.fn();
const mockGetState = vi.fn();

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    deleteEntry: (...args: unknown[]) => mockDeleteEntry(...args),
    deleteMultiple: (...args: unknown[]) => mockDeleteMultiple(...args),
  },
}));

const mockDeletePhoto = vi.fn(() => Promise.resolve());
const mockDeletePhotos = vi.fn(() => Promise.resolve());
const mockDeleteEntryFromCloud = vi.fn<
  (...args: unknown[]) => Promise<boolean>
>(() => Promise.resolve(true));

vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  photoStorage: {
    deletePhoto: (...args: unknown[]) => mockDeletePhoto(...args),
    deletePhotos: (...args: unknown[]) => mockDeletePhotos(...args),
  },
  syncService: {
    deleteEntryFromCloud: (...args: unknown[]) =>
      mockDeleteEntryFromCloud(...args),
  },
}));

import { showToast } from '../../../src/components';
import {
  deleteEntriesWithCleanup,
  syncDeletionsToCloud,
} from '../../../src/features/entryDeletion';

describe('Entry Deletion Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({
      settings: { sync: false },
      raceId: '',
    });
  });

  it('should delete a single entry from store', async () => {
    const entries = [
      {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      },
    ];

    await deleteEntriesWithCleanup(entries);

    expect(mockDeleteEntry).toHaveBeenCalledWith('e1');
    expect(mockDeleteMultiple).not.toHaveBeenCalled();
  });

  it('should delete multiple entries from store', async () => {
    const entries = [
      {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      },
      {
        id: 'e2',
        bib: '043',
        point: 'S' as const,
        run: 1,
        timestamp: '2024-01-15T10:01:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      },
    ];

    await deleteEntriesWithCleanup(entries);

    expect(mockDeleteMultiple).toHaveBeenCalledWith(['e1', 'e2']);
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('should delete single photo from IndexedDB', async () => {
    const entries = [
      {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      },
    ];

    await deleteEntriesWithCleanup(entries);

    expect(mockDeletePhoto).toHaveBeenCalledWith('e1');
    expect(mockDeletePhotos).not.toHaveBeenCalled();
  });

  it('should delete multiple photos from IndexedDB', async () => {
    const entries = [
      {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      },
      {
        id: 'e2',
        bib: '043',
        point: 'S' as const,
        run: 1,
        timestamp: '2024-01-15T10:01:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      },
    ];

    await deleteEntriesWithCleanup(entries);

    expect(mockDeletePhotos).toHaveBeenCalledWith(['e1', 'e2']);
    expect(mockDeletePhoto).not.toHaveBeenCalled();
  });

  it('should NOT sync deletions to cloud when sync disabled', async () => {
    mockGetState.mockReturnValue({
      settings: { sync: false },
      raceId: 'RACE-2024',
    });

    const entries = [
      {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      },
    ];

    await deleteEntriesWithCleanup(entries);

    expect(mockDeleteEntryFromCloud).not.toHaveBeenCalled();
  });

  it('should NOT sync deletions to cloud when no raceId', async () => {
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: '',
    });

    const entries = [
      {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      },
    ];

    await deleteEntriesWithCleanup(entries);

    expect(mockDeleteEntryFromCloud).not.toHaveBeenCalled();
  });

  it('should sync deletions to cloud when sync enabled and raceId exists', async () => {
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'RACE-2024',
    });

    const entries = [
      {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      },
      {
        id: 'e2',
        bib: '043',
        point: 'S' as const,
        run: 1,
        timestamp: '2024-01-15T10:01:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_2',
        deviceName: 'Timer 2',
      },
    ];

    vi.useFakeTimers();
    try {
      await deleteEntriesWithCleanup(entries);
      // Cloud deletes are sequential and spaced to respect the rate limit
      await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
    }

    expect(mockDeleteEntryFromCloud).toHaveBeenCalledTimes(2);
    expect(mockDeleteEntryFromCloud).toHaveBeenCalledWith('e1', 'dev_1');
    expect(mockDeleteEntryFromCloud).toHaveBeenCalledWith('e2', 'dev_2');
  });
});

describe('syncDeletionsToCloud', () => {
  const makeEntry = (id: string) => ({
    id,
    bib: '042',
    point: 'F' as const,
    run: 1,
    timestamp: '2024-01-15T10:00:00.000Z',
    status: 'ok' as const,
    deviceId: 'dev_1',
    deviceName: 'Timer 1',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a single toast when some cloud deletes fail', async () => {
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'race-a',
      currentLang: 'en',
    });
    mockDeleteEntryFromCloud
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(true);

    const done = syncDeletionsToCloud([
      makeEntry('a'),
      makeEntry('b'),
      makeEntry('c'),
    ]);
    await vi.runAllTimersAsync();
    await done;

    expect(mockDeleteEntryFromCloud).toHaveBeenCalledTimes(3);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('cloudDeleteFailed', 'warning');
  });

  it('stops sending when the race changes mid-way', async () => {
    mockGetState.mockReturnValue({
      settings: { sync: true },
      raceId: 'race-a',
      currentLang: 'en',
    });
    mockDeleteEntryFromCloud.mockImplementation(() => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        raceId: 'race-b',
        currentLang: 'en',
      });
      return Promise.resolve(true);
    });

    const done = syncDeletionsToCloud([makeEntry('a'), makeEntry('b')]);
    await vi.runAllTimersAsync();
    await done;

    expect(mockDeleteEntryFromCloud).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
  });
});
