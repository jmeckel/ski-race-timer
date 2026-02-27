import { gpsService } from '../services';
import type { AppState } from '../types';
import { logger } from './logger';

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
 * Lazy-loads camera module — only needed when photo capture is enabled.
 */
export async function applyCameraService(
  state: Readonly<AppState>,
): Promise<void> {
  const isTimerView = state.currentView === 'timer';

  if (isTimerView && state.settings.photoCapture) {
    const { cameraService } = await import('../services/camera');
    void cameraService.initialize().catch((error) => {
      logger.error('[Camera] Failed to initialize from view service:', error);
    });
  } else if (state.settings.photoCapture) {
    // Only stop if photo capture was enabled (camera may have been loaded)
    const { cameraService } = await import('../services/camera');
    cameraService.stop();
  }
}

/**
 * Apply view-specific service behavior to reduce battery drain.
 */
export function applyViewServices(state: Readonly<AppState>): void {
  applyGpsService(state);
  void applyCameraService(state);
}
