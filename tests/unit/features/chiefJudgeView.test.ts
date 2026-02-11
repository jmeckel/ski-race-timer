/**
 * Unit Tests for Chief Judge View Module
 * Tests: resolvePinVerification, updatePenaltyConfigUI,
 *        updateChiefJudgeToggleVisibility, updateChiefJudgeView,
 *        updateJudgesOverview, updateFaultSummaryPanel, updatePendingDeletionsPanel,
 *        cleanupChiefJudgeView
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackDelete: vi.fn(),
  feedbackSuccess: vi.fn(),
  feedbackTap: vi.fn(),
}));

vi.mock('../../../src/services/sync', () => ({
  deleteFaultFromCloud: vi.fn(() => Promise.resolve(true)),
  syncFault: vi.fn(() => Promise.resolve(true)),
  syncService: {
    getOtherGateAssignments: vi.fn(() => []),
  },
}));

import { computed, effect, signal } from '@preact/signals-core';

const mockGetState = vi.fn();
const mockGetPendingDeletions = vi.fn(() => []);

const mockChiefState = signal({
  settings: { sync: false },
  faultEntries: [] as unknown[],
  entries: [] as unknown[],
  penaltySeconds: 5,
  usePenaltyMode: true,
  isChiefJudgeView: false,
  isJudgeReady: false,
  deviceRole: 'timer' as string,
  gateAssignment: null as [number, number] | null,
});

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    getPendingDeletions: (...args: unknown[]) =>
      mockGetPendingDeletions(...args),
    toggleChiefJudgeView: vi.fn(),
    setUsePenaltyMode: vi.fn(),
    setPenaltySeconds: vi.fn(),
    markFaultForDeletion: vi.fn(),
    removeFaultEntry: vi.fn(),
    approveFaultDeletion: vi.fn(),
    rejectFaultDeletion: vi.fn(() => true),
    isRacerFinalized: vi.fn(() => false),
    finalizeRacer: vi.fn(),
  },
  $settings: computed(() => mockChiefState.value.settings),
  $faultEntries: computed(() => mockChiefState.value.faultEntries),
  $entries: computed(() => mockChiefState.value.entries),
  $penaltySeconds: computed(() => mockChiefState.value.penaltySeconds),
  $usePenaltyMode: computed(() => mockChiefState.value.usePenaltyMode),
  $isChiefJudgeView: computed(() => mockChiefState.value.isChiefJudgeView),
  $isJudgeReady: computed(() => mockChiefState.value.isJudgeReady),
  $deviceRole: computed(() => mockChiefState.value.deviceRole),
  $gateAssignment: computed(() => mockChiefState.value.gateAssignment),
  effect,
}));

vi.mock('../../../src/utils', () => ({
  escapeAttr: vi.fn((s: string) => s),
  escapeHtml: vi.fn((s: string) => s),
  getFaultTypeLabel: vi.fn((type: string) => type),
  iconCheck: vi.fn(() => '<svg>check</svg>'),
  iconEdit: vi.fn(() => '<svg>edit</svg>'),
  iconNote: vi.fn(() => '<svg>note</svg>'),
  iconTrash: vi.fn(() => '<svg>trash</svg>'),
  iconTrashDetailed: vi.fn(() => '<svg>trash-det</svg>'),
  iconWarningCircle: vi.fn(() => '<svg>warn</svg>'),
  iconX: vi.fn(() => '<svg>x</svg>'),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../../src/features/export', () => ({
  exportChiefSummary: vi.fn(),
  exportFaultSummaryWhatsApp: vi.fn(),
  exportResults: vi.fn(),
}));

import {
  cleanupChiefJudgeView,
  initChiefJudgeToggle,
  resolvePinVerification,
  updateChiefJudgeToggleVisibility,
  updateChiefJudgeView,
  updateFaultSummaryPanel,
  updateJudgesOverview,
  updatePenaltyConfigUI,
  updatePendingDeletionsPanel,
} from '../../../src/features/chiefJudgeView';
import { syncService } from '../../../src/services/sync';

describe('Chief Judge View Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      deviceRole: 'timer',
      isChiefJudgeView: false,
      entries: [],
      faultEntries: [],
      penaltySeconds: 3,
      usePenaltyMode: true,
      settings: { sync: true },
      selectedRun: 1,
      raceId: 'RACE-2024',
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('resolvePinVerification', () => {
    it('should not throw when called without pending verification', () => {
      expect(() => resolvePinVerification(true)).not.toThrow();
    });
  });

  describe('updatePenaltyConfigUI', () => {
    it('should update penalty seconds display', () => {
      const secondsValue = document.createElement('span');
      secondsValue.id = 'penalty-seconds-value';
      container.appendChild(secondsValue);

      updatePenaltyConfigUI();

      expect(secondsValue.textContent).toBe('3');
    });

    it('should toggle dsq-mode class on config row', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        usePenaltyMode: false,
      });

      const configRow = document.createElement('div');
      configRow.id = 'penalty-config-row';
      container.appendChild(configRow);

      updatePenaltyConfigUI();

      expect(configRow.classList.contains('dsq-mode')).toBe(true);
    });

    it('should set active mode button', () => {
      const modeToggle = document.createElement('div');
      modeToggle.id = 'penalty-mode-toggle';
      const penaltyBtn = document.createElement('button');
      penaltyBtn.className = 'penalty-mode-btn';
      penaltyBtn.setAttribute('data-mode', 'penalty');
      const dsqBtn = document.createElement('button');
      dsqBtn.className = 'penalty-mode-btn';
      dsqBtn.setAttribute('data-mode', 'dsq');
      modeToggle.appendChild(penaltyBtn);
      modeToggle.appendChild(dsqBtn);
      container.appendChild(modeToggle);

      updatePenaltyConfigUI();

      expect(penaltyBtn.classList.contains('active')).toBe(true);
      expect(dsqBtn.classList.contains('active')).toBe(false);
    });
  });

  describe('updateChiefJudgeToggleVisibility', () => {
    it('should show toggle when sync enabled', () => {
      const toggleRow = document.createElement('div');
      toggleRow.id = 'chief-judge-toggle-row';
      toggleRow.style.display = 'none';
      container.appendChild(toggleRow);

      updateChiefJudgeToggleVisibility();

      expect(toggleRow.style.display).toBe('block');
    });

    it('should hide toggle when sync disabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { sync: false },
      });

      const toggleRow = document.createElement('div');
      toggleRow.id = 'chief-judge-toggle-row';
      container.appendChild(toggleRow);

      updateChiefJudgeToggleVisibility();

      expect(toggleRow.style.display).toBe('none');
    });

    it('should handle missing element', () => {
      expect(() => updateChiefJudgeToggleVisibility()).not.toThrow();
    });
  });

  describe('updateChiefJudgeView', () => {
    it('should toggle active class on toggle button when chief judge view', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        isChiefJudgeView: true,
      });

      // updateChiefJudgeView needs a .results-view and #chief-judge-toggle-btn
      const resultsView = document.createElement('div');
      resultsView.className = 'results-view';
      container.appendChild(resultsView);

      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'chief-judge-toggle-btn';
      container.appendChild(toggleBtn);

      // Also need summary/deletions/overview containers
      const summaryContent = document.createElement('div');
      summaryContent.id = 'fault-summary-content';
      container.appendChild(summaryContent);
      const deletionsContent = document.createElement('div');
      deletionsContent.id = 'pending-deletions-content';
      container.appendChild(deletionsContent);

      updateChiefJudgeView();

      expect(toggleBtn.classList.contains('active')).toBe(true);
      expect(resultsView.classList.contains('chief-mode')).toBe(true);
    });

    it('should remove active class when not chief judge view', () => {
      const resultsView = document.createElement('div');
      resultsView.className = 'results-view chief-mode';
      container.appendChild(resultsView);

      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'chief-judge-toggle-btn';
      toggleBtn.classList.add('active');
      container.appendChild(toggleBtn);

      updateChiefJudgeView();

      expect(toggleBtn.classList.contains('active')).toBe(false);
      expect(resultsView.classList.contains('chief-mode')).toBe(false);
    });

    it('should handle missing elements', () => {
      expect(() => updateChiefJudgeView()).not.toThrow();
    });
  });

  describe('initChiefJudgeToggle', () => {
    it('should not throw when toggle button missing', () => {
      expect(() => initChiefJudgeToggle()).not.toThrow();
    });

    it('should initialize when toggle button exists', () => {
      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'chief-judge-toggle-btn';
      container.appendChild(toggleBtn);

      const toggleRow = document.createElement('div');
      toggleRow.id = 'chief-judge-toggle-row';
      container.appendChild(toggleRow);

      expect(() => initChiefJudgeToggle()).not.toThrow();
    });
  });

  describe('updateJudgesOverview', () => {
    it('should handle missing overview elements', () => {
      expect(() => updateJudgesOverview()).not.toThrow();
    });

    it('should show empty state when no judges', () => {
      const overviewList = document.createElement('div');
      overviewList.id = 'judges-overview-list';
      const overviewCount = document.createElement('span');
      overviewCount.id = 'judges-overview-count';
      const emptyState = document.createElement('div');
      emptyState.id = 'judges-overview-empty';
      container.appendChild(overviewList);
      container.appendChild(overviewCount);
      container.appendChild(emptyState);

      updateJudgesOverview();

      expect(overviewCount.textContent).toBe('0');
      expect(emptyState.style.display).toBe('block');
    });

    it('should render judge cards from sync service', () => {
      vi.mocked(syncService.getOtherGateAssignments).mockReturnValue([
        {
          deviceId: 'dev_2',
          deviceName: 'Judge 2',
          gateStart: 11,
          gateEnd: 20,
          lastSeen: Date.now(),
          isReady: true,
        },
      ] as any);

      const overviewList = document.createElement('div');
      overviewList.id = 'judges-overview-list';
      const overviewCount = document.createElement('span');
      overviewCount.id = 'judges-overview-count';
      const emptyState = document.createElement('div');
      emptyState.id = 'judges-overview-empty';
      // emptyState must be inside overviewList for insertAdjacentHTML
      overviewList.appendChild(emptyState);
      container.appendChild(overviewList);
      container.appendChild(overviewCount);

      updateJudgesOverview();

      expect(overviewCount.textContent).toBe('1');
      expect(emptyState.style.display).toBe('none');
      const cards = overviewList.querySelectorAll('.judge-card');
      expect(cards.length).toBe(1);
    });

    it('should include own device when role is gateJudge', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'gateJudge',
        gateAssignment: [1, 10],
        deviceId: 'dev_1',
        deviceName: 'Judge 1',
        isJudgeReady: true,
      });

      vi.mocked(syncService.getOtherGateAssignments).mockReturnValue([]);

      const overviewList = document.createElement('div');
      overviewList.id = 'judges-overview-list';
      const overviewCount = document.createElement('span');
      overviewCount.id = 'judges-overview-count';
      const emptyState = document.createElement('div');
      emptyState.id = 'judges-overview-empty';
      overviewList.appendChild(emptyState);
      container.appendChild(overviewList);
      container.appendChild(overviewCount);

      updateJudgesOverview();

      expect(overviewCount.textContent).toBe('1');
      const cards = overviewList.querySelectorAll('.judge-card');
      expect(cards.length).toBe(1);
    });
  });

  describe('updateFaultSummaryPanel', () => {
    it('should return early when summary elements missing', () => {
      expect(() => updateFaultSummaryPanel()).not.toThrow();
    });

    it('should set count to 0 when no faults', () => {
      const summaryList = document.createElement('div');
      summaryList.id = 'fault-summary-list';
      const summaryCount = document.createElement('span');
      summaryCount.id = 'fault-summary-count';
      const emptyState = document.createElement('div');
      emptyState.id = 'chief-empty-state';
      emptyState.style.display = 'none';
      container.appendChild(summaryList);
      container.appendChild(summaryCount);
      container.appendChild(emptyState);

      updateFaultSummaryPanel();

      expect(summaryCount.textContent).toBe('0');
      expect(emptyState.style.display).toBe('flex');
    });

    it('should render fault summary cards when faults exist', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 5,
            faultType: 'MG',
            timestamp: '2024-01-15T10:00:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            markedForDeletion: false,
          },
          {
            id: 'f2',
            bib: '042',
            run: 1,
            gateNumber: 8,
            faultType: 'STR',
            timestamp: '2024-01-15T10:01:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            markedForDeletion: false,
          },
        ],
      });

      // isRacerFinalized is already in the store mock (returns false)

      const summaryList = document.createElement('div');
      summaryList.id = 'fault-summary-list';
      const summaryCount = document.createElement('span');
      summaryCount.id = 'fault-summary-count';
      const emptyState = document.createElement('div');
      emptyState.id = 'chief-empty-state';
      // emptyState must be inside summaryList for insertAdjacentHTML
      summaryList.appendChild(emptyState);
      container.appendChild(summaryList);
      container.appendChild(summaryCount);

      updateFaultSummaryPanel();

      expect(summaryCount.textContent).toBe('1'); // 1 unique bib-run combo
      expect(emptyState.style.display).toBe('none');
      const cards = summaryList.querySelectorAll('.fault-summary-card');
      expect(cards.length).toBe(1);
    });

    it('should show penalty seconds in penalty mode', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        usePenaltyMode: true,
        penaltySeconds: 5,
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 5,
            faultType: 'MG',
            timestamp: '2024-01-15T10:00:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            markedForDeletion: false,
          },
        ],
      });

      // isRacerFinalized is already in the store mock (returns false)

      const summaryList = document.createElement('div');
      summaryList.id = 'fault-summary-list';
      const summaryCount = document.createElement('span');
      summaryCount.id = 'fault-summary-count';
      container.appendChild(summaryList);
      container.appendChild(summaryCount);

      updateFaultSummaryPanel();

      expect(summaryList.innerHTML).toContain('+5s');
      expect(summaryList.innerHTML).toContain('flt');
    });

    it('should show DSQ in non-penalty mode', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        usePenaltyMode: false,
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 5,
            faultType: 'MG',
            timestamp: '2024-01-15T10:00:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            markedForDeletion: false,
          },
        ],
      });

      // isRacerFinalized is already in the store mock (returns false)

      const summaryList = document.createElement('div');
      summaryList.id = 'fault-summary-list';
      const summaryCount = document.createElement('span');
      summaryCount.id = 'fault-summary-count';
      container.appendChild(summaryList);
      container.appendChild(summaryCount);

      updateFaultSummaryPanel();

      expect(summaryList.innerHTML).toContain('dsq');
    });

    it('should show finalized badge for finalized racers', async () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        faultEntries: [
          {
            id: 'f1',
            bib: '042',
            run: 1,
            gateNumber: 5,
            faultType: 'MG',
            timestamp: '2024-01-15T10:00:00.000Z',
            deviceId: 'dev_1',
            deviceName: 'Judge 1',
            markedForDeletion: false,
          },
        ],
      });

      const { store } = await import('../../../src/store');
      vi.mocked(store.isRacerFinalized).mockReturnValue(true);

      const summaryList = document.createElement('div');
      summaryList.id = 'fault-summary-list';
      const summaryCount = document.createElement('span');
      summaryCount.id = 'fault-summary-count';
      container.appendChild(summaryList);
      container.appendChild(summaryCount);

      updateFaultSummaryPanel();

      expect(summaryList.innerHTML).toContain('finalized');
    });
  });

  describe('updatePendingDeletionsPanel', () => {
    it('should show nothing when no pending deletions', () => {
      const section = document.createElement('div');
      section.id = 'pending-deletions-section';
      const list = document.createElement('div');
      list.id = 'pending-deletions-list';
      const countEl = document.createElement('span');
      countEl.id = 'pending-deletions-count';
      container.appendChild(section);
      container.appendChild(list);
      container.appendChild(countEl);

      updatePendingDeletionsPanel();

      expect(countEl.textContent).toBe('0');
      expect(section.style.display).toBe('none');
    });

    it('should show pending deletions', () => {
      const pendingFault = {
        id: 'f1',
        bib: '042',
        run: 1,
        gateNumber: 5,
        faultType: 'MG',
        timestamp: '2024-01-15T10:00:00.000Z',
        deviceId: 'dev_1',
        deviceName: 'Judge 1',
        gateRange: [1, 10],
        currentVersion: 1,
        versionHistory: [],
        markedForDeletion: true,
        markedForDeletionAt: '2024-01-15T10:05:00.000Z',
      };

      mockGetPendingDeletions.mockReturnValue([pendingFault]);

      const section = document.createElement('div');
      section.id = 'pending-deletions-section';
      const list = document.createElement('div');
      list.id = 'pending-deletions-list';
      const countEl = document.createElement('span');
      countEl.id = 'pending-deletions-count';
      container.appendChild(section);
      container.appendChild(list);
      container.appendChild(countEl);

      updatePendingDeletionsPanel();

      expect(countEl.textContent).toBe('1');
      expect(section.style.display).toBe('block');
      expect(list.innerHTML).toContain('042');
    });

    it('should return early when elements are missing', () => {
      expect(() => updatePendingDeletionsPanel()).not.toThrow();
    });
  });

  describe('cleanupChiefJudgeView', () => {
    it('should not throw', () => {
      expect(() => cleanupChiefJudgeView()).not.toThrow();
    });
  });
});
