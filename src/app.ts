import { store } from './store';
import { showToast, destroyToast } from './components';
// DISABLED: Motion effects disabled to save battery
// import { syncService, gpsService, cameraService, captureTimingPhoto, photoStorage, wakeLockService, motionService } from './services';
import { syncService, gpsService, cameraService, captureTimingPhoto, photoStorage, wakeLockService, ambientModeService, voiceModeService } from './services';
import { hasAuthToken, syncFault, deleteFaultFromCloud } from './services/sync';
import { feedbackSuccess, feedbackWarning, feedbackTap, feedbackDelete, feedbackUndo, resumeAudio } from './services';
import { generateEntryId, getPointLabel, getRunLabel, getRunColor, logError, logWarning, TOAST_DURATION } from './utils';
import { logger } from './utils/logger';
import { isValidRaceId, makeNumericInput } from './utils/validation';
import { getElement } from './utils/domCache';
import { t } from './i18n/translations';
import { applyViewServices } from './utils/viewServices';

import { OnboardingController } from './onboarding';
import type { Entry, FaultEntry, TimingPoint, Language, FaultType, DeviceRole, Run, VoiceStatus } from './types';

// Feature modules
import { openModal, closeModal, closeAllModalsAnimated } from './features/modals';
import { initRippleEffects, cleanupRippleEffects } from './features/ripple';
import {
  initClock, destroyClock, initTabs, initNumberPad, initTimingPoints, initRunSelector, initTimestampButton,
  updateBibDisplay, updateTimingPointSelection, updateRunSelection, handleTimerVoiceIntent
} from './features/timerView';
import {
  initRadialTimerView, destroyRadialTimerView, updateRadialBib, isRadialModeActive
} from './features/radialTimerView';
import { openPhotoViewer, closePhotoViewer, deletePhoto } from './features/photoViewer';
import {
  initFaultEditModal, updateActiveBibsList, updateInlineFaultsList, refreshInlineFaultUI,
  openFaultEditModal, openMarkDeletionModal, updateInlineBibSelector, updateInlineGateSelector
} from './features/faultEntry';
import {
  updateGateJudgeTabVisibility, initGateJudgeView,
  updateGateRangeDisplay, updateJudgeReadyStatus, updateGateJudgeRunSelection, handleGateJudgeVoiceIntent
} from './features/gateJudgeView';
import {
  getVirtualList, initResultsView,
  updateStats, updateEntryCountBadge, cleanupSearchTimeout
} from './features/resultsView';
import type { ConfirmModalAction } from './features/resultsView';
import {
  initSettingsView, updateRoleToggle,
  updateSettingsInputs, updateLangToggle, updateTranslations, applySettings,
  applyGlassEffectSettings, cleanupSettingsTimeouts,
  resolvePhotoSyncWarning, resolveRaceChangeDialog
} from './features/settingsView';
import {
  initChiefJudgeToggle, resolvePinVerification
} from './features/chiefJudgeView';
import {
  initRaceManagement, verifyPinForRaceJoin, verifyPinForChiefJudge,
  showRaceChangeDialog, showPhotoSyncWarningModal, handleRaceDeleted, handleAuthExpired,
  cleanupPinVerification, hasPendingPinVerification
} from './features/raceManagement';

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
  initTabs();

  // Check which timer mode to use
  if (isRadialModeActive()) {
    // Radial dial timer mode
    initRadialTimerView();
  } else {
    // Classic timer mode
    initClock();
    initNumberPad();
    initTimingPoints();
    initRunSelector();
    initTimestampButton();
  }
  // Initialize views (now using CustomEvents instead of callbacks)
  initResultsView();
  initSettingsView();
  initGateJudgeView();
  initChiefJudgeToggle();

  // Set up CustomEvent listeners for decoupled module communication
  initCustomEventListeners();
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

  // Initialize ambient mode if enabled
  if (initialState.settings.ambientMode) {
    ambientModeService.initialize();
    // Enable on timer view
    if (initialState.currentView === 'timer') {
      ambientModeService.enable();
    }
  }

  // Subscribe to ambient mode state changes - toggle body class and pause GPS
  ambientModeService.subscribe((state) => {
    document.body.classList.toggle('ambient-mode', state.isActive);
    if (state.triggeredBy) {
      document.body.dataset.ambientTrigger = state.triggeredBy;
    } else {
      delete document.body.dataset.ambientTrigger;
    }

    // Pause/resume GPS during ambient mode to save battery
    const appState = store.getState();
    if (appState.settings.gps) {
      if (state.isActive) {
        gpsService.pause();
      } else if (appState.currentView === 'timer') {
        gpsService.start();
      }
    }
  });

  // Initialize voice mode service (requires LLM API configuration)
  initVoiceMode();

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

  openModal(modal);
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

  openModal(modal);
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

  // Use shared modal closing logic
  closeAllModalsAnimated();
}

/**
 * State change handler map: groups related updates together
 * Each handler receives the current state and returns void
 */
type StateHandler = (state: ReturnType<typeof store.getState>) => void;

const STATE_HANDLERS: Record<string, StateHandler[]> = {
  // Timer view updates (handles both classic and radial modes)
  bibInput: [() => {
    if (isRadialModeActive()) {
      updateRadialBib();
    } else {
      updateBibDisplay();
    }
  }],
  selectedPoint: [() => {
    if (!isRadialModeActive()) {
      updateTimingPointSelection();
    }
    // Radial mode handles this via its own store subscription
  }],

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
 * Handle view changes (wake lock, virtual list pause/resume, ambient mode)
 */
function handleViewChange(state: ReturnType<typeof store.getState>): void {
  updateViewVisibility();

  // Refresh status indicators (ensure they reflect current state on all views)
  updateGpsIndicator();
  updateSyncStatusIndicator();

  // Wake Lock: keep screen on during active timing
  if (state.currentView === 'timer') {
    wakeLockService.enable();
  } else {
    wakeLockService.disable();
  }

  // Ambient Mode: enable only on timer view when setting is enabled
  if (state.currentView === 'timer' && state.settings.ambientMode) {
    ambientModeService.enable();
  } else {
    ambientModeService.disable();
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

  // Handle ambient mode setting changes
  const state = store.getState();
  if (state.settings.ambientMode) {
    ambientModeService.initialize();
    if (state.currentView === 'timer') {
      ambientModeService.enable();
    }
  } else {
    ambientModeService.disable();
  }
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

  // Update timer display based on mode
  if (isRadialModeActive()) {
    updateRadialBib();
  } else {
    updateBibDisplay();
    updateTimingPointSelection();
  }

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
    dot.classList.remove('active', 'searching', 'paused');
    if (state.gpsStatus === 'active') {
      dot.classList.add('active');
    } else if (state.gpsStatus === 'searching') {
      dot.classList.add('searching');
    } else if (state.gpsStatus === 'paused') {
      // GPS was working but is now paused (e.g., not on timer view) - show green without animation
      dot.classList.add('paused');
    }
    // 'inactive' status = no class = red (GPS not working or permission denied)
  }

  if (text) {
    const lang = store.getState().currentLang;
    text.textContent = t('gps', lang);
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
 * Initialize voice mode service
 * Uses server-side proxy at /api/v1/voice for LLM processing
 */
function initVoiceMode(): void {
  // Check if voice mode is supported
  if (!voiceModeService.isSupported()) {
    logger.debug('[VoiceMode] Not supported in this browser');
    return;
  }

  // Use server-side proxy endpoint - API key is stored on server
  // This keeps the Anthropic API key secure and handles all LLM calls server-side
  const proxyEndpoint = '/api/v1/voice';

  // Check for custom config override (for development/testing)
  const customConfig = (window as unknown as Record<string, unknown>).VOICE_LLM_CONFIG as {
    endpoint?: string;
    apiKey?: string;
  } | undefined;

  const llmConfig = {
    endpoint: customConfig?.endpoint || proxyEndpoint,
    apiKey: customConfig?.apiKey || 'proxy' // Proxy handles auth server-side
  };

  // Initialize voice mode with LLM configuration
  const initialized = voiceModeService.initialize(llmConfig);

  if (!initialized) {
    logger.warn('[VoiceMode] Failed to initialize');
    return;
  }

  // Subscribe to voice status changes
  voiceModeService.onStatusChange((status: VoiceStatus) => {
    updateVoiceIndicator(status);
  });

  // Subscribe to voice intents
  voiceModeService.onAction((intent) => {
    const state = store.getState();

    // Route intent to appropriate handler based on role
    if (state.deviceRole === 'gateJudge') {
      handleGateJudgeVoiceIntent(intent);
    } else {
      handleTimerVoiceIntent(intent);
    }
  });

  logger.debug('[VoiceMode] Initialized successfully');
}

/**
 * Update voice indicator in header
 */
function updateVoiceIndicator(status: VoiceStatus): void {
  const indicator = getElement('voice-indicator');
  const statusText = getElement('voice-status-text');

  if (!indicator) return;

  // Show/hide indicator based on status
  if (status === 'inactive') {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'flex';

  // Remove all status classes
  indicator.classList.remove('listening', 'processing', 'confirming', 'offline', 'error');

  // Add current status class
  indicator.classList.add(status);

  // Update status text
  if (statusText) {
    const lang = store.getState().currentLang;
    switch (status) {
      case 'listening':
        statusText.textContent = t('voiceListening', lang);
        break;
      case 'processing':
        statusText.textContent = t('voiceProcessing', lang);
        break;
      case 'confirming':
        statusText.textContent = t('voiceConfirming', lang);
        break;
      case 'offline':
        statusText.textContent = t('voiceOffline', lang);
        break;
      case 'error':
        statusText.textContent = t('voiceError', lang);
        break;
    }
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

  logger.error('[Storage] saveEntries:', event.detail.message, { entryCount, isQuotaError });
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
  // Cleanup timer components (both modes)
  try {
    destroyClock();
    destroyRadialTimerView();
  } catch (e) {
    logger.warn('Timer cleanup error:', e);
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

  // Cleanup ambient mode service
  ambientModeService.cleanup();

  // Cleanup voice mode service
  voiceModeService.cleanup();

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

/**
 * Initialize CustomEvent listeners for decoupled module communication
 * Replaces the old callback injection pattern
 */
function initCustomEventListeners(): void {
  // Results view events
  window.addEventListener('open-edit-modal', ((e: CustomEvent<{ entry: Entry }>) => {
    openEditModal(e.detail.entry);
  }) as EventListener);

  window.addEventListener('prompt-delete', ((e: CustomEvent<{ entry: Entry }>) => {
    promptDelete(e.detail.entry);
  }) as EventListener);

  window.addEventListener('open-confirm-modal', ((e: CustomEvent<{ action: ConfirmModalAction }>) => {
    openConfirmModal(e.detail.action);
  }) as EventListener);

  // Settings view events
  window.addEventListener('request-photo-sync-warning', (async () => {
    try {
      await showPhotoSyncWarningModal();
      resolvePhotoSyncWarning();
    } catch (err) {
      logger.error('Photo sync warning modal failed:', err);
      resolvePhotoSyncWarning(); // Resolve anyway to prevent hanging
    }
  }) as EventListener);

  window.addEventListener('request-race-change-dialog', (async (e: Event) => {
    try {
      const customEvent = e as CustomEvent<{ type: 'synced' | 'unsynced'; lang: Language }>;
      const result = await showRaceChangeDialog(customEvent.detail.type, customEvent.detail.lang);
      resolveRaceChangeDialog(result);
    } catch (err) {
      logger.error('Race change dialog failed:', err);
      resolveRaceChangeDialog('cancel'); // Safe default to prevent hanging
    }
  }) as EventListener);

  // Gate judge view events
  window.addEventListener('update-role-toggle', (() => {
    updateRoleToggle();
  }) as EventListener);

  // Chief judge view events - PIN verification (Promise-based)
  window.addEventListener('request-pin-verification', (async (e: Event) => {
    try {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      const verified = await verifyPinForChiefJudge(customEvent.detail.lang);
      resolvePinVerification(verified);
    } catch (err) {
      logger.error('PIN verification failed:', err);
      resolvePinVerification(false); // Deny access on error
    }
  }) as EventListener);

  // Chief judge view events - fault modal dispatchers
  window.addEventListener('open-fault-edit-modal', ((e: CustomEvent<{ fault: FaultEntry }>) => {
    openFaultEditModal(e.detail.fault);
  }) as EventListener);

  window.addEventListener('open-mark-deletion-modal', ((e: CustomEvent<{ fault: FaultEntry }>) => {
    openMarkDeletionModal(e.detail.fault);
  }) as EventListener);

  // Chief judge view events - inline fault UI updates (gate judge mode)
  window.addEventListener('update-inline-faults-list', (() => {
    updateInlineFaultsList();
  }) as EventListener);

  window.addEventListener('update-inline-bib-selector', (() => {
    updateInlineBibSelector();
  }) as EventListener);

  window.addEventListener('update-inline-gate-selector', (() => {
    updateInlineGateSelector();
  }) as EventListener);
}
