/**
 * Gate Judge Feature Module
 * Handles Gate Judge specific UI and functionality
 */

import { t } from '../i18n/translations';
import type { AppState, FaultEntry, FaultType } from '../types';
import { escapeHtml, getFaultTypeLabel } from '../utils/format';
import { ListenerManager } from '../utils/listenerManager';

// Module state
let inlineSelectedBib = '';
let inlineSelectedGate = 0;
let inlineSelectedFaultType: FaultType | null = null;

// Dependencies interface
export interface GateJudgeDependencies {
  getState: () => AppState;
  getActiveBibs: (run: number) => string[];
  getFaultsForBib: (bib: string, run: number) => FaultEntry[];
  getGateColor: (gateNumber: number) => string;
  feedbackTap: () => void;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info',
    duration?: number,
  ) => void;
  formatTimeDisplay: (date: Date) => string;
  openFaultRecordingModal: (bib: string) => void;
  openFaultDeleteConfirmation: (fault: FaultEntry) => void;
  addFaultEntry: (
    fault: Omit<
      FaultEntry,
      | 'id'
      | 'timestamp'
      | 'deviceId'
      | 'deviceName'
      | 'currentVersion'
      | 'versionHistory'
      | 'markedForDeletion'
    >,
  ) => FaultEntry;
  syncFaultToCloud: (fault: FaultEntry) => void;
}

let deps: GateJudgeDependencies | null = null;
const listeners = new ListenerManager();

/**
 * Initialize the Gate Judge module with dependencies
 */
export function initGateJudge(dependencies: GateJudgeDependencies): void {
  deps = dependencies;
}

/**
 * Get inline selection state
 */
export function getInlineSelectionState() {
  return {
    bib: inlineSelectedBib,
    gate: inlineSelectedGate,
    faultType: inlineSelectedFaultType,
  };
}

/**
 * Update the inline fault list in Gate Judge view
 */
export function updateInlineFaultsList(): void {
  if (!deps) return;

  const listContainer = document.getElementById('gate-judge-faults-list');
  const countBadge = document.getElementById('inline-fault-count');
  const emptyState = document.getElementById('no-faults-recorded-inline');
  if (!listContainer) return;

  const state = deps.getState();
  const lang = state.currentLang;
  const faults = state.faultEntries.filter(
    (f) => f.run === state.selectedRun && !f.markedForDeletion,
  );

  // Update count badge
  if (countBadge) {
    countBadge.textContent = String(faults.length);
    countBadge.setAttribute('data-count', String(faults.length));
  }

  // Clear existing fault items (keep empty state)
  listContainer
    .querySelectorAll('.gate-judge-fault-item')
    .forEach((item) => item.remove());

  if (faults.length === 0) {
    if (emptyState) emptyState.style.display = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  // Sort by timestamp (most recent first)
  const sortedFaults = [...faults].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  sortedFaults.forEach((fault) => {
    const gateColor = deps!.getGateColor(fault.gateNumber);
    const item = document.createElement('div');
    item.className = 'gate-judge-fault-item';
    item.setAttribute('data-fault-id', fault.id);

    item.innerHTML = `
      <div class="gate-judge-fault-info">
        <span class="gate-judge-fault-bib">${escapeHtml(fault.bib)}</span>
        <div class="gate-judge-fault-details">
          <span class="gate-judge-fault-gate ${escapeHtml(gateColor)}">T${escapeHtml(String(fault.gateNumber))}</span>
          <span class="gate-judge-fault-type">${escapeHtml(getFaultTypeLabel(fault.faultType, lang))}</span>
        </div>
      </div>
      <button class="gate-judge-fault-delete" aria-label="${t('deleteLabel', lang)}">
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
        deps!.feedbackTap();
        deps!.openFaultDeleteConfirmation(fault);
      });
    }

    listContainer.appendChild(item);
  });
}

/**
 * Update inline bib input with the most recent active bib
 */
export function updateInlineBibSelector(): void {
  if (!deps) return;

  const state = deps.getState();
  const activeBibs = deps.getActiveBibs(state.selectedRun);

  // Auto-fill with most recent active bib if no bib selected yet
  if (!inlineSelectedBib && activeBibs.length > 0) {
    inlineSelectedBib = activeBibs[0]!;
  }

  const bibInput = document.getElementById(
    'inline-bib-input',
  ) as HTMLInputElement;
  if (bibInput && inlineSelectedBib) {
    bibInput.value = inlineSelectedBib;
  }

  updateInlineSaveButtonState();
}

/**
 * Select a bib for inline fault entry
 */
export function selectInlineBib(bib: string): void {
  inlineSelectedBib = bib;

  const bibInput = document.getElementById(
    'inline-bib-input',
  ) as HTMLInputElement;
  if (bibInput) {
    bibInput.value = bib;
  }

  updateInlineSaveButtonState();
}

/**
 * Update inline gate selector buttons
 */
export function updateInlineGateSelector(): void {
  if (!deps) return;

  const container = document.getElementById('inline-gate-selector');
  if (!container) return;

  const state = deps.getState();
  const assignment = state.gateAssignment;

  container.innerHTML = '';

  if (!assignment) return;

  // assignment is [gateStart, gateEnd] tuple
  const [gateStart, gateEnd] = assignment;

  // Generate gate buttons for assigned range
  for (let gate = gateStart; gate <= gateEnd; gate++) {
    const gateColor = deps.getGateColor(gate);
    const btn = document.createElement('button');
    btn.className = `inline-gate-btn ${gateColor}`;
    btn.setAttribute('data-gate', String(gate));
    btn.textContent = `T${gate}`;

    if (gate === inlineSelectedGate) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => {
      deps!.feedbackTap();
      selectInlineGate(gate);
    });

    container.appendChild(btn);
  }
}

/**
 * Select a gate for inline fault entry
 */
export function selectInlineGate(gate: number): void {
  inlineSelectedGate = gate;

  // Update button styles
  document.querySelectorAll('.inline-gate-btn').forEach((btn) => {
    btn.classList.toggle(
      'selected',
      btn.getAttribute('data-gate') === String(gate),
    );
  });

  updateInlineSaveButtonState();
}

/**
 * Select a fault type for inline fault entry
 */
export function selectInlineFaultType(faultType: FaultType): void {
  inlineSelectedFaultType = faultType;

  // Update button styles
  document.querySelectorAll('.inline-fault-type-btn').forEach((btn) => {
    btn.classList.toggle(
      'selected',
      btn.getAttribute('data-fault-type') === faultType,
    );
  });

  updateInlineSaveButtonState();
}

/**
 * Initialize inline fault entry handlers
 */
export function initInlineFaultEntry(): void {
  if (!deps) return;

  // Fault type buttons
  document.querySelectorAll('.inline-fault-type-btn').forEach((btn) => {
    listeners.add(btn, 'click', () => {
      const faultType = btn.getAttribute('data-fault-type') as FaultType;
      deps!.feedbackTap();
      selectInlineFaultType(faultType);
    });
  });

  // Save button
  const saveBtn = document.getElementById('inline-save-fault-btn');
  if (saveBtn) {
    listeners.add(saveBtn, 'click', () => {
      deps!.feedbackTap();
      saveInlineFault();
    });
  }

  // Initial UI update
  updateInlineBibSelector();
  updateInlineGateSelector();
  updateInlineSaveButtonState();
}

/**
 * Update save button enabled state
 */
export function updateInlineSaveButtonState(): void {
  const saveBtn = document.getElementById('inline-save-fault-btn');
  if (!saveBtn) return;

  const canSave =
    inlineSelectedBib && inlineSelectedGate > 0 && inlineSelectedFaultType;
  (saveBtn as HTMLButtonElement).disabled = !canSave;
}

/**
 * Save the inline fault entry
 */
export function saveInlineFault(): void {
  if (!deps) return;

  if (!inlineSelectedBib || !inlineSelectedGate || !inlineSelectedFaultType) {
    return;
  }

  const state = deps.getState();
  const assignment = state.gateAssignment;

  if (!assignment) {
    deps.showToast(t('noGateAssignment', state.currentLang), 'error');
    return;
  }

  // assignment is [gateStart, gateEnd] tuple
  const [gateStart, gateEnd] = assignment;

  // Create fault entry
  const fault = deps.addFaultEntry({
    bib: inlineSelectedBib,
    run: state.selectedRun,
    gateNumber: inlineSelectedGate,
    faultType: inlineSelectedFaultType,
    gateRange: [gateStart, gateEnd],
  });

  // Sync to cloud
  deps.syncFaultToCloud(fault);

  // Show confirmation
  deps.showToast(
    `${t('faultRecorded', state.currentLang)}: #${inlineSelectedBib} T${inlineSelectedGate} (${inlineSelectedFaultType})`,
    'success',
  );

  // Reset selections (keep gate range, clear bib and fault type)
  inlineSelectedBib = '';
  inlineSelectedFaultType = null;

  // Update UI
  updateInlineBibSelector();
  updateInlineFaultsList();
  updateInlineSaveButtonState();

  // Clear fault type selection
  document.querySelectorAll('.inline-fault-type-btn').forEach((btn) => {
    btn.classList.remove('selected');
  });
}

/**
 * Reset inline fault entry state
 */
export function resetInlineFaultEntry(): void {
  inlineSelectedBib = '';
  inlineSelectedGate = 0;
  inlineSelectedFaultType = null;
}

/**
 * Cleanup gate judge event listeners
 */
export function destroyGateJudge(): void {
  listeners.removeAll();
}

/**
 * Refresh all inline fault UI components
 */
export function refreshInlineFaultUI(): void {
  updateInlineFaultsList();
  updateInlineBibSelector();
  updateInlineGateSelector();
  updateInlineSaveButtonState();
}

/**
 * Update active bibs list in Gate Judge view
 */
export function updateActiveBibsList(): void {
  if (!deps) return;

  const list = document.getElementById('active-bibs-list');
  const emptyState = document.getElementById('no-active-bibs');
  if (!list) return;

  const state = deps.getState();
  const activeBibs = deps.getActiveBibs(state.selectedRun);

  // Clear existing bib cards (keep empty state)
  list.querySelectorAll('.active-bib-card').forEach((card) => card.remove());

  if (activeBibs.length === 0) {
    if (emptyState) emptyState.style.display = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  // Get start times for each bib
  const startTimes = new Map<string, Date>();
  state.entries.forEach((entry) => {
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
  sortedBibs.forEach((bib) => {
    const startTime = startTimes.get(bib);
    const faults = deps!.getFaultsForBib(bib, state.selectedRun);
    const hasFault = faults.length > 0;

    const card = document.createElement('div');
    card.className = `active-bib-card${hasFault ? ' has-fault' : ''}`;
    card.setAttribute('data-bib', bib);
    card.setAttribute('role', 'listitem');

    const timeStr = startTime ? deps!.formatTimeDisplay(startTime) : '--:--:--';

    card.innerHTML = `
      <div class="bib-card-info">
        <span class="bib-card-number">${escapeHtml(bib)}</span>
        <span class="bib-card-time">${escapeHtml(timeStr)}</span>
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
          deps!.feedbackTap();
          deps!.openFaultRecordingModal(bib);
        } else if (action === 'ok') {
          deps!.feedbackTap();
          // Just tap feedback - bib is OK, no action needed
          deps!.showToast(t('ok', state.currentLang), 'success', 1000);
        }
      }
    });

    list.appendChild(card);
  });
}
