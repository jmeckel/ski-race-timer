/**
 * Entry Sync Module
 * Handles entry cloud operations (fetch, send, delete)
 */

import { t } from '../../i18n/translations';
import { store } from '../../store';
import type { Entry, SyncResponse } from '../../types';
import { fetchWithTimeout } from '../../utils/errors';
import { getPointLabel } from '../../utils/format';
import { logger } from '../../utils/logger';
import { hasFullPhotoData, isPhotoMarker } from '../../utils/photoHelpers';
import { addRecentRace } from '../../utils/recentRaces';
import { isValidEntry } from '../../utils/validation';
import {
  clearAuthToken,
  dispatchAuthExpired,
  getAuthHeaders,
  getTokenExpiryMs,
} from '../auth';
import { photoStorage } from '../photoStorage';
import { API_BASE, FETCH_TIMEOUT, SYNC_BATCH_SIZE } from './types';

/**
 * Classify a sync error into a SyncStatus for the UI
 */
function classifySyncError(error: unknown): 'error' | 'offline' {
  const message = error instanceof Error ? error.message : '';
  const name = error instanceof Error ? error.name : '';

  if (
    name === 'FetchTimeoutError' ||
    message.includes('timed out') ||
    message.includes('500') ||
    message.includes('503')
  ) {
    return 'error';
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'offline';
  }
  return 'error';
}

/**
 * Prepare an entry for sync by resolving photo data from IndexedDB
 */
async function prepareEntryForSync(
  entry: Entry,
  syncPhotos: boolean,
): Promise<Entry> {
  if (syncPhotos && isPhotoMarker(entry.photo)) {
    const photoData = await photoStorage.getPhoto(entry.id);
    return { ...entry, photo: photoData || undefined };
  }
  if (entry.photo) {
    return { ...entry, photo: undefined };
  }
  return { ...entry };
}

/**
 * Callbacks for entry sync operations
 */
export interface EntrySyncCallbacks {
  onPollingAdjust: (success: boolean, hasChanges?: boolean) => void;
  onResetFastPolling: () => void;
  onCleanup: () => void;
  showToast: (
    message: string,
    type?: 'success' | 'warning' | 'error',
    duration?: number,
  ) => void;
  fetchFaults: () => Promise<void>;
}

let callbacks: EntrySyncCallbacks | null = null;
let lastSyncTimestamp = 0;
let activeFetchPromise: Promise<void> | null = null;
let tokenExpiryWarned = false;

/** Warn once when token is within 1 hour of expiry */
const TOKEN_EXPIRY_WARNING_MS = 60 * 60 * 1000; // 1 hour

/**
 * Initialize entry sync with callbacks
 */
export function initializeEntrySync(syncCallbacks: EntrySyncCallbacks): void {
  callbacks = syncCallbacks;
  isCleanedUp = false;
}

/**
 * Get last sync timestamp
 */
export function getLastSyncTimestamp(): number {
  return lastSyncTimestamp;
}

/**
 * Process photos from cloud entries - store in IndexedDB and set marker
 * Only processes photos if syncPhotos setting is enabled
 */
async function processCloudPhotos(entries: Entry[]): Promise<Entry[]> {
  const state = store.getState();
  const processedEntries: Entry[] = [];

  for (const entry of entries) {
    if (hasFullPhotoData(entry.photo)) {
      // Entry has full photo data from cloud
      if (state.settings.syncPhotos) {
        // Skip download if photo is already cached in IndexedDB
        const alreadyCached = await photoStorage.hasPhoto(entry.id);
        if (alreadyCached) {
          // Photo already stored locally — just set the marker, skip the save
          processedEntries.push({ ...entry, photo: 'indexeddb' });
          continue;
        }

        // Save to IndexedDB when photo sync is enabled
        const saved = await photoStorage.savePhoto(entry.id, entry.photo);
        if (saved) {
          // Replace full photo with marker
          processedEntries.push({ ...entry, photo: 'indexeddb' });
        } else {
          // Failed to save - keep entry without photo
          logger.warn('Sync: Photo storage failed for entry:', entry.id);
          processedEntries.push({ ...entry, photo: undefined });
        }
      } else {
        // Photo sync disabled - discard incoming photo data
        processedEntries.push({ ...entry, photo: undefined });
      }
    } else {
      // No photo or already has marker
      processedEntries.push(entry);
    }
  }

  return processedEntries;
}

/**
 * Fetch entries from cloud.
 * Uses request coalescing to prevent overlapping fetches when polling
 * triggers while a previous request is still in flight.
 */
export async function fetchCloudEntries(): Promise<void> {
  if (isCleanedUp) return;
  const state = store.getState();
  if (!state.settings.sync || !state.raceId) return;

  // Coalesce: reuse in-flight request instead of firing a duplicate
  if (activeFetchPromise) return activeFetchPromise;

  activeFetchPromise = fetchCloudEntriesImpl();
  try {
    await activeFetchPromise;
  } finally {
    activeFetchPromise = null;
  }
}

/**
 * Internal implementation of cloud entry fetch
 */
async function fetchCloudEntriesImpl(): Promise<void> {
  const state = store.getState();

  // Proactive token expiry warning (show once when <1 hour remaining)
  if (!tokenExpiryWarned) {
    const msRemaining = getTokenExpiryMs();
    if (msRemaining > 0 && msRemaining < TOKEN_EXPIRY_WARNING_MS) {
      tokenExpiryWarned = true;
      const lang = state.currentLang;
      callbacks?.showToast(t('sessionExpiryWarning', lang), 'warning', 10000);
    }
  }

  // Set syncing status to show activity indicator (re-read to avoid stale snapshot)
  const currentStatus = store.getState().syncStatus;
  if (currentStatus === 'connected' || currentStatus === 'connecting') {
    store.setSyncStatus('syncing');
  }

  try {
    // Include deviceId and deviceName for heartbeat tracking
    const params = new URLSearchParams({
      raceId: state.raceId,
      deviceId: state.deviceId,
      deviceName: state.deviceName,
    });

    // Delta sync: only fetch entries modified since last successful sync
    // On first sync (lastSyncTimestamp === 0), fetch everything
    if (lastSyncTimestamp > 0) {
      params.set('since', String(lastSyncTimestamp));
    }
    const response = await fetchWithTimeout(
      `${API_BASE}?${params}`,
      {
        headers: {
          'Accept-Encoding': 'gzip, deflate',
          ...getAuthHeaders(),
        },
      },
      FETCH_TIMEOUT,
    );

    // Handle authentication errors specially
    if (response.status === 401) {
      let data: Record<string, unknown> = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      if (data.expired) {
        // Token expired - clear and notify user
        clearAuthToken();
        store.setSyncStatus('disconnected');
        dispatchAuthExpired();
        callbacks?.onCleanup();
        return;
      }
      throw new Error(
        `HTTP ${response.status}: ${data.error || 'Unauthorized'}`,
      );
    }

    // Bail out if cleanup occurred while fetch was in flight (e.g., race changed)
    if (isCleanedUp) return;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    let data: SyncResponse;
    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid response format');
    }

    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data structure');
    }

    // Check if race was deleted by admin
    if (data.deleted) {
      window.dispatchEvent(
        new CustomEvent('race-deleted', {
          detail: {
            raceId: state.raceId,
            deletedAt: data.deletedAt,
            message: data.message,
          },
        }),
      );
      callbacks?.onCleanup();
      return;
    }

    // Validate and filter entries - only accept well-formed entries
    const rawEntries = Array.isArray(data.entries) ? data.entries : [];
    const cloudEntries = rawEntries.filter((entry) => {
      if (!isValidEntry(entry)) {
        logger.warn('Skipping invalid entry from cloud:', entry);
        return false;
      }
      return true;
    });
    const deletedIds = Array.isArray(data.deletedIds)
      ? data.deletedIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        )
      : [];

    // Bail out if cleanup occurred or race changed during response parsing
    if (isCleanedUp || store.getState().raceId !== state.raceId) return;

    // Update sync status
    store.setSyncStatus('connected');

    // Update device count
    if (typeof data.deviceCount === 'number') {
      store.setCloudDeviceCount(data.deviceCount);
    }

    // Update highest bib
    if (typeof data.highestBib === 'number') {
      store.setCloudHighestBib(data.highestBib);
    }

    // Track if any changes occurred for adaptive polling
    let hasChanges = false;

    // Remove locally any entries that were deleted from cloud
    if (deletedIds.length > 0) {
      store.removeDeletedCloudEntries(deletedIds);
      hasChanges = true;
    }

    // Merge remote entries (excluding deleted ones)
    if (cloudEntries.length > 0) {
      // Process photos from cloud entries - store in IndexedDB
      const processedEntries = await processCloudPhotos(cloudEntries);

      // Bail out if race changed during photo processing
      if (isCleanedUp || store.getState().raceId !== state.raceId) return;

      const added = store.mergeCloudEntries(processedEntries, deletedIds);
      if (added > 0) {
        hasChanges = true;
        const lang = store.getState().currentLang;
        callbacks?.showToast(
          t('syncedEntriesFromCloud', lang).replace('{count}', String(added)),
        );
      }
    }

    lastSyncTimestamp = data.lastUpdated || Date.now();

    // Track this race as recently synced
    if (state.raceId) {
      addRecentRace(state.raceId, lastSyncTimestamp, cloudEntries.length);
    }

    // Also fetch faults (for gate judge view and results display)
    await callbacks?.fetchFaults();

    callbacks?.onPollingAdjust(true, hasChanges);
  } catch (error) {
    logger.error('Cloud sync fetch error:', error);
    store.setSyncStatus(classifySyncError(error));
    callbacks?.onPollingAdjust(false);
  }
}

/**
 * Delete entry from cloud
 */
export async function deleteEntryFromCloud(
  entryId: string,
  entryDeviceId?: string,
): Promise<boolean> {
  const state = store.getState();
  if (!state.settings.sync || !state.raceId) return false;

  try {
    const response = await fetchWithTimeout(
      `${API_BASE}?raceId=${encodeURIComponent(state.raceId)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          entryId,
          deviceId: entryDeviceId || state.deviceId,
          deviceName: state.deviceName,
        }),
      },
      FETCH_TIMEOUT,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return true;
  } catch (error) {
    logger.error('Cloud sync delete error:', error);
    return false;
  }
}

/**
 * Send entry to cloud
 */
export async function sendEntryToCloud(entry: Entry): Promise<boolean> {
  const state = store.getState();
  if (!state.settings.sync || !state.raceId) return false;

  try {
    // Prepare entry for sync - load photo from IndexedDB if syncPhotos is enabled
    const entryToSync = await prepareEntryForSync(
      entry,
      state.settings.syncPhotos,
    );

    // Re-check raceId after async photo loading — user may have switched races
    const currentRaceId = store.getState().raceId;
    if (!currentRaceId || currentRaceId !== state.raceId) return false;

    const response = await fetchWithTimeout(
      `${API_BASE}?raceId=${encodeURIComponent(currentRaceId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          entry: entryToSync,
          deviceId: state.deviceId,
          deviceName: state.deviceName,
        }),
      },
      FETCH_TIMEOUT,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Parse response to check for flags and warnings
    try {
      const data = await response.json();
      const lang = store.getState().currentLang;

      // Check if race was deleted — server returns 200 with deleted flag
      if (data.deleted) {
        logger.warn('Race was deleted on server, entry not saved:', entry.id);
        callbacks?.showToast(t('raceDeleted', lang), 'error', 5000);
        // Keep entry in sync queue for potential re-association
        return false;
      }

      if (data.photoSkipped) {
        callbacks?.showToast(t('photoTooLarge', lang), 'warning');
      }

      // Check for cross-device duplicate warning
      if (data.crossDeviceDuplicate) {
        const dup = data.crossDeviceDuplicate;
        const pointLabel = getPointLabel(dup.point, lang);
        callbacks?.showToast(
          t('crossDeviceDuplicate', lang)
            .replace('{bib}', dup.bib)
            .replace('{point}', pointLabel)
            .replace('{device}', dup.deviceName),
          'warning',
          5000,
        );
      }

      // Update device count and highest bib from response
      if (typeof data.deviceCount === 'number') {
        store.setCloudDeviceCount(data.deviceCount);
      }
      if (typeof data.highestBib === 'number') {
        store.setCloudHighestBib(data.highestBib);
      }
    } catch (parseError) {
      // Log parse errors but don't fail the overall send operation
      logger.warn('Failed to parse send response body:', parseError);
    }

    // Remove from sync queue on success
    store.removeFromSyncQueue(entry.id);

    // Reset to fast polling when user is actively sending entries
    callbacks?.onResetFastPolling();

    return true;
  } catch (error) {
    logger.error('Cloud sync send error:', error);
    return false;
  }
}

/**
 * Send multiple entries to cloud in a single batch request.
 * Returns a Map of entryId -> success boolean.
 */
export async function sendEntriesToCloudBatch(
  entries: Entry[],
): Promise<Map<string, boolean>> {
  const resultMap = new Map<string, boolean>();
  const state = store.getState();

  if (!state.settings.sync || !state.raceId || entries.length === 0) {
    for (const entry of entries) {
      resultMap.set(entry.id, false);
    }
    return resultMap;
  }

  // Enforce batch size limit
  const batch = entries.slice(0, SYNC_BATCH_SIZE);

  try {
    // Prepare entries for sync - load photos from IndexedDB if needed
    const entriesToSync: Entry[] = [];
    for (const entry of batch) {
      entriesToSync.push(
        await prepareEntryForSync(entry, state.settings.syncPhotos),
      );
    }

    // Re-read state after async photo loading — user may have switched races
    // or device identity may have changed
    const freshState = store.getState();
    if (!freshState.raceId || freshState.raceId !== state.raceId) {
      for (const entry of batch) {
        resultMap.set(entry.id, false);
      }
      return resultMap;
    }

    const response = await fetchWithTimeout(
      `${API_BASE}?raceId=${encodeURIComponent(freshState.raceId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          entries: entriesToSync,
          deviceId: freshState.deviceId,
          deviceName: freshState.deviceName,
        }),
      },
      FETCH_TIMEOUT,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Parse batch response
    const data = await response.json();

    if (Array.isArray(data.results)) {
      for (const result of data.results) {
        resultMap.set(String(result.entryId), result.success === true);
      }
    }

    // Remove successfully synced entries from queue
    for (const entry of batch) {
      if (resultMap.get(entry.id) === true) {
        store.removeFromSyncQueue(entry.id);
      }
    }

    // Update device count and highest bib from response
    if (typeof data.deviceCount === 'number') {
      store.setCloudDeviceCount(data.deviceCount);
    }
    if (typeof data.highestBib === 'number') {
      store.setCloudHighestBib(data.highestBib);
    }

    // Reset to fast polling when user is actively sending entries
    callbacks?.onResetFastPolling();

    return resultMap;
  } catch (error) {
    logger.error('Cloud sync batch send error:', error);
    // On network error, mark all entries as failed
    for (const entry of batch) {
      resultMap.set(entry.id, false);
    }
    return resultMap;
  }
}

/**
 * Push all local entries to cloud
 */
export async function pushLocalEntries(): Promise<void> {
  const state = store.getState();
  if (!state.settings.sync || !state.raceId) return;

  for (const entry of state.entries) {
    // Only push entries from this device
    if (entry.deviceId === state.deviceId && !entry.syncedAt) {
      await sendEntryToCloud(entry);
    }
  }
}

/** Flag to signal that cleanup has occurred, so in-flight fetches bail out */
let isCleanedUp = false;

/**
 * Cleanup module state
 */
export function cleanupEntrySync(): void {
  isCleanedUp = true;
  callbacks = null;
  lastSyncTimestamp = 0;
  activeFetchPromise = null;
  tokenExpiryWarned = false;
}
