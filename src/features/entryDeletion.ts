import { photoStorage, syncService } from '../services';
import { store } from '../store';
import type { Entry } from '../types';

/**
 * Delete entries with full cleanup: store removal, photo deletion, cloud sync.
 * Consolidates the repeated pattern across modal handlers and results view.
 */
export async function deleteEntriesWithCleanup(
  entries: Entry[],
): Promise<void> {
  const state = store.getState();
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

  // Sync deletions to cloud
  if (state.settings.sync && state.raceId) {
    for (const entry of entries) {
      syncService.deleteEntryFromCloud(entry.id, entry.deviceId);
    }
  }
}
