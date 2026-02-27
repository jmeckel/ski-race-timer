/**
 * Radial Timer View Module
 * Handles the radial dial timer interface with iPod-style spin input
 */

import { showToast } from '../components';
import { Clock } from '../components/Clock';
import { RadialDial } from '../components/RadialDial';
import { t } from '../i18n/translations';
import {
  captureTimingPhoto,
  feedbackSuccess,
  feedbackTap,
  feedbackWarning,
  gpsService,
  photoStorage,
  syncEntry,
} from '../services';
import { ambientModeService } from '../services/ambient';
import {
  $cloudDeviceCount,
  $entries,
  $gpsStatus,
  $selectedPoint,
  $selectedRun,
  $settingsGps,
  $settingsSync,
  $syncStatus,
  effect,
  store,
} from '../store';
import type { Entry, Run, TimingPoint } from '../types';
import { getElement, getPointLabel, logWarning } from '../utils';
import { formatTime } from '../utils/format';
import { ListenerManager } from '../utils/listenerManager';
import { logger } from '../utils/logger';
import {
  createTimestampEntry,
  isDuplicateEntry,
} from '../utils/timestampRecorder';

/** Check if bib is all zeros (e.g., "0", "00", "000") */
function isZeroBib(bib: string): boolean {
  if (!bib) return false;
  return /^0+$/.test(bib);
}

// Module-level listener manager for lifecycle cleanup
const listeners = new ListenerManager();

// Module state
let radialDial: RadialDial | null = null;
let radialClock: Clock | null = null;
let clockTickUnsubscribe: (() => void) | null = null;
let frozenTime: string | null = null;
let isInitialized = false;
let effectDisposers: (() => void)[] = [];
let confirmationTimeoutId: number | null = null;

// Cached DOM queries for frequently-updated selectors
let cachedPointBtns: Element[] = [];
let cachedRunBtns: Element[] = [];

/**
 * Initialize the radial timer view
 */
export function initRadialTimerView(): void {
  // Check if radial mode elements exist
  const dialContainer = getElement('dial-container');
  if (!dialContainer) {
    logger.debug('[RadialTimerView] Dial container not found, skipping init');
    return;
  }

  if (isInitialized) {
    logger.debug('[RadialTimerView] Already initialized');
    return;
  }

  logger.debug('[RadialTimerView] Initializing...');

  initRadialClock();
  initRadialDial();
  initRadialTimingPoints();
  initRadialRunSelector();
  initRadialTimeButton();
  initRadialClearButton();
  initRadialKeyboard();
  updateRadialGpsStatus();
  updateRadialSyncStatus();
  updateRadialStatsDisplay();

  // Subscribe to store changes via signal effects (auto-tracks dependencies)
  effectDisposers = [
    effect(() => {
      // Re-run GPS status only when GPS setting changes
      void $settingsGps.value;
      updateRadialGpsStatus();
    }),
    effect(() => {
      // Re-run sync status only when sync setting changes
      void $settingsSync.value;
      updateRadialSyncStatus();
    }),
    effect(() => {
      // Re-run when sync status or device count changes
      void $syncStatus.value;
      void $cloudDeviceCount.value;
      updateRadialSyncStatus();
    }),
    effect(() => {
      void $selectedPoint.value;
      updateRadialTimingPointSelection();
    }),
    effect(() => {
      void $selectedRun.value;
      updateRadialRunSelection();
    }),
    effect(() => {
      void $entries.value;
      updateRadialStatsDisplay();
    }),
    effect(() => {
      void $gpsStatus.value;
      updateRadialGpsStatus();
    }),
  ];

  // Re-translate dynamic text and dial aria-labels when language changes
  listeners.add(window, 'settings-language-changed', () => {
    updateRadialStatsDisplay();
    radialDial?.updateAriaLabels();
  });

  isInitialized = true;
  logger.debug('[RadialTimerView] Initialized successfully');
}

/**
 * Initialize the radial clock display.
 * Reuses the shared Clock component's RAF loop and battery-aware frame skipping
 * instead of maintaining a separate animation loop.
 * The Clock instance renders into the (hidden) clock-container; we subscribe
 * to its onTick callback to update the radial time display elements.
 */
function initRadialClock(): void {
  // Clean up existing clock if re-initializing
  if (clockTickUnsubscribe) {
    clockTickUnsubscribe();
    clockTickUnsubscribe = null;
  }
  if (radialClock) {
    radialClock.destroy();
    radialClock = null;
  }

  // Cache radial time display elements
  const hmEl = getElement('radial-time-hm');
  const secEl = getElement('radial-time-seconds');
  const subEl = getElement('radial-time-subseconds');

  // Create a Clock instance to reuse its RAF loop, visibility pausing, and battery-aware throttling.
  // Use existing clock-container if available, otherwise create a hidden one.
  let container = getElement('clock-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'clock-container';
    container.style.display = 'none';
    document.body.appendChild(container);
  }

  radialClock = new Clock(container);

  // Subscribe to tick updates to drive the radial time display
  clockTickUnsubscribe = radialClock.onTick((h, m, s, ms) => {
    if (frozenTime) return;
    if (hmEl) hmEl.textContent = `${h}:${m}`;
    if (secEl) secEl.textContent = s;
    if (subEl) subEl.textContent = ms;
  });

  // Perform an initial update before the first tick fires
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const secs = String(now.getSeconds()).padStart(2, '0');
  const msecs = String(now.getMilliseconds()).padStart(3, '0');
  if (hmEl) hmEl.textContent = `${hours}:${mins}`;
  if (secEl) secEl.textContent = secs;
  if (subEl) subEl.textContent = msecs;

  radialClock.start();
}

/**
 * Initialize the radial dial component
 */
function initRadialDial(): void {
  const container = getElement('dial-container');
  if (!container) return;

  // Destroy existing dial if re-initializing
  if (radialDial) {
    radialDial.destroy();
  }

  radialDial = new RadialDial(container, {
    onChange: (value: string) => {
      store.setBibInput(value);
      updateRadialBibDisplay(value);
    },
    momentum: 1.5,
    friction: 0.97,
    sensitivity: 24,
  });

  // Sync initial bib value
  const state = store.getState();
  if (state.bibInput) {
    radialDial.setValue(state.bibInput);
    updateRadialBibDisplay(state.bibInput);
  }
}

/**
 * Update the radial bib display
 */
function updateRadialBibDisplay(value: string): void {
  const bibEl = getElement('radial-bib-value');
  if (!bibEl) return;

  if (!value) {
    bibEl.textContent = '---';
    bibEl.classList.remove('active');
  } else {
    bibEl.textContent = value.padStart(3, '0');
    bibEl.classList.add('active');
  }
}

/**
 * Initialize timing point buttons
 */
function initRadialTimingPoints(): void {
  const container = getElement('radial-timing-point');
  if (!container) return;

  listeners.add(container, 'click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.radial-point-btn');
    if (!btn) return;

    const point = btn.getAttribute('data-point') as TimingPoint;
    if (point) {
      store.setSelectedPoint(point);
      feedbackTap();
      updateRadialTimingPointSelection();
    }
  });

  // Cache buttons and set initial state
  cachedPointBtns = Array.from(document.querySelectorAll('.radial-point-btn'));
  updateRadialTimingPointSelection();
}

/**
 * Update timing point selection display
 */
function updateRadialTimingPointSelection(): void {
  const state = store.getState();
  cachedPointBtns.forEach((btn) => {
    const isActive = btn.getAttribute('data-point') === state.selectedPoint;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
}

/**
 * Initialize run selector buttons
 */
function initRadialRunSelector(): void {
  const container = getElement('radial-run-selector');
  if (!container) return;

  listeners.add(container, 'click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.radial-run-btn');
    if (!btn) return;

    const runStr = btn.getAttribute('data-run');
    if (runStr) {
      const run = parseInt(runStr, 10) as Run;
      store.setSelectedRun(run);
      feedbackTap();
      updateRadialRunSelection();
    }
  });

  // Cache buttons and set initial state
  cachedRunBtns = Array.from(document.querySelectorAll('.radial-run-btn'));
  updateRadialRunSelection();
}

/**
 * Update run selection display
 */
function updateRadialRunSelection(): void {
  const state = store.getState();
  cachedRunBtns.forEach((btn) => {
    const runStr = btn.getAttribute('data-run');
    const isActive = runStr === String(state.selectedRun);
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
}

/**
 * Initialize the time button
 */
function initRadialTimeButton(): void {
  const btn = getElement('radial-time-btn');
  if (!btn) return;

  listeners.add(btn, 'click', recordRadialTimestamp);
}

/**
 * Initialize clear button
 */
function initRadialClearButton(): void {
  const btn = getElement('radial-clear-btn');
  if (!btn) return;

  listeners.add(btn, 'click', () => {
    radialDial?.clear();
    store.setBibInput('');
    updateRadialBibDisplay('');
    feedbackTap();

    // Visual confirmation flash
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 150);
  });
}

/**
 * Initialize keyboard shortcuts
 */
function initRadialKeyboard(): void {
  listeners.add(document, 'keydown', ((e: KeyboardEvent) => {
    const activeTag = document.activeElement?.tagName;
    const state = store.getState();

    if (
      activeTag === 'INPUT' ||
      activeTag === 'TEXTAREA' ||
      activeTag === 'SELECT'
    ) {
      return;
    }
    if (state.currentView !== 'timer') {
      return;
    }

    // Number keys for bib input
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const currentBib = state.bibInput;
      if (currentBib.length < 3) {
        const newBib = currentBib + e.key;
        store.setBibInput(newBib);
        radialDial?.setValue(newBib);
        updateRadialBibDisplay(newBib);
        feedbackTap();
      }
      return;
    }

    // Backspace
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newBib = state.bibInput.slice(0, -1);
      store.setBibInput(newBib);
      radialDial?.setValue(newBib);
      updateRadialBibDisplay(newBib);
      feedbackTap();
      return;
    }

    // Delete/Escape - clear
    if (e.key === 'Delete' || e.key === 'Escape') {
      e.preventDefault();
      radialDial?.clear();
      store.setBibInput('');
      updateRadialBibDisplay('');
      feedbackTap();
      return;
    }

    // S/F for timing points
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      store.setSelectedPoint('S');
      feedbackTap();
      updateRadialTimingPointSelection();
      return;
    }

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      store.setSelectedPoint('F');
      feedbackTap();
      updateRadialTimingPointSelection();
      return;
    }

    // L1/L2 run selection with Alt+1 or Alt+2 (to avoid conflict with bib input)
    if (e.altKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
      e.preventDefault();
      const run = e.code === 'Digit1' ? 1 : 2;
      store.setSelectedRun(run);
      feedbackTap();
      updateRadialRunSelection();
      return;
    }

    // Space/Enter for timestamp
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      recordRadialTimestamp();
      return;
    }
  }) as EventListener);
}

/**
 * Record a timestamp with radial UI feedback
 */
async function recordRadialTimestamp(): Promise<void> {
  // Suppress recording if ambient mode just exited (first tap only exits)
  if (ambientModeService.wasRecentlyExited()) {
    feedbackTap();
    return;
  }

  const state = store.getState();
  if (state.isRecording) return;

  // Create entry immediately using shared utility (captures GPS-corrected timestamp)
  const { entry } = createTimestampEntry({
    bib: state.bibInput,
    point: state.selectedPoint,
    run: state.selectedRun,
    deviceId: state.deviceId,
    deviceName: state.deviceName,
    gpsService,
  });

  store.setRecording(true);

  try {
    // Photo capture (async, non-blocking)
    if (state.settings.photoCapture) {
      captureTimingPhoto()
        .then(async (photo) => {
          if (photo) {
            // Verify entry still exists (may have been undone/deleted)
            const exists = store
              .getState()
              .entries.some((e) => e.id === entry.id);
            if (!exists) return;
            try {
              const saved = await photoStorage.savePhoto(entry.id, photo);
              if (saved) {
                store.updateEntry(entry.id, { photo: 'indexeddb' });
              }
            } catch (err) {
              logWarning('Camera', 'photo save', err, 'photoError');
            }
          }
        })
        .catch((err) => {
          if (err instanceof Error && err.name === 'PhotoTooLargeError') {
            const lang = store.getState().currentLang;
            showToast(t('photoTooLarge', lang), 'warning');
          } else {
            logWarning('Camera', 'captureTimingPhoto', err, 'photoError');
          }
        });
    }

    // Check for duplicate and zero bib
    const isDuplicate = isDuplicateEntry(entry, state.entries);
    const hasZeroBib = isZeroBib(entry.bib);

    // Add entry
    store.addEntry(entry);

    // Feedback + visual warnings
    if (isDuplicate) {
      feedbackWarning();
      showRadialConfirmation(entry, 'duplicate');
    } else if (hasZeroBib) {
      feedbackWarning();
      showRadialConfirmation(entry, 'zeroBib');
    } else {
      feedbackSuccess();
      showRadialConfirmation(entry);
    }

    // Sync: eager cloud push + broadcast to other tabs
    void syncEntry(entry).catch((err) => {
      logger.error('syncEntry failed:', err);
    });

    // Auto-increment bib or clear after recording
    if (state.settings.auto && state.bibInput) {
      const localNext = parseInt(state.bibInput, 10) + 1;
      const nextBib = Math.min(
        state.settings.sync && state.cloudHighestBib > 0
          ? Math.max(localNext, state.cloudHighestBib + 1)
          : localNext,
        999,
      );
      const newBib = String(nextBib);
      store.setBibInput(newBib);
      radialDial?.setValue(newBib);
      updateRadialBibDisplay(newBib);
    } else if (state.bibInput && !state.settings.auto) {
      store.setBibInput('');
      radialDial?.clear();
      updateRadialBibDisplay('');
    }

    // Update stats
    updateRadialStatsDisplay();
  } finally {
    store.setRecording(false);
  }
}

/**
 * Show confirmation with radial effects
 */
function showRadialConfirmation(
  entry: Entry,
  warning?: 'duplicate' | 'zeroBib',
): void {
  const now = new Date(entry.timestamp);
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const timeStr = `${h}:${m}:${s}.${ms}`;

  // Freeze time display
  frozenTime = timeStr;
  const hmEl = getElement('radial-time-hm');
  const secEl = getElement('radial-time-seconds');
  const subEl = getElement('radial-time-subseconds');
  if (hmEl) hmEl.textContent = `${h}:${m}`;
  if (secEl) secEl.textContent = s;
  if (subEl) subEl.textContent = ms;

  // Flash effects
  const dialRing = getElement('dial-ring');
  const timeDisplay = getElement('radial-time-display');
  const timeBtn = getElement('radial-time-btn');

  dialRing?.classList.add('flash');
  timeDisplay?.classList.add('flash', 'frozen');
  timeBtn?.classList.add('flash');

  // Flash dial numbers
  radialDial?.flash();

  // Show confirmation overlay
  const overlay = getElement('radial-confirmation-overlay');
  const confirmBib = getElement('radial-confirm-bib');
  const confirmTime = getElement('radial-confirm-time');
  const confirmPoint = getElement('radial-confirm-point');

  if (confirmBib) confirmBib.textContent = entry.bib || '---';
  if (confirmTime) confirmTime.textContent = timeStr;
  if (confirmPoint) {
    const state = store.getState();
    confirmPoint.textContent = getPointLabel(entry.point, state.currentLang);
    confirmPoint.className = `radial-confirmation-point ${entry.point === 'S' ? 'start' : 'finish'}`;
  }

  // Show warning if applicable
  const warningEl = getElement('radial-confirm-warning');
  const warningText = getElement('radial-confirm-warning-text');
  if (warningEl && warningText) {
    if (warning) {
      const state2 = store.getState();
      warningText.textContent =
        warning === 'duplicate'
          ? t('duplicateWarning', state2.currentLang)
          : t('zeroBibWarning', state2.currentLang);
      warningEl.style.display = 'flex';
    } else {
      warningEl.style.display = 'none';
    }
  }

  overlay?.classList.add('show');
  overlay?.setAttribute('aria-hidden', 'false');

  // Clear any previous confirmation timeout
  if (confirmationTimeoutId !== null) {
    clearTimeout(confirmationTimeoutId);
  }

  // Reset after delay
  const delay = warning ? 2500 : 1200;
  confirmationTimeoutId = window.setTimeout(() => {
    confirmationTimeoutId = null;
    frozenTime = null;
    dialRing?.classList.remove('flash');
    timeDisplay?.classList.remove('flash', 'frozen');
    timeBtn?.classList.remove('flash');
    overlay?.classList.remove('show');
    overlay?.setAttribute('aria-hidden', 'true');
    if (warningEl) warningEl.style.display = 'none';
  }, delay);
}

/**
 * Update GPS status display
 */
function updateRadialGpsStatus(): void {
  const state = store.getState();
  const container = getElement('radial-gps-status');
  if (!container) return;

  const dot = container.querySelector('.radial-status-dot');
  if (!dot) return;

  if (!state.settings.gps) {
    dot.className = 'radial-status-dot inactive';
  } else if (state.gpsStatus === 'active') {
    dot.className = 'radial-status-dot';
  } else if (state.gpsStatus === 'searching') {
    dot.className = 'radial-status-dot warning';
  } else {
    dot.className = 'radial-status-dot inactive';
  }
}

/**
 * Update sync status display
 */
function updateRadialSyncStatus(): void {
  const state = store.getState();
  const container = getElement('radial-sync-status');
  if (!container) return;

  if (!state.settings.sync) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  const dot = container.querySelector('.radial-status-dot');
  const text = container.querySelector('.radial-sync-text');

  if (dot) {
    if (state.syncStatus === 'connected') {
      dot.className = 'radial-status-dot';
    } else if (state.syncStatus === 'error') {
      dot.className = 'radial-status-dot error';
    } else {
      dot.className = 'radial-status-dot warning';
    }
  }

  if (text) {
    const deviceCount = state.cloudDeviceCount || 0;
    const lang = state.currentLang;
    text.textContent =
      deviceCount > 0
        ? `${t('synced', lang)} (${deviceCount})`
        : t('syncingStatus', lang);
  }
}

/**
 * Update stats display
 */
function updateRadialStatsDisplay(): void {
  const state = store.getState();
  const entries = state.entries;

  // Entry count
  const countEl = getElement('radial-stats-count');
  if (countEl) {
    countEl.textContent = `${entries.length} ${entries.length === 1 ? t('entry', state.currentLang) : t('entries', state.currentLang)}`;
  }

  // Last recorded
  if (entries.length > 0) {
    const lastEntry = entries[entries.length - 1]!;
    const lastBibEl = getElement('radial-last-bib');
    const lastPointEl = getElement('radial-last-point');
    const lastTimeEl = getElement('radial-last-time');

    if (lastBibEl) lastBibEl.textContent = lastEntry.bib || '---';
    if (lastPointEl) {
      lastPointEl.textContent =
        lastEntry.point === 'S'
          ? t('startShort', state.currentLang)
          : t('finishShort', state.currentLang);
      lastPointEl.className = `radial-stats-point ${lastEntry.point === 'S' ? 'start' : 'finish'}`;
    }
    if (lastTimeEl) {
      const date = new Date(lastEntry.timestamp);
      lastTimeEl.textContent = formatTime(date);
    }
  }
}

/**
 * Cleanup radial timer view
 */
export function destroyRadialTimerView(): void {
  for (const dispose of effectDisposers) {
    dispose();
  }
  effectDisposers = [];

  if (clockTickUnsubscribe) {
    clockTickUnsubscribe();
    clockTickUnsubscribe = null;
  }

  if (radialClock) {
    radialClock.destroy();
    radialClock = null;
  }

  listeners.removeAll();

  if (radialDial) {
    radialDial.destroy();
    radialDial = null;
  }

  if (confirmationTimeoutId !== null) {
    clearTimeout(confirmationTimeoutId);
    confirmationTimeoutId = null;
  }

  frozenTime = null;
  isInitialized = false;
  cachedPointBtns = [];
  cachedRunBtns = [];
}

/**
 * Update bib display (called from store subscription)
 */
export function updateRadialBib(): void {
  const state = store.getState();
  updateRadialBibDisplay(state.bibInput);
  radialDial?.setValue(state.bibInput);
}

/**
 * Check if radial mode is active
 */
export function isRadialModeActive(): boolean {
  const timerView = document.querySelector('.timer-view');
  return timerView?.classList.contains('radial-mode') ?? false;
}
