/**
 * Unit Tests for Fault Operations Feature Module
 * Tests: createAndSyncFault, showFaultConfirmation, openFaultEditModal,
 *        handleSaveFaultEdit, handleRestoreFaultVersion,
 *        openMarkDeletionModal, handleConfirmMarkDeletion, initFaultEditModal
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackSuccess: vi.fn(),
  feedbackTap: vi.fn(),
  feedbackWarning: vi.fn(),
}));

vi.mock('../../../src/services/sync', () => ({
  syncFault: vi.fn(),
}));

vi.mock('../../../src/store', () => ({
  store: {
    getState: vi.fn(() => ({
      currentLang: 'en',
      selectedRun: 1,
      deviceId: 'device-1',
      deviceName: 'Timer 1',
      gateAssignment: [1, 10],
      faultEntries: [],
    })),
    addFaultEntry: vi.fn(),
    updateFaultEntryWithHistory: vi.fn(() => true),
    restoreFaultVersion: vi.fn(() => true),
    markFaultForDeletion: vi.fn(() => true),
  },
}));

vi.mock('../../../src/utils', () => ({
  escapeHtml: vi.fn((s: string) => s),
  getFaultTypeLabel: vi.fn((type: string) => type),
  makeNumericInput: vi.fn(),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
    count: 0,
  })),
}));

vi.mock('../../../src/utils/modalContext', () => ({
  setModalContext: vi.fn(),
}));

vi.mock('../../../src/features/modals', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
}));

import {
  createAndSyncFault,
  showFaultConfirmation,
  openFaultEditModal,
  handleSaveFaultEdit,
  handleRestoreFaultVersion,
  openMarkDeletionModal,
  handleConfirmMarkDeletion,
  initFaultEditModal,
} from '../../../src/features/faults/faultOperations';
import { showToast } from '../../../src/components';
import {
  feedbackSuccess,
  feedbackTap,
  feedbackWarning,
} from '../../../src/services';
import { syncFault } from '../../../src/services/sync';
import { store } from '../../../src/store';
import { openModal, closeModal } from '../../../src/features/modals';
import { setModalContext } from '../../../src/utils/modalContext';
import type { FaultEntry, FaultVersion } from '../../../src/types';

describe('Fault Operations Feature Module', () => {
  let container: HTMLDivElement;

  const createMockFault = (overrides: Partial<FaultEntry> = {}): FaultEntry => ({
    id: 'fault-1',
    bib: '042',
    run: 1,
    gateNumber: 5,
    faultType: 'MG',
    timestamp: '2024-01-15T12:00:00.000Z',
    deviceId: 'device-1',
    deviceName: 'Timer 1',
    gateRange: [1, 10],
    currentVersion: 1,
    versionHistory: [],
    markedForDeletion: false,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('createAndSyncFault', () => {
    it('should add fault entry to store', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 1,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: [1, 10],
        faultEntries: [],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('042', 5, 'MG');

      expect(store.addFaultEntry).toHaveBeenCalled();
      const addedFault = vi.mocked(store.addFaultEntry).mock.calls[0][0];
      expect(addedFault.bib).toBe('042');
      expect(addedFault.gateNumber).toBe(5);
      expect(addedFault.faultType).toBe('MG');
    });

    it('should generate fault with correct fields', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 2,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: [4, 12],
        faultEntries: [],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('007', 8, 'STR');

      const addedFault = vi.mocked(store.addFaultEntry).mock.calls[0][0];
      expect(addedFault.run).toBe(2);
      expect(addedFault.deviceId).toBe('device-1');
      expect(addedFault.deviceName).toBe('Timer 1');
      expect(addedFault.gateRange).toEqual([4, 12]);
      expect(addedFault.id).toMatch(/^fault-/);
    });

    it('should trigger warning feedback', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 1,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: [1, 10],
        faultEntries: [],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('042', 5, 'MG');

      expect(feedbackWarning).toHaveBeenCalled();
    });

    it('should show success toast', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 1,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: [1, 10],
        faultEntries: [],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('042', 5, 'MG');

      expect(showToast).toHaveBeenCalledWith('faultRecorded', 'success');
    });

    it('should use null gateAssignment as fallback', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 1,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: null,
        faultEntries: [],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('042', 5, 'MG');

      const addedFault = vi.mocked(store.addFaultEntry).mock.calls[0][0];
      expect(addedFault.gateRange).toEqual([1, 1]);
    });
  });

  describe('showFaultConfirmation', () => {
    it('should show confirmation overlay', () => {
      const overlay = document.createElement('div');
      overlay.id = 'fault-confirmation-overlay';
      container.appendChild(overlay);

      const bibEl = document.createElement('span');
      bibEl.classList.add('fault-confirmation-bib');
      overlay.appendChild(bibEl);

      const gateEl = document.createElement('span');
      gateEl.classList.add('fault-confirmation-gate');
      overlay.appendChild(gateEl);

      const typeEl = document.createElement('span');
      typeEl.classList.add('fault-confirmation-type');
      overlay.appendChild(typeEl);

      const fault = createMockFault();
      showFaultConfirmation(fault);

      expect(overlay.classList.contains('show')).toBe(true);
    });

    it('should populate fault details', () => {
      const overlay = document.createElement('div');
      overlay.id = 'fault-confirmation-overlay';
      container.appendChild(overlay);

      const bibEl = document.createElement('span');
      bibEl.classList.add('fault-confirmation-bib');
      overlay.appendChild(bibEl);

      const gateEl = document.createElement('span');
      gateEl.classList.add('fault-confirmation-gate');
      overlay.appendChild(gateEl);

      const typeEl = document.createElement('span');
      typeEl.classList.add('fault-confirmation-type');
      overlay.appendChild(typeEl);

      const fault = createMockFault({ bib: '007', gateNumber: 3, faultType: 'STR' });
      showFaultConfirmation(fault);

      expect(bibEl.textContent).toBe('007');
      expect(gateEl.textContent).toContain('3');
    });

    it('should set modal context with fault ID', () => {
      const overlay = document.createElement('div');
      overlay.id = 'fault-confirmation-overlay';
      container.appendChild(overlay);

      const fault = createMockFault({ id: 'fault-xyz' });
      showFaultConfirmation(fault);

      expect(setModalContext).toHaveBeenCalledWith(overlay, { faultId: 'fault-xyz' });
    });

    it('should handle missing overlay gracefully', () => {
      const fault = createMockFault();
      expect(() => showFaultConfirmation(fault)).not.toThrow();
    });
  });

  describe('openFaultEditModal', () => {
    let modal: HTMLDivElement;

    function setupEditModalDOM() {
      modal = document.createElement('div');
      modal.id = 'fault-edit-modal';
      container.appendChild(modal);

      const bibInput = document.createElement('input');
      bibInput.id = 'fault-edit-bib-input';
      container.appendChild(bibInput);

      const gateInput = document.createElement('input');
      gateInput.id = 'fault-edit-gate-input';
      container.appendChild(gateInput);

      // Type select with options for each fault type
      const typeSelect = document.createElement('select');
      typeSelect.id = 'fault-edit-type-select';
      for (const ft of ['MG', 'STR', 'BR']) {
        const option = document.createElement('option');
        option.value = ft;
        option.textContent = ft;
        typeSelect.appendChild(option);
      }
      container.appendChild(typeSelect);

      const gateRangeSpan = document.createElement('span');
      gateRangeSpan.id = 'fault-edit-gate-range';
      container.appendChild(gateRangeSpan);

      const versionSelect = document.createElement('select');
      versionSelect.id = 'fault-version-select';
      container.appendChild(versionSelect);

      const notesTextarea = document.createElement('textarea');
      notesTextarea.id = 'fault-edit-notes';
      container.appendChild(notesTextarea);

      const notesCharCount = document.createElement('span');
      notesCharCount.id = 'fault-edit-notes-char-count';
      container.appendChild(notesCharCount);

      const runSelector = document.createElement('div');
      runSelector.id = 'fault-edit-run-selector';
      const run1Btn = document.createElement('button');
      run1Btn.classList.add('edit-run-btn');
      run1Btn.setAttribute('data-run', '1');
      const run2Btn = document.createElement('button');
      run2Btn.classList.add('edit-run-btn');
      run2Btn.setAttribute('data-run', '2');
      runSelector.appendChild(run1Btn);
      runSelector.appendChild(run2Btn);
      container.appendChild(runSelector);
    }

    it('should open modal for valid fault', () => {
      setupEditModalDOM();
      const fault = createMockFault();
      openFaultEditModal(fault);

      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should populate bib input', () => {
      setupEditModalDOM();
      const fault = createMockFault({ bib: '042' });
      openFaultEditModal(fault);

      const bibInput = document.getElementById('fault-edit-bib-input') as HTMLInputElement;
      expect(bibInput.value).toBe('042');
    });

    it('should populate gate input', () => {
      setupEditModalDOM();
      const fault = createMockFault({ gateNumber: 7 });
      openFaultEditModal(fault);

      const gateInput = document.getElementById('fault-edit-gate-input') as HTMLInputElement;
      expect(gateInput.value).toBe('7');
    });

    it('should populate type select', () => {
      setupEditModalDOM();
      const fault = createMockFault({ faultType: 'STR' });
      openFaultEditModal(fault);

      const typeSelect = document.getElementById('fault-edit-type-select') as HTMLSelectElement;
      expect(typeSelect.value).toBe('STR');
    });

    it('should populate notes textarea', () => {
      setupEditModalDOM();
      const fault = createMockFault({ notes: 'Some notes' });
      openFaultEditModal(fault);

      const notesTextarea = document.getElementById('fault-edit-notes') as HTMLTextAreaElement;
      expect(notesTextarea.value).toBe('Some notes');
    });

    it('should show gate range info', () => {
      setupEditModalDOM();
      const fault = createMockFault({ gateRange: [4, 12] });
      openFaultEditModal(fault);

      const gateRange = document.getElementById('fault-edit-gate-range');
      expect(gateRange?.textContent).toContain('4');
      expect(gateRange?.textContent).toContain('12');
    });

    it('should highlight active run button', () => {
      setupEditModalDOM();
      const fault = createMockFault({ run: 2 });
      openFaultEditModal(fault);

      const runSelector = document.getElementById('fault-edit-run-selector');
      const run2Btn = runSelector?.querySelector('[data-run="2"]');
      expect(run2Btn?.classList.contains('active')).toBe(true);
    });

    it('should populate version history dropdown', () => {
      setupEditModalDOM();
      const versionHistory: FaultVersion[] = [
        {
          version: 1,
          timestamp: '2024-01-15T11:00:00.000Z',
          editedBy: 'Timer 1',
          editedByDeviceId: 'device-1',
          changeType: 'create',
          data: createMockFault() as unknown as FaultVersion['data'],
        },
      ];

      const fault = createMockFault({
        currentVersion: 2,
        versionHistory,
      });
      openFaultEditModal(fault);

      const versionSelect = document.getElementById('fault-version-select') as HTMLSelectElement;
      // Should have current version + history version
      expect(versionSelect.options.length).toBe(2);
    });

    it('should not allow editing faults marked for deletion', () => {
      setupEditModalDOM();
      const fault = createMockFault({ markedForDeletion: true });
      openFaultEditModal(fault);

      expect(showToast).toHaveBeenCalledWith('cannotEditPendingDeletion', 'warning');
      expect(openModal).not.toHaveBeenCalled();
    });

    it('should handle missing modal gracefully', () => {
      // Don't set up DOM
      const fault = createMockFault();
      expect(() => openFaultEditModal(fault)).not.toThrow();
    });
  });

  describe('handleSaveFaultEdit', () => {
    function setupSaveDOM() {
      const modal = document.createElement('div');
      modal.id = 'fault-edit-modal';
      container.appendChild(modal);

      const bibInput = document.createElement('input');
      bibInput.id = 'fault-edit-bib-input';
      container.appendChild(bibInput);

      const gateInput = document.createElement('input');
      gateInput.id = 'fault-edit-gate-input';
      container.appendChild(gateInput);

      const typeSelect = document.createElement('select');
      typeSelect.id = 'fault-edit-type-select';
      for (const ft of ['MG', 'STR', 'BR']) {
        const option = document.createElement('option');
        option.value = ft;
        option.textContent = ft;
        typeSelect.appendChild(option);
      }
      container.appendChild(typeSelect);

      const notesTextarea = document.createElement('textarea');
      notesTextarea.id = 'fault-edit-notes';
      container.appendChild(notesTextarea);

      const runSelector = document.createElement('div');
      runSelector.id = 'fault-edit-run-selector';
      container.appendChild(runSelector);

      const versionSelect = document.createElement('select');
      versionSelect.id = 'fault-version-select';
      container.appendChild(versionSelect);

      const notesCharCount = document.createElement('span');
      notesCharCount.id = 'fault-edit-notes-char-count';
      container.appendChild(notesCharCount);

      const gateRangeSpan = document.createElement('span');
      gateRangeSpan.id = 'fault-edit-gate-range';
      container.appendChild(gateRangeSpan);

      return { bibInput, gateInput, typeSelect, notesTextarea };
    }

    it('should save changes and close modal', () => {
      const fault = createMockFault();
      const { bibInput, gateInput, typeSelect, notesTextarea } = setupSaveDOM();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      // Open modal to set editingFaultId
      openFaultEditModal(fault);
      vi.clearAllMocks();

      // Set up state for save
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);
      vi.mocked(store.updateFaultEntryWithHistory).mockReturnValue(true);

      handleSaveFaultEdit();

      expect(store.updateFaultEntryWithHistory).toHaveBeenCalled();
      expect(closeModal).toHaveBeenCalled();
    });

    it('should show warning for out-of-range gate', () => {
      const fault = createMockFault({ gateRange: [1, 5] });
      const { gateInput } = setupSaveDOM();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      // Open modal to set editingFaultId
      openFaultEditModal(fault);
      vi.clearAllMocks();

      // Now change the gate to be out of range
      gateInput.value = '15';

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);
      vi.mocked(store.updateFaultEntryWithHistory).mockReturnValue(true);

      handleSaveFaultEdit();

      expect(showToast).toHaveBeenCalledWith('gateOutOfRange', 'warning');
    });

    it('should sync updated fault after successful save', () => {
      const fault = createMockFault();
      const updatedFault = { ...fault, bib: '099' };
      setupSaveDOM();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      vi.mocked(store.updateFaultEntryWithHistory).mockReturnValue(true);
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [updatedFault],
      } as unknown as ReturnType<typeof store.getState>);

      handleSaveFaultEdit();

      expect(syncFault).toHaveBeenCalled();
      expect(feedbackSuccess).toHaveBeenCalled();
    });
  });

  describe('handleRestoreFaultVersion', () => {
    function setupRestoreDOM() {
      const modal = document.createElement('div');
      modal.id = 'fault-edit-modal';
      container.appendChild(modal);

      const bibInput = document.createElement('input');
      bibInput.id = 'fault-edit-bib-input';
      container.appendChild(bibInput);

      const gateInput = document.createElement('input');
      gateInput.id = 'fault-edit-gate-input';
      container.appendChild(gateInput);

      const typeSelect = document.createElement('select');
      typeSelect.id = 'fault-edit-type-select';
      for (const ft of ['MG', 'STR', 'BR']) {
        const option = document.createElement('option');
        option.value = ft;
        option.textContent = ft;
        typeSelect.appendChild(option);
      }
      container.appendChild(typeSelect);

      const versionSelect = document.createElement('select');
      versionSelect.id = 'fault-version-select';
      container.appendChild(versionSelect);

      const notesTextarea = document.createElement('textarea');
      notesTextarea.id = 'fault-edit-notes';
      container.appendChild(notesTextarea);

      const notesCharCount = document.createElement('span');
      notesCharCount.id = 'fault-edit-notes-char-count';
      container.appendChild(notesCharCount);

      const runSelector = document.createElement('div');
      runSelector.id = 'fault-edit-run-selector';
      container.appendChild(runSelector);

      const gateRangeSpan = document.createElement('span');
      gateRangeSpan.id = 'fault-edit-gate-range';
      container.appendChild(gateRangeSpan);

      return { versionSelect };
    }

    it('should restore selected version', () => {
      const fault = createMockFault({ currentVersion: 2 });
      const { versionSelect } = setupRestoreDOM();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      // Open modal to set editingFaultId
      openFaultEditModal(fault);

      // After openFaultEditModal, version select is populated.
      // Manually set it to version 1 (different from current version 2)
      versionSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '1';
      versionSelect.appendChild(opt);
      versionSelect.value = '1';

      handleRestoreFaultVersion();

      expect(store.restoreFaultVersion).toHaveBeenCalledWith('fault-1', 1);
    });

    it('should not restore to current version', () => {
      const fault = createMockFault({ currentVersion: 2 });
      const { versionSelect } = setupRestoreDOM();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);

      // Version select still has value matching current version
      versionSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '2';
      versionSelect.appendChild(opt);
      versionSelect.value = '2';

      handleRestoreFaultVersion();

      expect(store.restoreFaultVersion).not.toHaveBeenCalled();
    });

    it('should show toast and feedback on successful restore', () => {
      const fault = createMockFault({ currentVersion: 2 });
      const restoredFault = { ...fault, currentVersion: 1 };
      const { versionSelect } = setupRestoreDOM();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      versionSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '1';
      versionSelect.appendChild(opt);
      versionSelect.value = '1';

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);
      vi.mocked(store.restoreFaultVersion).mockReturnValue(true);

      handleRestoreFaultVersion();

      expect(showToast).toHaveBeenCalledWith('versionRestored', 'success');
      expect(feedbackSuccess).toHaveBeenCalled();
    });
  });

  describe('openMarkDeletionModal', () => {
    it('should open mark deletion modal', () => {
      const modal = document.createElement('div');
      modal.id = 'mark-deletion-modal';
      container.appendChild(modal);

      const detailsEl = document.createElement('div');
      detailsEl.id = 'mark-deletion-details';
      container.appendChild(detailsEl);

      const fault = createMockFault();
      openMarkDeletionModal(fault);

      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should populate fault details in the modal', () => {
      const modal = document.createElement('div');
      modal.id = 'mark-deletion-modal';
      container.appendChild(modal);

      const detailsEl = document.createElement('div');
      detailsEl.id = 'mark-deletion-details';
      container.appendChild(detailsEl);

      const fault = createMockFault({ bib: '007', gateNumber: 3, faultType: 'STR' });
      openMarkDeletionModal(fault);

      expect(detailsEl.innerHTML).toContain('007');
      expect(detailsEl.innerHTML).toContain('3');
    });

    it('should handle missing modal gracefully', () => {
      const fault = createMockFault();
      expect(() => openMarkDeletionModal(fault)).not.toThrow();
    });
  });

  describe('handleConfirmMarkDeletion', () => {
    it('should mark fault for deletion and close modal', () => {
      const fault = createMockFault();

      const modal = document.createElement('div');
      modal.id = 'mark-deletion-modal';
      container.appendChild(modal);

      const detailsEl = document.createElement('div');
      detailsEl.id = 'mark-deletion-details';
      container.appendChild(detailsEl);

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [{ ...fault, markedForDeletion: true }],
      } as unknown as ReturnType<typeof store.getState>);

      openMarkDeletionModal(fault);
      handleConfirmMarkDeletion();

      expect(store.markFaultForDeletion).toHaveBeenCalledWith('fault-1');
      expect(closeModal).toHaveBeenCalled();
    });

    it('should show info toast and trigger tap feedback on success', () => {
      const fault = createMockFault();
      const markedFault = { ...fault, markedForDeletion: true };

      const modal = document.createElement('div');
      modal.id = 'mark-deletion-modal';
      container.appendChild(modal);

      const detailsEl = document.createElement('div');
      detailsEl.id = 'mark-deletion-details';
      container.appendChild(detailsEl);

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [markedFault],
      } as unknown as ReturnType<typeof store.getState>);

      openMarkDeletionModal(fault);
      handleConfirmMarkDeletion();

      expect(showToast).toHaveBeenCalledWith('markedForDeletion', 'info');
      expect(feedbackTap).toHaveBeenCalled();
    });

    it('should sync the marked fault to cloud', () => {
      const fault = createMockFault();
      const markedFault = { ...fault, markedForDeletion: true };

      const modal = document.createElement('div');
      modal.id = 'mark-deletion-modal';
      container.appendChild(modal);

      const detailsEl = document.createElement('div');
      detailsEl.id = 'mark-deletion-details';
      container.appendChild(detailsEl);

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [markedFault],
      } as unknown as ReturnType<typeof store.getState>);

      openMarkDeletionModal(fault);
      handleConfirmMarkDeletion();

      expect(syncFault).toHaveBeenCalled();
    });
  });

  describe('initFaultEditModal', () => {
    it('should not throw when no elements exist', () => {
      expect(() => initFaultEditModal()).not.toThrow();
    });

    it('should set up event listeners on existing elements', () => {
      const saveFaultEditBtn = document.createElement('button');
      saveFaultEditBtn.id = 'save-fault-edit-btn';
      container.appendChild(saveFaultEditBtn);

      const restoreVersionBtn = document.createElement('button');
      restoreVersionBtn.id = 'restore-version-btn';
      container.appendChild(restoreVersionBtn);

      const faultEditBibInput = document.createElement('input');
      faultEditBibInput.id = 'fault-edit-bib-input';
      container.appendChild(faultEditBibInput);

      const confirmMarkDeletionBtn = document.createElement('button');
      confirmMarkDeletionBtn.id = 'confirm-mark-deletion-btn';
      container.appendChild(confirmMarkDeletionBtn);

      expect(() => initFaultEditModal()).not.toThrow();
    });
  });
});
