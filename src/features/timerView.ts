/**
 * Timer View Module
 * Handles clock display, number pad, timing points, run selection, and timestamp recording
 */

import { store } from '../store';
import { Clock, showToast } from '../components';
import { syncService, gpsService, captureTimingPhoto, photoStorage } from '../services';
import { feedbackSuccess, feedbackWarning, feedbackTap } from '../services';
import { generateEntryId, getPointLabel, getRunLabel, getRunColor, logWarning, getElement } from '../utils';
import { getPointColor, formatTime as formatTimeDisplay } from '../utils/format';
import { t } from '../i18n/translations';
import { logger } from '../utils/logger';
import type { Entry, TimingPoint } from '../types';

// Module state
let clock: Clock | null = null;

/**
 * Check if bib is all zeros (e.g., "0", "00", "000")
 */
function isZeroBib(bib: string): boolean {
  if (!bib) return false;
  return /^0+$/.test(bib);
}

/**
 * Initialize clock component
 */
export function initClock(): void {
  // Clean up existing clock if re-initializing
  if (clock) {
    clock.destroy();
    clock = null;
  }

  const container = getElement('clock-container');
  if (container) {
    clock = new Clock(container);
    clock.start();
  }
}

/**
 * Destroy clock component (for cleanup)
 */
export function destroyClock(): void {
  if (clock) {
    clock.destroy();
    clock = null;
  }
}

/**
 * Initialize tab navigation
 */
export function initTabs(): void {
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
 * Initialize number pad and bib display toggle
 */
export function initNumberPad(): void {
  const numPad = getElement('number-pad');
  const bibDisplay = getElement('bib-display');

  // Bib display click toggles numpad collapsed/expanded
  if (bibDisplay && numPad) {
    bibDisplay.setAttribute('aria-expanded', 'true');
    bibDisplay.addEventListener('click', () => {
      const isCollapsed = numPad.classList.toggle('collapsed');
      bibDisplay.classList.toggle('expanded', !isCollapsed);
      bibDisplay.setAttribute('aria-expanded', String(!isCollapsed));
      feedbackTap();
    });
  }

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
export function initTimingPoints(): void {
  const container = getElement('timing-points');
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
export function initRunSelector(): void {
  const container = getElement('run-selector');
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

/**
 * Initialize timestamp button
 */
export function initTimestampButton(): void {
  const btn = getElement('timestamp-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    await recordTimestamp();
  });

  // Comprehensive keyboard navigation for timer view
  document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement?.tagName;
    const state = store.getState();

    // Skip if user is typing in an input field or not on timer view
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
      return;
    }
    if (state.currentView !== 'timer') {
      return;
    }

    // Number keys 0-9 for bib input
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      if (state.bibInput.length < 3) {
        store.setBibInput(state.bibInput + e.key);
        feedbackTap();
      }
      return;
    }

    // Backspace/Delete for clearing bib input
    if (e.key === 'Backspace') {
      e.preventDefault();
      store.setBibInput(state.bibInput.slice(0, -1));
      feedbackTap();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Escape') {
      e.preventDefault();
      store.setBibInput('');
      feedbackTap();
      return;
    }

    // S/F keys for timing point selection
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      store.setSelectedPoint('S');
      feedbackTap();
      // Update ARIA states
      document.querySelectorAll('.timing-point-btn').forEach(btn => {
        btn.setAttribute('aria-checked', btn.getAttribute('data-point') === 'S' ? 'true' : 'false');
      });
      return;
    }

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      store.setSelectedPoint('F');
      feedbackTap();
      // Update ARIA states
      document.querySelectorAll('.timing-point-btn').forEach(btn => {
        btn.setAttribute('aria-checked', btn.getAttribute('data-point') === 'F' ? 'true' : 'false');
      });
      return;
    }

    // 1/2 keys for run selection
    if (e.key === '1' && e.altKey) {
      e.preventDefault();
      store.setSelectedRun(1);
      feedbackTap();
      return;
    }

    if (e.key === '2' && e.altKey) {
      e.preventDefault();
      store.setSelectedRun(2);
      feedbackTap();
      return;
    }

    // Space or Enter for timestamp
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      recordTimestamp();
      return;
    }
  });
}

/**
 * Record a timestamp entry
 */
export async function recordTimestamp(): Promise<void> {
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
    if (state.settings.photoCapture) {
      const entryId = entry.id;
      captureTimingPhoto()
        .then(async (photo) => {
          if (photo) {
            try {
              const currentState = store.getState();
              const entryStillExists = currentState.entries.some(e => e.id === entryId);
              if (!entryStillExists) {
                logger.warn('Entry was deleted before photo could be attached:', entryId);
                return;
              }

              const saved = await photoStorage.savePhoto(entryId, photo);
              if (saved) {
                const updated = store.updateEntry(entryId, { photo: 'indexeddb' });
                if (!updated) {
                  logger.warn('Entry deleted during photo save, removing orphaned photo:', entryId);
                  await photoStorage.deletePhoto(entryId);
                }
              } else {
                logger.warn('Photo save failed for entry:', entryId);
                const lang = store.getState().currentLang;
                showToast(t('photoSaveFailed', lang), 'warning');
              }
            } catch (err) {
              logWarning('Camera', 'photo save/update', err, 'photoError');
            }
          }
        })
        .catch(err => {
          if (err instanceof Error && err.name === 'PhotoTooLargeError') {
            const lang = store.getState().currentLang;
            showToast(t('photoTooLarge', lang), 'warning');
          } else {
            logWarning('Camera', 'captureTimingPhoto', err, 'photoError');
          }
        });
    }

    // Check for duplicate
    const isDuplicate = entry.bib && state.entries.some(
      e => e.bib === entry.bib && e.point === entry.point && (e.run ?? 1) === entry.run
    );

    // Check for zero bib
    const hasZeroBib = isZeroBib(entry.bib);

    // Add entry
    store.addEntry(entry);

    // Show feedback
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

    // Auto-increment bib after recording
    if (state.settings.auto && state.bibInput) {
      const localNext = parseInt(state.bibInput, 10) + 1;
      const nextBib = state.settings.sync && state.cloudHighestBib > 0
        ? Math.max(localNext, state.cloudHighestBib + 1)
        : localNext;
      store.setBibInput(String(nextBib));
    } else if (!state.bibInput) {
      store.setBibInput('');
    } else if (!state.settings.auto) {
      store.setBibInput('');
    }

    // Update last recorded display
    updateLastRecorded(entry);

  } finally {
    store.setRecording(false);
  }
}

/**
 * Show confirmation overlay with snowflake burst animation
 */
function showConfirmation(entry: Entry): void {
  const overlay = getElement('confirmation-overlay');
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

  overlay.dataset.point = entry.point;
  overlay.classList.add('show');

  // Trigger snowflake burst
  triggerSnowflakeBurst(entry.point);

  setTimeout(() => {
    overlay.classList.remove('show');
  }, 1500);
}

/**
 * Create snowflake burst particles on confirmation
 */
function triggerSnowflakeBurst(point: 'S' | 'F'): void {
  const burst = document.getElementById('snowflake-burst');
  if (!burst) return;

  // Clear previous burst
  burst.innerHTML = '';

  const color = point === 'S' ? 'var(--start-color)' : 'var(--finish-color)';
  const flakeCount = 8;

  for (let i = 0; i < flakeCount; i++) {
    const flake = document.createElement('span');
    flake.className = 'flake';
    flake.textContent = '❄';

    // Distribute radially
    const angle = (i / flakeCount) * 2 * Math.PI;
    const distance = 60 + Math.random() * 40;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const rot = Math.random() * 360;

    flake.style.cssText = `
      --burst-x: ${x}px;
      --burst-y: ${y}px;
      --burst-rot: ${rot}deg;
      color: ${color};
      font-size: ${0.6 + Math.random() * 0.6}rem;
      animation-duration: ${0.6 + Math.random() * 0.4}s;
      text-shadow: 0 0 6px ${color};
    `;

    flake.addEventListener('animationend', () => flake.remove(), { once: true });
    burst.appendChild(flake);
  }
}

/**
 * Show duplicate warning
 */
function showDuplicateWarning(entry: Entry): void {
  const overlay = getElement('confirmation-overlay');
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
 * Show zero bib warning
 */
function showZeroBibWarning(entry: Entry): void {
  const overlay = getElement('confirmation-overlay');
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
 * Update last recorded entry display (inline version)
 */
function updateLastRecorded(entry: Entry): void {
  const el = getElement('last-recorded-inline');
  if (!el) return;

  const bibEl = el.querySelector('.bib') as HTMLElement | null;
  const pointEl = el.querySelector('.point') as HTMLElement | null;
  const runEl = el.querySelector('.run') as HTMLElement | null;
  const timeEl = el.querySelector('.time') as HTMLElement | null;

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

  el.classList.add('visible');
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

/**
 * Update bib display
 */
export function updateBibDisplay(): void {
  const state = store.getState();
  const bibDisplay = getElement('bib-display');
  const bibValue = bibDisplay?.querySelector('.bib-value');
  if (bibValue) {
    bibValue.textContent = state.bibInput ? state.bibInput.padStart(3, '0') : '---';
  }

  const timestampBtn = getElement('timestamp-btn');
  if (timestampBtn) {
    timestampBtn.classList.toggle('ready', state.bibInput.length > 0);
  }
}

/**
 * Update timing point selection
 */
export function updateTimingPointSelection(): void {
  const state = store.getState();
  document.querySelectorAll('.timing-point-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-point') === state.selectedPoint;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
}

/**
 * Update run selection
 */
export function updateRunSelection(): void {
  const state = store.getState();
  document.querySelectorAll('.run-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-run') === String(state.selectedRun);
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
}
