import {
  handleStorageError,
  handleStorageWarning,
  initVoiceMode,
} from './appEventListeners';
import { showToast } from './components';
import { handleAuthExpired, handleRaceDeleted } from './features/race';
import { applySettings } from './features/settingsView';
import { t } from './i18n/translations';
import {
  gpsService,
  resumeAudio,
  syncService,
  wakeLockService,
} from './services';
import { ambientModeService } from './services/ambient';
import { hasAuthToken } from './services/sync';
import { $settingsPhotoCapture, effect, store } from './store';
import { ListenerManager } from './utils/listenerManager';
import { applyViewServices } from './utils/viewServices';

const listeners = new ListenerManager();
let photoEffectDisposer: (() => void) | null = null;

/**
 * Initialize application services (sync, GPS, wake lock, ambient mode, voice)
 */
export function initServices(): void {
  const settings = store.getState().settings;

  // Auto-start sync if enabled, race ID exists, AND user has valid auth token
  if (settings.sync && store.getState().raceId) {
    if (hasAuthToken()) {
      syncService.initialize();
    } else {
      store.updateSettings({ sync: false });
      const syncToggle = document.getElementById(
        'sync-toggle',
      ) as HTMLInputElement;
      if (syncToggle) syncToggle.checked = false;
      setTimeout(() => {
        const lang = store.getState().currentLang;
        showToast(t('syncRequiresPin', lang), 'info', 5000);
      }, 500);
    }
  }
  applyViewServices(store.getState());

  // Listen for race deleted events from sync service
  listeners.add(window, 'race-deleted', handleRaceDeleted as EventListener);

  // Listen for auth expired events from sync service
  listeners.add(window, 'auth-expired', handleAuthExpired as EventListener);

  // Listen for storage errors and warnings
  listeners.add(window, 'storage-error', handleStorageError as EventListener);
  listeners.add(
    window,
    'storage-warning',
    handleStorageWarning as EventListener,
  );

  // Resume audio context on first interaction
  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('touchstart', resumeAudio, { once: true });

  // Apply initial settings
  applySettings();

  // Enable wake lock if starting on timer view
  const initialState = store.getState();
  if (initialState.currentView === 'timer') {
    wakeLockService.enable();
  }

  // Ambient mode initialization is handled reactively in appStateHandlers.ts
  // Subscribe to ambient mode state changes (CSS class, GPS pause/resume)
  ambientModeService.subscribe((state) => {
    document.body.classList.toggle('ambient-mode', state.isActive);
    if (state.triggeredBy) {
      document.body.dataset.ambientTrigger = state.triggeredBy;
    } else {
      delete document.body.dataset.ambientTrigger;
    }

    // Pause/resume GPS during ambient mode to save battery
    const appState = store.getState();
    if (appState.settings.gps) {
      if (state.isActive) {
        gpsService.pause();
      } else if (appState.currentView === 'timer') {
        gpsService.start();
      }
    }
  });

  // Stop camera immediately when photo capture setting is disabled
  // Dispose previous effect if re-initialized
  if (photoEffectDisposer) photoEffectDisposer();
  let prevPhotoCapture = initialState.settings.photoCapture;
  photoEffectDisposer = effect(() => {
    const currentPhotoCapture = $settingsPhotoCapture.value;
    if (prevPhotoCapture && !currentPhotoCapture) {
      // Lazy-load camera service — only needed when disabling photo capture
      void import('./services/camera').then(({ cameraService }) => {
        cameraService.stop();
      });
    }
    prevPhotoCapture = currentPhotoCapture;
  });

  // Initialize voice mode service
  initVoiceMode();
}

/**
 * Dispose the photo-capture signal effect (called from handleBeforeUnload)
 */
export function disposePhotoEffect(): void {
  photoEffectDisposer?.();
  photoEffectDisposer = null;
}
