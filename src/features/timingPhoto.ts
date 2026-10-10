/**
 * Timing photo attachment — shared by the radial and classic timer views.
 */

import { showToast } from '../components';
import { t } from '../i18n/translations';
import { photoStorage } from '../services';
import { captureTimingPhoto } from '../services/camera';
import { store } from '../store';
import { logWarning } from '../utils';
import { logger } from '../utils/logger';

/**
 * Capture a photo and attach it to an already-recorded entry.
 * Runs in the background (never rejects) so it can't delay the timestamp.
 * Handles entries deleted/undone mid-capture by discarding orphaned photos.
 */
export function attachTimingPhoto(entryId: string): void {
  captureTimingPhoto()
    .then(async (photo) => {
      if (!photo) return;
      try {
        const entryStillExists = store
          .getState()
          .entries.some((e) => e.id === entryId);
        if (!entryStillExists) {
          logger.warn(
            'Entry was deleted before photo could be attached:',
            entryId,
          );
          return;
        }

        const saved = await photoStorage.savePhoto(entryId, photo);
        if (!saved) {
          logger.warn('Photo save failed for entry:', entryId);
          showToast(
            t('photoSaveFailed', store.getState().currentLang),
            'warning',
          );
          return;
        }

        const updated = store.updateEntry(entryId, { photo: 'indexeddb' });
        if (!updated) {
          logger.warn(
            'Entry deleted during photo save, removing orphaned photo:',
            entryId,
          );
          await photoStorage.deletePhoto(entryId);
        }
      } catch (err) {
        logWarning('Camera', 'photo save/update', err, 'photoError');
      }
    })
    .catch((err) => {
      if (err instanceof Error && err.name === 'PhotoTooLargeError') {
        showToast(t('photoTooLarge', store.getState().currentLang), 'warning');
      } else {
        logWarning('Camera', 'captureTimingPhoto', err, 'photoError');
      }
    });
}
