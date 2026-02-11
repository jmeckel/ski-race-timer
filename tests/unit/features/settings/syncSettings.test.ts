/**
 * Unit Tests for Sync Settings Module
 * Tests: resolvePhotoSyncWarning, resolveRaceChangeDialog,
 *        updateSyncSettingsInputs, updateRaceExistsIndicator,
 *        getLastRaceExistsState, checkRaceExists, selectSettingsRecentRace,
 *        fetchRacesFromApi, showSettingsRecentRacesDropdown,
 *        cleanupSyncSettings
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../../src/services', () => ({
  feedbackTap: vi.fn(),
  feedbackWarning: vi.fn(),
  photoStorage: {
    clearAll: vi.fn(() => Promise.resolve()),
  },
  syncService: {
    initialize: vi.fn(),
    cleanup: vi.fn(),
    checkRaceExists: vi.fn(() =>
      Promise.resolve({ exists: true, entryCount: 5 }),
    ),
  },
}));

vi.mock('../../../../src/services/storage', () => ({
  storage: {
    getRaw: vi.fn(() => 'test-token'),
  },
}));

vi.mock('../../../../src/services/sync', () => ({
  AUTH_TOKEN_KEY: 'skiTimerAuthToken',
  hasAuthToken: vi.fn(() => false),
}));

const mockGetState = vi.fn();

vi.mock('../../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    updateSettings: vi.fn(),
    setRaceId: vi.fn(),
    setRaceExistsInCloud: vi.fn(),
    clearAll: vi.fn(),
    clearFaultEntries: vi.fn(),
    markCurrentRaceAsSynced: vi.fn(),
  },
}));

vi.mock('../../../../src/utils', () => ({
  fetchWithTimeout: vi.fn(),
  getElement: vi.fn(
    (id: string) => document.getElementById(id) as HTMLElement | null,
  ),
}));

vi.mock('../../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/recentRaces', () => ({
  addRecentRace: vi.fn(),
  getTodaysRecentRaces: vi.fn(() => []),
}));

vi.mock('../../../../src/utils/recentRacesUi', () => ({
  attachRecentRaceItemHandlers: vi.fn(),
  renderRecentRaceItems: vi.fn(() => '<div>race items</div>'),
}));

vi.mock('../../../../src/utils/validation', () => ({
  isValidRaceId: vi.fn(() => true),
}));

vi.mock('../../../../src/features/export', () => ({
  exportResults: vi.fn(),
}));

vi.mock('../../../../src/features/race', () => ({
  verifyPinForRaceJoin: vi.fn(() => Promise.resolve(true)),
}));

import {
  checkRaceExists,
  cleanupSyncSettings,
  getLastRaceExistsState,
  initSyncSettings,
  resolvePhotoSyncWarning,
  resolveRaceChangeDialog,
  selectSettingsRecentRace,
  updateRaceExistsIndicator,
  updateSyncSettingsInputs,
} from '../../../../src/features/settings/syncSettings';

describe('Sync Settings Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      raceId: 'RACE-2024',
      lastSyncedRaceId: '',
      entries: [],
      settings: {
        sync: true,
        syncPhotos: false,
      },
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('initSyncSettings', () => {
    it('should not throw when elements missing', () => {
      expect(() => initSyncSettings()).not.toThrow();
    });

    it('should initialize when sync toggle exists', () => {
      const syncToggle = document.createElement('input');
      syncToggle.type = 'checkbox';
      syncToggle.id = 'sync-toggle';
      container.appendChild(syncToggle);

      expect(() => initSyncSettings()).not.toThrow();
    });

    it('should initialize when race ID input exists', () => {
      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'race-id-input';
      container.appendChild(raceIdInput);

      expect(() => initSyncSettings()).not.toThrow();
    });

    it('should initialize when all sync elements exist', () => {
      const syncToggle = document.createElement('input');
      syncToggle.type = 'checkbox';
      syncToggle.id = 'sync-toggle';
      container.appendChild(syncToggle);

      const syncPhotosToggle = document.createElement('input');
      syncPhotosToggle.type = 'checkbox';
      syncPhotosToggle.id = 'sync-photos-toggle';
      container.appendChild(syncPhotosToggle);

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'race-id-input';
      container.appendChild(raceIdInput);

      expect(() => initSyncSettings()).not.toThrow();
    });
  });

  describe('resolvePhotoSyncWarning', () => {
    it('should not throw when no pending resolve', () => {
      expect(() => resolvePhotoSyncWarning()).not.toThrow();
    });
  });

  describe('resolveRaceChangeDialog', () => {
    it('should not throw when no pending resolve', () => {
      expect(() => resolveRaceChangeDialog('cancel')).not.toThrow();
    });
  });

  describe('updateSyncSettingsInputs', () => {
    it('should update sync toggle', () => {
      const syncToggle = document.createElement('input');
      syncToggle.type = 'checkbox';
      syncToggle.id = 'sync-toggle';
      container.appendChild(syncToggle);

      updateSyncSettingsInputs();

      expect(syncToggle.checked).toBe(true);
    });

    it('should update sync photos toggle', () => {
      const syncPhotosToggle = document.createElement('input');
      syncPhotosToggle.type = 'checkbox';
      syncPhotosToggle.id = 'sync-photos-toggle';
      container.appendChild(syncPhotosToggle);

      updateSyncSettingsInputs();

      expect(syncPhotosToggle.checked).toBe(false);
      expect(syncPhotosToggle.disabled).toBe(false); // sync is enabled
    });

    it('should disable sync photos when sync disabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { sync: false, syncPhotos: false },
      });

      const syncPhotosToggle = document.createElement('input');
      syncPhotosToggle.type = 'checkbox';
      syncPhotosToggle.id = 'sync-photos-toggle';
      container.appendChild(syncPhotosToggle);

      updateSyncSettingsInputs();

      expect(syncPhotosToggle.disabled).toBe(true);
    });

    it('should update race ID input', () => {
      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'race-id-input';
      container.appendChild(raceIdInput);

      updateSyncSettingsInputs();

      expect(raceIdInput.value).toBe('RACE-2024');
    });
  });

  describe('updateRaceExistsIndicator', () => {
    it('should hide indicator when exists is null', () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      updateRaceExistsIndicator(null, 0);

      expect(indicator.style.display).toBe('none');
    });

    it('should show found state with entry count', () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      updateRaceExistsIndicator(true, 5);

      expect(indicator.style.display).toBe('inline-flex');
      expect(indicator.classList.contains('found')).toBe(true);
      expect(textEl.textContent).toContain('5');
    });

    it('should show found state with zero entries', () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      updateRaceExistsIndicator(true, 0);

      expect(textEl.textContent).toBe('raceFound');
    });

    it('should show new state', () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      updateRaceExistsIndicator(false, 0);

      expect(indicator.classList.contains('new')).toBe(true);
      expect(textEl.textContent).toBe('raceNew');
    });

    it('should handle missing elements', () => {
      expect(() => updateRaceExistsIndicator(true, 5)).not.toThrow();
    });
  });

  describe('getLastRaceExistsState', () => {
    it('should return default state initially', () => {
      const state = getLastRaceExistsState();
      // After calling updateRaceExistsIndicator, state should be updated
      expect(state).toHaveProperty('exists');
      expect(state).toHaveProperty('entryCount');
    });

    it('should return updated state after indicator update', () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      updateRaceExistsIndicator(true, 10);

      const state = getLastRaceExistsState();
      expect(state.exists).toBe(true);
      expect(state.entryCount).toBe(10);
    });
  });

  describe('checkRaceExists', () => {
    it('should call syncService.checkRaceExists', async () => {
      const { syncService } = await import('../../../../src/services');

      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      await checkRaceExists('test-race');

      expect(syncService.checkRaceExists).toHaveBeenCalledWith('test-race');
    });

    it('should update indicator after check', async () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      await checkRaceExists('test-race');

      // The indicator should be updated with the found state
      expect(indicator.classList.contains('found')).toBe(true);
    });

    it('should update last race exists state', async () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      await checkRaceExists('test-race');

      const state = getLastRaceExistsState();
      expect(state.exists).toBe(true);
      expect(state.entryCount).toBe(5);
    });
  });

  describe('selectSettingsRecentRace', () => {
    it('should fill race ID input and close dropdown', () => {
      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'race-id-input';
      container.appendChild(raceIdInput);

      const dropdown = document.createElement('div');
      dropdown.style.display = 'block';

      selectSettingsRecentRace(
        { raceId: 'test-race', createdAt: Date.now(), lastUpdated: Date.now() },
        dropdown,
      );

      expect(raceIdInput.value).toBe('test-race');
      expect(dropdown.style.display).toBe('none');
    });
  });

  describe('cleanupSyncSettings', () => {
    it('should not throw', () => {
      expect(() => cleanupSyncSettings()).not.toThrow();
    });
  });
});
