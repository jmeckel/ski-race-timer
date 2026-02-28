/**
 * Unit Tests for Fault Modals Module
 * Tests: recordFault, recordFaultFromVoice, openFaultRecordingModal
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackTap: vi.fn(),
}));

const mockGetState = vi.fn();
const mockSetSelectedFaultBib = vi.fn();
const mockGetActiveBibs = vi.fn(() => []);
const mockGetGateColor = vi.fn(() => 'red');

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    setSelectedFaultBib: (...args: unknown[]) =>
      mockSetSelectedFaultBib(...args),
    getActiveBibs: (...args: unknown[]) => mockGetActiveBibs(...args),
    getGateColor: (...args: unknown[]) => mockGetGateColor(...args),
  },
}));

vi.mock('../../../src/utils', () => ({
  escapeAttr: vi.fn((s: string) => s),
  escapeHtml: vi.fn((s: string) => s),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(function () {
    return { add: vi.fn(), removeAll: vi.fn() };
  }),
}));

vi.mock('../../../src/features/modals', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

vi.mock('../../../src/features/faults/faultInlineEntry', () => ({
  updateActiveBibsList: vi.fn(),
}));

const mockCreateAndSyncFault = vi.fn();
vi.mock('../../../src/features/faults/faultOperations', () => ({
  createAndSyncFault: (...args: unknown[]) => mockCreateAndSyncFault(...args),
}));

import { showToast } from '../../../src/components';
import {
  initFaultRecordingModal,
  openFaultRecordingModal,
  recordFault,
  recordFaultFromVoice,
} from '../../../src/features/faults/faultModals';
import { closeModal, openModal } from '../../../src/features/modals';

describe('Fault Modals Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      selectedRun: 1,
      selectedFaultBib: '',
      gateAssignment: [1, 10],
      deviceId: 'dev_1',
      deviceName: 'Judge 1',
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('openFaultRecordingModal', () => {
    it('should populate bib selector with active bibs', () => {
      mockGetActiveBibs.mockReturnValue(['042', '043']);

      const bibSelector = document.createElement('div');
      bibSelector.id = 'fault-bib-selector';
      container.appendChild(bibSelector);

      const faultModal = document.createElement('div');
      faultModal.id = 'fault-modal';
      container.appendChild(faultModal);

      openFaultRecordingModal();

      expect(bibSelector.querySelectorAll('.fault-bib-btn').length).toBe(2);
      expect(openModal).toHaveBeenCalledWith(faultModal);
    });

    it('should preselect bib when provided', () => {
      mockGetActiveBibs.mockReturnValue(['042', '043']);

      const bibSelector = document.createElement('div');
      bibSelector.id = 'fault-bib-selector';
      container.appendChild(bibSelector);

      const faultModal = document.createElement('div');
      faultModal.id = 'fault-modal';
      container.appendChild(faultModal);

      openFaultRecordingModal('042');

      expect(mockSetSelectedFaultBib).toHaveBeenCalledWith('042');
    });

    it('should populate gate selector when gate assignment exists', () => {
      const gateSelector = document.createElement('div');
      gateSelector.id = 'fault-gate-selector';
      container.appendChild(gateSelector);

      const faultModal = document.createElement('div');
      faultModal.id = 'fault-modal';
      container.appendChild(faultModal);

      openFaultRecordingModal();

      expect(gateSelector.querySelectorAll('.fault-gate-btn').length).toBe(10);
    });

    it('should clear fault type selection', () => {
      const faultTypeButtons = document.createElement('div');
      faultTypeButtons.id = 'fault-type-buttons';
      const btn = document.createElement('button');
      btn.className = 'fault-type-btn selected';
      faultTypeButtons.appendChild(btn);
      container.appendChild(faultTypeButtons);

      const faultModal = document.createElement('div');
      faultModal.id = 'fault-modal';
      container.appendChild(faultModal);

      openFaultRecordingModal();

      expect(btn.classList.contains('selected')).toBe(false);
    });

    it('should handle missing elements', () => {
      expect(() => openFaultRecordingModal()).not.toThrow();
    });
  });

  describe('initFaultRecordingModal', () => {
    it('should not throw', () => {
      expect(() => initFaultRecordingModal()).not.toThrow();
    });

    it('should handle existing fault type buttons', () => {
      const faultTypeButtons = document.createElement('div');
      faultTypeButtons.id = 'fault-type-buttons';
      container.appendChild(faultTypeButtons);

      const saveFaultBtn = document.createElement('button');
      saveFaultBtn.id = 'save-fault-btn';
      container.appendChild(saveFaultBtn);

      expect(() => initFaultRecordingModal()).not.toThrow();
    });
  });

  describe('recordFault', () => {
    it('should warn when no bib selected', () => {
      recordFault('MG');

      expect(showToast).toHaveBeenCalledWith('selectBib', 'warning');
      expect(mockCreateAndSyncFault).not.toHaveBeenCalled();
    });

    it('should warn when no gate selected', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        selectedFaultBib: '042',
      });

      recordFault('MG');

      expect(showToast).toHaveBeenCalledWith('selectGate', 'warning');
      expect(mockCreateAndSyncFault).not.toHaveBeenCalled();
    });

    it('should create fault when bib and gate are selected', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        selectedFaultBib: '042',
      });

      // Add a selected gate button
      const gateSelector = document.createElement('div');
      gateSelector.id = 'fault-gate-selector';
      const gateBtn = document.createElement('button');
      gateBtn.className = 'fault-gate-btn selected';
      gateBtn.setAttribute('data-gate', '5');
      gateSelector.appendChild(gateBtn);
      container.appendChild(gateSelector);

      recordFault('MG');

      expect(mockCreateAndSyncFault).toHaveBeenCalledWith('042', 5, 'MG');
      expect(closeModal).toHaveBeenCalled();
    });

    it('should use bib from manual input when selectedFaultBib is empty', () => {
      const bibInput = document.createElement('input');
      bibInput.id = 'fault-bib-input';
      bibInput.value = '55';
      container.appendChild(bibInput);

      const gateSelector = document.createElement('div');
      gateSelector.id = 'fault-gate-selector';
      const gateBtn = document.createElement('button');
      gateBtn.className = 'fault-gate-btn selected';
      gateBtn.setAttribute('data-gate', '3');
      gateSelector.appendChild(gateBtn);
      container.appendChild(gateSelector);

      recordFault('STR');

      expect(mockCreateAndSyncFault).toHaveBeenCalledWith('055', 3, 'STR');
    });
  });

  describe('recordFaultFromVoice', () => {
    it('should create fault with padded bib', () => {
      recordFaultFromVoice('42', 5, 'MG');

      expect(mockCreateAndSyncFault).toHaveBeenCalledWith('042', 5, 'MG');
    });

    it('should warn when gate is out of range', () => {
      recordFaultFromVoice('042', 15, 'MG');

      expect(showToast).toHaveBeenCalledWith('gateOutOfRange', 'warning');
      expect(mockCreateAndSyncFault).not.toHaveBeenCalled();
    });

    it('should allow recording when no gate assignment', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        gateAssignment: null,
      });

      recordFaultFromVoice('042', 5, 'MG');

      expect(mockCreateAndSyncFault).toHaveBeenCalled();
    });

    it('should allow gate within range', () => {
      recordFaultFromVoice('042', 5, 'BR');

      expect(mockCreateAndSyncFault).toHaveBeenCalledWith('042', 5, 'BR');
    });
  });
});
