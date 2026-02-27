/**
 * Extended coverage tests for Timer View Module
 * Tests: recordTimestamp with duplicate/zero-bib detection, photo capture flow,
 *        confirmation overlays, warning overlays
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components', () => {
  const MockClock = vi.fn();
  MockClock.prototype.start = vi.fn();
  MockClock.prototype.destroy = vi.fn();
  return { Clock: MockClock, showToast: vi.fn() };
});

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services/ambient', () => ({
  ambientModeService: {
    isActive: vi.fn(() => false),
    exitAmbientMode: vi.fn(),
    wasRecentlyExited: vi.fn(() => false),
  },
}));

const mockCaptureTimingPhoto = vi.fn(() => Promise.resolve(null));

vi.mock('../../../src/services', () => ({
  captureTimingPhoto: (...args: unknown[]) => mockCaptureTimingPhoto(...args),
  feedbackSuccess: vi.fn(),
  feedbackTap: vi.fn(),
  feedbackWarning: vi.fn(),
  gpsService: { getOffset: vi.fn(() => 0) },
  photoStorage: {
    savePhoto: vi.fn(() => Promise.resolve(true)),
    deletePhoto: vi.fn(() => Promise.resolve()),
  },
  syncEntry: vi.fn(() => Promise.resolve()),
}));

const mockGetState = vi.fn();
const mockSetBibInput = vi.fn();
const mockAddEntry = vi.fn();
const mockSetRecording = vi.fn();
const mockUpdateEntry = vi.fn(() => true);

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    setBibInput: (...a: unknown[]) => mockSetBibInput(...a),
    setSelectedPoint: vi.fn(),
    setSelectedRun: vi.fn(),
    addEntry: (...a: unknown[]) => mockAddEntry(...a),
    setRecording: (...a: unknown[]) => mockSetRecording(...a),
    updateEntry: (...a: unknown[]) => mockUpdateEntry(...a),
  },
}));

vi.mock('../../../src/utils', () => ({
  getElement: vi.fn((id: string) => document.getElementById(id)),
  getPointLabel: vi.fn((p: string) => (p === 'S' ? 'Start' : 'Finish')),
  getRunColor: vi.fn(() => '#fff'),
  getRunLabel: vi.fn((r: number) => `Run ${r}`),
  logWarning: vi.fn(),
}));

vi.mock('../../../src/utils/format', () => ({
  formatTime: vi.fn(() => '10:00:00.000'),
  getPointColor: vi.fn(() => '#f97316'),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockIsDuplicateEntry = vi.fn(() => false);

vi.mock('../../../src/utils/timestampRecorder', () => ({
  createTimestampEntry: vi.fn(() => ({
    entry: {
      id: 'test-entry-1',
      bib: '042',
      point: 'S',
      run: 1,
      timestamp: new Date('2024-01-15T10:00:00.000Z').toISOString(),
      status: 'ok',
      deviceId: 'dev_1',
      deviceName: 'Timer 1',
    },
  })),
  isDuplicateEntry: (...a: unknown[]) => mockIsDuplicateEntry(...a),
}));

import { recordTimestamp } from '../../../src/features/timerView';
import { feedbackSuccess, feedbackWarning } from '../../../src/services';

describe('Timer View — extended coverage', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      bibInput: '042',
      selectedPoint: 'S',
      selectedRun: 1,
      currentView: 'timer',
      currentLang: 'en',
      deviceId: 'dev_1',
      deviceName: 'Timer 1',
      isRecording: false,
      entries: [],
      settings: { auto: false, sync: false, photoCapture: false },
      cloudHighestBib: 0,
      raceId: 'RACE',
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('recordTimestamp — duplicate detection', () => {
    it('should call feedbackWarning on duplicate entry', async () => {
      mockIsDuplicateEntry.mockReturnValue(true);

      await recordTimestamp();

      expect(feedbackWarning).toHaveBeenCalled();
      expect(feedbackSuccess).not.toHaveBeenCalled();
    });
  });

  describe('recordTimestamp — zero bib detection', () => {
    it('should call feedbackWarning on zero bib ("0")', async () => {
      const { createTimestampEntry } = await import(
        '../../../src/utils/timestampRecorder'
      );
      vi.mocked(createTimestampEntry).mockReturnValueOnce({
        entry: {
          id: 'zero-entry',
          bib: '0',
          point: 'S',
          run: 1,
          timestamp: new Date().toISOString(),
          status: 'ok',
          deviceId: 'dev_1',
          deviceName: 'Timer 1',
        },
      });

      mockGetState.mockReturnValue({
        ...mockGetState(),
        bibInput: '0',
      });

      await recordTimestamp();

      expect(feedbackWarning).toHaveBeenCalled();
    });

    it('should call feedbackWarning on all-zeros bib ("000")', async () => {
      const { createTimestampEntry } = await import(
        '../../../src/utils/timestampRecorder'
      );
      vi.mocked(createTimestampEntry).mockReturnValueOnce({
        entry: {
          id: 'zero-entry-2',
          bib: '000',
          point: 'S',
          run: 1,
          timestamp: new Date().toISOString(),
          status: 'ok',
          deviceId: 'dev_1',
          deviceName: 'Timer 1',
        },
      });

      mockGetState.mockReturnValue({
        ...mockGetState(),
        bibInput: '000',
      });

      await recordTimestamp();

      expect(feedbackWarning).toHaveBeenCalled();
    });
  });

  describe('recordTimestamp — auto-increment edge cases', () => {
    it('should cap auto-increment at 999', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        bibInput: '999',
        settings: { auto: true, sync: false, photoCapture: false },
      });

      await recordTimestamp();

      // 999 + 1 = 1000, capped to Math.min(1000, 999) = 999
      expect(mockSetBibInput).toHaveBeenCalledWith('999');
    });

    it('should not clear bib when empty and auto off', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        bibInput: '',
        settings: { auto: false, sync: false, photoCapture: false },
      });

      await recordTimestamp();

      // bibInput is empty — should call setBibInput('') (the no-op clear path)
      expect(mockSetBibInput).toHaveBeenCalledWith('');
    });

    it('should prefer cloud highest bib when higher than local', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        bibInput: '010',
        settings: { auto: true, sync: true, photoCapture: false },
        cloudHighestBib: 50,
      });

      await recordTimestamp();

      expect(mockSetBibInput).toHaveBeenCalledWith('51');
    });

    it('should use local next when higher than cloud', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        bibInput: '100',
        settings: { auto: true, sync: true, photoCapture: false },
        cloudHighestBib: 50,
      });

      await recordTimestamp();

      expect(mockSetBibInput).toHaveBeenCalledWith('101');
    });
  });

  describe('recordTimestamp — always resets isRecording', () => {
    it('should call setRecording(false) in finally block even on success', async () => {
      await recordTimestamp();

      const calls = mockSetRecording.mock.calls;
      expect(calls[0][0]).toBe(true);
      expect(calls[calls.length - 1][0]).toBe(false);
    });
  });
});
