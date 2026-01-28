/**
 * Edit Modals Feature Module
 * Handles entry and fault editing modal functionality
 */

import type { AppState, Entry, FaultEntry, FaultType, Run, Language } from '../types';
import { escapeHtml } from '../utils/format';
import { makeNumericInput } from '../utils/validation';
import { t } from '../i18n/translations';

// Module state
let editingFaultId: string | null = null;
let editingEntryId: string | null = null;

// Dependencies interface
export interface EditModalsDependencies {
  getState: () => AppState;
  updateEntry: (id: string, updates: Partial<Entry>) => void;
  updateFaultEntryWithHistory: (id: string, updates: Partial<FaultEntry>, description?: string) => boolean;
  restoreFaultVersion: (id: string, version: number) => boolean;
  markFaultForDeletion: (id: string) => boolean;
  getFaultById: (id: string) => FaultEntry | undefined;
  syncFaultToCloud: (fault: FaultEntry) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
  feedbackSuccess: () => void;
  feedbackTap: () => void;
  openModal: (modal: HTMLElement | null) => void;
  closeModal: (modal: HTMLElement | null) => void;
  closeAllModals: () => void;
  refreshPanels: () => void;
}

let deps: EditModalsDependencies | null = null;

/**
 * Initialize the Edit Modals module with dependencies
 */
export function initEditModals(dependencies: EditModalsDependencies): void {
  deps = dependencies;
  initEntryEditModal();
  initFaultEditModal();
  initMarkDeletionModal();
}

/**
 * Get the currently editing fault ID
 */
export function getEditingFaultId(): string | null {
  return editingFaultId;
}

/**
 * Set the editing fault ID (for external use)
 */
export function setEditingFaultId(id: string | null): void {
  editingFaultId = id;
}

/**
 * Get fault type label for display
 */
export function getFaultTypeLabel(faultType: FaultType, lang: Language): string {
  const labels: Record<FaultType, Record<Language, string>> = {
    MG: { de: 'Ausgelassen', en: 'Missed' },
    STR: { de: 'Einfädler', en: 'Straddling' },
    BR: { de: 'Bindung', en: 'Binding' }
  };
  return labels[faultType]?.[lang] || faultType;
}

// ============== Entry Edit Modal ==============

/**
 * Initialize entry edit modal handlers
 */
function initEntryEditModal(): void {
  if (!deps) return;

  // Save edit button
  const saveEditBtn = document.getElementById('save-edit-btn');
  if (saveEditBtn) {
    saveEditBtn.addEventListener('click', handleSaveEntryEdit);
  }

  // Run selector buttons in entry edit modal
  const runBtns = document.querySelectorAll('#edit-modal .edit-run-btn');
  runBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('edit-modal');
      if (!modal) return;

      const run = btn.getAttribute('data-run');
      runBtns.forEach(b => b.classList.toggle('active', b === btn));
      if (run) modal.setAttribute('data-entry-run', run);
    });
  });
}

/**
 * Open entry edit modal
 */
export function openEntryEditModal(entry: Entry): void {
  if (!deps) return;

  const modal = document.getElementById('edit-modal');
  if (!modal) return;

  editingEntryId = entry.id;
  modal.setAttribute('data-entry-id', entry.id);

  // Populate fields
  const bibInput = document.getElementById('edit-bib-input') as HTMLInputElement;
  const statusSelect = document.getElementById('edit-status-select') as HTMLSelectElement;

  if (bibInput) bibInput.value = entry.bib || '';
  if (statusSelect) statusSelect.value = entry.status;

  // Update run selector buttons
  const entryRun = entry.run ?? 1;
  document.querySelectorAll('#edit-modal .edit-run-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-run') === String(entryRun);
    btn.classList.toggle('active', isActive);
  });
  modal.setAttribute('data-entry-run', String(entryRun));

  deps.openModal(modal);
}

/**
 * Handle saving entry edit
 */
function handleSaveEntryEdit(): void {
  if (!deps || !editingEntryId) return;

  const modal = document.getElementById('edit-modal');
  if (!modal) return;

  const state = deps.getState();
  const bibInput = document.getElementById('edit-bib-input') as HTMLInputElement;
  const statusSelect = document.getElementById('edit-status-select') as HTMLSelectElement;
  const runAttr = modal.getAttribute('data-entry-run');
  const run = runAttr ? parseInt(runAttr, 10) as 1 | 2 : 1;

  deps.updateEntry(editingEntryId, {
    bib: bibInput?.value.padStart(3, '0') || '',
    status: statusSelect?.value as Entry['status'],
    run
  });

  deps.showToast(t('saved', state.currentLang), 'success');
  deps.closeAllModals();
  editingEntryId = null;
}

// ============== Fault Edit Modal ==============

/**
 * Initialize fault edit modal handlers
 */
function initFaultEditModal(): void {
  if (!deps) return;

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
      });
    });
  }
}

/**
 * Open fault edit modal
 */
export function openFaultEditModal(fault: FaultEntry): void {
  if (!deps) return;

  // Don't allow editing faults marked for deletion
  if (fault.markedForDeletion) {
    const lang = deps.getState().currentLang;
    deps.showToast(t('cannotEditPendingDeletion', lang), 'warning');
    return;
  }

  const modal = document.getElementById('fault-edit-modal');
  if (!modal) return;

  editingFaultId = fault.id;
  const state = deps.getState();
  const lang = state.currentLang;

  // Populate fields
  const bibInput = document.getElementById('fault-edit-bib-input') as HTMLInputElement;
  const gateInput = document.getElementById('fault-edit-gate-input') as HTMLInputElement;
  const typeSelect = document.getElementById('fault-edit-type-select') as HTMLSelectElement;
  const gateRangeSpan = document.getElementById('fault-edit-gate-range');
  const versionSelect = document.getElementById('fault-version-select') as HTMLSelectElement;

  if (bibInput) bibInput.value = fault.bib || '';
  if (gateInput) gateInput.value = String(fault.gateNumber);
  if (typeSelect) typeSelect.value = fault.faultType;

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

  deps.openModal(modal);
}

/**
 * Handle saving fault edit
 */
function handleSaveFaultEdit(): void {
  if (!deps || !editingFaultId) return;

  const state = deps.getState();
  const fault = deps.getFaultById(editingFaultId);
  if (!fault) return;

  const bibInput = document.getElementById('fault-edit-bib-input') as HTMLInputElement;
  const gateInput = document.getElementById('fault-edit-gate-input') as HTMLInputElement;
  const typeSelect = document.getElementById('fault-edit-type-select') as HTMLSelectElement;
  const runSelector = document.getElementById('fault-edit-run-selector');

  const newBib = bibInput?.value.padStart(3, '0') || fault.bib;
  const newGate = parseInt(gateInput?.value || String(fault.gateNumber), 10);
  const newType = (typeSelect?.value || fault.faultType) as FaultType;

  // Gate range validation warning
  const lang = state.currentLang;
  if (fault.gateRange && (newGate < fault.gateRange[0] || newGate > fault.gateRange[1])) {
    // Show warning but allow save (gate might have been reassigned)
    deps.showToast(t('gateOutOfRange', lang), 'warning');
  }

  // Get selected run
  const selectedRunBtn = runSelector?.querySelector('.edit-run-btn.active');
  const newRun = selectedRunBtn ? parseInt(selectedRunBtn.getAttribute('data-run') || '1', 10) as Run : fault.run;

  // Build changes description
  const changes: string[] = [];
  if (newBib !== fault.bib) changes.push(`bib: ${fault.bib} -> ${newBib}`);
  if (newGate !== fault.gateNumber) changes.push(`gate: ${fault.gateNumber} -> ${newGate}`);
  if (newType !== fault.faultType) changes.push(`type: ${fault.faultType} -> ${newType}`);
  if (newRun !== fault.run) changes.push(`run: ${fault.run} -> ${newRun}`);

  const changeDescription = changes.length > 0 ? changes.join(', ') : undefined;

  // Update with version history
  const success = deps.updateFaultEntryWithHistory(editingFaultId, {
    bib: newBib,
    gateNumber: newGate,
    faultType: newType,
    run: newRun
  }, changeDescription);

  if (success) {
    // Sync updated fault to cloud
    const updatedFault = deps.getFaultById(editingFaultId);
    if (updatedFault) {
      deps.syncFaultToCloud(updatedFault);
    }

    deps.showToast(t('saved', lang), 'success');
    deps.feedbackSuccess();
    deps.refreshPanels();
  }

  deps.closeModal(document.getElementById('fault-edit-modal'));
  editingFaultId = null;
}

/**
 * Handle restoring a fault version
 */
function handleRestoreFaultVersion(): void {
  if (!deps || !editingFaultId) return;

  const versionSelect = document.getElementById('fault-version-select') as HTMLSelectElement;
  const selectedVersion = parseInt(versionSelect?.value || '0', 10);

  if (!selectedVersion) return;

  const fault = deps.getFaultById(editingFaultId);

  // Don't restore to current version
  if (fault && selectedVersion === fault.currentVersion) {
    return;
  }

  const success = deps.restoreFaultVersion(editingFaultId, selectedVersion);

  if (success) {
    // Sync restored fault to cloud
    const restoredFault = deps.getFaultById(editingFaultId);
    if (restoredFault) {
      deps.syncFaultToCloud(restoredFault);
    }

    const state = deps.getState();
    deps.showToast(t('versionRestored', state.currentLang), 'success');
    deps.feedbackSuccess();
    deps.refreshPanels();

    deps.closeModal(document.getElementById('fault-edit-modal'));
    editingFaultId = null;
  }
}

// ============== Mark Deletion Modal ==============

/**
 * Initialize mark deletion modal handlers
 */
function initMarkDeletionModal(): void {
  if (!deps) return;

  // Confirm mark deletion button
  const confirmMarkDeletionBtn = document.getElementById('confirm-mark-deletion-btn');
  if (confirmMarkDeletionBtn) {
    confirmMarkDeletionBtn.addEventListener('click', handleConfirmMarkDeletion);
  }
}

/**
 * Open mark deletion confirmation modal
 */
export function openMarkDeletionModal(fault: FaultEntry): void {
  if (!deps) return;

  const modal = document.getElementById('mark-deletion-modal');
  if (!modal) return;

  editingFaultId = fault.id;
  const state = deps.getState();
  const lang = state.currentLang;

  // Populate details
  const detailsEl = document.getElementById('mark-deletion-details');
  if (detailsEl) {
    detailsEl.innerHTML = `
      <div>#${escapeHtml(fault.bib.padStart(3, '0'))} T${fault.gateNumber} (${getFaultTypeLabel(fault.faultType, lang)}) - ${t(fault.run === 1 ? 'run1' : 'run2', lang)}</div>
    `;
  }

  deps.openModal(modal);
}

/**
 * Handle confirming mark for deletion
 */
function handleConfirmMarkDeletion(): void {
  if (!deps || !editingFaultId) return;

  const success = deps.markFaultForDeletion(editingFaultId);

  if (success) {
    // Sync the updated fault to cloud
    const markedFault = deps.getFaultById(editingFaultId);
    if (markedFault) {
      deps.syncFaultToCloud(markedFault);
    }

    const lang = deps.getState().currentLang;
    deps.showToast(t('markedForDeletion', lang), 'info');
    deps.feedbackTap();
    deps.refreshPanels();
  }

  deps.closeModal(document.getElementById('mark-deletion-modal'));
  editingFaultId = null;
}
