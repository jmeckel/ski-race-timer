/**
 * Unit Tests for Fault Operations Feature Module
 * Tests: createAndSyncFault, showFaultConfirmation, openFaultEditModal,
 *        handleSaveFaultEdit, handleRestoreFaultVersion,
 *        openMarkDeletionModal, handleConfirmMarkDeletion, initFaultEditModal
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  syncFault: vi.fn(() => Promise.resolve()),
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
  getLocale: vi.fn((lang: string) => {
    const map: Record<string, string> = { en: 'en-US', de: 'de-DE' };
    return map[lang] || 'en-US';
  }),
  makeNumericInput: vi.fn(),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(function () {
    const tracked: {
      el: EventTarget;
      event: string;
      handler: EventListenerOrEventListenerObject;
    }[] = [];
    return {
      add: vi.fn(
        (
          el: EventTarget,
          event: string,
          handler: EventListenerOrEventListenerObject,
        ) => {
          el.addEventListener(event, handler);
          tracked.push({ el, event, handler });
        },
      ),
      removeAll: vi.fn(() => {
        for (const { el, event, handler } of tracked) {
          el.removeEventListener(event, handler);
        }
        tracked.length = 0;
      }),
    };
  }),
}));

vi.mock('../../../src/utils/modalContext', () => ({
  setModalContext: vi.fn(),
}));

vi.mock('../../../src/features/modals', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
}));

import { showToast } from '../../../src/components';
import {
  createAndSyncFault,
  handleConfirmMarkDeletion,
  handleRestoreFaultVersion,
  handleSaveFaultEdit,
  initFaultEditModal,
  openFaultEditModal,
  openMarkDeletionModal,
  showFaultConfirmation,
} from '../../../src/features/faults/faultOperations';
import { closeModal, openModal } from '../../../src/features/modals';
import {
  feedbackSuccess,
  feedbackTap,
  feedbackWarning,
} from '../../../src/services';
import { syncFault } from '../../../src/services/sync';
import { store } from '../../../src/store';
import type { FaultEntry, FaultVersion } from '../../../src/types';
import { setModalContext } from '../../../src/utils/modalContext';

describe('Fault Operations Feature Module', () => {
  let container: HTMLDivElement;

  const createMockFault = (
    overrides: Partial<FaultEntry> = {},
  ): FaultEntry => ({
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

  function setupFullEditModalDOM() {
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

    return {
      modal,
      bibInput,
      gateInput,
      typeSelect,
      notesTextarea,
      versionSelect,
      runSelector,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  // -------------------------------------------------------------------------
  // createAndSyncFault
  // -------------------------------------------------------------------------
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

    it('should create MG fault with correct type', () => {
      const fault = createMockFault({ faultType: 'MG' });
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 1,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: [1, 10],
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('042', 5, 'MG');

      const added = vi.mocked(store.addFaultEntry).mock.calls[0]![0];
      expect(added.faultType).toBe('MG');
    });

    it('should create STR fault with correct type', () => {
      const fault = createMockFault({ id: 'fault-str', faultType: 'STR' });
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 1,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: [1, 10],
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('042', 3, 'STR');

      const added = vi.mocked(store.addFaultEntry).mock.calls[0]![0];
      expect(added.faultType).toBe('STR');
      expect(added.gateNumber).toBe(3);
    });

    it('should create BR fault with correct type', () => {
      const fault = createMockFault({ id: 'fault-br', faultType: 'BR' });
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 1,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: [1, 10],
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('042', 8, 'BR');

      const added = vi.mocked(store.addFaultEntry).mock.calls[0]![0];
      expect(added.faultType).toBe('BR');
      expect(added.gateNumber).toBe(8);
    });

    it('should sync fault to cloud when found in store after add', () => {
      // Capture the fault id from addFaultEntry to return it in second getState
      let capturedFaultId: string | null = null;
      vi.mocked(store.addFaultEntry).mockImplementation((fault: unknown) => {
        capturedFaultId = (fault as { id: string }).id;
      });

      let callCount = 0;
      vi.mocked(store.getState).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            currentLang: 'en',
            selectedRun: 1,
            deviceId: 'device-1',
            deviceName: 'Timer 1',
            gateAssignment: [1, 10],
            faultEntries: [],
          } as unknown as ReturnType<typeof store.getState>;
        }
        // Second call: return faultEntries with the captured id
        return {
          currentLang: 'en',
          selectedRun: 1,
          deviceId: 'device-1',
          deviceName: 'Timer 1',
          gateAssignment: [1, 10],
          faultEntries: [createMockFault({ id: capturedFaultId || 'fault-1' })],
        } as unknown as ReturnType<typeof store.getState>;
      });

      createAndSyncFault('042', 5, 'MG');

      expect(syncFault).toHaveBeenCalled();
    });

    it('should not sync if fault is not found in store after add', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 1,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: [1, 10],
        faultEntries: [],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('042', 5, 'MG');

      // syncFault should not be called because fault not found in store
      expect(syncFault).not.toHaveBeenCalled();
    });

    it('should create fault with gate number 0 (valid edge case)', () => {
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        selectedRun: 1,
        deviceId: 'device-1',
        deviceName: 'Timer 1',
        gateAssignment: [0, 5],
        faultEntries: [],
      } as unknown as ReturnType<typeof store.getState>);

      createAndSyncFault('001', 0, 'MG');

      const added = vi.mocked(store.addFaultEntry).mock.calls[0]![0];
      expect(added.gateNumber).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // showFaultConfirmation
  // -------------------------------------------------------------------------
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

      const fault = createMockFault({
        bib: '007',
        gateNumber: 3,
        faultType: 'STR',
      });
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

      expect(setModalContext).toHaveBeenCalledWith(overlay, {
        faultId: 'fault-xyz',
      });
    });

    it('should handle missing overlay gracefully', () => {
      const fault = createMockFault();
      expect(() => showFaultConfirmation(fault)).not.toThrow();
    });

    it('should set aria-hidden to false on overlay', () => {
      const overlay = document.createElement('div');
      overlay.id = 'fault-confirmation-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      container.appendChild(overlay);

      const fault = createMockFault();
      showFaultConfirmation(fault);

      expect(overlay.getAttribute('aria-hidden')).toBe('false');
    });

    it('should focus the done button for keyboard accessibility', () => {
      const overlay = document.createElement('div');
      overlay.id = 'fault-confirmation-overlay';
      container.appendChild(overlay);

      const doneBtn = document.createElement('button');
      doneBtn.id = 'fault-confirmation-done-btn';
      overlay.appendChild(doneBtn);

      const focusSpy = vi.spyOn(doneBtn, 'focus');
      const fault = createMockFault();
      showFaultConfirmation(fault);

      expect(focusSpy).toHaveBeenCalled();
    });

    it('should display fault type label correctly', () => {
      const overlay = document.createElement('div');
      overlay.id = 'fault-confirmation-overlay';
      container.appendChild(overlay);

      const typeEl = document.createElement('span');
      typeEl.classList.add('fault-confirmation-type');
      overlay.appendChild(typeEl);

      const fault = createMockFault({ faultType: 'BR' });
      showFaultConfirmation(fault);

      expect(typeEl.textContent).toBe('BR');
    });
  });

  // -------------------------------------------------------------------------
  // initFaultEditModal
  // -------------------------------------------------------------------------
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

    it('should set up notes textarea character counter', () => {
      const notesTextarea = document.createElement('textarea');
      notesTextarea.id = 'fault-edit-notes';
      container.appendChild(notesTextarea);

      const charCount = document.createElement('span');
      charCount.id = 'fault-edit-notes-char-count';
      container.appendChild(charCount);

      initFaultEditModal();

      // Simulate typing in the textarea
      notesTextarea.value = 'A'.repeat(460);
      notesTextarea.dispatchEvent(new Event('input'));

      expect(charCount.textContent).toBe('460/500');
      expect(charCount.classList.contains('near-limit')).toBe(true);
    });

    it('should mark near-limit when notes exceed 450 chars', () => {
      const notesTextarea = document.createElement('textarea');
      notesTextarea.id = 'fault-edit-notes';
      container.appendChild(notesTextarea);

      const charCount = document.createElement('span');
      charCount.id = 'fault-edit-notes-char-count';
      container.appendChild(charCount);

      initFaultEditModal();

      notesTextarea.value = 'A'.repeat(450);
      notesTextarea.dispatchEvent(new Event('input'));
      // 450 is NOT > 450, so near-limit should be false
      expect(charCount.classList.contains('near-limit')).toBe(false);

      notesTextarea.value = 'A'.repeat(451);
      notesTextarea.dispatchEvent(new Event('input'));
      expect(charCount.classList.contains('near-limit')).toBe(true);
    });

    it('should set up run selector click handler', () => {
      const runSelector = document.createElement('div');
      runSelector.id = 'fault-edit-run-selector';
      const run1Btn = document.createElement('button');
      run1Btn.classList.add('edit-run-btn');
      run1Btn.setAttribute('data-run', '1');
      run1Btn.classList.add('active');
      run1Btn.setAttribute('aria-checked', 'true');
      const run2Btn = document.createElement('button');
      run2Btn.classList.add('edit-run-btn');
      run2Btn.setAttribute('data-run', '2');
      run2Btn.setAttribute('aria-checked', 'false');
      runSelector.appendChild(run1Btn);
      runSelector.appendChild(run2Btn);
      container.appendChild(runSelector);

      initFaultEditModal();

      // Click run 2
      run2Btn.click();

      expect(run2Btn.classList.contains('active')).toBe(true);
      expect(run2Btn.getAttribute('aria-checked')).toBe('true');
      expect(run1Btn.classList.contains('active')).toBe(false);
      expect(run1Btn.getAttribute('aria-checked')).toBe('false');
    });

    it('should dispatch mic click event when mic button clicked', () => {
      const micBtn = document.createElement('button');
      micBtn.id = 'fault-edit-mic-btn';
      container.appendChild(micBtn);

      initFaultEditModal();

      const eventSpy = vi.fn();
      window.addEventListener('fault-edit-mic-click', eventSpy);

      micBtn.click();

      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener('fault-edit-mic-click', eventSpy);
    });
  });

  // -------------------------------------------------------------------------
  // openFaultEditModal
  // -------------------------------------------------------------------------
  describe('openFaultEditModal', () => {
    it('should open modal for valid fault', () => {
      const { modal } = setupFullEditModalDOM();
      const fault = createMockFault();
      openFaultEditModal(fault);

      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should populate bib input', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({ bib: '042' });
      openFaultEditModal(fault);

      const bibInput = document.getElementById(
        'fault-edit-bib-input',
      ) as HTMLInputElement;
      expect(bibInput.value).toBe('042');
    });

    it('should populate gate input', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({ gateNumber: 7 });
      openFaultEditModal(fault);

      const gateInput = document.getElementById(
        'fault-edit-gate-input',
      ) as HTMLInputElement;
      expect(gateInput.value).toBe('7');
    });

    it('should populate type select', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({ faultType: 'STR' });
      openFaultEditModal(fault);

      const typeSelect = document.getElementById(
        'fault-edit-type-select',
      ) as HTMLSelectElement;
      expect(typeSelect.value).toBe('STR');
    });

    it('should populate notes textarea', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({ notes: 'Some notes' });
      openFaultEditModal(fault);

      const notesTextarea = document.getElementById(
        'fault-edit-notes',
      ) as HTMLTextAreaElement;
      expect(notesTextarea.value).toBe('Some notes');
    });

    it('should show gate range info', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({ gateRange: [4, 12] });
      openFaultEditModal(fault);

      const gateRange = document.getElementById('fault-edit-gate-range');
      expect(gateRange?.textContent).toContain('4');
      expect(gateRange?.textContent).toContain('12');
    });

    it('should highlight active run button', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({ run: 2 });
      openFaultEditModal(fault);

      const runSelector = document.getElementById('fault-edit-run-selector');
      const run2Btn = runSelector?.querySelector('[data-run="2"]');
      expect(run2Btn?.classList.contains('active')).toBe(true);
    });

    it('should populate version history dropdown', () => {
      setupFullEditModalDOM();
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

      const versionSelect = document.getElementById(
        'fault-version-select',
      ) as HTMLSelectElement;
      // Should have current version + history version
      expect(versionSelect.options.length).toBe(2);
    });

    it('should not allow editing faults marked for deletion', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({ markedForDeletion: true });
      openFaultEditModal(fault);

      expect(showToast).toHaveBeenCalledWith(
        'cannotEditPendingDeletion',
        'warning',
      );
      expect(openModal).not.toHaveBeenCalled();
    });

    it('should handle missing modal gracefully', () => {
      // Don't set up DOM
      const fault = createMockFault();
      expect(() => openFaultEditModal(fault)).not.toThrow();
    });

    it('should filter out current version from history dropdown', () => {
      setupFullEditModalDOM();

      const versionHistory: FaultVersion[] = [
        {
          version: 1,
          timestamp: '2024-01-15T11:00:00.000Z',
          editedBy: 'Timer 1',
          editedByDeviceId: 'device-1',
          changeType: 'create',
          data: createMockFault() as unknown as FaultVersion['data'],
        },
        {
          version: 2,
          timestamp: '2024-01-15T12:00:00.000Z',
          editedBy: 'Timer 2',
          editedByDeviceId: 'device-2',
          changeType: 'edit',
          data: createMockFault() as unknown as FaultVersion['data'],
        },
        {
          version: 3,
          timestamp: '2024-01-15T13:00:00.000Z',
          editedBy: 'Timer 1',
          editedByDeviceId: 'device-1',
          changeType: 'restore',
          data: createMockFault() as unknown as FaultVersion['data'],
        },
      ];

      const fault = createMockFault({ currentVersion: 3, versionHistory });

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);

      const versionSelect = document.getElementById(
        'fault-version-select',
      ) as HTMLSelectElement;
      // Current version (3) + version 2 + version 1 = 3 options
      expect(versionSelect.options.length).toBe(3);
      // First option should be current version
      expect(versionSelect.options[0]!.value).toBe('3');
    });

    it('should show "restored" label for restore changeType', () => {
      setupFullEditModalDOM();

      const versionHistory: FaultVersion[] = [
        {
          version: 1,
          timestamp: '2024-01-15T11:00:00.000Z',
          editedBy: 'Timer 1',
          editedByDeviceId: 'device-1',
          changeType: 'restore',
          data: createMockFault() as unknown as FaultVersion['data'],
        },
      ];

      const fault = createMockFault({ currentVersion: 2, versionHistory });

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);

      const versionSelect = document.getElementById(
        'fault-version-select',
      ) as HTMLSelectElement;
      // v1 option should contain "restored" label
      const v1Option = Array.from(versionSelect.options).find(
        (o) => o.value === '1',
      );
      expect(v1Option?.textContent).toContain('restored');
    });

    it('should handle fault with no version history (empty array)', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({ currentVersion: 1, versionHistory: [] });

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);

      const versionSelect = document.getElementById(
        'fault-version-select',
      ) as HTMLSelectElement;
      // Only current version option
      expect(versionSelect.options.length).toBe(1);
    });

    it('should handle fault with undefined currentVersion (defaults to 1)', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({
        currentVersion: undefined as unknown as number,
        versionHistory: [],
      });

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);

      const versionSelect = document.getElementById(
        'fault-version-select',
      ) as HTMLSelectElement;
      // Should default to "v1"
      expect(versionSelect.options[0]!.textContent).toContain('v1');
    });

    it('should populate empty notes field with empty string', () => {
      setupFullEditModalDOM();
      const fault = createMockFault({ notes: undefined });

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);

      const notesTextarea = document.getElementById(
        'fault-edit-notes',
      ) as HTMLTextAreaElement;
      expect(notesTextarea.value).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // handleSaveFaultEdit
  // -------------------------------------------------------------------------
  describe('handleSaveFaultEdit', () => {
    it('should save changes and close modal', () => {
      const fault = createMockFault();
      setupFullEditModalDOM();

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
      const { gateInput } = setupFullEditModalDOM();

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
      setupFullEditModalDOM();

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

    it('should do nothing if editingFaultId is null', () => {
      // Don't open any modal first
      handleSaveFaultEdit();
      expect(store.updateFaultEntryWithHistory).not.toHaveBeenCalled();
    });

    it('should do nothing if fault not found in store', () => {
      setupFullEditModalDOM();
      const fault = createMockFault();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      // Return empty faultEntries so fault is not found
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [],
      } as unknown as ReturnType<typeof store.getState>);

      handleSaveFaultEdit();
      expect(store.updateFaultEntryWithHistory).not.toHaveBeenCalled();
    });

    it('should pad bib to 3 digits', () => {
      const { bibInput } = setupFullEditModalDOM();
      const fault = createMockFault({ bib: '042' });

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      bibInput.value = '5';
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);
      vi.mocked(store.updateFaultEntryWithHistory).mockReturnValue(true);

      handleSaveFaultEdit();

      const updateCall = vi.mocked(store.updateFaultEntryWithHistory).mock
        .calls[0]!;
      expect(updateCall[1].bib).toBe('005');
    });

    it('should truncate notes to 500 chars', () => {
      const { notesTextarea } = setupFullEditModalDOM();
      const fault = createMockFault();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      notesTextarea.value = 'A'.repeat(600);
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);
      vi.mocked(store.updateFaultEntryWithHistory).mockReturnValue(true);

      handleSaveFaultEdit();

      const updateCall = vi.mocked(store.updateFaultEntryWithHistory).mock
        .calls[0]!;
      expect(updateCall[1].notes!.length).toBe(500);
    });

    it('should include change description when fields change', () => {
      const { bibInput, gateInput, typeSelect } = setupFullEditModalDOM();
      const fault = createMockFault({
        bib: '042',
        gateNumber: 5,
        faultType: 'MG',
      });

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      bibInput.value = '099';
      gateInput.value = '7';
      typeSelect.value = 'STR';

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);
      vi.mocked(store.updateFaultEntryWithHistory).mockReturnValue(true);

      handleSaveFaultEdit();

      const updateCall = vi.mocked(store.updateFaultEntryWithHistory).mock
        .calls[0]!;
      const changeDesc = updateCall[2] as string;
      expect(changeDesc).toContain('bib:');
      expect(changeDesc).toContain('gate:');
      expect(changeDesc).toContain('type:');
    });

    it('should not include change description when no fields change', () => {
      setupFullEditModalDOM();
      const fault = createMockFault();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);
      vi.mocked(store.updateFaultEntryWithHistory).mockReturnValue(true);

      handleSaveFaultEdit();

      const updateCall = vi.mocked(store.updateFaultEntryWithHistory).mock
        .calls[0]!;
      // changeDescription should be undefined when nothing changed
      expect(updateCall[2]).toBeUndefined();
    });

    it('should not sync when updateFaultEntryWithHistory returns false', () => {
      setupFullEditModalDOM();
      const fault = createMockFault();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);
      vi.mocked(store.updateFaultEntryWithHistory).mockReturnValue(false);

      handleSaveFaultEdit();

      expect(syncFault).not.toHaveBeenCalled();
      expect(feedbackSuccess).not.toHaveBeenCalled();
    });

    it('should clear editingFaultId after save', () => {
      setupFullEditModalDOM();
      const fault = createMockFault();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);
      vi.mocked(store.updateFaultEntryWithHistory).mockReturnValue(true);

      handleSaveFaultEdit();

      // Calling save again should do nothing (editingFaultId is null)
      vi.clearAllMocks();
      handleSaveFaultEdit();
      expect(store.updateFaultEntryWithHistory).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleRestoreFaultVersion
  // -------------------------------------------------------------------------
  describe('handleRestoreFaultVersion', () => {
    it('should restore selected version', () => {
      const fault = createMockFault({ currentVersion: 2 });
      const { versionSelect } = setupFullEditModalDOM();

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      // Open modal to set editingFaultId
      openFaultEditModal(fault);

      // Manually set version select to version 1 (different from current version 2)
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
      const { versionSelect } = setupFullEditModalDOM();

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
      const { versionSelect } = setupFullEditModalDOM();

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

    it('should do nothing when editingFaultId is null', () => {
      handleRestoreFaultVersion();
      expect(store.restoreFaultVersion).not.toHaveBeenCalled();
    });

    it('should do nothing when version select value is 0', () => {
      const { versionSelect } = setupFullEditModalDOM();
      const fault = createMockFault({ currentVersion: 2 });

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openFaultEditModal(fault);
      vi.clearAllMocks();

      versionSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '0';
      versionSelect.appendChild(opt);
      versionSelect.value = '0';

      handleRestoreFaultVersion();
      expect(store.restoreFaultVersion).not.toHaveBeenCalled();
    });

    it('should not restore when restoreFaultVersion returns false', () => {
      const { versionSelect } = setupFullEditModalDOM();
      const fault = createMockFault({ currentVersion: 2 });

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
      vi.mocked(store.restoreFaultVersion).mockReturnValue(false);

      handleRestoreFaultVersion();

      expect(showToast).not.toHaveBeenCalled();
      expect(feedbackSuccess).not.toHaveBeenCalled();
      expect(closeModal).not.toHaveBeenCalled();
    });

    it('should sync restored fault to cloud on success', () => {
      const { versionSelect } = setupFullEditModalDOM();
      const fault = createMockFault({ currentVersion: 2 });
      const restoredFault = { ...fault, currentVersion: 1 };

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

      vi.mocked(store.restoreFaultVersion).mockReturnValue(true);
      vi.mocked(store.getState)
        .mockReturnValueOnce({
          currentLang: 'en',
          faultEntries: [fault],
        } as unknown as ReturnType<typeof store.getState>)
        .mockReturnValueOnce({
          currentLang: 'en',
          faultEntries: [restoredFault],
        } as unknown as ReturnType<typeof store.getState>);

      handleRestoreFaultVersion();

      expect(syncFault).toHaveBeenCalledWith(restoredFault);
    });
  });

  // -------------------------------------------------------------------------
  // openMarkDeletionModal
  // -------------------------------------------------------------------------
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

      const fault = createMockFault({
        bib: '007',
        gateNumber: 3,
        faultType: 'STR',
      });
      openMarkDeletionModal(fault);

      expect(detailsEl.innerHTML).toContain('007');
      expect(detailsEl.innerHTML).toContain('3');
    });

    it('should handle missing modal gracefully', () => {
      const fault = createMockFault();
      expect(() => openMarkDeletionModal(fault)).not.toThrow();
    });

    it('should render bib padded to 3 digits', () => {
      const modal = document.createElement('div');
      modal.id = 'mark-deletion-modal';
      container.appendChild(modal);

      const detailsEl = document.createElement('div');
      detailsEl.id = 'mark-deletion-details';
      container.appendChild(detailsEl);

      const fault = createMockFault({ bib: '7' });
      openMarkDeletionModal(fault);

      expect(detailsEl.innerHTML).toContain('007');
    });

    it('should render run 2 label for run 2 faults', () => {
      const modal = document.createElement('div');
      modal.id = 'mark-deletion-modal';
      container.appendChild(modal);

      const detailsEl = document.createElement('div');
      detailsEl.id = 'mark-deletion-details';
      container.appendChild(detailsEl);

      const fault = createMockFault({ run: 2 });
      openMarkDeletionModal(fault);

      expect(detailsEl.innerHTML).toContain('run2');
    });
  });

  // -------------------------------------------------------------------------
  // handleConfirmMarkDeletion
  // -------------------------------------------------------------------------
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

    it('should do nothing when editingFaultId is null', () => {
      // First, ensure editingFaultId is null by clearing any state from prior tests.
      // handleSaveFaultEdit with no editingFaultId is a no-op, but
      // handleConfirmMarkDeletion resets editingFaultId to null after execution.
      // We need a clean slate: open a deletion modal then confirm to clear it.
      const tempModal = document.createElement('div');
      tempModal.id = 'mark-deletion-modal';
      container.appendChild(tempModal);
      const tempDetails = document.createElement('div');
      tempDetails.id = 'mark-deletion-details';
      container.appendChild(tempDetails);

      const tempFault = createMockFault({ id: 'temp-cleanup' });
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [tempFault],
      } as unknown as ReturnType<typeof store.getState>);

      openMarkDeletionModal(tempFault);
      handleConfirmMarkDeletion(); // This sets editingFaultId to null
      vi.clearAllMocks();

      // Now the actual test: editingFaultId is null
      handleConfirmMarkDeletion();
      expect(store.markFaultForDeletion).not.toHaveBeenCalled();
    });

    it('should not show toast when markFaultForDeletion returns false', () => {
      const modal = document.createElement('div');
      modal.id = 'mark-deletion-modal';
      container.appendChild(modal);

      const detailsEl = document.createElement('div');
      detailsEl.id = 'mark-deletion-details';
      container.appendChild(detailsEl);

      const fault = createMockFault();
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [fault],
      } as unknown as ReturnType<typeof store.getState>);

      openMarkDeletionModal(fault);
      vi.clearAllMocks();

      vi.mocked(store.markFaultForDeletion).mockReturnValue(false);

      handleConfirmMarkDeletion();

      expect(showToast).not.toHaveBeenCalled();
      expect(feedbackTap).not.toHaveBeenCalled();
      expect(syncFault).not.toHaveBeenCalled();
    });

    it('should clear editingFaultId after confirm', () => {
      const modal = document.createElement('div');
      modal.id = 'mark-deletion-modal';
      container.appendChild(modal);

      const detailsEl = document.createElement('div');
      detailsEl.id = 'mark-deletion-details';
      container.appendChild(detailsEl);

      const fault = createMockFault();
      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        faultEntries: [{ ...fault, markedForDeletion: true }],
      } as unknown as ReturnType<typeof store.getState>);

      openMarkDeletionModal(fault);
      handleConfirmMarkDeletion();

      // Second call should do nothing
      vi.clearAllMocks();
      handleConfirmMarkDeletion();
      expect(store.markFaultForDeletion).not.toHaveBeenCalled();
    });
  });
});
