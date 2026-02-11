/**
 * Unit Tests for Gate Judge View Module
 * Tests: updateGateJudgeTabVisibility, updateGateRangeDisplay,
 *        updateReadyButtonState, updateJudgesReadyIndicator,
 *        updateJudgeReadyStatus, updateGateJudgeRunSelection,
 *        handleGateJudgeVoiceIntent, cleanupGateJudgeView
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

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    setSelectedRun: (...args: unknown[]) => mockSetSelectedRun(...args),
    setJudgeReady: (...args: unknown[]) => mockSetJudgeReady(...args),
    setGateAssignment: vi.fn(),
    setFirstGateColor: vi.fn(),
  },
}));

vi.mock('../../../src/utils', () => ({
  escapeAttr: vi.fn((s: string) => s),
  escapeHtml: vi.fn((s: string) => s),
  getElement: vi.fn((id: string) => document.getElementById(id)),
  iconCheck: vi.fn(() => '<svg></svg>'),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
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
  initFaultRecordingModal: vi.fn(),
  initInlineFaultEntry: vi.fn(),
  recordFaultFromVoice: vi.fn(),
  refreshInlineFaultUI: vi.fn(),
  updateActiveBibsList: vi.fn(),
}));

vi.mock('../../../src/features/modals', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

vi.mock('../../../src/features/voiceNoteUI', () => ({
  initVoiceNoteUI: vi.fn(),
}));

import {
  cleanupGateJudgeView,
  handleGateJudgeVoiceIntent,
  updateGateJudgeRunSelection,
  updateGateJudgeTabVisibility,
  updateGateRangeDisplay,
  updateJudgeReadyStatus,
  updateJudgesReadyIndicator,
  updateReadyButtonState,
} from '../../../src/features/gateJudgeView';
import { feedbackSuccess, syncService } from '../../../src/services';
import { recordFaultFromVoice, updateActiveBibsList } from '../../../src/features/faults';

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
    it('should record fault on record_fault intent', () => {
      handleGateJudgeVoiceIntent({
        action: 'record_fault',
        params: { bib: '042', gate: 5, faultType: 'MG' },
      });

      expect(recordFaultFromVoice).toHaveBeenCalledWith('042', 5, 'MG');
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
});
