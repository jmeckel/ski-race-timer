/**
 * Fault Inline Entry Module
 * Inline gate-first fault entry UI, active bibs list, and inline faults list
 */

import { showToast } from '../../components';
import { t } from '../../i18n/translations';
import { feedbackTap } from '../../services';
import { deleteFaultFromCloud } from '../../services/sync';
import { store } from '../../store';
import type { FaultEntry, FaultType } from '../../types';
import {
  escapeAttr,
  escapeHtml,
  getFaultTypeLabel,
  iconNote,
  iconTrash,
  makeNumericInput,
} from '../../utils';
import { formatTime as formatTimeDisplay } from '../../utils/format';
import { ListenerManager } from '../../utils/listenerManager';
import { setModalContext } from '../../utils/modalContext';
import { openModal } from '../modals';
import { createAndSyncFault } from './faultOperations';

// Module-level listener manager for lifecycle cleanup
const listeners = new ListenerManager();

// Module state
let inlineSelectedBib = '';
let inlineSelectedGate = 0;
let inlineSelectedFaultType: FaultType | null = null;

/**
 * Update active bibs list in Gate Judge view
 */
export function updateActiveBibsList(): void {
  const list = document.getElementById('active-bibs-list');
  const emptyState = document.getElementById('no-active-bibs');
  if (!list) return;

  const state = store.getState();
  const activeBibs = store.getActiveBibs(state.selectedRun);

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
    const faults = store.getFaultsForBib(bib, state.selectedRun);
    const hasFault = faults.length > 0;

    const card = document.createElement('div');
    card.className = `active-bib-card${hasFault ? ' has-fault' : ''}`;
    card.setAttribute('data-bib', escapeHtml(bib));
    card.setAttribute('role', 'listitem');

    const timeStr = startTime ? formatTimeDisplay(startTime) : '--:--:--';

    card.innerHTML = `
      <div class="bib-card-info">
        <span class="bib-card-number">${escapeHtml(bib)}</span>
        <span class="bib-card-time">${escapeHtml(timeStr)}</span>
        ${hasFault ? `<span class="bib-fault-indicator">${faults.length} ${t('faultCount', state.currentLang)}</span>` : ''}
      </div>
      <div class="bib-card-actions">
        <button class="bib-action-btn fault" data-action="fault" aria-label="${escapeAttr(t('recordFault', state.currentLang))}">${t('faultMGShort', state.currentLang)}</button>
        <button class="bib-action-btn ok" data-action="ok" aria-label="${escapeAttr(t('markOk', state.currentLang))}">${t('ok', state.currentLang)}</button>
      </div>
    `;

    // Click on card to select bib for fault entry
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actionBtn = target.closest('.bib-action-btn');

      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        if (action === 'fault') {
          feedbackTap();
          // Import dynamically to avoid circular dependency
          import('./faultModals').then(({ openFaultRecordingModal }) => {
            openFaultRecordingModal(bib);
          });
        } else if (action === 'ok') {
          feedbackTap();
          // Just tap feedback - bib is OK, no action needed
          showToast(t('ok', state.currentLang), 'success', 1000);
        }
      }
    });

    list.appendChild(card);
  });
}

/**
 * Update the inline fault list in Gate Judge view
 */
export function updateInlineFaultsList(): void {
  const listContainer = document.getElementById('gate-judge-faults-list');
  const countBadge = document.getElementById('inline-fault-count');
  const emptyState = document.getElementById('no-faults-recorded-inline');
  if (!listContainer) return;

  const state = store.getState();
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
    const gateColor = store.getGateColor(fault.gateNumber);
    const hasNotes = fault.notes && fault.notes.length > 0;
    const item = document.createElement('div');
    item.className = 'gate-judge-fault-item';
    item.setAttribute('data-fault-id', fault.id);

    item.innerHTML = `
      <div class="gate-judge-fault-info">
        <span class="gate-judge-fault-bib">${escapeHtml(fault.bib)}</span>
        <div class="gate-judge-fault-details">
          <span class="gate-judge-fault-gate ${escapeHtml(gateColor)}">T${escapeHtml(String(fault.gateNumber))}</span>
          <span class="gate-judge-fault-type">${escapeHtml(getFaultTypeLabel(fault.faultType, lang))}</span>
          ${hasNotes ? `<span class="gate-judge-fault-note-icon" title="${escapeAttr(t('hasNote', lang))}" aria-label="${escapeAttr(t('hasNote', lang))}">${iconNote(14)}</span>` : ''}
        </div>
      </div>
      <button class="gate-judge-fault-delete" aria-label="${t('deleteLabel', lang)}">
        ${iconTrash(18)}
      </button>
    `;

    // Delete button handler
    const deleteBtn = item.querySelector('.gate-judge-fault-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        feedbackTap();
        openFaultDeleteConfirmation(fault);
      });
    }

    listContainer.appendChild(item);
  });
}

/**
 * Update inline bib input with the most recent active bib
 */
export function updateInlineBibSelector(): void {
  const state = store.getState();
  const activeBibs = store.getActiveBibs(state.selectedRun);

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
 * Update inline gate selector buttons (gate-first grid layout)
 * Creates large, prominent gate buttons as the primary UI element.
 * Each button shows a fault count badge if faults exist for that gate.
 */
export function updateInlineGateSelector(): void {
  const container = document.getElementById('inline-gate-selector');
  if (!container) return;

  const state = store.getState();
  const lang = state.currentLang;
  const [start, end] = (state.gateAssignment || [1, 10]) as [number, number];

  container.innerHTML = '';

  // Get fault counts per gate for badges
  const faultsByGate = new Map<number, number>();
  state.faultEntries.forEach((f) => {
    if (f.run === state.selectedRun && !f.markedForDeletion) {
      faultsByGate.set(f.gateNumber, (faultsByGate.get(f.gateNumber) || 0) + 1);
    }
  });

  for (let gate = start; gate <= end; gate++) {
    const color = store.getGateColor(gate);
    const faultCount = faultsByGate.get(gate) || 0;
    const btn = document.createElement('button');
    btn.className = `gate-grid-btn ${color}`;
    btn.setAttribute('data-gate', String(gate));
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(gate === inlineSelectedGate));
    btn.setAttribute(
      'aria-label',
      `${t('gateNumberLabel', lang)} ${gate}${faultCount ? ` (${faultCount})` : ''}`,
    );

    // Gate number text
    btn.textContent = String(gate);

    // Add fault count badge if faults exist
    if (faultCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'gate-fault-count';
      badge.textContent = String(faultCount);
      badge.setAttribute('aria-hidden', 'true');
      btn.appendChild(badge);
    }

    if (gate === inlineSelectedGate) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => {
      feedbackTap();
      selectInlineGate(gate);
    });

    // Keyboard support: Space/Enter to select, arrow keys to navigate, number shortcuts
    btn.addEventListener('keydown', (e) => {
      const buttons = Array.from(
        container.querySelectorAll('.gate-grid-btn'),
      ) as HTMLElement[];
      const currentIndex = buttons.indexOf(btn);

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          feedbackTap();
          selectInlineGate(gate);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (currentIndex > 0) {
            buttons[currentIndex - 1]!.focus();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentIndex < buttons.length - 1) {
            buttons[currentIndex + 1]!.focus();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          // Move up one row (5 columns)
          if (currentIndex >= 5) {
            buttons[currentIndex - 5]!.focus();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          // Move down one row (5 columns)
          if (currentIndex + 5 < buttons.length) {
            buttons[currentIndex + 5]!.focus();
          }
          break;
        default:
          // Number shortcuts: 1-9 for gates, 0 for gate 10
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const targetGate = e.key === '0' ? 10 : parseInt(e.key, 10);
            if (targetGate >= start && targetGate <= end) {
              const targetBtn = container.querySelector(
                `[data-gate="${targetGate}"]`,
              ) as HTMLElement;
              if (targetBtn) {
                feedbackTap();
                selectInlineGate(targetGate);
                targetBtn.focus();
              }
            }
          }
      }
    });

    container.appendChild(btn);
  }
}

/**
 * Select a gate for inline fault entry (gate-first flow).
 * Selecting a gate reveals the fault detail panel and auto-fills the bib.
 */
export function selectInlineGate(gate: number): void {
  const wasSelected = inlineSelectedGate === gate;

  // Toggle: tapping same gate deselects
  if (wasSelected) {
    inlineSelectedGate = 0;
    closeFaultDetailPanel();
    updateInlineSaveButtonState();
    // Update gate button states
    document
      .querySelectorAll('#inline-gate-selector .gate-grid-btn')
      .forEach((btn) => {
        btn.classList.remove('selected');
        btn.setAttribute('aria-checked', 'false');
      });
    return;
  }

  inlineSelectedGate = gate;

  // Update gate button states
  document
    .querySelectorAll('#inline-gate-selector .gate-grid-btn')
    .forEach((btn) => {
      const isSelected = btn.getAttribute('data-gate') === String(gate);
      btn.classList.toggle('selected', isSelected);
      btn.setAttribute('aria-checked', String(isSelected));
    });

  // Show the fault detail panel
  showFaultDetailPanel(gate);

  // Auto-select the most recently started bib if none selected
  if (!inlineSelectedBib) {
    autoSelectMostRecentBib();
  }

  updateInlineSaveButtonState();
}

/**
 * Show the fault detail panel for the selected gate
 */
function showFaultDetailPanel(gate: number): void {
  const panel = document.getElementById('fault-detail-panel');
  const label = document.getElementById('fault-detail-gate-label');
  if (!panel) return;

  const state = store.getState();
  const lang = state.currentLang;
  const gateColor = store.getGateColor(gate);

  if (label) {
    label.textContent = `${t('gate', lang)} ${gate}`;
    label.style.color = gateColor === 'red' ? 'var(--error)' : 'var(--primary)';
  }

  panel.style.display = '';
}

/**
 * Close the fault detail panel and reset gate selection
 */
function closeFaultDetailPanel(): void {
  const panel = document.getElementById('fault-detail-panel');
  if (panel) {
    panel.style.display = 'none';
  }
}

/**
 * Auto-select the most recently started bib
 */
function autoSelectMostRecentBib(): void {
  const state = store.getState();
  const activeBibs = store.getActiveBibs(state.selectedRun);

  if (activeBibs.length === 0) return;

  // Get start times for sorting
  const startTimes = new Map<string, number>();
  state.entries.forEach((entry) => {
    if (entry.point === 'S' && entry.run === state.selectedRun) {
      startTimes.set(entry.bib, new Date(entry.timestamp).getTime());
    }
  });

  // Sort by most recent start
  const sorted = [...activeBibs].sort((a, b) => {
    return (startTimes.get(b) || 0) - (startTimes.get(a) || 0);
  });

  // Auto-select most recent
  selectInlineBib(sorted[0]!);
}

/**
 * Initialize inline fault entry handlers
 */
export function initInlineFaultEntry(): void {
  // Clean up old listeners before adding new ones (re-init safe)
  listeners.removeAll();

  // Bib manual input
  const bibInput = document.getElementById(
    'inline-bib-input',
  ) as HTMLInputElement;
  if (bibInput) {
    makeNumericInput(bibInput, 3);
    listeners.add(bibInput, 'input', () => {
      if (bibInput.value) {
        inlineSelectedBib = bibInput.value.padStart(3, '0');
        updateInlineSaveButtonState();
      }
    });
  }

  // Fault detail panel close button
  const closeBtn = document.getElementById('fault-detail-close');
  if (closeBtn) {
    listeners.add(closeBtn, 'click', () => {
      inlineSelectedGate = 0;
      inlineSelectedFaultType = null;
      closeFaultDetailPanel();
      // Deselect gate buttons
      document
        .querySelectorAll('#inline-gate-selector .gate-grid-btn')
        .forEach((btn) => {
          btn.classList.remove('selected');
          btn.setAttribute('aria-checked', 'false');
        });
      // Deselect fault type buttons
      document
        .querySelectorAll('#inline-fault-types .inline-fault-type-btn')
        .forEach((btn) => {
          btn.classList.remove('selected');
          btn.setAttribute('aria-pressed', 'false');
        });
      updateInlineSaveButtonState();
    });
  }

  // Fault type buttons
  const faultTypeContainer = document.getElementById('inline-fault-types');
  if (faultTypeContainer) {
    // Helper to select a fault type button
    const selectFaultTypeBtn = (btn: Element) => {
      feedbackTap();
      const faultType = btn.getAttribute('data-fault') as FaultType;
      inlineSelectedFaultType = faultType;

      // Update button states
      faultTypeContainer
        .querySelectorAll('.inline-fault-type-btn')
        .forEach((b) => {
          b.classList.toggle('selected', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });

      updateInlineSaveButtonState();
    };

    listeners.add(faultTypeContainer, 'click', (e: Event) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.inline-fault-type-btn');
      if (!btn) return;
      selectFaultTypeBtn(btn);
    });

    // Keyboard support: Space/Enter to select, M/G/T/B shortcuts
    listeners.add(faultTypeContainer, 'keydown', (e: Event) => {
      const event = e as KeyboardEvent;
      const target = event.target as HTMLElement;
      const btn = target.closest('.inline-fault-type-btn');

      // Handle Space/Enter on focused button
      if (btn && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        selectFaultTypeBtn(btn);
        return;
      }

      // Handle keyboard shortcuts (M/G=MG, T=STR, B/R=BR)
      const key = event.key.toUpperCase();
      let faultType: string | null = null;

      switch (key) {
        case 'M':
        case 'G':
          faultType = 'MG';
          break;
        case 'T':
          faultType = 'STR';
          break;
        case 'B':
        case 'R':
          faultType = 'BR';
          break;
      }

      if (faultType) {
        event.preventDefault();
        const faultBtn = faultTypeContainer.querySelector(
          `[data-fault="${faultType}"]`,
        );
        if (faultBtn) {
          selectFaultTypeBtn(faultBtn);
          (faultBtn as HTMLElement).focus();
        }
      }
    });
  }

  // Save fault button
  const saveBtn = document.getElementById('inline-save-fault-btn');
  if (saveBtn) {
    listeners.add(saveBtn, 'click', saveInlineFault);
  }
}

/**
 * Update the save button enabled/disabled state
 */
export function updateInlineSaveButtonState(): void {
  const saveBtn = document.getElementById(
    'inline-save-fault-btn',
  ) as HTMLButtonElement;
  if (saveBtn) {
    const isValid =
      inlineSelectedBib && inlineSelectedGate > 0 && inlineSelectedFaultType;
    saveBtn.disabled = !isValid;
  }
}

/**
 * Save a fault from the inline entry interface
 */
export function saveInlineFault(): void {
  const lang = store.getState().currentLang;

  if (!inlineSelectedBib) {
    showToast(t('selectBib', lang), 'warning');
    return;
  }

  if (!inlineSelectedGate) {
    showToast(t('selectGate', lang), 'warning');
    return;
  }

  if (!inlineSelectedFaultType) {
    showToast(t('selectFaultType', lang), 'warning');
    return;
  }

  createAndSyncFault(
    inlineSelectedBib,
    inlineSelectedGate,
    inlineSelectedFaultType,
  );

  // Reset fault type (keep gate and bib for quick successive faults on same gate)
  inlineSelectedFaultType = null;

  // Deselect fault type buttons but keep gate selected
  document
    .querySelectorAll('#inline-fault-types .inline-fault-type-btn')
    .forEach((btn) => {
      btn.classList.remove('selected');
      btn.setAttribute('aria-pressed', 'false');
    });

  refreshInlineFaultUI();
}

/**
 * Open fault delete confirmation modal for inline faults
 */
export function openFaultDeleteConfirmation(fault: FaultEntry): void {
  const modal = document.getElementById('fault-delete-modal');
  if (!modal) {
    // Fallback: use direct delete if modal doesn't exist
    store.markFaultForDeletion(fault.id);
    const markedFault = store
      .getState()
      .faultEntries.find((f) => f.id === fault.id);
    if (markedFault) {
      deleteFaultFromCloud(markedFault);
    }
    updateInlineFaultsList();
    showToast(t('faultDeleted', store.getState().currentLang), 'success');
    return;
  }

  // Store fault ID for confirmation
  setModalContext(modal, { faultId: fault.id });

  const state = store.getState();
  const gateColor = store.getGateColor(fault.gateNumber);

  // Update modal content
  const infoEl = modal.querySelector('.delete-fault-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <strong>#${escapeHtml(fault.bib)}</strong> -
      <span class="fault-gate ${gateColor}">T${escapeHtml(String(fault.gateNumber))}</span>
      (${escapeHtml(getFaultTypeLabel(fault.faultType, state.currentLang))}) -
      ${t('run1', state.currentLang).replace('1', String(fault.run))}
    `;
  }

  openModal(modal);
}

/**
 * Initialize all inline fault entry components
 */
export function refreshInlineFaultUI(): void {
  updateInlineFaultsList();
  updateInlineBibSelector();
  updateInlineGateSelector();
  updateInlineSaveButtonState();
}
