/**
 * Unit Tests for App Init Services Module
 * Tests: initServices
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const mockAmbientSubscribe = vi.fn();

vi.mock('../../src/services', () => ({
  ambientModeService: {
    disable: vi.fn(),
    enable: vi.fn(),
    initialize: vi.fn(),
    subscribe: (...args: unknown[]) => mockAmbientSubscribe(...args),
  },
  gpsService: {
    pause: vi.fn(),
    start: vi.fn(),
  },
  resumeAudio: vi.fn(),
  syncService: {
    initialize: vi.fn(),
  },
  wakeLockService: {
    enable: vi.fn(),
    disable: vi.fn(),
  },
}));

vi.mock('../../src/services/sync', () => ({
  hasAuthToken: vi.fn(() => true),
}));

const mockGetState = vi.fn();
const mockUpdateSettings = vi.fn();

vi.mock('../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
    subscribe: vi.fn(),
  },
}));

vi.mock('../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../src/utils/viewServices', () => ({
  applyViewServices: vi.fn(),
}));

import { initVoiceMode } from '../../src/appEventListeners';
import { initServices } from '../../src/appInitServices';
import { applySettings } from '../../src/features/settingsView';
import {
  ambientModeService,
  syncService,
  wakeLockService,
} from '../../src/services';
import { hasAuthToken } from '../../src/services/sync';
import { applyViewServices } from '../../src/utils/viewServices';

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
        ambientMode: false,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initServices', () => {
    it('should initialize sync when enabled and has auth token', () => {
      initServices();

      expect(syncService.initialize).toHaveBeenCalled();
    });

    it('should disable sync when no auth token', () => {
      vi.mocked(hasAuthToken).mockReturnValue(false);

      initServices();

      expect(syncService.initialize).not.toHaveBeenCalled();
      expect(mockUpdateSettings).toHaveBeenCalledWith({ sync: false });
    });

    it('should show toast when sync disabled due to no token', async () => {
      vi.mocked(hasAuthToken).mockReturnValue(false);

      initServices();
      vi.advanceTimersByTime(500);

      const { showToast } = await import('../../src/components');
      expect(showToast).toHaveBeenCalledWith('syncRequiresPin', 'info', 5000);
    });

    it('should skip sync init when sync is disabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { sync: false, ambientMode: false },
      });

      initServices();

      expect(syncService.initialize).not.toHaveBeenCalled();
    });

    it('should skip sync init when no raceId', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        raceId: '',
      });

      initServices();

      expect(syncService.initialize).not.toHaveBeenCalled();
    });

    it('should apply settings', () => {
      initServices();
      expect(applySettings).toHaveBeenCalled();
    });

    it('should apply view services', () => {
      initServices();
      expect(applyViewServices).toHaveBeenCalled();
    });

    it('should enable wake lock on timer view', () => {
      initServices();
      expect(wakeLockService.enable).toHaveBeenCalled();
    });

    it('should not enable wake lock on non-timer view', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        currentView: 'results',
      });

      initServices();
      expect(wakeLockService.enable).not.toHaveBeenCalled();
    });

    it('should initialize ambient mode when enabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { sync: false, ambientMode: true },
      });

      initServices();

      expect(ambientModeService.initialize).toHaveBeenCalled();
      expect(ambientModeService.enable).toHaveBeenCalled();
    });

    it('should subscribe to ambient mode', () => {
      initServices();
      expect(mockAmbientSubscribe).toHaveBeenCalled();
    });

    it('should initialize voice mode', () => {
      initServices();
      expect(initVoiceMode).toHaveBeenCalled();
    });
  });
});
