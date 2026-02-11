/**
 * Unit Tests for Export Edge Cases
 * Tests boundary conditions and corner cases NOT covered by existing tests:
 * - formatTimeForRaceHorology carry chains (995ms, cascading s->m->h, 24h wrap)
 * - escapeCSVField: pipe, hex-like values, double-prefix prevention, quote-only field
 * - formatDateForExport: leap year
 * - getExportFilename: all-special-char race ID, extension with dots
 * - exportResults: CSV blob content verification, mixed runs, flt->SZT in German
 * - exportJudgeReport: both run 1 and run 2 faults in same report
 * - formatFaultsForCSV (via exportResults): multiple faults sorted by gate, all fault types
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackSuccess: vi.fn(),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetState = vi.fn();
vi.mock('../../../src/store', () => ({
  store: { getState: (...args: unknown[]) => mockGetState(...args) },
}));

import {
  escapeCSVField,
  exportJudgeReport,
  exportResults,
  formatDateForExport,
  formatTimeForRaceHorology,
  getExportFilename,
} from '../../../src/features/export';

/** Extract text content from Blob constructor arguments captured by spy */
function extractBlobText(blobContent: BlobPart[]): string {
  return blobContent.map((part) => (typeof part === 'string' ? part : '')).join('');
}

describe('Export Edge Cases', () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let mockClick: ReturnType<typeof vi.fn>;
  let capturedBlobContents: string[];
  let OriginalBlob: typeof Blob;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedBlobContents = [];

    // Intercept Blob constructor to capture content strings
    OriginalBlob = globalThis.Blob;
    const BlobSpy = vi.fn(
      (parts?: BlobPart[], options?: BlobPropertyBag) => {
        if (parts) {
          capturedBlobContents.push(extractBlobText(parts));
        }
        return new OriginalBlob(parts, options);
      },
    );
    // Preserve prototype so instanceof checks still work
    BlobSpy.prototype = OriginalBlob.prototype;
    globalThis.Blob = BlobSpy as unknown as typeof Blob;

    mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
    mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

    mockClick = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = mockClick;
      }
      return el;
    });
  });

  afterEach(() => {
    globalThis.Blob = OriginalBlob;
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. formatTimeForRaceHorology carry-over edge cases
  // ---------------------------------------------------------------------------
  describe('formatTimeForRaceHorology carry-over edge cases', () => {
    it('should carry 995ms to next second (cs=100 triggers carry)', () => {
      const date = new Date();
      date.setHours(10, 20, 30, 995);
      const result = formatTimeForRaceHorology(date.toISOString());
      // 995ms -> Math.round(995/10) = Math.round(99.5) = 100 -> carry
      expect(result).toBe('10:20:31,00');
    });

    it('should cascade carry from seconds to minutes (59s + carry)', () => {
      const date = new Date();
      date.setHours(10, 20, 59, 995);
      const result = formatTimeForRaceHorology(date.toISOString());
      // s=59 + carry -> s=0, m=21
      expect(result).toBe('10:21:00,00');
    });

    it('should cascade carry from seconds to minutes to hours (59:59 + carry)', () => {
      const date = new Date();
      date.setHours(10, 59, 59, 995);
      const result = formatTimeForRaceHorology(date.toISOString());
      // Full cascade: s=0, m=0, h=11
      expect(result).toBe('11:00:00,00');
    });

    it('should wrap 23:59:59.995 to 00:00:00,00 (24h boundary)', () => {
      const date = new Date();
      date.setHours(23, 59, 59, 995);
      const result = formatTimeForRaceHorology(date.toISOString());
      // h=24 wraps to 0
      expect(result).toBe('00:00:00,00');
    });

    it('should NOT carry at 994ms (rounds to 99, not 100)', () => {
      const date = new Date();
      date.setHours(10, 20, 30, 994);
      const result = formatTimeForRaceHorology(date.toISOString());
      // 994ms -> Math.round(994/10) = Math.round(99.4) = 99 -> no carry
      expect(result).toBe('10:20:30,99');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. escapeCSVField edge cases
  // ---------------------------------------------------------------------------
  describe('escapeCSVField edge cases', () => {
    it('should prefix pipe AND wrap in quotes', () => {
      // Pipe is both a formula char and triggers quote-wrapping
      const result = escapeCSVField('|cmd');
      expect(result).toBe('"\'|cmd"');
    });

    it('should prefix hex-like value 0xFF', () => {
      const result = escapeCSVField('0xFF');
      expect(result).toBe("'0xFF");
    });

    it('should prefix +0xFF (plus-prefixed hex) only once due to formula char taking precedence', () => {
      const result = escapeCSVField('+0xFF');
      // First: starts with +, gets formula prefix -> "'+0xFF"
      // Then: hex regex /^[+]?0x/i tests "'+0xFF" which starts with ' so no match
      // Result: only one prefix
      expect(result).toBe("'+0xFF");
    });

    it('should handle field that is ONLY a double-quote character', () => {
      const result = escapeCSVField('"');
      // Step 1: no formula char prefix ('"' is not a formula char)
      // Step 2: no hex match
      // Step 3: contains ", so escaped becomes '""'
      // Step 4: '""' contains '"', so wrapped: '""""'
      expect(result).toBe('""""');
    });

    it('should handle field with only semicolons', () => {
      const result = escapeCSVField(';;;');
      expect(result).toBe('";;;"');
    });

    it('should handle very long field without corruption', () => {
      const longField = 'A'.repeat(10000);
      const result = escapeCSVField(longField);
      expect(result).toBe(longField);
      expect(result.length).toBe(10000);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. formatDateForExport: leap year
  // ---------------------------------------------------------------------------
  describe('formatDateForExport edge cases', () => {
    it('should handle leap year Feb 29', () => {
      const date = new Date(2024, 1, 29, 12, 0, 0); // Feb 29, 2024
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2024-02-29');
    });

    it('should handle century leap year Feb 29 (year 2000)', () => {
      const date = new Date(2000, 1, 29, 12, 0, 0);
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2000-02-29');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. getExportFilename edge cases
  // ---------------------------------------------------------------------------
  describe('getExportFilename edge cases', () => {
    it('should keep underscores (not fall back to "race") for all-special-char ID', () => {
      // "!@#$%" becomes "_____" after sanitization, which is truthy
      const result = getExportFilename('!@#$%');
      expect(result).toMatch(/^_____/);
    });

    it('should handle extension containing dots', () => {
      const result = getExportFilename('RACE', 'tar.gz');
      expect(result).toMatch(/\.tar\.gz$/);
    });

    it('should handle single character race ID', () => {
      const result = getExportFilename('R');
      expect(result).toMatch(/^R_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should preserve hyphens and underscores in race ID', () => {
      const result = getExportFilename('SL-2024_Final');
      expect(result).toMatch(/^SL-2024_Final_\d{4}-\d{2}-\d{2}\.csv$/);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. exportResults CSV content verification (read actual Blob content)
  // ---------------------------------------------------------------------------
  describe('exportResults CSV content verification', () => {
    it('should include both run=1 and run=2 entries in the CSV', async () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '010',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T09:00:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Start',
          },
          {
            id: '2',
            bib: '010',
            point: 'S',
            run: 2,
            timestamp: '2024-01-15T13:00:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Start',
          },
        ],
        faultEntries: [],
        currentLang: 'en',
        raceId: 'SLALOM-2024',
      });

      exportResults();

      expect(capturedBlobContents).toHaveLength(1);
      const csv = capturedBlobContents[0]!;
      const lines = csv.split('\n');

      // Header + 2 data rows
      expect(lines).toHaveLength(3);

      // Verify run numbers appear in output
      const dataLines = lines.slice(1);
      const runs = dataLines.map((line) => line.split(';')[1]);
      expect(runs).toContain('1');
      expect(runs).toContain('2');
    });

    it('should produce 7 columns per row when no faults (including Datum)', async () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '005',
            point: 'F',
            run: 1,
            timestamp: '2024-01-15T10:05:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Finish',
          },
        ],
        faultEntries: [],
        currentLang: 'en',
        raceId: 'RACE',
      });

      exportResults();

      const csv = capturedBlobContents[0]!;
      const lines = csv.split('\n');
      // Header: Startnummer;Lauf;Messpunkt;Zeit;Status;Geraet;Datum = 7 cols
      expect(lines[0]!.split(';')).toHaveLength(7);
      // Data row should also have 7 columns
      expect(lines[1]!.split(';')).toHaveLength(7);
    });

    it('should produce 9 columns per row when faults exist (including Datum)', async () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '005',
            point: 'F',
            run: 1,
            timestamp: '2024-01-15T10:05:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Finish',
          },
        ],
        faultEntries: [
          {
            id: 'f1',
            bib: '005',
            run: 1,
            gateNumber: 3,
            faultType: 'MG',
            timestamp: '2024-01-15T10:04:00.000Z',
            deviceId: 'dev_2',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        currentLang: 'en',
        raceId: 'RACE',
        usePenaltyMode: true,
        penaltySeconds: 5,
      });

      exportResults();

      const csv = capturedBlobContents[0]!;
      const lines = csv.split('\n');
      // Header: ...;Torstrafzeit;Torfehler;Datum = 9 cols
      expect(lines[0]!.split(';')).toHaveLength(9);
      expect(lines[1]!.split(';')).toHaveLength(9);
    });

    it('should render flt status as SZT in German language export', async () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '007',
            point: 'F',
            run: 1,
            timestamp: '2024-01-15T10:05:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Finish',
          },
        ],
        faultEntries: [
          {
            id: 'f1',
            bib: '007',
            run: 1,
            gateNumber: 5,
            faultType: 'STR',
            timestamp: '2024-01-15T10:04:00.000Z',
            deviceId: 'dev_2',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        currentLang: 'de',
        raceId: 'RACE',
        usePenaltyMode: true,
        penaltySeconds: 5,
      });

      exportResults();

      const csv = capturedBlobContents[0]!;
      const dataRow = csv.split('\n')[1]!;
      const statusField = dataRow.split(';')[4];
      // getStatusLabel('flt', 'de') returns 'SZT' (Strafzeit)
      expect(statusField).toBe('SZT');
    });

    it('should sort multiple faults by gate number in the Torfehler column', async () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '012',
            point: 'F',
            run: 1,
            timestamp: '2024-01-15T10:10:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Finish',
          },
        ],
        faultEntries: [
          {
            id: 'f2',
            bib: '012',
            run: 1,
            gateNumber: 8,
            faultType: 'BR',
            timestamp: '2024-01-15T10:08:00.000Z',
            deviceId: 'dev_2',
            deviceName: 'Judge 1',
            gateRange: [1, 15],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
          {
            id: 'f1',
            bib: '012',
            run: 1,
            gateNumber: 3,
            faultType: 'MG',
            timestamp: '2024-01-15T10:06:00.000Z',
            deviceId: 'dev_2',
            deviceName: 'Judge 1',
            gateRange: [1, 15],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
          {
            id: 'f3',
            bib: '012',
            run: 1,
            gateNumber: 5,
            faultType: 'STR',
            timestamp: '2024-01-15T10:07:00.000Z',
            deviceId: 'dev_2',
            deviceName: 'Judge 1',
            gateRange: [1, 15],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        currentLang: 'en',
        raceId: 'RACE',
        usePenaltyMode: true,
        penaltySeconds: 5,
      });

      exportResults();

      const csv = capturedBlobContents[0]!;
      const dataRow = csv.split('\n')[1]!;
      const faultField = dataRow.split(';')[7]; // Torfehler column (index 7)
      // Should be sorted by gate number: T3(MG),T5(STR),T8(BR)
      expect(faultField).toBe('T3(MG),T5(STR),T8(BR)');
    });

    it('should calculate cumulative penalty for multiple faults', async () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '020',
            point: 'F',
            run: 1,
            timestamp: '2024-01-15T10:10:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Finish',
          },
        ],
        faultEntries: [
          {
            id: 'f1',
            bib: '020',
            run: 1,
            gateNumber: 2,
            faultType: 'MG',
            timestamp: '2024-01-15T10:08:00.000Z',
            deviceId: 'dev_2',
            deviceName: 'Judge',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
          {
            id: 'f2',
            bib: '020',
            run: 1,
            gateNumber: 7,
            faultType: 'STR',
            timestamp: '2024-01-15T10:09:00.000Z',
            deviceId: 'dev_2',
            deviceName: 'Judge',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        currentLang: 'en',
        raceId: 'RACE',
        usePenaltyMode: true,
        penaltySeconds: 3,
      });

      exportResults();

      const csv = capturedBlobContents[0]!;
      const dataRow = csv.split('\n')[1]!;
      const penaltyField = dataRow.split(';')[6]; // Torstrafzeit column
      // 2 faults * 3 seconds = 6
      expect(penaltyField).toBe('6');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. exportJudgeReport with both run 1 and run 2 faults
  // ---------------------------------------------------------------------------
  describe('exportJudgeReport with both runs', () => {
    it('should include both run 1 and run 2 sections when faults exist in both', async () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [
          {
            id: 'f1',
            bib: '015',
            run: 1,
            gateNumber: 3,
            faultType: 'MG',
            timestamp: '2024-01-15T09:30:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge A',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
          {
            id: 'f2',
            bib: '015',
            run: 2,
            gateNumber: 7,
            faultType: 'BR',
            timestamp: '2024-01-15T14:15:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge A',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        deviceName: 'Judge A',
        deviceId: 'dev_judge1',
        raceId: 'GS-2024',
        gateAssignment: [1, 10],
      });

      exportJudgeReport();

      expect(capturedBlobContents).toHaveLength(1);
      const content = capturedBlobContents[0]!;

      // Should contain both run sections (t mock returns key directly)
      expect(content).toContain('runLabel 1:');
      expect(content).toContain('runLabel 2:');
      // Should contain bib 015
      expect(content).toContain('015');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. exportResults: faults only apply to Finish entries, not Start entries
  // ---------------------------------------------------------------------------
  describe('exportResults fault association', () => {
    it('should NOT apply faults to Start entries even if bib/run match', async () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '025',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T09:00:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Start',
          },
          {
            id: '2',
            bib: '025',
            point: 'F',
            run: 1,
            timestamp: '2024-01-15T09:05:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Finish',
          },
        ],
        faultEntries: [
          {
            id: 'f1',
            bib: '025',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T09:03:00.000Z',
            deviceId: 'dev_2',
            deviceName: 'Judge',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        currentLang: 'en',
        raceId: 'RACE',
        usePenaltyMode: true,
        penaltySeconds: 5,
      });

      exportResults();

      const csv = capturedBlobContents[0]!;
      const lines = csv.split('\n');
      // Line 0 = header, Line 1 = Start entry (earlier timestamp), Line 2 = Finish entry
      const startRow = lines[1]!;
      const finishRow = lines[2]!;

      // Start entry: status OK, penalty 0, no fault string
      expect(startRow.split(';')[4]).toBe('OK');
      expect(startRow.split(';')[6]).toBe('0'); // Torstrafzeit = 0

      // Finish entry: fault status FLT, penalty 5, fault details
      expect(finishRow.split(';')[4]).toBe('FLT');
      expect(finishRow.split(';')[6]).toBe('5');
      expect(finishRow.split(';')[7]).toBe('T4(MG)');
    });
  });
});
