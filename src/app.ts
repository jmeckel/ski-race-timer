import { store } from './store';
import { Clock, VirtualList, showToast, destroyToast, PullToRefresh } from './components';
// DISABLED: Motion effects disabled to save battery
// import { syncService, gpsService, cameraService, captureTimingPhoto, photoStorage, wakeLockService, motionService } from './services';
import { syncService, gpsService, cameraService, captureTimingPhoto, photoStorage, wakeLockService } from './services';
import { hasAuthToken, exchangePinForToken, clearAuthToken, syncFault, deleteFaultFromCloud } from './services/sync';
import { feedbackSuccess, feedbackWarning, feedbackTap, feedbackDelete, feedbackUndo, resumeAudio } from './services';
import { generateEntryId, getPointLabel, getRunLabel, getRunColor, logError, logWarning, TOAST_DURATION, fetchWithTimeout } from './utils';
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

// Initialize Vercel Speed Insights
injectSpeedInsights();

// Admin API configuration
const ADMIN_API_BASE = '/api/admin/races';
const AUTH_TOKEN_KEY = 'skiTimerAuthToken'; // localStorage key for JWT auth token

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
 */
async function authenticateWithPin(pin: string): Promise<{ success: boolean; error?: string; isNewPin?: boolean }> {
  const result = await exchangePinForToken(pin);
  if (result.success) {
    updatePinStatusDisplay();
  }
  return result;
}

// DOM Elements cache
let clock: Clock | null = null;
let virtualList: VirtualList | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let pullToRefreshInstance: PullToRefresh | null = null;
let onboardingController: OnboardingController | null = null;

// MEMORY LEAK FIX: Track debounced timeouts for cleanup on page unload
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let raceCheckTimeout: ReturnType<typeof setTimeout> | null = null;

// Track search input listener for cleanup on re-init
let searchInputListener: ((e: Event) => void) | null = null;
let settingsRecentRacesDocumentHandler: ((event: MouseEvent) => void) | null = null;

// Track race check request ID to ignore stale responses
let raceCheckRequestId = 0;

// Resolver for PIN verification promise (used by closeAllModals cleanup)
let pinVerifyResolver: ((verified: boolean) => void) | null = null;

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
  initResultsView();
  initSettingsView();
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
      const view = btn.getAttribute('data-view') as 'timer' | 'results' | 'settings' | 'gateJudge';
      if (view) {
        store.setView(view);
        feedbackTap();
        // Update ARIA states for accessibility
        tabBtns.forEach(t => {
          t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
        });
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
      // Update ARIA states for accessibility
      container.querySelectorAll('.timing-point-btn').forEach(b => {
        b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
      });
    }
  });
}

/**
 * Initialize run selector
 */
function initRunSelector(): void {
  const container = document.getElementById('run-selector');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.run-btn');
    if (!btn) return;

    const runStr = btn.getAttribute('data-run');
    const run = runStr ? parseInt(runStr, 10) as 1 | 2 : 1;
    store.setSelectedRun(run);
    feedbackTap();
    // Update ARIA states for accessibility
    container.querySelectorAll('.run-btn').forEach(b => {
      b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
    });
  });
}

// DISABLED: Motion effects disabled to save battery
// // Track if we've requested motion permission
// let motionPermissionRequested = false;

/**
 * Initialize timestamp button
 */
function initTimestampButton(): void {
  const btn = document.getElementById('timestamp-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    // DISABLED: Motion effects disabled to save battery
    // // Request motion permission on first click (iOS 13+ requires user gesture)
    // if (!motionPermissionRequested && store.getState().settings.motionEffects) {
    //   motionPermissionRequested = true;
    //   if (motionService.requiresPermission()) {
    //     const granted = await motionService.requestPermission();
    //     if (granted) {
    //       await motionService.initialize();
    //     }
    //   } else if (motionService.isSupported()) {
    //     await motionService.initialize();
    //   }
    // }
    await recordTimestamp();
  });

  // Keyboard shortcut - skip if user is typing in an input field
  document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement?.tagName;
    if (e.key === 'Enter' &&
        store.getState().currentView === 'timer' &&
        activeTag !== 'INPUT' &&
        activeTag !== 'TEXTAREA') {
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
      run: state.selectedRun,
      timestamp: preciseTimestamp,
      status: 'ok',
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      gpsCoords
    };

    // Capture photo asynchronously - don't block timestamp recording
    // Photos are stored in IndexedDB (separate from localStorage) to avoid quota limits
    if (state.settings.photoCapture) {
      // Capture entry ID in local const to prevent race condition
      // This ensures photo attaches to correct entry even if multiple timestamps recorded rapidly
      const entryId = entry.id;
      captureTimingPhoto()
        .then(async (photo) => {
          if (photo) {
            try {
              // RACE CONDITION FIX: Verify entry still exists before updating
              // Entry could have been deleted while photo was being captured
              const currentState = store.getState();
              const entryStillExists = currentState.entries.some(e => e.id === entryId);
              if (!entryStillExists) {
                console.warn('Entry was deleted before photo could be attached:', entryId);
                return;
              }

              // Store photo in IndexedDB (not in entry to save localStorage space)
              // Note: Photo storage is best-effort - failures are logged but don't block timing
              const saved = await photoStorage.savePhoto(entryId, photo);
              if (saved) {
                // Mark entry as having a photo - updateEntry returns false if entry was deleted
                const updated = store.updateEntry(entryId, { photo: 'indexeddb' });
                if (!updated) {
                  // Entry was deleted during save - clean up orphaned photo
                  console.warn('Entry deleted during photo save, removing orphaned photo:', entryId);
                  await photoStorage.deletePhoto(entryId);
                }
              } else {
                // Photo save failed - log and notify user, but don't retry (performance priority)
                console.warn('Photo save failed for entry:', entryId);
                const lang = store.getState().currentLang;
                showToast(t('photoSaveFailed', lang), 'warning');
              }
            } catch (err) {
              logWarning('Camera', 'photo save/update', err, 'photoError');
            }
          }
        })
        .catch(err => {
          // Show specific toast for photo too large error
          if (err instanceof Error && err.name === 'PhotoTooLargeError') {
            const lang = store.getState().currentLang;
            showToast(t('photoTooLarge', lang), 'warning');
          } else {
            logWarning('Camera', 'captureTimingPhoto', err, 'photoError');
          }
        });
    }

    // Check for duplicate (only if bib is entered)
    // Duplicate = same bib + point + run combination
    const isDuplicate = entry.bib && state.entries.some(
      e => e.bib === entry.bib && e.point === entry.point && (e.run ?? 1) === entry.run
    );

    // Check for zero bib (e.g., "000")
    const hasZeroBib = isZeroBib(entry.bib);

    // Add entry
    store.addEntry(entry);

    // Show feedback - prioritize duplicate warning over zero bib warning
    if (isDuplicate) {
      feedbackWarning();
      showDuplicateWarning(entry);
    } else if (hasZeroBib) {
      feedbackWarning();
      showZeroBibWarning(entry);
    } else {
      feedbackSuccess();
      showConfirmation(entry);
    }

    // Sync to cloud
    syncService.broadcastEntry(entry);

    // Auto-increment bib after recording (for both Start and Finish)
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
    } else if (!state.settings.auto) {
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
  const runEl = overlay.querySelector('.confirmation-run') as HTMLElement | null;
  const timeEl = overlay.querySelector('.confirmation-time') as HTMLElement | null;

  const state = store.getState();

  if (bibEl) bibEl.textContent = entry.bib || '---';
  if (pointEl) {
    pointEl.textContent = getPointLabel(entry.point, state.currentLang);
    pointEl.style.color = getPointColor(entry.point);
  }
  if (runEl && entry.run) {
    runEl.textContent = getRunLabel(entry.run, state.currentLang);
    runEl.style.color = getRunColor(entry.run);
  }
  if (timeEl) {
    const date = new Date(entry.timestamp);
    timeEl.textContent = formatTimeDisplay(date);
  }

  // Set timing point for colored border (green=Start, orange=Finish)
  overlay.dataset.point = entry.point;
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
 * Show zero bib warning (when bib is "000" or all zeros)
 */
function showZeroBibWarning(entry: Entry): void {
  const overlay = document.getElementById('confirmation-overlay');
  if (!overlay) return;

  const warningEl = overlay.querySelector('.confirmation-zero-bib') as HTMLElement | null;
  if (warningEl) {
    warningEl.style.display = 'flex';
  }

  showConfirmation(entry);

  setTimeout(() => {
    if (warningEl) warningEl.style.display = 'none';
  }, 2500);
}

/**
 * Check if bib is all zeros (e.g., "0", "00", "000")
 */
function isZeroBib(bib: string): boolean {
  if (!bib) return false;
  // Check if bib consists only of zeros
  return /^0+$/.test(bib);
}

/**
 * Update last recorded entry display
 */
function updateLastRecorded(entry: Entry): void {
  const el = document.getElementById('last-recorded');
  if (!el) return;

  const bibEl = el.querySelector('.bib') as HTMLElement | null;
  const pointEl = el.querySelector('.point') as HTMLElement | null;
  const runEl = el.querySelector('.run') as HTMLElement | null;
  const timeEl = el.querySelector('.time') as HTMLElement | null;

  const state = store.getState();

  if (bibEl) bibEl.textContent = entry.bib || '---';
  if (pointEl) {
    pointEl.textContent = getPointLabel(entry.point, state.currentLang);
    pointEl.style.background = `${getPointColor(entry.point)}20`;
    pointEl.style.color = getPointColor(entry.point);
  }
  if (runEl && entry.run) {
    runEl.textContent = getRunLabel(entry.run, state.currentLang);
    runEl.style.background = `${getRunColor(entry.run)}20`;
    runEl.style.color = getRunColor(entry.run);
  }
  if (timeEl) {
    const date = new Date(entry.timestamp);
    timeEl.textContent = formatTimeDisplay(date);
  }

  el.classList.add('visible');

  // Trigger pulse animation
  el.classList.remove('pulse');
  // Force reflow to restart animation
  void el.offsetWidth;
  el.classList.add('pulse');
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

  // Listen for fault edit requests from VirtualList
  container.addEventListener('fault-edit-request', ((e: CustomEvent) => {
    const fault = e.detail?.fault as FaultEntry;
    if (fault) {
      openFaultEditModal(fault);
    }
  }) as EventListener);

  // Listen for fault delete requests from VirtualList
  container.addEventListener('fault-delete-request', ((e: CustomEvent) => {
    const fault = e.detail?.fault as FaultEntry;
    if (fault) {
      openMarkDeletionModal(fault);
    }
  }) as EventListener);

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
    // Clear any pending search timeout from previous initialization
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    // Remove old listener if re-initializing to prevent duplicates
    if (searchInputListener) {
      searchInput.removeEventListener('input', searchInputListener);
    }

    // Create and store new listener
    searchInputListener = () => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        applyFilters();
      }, 300);
    };
    searchInput.addEventListener('input', searchInputListener);
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

  // Pause VirtualList if not starting on results view
  // It will be resumed when user switches to results tab
  if (state.currentView !== 'results' && virtualList) {
    virtualList.pause();
  }
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
        // Check if this is a destructive undo (undoing ADD_ENTRY deletes an entry)
        const nextAction = store.peekUndo();
        if (nextAction && nextAction.type === 'ADD_ENTRY') {
          // Show confirmation modal for destructive undo
          openConfirmModal('undoAdd');
        } else {
          // Non-destructive undo - proceed immediately
          const result = store.undo();
          feedbackUndo();
          showToast(t('undone', store.getState().currentLang), 'success');

          // Sync undo to cloud if needed
          const state = store.getState();
          if (result && result.type === 'ADD_ENTRY' && state.settings.sync && state.raceId) {
            const entry = result.data as Entry;
            syncService.deleteEntryFromCloud(entry.id, entry.deviceId);
          }
        }
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

  // Chief Judge toggle
  initChiefJudgeToggle();
}

/**
 * Initialize Chief Judge toggle button
 */
function initChiefJudgeToggle(): void {
  const toggleBtn = document.getElementById('chief-judge-toggle-btn');
  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', async () => {
    const state = store.getState();
    const lang = state.currentLang;

    // If already in Chief Judge mode, allow exiting without PIN
    if (state.isChiefJudgeView) {
      store.toggleChiefJudgeView();
      updateChiefJudgeView();
      feedbackTap();
      showToast(t('chiefJudgeModeDisabled', lang), 'info');
      return;
    }

    // Entering Chief Judge mode - require PIN verification if sync is enabled
    if (state.settings.sync && state.raceId) {
      const verified = await verifyPinForChiefJudge(lang);
      if (!verified) {
        // PIN verification failed or cancelled
        return;
      }
    }

    // PIN verified or sync not enabled - enter Chief Judge mode
    store.toggleChiefJudgeView();
    updateChiefJudgeView();
    feedbackTap();
    showToast(t('chiefJudgeModeEnabled', lang), 'info');
  });

  // Update visibility based on sync and faults
  updateChiefJudgeToggleVisibility();

  // Subscribe to state changes to update visibility and refresh panel
  store.subscribe((state, keys) => {
    if (keys.includes('settings') || keys.includes('faultEntries')) {
      updateChiefJudgeToggleVisibility();
    }
    // Refresh fault summary panel when faults or penalty config change and panel is visible
    if ((keys.includes('faultEntries') || keys.includes('penaltySeconds') || keys.includes('usePenaltyMode')) && state.isChiefJudgeView) {
      updateFaultSummaryPanel();
      updatePendingDeletionsPanel();
    }
    // Update penalty UI when config changes
    if (keys.includes('penaltySeconds') || keys.includes('usePenaltyMode')) {
      updatePenaltyConfigUI();
    }
    // Update judges overview when entries change (sync polling) and panel is visible
    // Entries change when sync happens, which is also when gate assignments are fetched
    if ((keys.includes('entries') || keys.includes('faultEntries') || keys.includes('isJudgeReady')) && state.isChiefJudgeView) {
      updateJudgesOverview();
    }
    // Update inline fault list when faults change and device is a gate judge
    if (keys.includes('faultEntries') && state.deviceRole === 'gateJudge') {
      updateInlineFaultsList();
      updateInlineBibSelector();
    }
    // Update inline bib selector when entries change (new starts/finishes) and device is a gate judge
    if (keys.includes('entries') && state.deviceRole === 'gateJudge') {
      updateInlineBibSelector();
    }
    // Update inline gate selector when gate assignment changes
    if (keys.includes('gateAssignment') && state.deviceRole === 'gateJudge') {
      updateInlineGateSelector();
    }
  });

  // Initialize penalty configuration handlers
  initPenaltyConfig();

  // Initialize chief export handlers
  initChiefExportHandlers();
}

/**
 * Initialize chief judge export button handlers
 */
function initChiefExportHandlers(): void {
  // CSV export button
  const csvBtn = document.getElementById('export-csv-btn');
  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      feedbackTap();
      exportResults();
    });
  }

  // Summary export button
  const summaryBtn = document.getElementById('export-summary-btn');
  if (summaryBtn) {
    summaryBtn.addEventListener('click', () => {
      feedbackTap();
      exportChiefSummary();
    });
  }

  // WhatsApp export button
  const whatsappBtn = document.getElementById('export-whatsapp-btn');
  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
      feedbackTap();
      exportFaultSummaryWhatsApp();
    });
  }
}

/**
 * Initialize penalty configuration UI handlers
 */
function initPenaltyConfig(): void {
  // Mode toggle buttons
  const modeToggle = document.getElementById('penalty-mode-toggle');
  if (modeToggle) {
    modeToggle.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.penalty-mode-btn');
      if (!btn) return;

      const mode = btn.getAttribute('data-mode');
      if (mode === 'penalty') {
        store.setUsePenaltyMode(true);
      } else if (mode === 'dsq') {
        store.setUsePenaltyMode(false);
      }
      feedbackTap();
    });
  }

  // Penalty seconds adjustment buttons
  const secondsSelector = document.getElementById('penalty-seconds-selector');
  if (secondsSelector) {
    secondsSelector.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.penalty-adj-btn');
      if (!btn) return;

      const adj = btn.getAttribute('data-adj');
      const state = store.getState();
      const current = state.penaltySeconds;

      if (adj === '+1') {
        store.setPenaltySeconds(current + 1);
      } else if (adj === '-1') {
        store.setPenaltySeconds(current - 1);
      }
      feedbackTap();
    });
  }

  // Set initial UI state
  updatePenaltyConfigUI();
}

/**
 * Update penalty configuration UI to reflect current state
 */
function updatePenaltyConfigUI(): void {
  const state = store.getState();
  const configRow = document.getElementById('penalty-config-row');
  const secondsValue = document.getElementById('penalty-seconds-value');
  const modeToggle = document.getElementById('penalty-mode-toggle');

  if (configRow) {
    configRow.classList.toggle('dsq-mode', !state.usePenaltyMode);
  }

  if (secondsValue) {
    secondsValue.textContent = String(state.penaltySeconds);
  }

  if (modeToggle) {
    const buttons = modeToggle.querySelectorAll('.penalty-mode-btn');
    buttons.forEach(btn => {
      const mode = btn.getAttribute('data-mode');
      const isActive = (mode === 'penalty' && state.usePenaltyMode) ||
                       (mode === 'dsq' && !state.usePenaltyMode);
      btn.classList.toggle('active', isActive);
    });
  }
}

/**
 * Update Chief Judge toggle button visibility
 * Only show when sync is enabled and there are faults to review
 */
function updateChiefJudgeToggleVisibility(): void {
  const toggleRow = document.getElementById('chief-judge-toggle-row');
  if (!toggleRow) return;

  const state = store.getState();
  // Show toggle when sync is enabled (even if no faults yet - chief may want to monitor)
  const shouldShow = state.settings.sync;
  toggleRow.style.display = shouldShow ? 'block' : 'none';
}

/**
 * Update Chief Judge view state
 */
function updateChiefJudgeView(): void {
  const state = store.getState();
  const resultsView = document.querySelector('.results-view');
  const toggleBtn = document.getElementById('chief-judge-toggle-btn');

  if (!resultsView || !toggleBtn) return;

  // Toggle active state on button and view
  toggleBtn.classList.toggle('active', state.isChiefJudgeView);
  resultsView.classList.toggle('chief-mode', state.isChiefJudgeView);

  // Populate panels when entering chief mode
  if (state.isChiefJudgeView) {
    updateFaultSummaryPanel();
    updatePendingDeletionsPanel();
    updateJudgesOverview();
  }
}

/**
 * Update the judges overview section in Chief Judge panel
 */
function updateJudgesOverview(): void {
  const overviewList = document.getElementById('judges-overview-list');
  const overviewCount = document.getElementById('judges-overview-count');
  const emptyState = document.getElementById('judges-overview-empty');

  if (!overviewList || !overviewCount) return;

  // Get all gate assignments from sync service
  const assignments = syncService.getOtherGateAssignments();

  // Also include this device if it's a gate judge
  const state = store.getState();
  const allJudges: import('./types').GateAssignment[] = [...assignments];

  if (state.deviceRole === 'gateJudge' && state.gateAssignment) {
    allJudges.push({
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      gateStart: state.gateAssignment[0],
      gateEnd: state.gateAssignment[1],
      lastSeen: Date.now(),
      isReady: state.isJudgeReady
    });
  }

  // Update count
  overviewCount.textContent = String(allJudges.length);

  // Show/hide empty state
  if (emptyState) {
    emptyState.style.display = allJudges.length === 0 ? 'block' : 'none';
  }

  // Build judge cards
  const existingCards = overviewList.querySelectorAll('.judge-card');
  existingCards.forEach(card => card.remove());

  if (allJudges.length === 0) return;

  // Sort by gate start
  allJudges.sort((a, b) => a.gateStart - b.gateStart);

  const cardsHtml = allJudges.map(judge => `
    <div class="judge-card${judge.isReady ? ' ready' : ''}">
      <span class="judge-ready-indicator"></span>
      <span class="judge-name" title="${judge.deviceName}">${judge.deviceName}</span>
      <span class="judge-gates">${judge.gateStart}–${judge.gateEnd}</span>
    </div>
  `).join('');

  if (emptyState) {
    emptyState.insertAdjacentHTML('beforebegin', cardsHtml);
  } else {
    overviewList.innerHTML = cardsHtml;
  }
}

/**
 * Update the fault summary panel in Chief Judge view
 * Groups faults by bib number and shows summary for each racer
 */
function updateFaultSummaryPanel(): void {
  const summaryList = document.getElementById('fault-summary-list');
  const summaryCount = document.getElementById('fault-summary-count');
  const emptyState = document.getElementById('chief-empty-state');

  if (!summaryList || !summaryCount) return;

  const state = store.getState();
  const lang = state.currentLang;
  const faults = state.faultEntries;

  // Group faults by bib number
  const faultsByBib = new Map<string, import('./types').FaultEntry[]>();
  for (const fault of faults) {
    const key = `${fault.bib}-${fault.run}`;
    if (!faultsByBib.has(key)) {
      faultsByBib.set(key, []);
    }
    faultsByBib.get(key)!.push(fault);
  }

  // Update count badge
  summaryCount.textContent = String(faultsByBib.size);

  // Show/hide empty state
  if (emptyState) {
    emptyState.style.display = faultsByBib.size === 0 ? 'flex' : 'none';
  }

  if (faultsByBib.size === 0) {
    // Clear any existing cards (except empty state)
    const cards = summaryList.querySelectorAll('.fault-summary-card');
    cards.forEach(card => card.remove());
    return;
  }

  // Build fault summary cards HTML
  const cardsHtml: string[] = [];

  // Sort by bib number
  const sortedEntries = Array.from(faultsByBib.entries()).sort((a, b) => {
    const [keyA] = a;
    const [keyB] = b;
    const bibA = parseInt(keyA.split('-')[0], 10) || 0;
    const bibB = parseInt(keyB.split('-')[0], 10) || 0;
    return bibA - bibB;
  });

  for (const [key, racerFaults] of sortedEntries) {
    const [bib, runStr] = key.split('-');
    const run = parseInt(runStr, 10) as import('./types').Run;

    // Check if this racer is finalized
    const isFinalized = store.isRacerFinalized(bib, run);

    // Count active faults (not marked for deletion) for penalty calculation
    const activeFaults = racerFaults.filter(f => !f.markedForDeletion);
    const pendingDeletionFaults = racerFaults.filter(f => f.markedForDeletion);

    // Calculate penalty using configurable values (only count active faults)
    const penaltySeconds = state.usePenaltyMode ? activeFaults.length * state.penaltySeconds : 0;
    const resultStatus = state.usePenaltyMode ? 'flt' : 'dsq';

    // Build fault rows with edit/delete buttons
    const faultRows = racerFaults.map(fault => {
      const isMarkedForDeletion = fault.markedForDeletion;
      const deletionInfo = isMarkedForDeletion && fault.markedForDeletionBy
        ? `${t('deletionPending', lang)} (${fault.markedForDeletionBy})`
        : '';

      return `
        <div class="fault-entry-row${isMarkedForDeletion ? ' marked-for-deletion' : ''}" data-fault-id="${fault.id}">
          <div class="fault-gate-info">
            <span class="fault-gate-num${isMarkedForDeletion ? ' strikethrough' : ''}">${t('gate', lang)} ${fault.gateNumber}</span>
            <span class="fault-type-badge${isMarkedForDeletion ? ' marked' : ''}">${getFaultTypeLabel(fault.faultType, lang)}</span>
            ${isMarkedForDeletion ? `<span class="deletion-pending-badge" title="${deletionInfo}">⚠</span>` : ''}
          </div>
          <span class="fault-judge-name">${fault.deviceName}</span>
          <div class="fault-row-actions">
            <button class="fault-row-btn edit-fault-btn" data-fault-id="${fault.id}" title="${t('edit', lang)}" ${isMarkedForDeletion ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="fault-row-btn delete-fault-btn" data-fault-id="${fault.id}" title="${isMarkedForDeletion ? t('rejectDeletion', lang) : t('markForDeletion', lang)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${isMarkedForDeletion
                  ? '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="9" y1="11" x2="9" y2="17"/><line x1="15" y1="11" x2="15" y2="17"/>'
                  : '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'}
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Build action button (finalize or finalized badge)
    const actionHtml = isFinalized
      ? `<div class="finalized-badge">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <path d="M20 6L9 17l-5-5"/>
           </svg>
           ${t('finalized', lang)}
         </div>`
      : `<button class="finalize-btn" data-bib="${bib}" data-run="${run}">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M20 6L9 17l-5-5"/>
           </svg>
           ${t('finalize', lang)}
         </button>`;

    // Build status display based on penalty mode
    const statusHtml = state.usePenaltyMode
      ? `<span class="fault-card-penalty">+${penaltySeconds}s</span>
         <span class="fault-card-result flt">${t('flt', lang)}</span>`
      : `<span class="fault-card-result dsq">DSQ</span>`;

    cardsHtml.push(`
      <div class="fault-summary-card${isFinalized ? ' finalized' : ''}" data-bib="${bib}" data-run="${run}">
        <div class="fault-card-header">
          <span class="fault-card-bib">#${bib.padStart(3, '0')}</span>
          <div class="fault-card-status">
            ${statusHtml}
          </div>
        </div>
        <div class="fault-card-body">
          ${faultRows}
        </div>
        <div class="fault-card-actions">
          ${actionHtml}
        </div>
      </div>
    `);
  }

  // Remove existing cards and add new ones
  const existingCards = summaryList.querySelectorAll('.fault-summary-card');
  existingCards.forEach(card => card.remove());

  // Insert cards before empty state
  if (emptyState) {
    emptyState.insertAdjacentHTML('beforebegin', cardsHtml.join(''));
  } else {
    summaryList.innerHTML = cardsHtml.join('');
  }

  // Add click handlers for finalize buttons
  const finalizeButtons = summaryList.querySelectorAll('.finalize-btn');
  finalizeButtons.forEach(btn => {
    btn.addEventListener('click', handleFinalizeClick);
  });

  // Add click handlers for edit fault buttons
  const editFaultButtons = summaryList.querySelectorAll('.edit-fault-btn');
  editFaultButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId) {
        const fault = store.getState().faultEntries.find(f => f.id === faultId);
        if (fault) {
          openFaultEditModal(fault);
        }
      }
    });
  });

  // Add click handlers for delete/mark for deletion buttons
  const deleteFaultButtons = summaryList.querySelectorAll('.delete-fault-btn');
  deleteFaultButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId) {
        const fault = store.getState().faultEntries.find(f => f.id === faultId);
        if (fault) {
          if (fault.markedForDeletion) {
            // Reject deletion - restore the fault
            handleRejectFaultDeletion(fault);
          } else {
            // Mark for deletion
            openMarkDeletionModal(fault);
          }
        }
      }
    });
  });
}

/**
 * Handle rejecting a fault deletion (restore it)
 */
function handleRejectFaultDeletion(fault: FaultEntry): void {
  const success = store.rejectFaultDeletion(fault.id);

  if (success) {
    // Sync the updated fault to cloud
    const restoredFault = store.getState().faultEntries.find(f => f.id === fault.id);
    if (restoredFault) {
      syncFault(restoredFault);
    }

    const lang = store.getState().currentLang;
    showToast(t('deletionRejected', lang), 'success');
    feedbackSuccess();
    updateFaultSummaryPanel();
    updatePendingDeletionsPanel();
  }
}

/**
 * Handle approving a fault deletion (chief judge action)
 */
function handleApproveFaultDeletion(fault: FaultEntry): void {
  // approveFaultDeletion now returns the fault with approval info, or null if failed
  const approvedFault = store.approveFaultDeletion(fault.id);

  if (approvedFault) {
    // Sync deletion to cloud (with approval info recorded)
    deleteFaultFromCloud(approvedFault);

    const lang = store.getState().currentLang;
    showToast(t('deletionApproved', lang), 'success');
    feedbackDelete();
    updateFaultSummaryPanel();
    updatePendingDeletionsPanel();
  }
}

/**
 * Update the pending deletions panel in Chief Judge view
 * Shows faults marked for deletion awaiting approval
 */
function updatePendingDeletionsPanel(): void {
  const section = document.getElementById('pending-deletions-section');
  const list = document.getElementById('pending-deletions-list');
  const countEl = document.getElementById('pending-deletions-count');

  if (!section || !list || !countEl) return;

  const pendingDeletions = store.getPendingDeletions();
  const state = store.getState();
  const lang = state.currentLang;

  // Update count and visibility
  countEl.textContent = String(pendingDeletions.length);
  section.style.display = pendingDeletions.length > 0 ? 'block' : 'none';

  if (pendingDeletions.length === 0) {
    list.innerHTML = '';
    return;
  }

  // Build pending deletion items
  const itemsHtml = pendingDeletions.map(fault => {
    const timeStr = fault.markedForDeletionAt
      ? new Date(fault.markedForDeletionAt).toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';

    return `
      <div class="pending-deletion-item" data-fault-id="${fault.id}">
        <div class="pending-deletion-info">
          <span class="pending-deletion-fault">
            #${fault.bib.padStart(3, '0')} T${fault.gateNumber} (${getFaultTypeLabel(fault.faultType, lang)}) - ${t(fault.run === 1 ? 'run1' : 'run2', lang)}
          </span>
          <span class="pending-deletion-meta">
            ${t('deletionMarkedBy', lang)}: ${fault.markedForDeletionBy || '?'} (${timeStr})
          </span>
        </div>
        <div class="pending-deletion-actions">
          <button class="pending-deletion-btn approve" data-fault-id="${fault.id}" title="${t('approveDeletion', lang)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </button>
          <button class="pending-deletion-btn reject" data-fault-id="${fault.id}" title="${t('rejectDeletion', lang)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  list.innerHTML = itemsHtml;

  // Add click handlers
  list.querySelectorAll('.pending-deletion-btn.approve').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId) {
        const fault = pendingDeletions.find(f => f.id === faultId);
        if (fault) {
          handleApproveFaultDeletion(fault);
        }
      }
    });
  });

  list.querySelectorAll('.pending-deletion-btn.reject').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId) {
        const fault = pendingDeletions.find(f => f.id === faultId);
        if (fault) {
          handleRejectFaultDeletion(fault);
        }
      }
    });
  });
}

/**
 * Handle finalize button click in Chief Judge view
 */
function handleFinalizeClick(event: Event): void {
  const btn = event.currentTarget as HTMLElement;
  const bib = btn.dataset.bib;
  const runStr = btn.dataset.run;

  if (!bib || !runStr) return;

  const run = parseInt(runStr, 10) as import('./types').Run;
  store.finalizeRacer(bib, run);
  feedbackSuccess();

  const state = store.getState();
  showToast(`#${bib.padStart(3, '0')} ${t('finalized', state.currentLang)}`, 'success');

  // Update the panel to reflect the new finalized state
  updateFaultSummaryPanel();
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
      const adminSection = document.getElementById('admin-section');
      if (adminSection) {
        adminSection.style.display = 'block';
      }
    });
  }

  // GPS toggle
  const gpsToggle = document.getElementById('gps-toggle') as HTMLInputElement;
  if (gpsToggle) {
    gpsToggle.addEventListener('change', () => {
      store.updateSettings({ gps: gpsToggle.checked });
    });
  }

  // Sync toggle - with guard against concurrent invocations
  const syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
  let syncTogglePending = false;
  if (syncToggle) {
    syncToggle.addEventListener('change', async () => {
      // RACE CONDITION FIX: Guard against concurrent invocations
      if (syncTogglePending) {
        syncToggle.checked = !syncToggle.checked; // Revert toggle
        return;
      }
      syncTogglePending = true;

      try {
        const state = store.getState();

        if (syncToggle.checked && state.raceId) {
          // Require PIN verification when enabling sync with existing race ID
          const pinVerified = await verifyPinForRaceJoin(state.currentLang);
          if (!pinVerified) {
            // PIN verification cancelled or failed - revert toggle
            syncToggle.checked = false;
            return;
          }
        }

        store.updateSettings({ sync: syncToggle.checked });

        // Update sync photos toggle state
        const syncPhotosToggle = document.getElementById('sync-photos-toggle') as HTMLInputElement;
        if (syncPhotosToggle) {
          syncPhotosToggle.disabled = !syncToggle.checked;
          if (!syncToggle.checked) {
            // Disable photo sync when main sync is disabled
            syncPhotosToggle.checked = false;
            store.updateSettings({ syncPhotos: false });
          }
        }

        if (syncToggle.checked && state.raceId) {
          syncService.initialize();
        } else {
          syncService.cleanup();
        }
      } finally {
        syncTogglePending = false;
      }
    });
  }

  // Sync photos toggle
  const syncPhotosToggle = document.getElementById('sync-photos-toggle') as HTMLInputElement;
  if (syncPhotosToggle) {
    syncPhotosToggle.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;

      if (target.checked) {
        // User is enabling photo sync - show warning modal
        e.preventDefault();
        target.checked = false; // Revert toggle until confirmed
        await showPhotoSyncWarningModal();
      } else {
        // Disabling photo sync - no confirmation needed
        store.updateSettings({ syncPhotos: false });
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
  let raceIdChangePending = false;
  if (raceIdInput) {
    // Debounced race exists check on input
    raceIdInput.addEventListener('input', () => {
      if (raceCheckTimeout) clearTimeout(raceCheckTimeout);
      const raceId = raceIdInput.value.trim();
      if (raceId) {
        raceCheckTimeout = setTimeout(() => checkRaceExists(raceId), 500);
      } else {
        updateRaceExistsIndicator(null, 0);
      }
    });

    raceIdInput.addEventListener('change', async () => {
      // RACE CONDITION FIX: Guard against concurrent invocations
      if (raceIdChangePending) {
        return; // Ignore if already processing
      }
      raceIdChangePending = true;

      try {
        const newRaceId = raceIdInput.value.trim();
        const state = store.getState();
      const hasEntries = state.entries.length > 0;
      const wasPreviouslySynced = state.lastSyncedRaceId !== '';
      const isChangingRace = newRaceId !== state.raceId && newRaceId !== '';

      if (hasEntries && isChangingRace) {
        if (wasPreviouslySynced) {
          // Was synced with another race - ask to export or delete
          const action = await showRaceChangeDialog('synced', state.currentLang);
          if (action === 'export') {
            exportResults();
            store.clearAll();
            await photoStorage.clearAll();
          } else if (action === 'delete') {
            store.clearAll();
            await photoStorage.clearAll();
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
            await photoStorage.clearAll();
          } else if (action === 'cancel') {
            // Cancelled - restore old race ID
            raceIdInput.value = state.raceId;
            return;
          }
          // 'keep' - do nothing with entries
        }
      }

      // Validate race ID format (allow empty to clear)
      if (newRaceId && !isValidRaceId(newRaceId)) {
        showToast(t('invalidRaceId', state.currentLang), 'error');
        raceIdInput.value = state.raceId;
        feedbackWarning();
        return;
      }

      // Verify PIN before joining race if sync is enabled
      if (state.settings.sync && newRaceId) {
        const pinVerified = await verifyPinForRaceJoin(state.currentLang);
        if (!pinVerified) {
          // PIN verification cancelled or failed - restore old race ID
          raceIdInput.value = state.raceId;
          return;
        }
      }

      // Cleanup old sync service before changing race ID (fixes BroadcastChannel leak)
      if (state.settings.sync && state.raceId) {
        syncService.cleanup();
      }

      // Normalize race ID to lowercase (aligns with server-side normalization)
      const normalizedRaceId = newRaceId.toLowerCase();
      raceIdInput.value = normalizedRaceId; // Update UI to show normalized value

      store.setRaceId(normalizedRaceId);
      if (state.settings.sync && normalizedRaceId) {
        syncService.initialize();
        store.markCurrentRaceAsSynced();
      }
      } finally {
        raceIdChangePending = false;
      }
    });
  }

  // Settings recent races button
  const settingsRecentRacesBtn = document.getElementById('settings-recent-races-btn');
  const settingsRecentRacesDropdown = document.getElementById('settings-recent-races-dropdown');
  if (settingsRecentRacesBtn && settingsRecentRacesDropdown) {
    settingsRecentRacesBtn.addEventListener('click', () => {
      feedbackTap();
      if (settingsRecentRacesDropdown.style.display === 'none') {
        showSettingsRecentRacesDropdown(settingsRecentRacesDropdown);
      } else {
        settingsRecentRacesDropdown.style.display = 'none';
      }
    });

    // Close dropdown when clicking outside
    if (!settingsRecentRacesDocumentHandler) {
      settingsRecentRacesDocumentHandler = (e) => {
        const target = e.target as Node;
        if (!settingsRecentRacesBtn.contains(target) && !settingsRecentRacesDropdown.contains(target)) {
          settingsRecentRacesDropdown.style.display = 'none';
        }
      };
      document.addEventListener('click', settingsRecentRacesDocumentHandler);
    }
  }

  // Device name input
  const deviceNameInput = document.getElementById('device-name-input') as HTMLInputElement;
  if (deviceNameInput) {
    deviceNameInput.addEventListener('change', () => {
      store.setDeviceName(deviceNameInput.value.trim());
    });
  }

  // Device Role toggle
  initRoleToggle();
}

/**
 * Initialize role toggle in settings
 */
function initRoleToggle(): void {
  const roleToggle = document.getElementById('role-toggle');
  if (!roleToggle) return;

  roleToggle.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.role-card-setting');
    if (!card) return;

    const role = card.getAttribute('data-role') as DeviceRole;
    if (role && role !== store.getState().deviceRole) {
      store.setDeviceRole(role);
      updateRoleToggle();
      updateGateJudgeTabVisibility();
      feedbackTap();

      // If switching to gateJudge and no gate assignment, show assignment modal
      if (role === 'gateJudge' && !store.getState().gateAssignment) {
        openModal(document.getElementById('gate-assignment-modal'));
      }

      // Switch to appropriate view
      if (role === 'gateJudge') {
        store.setView('gateJudge');
      } else if (store.getState().currentView === 'gateJudge') {
        store.setView('timer');
      }
    }
  });
}

/**
 * Update role toggle UI
 */
function updateRoleToggle(): void {
  const roleToggle = document.getElementById('role-toggle');
  if (!roleToggle) return;

  const state = store.getState();
  roleToggle.querySelectorAll('.role-card-setting').forEach(card => {
    const role = card.getAttribute('data-role');
    card.classList.toggle('active', role === state.deviceRole);
  });
}

/**
 * Update tab visibility based on device role
 * Timer role: show Timer tab, hide Gate Judge tab
 * Gate Judge role: hide Timer tab, show Gate Judge tab
 * Also reorders tabs so Gate tab appears first (like Timer in timer mode)
 */
function updateGateJudgeTabVisibility(): void {
  const timerTab = document.getElementById('timer-tab');
  const gateJudgeTab = document.getElementById('gate-judge-tab');
  const tabBar = document.querySelector('.tab-bar');

  const state = store.getState();
  const isGateJudge = state.deviceRole === 'gateJudge';

  // Swap tabs based on role
  if (timerTab) timerTab.style.display = isGateJudge ? 'none' : '';
  if (gateJudgeTab) gateJudgeTab.style.display = isGateJudge ? '' : 'none';

  // Add/remove class for tab reordering (Gate first, Results, Settings)
  if (tabBar) {
    tabBar.classList.toggle('gate-judge-mode', isGateJudge);
  }
}

/**
 * Initialize Gate Judge view
 */
function initGateJudgeView(): void {
  // Initialize role toggle state
  updateRoleToggle();
  updateGateJudgeTabVisibility();

  // Gate assignment change button
  const gateChangeBtn = document.getElementById('gate-change-btn');
  if (gateChangeBtn) {
    gateChangeBtn.addEventListener('click', () => {
      feedbackTap();
      openGateAssignmentModal();
    });
  }

  // Gate Judge run selector
  const gateJudgeRunSelector = document.getElementById('gate-judge-run-selector');
  if (gateJudgeRunSelector) {
    gateJudgeRunSelector.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.run-btn');
      if (!btn) return;

      const runStr = btn.getAttribute('data-run');
      const run = runStr ? parseInt(runStr, 10) as 1 | 2 : 1;
      store.setSelectedRun(run);
      feedbackTap();

      // Update ARIA states
      gateJudgeRunSelector.querySelectorAll('.run-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
      });

      // Refresh active bibs list and inline fault UI
      updateActiveBibsList();
      refreshInlineFaultUI();
    });
  }

  // Record fault button
  const recordFaultBtn = document.getElementById('record-fault-btn');
  if (recordFaultBtn) {
    recordFaultBtn.addEventListener('click', () => {
      feedbackTap();
      openFaultRecordingModal();
    });
  }

  // Ready toggle button
  const readyToggleBtn = document.getElementById('ready-toggle-btn');
  if (readyToggleBtn) {
    readyToggleBtn.addEventListener('click', () => {
      const state = store.getState();
      const newReadyState = !state.isJudgeReady;
      store.setJudgeReady(newReadyState);
      feedbackSuccess();
      updateReadyButtonState();
      // Show confirmation
      const lang = state.currentLang;
      showToast(newReadyState ? t('judgeReady', lang) : t('judgeNotReady', lang), 'success');
    });
    // Set initial state
    updateReadyButtonState();
  }

  // Initialize gate assignment modal handlers
  initGateAssignmentModal();

  // Initialize fault recording modal handlers
  initFaultRecordingModal();

  // Initialize inline fault entry handlers
  initInlineFaultEntry();
  refreshInlineFaultUI();

  // Update gate range display
  updateGateRangeDisplay();
}

/**
 * Open gate assignment modal with current values
 */
function openGateAssignmentModal(): void {
  const state = store.getState();
  const startInput = document.getElementById('gate-start-input') as HTMLInputElement;
  const endInput = document.getElementById('gate-end-input') as HTMLInputElement;

  if (startInput && endInput) {
    if (state.gateAssignment) {
      startInput.value = String(state.gateAssignment[0]);
      endInput.value = String(state.gateAssignment[1]);
    } else {
      startInput.value = '1';
      endInput.value = '10';
    }
  }

  // Set gate color selector to current value
  const colorSelector = document.getElementById('gate-color-selector');
  if (colorSelector) {
    colorSelector.querySelectorAll('.gate-color-btn').forEach(btn => {
      const color = btn.getAttribute('data-color');
      btn.classList.toggle('active', color === state.firstGateColor);
    });
  }

  openModal(document.getElementById('gate-assignment-modal'));
}

/**
 * Initialize gate assignment modal handlers
 */
function initGateAssignmentModal(): void {
  // Gate color selector toggle
  const colorSelector = document.getElementById('gate-color-selector');
  if (colorSelector) {
    colorSelector.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.gate-color-btn');
      if (!btn) return;

      colorSelector.querySelectorAll('.gate-color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      feedbackTap();
    });
  }

  const saveBtn = document.getElementById('save-gate-assignment-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const startInput = document.getElementById('gate-start-input') as HTMLInputElement;
      const endInput = document.getElementById('gate-end-input') as HTMLInputElement;

      const start = parseInt(startInput.value, 10) || 1;
      const end = parseInt(endInput.value, 10) || 10;

      // Ensure start <= end
      const validStart = Math.min(start, end);
      const validEnd = Math.max(start, end);

      // Get selected gate color
      const selectedColorBtn = document.querySelector('#gate-color-selector .gate-color-btn.active');
      const selectedColor = (selectedColorBtn?.getAttribute('data-color') || 'red') as import('./types').GateColor;

      store.setGateAssignment([validStart, validEnd]);
      store.setFirstGateColor(selectedColor);
      updateGateRangeDisplay();
      closeModal(document.getElementById('gate-assignment-modal'));
      feedbackSuccess();

      const lang = store.getState().currentLang;
      showToast(t('saved', lang), 'success');
    });
  }
}

/**
 * Update gate range display in header
 */
function updateGateRangeDisplay(): void {
  const display = document.getElementById('gate-range-display');
  if (!display) return;

  const state = store.getState();
  if (state.gateAssignment) {
    display.textContent = `${state.gateAssignment[0]}–${state.gateAssignment[1]}`;
  } else {
    display.textContent = '--';
  }

  // Also update other judges coverage
  updateOtherJudgesCoverage();
}

/**
 * Update display of other gate judges' coverage
 */
function updateOtherJudgesCoverage(): void {
  const coverageContainer = document.getElementById('other-judges-coverage');
  const coverageList = document.getElementById('other-judges-list');
  if (!coverageContainer || !coverageList) return;

  const state = store.getState();
  if (!state.settings.sync) {
    coverageContainer.style.display = 'none';
    return;
  }

  const otherAssignments = syncService.getOtherGateAssignments();

  if (otherAssignments.length === 0) {
    coverageContainer.style.display = 'none';
    return;
  }

  coverageContainer.style.display = 'flex';
  coverageList.innerHTML = otherAssignments.map(a => `
    <div class="coverage-badge ${a.isReady ? 'ready' : ''}" title="${a.deviceName}${a.isReady ? ' - Ready' : ''}">
      ${a.isReady ? '<span class="ready-check">✓</span>' : ''}
      <span class="device-name">${a.deviceName.slice(0, 15)}</span>
      <span class="gate-range">${a.gateStart}–${a.gateEnd}</span>
    </div>
  `).join('');

  // Update judges ready indicator in header
  updateJudgesReadyIndicator(otherAssignments);

  // Also update individual judge ready indicator (for gate judge mode)
  updateJudgeReadyStatus();
}

/**
 * Update ready button visual state
 */
function updateReadyButtonState(): void {
  const btn = document.getElementById('ready-toggle-btn');
  if (!btn) return;

  const state = store.getState();
  btn.classList.toggle('ready', state.isJudgeReady);
}

/**
 * Update judges ready indicator in header (visible to all devices)
 */
function updateJudgesReadyIndicator(assignments?: import('./types').GateAssignment[]): void {
  const indicator = document.getElementById('judges-ready-indicator');
  const countEl = document.getElementById('judges-ready-count');
  if (!indicator || !countEl) return;

  const state = store.getState();
  if (!state.settings.sync) {
    indicator.style.display = 'none';
    return;
  }

  // Get assignments if not provided
  const judgeAssignments = assignments || syncService.getOtherGateAssignments();

  // Count total judges (including this device if gate judge)
  let totalJudges = judgeAssignments.length;
  let readyJudges = judgeAssignments.filter(a => a.isReady).length;

  // Include this device if it's a gate judge with assignment
  if (state.deviceRole === 'gateJudge' && state.gateAssignment) {
    totalJudges++;
    if (state.isJudgeReady) readyJudges++;
  }

  if (totalJudges === 0) {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'flex';
  countEl.textContent = `${readyJudges}/${totalJudges}`;

  // Add highlight when all are ready
  indicator.classList.toggle('all-ready', readyJudges === totalJudges && totalJudges > 0);
}

/**
 * Update the judge ready indicator in gate judge mode
 * Replaces GPS indicator, shows color-coded ready status:
 * - Red: No judges ready
 * - Yellow: Some but not all ready
 * - Green: All judges ready
 */
function updateJudgeReadyStatus(): void {
  const gpsIndicator = document.getElementById('gps-indicator');
  const judgeReadyIndicator = document.getElementById('judge-ready-indicator');
  if (!judgeReadyIndicator) return;

  const state = store.getState();
  const isGateJudge = state.deviceRole === 'gateJudge';

  // In gate judge mode: hide GPS, show judge ready indicator
  // In timer mode: show GPS (if enabled), hide judge ready indicator
  if (gpsIndicator) {
    gpsIndicator.style.display = (!isGateJudge && state.settings.gps) ? 'flex' : 'none';
  }

  if (!isGateJudge) {
    judgeReadyIndicator.style.display = 'none';
    return;
  }

  // Show the indicator in gate judge mode
  judgeReadyIndicator.style.display = 'flex';

  // Calculate ready status from all judges
  const otherAssignments = syncService.getOtherGateAssignments();
  let totalJudges = otherAssignments.length;
  let readyJudges = otherAssignments.filter(a => a.isReady).length;

  // Include this device if it has a gate assignment
  if (state.gateAssignment) {
    totalJudges++;
    if (state.isJudgeReady) readyJudges++;
  }

  // Update indicator classes based on ready state
  judgeReadyIndicator.classList.remove('none-ready', 'some-ready', 'all-ready');

  if (totalJudges === 0) {
    // No judges at all - show as none ready
    judgeReadyIndicator.classList.add('none-ready');
  } else if (readyJudges === 0) {
    judgeReadyIndicator.classList.add('none-ready');
  } else if (readyJudges === totalJudges) {
    judgeReadyIndicator.classList.add('all-ready');
  } else {
    judgeReadyIndicator.classList.add('some-ready');
  }
}

/**
 * Open fault recording modal
 */
function openFaultRecordingModal(preselectedBib?: string): void {
  const state = store.getState();
  const activeBibs = store.getActiveBibs(state.selectedRun);

  // Populate bib selector
  const bibSelector = document.getElementById('fault-bib-selector');
  if (bibSelector) {
    bibSelector.innerHTML = activeBibs.map(bib => `
      <button class="fault-bib-btn ${bib === preselectedBib ? 'selected' : ''}" data-bib="${bib}">${bib}</button>
    `).join('');

    // Add click handlers
    bibSelector.querySelectorAll('.fault-bib-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        bibSelector.querySelectorAll('.fault-bib-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const bibInput = document.getElementById('fault-bib-input') as HTMLInputElement;
        if (bibInput) bibInput.value = '';
        store.setSelectedFaultBib(btn.getAttribute('data-bib') || '');
      });
    });
  }

  // Clear manual bib input
  const bibInput = document.getElementById('fault-bib-input') as HTMLInputElement;
  if (bibInput) {
    bibInput.value = preselectedBib || '';
    bibInput.addEventListener('input', () => {
      // Deselect any bib buttons when typing manually
      bibSelector?.querySelectorAll('.fault-bib-btn').forEach(b => b.classList.remove('selected'));
      store.setSelectedFaultBib(bibInput.value.padStart(3, '0'));
    });
  }

  // Set preselected bib
  if (preselectedBib) {
    store.setSelectedFaultBib(preselectedBib);
  } else {
    store.setSelectedFaultBib('');
  }

  // Populate gate selector based on assignment with gate colors
  const gateSelector = document.getElementById('fault-gate-selector');
  if (gateSelector && state.gateAssignment) {
    const [start, end] = state.gateAssignment;
    let gatesHtml = '';
    for (let i = start; i <= end; i++) {
      const gateColor = store.getGateColor(i);
      const colorClass = gateColor === 'red' ? 'gate-red' : 'gate-blue';
      gatesHtml += `<button class="fault-gate-btn ${colorClass}" data-gate="${i}">${i}</button>`;
    }
    gateSelector.innerHTML = gatesHtml;

    // Add click handlers
    gateSelector.querySelectorAll('.fault-gate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        gateSelector.querySelectorAll('.fault-gate-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  // Clear fault type selection
  const faultTypeButtons = document.getElementById('fault-type-buttons');
  if (faultTypeButtons) {
    faultTypeButtons.querySelectorAll('.fault-type-btn').forEach(btn => {
      btn.classList.remove('selected');
    });
  }

  openModal(document.getElementById('fault-modal'));
}

/**
 * Initialize fault recording modal handlers
 */
function initFaultRecordingModal(): void {
  // Fault type buttons - click selects the type (no auto-save)
  const faultTypeButtons = document.getElementById('fault-type-buttons');
  if (faultTypeButtons) {
    faultTypeButtons.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.fault-type-btn');
      if (!btn) return;

      const faultType = btn.getAttribute('data-fault') as FaultType;
      if (faultType) {
        // Mark selected (just selection, no recording)
        faultTypeButtons.querySelectorAll('.fault-type-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        feedbackTap();
      }
    });
  }

  // Save Fault button - records the fault
  const saveFaultBtn = document.getElementById('save-fault-btn');
  if (saveFaultBtn) {
    saveFaultBtn.addEventListener('click', () => {
      // Get selected fault type
      const selectedTypeBtn = document.querySelector('#fault-type-buttons .fault-type-btn.selected');
      if (!selectedTypeBtn) {
        const lang = store.getState().currentLang;
        showToast(t('selectFaultType', lang), 'warning');
        return;
      }

      const faultType = selectedTypeBtn.getAttribute('data-fault') as FaultType;
      if (faultType) {
        recordFault(faultType);
      }
    });
  }
}

/**
 * Record a fault entry
 */
function recordFault(faultType: FaultType): void {
  const state = store.getState();

  // Get selected bib
  let bib = state.selectedFaultBib;
  if (!bib) {
    const bibInput = document.getElementById('fault-bib-input') as HTMLInputElement;
    bib = bibInput?.value.padStart(3, '0') || '';
  }

  if (!bib) {
    const lang = state.currentLang;
    showToast(t('selectBib', lang), 'warning');
    return;
  }

  // Get selected gate
  const selectedGateBtn = document.querySelector('#fault-gate-selector .fault-gate-btn.selected');
  const gateNumber = selectedGateBtn ? parseInt(selectedGateBtn.getAttribute('data-gate') || '0', 10) : 0;

  if (!gateNumber) {
    const lang = state.currentLang;
    showToast(t('selectGate', lang), 'warning');
    return;
  }

  // Create fault entry (without version fields - added by store)
  const fault = {
    id: `fault-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    bib,
    run: state.selectedRun,
    gateNumber,
    faultType,
    timestamp: new Date().toISOString(),
    deviceId: state.deviceId,
    deviceName: state.deviceName,
    gateRange: state.gateAssignment || [1, 1]
  };

  store.addFaultEntry(fault);
  feedbackWarning(); // Use warning feedback for fault (attention-getting)

  // Get the fault with version fields from store and sync to cloud
  const storedFault = store.getState().faultEntries.find(f => f.id === fault.id);
  if (storedFault) {
    syncFault(storedFault);
    showFaultConfirmation(storedFault);
  }

  // Close modal
  closeModal(document.getElementById('fault-modal'));

  // Refresh active bibs list
  updateActiveBibsList();

  const lang = state.currentLang;
  showToast(t('faultRecorded', lang), 'success');
}

/**
 * Show fault confirmation overlay
 */
function showFaultConfirmation(fault: FaultEntry): void {
  const overlay = document.getElementById('fault-confirmation-overlay');
  if (!overlay) return;

  const bibEl = overlay.querySelector('.fault-confirmation-bib');
  const gateEl = overlay.querySelector('.fault-confirmation-gate');
  const typeEl = overlay.querySelector('.fault-confirmation-type');

  const state = store.getState();

  if (bibEl) bibEl.textContent = fault.bib;
  if (gateEl) gateEl.textContent = `${t('gate', state.currentLang)} ${fault.gateNumber}`;
  if (typeEl) typeEl.textContent = getFaultTypeLabel(fault.faultType, state.currentLang);

  overlay.classList.add('show');

  setTimeout(() => {
    overlay.classList.remove('show');
  }, 1500);
}

/**
 * Get localized fault type label
 */
function getFaultTypeLabel(faultType: FaultType, lang: Language): string {
  const labels: Record<FaultType, string> = {
    'MG': t('faultMGShort', lang),
    'STR': t('faultSTRShort', lang),
    'BR': t('faultBRShort', lang)
  };
  return labels[faultType] || faultType;
}

// Track currently editing fault for edit modal
let editingFaultId: string | null = null;

/**
 * Initialize fault edit modal handlers
 */
function initFaultEditModal(): void {
  // Save fault edit button
  const saveFaultEditBtn = document.getElementById('save-fault-edit-btn');
  if (saveFaultEditBtn) {
    saveFaultEditBtn.addEventListener('click', handleSaveFaultEdit);
  }

  // Restore version button
  const restoreVersionBtn = document.getElementById('restore-version-btn');
  if (restoreVersionBtn) {
    restoreVersionBtn.addEventListener('click', handleRestoreFaultVersion);
  }

  // Fault edit bib input - numeric only validation
  const faultEditBibInput = document.getElementById('fault-edit-bib-input') as HTMLInputElement;
  if (faultEditBibInput) {
    faultEditBibInput.addEventListener('input', () => {
      faultEditBibInput.value = faultEditBibInput.value.replace(/[^0-9]/g, '').slice(0, 3);
    });
  }

  // Fault edit run selector
  const faultEditRunSelector = document.getElementById('fault-edit-run-selector');
  if (faultEditRunSelector) {
    faultEditRunSelector.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.edit-run-btn');
      if (!btn) return;

      faultEditRunSelector.querySelectorAll('.edit-run-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
    });
  }

  // Confirm mark deletion button
  const confirmMarkDeletionBtn = document.getElementById('confirm-mark-deletion-btn');
  if (confirmMarkDeletionBtn) {
    confirmMarkDeletionBtn.addEventListener('click', handleConfirmMarkDeletion);
  }
}

/**
 * Open fault edit modal
 */
function openFaultEditModal(fault: FaultEntry): void {
  // Don't allow editing faults marked for deletion
  if (fault.markedForDeletion) {
    const lang = store.getState().currentLang;
    showToast(t('cannotEditPendingDeletion', lang), 'warning');
    return;
  }

  const modal = document.getElementById('fault-edit-modal');
  if (!modal) return;

  editingFaultId = fault.id;
  const state = store.getState();
  const lang = state.currentLang;

  // Populate fields
  const bibInput = document.getElementById('fault-edit-bib-input') as HTMLInputElement;
  const gateInput = document.getElementById('fault-edit-gate-input') as HTMLInputElement;
  const typeSelect = document.getElementById('fault-edit-type-select') as HTMLSelectElement;
  const gateRangeSpan = document.getElementById('fault-edit-gate-range');
  const versionSelect = document.getElementById('fault-version-select') as HTMLSelectElement;

  if (bibInput) bibInput.value = fault.bib || '';
  if (gateInput) gateInput.value = String(fault.gateNumber);
  if (typeSelect) typeSelect.value = fault.faultType;

  // Show gate range info
  if (gateRangeSpan && fault.gateRange) {
    gateRangeSpan.textContent = `(${t('gates', lang)} ${fault.gateRange[0]}-${fault.gateRange[1]})`;
  }

  // Update run selector buttons
  const runSelector = document.getElementById('fault-edit-run-selector');
  if (runSelector) {
    runSelector.querySelectorAll('.edit-run-btn').forEach(btn => {
      const btnRun = btn.getAttribute('data-run');
      btn.classList.toggle('active', btnRun === String(fault.run));
    });
  }

  // Populate version history dropdown
  if (versionSelect) {
    versionSelect.innerHTML = '';

    // Add current version
    const currentOption = document.createElement('option');
    currentOption.value = String(fault.currentVersion || 1);
    currentOption.textContent = `v${fault.currentVersion || 1} - ${t('currentVersion', lang)}`;
    versionSelect.appendChild(currentOption);

    // Add history versions (newest first, excluding current)
    const history = fault.versionHistory || [];
    const sortedHistory = [...history]
      .sort((a, b) => b.version - a.version)
      .filter(v => v.version !== fault.currentVersion);

    for (const version of sortedHistory) {
      const option = document.createElement('option');
      option.value = String(version.version);
      const date = new Date(version.timestamp);
      const timeStr = date.toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const changeLabel = version.changeType === 'create' ? t('originalVersion', lang) :
                          version.changeType === 'restore' ? t('restored', lang) :
                          version.editedBy;
      option.textContent = `v${version.version} - ${changeLabel} (${timeStr})`;
      versionSelect.appendChild(option);
    }
  }

  openModal(modal);
}

/**
 * Handle saving fault edit
 */
function handleSaveFaultEdit(): void {
  if (!editingFaultId) return;

  const state = store.getState();
  const fault = state.faultEntries.find(f => f.id === editingFaultId);
  if (!fault) return;

  const bibInput = document.getElementById('fault-edit-bib-input') as HTMLInputElement;
  const gateInput = document.getElementById('fault-edit-gate-input') as HTMLInputElement;
  const typeSelect = document.getElementById('fault-edit-type-select') as HTMLSelectElement;
  const runSelector = document.getElementById('fault-edit-run-selector');

  const newBib = bibInput?.value.padStart(3, '0') || fault.bib;
  const newGate = parseInt(gateInput?.value || String(fault.gateNumber), 10);
  const newType = (typeSelect?.value || fault.faultType) as FaultType;

  // Gate range validation warning
  const lang = state.currentLang;
  if (fault.gateRange && (newGate < fault.gateRange[0] || newGate > fault.gateRange[1])) {
    // Show warning but allow save (gate might have been reassigned)
    showToast(t('gateOutOfRange', lang), 'warning');
  }

  // Get selected run
  const selectedRunBtn = runSelector?.querySelector('.edit-run-btn.active');
  const newRun = selectedRunBtn ? parseInt(selectedRunBtn.getAttribute('data-run') || '1', 10) as Run : fault.run;

  // Build changes description
  const changes: string[] = [];
  if (newBib !== fault.bib) changes.push(`bib: ${fault.bib} → ${newBib}`);
  if (newGate !== fault.gateNumber) changes.push(`gate: ${fault.gateNumber} → ${newGate}`);
  if (newType !== fault.faultType) changes.push(`type: ${fault.faultType} → ${newType}`);
  if (newRun !== fault.run) changes.push(`run: ${fault.run} → ${newRun}`);

  const changeDescription = changes.length > 0 ? changes.join(', ') : undefined;

  // Update with version history
  const success = store.updateFaultEntryWithHistory(editingFaultId, {
    bib: newBib,
    gateNumber: newGate,
    faultType: newType,
    run: newRun
  }, changeDescription);

  if (success) {
    // Sync updated fault to cloud
    const updatedFault = store.getState().faultEntries.find(f => f.id === editingFaultId);
    if (updatedFault) {
      syncFault(updatedFault);
    }

    showToast(t('saved', lang), 'success');
    feedbackSuccess();
  }

  closeModal(document.getElementById('fault-edit-modal'));
  editingFaultId = null;
}

/**
 * Handle restoring a fault version
 */
function handleRestoreFaultVersion(): void {
  if (!editingFaultId) return;

  const versionSelect = document.getElementById('fault-version-select') as HTMLSelectElement;
  const selectedVersion = parseInt(versionSelect?.value || '0', 10);

  if (!selectedVersion) return;

  const state = store.getState();
  const fault = state.faultEntries.find(f => f.id === editingFaultId);

  // Don't restore to current version
  if (fault && selectedVersion === fault.currentVersion) {
    return;
  }

  const success = store.restoreFaultVersion(editingFaultId, selectedVersion);

  if (success) {
    // Sync restored fault to cloud
    const restoredFault = store.getState().faultEntries.find(f => f.id === editingFaultId);
    if (restoredFault) {
      syncFault(restoredFault);
    }

    const lang = state.currentLang;
    showToast(t('versionRestored', lang), 'success');
    feedbackSuccess();

    closeModal(document.getElementById('fault-edit-modal'));
    editingFaultId = null;
  }
}

/**
 * Open mark deletion confirmation modal
 */
function openMarkDeletionModal(fault: FaultEntry): void {
  const modal = document.getElementById('mark-deletion-modal');
  if (!modal) return;

  editingFaultId = fault.id;
  const state = store.getState();
  const lang = state.currentLang;

  // Populate details
  const detailsEl = document.getElementById('mark-deletion-details');
  if (detailsEl) {
    detailsEl.innerHTML = `
      <div>#${fault.bib.padStart(3, '0')} T${fault.gateNumber} (${getFaultTypeLabel(fault.faultType, lang)}) - ${t(fault.run === 1 ? 'run1' : 'run2', lang)}</div>
    `;
  }

  openModal(modal);
}

/**
 * Handle confirming mark for deletion
 */
function handleConfirmMarkDeletion(): void {
  if (!editingFaultId) return;

  const success = store.markFaultForDeletion(editingFaultId);

  if (success) {
    // Sync the updated fault to cloud
    const markedFault = store.getState().faultEntries.find(f => f.id === editingFaultId);
    if (markedFault) {
      syncFault(markedFault);
    }

    const lang = store.getState().currentLang;
    showToast(t('markedForDeletion', lang), 'info');
    feedbackTap();
  }

  closeModal(document.getElementById('mark-deletion-modal'));
  editingFaultId = null;
}

/**
 * Update active bibs list in Gate Judge view
 */
function updateActiveBibsList(): void {
  const list = document.getElementById('active-bibs-list');
  const emptyState = document.getElementById('no-active-bibs');
  if (!list) return;

  const state = store.getState();
  const activeBibs = store.getActiveBibs(state.selectedRun);

  // Clear existing bib cards (keep empty state)
  list.querySelectorAll('.active-bib-card').forEach(card => card.remove());

  if (activeBibs.length === 0) {
    if (emptyState) emptyState.style.display = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  // Get start times for each bib
  const startTimes = new Map<string, Date>();
  state.entries.forEach(entry => {
    if (entry.point === 'S' && entry.run === state.selectedRun) {
      startTimes.set(entry.bib, new Date(entry.timestamp));
    }
  });

  // Sort by start time (most recent first)
  const sortedBibs = [...activeBibs].sort((a, b) => {
    const timeA = startTimes.get(a)?.getTime() || 0;
    const timeB = startTimes.get(b)?.getTime() || 0;
    return timeB - timeA;
  });

  // Build bib cards
  sortedBibs.forEach(bib => {
    const startTime = startTimes.get(bib);
    const faults = store.getFaultsForBib(bib, state.selectedRun);
    const hasFault = faults.length > 0;

    const card = document.createElement('div');
    card.className = `active-bib-card${hasFault ? ' has-fault' : ''}`;
    card.setAttribute('data-bib', bib);
    card.setAttribute('role', 'listitem');

    const timeStr = startTime ? formatTimeDisplay(startTime) : '--:--:--';

    card.innerHTML = `
      <div class="bib-card-info">
        <span class="bib-card-number">${bib}</span>
        <span class="bib-card-time">${timeStr}</span>
        ${hasFault ? `<span class="bib-fault-indicator">${faults.length} ${t('faultCount', state.currentLang)}</span>` : ''}
      </div>
      <div class="bib-card-actions">
        <button class="bib-action-btn fault" data-action="fault">${t('faultMGShort', state.currentLang)}</button>
        <button class="bib-action-btn ok" data-action="ok">${t('ok', state.currentLang)}</button>
      </div>
    `;

    // Click on card to select bib for fault entry
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actionBtn = target.closest('.bib-action-btn');

      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        if (action === 'fault') {
          feedbackTap();
          openFaultRecordingModal(bib);
        } else if (action === 'ok') {
          feedbackTap();
          // Just tap feedback - bib is OK, no action needed
          showToast(t('ok', state.currentLang), 'success', 1000);
        }
      }
    });

    list.appendChild(card);
  });
}

// Inline fault entry state
let inlineSelectedBib = '';
let inlineSelectedGate = 0;
let inlineSelectedFaultType: FaultType | null = null;

/**
 * Update the inline fault list in Gate Judge view
 */
function updateInlineFaultsList(): void {
  const listContainer = document.getElementById('gate-judge-faults-list');
  const countBadge = document.getElementById('inline-fault-count');
  const emptyState = document.getElementById('no-faults-recorded-inline');
  if (!listContainer) return;

  const state = store.getState();
  const faults = state.faultEntries.filter(f =>
    f.run === state.selectedRun &&
    !f.markedForDeletion
  );

  // Update count badge
  if (countBadge) {
    countBadge.textContent = String(faults.length);
    countBadge.setAttribute('data-count', String(faults.length));
  }

  // Clear existing fault items (keep empty state)
  listContainer.querySelectorAll('.gate-judge-fault-item').forEach(item => item.remove());

  if (faults.length === 0) {
    if (emptyState) emptyState.style.display = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  // Sort by timestamp (most recent first)
  const sortedFaults = [...faults].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  sortedFaults.forEach(fault => {
    const gateColor = store.getGateColor(fault.gateNumber);
    const item = document.createElement('div');
    item.className = 'gate-judge-fault-item';
    item.setAttribute('data-fault-id', fault.id);

    item.innerHTML = `
      <div class="gate-judge-fault-info">
        <span class="gate-judge-fault-bib">${fault.bib}</span>
        <div class="gate-judge-fault-details">
          <span class="gate-judge-fault-gate ${gateColor}">T${fault.gateNumber}</span>
          <span class="gate-judge-fault-type">${fault.faultType}</span>
        </div>
      </div>
      <button class="gate-judge-fault-delete" aria-label="Delete">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
          <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    `;

    // Delete button handler
    const deleteBtn = item.querySelector('.gate-judge-fault-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        feedbackTap();
        openFaultDeleteConfirmation(fault);
      });
    }

    listContainer.appendChild(item);
  });
}

/**
 * Update inline bib selector buttons
 */
function updateInlineBibSelector(): void {
  const container = document.getElementById('inline-bib-selector');
  if (!container) return;

  const state = store.getState();
  const activeBibs = store.getActiveBibs(state.selectedRun);

  container.innerHTML = '';

  // Show up to 6 most recent active bibs as quick-select buttons
  const recentBibs = activeBibs.slice(0, 6);

  recentBibs.forEach(bib => {
    const btn = document.createElement('button');
    btn.className = 'inline-bib-btn';
    btn.setAttribute('data-bib', bib);
    btn.textContent = bib;

    if (bib === inlineSelectedBib) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => {
      feedbackTap();
      selectInlineBib(bib);
    });

    container.appendChild(btn);
  });
}

/**
 * Select a bib for inline fault entry
 */
function selectInlineBib(bib: string): void {
  inlineSelectedBib = bib;

  // Update bib buttons
  document.querySelectorAll('#inline-bib-selector .inline-bib-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-bib') === bib);
  });

  // Update manual input
  const bibInput = document.getElementById('inline-bib-input') as HTMLInputElement;
  if (bibInput) {
    bibInput.value = bib;
  }

  updateInlineSaveButtonState();
}

/**
 * Update inline gate selector buttons
 */
function updateInlineGateSelector(): void {
  const container = document.getElementById('inline-gate-selector');
  if (!container) return;

  const state = store.getState();
  const [start, end] = state.gateAssignment || [1, 10];

  container.innerHTML = '';

  for (let gate = start; gate <= end; gate++) {
    const color = store.getGateColor(gate);
    const btn = document.createElement('button');
    btn.className = `inline-gate-btn ${color}`;
    btn.setAttribute('data-gate', String(gate));
    btn.textContent = String(gate);

    if (gate === inlineSelectedGate) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => {
      feedbackTap();
      selectInlineGate(gate);
    });

    container.appendChild(btn);
  }
}

/**
 * Select a gate for inline fault entry
 */
function selectInlineGate(gate: number): void {
  inlineSelectedGate = gate;

  // Update gate buttons
  document.querySelectorAll('#inline-gate-selector .inline-gate-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-gate') === String(gate));
  });

  updateInlineSaveButtonState();
}

/**
 * Initialize inline fault entry handlers
 */
function initInlineFaultEntry(): void {
  // Bib manual input
  const bibInput = document.getElementById('inline-bib-input') as HTMLInputElement;
  if (bibInput) {
    bibInput.addEventListener('input', () => {
      // Remove non-numeric characters and limit to 3 digits
      bibInput.value = bibInput.value.replace(/[^0-9]/g, '').slice(0, 3);

      if (bibInput.value) {
        inlineSelectedBib = bibInput.value.padStart(3, '0');
        // Deselect any quick-select button
        document.querySelectorAll('#inline-bib-selector .inline-bib-btn').forEach(btn => {
          btn.classList.remove('selected');
        });
        updateInlineSaveButtonState();
      }
    });
  }

  // Fault type buttons
  const faultTypeContainer = document.getElementById('inline-fault-types');
  if (faultTypeContainer) {
    faultTypeContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.inline-fault-type-btn');
      if (!btn) return;

      feedbackTap();
      const faultType = btn.getAttribute('data-fault') as FaultType;
      inlineSelectedFaultType = faultType;

      // Update button states
      faultTypeContainer.querySelectorAll('.inline-fault-type-btn').forEach(b => {
        b.classList.toggle('selected', b === btn);
      });

      updateInlineSaveButtonState();
    });
  }

  // Save fault button
  const saveBtn = document.getElementById('inline-save-fault-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveInlineFault();
    });
  }
}

/**
 * Update the save button enabled/disabled state
 */
function updateInlineSaveButtonState(): void {
  const saveBtn = document.getElementById('inline-save-fault-btn') as HTMLButtonElement;
  if (saveBtn) {
    const isValid = inlineSelectedBib && inlineSelectedGate > 0 && inlineSelectedFaultType;
    saveBtn.disabled = !isValid;
  }
}

/**
 * Save a fault from the inline entry interface
 */
function saveInlineFault(): void {
  const state = store.getState();

  if (!inlineSelectedBib) {
    showToast(t('selectBib', state.currentLang), 'warning');
    return;
  }

  if (!inlineSelectedGate) {
    showToast(t('selectGate', state.currentLang), 'warning');
    return;
  }

  if (!inlineSelectedFaultType) {
    showToast(t('selectFaultType', state.currentLang), 'warning');
    return;
  }

  // Create fault entry
  const fault = {
    id: `fault-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    bib: inlineSelectedBib,
    run: state.selectedRun,
    gateNumber: inlineSelectedGate,
    faultType: inlineSelectedFaultType,
    timestamp: new Date().toISOString(),
    deviceId: state.deviceId,
    deviceName: state.deviceName,
    gateRange: state.gateAssignment || [1, 1]
  };

  store.addFaultEntry(fault);
  feedbackWarning();

  // Sync to cloud
  const storedFault = store.getState().faultEntries.find(f => f.id === fault.id);
  if (storedFault) {
    syncFault(storedFault);
    showFaultConfirmation(storedFault);
  }

  // Reset selection (keep bib for next fault on same racer)
  inlineSelectedGate = 0;
  inlineSelectedFaultType = null;

  // Update UI
  document.querySelectorAll('#inline-gate-selector .inline-gate-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  document.querySelectorAll('#inline-fault-types .inline-fault-type-btn').forEach(btn => {
    btn.classList.remove('selected');
  });

  updateInlineFaultsList();
  updateInlineBibSelector();
  updateInlineSaveButtonState();

  showToast(t('faultRecorded', state.currentLang), 'success');
}

/**
 * Open fault delete confirmation modal for inline faults
 */
function openFaultDeleteConfirmation(fault: FaultEntry): void {
  const modal = document.getElementById('fault-delete-modal');
  if (!modal) {
    // Fallback: use direct delete if modal doesn't exist
    store.markFaultForDeletion(fault.id);
    const markedFault = store.getState().faultEntries.find(f => f.id === fault.id);
    if (markedFault) {
      deleteFaultFromCloud(markedFault);
    }
    updateInlineFaultsList();
    showToast(t('faultDeleted', store.getState().currentLang), 'success');
    return;
  }

  // Store fault ID for confirmation
  modal.setAttribute('data-fault-id', fault.id);

  const state = store.getState();
  const gateColor = store.getGateColor(fault.gateNumber);

  // Update modal content
  const infoEl = modal.querySelector('.delete-fault-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <strong>#${fault.bib}</strong> -
      <span class="fault-gate ${gateColor}">T${fault.gateNumber}</span>
      (${fault.faultType}) -
      ${t('run1', state.currentLang).replace('1', String(fault.run))}
    `;
  }

  openModal(modal);
}

/**
 * Initialize all inline fault entry components
 */
function refreshInlineFaultUI(): void {
  updateInlineFaultsList();
  updateInlineBibSelector();
  updateInlineGateSelector();
  updateInlineSaveButtonState();
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

// Track current entry being viewed in photo viewer
let currentPhotoEntryId: string | null = null;

/**
 * Open photo viewer modal
 * Loads photo from IndexedDB if stored there
 */
async function openPhotoViewer(entry: Entry): Promise<void> {
  const modal = document.getElementById('photo-viewer-modal');
  if (!modal || !entry.photo) return;

  currentPhotoEntryId = entry.id;

  const image = document.getElementById('photo-viewer-image') as HTMLImageElement;
  const bibEl = document.getElementById('photo-viewer-bib');
  const pointEl = document.getElementById('photo-viewer-point');
  const timeEl = document.getElementById('photo-viewer-time');

  const state = store.getState();
  const lang = state.currentLang;

  // Load photo from IndexedDB or use inline base64
  if (image) {
    // Set descriptive alt text
    const pointLabel = getPointLabel(entry.point, lang);
    image.alt = `${t('photoForBib', lang)} ${entry.bib || '---'} - ${pointLabel}`;

    if (entry.photo === 'indexeddb') {
      // Photo stored in IndexedDB - load it
      image.src = ''; // Clear while loading
      const photoData = await photoStorage.getPhoto(entry.id);
      if (photoData) {
        image.src = `data:image/jpeg;base64,${photoData}`;
      } else {
        // Photo not found in IndexedDB
        console.warn('Photo not found in IndexedDB for entry:', entry.id);
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

  modal.classList.add('show');
}

/**
 * Close photo viewer modal
 */
function closePhotoViewer(): void {
  const modal = document.getElementById('photo-viewer-modal');
  closeModal(modal);
  currentPhotoEntryId = null;
}

/**
 * Delete photo from entry
 * Removes from both IndexedDB and entry marker
 */
async function deletePhoto(): Promise<void> {
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
  }
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
 * Update run selection
 */
function updateRunSelection(): void {
  const state = store.getState();
  document.querySelectorAll('.run-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-run') === String(state.selectedRun);
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
}

/**
 * Update Gate Judge run selector
 */
function updateGateJudgeRunSelection(): void {
  const state = store.getState();
  const gateJudgeRunSelector = document.getElementById('gate-judge-run-selector');
  if (gateJudgeRunSelector) {
    gateJudgeRunSelector.querySelectorAll('.run-btn').forEach(btn => {
      const isActive = btn.getAttribute('data-run') === String(state.selectedRun);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', String(isActive));
    });
  }
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
    adminSection.style.display = 'block';
  }

  if (gpsToggle) gpsToggle.checked = settings.gps;
  if (syncToggle) syncToggle.checked = settings.sync;
  if (autoToggle) autoToggle.checked = settings.auto;
  if (hapticToggle) hapticToggle.checked = settings.haptic;
  if (soundToggle) soundToggle.checked = settings.sound;
  if (photoToggle) photoToggle.checked = settings.photoCapture;

  // Update sync photos toggle (enabled only when sync is enabled)
  const syncPhotosToggle = document.getElementById('sync-photos-toggle') as HTMLInputElement;
  if (syncPhotosToggle) {
    syncPhotosToggle.checked = settings.syncPhotos;
    syncPhotosToggle.disabled = !settings.sync;
  }

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

  // Update dynamically set text that depends on language
  updateRaceExistsIndicator(lastRaceExistsState.exists, lastRaceExistsState.entryCount);
}

/**
 * Apply settings (show/hide UI based on simple mode)
 */
function applySettings(): void {
  // Simple mode deprecated: always show advanced UI and timing points.
  const advancedElements = document.querySelectorAll('[data-advanced]');
  advancedElements.forEach(el => {
    (el as HTMLElement).style.display = '';
  });

  const startBtn = document.querySelector('[data-point="S"]') as HTMLElement;
  if (startBtn) {
    startBtn.style.display = '';
  }

  // Apply Liquid Glass UI settings
  applyGlassEffectSettings();
}

/**
 * Apply glass and motion effect settings to the UI
 */
function applyGlassEffectSettings(): void {
  const settings = store.getState().settings;
  const root = document.documentElement;

  // Glass effects toggle
  if (settings.glassEffects) {
    root.classList.remove('no-glass-effects');
    // Add glass-enabled class to key elements for motion-reactive styles
    document.querySelectorAll('.glass-enable-target').forEach(el => {
      el.classList.add('glass-enabled');
    });
  } else {
    root.classList.add('no-glass-effects');
    document.querySelectorAll('.glass-enabled').forEach(el => {
      el.classList.remove('glass-enabled');
    });
  }

  // DISABLED: Motion effects disabled to save battery
  // // Motion effects toggle
  // if (settings.motionEffects && settings.glassEffects) {
  //   root.classList.remove('no-motion-effects');
  //   // Initialize motion service if supported
  //   if (motionService.isSupported()) {
  //     // Note: On iOS 13+, permission must be requested from a user gesture
  //     // We'll initialize without permission request here - the settings toggle will handle it
  //     if (!motionService.requiresPermission()) {
  //       motionService.initialize();
  //     }
  //   }
  // } else {
  //   root.classList.add('no-motion-effects');
  //   motionService.pause();
  // }
  root.classList.add('no-motion-effects');

  // Outdoor mode toggle (high contrast)
  if (settings.outdoorMode) {
    root.classList.add('outdoor-mode');
  } else {
    root.classList.remove('outdoor-mode');
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

// Track race exists state for language updates
let lastRaceExistsState: { exists: boolean | null; entryCount: number } = { exists: null, entryCount: 0 };

/**
 * Check if race exists in cloud
 * Uses request ID to ignore stale responses from previous requests
 */
async function checkRaceExists(raceId: string): Promise<void> {
  // Increment request ID to track this request
  const currentRequestId = ++raceCheckRequestId;

  const result = await syncService.checkRaceExists(raceId);

  // Ignore stale response if a newer request was made while this one was in flight
  if (currentRequestId !== raceCheckRequestId) {
    return;
  }

  store.setRaceExistsInCloud(result.exists);
  updateRaceExistsIndicator(result.exists, result.entryCount);
}

// ===== Recent Races Dropdown Functions =====

/**
 * Show settings recent races dropdown and populate with today's races
 * Fetches from API if authenticated, falls back to localStorage
 */
async function showSettingsRecentRacesDropdown(dropdown: HTMLElement): Promise<void> {
  const lang = store.getState().currentLang;

  // Show loading state
  dropdown.innerHTML = `<div class="recent-races-empty">${t('loading', lang)}</div>`;
  dropdown.style.display = 'block';

  // Try to fetch from API if authenticated
  let races: RecentRace[] = [];

  if (hasAuthToken()) {
    try {
      races = await fetchRacesFromApi();
    } catch (error) {
      console.warn('Failed to fetch races from API:', error);
      // Fall back to localStorage
      races = getTodaysRecentRaces();
    }
  } else {
    // Not authenticated - use localStorage
    races = getTodaysRecentRaces();
  }

  if (races.length === 0) {
    dropdown.innerHTML = `<div class="recent-races-empty">${t('noRecentRaces', lang)}</div>`;
  } else {
    dropdown.innerHTML = renderRecentRaceItems(races);
    attachRecentRaceItemHandlers(dropdown, races, (race) => {
      selectSettingsRecentRace(race, dropdown);
    });
  }
}

/**
 * Fetch races from the admin API
 * Returns races filtered to today only, formatted as RecentRace
 */
async function fetchRacesFromApi(): Promise<RecentRace[]> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    return [];
  }

  const response = await fetchWithTimeout('/api/admin/races', {
    headers: { 'Authorization': `Bearer ${token}` }
  }, 5000);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const raceInfos: RaceInfo[] = data.races || [];

  // Filter to today's races and convert to RecentRace format
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  const todaysRaces = raceInfos
    .filter(race => race.lastUpdated && race.lastUpdated >= todayStart)
    .map(race => ({
      raceId: race.raceId,
      createdAt: race.lastUpdated || Date.now(),
      lastUpdated: race.lastUpdated || Date.now(),
      entryCount: race.entryCount
    }))
    .slice(0, 5);

  // Also update localStorage with fetched races for future use
  todaysRaces.forEach(race => {
    addRecentRace(race.raceId, race.lastUpdated, race.entryCount);
  });

  return todaysRaces;
}

/**
 * Select a recent race and fill the settings race ID input
 */
function selectSettingsRecentRace(race: RecentRace, dropdown: HTMLElement): void {
  const input = document.getElementById('race-id-input') as HTMLInputElement;
  if (input) {
    input.value = race.raceId;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    feedbackTap();
  }
  dropdown.style.display = 'none';
}

/**
 * Update race exists indicator UI
 */
function updateRaceExistsIndicator(exists: boolean | null, entryCount: number): void {
  // Store state for language updates
  lastRaceExistsState = { exists, entryCount };

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
    const response = await fetch('/api/admin/pin', {
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
  if (clock) {
    try {
      clock.destroy();
    } catch (e) {
      console.warn('Clock cleanup error:', e);
    }
    clock = null;
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
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  if (raceCheckTimeout) {
    clearTimeout(raceCheckTimeout);
    raceCheckTimeout = null;
  }

  // MEMORY LEAK FIX: Clear search input listener reference
  searchInputListener = null;

  // MEMORY LEAK FIX: Resolve any pending PIN verification promise
  if (pinVerifyResolver) {
    pinVerifyResolver(false);
    pinVerifyResolver = null;
  }

  // Reset race check request ID
  raceCheckRequestId = 0;
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
 */
function verifyPinForChiefJudge(lang: Language): Promise<boolean> {
  return new Promise((resolve) => {
    // If already authenticated with valid token, allow without verification
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

    // Update modal text for Chief Judge context
    if (titleEl) titleEl.textContent = t('enterAdminPin', lang);
    if (textEl) textEl.textContent = t('enterPinForChiefJudge', lang);
    if (errorEl) errorEl.style.display = 'none';
    pinInput.value = '';

    // Store resolver for the verify button handler
    pinVerifyResolver = resolve;

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
  const result = await authenticateWithPin(enteredPin);

  if (result.success) {
    // PIN correct
    closeModal(modal);
    pinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
    pinVerifyResolver(true);
    pinVerifyResolver = null;
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
