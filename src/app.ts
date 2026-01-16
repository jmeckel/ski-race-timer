import { store } from './store';
import { Clock, VirtualList, showToast, PullToRefresh } from './components';
import { syncService, gpsService, cameraService, captureTimingPhoto } from './services';
import { feedbackSuccess, feedbackWarning, feedbackTap, feedbackDelete, feedbackUndo, resumeAudio } from './services';
import { generateEntryId, getPointLabel } from './utils';
import { t } from './i18n/translations';
import type { Entry, TimingPoint, Language } from './types';

// DOM Elements cache
let clock: Clock | null = null;
let virtualList: VirtualList | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let pullToRefreshInstance: PullToRefresh | null = null;

/**
 * Initialize the application
 */
export function initApp(): void {
  // Initialize components
  initClock();
  initTabs();
  initNumberPad();
  initTimingPoints();
  initTimestampButton();
  initResultsView();
  initSettingsView();
  initModals();

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
  store.setRecording(true);

  try {
    // Capture photo if enabled
    let photo: string | null = null;
    if (state.settings.photoCapture) {
      photo = await captureTimingPhoto();
    }

    // Get GPS coordinates if available
    const gpsCoords = gpsService.getCoordinates();

    // Create entry
    const entry: Entry = {
      id: generateEntryId(state.deviceId),
      bib: state.bibInput ? state.bibInput.padStart(3, '0') : '',
      point: state.selectedPoint,
      timestamp: new Date().toISOString(),
      status: 'ok',
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      photo: photo || undefined,
      gpsCoords
    };

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
      const nextBib = String(parseInt(state.bibInput, 10) + 1);
      store.setBibInput(nextBib);
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
    }
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
            store.clearAllEntries();
          } else if (action === 'delete') {
            store.clearAllEntries();
          } else {
            // Cancelled - restore old race ID
            raceIdInput.value = state.raceId;
            return;
          }
        } else {
          // Not previously synced - ask to keep or delete
          const action = await showRaceChangeDialog('unsynced', state.currentLang);
          if (action === 'delete') {
            store.clearAllEntries();
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
  if (changedKeys.includes('syncStatus') || changedKeys.includes('settings')) {
    updateSyncStatusIndicator();
  }

  // Update GPS status
  if (changedKeys.includes('gpsStatus') || changedKeys.includes('settings')) {
    updateGpsIndicator();
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
