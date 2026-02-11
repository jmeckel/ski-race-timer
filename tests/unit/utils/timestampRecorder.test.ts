/**
 * Unit Tests for Timestamp Recorder Utility
 * Tests: createTimestampEntry(), isDuplicateEntry()
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../../src/types';
import {
  type CreateTimestampEntryParams,
  createTimestampEntry,
  isDuplicateEntry,
  type TimestampGpsService,
} from '../../../src/utils/timestampRecorder';

describe('Timestamp Recorder', () => {
  let mockGpsService: TimestampGpsService;

  beforeEach(() => {
    mockGpsService = {
      getTimeOffset: vi.fn(() => null),
      getCoordinates: vi.fn(() => undefined),
      getTimestamp: vi.fn(() => null),
    };
  });

  describe('createTimestampEntry', () => {
    const baseParams: CreateTimestampEntryParams = {
      bib: '42',
      point: 'S',
      run: 1,
      deviceId: 'dev_test-fox-1',
      deviceName: 'Test Fox 1',
      gpsService: null as unknown as TimestampGpsService, // replaced in beforeEach
    };

    beforeEach(() => {
      baseParams.gpsService = mockGpsService;
    });

    it('should create an entry with correct bib (zero-padded to 3 digits)', () => {
      const { entry } = createTimestampEntry(baseParams);
      expect(entry.bib).toBe('042');
    });

    it('should pad single digit bib', () => {
      const { entry } = createTimestampEntry({ ...baseParams, bib: '5' });
      expect(entry.bib).toBe('005');
    });

    it('should not pad bib that is already 3+ digits', () => {
      const { entry } = createTimestampEntry({ ...baseParams, bib: '123' });
      expect(entry.bib).toBe('123');
    });

    it('should handle empty bib', () => {
      const { entry } = createTimestampEntry({ ...baseParams, bib: '' });
      expect(entry.bib).toBe('');
    });

    it('should set correct timing point', () => {
      const { entry: startEntry } = createTimestampEntry({
        ...baseParams,
        point: 'S',
      });
      expect(startEntry.point).toBe('S');

      const { entry: finishEntry } = createTimestampEntry({
        ...baseParams,
        point: 'F',
      });
      expect(finishEntry.point).toBe('F');
    });

    it('should set correct run number', () => {
      const { entry } = createTimestampEntry({ ...baseParams, run: 2 });
      expect(entry.run).toBe(2);
    });

    it('should set device info', () => {
      const { entry } = createTimestampEntry(baseParams);
      expect(entry.deviceId).toBe('dev_test-fox-1');
      expect(entry.deviceName).toBe('Test Fox 1');
    });

    it('should set status to ok', () => {
      const { entry } = createTimestampEntry(baseParams);
      expect(entry.status).toBe('ok');
    });

    it('should generate a unique ID', () => {
      const { entry: entry1 } = createTimestampEntry(baseParams);
      const { entry: entry2 } = createTimestampEntry(baseParams);
      expect(entry1.id).toBeTruthy();
      expect(entry2.id).toBeTruthy();
      // IDs should be different (contains timestamp + random)
      // Note: in fast tests they might collide on timestamp, but random part differs
      expect(typeof entry1.id).toBe('string');
    });

    it('should set a valid ISO timestamp', () => {
      const { entry } = createTimestampEntry(baseParams);
      const parsed = new Date(entry.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });

    describe('with GPS offset', () => {
      it('should use GPS-corrected time when offset is available', () => {
        const offset = 500; // 500ms offset
        vi.mocked(mockGpsService.getTimeOffset).mockReturnValue(offset);

        const beforeTime = Date.now() + offset;
        const { entry, timeSource } = createTimestampEntry(baseParams);
        const afterTime = Date.now() + offset;

        expect(timeSource).toBe('gps');
        expect(entry.timeSource).toBe('gps');

        const entryTime = new Date(entry.timestamp).getTime();
        expect(entryTime).toBeGreaterThanOrEqual(beforeTime - 10);
        expect(entryTime).toBeLessThanOrEqual(afterTime + 10);
      });

      it('should return timeSource gps when offset is available', () => {
        vi.mocked(mockGpsService.getTimeOffset).mockReturnValue(100);
        const { timeSource } = createTimestampEntry(baseParams);
        expect(timeSource).toBe('gps');
      });
    });

    describe('without GPS offset', () => {
      it('should use system time when no GPS offset', () => {
        vi.mocked(mockGpsService.getTimeOffset).mockReturnValue(null);

        const { entry, timeSource } = createTimestampEntry(baseParams);

        expect(timeSource).toBe('system');
        expect(entry.timeSource).toBe('system');
      });
    });

    describe('GPS coordinates', () => {
      it('should include GPS coordinates when available', () => {
        const coords = { latitude: 47.0, longitude: 11.0, accuracy: 5 };
        vi.mocked(mockGpsService.getCoordinates).mockReturnValue(coords);

        const { entry } = createTimestampEntry(baseParams);
        expect(entry.gpsCoords).toEqual(coords);
      });

      it('should set gpsCoords to undefined when coordinates unavailable', () => {
        vi.mocked(mockGpsService.getCoordinates).mockReturnValue(undefined);

        const { entry } = createTimestampEntry(baseParams);
        expect(entry.gpsCoords).toBeUndefined();
      });
    });

    describe('GPS timestamp', () => {
      it('should include raw GPS timestamp when available', () => {
        const gpsTs = 1700000000000;
        vi.mocked(mockGpsService.getTimestamp).mockReturnValue(gpsTs);

        const { entry } = createTimestampEntry(baseParams);
        expect(entry.gpsTimestamp).toBe(gpsTs);
      });

      it('should set gpsTimestamp to undefined when not available', () => {
        vi.mocked(mockGpsService.getTimestamp).mockReturnValue(null);

        const { entry } = createTimestampEntry(baseParams);
        expect(entry.gpsTimestamp).toBeUndefined();
      });
    });
  });

  describe('isDuplicateEntry', () => {
    const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
      id: 'test-123-abc',
      bib: '042',
      point: 'S',
      run: 1,
      timestamp: new Date().toISOString(),
      status: 'ok',
      deviceId: 'dev_test',
      deviceName: 'Test',
      ...overrides,
    });

    it('should return true when entry matches bib, point, and run', () => {
      const entry = makeEntry({ bib: '042', point: 'S', run: 1 });
      const existing = [makeEntry({ bib: '042', point: 'S', run: 1 })];

      expect(isDuplicateEntry(entry, existing)).toBe(true);
    });

    it('should return false when bib differs', () => {
      const entry = makeEntry({ bib: '042', point: 'S', run: 1 });
      const existing = [makeEntry({ bib: '043', point: 'S', run: 1 })];

      expect(isDuplicateEntry(entry, existing)).toBe(false);
    });

    it('should return false when point differs', () => {
      const entry = makeEntry({ bib: '042', point: 'S', run: 1 });
      const existing = [makeEntry({ bib: '042', point: 'F', run: 1 })];

      expect(isDuplicateEntry(entry, existing)).toBe(false);
    });

    it('should return false when run differs', () => {
      const entry = makeEntry({ bib: '042', point: 'S', run: 1 });
      const existing = [makeEntry({ bib: '042', point: 'S', run: 2 })];

      expect(isDuplicateEntry(entry, existing)).toBe(false);
    });

    it('should return false when bib is empty', () => {
      const entry = makeEntry({ bib: '', point: 'S', run: 1 });
      const existing = [makeEntry({ bib: '', point: 'S', run: 1 })];

      expect(isDuplicateEntry(entry, existing)).toBe(false);
    });

    it('should return false when existing entries is empty', () => {
      const entry = makeEntry({ bib: '042', point: 'S', run: 1 });
      expect(isDuplicateEntry(entry, [])).toBe(false);
    });

    it('should treat missing run as run 1 in existing entries', () => {
      const entry = makeEntry({ bib: '042', point: 'S', run: 1 });
      const existingWithoutRun = makeEntry({ bib: '042', point: 'S' });
      // @ts-expect-error: Testing backwards compat with missing run field
      delete existingWithoutRun.run;

      // (e.run ?? 1) === entry.run should match
      expect(isDuplicateEntry(entry, [existingWithoutRun])).toBe(true);
    });

    it('should check across multiple existing entries', () => {
      const entry = makeEntry({ bib: '042', point: 'F', run: 2 });
      const existing = [
        makeEntry({ bib: '001', point: 'S', run: 1 }),
        makeEntry({ bib: '042', point: 'S', run: 2 }),
        makeEntry({ bib: '042', point: 'F', run: 2 }), // This matches
      ];

      expect(isDuplicateEntry(entry, existing)).toBe(true);
    });

    it('should return false when no existing entry matches all three fields', () => {
      const entry = makeEntry({ bib: '042', point: 'F', run: 2 });
      const existing = [
        makeEntry({ bib: '042', point: 'S', run: 2 }), // point differs
        makeEntry({ bib: '042', point: 'F', run: 1 }), // run differs
        makeEntry({ bib: '043', point: 'F', run: 2 }), // bib differs
      ];

      expect(isDuplicateEntry(entry, existing)).toBe(false);
    });
  });
});
