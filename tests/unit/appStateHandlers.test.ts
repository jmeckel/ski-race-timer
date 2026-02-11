/**
 * Unit Tests for App State Handlers Module
 * Tests: handleStateChange dispatching to appropriate handlers
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies
vi.mock('../../src/appUiUpdates', () => ({
  updateGpsIndicator: vi.fn(),
  updatePhotoCaptureIndicator: vi.fn(),
  updateSyncStatusIndicator: vi.fn(),
  updateUndoButton: vi.fn(),
  updateViewVisibility: vi.fn(),
}));

vi.mock('../../src/features/faults', () => ({
  updateActiveBibsList: vi.fn(),
}));

vi.mock('../../src/features/gateJudgeView', () => ({
  updateGateJudgeRunSelection: vi.fn(),
  updateGateJudgeTabVisibility: vi.fn(),
  updateGateRangeDisplay: vi.fn(),
  updateJudgeReadyStatus: vi.fn(),
}));

vi.mock('../../src/features/radialTimerView', () => ({
  isRadialModeActive: vi.fn(() => false),
  updateRadialBib: vi.fn(),
}));

vi.mock('../../src/features/resultsView', () => ({
  getVirtualList: vi.fn(() => null),
  updateEntryCountBadge: vi.fn(),
  updateStats: vi.fn(),
}));

vi.mock('../../src/features/settingsView', () => ({
  applyGlassEffectSettings: vi.fn(),
  updateRoleToggle: vi.fn(),
}));

vi.mock('../../src/features/timerView', () => ({
  updateBibDisplay: vi.fn(),
  updateRunSelection: vi.fn(),
  updateTimingPointSelection: vi.fn(),
}));

vi.mock('../../src/services', () => ({
  ambientModeService: {
    disable: vi.fn(),
    enable: vi.fn(),
    initialize: vi.fn(),
  },
  wakeLockService: {
    disable: vi.fn(),
    enable: vi.fn(),
  },
}));

const mockGetState = vi.fn();
vi.mock('../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
  },
}));

vi.mock('../../src/utils/viewServices', () => ({
  applyViewServices: vi.fn(),
}));

import { handleStateChange } from '../../src/appStateHandlers';
import {
  updateGpsIndicator,
  updatePhotoCaptureIndicator,
  updateSyncStatusIndicator,
  updateUndoButton,
  updateViewVisibility,
} from '../../src/appUiUpdates';
import { updateActiveBibsList } from '../../src/features/faults';
import {
  updateGateJudgeRunSelection,
  updateGateJudgeTabVisibility,
  updateGateRangeDisplay,
  updateJudgeReadyStatus,
} from '../../src/features/gateJudgeView';
import {
  isRadialModeActive,
  updateRadialBib,
} from '../../src/features/radialTimerView';
import {
  getVirtualList,
  updateEntryCountBadge,
  updateStats,
} from '../../src/features/resultsView';
import {
  applyGlassEffectSettings,
  updateRoleToggle,
} from '../../src/features/settingsView';
import {
  updateBibDisplay,
  updateRunSelection,
  updateTimingPointSelection,
} from '../../src/features/timerView';
import { ambientModeService, wakeLockService } from '../../src/services';
import { applyViewServices } from '../../src/utils/viewServices';

describe('App State Handlers', () => {
  const baseState = {
    currentView: 'timer' as const,
    currentLang: 'en',
    settings: { sync: true, gps: true, ambientMode: false },
    entries: [],
    faultEntries: [],
    bibInput: '',
    selectedPoint: 'S' as const,
    selectedRun: 1,
    syncStatus: 'connected',
    gpsStatus: 'active',
    cloudDeviceCount: 0,
    undoStack: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue(baseState);
  });

  describe('handleStateChange - view changes', () => {
    it('should update view visibility on currentView change', () => {
      handleStateChange(baseState as any, ['currentView']);
      expect(updateViewVisibility).toHaveBeenCalled();
    });

    it('should enable wake lock when switching to timer view', () => {
      const state = { ...baseState, currentView: 'timer' as const };
      handleStateChange(state as any, ['currentView']);
      expect(wakeLockService.enable).toHaveBeenCalled();
    });

    it('should disable wake lock when switching away from timer view', () => {
      const state = { ...baseState, currentView: 'results' as const };
      handleStateChange(state as any, ['currentView']);
      expect(wakeLockService.disable).toHaveBeenCalled();
    });

    it('should enable ambient mode on timer view when ambient setting is on', () => {
      const state = {
        ...baseState,
        currentView: 'timer' as const,
        settings: { ...baseState.settings, ambientMode: true },
      };
      handleStateChange(state as any, ['currentView']);
      expect(ambientModeService.enable).toHaveBeenCalled();
    });

    it('should disable ambient mode when not on timer view', () => {
      const state = {
        ...baseState,
        currentView: 'results' as const,
        settings: { ...baseState.settings, ambientMode: true },
      };
      handleStateChange(state as any, ['currentView']);
      expect(ambientModeService.disable).toHaveBeenCalled();
    });

    it('should refresh status indicators on view change', () => {
      handleStateChange(baseState as any, ['currentView']);
      expect(updateGpsIndicator).toHaveBeenCalled();
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
    });

    it('should call applyViewServices on view change', () => {
      handleStateChange(baseState as any, ['currentView']);
      expect(applyViewServices).toHaveBeenCalledWith(baseState);
    });

    it('should pause virtual list when not on results view', () => {
      const mockVList = { pause: vi.fn(), resume: vi.fn() };
      vi.mocked(getVirtualList).mockReturnValue(mockVList as any);

      const state = { ...baseState, currentView: 'timer' as const };
      handleStateChange(state as any, ['currentView']);
      expect(mockVList.pause).toHaveBeenCalled();
    });

    it('should resume virtual list when on results view', () => {
      const mockVList = { pause: vi.fn(), resume: vi.fn() };
      vi.mocked(getVirtualList).mockReturnValue(mockVList as any);

      const state = { ...baseState, currentView: 'results' as const };
      handleStateChange(state as any, ['currentView']);
      expect(mockVList.resume).toHaveBeenCalled();
    });
  });

  describe('handleStateChange - settings changes', () => {
    it('should update all indicators on settings change', () => {
      handleStateChange(baseState as any, ['settings']);
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
      expect(updateGpsIndicator).toHaveBeenCalled();
      expect(updateJudgeReadyStatus).toHaveBeenCalled();
      expect(updatePhotoCaptureIndicator).toHaveBeenCalled();
      expect(applyGlassEffectSettings).toHaveBeenCalled();
    });

    it('should call applyViewServices on settings change', () => {
      handleStateChange(baseState as any, ['settings']);
      expect(applyViewServices).toHaveBeenCalledWith(baseState);
    });

    it('should initialize ambient mode when setting is enabled', () => {
      const state = {
        ...baseState,
        settings: { ...baseState.settings, ambientMode: true },
        currentView: 'timer' as const,
      };
      mockGetState.mockReturnValue(state);
      handleStateChange(state as any, ['settings']);
      expect(ambientModeService.initialize).toHaveBeenCalled();
      expect(ambientModeService.enable).toHaveBeenCalled();
    });

    it('should disable ambient mode when setting is off', () => {
      const state = {
        ...baseState,
        settings: { ...baseState.settings, ambientMode: false },
      };
      mockGetState.mockReturnValue(state);
      handleStateChange(state as any, ['settings']);
      expect(ambientModeService.disable).toHaveBeenCalled();
    });
  });

  describe('handleStateChange - bibInput changes', () => {
    it('should update bib display in classic mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(false);
      handleStateChange(baseState as any, ['bibInput']);
      expect(updateBibDisplay).toHaveBeenCalled();
    });

    it('should update radial bib in radial mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(true);
      handleStateChange(baseState as any, ['bibInput']);
      expect(updateRadialBib).toHaveBeenCalled();
    });
  });

  describe('handleStateChange - selectedPoint changes', () => {
    it('should update timing point selection in classic mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(false);
      handleStateChange(baseState as any, ['selectedPoint']);
      expect(updateTimingPointSelection).toHaveBeenCalled();
    });

    it('should NOT update timing point selection in radial mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(true);
      handleStateChange(baseState as any, ['selectedPoint']);
      expect(updateTimingPointSelection).not.toHaveBeenCalled();
    });
  });

  describe('handleStateChange - selectedRun changes', () => {
    it('should update run selection and gate judge', () => {
      handleStateChange(baseState as any, ['selectedRun']);
      expect(updateRunSelection).toHaveBeenCalled();
      expect(updateGateJudgeRunSelection).toHaveBeenCalled();
    });

    it('should update active bibs when on gateJudge view', () => {
      const state = { ...baseState, currentView: 'gateJudge' as const };
      handleStateChange(state as any, ['selectedRun']);
      expect(updateActiveBibsList).toHaveBeenCalled();
    });

    it('should NOT update active bibs when not on gateJudge view', () => {
      handleStateChange(baseState as any, ['selectedRun']);
      expect(updateActiveBibsList).not.toHaveBeenCalled();
    });
  });

  describe('handleStateChange - entries changes', () => {
    it('should update stats and entry count badge', () => {
      handleStateChange(baseState as any, ['entries']);
      expect(updateStats).toHaveBeenCalled();
      expect(updateEntryCountBadge).toHaveBeenCalled();
    });

    it('should set entries on virtual list when available', () => {
      const mockVList = { setEntries: vi.fn() };
      vi.mocked(getVirtualList).mockReturnValue(mockVList as any);

      handleStateChange(baseState as any, ['entries']);
      expect(mockVList.setEntries).toHaveBeenCalledWith(baseState.entries);
    });

    it('should update active bibs when on gateJudge view', () => {
      const state = { ...baseState, currentView: 'gateJudge' as const };
      handleStateChange(state as any, ['entries']);
      expect(updateActiveBibsList).toHaveBeenCalled();
    });
  });

  describe('handleStateChange - deviceRole changes', () => {
    it('should update role toggle and gate judge visibility', () => {
      handleStateChange(baseState as any, ['deviceRole']);
      expect(updateRoleToggle).toHaveBeenCalled();
      expect(updateGateJudgeTabVisibility).toHaveBeenCalled();
      expect(updateJudgeReadyStatus).toHaveBeenCalled();
    });
  });

  describe('handleStateChange - other state keys', () => {
    it('should update judge ready status on isJudgeReady change', () => {
      handleStateChange(baseState as any, ['isJudgeReady']);
      expect(updateJudgeReadyStatus).toHaveBeenCalled();
    });

    it('should update gate range display on gateAssignment change', () => {
      handleStateChange(baseState as any, ['gateAssignment']);
      expect(updateGateRangeDisplay).toHaveBeenCalled();
    });

    it('should update active bibs on faultEntries change when on gateJudge', () => {
      const state = { ...baseState, currentView: 'gateJudge' as const };
      handleStateChange(state as any, ['faultEntries']);
      expect(updateActiveBibsList).toHaveBeenCalled();
    });

    it('should update sync indicator on syncStatus change', () => {
      handleStateChange(baseState as any, ['syncStatus']);
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
    });

    it('should update sync indicator on cloudDeviceCount change', () => {
      handleStateChange(baseState as any, ['cloudDeviceCount']);
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
    });

    it('should update GPS and judge status on gpsStatus change', () => {
      handleStateChange(baseState as any, ['gpsStatus']);
      expect(updateGpsIndicator).toHaveBeenCalled();
      expect(updateJudgeReadyStatus).toHaveBeenCalled();
    });

    it('should update undo button on undoStack change', () => {
      handleStateChange(baseState as any, ['undoStack']);
      expect(updateUndoButton).toHaveBeenCalled();
    });
  });

  describe('handleStateChange - combined changes', () => {
    it('should handle view + settings change correctly', () => {
      handleStateChange(baseState as any, ['currentView', 'settings']);
      expect(updateViewVisibility).toHaveBeenCalled();
      expect(applyGlassEffectSettings).toHaveBeenCalled();
      // applyViewServices should be called (settings branch handles it)
      expect(applyViewServices).toHaveBeenCalled();
    });

    it('should handle unknown keys without error', () => {
      expect(() =>
        handleStateChange(baseState as any, ['unknownKey' as any]),
      ).not.toThrow();
    });
  });
});
