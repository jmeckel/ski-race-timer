/**
 * Performance Benchmark Tests
 *
 * Verifies that core operations remain performant with large datasets.
 * Uses performance.now() for precise timing and asserts against thresholds.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escapeCSVField,
  formatDateForExport,
  formatTimeForRaceHorology,
} from '../../../src/features/export';
import * as entriesSlice from '../../../src/store/slices/entriesSlice';
import type { Entry } from '../../../src/types';

// Mock localStorage for store tests
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
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

/**
 * Generate realistic race timing entries.
 * Simulates a ski race with alternating Start/Finish times across two runs.
 */
function generateEntries(count: number): Entry[] {
  const baseTime = Date.now() - count * 60000;
  return Array.from({ length: count }, (_, i) => ({
    id: `perf-test-${i}-${baseTime}`,
    bib: String(Math.floor(i / 2) + 1),
    point: (i % 2 === 0 ? 'S' : 'F') as 'S' | 'F',
    run: ((Math.floor(i / 4) % 2) + 1) as number,
    timestamp: new Date(baseTime + i * 60000).toISOString(),
    status: 'ok' as const,
    deviceId: `perf-device-${i % 3}`,
    deviceName: `Device ${i % 3}`,
  }));
}

describe('Performance Benchmarks', () => {
  describe('Store operations with large datasets', () => {
    let store: typeof import('../../../src/store/index').store;

    beforeEach(async () => {
      vi.useFakeTimers();
      localStorageMock.clear();
      vi.clearAllMocks();

      // Reset module for clean state
      vi.resetModules();
      const storeModule = await import('../../../src/store/index');
      store = storeModule.store;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should add 500 entries in under 200ms', () => {
      const entries = generateEntries(500);

      const start = performance.now();
      for (const entry of entries) {
        store.addEntry(entry);
      }
      const elapsed = performance.now() - start;

      console.log(`  Adding 500 entries: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(200);
      expect(store.getState().entries.length).toBe(500);
    });

    it('should serialize 500 entries to JSON in under 100ms', () => {
      const entries = generateEntries(500);
      for (const entry of entries) {
        store.addEntry(entry);
      }

      const state = store.getState();

      const start = performance.now();
      const serialized = JSON.stringify(state.entries);
      const elapsed = performance.now() - start;

      console.log(
        `  Serializing 500 entries: ${elapsed.toFixed(2)}ms (${(serialized.length / 1024).toFixed(1)}KB)`,
      );
      expect(elapsed).toBeLessThan(100);
      expect(serialized.length).toBeGreaterThan(0);
    });

    it('should deserialize 500 entries from JSON in under 100ms', () => {
      const entries = generateEntries(500);
      const serialized = JSON.stringify(entries);

      const start = performance.now();
      const parsed = JSON.parse(serialized) as Entry[];
      const elapsed = performance.now() - start;

      console.log(`  Deserializing 500 entries: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(100);
      expect(parsed.length).toBe(500);
    });

    it('should find entry by ID in under 5ms with 500 entries', () => {
      const entries = generateEntries(500);
      for (const entry of entries) {
        store.addEntry(entry);
      }

      // Look up an entry in the middle of the array
      const targetId = entries[250]!.id;

      const start = performance.now();
      const found = store.getState().entries.find((e) => e.id === targetId);
      const elapsed = performance.now() - start;

      console.log(
        `  Finding entry by ID (500 entries): ${elapsed.toFixed(4)}ms`,
      );
      expect(elapsed).toBeLessThan(5);
      expect(found).toBeDefined();
      expect(found!.id).toBe(targetId);
    });

    it('should merge 500 cloud entries in under 200ms', () => {
      // Start with 100 local entries
      const localEntries = generateEntries(100);
      for (const entry of localEntries) {
        store.addEntry(entry);
      }

      // Create 500 cloud entries from different devices
      const cloudEntries = generateEntries(500).map((entry, i) => ({
        ...entry,
        id: `cloud-${i}-${Date.now()}`,
        deviceId: `cloud-device-${i % 5}`,
        deviceName: `Cloud Device ${i % 5}`,
      }));

      const start = performance.now();
      const addedCount = store.mergeCloudEntries(cloudEntries);
      const elapsed = performance.now() - start;

      console.log(
        `  Merging 500 cloud entries: ${elapsed.toFixed(2)}ms (added: ${addedCount})`,
      );
      expect(elapsed).toBeLessThan(200);
      expect(addedCount).toBe(500);
    });

    it('should delete entry by ID in under 10ms with 500 entries', () => {
      const entries = generateEntries(500);
      for (const entry of entries) {
        store.addEntry(entry);
      }

      const targetId = entries[250]!.id;

      const start = performance.now();
      store.deleteEntry(targetId);
      const elapsed = performance.now() - start;

      console.log(
        `  Deleting entry by ID (500 entries): ${elapsed.toFixed(4)}ms`,
      );
      expect(elapsed).toBeLessThan(10);
      expect(store.getState().entries.length).toBe(499);
    });
  });

  describe('CSV export with large datasets', () => {
    it('should generate CSV for 500 entries in under 500ms', () => {
      const entries = generateEntries(500);

      const start = performance.now();
      const header = 'Startnummer;Lauf;Messpunkt;Zeit;Status;Ger\u00e4t;Datum';
      const rows = entries.map((entry) => {
        const bib = escapeCSVField(entry.bib);
        const run = entry.run ?? 1;
        const point = entry.point === 'S' ? 'ST' : 'FT';
        const time = formatTimeForRaceHorology(entry.timestamp);
        const device = escapeCSVField(entry.deviceName || entry.deviceId);
        const datum = escapeCSVField(formatDateForExport(entry.timestamp));
        const status = 'OK';
        return `${bib};${run};${point};${time};${status};${device};${datum}`;
      });
      const csvContent = [header, ...rows].join('\n');
      const elapsed = performance.now() - start;

      console.log(
        `  CSV generation (500 entries): ${elapsed.toFixed(2)}ms (${(csvContent.length / 1024).toFixed(1)}KB)`,
      );
      expect(elapsed).toBeLessThan(500);
      expect(rows.length).toBe(500);
      expect(csvContent).toContain('Startnummer');
    });

    it('should generate CSV for 1000 entries in under 1000ms', () => {
      const entries = generateEntries(1000);

      const start = performance.now();
      const header = 'Startnummer;Lauf;Messpunkt;Zeit;Status;Ger\u00e4t;Datum';
      const rows = entries.map((entry) => {
        const bib = escapeCSVField(entry.bib);
        const run = entry.run ?? 1;
        const point = entry.point === 'S' ? 'ST' : 'FT';
        const time = formatTimeForRaceHorology(entry.timestamp);
        const device = escapeCSVField(entry.deviceName || entry.deviceId);
        const datum = escapeCSVField(formatDateForExport(entry.timestamp));
        const status = 'OK';
        return `${bib};${run};${point};${time};${status};${device};${datum}`;
      });
      const csvContent = [header, ...rows].join('\n');
      const elapsed = performance.now() - start;

      console.log(
        `  CSV generation (1000 entries): ${elapsed.toFixed(2)}ms (${(csvContent.length / 1024).toFixed(1)}KB)`,
      );
      expect(elapsed).toBeLessThan(1000);
      expect(rows.length).toBe(1000);
    });

    it('should escape 1000 CSV fields with special characters in under 50ms', () => {
      const specialFields = Array.from({ length: 1000 }, (_, i) => {
        const chars = [
          '=SUM(',
          '+cmd|',
          '-1+1',
          '@import',
          'normal',
          '"quoted"',
          'semi;colon',
        ];
        return chars[i % chars.length]!;
      });

      const start = performance.now();
      const escaped = specialFields.map(escapeCSVField);
      const elapsed = performance.now() - start;

      console.log(`  Escaping 1000 CSV fields: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(50);
      expect(escaped.length).toBe(1000);
    });
  });

  describe('VirtualList grouping logic', () => {
    it('should group 500 entries by bib+run in under 50ms', () => {
      const entries = generateEntries(500);

      const start = performance.now();
      // Replicate the grouping logic from VirtualList.applyFilters
      const groupMap = new Map<
        string,
        { bib: string; run: number; entries: Entry[]; latestTimestamp: string }
      >();

      for (const entry of entries) {
        const run = entry.run ?? 1;
        const key = `${entry.bib}-${run}`;

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            bib: entry.bib,
            run,
            entries: [],
            latestTimestamp: entry.timestamp,
          });
        }

        const group = groupMap.get(key)!;
        group.entries.push(entry);
        if (new Date(entry.timestamp) > new Date(group.latestTimestamp)) {
          group.latestTimestamp = entry.timestamp;
        }
      }

      // Sort groups by bib number descending (as VirtualList does)
      const groups = Array.from(groupMap.values()).sort((a, b) => {
        const bibA = parseInt(a.bib, 10) || 0;
        const bibB = parseInt(b.bib, 10) || 0;
        return bibB - bibA;
      });
      const elapsed = performance.now() - start;

      console.log(
        `  Grouping 500 entries: ${elapsed.toFixed(2)}ms (${groups.length} groups)`,
      );
      expect(elapsed).toBeLessThan(50);
      expect(groups.length).toBeGreaterThan(0);
      // Each entry goes into a group, so sum of group entries should equal total
      const totalGrouped = groups.reduce((sum, g) => sum + g.entries.length, 0);
      expect(totalGrouped).toBe(500);
    });

    it('should group 1000 entries by bib+run in under 100ms', () => {
      const entries = generateEntries(1000);

      const start = performance.now();
      const groupMap = new Map<
        string,
        { bib: string; run: number; entries: Entry[] }
      >();

      for (const entry of entries) {
        const run = entry.run ?? 1;
        const key = `${entry.bib}-${run}`;

        if (!groupMap.has(key)) {
          groupMap.set(key, { bib: entry.bib, run, entries: [] });
        }
        groupMap.get(key)!.entries.push(entry);
      }

      const groups = Array.from(groupMap.values()).sort((a, b) => {
        const bibA = parseInt(a.bib, 10) || 0;
        const bibB = parseInt(b.bib, 10) || 0;
        return bibB - bibA;
      });
      const elapsed = performance.now() - start;

      console.log(
        `  Grouping 1000 entries: ${elapsed.toFixed(2)}ms (${groups.length} groups)`,
      );
      expect(elapsed).toBeLessThan(100);
      expect(groups.length).toBeGreaterThan(0);
    });
  });

  describe('Entry filtering and sorting', () => {
    it('should filter entries by run in under 10ms with 500 entries', () => {
      const entries = generateEntries(500);

      const start = performance.now();
      const run1Entries = entries.filter((e) => e.run === 1);
      const run2Entries = entries.filter((e) => e.run === 2);
      const elapsed = performance.now() - start;

      console.log(
        `  Filtering by run (500 entries): ${elapsed.toFixed(4)}ms (run1: ${run1Entries.length}, run2: ${run2Entries.length})`,
      );
      expect(elapsed).toBeLessThan(10);
      expect(run1Entries.length + run2Entries.length).toBe(500);
    });

    it('should filter entries by timing point in under 10ms with 500 entries', () => {
      const entries = generateEntries(500);

      const start = performance.now();
      const startEntries = entries.filter((e) => e.point === 'S');
      const finishEntries = entries.filter((e) => e.point === 'F');
      const elapsed = performance.now() - start;

      console.log(
        `  Filtering by point (500 entries): ${elapsed.toFixed(4)}ms (S: ${startEntries.length}, F: ${finishEntries.length})`,
      );
      expect(elapsed).toBeLessThan(10);
      expect(startEntries.length + finishEntries.length).toBe(500);
    });

    it('should sort entries by timestamp in under 50ms with 500 entries', () => {
      const entries = generateEntries(500);
      // Shuffle to ensure sort is doing work
      for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j]!, entries[i]!];
      }

      const start = performance.now();
      const sorted = [...entries].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const elapsed = performance.now() - start;

      console.log(
        `  Sorting by timestamp (500 entries): ${elapsed.toFixed(2)}ms`,
      );
      expect(elapsed).toBeLessThan(50);
      // Verify sort order
      for (let i = 1; i < sorted.length; i++) {
        expect(new Date(sorted[i]!.timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(sorted[i - 1]!.timestamp).getTime(),
        );
      }
    });

    it('should sort entries by timestamp in under 50ms with 1000 entries', () => {
      const entries = generateEntries(1000);
      // Shuffle
      for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j]!, entries[i]!];
      }

      const start = performance.now();
      const sorted = [...entries].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const elapsed = performance.now() - start;

      console.log(
        `  Sorting by timestamp (1000 entries): ${elapsed.toFixed(2)}ms`,
      );
      expect(elapsed).toBeLessThan(50);
      expect(sorted.length).toBe(1000);
    });

    it('should filter by bib search in under 10ms with 500 entries', () => {
      const entries = generateEntries(500);
      const searchTerm = '42';

      const start = performance.now();
      const filtered = entries.filter((e) => e.bib.includes(searchTerm));
      const elapsed = performance.now() - start;

      console.log(
        `  Filtering by bib search (500 entries): ${elapsed.toFixed(4)}ms (found: ${filtered.length})`,
      );
      expect(elapsed).toBeLessThan(10);
      for (const entry of filtered) {
        expect(entry.bib).toContain(searchTerm);
      }
    });

    it('should compute unique bib count in under 10ms with 500 entries', () => {
      const entries = generateEntries(500);

      const start = performance.now();
      const uniqueBibs = new Set(entries.map((e) => e.bib));
      const elapsed = performance.now() - start;

      console.log(
        `  Unique bib count (500 entries): ${elapsed.toFixed(4)}ms (${uniqueBibs.size} unique bibs)`,
      );
      expect(elapsed).toBeLessThan(10);
      expect(uniqueBibs.size).toBeGreaterThan(0);
    });
  });

  describe('EntriesSlice pure function performance', () => {
    it('should merge 500 cloud entries via entriesSlice in under 100ms', () => {
      const localEntries = generateEntries(100);
      const cloudEntries = generateEntries(500).map((entry, i) => ({
        ...entry,
        id: `cloud-${i}-${Date.now()}`,
        deviceId: `cloud-device-${i % 5}`,
        deviceName: `Cloud Device ${i % 5}`,
      }));

      const start = performance.now();
      const result = entriesSlice.mergeCloudEntries(
        localEntries,
        cloudEntries,
        [],
        'local-device-id',
      );
      const elapsed = performance.now() - start;

      console.log(
        `  entriesSlice.mergeCloudEntries (500 cloud): ${elapsed.toFixed(2)}ms (added: ${result.addedCount})`,
      );
      expect(elapsed).toBeLessThan(100);
      expect(result.addedCount).toBe(500);
      expect(result.entries.length).toBe(600);
    });

    it('should remove deleted cloud entries in under 20ms with 500 entries', () => {
      const entries = generateEntries(500);
      // Mark 100 entries for deletion
      const deletedIds = entries.slice(0, 100).map((e) => e.id);

      const start = performance.now();
      const result = entriesSlice.removeDeletedCloudEntries(
        entries,
        deletedIds,
      );
      const elapsed = performance.now() - start;

      console.log(
        `  removeDeletedCloudEntries (100 of 500): ${elapsed.toFixed(2)}ms (removed: ${result.removedCount})`,
      );
      expect(elapsed).toBeLessThan(20);
      expect(result.removedCount).toBe(100);
      expect(result.entries.length).toBe(400);
    });
  });

  describe('JSON serialization round-trip', () => {
    it('should round-trip 500 entries through JSON in under 50ms', () => {
      const entries = generateEntries(500);

      const start = performance.now();
      const serialized = JSON.stringify(entries);
      const deserialized = JSON.parse(serialized) as Entry[];
      const elapsed = performance.now() - start;

      console.log(
        `  JSON round-trip (500 entries): ${elapsed.toFixed(2)}ms (${(serialized.length / 1024).toFixed(1)}KB)`,
      );
      expect(elapsed).toBeLessThan(50);
      expect(deserialized.length).toBe(500);
      expect(deserialized[0]!.id).toBe(entries[0]!.id);
    });

    it('should round-trip 1000 entries through JSON in under 100ms', () => {
      const entries = generateEntries(1000);

      const start = performance.now();
      const serialized = JSON.stringify(entries);
      const deserialized = JSON.parse(serialized) as Entry[];
      const elapsed = performance.now() - start;

      console.log(
        `  JSON round-trip (1000 entries): ${elapsed.toFixed(2)}ms (${(serialized.length / 1024).toFixed(1)}KB)`,
      );
      expect(elapsed).toBeLessThan(100);
      expect(deserialized.length).toBe(1000);
    });
  });
});
