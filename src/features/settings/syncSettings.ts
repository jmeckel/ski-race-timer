/**
 * Sync Settings Module
 * Handles sync toggle, sync photos toggle, race ID input, recent races dropdown,
 * race change dialog, and race exists indicator
 */

import { showToast } from '../../components';
import { t } from '../../i18n/translations';
import {
  feedbackTap,
  feedbackWarning,
  photoStorage,
  syncService,
} from '../../services';
import { storage } from '../../services/storage';
import { AUTH_TOKEN_KEY, hasAuthToken } from '../../services/sync';
import { store } from '../../store';
import type { Language, RaceInfo } from '../../types';
import { fetchWithTimeout, getElement } from '../../utils';
import { ListenerManager } from '../../utils/listenerManager';
import { logger } from '../../utils/logger';
import {
  addRecentRace,
  getTodaysRecentRaces,
  type RecentRace,
} from '../../utils/recentRaces';
import {
  attachRecentRaceItemHandlers,
  renderRecentRaceItems,
} from '../../utils/recentRacesUi';
import { isValidRaceId } from '../../utils/validation';
import { exportResults } from '../export';
import { verifyPinForRaceJoin } from '../race';

// Module state
const listeners = new ListenerManager();
let raceCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let raceCheckRequestId = 0;
let lastRaceExistsState: { exists: boolean | null; entryCount: number } = {
  exists: null,
  entryCount: 0,
};

// Promise-based event helpers for async operations
type PhotoSyncWarningResolve = () => void;
type RaceChangeDialogResolve = (
  result: 'export' | 'delete' | 'keep' | 'cancel',
) => void;
let pendingPhotoSyncResolve: PhotoSyncWarningResolve | null = null;
let pendingRaceChangeResolve: RaceChangeDialogResolve | null = null;

/**
 * Request photo sync warning modal via CustomEvent
 * Returns a promise that resolves when the modal is dismissed
 */
async function requestPhotoSyncWarningModal(): Promise<void> {
  return new Promise((resolve) => {
    pendingPhotoSyncResolve = resolve;
    window.dispatchEvent(new CustomEvent('request-photo-sync-warning'));
  });
}

/**
 * Request race change dialog via CustomEvent
 * Returns a promise that resolves with the user's choice
 */
async function requestRaceChangeDialog(
  type: 'synced' | 'unsynced',
  lang: Language,
): Promise<'export' | 'delete' | 'keep' | 'cancel'> {
  return new Promise((resolve) => {
    pendingRaceChangeResolve = resolve;
    window.dispatchEvent(
      new CustomEvent('request-race-change-dialog', {
        detail: { type, lang },
      }),
    );
  });
}

/**
 * Resolve pending photo sync warning (called from app.ts when modal closes)
 */
export function resolvePhotoSyncWarning(): void {
  if (pendingPhotoSyncResolve) {
    pendingPhotoSyncResolve();
    pendingPhotoSyncResolve = null;
  }
}

/**
 * Resolve pending race change dialog (called from app.ts with user's choice)
 */
export function resolveRaceChangeDialog(
  result: 'export' | 'delete' | 'keep' | 'cancel',
): void {
  if (pendingRaceChangeResolve) {
    pendingRaceChangeResolve(result);
    pendingRaceChangeResolve = null;
  }
}

/**
 * Initialize sync-related settings: sync toggle, sync photos toggle,
 * race ID input, and recent races dropdown
 */
export function initSyncSettings(): void {
  // Sync toggle - with guard against concurrent invocations
  const syncToggle = getElement<HTMLInputElement>('sync-toggle');
  let syncTogglePending = false;
  if (syncToggle) {
    listeners.add(syncToggle, 'change', async () => {
      // RACE CONDITION FIX: Guard against concurrent invocations
      if (syncTogglePending) {
        syncToggle.checked = !syncToggle.checked; // Revert toggle
        return;
      }
      syncTogglePending = true;

      try {
        const state = store.getState();

        if (syncToggle.checked && state.raceId) {
          // Require PIN verification when enabling sync with existing race ID
          const pinVerified = await verifyPinForRaceJoin(state.currentLang);
          if (!pinVerified) {
            // PIN verification cancelled or failed - revert toggle
            syncToggle.checked = false;
            return;
          }
        }

        store.updateSettings({ sync: syncToggle.checked });

        // Update sync photos toggle state
        const syncPhotosToggle =
          getElement<HTMLInputElement>('sync-photos-toggle');
        if (syncPhotosToggle) {
          syncPhotosToggle.disabled = !syncToggle.checked;
          if (!syncToggle.checked) {
            // Disable photo sync when main sync is disabled
            syncPhotosToggle.checked = false;
            store.updateSettings({ syncPhotos: false });
          }
        }

        if (syncToggle.checked && state.raceId) {
          syncService.initialize();
        } else {
          syncService.cleanup();
        }
      } finally {
        syncTogglePending = false;
      }
    });
  }

  // Sync photos toggle
  const syncPhotosToggle = getElement<HTMLInputElement>('sync-photos-toggle');
  if (syncPhotosToggle) {
    listeners.add(syncPhotosToggle, 'change', async (e) => {
      const target = e.target as HTMLInputElement;

      if (target.checked) {
        // User is enabling photo sync - show warning modal
        e.preventDefault();
        target.checked = false; // Revert toggle until confirmed
        await requestPhotoSyncWarningModal();
      } else {
        // Disabling photo sync - no confirmation needed
        store.updateSettings({ syncPhotos: false });
      }
    });
  }

  // Race ID input
  const raceIdInput = getElement<HTMLInputElement>('race-id-input');
  let raceIdChangePending = false;
  if (raceIdInput) {
    // Debounced race exists check on input
    listeners.add(raceIdInput, 'input', () => {
      if (raceCheckTimeout) clearTimeout(raceCheckTimeout);
      const raceId = raceIdInput.value.trim();
      if (raceId) {
        raceCheckTimeout = setTimeout(() => checkRaceExists(raceId), 500);
      } else {
        updateRaceExistsIndicator(null, 0);
      }
    });

    listeners.add(raceIdInput, 'change', async () => {
      // RACE CONDITION FIX: Guard against concurrent invocations
      if (raceIdChangePending) {
        return; // Ignore if already processing
      }
      raceIdChangePending = true;

      try {
        const newRaceId = raceIdInput.value.trim();
        const state = store.getState();
        const hasEntries = state.entries.length > 0;
        const wasPreviouslySynced = state.lastSyncedRaceId !== '';
        const isChangingRace = newRaceId !== state.raceId && newRaceId !== '';

        if (hasEntries && isChangingRace) {
          if (wasPreviouslySynced) {
            // Was synced with another race - ask to export or delete
            const action = await requestRaceChangeDialog(
              'synced',
              state.currentLang,
            );
            if (action === 'export') {
              exportResults();
              store.clearAll();
              store.clearFaultEntries();
              await photoStorage.clearAll();
            } else if (action === 'delete') {
              store.clearAll();
              store.clearFaultEntries();
              await photoStorage.clearAll();
            } else {
              // Cancelled - restore old race ID
              raceIdInput.value = state.raceId;
              return;
            }
          } else {
            // Not previously synced - ask to keep or delete
            const action = await requestRaceChangeDialog(
              'unsynced',
              state.currentLang,
            );
            if (action === 'delete') {
              store.clearAll();
              store.clearFaultEntries();
              await photoStorage.clearAll();
            } else if (action === 'cancel') {
              // Cancelled - restore old race ID
              raceIdInput.value = state.raceId;
              return;
            }
            // 'keep' - do nothing with entries
          }
        }

        // Validate race ID format (allow empty to clear)
        if (newRaceId && !isValidRaceId(newRaceId)) {
          showToast(t('invalidRaceId', state.currentLang), 'error');
          raceIdInput.value = state.raceId;
          feedbackWarning();
          return;
        }

        // Verify PIN before joining race if sync is enabled
        if (state.settings.sync && newRaceId) {
          const pinVerified = await verifyPinForRaceJoin(state.currentLang);
          if (!pinVerified) {
            // PIN verification cancelled or failed - restore old race ID
            raceIdInput.value = state.raceId;
            return;
          }
        }

        // Cleanup old sync service before changing race ID (fixes BroadcastChannel leak)
        if (state.settings.sync && state.raceId) {
          syncService.cleanup();
        }

        // Normalize race ID to lowercase (aligns with server-side normalization)
        const normalizedRaceId = newRaceId.toLowerCase();
        raceIdInput.value = normalizedRaceId; // Update UI to show normalized value

        store.setRaceId(normalizedRaceId);
        if (state.settings.sync && normalizedRaceId) {
          syncService.initialize();
          store.markCurrentRaceAsSynced();
        }
      } finally {
        raceIdChangePending = false;
      }
    });
  }

  // Settings recent races button
  const settingsRecentRacesBtn = getElement('settings-recent-races-btn');
  const settingsRecentRacesDropdown = getElement(
    'settings-recent-races-dropdown',
  );
  if (settingsRecentRacesBtn && settingsRecentRacesDropdown) {
    listeners.add(settingsRecentRacesBtn, 'click', () => {
      feedbackTap();
      if (settingsRecentRacesDropdown.style.display === 'none') {
        showSettingsRecentRacesDropdown(settingsRecentRacesDropdown);
        settingsRecentRacesBtn.setAttribute('aria-expanded', 'true');
      } else {
        settingsRecentRacesDropdown.style.display = 'none';
        settingsRecentRacesBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Close dropdown when clicking outside
    listeners.add(document, 'click', (e) => {
      const target = e.target as Node;
      if (
        !settingsRecentRacesBtn.contains(target) &&
        !settingsRecentRacesDropdown.contains(target)
      ) {
        settingsRecentRacesDropdown.style.display = 'none';
        settingsRecentRacesBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

/**
 * Update sync-related settings inputs
 */
export function updateSyncSettingsInputs(): void {
  const state = store.getState();
  const { settings } = state;

  const syncToggle = getElement<HTMLInputElement>('sync-toggle');
  if (syncToggle) syncToggle.checked = settings.sync;

  // Update sync photos toggle (enabled only when sync is enabled)
  const syncPhotosToggle = getElement<HTMLInputElement>('sync-photos-toggle');
  if (syncPhotosToggle) {
    syncPhotosToggle.checked = settings.syncPhotos;
    syncPhotosToggle.disabled = !settings.sync;
  }

  const raceIdInput = getElement<HTMLInputElement>('race-id-input');
  if (raceIdInput) raceIdInput.value = state.raceId;
}

/**
 * Check if race exists in cloud
 * Uses request ID to ignore stale responses from previous requests
 */
export async function checkRaceExists(raceId: string): Promise<void> {
  // Increment request ID to track this request
  const currentRequestId = ++raceCheckRequestId;

  try {
    const result = await syncService.checkRaceExists(raceId);

    // Ignore stale response if a newer request was made while this one was in flight
    if (currentRequestId !== raceCheckRequestId) {
      return;
    }

    store.setRaceExistsInCloud(result.exists);
    updateRaceExistsIndicator(result.exists, result.entryCount);
  } catch (err) {
    // Ignore stale response errors
    if (currentRequestId !== raceCheckRequestId) {
      return;
    }
    // Network error - show unknown state (null) instead of stale data
    logger.warn('Race exists check failed:', err);
    updateRaceExistsIndicator(null, 0);
  }
}

/**
 * Show settings recent races dropdown and populate with today's races
 * Fetches from API if authenticated, falls back to localStorage
 */
export async function showSettingsRecentRacesDropdown(
  dropdown: HTMLElement,
): Promise<void> {
  const lang = store.getState().currentLang;

  // Show loading state
  dropdown.innerHTML = `<div class="recent-races-empty">${t('loading', lang)}</div>`;
  dropdown.style.display = 'block';

  // Try to fetch from API if authenticated
  let races: RecentRace[] = [];

  if (hasAuthToken()) {
    try {
      races = await fetchRacesFromApi();
    } catch (error) {
      logger.warn('Failed to fetch races from API:', error);
      // Fall back to localStorage
      races = getTodaysRecentRaces();
    }
  } else {
    // Not authenticated - use localStorage
    races = getTodaysRecentRaces();
  }

  if (races.length === 0) {
    dropdown.innerHTML = `<div class="recent-races-empty">${t('noRecentRaces', lang)}</div>`;
  } else {
    dropdown.innerHTML = renderRecentRaceItems(races);
    attachRecentRaceItemHandlers(dropdown, races, (race) => {
      selectSettingsRecentRace(race, dropdown);
    });
  }
}

/**
 * Fetch races from the admin API
 * Returns races filtered to today only, formatted as RecentRace
 */
export async function fetchRacesFromApi(): Promise<RecentRace[]> {
  const token = storage.getRaw(AUTH_TOKEN_KEY);
  if (!token) {
    return [];
  }

  const response = await fetchWithTimeout(
    '/api/v1/admin/races',
    {
      headers: { Authorization: `Bearer ${token}` },
    },
    5000,
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const raceInfos: RaceInfo[] = data.races || [];

  // Filter to today's races and convert to RecentRace format
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  const todaysRaces = raceInfos
    .filter((race) => race.lastUpdated && race.lastUpdated >= todayStart)
    .map((race) => ({
      raceId: race.raceId,
      createdAt: race.lastUpdated || Date.now(),
      lastUpdated: race.lastUpdated || Date.now(),
      entryCount: race.entryCount,
    }))
    .slice(0, 5);

  // Also update localStorage with fetched races for future use
  todaysRaces.forEach((race) => {
    addRecentRace(race.raceId, race.lastUpdated, race.entryCount);
  });

  return todaysRaces;
}

/**
 * Select a recent race and fill the settings race ID input
 */
export function selectSettingsRecentRace(
  race: RecentRace,
  dropdown: HTMLElement,
): void {
  const input = getElement<HTMLInputElement>('race-id-input');
  if (input) {
    input.value = race.raceId;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    feedbackTap();
  }
  dropdown.style.display = 'none';
}

/**
 * Update race exists indicator UI
 */
export function updateRaceExistsIndicator(
  exists: boolean | null,
  entryCount: number,
): void {
  // Store state for language updates
  lastRaceExistsState = { exists, entryCount };

  const indicator = getElement('race-exists-indicator');
  const textEl = getElement('race-exists-text');
  const lang = store.getState().currentLang;

  if (!indicator || !textEl) return;

  if (exists === null) {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'inline-flex';
  indicator.classList.remove('found', 'new');

  if (exists) {
    indicator.classList.add('found');
    if (entryCount > 0) {
      const cloudText =
        entryCount === 1 ? t('entryInCloud', lang) : t('entriesInCloud', lang);
      textEl.textContent = `${entryCount} ${cloudText}`;
    } else {
      textEl.textContent = t('raceFound', lang);
    }
  } else {
    indicator.classList.add('new');
    textEl.textContent = t('raceNew', lang);
  }
}

/**
 * Get last race exists state (for language updates)
 */
export function getLastRaceExistsState(): {
  exists: boolean | null;
  entryCount: number;
} {
  return lastRaceExistsState;
}

/**
 * Cleanup sync settings timeouts and listeners
 */
export function cleanupSyncSettings(): void {
  if (raceCheckTimeout) {
    clearTimeout(raceCheckTimeout);
    raceCheckTimeout = null;
  }
  listeners.removeAll();
}
