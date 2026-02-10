import {
  handleBeforeUnload,
  handleStorageError,
  handleStorageWarning,
  initCustomEventListeners,
  initVoiceMode,
} from './appEventListeners';
import { initModals } from './appModalHandlers';
import { closeModal, isAnyModalOpen, openModal } from './features/modals';
// Extracted app modules
import { handleStateChange } from './appStateHandlers';
import { updateUI } from './appUiUpdates';
import { showToast } from './components';
import { initChiefJudgeToggle } from './features/chiefJudgeView';
import { initGateJudgeView } from './features/gateJudgeView';
import { initOfflineBanner } from './features/offlineBanner';
import {
  handleAuthExpired,
  handleRaceDeleted,
  initRaceManagement,
} from './features/race';
import {
  initRadialTimerView,
  isRadialModeActive,
} from './features/radialTimerView';
import { initResultsView } from './features/resultsView';
// Feature modules
import { initRippleEffects } from './features/ripple';
import {
  applySettings,
  initSettingsView,
  updateTranslations,
} from './features/settingsView';
import {
  initClock,
  initNumberPad,
  initRunSelector,
  initTabs,
  initTimestampButton,
  initTimingPoints,
} from './features/timerView';
import { t } from './i18n/translations';
import { OnboardingController } from './onboarding';
import {
  ambientModeService,
  feedbackTap,
  gpsService,
  resumeAudio,
  syncService,
  wakeLockService,
} from './services';
import { hasAuthToken } from './services/sync';
import { store } from './store';
import { applyViewServices } from './utils/viewServices';
import { getVersionInfo } from './version';

// DOM Elements cache
let onboardingController: OnboardingController | null = null;

/**
 * Initialize the application
 */
export function initApp(): void {
  // Set version in UI
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = __APP_VERSION__;

  // Set version name and description
  const versionInfo = getVersionInfo(__APP_VERSION__);
  const versionNameEl = document.getElementById('app-version-name');
  const versionDescEl = document.getElementById('app-version-description');
  if (versionInfo && versionNameEl) {
    versionNameEl.textContent = `"${versionInfo.name}"`;
  }
  if (versionInfo && versionDescEl) {
    versionDescEl.textContent = versionInfo.description;
  }

  // Version info button - copy debug info to clipboard
  const versionInfoBtn = document.getElementById('version-info-btn');
  if (versionInfoBtn) {
    versionInfoBtn.addEventListener('click', async () => {
      const state = store.getState();
      const vInfo = getVersionInfo(__APP_VERSION__);
      const versionLabel = vInfo
        ? `Ski Race Timer v${__APP_VERSION__} "${vInfo.name}"`
        : `Ski Race Timer v${__APP_VERSION__}`;
      const debugInfo = [
        versionLabel,
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
        `Timestamp: ${new Date().toISOString()}`,
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
  initOfflineBanner();

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
      const syncToggle = document.getElementById(
        'sync-toggle',
      ) as HTMLInputElement;
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
  window.addEventListener(
    'storage-warning',
    handleStorageWarning as EventListener,
  );

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
  onboardingController.setUpdateTranslationsCallback(() =>
    updateTranslations(),
  );

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

  // Keyboard shortcuts modal
  const shortcutsModal = document.getElementById('keyboard-shortcuts-modal');
  const showShortcutsBtn = document.getElementById('show-shortcuts-btn');
  const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');
  const shortcutsDoneBtn = document.getElementById('shortcuts-done-btn');

  if (showShortcutsBtn && shortcutsModal) {
    showShortcutsBtn.addEventListener('click', () => {
      openModal(shortcutsModal);
      feedbackTap();
    });
  }
  if (shortcutsCloseBtn && shortcutsModal) {
    shortcutsCloseBtn.addEventListener('click', () => closeModal(shortcutsModal));
  }
  if (shortcutsDoneBtn && shortcutsModal) {
    shortcutsDoneBtn.addEventListener('click', () => closeModal(shortcutsModal));
  }

  // Global ? key to open keyboard shortcuts
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === '?' && !isAnyModalOpen()) {
      // Don't trigger when typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      e.preventDefault();
      if (shortcutsModal) openModal(shortcutsModal);
    }
  });
}
