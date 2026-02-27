/**
 * Unit Tests for Gate Judge View Module
 * Tests: updateGateJudgeTabVisibility, updateGateRangeDisplay,
 *        updateReadyButtonState, updateJudgesReadyIndicator,
 *        updateJudgeReadyStatus, updateGateJudgeRunSelection,
 *        handleGateJudgeVoiceIntent, cleanupGateJudgeView,
 *        initGateJudgeView, openGateAssignmentModal, initGateAssignmentModal,
 *        updateOtherJudgesCoverage
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackSuccess: vi.fn(),
  feedbackTap: vi.fn(),
  syncService: {
    getOtherGateAssignments: vi.fn(() => []),
  },
}));

const mockGetState = vi.fn();
const mockSetSelectedRun = vi.fn();
const mockSetJudgeReady = vi.fn();
const mockSetGateAssignment = vi.fn();
const mockSetFirstGateColor = vi.fn();

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    setSelectedRun: (...args: unknown[]) => mockSetSelectedRun(...args),
    setJudgeReady: (...args: unknown[]) => mockSetJudgeReady(...args),
    setGateAssignment: (...args: unknown[]) => mockSetGateAssignment(...args),
    setFirstGateColor: (...args: unknown[]) => mockSetFirstGateColor(...args),
  },
}));

vi.mock('../../../src/utils', () => ({
  escapeAttr: vi.fn((s: string) => s),
  escapeHtml: vi.fn((s: string) => s),
  getElement: vi.fn((id: string) => document.getElementById(id)),
  iconCheck: vi.fn(() => '<svg></svg>'),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => {
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

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/features/faults', () => ({
  initInlineFaultEntry: vi.fn(),
  refreshInlineFaultUI: vi.fn(),
  updateActiveBibsList: vi.fn(),
}));

vi.mock('../../../src/features/faults/faultModals', () => ({
  initFaultRecordingModal: vi.fn(),
  recordFaultFromVoice: vi.fn(),
}));

vi.mock('../../../src/features/modals', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

vi.mock('../../../src/features/voiceNoteUI', () => ({
  initVoiceNoteUI: vi.fn(),
}));

import { showToast } from '../../../src/components';
import {
  initInlineFaultEntry,
  refreshInlineFaultUI,
  updateActiveBibsList,
} from '../../../src/features/faults';
import {
  initFaultRecordingModal,
  recordFaultFromVoice,
} from '../../../src/features/faults/faultModals';
import {
  cleanupGateJudgeView,
  handleGateJudgeVoiceIntent,
  initGateAssignmentModal,
  initGateJudgeView,
  openGateAssignmentModal,
  updateGateJudgeRunSelection,
  updateGateJudgeTabVisibility,
  updateGateRangeDisplay,
  updateJudgeReadyStatus,
  updateJudgesReadyIndicator,
  updateOtherJudgesCoverage,
  updateReadyButtonState,
} from '../../../src/features/gateJudgeView';
import { closeModal, openModal } from '../../../src/features/modals';
import { initVoiceNoteUI } from '../../../src/features/voiceNoteUI';
import {
  feedbackSuccess,
  feedbackTap,
  syncService,
} from '../../../src/services';

describe('Gate Judge View Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentView: 'gateJudge',
      currentLang: 'en',
      deviceRole: 'gateJudge',
      selectedRun: 1,
      gateAssignment: [1, 10],
      firstGateColor: 'red',
      isJudgeReady: false,
      settings: { sync: true, gps: true },
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('updateGateJudgeTabVisibility', () => {
    it('should hide timer tab and show gate judge tab in gateJudge role', () => {
      const timerTab = document.createElement('div');
      timerTab.id = 'timer-tab';
      container.appendChild(timerTab);

      const gateJudgeTab = document.createElement('div');
      gateJudgeTab.id = 'gate-judge-tab';
      gateJudgeTab.style.display = 'none';
      container.appendChild(gateJudgeTab);

      updateGateJudgeTabVisibility();

      expect(timerTab.style.display).toBe('none');
      expect(gateJudgeTab.style.display).toBe('');
    });

    it('should show timer tab and hide gate judge tab in timer role', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'timer',
      });

      const timerTab = document.createElement('div');
      timerTab.id = 'timer-tab';
      timerTab.style.display = 'none';
      container.appendChild(timerTab);

      const gateJudgeTab = document.createElement('div');
      gateJudgeTab.id = 'gate-judge-tab';
      container.appendChild(gateJudgeTab);

      updateGateJudgeTabVisibility();

      expect(timerTab.style.display).toBe('');
      expect(gateJudgeTab.style.display).toBe('none');
    });

    it('should toggle gate-judge-mode class on tab bar', () => {
      const tabBar = document.createElement('div');
      tabBar.className = 'tab-bar';
      container.appendChild(tabBar);

      updateGateJudgeTabVisibility();

      expect(tabBar.classList.contains('gate-judge-mode')).toBe(true);
    });
  });

  describe('updateGateRangeDisplay', () => {
    it('should show gate range', () => {
      const display = document.createElement('span');
      display.id = 'gate-range-display';
      container.appendChild(display);

      updateGateRangeDisplay();

      expect(display.textContent).toContain('1');
      expect(display.textContent).toContain('10');
    });

    it('should show dashes when no gate assignment', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        gateAssignment: null,
      });

      const display = document.createElement('span');
      display.id = 'gate-range-display';
      container.appendChild(display);

      updateGateRangeDisplay();

      expect(display.textContent).toBe('--');
    });

    it('should handle missing display element', () => {
      expect(() => updateGateRangeDisplay()).not.toThrow();
    });
  });

  describe('updateReadyButtonState', () => {
    it('should add ready class when judge is ready', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        isJudgeReady: true,
      });

      const btn = document.createElement('button');
      btn.id = 'ready-toggle-btn';
      container.appendChild(btn);

      updateReadyButtonState();

      expect(btn.classList.contains('ready')).toBe(true);
      expect(btn.getAttribute('aria-pressed')).toBe('true');
    });

    it('should remove ready class when judge is not ready', () => {
      const btn = document.createElement('button');
      btn.id = 'ready-toggle-btn';
      btn.classList.add('ready');
      container.appendChild(btn);

      updateReadyButtonState();

      expect(btn.classList.contains('ready')).toBe(false);
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('updateJudgesReadyIndicator', () => {
    let indicator: HTMLDivElement;
    let countEl: HTMLSpanElement;

    beforeEach(() => {
      indicator = document.createElement('div');
      indicator.id = 'judges-ready-indicator';
      countEl = document.createElement('span');
      countEl.id = 'judges-ready-count';
      container.appendChild(indicator);
      container.appendChild(countEl);
    });

    it('should hide when sync disabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { sync: false },
      });

      updateJudgesReadyIndicator();

      expect(indicator.style.display).toBe('none');
    });

    it('should hide when no judges exist', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'timer',
        gateAssignment: null,
      });

      updateJudgesReadyIndicator([]);

      expect(indicator.style.display).toBe('none');
    });

    it('should show count including this device when gate judge', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'gateJudge',
        gateAssignment: [1, 10],
        isJudgeReady: true,
      });

      updateJudgesReadyIndicator([
        {
          deviceId: 'dev_2',
          deviceName: 'Judge 2',
          gateStart: 11,
          gateEnd: 20,
          isReady: true,
          lastSeen: Date.now(),
        },
      ]);

      expect(countEl.textContent).toBe('2/2');
      expect(indicator.classList.contains('all-ready')).toBe(true);
    });

    it('should show partial ready count', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'gateJudge',
        gateAssignment: [1, 10],
        isJudgeReady: false,
      });

      updateJudgesReadyIndicator([
        {
          deviceId: 'dev_2',
          deviceName: 'Judge 2',
          gateStart: 11,
          gateEnd: 20,
          isReady: true,
          lastSeen: Date.now(),
        },
      ]);

      expect(countEl.textContent).toBe('1/2');
      expect(indicator.classList.contains('all-ready')).toBe(false);
    });
  });

  describe('updateJudgeReadyStatus', () => {
    it('should hide indicator in timer mode', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'timer',
      });

      const indicator = document.createElement('div');
      indicator.id = 'judge-ready-indicator';
      container.appendChild(indicator);

      updateJudgeReadyStatus();

      expect(indicator.style.display).toBe('none');
    });

    it('should show indicator in gate judge mode', () => {
      const indicator = document.createElement('div');
      indicator.id = 'judge-ready-indicator';
      container.appendChild(indicator);

      updateJudgeReadyStatus();

      expect(indicator.style.display).toBe('flex');
    });

    it('should add none-ready class when no judges ready', () => {
      const indicator = document.createElement('div');
      indicator.id = 'judge-ready-indicator';
      container.appendChild(indicator);

      updateJudgeReadyStatus();

      expect(indicator.classList.contains('none-ready')).toBe(true);
    });

    it('should add all-ready class when all judges ready', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        isJudgeReady: true,
      });

      const indicator = document.createElement('div');
      indicator.id = 'judge-ready-indicator';
      container.appendChild(indicator);

      updateJudgeReadyStatus();

      expect(indicator.classList.contains('all-ready')).toBe(true);
    });
  });

  describe('updateGateJudgeRunSelection', () => {
    it('should set active class on selected run', () => {
      const selector = document.createElement('div');
      selector.id = 'gate-judge-run-selector';
      const btn1 = document.createElement('button');
      btn1.className = 'run-btn';
      btn1.setAttribute('data-run', '1');
      const btn2 = document.createElement('button');
      btn2.className = 'run-btn';
      btn2.setAttribute('data-run', '2');
      selector.appendChild(btn1);
      selector.appendChild(btn2);
      container.appendChild(selector);

      updateGateJudgeRunSelection();

      expect(btn1.classList.contains('active')).toBe(true);
      expect(btn2.classList.contains('active')).toBe(false);
    });
  });

  describe('handleGateJudgeVoiceIntent', () => {
    it('should record fault on record_fault intent', async () => {
      handleGateJudgeVoiceIntent({
        action: 'record_fault',
        params: { bib: '042', gate: 5, faultType: 'MG' },
      });

      // recordFaultFromVoice is called via dynamic import (.then), so await microtasks
      await vi.waitFor(() => {
        expect(recordFaultFromVoice).toHaveBeenCalledWith('042', 5, 'MG');
      });
    });

    it('should toggle ready on toggle_ready intent', () => {
      handleGateJudgeVoiceIntent({ action: 'toggle_ready' });

      expect(mockSetJudgeReady).toHaveBeenCalledWith(true);
      expect(feedbackSuccess).toHaveBeenCalled();
    });

    it('should set run on set_run intent', () => {
      handleGateJudgeVoiceIntent({
        action: 'set_run',
        params: { run: 2 },
      });

      expect(mockSetSelectedRun).toHaveBeenCalledWith(2);
      expect(updateActiveBibsList).toHaveBeenCalled();
    });

    it('should handle unknown intents', () => {
      expect(() =>
        handleGateJudgeVoiceIntent({ action: 'unknown' as any }),
      ).not.toThrow();
    });
  });

  describe('cleanupGateJudgeView', () => {
    it('should not throw', () => {
      expect(() => cleanupGateJudgeView()).not.toThrow();
    });
  });

  // ========================
  // Additional Coverage Tests
  // ========================

  describe('initGateJudgeView', () => {
    it('should call updateGateJudgeTabVisibility and dispatch update-role-toggle', () => {
      // Set up required DOM elements
      const timerTab = document.createElement('div');
      timerTab.id = 'timer-tab';
      container.appendChild(timerTab);
      const gateJudgeTab = document.createElement('div');
      gateJudgeTab.id = 'gate-judge-tab';
      container.appendChild(gateJudgeTab);
      const display = document.createElement('span');
      display.id = 'gate-range-display';
      container.appendChild(display);

      const eventSpy = vi.fn();
      window.addEventListener('update-role-toggle', eventSpy);

      initGateJudgeView();

      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener('update-role-toggle', eventSpy);
    });

    it('should initialize all sub-modules', async () => {
      initGateJudgeView();

      // initFaultRecordingModal is called via dynamic import (.then), so await microtasks
      await vi.waitFor(() => {
        expect(initFaultRecordingModal).toHaveBeenCalled();
      });
      expect(initInlineFaultEntry).toHaveBeenCalled();
      expect(refreshInlineFaultUI).toHaveBeenCalled();
      expect(initVoiceNoteUI).toHaveBeenCalled();
    });

    it('should update gate range display on init', () => {
      const display = document.createElement('span');
      display.id = 'gate-range-display';
      container.appendChild(display);

      initGateJudgeView();

      expect(display.textContent).toContain('1');
      expect(display.textContent).toContain('10');
    });

    it('should set initial ready button state if button exists', () => {
      const btn = document.createElement('button');
      btn.id = 'ready-toggle-btn';
      container.appendChild(btn);

      initGateJudgeView();

      // isJudgeReady is false by default, so no ready class
      expect(btn.classList.contains('ready')).toBe(false);
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('openGateAssignmentModal', () => {
    it('should populate inputs with current gate assignment', () => {
      const startInput = document.createElement('input');
      startInput.id = 'gate-start-input';
      container.appendChild(startInput);
      const endInput = document.createElement('input');
      endInput.id = 'gate-end-input';
      container.appendChild(endInput);

      openGateAssignmentModal();

      expect(startInput.value).toBe('1');
      expect(endInput.value).toBe('10');
      expect(openModal).toHaveBeenCalled();
    });

    it('should use defaults when no gate assignment exists', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        gateAssignment: null,
      });

      const startInput = document.createElement('input');
      startInput.id = 'gate-start-input';
      container.appendChild(startInput);
      const endInput = document.createElement('input');
      endInput.id = 'gate-end-input';
      container.appendChild(endInput);

      openGateAssignmentModal();

      expect(startInput.value).toBe('1');
      expect(endInput.value).toBe('10');
    });

    it('should set active state on current gate color button', () => {
      const colorSelector = document.createElement('div');
      colorSelector.id = 'gate-color-selector';
      const redBtn = document.createElement('button');
      redBtn.className = 'gate-color-btn';
      redBtn.setAttribute('data-color', 'red');
      const blueBtn = document.createElement('button');
      blueBtn.className = 'gate-color-btn';
      blueBtn.setAttribute('data-color', 'blue');
      colorSelector.appendChild(redBtn);
      colorSelector.appendChild(blueBtn);
      container.appendChild(colorSelector);

      openGateAssignmentModal();

      expect(redBtn.classList.contains('active')).toBe(true);
      expect(redBtn.getAttribute('aria-checked')).toBe('true');
      expect(blueBtn.classList.contains('active')).toBe(false);
      expect(blueBtn.getAttribute('aria-checked')).toBe('false');
    });

    it('should highlight blue when firstGateColor is blue', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        firstGateColor: 'blue',
      });

      const colorSelector = document.createElement('div');
      colorSelector.id = 'gate-color-selector';
      const redBtn = document.createElement('button');
      redBtn.className = 'gate-color-btn';
      redBtn.setAttribute('data-color', 'red');
      const blueBtn = document.createElement('button');
      blueBtn.className = 'gate-color-btn';
      blueBtn.setAttribute('data-color', 'blue');
      colorSelector.appendChild(redBtn);
      colorSelector.appendChild(blueBtn);
      container.appendChild(colorSelector);

      openGateAssignmentModal();

      expect(blueBtn.classList.contains('active')).toBe(true);
      expect(redBtn.classList.contains('active')).toBe(false);
    });
  });

  describe('initGateAssignmentModal - save handler', () => {
    it('should not throw when save button is missing', () => {
      expect(() => initGateAssignmentModal()).not.toThrow();
    });
  });

  describe('updateGateRangeDisplay - color indicator', () => {
    it('should update color indicator text for red', () => {
      const display = document.createElement('span');
      display.id = 'gate-range-display';
      const colorIndicator = document.createElement('div');
      colorIndicator.id = 'gate-color-indicator';
      const colorText = document.createElement('span');
      colorText.id = 'gate-color-text';
      container.appendChild(display);
      container.appendChild(colorIndicator);
      container.appendChild(colorText);

      updateGateRangeDisplay();

      expect(colorIndicator.classList.contains('red')).toBe(true);
      expect(colorIndicator.classList.contains('blue')).toBe(false);
    });

    it('should update color indicator for blue', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        firstGateColor: 'blue',
      });

      const display = document.createElement('span');
      display.id = 'gate-range-display';
      const colorIndicator = document.createElement('div');
      colorIndicator.id = 'gate-color-indicator';
      const colorText = document.createElement('span');
      colorText.id = 'gate-color-text';
      container.appendChild(display);
      container.appendChild(colorIndicator);
      container.appendChild(colorText);

      updateGateRangeDisplay();

      expect(colorIndicator.classList.contains('blue')).toBe(true);
      expect(colorIndicator.classList.contains('red')).toBe(false);
    });
  });

  describe('updateOtherJudgesCoverage', () => {
    it('should hide when sync is disabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { sync: false },
      });

      const coverageContainer = document.createElement('div');
      coverageContainer.id = 'other-judges-coverage';
      const coverageList = document.createElement('div');
      coverageList.id = 'other-judges-list';
      container.appendChild(coverageContainer);
      container.appendChild(coverageList);

      updateOtherJudgesCoverage();

      expect(coverageContainer.style.display).toBe('none');
    });

    it('should hide when no other assignments exist', () => {
      const coverageContainer = document.createElement('div');
      coverageContainer.id = 'other-judges-coverage';
      const coverageList = document.createElement('div');
      coverageList.id = 'other-judges-list';
      container.appendChild(coverageContainer);
      container.appendChild(coverageList);

      // syncService.getOtherGateAssignments returns [] by default

      updateOtherJudgesCoverage();

      expect(coverageContainer.style.display).toBe('none');
    });

    it('should show coverage when other judges have assignments', () => {
      const mockSync = syncService as {
        getOtherGateAssignments: ReturnType<typeof vi.fn>;
      };
      mockSync.getOtherGateAssignments.mockReturnValue([
        {
          deviceId: 'dev_2',
          deviceName: 'Judge 2',
          gateStart: 11,
          gateEnd: 20,
          isReady: true,
          lastSeen: Date.now(),
        },
      ]);

      const coverageContainer = document.createElement('div');
      coverageContainer.id = 'other-judges-coverage';
      const coverageList = document.createElement('div');
      coverageList.id = 'other-judges-list';
      container.appendChild(coverageContainer);
      container.appendChild(coverageList);

      updateOtherJudgesCoverage();

      expect(coverageContainer.style.display).toBe('flex');
      expect(coverageList.innerHTML).toContain('Judge 2');
      expect(coverageList.innerHTML).toContain('11');
      expect(coverageList.innerHTML).toContain('20');
    });

    it('should show ready check for ready judges', () => {
      const mockSync = syncService as {
        getOtherGateAssignments: ReturnType<typeof vi.fn>;
      };
      mockSync.getOtherGateAssignments.mockReturnValue([
        {
          deviceId: 'dev_2',
          deviceName: 'Ready Judge',
          gateStart: 1,
          gateEnd: 5,
          isReady: true,
          lastSeen: Date.now(),
        },
      ]);

      const coverageContainer = document.createElement('div');
      coverageContainer.id = 'other-judges-coverage';
      const coverageList = document.createElement('div');
      coverageList.id = 'other-judges-list';
      container.appendChild(coverageContainer);
      container.appendChild(coverageList);

      updateOtherJudgesCoverage();

      expect(coverageList.innerHTML).toContain('ready-check');
      expect(coverageList.innerHTML).toContain('ready');
    });

    it('should not throw when coverage elements are missing', () => {
      expect(() => updateOtherJudgesCoverage()).not.toThrow();
    });
  });

  describe('updateJudgeReadyStatus - additional states', () => {
    it('should add some-ready class when partially ready', () => {
      const mockSync = syncService as {
        getOtherGateAssignments: ReturnType<typeof vi.fn>;
      };
      mockSync.getOtherGateAssignments.mockReturnValue([
        {
          deviceId: 'dev_2',
          deviceName: 'Judge 2',
          gateStart: 11,
          gateEnd: 20,
          isReady: false,
          lastSeen: Date.now(),
        },
      ]);

      mockGetState.mockReturnValue({
        ...mockGetState(),
        isJudgeReady: true,
      });

      const indicator = document.createElement('div');
      indicator.id = 'judge-ready-indicator';
      container.appendChild(indicator);

      updateJudgeReadyStatus();

      expect(indicator.classList.contains('some-ready')).toBe(true);
      expect(indicator.classList.contains('none-ready')).toBe(false);
      expect(indicator.classList.contains('all-ready')).toBe(false);
    });

    it('should hide GPS indicator in gate judge mode', () => {
      const gpsIndicator = document.createElement('div');
      gpsIndicator.id = 'gps-indicator';
      gpsIndicator.style.display = 'flex';
      const indicator = document.createElement('div');
      indicator.id = 'judge-ready-indicator';
      container.appendChild(gpsIndicator);
      container.appendChild(indicator);

      updateJudgeReadyStatus();

      expect(gpsIndicator.style.display).toBe('none');
    });

    it('should show GPS indicator in timer mode with GPS enabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'timer',
      });

      const gpsIndicator = document.createElement('div');
      gpsIndicator.id = 'gps-indicator';
      gpsIndicator.style.display = 'none';
      const indicator = document.createElement('div');
      indicator.id = 'judge-ready-indicator';
      container.appendChild(gpsIndicator);
      container.appendChild(indicator);

      updateJudgeReadyStatus();

      expect(gpsIndicator.style.display).toBe('flex');
    });

    it('should return early if judge-ready-indicator is missing', () => {
      expect(() => updateJudgeReadyStatus()).not.toThrow();
    });
  });

  describe('updateGateJudgeTabVisibility - edge cases', () => {
    it('should handle missing timer tab element', () => {
      const gateJudgeTab = document.createElement('div');
      gateJudgeTab.id = 'gate-judge-tab';
      container.appendChild(gateJudgeTab);

      expect(() => updateGateJudgeTabVisibility()).not.toThrow();
    });

    it('should handle missing gate judge tab element', () => {
      const timerTab = document.createElement('div');
      timerTab.id = 'timer-tab';
      container.appendChild(timerTab);

      expect(() => updateGateJudgeTabVisibility()).not.toThrow();
    });

    it('should remove gate-judge-mode class in timer mode', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'timer',
      });

      const tabBar = document.createElement('div');
      tabBar.className = 'tab-bar gate-judge-mode';
      container.appendChild(tabBar);

      updateGateJudgeTabVisibility();

      expect(tabBar.classList.contains('gate-judge-mode')).toBe(false);
    });
  });

  describe('updateGateJudgeRunSelection - additional cases', () => {
    it('should set run 2 as active when selectedRun is 2', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        selectedRun: 2,
      });

      const selector = document.createElement('div');
      selector.id = 'gate-judge-run-selector';
      const btn1 = document.createElement('button');
      btn1.className = 'run-btn active';
      btn1.setAttribute('data-run', '1');
      btn1.setAttribute('aria-checked', 'true');
      const btn2 = document.createElement('button');
      btn2.className = 'run-btn';
      btn2.setAttribute('data-run', '2');
      btn2.setAttribute('aria-checked', 'false');
      selector.appendChild(btn1);
      selector.appendChild(btn2);
      container.appendChild(selector);

      updateGateJudgeRunSelection();

      expect(btn1.classList.contains('active')).toBe(false);
      expect(btn1.getAttribute('aria-checked')).toBe('false');
      expect(btn2.classList.contains('active')).toBe(true);
      expect(btn2.getAttribute('aria-checked')).toBe('true');
    });

    it('should handle missing run selector element', () => {
      expect(() => updateGateJudgeRunSelection()).not.toThrow();
    });
  });

  describe('handleGateJudgeVoiceIntent - additional edge cases', () => {
    it('should toggle ready from true to false', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        isJudgeReady: true,
      });

      handleGateJudgeVoiceIntent({ action: 'toggle_ready' } as any);

      expect(mockSetJudgeReady).toHaveBeenCalledWith(false);
    });

    it('should show toast on toggle_ready', () => {
      handleGateJudgeVoiceIntent({ action: 'toggle_ready' } as any);

      expect(showToast).toHaveBeenCalled();
    });

    it('should not record fault when bib param is missing', () => {
      handleGateJudgeVoiceIntent({
        action: 'record_fault',
        params: { gate: 5, faultType: 'MG' },
      } as any);

      expect(recordFaultFromVoice).not.toHaveBeenCalled();
    });

    it('should not record fault when gate param is missing', () => {
      handleGateJudgeVoiceIntent({
        action: 'record_fault',
        params: { bib: '42', faultType: 'MG' },
      } as any);

      expect(recordFaultFromVoice).not.toHaveBeenCalled();
    });

    it('should not record fault when faultType param is missing', () => {
      handleGateJudgeVoiceIntent({
        action: 'record_fault',
        params: { bib: '42', gate: 5 },
      } as any);

      expect(recordFaultFromVoice).not.toHaveBeenCalled();
    });

    it('should not set run when run param is missing', () => {
      handleGateJudgeVoiceIntent({
        action: 'set_run',
        params: {},
      } as any);

      expect(mockSetSelectedRun).not.toHaveBeenCalled();
    });

    it('should update run selection UI on set_run', () => {
      handleGateJudgeVoiceIntent({
        action: 'set_run',
        params: { run: 2 },
      } as any);

      expect(refreshInlineFaultUI).toHaveBeenCalled();
      expect(feedbackTap).toHaveBeenCalled();
    });

    it('should record fault with STR fault type', async () => {
      handleGateJudgeVoiceIntent({
        action: 'record_fault',
        params: { bib: '15', gate: 3, faultType: 'STR' },
      } as any);

      await vi.waitFor(() => {
        expect(recordFaultFromVoice).toHaveBeenCalledWith('15', 3, 'STR');
      });
    });

    it('should record fault with BR fault type', async () => {
      handleGateJudgeVoiceIntent({
        action: 'record_fault',
        params: { bib: '99', gate: 8, faultType: 'BR' },
      } as any);

      await vi.waitFor(() => {
        expect(recordFaultFromVoice).toHaveBeenCalledWith('99', 8, 'BR');
      });
    });
  });

  describe('updateReadyButtonState - edge cases', () => {
    it('should handle missing ready button', () => {
      expect(() => updateReadyButtonState()).not.toThrow();
    });
  });

  describe('updateJudgesReadyIndicator - additional cases', () => {
    it('should handle missing indicator elements', () => {
      expect(() => updateJudgesReadyIndicator()).not.toThrow();
    });

    it('should set aria-label with ready count', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'gateJudge',
        gateAssignment: [1, 10],
        isJudgeReady: true,
      });

      const indicator = document.createElement('div');
      indicator.id = 'judges-ready-indicator';
      const countEl = document.createElement('span');
      countEl.id = 'judges-ready-count';
      container.appendChild(indicator);
      container.appendChild(countEl);

      updateJudgesReadyIndicator([]);

      expect(indicator.getAttribute('aria-label')).toContain('1/1');
    });

    it('should use syncService when assignments not provided', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        deviceRole: 'gateJudge',
        gateAssignment: [1, 10],
        isJudgeReady: false,
      });

      const indicator = document.createElement('div');
      indicator.id = 'judges-ready-indicator';
      const countEl = document.createElement('span');
      countEl.id = 'judges-ready-count';
      container.appendChild(indicator);
      container.appendChild(countEl);

      updateJudgesReadyIndicator();

      // syncService returns empty array by default, but this device is a gate judge
      expect(countEl.textContent).toBe('0/1');
    });
  });
});
