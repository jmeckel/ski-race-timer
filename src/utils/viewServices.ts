import { cameraService, gpsService } from '../services';
import type { AppState } from '../types';

/**
 * Apply GPS service behavior based on current view and settings.
 */
export function applyGpsService(state: Readonly<AppState>): void {
  const isTimerView = state.currentView === 'timer';

  if (isTimerView && state.settings.gps) {
    gpsService.start();
  } else if (state.settings.gps) {
    gpsService.pause();
  } else {
    gpsService.stop();
  }
}

/**
 * Apply camera service behavior based on current view and settings.
 */
export function applyCameraService(state: Readonly<AppState>): void {
  const isTimerView = state.currentView === 'timer';

  if (isTimerView && state.settings.photoCapture) {
    cameraService.initialize();
  } else {
    cameraService.stop();
  }
}

/**
 * Apply view-specific service behavior to reduce battery drain.
 */
export function applyViewServices(state: Readonly<AppState>): void {
  applyGpsService(state);
  applyCameraService(state);
}
