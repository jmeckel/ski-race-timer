import { store } from './store';
import { showToast, destroyToast } from './components';
import { syncService, gpsService, cameraService, wakeLockService, ambientModeService, voiceModeService } from './services';
import { feedbackWarning } from './services';
import { logger } from './utils/logger';
import { TOAST_DURATION } from './utils';
import { ListenerManager } from './utils/listenerManager';
import { t } from './i18n/translations';
import { cleanupRippleEffects } from './features/ripple';
import { destroyClock } from './features/timerView';
import { destroyRadialTimerView, isRadialModeActive } from './features/radialTimerView';
import { handleTimerVoiceIntent } from './features/timerView';
import { handleGateJudgeVoiceIntent } from './features/gateJudgeView';
import { cleanupSearchTimeout } from './features/resultsView';
import { cleanupSettingsTimeouts, resolvePhotoSyncWarning, resolveRaceChangeDialog } from './features/settingsView';
import { updateRoleToggle } from './features/settingsView';
import { cleanupPinVerification } from './features/raceManagement';
import { handleRaceDeleted, handleAuthExpired, showPhotoSyncWarningModal, showRaceChangeDialog, verifyPinForChiefJudge } from './features/raceManagement';
import { resolvePinVerification } from './features/chiefJudgeView';
import { openFaultEditModal, openMarkDeletionModal, updateInlineFaultsList, updateInlineBibSelector, updateInlineGateSelector } from './features/faultEntry';
import { openEditModal, openConfirmModal, promptDelete, closeAllModals } from './appModalHandlers';
import { updateVoiceIndicator } from './appUiUpdates';
import type { Entry, FaultEntry, Language, VoiceStatus } from './types';
import type { ConfirmModalAction } from './features/resultsView';

// Custom event listener references (stored for cleanup in handleBeforeUnload)
const customEventListeners = new ListenerManager();

/**
 * Register a custom event listener and store its reference for cleanup
 */
function addCustomEventListener(eventName: string, handler: EventListener): void {
  customEventListeners.add(window, eventName, handler);
}

/**
 * Initialize CustomEvent listeners for decoupled module communication
 * Replaces the old callback injection pattern
 * All listeners are stored as named references for cleanup in handleBeforeUnload
 */
export function initCustomEventListeners(): void {
  // Results view events
  addCustomEventListener('open-edit-modal', ((e: CustomEvent<{ entry: Entry }>) => {
    openEditModal(e.detail.entry);
  }) as EventListener);

  addCustomEventListener('prompt-delete', ((e: CustomEvent<{ entry: Entry }>) => {
    promptDelete(e.detail.entry);
  }) as EventListener);

  addCustomEventListener('open-confirm-modal', ((e: CustomEvent<{ action: ConfirmModalAction }>) => {
    openConfirmModal(e.detail.action);
  }) as EventListener);

  // Settings view events
  addCustomEventListener('request-photo-sync-warning', (async () => {
    try {
      await showPhotoSyncWarningModal();
      resolvePhotoSyncWarning();
    } catch (err) {
      logger.error('Photo sync warning modal failed:', err);
      resolvePhotoSyncWarning(); // Resolve anyway to prevent hanging
    }
  }) as EventListener);

  addCustomEventListener('request-race-change-dialog', (async (e: Event) => {
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
  addCustomEventListener('update-role-toggle', (() => {
    updateRoleToggle();
  }) as EventListener);

  // Chief judge view events - PIN verification (Promise-based)
  addCustomEventListener('request-pin-verification', (async (e: Event) => {
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
  addCustomEventListener('open-fault-edit-modal', ((e: CustomEvent<{ fault: FaultEntry }>) => {
    openFaultEditModal(e.detail.fault);
  }) as EventListener);

  addCustomEventListener('open-mark-deletion-modal', ((e: CustomEvent<{ fault: FaultEntry }>) => {
    openMarkDeletionModal(e.detail.fault);
  }) as EventListener);

  // Chief judge view events - inline fault UI updates (gate judge mode)
  addCustomEventListener('update-inline-faults-list', (() => {
    updateInlineFaultsList();
  }) as EventListener);

  addCustomEventListener('update-inline-bib-selector', (() => {
    updateInlineBibSelector();
  }) as EventListener);

  addCustomEventListener('update-inline-gate-selector', (() => {
    updateInlineGateSelector();
  }) as EventListener);
}

/**
 * Initialize voice mode service
 * Uses server-side proxy at /api/v1/voice for LLM processing
 */
export function initVoiceMode(): void {
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
 * Handle storage error event - CRITICAL for data integrity
 */
export function handleStorageError(event: CustomEvent<{ message: string; isQuotaError: boolean; entryCount: number }>): void {
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
export function handleStorageWarning(event: CustomEvent<{ usage: number; quota: number; percent: number }>): void {
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
export function handleBeforeUnload(): void {
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

  // MEMORY LEAK FIX: Remove all custom event listeners (stored by reference)
  customEventListeners.removeAll();

  // MEMORY LEAK FIX: Clear debounced timeouts
  cleanupSearchTimeout();
  cleanupSettingsTimeouts();

  // MEMORY LEAK FIX: Resolve any pending PIN verification promise
  cleanupPinVerification();
}
