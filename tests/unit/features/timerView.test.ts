/**
 * Unit Tests for Timer View Module
 * Tests: updateBibDisplay, updateTimingPointSelection, updateRunSelection,
 *        handleTimerVoiceIntent, initClock, destroyClock, cleanupTimerView,
 *        recordTimestamp
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../src/components', () => {
  const MockClock = vi.fn();
  MockClock.prototype.start = vi.fn();
  MockClock.prototype.destroy = vi.fn();
  return {
    Clock: MockClock,
    showToast: vi.fn(),
  };
});

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  ambientModeService: {
    isActive: vi.fn(() => false),
    exitAmbientMode: vi.fn(),
  },
  captureTimingPhoto: vi.fn(() => Promise.resolve(null)),
  feedbackSuccess: vi.fn(),
  feedbackTap: vi.fn(),
  feedbackWarning: vi.fn(),
  gpsService: { getOffset: vi.fn(() => 0) },
  photoStorage: {
    savePhoto: vi.fn(() => Promise.resolve(true)),
    deletePhoto: vi.fn(() => Promise.resolve()),
  },
  syncService: { broadcastEntry: vi.fn() },
}));

const mockGetState = vi.fn();
const mockSetBibInput = vi.fn();
const mockSetSelectedPoint = vi.fn();
const mockSetSelectedRun = vi.fn();
const mockAddEntry = vi.fn();
const mockSetRecording = vi.fn();
const mockUpdateEntry = vi.fn(() => true);

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    setBibInput: (...args: unknown[]) => mockSetBibInput(...args),
    setSelectedPoint: (...args: unknown[]) => mockSetSelectedPoint(...args),
    setSelectedRun: (...args: unknown[]) => mockSetSelectedRun(...args),
    addEntry: (...args: unknown[]) => mockAddEntry(...args),
    setRecording: (...args: unknown[]) => mockSetRecording(...args),
    updateEntry: (...args: unknown[]) => mockUpdateEntry(...args),
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
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/utils/timestampRecorder', () => ({
  createTimestampEntry: vi.fn(() => ({
    entry: {
      id: 'test-entry-1',
      bib: '042',
      point: 'S',
      run: 1,
      timestamp: '2024-01-15T10:00:00.000Z',
      status: 'ok',
      deviceId: 'dev_1',
      deviceName: 'Timer 1',
    },
  })),
  isDuplicateEntry: vi.fn(() => false),
}));

import {
  cleanupTimerView,
  destroyClock,
  handleTimerVoiceIntent,
  initClock,
  initNumberPad,
  initRunSelector,
  initTabs,
  initTimestampButton,
  initTimingPoints,
  recordTimestamp,
  updateBibDisplay,
  updateRunSelection,
  updateTimingPointSelection,
} from '../../../src/features/timerView';
import {
  feedbackSuccess,
  feedbackTap,
  syncService,
} from '../../../src/services';

describe('Timer View Module', () => {
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

  describe('updateBibDisplay', () => {
    it('should update bib value with padded number', () => {
      const bibDisplay = document.createElement('div');
      bibDisplay.id = 'bib-display';
      const bibValue = document.createElement('span');
      bibValue.className = 'bib-value';
      bibDisplay.appendChild(bibValue);
      container.appendChild(bibDisplay);

      updateBibDisplay();

      expect(bibValue.textContent).toBe('042');
    });

    it('should show dashes when no bib input', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        bibInput: '',
      });

      const bibDisplay = document.createElement('div');
      bibDisplay.id = 'bib-display';
      const bibValue = document.createElement('span');
      bibValue.className = 'bib-value';
      bibDisplay.appendChild(bibValue);
      container.appendChild(bibDisplay);

      updateBibDisplay();

      expect(bibValue.textContent).toBe('---');
    });

    it('should toggle ready class on timestamp button', () => {
      const btn = document.createElement('button');
      btn.id = 'timestamp-btn';
      container.appendChild(btn);

      updateBibDisplay();

      expect(btn.classList.contains('ready')).toBe(true);
    });

    it('should remove ready class when bib is empty', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        bibInput: '',
      });

      const btn = document.createElement('button');
      btn.id = 'timestamp-btn';
      btn.classList.add('ready');
      container.appendChild(btn);

      updateBibDisplay();

      expect(btn.classList.contains('ready')).toBe(false);
    });

    it('should handle missing DOM elements gracefully', () => {
      expect(() => updateBibDisplay()).not.toThrow();
    });
  });

  describe('updateTimingPointSelection', () => {
    it('should set active class on selected timing point', () => {
      const btn1 = document.createElement('button');
      btn1.className = 'timing-point-btn';
      btn1.setAttribute('data-point', 'S');
      container.appendChild(btn1);

      const btn2 = document.createElement('button');
      btn2.className = 'timing-point-btn';
      btn2.setAttribute('data-point', 'F');
      container.appendChild(btn2);

      updateTimingPointSelection();

      expect(btn1.classList.contains('active')).toBe(true);
      expect(btn2.classList.contains('active')).toBe(false);
    });

    it('should update aria-checked attributes', () => {
      const btn1 = document.createElement('button');
      btn1.className = 'timing-point-btn';
      btn1.setAttribute('data-point', 'S');
      container.appendChild(btn1);

      const btn2 = document.createElement('button');
      btn2.className = 'timing-point-btn';
      btn2.setAttribute('data-point', 'F');
      container.appendChild(btn2);

      updateTimingPointSelection();

      expect(btn1.getAttribute('aria-checked')).toBe('true');
      expect(btn2.getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('updateRunSelection', () => {
    it('should set active class on selected run', () => {
      const btn1 = document.createElement('button');
      btn1.className = 'run-btn';
      btn1.setAttribute('data-run', '1');
      container.appendChild(btn1);

      const btn2 = document.createElement('button');
      btn2.className = 'run-btn';
      btn2.setAttribute('data-run', '2');
      container.appendChild(btn2);

      updateRunSelection();

      expect(btn1.classList.contains('active')).toBe(true);
      expect(btn2.classList.contains('active')).toBe(false);
    });

    it('should update aria-checked on run buttons', () => {
      const btn1 = document.createElement('button');
      btn1.className = 'run-btn';
      btn1.setAttribute('data-run', '1');
      container.appendChild(btn1);

      updateRunSelection();

      expect(btn1.getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('handleTimerVoiceIntent', () => {
    it('should set bib on set_bib intent', () => {
      handleTimerVoiceIntent({
        action: 'set_bib',
        params: { bib: '055' },
      });

      expect(mockSetBibInput).toHaveBeenCalledWith('055');
      expect(feedbackTap).toHaveBeenCalled();
    });

    it('should set timing point on set_point intent', () => {
      handleTimerVoiceIntent({
        action: 'set_point',
        params: { point: 'F' },
      });

      expect(mockSetSelectedPoint).toHaveBeenCalledWith('F');
      expect(feedbackTap).toHaveBeenCalled();
    });

    it('should set run on set_run intent', () => {
      handleTimerVoiceIntent({
        action: 'set_run',
        params: { run: 2 },
      });

      expect(mockSetSelectedRun).toHaveBeenCalledWith(2);
      expect(feedbackTap).toHaveBeenCalled();
    });

    it('should ignore set_bib without bib param', () => {
      handleTimerVoiceIntent({
        action: 'set_bib',
        params: {},
      });

      expect(mockSetBibInput).not.toHaveBeenCalled();
    });

    it('should handle unknown voice intents gracefully', () => {
      expect(() =>
        handleTimerVoiceIntent({
          action: 'unknown_action' as any,
        }),
      ).not.toThrow();
    });
  });

  describe('initClock / destroyClock', () => {
    it('should not throw when clock-container is missing', () => {
      expect(() => initClock()).not.toThrow();
    });

    it('should create clock when container exists', () => {
      const clockContainer = document.createElement('div');
      clockContainer.id = 'clock-container';
      container.appendChild(clockContainer);

      expect(() => initClock()).not.toThrow();
    });

    it('should not throw when destroying without init', () => {
      expect(() => destroyClock()).not.toThrow();
    });
  });

  describe('initTabs', () => {
    it('should not throw when no tab buttons', () => {
      expect(() => initTabs()).not.toThrow();
    });

    it('should not throw when tab buttons exist', () => {
      const tabBtn1 = document.createElement('button');
      tabBtn1.className = 'tab-btn';
      tabBtn1.setAttribute('data-view', 'timer');
      container.appendChild(tabBtn1);

      const tabBtn2 = document.createElement('button');
      tabBtn2.className = 'tab-btn';
      tabBtn2.setAttribute('data-view', 'results');
      container.appendChild(tabBtn2);

      expect(() => initTabs()).not.toThrow();
    });
  });

  describe('initNumberPad', () => {
    it('should not throw when number-pad missing', () => {
      expect(() => initNumberPad()).not.toThrow();
    });

    it('should not throw when number-pad exists', () => {
      const numPad = document.createElement('div');
      numPad.id = 'number-pad';
      container.appendChild(numPad);

      expect(() => initNumberPad()).not.toThrow();
    });

    it('should set aria-expanded when bib display and numpad both exist', () => {
      const bibDisplay = document.createElement('div');
      bibDisplay.id = 'bib-display';
      container.appendChild(bibDisplay);

      const numPad = document.createElement('div');
      numPad.id = 'number-pad';
      container.appendChild(numPad);

      initNumberPad();

      expect(bibDisplay.getAttribute('aria-expanded')).toBe('true');
    });
  });

  describe('initTimingPoints', () => {
    it('should not throw when timing-points missing', () => {
      expect(() => initTimingPoints()).not.toThrow();
    });

    it('should not throw when container exists', () => {
      const timingPoints = document.createElement('div');
      timingPoints.id = 'timing-points';
      container.appendChild(timingPoints);

      expect(() => initTimingPoints()).not.toThrow();
    });
  });

  describe('initRunSelector', () => {
    it('should not throw when run-selector missing', () => {
      expect(() => initRunSelector()).not.toThrow();
    });

    it('should not throw when container exists', () => {
      const runSelector = document.createElement('div');
      runSelector.id = 'run-selector';
      container.appendChild(runSelector);

      expect(() => initRunSelector()).not.toThrow();
    });
  });

  describe('initTimestampButton', () => {
    it('should not throw when button missing', () => {
      expect(() => initTimestampButton()).not.toThrow();
    });

    it('should not throw when button exists', () => {
      const btn = document.createElement('button');
      btn.id = 'timestamp-btn';
      container.appendChild(btn);

      expect(() => initTimestampButton()).not.toThrow();
    });
  });

  describe('cleanupTimerView', () => {
    it('should not throw', () => {
      expect(() => cleanupTimerView()).not.toThrow();
    });
  });

  describe('recordTimestamp', () => {
    it('should record a timestamp entry', async () => {
      await recordTimestamp();

      expect(mockSetRecording).toHaveBeenCalledWith(true);
      expect(mockAddEntry).toHaveBeenCalled();
      expect(feedbackSuccess).toHaveBeenCalled();
      expect(syncService.broadcastEntry).toHaveBeenCalled();
      expect(mockSetRecording).toHaveBeenCalledWith(false);
    });

    it('should not record when already recording', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        isRecording: true,
      });

      await recordTimestamp();

      expect(mockSetRecording).not.toHaveBeenCalled();
      expect(mockAddEntry).not.toHaveBeenCalled();
    });

    it('should auto-increment bib when auto setting is on', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { auto: true, sync: false, photoCapture: false },
        bibInput: '042',
      });

      await recordTimestamp();

      expect(mockSetBibInput).toHaveBeenCalledWith('43');
    });

    it('should clear bib when auto is off and bib exists', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { auto: false, sync: false, photoCapture: false },
        bibInput: '042',
      });

      await recordTimestamp();

      expect(mockSetBibInput).toHaveBeenCalledWith('');
    });

    it('should use cloud highest bib for auto-increment when sync enabled', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { auto: true, sync: true, photoCapture: false },
        bibInput: '042',
        cloudHighestBib: 100,
      });

      await recordTimestamp();

      expect(mockSetBibInput).toHaveBeenCalledWith('101');
    });
  });
});
