/**
 * Unit Tests for App Module
 * Tests: initApp
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).__APP_VERSION__ = '5.21.0';

vi.mock('../../src/appEventListeners', () => ({
  handleBeforeUnload: vi.fn(),
  initCustomEventListeners: vi.fn(),
}));

vi.mock('../../src/appInitServices', () => ({
  initServices: vi.fn(),
}));

vi.mock('../../src/appModalHandlers', () => ({
  initModals: vi.fn(),
}));

vi.mock('../../src/appStateHandlers', () => ({
  handleStateChange: vi.fn(),
}));

vi.mock('../../src/appUiUpdates', () => ({
  updateUI: vi.fn(),
}));

vi.mock('../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../src/features/modals', () => ({
  closeModal: vi.fn(),
  isAnyModalOpen: vi.fn(() => false),
  openModal: vi.fn(),
}));

vi.mock('../../src/features/offlineBanner', () => ({
  initOfflineBanner: vi.fn(),
}));

vi.mock('../../src/features/race', () => ({
  initRaceManagement: vi.fn(),
}));

vi.mock('../../src/features/radialTimerView', () => ({
  initRadialTimerView: vi.fn(),
  isRadialModeActive: vi.fn(() => false),
}));

vi.mock('../../src/features/resultsView', () => ({
  initResultsView: vi.fn(),
}));

vi.mock('../../src/features/ripple', () => ({
  initRippleEffects: vi.fn(),
}));

vi.mock('../../src/features/settingsView', () => ({
  initSettingsView: vi.fn(),
  updateTranslations: vi.fn(),
}));

vi.mock('../../src/features/timerView', () => ({
  initClock: vi.fn(),
  initNumberPad: vi.fn(),
  initRunSelector: vi.fn(),
  initTabs: vi.fn(),
  initTimestampButton: vi.fn(),
  initTimingPoints: vi.fn(),
}));

vi.mock('../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../src/onboarding', () => {
  class MockOnboardingController {
    shouldShow = vi.fn(() => false);
    show = vi.fn();
    reset = vi.fn();
    setUpdateTranslationsCallback = vi.fn();
  }
  return { OnboardingController: MockOnboardingController };
});

vi.mock('../../src/services', () => ({
  feedbackTap: vi.fn(),
}));

const mockGetState = vi.fn();

vi.mock('../../src/store', () => ({
  $deviceRole: { value: 'timer' },
  effect: vi.fn(() => vi.fn()),
  store: {
    getState: () => mockGetState(),
    subscribe: vi.fn(() => vi.fn()),
  },
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

vi.mock('../../src/version', () => ({
  getVersionInfo: vi.fn(() => ({
    name: 'Baklava Falcon',
    description: 'Test description',
  })),
}));

import { initApp } from '../../src/app';
import { initCustomEventListeners } from '../../src/appEventListeners';
import { initServices } from '../../src/appInitServices';
import { initModals } from '../../src/appModalHandlers';
import { updateUI } from '../../src/appUiUpdates';
import { initOfflineBanner } from '../../src/features/offlineBanner';
import { initRaceManagement } from '../../src/features/race';
import { initResultsView } from '../../src/features/resultsView';
import { initRippleEffects } from '../../src/features/ripple';
import { initSettingsView } from '../../src/features/settingsView';
import {
  initClock,
  initNumberPad,
  initRunSelector,
  initTabs,
  initTimestampButton,
  initTimingPoints,
} from '../../src/features/timerView';

describe('App Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      deviceName: 'Timer 1',
      deviceRole: 'timer',
      raceId: 'RACE-2024',
      entries: [],
      settings: { sync: false },
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('initApp', () => {
    it('should initialize all core components', () => {
      initApp();

      expect(initTabs).toHaveBeenCalled();
      expect(initClock).toHaveBeenCalled();
      expect(initNumberPad).toHaveBeenCalled();
      expect(initTimingPoints).toHaveBeenCalled();
      expect(initRunSelector).toHaveBeenCalled();
      expect(initTimestampButton).toHaveBeenCalled();
      expect(initResultsView).toHaveBeenCalled();
      expect(initSettingsView).toHaveBeenCalled();
    });

    it('should initialize cross-cutting concerns', () => {
      initApp();

      expect(initCustomEventListeners).toHaveBeenCalled();
      expect(initModals).toHaveBeenCalled();
      expect(initRaceManagement).toHaveBeenCalled();
      expect(initRippleEffects).toHaveBeenCalled();
      expect(initOfflineBanner).toHaveBeenCalled();
    });

    it('should initialize services', () => {
      initApp();
      expect(initServices).toHaveBeenCalled();
    });

    it('should apply initial UI state', () => {
      initApp();
      expect(updateUI).toHaveBeenCalled();
    });

    it('should set version in UI when element exists', () => {
      const versionEl = document.createElement('span');
      versionEl.id = 'app-version';
      container.appendChild(versionEl);

      const versionNameEl = document.createElement('span');
      versionNameEl.id = 'app-version-name';
      container.appendChild(versionNameEl);

      const versionDescEl = document.createElement('span');
      versionDescEl.id = 'app-version-description';
      container.appendChild(versionDescEl);

      initApp();

      expect(versionEl.textContent).toBe('5.21.0');
      expect(versionNameEl.textContent).toContain('Baklava Falcon');
    });

    it('should use radial timer when radial mode is active', async () => {
      const { isRadialModeActive } = await import(
        '../../src/features/radialTimerView'
      );
      vi.mocked(isRadialModeActive).mockReturnValue(true);

      const { initRadialTimerView } = await import(
        '../../src/features/radialTimerView'
      );

      initApp();

      expect(initRadialTimerView).toHaveBeenCalled();
      expect(initClock).not.toHaveBeenCalled();
    });
  });
});
