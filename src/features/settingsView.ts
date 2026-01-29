/**
 * Settings View Module
 * Handles all settings toggles, language, sync configuration, and race ID management
 */

import { store } from '../store';
import { syncService, photoStorage, feedbackTap, feedbackWarning, voiceModeService } from '../services';
import { showToast } from '../components';
import { t } from '../i18n/translations';
import { isValidRaceId } from '../utils/validation';
import { fetchWithTimeout, getElement } from '../utils';
import { logger } from '../utils/logger';
import { AUTH_TOKEN_KEY, hasAuthToken } from '../services/sync';
import { getTodaysRecentRaces, addRecentRace, type RecentRace } from '../utils/recentRaces';
import { attachRecentRaceItemHandlers, renderRecentRaceItems } from '../utils/recentRacesUi';
import { openModal } from './modals';
import { updateGateJudgeTabVisibility } from './gateJudgeView';
import { refreshInlineFaultUI } from './faultEntry';
import { exportResults } from './export';
import { verifyPinForRaceJoin } from './raceManagement';
import type { Language, DeviceRole, RaceInfo } from '../types';

// Module state
let raceCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let raceCheckRequestId = 0;
let settingsRecentRacesDocumentHandler: ((event: MouseEvent) => void) | null = null;
let lastRaceExistsState: { exists: boolean | null; entryCount: number } = { exists: null, entryCount: 0 };

// Callbacks for functions defined in app.ts (injected to avoid circular imports)
let showPhotoSyncWarningModalCallback: (() => Promise<void>) | null = null;
let showRaceChangeDialogCallback: ((type: 'synced' | 'unsynced', lang: Language) => Promise<'export' | 'delete' | 'keep' | 'cancel'>) | null = null;

/**
 * Set callbacks for functions that would cause circular imports if imported directly
 * (app.ts imports from settingsView.ts, so settingsView.ts cannot import from app.ts)
 */
export function setSettingsViewCallbacks(callbacks: {
  showPhotoSyncWarningModal: () => Promise<void>;
  showRaceChangeDialog: (type: 'synced' | 'unsynced', lang: Language) => Promise<'export' | 'delete' | 'keep' | 'cancel'>;
}): void {
  showPhotoSyncWarningModalCallback = callbacks.showPhotoSyncWarningModal;
  showRaceChangeDialogCallback = callbacks.showRaceChangeDialog;
}

/**
 * Initialize settings view
 */
export function initSettingsView(): void {
  // Simple mode toggle
  const simpleModeToggle = getElement<HTMLInputElement>('simple-mode-toggle');
  if (simpleModeToggle) {
    simpleModeToggle.addEventListener('change', () => {
      store.updateSettings({ simple: simpleModeToggle.checked });
      applySettings();
      const adminSection = getElement('admin-section');
      if (adminSection) {
        adminSection.style.display = 'block';
      }
    });
  }

  // GPS toggle
  const gpsToggle = getElement<HTMLInputElement>('gps-toggle');
  if (gpsToggle) {
    gpsToggle.addEventListener('change', () => {
      store.updateSettings({ gps: gpsToggle.checked });
    });
  }

  // Sync toggle - with guard against concurrent invocations
  const syncToggle = getElement<HTMLInputElement>('sync-toggle');
  let syncTogglePending = false;
  if (syncToggle) {
    syncToggle.addEventListener('change', async () => {
      // RACE CONDITION FIX: Guard against concurrent invocations
      if (syncTogglePending) {
        syncToggle.checked = !syncToggle.checked; // Revert toggle
        return;
      }
      syncTogglePending = true;

      try {
        const state = store.getState();

        if (syncToggle.checked && state.raceId) {
          // Require PIN verification when enabling sync with existing race ID
          const pinVerified = await verifyPinForRaceJoin(state.currentLang);
          if (!pinVerified) {
            // PIN verification cancelled or failed - revert toggle
            syncToggle.checked = false;
            return;
          }
        }

        store.updateSettings({ sync: syncToggle.checked });

        // Update sync photos toggle state
        const syncPhotosToggle = getElement<HTMLInputElement>('sync-photos-toggle');
        if (syncPhotosToggle) {
          syncPhotosToggle.disabled = !syncToggle.checked;
          if (!syncToggle.checked) {
            // Disable photo sync when main sync is disabled
            syncPhotosToggle.checked = false;
            store.updateSettings({ syncPhotos: false });
          }
        }

        if (syncToggle.checked && state.raceId) {
          syncService.initialize();
        } else {
          syncService.cleanup();
        }
      } finally {
        syncTogglePending = false;
      }
    });
  }

  // Sync photos toggle
  const syncPhotosToggle = getElement<HTMLInputElement>('sync-photos-toggle');
  if (syncPhotosToggle) {
    syncPhotosToggle.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;

      if (target.checked) {
        // User is enabling photo sync - show warning modal
        e.preventDefault();
        target.checked = false; // Revert toggle until confirmed
        if (showPhotoSyncWarningModalCallback) {
          await showPhotoSyncWarningModalCallback();
        }
      } else {
        // Disabling photo sync - no confirmation needed
        store.updateSettings({ syncPhotos: false });
      }
    });
  }

  // Auto-increment toggle
  const autoToggle = getElement<HTMLInputElement>('auto-toggle');
  if (autoToggle) {
    autoToggle.addEventListener('change', () => {
      store.updateSettings({ auto: autoToggle.checked });
    });
  }

  // Haptic toggle
  const hapticToggle = getElement<HTMLInputElement>('haptic-toggle');
  if (hapticToggle) {
    hapticToggle.addEventListener('change', () => {
      store.updateSettings({ haptic: hapticToggle.checked });
    });
  }

  // Sound toggle
  const soundToggle = getElement<HTMLInputElement>('sound-toggle');
  if (soundToggle) {
    soundToggle.addEventListener('change', () => {
      store.updateSettings({ sound: soundToggle.checked });
    });
  }

  // Ambient mode toggle
  const ambientModeToggle = getElement<HTMLInputElement>('ambient-mode-toggle');
  if (ambientModeToggle) {
    ambientModeToggle.addEventListener('change', () => {
      store.updateSettings({ ambientMode: ambientModeToggle.checked });
    });
  }

  // Voice mode toggle
  initVoiceModeToggle();

  // Photo capture toggle
  const photoToggle = getElement<HTMLInputElement>('photo-toggle');
  if (photoToggle) {
    photoToggle.addEventListener('change', () => {
      store.updateSettings({ photoCapture: photoToggle.checked });
    });
  }

  // Language toggle
  const langToggle = getElement('lang-toggle');
  if (langToggle) {
    langToggle.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const lang = target.getAttribute('data-lang') as 'de' | 'en';
      if (lang && lang !== store.getState().currentLang) {
        store.setLanguage(lang);
        updateTranslations();
        updateLangToggle();
      }
    });
  }

  // Race ID input
  const raceIdInput = getElement<HTMLInputElement>('race-id-input');
  let raceIdChangePending = false;
  if (raceIdInput) {
    // Debounced race exists check on input
    raceIdInput.addEventListener('input', () => {
      if (raceCheckTimeout) clearTimeout(raceCheckTimeout);
      const raceId = raceIdInput.value.trim();
      if (raceId) {
        raceCheckTimeout = setTimeout(() => checkRaceExists(raceId), 500);
      } else {
        updateRaceExistsIndicator(null, 0);
      }
    });

    raceIdInput.addEventListener('change', async () => {
      // RACE CONDITION FIX: Guard against concurrent invocations
      if (raceIdChangePending) {
        return; // Ignore if already processing
      }
      raceIdChangePending = true;

      try {
        const newRaceId = raceIdInput.value.trim();
        const state = store.getState();
        const hasEntries = state.entries.length > 0;
        const wasPreviouslySynced = state.lastSyncedRaceId !== '';
        const isChangingRace = newRaceId !== state.raceId && newRaceId !== '';

        if (hasEntries && isChangingRace && showRaceChangeDialogCallback) {
          if (wasPreviouslySynced) {
            // Was synced with another race - ask to export or delete
            const action = await showRaceChangeDialogCallback('synced', state.currentLang);
            if (action === 'export') {
              exportResults();
              store.clearAll();
              await photoStorage.clearAll();
            } else if (action === 'delete') {
              store.clearAll();
              await photoStorage.clearAll();
            } else {
              // Cancelled - restore old race ID
              raceIdInput.value = state.raceId;
              return;
            }
          } else {
            // Not previously synced - ask to keep or delete
            const action = await showRaceChangeDialogCallback('unsynced', state.currentLang);
            if (action === 'delete') {
              store.clearAll();
              await photoStorage.clearAll();
            } else if (action === 'cancel') {
              // Cancelled - restore old race ID
              raceIdInput.value = state.raceId;
              return;
            }
            // 'keep' - do nothing with entries
          }
        }

        // Validate race ID format (allow empty to clear)
        if (newRaceId && !isValidRaceId(newRaceId)) {
          showToast(t('invalidRaceId', state.currentLang), 'error');
          raceIdInput.value = state.raceId;
          feedbackWarning();
          return;
        }

        // Verify PIN before joining race if sync is enabled
        if (state.settings.sync && newRaceId) {
          const pinVerified = await verifyPinForRaceJoin(state.currentLang);
          if (!pinVerified) {
            // PIN verification cancelled or failed - restore old race ID
            raceIdInput.value = state.raceId;
            return;
          }
        }

        // Cleanup old sync service before changing race ID (fixes BroadcastChannel leak)
        if (state.settings.sync && state.raceId) {
          syncService.cleanup();
        }

        // Normalize race ID to lowercase (aligns with server-side normalization)
        const normalizedRaceId = newRaceId.toLowerCase();
        raceIdInput.value = normalizedRaceId; // Update UI to show normalized value

        store.setRaceId(normalizedRaceId);
        if (state.settings.sync && normalizedRaceId) {
          syncService.initialize();
          store.markCurrentRaceAsSynced();
        }
      } finally {
        raceIdChangePending = false;
      }
    });
  }

  // Settings recent races button
  const settingsRecentRacesBtn = getElement('settings-recent-races-btn');
  const settingsRecentRacesDropdown = getElement('settings-recent-races-dropdown');
  if (settingsRecentRacesBtn && settingsRecentRacesDropdown) {
    settingsRecentRacesBtn.addEventListener('click', () => {
      feedbackTap();
      if (settingsRecentRacesDropdown.style.display === 'none') {
        showSettingsRecentRacesDropdown(settingsRecentRacesDropdown);
      } else {
        settingsRecentRacesDropdown.style.display = 'none';
      }
    });

    // Close dropdown when clicking outside
    if (!settingsRecentRacesDocumentHandler) {
      settingsRecentRacesDocumentHandler = (e) => {
        const target = e.target as Node;
        if (!settingsRecentRacesBtn.contains(target) && !settingsRecentRacesDropdown.contains(target)) {
          settingsRecentRacesDropdown.style.display = 'none';
        }
      };
      document.addEventListener('click', settingsRecentRacesDocumentHandler);
    }
  }

  // Device name input
  const deviceNameInput = getElement<HTMLInputElement>('device-name-input');
  if (deviceNameInput) {
    deviceNameInput.addEventListener('change', () => {
      store.setDeviceName(deviceNameInput.value.trim());
    });
  }

  // Device Role toggle
  initRoleToggle();

  // Advanced settings collapsible toggle
  initAdvancedSettingsToggle();
}

/**
 * Initialize advanced settings collapsible toggle
 */
function initAdvancedSettingsToggle(): void {
  const toggle = getElement('advanced-settings-toggle');
  const section = getElement('advanced-settings-section');
  if (!toggle || !section) return;

  toggle.setAttribute('role', 'button');
  // Start expanded by default
  toggle.setAttribute('aria-expanded', section.classList.contains('expanded') ? 'true' : 'false');
  toggle.addEventListener('click', () => {
    const isExpanded = section.classList.toggle('expanded');
    toggle.setAttribute('aria-expanded', String(isExpanded));
    feedbackTap();
  });
}

/**
 * Initialize role toggle in settings
 */
export function initRoleToggle(): void {
  const roleToggle = getElement('role-toggle');
  if (!roleToggle) return;

  roleToggle.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.role-card-setting');
    if (!card) return;

    const role = card.getAttribute('data-role') as DeviceRole;
    if (role && role !== store.getState().deviceRole) {
      store.setDeviceRole(role);
      updateRoleToggle();
      updateGateJudgeTabVisibility();
      feedbackTap();

      // If switching to gateJudge and no gate assignment, show assignment modal
      if (role === 'gateJudge' && !store.getState().gateAssignment) {
        openModal(getElement('gate-assignment-modal'));
      }

      // If switching away from gateJudge while on gateJudge view, go to timer
      if (role !== 'gateJudge' && store.getState().currentView === 'gateJudge') {
        store.setView('timer');
      }
    }
  });
}

/**
 * Update role toggle UI
 */
export function updateRoleToggle(): void {
  const roleToggle = getElement('role-toggle');
  if (!roleToggle) return;

  const state = store.getState();
  roleToggle.querySelectorAll('.role-card-setting').forEach(card => {
    const role = card.getAttribute('data-role');
    card.classList.toggle('active', role === state.deviceRole);
  });
}

/**
 * Update settings inputs
 */
export function updateSettingsInputs(): void {
  const state = store.getState();
  const { settings } = state;

  const simpleModeToggle = getElement<HTMLInputElement>('simple-mode-toggle');
  const gpsToggle = getElement<HTMLInputElement>('gps-toggle');
  const syncToggle = getElement<HTMLInputElement>('sync-toggle');
  const autoToggle = getElement<HTMLInputElement>('auto-toggle');
  const hapticToggle = getElement<HTMLInputElement>('haptic-toggle');
  const soundToggle = getElement<HTMLInputElement>('sound-toggle');
  const photoToggle = getElement<HTMLInputElement>('photo-toggle');

  if (simpleModeToggle) simpleModeToggle.checked = settings.simple;

  // Hide admin section in simple mode
  const adminSection = getElement('admin-section');
  if (adminSection) {
    adminSection.style.display = 'block';
  }

  if (gpsToggle) gpsToggle.checked = settings.gps;
  if (syncToggle) syncToggle.checked = settings.sync;
  if (autoToggle) autoToggle.checked = settings.auto;
  if (hapticToggle) hapticToggle.checked = settings.haptic;
  if (soundToggle) soundToggle.checked = settings.sound;
  if (photoToggle) photoToggle.checked = settings.photoCapture;

  // Update ambient mode toggle
  const ambientModeToggle = getElement<HTMLInputElement>('ambient-mode-toggle');
  if (ambientModeToggle) ambientModeToggle.checked = settings.ambientMode;

  // Update sync photos toggle (enabled only when sync is enabled)
  const syncPhotosToggle = getElement<HTMLInputElement>('sync-photos-toggle');
  if (syncPhotosToggle) {
    syncPhotosToggle.checked = settings.syncPhotos;
    syncPhotosToggle.disabled = !settings.sync;
  }

  const raceIdInput = getElement<HTMLInputElement>('race-id-input');
  if (raceIdInput) raceIdInput.value = state.raceId;

  const deviceNameInput = getElement<HTMLInputElement>('device-name-input');
  if (deviceNameInput) deviceNameInput.value = state.deviceName;

  // Update language toggle
  updateLangToggle();
}

/**
 * Update language toggle UI
 */
export function updateLangToggle(): void {
  const lang = store.getState().currentLang;
  const langToggle = getElement('lang-toggle');
  if (langToggle) {
    langToggle.querySelectorAll('.lang-option').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-lang') === lang);
    });
  }
}

/**
 * Initialize voice mode toggle
 */
function initVoiceModeToggle(): void {
  const voiceModeToggle = getElement<HTMLInputElement>('voice-mode-toggle');
  const voiceModeRow = getElement('voice-mode-row');

  if (!voiceModeToggle || !voiceModeRow) return;

  // Hide voice mode if not supported
  if (!voiceModeService.isSupported()) {
    voiceModeRow.style.display = 'none';
    return;
  }

  // Set initial state from voice service
  voiceModeToggle.checked = voiceModeService.isActive();

  voiceModeToggle.addEventListener('change', async () => {
    const lang = store.getState().currentLang;

    if (voiceModeToggle.checked) {
      // Check if online
      if (!navigator.onLine) {
        showToast(t('voiceOffline', lang), 'warning');
        voiceModeToggle.checked = false;
        return;
      }

      // Enable voice mode - this will initialize the service if needed
      // Note: Voice mode requires LLM API configuration which would be set up
      // in app.ts during initialization
      const success = voiceModeService.enable();
      if (!success) {
        showToast(t('voiceError', lang), 'error');
        voiceModeToggle.checked = false;
      }
    } else {
      voiceModeService.disable();
    }
  });
}

/**
 * Update translations
 */
export function updateTranslations(): void {
  const lang = store.getState().currentLang as Language;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key, lang);
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      (el as HTMLInputElement).placeholder = t(key, lang);
    }
  });

  // Update dynamically set text that depends on language
  updateRaceExistsIndicator(lastRaceExistsState.exists, lastRaceExistsState.entryCount);
}

/**
 * Apply settings (show/hide UI based on simple mode)
 */
export function applySettings(): void {
  // Simple mode deprecated: always show advanced UI and timing points.
  const advancedElements = document.querySelectorAll('[data-advanced]');
  advancedElements.forEach(el => {
    (el as HTMLElement).style.display = '';
  });

  const startBtn = document.querySelector('[data-point="S"]') as HTMLElement;
  if (startBtn) {
    startBtn.style.display = '';
  }

  // Apply Liquid Glass UI settings
  applyGlassEffectSettings();
}

/**
 * Apply glass and motion effect settings to the UI
 */
export function applyGlassEffectSettings(): void {
  const settings = store.getState().settings;
  const root = document.documentElement;

  // Glass effects toggle
  if (settings.glassEffects) {
    root.classList.remove('no-glass-effects');
    // Add glass-enabled class to key elements for motion-reactive styles
    document.querySelectorAll('.glass-enable-target').forEach(el => {
      el.classList.add('glass-enabled');
    });
  } else {
    root.classList.add('no-glass-effects');
    document.querySelectorAll('.glass-enabled').forEach(el => {
      el.classList.remove('glass-enabled');
    });
  }

  // DISABLED: Motion effects disabled to save battery
  root.classList.add('no-motion-effects');

  // Outdoor mode toggle (high contrast)
  if (settings.outdoorMode) {
    root.classList.add('outdoor-mode');
  } else {
    root.classList.remove('outdoor-mode');
  }
}

/**
 * Check if race exists in cloud
 * Uses request ID to ignore stale responses from previous requests
 */
export async function checkRaceExists(raceId: string): Promise<void> {
  // Increment request ID to track this request
  const currentRequestId = ++raceCheckRequestId;

  const result = await syncService.checkRaceExists(raceId);

  // Ignore stale response if a newer request was made while this one was in flight
  if (currentRequestId !== raceCheckRequestId) {
    return;
  }

  store.setRaceExistsInCloud(result.exists);
  updateRaceExistsIndicator(result.exists, result.entryCount);
}

/**
 * Show settings recent races dropdown and populate with today's races
 * Fetches from API if authenticated, falls back to localStorage
 */
export async function showSettingsRecentRacesDropdown(dropdown: HTMLElement): Promise<void> {
  const lang = store.getState().currentLang;

  // Show loading state
  dropdown.innerHTML = `<div class="recent-races-empty">${t('loading', lang)}</div>`;
  dropdown.style.display = 'block';

  // Try to fetch from API if authenticated
  let races: RecentRace[] = [];

  if (hasAuthToken()) {
    try {
      races = await fetchRacesFromApi();
    } catch (error) {
      logger.warn('Failed to fetch races from API:', error);
      // Fall back to localStorage
      races = getTodaysRecentRaces();
    }
  } else {
    // Not authenticated - use localStorage
    races = getTodaysRecentRaces();
  }

  if (races.length === 0) {
    dropdown.innerHTML = `<div class="recent-races-empty">${t('noRecentRaces', lang)}</div>`;
  } else {
    dropdown.innerHTML = renderRecentRaceItems(races);
    attachRecentRaceItemHandlers(dropdown, races, (race) => {
      selectSettingsRecentRace(race, dropdown);
    });
  }
}

/**
 * Fetch races from the admin API
 * Returns races filtered to today only, formatted as RecentRace
 */
export async function fetchRacesFromApi(): Promise<RecentRace[]> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    return [];
  }

  const response = await fetchWithTimeout('/api/v1/admin/races', {
    headers: { 'Authorization': `Bearer ${token}` }
  }, 5000);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const raceInfos: RaceInfo[] = data.races || [];

  // Filter to today's races and convert to RecentRace format
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  const todaysRaces = raceInfos
    .filter(race => race.lastUpdated && race.lastUpdated >= todayStart)
    .map(race => ({
      raceId: race.raceId,
      createdAt: race.lastUpdated || Date.now(),
      lastUpdated: race.lastUpdated || Date.now(),
      entryCount: race.entryCount
    }))
    .slice(0, 5);

  // Also update localStorage with fetched races for future use
  todaysRaces.forEach(race => {
    addRecentRace(race.raceId, race.lastUpdated, race.entryCount);
  });

  return todaysRaces;
}

/**
 * Select a recent race and fill the settings race ID input
 */
export function selectSettingsRecentRace(race: RecentRace, dropdown: HTMLElement): void {
  const input = getElement<HTMLInputElement>('race-id-input');
  if (input) {
    input.value = race.raceId;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    feedbackTap();
  }
  dropdown.style.display = 'none';
}

/**
 * Update race exists indicator UI
 */
export function updateRaceExistsIndicator(exists: boolean | null, entryCount: number): void {
  // Store state for language updates
  lastRaceExistsState = { exists, entryCount };

  const indicator = getElement('race-exists-indicator');
  const textEl = getElement('race-exists-text');
  const lang = store.getState().currentLang;

  if (!indicator || !textEl) return;

  if (exists === null) {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'inline-flex';
  indicator.classList.remove('found', 'new');

  if (exists) {
    indicator.classList.add('found');
    if (entryCount > 0) {
      const cloudText = entryCount === 1 ? t('entryInCloud', lang) : t('entriesInCloud', lang);
      textEl.textContent = `${entryCount} ${cloudText}`;
    } else {
      textEl.textContent = t('raceFound', lang);
    }
  } else {
    indicator.classList.add('new');
    textEl.textContent = t('raceNew', lang);
  }
}

/**
 * Cleanup settings timeouts (for page unload)
 */
export function cleanupSettingsTimeouts(): void {
  if (raceCheckTimeout) {
    clearTimeout(raceCheckTimeout);
    raceCheckTimeout = null;
  }
}
