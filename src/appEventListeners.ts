import {
  openConfirmModal,
  openEditModal,
  promptDelete,
} from './appModalHandlers';
import { updateVoiceIndicator } from './appUiUpdates';
import { destroyToast, showToast } from './components';
import { resolvePinVerification } from './features/chiefJudgeView';
import {
  openFaultEditModal,
  openMarkDeletionModal,
  updateInlineBibSelector,
  updateInlineFaultsList,
  updateInlineGateSelector,
} from './features/faults';
import { handleGateJudgeVoiceIntent } from './features/gateJudgeView';
import {
  cleanupPinVerification,
  handleAuthExpired,
  handleRaceDeleted,
  showPhotoSyncWarningModal,
  showRaceChangeDialog,
  verifyPinForChiefJudge,
} from './features/race';
import { destroyRadialTimerView } from './features/radialTimerView';
import type { ConfirmModalAction } from './features/resultsView';
import { cleanupSearchTimeout } from './features/resultsView';
import { cleanupRippleEffects } from './features/ripple';
import {
  cleanupSettingsTimeouts,
  resolvePhotoSyncWarning,
  resolveRaceChangeDialog,
  updateRoleToggle,
} from './features/settingsView';
import { destroyClock, handleTimerVoiceIntent } from './features/timerView';
import { t } from './i18n/translations';
import {
  cameraService,
  cleanupFeedback,
  feedbackWarning,
  gpsService,
  syncService,
  voiceModeService,
  wakeLockService,
} from './services';
import { ambientModeService } from './services/ambient';
import { storage } from './services/storage';
import { store } from './store';
import type { Entry, FaultEntry, Language, VoiceStatus } from './types';
import { TOAST_DURATION } from './utils';
import { ListenerManager } from './utils/listenerManager';
import { logger } from './utils/logger';

// Custom event listener references (stored for cleanup in handleBeforeUnload)
const customEventListeners = new ListenerManager();

/**
 * Register a custom event listener and store its reference for cleanup
 */
function addCustomEventListener(
  eventName: string,
  handler: EventListener,
): void {
  customEventListeners.add(window, eventName, handler);
}

/**
 * Initialize CustomEvent listeners for decoupled module communication
 * Replaces the old callback injection pattern
 * All listeners are stored as named references for cleanup in handleBeforeUnload
 */
export function initCustomEventListeners(): void {
  // Results view events
  addCustomEventListener('open-edit-modal', ((
    e: CustomEvent<{ entry: Entry }>,
  ) => {
    openEditModal(e.detail.entry);
  }) as EventListener);

  addCustomEventListener('prompt-delete', ((
    e: CustomEvent<{ entry: Entry }>,
  ) => {
    promptDelete(e.detail.entry);
  }) as EventListener);

  addCustomEventListener('open-confirm-modal', ((
    e: CustomEvent<{ action: ConfirmModalAction }>,
  ) => {
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
      const customEvent = e as CustomEvent<{
        type: 'synced' | 'unsynced';
        lang: Language;
      }>;
      const result = await showRaceChangeDialog(
        customEvent.detail.type,
        customEvent.detail.lang,
      );
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
  addCustomEventListener('open-fault-edit-modal', ((
    e: CustomEvent<{ fault: FaultEntry }>,
  ) => {
    openFaultEditModal(e.detail.fault);
  }) as EventListener);

  addCustomEventListener('open-mark-deletion-modal', ((
    e: CustomEvent<{ fault: FaultEntry }>,
  ) => {
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
  const customConfig = (window as unknown as Record<string, unknown>)
    .VOICE_LLM_CONFIG as
    | {
        endpoint?: string;
        apiKey?: string;
      }
    | undefined;

  const llmConfig = {
    endpoint: customConfig?.endpoint || proxyEndpoint,
    apiKey: customConfig?.apiKey || 'proxy', // Proxy handles auth server-side
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
export function handleStorageError(
  event: CustomEvent<{
    message: string;
    isQuotaError: boolean;
    entryCount: number;
    retriesExhausted?: boolean;
  }>,
): void {
  const { isQuotaError, entryCount, retriesExhausted } = event.detail;
  const lang = store.getState().currentLang;

  if (retriesExhausted) {
    // All retries failed — data is in memory only, at risk of loss
    showToast(t('storageSaveGaveUp', lang), 'error', 15000);
  } else if (isQuotaError) {
    // Storage quota exceeded - show actionable message
    showToast(t('storageNearlyFull', lang), 'error', TOAST_DURATION.CRITICAL);
  } else {
    // General storage error
    showToast(t('storageError', lang), 'error', TOAST_DURATION.ERROR);
  }

  // Also trigger haptic feedback to ensure user notices
  feedbackWarning();

  logger.error('[Storage] saveEntries:', event.detail.message, {
    entryCount,
    isQuotaError,
    retriesExhausted,
  });
}

/**
 * Handle storage warning event - storage is getting full
 */
export function handleStorageWarning(
  event: CustomEvent<{
    usage: number;
    quota: number;
    percent: number;
    critical?: boolean;
  }>,
): void {
  const { percent, critical } = event.detail;
  const lang = store.getState().currentLang;

  if (critical) {
    // Critical: always show at 90%+
    showToast(
      `${t('storageQuotaError', lang)} (${percent}%)`,
      'error',
      TOAST_DURATION.CRITICAL,
    );
  } else {
    // Warning: show once per session at 80%+
    const warningShown = sessionStorage.getItem('storage-warning-shown');
    if (!warningShown) {
      showToast(
        t('storageNearlyFull', lang),
        'warning',
        TOAST_DURATION.WARNING,
      );
      sessionStorage.setItem('storage-warning-shown', 'true');
    }
  }
}

/**
 * Handle page unload - cleanup to prevent memory leaks
 */
export function handleBeforeUnload(): void {
  // Force-save any pending store changes (bypasses 100ms deferred timeout)
  // then flush to localStorage to prevent data loss on fast navigation
  try {
    store.forceSave();
    storage.flush();
  } catch (e) {
    logger.warn('Storage flush error on unload:', e);
  }

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

  // Cleanup ambient mode service
  ambientModeService.cleanup();

  // Cleanup voice mode service
  voiceModeService.cleanup();

  // Cleanup toast singleton and its event listener
  destroyToast();

  // MEMORY LEAK FIX: Clear all pending ripple timeouts and remove orphaned ripples
  cleanupRippleEffects();
  document.querySelectorAll('.ripple').forEach((ripple) => ripple.remove());

  // MEMORY LEAK FIX: Remove global event listeners
  window.removeEventListener(
    'race-deleted',
    handleRaceDeleted as EventListener,
  );
  window.removeEventListener(
    'auth-expired',
    handleAuthExpired as EventListener,
  );
  window.removeEventListener(
    'storage-error',
    handleStorageError as EventListener,
  );
  window.removeEventListener(
    'storage-warning',
    handleStorageWarning as EventListener,
  );

  // MEMORY LEAK FIX: Remove all custom event listeners (stored by reference)
  customEventListeners.removeAll();

  // MEMORY LEAK FIX: Clear debounced timeouts
  cleanupSearchTimeout();
  cleanupSettingsTimeouts();

  // MEMORY LEAK FIX: Resolve any pending PIN verification promise
  cleanupPinVerification();

  // Cleanup audio context and pending idle timeout
  cleanupFeedback();
}
