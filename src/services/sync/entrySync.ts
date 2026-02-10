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
import { addRecentRace } from '../../utils/recentRaces';
import { isValidEntry } from '../../utils/validation';
import { clearAuthToken, dispatchAuthExpired, getAuthHeaders } from '../auth';
import { photoStorage } from '../photoStorage';
import { API_BASE, FETCH_TIMEOUT } from './types';

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

/**
 * Initialize entry sync with callbacks
 */
export function initializeEntrySync(syncCallbacks: EntrySyncCallbacks): void {
  callbacks = syncCallbacks;
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
    if (entry.photo && entry.photo !== 'indexeddb' && entry.photo.length > 20) {
      // Entry has full photo data from cloud
      if (state.settings.syncPhotos) {
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
 * Fetch entries from cloud
 */
export async function fetchCloudEntries(): Promise<void> {
  const state = store.getState();
  if (!state.settings.sync || !state.raceId) return;

  // Set syncing status to show activity indicator
  const previousStatus = state.syncStatus;
  if (previousStatus === 'connected' || previousStatus === 'connecting') {
    store.setSyncStatus('syncing');
  }

  try {
    // Include deviceId and deviceName for heartbeat tracking
    const params = new URLSearchParams({
      raceId: state.raceId,
      deviceId: state.deviceId,
      deviceName: state.deviceName,
    });
    const response = await fetchWithTimeout(
      `${API_BASE}?${params}`,
      {
        headers: getAuthHeaders(),
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

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : '';

    if (
      errorName === 'FetchTimeoutError' ||
      errorMessage.includes('timed out')
    ) {
      store.setSyncStatus('error');
    } else if (errorMessage.includes('500') || errorMessage.includes('503')) {
      store.setSyncStatus('error');
    } else if (
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('NetworkError')
    ) {
      store.setSyncStatus('offline');
    } else {
      store.setSyncStatus('error');
    }

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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
    let entryToSync = { ...entry };
    if (state.settings.syncPhotos && entry.photo === 'indexeddb') {
      const photoData = await photoStorage.getPhoto(entry.id);
      if (photoData) {
        entryToSync = { ...entry, photo: photoData };
      } else {
        // Photo not found in IndexedDB, send without photo
        entryToSync = { ...entry, photo: undefined };
      }
    } else if (entry.photo) {
      // syncPhotos is disabled - strip photo data from sync
      entryToSync = { ...entry, photo: undefined };
    }

    const response = await fetchWithTimeout(
      `${API_BASE}?raceId=${encodeURIComponent(state.raceId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
        // Dispatch event for UI to show more prominent warning
        window.dispatchEvent(
          new CustomEvent('cross-device-duplicate', {
            detail: dup,
          }),
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

/**
 * Cleanup module state
 */
export function cleanupEntrySync(): void {
  callbacks = null;
  lastSyncTimestamp = 0;
}
