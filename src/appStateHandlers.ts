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
  $settingsAmbientMode,
  $settingsGlassEffects,
  $settingsGps,
  $settingsOutdoorMode,
  $settingsPhotoCapture,
  $settingsSync,
  $settingsSyncPhotos,
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

  // --- Settings changes (split into targeted effects for performance) ---

  // 1. Sync indicator: tracks sync and syncPhotos settings
  disposers.push(
    effect(() => {
      void $settingsSync.value;
      void $settingsSyncPhotos.value;
      updateSyncStatusIndicator();
    }),
  );

  // 2. GPS + view services: tracks GPS setting and current view
  disposers.push(
    effect(() => {
      void $settingsGps.value;
      void $currentView.value;
      updateGpsIndicator();
      applyViewServices(store.getState());
    }),
  );

  // 3. Photo capture: tracks photoCapture setting and current view
  disposers.push(
    effect(() => {
      void $settingsPhotoCapture.value;
      void $currentView.value;
      updatePhotoCaptureIndicator();
      applyViewServices(store.getState());
    }),
  );

  // 4. Glass effects: tracks glassEffects and outdoorMode settings
  disposers.push(
    effect(() => {
      void $settingsGlassEffects.value;
      void $settingsOutdoorMode.value;
      applyGlassEffectSettings();
    }),
  );

  // 5. Ambient mode: tracks ambientMode setting and current view
  disposers.push(
    effect(() => {
      const ambientMode = $settingsAmbientMode.value;
      const currentView = $currentView.value;
      if (ambientMode) {
        ambientModeService.initialize();
        if (currentView === 'timer') {
          ambientModeService.enable();
        }
      } else {
        ambientModeService.disable();
      }
    }),
  );

  // 6. Judge ready: tracks sync and GPS settings
  disposers.push(
    effect(() => {
      void $settingsSync.value;
      void $settingsGps.value;
      updateJudgeReadyStatus();
    }),
  );

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}
