import { showToast } from '../components';
import { t } from '../i18n/translations';
import { photoStorage, syncService } from '../services';
import { store } from '../store';
import type { Entry } from '../types';
import { logger } from '../utils/logger';

// Space bulk cloud deletes so "clear all" stays under the server's
// 100 writes/min rate limit (~80/min leaves headroom for entry sync)
const CLOUD_DELETE_SPACING_MS = 750;

/**
 * Propagate local deletions to the cloud, sequentially and rate-limit friendly.
 * Never rejects; failures are logged and surfaced once via toast.
 * Stops if sync is turned off or the race changes mid-way, so deletes can never
 * be sent against a different race.
 */
export async function syncDeletionsToCloud(entries: Entry[]): Promise<void> {
  const startState = store.getState();
  if (!startState.settings.sync || !startState.raceId) return;
  const raceId = startState.raceId;

  let failures = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (i > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, CLOUD_DELETE_SPACING_MS),
      );
    }
    const state = store.getState();
    if (!state.settings.sync || state.raceId !== raceId) break;

    const ok = await syncService
      .deleteEntryFromCloud(entry.id, entry.deviceId)
      .catch(() => false);
    if (!ok) failures++;
  }

  if (failures > 0) {
    logger.warn(`Cloud delete failed for ${failures} entries`);
    showToast(t('cloudDeleteFailed', store.getState().currentLang), 'warning');
  }
}

/**
 * Delete entries with full cleanup: store removal, photo deletion, cloud sync.
 * Consolidates the repeated pattern across modal handlers and results view.
 */
export async function deleteEntriesWithCleanup(
  entries: Entry[],
): Promise<void> {
  const ids = entries.map((e) => e.id);

  if (ids.length === 1) {
    store.deleteEntry(ids[0]!);
  } else {
    store.deleteMultiple(ids);
  }

  // Delete photos from IndexedDB
  if (ids.length === 1) {
    await photoStorage.deletePhoto(ids[0]!);
  } else {
    await photoStorage.deletePhotos(ids);
  }

  // Sync deletions to cloud (in background; reads state after the await above)
  void syncDeletionsToCloud(entries);
}
