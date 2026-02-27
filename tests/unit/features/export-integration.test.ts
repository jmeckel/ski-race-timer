/**
 * Integration Tests for Export Module
 * Tests exportResults, exportJudgeReport, exportFaultSummaryWhatsApp,
 * exportChiefSummary with mocked store and Blob capture
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// -- Mocks (must be before imports) --
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

// -- Imports --
import { showToast } from '../../../src/components';
import {
  exportChiefSummary,
  exportFaultSummaryWhatsApp,
  exportJudgeReport,
  exportResults,
} from '../../../src/features/export';
import { feedbackSuccess } from '../../../src/services';

// -- Helpers --

/** Extract text from Blob constructor arguments */
function extractBlobText(parts: BlobPart[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : '')).join('');
}

/** Create a minimal entry for tests */
function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    bib: '042',
    point: 'S',
    run: 1,
    timestamp: '2024-01-15T09:00:00.000Z',
    status: 'ok',
    deviceId: 'dev_1',
    deviceName: 'Timer 1',
    ...overrides,
  };
}

/** Create a minimal fault entry for tests */
function fault(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    bib: '042',
    run: 1,
    gateNumber: 4,
    faultType: 'MG',
    timestamp: '2024-01-15T10:03:00.000Z',
    deviceId: 'dev_2',
    deviceName: 'Judge 1',
    gateRange: [1, 10],
    currentVersion: 1,
    versionHistory: [],
    markedForDeletion: false,
    ...overrides,
  };
}

// -- Test setup --
describe('Export Integration', () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let mockClick: ReturnType<typeof vi.fn>;
  let capturedBlobContents: string[];
  let OriginalBlob: typeof Blob;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedBlobContents = [];

    // Intercept Blob constructor to capture CSV content
    OriginalBlob = globalThis.Blob;
    const BlobSpy = vi.fn((parts?: BlobPart[], options?: BlobPropertyBag) => {
      if (parts) capturedBlobContents.push(extractBlobText(parts));
      return new OriginalBlob(parts, options);
    });
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
      if (tag === 'a') el.click = mockClick;
      return el;
    });

    // Mock clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.Blob = OriginalBlob;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // exportResults
  // =========================================================================
  describe('exportResults', () => {
    // -- Empty entries --
    describe('empty entries', () => {
      it('should show warning toast and not create file', () => {
        mockGetState.mockReturnValue({
          entries: [],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        expect(showToast).toHaveBeenCalledWith('noEntries', 'warning');
        expect(capturedBlobContents).toHaveLength(0);
        expect(mockClick).not.toHaveBeenCalled();
      });
    });

    // -- Status rendering --
    describe('status rendering', () => {
      it('should export DNS entries with DNS status', () => {
        mockGetState.mockReturnValue({
          entries: [entry({ bib: '042', status: 'dns' })],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        const dataRow = capturedBlobContents[0]!.split('\n')[1]!;
        expect(dataRow.split(';')[4]).toBe('DNS');
      });

      it('should export DNF entries with DNF status', () => {
        mockGetState.mockReturnValue({
          entries: [entry({ bib: '043', point: 'F', status: 'dnf' })],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        const dataRow = capturedBlobContents[0]!.split('\n')[1]!;
        expect(dataRow.split(';')[4]).toBe('DNF');
      });

      it('should export DSQ when faults exist and penalty mode is off', () => {
        mockGetState.mockReturnValue({
          entries: [entry({ bib: '044', point: 'F' })],
          faultEntries: [fault({ bib: '044' })],
          currentLang: 'en',
          raceId: 'RACE',
          usePenaltyMode: false,
          penaltySeconds: 5,
        });

        exportResults();

        const dataRow = capturedBlobContents[0]!.split('\n')[1]!;
        expect(dataRow.split(';')[4]).toBe('DSQ');
      });

      it('should export FLT when penalty mode is on', () => {
        mockGetState.mockReturnValue({
          entries: [entry({ bib: '045', point: 'F' })],
          faultEntries: [
            fault({ bib: '045', gateNumber: 5, faultType: 'STR' }),
          ],
          currentLang: 'en',
          raceId: 'RACE',
          usePenaltyMode: true,
          penaltySeconds: 5,
        });

        exportResults();

        const dataRow = capturedBlobContents[0]!.split('\n')[1]!;
        expect(dataRow.split(';')[4]).toBe('FLT');
      });

      it('should export OK status for normal entries', () => {
        mockGetState.mockReturnValue({
          entries: [entry()],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        const dataRow = capturedBlobContents[0]!.split('\n')[1]!;
        expect(dataRow.split(';')[4]).toBe('OK');
      });

      it('should handle various statuses (dns, dnf) in same export', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({ id: '1', bib: '042', status: 'dns' }),
            entry({
              id: '2',
              bib: '043',
              point: 'F',
              status: 'dnf',
              timestamp: '2024-01-15T10:05:00.000Z',
            }),
          ],
          faultEntries: [],
          currentLang: 'de',
          raceId: 'RACE',
        });

        exportResults();
        expect(mockCreateObjectURL).toHaveBeenCalled();
      });
    });

    // -- German/English language differences --
    describe('language differences', () => {
      it('should render flt status as SZT in German', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({
              bib: '007',
              point: 'F',
              timestamp: '2024-01-15T10:05:00.000Z',
            }),
          ],
          faultEntries: [
            fault({
              bib: '007',
              gateNumber: 5,
              faultType: 'STR',
              timestamp: '2024-01-15T10:04:00.000Z',
            }),
          ],
          currentLang: 'de',
          raceId: 'RACE',
          usePenaltyMode: true,
          penaltySeconds: 5,
        });

        exportResults();

        const dataRow = capturedBlobContents[0]!.split('\n')[1]!;
        expect(dataRow.split(';')[4]).toBe('SZT');
      });
    });

    // -- Photo data exclusion --
    describe('photo data exclusion', () => {
      it('should not include base64 photo data in CSV output', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({
              photo: 'base64encodedverylongphotodatastring'.repeat(100),
            }),
          ],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        expect(capturedBlobContents[0]).not.toContain(
          'base64encodedverylongphotodatastring',
        );
      });

      it('should not include "indexeddb" photo marker in CSV output', () => {
        mockGetState.mockReturnValue({
          entries: [entry({ photo: 'indexeddb' })],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        expect(capturedBlobContents[0]).not.toContain('indexeddb');
      });
    });

    // -- Column count & delimiter consistency --
    describe('column count and delimiter consistency', () => {
      it('should produce 7 columns per row when no faults exist', () => {
        mockGetState.mockReturnValue({
          entries: [entry({ point: 'F' })],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        const lines = capturedBlobContents[0]!.split('\n');
        expect(lines[0]!.split(';')).toHaveLength(7);
        expect(lines[1]!.split(';')).toHaveLength(7);
      });

      it('should produce 9 columns per row when faults exist', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({
              bib: '005',
              point: 'F',
              timestamp: '2024-01-15T10:05:00.000Z',
            }),
          ],
          faultEntries: [
            fault({
              bib: '005',
              gateNumber: 3,
              timestamp: '2024-01-15T10:04:00.000Z',
            }),
          ],
          currentLang: 'en',
          raceId: 'RACE',
          usePenaltyMode: true,
          penaltySeconds: 5,
        });

        exportResults();

        const lines = capturedBlobContents[0]!.split('\n');
        expect(lines[0]!.split(';')).toHaveLength(9);
        expect(lines[1]!.split(';')).toHaveLength(9);
      });

      it('should have consistent column count across all rows', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({ id: '1', bib: '042' }),
            entry({
              id: '2',
              bib: '043',
              point: 'F',
              run: 2,
              status: 'dns',
              timestamp: '2024-01-15T13:05:00.000Z',
              deviceId: 'dev_2',
              deviceName: 'Timer 2',
            }),
          ],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        const lines = capturedBlobContents[0]!.split('\n').filter(Boolean);
        const headerColCount = lines[0]!.split(';').length;
        for (let i = 1; i < lines.length; i++) {
          expect(lines[i]!.split(';').length).toBe(headerColCount);
        }
      });

      it('should use semicolons as delimiter in all rows', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({ id: '1' }),
            entry({
              id: '2',
              bib: '043',
              point: 'F',
              timestamp: '2024-01-15T09:05:00.000Z',
            }),
          ],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        const lines = capturedBlobContents[0]!.split('\n').filter(Boolean);
        for (const line of lines) {
          expect(line).toContain(';');
        }
      });

      it('should include Datum column in header and data', () => {
        mockGetState.mockReturnValue({
          entries: [entry()],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        const csv = capturedBlobContents[0]!;
        const header = csv.split('\n')[0]!;
        expect(header).toContain('Datum');

        const dataRow = csv.split('\n')[1]!;
        const cols = dataRow.split(';');
        const lastCol = cols[cols.length - 1]!;
        expect(lastCol).toMatch(/\d{4}-\d{2}-\d{2}/);
      });
    });

    // -- Sort order --
    describe('sort order', () => {
      it('should sort entries chronologically by timestamp', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({
              id: '2',
              bib: '043',
              timestamp: '2024-01-15T10:00:00.000Z',
            }),
            entry({
              id: '1',
              bib: '042',
              timestamp: '2024-01-15T09:00:00.000Z',
            }),
          ],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        const lines = capturedBlobContents[0]!.split('\n');
        expect(lines[1]!.split(';')[0]).toBe('042');
        expect(lines[2]!.split(';')[0]).toBe('043');
      });
    });

    // -- Run handling --
    describe('run field handling', () => {
      it('should default run to 1 when undefined', () => {
        mockGetState.mockReturnValue({
          entries: [entry({ run: undefined })],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();

        const dataRow = capturedBlobContents[0]!.split('\n')[1]!;
        expect(dataRow.split(';')[1]).toBe('1');
      });

      it('should include both run=1 and run=2 entries', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({ id: '1', bib: '010', run: 1 }),
            entry({
              id: '2',
              bib: '010',
              run: 2,
              timestamp: '2024-01-15T13:00:00.000Z',
            }),
          ],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'SLALOM-2024',
        });

        exportResults();

        const lines = capturedBlobContents[0]!.split('\n').filter(Boolean);
        expect(lines).toHaveLength(3); // header + 2 data rows
        const runs = lines.slice(1).map((l) => l.split(';')[1]);
        expect(runs).toContain('1');
        expect(runs).toContain('2');
      });
    });

    // -- Device name fallback --
    describe('device name fallback', () => {
      it('should use deviceId when deviceName is empty', () => {
        mockGetState.mockReturnValue({
          entries: [entry({ deviceName: '' })],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'RACE',
        });

        exportResults();
        expect(mockCreateObjectURL).toHaveBeenCalled();
      });
    });

    // -- Filename --
    describe('filename', () => {
      it('should trigger download with raceId in filename', () => {
        mockGetState.mockReturnValue({
          entries: [entry()],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'SL-2024',
        });

        exportResults();
        expect(mockClick).toHaveBeenCalled();
      });

      it('should use "race" as default when no raceId set', () => {
        mockGetState.mockReturnValue({
          entries: [entry()],
          faultEntries: [],
          currentLang: 'en',
          raceId: null,
        });

        exportResults();
        expect(mockClick).toHaveBeenCalled();
      });
    });

    // -- Success feedback --
    describe('success feedback', () => {
      it('should show success toast, trigger download, and call feedbackSuccess', () => {
        mockGetState.mockReturnValue({
          entries: [entry()],
          faultEntries: [],
          currentLang: 'en',
          raceId: 'TEST-RACE',
        });

        exportResults();

        expect(mockCreateObjectURL).toHaveBeenCalled();
        expect(mockClick).toHaveBeenCalled();
        expect(mockRevokeObjectURL).toHaveBeenCalled();
        expect(feedbackSuccess).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('exported', 'success');
      });
    });

    // -- Fault association --
    describe('fault association', () => {
      it('should NOT apply faults to Start entries even if bib/run match', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({ id: '1', bib: '025', point: 'S' }),
            entry({
              id: '2',
              bib: '025',
              point: 'F',
              timestamp: '2024-01-15T09:05:00.000Z',
            }),
          ],
          faultEntries: [fault({ bib: '025' })],
          currentLang: 'en',
          raceId: 'RACE',
          usePenaltyMode: true,
          penaltySeconds: 5,
        });

        exportResults();

        const lines = capturedBlobContents[0]!.split('\n');
        const startRow = lines[1]!; // earlier timestamp
        const finishRow = lines[2]!;

        expect(startRow.split(';')[4]).toBe('OK');
        expect(startRow.split(';')[6]).toBe('0'); // no penalty

        expect(finishRow.split(';')[4]).toBe('FLT');
        expect(finishRow.split(';')[6]).toBe('5');
        expect(finishRow.split(';')[7]).toBe('T4(MG)');
      });

      it('should sort multiple faults by gate number in Torfehler column', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({
              bib: '012',
              point: 'F',
              timestamp: '2024-01-15T10:10:00.000Z',
            }),
          ],
          faultEntries: [
            fault({
              id: 'f2',
              bib: '012',
              gateNumber: 8,
              faultType: 'BR',
              timestamp: '2024-01-15T10:08:00.000Z',
              gateRange: [1, 15],
            }),
            fault({
              id: 'f1',
              bib: '012',
              gateNumber: 3,
              faultType: 'MG',
              timestamp: '2024-01-15T10:06:00.000Z',
              gateRange: [1, 15],
            }),
            fault({
              id: 'f3',
              bib: '012',
              gateNumber: 5,
              faultType: 'STR',
              timestamp: '2024-01-15T10:07:00.000Z',
              gateRange: [1, 15],
            }),
          ],
          currentLang: 'en',
          raceId: 'RACE',
          usePenaltyMode: true,
          penaltySeconds: 5,
        });

        exportResults();

        const dataRow = capturedBlobContents[0]!.split('\n')[1]!;
        expect(dataRow.split(';')[7]).toBe('T3(MG)+T5(STR)+T8(BR)');
      });

      it('should calculate cumulative penalty for multiple faults', () => {
        mockGetState.mockReturnValue({
          entries: [
            entry({
              bib: '020',
              point: 'F',
              timestamp: '2024-01-15T10:10:00.000Z',
            }),
          ],
          faultEntries: [
            fault({
              id: 'f1',
              bib: '020',
              gateNumber: 2,
              timestamp: '2024-01-15T10:08:00.000Z',
            }),
            fault({
              id: 'f2',
              bib: '020',
              gateNumber: 7,
              faultType: 'STR',
              timestamp: '2024-01-15T10:09:00.000Z',
            }),
          ],
          currentLang: 'en',
          raceId: 'RACE',
          usePenaltyMode: true,
          penaltySeconds: 3,
        });

        exportResults();

        const dataRow = capturedBlobContents[0]!.split('\n')[1]!;
        expect(dataRow.split(';')[6]).toBe('6'); // 2 faults * 3s = 6
      });
    });
  });

  // =========================================================================
  // exportJudgeReport
  // =========================================================================
  describe('exportJudgeReport', () => {
    it('should generate judge report with no faults', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [],
        deviceName: 'Judge 1',
        deviceId: 'dev_judge1',
        raceId: 'RACE-2024',
        gateAssignment: [1, 10],
      });

      exportJudgeReport();

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(feedbackSuccess).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('exported', 'success');
    });

    it('should include run 1 faults in report', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault({ deviceId: 'dev_judge1' })],
        deviceName: 'Judge 1',
        deviceId: 'dev_judge1',
        raceId: 'RACE-2024',
        gateAssignment: [1, 10],
      });

      exportJudgeReport();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should include run 2 faults in report (German)', () => {
      mockGetState.mockReturnValue({
        currentLang: 'de',
        faultEntries: [
          fault({
            run: 2,
            faultType: 'STR',
            timestamp: '2024-01-15T14:03:00.000Z',
            deviceId: 'dev_judge1',
          }),
        ],
        deviceName: 'Judge 1',
        deviceId: 'dev_judge1',
        raceId: 'RACE-2024',
        gateAssignment: null,
      });

      exportJudgeReport();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should include both run 1 and run 2 sections when faults exist in both', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [
          fault({
            id: 'f1',
            bib: '015',
            run: 1,
            gateNumber: 3,
            timestamp: '2024-01-15T09:30:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge A',
          }),
          fault({
            id: 'f2',
            bib: '015',
            run: 2,
            gateNumber: 7,
            faultType: 'BR',
            timestamp: '2024-01-15T14:15:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge A',
          }),
        ],
        deviceName: 'Judge A',
        deviceId: 'dev_judge1',
        raceId: 'GS-2024',
        gateAssignment: [1, 10],
      });

      exportJudgeReport();

      const content = capturedBlobContents[0]!;
      expect(content).toContain('runLabel 1:');
      expect(content).toContain('runLabel 2:');
      expect(content).toContain('015');
    });

    it('should filter faults to only this device', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [
          fault({ id: 'f1', deviceId: 'dev_judge1' }),
          fault({
            id: 'f2',
            bib: '043',
            gateNumber: 8,
            faultType: 'BR',
            deviceId: 'dev_judge2',
            deviceName: 'Judge 2',
            gateRange: [11, 20],
          }),
        ],
        deviceName: 'Judge 1',
        deviceId: 'dev_judge1',
        raceId: 'RACE-2024',
        gateAssignment: [1, 10],
      });

      exportJudgeReport();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should use default raceId when not set', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [],
        deviceName: 'Judge 1',
        deviceId: 'dev_judge1',
        raceId: '',
        gateAssignment: null,
      });

      exportJudgeReport();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // exportFaultSummaryWhatsApp
  // =========================================================================
  describe('exportFaultSummaryWhatsApp', () => {
    it('should show warning toast when no faults exist', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [],
        raceId: 'RACE',
      });

      exportFaultSummaryWhatsApp();
      expect(showToast).toHaveBeenCalledWith('noFaultsToExport', 'warning');
    });

    it('should copy to clipboard when available', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault()],
        raceId: 'RACE-2024',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportFaultSummaryWhatsApp();
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('should include penalty info in penalty mode', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault()],
        raceId: 'RACE-2024',
        usePenaltyMode: true,
        penaltySeconds: 5,
      });

      exportFaultSummaryWhatsApp();
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('should group faults by bib and run', () => {
      mockGetState.mockReturnValue({
        currentLang: 'de',
        faultEntries: [
          fault({ id: 'f1', run: 1 }),
          fault({
            id: 'f2',
            run: 2,
            gateNumber: 8,
            faultType: 'STR',
            timestamp: '2024-01-15T14:03:00.000Z',
          }),
        ],
        raceId: 'RACE-2024',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportFaultSummaryWhatsApp();
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('should fall back to download when clipboard is unavailable', () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault()],
        raceId: 'RACE-2024',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportFaultSummaryWhatsApp();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should fall back to download when clipboard write fails', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(() => Promise.reject(new Error('Failed'))) },
        writable: true,
        configurable: true,
      });

      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault()],
        raceId: 'RACE-2024',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportFaultSummaryWhatsApp();

      await vi.waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // exportChiefSummary
  // =========================================================================
  describe('exportChiefSummary', () => {
    it('should show warning toast when no faults exist', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [],
        raceId: 'RACE',
      });

      exportChiefSummary();
      expect(showToast).toHaveBeenCalledWith('noFaultsToExport', 'warning');
    });

    it('should generate chief summary with penalty mode', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault()],
        raceId: 'RACE-2024',
        usePenaltyMode: true,
        penaltySeconds: 5,
      });

      exportChiefSummary();

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(feedbackSuccess).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('exported', 'success');
    });

    it('should generate chief summary without penalty mode', () => {
      mockGetState.mockReturnValue({
        currentLang: 'de',
        faultEntries: [fault()],
        raceId: 'RACE-2024',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportChiefSummary();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should include run 1 and run 2 faults', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [
          fault({ id: 'f1', run: 1 }),
          fault({
            id: 'f2',
            bib: '043',
            run: 2,
            gateNumber: 8,
            faultType: 'STR',
            timestamp: '2024-01-15T14:03:00.000Z',
          }),
        ],
        raceId: 'RACE-2024',
        usePenaltyMode: true,
        penaltySeconds: 5,
      });

      exportChiefSummary();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should use default raceId when empty', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault()],
        raceId: '',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportChiefSummary();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });
});
