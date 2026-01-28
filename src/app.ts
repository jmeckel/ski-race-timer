import { store } from './store';
import { showToast, destroyToast } from './components';
// DISABLED: Motion effects disabled to save battery
// import { syncService, gpsService, cameraService, captureTimingPhoto, photoStorage, wakeLockService, motionService } from './services';
import { syncService, gpsService, cameraService, captureTimingPhoto, photoStorage, wakeLockService } from './services';
import { hasAuthToken, syncFault, deleteFaultFromCloud } from './services/sync';
import { feedbackSuccess, feedbackWarning, feedbackTap, feedbackDelete, feedbackUndo, resumeAudio } from './services';
import { generateEntryId, getPointLabel, getRunLabel, getRunColor, logError, logWarning, TOAST_DURATION } from './utils';
import { isValidRaceId, makeNumericInput } from './utils/validation';
import { getElement } from './utils/domCache';
import { t } from './i18n/translations';
import { applyViewServices } from './utils/viewServices';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { OnboardingController } from './onboarding';
import type { Entry, FaultEntry, TimingPoint, Language, RaceInfo, FaultType, DeviceRole, Run } from './types';

// Feature modules
import { closeModal } from './features/modals';
import { initRippleEffects, cleanupRippleEffects } from './features/ripple';
import {
  initClock, destroyClock, initTabs, initNumberPad, initTimingPoints, initRunSelector, initTimestampButton,
  updateBibDisplay, updateTimingPointSelection, updateRunSelection
} from './features/timerView';
import { openPhotoViewer, closePhotoViewer, deletePhoto } from './features/photoViewer';
import {
  initFaultEditModal, updateActiveBibsList, updateInlineFaultsList, refreshInlineFaultUI
} from './features/faultEntry';
import {
  setUpdateRoleToggleCallback, updateGateJudgeTabVisibility, initGateJudgeView,
  updateGateRangeDisplay, updateJudgeReadyStatus, updateGateJudgeRunSelection
} from './features/gateJudgeView';
import {
  setResultsViewCallbacks, getVirtualList, initResultsView,
  updateStats, updateEntryCountBadge, cleanupSearchTimeout
} from './features/resultsView';
import {
  setSettingsViewCallbacks, initSettingsView, updateRoleToggle,
  updateSettingsInputs, updateLangToggle, updateTranslations, applySettings,
  applyGlassEffectSettings, cleanupSettingsTimeouts
} from './features/settingsView';
import {
  initRaceManagement, verifyPinForRaceJoin, verifyPinForChiefJudge,
  showRaceChangeDialog, showPhotoSyncWarningModal, handleRaceDeleted, handleAuthExpired,
  cleanupPinVerification, hasPendingPinVerification
} from './features/raceManagement';

// Initialize Vercel Speed Insights
injectSpeedInsights();

// DOM Elements cache
let onboardingController: OnboardingController | null = null;

/**
 * Initialize the application
 */
export function initApp(): void {
  // Set version in UI
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = __APP_VERSION__;

  // Version info button - copy debug info to clipboard
  const versionInfoBtn = document.getElementById('version-info-btn');
  if (versionInfoBtn) {
    versionInfoBtn.addEventListener('click', async () => {
      const state = store.getState();
      const debugInfo = [
        `Ski Race Timer v${__APP_VERSION__}`,
        `Device: ${state.deviceName || 'Unknown'}`,
        `Role: ${state.deviceRole}`,
        `Race ID: ${state.raceId || 'None'}`,
        `Entries: ${state.entries.length}`,
        `Sync: ${state.settings.sync ? 'On' : 'Off'}`,
        `Language: ${state.currentLang.toUpperCase()}`,
        `User Agent: ${navigator.userAgent}`,
        `Screen: ${window.screen.width}x${window.screen.height}`,
        `Viewport: ${window.innerWidth}x${window.innerHeight}`,
        `Online: ${navigator.onLine}`,
        `Timestamp: ${new Date().toISOString()}`
      ].join('\n');

      try {
        await navigator.clipboard.writeText(debugInfo);
        showToast(t('debugInfoCopied', state.currentLang), 'success');
      } catch {
        // Fallback: show in alert
        showToast(t('debugInfoCopyFailed', state.currentLang), 'warning');
      }
      feedbackTap();
    });
  }

  // Initialize components
  initClock();
  initTabs();
  initNumberPad();
  initTimingPoints();
  initRunSelector();
  initTimestampButton();
  // Set callbacks for resultsView before initialization
  // (callbacks needed to avoid circular imports: app.ts imports from resultsView.ts)
  setResultsViewCallbacks({
    openEditModal,
    promptDelete,
    openConfirmModal
  });
  initResultsView();
  // Set callbacks for settingsView before initialization
  // (callbacks needed to avoid circular imports: app.ts imports from settingsView.ts)
  setSettingsViewCallbacks({
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
    const entryWord = count === 1 ? t('entry', lang) : t('entries', lang);
    if (titleEl) titleEl.textContent = t('confirmDelete', lang);
    if (textEl) textEl.textContent = `${count} ${entryWord} ${t('selected', lang)}`;
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
  if (adminPinModal?.classList.contains('show') && hasPendingPinVerification()) {
    cleanupPinVerification();
    // Clear the input as well
    const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
    if (pinInput) pinInput.value = '';
  }

  document.querySelectorAll('.modal-overlay.show').forEach(modal => {
    closeModal(modal as HTMLElement);
  });
}

/**
 * State change handler map: groups related updates together
 * Each handler receives the current state and returns void
 */
type StateHandler = (state: ReturnType<typeof store.getState>) => void;

const STATE_HANDLERS: Record<string, StateHandler[]> = {
  // Timer view updates
  bibInput: [() => updateBibDisplay()],
  selectedPoint: [() => updateTimingPointSelection()],

  // Run selection updates both timer and gate judge views
  selectedRun: [(state) => {
    updateRunSelection();
    updateGateJudgeRunSelection();
    if (state.currentView === 'gateJudge') updateActiveBibsList();
  }],

  // Entry updates affect results list and gate judge view
  entries: [(state) => {
    const vList = getVirtualList();
    if (vList) vList.setEntries(state.entries);
    updateStats();
    updateEntryCountBadge();
    if (state.currentView === 'gateJudge') updateActiveBibsList();
  }],

  // Gate Judge role/state updates
  deviceRole: [() => {
    updateRoleToggle();
    updateGateJudgeTabVisibility();
    updateJudgeReadyStatus();
  }],
  isJudgeReady: [() => updateJudgeReadyStatus()],
  gateAssignment: [() => updateGateRangeDisplay()],
  faultEntries: [(state) => {
    if (state.currentView === 'gateJudge') updateActiveBibsList();
  }],

  // Status indicators
  syncStatus: [() => updateSyncStatusIndicator()],
  cloudDeviceCount: [() => updateSyncStatusIndicator()],
  gpsStatus: [() => {
    updateGpsIndicator();
    updateJudgeReadyStatus();
  }],
  undoStack: [() => updateUndoButton()],
};

/**
 * Handle view changes (wake lock, virtual list pause/resume)
 */
function handleViewChange(state: ReturnType<typeof store.getState>): void {
  updateViewVisibility();

  // Wake Lock: keep screen on during active timing
  if (state.currentView === 'timer') {
    wakeLockService.enable();
  } else {
    wakeLockService.disable();
  }

  // VirtualList: pause when not on results view to save resources
  const virtualList = getVirtualList();
  if (virtualList) {
    if (state.currentView === 'results') {
      virtualList.resume();
    } else {
      virtualList.pause();
    }
  }
}

/**
 * Handle settings changes
 */
function handleSettingsChange(): void {
  updateSyncStatusIndicator();
  updateGpsIndicator();
  updateJudgeReadyStatus();
  updatePhotoCaptureIndicator();
  applyGlassEffectSettings();
}

/**
 * Handle state changes - dispatches to appropriate handlers
 */
function handleStateChange(state: ReturnType<typeof store.getState>, changedKeys: (keyof typeof state)[]): void {
  // Handle view changes (complex logic extracted to separate function)
  if (changedKeys.includes('currentView')) {
    handleViewChange(state);
  }

  // Handle settings changes (affects multiple indicators)
  if (changedKeys.includes('settings')) {
    handleSettingsChange();
    applyViewServices(state);
  }

  // Handle currentView + settings combo for services
  if (changedKeys.includes('currentView') && !changedKeys.includes('settings')) {
    applyViewServices(state);
  }

  // Dispatch to mapped handlers
  for (const key of changedKeys) {
    const handlers = STATE_HANDLERS[key];
    if (handlers) {
      for (const handler of handlers) {
        handler(state);
      }
    }
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
  const indicator = getElement('sync-indicator');
  const dot = getElement('sync-indicator')?.querySelector('.sync-dot');
  const text = getElement('sync-indicator')?.querySelector('.sync-status-text');
  const deviceCountEl = getElement('sync-device-count');

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
  const indicator = getElement('gps-indicator');
  const dot = indicator?.querySelector('.gps-dot');
  const text = indicator?.querySelector('.gps-status-text');

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
  const cameraIndicator = getElement('camera-indicator');
  if (cameraIndicator) {
    cameraIndicator.style.display = state.settings.photoCapture ? 'flex' : 'none';
  }
}

/**
 * Update undo button state
 */
function updateUndoButton(): void {
  const undoBtn = getElement('undo-btn');
  if (undoBtn) {
    undoBtn.toggleAttribute('disabled', !store.canUndo());
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
  cleanupPinVerification();
}
