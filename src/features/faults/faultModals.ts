/**
 * Fault Recording Modals Module
 * Modal-based fault recording UI and voice recording entry point
 */

import { showToast } from '../../components';
import { t } from '../../i18n/translations';
import { feedbackTap } from '../../services';
import { store } from '../../store';
import type { FaultType } from '../../types';
import { escapeAttr, escapeHtml } from '../../utils';
import { closeModal, openModal } from '../modals';
import { updateActiveBibsList } from './faultInlineEntry';
import { createAndSyncFault } from './faultOperations';

// Track event listeners for cleanup (M6 fixes)
const faultModalBibListeners: Map<HTMLElement, EventListener> = new Map();
const faultModalGateListeners: Map<HTMLElement, EventListener> = new Map();
let faultModalBibInputListener: EventListener | null = null;

/**
 * Open fault recording modal
 */
export function openFaultRecordingModal(preselectedBib?: string): void {
  const state = store.getState();
  const lang = state.currentLang;
  const activeBibs = store.getActiveBibs(state.selectedRun);

  // Clean up old bib button listeners before adding new ones (M6 fix)
  for (const [element, listener] of faultModalBibListeners) {
    element.removeEventListener('click', listener);
  }
  faultModalBibListeners.clear();

  // Populate bib selector
  const bibSelector = document.getElementById('fault-bib-selector');
  if (bibSelector) {
    bibSelector.innerHTML = activeBibs
      .map(
        (bib) => `
      <button class="fault-bib-btn ${bib === preselectedBib ? 'selected' : ''}" data-bib="${escapeAttr(bib)}" aria-label="${escapeAttr(t('selectBib', lang))} ${escapeAttr(bib)}">${escapeHtml(bib)}</button>
    `,
      )
      .join('');

    // Add click handlers
    bibSelector.querySelectorAll('.fault-bib-btn').forEach((btn) => {
      const listener = () => {
        bibSelector
          .querySelectorAll('.fault-bib-btn')
          .forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        const bibInput = document.getElementById(
          'fault-bib-input',
        ) as HTMLInputElement;
        if (bibInput) bibInput.value = '';
        store.setSelectedFaultBib(btn.getAttribute('data-bib') || '');
      };
      btn.addEventListener('click', listener);
      faultModalBibListeners.set(btn as HTMLElement, listener);
    });
  }

  // Clean up old bib input listener before adding new one (M6 fix)
  const bibInput = document.getElementById(
    'fault-bib-input',
  ) as HTMLInputElement;
  if (bibInput && faultModalBibInputListener) {
    bibInput.removeEventListener('input', faultModalBibInputListener);
    faultModalBibInputListener = null;
  }

  // Clear manual bib input
  if (bibInput) {
    bibInput.value = preselectedBib || '';
    faultModalBibInputListener = () => {
      // Deselect any bib buttons when typing manually
      bibSelector
        ?.querySelectorAll('.fault-bib-btn')
        .forEach((b) => b.classList.remove('selected'));
      store.setSelectedFaultBib(bibInput.value.padStart(3, '0'));
    };
    bibInput.addEventListener('input', faultModalBibInputListener);
  }

  store.setSelectedFaultBib(preselectedBib || '');

  // Clean up old gate button listeners before adding new ones (M6 fix)
  for (const [element, listener] of faultModalGateListeners) {
    element.removeEventListener('click', listener);
  }
  faultModalGateListeners.clear();

  // Populate gate selector based on assignment with gate colors
  const gateSelector = document.getElementById('fault-gate-selector');
  if (gateSelector && state.gateAssignment) {
    const [start, end] = state.gateAssignment;
    let gatesHtml = '';
    for (let i = start; i <= end; i++) {
      const gateColor = store.getGateColor(i);
      const colorClass = gateColor === 'red' ? 'gate-red' : 'gate-blue';
      gatesHtml += `<button class="fault-gate-btn ${colorClass}" data-gate="${i}" aria-label="${escapeAttr(t('gateNumberLabel', lang))} ${i}">${i}</button>`;
    }
    gateSelector.innerHTML = gatesHtml;

    // Add click handlers
    gateSelector.querySelectorAll('.fault-gate-btn').forEach((btn) => {
      const listener = () => {
        gateSelector
          .querySelectorAll('.fault-gate-btn')
          .forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      };
      btn.addEventListener('click', listener);
      faultModalGateListeners.set(btn as HTMLElement, listener);
    });
  }

  // Clear fault type selection
  const faultTypeButtons = document.getElementById('fault-type-buttons');
  if (faultTypeButtons) {
    faultTypeButtons.querySelectorAll('.fault-type-btn').forEach((btn) => {
      btn.classList.remove('selected');
    });
  }

  openModal(document.getElementById('fault-modal'));
}

/**
 * Initialize fault recording modal handlers
 */
export function initFaultRecordingModal(): void {
  // Fault type buttons - click selects the type (no auto-save)
  const faultTypeButtons = document.getElementById('fault-type-buttons');
  if (faultTypeButtons) {
    // Helper to select a fault type button
    const selectFaultType = (faultType: FaultType) => {
      const btn = faultTypeButtons.querySelector(`[data-fault="${faultType}"]`);
      if (btn) {
        faultTypeButtons
          .querySelectorAll('.fault-type-btn')
          .forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        feedbackTap();
      }
    };

    faultTypeButtons.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.fault-type-btn');
      if (!btn) return;

      const faultType = btn.getAttribute('data-fault') as FaultType;
      if (faultType) {
        selectFaultType(faultType);
      }
    });

    // Keyboard support for fault type buttons
    faultTypeButtons.addEventListener('keydown', (e) => {
      const event = e as KeyboardEvent;
      const target = event.target as HTMLElement;
      const btn = target.closest('.fault-type-btn');

      // Space/Enter to select focused button
      if (btn && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        const faultType = btn.getAttribute('data-fault') as FaultType;
        if (faultType) {
          selectFaultType(faultType);
        }
        return;
      }

      // Keyboard shortcuts: M=MG, S/T=STR, B=BR
      const key = event.key.toUpperCase();
      if (key === 'M' || key === 'G') {
        event.preventDefault();
        selectFaultType('MG');
      } else if (key === 'T') {
        event.preventDefault();
        selectFaultType('STR');
      } else if (key === 'B' || key === 'R') {
        event.preventDefault();
        selectFaultType('BR');
      }
    });
  }

  // Save Fault button - records the fault
  const saveFaultBtn = document.getElementById('save-fault-btn');
  if (saveFaultBtn) {
    saveFaultBtn.addEventListener('click', () => {
      // Get selected fault type
      const selectedTypeBtn = document.querySelector(
        '#fault-type-buttons .fault-type-btn.selected',
      );
      if (!selectedTypeBtn) {
        const lang = store.getState().currentLang;
        showToast(t('selectFaultType', lang), 'warning');
        return;
      }

      const faultType = selectedTypeBtn.getAttribute('data-fault') as FaultType;
      if (faultType) {
        recordFault(faultType);
      }
    });
  }
}

/**
 * Record a fault entry
 */
export function recordFault(faultType: FaultType): void {
  const state = store.getState();

  // Get selected bib
  let bib = state.selectedFaultBib;
  if (!bib) {
    const bibInput = document.getElementById(
      'fault-bib-input',
    ) as HTMLInputElement;
    bib = bibInput?.value.padStart(3, '0') || '';
  }

  if (!bib) {
    showToast(t('selectBib', state.currentLang), 'warning');
    return;
  }

  // Get selected gate
  const selectedGateBtn = document.querySelector(
    '#fault-gate-selector .fault-gate-btn.selected',
  );
  const gateNumber = selectedGateBtn
    ? parseInt(selectedGateBtn.getAttribute('data-gate') || '0', 10)
    : 0;

  if (!gateNumber) {
    showToast(t('selectGate', state.currentLang), 'warning');
    return;
  }

  createAndSyncFault(bib, gateNumber, faultType);
  closeModal(document.getElementById('fault-modal'));
  updateActiveBibsList();
}

/**
 * Record a fault entry from voice command
 * Called by the gate judge voice handler after confirmation
 */
export function recordFaultFromVoice(
  bib: string,
  gateNumber: number,
  faultType: FaultType,
): void {
  const state = store.getState();

  // Validate gate is within assignment
  if (state.gateAssignment) {
    const [start, end] = state.gateAssignment;
    if (gateNumber < start || gateNumber > end) {
      showToast(t('gateOutOfRange', state.currentLang), 'warning');
      return;
    }
  }

  createAndSyncFault(bib.padStart(3, '0'), gateNumber, faultType);
  updateActiveBibsList();
}
