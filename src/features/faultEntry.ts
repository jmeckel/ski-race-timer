/**
 * Fault Entry Module
 * Handles fault recording, editing, inline entry, and deletion workflows
 */

import { store } from '../store';
import { syncFault, deleteFaultFromCloud } from '../services/sync';
import { showToast } from '../components';
import { feedbackTap, feedbackWarning, feedbackSuccess } from '../services';
import { t } from '../i18n/translations';
import { escapeHtml, escapeAttr, makeNumericInput } from '../utils';
import { formatTime as formatTimeDisplay } from '../utils/format';
import { openModal, closeModal } from './modals';
import { getFaultTypeLabel } from './chiefJudgeView';
import type { FaultEntry, FaultType, Run } from '../types';

// Module state
let editingFaultId: string | null = null;
let inlineSelectedBib = '';
let inlineSelectedGate = 0;
let inlineSelectedFaultType: FaultType | null = null;

// Track event listeners for cleanup (M6, M7 fixes)
let faultModalBibListeners: Map<HTMLElement, EventListener> = new Map();
let faultModalGateListeners: Map<HTMLElement, EventListener> = new Map();
let faultModalBibInputListener: EventListener | null = null;
let inlineFaultTypeClickListener: EventListener | null = null;
let inlineFaultTypeKeydownListener: EventListener | null = null;

/**
 * Open fault recording modal
 */
export function openFaultRecordingModal(preselectedBib?: string): void {
  const state = store.getState();
  const activeBibs = store.getActiveBibs(state.selectedRun);

  // Clean up old bib button listeners before adding new ones (M6 fix)
  for (const [element, listener] of faultModalBibListeners) {
    element.removeEventListener('click', listener);
  }
  faultModalBibListeners.clear();

  // Populate bib selector
  const bibSelector = document.getElementById('fault-bib-selector');
  if (bibSelector) {
    bibSelector.innerHTML = activeBibs.map(bib => `
      <button class="fault-bib-btn ${bib === preselectedBib ? 'selected' : ''}" data-bib="${escapeAttr(bib)}" aria-label="Select bib ${escapeAttr(bib)}">${escapeHtml(bib)}</button>
    `).join('');

    // Add click handlers
    bibSelector.querySelectorAll('.fault-bib-btn').forEach(btn => {
      const listener = () => {
        bibSelector.querySelectorAll('.fault-bib-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const bibInput = document.getElementById('fault-bib-input') as HTMLInputElement;
        if (bibInput) bibInput.value = '';
        store.setSelectedFaultBib(btn.getAttribute('data-bib') || '');
      };
      btn.addEventListener('click', listener);
      faultModalBibListeners.set(btn as HTMLElement, listener);
    });
  }

  // Clean up old bib input listener before adding new one (M6 fix)
  const bibInput = document.getElementById('fault-bib-input') as HTMLInputElement;
  if (bibInput && faultModalBibInputListener) {
    bibInput.removeEventListener('input', faultModalBibInputListener);
    faultModalBibInputListener = null;
  }

  // Clear manual bib input
  if (bibInput) {
    bibInput.value = preselectedBib || '';
    faultModalBibInputListener = () => {
      // Deselect any bib buttons when typing manually
      bibSelector?.querySelectorAll('.fault-bib-btn').forEach(b => b.classList.remove('selected'));
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
      gatesHtml += `<button class="fault-gate-btn ${colorClass}" data-gate="${i}" aria-label="Gate ${i}">${i}</button>`;
    }
    gateSelector.innerHTML = gatesHtml;

    // Add click handlers
    gateSelector.querySelectorAll('.fault-gate-btn').forEach(btn => {
      const listener = () => {
        gateSelector.querySelectorAll('.fault-gate-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      };
      btn.addEventListener('click', listener);
      faultModalGateListeners.set(btn as HTMLElement, listener);
    });
  }

  // Clear fault type selection
  const faultTypeButtons = document.getElementById('fault-type-buttons');
  if (faultTypeButtons) {
    faultTypeButtons.querySelectorAll('.fault-type-btn').forEach(btn => {
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
        faultTypeButtons.querySelectorAll('.fault-type-btn').forEach(b => b.classList.remove('selected'));
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
      const selectedTypeBtn = document.querySelector('#fault-type-buttons .fault-type-btn.selected');
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
 * Create, store, sync, and confirm a fault entry.
 * Shared logic used by all fault recording paths (modal, voice, inline).
 */
function createAndSyncFault(bib: string, gateNumber: number, faultType: FaultType): void {
  const state = store.getState();

  const fault = {
    id: `fault-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    bib,
    run: state.selectedRun,
    gateNumber,
    faultType,
    timestamp: new Date().toISOString(),
    deviceId: state.deviceId,
    deviceName: state.deviceName,
    gateRange: state.gateAssignment || [1, 1]
  };

  store.addFaultEntry(fault);
  feedbackWarning();

  const storedFault = store.getState().faultEntries.find(f => f.id === fault.id);
  if (storedFault) {
    syncFault(storedFault);
    showFaultConfirmation(storedFault);
  }

  showToast(t('faultRecorded', state.currentLang), 'success');
}

/**
 * Record a fault entry
 */
export function recordFault(faultType: FaultType): void {
  const state = store.getState();

  // Get selected bib
  let bib = state.selectedFaultBib;
  if (!bib) {
    const bibInput = document.getElementById('fault-bib-input') as HTMLInputElement;
    bib = bibInput?.value.padStart(3, '0') || '';
  }

  if (!bib) {
    showToast(t('selectBib', state.currentLang), 'warning');
    return;
  }

  // Get selected gate
  const selectedGateBtn = document.querySelector('#fault-gate-selector .fault-gate-btn.selected');
  const gateNumber = selectedGateBtn ? parseInt(selectedGateBtn.getAttribute('data-gate') || '0', 10) : 0;

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
export function recordFaultFromVoice(bib: string, gateNumber: number, faultType: FaultType): void {
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

/**
 * Show fault confirmation overlay (no auto-dismiss - user must tap Done or Add Note)
 */
export function showFaultConfirmation(fault: FaultEntry): void {
  const overlay = document.getElementById('fault-confirmation-overlay');
  if (!overlay) return;

  // Store fault ID for "Add Note" button
  overlay.setAttribute('data-fault-id', fault.id);

  const bibEl = overlay.querySelector('.fault-confirmation-bib');
  const gateEl = overlay.querySelector('.fault-confirmation-gate');
  const typeEl = overlay.querySelector('.fault-confirmation-type');

  const state = store.getState();

  if (bibEl) bibEl.textContent = fault.bib;
  if (gateEl) gateEl.textContent = `${t('gate', state.currentLang)} ${fault.gateNumber}`;
  if (typeEl) typeEl.textContent = getFaultTypeLabel(fault.faultType, state.currentLang);

  overlay.classList.add('show');

  // NO auto-dismiss - user must tap "Done" or "Add Note"
}

/**
 * Initialize fault edit modal handlers
 */
export function initFaultEditModal(): void {
  // Save fault edit button
  const saveFaultEditBtn = document.getElementById('save-fault-edit-btn');
  if (saveFaultEditBtn) {
    saveFaultEditBtn.addEventListener('click', handleSaveFaultEdit);
  }

  // Restore version button
  const restoreVersionBtn = document.getElementById('restore-version-btn');
  if (restoreVersionBtn) {
    restoreVersionBtn.addEventListener('click', handleRestoreFaultVersion);
  }

  // Fault edit bib input - numeric only validation
  const faultEditBibInput = document.getElementById('fault-edit-bib-input') as HTMLInputElement;
  if (faultEditBibInput) {
    makeNumericInput(faultEditBibInput, 3);
  }

  // Fault edit run selector
  const faultEditRunSelector = document.getElementById('fault-edit-run-selector');
  if (faultEditRunSelector) {
    faultEditRunSelector.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.edit-run-btn');
      if (!btn) return;

      faultEditRunSelector.querySelectorAll('.edit-run-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
      });
    });
  }

  // Notes textarea char count
  const notesTextarea = document.getElementById('fault-edit-notes') as HTMLTextAreaElement;
  const notesCharCount = document.getElementById('fault-edit-notes-char-count');
  if (notesTextarea && notesCharCount) {
    notesTextarea.addEventListener('input', () => {
      const count = notesTextarea.value.length;
      notesCharCount.textContent = `${count}/500`;
      notesCharCount.classList.toggle('near-limit', count > 450);
    });
  }

  // Notes mic button (dispatches event for voiceNoteUI to handle)
  const micBtn = document.getElementById('fault-edit-mic-btn');
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      // Dispatch custom event for voice note recording in edit modal
      window.dispatchEvent(new CustomEvent('fault-edit-mic-click', {
        detail: { faultId: editingFaultId }
      }));
    });
  }

  // Confirm mark deletion button
  const confirmMarkDeletionBtn = document.getElementById('confirm-mark-deletion-btn');
  if (confirmMarkDeletionBtn) {
    confirmMarkDeletionBtn.addEventListener('click', handleConfirmMarkDeletion);
  }
}

/**
 * Open fault edit modal
 */
export function openFaultEditModal(fault: FaultEntry): void {
  // Don't allow editing faults marked for deletion
  if (fault.markedForDeletion) {
    const lang = store.getState().currentLang;
    showToast(t('cannotEditPendingDeletion', lang), 'warning');
    return;
  }

  const modal = document.getElementById('fault-edit-modal');
  if (!modal) return;

  editingFaultId = fault.id;
  const state = store.getState();
  const lang = state.currentLang;

  // Populate fields
  const bibInput = document.getElementById('fault-edit-bib-input') as HTMLInputElement;
  const gateInput = document.getElementById('fault-edit-gate-input') as HTMLInputElement;
  const typeSelect = document.getElementById('fault-edit-type-select') as HTMLSelectElement;
  const gateRangeSpan = document.getElementById('fault-edit-gate-range');
  const versionSelect = document.getElementById('fault-version-select') as HTMLSelectElement;
  const notesTextarea = document.getElementById('fault-edit-notes') as HTMLTextAreaElement;
  const notesCharCount = document.getElementById('fault-edit-notes-char-count');

  if (bibInput) bibInput.value = fault.bib || '';
  if (gateInput) gateInput.value = String(fault.gateNumber);
  if (typeSelect) typeSelect.value = fault.faultType;

  // Populate notes field
  if (notesTextarea) {
    notesTextarea.value = fault.notes || '';
  }
  if (notesCharCount) {
    const count = (fault.notes || '').length;
    notesCharCount.textContent = `${count}/500`;
  }

  // Show gate range info
  if (gateRangeSpan && fault.gateRange) {
    gateRangeSpan.textContent = `(${t('gates', lang)} ${fault.gateRange[0]}-${fault.gateRange[1]})`;
  }

  // Update run selector buttons
  const runSelector = document.getElementById('fault-edit-run-selector');
  if (runSelector) {
    runSelector.querySelectorAll('.edit-run-btn').forEach(btn => {
      const btnRun = btn.getAttribute('data-run');
      btn.classList.toggle('active', btnRun === String(fault.run));
    });
  }

  // Populate version history dropdown
  if (versionSelect) {
    versionSelect.innerHTML = '';

    // Add current version
    const currentOption = document.createElement('option');
    currentOption.value = String(fault.currentVersion || 1);
    currentOption.textContent = `v${fault.currentVersion || 1} - ${t('currentVersion', lang)}`;
    versionSelect.appendChild(currentOption);

    // Add history versions (newest first, excluding current)
    const history = fault.versionHistory || [];
    const sortedHistory = [...history]
      .sort((a, b) => b.version - a.version)
      .filter(v => v.version !== fault.currentVersion);

    for (const version of sortedHistory) {
      const option = document.createElement('option');
      option.value = String(version.version);
      const date = new Date(version.timestamp);
      const timeStr = date.toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const changeLabel = version.changeType === 'create' ? t('originalVersion', lang) :
                          version.changeType === 'restore' ? t('restored', lang) :
                          version.editedBy;
      option.textContent = `v${version.version} - ${changeLabel} (${timeStr})`;
      versionSelect.appendChild(option);
    }
  }

  openModal(modal);
}

/**
 * Handle saving fault edit
 */
export function handleSaveFaultEdit(): void {
  if (!editingFaultId) return;

  const state = store.getState();
  const fault = state.faultEntries.find(f => f.id === editingFaultId);
  if (!fault) return;

  const bibInput = document.getElementById('fault-edit-bib-input') as HTMLInputElement;
  const gateInput = document.getElementById('fault-edit-gate-input') as HTMLInputElement;
  const typeSelect = document.getElementById('fault-edit-type-select') as HTMLSelectElement;
  const runSelector = document.getElementById('fault-edit-run-selector');
  const notesTextarea = document.getElementById('fault-edit-notes') as HTMLTextAreaElement;

  const newBib = bibInput?.value.padStart(3, '0') || fault.bib;
  const newGate = parseInt(gateInput?.value || String(fault.gateNumber), 10);
  const newType = (typeSelect?.value || fault.faultType) as FaultType;
  const newNotes = notesTextarea?.value.trim().slice(0, 500) || '';

  // Gate range validation warning
  const lang = state.currentLang;
  if (fault.gateRange && (newGate < fault.gateRange[0] || newGate > fault.gateRange[1])) {
    // Show warning but allow save (gate might have been reassigned)
    showToast(t('gateOutOfRange', lang), 'warning');
  }

  // Get selected run
  const selectedRunBtn = runSelector?.querySelector('.edit-run-btn.active');
  const newRun = selectedRunBtn ? parseInt(selectedRunBtn.getAttribute('data-run') || '1', 10) as Run : fault.run;

  // Build changes description
  const changes: string[] = [];
  if (newBib !== fault.bib) changes.push(`bib: ${fault.bib} → ${newBib}`);
  if (newGate !== fault.gateNumber) changes.push(`gate: ${fault.gateNumber} → ${newGate}`);
  if (newType !== fault.faultType) changes.push(`type: ${fault.faultType} → ${newType}`);
  if (newRun !== fault.run) changes.push(`run: ${fault.run} → ${newRun}`);
  if (newNotes !== (fault.notes || '')) {
    const notesDesc = newNotes ? `notes: ${newNotes.slice(0, 30)}${newNotes.length > 30 ? '...' : ''}` : 'notes removed';
    changes.push(notesDesc);
  }

  const changeDescription = changes.length > 0 ? changes.join(', ') : undefined;

  // Build update object including notes
  const updateData: Partial<FaultEntry> = {
    bib: newBib,
    gateNumber: newGate,
    faultType: newType,
    run: newRun
  };

  // Only include notes fields if notes changed
  if (newNotes !== (fault.notes || '')) {
    updateData.notes = newNotes || undefined;
    updateData.notesSource = newNotes ? 'manual' : undefined;
    updateData.notesTimestamp = newNotes ? new Date().toISOString() : undefined;
  }

  // Update with version history
  const success = store.updateFaultEntryWithHistory(editingFaultId, updateData, changeDescription);

  if (success) {
    // Sync updated fault to cloud
    const updatedFault = store.getState().faultEntries.find(f => f.id === editingFaultId);
    if (updatedFault) {
      syncFault(updatedFault);
    }

    showToast(t('saved', lang), 'success');
    feedbackSuccess();
  }

  closeModal(document.getElementById('fault-edit-modal'));
  editingFaultId = null;
}

/**
 * Handle restoring a fault version
 */
export function handleRestoreFaultVersion(): void {
  if (!editingFaultId) return;

  const versionSelect = document.getElementById('fault-version-select') as HTMLSelectElement;
  const selectedVersion = parseInt(versionSelect?.value || '0', 10);

  if (!selectedVersion) return;

  const state = store.getState();
  const fault = state.faultEntries.find(f => f.id === editingFaultId);

  // Don't restore to current version
  if (fault && selectedVersion === fault.currentVersion) {
    return;
  }

  const success = store.restoreFaultVersion(editingFaultId, selectedVersion);

  if (success) {
    // Sync restored fault to cloud
    const restoredFault = store.getState().faultEntries.find(f => f.id === editingFaultId);
    if (restoredFault) {
      syncFault(restoredFault);
    }

    const lang = state.currentLang;
    showToast(t('versionRestored', lang), 'success');
    feedbackSuccess();

    closeModal(document.getElementById('fault-edit-modal'));
    editingFaultId = null;
  }
}

/**
 * Open mark deletion confirmation modal
 */
export function openMarkDeletionModal(fault: FaultEntry): void {
  const modal = document.getElementById('mark-deletion-modal');
  if (!modal) return;

  editingFaultId = fault.id;
  const state = store.getState();
  const lang = state.currentLang;

  // Populate details
  const detailsEl = document.getElementById('mark-deletion-details');
  if (detailsEl) {
    detailsEl.innerHTML = `
      <div>#${escapeHtml(fault.bib.padStart(3, '0'))} T${escapeHtml(String(fault.gateNumber))} (${escapeHtml(getFaultTypeLabel(fault.faultType, lang))}) - ${escapeHtml(t(fault.run === 1 ? 'run1' : 'run2', lang))}</div>
    `;
  }

  openModal(modal);
}

/**
 * Handle confirming mark for deletion
 */
export function handleConfirmMarkDeletion(): void {
  if (!editingFaultId) return;

  const success = store.markFaultForDeletion(editingFaultId);

  if (success) {
    // Sync the updated fault to cloud
    const markedFault = store.getState().faultEntries.find(f => f.id === editingFaultId);
    if (markedFault) {
      syncFault(markedFault);
    }

    const lang = store.getState().currentLang;
    showToast(t('markedForDeletion', lang), 'info');
    feedbackTap();
  }

  closeModal(document.getElementById('mark-deletion-modal'));
  editingFaultId = null;
}

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
  list.querySelectorAll('.active-bib-card').forEach(card => card.remove());

  if (activeBibs.length === 0) {
    if (emptyState) emptyState.style.display = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  // Get start times for each bib
  const startTimes = new Map<string, Date>();
  state.entries.forEach(entry => {
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
  sortedBibs.forEach(bib => {
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
          openFaultRecordingModal(bib);
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
  const faults = state.faultEntries.filter(f =>
    f.run === state.selectedRun &&
    !f.markedForDeletion
  );

  // Update count badge
  if (countBadge) {
    countBadge.textContent = String(faults.length);
    countBadge.setAttribute('data-count', String(faults.length));
  }

  // Clear existing fault items (keep empty state)
  listContainer.querySelectorAll('.gate-judge-fault-item').forEach(item => item.remove());

  if (faults.length === 0) {
    if (emptyState) emptyState.style.display = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  // Sort by timestamp (most recent first)
  const sortedFaults = [...faults].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  sortedFaults.forEach(fault => {
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
          <span class="gate-judge-fault-type">${escapeHtml(fault.faultType)}</span>
          ${hasNotes ? `<span class="gate-judge-fault-note-icon" title="${escapeAttr(t('hasNote', lang))}" aria-label="${escapeAttr(t('hasNote', lang))}">📝</span>` : ''}
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
        feedbackTap();
        openFaultDeleteConfirmation(fault);
      });
    }

    listContainer.appendChild(item);
  });
}

/**
 * Update inline bib selector buttons
 */
export function updateInlineBibSelector(): void {
  const container = document.getElementById('inline-bib-selector');
  if (!container) return;

  const state = store.getState();
  const activeBibs = store.getActiveBibs(state.selectedRun);

  container.innerHTML = '';

  // Show up to 6 most recent active bibs as quick-select buttons
  const recentBibs = activeBibs.slice(0, 6);

  recentBibs.forEach(bib => {
    const btn = document.createElement('button');
    btn.className = 'inline-bib-btn';
    btn.setAttribute('data-bib', bib);
    btn.setAttribute('aria-pressed', String(bib === inlineSelectedBib));
    btn.textContent = bib;

    if (bib === inlineSelectedBib) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => {
      feedbackTap();
      selectInlineBib(bib);
    });

    // Keyboard support: Space/Enter to select, arrow keys to navigate
    btn.addEventListener('keydown', (e) => {
      const buttons = Array.from(container.querySelectorAll('.inline-bib-btn')) as HTMLElement[];
      const currentIndex = buttons.indexOf(btn);

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          feedbackTap();
          selectInlineBib(bib);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          if (currentIndex > 0) {
            buttons[currentIndex - 1].focus();
          }
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          if (currentIndex < buttons.length - 1) {
            buttons[currentIndex + 1].focus();
          }
          break;
      }
    });

    container.appendChild(btn);
  });
}

/**
 * Select a bib for inline fault entry
 */
export function selectInlineBib(bib: string): void {
  inlineSelectedBib = bib;

  // Update bib buttons
  document.querySelectorAll('#inline-bib-selector .inline-bib-btn').forEach(btn => {
    const isSelected = btn.getAttribute('data-bib') === bib;
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-pressed', String(isSelected));
  });

  // Update manual input
  const bibInput = document.getElementById('inline-bib-input') as HTMLInputElement;
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
  const [start, end] = state.gateAssignment || [1, 10];

  container.innerHTML = '';

  // Get fault counts per gate for badges
  const faultsByGate = new Map<number, number>();
  state.faultEntries.forEach(f => {
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
    btn.setAttribute('aria-label', `${t('gateNumberLabel', lang)} ${gate}${faultCount ? ` (${faultCount})` : ''}`);

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
      const buttons = Array.from(container.querySelectorAll('.gate-grid-btn')) as HTMLElement[];
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
            buttons[currentIndex - 1].focus();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentIndex < buttons.length - 1) {
            buttons[currentIndex + 1].focus();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          // Move up one row (5 columns)
          if (currentIndex >= 5) {
            buttons[currentIndex - 5].focus();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          // Move down one row (5 columns)
          if (currentIndex + 5 < buttons.length) {
            buttons[currentIndex + 5].focus();
          }
          break;
        default:
          // Number shortcuts: 1-9 for gates, 0 for gate 10
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const targetGate = e.key === '0' ? 10 : parseInt(e.key);
            if (targetGate >= start && targetGate <= end) {
              const targetBtn = container.querySelector(`[data-gate="${targetGate}"]`) as HTMLElement;
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
    document.querySelectorAll('#inline-gate-selector .gate-grid-btn').forEach(btn => {
      btn.classList.remove('selected');
      btn.setAttribute('aria-checked', 'false');
    });
    return;
  }

  inlineSelectedGate = gate;

  // Update gate button states
  document.querySelectorAll('#inline-gate-selector .gate-grid-btn').forEach(btn => {
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
  state.entries.forEach(entry => {
    if (entry.point === 'S' && entry.run === state.selectedRun) {
      startTimes.set(entry.bib, new Date(entry.timestamp).getTime());
    }
  });

  // Sort by most recent start
  const sorted = [...activeBibs].sort((a, b) => {
    return (startTimes.get(b) || 0) - (startTimes.get(a) || 0);
  });

  // Auto-select most recent
  selectInlineBib(sorted[0]);
}

/**
 * Initialize inline fault entry handlers
 */
export function initInlineFaultEntry(): void {
  // Bib manual input
  const bibInput = document.getElementById('inline-bib-input') as HTMLInputElement;
  if (bibInput) {
    makeNumericInput(bibInput, 3);
    bibInput.addEventListener('input', () => {
      if (bibInput.value) {
        inlineSelectedBib = bibInput.value.padStart(3, '0');
        // Deselect any quick-select button
        document.querySelectorAll('#inline-bib-selector .inline-bib-btn').forEach(btn => {
          btn.classList.remove('selected');
        });
        updateInlineSaveButtonState();
      }
    });
  }

  // Fault detail panel close button
  const closeBtn = document.getElementById('fault-detail-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      inlineSelectedGate = 0;
      inlineSelectedFaultType = null;
      closeFaultDetailPanel();
      // Deselect gate buttons
      document.querySelectorAll('#inline-gate-selector .gate-grid-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.setAttribute('aria-checked', 'false');
      });
      // Deselect fault type buttons
      document.querySelectorAll('#inline-fault-types .inline-fault-type-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.setAttribute('aria-pressed', 'false');
      });
      updateInlineSaveButtonState();
    });
  }

  // Clean up old listeners before adding new ones (M7 fix)
  const faultTypeContainer = document.getElementById('inline-fault-types');
  if (faultTypeContainer) {
    if (inlineFaultTypeClickListener) {
      faultTypeContainer.removeEventListener('click', inlineFaultTypeClickListener);
      inlineFaultTypeClickListener = null;
    }
    if (inlineFaultTypeKeydownListener) {
      faultTypeContainer.removeEventListener('keydown', inlineFaultTypeKeydownListener);
      inlineFaultTypeKeydownListener = null;
    }

    // Helper to select a fault type button
    const selectFaultTypeBtn = (btn: Element) => {
      feedbackTap();
      const faultType = btn.getAttribute('data-fault') as FaultType;
      inlineSelectedFaultType = faultType;

      // Update button states
      faultTypeContainer.querySelectorAll('.inline-fault-type-btn').forEach(b => {
        b.classList.toggle('selected', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });

      updateInlineSaveButtonState();
    };

    inlineFaultTypeClickListener = (e: Event) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.inline-fault-type-btn');
      if (!btn) return;
      selectFaultTypeBtn(btn);
    };
    faultTypeContainer.addEventListener('click', inlineFaultTypeClickListener);

    // Keyboard support: Space/Enter to select, M/G/T/B shortcuts
    inlineFaultTypeKeydownListener = (e: Event) => {
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
        const faultBtn = faultTypeContainer.querySelector(`[data-fault="${faultType}"]`);
        if (faultBtn) {
          selectFaultTypeBtn(faultBtn);
          (faultBtn as HTMLElement).focus();
        }
      }
    };
    faultTypeContainer.addEventListener('keydown', inlineFaultTypeKeydownListener);
  }

  // Save fault button
  const saveBtn = document.getElementById('inline-save-fault-btn');
  saveBtn?.addEventListener('click', saveInlineFault);
}

/**
 * Update the save button enabled/disabled state
 */
export function updateInlineSaveButtonState(): void {
  const saveBtn = document.getElementById('inline-save-fault-btn') as HTMLButtonElement;
  if (saveBtn) {
    const isValid = inlineSelectedBib && inlineSelectedGate > 0 && inlineSelectedFaultType;
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

  createAndSyncFault(inlineSelectedBib, inlineSelectedGate, inlineSelectedFaultType);

  // Reset fault type (keep gate and bib for quick successive faults on same gate)
  inlineSelectedFaultType = null;

  // Deselect fault type buttons but keep gate selected
  document.querySelectorAll('#inline-fault-types .inline-fault-type-btn').forEach(btn => {
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
    const markedFault = store.getState().faultEntries.find(f => f.id === fault.id);
    if (markedFault) {
      deleteFaultFromCloud(markedFault);
    }
    updateInlineFaultsList();
    showToast(t('faultDeleted', store.getState().currentLang), 'success');
    return;
  }

  // Store fault ID for confirmation
  modal.setAttribute('data-fault-id', fault.id);

  const state = store.getState();
  const gateColor = store.getGateColor(fault.gateNumber);

  // Update modal content
  const infoEl = modal.querySelector('.delete-fault-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <strong>#${escapeHtml(fault.bib)}</strong> -
      <span class="fault-gate ${gateColor}">T${fault.gateNumber}</span>
      (${escapeHtml(fault.faultType)}) -
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
