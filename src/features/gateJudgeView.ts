/**
 * Gate Judge View Module
 * Handles gate judge UI, gate assignment, judge ready status, and run selection
 */

import { store } from '../store';
import { syncService } from '../services';
import { feedbackTap, feedbackSuccess } from '../services';
import { showToast } from '../components';
import { t } from '../i18n/translations';
import { escapeHtml, escapeAttr, getElement } from '../utils';
import { openModal, closeModal } from './modals';
import {
  openFaultRecordingModal, initFaultRecordingModal,
  initInlineFaultEntry, refreshInlineFaultUI, updateActiveBibsList,
  recordFaultFromVoice
} from './faultEntry';
import { logger } from '../utils/logger';
import type { GateAssignment, GateColor, VoiceIntent } from '../types';

/**
 * Update tab visibility based on device role
 * Timer role: show Timer tab, hide Gate Judge tab
 * Gate Judge role: hide Timer tab, show Gate Judge tab
 * Also reorders tabs so Gate tab appears first (like Timer in timer mode)
 */
export function updateGateJudgeTabVisibility(): void {
  const timerTab = getElement('timer-tab');
  const gateJudgeTab = getElement('gate-judge-tab');
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
export function initGateJudgeView(): void {
  // Request role toggle update via CustomEvent (settingsView listens for this)
  window.dispatchEvent(new CustomEvent('update-role-toggle'));
  updateGateJudgeTabVisibility();

  // Gate assignment change button
  const gateChangeBtn = getElement('gate-change-btn');
  if (gateChangeBtn) {
    gateChangeBtn.addEventListener('click', () => {
      feedbackTap();
      openGateAssignmentModal();
    });
  }

  // Gate Judge run selector
  const gateJudgeRunSelector = getElement('gate-judge-run-selector');
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
  const recordFaultBtn = getElement('record-fault-btn');
  if (recordFaultBtn) {
    recordFaultBtn.addEventListener('click', () => {
      feedbackTap();
      openFaultRecordingModal();
    });
  }

  // Ready toggle button
  const readyToggleBtn = getElement('ready-toggle-btn');
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
export function openGateAssignmentModal(): void {
  const state = store.getState();
  const startInput = getElement<HTMLInputElement>('gate-start-input');
  const endInput = getElement<HTMLInputElement>('gate-end-input');

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
  const colorSelector = getElement('gate-color-selector');
  if (colorSelector) {
    colorSelector.querySelectorAll('.gate-color-btn').forEach(btn => {
      const color = btn.getAttribute('data-color');
      btn.classList.toggle('active', color === state.firstGateColor);
    });
  }

  openModal(getElement('gate-assignment-modal'));
}

/**
 * Initialize gate assignment modal handlers
 */
export function initGateAssignmentModal(): void {
  // Gate color selector toggle
  const colorSelector = getElement('gate-color-selector');
  if (colorSelector) {
    colorSelector.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.gate-color-btn');
      if (!btn) return;

      colorSelector.querySelectorAll('.gate-color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      feedbackTap();
    });
  }

  const saveBtn = getElement('save-gate-assignment-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const startInput = getElement<HTMLInputElement>('gate-start-input');
      const endInput = getElement<HTMLInputElement>('gate-end-input');
      if (!startInput || !endInput) return;

      const start = parseInt(startInput.value, 10) || 1;
      const end = parseInt(endInput.value, 10) || 10;

      // Ensure start <= end
      const validStart = Math.min(start, end);
      const validEnd = Math.max(start, end);

      // Get selected gate color
      const selectedColorBtn = document.querySelector('#gate-color-selector .gate-color-btn.active');
      const selectedColor = (selectedColorBtn?.getAttribute('data-color') || 'red') as GateColor;

      store.setGateAssignment([validStart, validEnd]);
      store.setFirstGateColor(selectedColor);
      updateGateRangeDisplay();
      closeModal(getElement('gate-assignment-modal'));
      feedbackSuccess();

      const lang = store.getState().currentLang;
      showToast(t('saved', lang), 'success');
    });
  }
}

/**
 * Update gate range display in header
 */
export function updateGateRangeDisplay(): void {
  const display = getElement('gate-range-display');
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
export function updateOtherJudgesCoverage(): void {
  const coverageContainer = getElement('other-judges-coverage');
  const coverageList = getElement('other-judges-list');
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
    <div class="coverage-badge ${a.isReady ? 'ready' : ''}" title="${escapeAttr(a.deviceName)}${a.isReady ? ' - Ready' : ''}">
      ${a.isReady ? '<span class="ready-check">✓</span>' : ''}
      <span class="device-name">${escapeHtml(a.deviceName.slice(0, 15))}</span>
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
export function updateReadyButtonState(): void {
  const btn = getElement('ready-toggle-btn');
  if (!btn) return;

  const state = store.getState();
  btn.classList.toggle('ready', state.isJudgeReady);
}

/**
 * Update judges ready indicator in header (visible to all devices)
 */
export function updateJudgesReadyIndicator(assignments?: GateAssignment[]): void {
  const indicator = getElement('judges-ready-indicator');
  const countEl = getElement('judges-ready-count');
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
export function updateJudgeReadyStatus(): void {
  const gpsIndicator = getElement('gps-indicator');
  const judgeReadyIndicator = getElement('judge-ready-indicator');
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
 * Update Gate Judge run selector
 */
export function updateGateJudgeRunSelection(): void {
  const state = store.getState();
  const gateJudgeRunSelector = getElement('gate-judge-run-selector');
  if (gateJudgeRunSelector) {
    gateJudgeRunSelector.querySelectorAll('.run-btn').forEach(btn => {
      const isActive = btn.getAttribute('data-run') === String(state.selectedRun);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', String(isActive));
    });
  }
}

/**
 * Handle voice intent for gate judge role
 * Called from the voice mode service when a command is recognized
 */
export function handleGateJudgeVoiceIntent(intent: VoiceIntent): void {
  logger.debug('[GateJudgeView] Voice intent:', intent.action, intent.params);

  switch (intent.action) {
    case 'record_fault':
      if (intent.params?.bib && intent.params?.gate !== undefined && intent.params?.faultType) {
        recordFaultFromVoice(
          intent.params.bib,
          intent.params.gate,
          intent.params.faultType
        );
      }
      break;

    case 'toggle_ready': {
      const state = store.getState();
      const newReadyState = !state.isJudgeReady;
      store.setJudgeReady(newReadyState);
      feedbackSuccess();
      updateReadyButtonState();
      // Show confirmation
      const lang = state.currentLang;
      showToast(newReadyState ? t('judgeReady', lang) : t('judgeNotReady', lang), 'success');
      break;
    }

    case 'set_run':
      if (intent.params?.run) {
        store.setSelectedRun(intent.params.run);
        updateGateJudgeRunSelection();
        updateActiveBibsList();
        refreshInlineFaultUI();
        feedbackTap();
      }
      break;

    default:
      logger.debug('[GateJudgeView] Unhandled voice intent:', intent.action);
  }
}
