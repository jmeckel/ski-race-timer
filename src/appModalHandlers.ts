import { clearToasts, showToast, type ToastAction } from './components';
import { initFaultEditModal, updateInlineFaultsList } from './features/faults';
import {
  closeAllModalsAnimated,
  closeModal,
  openModal,
} from './features/modals';
import { closePhotoViewer, deletePhoto } from './features/photoViewer';
import {
  cleanupPinVerification,
  hasPendingPinVerification,
} from './features/race';
import { t } from './i18n/translations';
import {
  feedbackDelete,
  feedbackUndo,
  photoStorage,
  syncService,
} from './services';
import { deleteFaultFromCloud, syncEntry } from './services/sync';
import { store } from './store';
import type { Entry } from './types';
import {
  clearModalContext,
  getModalContext,
  setModalContext,
} from './utils/modalContext';
import { makeNumericInput } from './utils/validation';

/**
 * Initialize modals
 */
export function initModals(): void {
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeAllModals();
      }
    });
  });

  // Cancel buttons
  document.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener('click', closeAllModals);
  });

  // Confirm delete button
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', handleConfirmDelete);
  }

  // Confirm fault delete button (for inline fault list)
  const confirmFaultDeleteBtn = document.getElementById(
    'confirm-fault-delete-btn',
  );
  if (confirmFaultDeleteBtn) {
    confirmFaultDeleteBtn.addEventListener('click', () => {
      const modal = document.getElementById('fault-delete-modal');
      const faultId = modal
        ? getModalContext<{ faultId: string }>(modal)?.faultId
        : undefined;
      if (faultId) {
        store.markFaultForDeletion(faultId);
        const markedFault = store
          .getState()
          .faultEntries.find((f) => f.id === faultId);
        if (markedFault) {
          deleteFaultFromCloud(markedFault);
        }
        updateInlineFaultsList();
        showToast(t('faultDeleted', store.getState().currentLang), 'success');
      }
      closeModal(modal);
    });
  }

  // Save edit button
  const saveEditBtn = document.getElementById('save-edit-btn');
  if (saveEditBtn) {
    saveEditBtn.addEventListener('click', handleSaveEdit);
  }

  // Edit bib input - numeric only validation
  const editBibInput = document.getElementById(
    'edit-bib-input',
  ) as HTMLInputElement;
  if (editBibInput) {
    makeNumericInput(editBibInput, 3);
  }

  // Edit run selector
  const editRunSelector = document.getElementById('edit-run-selector');
  if (editRunSelector) {
    editRunSelector.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.edit-run-btn');
      if (!btn) return;

      const modal = document.getElementById('edit-modal');
      const run = btn.getAttribute('data-run') || '1';
      if (modal) {
        const ctx = getModalContext<{ entryId: string; entryRun: number }>(
          modal,
        ) || { entryId: '', entryRun: 1 };
        setModalContext(modal, { ...ctx, entryRun: parseInt(run, 10) });
      }

      document.querySelectorAll('.edit-run-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
    });
  }

  // Photo viewer close buttons (X and footer Close)
  const photoViewerCloseBtn = document.getElementById('photo-viewer-close-btn');
  if (photoViewerCloseBtn) {
    photoViewerCloseBtn.addEventListener('click', closePhotoViewer);
  }

  const photoViewerCloseFooterBtn = document.getElementById(
    'photo-viewer-close-footer-btn',
  );
  if (photoViewerCloseFooterBtn) {
    photoViewerCloseFooterBtn.addEventListener('click', closePhotoViewer);
  }

  // Photo viewer delete button
  const photoViewerDeleteBtn = document.getElementById(
    'photo-viewer-delete-btn',
  );
  if (photoViewerDeleteBtn) {
    photoViewerDeleteBtn.addEventListener('click', deletePhoto);
  }

  // Photo viewer modal overlay click to close
  const photoViewerModal = document.getElementById('photo-viewer-modal');
  if (photoViewerModal) {
    photoViewerModal.addEventListener('click', (e) => {
      if (e.target === photoViewerModal) {
        closePhotoViewer();
      }
    });
  }

  // Initialize fault edit modal handlers
  initFaultEditModal();
}

/**
 * Open edit modal
 */
export function openEditModal(entry: Entry): void {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;

  // Store entry context for saving
  const entryRun = entry.run ?? 1;
  setModalContext(modal, { entryId: entry.id, entryRun });

  // Populate fields
  const bibInput = document.getElementById(
    'edit-bib-input',
  ) as HTMLInputElement;
  const statusSelect = document.getElementById(
    'edit-status-select',
  ) as HTMLSelectElement;

  if (bibInput) bibInput.value = entry.bib || '';
  if (statusSelect) statusSelect.value = entry.status;

  // Update run selector buttons
  document.querySelectorAll('.edit-run-btn').forEach((btn) => {
    const isActive = btn.getAttribute('data-run') === String(entryRun);
    btn.classList.toggle('active', isActive);
  });

  openModal(modal);
}

/**
 * Open confirm modal
 */
export function openConfirmModal(
  action: 'delete' | 'deleteSelected' | 'clearAll' | 'undoAdd',
): void {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;

  const lang = store.getState().currentLang;
  const titleEl = modal.querySelector('.modal-title');
  const textEl = modal.querySelector('.modal-text');

  // Merge with any existing context (e.g. entryId from promptDelete)
  const existingCtx = getModalContext<Record<string, unknown>>(modal) || {};
  setModalContext(modal, { ...existingCtx, action });

  if (action === 'clearAll') {
    if (titleEl) titleEl.textContent = t('confirmClearAll', lang);
    if (textEl) textEl.textContent = t('clearAllText', lang);
  } else if (action === 'deleteSelected') {
    const count = store.getState().selectedEntries.size;
    const entryWord = count === 1 ? t('entry', lang) : t('entries', lang);
    if (titleEl) titleEl.textContent = t('confirmDelete', lang);
    if (textEl)
      textEl.textContent = `${count} ${entryWord} ${t('selected', lang)}`;
  } else if (action === 'undoAdd') {
    if (titleEl) titleEl.textContent = t('confirmUndoAdd', lang);
    if (textEl) textEl.textContent = t('confirmUndoAddText', lang);
  } else {
    if (titleEl) titleEl.textContent = t('confirmDelete', lang);
    if (textEl) textEl.textContent = t('confirmDeleteText', lang);
  }

  openModal(modal);
}

/**
 * Prompt delete for single entry
 */
export function promptDelete(entry: Entry): void {
  const modal = document.getElementById('confirm-modal');
  if (modal) {
    setModalContext(modal, { action: 'delete', entryId: entry.id });
  }
  openConfirmModal('delete');
}

/**
 * Handle confirm delete
 */
async function handleConfirmDelete(): Promise<void> {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;

  const ctx = getModalContext<{ action?: string; entryId?: string }>(modal);
  const action = ctx?.action;
  const entryId = ctx?.entryId;
  const state = store.getState();

  if (action === 'clearAll') {
    // Get all entries before clearing to sync deletions
    const entriesToDelete = [...state.entries];
    store.clearAll();

    // Clear all photos from IndexedDB
    await photoStorage.clearAll();

    // Sync deletions to cloud
    if (state.settings.sync && state.raceId) {
      for (const entry of entriesToDelete) {
        syncService.deleteEntryFromCloud(entry.id, entry.deviceId);
      }
    }

    showToast(t('cleared', state.currentLang), 'success');
  } else if (action === 'deleteSelected') {
    const ids = Array.from(state.selectedEntries);

    // Get entries before deleting to sync deletions
    const entriesToDelete = state.entries.filter((e) => ids.includes(e.id));
    store.deleteMultiple(ids);

    // Delete photos from IndexedDB for selected entries
    await photoStorage.deletePhotos(ids);

    // Sync deletions to cloud
    if (state.settings.sync && state.raceId) {
      for (const entry of entriesToDelete) {
        syncService.deleteEntryFromCloud(entry.id, entry.deviceId);
      }
    }

    showToast(t('deleted', state.currentLang), 'success');
  } else if (action === 'undoAdd') {
    // Perform the undo operation
    const result = store.undo();
    feedbackUndo();
    showToast(t('undone', state.currentLang), 'success');

    // Cleanup if it was an ADD_ENTRY (entry was removed)
    if (result && result.type === 'ADD_ENTRY') {
      const entry = result.data as Entry;
      // Delete orphaned photo from IndexedDB
      await photoStorage.deletePhoto(entry.id);
      // Sync undo to cloud
      if (state.settings.sync && state.raceId) {
        syncService.deleteEntryFromCloud(entry.id, entry.deviceId);
      }
    }
    closeAllModals();
    return; // Early return - don't call feedbackDelete
  } else if (entryId) {
    // Get entry before deleting to sync deletion
    const entryToDelete = state.entries.find((e) => e.id === entryId);
    store.deleteEntry(entryId);

    // Delete photo from IndexedDB
    await photoStorage.deletePhoto(entryId);

    // Sync deletion to cloud
    if (state.settings.sync && state.raceId && entryToDelete) {
      syncService.deleteEntryFromCloud(
        entryToDelete.id,
        entryToDelete.deviceId,
      );
    }

    const lang = state.currentLang;
    // Dismiss any previous undo toasts to prevent LIFO mismatch
    // (store.undo() pops the most recent deletion, not a specific one)
    clearToasts();
    const undoAction: ToastAction = {
      label: t('undoAction', lang),
      callback: () => {
        if (store.canUndo()) {
          const result = store.undo();
          feedbackUndo();

          // Re-sync entry to cloud if needed
          if (result && result.type === 'DELETE_ENTRY') {
            const restoredEntry = result.data as Entry;
            syncEntry(restoredEntry).catch(() => {
              // Sync failure handled by queue
            });
          }
        }
      },
    };
    showToast(t('entryDeleted', lang), 'success', 5000, { action: undoAction });
  }

  feedbackDelete();
  closeAllModals();
}

/**
 * Handle save edit
 */
function handleSaveEdit(): void {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;

  const ctx = getModalContext<{ entryId: string; entryRun: number }>(modal);
  const entryId = ctx?.entryId;
  if (!entryId) return;

  const bibInput = document.getElementById(
    'edit-bib-input',
  ) as HTMLInputElement;
  const statusSelect = document.getElementById(
    'edit-status-select',
  ) as HTMLSelectElement;
  const run = ctx?.entryRun ?? 1;

  store.updateEntry(entryId, {
    bib: bibInput?.value.padStart(3, '0') || '',
    status: statusSelect?.value as Entry['status'],
    run,
  });

  showToast(t('saved', store.getState().currentLang), 'success');
  closeAllModals();
}

/**
 * Close all modals with animation
 * Also cleans up any pending PIN verification promises
 */
export function closeAllModals(): void {
  // Check if admin PIN modal is being closed and has a pending resolver
  const adminPinModal = document.getElementById('admin-pin-modal');
  if (
    adminPinModal?.classList.contains('show') &&
    hasPendingPinVerification()
  ) {
    cleanupPinVerification();
    // Clear the input as well
    const pinInput = document.getElementById(
      'admin-pin-verify-input',
    ) as HTMLInputElement;
    if (pinInput) pinInput.value = '';
  }

  // Clear all modal contexts to prevent stale data
  document.querySelectorAll('.modal-overlay').forEach((modal) => {
    clearModalContext(modal as HTMLElement);
  });

  // Use shared modal closing logic
  closeAllModalsAnimated();
}
