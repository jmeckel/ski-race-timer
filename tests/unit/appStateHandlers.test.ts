/**
 * Unit Tests for App State Handlers Module
 * Tests: initStateEffects() sets up signal-based effects that dispatch UI updates
 */

import { computed, effect, signal } from '@preact/signals-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all UI update dependencies
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

vi.mock('../../src/utils/viewServices', () => ({
  applyViewServices: vi.fn(),
}));

// Create a shared mock state signal that mimics the store
const mockState = signal({
  currentView: 'timer' as string,
  currentLang: 'en',
  settings: { sync: true, gps: true, ambientMode: false } as Record<
    string,
    unknown
  >,
  entries: [] as unknown[],
  faultEntries: [] as unknown[],
  bibInput: '',
  selectedPoint: 'S',
  selectedRun: 1,
  syncStatus: 'connected',
  gpsStatus: 'active',
  cloudDeviceCount: 0,
  undoStack: [] as unknown[],
  deviceRole: 'timer' as string,
  isJudgeReady: false,
  gateAssignment: null as [number, number] | null,
});

vi.mock('../../src/store', () => ({
  store: { getState: () => mockState.value },
  $currentView: computed(() => mockState.value.currentView),
  $bibInput: computed(() => mockState.value.bibInput),
  $selectedPoint: computed(() => mockState.value.selectedPoint),
  $selectedRun: computed(() => mockState.value.selectedRun),
  $entries: computed(() => mockState.value.entries),
  $faultEntries: computed(() => mockState.value.faultEntries),
  $deviceRole: computed(() => mockState.value.deviceRole),
  $isJudgeReady: computed(() => mockState.value.isJudgeReady),
  $gateAssignment: computed(() => mockState.value.gateAssignment),
  $syncStatus: computed(() => mockState.value.syncStatus),
  $cloudDeviceCount: computed(() => mockState.value.cloudDeviceCount),
  $gpsStatus: computed(() => mockState.value.gpsStatus),
  $undoStack: computed(() => mockState.value.undoStack),
  $settings: computed(() => mockState.value.settings),
  effect,
}));

import { initStateEffects } from '../../src/appStateHandlers';
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
  let dispose: () => void;

  const defaultState = {
    currentView: 'timer' as string,
    currentLang: 'en',
    settings: { sync: true, gps: true, ambientMode: false } as Record<
      string,
      unknown
    >,
    entries: [] as unknown[],
    faultEntries: [] as unknown[],
    bibInput: '',
    selectedPoint: 'S',
    selectedRun: 1,
    syncStatus: 'connected',
    gpsStatus: 'active',
    cloudDeviceCount: 0,
    undoStack: [] as unknown[],
    deviceRole: 'timer' as string,
    isJudgeReady: false,
    gateAssignment: null as [number, number] | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset state to defaults
    mockState.value = { ...defaultState };
    // Initialize effects
    dispose = initStateEffects();
    // Clear mocks after initial effect run (effects fire on creation)
    vi.clearAllMocks();
  });

  afterEach(() => {
    dispose();
  });

  describe('initStateEffects', () => {
    it('should return a disposer function', () => {
      expect(typeof dispose).toBe('function');
    });
  });

  describe('view changes', () => {
    it('should update view visibility on currentView change', () => {
      mockState.value = { ...mockState.value, currentView: 'results' };
      expect(updateViewVisibility).toHaveBeenCalled();
    });

    it('should enable wake lock when switching to timer view', () => {
      mockState.value = { ...mockState.value, currentView: 'results' };
      vi.clearAllMocks();
      mockState.value = { ...mockState.value, currentView: 'timer' };
      expect(wakeLockService.enable).toHaveBeenCalled();
    });

    it('should disable wake lock when switching away from timer view', () => {
      mockState.value = { ...mockState.value, currentView: 'results' };
      expect(wakeLockService.disable).toHaveBeenCalled();
    });

    it('should enable ambient mode on timer view when ambient setting is on', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, ambientMode: true },
      };
      vi.clearAllMocks();
      // Trigger currentView effect by changing view and back
      mockState.value = { ...mockState.value, currentView: 'results' };
      vi.clearAllMocks();
      mockState.value = { ...mockState.value, currentView: 'timer' };
      expect(ambientModeService.enable).toHaveBeenCalled();
    });

    it('should disable ambient mode when not on timer view', () => {
      mockState.value = { ...mockState.value, currentView: 'results' };
      expect(ambientModeService.disable).toHaveBeenCalled();
    });

    it('should refresh status indicators on view change', () => {
      mockState.value = { ...mockState.value, currentView: 'results' };
      expect(updateGpsIndicator).toHaveBeenCalled();
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
    });

    it('should pause virtual list when not on results view', () => {
      const mockVList = { pause: vi.fn(), resume: vi.fn() };
      vi.mocked(getVirtualList).mockReturnValue(mockVList as any);

      mockState.value = { ...mockState.value, currentView: 'settings' };
      expect(mockVList.pause).toHaveBeenCalled();
    });

    it('should resume virtual list when on results view', () => {
      const mockVList = { pause: vi.fn(), resume: vi.fn() };
      vi.mocked(getVirtualList).mockReturnValue(mockVList as any);

      mockState.value = { ...mockState.value, currentView: 'results' };
      expect(mockVList.resume).toHaveBeenCalled();
    });
  });

  describe('settings changes', () => {
    it('should update all indicators on settings change', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, gps: false },
      };
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
      expect(updateGpsIndicator).toHaveBeenCalled();
      expect(updateJudgeReadyStatus).toHaveBeenCalled();
      expect(updatePhotoCaptureIndicator).toHaveBeenCalled();
      expect(applyGlassEffectSettings).toHaveBeenCalled();
    });

    it('should call applyViewServices on settings change', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, gps: false },
      };
      expect(applyViewServices).toHaveBeenCalled();
    });

    it('should initialize ambient mode when setting is enabled on timer view', () => {
      mockState.value = {
        ...mockState.value,
        currentView: 'timer',
        settings: { ...mockState.value.settings, ambientMode: true },
      };
      expect(ambientModeService.initialize).toHaveBeenCalled();
      expect(ambientModeService.enable).toHaveBeenCalled();
    });

    it('should disable ambient mode when setting is off', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, ambientMode: false },
      };
      expect(ambientModeService.disable).toHaveBeenCalled();
    });
  });

  describe('bibInput changes', () => {
    it('should update bib display in classic mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(false);
      mockState.value = { ...mockState.value, bibInput: '123' };
      expect(updateBibDisplay).toHaveBeenCalled();
    });

    it('should update radial bib in radial mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(true);
      mockState.value = { ...mockState.value, bibInput: '456' };
      expect(updateRadialBib).toHaveBeenCalled();
    });
  });

  describe('selectedPoint changes', () => {
    it('should update timing point selection in classic mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(false);
      mockState.value = { ...mockState.value, selectedPoint: 'F' };
      expect(updateTimingPointSelection).toHaveBeenCalled();
    });

    it('should NOT update timing point selection in radial mode', () => {
      vi.mocked(isRadialModeActive).mockReturnValue(true);
      mockState.value = { ...mockState.value, selectedPoint: 'F' };
      expect(updateTimingPointSelection).not.toHaveBeenCalled();
    });
  });

  describe('selectedRun changes', () => {
    it('should update run selection and gate judge', () => {
      mockState.value = { ...mockState.value, selectedRun: 2 };
      expect(updateRunSelection).toHaveBeenCalled();
      expect(updateGateJudgeRunSelection).toHaveBeenCalled();
    });

    it('should update active bibs when on gateJudge view', () => {
      mockState.value = { ...mockState.value, currentView: 'gateJudge' };
      vi.clearAllMocks();
      mockState.value = { ...mockState.value, selectedRun: 2 };
      expect(updateActiveBibsList).toHaveBeenCalled();
    });

    it('should NOT update active bibs when not on gateJudge view', () => {
      mockState.value = { ...mockState.value, selectedRun: 2 };
      expect(updateActiveBibsList).not.toHaveBeenCalled();
    });
  });

  describe('entries changes', () => {
    it('should update stats and entry count badge', () => {
      mockState.value = { ...mockState.value, entries: [{ id: '1' }] };
      expect(updateStats).toHaveBeenCalled();
      expect(updateEntryCountBadge).toHaveBeenCalled();
    });

    it('should update active bibs when on gateJudge view', () => {
      mockState.value = { ...mockState.value, currentView: 'gateJudge' };
      vi.clearAllMocks();
      mockState.value = { ...mockState.value, entries: [{ id: '1' }] };
      expect(updateActiveBibsList).toHaveBeenCalled();
    });
  });

  describe('deviceRole changes', () => {
    it('should update role toggle and gate judge visibility', () => {
      mockState.value = { ...mockState.value, deviceRole: 'gateJudge' };
      expect(updateRoleToggle).toHaveBeenCalled();
      expect(updateGateJudgeTabVisibility).toHaveBeenCalled();
      expect(updateJudgeReadyStatus).toHaveBeenCalled();
    });
  });

  describe('other state keys', () => {
    it('should update judge ready status on isJudgeReady change', () => {
      mockState.value = { ...mockState.value, isJudgeReady: true };
      expect(updateJudgeReadyStatus).toHaveBeenCalled();
    });

    it('should update gate range display on gateAssignment change', () => {
      mockState.value = {
        ...mockState.value,
        gateAssignment: [1, 5] as [number, number],
      };
      expect(updateGateRangeDisplay).toHaveBeenCalled();
    });

    it('should update active bibs on faultEntries change when on gateJudge', () => {
      mockState.value = { ...mockState.value, currentView: 'gateJudge' };
      vi.clearAllMocks();
      mockState.value = {
        ...mockState.value,
        faultEntries: [{ id: 'f1' }],
      };
      expect(updateActiveBibsList).toHaveBeenCalled();
    });

    it('should update sync indicator on syncStatus change', () => {
      mockState.value = { ...mockState.value, syncStatus: 'syncing' };
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
    });

    it('should update sync indicator on cloudDeviceCount change', () => {
      mockState.value = { ...mockState.value, cloudDeviceCount: 3 };
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
    });

    it('should update GPS and judge status on gpsStatus change', () => {
      mockState.value = { ...mockState.value, gpsStatus: 'searching' };
      expect(updateGpsIndicator).toHaveBeenCalled();
      expect(updateJudgeReadyStatus).toHaveBeenCalled();
    });

    it('should update undo button on undoStack change', () => {
      mockState.value = {
        ...mockState.value,
        undoStack: [{ type: 'add' }],
      };
      expect(updateUndoButton).toHaveBeenCalled();
    });
  });

  describe('disposer cleanup', () => {
    it('should stop effects after dispose', () => {
      dispose();
      vi.clearAllMocks();
      mockState.value = { ...mockState.value, bibInput: 'xyz' };
      expect(updateBibDisplay).not.toHaveBeenCalled();
      // Re-create for afterEach
      dispose = initStateEffects();
    });
  });
});
