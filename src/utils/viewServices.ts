import { cameraService, gpsService } from '../services';
import type { AppState } from '../types';

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

  if (isTimerView && state.settings.photoCapture) {
    cameraService.initialize();
  } else {
    cameraService.stop();
  }
}
