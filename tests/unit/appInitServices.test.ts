/**
 * Unit Tests for App Init Services Module
 * Tests: initServices, disposePhotoEffect
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (must be before imports) ---

vi.mock('../../src/appEventListeners', () => ({
  handleStorageError: vi.fn(),
  handleStorageWarning: vi.fn(),
  initVoiceMode: vi.fn(),
}));

vi.mock('../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../src/features/race', () => ({
  handleAuthExpired: vi.fn(),
  handleRaceDeleted: vi.fn(),
}));

vi.mock('../../src/features/settingsView', () => ({
  applySettings: vi.fn(),
}));

vi.mock('../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

const mockCameraStop = vi.fn();

vi.mock('../../src/services/camera', () => ({
  cameraService: {
    stop: (...args: unknown[]) => mockCameraStop(...args),
    initialize: vi.fn(() => Promise.resolve()),
  },
}));

const mockAmbientSubscribe = vi.fn();
const mockAmbientCleanup = vi.fn();

vi.mock('../../src/services/ambient', () => ({
  ambientModeService: {
    disable: vi.fn(),
    enable: vi.fn(),
    initialize: vi.fn(),
    cleanup: (...args: unknown[]) => mockAmbientCleanup(...args),
    subscribe: (...args: unknown[]) => mockAmbientSubscribe(...args),
  },
}));

const mockGpsPause = vi.fn();
const mockGpsStart = vi.fn();
const mockResumeAudio = vi.fn();
const mockSyncInitialize = vi.fn();
const mockWakeLockEnable = vi.fn();
const mockWakeLockDisable = vi.fn();

vi.mock('../../src/services', () => ({
  gpsService: {
    pause: (...args: unknown[]) => mockGpsPause(...args),
    start: (...args: unknown[]) => mockGpsStart(...args),
  },
  resumeAudio: (...args: unknown[]) => mockResumeAudio(...args),
  syncService: {
    initialize: (...args: unknown[]) => mockSyncInitialize(...args),
  },
  wakeLockService: {
    enable: (...args: unknown[]) => mockWakeLockEnable(...args),
    disable: (...args: unknown[]) => mockWakeLockDisable(...args),
  },
}));

const mockHasAuthToken = vi.fn(() => true);

vi.mock('../../src/services/sync', () => ({
  hasAuthToken: (...args: unknown[]) => mockHasAuthToken(...args),
}));

import { computed, effect, signal } from '@preact/signals-core';

const mockGetState = vi.fn();
const mockUpdateSettings = vi.fn();

const mockSettingsSignal = signal({ photoCapture: false } as Record<
  string,
  unknown
>);

vi.mock('../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
  },
  $settings: computed(() => mockSettingsSignal.value),
  $settingsPhotoCapture: computed(() => mockSettingsSignal.value.photoCapture),
  effect,
}));

const mockListenerAdd = vi.fn();
const mockListenerRemoveAll = vi.fn();

vi.mock('../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: (...args: unknown[]) => mockListenerAdd(...args),
    removeAll: (...args: unknown[]) => mockListenerRemoveAll(...args),
  })),
}));

const mockApplyViewServices = vi.fn();

vi.mock('../../src/utils/viewServices', () => ({
  applyViewServices: (...args: unknown[]) => mockApplyViewServices(...args),
}));

// --- Imports (after mocks) ---

import {
  handleStorageError,
  handleStorageWarning,
  initVoiceMode,
} from '../../src/appEventListeners';
import { disposePhotoEffect, initServices } from '../../src/appInitServices';
import { showToast } from '../../src/components';
import { handleAuthExpired, handleRaceDeleted } from '../../src/features/race';
import { applySettings } from '../../src/features/settingsView';

// --- Tests ---

describe('App Init Services Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockGetState.mockReturnValue({
      currentView: 'timer',
      currentLang: 'en',
      raceId: 'RACE-2024',
      settings: {
        sync: true,
        gps: true,
        photoCapture: false,
        ambientMode: false,
      },
    });

    // Reset the signal between tests
    mockSettingsSignal.value = { photoCapture: false };
  });

  afterEach(() => {
    // Clean up the photo effect disposer between tests
    disposePhotoEffect();
    vi.useRealTimers();
  });

  describe('photo capture effect lifecycle', () => {
    it('should set up photo capture effect on init', async () => {
      initServices();

      // The effect is created; we can verify by toggling the signal
      // and checking that cameraService.stop is called
      mockSettingsSignal.value = { photoCapture: true };
      // Transition from true -> false should trigger stop
      mockSettingsSignal.value = { photoCapture: false };

      // Dynamic import + .then(): flush async queue with fake timers
      await vi.advanceTimersByTimeAsync(0);

      expect(mockCameraStop).toHaveBeenCalled();
    });

    it('should not call cameraService.stop when photo goes from false to true', async () => {
      mockSettingsSignal.value = { photoCapture: false };
      initServices();

      // false -> true should NOT trigger stop
      mockSettingsSignal.value = { photoCapture: true };
      await new Promise((r) => queueMicrotask(r));

      expect(mockCameraStop).not.toHaveBeenCalled();
    });

    it('should dispose previous photo effect when initServices called again', async () => {
      mockSettingsSignal.value = { photoCapture: false };
      initServices();

      // Call initServices again (re-initialization)
      initServices();

      // Now toggle: only the latest effect should be active
      mockSettingsSignal.value = { photoCapture: true };
      mockSettingsSignal.value = { photoCapture: false };
      await vi.advanceTimersByTimeAsync(0);

      // Should only be called once (from the second effect, not both)
      expect(mockCameraStop).toHaveBeenCalledTimes(1);
    });

    it('should be disposable via disposePhotoEffect', async () => {
      mockSettingsSignal.value = { photoCapture: false };
      initServices();

      disposePhotoEffect();

      // After disposal, toggling should not trigger camera stop
      mockSettingsSignal.value = { photoCapture: true };
      mockSettingsSignal.value = { photoCapture: false };
      await new Promise((r) => queueMicrotask(r));

      expect(mockCameraStop).not.toHaveBeenCalled();
    });

    it('should be safe to call disposePhotoEffect multiple times', () => {
      initServices();

      disposePhotoEffect();
      disposePhotoEffect(); // Should not throw

      expect(mockCameraStop).not.toHaveBeenCalled();
    });
  });

  describe('event handler registration', () => {
    it('should register race-deleted event handler', () => {
      initServices();

      expect(mockListenerAdd).toHaveBeenCalledWith(
        window,
        'race-deleted',
        handleRaceDeleted,
      );
    });

    it('should register auth-expired event handler', () => {
      initServices();

      expect(mockListenerAdd).toHaveBeenCalledWith(
        window,
        'auth-expired',
        handleAuthExpired,
      );
    });

    it('should register storage-error event handler', () => {
      initServices();

      expect(mockListenerAdd).toHaveBeenCalledWith(
        window,
        'storage-error',
        handleStorageError,
      );
    });

    it('should register storage-warning event handler', () => {
      initServices();

      expect(mockListenerAdd).toHaveBeenCalledWith(
        window,
        'storage-warning',
        handleStorageWarning,
      );
    });

    it('should register all four event handlers', () => {
      initServices();

      // Count window event registrations
      const windowCalls = mockListenerAdd.mock.calls.filter(
        (call: unknown[]) => call[0] === window,
      );
      expect(windowCalls.length).toBe(4);
    });
  });

  describe('audio context resume on first interaction', () => {
    it('should register click listener with once option for resumeAudio', () => {
      const addEventSpy = vi.spyOn(document, 'addEventListener');

      initServices();

      // Verify click listener registered with {once: true}
      const clickCall = addEventSpy.mock.calls.find(
        (call) => call[0] === 'click',
      );
      expect(clickCall).toBeDefined();
      expect(clickCall![2]).toEqual({ once: true });

      addEventSpy.mockRestore();
    });

    it('should register touchstart listener with once option for resumeAudio', () => {
      const addEventSpy = vi.spyOn(document, 'addEventListener');

      initServices();

      // Verify touchstart listener registered with {once: true}
      const touchCall = addEventSpy.mock.calls.find(
        (call) => call[0] === 'touchstart',
      );
      expect(touchCall).toBeDefined();
      expect(touchCall![2]).toEqual({ once: true });

      addEventSpy.mockRestore();
    });

    it('should register both click and touchstart for audio resume', () => {
      const addEventSpy = vi.spyOn(document, 'addEventListener');

      initServices();

      const eventNames = addEventSpy.mock.calls.map((call) => call[0]);
      expect(eventNames).toContain('click');
      expect(eventNames).toContain('touchstart');

      addEventSpy.mockRestore();
    });
  });

  describe('wake lock per view', () => {
    it('should enable wake lock when starting on timer view', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        currentView: 'timer',
      });

      initServices();

      expect(mockWakeLockEnable).toHaveBeenCalled();
    });

    it('should not enable wake lock on results view', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        currentView: 'results',
      });

      initServices();

      expect(mockWakeLockEnable).not.toHaveBeenCalled();
    });

    it('should not enable wake lock on settings view', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        currentView: 'settings',
      });

      initServices();

      expect(mockWakeLockEnable).not.toHaveBeenCalled();
    });

    it('should not enable wake lock on gateJudge view', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        currentView: 'gateJudge',
      });

      initServices();

      expect(mockWakeLockEnable).not.toHaveBeenCalled();
    });
  });

  describe('sync auto-start condition matrix', () => {
    it('should start sync when all 3 conditions met: sync enabled + raceId + token', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        raceId: 'RACE-1',
        settings: { ...mockGetState().settings, sync: true },
      });
      mockHasAuthToken.mockReturnValue(true);

      initServices();

      expect(mockSyncInitialize).toHaveBeenCalled();
    });

    it('should not start sync when sync disabled (condition 1 fails)', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        raceId: 'RACE-1',
        settings: { ...mockGetState().settings, sync: false },
      });
      mockHasAuthToken.mockReturnValue(true);

      initServices();

      expect(mockSyncInitialize).not.toHaveBeenCalled();
    });

    it('should not start sync when raceId empty (condition 2 fails)', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        raceId: '',
        settings: { ...mockGetState().settings, sync: true },
      });
      mockHasAuthToken.mockReturnValue(true);

      initServices();

      expect(mockSyncInitialize).not.toHaveBeenCalled();
    });

    it('should disable sync and show toast when no auth token (condition 3 fails)', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        raceId: 'RACE-1',
        settings: { ...mockGetState().settings, sync: true },
      });
      mockHasAuthToken.mockReturnValue(false);

      initServices();

      expect(mockSyncInitialize).not.toHaveBeenCalled();
      expect(mockUpdateSettings).toHaveBeenCalledWith({ sync: false });

      // Toast is shown after 500ms delay
      vi.advanceTimersByTime(500);
      expect(showToast).toHaveBeenCalledWith('syncRequiresPin', 'info', 5000);
    });

    it('should try to uncheck sync toggle DOM element when no auth token', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        raceId: 'RACE-1',
        settings: { ...mockGetState().settings, sync: true },
      });
      mockHasAuthToken.mockReturnValue(false);

      const syncToggle = document.createElement('input');
      syncToggle.type = 'checkbox';
      syncToggle.id = 'sync-toggle';
      syncToggle.checked = true;
      document.body.appendChild(syncToggle);

      initServices();

      expect(syncToggle.checked).toBe(false);

      syncToggle.remove();
    });
  });

  describe('ambient mode subscription', () => {
    it('should subscribe to ambient mode state changes', () => {
      initServices();

      expect(mockAmbientSubscribe).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should add ambient-mode class to body when active', () => {
      initServices();

      const callback = mockAmbientSubscribe.mock.calls[0][0];
      callback({ isActive: true, triggeredBy: 'idle' });

      expect(document.body.classList.contains('ambient-mode')).toBe(true);
      expect(document.body.dataset.ambientTrigger).toBe('idle');
    });

    it('should remove ambient-mode class from body when inactive', () => {
      initServices();

      const callback = mockAmbientSubscribe.mock.calls[0][0];

      // First activate
      callback({ isActive: true, triggeredBy: 'battery' });
      expect(document.body.classList.contains('ambient-mode')).toBe(true);

      // Then deactivate
      callback({ isActive: false, triggeredBy: null });
      expect(document.body.classList.contains('ambient-mode')).toBe(false);
      expect(document.body.dataset.ambientTrigger).toBeUndefined();
    });

    it('should pause GPS when ambient mode activates and GPS is enabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { ...mockGetState().settings, gps: true },
      });

      initServices();

      const callback = mockAmbientSubscribe.mock.calls[0][0];
      callback({ isActive: true, triggeredBy: 'idle' });

      expect(mockGpsPause).toHaveBeenCalled();
    });

    it('should resume GPS when ambient mode deactivates on timer view', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        currentView: 'timer',
        settings: { ...mockGetState().settings, gps: true },
      });

      initServices();

      const callback = mockAmbientSubscribe.mock.calls[0][0];
      callback({ isActive: false, triggeredBy: null });

      expect(mockGpsStart).toHaveBeenCalled();
    });

    it('should not resume GPS when ambient mode deactivates on non-timer view', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        currentView: 'results',
        settings: { ...mockGetState().settings, gps: true },
      });

      initServices();
      mockGpsStart.mockClear(); // Clear calls from initServices itself

      const callback = mockAmbientSubscribe.mock.calls[0][0];
      callback({ isActive: false, triggeredBy: null });

      expect(mockGpsStart).not.toHaveBeenCalled();
    });

    it('should not pause/resume GPS when GPS setting is disabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { ...mockGetState().settings, gps: false },
      });

      initServices();
      mockGpsPause.mockClear();
      mockGpsStart.mockClear();

      const callback = mockAmbientSubscribe.mock.calls[0][0];
      callback({ isActive: true, triggeredBy: 'idle' });

      expect(mockGpsPause).not.toHaveBeenCalled();
      expect(mockGpsStart).not.toHaveBeenCalled();
    });

    it('should delete ambientTrigger dataset when triggeredBy is falsy', () => {
      initServices();

      const callback = mockAmbientSubscribe.mock.calls[0][0];

      // Set a trigger first
      callback({ isActive: true, triggeredBy: 'battery' });
      expect(document.body.dataset.ambientTrigger).toBe('battery');

      // Clear with undefined triggeredBy
      callback({ isActive: false, triggeredBy: undefined });
      expect(document.body.dataset.ambientTrigger).toBeUndefined();
    });
  });

  describe('ambient mode initialization', () => {
    it('should not initialize ambient mode directly (handled by appStateHandlers effect)', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: {
          ...mockGetState().settings,
          sync: false,
          ambientMode: true,
        },
      });

      initServices();

      // Ambient mode init/enable is now reactive via appStateHandlers, not imperative in initServices
      const { ambientModeService } = await import('../../src/services/ambient');
      expect(ambientModeService.initialize).not.toHaveBeenCalled();
    });
  });

  describe('voice mode initialization', () => {
    it('should initialize voice mode', () => {
      initServices();
      expect(initVoiceMode).toHaveBeenCalled();
    });
  });

  describe('settings application', () => {
    it('should call applySettings during init', () => {
      initServices();
      expect(applySettings).toHaveBeenCalled();
    });

    it('should call applyViewServices with current state', () => {
      const state = mockGetState();
      initServices();
      expect(mockApplyViewServices).toHaveBeenCalledWith(state);
    });
  });

  describe('service initialization order', () => {
    it('should call services in correct order without errors blocking others', () => {
      // Ensure all key services are called
      initServices();

      expect(mockApplyViewServices).toHaveBeenCalled();
      expect(applySettings).toHaveBeenCalled();
      expect(mockAmbientSubscribe).toHaveBeenCalled();
      expect(mockWakeLockEnable).toHaveBeenCalled();
    });

    it('should register event listeners before applying settings', () => {
      const callOrder: string[] = [];

      mockListenerAdd.mockImplementation((_target: unknown, event: string) => {
        callOrder.push(`listener:${event}`);
      });

      const origApplySettings = vi.mocked(applySettings);
      origApplySettings.mockImplementation(() => {
        callOrder.push('applySettings');
      });

      initServices();

      const listenerIndex = callOrder.findIndex((c) =>
        c.startsWith('listener:'),
      );
      const settingsIndex = callOrder.indexOf('applySettings');

      expect(listenerIndex).toBeLessThan(settingsIndex);
    });
  });
});
