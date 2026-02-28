/**
 * Unit Tests for Radial Timer View Module
 * Tests: initRadialTimerView, destroyRadialTimerView, updateRadialBib,
 *        isRadialModeActive, and internal helpers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components/RadialDial', () => {
  const MockRadialDial = vi.fn();
  MockRadialDial.prototype.destroy = vi.fn();
  MockRadialDial.prototype.setValue = vi.fn();
  MockRadialDial.prototype.clear = vi.fn();
  MockRadialDial.prototype.flash = vi.fn();
  return { RadialDial: MockRadialDial };
});

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  batteryService: {
    initialize: vi.fn(() => Promise.resolve()),
    subscribe: vi.fn(() => vi.fn()),
  },
  captureTimingPhoto: vi.fn(() => Promise.resolve(null)),
  feedbackSuccess: vi.fn(),
  feedbackTap: vi.fn(),
  feedbackWarning: vi.fn(),
  gpsService: {
    getLastFix: vi.fn(() => null),
  },
  photoStorage: {
    savePhoto: vi.fn(() => Promise.resolve(false)),
  },
  syncService: {
    broadcastEntry: vi.fn(),
  },
}));

const mockGetState = vi.fn();

vi.mock('../../../src/store', () => ({
  $cloudDeviceCount: { value: 0 },
  $entries: { value: [] },
  $gpsStatus: { value: 'inactive' },
  $settings: { value: { sync: false, gps: false } },
  $syncStatus: { value: 'disconnected' },
  effect: vi.fn(() => vi.fn()),
  store: {
    $state: { value: { selectedPoint: 'S', selectedRun: 1 } },
    getState: () => mockGetState(),
    setBibInput: vi.fn(),
    setSelectedPoint: vi.fn(),
    setSelectedRun: vi.fn(),
    setRecording: vi.fn(),
    addEntry: vi.fn(),
    updateEntry: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock('../../../src/utils', () => ({
  escapeHtml: vi.fn((s: string) => s),
  getElement: vi.fn((id: string) => document.getElementById(id)),
  getPointLabel: vi.fn(() => 'Start'),
  logWarning: vi.fn(),
}));

vi.mock('../../../src/utils/format', () => ({
  formatTime: vi.fn(() => '10:30:45'),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(function () {
    return { add: vi.fn(), removeAll: vi.fn() };
  }),
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
      id: 'entry-1',
      bib: '042',
      point: 'S',
      run: 1,
      timestamp: '2024-01-15T10:30:45.123Z',
      status: 'ok',
      deviceId: 'dev_1',
      deviceName: 'Timer 1',
    },
  })),
  isDuplicateEntry: vi.fn(() => false),
}));

import {
  destroyRadialTimerView,
  initRadialTimerView,
  isRadialModeActive,
  updateRadialBib,
} from '../../../src/features/radialTimerView';

describe('Radial Timer View Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      currentView: 'timer',
      bibInput: '',
      selectedPoint: 'S',
      selectedRun: 1,
      entries: [],
      faultEntries: [],
      settings: { sync: false, gps: false, auto: false, photoCapture: false },
      gpsStatus: 'inactive',
      syncStatus: 'disconnected',
      cloudDeviceCount: 0,
      cloudHighestBib: 0,
      deviceId: 'dev_1',
      deviceName: 'Timer 1',
      isRecording: false,
    });
  });

  afterEach(() => {
    // Clean up module state
    destroyRadialTimerView();
    container.remove();
  });

  describe('initRadialTimerView', () => {
    it('should skip init when dial-container not found', () => {
      initRadialTimerView();
      // Should not throw, just skip
    });

    it('should initialize when dial-container exists', () => {
      const dialContainer = document.createElement('div');
      dialContainer.id = 'dial-container';
      container.appendChild(dialContainer);

      initRadialTimerView();
      // Should not throw
    });

    it('should skip re-initialization', () => {
      const dialContainer = document.createElement('div');
      dialContainer.id = 'dial-container';
      container.appendChild(dialContainer);

      initRadialTimerView();
      initRadialTimerView(); // Second call should skip
    });
  });

  describe('destroyRadialTimerView', () => {
    it('should not throw when not initialized', () => {
      expect(() => destroyRadialTimerView()).not.toThrow();
    });

    it('should clean up after init', () => {
      const dialContainer = document.createElement('div');
      dialContainer.id = 'dial-container';
      container.appendChild(dialContainer);

      initRadialTimerView();
      expect(() => destroyRadialTimerView()).not.toThrow();
    });
  });

  describe('updateRadialBib', () => {
    it('should update bib display with empty value', () => {
      const bibEl = document.createElement('div');
      bibEl.id = 'radial-bib-value';
      container.appendChild(bibEl);

      updateRadialBib();
      // Should show placeholder with cursor
      expect(bibEl.innerHTML).toContain('---');
    });

    it('should update bib display with value', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        bibInput: '42',
      });

      const bibEl = document.createElement('div');
      bibEl.id = 'radial-bib-value';
      container.appendChild(bibEl);

      updateRadialBib();
      expect(bibEl.innerHTML).toContain('042');
      expect(bibEl.classList.contains('active')).toBe(true);
    });
  });

  describe('isRadialModeActive', () => {
    it('should return false when timer view not found', () => {
      expect(isRadialModeActive()).toBe(false);
    });

    it('should return false when radial-mode class not present', () => {
      const timerView = document.createElement('div');
      timerView.className = 'timer-view';
      container.appendChild(timerView);

      expect(isRadialModeActive()).toBe(false);
    });

    it('should return true when radial-mode class present', () => {
      const timerView = document.createElement('div');
      timerView.className = 'timer-view radial-mode';
      container.appendChild(timerView);

      expect(isRadialModeActive()).toBe(true);
    });
  });
});
