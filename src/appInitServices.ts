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
  ambientModeService,
  gpsService,
  resumeAudio,
  syncService,
  wakeLockService,
} from './services';
import { cameraService } from './services/camera';
import { hasAuthToken } from './services/sync';
import { store } from './store';
import { ListenerManager } from './utils/listenerManager';
import { applyViewServices } from './utils/viewServices';

const listeners = new ListenerManager();

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

  // Initialize ambient mode if enabled
  if (initialState.settings.ambientMode) {
    ambientModeService.initialize();
    if (initialState.currentView === 'timer') {
      ambientModeService.enable();
    }
  }

  // Subscribe to ambient mode state changes
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
  let prevPhotoCapture = initialState.settings.photoCapture;
  store.subscribe((state, changedKeys) => {
    if (changedKeys.includes('settings')) {
      const currentPhotoCapture = state.settings.photoCapture;
      if (prevPhotoCapture && !currentPhotoCapture) {
        cameraService.stop();
      }
      prevPhotoCapture = currentPhotoCapture;
    }
  });

  // Initialize voice mode service
  initVoiceMode();
}
