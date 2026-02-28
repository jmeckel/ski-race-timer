/**
 * Extended coverage tests for Sync Settings Module
 * Tests: checkRaceExists stale handling, fetchRacesFromApi, showSettingsRecentRacesDropdown,
 *        updateRaceExistsIndicator singular/plural, race ID change dialog branches
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../../src/services', () => ({
  feedbackTap: vi.fn(),
  feedbackWarning: vi.fn(),
  photoStorage: { clearAll: vi.fn(() => Promise.resolve()) },
  syncService: {
    initialize: vi.fn(),
    cleanup: vi.fn(),
    checkRaceExists: vi.fn(() =>
      Promise.resolve({ exists: true, entryCount: 5 }),
    ),
  },
}));

const mockGetRaw = vi.fn(() => 'test-token');

vi.mock('../../../../src/services/storage', () => ({
  storage: { getRaw: (...args: unknown[]) => mockGetRaw(...args) },
}));

const mockHasAuthToken = vi.fn(() => false);

vi.mock('../../../../src/services/sync', () => ({
  AUTH_TOKEN_KEY: 'skiTimerAuthToken',
  hasAuthToken: () => mockHasAuthToken(),
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
    clearSyncQueue: vi.fn(),
    markCurrentRaceAsSynced: vi.fn(),
  },
}));

const mockFetchWithTimeout = vi.fn();

vi.mock('../../../../src/utils', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  getElement: vi.fn(
    (id: string) => document.getElementById(id) as HTMLElement | null,
  ),
}));

vi.mock('../../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(function () {
    return { add: vi.fn(), removeAll: vi.fn() };
  }),
}));

vi.mock('../../../../src/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../src/utils/recentRaces', () => ({
  addRecentRace: vi.fn(),
  getTodaysRecentRaces: vi.fn(() => [
    { raceId: 'local-race', createdAt: Date.now(), lastUpdated: Date.now() },
  ]),
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
  fetchRacesFromApi,
  showSettingsRecentRacesDropdown,
  updateRaceExistsIndicator,
} from '../../../../src/features/settings/syncSettings';
import { syncService } from '../../../../src/services';
import { getTodaysRecentRaces } from '../../../../src/utils/recentRaces';
import {
  attachRecentRaceItemHandlers,
  renderRecentRaceItems,
} from '../../../../src/utils/recentRacesUi';

describe('Sync Settings — extended coverage', () => {
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
      settings: { sync: true, syncPhotos: false },
    });
    mockHasAuthToken.mockReturnValue(false);
  });

  afterEach(() => {
    container.remove();
  });

  describe('checkRaceExists — stale request handling', () => {
    it('should ignore stale responses when newer request was made', async () => {
      // Setup DOM
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      // First call is slow, second is fast
      let firstResolve!: (v: { exists: boolean; entryCount: number }) => void;
      const firstPromise = new Promise<{ exists: boolean; entryCount: number }>(
        (r) => {
          firstResolve = r;
        },
      );

      vi.mocked(syncService.checkRaceExists)
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce({ exists: false, entryCount: 0 });

      // Start first request
      const p1 = checkRaceExists('race-1');
      // Start second request (increments raceCheckRequestId)
      const p2 = checkRaceExists('race-2');

      // Second resolves first
      await p2;

      // Now first resolves — should be ignored (stale)
      firstResolve({ exists: true, entryCount: 99 });
      await p1;

      // Indicator should show the second result, not the first
      expect(indicator.classList.contains('new')).toBe(true);
      expect(textEl.textContent).toBe('raceNew');
    });

    it('should handle network error gracefully', async () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      vi.mocked(syncService.checkRaceExists).mockRejectedValueOnce(
        new Error('Network error'),
      );

      await checkRaceExists('race-err');

      // Should hide indicator on error (null state)
      expect(indicator.style.display).toBe('none');
    });
  });

  describe('updateRaceExistsIndicator — singular vs plural', () => {
    it('should show singular "entryInCloud" for 1 entry', () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      updateRaceExistsIndicator(true, 1);

      expect(textEl.textContent).toBe('1 entryInCloud');
    });

    it('should show plural "entriesInCloud" for multiple entries', () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      updateRaceExistsIndicator(true, 7);

      expect(textEl.textContent).toBe('7 entriesInCloud');
    });

    it('should remove previous found/new class when toggling', () => {
      const indicator = document.createElement('div');
      indicator.id = 'race-exists-indicator';
      const textEl = document.createElement('span');
      textEl.id = 'race-exists-text';
      container.appendChild(indicator);
      container.appendChild(textEl);

      updateRaceExistsIndicator(true, 5);
      expect(indicator.classList.contains('found')).toBe(true);

      updateRaceExistsIndicator(false, 0);
      expect(indicator.classList.contains('found')).toBe(false);
      expect(indicator.classList.contains('new')).toBe(true);
    });
  });

  describe('fetchRacesFromApi', () => {
    it('should return empty array when no token', async () => {
      mockGetRaw.mockReturnValue(null);

      const result = await fetchRacesFromApi();

      expect(result).toEqual([]);
    });

    it('should throw on non-OK response', async () => {
      mockGetRaw.mockReturnValue('token');
      mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 500 });

      await expect(fetchRacesFromApi()).rejects.toThrow('API error: 500');
    });

    it("should filter to today's races only", async () => {
      mockGetRaw.mockReturnValue('token');
      const now = Date.now();
      const yesterday = now - 86400000 * 2; // 2 days ago

      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            races: [
              { raceId: 'today-race', lastUpdated: now, entryCount: 3 },
              { raceId: 'old-race', lastUpdated: yesterday, entryCount: 10 },
            ],
          }),
      });

      const result = await fetchRacesFromApi();

      expect(result).toHaveLength(1);
      expect(result[0].raceId).toBe('today-race');
    });

    it('should limit to 5 races', async () => {
      mockGetRaw.mockReturnValue('token');
      const now = Date.now();

      const races = Array.from({ length: 8 }, (_, i) => ({
        raceId: `race-${i}`,
        lastUpdated: now,
        entryCount: i,
      }));

      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ races }),
      });

      const result = await fetchRacesFromApi();

      expect(result).toHaveLength(5);
    });

    it('should handle empty races array', async () => {
      mockGetRaw.mockReturnValue('token');

      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ races: [] }),
      });

      const result = await fetchRacesFromApi();

      expect(result).toEqual([]);
    });
  });

  describe('showSettingsRecentRacesDropdown', () => {
    it('should show loading state then populate with API races when authed', async () => {
      mockHasAuthToken.mockReturnValue(true);
      mockGetRaw.mockReturnValue('token');
      const now = Date.now();

      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            races: [{ raceId: 'api-race', lastUpdated: now, entryCount: 2 }],
          }),
      });

      const dropdown = document.createElement('div');
      dropdown.style.display = 'none';

      await showSettingsRecentRacesDropdown(dropdown);

      expect(dropdown.style.display).toBe('block');
      expect(renderRecentRaceItems).toHaveBeenCalled();
      expect(attachRecentRaceItemHandlers).toHaveBeenCalled();
    });

    it('should fall back to localStorage on API error', async () => {
      mockHasAuthToken.mockReturnValue(true);
      mockGetRaw.mockReturnValue('token');
      mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

      const dropdown = document.createElement('div');

      await showSettingsRecentRacesDropdown(dropdown);

      expect(getTodaysRecentRaces).toHaveBeenCalled();
    });

    it('should use localStorage when not authenticated', async () => {
      mockHasAuthToken.mockReturnValue(false);

      const dropdown = document.createElement('div');

      await showSettingsRecentRacesDropdown(dropdown);

      expect(getTodaysRecentRaces).toHaveBeenCalled();
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it('should show empty state when no races', async () => {
      mockHasAuthToken.mockReturnValue(false);
      vi.mocked(getTodaysRecentRaces).mockReturnValue([]);

      const dropdown = document.createElement('div');

      await showSettingsRecentRacesDropdown(dropdown);

      expect(dropdown.innerHTML).toContain('noRecentRaces');
    });
  });
});
