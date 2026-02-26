import { refreshInlineFaultUI, updateActiveBibsList } from './features/faults';
import {
  updateGateJudgeRunSelection,
  updateGateRangeDisplay,
  updateJudgeReadyStatus,
} from './features/gateJudgeView';
import {
  isRadialModeActive,
  updateRadialBib,
} from './features/radialTimerView';
import { updateEntryCountBadge, updateStats } from './features/resultsView';
import {
  updateSettingsInputs,
  updateTranslations,
} from './features/settingsView';
import {
  updateBibDisplay,
  updateRunSelection,
  updateTimingPointSelection,
} from './features/timerView';
import { t } from './i18n/translations';
import { store } from './store';
import type { VoiceStatus } from './types';
import { getElement } from './utils/domCache';

/**
 * Update UI elements
 */
export function updateUI(): void {
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
export function updateViewVisibility(): void {
  const state = store.getState();
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.remove('active');
  });

  // Convert view name to kebab-case for CSS class (e.g., 'gateJudge' -> 'gate-judge')
  const viewClass = toKebabCase(state.currentView);
  const activeView = document.querySelector(`.${viewClass}-view`);
  if (activeView) {
    activeView.classList.add('active');
  }

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle(
      'active',
      btn.getAttribute('data-view') === state.currentView,
    );
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
export function updateSyncStatusIndicator(): void {
  const state = store.getState();
  const indicator = getElement('sync-indicator');
  const dot = getElement('sync-indicator')?.querySelector('.sync-dot');
  const text = getElement('sync-indicator')?.querySelector('.sync-status-text');
  const deviceCountEl = getElement('sync-device-count');

  // Show indicator when sync is enabled
  if (indicator) {
    indicator.style.display = state.settings.sync ? 'flex' : 'none';
  }

  const lang = state.currentLang;

  if (dot) {
    dot.classList.remove('connected', 'error', 'offline', 'syncing');
    if (indicator) {
      indicator.classList.remove('connected', 'error', 'offline', 'syncing');
    }
    if (state.syncStatus === 'connected') {
      dot.classList.add('connected');
      indicator?.classList.add('connected');
    } else if (state.syncStatus === 'syncing') {
      dot.classList.add('syncing');
      indicator?.classList.add('syncing');
    } else if (state.syncStatus === 'error') {
      dot.classList.add('error');
      indicator?.classList.add('error');
    } else if (state.syncStatus === 'offline') {
      dot.classList.add('offline');
      indicator?.classList.add('offline');
    }
    // Set aria-label for the dot based on sync status
    const syncLabel =
      state.syncStatus === 'connected'
        ? t('syncOnline', lang)
        : state.syncStatus === 'error'
          ? t('syncError', lang)
          : state.syncStatus === 'offline'
            ? t('syncOffline', lang)
            : t('syncing', lang);
    dot.setAttribute('aria-label', syncLabel);
  }

  // Use short translated status text to prevent layout shifts from varying text widths
  if (text) {
    const shortStatusText: Record<string, string> = {
      connected: t('syncShortConnected', lang),
      syncing: t('syncShortSyncing', lang),
      error: t('syncShortError', lang),
      offline: t('syncShortOff', lang),
      disconnected: t('syncShortOff', lang),
      connecting: t('syncShortSyncing', lang),
    };
    text.textContent =
      shortStatusText[state.syncStatus] || t(state.syncStatus, lang);
  }

  // Update aria-label on container for accessibility in dot-only mode
  if (indicator) {
    const syncLabel =
      state.syncStatus === 'connected'
        ? `${t('syncOnline', lang)}${state.cloudDeviceCount > 0 ? ` - ${state.cloudDeviceCount} ${t('devices', lang)}` : ''}`
        : state.syncStatus === 'error'
          ? t('syncError', lang)
          : state.syncStatus === 'offline'
            ? t('syncOffline', lang)
            : t('syncing', lang);
    indicator.setAttribute('aria-label', syncLabel);
  }

  // Show device count when connected - use abbreviated format for consistent width
  if (deviceCountEl) {
    if (state.syncStatus === 'connected' && state.cloudDeviceCount > 0) {
      deviceCountEl.textContent = `${state.cloudDeviceCount} ${t('syncDeviceAbbrev', lang)}`;
      deviceCountEl.style.display = 'inline';
      deviceCountEl.classList.add('status-active');
    } else if (state.syncStatus === 'error' || state.syncStatus === 'offline') {
      deviceCountEl.textContent = t('syncShortOff', lang);
      deviceCountEl.style.display = 'inline';
      deviceCountEl.classList.remove('status-active');
    } else {
      deviceCountEl.style.display = 'none';
    }
  }
}

/**
 * Update GPS indicator
 */
export function updateGpsIndicator(): void {
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
    if (indicator) {
      indicator.classList.remove('active', 'searching', 'inactive');
    }
    if (state.gpsStatus === 'active') {
      dot.classList.add('active');
      indicator?.classList.add('active');
    } else if (state.gpsStatus === 'searching') {
      dot.classList.add('searching');
      indicator?.classList.add('searching');
    } else if (state.gpsStatus === 'paused') {
      // GPS was working but is now paused (e.g., not on timer view) - show green without animation
      dot.classList.add('paused');
    } else {
      // 'inactive' status = red (GPS not working or permission denied)
      indicator?.classList.add('inactive');
    }
    const lang = state.currentLang;
    const ariaKey =
      state.gpsStatus === 'active' || state.gpsStatus === 'paused'
        ? 'gpsActive'
        : state.gpsStatus === 'searching'
          ? 'gpsSearching'
          : 'gpsInactive';
    dot.setAttribute('aria-label', t(ariaKey, lang));
  }

  // Use short GPS labels to prevent layout shifts
  if (text) {
    if (state.gpsStatus === 'active' || state.gpsStatus === 'paused') {
      text.textContent = 'GPS';
      text.classList.add('status-active');
      text.classList.remove('status-inactive', 'status-searching');
    } else if (state.gpsStatus === 'searching') {
      text.textContent = 'GPS...';
      text.classList.add('status-searching');
      text.classList.remove('status-active', 'status-inactive');
    } else {
      text.textContent = 'GPS Off';
      text.classList.add('status-inactive');
      text.classList.remove('status-active', 'status-searching');
    }
  }

  // Update aria-label for full-text accessibility in dot-only mode
  if (indicator) {
    const lang = state.currentLang;
    const ariaKey =
      state.gpsStatus === 'active' || state.gpsStatus === 'paused'
        ? 'gpsActive'
        : state.gpsStatus === 'searching'
          ? 'gpsSearching'
          : 'gpsInactive';
    indicator.setAttribute('aria-label', t(ariaKey, lang));
  }
}

/**
 * Update photo capture indicator in header status bar
 */
export function updatePhotoCaptureIndicator(): void {
  const state = store.getState();
  const cameraIndicator = getElement('camera-indicator');
  if (cameraIndicator) {
    const isVisible = state.settings.photoCapture;
    cameraIndicator.style.display = isVisible ? 'flex' : 'none';
    if (isVisible) {
      cameraIndicator.setAttribute(
        'aria-label',
        t('photoCapture', state.currentLang),
      );
    }
  }
}

/**
 * Update voice indicator in header
 */
export function updateVoiceIndicator(status: VoiceStatus): void {
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
  indicator.classList.remove(
    'listening',
    'processing',
    'confirming',
    'offline',
    'error',
  );

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
export function updateUndoButton(): void {
  const undoBtn = getElement('undo-btn');
  if (undoBtn) {
    undoBtn.toggleAttribute('disabled', !store.canUndo());
  }
}
