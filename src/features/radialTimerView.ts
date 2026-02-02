/**
 * Radial Timer View Module
 * Handles the radial dial timer interface with iPod-style spin input
 */

import { store } from '../store';
import { RadialDial } from '../components/RadialDial';
import { showToast } from '../components';
import { syncService, gpsService, captureTimingPhoto, photoStorage } from '../services';
import { feedbackSuccess, feedbackWarning, feedbackTap } from '../services';
import { generateEntryId, getPointLabel, logWarning, getElement } from '../utils';
import { formatTime } from '../utils/format';
import { t } from '../i18n/translations';
import { logger } from '../utils/logger';
import type { Entry, TimingPoint, Run } from '../types';

// Module state
let radialDial: RadialDial | null = null;
let clockInterval: number | null = null;
let frozenTime: string | null = null;
let isInitialized = false;

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

  // Subscribe to store changes
  store.subscribe((_state, changedKeys) => {
    if (changedKeys.includes('settings')) {
      updateRadialGpsStatus();
      updateRadialSyncStatus();
    }
    if (changedKeys.includes('syncStatus') || changedKeys.includes('cloudDeviceCount')) {
      updateRadialSyncStatus();
    }
    if (changedKeys.includes('selectedPoint')) {
      updateRadialTimingPointSelection();
    }
    if (changedKeys.includes('selectedRun')) {
      updateRadialRunSelection();
    }
    if (changedKeys.includes('entries')) {
      updateRadialStatsDisplay();
    }
    if (changedKeys.includes('gpsStatus')) {
      updateRadialGpsStatus();
    }
  });

  isInitialized = true;
  logger.debug('[RadialTimerView] Initialized successfully');
}

/**
 * Initialize the radial clock display
 */
function initRadialClock(): void {
  const updateClock = () => {
    if (frozenTime) return;

    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');

    const hmEl = getElement('radial-time-hm');
    const secEl = getElement('radial-time-seconds');
    const subEl = getElement('radial-time-subseconds');

    if (hmEl) hmEl.textContent = `${h}:${m}`;
    if (secEl) secEl.textContent = s;
    if (subEl) subEl.textContent = ms;
  };

  // Clear existing interval if re-initializing
  if (clockInterval) {
    clearInterval(clockInterval);
  }

  clockInterval = window.setInterval(updateClock, 16);
  updateClock();
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
    sensitivity: 24
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

  const cursor = '<span class="radial-bib-cursor"></span>';
  if (!value) {
    bibEl.innerHTML = '---' + cursor;
    bibEl.classList.remove('active');
  } else {
    bibEl.innerHTML = value.padStart(3, '0') + (value.length < 3 ? cursor : '');
    bibEl.classList.add('active');
  }
}

/**
 * Initialize timing point buttons
 */
function initRadialTimingPoints(): void {
  const container = getElement('radial-timing-point');
  if (!container) return;

  container.addEventListener('click', (e) => {
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

  // Set initial state
  updateRadialTimingPointSelection();
}

/**
 * Update timing point selection display
 */
function updateRadialTimingPointSelection(): void {
  const state = store.getState();
  document.querySelectorAll('.radial-point-btn').forEach(btn => {
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

  container.addEventListener('click', (e) => {
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

  // Set initial state
  updateRadialRunSelection();
}

/**
 * Update run selection display
 */
function updateRadialRunSelection(): void {
  const state = store.getState();
  document.querySelectorAll('.radial-run-btn').forEach(btn => {
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

  btn.addEventListener('click', recordRadialTimestamp);
}

/**
 * Initialize clear button
 */
function initRadialClearButton(): void {
  const btn = getElement('radial-clear-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
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
  document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement?.tagName;
    const state = store.getState();

    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
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
    if (e.altKey && (e.key === '1' || e.key === '2')) {
      e.preventDefault();
      const run = e.key === '1' ? 1 : 2;
      store.setSelectedRun(run as 1 | 2);
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
  });
}

/**
 * Record a timestamp with radial UI feedback
 */
async function recordRadialTimestamp(): Promise<void> {
  const state = store.getState();
  if (state.isRecording) return;

  // Capture timestamp immediately
  const preciseTimestamp = new Date().toISOString();
  const gpsCoords = gpsService.getCoordinates();

  store.setRecording(true);

  try {
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

    // Photo capture (async, non-blocking)
    if (state.settings.photoCapture) {
      captureTimingPhoto()
        .then(async (photo) => {
          if (photo) {
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
        .catch(err => {
          logWarning('Camera', 'captureTimingPhoto', err, 'photoError');
        });
    }

    // Check for duplicate
    const isDuplicate = !!(entry.bib && state.entries.some(
      e => e.bib === entry.bib && e.point === entry.point && (e.run ?? 1) === entry.run
    ));

    // Add entry
    store.addEntry(entry);

    // Feedback
    if (isDuplicate) {
      feedbackWarning();
    } else {
      feedbackSuccess();
    }

    // Visual feedback
    showRadialConfirmation(entry);

    // Sync
    syncService.broadcastEntry(entry);

    // Auto-increment bib
    if (state.settings.auto && state.bibInput) {
      const localNext = parseInt(state.bibInput, 10) + 1;
      const nextBib = state.settings.sync && state.cloudHighestBib > 0
        ? Math.max(localNext, state.cloudHighestBib + 1)
        : localNext;
      const newBib = String(nextBib);
      store.setBibInput(newBib);
      radialDial?.setValue(newBib);
      updateRadialBibDisplay(newBib);
    } else if (!state.bibInput) {
      // Keep empty
    } else if (!state.settings.auto) {
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
function showRadialConfirmation(entry: Entry): void {
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

  overlay?.classList.add('show');

  // Reset after delay
  setTimeout(() => {
    frozenTime = null;
    dialRing?.classList.remove('flash');
    timeDisplay?.classList.remove('flash', 'frozen');
    timeBtn?.classList.remove('flash');
    overlay?.classList.remove('show');
  }, 1200);
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
    text.textContent = deviceCount > 0 ? `${t('synced', lang)} (${deviceCount})` : t('syncingStatus', lang);
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
    countEl.textContent = `${entries.length} ${entries.length === 1 ? t('entry') : t('entries')}`;
  }

  // Last recorded
  if (entries.length > 0) {
    const lastEntry = entries[entries.length - 1];
    const lastBibEl = getElement('radial-last-bib');
    const lastPointEl = getElement('radial-last-point');
    const lastTimeEl = getElement('radial-last-time');

    if (lastBibEl) lastBibEl.textContent = lastEntry.bib || '---';
    if (lastPointEl) {
      lastPointEl.textContent = lastEntry.point === 'S' ? t('startShort') : t('finishShort');
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
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }

  if (radialDial) {
    radialDial.destroy();
    radialDial = null;
  }

  frozenTime = null;
  isInitialized = false;
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
