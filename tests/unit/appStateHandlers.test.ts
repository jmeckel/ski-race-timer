/**
 * Unit Tests for App State Handlers Module
 * Tests: initStateEffects() sets up signal-based effects that dispatch UI updates
 */

import { computed, effect, signal, untracked } from '@preact/signals-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all UI update dependencies
vi.mock('../../src/appUiUpdates', () => ({
  updateGpsIndicator: vi.fn(),
  updatePhotoCaptureIndicator: vi.fn(),
  updateSyncStatusIndicator: vi.fn(),
  updateUndoButton: vi.fn(),
  updateViewVisibility: vi.fn(),
}));

vi.mock('../../src/features/faults/faultInlineEntry', () => ({
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

vi.mock('../../src/services/ambient', () => ({
  ambientModeService: {
    disable: vi.fn(),
    enable: vi.fn(),
    initialize: vi.fn(),
  },
}));

vi.mock('../../src/services', () => ({
  wakeLockService: {
    disable: vi.fn(),
    enable: vi.fn(),
  },
}));

vi.mock('../../src/utils/viewServices', () => ({
  applyGpsService: vi.fn(),
  applyCameraService: vi.fn(),
  applyViewServices: vi.fn(),
}));

// Create a shared mock state signal that mimics the store
const mockState = signal({
  currentView: 'timer' as string,
  currentLang: 'en',
  settings: {
    sync: true,
    syncPhotos: false,
    gps: true,
    photoCapture: false,
    glassEffects: true,
    outdoorMode: false,
    ambientMode: false,
  } as Record<string, unknown>,
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
  $settingsSync: computed(() => mockState.value.settings.sync),
  $settingsSyncPhotos: computed(() => mockState.value.settings.syncPhotos),
  $settingsGps: computed(() => mockState.value.settings.gps),
  $settingsPhotoCapture: computed(() => mockState.value.settings.photoCapture),
  $settingsGlassEffects: computed(() => mockState.value.settings.glassEffects),
  $settingsOutdoorMode: computed(() => mockState.value.settings.outdoorMode),
  $settingsAmbientMode: computed(() => mockState.value.settings.ambientMode),
  effect,
  untracked,
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
import { wakeLockService } from '../../src/services';
import { ambientModeService } from '../../src/services/ambient';
import {
  applyCameraService,
  applyGpsService,
} from '../../src/utils/viewServices';

describe('App State Handlers', () => {
  let dispose: () => void;

  const defaultState = {
    currentView: 'timer' as string,
    currentLang: 'en',
    settings: {
      sync: true,
      syncPhotos: false,
      gps: true,
      photoCapture: false,
      glassEffects: true,
      outdoorMode: false,
      ambientMode: false,
    } as Record<string, unknown>,
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

    it('should not handle ambient mode in view effect (handled by dedicated settings effect)', () => {
      mockState.value = { ...mockState.value, currentView: 'results' };
      // Ambient mode is now managed by the dedicated ambient mode settings effect,
      // not the view changes effect. Verify view effect doesn't call ambient service.
      expect(ambientModeService.enable).not.toHaveBeenCalled();
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

  describe('settings changes (split effects)', () => {
    it('should update sync indicator when sync setting changes', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, sync: false },
      };
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
    });

    it('should update sync indicator when syncPhotos setting changes', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, syncPhotos: true },
      };
      expect(updateSyncStatusIndicator).toHaveBeenCalled();
    });

    it('should update GPS indicator and GPS service when GPS setting changes', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, gps: false },
      };
      expect(updateGpsIndicator).toHaveBeenCalled();
      expect(applyGpsService).toHaveBeenCalled();
    });

    it('should update photo capture indicator and camera service when photoCapture setting changes', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, photoCapture: true },
      };
      expect(updatePhotoCaptureIndicator).toHaveBeenCalled();
      expect(applyCameraService).toHaveBeenCalled();
    });

    it('should apply glass effects when glassEffects setting changes', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, glassEffects: false },
      };
      expect(applyGlassEffectSettings).toHaveBeenCalled();
    });

    it('should apply glass effects when outdoorMode setting changes', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, outdoorMode: true },
      };
      expect(applyGlassEffectSettings).toHaveBeenCalled();
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
      // First enable ambient mode, then disable it
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, ambientMode: true },
      };
      vi.clearAllMocks();
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, ambientMode: false },
      };
      expect(ambientModeService.disable).toHaveBeenCalled();
    });

    it('should update judge ready status when sync or GPS settings change', () => {
      mockState.value = {
        ...mockState.value,
        settings: { ...mockState.value.settings, sync: false },
      };
      expect(updateJudgeReadyStatus).toHaveBeenCalled();
    });

    it('should call GPS and camera services on view change', () => {
      mockState.value = { ...mockState.value, currentView: 'results' };
      expect(applyGpsService).toHaveBeenCalled();
      expect(applyCameraService).toHaveBeenCalled();
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
