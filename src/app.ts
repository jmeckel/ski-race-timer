import { store } from './store';
import { Clock, VirtualList, showToast, destroyToast, PullToRefresh } from './components';
// DISABLED: Motion effects disabled to save battery
// import { syncService, gpsService, cameraService, captureTimingPhoto, photoStorage, wakeLockService, motionService } from './services';
import { syncService, gpsService, cameraService, captureTimingPhoto, photoStorage, wakeLockService } from './services';
import { AUTH_TOKEN_KEY, hasAuthToken, exchangePinForToken, clearAuthToken, syncFault, deleteFaultFromCloud } from './services/sync';
import { feedbackSuccess, feedbackWarning, feedbackTap, feedbackDelete, feedbackUndo, resumeAudio } from './services';
import { generateEntryId, getPointLabel, getRunLabel, getRunColor, logError, logWarning, TOAST_DURATION, fetchWithTimeout, escapeHtml } from './utils';
import { isValidRaceId } from './utils/validation';
import { t } from './i18n/translations';
import { getTodaysRecentRaces, addRecentRace, type RecentRace } from './utils/recentRaces';
import { attachRecentRaceItemHandlers, renderRecentRaceItems } from './utils/recentRacesUi';
import { applyViewServices } from './utils/viewServices';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { OnboardingController } from './onboarding';
import type { Entry, FaultEntry, TimingPoint, Language, RaceInfo, FaultType, DeviceRole, Run } from './types';

// Feature modules
import { closeModal, closeAllModalsAnimated, openModal } from './features/modals';
import { initRippleEffects, createRipple, cleanupRippleEffects } from './features/ripple';
import { exportResults, formatTimeForRaceHorology, escapeCSVField, exportChiefSummary, exportFaultSummaryWhatsApp } from './features/export';
import {
  initClock, destroyClock, initTabs, initNumberPad, initTimingPoints, initRunSelector, initTimestampButton,
  getPointColor, formatTimeDisplay, updateBibDisplay, updateTimingPointSelection, updateRunSelection
} from './features/timerView';
import { openPhotoViewer, closePhotoViewer, deletePhoto } from './features/photoViewer';
import {
  getFaultTypeLabel, initChiefJudgeToggle, updatePenaltyConfigUI, updateChiefJudgeToggleVisibility,
  updateChiefJudgeView, updateJudgesOverview, updateFaultSummaryPanel, updatePendingDeletionsPanel
} from './features/chiefJudgeView';
import {
  openFaultRecordingModal, initFaultRecordingModal, recordFault, showFaultConfirmation,
  initFaultEditModal, openFaultEditModal, handleSaveFaultEdit, handleRestoreFaultVersion,
  openMarkDeletionModal, handleConfirmMarkDeletion, updateActiveBibsList,
  updateInlineFaultsList, updateInlineBibSelector, selectInlineBib,
  updateInlineGateSelector, selectInlineGate, initInlineFaultEntry,
  updateInlineSaveButtonState, saveInlineFault, openFaultDeleteConfirmation, refreshInlineFaultUI
} from './features/faultEntry';
import {
  setUpdateRoleToggleCallback, updateGateJudgeTabVisibility, initGateJudgeView,
  openGateAssignmentModal, initGateAssignmentModal, updateGateRangeDisplay,
  updateOtherJudgesCoverage, updateReadyButtonState, updateJudgesReadyIndicator,
  updateJudgeReadyStatus, updateGateJudgeRunSelection
} from './features/gateJudgeView';
import {
  setResultsViewCallbacks, getVirtualList, initResultsView, initResultsActions,
  applyFilters, updateStats, updateEntryCountBadge, cleanupSearchTimeout
} from './features/resultsView';
import {
  setSettingsViewCallbacks, initSettingsView, initRoleToggle, updateRoleToggle,
  updateSettingsInputs, updateLangToggle, updateTranslations, applySettings,
  applyGlassEffectSettings, checkRaceExists, showSettingsRecentRacesDropdown,
  fetchRacesFromApi, selectSettingsRecentRace, updateRaceExistsIndicator,
  cleanupSettingsTimeouts
} from './features/settingsView';

// Initialize Vercel Speed Insights
injectSpeedInsights();

// Admin API configuration
const ADMIN_API_BASE = '/api/v1/admin/races';

/**
 * Get authorization headers for API requests
 * Uses JWT token for authentication
 */
function getAdminAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
}

/**
 * Check if user is authenticated (has valid token)
 */
function isAuthenticated(): boolean {
  return hasAuthToken();
}

/**
 * Authenticate with PIN and get JWT token
 * Returns true if authentication succeeded
 * @param pin - The 4-digit PIN
 * @param role - Optional role to request ('timer' | 'gateJudge' | 'chiefJudge')
 */
async function authenticateWithPin(pin: string, role?: 'timer' | 'gateJudge' | 'chiefJudge'): Promise<{ success: boolean; error?: string; isNewPin?: boolean }> {
  const result = await exchangePinForToken(pin, role);
  if (result.success) {
    updatePinStatusDisplay();
  }
  return result;
}

// DOM Elements cache
let onboardingController: OnboardingController | null = null;

// Resolver for PIN verification promise (used by closeAllModals cleanup)
let pinVerifyResolver: ((verified: boolean) => void) | null = null;
// Flag to indicate Chief Judge verification (requires chiefJudge role token)
let pinVerifyForChiefJudge = false;

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
  initRunSelector();
  initTimestampButton();
  // Set callbacks for resultsView before initialization
  setResultsViewCallbacks({
    openEditModal,
    promptDelete,
    openConfirmModal,
    verifyPinForChiefJudge
  });
  initResultsView();
  // Set callbacks for settingsView before initialization
  setSettingsViewCallbacks({
    verifyPinForRaceJoin,
    showPhotoSyncWarningModal,
    showRaceChangeDialog
  });
  initSettingsView();
  // Set callback for gateJudgeView to access updateRoleToggle
  setUpdateRoleToggleCallback(updateRoleToggle);
  initGateJudgeView();
  initModals();
  initRaceManagement();
  initRippleEffects();

  // Subscribe to state changes
  store.subscribe(handleStateChange);

  // Initialize services based on settings
  const settings = store.getState().settings;
  // Auto-start sync if enabled, race ID exists, AND user has valid auth token
  // Token proves user previously authenticated - no PIN needed on restart
  if (settings.sync && store.getState().raceId) {
    if (hasAuthToken()) {
      // Valid token exists - auto-start sync
      syncService.initialize();
    } else {
      // No token - disable sync, user must re-authenticate
      store.updateSettings({ sync: false });
      const syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
      if (syncToggle) syncToggle.checked = false;
      setTimeout(() => {
        const lang = store.getState().currentLang;
        showToast(t('syncRequiresPin', lang), 'info', 5000);
      }, 500);
    }
  }
  applyViewServices(store.getState());

  // Listen for race deleted events from sync service
  window.addEventListener('race-deleted', handleRaceDeleted as EventListener);

  // Listen for auth expired events from sync service
  window.addEventListener('auth-expired', handleAuthExpired as EventListener);

  // Listen for storage errors and warnings
  window.addEventListener('storage-error', handleStorageError as EventListener);
  window.addEventListener('storage-warning', handleStorageWarning as EventListener);

  // Resume audio context on first interaction
  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('touchstart', resumeAudio, { once: true });

  // Cleanup on page unload to prevent memory leaks
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Apply initial state
  applySettings();
  updateUI();

  // Enable wake lock if starting on timer view
  // This keeps the screen on during active timing
  const initialState = store.getState();
  if (initialState.currentView === 'timer') {
    wakeLockService.enable();
  }

  // Initialize onboarding for first-time users
  onboardingController = new OnboardingController();
  onboardingController.setUpdateTranslationsCallback(() => updateTranslations());

  // Show onboarding if first-time user
  if (onboardingController.shouldShow()) {
    onboardingController.show();
  }

  // "Show Tutorial" button handler
  const showTutorialBtn = document.getElementById('show-tutorial-btn');
  if (showTutorialBtn) {
    showTutorialBtn.addEventListener('click', () => {
      if (onboardingController) {
        onboardingController.reset();
        onboardingController.show();
        feedbackTap();
      }
    });
  }

}

/**
 * Show race change dialog
 */
function showRaceChangeDialog(type: 'synced' | 'unsynced', lang: Language): Promise<'export' | 'delete' | 'keep' | 'cancel'> {
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

    const handleExport = () => { cleanup(); resolve('export'); };
    const handleDelete = () => { cleanup(); resolve('delete'); };
    const handleKeep = () => { cleanup(); resolve('keep'); };
    const handleCancel = () => { cleanup(); resolve('cancel'); };

    exportBtn?.addEventListener('click', handleExport);
    deleteBtn?.addEventListener('click', handleDelete);
    keepBtn?.addEventListener('click', handleKeep);
    cancelBtn?.addEventListener('click', handleCancel);

    modal.classList.add('show');
  });
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

  // Confirm fault delete button (for inline fault list)
  const confirmFaultDeleteBtn = document.getElementById('confirm-fault-delete-btn');
  if (confirmFaultDeleteBtn) {
    confirmFaultDeleteBtn.addEventListener('click', () => {
      const modal = document.getElementById('fault-delete-modal');
      const faultId = modal?.getAttribute('data-fault-id');
      if (faultId) {
        store.markFaultForDeletion(faultId);
        const markedFault = store.getState().faultEntries.find(f => f.id === faultId);
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
  const editBibInput = document.getElementById('edit-bib-input') as HTMLInputElement;
  if (editBibInput) {
    editBibInput.addEventListener('input', () => {
      // Remove non-numeric characters and limit to 3 digits
      editBibInput.value = editBibInput.value.replace(/[^0-9]/g, '').slice(0, 3);
    });
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
      if (modal) modal.setAttribute('data-entry-run', run);

      document.querySelectorAll('.edit-run-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
    });
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

  // Initialize fault edit modal handlers
  initFaultEditModal();
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

  // Update run selector buttons
  const entryRun = entry.run ?? 1;
  document.querySelectorAll('.edit-run-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-run') === String(entryRun);
    btn.classList.toggle('active', isActive);
  });
  modal.setAttribute('data-entry-run', String(entryRun));

  modal.classList.add('show');
}

/**
 * Open confirm modal
 */
function openConfirmModal(action: 'delete' | 'deleteSelected' | 'clearAll' | 'undoAdd'): void {
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
  } else if (action === 'undoAdd') {
    if (titleEl) titleEl.textContent = t('confirmUndoAdd', lang);
    if (textEl) textEl.textContent = t('confirmUndoAddText', lang);
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
async function handleConfirmDelete(): Promise<void> {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;

  const action = modal.getAttribute('data-action');
  const entryId = modal.getAttribute('data-entry-id');
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
    const entriesToDelete = state.entries.filter(e => ids.includes(e.id));
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
    const entryToDelete = state.entries.find(e => e.id === entryId);
    store.deleteEntry(entryId);

    // Delete photo from IndexedDB
    await photoStorage.deletePhoto(entryId);

    // Sync deletion to cloud
    if (state.settings.sync && state.raceId && entryToDelete) {
      syncService.deleteEntryFromCloud(entryToDelete.id, entryToDelete.deviceId);
    }

    showToast(t('deleted', state.currentLang), 'success');
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
  const runAttr = modal.getAttribute('data-entry-run');
  const run = runAttr ? parseInt(runAttr, 10) as 1 | 2 : 1;

  store.updateEntry(entryId, {
    bib: bibInput?.value.padStart(3, '0') || '',
    status: statusSelect?.value as Entry['status'],
    run
  });

  showToast(t('saved', store.getState().currentLang), 'success');
  closeAllModals();
}

/**
 * Close all modals with animation
 * Also cleans up any pending PIN verification promises
 */
function closeAllModals(): void {
  // Check if admin PIN modal is being closed and has a pending resolver
  const adminPinModal = document.getElementById('admin-pin-modal');
  if (adminPinModal?.classList.contains('show') && pinVerifyResolver) {
    pinVerifyResolver(false);
    pinVerifyResolver = null;
    // Clear the input as well
    const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
    if (pinInput) pinInput.value = '';
  }

  document.querySelectorAll('.modal-overlay.show').forEach(modal => {
    closeModal(modal as HTMLElement);
  });
}

/**
 * Handle state changes
 */
function handleStateChange(state: ReturnType<typeof store.getState>, changedKeys: (keyof typeof state)[]): void {
  // Update view visibility
  if (changedKeys.includes('currentView')) {
    updateViewVisibility();

    // Wake Lock: Enable when on timer view, disable otherwise
    // This keeps the screen on during active timing
    if (state.currentView === 'timer') {
      wakeLockService.enable();
    } else {
      wakeLockService.disable();
    }

    // VirtualList: Pause when not on results view, resume when on results view
    // This saves resources when the results tab is inactive
    const virtualList = getVirtualList();
    if (virtualList) {
      if (state.currentView === 'results') {
        virtualList.resume();
      } else {
        virtualList.pause();
      }
    }
  }

  if (changedKeys.includes('currentView') || changedKeys.includes('settings')) {
    applyViewServices(state);
  }

  // Update bib display
  if (changedKeys.includes('bibInput')) {
    updateBibDisplay();
  }

  // Update timing points
  if (changedKeys.includes('selectedPoint')) {
    updateTimingPointSelection();
  }

  // Update run selection
  if (changedKeys.includes('selectedRun')) {
    updateRunSelection();
    // Also update Gate Judge run selector
    updateGateJudgeRunSelection();
    // Update active bibs when run changes
    if (state.currentView === 'gateJudge') {
      updateActiveBibsList();
    }
  }

  // Update Gate Judge view when entries change (active bibs derived from entries)
  if (changedKeys.includes('entries') && state.currentView === 'gateJudge') {
    updateActiveBibsList();
  }

  // Update Gate Judge state
  if (changedKeys.includes('deviceRole')) {
    updateRoleToggle();
    updateGateJudgeTabVisibility();
    updateJudgeReadyStatus();
  }

  // Update judge ready status when ready state changes
  if (changedKeys.includes('isJudgeReady')) {
    updateJudgeReadyStatus();
  }

  if (changedKeys.includes('gateAssignment')) {
    updateGateRangeDisplay();
  }

  if (changedKeys.includes('faultEntries') && state.currentView === 'gateJudge') {
    updateActiveBibsList();
  }

  // Update results list
  if (changedKeys.includes('entries')) {
    const vList = getVirtualList();
    if (vList) {
      vList.setEntries(state.entries);
    }
    updateStats();
    updateEntryCountBadge();
  }

  // Update sync status
  if (changedKeys.includes('syncStatus') || changedKeys.includes('settings') || changedKeys.includes('cloudDeviceCount')) {
    updateSyncStatusIndicator();
  }

  // Update GPS status and judge ready indicator
  if (changedKeys.includes('gpsStatus') || changedKeys.includes('settings')) {
    updateGpsIndicator();
    updateJudgeReadyStatus();
  }

  // Update photo capture indicator on timestamp button
  if (changedKeys.includes('settings')) {
    updatePhotoCaptureIndicator();
    // Apply glass/motion effect settings when settings change
    applyGlassEffectSettings();
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
  updateRunSelection();
  updateStats();
  updateEntryCountBadge();
  updateSyncStatusIndicator();
  updateGpsIndicator();
  updateJudgeReadyStatus();
  updatePhotoCaptureIndicator();
  updateUndoButton();
  updateSettingsInputs();
  updateTranslations();
}

/**
 * Convert camelCase to kebab-case for CSS class names
 */
function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Update view visibility
 */
function updateViewVisibility(): void {
  const state = store.getState();
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });

  // Convert view name to kebab-case for CSS class (e.g., 'gateJudge' -> 'gate-judge')
  const viewClass = toKebabCase(state.currentView);
  const activeView = document.querySelector(`.${viewClass}-view`);
  if (activeView) {
    activeView.classList.add('active');
  }

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === state.currentView);
  });

  // Update Gate Judge view when switching to it
  if (state.currentView === 'gateJudge') {
    updateActiveBibsList();
    updateGateRangeDisplay();
    updateGateJudgeRunSelection();
    refreshInlineFaultUI();
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
    dot.classList.remove('connected', 'error', 'offline', 'syncing');
    if (state.syncStatus === 'connected') {
      dot.classList.add('connected');
    } else if (state.syncStatus === 'syncing') {
      dot.classList.add('syncing');
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
 * Update photo capture indicator in header status bar
 */
function updatePhotoCaptureIndicator(): void {
  const state = store.getState();
  const cameraIndicator = document.getElementById('camera-indicator');
  if (cameraIndicator) {
    cameraIndicator.style.display = state.settings.photoCapture ? 'flex' : 'none';
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

// ===== Race Management Functions =====

const DEFAULT_ADMIN_PIN = '1111'; // Default client PIN (synced across devices)
let pendingRaceDelete: string | null = null;

/**
 * Initialize admin PIN - sync from cloud or set default
 */
async function initializeAdminPin(): Promise<void> {
  // If we already have a valid token, we're done
  if (hasAuthToken()) {
    return;
  }

  // Try to authenticate with default PIN
  // This will either:
  // 1. Set the default PIN in Redis and return a token (if no PIN exists)
  // 2. Authenticate with existing default PIN (if it matches)
  // 3. Fail (if a different PIN is set in Redis)
  await authenticateWithPin(DEFAULT_ADMIN_PIN);
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
  const authenticated = hasAuthToken();
  const statusEl = document.getElementById('admin-pin-status');
  const btnTextEl = document.getElementById('change-pin-btn-text');

  if (statusEl) {
    statusEl.textContent = authenticated ? t('pinSet', lang) : t('pinNotSet', lang);
  }
  if (btnTextEl) {
    btnTextEl.textContent = authenticated ? t('changePin', lang) : t('setPin', lang);
  }
}

/**
 * Initialize race management
 */
function initRaceManagement(): void {
  // Initialize admin PIN (sync from cloud or set default) - fire and forget
  initializeAdminPin().then(() => {
    // Update PIN status display after sync completes
    updatePinStatusDisplay();
  });

  // Update PIN status display immediately (will be updated again after sync)
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

  // Admin PIN modal verify button - handles both race join and race management
  const adminPinVerifyBtn = document.getElementById('admin-pin-verify-btn');
  if (adminPinVerifyBtn) {
    adminPinVerifyBtn.addEventListener('click', () => {
      if (pinVerifyResolver) {
        handleRaceJoinPinVerify();
      } else {
        handleAdminPinVerify();
      }
    });
  }

  // Admin PIN modal input - verify on Enter
  const adminPinVerifyInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  if (adminPinVerifyInput) {
    adminPinVerifyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (pinVerifyResolver) {
          handleRaceJoinPinVerify();
        } else {
          handleAdminPinVerify();
        }
      }
    });
  }

  // Admin PIN modal cancel - handle race join cancellation
  const adminPinModal = document.getElementById('admin-pin-modal');
  if (adminPinModal) {
    adminPinModal.addEventListener('click', (e) => {
      if (e.target === adminPinModal && pinVerifyResolver) {
        cancelRaceJoinPinVerify();
      }
    });
  }

  // Race deleted modal OK button
  const raceDeletedOkBtn = document.getElementById('race-deleted-ok-btn');
  if (raceDeletedOkBtn) {
    raceDeletedOkBtn.addEventListener('click', () => {
      const modal = document.getElementById('race-deleted-modal');
      closeModal(modal);
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

  // Photo sync modal setup
  setupPhotoSyncModal();
}

/**
 * Handle change PIN button click
 */
function handleChangePinClick(): void {
  const lang = store.getState().currentLang;
  const authenticated = hasAuthToken();
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
  if (authenticated) {
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
  if (authenticated && currentPinInput) {
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
async function handleSavePin(): Promise<void> {
  const lang = store.getState().currentLang;
  const authenticated = hasAuthToken();
  const currentPinInput = document.getElementById('current-pin-input') as HTMLInputElement;
  const newPinInput = document.getElementById('new-pin-input') as HTMLInputElement;
  const confirmPinInput = document.getElementById('confirm-pin-input') as HTMLInputElement;
  const currentPinError = document.getElementById('current-pin-error');
  const pinMismatchError = document.getElementById('pin-mismatch-error');
  const pinFormatError = document.getElementById('pin-format-error');

  hideAllPinErrors();

  // If already authenticated (PIN exists), verify current PIN first
  if (authenticated) {
    const currentPin = currentPinInput?.value || '';

    // Verify current PIN by trying to authenticate with it
    const verifyResult = await exchangePinForToken(currentPin);
    if (!verifyResult.success) {
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

  // Update PIN in Redis via admin/pin API
  const newPinHash = await hashPin(newPin);
  try {
    const response = await fetch('/api/v1/admin/pin', {
      method: 'POST',
      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pinHash: newPinHash })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Clear old token and get new one with new PIN
    clearAuthToken();
    const authResult = await authenticateWithPin(newPin);

    if (!authResult.success) {
      showToast(t('pinSyncFailed', lang), 'error');
      feedbackWarning();
      return;
    }

    // Close modal and show success
    const modal = document.getElementById('change-pin-modal');
    closeModal(modal);

    showToast(t('pinSaved', lang), 'success');
    feedbackSuccess();

    // Update status display
    updatePinStatusDisplay();
  } catch (error) {
    logWarning('Admin', 'handleSavePin', error, 'pinSyncFailed');
    showToast(t('pinSyncFailed', lang), 'error');
    feedbackWarning();
  }
}

/**
 * Cryptographically secure hash function for PIN using SHA-256
 */
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
 * Handle auth token expired event from sync service
 */
function handleAuthExpired(event: CustomEvent<{ message: string }>): void {
  const { message } = event.detail;
  const lang = store.getState().currentLang;

  // Show toast notification about session expiry
  showToast(message || 'Session expired. Please re-enter your PIN.', 'warning', 5000);

  // Prompt for PIN re-authentication using existing modal
  verifyPinForRaceJoin(lang).then((verified) => {
    if (verified) {
      // Re-initialize sync after successful authentication
      const state = store.getState();
      if (state.settings.sync && state.raceId) {
        syncService.initialize();
      }
      showToast('Authentication successful', 'success');
    }
  });

  feedbackWarning();
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Show photo sync warning modal with statistics
 */
async function showPhotoSyncWarningModal(): Promise<void> {
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

  modal.classList.add('show');

  // Get photo sync statistics
  const stats = await syncService.getPhotoSyncStats();

  // Update modal with stats
  if (uploadCountEl) uploadCountEl.textContent = String(stats.uploadCount);
  if (downloadCountEl) downloadCountEl.textContent = String(stats.downloadCount);
  if (totalSizeEl) totalSizeEl.textContent = formatBytes(stats.totalSize);

  // Update confirm button based on whether there are photos to sync
  const confirmBtn = document.getElementById('photo-sync-confirm-btn');
  if (confirmBtn) {
    const hasPhotos = stats.uploadCount > 0 || stats.downloadCount > 0;
    confirmBtn.textContent = hasPhotos ? t('enableSync', lang) : t('enableSync', lang);
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
    cancelBtn.addEventListener('click', () => {
      if (modal) modal.classList.remove('show');
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      // Enable photo sync
      store.updateSettings({ syncPhotos: true });

      // Update toggle
      const syncPhotosToggle = document.getElementById('sync-photos-toggle') as HTMLInputElement;
      if (syncPhotosToggle) syncPhotosToggle.checked = true;

      // Close modal
      if (modal) modal.classList.remove('show');

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
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    });
  }
}

/**
 * Handle storage error event - CRITICAL for data integrity
 */
function handleStorageError(event: CustomEvent<{ message: string; isQuotaError: boolean; entryCount: number }>): void {
  const { isQuotaError, entryCount } = event.detail;
  const lang = store.getState().currentLang;

  if (isQuotaError) {
    // Storage quota exceeded - this is critical
    showToast(t('storageQuotaError', lang), 'error', TOAST_DURATION.CRITICAL);
  } else {
    // General storage error
    showToast(t('storageError', lang), 'error', TOAST_DURATION.ERROR);
  }

  // Also trigger haptic feedback to ensure user notices
  feedbackWarning();

  console.error('[Storage] saveEntries:', event.detail.message, { entryCount, isQuotaError });
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
    showToast(`${t('storageWarning', lang)} (${percent}%)`, 'warning', TOAST_DURATION.WARNING);
    sessionStorage.setItem('storage-warning-shown', 'true');
  }
}

/**
 * Handle page unload - cleanup to prevent memory leaks
 */
function handleBeforeUnload(): void {
  // Cleanup clock component
  try {
    destroyClock();
  } catch (e) {
    console.warn('Clock cleanup error:', e);
  }

  // Cleanup sync service
  syncService.cleanup();

  // Cleanup camera service
  cameraService.stop();

  // Cleanup GPS service - stop watching position to prevent memory leaks
  gpsService.stop();

  // Cleanup wake lock service
  wakeLockService.disable();

  // DISABLED: Motion effects disabled to save battery
  // // Cleanup motion service
  // motionService.cleanup();

  // Cleanup toast singleton and its event listener
  destroyToast();

  // MEMORY LEAK FIX: Clear all pending ripple timeouts and remove orphaned ripples
  cleanupRippleEffects();
  document.querySelectorAll('.ripple').forEach(ripple => ripple.remove());

  // MEMORY LEAK FIX: Remove global event listeners
  window.removeEventListener('race-deleted', handleRaceDeleted as EventListener);
  window.removeEventListener('auth-expired', handleAuthExpired as EventListener);
  window.removeEventListener('storage-error', handleStorageError as EventListener);
  window.removeEventListener('storage-warning', handleStorageWarning as EventListener);

  // MEMORY LEAK FIX: Clear debounced timeouts
  cleanupSearchTimeout();
  cleanupSettingsTimeouts();

  // MEMORY LEAK FIX: Resolve any pending PIN verification promise
  if (pinVerifyResolver) {
    pinVerifyResolver(false);
    pinVerifyResolver = null;
  }
}

/**
 * Handle manage races button click
 * Always requires PIN verification for security
 */
function handleManageRacesClick(): void {
  // Always show PIN verification modal - race management requires explicit authentication
  const modal = document.getElementById('admin-pin-modal');
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const titleEl = document.getElementById('admin-pin-modal-title');
  const textEl = document.getElementById('admin-pin-modal-text');
  const lang = store.getState().currentLang;

  if (modal && pinInput && errorEl) {
    pinInput.value = '';
    errorEl.style.display = 'none';
    if (titleEl) titleEl.textContent = t('enterAdminPin', lang);
    if (textEl) textEl.textContent = t('enterPinText', lang);
    modal.classList.add('show');
    pinInput.focus();
  }
}

/**
 * Handle admin PIN verification
 */
async function handleAdminPinVerify(): Promise<void> {
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const modal = document.getElementById('admin-pin-modal');

  if (!pinInput || !modal) return;

  const enteredPin = pinInput.value.trim();

  // Authenticate via JWT token exchange
  const result = await authenticateWithPin(enteredPin);

  if (result.success) {
    // PIN correct - open race management
    closeModal(modal);
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
 * Show PIN verification modal and wait for result
 * Used when joining a race with sync enabled
 * Skips verification if user already has a valid auth token (previously authenticated)
 */
function verifyPinForRaceJoin(lang: Language): Promise<boolean> {
  return new Promise((resolve) => {
    // If already authenticated with valid token, allow without verification
    // Token proves user previously entered correct PIN
    if (hasAuthToken()) {
      resolve(true);
      return;
    }

    const modal = document.getElementById('admin-pin-modal');
    const titleEl = document.getElementById('admin-pin-modal-title');
    const textEl = document.getElementById('admin-pin-modal-text');
    const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
    const errorEl = document.getElementById('admin-pin-error');

    if (!modal || !pinInput) {
      resolve(false);
      return;
    }

    // Update modal text for race join context
    if (titleEl) titleEl.textContent = t('enterAdminPin', lang);
    if (textEl) textEl.textContent = t('enterPinToJoinRace', lang);
    if (errorEl) errorEl.style.display = 'none';
    pinInput.value = '';

    // Store resolver for the verify button handler
    pinVerifyResolver = resolve;

    modal.classList.add('show');
    setTimeout(() => pinInput.focus(), 100);
  });
}

/**
 * Verify PIN for entering Chief Judge mode
 * Uses same PIN as race management
 * Always requires re-authentication to get a token with chiefJudge role
 */
function verifyPinForChiefJudge(lang: Language): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById('admin-pin-modal');
    const titleEl = document.getElementById('admin-pin-modal-title');
    const textEl = document.getElementById('admin-pin-modal-text');
    const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
    const errorEl = document.getElementById('admin-pin-error');

    if (!modal || !pinInput) {
      resolve(false);
      return;
    }

    // Update modal text for Chief Judge context
    if (titleEl) titleEl.textContent = t('enterAdminPin', lang);
    if (textEl) textEl.textContent = t('enterPinForChiefJudge', lang);
    if (errorEl) errorEl.style.display = 'none';
    pinInput.value = '';

    // Store resolver for the verify button handler
    // Mark this as a Chief Judge verification so the handler uses the right role
    pinVerifyResolver = resolve;
    pinVerifyForChiefJudge = true;

    modal.classList.add('show');
    setTimeout(() => pinInput.focus(), 100);
  });
}

/**
 * Handle PIN verification for race join (called by verify button)
 */
async function handleRaceJoinPinVerify(): Promise<void> {
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const modal = document.getElementById('admin-pin-modal');

  if (!pinInput || !modal || !pinVerifyResolver) return;

  const enteredPin = pinInput.value.trim();

  // Authenticate via JWT token exchange
  // Use chiefJudge role if this is for Chief Judge mode verification
  const role = pinVerifyForChiefJudge ? 'chiefJudge' : undefined;
  const result = await authenticateWithPin(enteredPin, role);

  if (result.success) {
    // PIN correct
    closeModal(modal);
    pinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
    pinVerifyResolver(true);
    pinVerifyResolver = null;
    pinVerifyForChiefJudge = false; // Reset flag
  } else {
    // PIN incorrect
    if (errorEl) errorEl.style.display = 'block';
    pinInput.value = '';
    pinInput.focus();
    feedbackWarning();
  }
}

/**
 * Cancel PIN verification for race join
 */
function cancelRaceJoinPinVerify(): void {
  const modal = document.getElementById('admin-pin-modal');
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;

  closeModal(modal);
  if (pinInput) pinInput.value = '';

  if (pinVerifyResolver) {
    pinVerifyResolver(false);
    pinVerifyResolver = null;
  }
  pinVerifyForChiefJudge = false; // Reset flag
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

  // Show loading and set ARIA busy state
  listContainer.setAttribute('aria-busy', 'true');
  if (loadingEl) loadingEl.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  // Remove existing race items
  listContainer.querySelectorAll('.race-item').forEach(item => item.remove());

  try {
    const response = await fetchWithTimeout(ADMIN_API_BASE, {
      headers: getAdminAuthHeaders()
    }, 10000); // 10 second timeout for race list
    if (!response.ok) {
      if (response.status === 401) {
        // API auth failed - server PIN mismatch (should not happen in production)
        const modal = document.getElementById('race-management-modal');
        closeModal(modal);
        showToast(t('authError', lang), 'error');
        console.error('API auth failed - check ADMIN_PIN env variable matches SERVER_API_PIN');
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const races: RaceInfo[] = data.races || [];

    // Hide loading and clear ARIA busy state
    listContainer.setAttribute('aria-busy', 'false');
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
    logError('Admin', 'loadRaceList', error, 'loadError');
    listContainer.setAttribute('aria-busy', 'false');
    if (loadingEl) loadingEl.style.display = 'none';
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
  closeModal(confirmModal);

  try {
    const response = await fetchWithTimeout(`${ADMIN_API_BASE}?raceId=${encodeURIComponent(raceId)}`, {
      method: 'DELETE',
      headers: getAdminAuthHeaders()
    }, 10000); // 10 second timeout for delete

    if (!response.ok) {
      if (response.status === 401) {
        // API auth failed - server PIN mismatch (should not happen in production)
        const modal = document.getElementById('race-management-modal');
        closeModal(modal);
        showToast(t('authError', lang), 'error');
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
      throw new Error(result.error || t('unknownError', lang));
    }
  } catch (error) {
    logError('Admin', 'deleteRace', error, 'deleteError');
  } finally {
    pendingRaceDelete = null;
  }
}
