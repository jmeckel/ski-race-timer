import type { AppState } from '../types';
import { cameraService, gpsService } from '../services';

/**
 * Apply view-specific service behavior to reduce battery drain.
 */
export function applyViewServices(state: Readonly<AppState>): void {
  const isTimerView = state.currentView === 'timer';

  if (isTimerView && state.settings.gps) {
    gpsService.start();
  } else if (state.settings.gps) {
    gpsService.pause();
  } else {
    gpsService.stop();
  }

  const needsCamera = state.settings.photoCapture || state.settings.autoFinishTiming;
  if (isTimerView && needsCamera) {
    cameraService.initialize();
  } else {
    cameraService.stop();
  }
}
