import {
  updateGpsIndicator,
  updatePhotoCaptureIndicator,
  updateSyncStatusIndicator,
  updateUndoButton,
  updateViewVisibility,
} from './appUiUpdates';
import { updateActiveBibsList } from './features/faults';
import {
  updateGateJudgeRunSelection,
  updateGateJudgeTabVisibility,
  updateGateRangeDisplay,
  updateJudgeReadyStatus,
} from './features/gateJudgeView';
import {
  isRadialModeActive,
  updateRadialBib,
} from './features/radialTimerView';
import {
  getVirtualList,
  updateEntryCountBadge,
  updateStats,
} from './features/resultsView';
import {
  applyGlassEffectSettings,
  updateRoleToggle,
} from './features/settingsView';
import {
  updateBibDisplay,
  updateRunSelection,
  updateTimingPointSelection,
} from './features/timerView';
import { ambientModeService, wakeLockService } from './services';
import {
  $bibInput,
  $cloudDeviceCount,
  $currentView,
  $deviceRole,
  $entries,
  $faultEntries,
  $gateAssignment,
  $gpsStatus,
  $isJudgeReady,
  $selectedPoint,
  $selectedRun,
  $settings,
  $syncStatus,
  $undoStack,
  effect,
  store,
} from './store';
import { applyViewServices } from './utils/viewServices';

/**
 * Initialize signal-based state effects.
 * Each effect reacts to specific computed signals and triggers the appropriate UI updates.
 * Returns a disposer function that cleans up all effects.
 */
export function initStateEffects(): () => void {
  const disposers: (() => void)[] = [];

  // --- Timer view updates ---

  disposers.push(
    effect(() => {
      void $bibInput.value;
      if (isRadialModeActive()) {
        updateRadialBib();
      } else {
        updateBibDisplay();
      }
    }),
  );

  disposers.push(
    effect(() => {
      void $selectedPoint.value;
      if (!isRadialModeActive()) {
        updateTimingPointSelection();
      }
    }),
  );

  disposers.push(
    effect(() => {
      void $selectedRun.value;
      updateRunSelection();
      updateGateJudgeRunSelection();
      if ($currentView.value === 'gateJudge') updateActiveBibsList();
    }),
  );

  // --- Entry updates (stats & badge; VirtualList handles its own entries internally) ---

  disposers.push(
    effect(() => {
      void $entries.value;
      updateStats();
      updateEntryCountBadge();
      if ($currentView.value === 'gateJudge') updateActiveBibsList();
    }),
  );

  // --- Gate Judge role/state updates ---

  disposers.push(
    effect(() => {
      void $deviceRole.value;
      updateRoleToggle();
      updateGateJudgeTabVisibility();
      updateJudgeReadyStatus();
    }),
  );

  disposers.push(
    effect(() => {
      void $isJudgeReady.value;
      updateJudgeReadyStatus();
    }),
  );

  disposers.push(
    effect(() => {
      void $gateAssignment.value;
      updateGateRangeDisplay();
    }),
  );

  disposers.push(
    effect(() => {
      void $faultEntries.value;
      if ($currentView.value === 'gateJudge') updateActiveBibsList();
    }),
  );

  // --- Status indicators ---

  disposers.push(
    effect(() => {
      void $syncStatus.value;
      void $cloudDeviceCount.value;
      updateSyncStatusIndicator();
    }),
  );

  disposers.push(
    effect(() => {
      void $gpsStatus.value;
      updateGpsIndicator();
      updateJudgeReadyStatus();
    }),
  );

  disposers.push(
    effect(() => {
      void $undoStack.value;
      updateUndoButton();
    }),
  );

  // --- View changes (wake lock, virtual list pause/resume, ambient mode) ---

  disposers.push(
    effect(() => {
      const currentView = $currentView.value;
      updateViewVisibility();

      // Refresh status indicators on all views
      updateGpsIndicator();
      updateSyncStatusIndicator();

      // Wake Lock: keep screen on during active timing
      if (currentView === 'timer') {
        wakeLockService.enable();
      } else {
        wakeLockService.disable();
      }

      // Ambient Mode: enable only on timer view when setting is enabled
      if (currentView === 'timer' && $settings.value.ambientMode) {
        ambientModeService.enable();
      } else {
        ambientModeService.disable();
      }

      // VirtualList: pause when not on results view to save resources
      const virtualList = getVirtualList();
      if (virtualList) {
        if (currentView === 'results') {
          virtualList.resume();
        } else {
          virtualList.pause();
        }
      }
    }),
  );

  // --- Settings changes ---

  disposers.push(
    effect(() => {
      const settings = $settings.value;
      const currentView = $currentView.value; // Track unconditionally for applyViewServices
      updateSyncStatusIndicator();
      updateGpsIndicator();
      updateJudgeReadyStatus();
      updatePhotoCaptureIndicator();
      applyGlassEffectSettings();

      // Handle ambient mode setting changes
      if (settings.ambientMode) {
        ambientModeService.initialize();
        if (currentView === 'timer') {
          ambientModeService.enable();
        }
      } else {
        ambientModeService.disable();
      }

      // Apply view-specific services (depends on both settings and currentView)
      applyViewServices(store.getState());
    }),
  );

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}
