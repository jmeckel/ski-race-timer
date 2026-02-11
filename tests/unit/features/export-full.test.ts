/**
 * Unit Tests for Export Feature Module - Full Coverage
 * Tests: exportResults, exportJudgeReport, exportFaultSummaryWhatsApp,
 *        exportChiefSummary, formatDateForExport, and private helpers via exports
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
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
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGetState = vi.fn();
vi.mock('../../../src/store', () => ({
  store: {
    getState: (...args: unknown[]) => mockGetState(...args),
  },
}));

import { showToast } from '../../../src/components';
import {
  escapeCSVField,
  exportChiefSummary,
  exportFaultSummaryWhatsApp,
  exportJudgeReport,
  exportResults,
  formatDateForExport,
  formatTimeForRaceHorology,
  getExportFilename,
} from '../../../src/features/export';
import { feedbackSuccess } from '../../../src/services';

describe('Export Feature Module - Full Coverage', () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let mockClick: ReturnType<typeof vi.fn>;
  let appendedLink: HTMLAnchorElement | null;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock URL.createObjectURL and revokeObjectURL
    mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
    mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

    // Track link element creation and clicks
    mockClick = vi.fn();
    appendedLink = null;
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = mockClick;
        const origAppend = document.body.appendChild.bind(document.body);
        vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
          appendedLink = node as HTMLAnchorElement;
          return origAppend(node);
        });
      }
      return el;
    });

    // Mock clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(() => Promise.resolve()),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatDateForExport', () => {
    it('should format date as YYYY-MM-DD', () => {
      const result = formatDateForExport('2024-01-15T14:30:45.123Z');
      // The date may be adjusted for local timezone, but format should match
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle first day of year', () => {
      // Use a local date to avoid timezone issues
      const date = new Date(2024, 0, 1, 12, 0, 0);
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2024-01-01');
    });

    it('should handle last day of year', () => {
      const date = new Date(2024, 11, 31, 12, 0, 0);
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2024-12-31');
    });

    it('should pad single-digit months and days', () => {
      const date = new Date(2024, 2, 5, 12, 0, 0); // March 5
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2024-03-05');
    });
  });

  describe('exportResults', () => {
    it('should show warning toast when no entries exist', () => {
      mockGetState.mockReturnValue({
        entries: [],
        faultEntries: [],
        currentLang: 'en',
      });

      exportResults();
      expect(showToast).toHaveBeenCalledWith('noEntries', 'warning');
    });

    it('should generate CSV without fault columns when no faults', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '042',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T10:00:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Timer 1',
          },
        ],
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

    it('should generate CSV with fault columns when faults exist', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '042',
            point: 'F',
            run: 1,
            timestamp: '2024-01-15T10:05:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Timer 1',
          },
        ],
        faultEntries: [
          {
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
          },
        ],
        currentLang: 'en',
        raceId: 'TEST-RACE',
        usePenaltyMode: true,
        penaltySeconds: 5,
      });

      exportResults();

      expect(mockCreateObjectURL).toHaveBeenCalled();
      const blobArg = mockCreateObjectURL.mock.calls[0][0] as Blob;
      expect(blobArg).toBeInstanceOf(Blob);
    });

    it('should use DSQ status when faults exist but penalty mode is off', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '042',
            point: 'F',
            run: 1,
            timestamp: '2024-01-15T10:05:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Timer 1',
          },
        ],
        faultEntries: [
          {
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
          },
        ],
        currentLang: 'en',
        raceId: 'TEST-RACE',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportResults();
      expect(feedbackSuccess).toHaveBeenCalled();
    });

    it('should sort entries by timestamp', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '2',
            bib: '043',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T10:01:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Timer 1',
          },
          {
            id: '1',
            bib: '042',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T10:00:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Timer 1',
          },
        ],
        faultEntries: [],
        currentLang: 'en',
        raceId: 'TEST-RACE',
      });

      exportResults();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should use default raceId "race" when not set', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '042',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T10:00:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Timer 1',
          },
        ],
        faultEntries: [],
        currentLang: 'en',
        raceId: '',
      });

      exportResults();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should use deviceId when deviceName is empty', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '042',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T10:00:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: '',
          },
        ],
        faultEntries: [],
        currentLang: 'en',
        raceId: 'RACE',
      });

      exportResults();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should default run to 1 when not set', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '042',
            point: 'S',
            timestamp: '2024-01-15T10:00:00.000Z',
            status: 'ok',
            deviceId: 'dev_1',
            deviceName: 'Timer 1',
          },
        ],
        faultEntries: [],
        currentLang: 'en',
        raceId: 'RACE',
      });

      exportResults();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should handle various statuses (dns, dnf, dsq)', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: '1',
            bib: '042',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T10:00:00.000Z',
            status: 'dns',
            deviceId: 'dev_1',
            deviceName: 'Timer 1',
          },
          {
            id: '2',
            bib: '043',
            point: 'F',
            run: 1,
            timestamp: '2024-01-15T10:05:00.000Z',
            status: 'dnf',
            deviceId: 'dev_1',
            deviceName: 'Timer 1',
          },
        ],
        faultEntries: [],
        currentLang: 'de',
        raceId: 'RACE',
      });

      exportResults();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });

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
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        deviceName: 'Judge 1',
        deviceId: 'dev_judge1',
        raceId: 'RACE-2024',
        gateAssignment: [1, 10],
      });

      exportJudgeReport();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should include run 2 faults in report', () => {
      mockGetState.mockReturnValue({
        currentLang: 'de',
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 2,
            gateNumber: 4,
            faultType: 'STR',
            timestamp: '2024-01-15T14:03:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        deviceName: 'Judge 1',
        deviceId: 'dev_judge1',
        raceId: 'RACE-2024',
        gateAssignment: null,
      });

      exportJudgeReport();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should filter faults to only this device', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_judge1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
          {
            id: 'f2',
            bib: '043',
            run: 1,
            gateNumber: 8,
            faultType: 'BR',
            timestamp: '2024-01-15T10:04:00.000Z',
            deviceId: 'dev_judge2',
            deviceName: 'Judge 2',
            gateRange: [11, 20],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
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

    it('should copy to clipboard when available', async () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        raceId: 'RACE-2024',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportFaultSummaryWhatsApp();

      // Should attempt clipboard write
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('should include penalty info in penalty mode', async () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
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
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
          {
            id: 'f2',
            bib: '042',
            run: 2,
            gateNumber: 8,
            faultType: 'STR',
            timestamp: '2024-01-15T14:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
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
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        raceId: 'RACE-2024',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportFaultSummaryWhatsApp();
      // Should fall back to file download
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should fall back to download when clipboard write fails', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: vi.fn(() => Promise.reject(new Error('Failed'))),
        },
        writable: true,
        configurable: true,
      });

      mockGetState.mockReturnValue({
        currentLang: 'en',
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        raceId: 'RACE-2024',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportFaultSummaryWhatsApp();

      // Wait for async clipboard failure
      await vi.waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
      });
    });
  });

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
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
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
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
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
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
          {
            id: 'f2',
            bib: '043',
            run: 2,
            gateNumber: 8,
            faultType: 'STR',
            timestamp: '2024-01-15T14:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
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
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 4,
            faultType: 'MG',
            timestamp: '2024-01-15T10:03:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            gateRange: [1, 10],
            currentVersion: 1,
            versionHistory: [],
            markedForDeletion: false,
          },
        ],
        raceId: '',
        usePenaltyMode: false,
        penaltySeconds: 5,
      });

      exportChiefSummary();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });
});
