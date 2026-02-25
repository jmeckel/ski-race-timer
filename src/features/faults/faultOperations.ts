/**
 * Fault Operations Module
 * Core CRUD operations, editing, version history, and deletion workflows
 */

import { showToast } from '../../components';
import { t } from '../../i18n/translations';
import { feedbackSuccess, feedbackTap, feedbackWarning } from '../../services';
import { syncFault } from '../../services/sync';
import { store } from '../../store';
import type { FaultEntry, FaultType, Run } from '../../types';
import {
  escapeHtml,
  getFaultTypeLabel,
  getLocale,
  makeNumericInput,
} from '../../utils';
import { ListenerManager } from '../../utils/listenerManager';
import { setModalContext } from '../../utils/modalContext';
import { closeModal, openModal } from '../modals';

// Module-level listener manager for lifecycle cleanup
const listeners = new ListenerManager();

// Module state
let editingFaultId: string | null = null;

/**
 * Create, store, sync, and confirm a fault entry.
 * Shared logic used by all fault recording paths (modal, voice, inline).
 */
export function createAndSyncFault(
  bib: string,
  gateNumber: number,
  faultType: FaultType,
): void {
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
    gateRange: state.gateAssignment || [1, 1],
  };

  store.addFaultEntry(fault);
  feedbackWarning();

  const storedFault = store
    .getState()
    .faultEntries.find((f) => f.id === fault.id);
  if (storedFault) {
    void syncFault(storedFault).catch(() => { /* handled by queue */ });
    showFaultConfirmation(storedFault);
  }

  showToast(t('faultRecorded', state.currentLang), 'success');
}

/**
 * Show fault confirmation overlay (no auto-dismiss - user must tap Done or Add Note)
 */
export function showFaultConfirmation(fault: FaultEntry): void {
  const overlay = document.getElementById('fault-confirmation-overlay');
  if (!overlay) return;

  // Store fault ID for "Add Note" button
  setModalContext(overlay, { faultId: fault.id });

  const bibEl = overlay.querySelector('.fault-confirmation-bib');
  const gateEl = overlay.querySelector('.fault-confirmation-gate');
  const typeEl = overlay.querySelector('.fault-confirmation-type');

  const state = store.getState();

  if (bibEl) bibEl.textContent = fault.bib;
  if (gateEl)
    gateEl.textContent = `${t('gate', state.currentLang)} ${fault.gateNumber}`;
  if (typeEl)
    typeEl.textContent = getFaultTypeLabel(fault.faultType, state.currentLang);

  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');

  // Focus the Done button for keyboard accessibility
  const doneBtn = overlay.querySelector<HTMLElement>('#fault-confirmation-done-btn');
  if (doneBtn) {
    doneBtn.focus();
  }

  // NO auto-dismiss - user must tap "Done" or "Add Note"
}

/**
 * Initialize fault edit modal handlers
 */
export function initFaultEditModal(): void {
  // Save fault edit button
  const saveFaultEditBtn = document.getElementById('save-fault-edit-btn');
  if (saveFaultEditBtn) {
    listeners.add(saveFaultEditBtn, 'click', handleSaveFaultEdit);
  }

  // Restore version button
  const restoreVersionBtn = document.getElementById('restore-version-btn');
  if (restoreVersionBtn) {
    listeners.add(restoreVersionBtn, 'click', handleRestoreFaultVersion);
  }

  // Fault edit bib input - numeric only validation
  const faultEditBibInput = document.getElementById(
    'fault-edit-bib-input',
  ) as HTMLInputElement;
  if (faultEditBibInput) {
    makeNumericInput(faultEditBibInput, 3);
  }

  // Fault edit run selector
  const faultEditRunSelector = document.getElementById(
    'fault-edit-run-selector',
  );
  if (faultEditRunSelector) {
    listeners.add(faultEditRunSelector, 'click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.edit-run-btn');
      if (!btn) return;

      faultEditRunSelector.querySelectorAll('.edit-run-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
      });
    });
  }

  // Notes textarea char count
  const notesTextarea = document.getElementById(
    'fault-edit-notes',
  ) as HTMLTextAreaElement;
  const notesCharCount = document.getElementById('fault-edit-notes-char-count');
  if (notesTextarea && notesCharCount) {
    listeners.add(notesTextarea, 'input', () => {
      const count = notesTextarea.value.length;
      notesCharCount.textContent = `${count}/500`;
      notesCharCount.classList.toggle('near-limit', count > 450);
    });
  }

  // Notes mic button (dispatches event for voiceNoteUI to handle)
  const micBtn = document.getElementById('fault-edit-mic-btn');
  if (micBtn) {
    listeners.add(micBtn, 'click', () => {
      // Dispatch custom event for voice note recording in edit modal
      window.dispatchEvent(
        new CustomEvent('fault-edit-mic-click', {
          detail: { faultId: editingFaultId },
        }),
      );
    });
  }

  // Confirm mark deletion button
  const confirmMarkDeletionBtn = document.getElementById(
    'confirm-mark-deletion-btn',
  );
  if (confirmMarkDeletionBtn) {
    listeners.add(confirmMarkDeletionBtn, 'click', handleConfirmMarkDeletion);
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
  const bibInput = document.getElementById(
    'fault-edit-bib-input',
  ) as HTMLInputElement;
  const gateInput = document.getElementById(
    'fault-edit-gate-input',
  ) as HTMLInputElement;
  const typeSelect = document.getElementById(
    'fault-edit-type-select',
  ) as HTMLSelectElement;
  const gateRangeSpan = document.getElementById('fault-edit-gate-range');
  const versionSelect = document.getElementById(
    'fault-version-select',
  ) as HTMLSelectElement;
  const notesTextarea = document.getElementById(
    'fault-edit-notes',
  ) as HTMLTextAreaElement;
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
    runSelector.querySelectorAll('.edit-run-btn').forEach((btn) => {
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
      .filter((v) => v.version !== fault.currentVersion);

    for (const version of sortedHistory) {
      const option = document.createElement('option');
      option.value = String(version.version);
      const date = new Date(version.timestamp);
      const timeStr = date.toLocaleTimeString(getLocale(lang), {
        hour: '2-digit',
        minute: '2-digit',
      });
      const changeLabel =
        version.changeType === 'create'
          ? t('originalVersion', lang)
          : version.changeType === 'restore'
            ? t('restored', lang)
            : version.editedBy;
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
  const fault = state.faultEntries.find((f) => f.id === editingFaultId);
  if (!fault) return;

  const bibInput = document.getElementById(
    'fault-edit-bib-input',
  ) as HTMLInputElement;
  const gateInput = document.getElementById(
    'fault-edit-gate-input',
  ) as HTMLInputElement;
  const typeSelect = document.getElementById(
    'fault-edit-type-select',
  ) as HTMLSelectElement;
  const runSelector = document.getElementById('fault-edit-run-selector');
  const notesTextarea = document.getElementById(
    'fault-edit-notes',
  ) as HTMLTextAreaElement;

  const newBib = bibInput?.value.padStart(3, '0') || fault.bib;
  const newGate = parseInt(gateInput?.value || String(fault.gateNumber), 10);
  const newType = (typeSelect?.value || fault.faultType) as FaultType;
  const newNotes = notesTextarea?.value.trim().slice(0, 500) || '';

  // Gate range validation warning
  const lang = state.currentLang;
  if (
    fault.gateRange &&
    (newGate < fault.gateRange[0] || newGate > fault.gateRange[1])
  ) {
    // Show warning but allow save (gate might have been reassigned)
    showToast(t('gateOutOfRange', lang), 'warning');
  }

  // Get selected run
  const selectedRunBtn = runSelector?.querySelector('.edit-run-btn.active');
  const newRun = selectedRunBtn
    ? (parseInt(selectedRunBtn.getAttribute('data-run') || '1', 10) as Run)
    : fault.run;

  // Build changes description
  const changes: string[] = [];
  if (newBib !== fault.bib) changes.push(`bib: ${fault.bib} → ${newBib}`);
  if (newGate !== fault.gateNumber)
    changes.push(`gate: ${fault.gateNumber} → ${newGate}`);
  if (newType !== fault.faultType)
    changes.push(`type: ${fault.faultType} → ${newType}`);
  if (newRun !== fault.run) changes.push(`run: ${fault.run} → ${newRun}`);
  if (newNotes !== (fault.notes || '')) {
    const notesDesc = newNotes
      ? `notes: ${newNotes.slice(0, 30)}${newNotes.length > 30 ? '...' : ''}`
      : 'notes removed';
    changes.push(notesDesc);
  }

  const changeDescription = changes.length > 0 ? changes.join(', ') : undefined;

  // Build update object including notes
  const updateData: Partial<FaultEntry> = {
    bib: newBib,
    gateNumber: newGate,
    faultType: newType,
    run: newRun,
  };

  // Only include notes fields if notes changed
  if (newNotes !== (fault.notes || '')) {
    updateData.notes = newNotes || undefined;
    updateData.notesSource = newNotes ? 'manual' : undefined;
    updateData.notesTimestamp = newNotes ? new Date().toISOString() : undefined;
  }

  // Update with version history
  const success = store.updateFaultEntryWithHistory(
    editingFaultId,
    updateData,
    changeDescription,
  );

  if (success) {
    // Sync updated fault to cloud
    const updatedFault = store
      .getState()
      .faultEntries.find((f) => f.id === editingFaultId);
    if (updatedFault) {
      void syncFault(updatedFault).catch(() => { /* handled by queue */ });
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

  const versionSelect = document.getElementById(
    'fault-version-select',
  ) as HTMLSelectElement;
  const selectedVersion = parseInt(versionSelect?.value || '0', 10);

  if (!selectedVersion) return;

  const state = store.getState();
  const fault = state.faultEntries.find((f) => f.id === editingFaultId);

  // Don't restore to current version
  if (fault && selectedVersion === fault.currentVersion) {
    return;
  }

  const success = store.restoreFaultVersion(editingFaultId, selectedVersion);

  if (success) {
    // Sync restored fault to cloud
    const restoredFault = store
      .getState()
      .faultEntries.find((f) => f.id === editingFaultId);
    if (restoredFault) {
      void syncFault(restoredFault).catch(() => { /* handled by queue */ });
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
    const markedFault = store
      .getState()
      .faultEntries.find((f) => f.id === editingFaultId);
    if (markedFault) {
      void syncFault(markedFault).catch(() => { /* handled by queue */ });
    }

    const lang = store.getState().currentLang;
    showToast(t('markedForDeletion', lang), 'info');
    feedbackTap();
  }

  closeModal(document.getElementById('mark-deletion-modal'));
  editingFaultId = null;
}
