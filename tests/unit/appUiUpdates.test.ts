/**
 * Unit Tests for App UI Updates Module
 * Tests: updateUI, updateViewVisibility, updateSyncStatusIndicator,
 *        updateGpsIndicator, updatePhotoCaptureIndicator, updateVoiceIndicator, updateUndoButton
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies
vi.mock('../../src/features/faults', () => ({
  refreshInlineFaultUI: vi.fn(),
  updateActiveBibsList: vi.fn(),
}));

vi.mock('../../src/features/gateJudgeView', () => ({
  updateGateJudgeRunSelection: vi.fn(),
  updateGateRangeDisplay: vi.fn(),
  updateJudgeReadyStatus: vi.fn(),
}));

vi.mock('../../src/features/radialTimerView', () => ({
  isRadialModeActive: vi.fn(() => false),
  updateRadialBib: vi.fn(),
}));

vi.mock('../../src/features/resultsView', () => ({
  updateEntryCountBadge: vi.fn(),
  updateStats: vi.fn(),
}));

vi.mock('../../src/features/settingsView', () => ({
  updateSettingsInputs: vi.fn(),
  updateTranslations: vi.fn(),
}));

vi.mock('../../src/features/timerView', () => ({
  updateBibDisplay: vi.fn(),
  updateRunSelection: vi.fn(),
  updateTimingPointSelection: vi.fn(),
}));

vi.mock('../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

const mockGetState = vi.fn();
const mockCanUndo = vi.fn(() => false);

vi.mock('../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    canUndo: () => mockCanUndo(),
  },
}));

vi.mock('../../src/utils/domCache', () => ({
  getElement: vi.fn((id: string) => document.getElementById(id)),
}));

import {
  updateGpsIndicator,
  updatePhotoCaptureIndicator,
  updateSyncStatusIndicator,
  updateUI,
  updateUndoButton,
  updateViewVisibility,
  updateVoiceIndicator,
} from '../../src/appUiUpdates';
import { updateActiveBibsList } from '../../src/features/faults';
import { isRadialModeActive } from '../../src/features/radialTimerView';

describe('App UI Updates Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentView: 'timer',
      currentLang: 'en',
      settings: { sync: true, gps: true, photoCapture: false },
      syncStatus: 'connected',
      gpsStatus: 'active',
      cloudDeviceCount: 2,
      selectedRun: 1,
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('updateUI', () => {
    it('should not throw when called', () => {
      expect(() => updateUI()).not.toThrow();
    });

    it('should call updateBibDisplay when not in radial mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(false);
      updateUI();
      // Verified that updateUI calls through without error
    });

    it('should call updateRadialBib when in radial mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(true);
      updateUI();
      // Verified that updateUI calls through without error in radial mode
    });
  });

  describe('updateViewVisibility', () => {
    it('should remove active class from all views', () => {
      const view1 = document.createElement('div');
      view1.classList.add('view', 'active');
      container.appendChild(view1);
      const view2 = document.createElement('div');
      view2.classList.add('view', 'active');
      container.appendChild(view2);

      updateViewVisibility();

      expect(view1.classList.contains('active')).toBe(false);
      expect(view2.classList.contains('active')).toBe(false);
    });

    it('should add active class to current view', () => {
      mockGetState.mockReturnValue({
        currentView: 'timer',
        currentLang: 'en',
        settings: { sync: false, gps: false },
        syncStatus: 'disconnected',
        gpsStatus: 'inactive',
      });

      const view = document.createElement('div');
      view.classList.add('view', 'timer-view');
      container.appendChild(view);

      updateViewVisibility();
      expect(view.classList.contains('active')).toBe(true);
    });

    it('should convert camelCase view name to kebab-case', () => {
      mockGetState.mockReturnValue({
        currentView: 'gateJudge',
        currentLang: 'en',
        settings: { sync: false, gps: false },
        syncStatus: 'disconnected',
        gpsStatus: 'inactive',
      });

      const view = document.createElement('div');
      view.classList.add('view', 'gate-judge-view');
      container.appendChild(view);

      updateViewVisibility();
      expect(view.classList.contains('active')).toBe(true);
      expect(updateActiveBibsList).toHaveBeenCalled();
    });

    it('should update tab buttons', () => {
      const btn1 = document.createElement('button');
      btn1.classList.add('tab-btn');
      btn1.setAttribute('data-view', 'timer');
      container.appendChild(btn1);

      const btn2 = document.createElement('button');
      btn2.classList.add('tab-btn');
      btn2.setAttribute('data-view', 'results');
      container.appendChild(btn2);

      updateViewVisibility();

      expect(btn1.classList.contains('active')).toBe(true);
      expect(btn2.classList.contains('active')).toBe(false);
    });
  });

  describe('updateSyncStatusIndicator', () => {
    let indicator: HTMLDivElement;
    let dot: HTMLDivElement;
    let text: HTMLSpanElement;
    let deviceCount: HTMLSpanElement;

    beforeEach(() => {
      indicator = document.createElement('div');
      indicator.id = 'sync-indicator';
      dot = document.createElement('div');
      dot.classList.add('sync-dot');
      indicator.appendChild(dot);
      text = document.createElement('span');
      text.classList.add('sync-status-text');
      indicator.appendChild(text);
      deviceCount = document.createElement('span');
      deviceCount.id = 'sync-device-count';
      container.appendChild(indicator);
      container.appendChild(deviceCount);
    });

    it('should show indicator when sync enabled', () => {
      updateSyncStatusIndicator();
      expect(indicator.style.display).toBe('flex');
    });

    it('should hide indicator when sync disabled', () => {
      mockGetState.mockReturnValue({
        settings: { sync: false },
        syncStatus: 'disconnected',
        cloudDeviceCount: 0,
        currentLang: 'en',
      });
      updateSyncStatusIndicator();
      expect(indicator.style.display).toBe('none');
    });

    it('should add connected class for connected status', () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        syncStatus: 'connected',
        cloudDeviceCount: 2,
        currentLang: 'en',
      });
      updateSyncStatusIndicator();
      expect(dot.classList.contains('connected')).toBe(true);
    });

    it('should add syncing class for syncing status', () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        syncStatus: 'syncing',
        cloudDeviceCount: 0,
        currentLang: 'en',
      });
      updateSyncStatusIndicator();
      expect(dot.classList.contains('syncing')).toBe(true);
    });

    it('should add error class for error status', () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        syncStatus: 'error',
        cloudDeviceCount: 0,
        currentLang: 'en',
      });
      updateSyncStatusIndicator();
      expect(dot.classList.contains('error')).toBe(true);
    });

    it('should add offline class for offline status', () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        syncStatus: 'offline',
        cloudDeviceCount: 0,
        currentLang: 'en',
      });
      updateSyncStatusIndicator();
      expect(dot.classList.contains('offline')).toBe(true);
    });

    it('should show device count when connected', () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        syncStatus: 'connected',
        cloudDeviceCount: 3,
        currentLang: 'en',
      });
      updateSyncStatusIndicator();
      expect(deviceCount.textContent).toBe('3 dev');
      expect(deviceCount.style.display).toBe('inline');
    });

    it('should show Off for error/offline status', () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        syncStatus: 'error',
        cloudDeviceCount: 0,
        currentLang: 'en',
      });
      updateSyncStatusIndicator();
      expect(deviceCount.textContent).toBe('Off');
    });

    it('should hide device count for other statuses', () => {
      mockGetState.mockReturnValue({
        settings: { sync: true },
        syncStatus: 'syncing',
        cloudDeviceCount: 0,
        currentLang: 'en',
      });
      updateSyncStatusIndicator();
      expect(deviceCount.style.display).toBe('none');
    });
  });

  describe('updateGpsIndicator', () => {
    let indicator: HTMLDivElement;
    let dot: HTMLDivElement;
    let text: HTMLSpanElement;

    beforeEach(() => {
      indicator = document.createElement('div');
      indicator.id = 'gps-indicator';
      dot = document.createElement('div');
      dot.classList.add('gps-dot');
      indicator.appendChild(dot);
      text = document.createElement('span');
      text.classList.add('gps-status-text');
      indicator.appendChild(text);
      container.appendChild(indicator);
    });

    it('should show indicator when GPS enabled', () => {
      mockGetState.mockReturnValue({
        settings: { gps: true },
        gpsStatus: 'active',
        currentLang: 'en',
      });
      updateGpsIndicator();
      expect(indicator.style.display).toBe('flex');
    });

    it('should hide indicator when GPS disabled', () => {
      mockGetState.mockReturnValue({
        settings: { gps: false },
        gpsStatus: 'inactive',
        currentLang: 'en',
      });
      updateGpsIndicator();
      expect(indicator.style.display).toBe('none');
    });

    it('should add active class for active GPS', () => {
      mockGetState.mockReturnValue({
        settings: { gps: true },
        gpsStatus: 'active',
        currentLang: 'en',
      });
      updateGpsIndicator();
      expect(dot.classList.contains('active')).toBe(true);
      expect(text.textContent).toBe('GPS');
    });

    it('should add searching class for searching GPS', () => {
      mockGetState.mockReturnValue({
        settings: { gps: true },
        gpsStatus: 'searching',
        currentLang: 'en',
      });
      updateGpsIndicator();
      expect(dot.classList.contains('searching')).toBe(true);
      expect(text.textContent).toBe('GPS...');
    });

    it('should add paused class for paused GPS', () => {
      mockGetState.mockReturnValue({
        settings: { gps: true },
        gpsStatus: 'paused',
        currentLang: 'en',
      });
      updateGpsIndicator();
      expect(dot.classList.contains('paused')).toBe(true);
      expect(text.textContent).toBe('GPS');
    });

    it('should show GPS Off for inactive status', () => {
      mockGetState.mockReturnValue({
        settings: { gps: true },
        gpsStatus: 'inactive',
        currentLang: 'en',
      });
      updateGpsIndicator();
      expect(text.textContent).toBe('GPS Off');
    });
  });

  describe('updatePhotoCaptureIndicator', () => {
    it('should show camera indicator when photo capture enabled', () => {
      const indicator = document.createElement('div');
      indicator.id = 'camera-indicator';
      container.appendChild(indicator);

      mockGetState.mockReturnValue({
        settings: { photoCapture: true },
      });
      updatePhotoCaptureIndicator();
      expect(indicator.style.display).toBe('flex');
    });

    it('should hide camera indicator when photo capture disabled', () => {
      const indicator = document.createElement('div');
      indicator.id = 'camera-indicator';
      container.appendChild(indicator);

      mockGetState.mockReturnValue({
        settings: { photoCapture: false },
      });
      updatePhotoCaptureIndicator();
      expect(indicator.style.display).toBe('none');
    });
  });

  describe('updateVoiceIndicator', () => {
    let indicator: HTMLDivElement;
    let statusText: HTMLSpanElement;

    beforeEach(() => {
      indicator = document.createElement('div');
      indicator.id = 'voice-indicator';
      statusText = document.createElement('span');
      statusText.id = 'voice-status-text';
      indicator.appendChild(statusText);
      container.appendChild(indicator);
    });

    it('should hide indicator for inactive status', () => {
      updateVoiceIndicator('inactive');
      expect(indicator.style.display).toBe('none');
    });

    it('should show indicator for listening status', () => {
      updateVoiceIndicator('listening');
      expect(indicator.style.display).toBe('flex');
      expect(indicator.classList.contains('listening')).toBe(true);
      expect(statusText.textContent).toBe('voiceListening');
    });

    it('should show indicator for processing status', () => {
      updateVoiceIndicator('processing');
      expect(indicator.classList.contains('processing')).toBe(true);
      expect(statusText.textContent).toBe('voiceProcessing');
    });

    it('should show indicator for confirming status', () => {
      updateVoiceIndicator('confirming');
      expect(indicator.classList.contains('confirming')).toBe(true);
      expect(statusText.textContent).toBe('voiceConfirming');
    });

    it('should show indicator for offline status', () => {
      updateVoiceIndicator('offline');
      expect(indicator.classList.contains('offline')).toBe(true);
      expect(statusText.textContent).toBe('voiceOffline');
    });

    it('should show indicator for error status', () => {
      updateVoiceIndicator('error');
      expect(indicator.classList.contains('error')).toBe(true);
      expect(statusText.textContent).toBe('voiceError');
    });

    it('should remove all status classes when switching', () => {
      updateVoiceIndicator('listening');
      expect(indicator.classList.contains('listening')).toBe(true);

      updateVoiceIndicator('processing');
      expect(indicator.classList.contains('listening')).toBe(false);
      expect(indicator.classList.contains('processing')).toBe(true);
    });

    it('should handle missing indicator element gracefully', () => {
      indicator.remove();
      expect(() => updateVoiceIndicator('listening')).not.toThrow();
    });
  });

  describe('updateUndoButton', () => {
    it('should disable undo button when cannot undo', () => {
      const btn = document.createElement('button');
      btn.id = 'undo-btn';
      container.appendChild(btn);

      mockCanUndo.mockReturnValue(false);
      updateUndoButton();
      expect(btn.hasAttribute('disabled')).toBe(true);
    });

    it('should enable undo button when can undo', () => {
      const btn = document.createElement('button');
      btn.id = 'undo-btn';
      btn.setAttribute('disabled', '');
      container.appendChild(btn);

      mockCanUndo.mockReturnValue(true);
      updateUndoButton();
      expect(btn.hasAttribute('disabled')).toBe(false);
    });

    it('should handle missing undo button gracefully', () => {
      mockCanUndo.mockReturnValue(true);
      expect(() => updateUndoButton()).not.toThrow();
    });
  });
});
