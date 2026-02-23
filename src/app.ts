import {
  handleBeforeUnload,
  initCustomEventListeners,
} from './appEventListeners';
import { initServices } from './appInitServices';
import { initModals } from './appModalHandlers';
// Extracted app modules
import { initStateEffects } from './appStateHandlers';
import { updateUI } from './appUiUpdates';
import { showToast } from './components';
import { closeModal, isAnyModalOpen, openModal } from './features/modals';
import { initOfflineBanner } from './features/offlineBanner';
import { initRaceManagement } from './features/race';
import {
  initRadialTimerView,
  isRadialModeActive,
} from './features/radialTimerView';
import { initResultsView } from './features/resultsView';
// Feature modules
import { initRippleEffects } from './features/ripple';
import { initSettingsView, updateTranslations } from './features/settingsView';
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
import { feedbackTap } from './services';
import { $deviceRole, effect, store } from './store';
import { ListenerManager } from './utils/listenerManager';
import { logger } from './utils/logger';
import { getVersionInfo } from './version';

const listeners = new ListenerManager();

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
  const versionInfo = getVersionInfo(__APP_VERSION__, store.getState().currentLang);
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
    listeners.add(versionInfoBtn, 'click', async () => {
      const state = store.getState();
      const vInfo = getVersionInfo(__APP_VERSION__, state.currentLang);
      const versionLabel = vInfo
        ? `CHRONO v${__APP_VERSION__} "${vInfo.name}"`
        : `CHRONO v${__APP_VERSION__}`;
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

  // Lazy-load gate judge views (only init when role is gateJudge)
  const initRoleViews = () => {
    import('./features/gateJudgeView')
      .then((m) => m.initGateJudgeView())
      .catch((err) => logger.error('Failed to load gateJudgeView:', err));
    import('./features/chiefJudgeView')
      .then((m) => m.initChiefJudgeToggle())
      .catch((err) => logger.error('Failed to load chiefJudgeView:', err));
  };

  const role = store.getState().deviceRole;
  if (role === 'gateJudge') {
    initRoleViews();
  }

  // Handle runtime role changes - load views dynamically via signal effect
  let lastRole = role;
  effect(() => {
    const currentRole = $deviceRole.value;
    if (currentRole !== lastRole) {
      lastRole = currentRole;
      if (currentRole === 'gateJudge') {
        initRoleViews();
      }
    }
  });

  // Set up CustomEvent listeners for decoupled module communication
  initCustomEventListeners();
  initModals();
  initRaceManagement();
  initRippleEffects();
  initOfflineBanner();

  // Initialize signal-based state effects (replaces callback-based subscribe)
  initStateEffects();

  // Initialize services (sync, GPS, wake lock, ambient mode, voice)
  initServices();

  // Cleanup on page unload to prevent memory leaks
  listeners.add(window, 'beforeunload', handleBeforeUnload);

  // Apply initial UI state
  updateUI();

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
    listeners.add(showTutorialBtn, 'click', () => {
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
    listeners.add(showShortcutsBtn, 'click', () => {
      openModal(shortcutsModal);
      feedbackTap();
    });
  }
  if (shortcutsCloseBtn && shortcutsModal) {
    listeners.add(shortcutsCloseBtn, 'click', () => closeModal(shortcutsModal));
  }
  if (shortcutsDoneBtn && shortcutsModal) {
    listeners.add(shortcutsDoneBtn, 'click', () => closeModal(shortcutsModal));
  }

  // Global ? key to open keyboard shortcuts
  listeners.add(document, 'keydown', ((e: KeyboardEvent) => {
    if (e.key === '?' && !isAnyModalOpen()) {
      // Don't trigger when typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      )
        return;
      e.preventDefault();
      if (shortcutsModal) openModal(shortcutsModal);
    }
  }) as EventListener);
}
