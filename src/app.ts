import { store } from './store';
import { Clock, VirtualList, showToast, PullToRefresh } from './components';
import { syncService, gpsService, cameraService, captureTimingPhoto } from './services';
import { feedbackSuccess, feedbackWarning, feedbackTap, feedbackDelete, feedbackUndo, resumeAudio } from './services';
import { generateEntryId, getPointLabel } from './utils';
import { t } from './i18n/translations';
import type { Entry, TimingPoint, Language, RaceInfo } from './types';

// Admin API configuration
const ADMIN_API_BASE = '/api/admin/races';
const SERVER_API_PIN = '1977'; // Fixed PIN for API authentication (must match Vercel ADMIN_PIN)

/**
 * Get authorization headers for admin API requests
 * Uses fixed server PIN - separate from user-configurable client PIN
 */
function getAdminAuthHeaders(): HeadersInit {
  return { 'Authorization': `Bearer ${SERVER_API_PIN}` };
}

// DOM Elements cache
let clock: Clock | null = null;
let virtualList: VirtualList | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let pullToRefreshInstance: PullToRefresh | null = null;

/**
 * Initialize the application
 */
export function initApp(): void {
  // Set version in UI
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = __APP_VERSION__;

  // Initialize components
  initClock();
  initTabs();
  initNumberPad();
  initTimingPoints();
  initTimestampButton();
  initResultsView();
  initSettingsView();
  initModals();
  initRaceManagement();

  // Subscribe to state changes
  store.subscribe(handleStateChange);

  // Initialize services based on settings
  const settings = store.getState().settings;
  if (settings.gps) {
    gpsService.start();
  }
  if (settings.sync && store.getState().raceId) {
    syncService.initialize();
  }
  if (settings.photoCapture) {
    cameraService.initialize();
  }

  // Listen for race deleted events from sync service
  window.addEventListener('race-deleted', handleRaceDeleted as EventListener);

  // Listen for storage errors and warnings
  window.addEventListener('storage-error', handleStorageError as EventListener);
  window.addEventListener('storage-warning', handleStorageWarning as EventListener);

  // Resume audio context on first interaction
  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('touchstart', resumeAudio, { once: true });

  // Apply initial state
  applySettings();
  updateUI();

  console.log('Ski Race Timer initialized');
}

/**
 * Initialize clock component
 */
function initClock(): void {
  // Clean up existing clock if re-initializing
  if (clock) {
    clock.destroy();
    clock = null;
  }

  const container = document.getElementById('clock-container');
  if (container) {
    clock = new Clock(container);
    clock.start();
  }
}

/**
 * Initialize tab navigation
 */
function initTabs(): void {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view') as 'timer' | 'results' | 'settings';
      if (view) {
        store.setView(view);
        feedbackTap();
      }
    });
  });
}

/**
 * Initialize number pad
 */
function initNumberPad(): void {
  const numPad = document.getElementById('number-pad');
  if (!numPad) return;

  numPad.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.num-btn');
    if (!btn) return;

    const num = btn.getAttribute('data-num');
    const action = btn.getAttribute('data-action');

    if (num) {
      const state = store.getState();
      if (state.bibInput.length < 3) {
        store.setBibInput(state.bibInput + num);
        feedbackTap();
      }
    } else if (action === 'clear') {
      store.setBibInput('');
      feedbackTap();
    } else if (action === 'delete') {
      const state = store.getState();
      store.setBibInput(state.bibInput.slice(0, -1));
      feedbackTap();
    }
  });
}

/**
 * Initialize timing point selection
 */
function initTimingPoints(): void {
  const container = document.getElementById('timing-points');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.timing-point-btn');
    if (!btn) return;

    const point = btn.getAttribute('data-point') as TimingPoint;
    if (point) {
      store.setSelectedPoint(point);
      feedbackTap();
    }
  });
}

/**
 * Initialize timestamp button
 */
function initTimestampButton(): void {
  const btn = document.getElementById('timestamp-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    await recordTimestamp();
  });

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && store.getState().currentView === 'timer') {
      e.preventDefault();
      recordTimestamp();
    }
  });
}

/**
 * Record a timestamp entry
 */
async function recordTimestamp(): Promise<void> {
  const state = store.getState();

  if (state.isRecording) return;

  // CRITICAL: Capture timestamp IMMEDIATELY before any async operations
  const preciseTimestamp = new Date().toISOString();
  const gpsCoords = gpsService.getCoordinates();

  store.setRecording(true);

  try {
    // Create entry with precise timestamp (captured before photo)
    const entry: Entry = {
      id: generateEntryId(state.deviceId),
      bib: state.bibInput ? state.bibInput.padStart(3, '0') : '',
      point: state.selectedPoint,
      timestamp: preciseTimestamp,
      status: 'ok',
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      gpsCoords
    };

    // Capture photo asynchronously - don't block timestamp recording
    if (state.settings.photoCapture) {
      captureTimingPhoto()
        .then(photo => {
          if (photo) {
            // Update entry with photo after capture completes
            store.updateEntry(entry.id, { photo });
          }
        })
        .catch(err => console.error('Photo capture failed:', err));
    }

    // Check for duplicate (only if bib is entered)
    const isDuplicate = entry.bib && state.entries.some(
      e => e.bib === entry.bib && e.point === entry.point
    );

    // Add entry
    store.addEntry(entry);

    // Show feedback
    if (isDuplicate) {
      feedbackWarning();
      showDuplicateWarning(entry);
    } else {
      feedbackSuccess();
      showConfirmation(entry);
    }

    // Sync to cloud
    syncService.broadcastEntry(entry);

    // Auto-increment bib if enabled and a bib was entered
    if (state.settings.auto && state.bibInput) {
      const localNext = parseInt(state.bibInput, 10) + 1;
      // If sync is enabled, use the max of local next and cloud highest + 1
      const nextBib = state.settings.sync && state.cloudHighestBib > 0
        ? Math.max(localNext, state.cloudHighestBib + 1)
        : localNext;
      store.setBibInput(String(nextBib));
    } else if (!state.bibInput) {
      // Keep empty if no bib was entered
      store.setBibInput('');
    } else {
      // Clear bib if auto-increment is off
      store.setBibInput('');
    }

    // Update last recorded display
    updateLastRecorded(entry);

  } finally {
    store.setRecording(false);
  }
}

/**
 * Show confirmation overlay
 */
function showConfirmation(entry: Entry): void {
  const overlay = document.getElementById('confirmation-overlay');
  if (!overlay) return;

  const bibEl = overlay.querySelector('.confirmation-bib') as HTMLElement | null;
  const pointEl = overlay.querySelector('.confirmation-point') as HTMLElement | null;
  const timeEl = overlay.querySelector('.confirmation-time') as HTMLElement | null;

  if (bibEl) bibEl.textContent = entry.bib || '---';
  if (pointEl) {
    pointEl.textContent = entry.point;
    pointEl.style.color = getPointColor(entry.point);
  }
  if (timeEl) {
    const date = new Date(entry.timestamp);
    timeEl.textContent = formatTimeDisplay(date);
  }

  overlay.classList.add('show');

  setTimeout(() => {
    overlay.classList.remove('show');
  }, 1500);
}

/**
 * Show duplicate warning
 */
function showDuplicateWarning(entry: Entry): void {
  const overlay = document.getElementById('confirmation-overlay');
  if (!overlay) return;

  const warningEl = overlay.querySelector('.confirmation-duplicate') as HTMLElement | null;
  if (warningEl) {
    warningEl.style.display = 'flex';
  }

  showConfirmation(entry);

  setTimeout(() => {
    if (warningEl) warningEl.style.display = 'none';
  }, 2500);
}

/**
 * Update last recorded entry display
 */
function updateLastRecorded(entry: Entry): void {
  const el = document.getElementById('last-recorded');
  if (!el) return;

  const bibEl = el.querySelector('.bib') as HTMLElement | null;
  const pointEl = el.querySelector('.point') as HTMLElement | null;
  const timeEl = el.querySelector('.time') as HTMLElement | null;

  if (bibEl) bibEl.textContent = entry.bib || '---';
  if (pointEl) {
    const state = store.getState();
    pointEl.textContent = getPointLabel(entry.point, state.currentLang);
    pointEl.style.background = `${getPointColor(entry.point)}20`;
    pointEl.style.color = getPointColor(entry.point);
  }
  if (timeEl) {
    const date = new Date(entry.timestamp);
    timeEl.textContent = formatTimeDisplay(date);
  }

  el.classList.add('visible');
}

/**
 * Show race change dialog
 */
function showRaceChangeDialog(type: 'synced' | 'unsynced', lang: Language): Promise<'export' | 'delete' | 'keep' | 'cancel'> {
  console.log('showRaceChangeDialog called:', { type, lang });
  return new Promise((resolve) => {
    const modal = document.getElementById('race-change-modal');
    console.log('Modal element:', modal);
    if (!modal) {
      console.log('Modal not found!');
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
      modal.classList.remove('show');
      exportBtn?.removeEventListener('click', handleExport);
      deleteBtn?.removeEventListener('click', handleDelete);
      keepBtn?.removeEventListener('click', handleKeep);
      cancelBtn?.removeEventListener('click', handleCancel);
    };

    const handleExport = () => { cleanup(); resolve('export'); };
    const handleDelete = () => { cleanup(); resolve('delete'); };
    const handleKeep = () => { cleanup(); resolve('keep'); };
    const handleCancel = () => { cleanup(); resolve('cancel'); };

    exportBtn?.addEventListener('click', handleExport);
    deleteBtn?.addEventListener('click', handleDelete);
    keepBtn?.addEventListener('click', handleKeep);
    cancelBtn?.addEventListener('click', handleCancel);

    console.log('Adding show class to modal');
    modal.classList.add('show');
    console.log('Modal classes after add:', modal.classList.toString());
  });
}

/**
 * Initialize results view
 */
function initResultsView(): void {
  const container = document.getElementById('results-list');
  if (!container) return;

  virtualList = new VirtualList({
    container,
    onItemClick: (entry) => openEditModal(entry),
    onItemDelete: (entry) => promptDelete(entry),
    onItemSelect: (entry, selected) => {
      if (selected) {
        store.toggleEntrySelection(entry.id);
      } else {
        store.toggleEntrySelection(entry.id);
      }
    },
    onViewPhoto: (entry) => openPhotoViewer(entry)
  });

  // Load initial entries
  const state = store.getState();
  virtualList.setEntries(state.entries);
  updateStats();

  // Initialize pull-to-refresh
  const resultsContainer = document.querySelector('.results-view');
  if (resultsContainer) {
    pullToRefreshInstance = new PullToRefresh({
      container: resultsContainer as HTMLElement,
      onRefresh: async () => {
        await syncService.forceRefresh();
        showToast(t('syncReceived', store.getState().currentLang), 'success');
      }
    });
  }

  // Search input with debounce
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  if (searchInput) {
    let searchTimeout: ReturnType<typeof setTimeout>;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        applyFilters();
      }, 300);
    });
  }

  // Filter selects
  const pointFilter = document.getElementById('filter-point') as HTMLSelectElement;
  const statusFilter = document.getElementById('filter-status') as HTMLSelectElement;

  if (pointFilter) {
    pointFilter.addEventListener('change', applyFilters);
  }
  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
  }

  // Action buttons
  initResultsActions();
}

/**
 * Initialize results action buttons
 */
function initResultsActions(): void {
  // Clear All button
  const clearAllBtn = document.getElementById('clear-all-btn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      const state = store.getState();
      if (state.entries.length === 0) {
        showToast(t('noEntries', state.currentLang), 'info');
        return;
      }
      openConfirmModal('clearAll');
    });
  }

  // Undo button
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (store.canUndo()) {
        store.undo();
        feedbackUndo();
        showToast(t('undone', store.getState().currentLang), 'success');
      }
    });
  }

  // Export button
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportResults);
  }

  // Delete selected button
  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
      const state = store.getState();
      if (state.selectedEntries.size > 0) {
        openConfirmModal('deleteSelected');
      }
    });
  }
}

/**
 * Apply current filters to results
 */
function applyFilters(): void {
  if (!virtualList) return;

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const pointFilter = document.getElementById('filter-point') as HTMLSelectElement;
  const statusFilter = document.getElementById('filter-status') as HTMLSelectElement;

  virtualList.applyFilters(
    searchInput?.value || '',
    pointFilter?.value || 'all',
    statusFilter?.value || 'all'
  );

  updateStats();
}

/**
 * Initialize settings view
 */
function initSettingsView(): void {
  // Simple mode toggle
  const simpleModeToggle = document.getElementById('simple-mode-toggle') as HTMLInputElement;
  if (simpleModeToggle) {
    simpleModeToggle.addEventListener('change', () => {
      store.updateSettings({ simple: simpleModeToggle.checked });
      applySettings();
      // Hide admin section in simple mode
      const adminSection = document.getElementById('admin-section');
      if (adminSection) {
        adminSection.style.display = simpleModeToggle.checked ? 'none' : 'block';
      }
    });
  }

  // GPS toggle
  const gpsToggle = document.getElementById('gps-toggle') as HTMLInputElement;
  if (gpsToggle) {
    gpsToggle.addEventListener('change', () => {
      store.updateSettings({ gps: gpsToggle.checked });
      gpsService.toggle(gpsToggle.checked);
    });
  }

  // Sync toggle
  const syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
  if (syncToggle) {
    syncToggle.addEventListener('change', () => {
      store.updateSettings({ sync: syncToggle.checked });
      if (syncToggle.checked && store.getState().raceId) {
        syncService.initialize();
      } else {
        syncService.cleanup();
      }
    });
  }

  // Auto-increment toggle
  const autoToggle = document.getElementById('auto-toggle') as HTMLInputElement;
  if (autoToggle) {
    autoToggle.addEventListener('change', () => {
      store.updateSettings({ auto: autoToggle.checked });
    });
  }

  // Haptic toggle
  const hapticToggle = document.getElementById('haptic-toggle') as HTMLInputElement;
  if (hapticToggle) {
    hapticToggle.addEventListener('change', () => {
      store.updateSettings({ haptic: hapticToggle.checked });
    });
  }

  // Sound toggle
  const soundToggle = document.getElementById('sound-toggle') as HTMLInputElement;
  if (soundToggle) {
    soundToggle.addEventListener('change', () => {
      store.updateSettings({ sound: soundToggle.checked });
    });
  }

  // Photo capture toggle
  const photoToggle = document.getElementById('photo-toggle') as HTMLInputElement;
  if (photoToggle) {
    photoToggle.addEventListener('change', () => {
      store.updateSettings({ photoCapture: photoToggle.checked });
      cameraService.toggle(photoToggle.checked);
    });
  }

  // Language toggle
  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const lang = target.getAttribute('data-lang') as 'de' | 'en';
      if (lang && lang !== store.getState().currentLang) {
        store.setLanguage(lang);
        updateTranslations();
        updateLangToggle();
      }
    });
  }

  // Race ID input
  const raceIdInput = document.getElementById('race-id-input') as HTMLInputElement;
  if (raceIdInput) {
    // Debounced race exists check on input
    let raceCheckTimeout: ReturnType<typeof setTimeout>;
    raceIdInput.addEventListener('input', () => {
      clearTimeout(raceCheckTimeout);
      const raceId = raceIdInput.value.trim();
      if (raceId) {
        raceCheckTimeout = setTimeout(() => checkRaceExists(raceId), 500);
      } else {
        updateRaceExistsIndicator(null, 0);
      }
    });

    raceIdInput.addEventListener('change', async () => {
      const newRaceId = raceIdInput.value.trim();
      const state = store.getState();
      const hasEntries = state.entries.length > 0;
      const wasPreviouslySynced = state.lastSyncedRaceId !== '';
      const isChangingRace = newRaceId !== state.raceId && newRaceId !== '';

      console.log('Race ID change:', { newRaceId, currentRaceId: state.raceId, hasEntries, wasPreviouslySynced, isChangingRace, entriesCount: state.entries.length });

      if (hasEntries && isChangingRace) {
        if (wasPreviouslySynced) {
          // Was synced with another race - ask to export or delete
          const action = await showRaceChangeDialog('synced', state.currentLang);
          if (action === 'export') {
            exportResults();
            store.clearAll();
          } else if (action === 'delete') {
            store.clearAll();
          } else {
            // Cancelled - restore old race ID
            raceIdInput.value = state.raceId;
            return;
          }
        } else {
          // Not previously synced - ask to keep or delete
          const action = await showRaceChangeDialog('unsynced', state.currentLang);
          if (action === 'delete') {
            store.clearAll();
          } else if (action === 'cancel') {
            // Cancelled - restore old race ID
            raceIdInput.value = state.raceId;
            return;
          }
          // 'keep' - do nothing with entries
        }
      }

      store.setRaceId(newRaceId);
      if (state.settings.sync && newRaceId) {
        syncService.initialize();
        store.markCurrentRaceAsSynced();
      }
    });
  }

  // Device name input
  const deviceNameInput = document.getElementById('device-name-input') as HTMLInputElement;
  if (deviceNameInput) {
    deviceNameInput.addEventListener('change', () => {
      store.setDeviceName(deviceNameInput.value.trim());
    });
  }
}

/**
 * Initialize modals
 */
function initModals(): void {
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeAllModals();
      }
    });
  });

  // Cancel buttons
  document.querySelectorAll('[data-action="cancel"]').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  // Confirm delete button
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', handleConfirmDelete);
  }

  // Save edit button
  const saveEditBtn = document.getElementById('save-edit-btn');
  if (saveEditBtn) {
    saveEditBtn.addEventListener('click', handleSaveEdit);
  }

  // Photo viewer close buttons (X and footer Close)
  const photoViewerCloseBtn = document.getElementById('photo-viewer-close-btn');
  if (photoViewerCloseBtn) {
    photoViewerCloseBtn.addEventListener('click', closePhotoViewer);
  }

  const photoViewerCloseFooterBtn = document.getElementById('photo-viewer-close-footer-btn');
  if (photoViewerCloseFooterBtn) {
    photoViewerCloseFooterBtn.addEventListener('click', closePhotoViewer);
  }

  // Photo viewer delete button
  const photoViewerDeleteBtn = document.getElementById('photo-viewer-delete-btn');
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
}

/**
 * Open edit modal
 */
function openEditModal(entry: Entry): void {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;

  // Store entry ID for saving
  modal.setAttribute('data-entry-id', entry.id);

  // Populate fields
  const bibInput = document.getElementById('edit-bib-input') as HTMLInputElement;
  const statusSelect = document.getElementById('edit-status-select') as HTMLSelectElement;

  if (bibInput) bibInput.value = entry.bib || '';
  if (statusSelect) statusSelect.value = entry.status;

  modal.classList.add('show');
}

/**
 * Open confirm modal
 */
function openConfirmModal(action: 'delete' | 'deleteSelected' | 'clearAll'): void {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;

  const lang = store.getState().currentLang;
  const titleEl = modal.querySelector('.modal-title');
  const textEl = modal.querySelector('.modal-text');

  modal.setAttribute('data-action', action);

  if (action === 'clearAll') {
    if (titleEl) titleEl.textContent = t('confirmClearAll', lang);
    if (textEl) textEl.textContent = t('clearAllText', lang);
  } else if (action === 'deleteSelected') {
    const count = store.getState().selectedEntries.size;
    if (titleEl) titleEl.textContent = t('confirmDelete', lang);
    if (textEl) textEl.textContent = `${count} ${t('entries', lang)} ${t('selected', lang)}`;
  } else {
    if (titleEl) titleEl.textContent = t('confirmDelete', lang);
    if (textEl) textEl.textContent = t('confirmDeleteText', lang);
  }

  modal.classList.add('show');
}

/**
 * Prompt delete for single entry
 */
function promptDelete(entry: Entry): void {
  const modal = document.getElementById('confirm-modal');
  if (modal) {
    modal.setAttribute('data-entry-id', entry.id);
  }
  openConfirmModal('delete');
}

/**
 * Handle confirm delete
 */
function handleConfirmDelete(): void {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;

  const action = modal.getAttribute('data-action');
  const entryId = modal.getAttribute('data-entry-id');

  if (action === 'clearAll') {
    store.clearAll();
    showToast(t('cleared', store.getState().currentLang), 'success');
  } else if (action === 'deleteSelected') {
    const ids = Array.from(store.getState().selectedEntries);
    store.deleteMultiple(ids);
    showToast(t('deleted', store.getState().currentLang), 'success');
  } else if (entryId) {
    store.deleteEntry(entryId);
    showToast(t('deleted', store.getState().currentLang), 'success');
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

  const entryId = modal.getAttribute('data-entry-id');
  if (!entryId) return;

  const bibInput = document.getElementById('edit-bib-input') as HTMLInputElement;
  const statusSelect = document.getElementById('edit-status-select') as HTMLSelectElement;

  store.updateEntry(entryId, {
    bib: bibInput?.value.padStart(3, '0') || '',
    status: statusSelect?.value as Entry['status']
  });

  showToast(t('saved', store.getState().currentLang), 'success');
  closeAllModals();
}

/**
 * Close all modals
 */
function closeAllModals(): void {
  document.querySelectorAll('.modal-overlay.show').forEach(modal => {
    modal.classList.remove('show');
  });
}

// Track current entry being viewed in photo viewer
let currentPhotoEntryId: string | null = null;

/**
 * Open photo viewer modal
 */
function openPhotoViewer(entry: Entry): void {
  const modal = document.getElementById('photo-viewer-modal');
  if (!modal || !entry.photo) return;

  currentPhotoEntryId = entry.id;

  const image = document.getElementById('photo-viewer-image') as HTMLImageElement;
  const bibEl = document.getElementById('photo-viewer-bib');
  const pointEl = document.getElementById('photo-viewer-point');
  const timeEl = document.getElementById('photo-viewer-time');

  if (image) image.src = `data:image/jpeg;base64,${entry.photo}`;
  if (bibEl) bibEl.textContent = entry.bib || '---';
  if (pointEl) {
    pointEl.textContent = entry.point;
    const pointColor = getPointColor(entry.point);
    pointEl.style.background = pointColor;
    pointEl.style.color = 'var(--background)';
  }
  if (timeEl) {
    const date = new Date(entry.timestamp);
    timeEl.textContent = formatTimeDisplay(date);
  }

  modal.classList.add('show');
}

/**
 * Close photo viewer modal
 */
function closePhotoViewer(): void {
  const modal = document.getElementById('photo-viewer-modal');
  if (modal) {
    modal.classList.remove('show');
  }
  currentPhotoEntryId = null;
}

/**
 * Delete photo from entry
 */
function deletePhoto(): void {
  if (!currentPhotoEntryId) return;

  const state = store.getState();

  // Update entry to remove photo
  store.updateEntry(currentPhotoEntryId, { photo: undefined });

  // Close modal and show toast
  closePhotoViewer();
  showToast(t('photoDeleted', state.currentLang), 'success');
  feedbackDelete();
}

/**
 * Export results
 */
function exportResults(): void {
  const state = store.getState();
  if (state.entries.length === 0) {
    showToast(t('noEntries', state.currentLang), 'info');
    return;
  }

  // Create CSV content (Race Horology format)
  const headers = ['Startnummer', 'Messpunkt', 'Zeit', 'Status', 'Gerät'];
  const rows = state.entries.map(entry => [
    entry.bib,
    entry.point,
    entry.timestamp,
    entry.status.toUpperCase(),
    entry.deviceName || ''
  ]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.join(';'))
  ].join('\n');

  // Download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `race-horology-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  showToast(t('exported', state.currentLang), 'success');
}

/**
 * Handle state changes
 */
function handleStateChange(state: ReturnType<typeof store.getState>, changedKeys: (keyof typeof state)[]): void {
  // Update view visibility
  if (changedKeys.includes('currentView')) {
    updateViewVisibility();
  }

  // Update bib display
  if (changedKeys.includes('bibInput')) {
    updateBibDisplay();
  }

  // Update timing points
  if (changedKeys.includes('selectedPoint')) {
    updateTimingPointSelection();
  }

  // Update results list
  if (changedKeys.includes('entries')) {
    if (virtualList) {
      virtualList.setEntries(state.entries);
    }
    updateStats();
    updateEntryCountBadge();
  }

  // Update sync status
  if (changedKeys.includes('syncStatus') || changedKeys.includes('settings') || changedKeys.includes('cloudDeviceCount')) {
    updateSyncStatusIndicator();
  }

  // Update GPS status
  if (changedKeys.includes('gpsStatus') || changedKeys.includes('settings')) {
    updateGpsIndicator();
  }

  // Update photo capture indicator on timestamp button
  if (changedKeys.includes('settings')) {
    updatePhotoCaptureIndicator();
  }

  // Update undo button
  if (changedKeys.includes('undoStack')) {
    updateUndoButton();
  }
}

/**
 * Update UI elements
 */
function updateUI(): void {
  updateViewVisibility();
  updateBibDisplay();
  updateTimingPointSelection();
  updateStats();
  updateEntryCountBadge();
  updateSyncStatusIndicator();
  updateGpsIndicator();
  updatePhotoCaptureIndicator();
  updateUndoButton();
  updateSettingsInputs();
  updateTranslations();
}

/**
 * Update view visibility
 */
function updateViewVisibility(): void {
  const state = store.getState();
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });

  const activeView = document.querySelector(`.${state.currentView}-view`);
  if (activeView) {
    activeView.classList.add('active');
  }

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === state.currentView);
  });
}

/**
 * Update bib display
 */
function updateBibDisplay(): void {
  const state = store.getState();
  const bibValue = document.querySelector('.bib-value');
  if (bibValue) {
    bibValue.textContent = state.bibInput ? state.bibInput.padStart(3, '0') : '---';
  }

  // Update timestamp button pulse
  const timestampBtn = document.getElementById('timestamp-btn');
  if (timestampBtn) {
    timestampBtn.classList.toggle('ready', state.bibInput.length > 0);
  }
}

/**
 * Update timing point selection
 */
function updateTimingPointSelection(): void {
  const state = store.getState();
  document.querySelectorAll('.timing-point-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-point') === state.selectedPoint);
  });
}

/**
 * Update statistics
 */
function updateStats(): void {
  const state = store.getState();
  const entries = state.entries;

  const total = entries.length;
  const racers = new Set(entries.map(e => e.bib)).size;
  const finished = entries.filter(e => e.point === 'F' && e.status === 'ok').length;

  const totalEl = document.getElementById('stat-total');
  const racersEl = document.getElementById('stat-racers');
  const finishedEl = document.getElementById('stat-finished');

  if (totalEl) totalEl.textContent = String(total);
  if (racersEl) racersEl.textContent = String(racers);
  if (finishedEl) finishedEl.textContent = String(finished);
}

/**
 * Update entry count badge
 */
function updateEntryCountBadge(): void {
  const badge = document.getElementById('entry-count-badge');
  if (badge) {
    const count = store.getState().entries.length;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
}

/**
 * Update sync status indicator
 */
function updateSyncStatusIndicator(): void {
  const state = store.getState();
  const indicator = document.getElementById('sync-indicator');
  const dot = document.querySelector('.sync-dot');
  const text = document.querySelector('.sync-status-text');
  const deviceCountEl = document.getElementById('sync-device-count');

  // Show indicator when sync is enabled
  if (indicator) {
    indicator.style.display = state.settings.sync ? 'flex' : 'none';
  }

  if (dot) {
    dot.classList.remove('connected', 'error', 'offline');
    if (state.syncStatus === 'connected') {
      dot.classList.add('connected');
    } else if (state.syncStatus === 'error') {
      dot.classList.add('error');
    } else if (state.syncStatus === 'offline') {
      dot.classList.add('offline');
    }
  }

  if (text) {
    text.textContent = t(state.syncStatus, state.currentLang);
  }

  // Show device count when connected
  if (deviceCountEl) {
    if (state.syncStatus === 'connected' && state.cloudDeviceCount > 0) {
      deviceCountEl.textContent = `(${state.cloudDeviceCount})`;
      deviceCountEl.style.display = 'inline';
    } else {
      deviceCountEl.style.display = 'none';
    }
  }
}

/**
 * Update GPS indicator
 */
function updateGpsIndicator(): void {
  const state = store.getState();
  const indicator = document.getElementById('gps-indicator');
  const dot = document.querySelector('.gps-dot');
  const text = document.querySelector('.gps-status-text');

  // Show indicator when GPS is enabled
  if (indicator) {
    indicator.style.display = state.settings.gps ? 'flex' : 'none';
  }

  if (dot) {
    dot.classList.remove('active', 'searching');
    if (state.gpsStatus === 'active') {
      dot.classList.add('active');
    } else if (state.gpsStatus === 'searching') {
      dot.classList.add('searching');
    }
  }

  if (text) {
    text.textContent = 'GPS';
  }
}

/**
 * Update photo capture indicator on timestamp button
 */
function updatePhotoCaptureIndicator(): void {
  const state = store.getState();
  const timestampBtn = document.getElementById('timestamp-btn');
  if (timestampBtn) {
    timestampBtn.classList.toggle('photo-enabled', state.settings.photoCapture);
  }
}

/**
 * Update undo button state
 */
function updateUndoButton(): void {
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    undoBtn.toggleAttribute('disabled', !store.canUndo());
  }
}

/**
 * Update settings inputs
 */
function updateSettingsInputs(): void {
  const state = store.getState();
  const { settings } = state;

  const simpleModeToggle = document.getElementById('simple-mode-toggle') as HTMLInputElement;
  const gpsToggle = document.getElementById('gps-toggle') as HTMLInputElement;
  const syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
  const autoToggle = document.getElementById('auto-toggle') as HTMLInputElement;
  const hapticToggle = document.getElementById('haptic-toggle') as HTMLInputElement;
  const soundToggle = document.getElementById('sound-toggle') as HTMLInputElement;
  const photoToggle = document.getElementById('photo-toggle') as HTMLInputElement;

  if (simpleModeToggle) simpleModeToggle.checked = settings.simple;

  // Hide admin section in simple mode
  const adminSection = document.getElementById('admin-section');
  if (adminSection) {
    adminSection.style.display = settings.simple ? 'none' : 'block';
  }

  if (gpsToggle) gpsToggle.checked = settings.gps;
  if (syncToggle) syncToggle.checked = settings.sync;
  if (autoToggle) autoToggle.checked = settings.auto;
  if (hapticToggle) hapticToggle.checked = settings.haptic;
  if (soundToggle) soundToggle.checked = settings.sound;
  if (photoToggle) photoToggle.checked = settings.photoCapture;

  const raceIdInput = document.getElementById('race-id-input') as HTMLInputElement;
  if (raceIdInput) raceIdInput.value = state.raceId;

  const deviceNameInput = document.getElementById('device-name-input') as HTMLInputElement;
  if (deviceNameInput) deviceNameInput.value = state.deviceName;

  // Update language toggle
  updateLangToggle();
}

/**
 * Update language toggle UI
 */
function updateLangToggle(): void {
  const lang = store.getState().currentLang;
  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.querySelectorAll('.lang-option').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-lang') === lang);
    });
  }
}

/**
 * Update translations
 */
function updateTranslations(): void {
  const lang = store.getState().currentLang as Language;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key, lang);
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      (el as HTMLInputElement).placeholder = t(key, lang);
    }
  });
}

/**
 * Apply settings (show/hide UI based on simple mode)
 */
function applySettings(): void {
  const settings = store.getState().settings;

  // Simple mode UI adjustments
  const advancedElements = document.querySelectorAll('[data-advanced]');
  advancedElements.forEach(el => {
    (el as HTMLElement).style.display = settings.simple ? 'none' : '';
  });

  // Hide Start timing point in simple mode
  const startBtn = document.querySelector('[data-point="S"]') as HTMLElement;
  if (startBtn) {
    startBtn.style.display = settings.simple ? 'none' : '';
  }

  // Force Finish point selected in simple mode
  if (settings.simple) {
    store.setSelectedPoint('F');
  }
}

/**
 * Helper: Get point color
 */
function getPointColor(point: TimingPoint): string {
  const colors: Record<TimingPoint, string> = {
    'S': 'var(--success)',
    'F': 'var(--secondary)'
  };
  return colors[point];
}

/**
 * Helper: Format time for display
 */
function formatTimeDisplay(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Check if race exists in cloud
 */
async function checkRaceExists(raceId: string): Promise<void> {
  const result = await syncService.checkRaceExists(raceId);
  store.setRaceExistsInCloud(result.exists);
  updateRaceExistsIndicator(result.exists, result.entryCount);
}

/**
 * Update race exists indicator UI
 */
function updateRaceExistsIndicator(exists: boolean | null, entryCount: number): void {
  const indicator = document.getElementById('race-exists-indicator');
  const textEl = document.getElementById('race-exists-text');
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
    textEl.textContent = entryCount > 0
      ? `${entryCount} ${t('entriesInCloud', lang)}`
      : t('raceFound', lang);
  } else {
    indicator.classList.add('new');
    textEl.textContent = t('raceNew', lang);
  }
}

// ===== Race Management Functions =====

// Store admin PIN hash in localStorage
const ADMIN_PIN_KEY = 'skiTimerAdminPin';
const DEFAULT_ADMIN_PIN = '1977'; // Must match ADMIN_PIN in Vercel env
let pendingRaceDelete: string | null = null;

/**
 * Initialize default admin PIN if not already set
 */
function initializeDefaultAdminPin(): void {
  const existingPin = localStorage.getItem(ADMIN_PIN_KEY);
  if (!existingPin) {
    // Set default PIN hash
    const defaultPinHash = simpleHash(DEFAULT_ADMIN_PIN);
    localStorage.setItem(ADMIN_PIN_KEY, defaultPinHash);
    console.log('Default admin PIN initialized');
  }
}

/**
 * Validate PIN format: exactly 4 digits
 */
function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Filter input to only allow numeric digits
 */
function filterNumericInput(input: HTMLInputElement): void {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^0-9]/g, '');
  });
}

/**
 * Update PIN status display
 */
function updatePinStatusDisplay(): void {
  const lang = store.getState().currentLang;
  const storedPinHash = localStorage.getItem(ADMIN_PIN_KEY);
  const statusEl = document.getElementById('admin-pin-status');
  const btnTextEl = document.getElementById('change-pin-btn-text');

  if (statusEl) {
    statusEl.textContent = storedPinHash ? t('pinSet', lang) : t('pinNotSet', lang);
  }
  if (btnTextEl) {
    btnTextEl.textContent = storedPinHash ? t('changePin', lang) : t('setPin', lang);
  }
}

/**
 * Initialize race management
 */
function initRaceManagement(): void {
  // Initialize default admin PIN if not already set
  initializeDefaultAdminPin();

  // Update PIN status display
  updatePinStatusDisplay();

  // Change PIN button
  const changePinBtn = document.getElementById('change-pin-btn');
  if (changePinBtn) {
    changePinBtn.addEventListener('click', handleChangePinClick);
  }

  // Save PIN button
  const savePinBtn = document.getElementById('save-pin-btn');
  if (savePinBtn) {
    savePinBtn.addEventListener('click', handleSavePin);
  }

  // Filter numeric input for all PIN fields
  const pinInputs = [
    'admin-pin-verify-input',
    'current-pin-input',
    'new-pin-input',
    'confirm-pin-input'
  ];
  pinInputs.forEach(id => {
    const input = document.getElementById(id) as HTMLInputElement;
    if (input) filterNumericInput(input);
  });

  // Manage races button
  const manageRacesBtn = document.getElementById('manage-races-btn');
  if (manageRacesBtn) {
    manageRacesBtn.addEventListener('click', handleManageRacesClick);
  }

  // Admin PIN modal verify button
  const adminPinVerifyBtn = document.getElementById('admin-pin-verify-btn');
  if (adminPinVerifyBtn) {
    adminPinVerifyBtn.addEventListener('click', handleAdminPinVerify);
  }

  // Admin PIN modal input - verify on Enter
  const adminPinVerifyInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  if (adminPinVerifyInput) {
    adminPinVerifyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleAdminPinVerify();
      }
    });
  }

  // Race deleted modal OK button
  const raceDeletedOkBtn = document.getElementById('race-deleted-ok-btn');
  if (raceDeletedOkBtn) {
    raceDeletedOkBtn.addEventListener('click', () => {
      const modal = document.getElementById('race-deleted-modal');
      if (modal) modal.classList.remove('show');
    });
  }

  // Refresh races button
  const refreshRacesBtn = document.getElementById('refresh-races-btn');
  if (refreshRacesBtn) {
    refreshRacesBtn.addEventListener('click', loadRaceList);
  }

  // Confirm delete race button
  const confirmDeleteRaceBtn = document.getElementById('confirm-delete-race-btn');
  if (confirmDeleteRaceBtn) {
    confirmDeleteRaceBtn.addEventListener('click', handleConfirmDeleteRace);
  }
}

/**
 * Handle change PIN button click
 */
function handleChangePinClick(): void {
  const lang = store.getState().currentLang;
  const storedPinHash = localStorage.getItem(ADMIN_PIN_KEY);
  const modal = document.getElementById('change-pin-modal');
  const modalTitle = document.getElementById('change-pin-modal-title');
  const currentPinRow = document.getElementById('current-pin-row');
  const currentPinInput = document.getElementById('current-pin-input') as HTMLInputElement;
  const newPinInput = document.getElementById('new-pin-input') as HTMLInputElement;
  const confirmPinInput = document.getElementById('confirm-pin-input') as HTMLInputElement;

  if (!modal) return;

  // Clear all inputs and errors
  if (currentPinInput) currentPinInput.value = '';
  if (newPinInput) newPinInput.value = '';
  if (confirmPinInput) confirmPinInput.value = '';
  hideAllPinErrors();

  // Show/hide current PIN field based on whether PIN is already set
  if (storedPinHash) {
    // Changing existing PIN - show current PIN field
    if (currentPinRow) currentPinRow.style.display = 'block';
    if (modalTitle) modalTitle.textContent = t('changePin', lang);
  } else {
    // Setting new PIN - hide current PIN field
    if (currentPinRow) currentPinRow.style.display = 'none';
    if (modalTitle) modalTitle.textContent = t('setPin', lang);
  }

  modal.classList.add('show');

  // Focus appropriate input
  if (storedPinHash && currentPinInput) {
    currentPinInput.focus();
  } else if (newPinInput) {
    newPinInput.focus();
  }
}

/**
 * Hide all PIN error messages
 */
function hideAllPinErrors(): void {
  const errorIds = ['current-pin-error', 'pin-mismatch-error', 'pin-format-error'];
  errorIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

/**
 * Handle save PIN button click
 */
function handleSavePin(): void {
  const lang = store.getState().currentLang;
  const storedPinHash = localStorage.getItem(ADMIN_PIN_KEY);
  const currentPinInput = document.getElementById('current-pin-input') as HTMLInputElement;
  const newPinInput = document.getElementById('new-pin-input') as HTMLInputElement;
  const confirmPinInput = document.getElementById('confirm-pin-input') as HTMLInputElement;
  const currentPinError = document.getElementById('current-pin-error');
  const pinMismatchError = document.getElementById('pin-mismatch-error');
  const pinFormatError = document.getElementById('pin-format-error');

  hideAllPinErrors();

  // If PIN already exists, verify current PIN first
  if (storedPinHash) {
    const currentPin = currentPinInput?.value || '';
    const currentPinHash = simpleHash(currentPin);

    if (currentPinHash !== storedPinHash) {
      if (currentPinError) currentPinError.style.display = 'block';
      if (currentPinInput) {
        currentPinInput.value = '';
        currentPinInput.focus();
      }
      feedbackWarning();
      return;
    }
  }

  const newPin = newPinInput?.value || '';
  const confirmPin = confirmPinInput?.value || '';

  // Validate new PIN format (exactly 4 digits)
  if (!isValidPin(newPin)) {
    if (pinFormatError) pinFormatError.style.display = 'block';
    if (newPinInput) {
      newPinInput.focus();
    }
    feedbackWarning();
    return;
  }

  // Verify PINs match
  if (newPin !== confirmPin) {
    if (pinMismatchError) pinMismatchError.style.display = 'block';
    if (confirmPinInput) {
      confirmPinInput.value = '';
      confirmPinInput.focus();
    }
    feedbackWarning();
    return;
  }

  // Save new PIN
  const pinHash = simpleHash(newPin);
  localStorage.setItem(ADMIN_PIN_KEY, pinHash);

  // Close modal and show success
  const modal = document.getElementById('change-pin-modal');
  if (modal) modal.classList.remove('show');

  showToast(t('pinSaved', lang), 'success');
  feedbackSuccess();

  // Update status display
  updatePinStatusDisplay();
}

/**
 * Simple hash function for PIN (not cryptographically secure, but adequate for local UI protection)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Handle race deleted event from sync service
 */
function handleRaceDeleted(event: CustomEvent<{ raceId: string; deletedAt: number; message: string }>): void {
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
    modal.classList.add('show');
  }

  // Disable sync and clear race ID
  store.updateSettings({ sync: false });
  store.setRaceId('');

  // Update UI
  const syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
  if (syncToggle) syncToggle.checked = false;

  const raceIdInput = document.getElementById('race-id-input') as HTMLInputElement;
  if (raceIdInput) raceIdInput.value = '';

  feedbackWarning();
}

/**
 * Handle storage error event - CRITICAL for data integrity
 */
function handleStorageError(event: CustomEvent<{ message: string; isQuotaError: boolean; entryCount: number }>): void {
  const { isQuotaError, entryCount } = event.detail;
  const lang = store.getState().currentLang;

  if (isQuotaError) {
    // Storage quota exceeded - this is critical
    showToast(t('storageQuotaError', lang), 'error', 8000);
  } else {
    // General storage error
    showToast(t('storageError', lang), 'error', 5000);
  }

  // Also trigger haptic feedback to ensure user notices
  feedbackWarning();

  console.error('Storage error:', event.detail, `Entries at risk: ${entryCount}`);
}

/**
 * Handle storage warning event - storage is getting full
 */
function handleStorageWarning(event: CustomEvent<{ usage: number; quota: number; percent: number }>): void {
  const { percent } = event.detail;
  const lang = store.getState().currentLang;

  // Only show warning once per session to avoid spam
  const warningShown = sessionStorage.getItem('storage-warning-shown');
  if (!warningShown) {
    showToast(`${t('storageWarning', lang)} (${percent}%)`, 'warning', 5000);
    sessionStorage.setItem('storage-warning-shown', 'true');
  }
}

/**
 * Handle manage races button click
 */
function handleManageRacesClick(): void {
  const storedPinHash = localStorage.getItem(ADMIN_PIN_KEY);

  if (!storedPinHash) {
    // No PIN set - prompt to set PIN first
    showToast(t('setPinFirst', store.getState().currentLang), 'warning');
    handleChangePinClick(); // Open the set PIN modal
    return;
  }

  // Show PIN verification modal
  const modal = document.getElementById('admin-pin-modal');
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');

  if (modal && pinInput && errorEl) {
    pinInput.value = '';
    errorEl.style.display = 'none';
    modal.classList.add('show');
    pinInput.focus();
  }
}

/**
 * Handle admin PIN verification
 */
function handleAdminPinVerify(): void {
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const modal = document.getElementById('admin-pin-modal');

  if (!pinInput || !modal) return;

  const enteredPin = pinInput.value.trim();
  const storedPinHash = localStorage.getItem(ADMIN_PIN_KEY);
  const enteredPinHash = simpleHash(enteredPin);

  if (enteredPinHash === storedPinHash) {
    // PIN correct - open race management (API uses separate fixed PIN)
    modal.classList.remove('show');
    pinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
    openRaceManagementModal();
  } else {
    // PIN incorrect
    if (errorEl) errorEl.style.display = 'block';
    pinInput.value = '';
    pinInput.focus();
    feedbackWarning();
  }
}

/**
 * Open race management modal and load race list
 */
function openRaceManagementModal(): void {
  const modal = document.getElementById('race-management-modal');
  if (modal) {
    modal.classList.add('show');
    loadRaceList();
  }
}

/**
 * Load and display race list from admin API
 */
async function loadRaceList(): Promise<void> {
  const listContainer = document.getElementById('race-list');
  const loadingEl = document.getElementById('race-list-loading');
  const emptyEl = document.getElementById('race-list-empty');
  const lang = store.getState().currentLang;

  if (!listContainer) return;

  // Show loading
  if (loadingEl) loadingEl.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  // Remove existing race items
  listContainer.querySelectorAll('.race-item').forEach(item => item.remove());

  try {
    const response = await fetch(ADMIN_API_BASE, {
      headers: getAdminAuthHeaders()
    });
    if (!response.ok) {
      if (response.status === 401) {
        // API auth failed - server PIN mismatch (should not happen in production)
        const modal = document.getElementById('race-management-modal');
        if (modal) modal.classList.remove('show');
        showToast('API authentication failed', 'error');
        console.error('API auth failed - check ADMIN_PIN env variable matches SERVER_API_PIN');
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const races: RaceInfo[] = data.races || [];

    // Hide loading
    if (loadingEl) loadingEl.style.display = 'none';

    if (races.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    // Render race items
    races.forEach(race => {
      const raceItem = createRaceItem(race, lang);
      listContainer.appendChild(raceItem);
    });

  } catch (error) {
    console.error('Failed to load race list:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    showToast(t('loadError', lang), 'error');
  }
}

/**
 * Create a race item element
 */
function createRaceItem(race: RaceInfo, lang: Language): HTMLElement {
  const item = document.createElement('div');
  item.className = 'race-item';
  item.setAttribute('data-race-id', race.raceId);

  const info = document.createElement('div');
  info.className = 'race-info';

  const raceIdEl = document.createElement('span');
  raceIdEl.className = 'race-id';
  raceIdEl.textContent = race.raceId.toUpperCase();

  const meta = document.createElement('span');
  meta.className = 'race-meta';
  const entriesText = race.entryCount === 1 ? t('entry', lang) : t('entries', lang);
  const devicesText = race.deviceCount === 1 ? t('device', lang) : t('devices', lang);
  meta.textContent = `${race.entryCount} ${entriesText}, ${race.deviceCount} ${devicesText}`;

  info.appendChild(raceIdEl);
  info.appendChild(meta);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'race-delete-btn danger';
  deleteBtn.textContent = t('delete', lang);
  deleteBtn.addEventListener('click', () => promptDeleteRace(race.raceId));

  item.appendChild(info);
  item.appendChild(deleteBtn);

  return item;
}

/**
 * Prompt to delete a race
 */
function promptDeleteRace(raceId: string): void {
  const lang = store.getState().currentLang;
  pendingRaceDelete = raceId;

  const modal = document.getElementById('delete-race-confirm-modal');
  const textEl = document.getElementById('delete-race-confirm-text');

  if (textEl) {
    textEl.textContent = `${t('confirmDeleteRaceText', lang)} "${raceId.toUpperCase()}"?`;
  }

  if (modal) {
    modal.classList.add('show');
  }
}

/**
 * Handle confirm delete race
 */
async function handleConfirmDeleteRace(): Promise<void> {
  if (!pendingRaceDelete) return;

  const raceId = pendingRaceDelete;
  const lang = store.getState().currentLang;

  // Close confirmation modal
  const confirmModal = document.getElementById('delete-race-confirm-modal');
  if (confirmModal) confirmModal.classList.remove('show');

  try {
    const response = await fetch(`${ADMIN_API_BASE}?raceId=${encodeURIComponent(raceId)}`, {
      method: 'DELETE',
      headers: getAdminAuthHeaders()
    });

    if (!response.ok) {
      if (response.status === 401) {
        // API auth failed - server PIN mismatch (should not happen in production)
        const modal = document.getElementById('race-management-modal');
        if (modal) modal.classList.remove('show');
        showToast('API authentication failed', 'error');
        console.error('API auth failed - check ADMIN_PIN env variable matches SERVER_API_PIN');
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      showToast(`${t('raceDeletedSuccess', lang)} ${raceId.toUpperCase()}`, 'success');
      feedbackDelete();
      // Refresh the list
      loadRaceList();
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Failed to delete race:', error);
    showToast(t('deleteError', lang), 'error');
  } finally {
    pendingRaceDelete = null;
  }
}
