/**
 * Unit Tests for Fault Inline Entry Module
 * Tests: updateActiveBibsList, updateInlineFaultsList, updateInlineBibSelector,
 *        selectInlineBib, updateInlineGateSelector, selectInlineGate,
 *        initInlineFaultEntry, updateInlineSaveButtonState, saveInlineFault,
 *        openFaultDeleteConfirmation, refreshInlineFaultUI
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

vi.mock('../../../src/services/sync', () => ({
  deleteFaultFromCloud: vi.fn(),
}));

const mockGetState = vi.fn();
const mockGetActiveBibs = vi.fn(() => []);
const mockGetFaultsForBib = vi.fn(() => []);
const mockGetGateColor = vi.fn(() => 'red');

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    getActiveBibs: (...args: unknown[]) => mockGetActiveBibs(...args),
    getFaultsForBib: (...args: unknown[]) => mockGetFaultsForBib(...args),
    getGateColor: (...args: unknown[]) => mockGetGateColor(...args),
    markFaultForDeletion: vi.fn(),
  },
}));

vi.mock('../../../src/utils', () => ({
  escapeAttr: vi.fn((s: string) => s),
  escapeHtml: vi.fn((s: string) => s),
  getFaultTypeLabel: vi.fn((type: string) => type),
  iconNote: vi.fn(() => '<svg>note</svg>'),
  iconTrash: vi.fn(() => '<svg>trash</svg>'),
  makeNumericInput: vi.fn(),
}));

vi.mock('../../../src/utils/format', () => ({
  formatTime: vi.fn(() => '10:30:45'),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../../src/utils/modalContext', () => ({
  setModalContext: vi.fn(),
}));

vi.mock('../../../src/features/modals', () => ({
  openModal: vi.fn(),
}));

const mockCreateAndSyncFault = vi.fn();
vi.mock('../../../src/features/faults/faultOperations', () => ({
  createAndSyncFault: (...args: unknown[]) => mockCreateAndSyncFault(...args),
}));

import { showToast } from '../../../src/components';
import {
  initInlineFaultEntry,
  openFaultDeleteConfirmation,
  refreshInlineFaultUI,
  saveInlineFault,
  selectInlineBib,
  selectInlineGate,
  updateActiveBibsList,
  updateInlineBibSelector,
  updateInlineFaultsList,
  updateInlineGateSelector,
  updateInlineSaveButtonState,
} from '../../../src/features/faults/faultInlineEntry';

describe('Fault Inline Entry Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      selectedRun: 1,
      entries: [],
      faultEntries: [],
      gateAssignment: [1, 10],
      deviceId: 'dev_1',
      deviceName: 'Judge 1',
    });

    mockGetActiveBibs.mockReturnValue([]);
    mockGetFaultsForBib.mockReturnValue([]);
  });

  afterEach(() => {
    container.remove();
  });

  describe('updateActiveBibsList', () => {
    it('should return early when list element missing', () => {
      expect(() => updateActiveBibsList()).not.toThrow();
    });

    it('should show empty state when no active bibs', () => {
      const list = document.createElement('div');
      list.id = 'active-bibs-list';
      const emptyState = document.createElement('div');
      emptyState.id = 'no-active-bibs';
      emptyState.style.display = 'none';
      container.appendChild(list);
      container.appendChild(emptyState);

      updateActiveBibsList();

      expect(emptyState.style.display).toBe('');
    });

    it('should render active bib cards', () => {
      mockGetActiveBibs.mockReturnValue(['042', '043']);
      mockGetState.mockReturnValue({
        ...mockGetState(),
        entries: [
          {
            bib: '042',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T10:00:00.000Z',
          },
          {
            bib: '043',
            point: 'S',
            run: 1,
            timestamp: '2024-01-15T10:01:00.000Z',
          },
        ],
      });

      const list = document.createElement('div');
      list.id = 'active-bibs-list';
      const emptyState = document.createElement('div');
      emptyState.id = 'no-active-bibs';
      container.appendChild(list);
      container.appendChild(emptyState);

      updateActiveBibsList();

      const cards = list.querySelectorAll('.active-bib-card');
      expect(cards.length).toBe(2);
      expect(emptyState.style.display).toBe('none');
    });
  });

  describe('updateInlineFaultsList', () => {
    it('should return early when list container missing', () => {
      expect(() => updateInlineFaultsList()).not.toThrow();
    });

    it('should show empty state when no faults', () => {
      const listContainer = document.createElement('div');
      listContainer.id = 'gate-judge-faults-list';
      const countBadge = document.createElement('span');
      countBadge.id = 'inline-fault-count';
      const emptyState = document.createElement('div');
      emptyState.id = 'no-faults-recorded-inline';
      emptyState.style.display = 'none';
      container.appendChild(listContainer);
      container.appendChild(countBadge);
      container.appendChild(emptyState);

      updateInlineFaultsList();

      expect(countBadge.textContent).toBe('0');
      expect(emptyState.style.display).toBe('');
    });

    it('should render fault items', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            gateNumber: 5,
            faultType: 'MG',
            run: 1,
            timestamp: '2024-01-15T10:00:00.000Z',
          },
        ],
      });

      const listContainer = document.createElement('div');
      listContainer.id = 'gate-judge-faults-list';
      const countBadge = document.createElement('span');
      countBadge.id = 'inline-fault-count';
      container.appendChild(listContainer);
      container.appendChild(countBadge);

      updateInlineFaultsList();

      expect(countBadge.textContent).toBe('1');
      const items = listContainer.querySelectorAll('.gate-judge-fault-item');
      expect(items.length).toBe(1);
    });
  });

  describe('updateInlineBibSelector', () => {
    it('should not throw when input missing', () => {
      expect(() => updateInlineBibSelector()).not.toThrow();
    });
  });

  describe('selectInlineBib', () => {
    it('should update bib input value', () => {
      const bibInput = document.createElement('input');
      bibInput.id = 'inline-bib-input';
      container.appendChild(bibInput);

      selectInlineBib('042');

      expect(bibInput.value).toBe('042');
    });
  });

  describe('updateInlineGateSelector', () => {
    it('should return early when container missing', () => {
      expect(() => updateInlineGateSelector()).not.toThrow();
    });

    it('should render gate buttons', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        gateAssignment: [1, 5],
      });

      const gateContainer = document.createElement('div');
      gateContainer.id = 'inline-gate-selector';
      container.appendChild(gateContainer);

      updateInlineGateSelector();

      const buttons = gateContainer.querySelectorAll('.gate-grid-btn');
      expect(buttons.length).toBe(5);
    });

    it('should show fault count badges', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        gateAssignment: [1, 3],
        faultEntries: [
          { gateNumber: 2, run: 1, markedForDeletion: false },
          { gateNumber: 2, run: 1, markedForDeletion: false },
        ],
      });

      const gateContainer = document.createElement('div');
      gateContainer.id = 'inline-gate-selector';
      container.appendChild(gateContainer);

      updateInlineGateSelector();

      // Gate 2 should have a badge with count 2
      const gate2Btn = gateContainer.querySelector('[data-gate="2"]');
      const badge = gate2Btn?.querySelector('.gate-fault-count');
      expect(badge?.textContent).toBe('2');
    });
  });

  describe('selectInlineGate', () => {
    it('should show fault detail panel', () => {
      const panel = document.createElement('div');
      panel.id = 'fault-detail-panel';
      panel.style.display = 'none';
      const label = document.createElement('span');
      label.id = 'fault-detail-gate-label';
      container.appendChild(panel);
      container.appendChild(label);

      selectInlineGate(8);

      expect(panel.style.display).toBe('');
      expect(label.textContent).toContain('8');
    });

    it('should toggle off when selecting same gate twice', () => {
      const panel = document.createElement('div');
      panel.id = 'fault-detail-panel';
      panel.style.display = 'none';
      container.appendChild(panel);

      // Use a unique gate number to avoid interference from other tests
      selectInlineGate(7); // Select - shows panel
      expect(panel.style.display).toBe('');

      selectInlineGate(7); // Same gate again - toggle OFF
      expect(panel.style.display).toBe('none');
    });
  });

  describe('updateInlineSaveButtonState', () => {
    it('should disable button when no selection', () => {
      const saveBtn = document.createElement('button');
      saveBtn.id = 'inline-save-fault-btn';
      container.appendChild(saveBtn);

      updateInlineSaveButtonState();

      expect(saveBtn.disabled).toBe(true);
    });
  });

  describe('saveInlineFault', () => {
    it('should show warning when selection incomplete', () => {
      saveInlineFault();
      // Will warn about whichever selection is missing first
      expect(showToast).toHaveBeenCalledWith(
        expect.stringMatching(/select/),
        'warning',
      );
    });
  });

  describe('openFaultDeleteConfirmation', () => {
    it('should fallback to direct delete when modal missing', async () => {
      const fault = {
        id: 'f1',
        bib: '042',
        gateNumber: 5,
        faultType: 'MG' as const,
        run: 1 as const,
        timestamp: '2024-01-15T10:00:00.000Z',
        deviceId: 'dev_1',
        deviceName: 'Judge 1',
        gateRange: [1, 10] as [number, number],
        currentVersion: 1,
        versionHistory: [],
      };

      openFaultDeleteConfirmation(fault);

      const { store } = await import('../../../src/store');
      expect(store.markFaultForDeletion).toHaveBeenCalledWith('f1');
    });
  });

  describe('initInlineFaultEntry', () => {
    it('should not throw', () => {
      expect(() => initInlineFaultEntry()).not.toThrow();
    });
  });

  describe('refreshInlineFaultUI', () => {
    it('should not throw', () => {
      expect(() => refreshInlineFaultUI()).not.toThrow();
    });
  });
});
