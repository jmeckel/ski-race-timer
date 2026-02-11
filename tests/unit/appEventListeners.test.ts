/**
 * Unit Tests for App Event Listeners Module
 * Tests: handleStorageError, handleStorageWarning, handleBeforeUnload,
 *        initVoiceMode, initCustomEventListeners
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies
vi.mock('../../src/appModalHandlers', () => ({
  openConfirmModal: vi.fn(),
  openEditModal: vi.fn(),
  promptDelete: vi.fn(),
}));

vi.mock('../../src/appUiUpdates', () => ({
  updateVoiceIndicator: vi.fn(),
}));

vi.mock('../../src/components', () => ({
  destroyToast: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../src/features/chiefJudgeView', () => ({
  resolvePinVerification: vi.fn(),
}));

vi.mock('../../src/features/faults', () => ({
  openFaultEditModal: vi.fn(),
  openMarkDeletionModal: vi.fn(),
  updateInlineBibSelector: vi.fn(),
  updateInlineFaultsList: vi.fn(),
  updateInlineGateSelector: vi.fn(),
}));

vi.mock('../../src/features/gateJudgeView', () => ({
  handleGateJudgeVoiceIntent: vi.fn(),
}));

vi.mock('../../src/features/race', () => ({
  cleanupPinVerification: vi.fn(),
  handleAuthExpired: vi.fn(),
  handleRaceDeleted: vi.fn(),
  showPhotoSyncWarningModal: vi.fn(() => Promise.resolve()),
  showRaceChangeDialog: vi.fn(() => Promise.resolve('proceed')),
  verifyPinForChiefJudge: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../src/features/radialTimerView', () => ({
  destroyRadialTimerView: vi.fn(),
}));

vi.mock('../../src/features/resultsView', () => ({
  cleanupSearchTimeout: vi.fn(),
}));

vi.mock('../../src/features/ripple', () => ({
  cleanupRippleEffects: vi.fn(),
}));

vi.mock('../../src/features/settingsView', () => ({
  cleanupSettingsTimeouts: vi.fn(),
  resolvePhotoSyncWarning: vi.fn(),
  resolveRaceChangeDialog: vi.fn(),
  updateRoleToggle: vi.fn(),
}));

vi.mock('../../src/features/timerView', () => ({
  destroyClock: vi.fn(),
  handleTimerVoiceIntent: vi.fn(),
}));

vi.mock('../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../src/services', () => ({
  ambientModeService: { cleanup: vi.fn() },
  cameraService: { stop: vi.fn() },
  cleanupFeedback: vi.fn(),
  feedbackWarning: vi.fn(),
  gpsService: { stop: vi.fn() },
  syncService: { cleanup: vi.fn() },
  voiceModeService: {
    isSupported: vi.fn(() => false),
    initialize: vi.fn(() => true),
    onStatusChange: vi.fn(),
    onAction: vi.fn(),
    cleanup: vi.fn(),
  },
  wakeLockService: { disable: vi.fn() },
}));

const mockGetState = vi.fn();

vi.mock('../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
  },
}));

vi.mock('../../src/utils', () => ({
  TOAST_DURATION: { CRITICAL: 10000, ERROR: 7000, WARNING: 5000 },
}));

vi.mock('../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  handleBeforeUnload,
  handleStorageError,
  handleStorageWarning,
  initVoiceMode,
} from '../../src/appEventListeners';
import { showToast } from '../../src/components';
import { cleanupPinVerification } from '../../src/features/race';
import {
  ambientModeService,
  cameraService,
  feedbackWarning,
  gpsService,
  syncService,
  voiceModeService,
  wakeLockService,
} from '../../src/services';

describe('App Event Listeners Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({
      currentLang: 'en',
      deviceRole: 'timer',
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('handleStorageError', () => {
    it('should show quota error toast when storage is full', () => {
      const event = new CustomEvent('storage-error', {
        detail: {
          message: 'QuotaExceededError',
          isQuotaError: true,
          entryCount: 500,
        },
      });

      handleStorageError(event);

      expect(showToast).toHaveBeenCalledWith(
        'storageNearlyFull',
        'error',
        10000,
      );
      expect(feedbackWarning).toHaveBeenCalled();
    });

    it('should show general storage error toast', () => {
      const event = new CustomEvent('storage-error', {
        detail: {
          message: 'Write failed',
          isQuotaError: false,
          entryCount: 100,
        },
      });

      handleStorageError(event);

      expect(showToast).toHaveBeenCalledWith('storageError', 'error', 7000);
      expect(feedbackWarning).toHaveBeenCalled();
    });
  });

  describe('handleStorageWarning', () => {
    it('should show critical warning at 90%+', () => {
      const event = new CustomEvent('storage-warning', {
        detail: {
          usage: 4700000,
          quota: 5242880,
          percent: 90,
          critical: true,
        },
      });

      handleStorageWarning(event);

      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('90%'),
        'error',
        10000,
      );
    });

    it('should show warning at 80%+ only once per session', () => {
      const event = new CustomEvent('storage-warning', {
        detail: {
          usage: 4200000,
          quota: 5242880,
          percent: 80,
          critical: false,
        },
      });

      handleStorageWarning(event);
      expect(showToast).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();
      handleStorageWarning(event);
      expect(showToast).not.toHaveBeenCalled(); // Suppressed for session
    });
  });

  describe('handleBeforeUnload', () => {
    it('should cleanup all services', () => {
      handleBeforeUnload();

      expect(syncService.cleanup).toHaveBeenCalled();
      expect(cameraService.stop).toHaveBeenCalled();
      expect(gpsService.stop).toHaveBeenCalled();
      expect(wakeLockService.disable).toHaveBeenCalled();
      expect(ambientModeService.cleanup).toHaveBeenCalled();
      expect(voiceModeService.cleanup).toHaveBeenCalled();
      expect(cleanupPinVerification).toHaveBeenCalled();
    });
  });

  describe('initVoiceMode', () => {
    it('should skip when not supported', () => {
      vi.mocked(voiceModeService.isSupported).mockReturnValue(false);

      initVoiceMode();

      expect(voiceModeService.initialize).not.toHaveBeenCalled();
    });

    it('should initialize when supported', () => {
      vi.mocked(voiceModeService.isSupported).mockReturnValue(true);

      initVoiceMode();

      expect(voiceModeService.initialize).toHaveBeenCalled();
      expect(voiceModeService.onStatusChange).toHaveBeenCalled();
      expect(voiceModeService.onAction).toHaveBeenCalled();
    });

    it('should warn when initialization fails', () => {
      vi.mocked(voiceModeService.isSupported).mockReturnValue(true);
      vi.mocked(voiceModeService.initialize).mockReturnValue(false);

      initVoiceMode();

      expect(voiceModeService.onStatusChange).not.toHaveBeenCalled();
    });
  });
});
