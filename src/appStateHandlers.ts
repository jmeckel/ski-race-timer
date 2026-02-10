import { store } from './store';
import { wakeLockService, ambientModeService } from './services';
import { applyViewServices } from './utils/viewServices';
import {
  updateBibDisplay, updateTimingPointSelection, updateRunSelection
} from './features/timerView';
import {
  isRadialModeActive, updateRadialBib
} from './features/radialTimerView';
import {
  getVirtualList, updateStats, updateEntryCountBadge
} from './features/resultsView';
import {
  updateRoleToggle, applyGlassEffectSettings
} from './features/settingsView';
import {
  updateGateJudgeTabVisibility, updateGateRangeDisplay,
  updateJudgeReadyStatus, updateGateJudgeRunSelection
} from './features/gateJudgeView';
import {
  updateActiveBibsList
} from './features/faultEntry';
import {
  updateViewVisibility, updateSyncStatusIndicator, updateGpsIndicator,
  updatePhotoCaptureIndicator, updateUndoButton
} from './appUiUpdates';

/**
 * State change handler map: groups related updates together
 * Each handler receives the current state and returns void
 */
type StateHandler = (state: ReturnType<typeof store.getState>) => void;

const STATE_HANDLERS: Record<string, StateHandler[]> = {
  // Timer view updates (handles both classic and radial modes)
  bibInput: [() => {
    if (isRadialModeActive()) {
      updateRadialBib();
    } else {
      updateBibDisplay();
    }
  }],
  selectedPoint: [() => {
    if (!isRadialModeActive()) {
      updateTimingPointSelection();
    }
    // Radial mode handles this via its own store subscription
  }],

  // Run selection updates both timer and gate judge views
  selectedRun: [(state) => {
    updateRunSelection();
    updateGateJudgeRunSelection();
    if (state.currentView === 'gateJudge') updateActiveBibsList();
  }],

  // Entry updates affect results list and gate judge view
  entries: [(state) => {
    const vList = getVirtualList();
    if (vList) vList.setEntries(state.entries);
    updateStats();
    updateEntryCountBadge();
    if (state.currentView === 'gateJudge') updateActiveBibsList();
  }],

  // Gate Judge role/state updates
  deviceRole: [() => {
    updateRoleToggle();
    updateGateJudgeTabVisibility();
    updateJudgeReadyStatus();
  }],
  isJudgeReady: [() => updateJudgeReadyStatus()],
  gateAssignment: [() => updateGateRangeDisplay()],
  faultEntries: [(state) => {
    if (state.currentView === 'gateJudge') updateActiveBibsList();
  }],

  // Status indicators
  syncStatus: [() => updateSyncStatusIndicator()],
  cloudDeviceCount: [() => updateSyncStatusIndicator()],
  gpsStatus: [() => {
    updateGpsIndicator();
    updateJudgeReadyStatus();
  }],
  undoStack: [() => updateUndoButton()],
};

/**
 * Handle view changes (wake lock, virtual list pause/resume, ambient mode)
 */
function handleViewChange(state: ReturnType<typeof store.getState>): void {
  updateViewVisibility();

  // Refresh status indicators (ensure they reflect current state on all views)
  updateGpsIndicator();
  updateSyncStatusIndicator();

  // Wake Lock: keep screen on during active timing
  if (state.currentView === 'timer') {
    wakeLockService.enable();
  } else {
    wakeLockService.disable();
  }

  // Ambient Mode: enable only on timer view when setting is enabled
  if (state.currentView === 'timer' && state.settings.ambientMode) {
    ambientModeService.enable();
  } else {
    ambientModeService.disable();
  }

  // VirtualList: pause when not on results view to save resources
  const virtualList = getVirtualList();
  if (virtualList) {
    if (state.currentView === 'results') {
      virtualList.resume();
    } else {
      virtualList.pause();
    }
  }
}

/**
 * Handle settings changes
 */
function handleSettingsChange(): void {
  updateSyncStatusIndicator();
  updateGpsIndicator();
  updateJudgeReadyStatus();
  updatePhotoCaptureIndicator();
  applyGlassEffectSettings();

  // Handle ambient mode setting changes
  const state = store.getState();
  if (state.settings.ambientMode) {
    ambientModeService.initialize();
    if (state.currentView === 'timer') {
      ambientModeService.enable();
    }
  } else {
    ambientModeService.disable();
  }
}

/**
 * Handle state changes - dispatches to appropriate handlers
 */
export function handleStateChange(state: ReturnType<typeof store.getState>, changedKeys: (keyof typeof state)[]): void {
  // Handle view changes (complex logic extracted to separate function)
  if (changedKeys.includes('currentView')) {
    handleViewChange(state);
  }

  // Handle settings changes (affects multiple indicators)
  if (changedKeys.includes('settings')) {
    handleSettingsChange();
    applyViewServices(state);
  }

  // Handle currentView + settings combo for services
  if (changedKeys.includes('currentView') && !changedKeys.includes('settings')) {
    applyViewServices(state);
  }

  // Dispatch to mapped handlers
  for (const key of changedKeys) {
    const handlers = STATE_HANDLERS[key];
    if (handlers) {
      for (const handler of handlers) {
        handler(state);
      }
    }
  }
}
