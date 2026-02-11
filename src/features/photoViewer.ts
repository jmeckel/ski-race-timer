/**
 * Photo Viewer Module
 * Handles photo viewing, loading from IndexedDB, and deletion
 */

import { showToast } from '../components';
import { t } from '../i18n/translations';
import { feedbackDelete, photoStorage } from '../services';
import { store } from '../store';
import type { Entry } from '../types';
import {
  formatTime as formatTimeDisplay,
  getPointColor,
  getPointLabel,
} from '../utils/format';
import { logger } from '../utils/logger';
import { isPhotoMarker } from '../utils/photoHelpers';
import { closeModal, openModal } from './modals';

// Module state
let currentPhotoEntryId: string | null = null;
let currentBlobUrl: string | null = null;

/**
 * Open photo viewer modal
 * Loads photo from IndexedDB if stored there
 */
export async function openPhotoViewer(entry: Entry): Promise<void> {
  const modal = document.getElementById('photo-viewer-modal');
  if (!modal || !entry.photo) return;

  currentPhotoEntryId = entry.id;

  const image = document.getElementById(
    'photo-viewer-image',
  ) as HTMLImageElement;
  const bibEl = document.getElementById('photo-viewer-bib');
  const pointEl = document.getElementById('photo-viewer-point');
  const timeEl = document.getElementById('photo-viewer-time');

  const state = store.getState();
  const lang = state.currentLang;

  // Revoke previous blob URL to prevent memory leak
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  // Load photo from IndexedDB or use inline base64
  if (image) {
    // Set descriptive alt text
    const pointLabel = getPointLabel(entry.point, lang);
    image.alt = `${t('photoForBib', lang)} ${entry.bib || '---'} - ${pointLabel}`;

    if (isPhotoMarker(entry.photo)) {
      // Photo stored in IndexedDB - load it
      image.src = ''; // Clear while loading
      const photoData = await photoStorage.getPhoto(entry.id);
      if (photoData) {
        // Use blob URL instead of data URI for better memory management
        const byteChars = atob(photoData);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        currentBlobUrl = URL.createObjectURL(blob);
        image.src = currentBlobUrl;
      } else {
        // Photo not found in IndexedDB
        logger.warn('Photo not found in IndexedDB for entry:', entry.id);
        return;
      }
    } else {
      // Legacy: photo stored inline (backwards compatibility)
      image.src = `data:image/jpeg;base64,${entry.photo}`;
    }
  }

  if (bibEl) bibEl.textContent = entry.bib || '---';
  if (pointEl) {
    pointEl.textContent = getPointLabel(entry.point, lang);
    const pointColor = getPointColor(entry.point);
    pointEl.style.background = pointColor;
    pointEl.style.color = 'var(--background)';
  }
  if (timeEl) {
    const date = new Date(entry.timestamp);
    timeEl.textContent = formatTimeDisplay(date);
  }

  openModal(modal);
}

/**
 * Close photo viewer modal
 */
export function closePhotoViewer(): void {
  // Revoke blob URL to free memory
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  const modal = document.getElementById('photo-viewer-modal');
  closeModal(modal);
  currentPhotoEntryId = null;
}

/**
 * Delete photo from entry
 * Removes from both IndexedDB and entry marker
 */
export async function deletePhoto(): Promise<void> {
  if (!currentPhotoEntryId) return;

  const state = store.getState();
  const entryId = currentPhotoEntryId;

  // Delete from IndexedDB
  await photoStorage.deletePhoto(entryId);

  // Update entry to remove photo marker
  store.updateEntry(entryId, { photo: undefined });

  // Close modal and show toast
  closePhotoViewer();
  showToast(t('photoDeleted', state.currentLang), 'success');
  feedbackDelete();
}

/**
 * Get current photo entry ID (for external access if needed)
 */
export function getCurrentPhotoEntryId(): string | null {
  return currentPhotoEntryId;
}
