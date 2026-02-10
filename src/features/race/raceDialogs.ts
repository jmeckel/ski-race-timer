/**
 * Race Dialogs Module
 * Handles race change dialog, race deleted/auth expired events, and photo sync modal
 */

import { showToast } from '../../components';
import { t } from '../../i18n/translations';
import { feedbackSuccess, feedbackWarning, syncService } from '../../services';
import { store } from '../../store';
import type { Language } from '../../types';
import { formatFileSize } from '../../utils/format';
import { ListenerManager } from '../../utils/listenerManager';
import { logger } from '../../utils/logger';
import { closeModal, openModal } from '../modals';
import { verifyPinForRaceJoin } from './pinManagement';

// Module-level listener manager for lifecycle cleanup
const listeners = new ListenerManager();

/**
 * Show race change dialog
 */
export function showRaceChangeDialog(
  type: 'synced' | 'unsynced',
  lang: Language,
): Promise<'export' | 'delete' | 'keep' | 'cancel'> {
  return new Promise((resolve) => {
    const modal = document.getElementById('race-change-modal');
    if (!modal) {
      resolve('cancel');
      return;
    }

    const title = modal.querySelector('.modal-title') as HTMLElement;
    const text = modal.querySelector('.modal-text') as HTMLElement;
    const exportBtn = document.getElementById('race-change-export-btn');
    const deleteBtn = document.getElementById('race-change-delete-btn');
    const keepBtn = document.getElementById('race-change-keep-btn');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');

    if (type === 'synced') {
      if (title) title.textContent = t('raceChangeTitle', lang);
      if (text) text.textContent = t('raceChangeSyncedText', lang);
      if (exportBtn) exportBtn.style.display = '';
      if (keepBtn) keepBtn.style.display = 'none';
    } else {
      if (title) title.textContent = t('raceChangeTitle', lang);
      if (text) text.textContent = t('raceChangeUnsyncedText', lang);
      if (exportBtn) exportBtn.style.display = 'none';
      if (keepBtn) keepBtn.style.display = '';
    }

    const cleanup = () => {
      closeModal(modal);
      exportBtn?.removeEventListener('click', handleExport);
      deleteBtn?.removeEventListener('click', handleDelete);
      keepBtn?.removeEventListener('click', handleKeep);
      cancelBtn?.removeEventListener('click', handleCancel);
    };

    const handleExport = () => {
      cleanup();
      resolve('export');
    };
    const handleDelete = () => {
      cleanup();
      resolve('delete');
    };
    const handleKeep = () => {
      cleanup();
      resolve('keep');
    };
    const handleCancel = () => {
      cleanup();
      resolve('cancel');
    };

    exportBtn?.addEventListener('click', handleExport);
    deleteBtn?.addEventListener('click', handleDelete);
    keepBtn?.addEventListener('click', handleKeep);
    cancelBtn?.addEventListener('click', handleCancel);

    openModal(modal);
  });
}

/**
 * Handle race deleted event from sync service
 */
export function handleRaceDeleted(
  event: CustomEvent<{ raceId: string; deletedAt: number; message: string }>,
): void {
  const { raceId, message } = event.detail;
  const lang = store.getState().currentLang;

  // Update modal text
  const textEl = document.getElementById('race-deleted-text');
  if (textEl) {
    textEl.textContent = `${t('raceDeletedFor', lang)} "${raceId}". ${message || t('raceDeletedText', lang)}`;
  }

  // Show modal
  const modal = document.getElementById('race-deleted-modal');
  if (modal) {
    openModal(modal);
  }

  // Disable sync and clear race ID
  store.updateSettings({ sync: false });
  store.setRaceId('');

  // Update UI
  const syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
  if (syncToggle) syncToggle.checked = false;

  const raceIdInput = document.getElementById(
    'race-id-input',
  ) as HTMLInputElement;
  if (raceIdInput) raceIdInput.value = '';

  feedbackWarning();
}

/**
 * Handle auth token expired event from sync service
 */
export function handleAuthExpired(
  event: CustomEvent<{ message: string }>,
): void {
  const { message } = event.detail;
  const lang = store.getState().currentLang;

  // Show toast notification about session expiry
  showToast(message || t('sessionExpired', lang), 'warning', 5000);

  // Prompt for PIN re-authentication using existing modal
  verifyPinForRaceJoin(lang)
    .then((verified) => {
      if (verified) {
        // Re-initialize sync after successful authentication
        const state = store.getState();
        if (state.settings.sync && state.raceId) {
          syncService.initialize();
        }
        showToast(t('authSuccess', lang), 'success');
      }
    })
    .catch((err) => logger.error('Re-auth failed:', err));

  feedbackWarning();
}

/**
 * Show photo sync warning modal with statistics
 */
export async function showPhotoSyncWarningModal(): Promise<void> {
  const modal = document.getElementById('photo-sync-modal');
  if (!modal) return;

  const lang = store.getState().currentLang;

  // Show loading state
  const uploadCountEl = document.getElementById('photos-upload-count');
  const downloadCountEl = document.getElementById('photos-download-count');
  const totalSizeEl = document.getElementById('photos-total-size');

  if (uploadCountEl) uploadCountEl.textContent = t('loading', lang);
  if (downloadCountEl) downloadCountEl.textContent = t('loading', lang);
  if (totalSizeEl) totalSizeEl.textContent = t('loading', lang);

  openModal(modal);

  // Get photo sync statistics
  const stats = await syncService.getPhotoSyncStats();

  // Update modal with stats
  if (uploadCountEl) uploadCountEl.textContent = String(stats.uploadCount);
  if (downloadCountEl)
    downloadCountEl.textContent = String(stats.downloadCount);
  if (totalSizeEl) totalSizeEl.textContent = formatFileSize(stats.totalSize);

  // Update confirm button text
  const confirmBtn = document.getElementById('photo-sync-confirm-btn');
  if (confirmBtn) {
    confirmBtn.textContent = t('enableSync', lang);
  }
}

/**
 * Setup photo sync modal event handlers
 */
function setupPhotoSyncModal(): void {
  const modal = document.getElementById('photo-sync-modal');
  const cancelBtn = document.getElementById('photo-sync-cancel-btn');
  const confirmBtn = document.getElementById('photo-sync-confirm-btn');

  if (cancelBtn) {
    listeners.add(cancelBtn, 'click', () => {
      closeModal(modal);
    });
  }

  if (confirmBtn) {
    listeners.add(confirmBtn, 'click', () => {
      // Enable photo sync
      store.updateSettings({ syncPhotos: true });

      // Update toggle
      const syncPhotosToggle = document.getElementById(
        'sync-photos-toggle',
      ) as HTMLInputElement;
      if (syncPhotosToggle) syncPhotosToggle.checked = true;

      // Close modal
      closeModal(modal);

      // Force a sync to start transferring photos
      const state = store.getState();
      if (state.settings.sync && state.raceId) {
        syncService.forceRefresh();
      }

      feedbackSuccess();
    });
  }

  // Close on overlay click
  if (modal) {
    listeners.add(modal, 'click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  }
}

/**
 * Initialize race dialog handlers
 */
export function initRaceDialogs(): void {
  // Race deleted modal OK button
  const raceDeletedOkBtn = document.getElementById('race-deleted-ok-btn');
  if (raceDeletedOkBtn) {
    listeners.add(raceDeletedOkBtn, 'click', () => {
      const modal = document.getElementById('race-deleted-modal');
      closeModal(modal);
    });
  }

  // Photo sync modal setup
  setupPhotoSyncModal();
}
