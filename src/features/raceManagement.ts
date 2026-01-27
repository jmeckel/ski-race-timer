/**
 * Race Management Module
 * Handles PIN management, race CRUD, auth flows, and race management modals
 */

import { store } from '../store';
import { showToast } from '../components';
import { syncService } from '../services';
import { AUTH_TOKEN_KEY, hasAuthToken, exchangePinForToken, clearAuthToken } from '../services/sync';
import { feedbackSuccess, feedbackWarning, feedbackDelete } from '../services';
import { logError, logWarning, fetchWithTimeout, escapeHtml } from '../utils';
import { t } from '../i18n/translations';
import { closeModal } from './modals';
import type { Language, RaceInfo } from '../types';

// Admin API configuration
const ADMIN_API_BASE = '/api/v1/admin/races';

// Module state
const DEFAULT_ADMIN_PIN = '1111'; // Default client PIN (synced across devices)
let pendingRaceDelete: string | null = null;

// Resolver for PIN verification promise (used by closeAllModals cleanup)
let pinVerifyResolver: ((verified: boolean) => void) | null = null;
// Flag to indicate Chief Judge verification (requires chiefJudge role token)
let pinVerifyForChiefJudge = false;

/**
 * Get authorization headers for API requests
 * Uses JWT token for authentication
 */
function getAdminAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
}

/**
 * Check if user is authenticated (has valid token)
 */
export function isAuthenticated(): boolean {
  return hasAuthToken();
}

/**
 * Authenticate with PIN and get JWT token
 * Returns true if authentication succeeded
 * @param pin - The 4-digit PIN
 * @param role - Optional role to request ('timer' | 'gateJudge' | 'chiefJudge')
 */
export async function authenticateWithPin(pin: string, role?: 'timer' | 'gateJudge' | 'chiefJudge'): Promise<{ success: boolean; error?: string; isNewPin?: boolean }> {
  const result = await exchangePinForToken(pin, role);
  if (result.success) {
    updatePinStatusDisplay();
  }
  return result;
}

/**
 * Show race change dialog
 */
export function showRaceChangeDialog(type: 'synced' | 'unsynced', lang: Language): Promise<'export' | 'delete' | 'keep' | 'cancel'> {
  return new Promise((resolve) => {
    const modal = document.getElementById('race-change-modal');
    if (!modal) {
      resolve('cancel');
      return;
    }

    const title = modal.querySelector('.modal-title') as HTMLElement;
    const text = modal.querySelector('.modal-text') as HTMLElement;
    const exportBtn = document.getElementById('race-change-export-btn');
    const deleteBtn = document.getElementById('race-change-delete-btn');
    const keepBtn = document.getElementById('race-change-keep-btn');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');

    if (type === 'synced') {
      if (title) title.textContent = t('raceChangeTitle', lang);
      if (text) text.textContent = t('raceChangeSyncedText', lang);
      if (exportBtn) exportBtn.style.display = '';
      if (keepBtn) keepBtn.style.display = 'none';
    } else {
      if (title) title.textContent = t('raceChangeTitle', lang);
      if (text) text.textContent = t('raceChangeUnsyncedText', lang);
      if (exportBtn) exportBtn.style.display = 'none';
      if (keepBtn) keepBtn.style.display = '';
    }

    const cleanup = () => {
      closeModal(modal);
      exportBtn?.removeEventListener('click', handleExport);
      deleteBtn?.removeEventListener('click', handleDelete);
      keepBtn?.removeEventListener('click', handleKeep);
      cancelBtn?.removeEventListener('click', handleCancel);
    };

    const handleExport = () => { cleanup(); resolve('export'); };
    const handleDelete = () => { cleanup(); resolve('delete'); };
    const handleKeep = () => { cleanup(); resolve('keep'); };
    const handleCancel = () => { cleanup(); resolve('cancel'); };

    exportBtn?.addEventListener('click', handleExport);
    deleteBtn?.addEventListener('click', handleDelete);
    keepBtn?.addEventListener('click', handleKeep);
    cancelBtn?.addEventListener('click', handleCancel);

    modal.classList.add('show');
  });
}

/**
 * Initialize admin PIN - sync from cloud or set default
 */
async function initializeAdminPin(): Promise<void> {
  // If we already have a valid token, we're done
  if (hasAuthToken()) {
    return;
  }

  // Try to authenticate with default PIN
  // This will either:
  // 1. Set the default PIN in Redis and return a token (if no PIN exists)
  // 2. Authenticate with existing default PIN (if it matches)
  // 3. Fail (if a different PIN is set in Redis)
  await authenticateWithPin(DEFAULT_ADMIN_PIN);
}

/**
 * Validate PIN format: exactly 4 digits
 */
function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Filter input to only allow numeric digits
 */
function filterNumericInput(input: HTMLInputElement): void {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^0-9]/g, '');
  });
}

/**
 * Update PIN status display
 */
export function updatePinStatusDisplay(): void {
  const lang = store.getState().currentLang;
  const authenticated = hasAuthToken();
  const statusEl = document.getElementById('admin-pin-status');
  const btnTextEl = document.getElementById('change-pin-btn-text');

  if (statusEl) {
    statusEl.textContent = authenticated ? t('pinSet', lang) : t('pinNotSet', lang);
  }
  if (btnTextEl) {
    btnTextEl.textContent = authenticated ? t('changePin', lang) : t('setPin', lang);
  }
}

/**
 * Initialize race management
 */
export function initRaceManagement(): void {
  // Initialize admin PIN (sync from cloud or set default) - fire and forget
  initializeAdminPin().then(() => {
    // Update PIN status display after sync completes
    updatePinStatusDisplay();
  });

  // Update PIN status display immediately (will be updated again after sync)
  updatePinStatusDisplay();

  // Change PIN button
  const changePinBtn = document.getElementById('change-pin-btn');
  if (changePinBtn) {
    changePinBtn.addEventListener('click', handleChangePinClick);
  }

  // Save PIN button
  const savePinBtn = document.getElementById('save-pin-btn');
  if (savePinBtn) {
    savePinBtn.addEventListener('click', handleSavePin);
  }

  // Filter numeric input for all PIN fields
  const pinInputs = [
    'admin-pin-verify-input',
    'current-pin-input',
    'new-pin-input',
    'confirm-pin-input'
  ];
  pinInputs.forEach(id => {
    const input = document.getElementById(id) as HTMLInputElement;
    if (input) filterNumericInput(input);
  });

  // Manage races button
  const manageRacesBtn = document.getElementById('manage-races-btn');
  if (manageRacesBtn) {
    manageRacesBtn.addEventListener('click', handleManageRacesClick);
  }

  // Admin PIN modal verify button - handles both race join and race management
  const adminPinVerifyBtn = document.getElementById('admin-pin-verify-btn');
  if (adminPinVerifyBtn) {
    adminPinVerifyBtn.addEventListener('click', () => {
      if (pinVerifyResolver) {
        handleRaceJoinPinVerify();
      } else {
        handleAdminPinVerify();
      }
    });
  }

  // Admin PIN modal input - verify on Enter
  const adminPinVerifyInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  if (adminPinVerifyInput) {
    adminPinVerifyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (pinVerifyResolver) {
          handleRaceJoinPinVerify();
        } else {
          handleAdminPinVerify();
        }
      }
    });
  }

  // Admin PIN modal cancel - handle race join cancellation
  const adminPinModal = document.getElementById('admin-pin-modal');
  if (adminPinModal) {
    adminPinModal.addEventListener('click', (e) => {
      if (e.target === adminPinModal && pinVerifyResolver) {
        cancelRaceJoinPinVerify();
      }
    });
  }

  // Race deleted modal OK button
  const raceDeletedOkBtn = document.getElementById('race-deleted-ok-btn');
  if (raceDeletedOkBtn) {
    raceDeletedOkBtn.addEventListener('click', () => {
      const modal = document.getElementById('race-deleted-modal');
      closeModal(modal);
    });
  }

  // Refresh races button
  const refreshRacesBtn = document.getElementById('refresh-races-btn');
  if (refreshRacesBtn) {
    refreshRacesBtn.addEventListener('click', loadRaceList);
  }

  // Confirm delete race button
  const confirmDeleteRaceBtn = document.getElementById('confirm-delete-race-btn');
  if (confirmDeleteRaceBtn) {
    confirmDeleteRaceBtn.addEventListener('click', handleConfirmDeleteRace);
  }

  // Photo sync modal setup
  setupPhotoSyncModal();
}

/**
 * Handle change PIN button click
 */
function handleChangePinClick(): void {
  const lang = store.getState().currentLang;
  const authenticated = hasAuthToken();
  const modal = document.getElementById('change-pin-modal');
  const modalTitle = document.getElementById('change-pin-modal-title');
  const currentPinRow = document.getElementById('current-pin-row');
  const currentPinInput = document.getElementById('current-pin-input') as HTMLInputElement;
  const newPinInput = document.getElementById('new-pin-input') as HTMLInputElement;
  const confirmPinInput = document.getElementById('confirm-pin-input') as HTMLInputElement;

  if (!modal) return;

  // Clear all inputs and errors
  if (currentPinInput) currentPinInput.value = '';
  if (newPinInput) newPinInput.value = '';
  if (confirmPinInput) confirmPinInput.value = '';
  hideAllPinErrors();

  // Show/hide current PIN field based on whether PIN is already set
  if (authenticated) {
    // Changing existing PIN - show current PIN field
    if (currentPinRow) currentPinRow.style.display = 'block';
    if (modalTitle) modalTitle.textContent = t('changePin', lang);
  } else {
    // Setting new PIN - hide current PIN field
    if (currentPinRow) currentPinRow.style.display = 'none';
    if (modalTitle) modalTitle.textContent = t('setPin', lang);
  }

  modal.classList.add('show');

  // Focus appropriate input
  if (authenticated && currentPinInput) {
    currentPinInput.focus();
  } else if (newPinInput) {
    newPinInput.focus();
  }
}

/**
 * Hide all PIN error messages
 */
function hideAllPinErrors(): void {
  const errorIds = ['current-pin-error', 'pin-mismatch-error', 'pin-format-error'];
  errorIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

/**
 * Handle save PIN button click
 */
async function handleSavePin(): Promise<void> {
  const lang = store.getState().currentLang;
  const authenticated = hasAuthToken();
  const currentPinInput = document.getElementById('current-pin-input') as HTMLInputElement;
  const newPinInput = document.getElementById('new-pin-input') as HTMLInputElement;
  const confirmPinInput = document.getElementById('confirm-pin-input') as HTMLInputElement;
  const currentPinError = document.getElementById('current-pin-error');
  const pinMismatchError = document.getElementById('pin-mismatch-error');
  const pinFormatError = document.getElementById('pin-format-error');

  hideAllPinErrors();

  // If already authenticated (PIN exists), verify current PIN first
  if (authenticated) {
    const currentPin = currentPinInput?.value || '';

    // Verify current PIN by trying to authenticate with it
    const verifyResult = await exchangePinForToken(currentPin);
    if (!verifyResult.success) {
      if (currentPinError) currentPinError.style.display = 'block';
      if (currentPinInput) {
        currentPinInput.value = '';
        currentPinInput.focus();
      }
      feedbackWarning();
      return;
    }
  }

  const newPin = newPinInput?.value || '';
  const confirmPin = confirmPinInput?.value || '';

  // Validate new PIN format (exactly 4 digits)
  if (!isValidPin(newPin)) {
    if (pinFormatError) pinFormatError.style.display = 'block';
    if (newPinInput) {
      newPinInput.focus();
    }
    feedbackWarning();
    return;
  }

  // Verify PINs match
  if (newPin !== confirmPin) {
    if (pinMismatchError) pinMismatchError.style.display = 'block';
    if (confirmPinInput) {
      confirmPinInput.value = '';
      confirmPinInput.focus();
    }
    feedbackWarning();
    return;
  }

  // Update PIN in Redis via admin/pin API
  const newPinHash = await hashPin(newPin);
  try {
    const response = await fetch('/api/v1/admin/pin', {
      method: 'POST',
      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pinHash: newPinHash })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Clear old token and get new one with new PIN
    clearAuthToken();
    const authResult = await authenticateWithPin(newPin);

    if (!authResult.success) {
      showToast(t('pinSyncFailed', lang), 'error');
      feedbackWarning();
      return;
    }

    // Close modal and show success
    const modal = document.getElementById('change-pin-modal');
    closeModal(modal);

    showToast(t('pinSaved', lang), 'success');
    feedbackSuccess();

    // Update status display
    updatePinStatusDisplay();
  } catch (error) {
    logWarning('Admin', 'handleSavePin', error, 'pinSyncFailed');
    showToast(t('pinSyncFailed', lang), 'error');
    feedbackWarning();
  }
}

/**
 * Cryptographically secure hash function for PIN using SHA-256
 */
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Handle race deleted event from sync service
 */
export function handleRaceDeleted(event: CustomEvent<{ raceId: string; deletedAt: number; message: string }>): void {
  const { raceId, message } = event.detail;
  const lang = store.getState().currentLang;

  // Update modal text
  const textEl = document.getElementById('race-deleted-text');
  if (textEl) {
    textEl.textContent = `${t('raceDeletedFor', lang)} "${raceId}". ${message || t('raceDeletedText', lang)}`;
  }

  // Show modal
  const modal = document.getElementById('race-deleted-modal');
  if (modal) {
    modal.classList.add('show');
  }

  // Disable sync and clear race ID
  store.updateSettings({ sync: false });
  store.setRaceId('');

  // Update UI
  const syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
  if (syncToggle) syncToggle.checked = false;

  const raceIdInput = document.getElementById('race-id-input') as HTMLInputElement;
  if (raceIdInput) raceIdInput.value = '';

  feedbackWarning();
}

/**
 * Handle auth token expired event from sync service
 */
export function handleAuthExpired(event: CustomEvent<{ message: string }>): void {
  const { message } = event.detail;
  const lang = store.getState().currentLang;

  // Show toast notification about session expiry
  showToast(message || 'Session expired. Please re-enter your PIN.', 'warning', 5000);

  // Prompt for PIN re-authentication using existing modal
  verifyPinForRaceJoin(lang).then((verified) => {
    if (verified) {
      // Re-initialize sync after successful authentication
      const state = store.getState();
      if (state.settings.sync && state.raceId) {
        syncService.initialize();
      }
      showToast('Authentication successful', 'success');
    }
  });

  feedbackWarning();
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Show photo sync warning modal with statistics
 */
export async function showPhotoSyncWarningModal(): Promise<void> {
  const modal = document.getElementById('photo-sync-modal');
  if (!modal) return;

  const lang = store.getState().currentLang;

  // Show loading state
  const uploadCountEl = document.getElementById('photos-upload-count');
  const downloadCountEl = document.getElementById('photos-download-count');
  const totalSizeEl = document.getElementById('photos-total-size');

  if (uploadCountEl) uploadCountEl.textContent = t('loading', lang);
  if (downloadCountEl) downloadCountEl.textContent = t('loading', lang);
  if (totalSizeEl) totalSizeEl.textContent = t('loading', lang);

  modal.classList.add('show');

  // Get photo sync statistics
  const stats = await syncService.getPhotoSyncStats();

  // Update modal with stats
  if (uploadCountEl) uploadCountEl.textContent = String(stats.uploadCount);
  if (downloadCountEl) downloadCountEl.textContent = String(stats.downloadCount);
  if (totalSizeEl) totalSizeEl.textContent = formatBytes(stats.totalSize);

  // Update confirm button based on whether there are photos to sync
  const confirmBtn = document.getElementById('photo-sync-confirm-btn');
  if (confirmBtn) {
    const hasPhotos = stats.uploadCount > 0 || stats.downloadCount > 0;
    confirmBtn.textContent = hasPhotos ? t('enableSync', lang) : t('enableSync', lang);
  }
}

/**
 * Setup photo sync modal event handlers
 */
function setupPhotoSyncModal(): void {
  const modal = document.getElementById('photo-sync-modal');
  const cancelBtn = document.getElementById('photo-sync-cancel-btn');
  const confirmBtn = document.getElementById('photo-sync-confirm-btn');

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (modal) modal.classList.remove('show');
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      // Enable photo sync
      store.updateSettings({ syncPhotos: true });

      // Update toggle
      const syncPhotosToggle = document.getElementById('sync-photos-toggle') as HTMLInputElement;
      if (syncPhotosToggle) syncPhotosToggle.checked = true;

      // Close modal
      if (modal) modal.classList.remove('show');

      // Force a sync to start transferring photos
      const state = store.getState();
      if (state.settings.sync && state.raceId) {
        syncService.forceRefresh();
      }

      feedbackSuccess();
    });
  }

  // Close on overlay click
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    });
  }
}

/**
 * Handle manage races button click
 * Always requires PIN verification for security
 */
function handleManageRacesClick(): void {
  // Always show PIN verification modal - race management requires explicit authentication
  const modal = document.getElementById('admin-pin-modal');
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const titleEl = document.getElementById('admin-pin-modal-title');
  const textEl = document.getElementById('admin-pin-modal-text');
  const lang = store.getState().currentLang;

  if (modal && pinInput && errorEl) {
    pinInput.value = '';
    errorEl.style.display = 'none';
    if (titleEl) titleEl.textContent = t('enterAdminPin', lang);
    if (textEl) textEl.textContent = t('enterPinText', lang);
    modal.classList.add('show');
    pinInput.focus();
  }
}

/**
 * Handle admin PIN verification
 */
async function handleAdminPinVerify(): Promise<void> {
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const modal = document.getElementById('admin-pin-modal');

  if (!pinInput || !modal) return;

  const enteredPin = pinInput.value.trim();

  // Authenticate via JWT token exchange
  const result = await authenticateWithPin(enteredPin);

  if (result.success) {
    // PIN correct - open race management
    closeModal(modal);
    pinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
    openRaceManagementModal();
  } else {
    // PIN incorrect
    if (errorEl) errorEl.style.display = 'block';
    pinInput.value = '';
    pinInput.focus();
    feedbackWarning();
  }
}

/**
 * Show PIN verification modal and wait for result
 * Used when joining a race with sync enabled
 * Skips verification if user already has a valid auth token (previously authenticated)
 */
export function verifyPinForRaceJoin(lang: Language): Promise<boolean> {
  return new Promise((resolve) => {
    // If already authenticated with valid token, allow without verification
    // Token proves user previously entered correct PIN
    if (hasAuthToken()) {
      resolve(true);
      return;
    }

    const modal = document.getElementById('admin-pin-modal');
    const titleEl = document.getElementById('admin-pin-modal-title');
    const textEl = document.getElementById('admin-pin-modal-text');
    const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
    const errorEl = document.getElementById('admin-pin-error');

    if (!modal || !pinInput) {
      resolve(false);
      return;
    }

    // Update modal text for race join context
    if (titleEl) titleEl.textContent = t('enterAdminPin', lang);
    if (textEl) textEl.textContent = t('enterPinToJoinRace', lang);
    if (errorEl) errorEl.style.display = 'none';
    pinInput.value = '';

    // Store resolver for the verify button handler
    pinVerifyResolver = resolve;

    modal.classList.add('show');
    setTimeout(() => pinInput.focus(), 100);
  });
}

/**
 * Verify PIN for entering Chief Judge mode
 * Uses same PIN as race management
 * Always requires re-authentication to get a token with chiefJudge role
 */
export function verifyPinForChiefJudge(lang: Language): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById('admin-pin-modal');
    const titleEl = document.getElementById('admin-pin-modal-title');
    const textEl = document.getElementById('admin-pin-modal-text');
    const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
    const errorEl = document.getElementById('admin-pin-error');

    if (!modal || !pinInput) {
      resolve(false);
      return;
    }

    // Update modal text for Chief Judge context
    if (titleEl) titleEl.textContent = t('enterAdminPin', lang);
    if (textEl) textEl.textContent = t('enterPinForChiefJudge', lang);
    if (errorEl) errorEl.style.display = 'none';
    pinInput.value = '';

    // Store resolver for the verify button handler
    // Mark this as a Chief Judge verification so the handler uses the right role
    pinVerifyResolver = resolve;
    pinVerifyForChiefJudge = true;

    modal.classList.add('show');
    setTimeout(() => pinInput.focus(), 100);
  });
}

/**
 * Handle PIN verification for race join (called by verify button)
 */
async function handleRaceJoinPinVerify(): Promise<void> {
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const modal = document.getElementById('admin-pin-modal');

  if (!pinInput || !modal || !pinVerifyResolver) return;

  const enteredPin = pinInput.value.trim();

  // Authenticate via JWT token exchange
  // Use chiefJudge role if this is for Chief Judge mode verification
  const role = pinVerifyForChiefJudge ? 'chiefJudge' : undefined;
  const result = await authenticateWithPin(enteredPin, role);

  if (result.success) {
    // PIN correct
    closeModal(modal);
    pinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
    pinVerifyResolver(true);
    pinVerifyResolver = null;
    pinVerifyForChiefJudge = false; // Reset flag
  } else {
    // PIN incorrect
    if (errorEl) errorEl.style.display = 'block';
    pinInput.value = '';
    pinInput.focus();
    feedbackWarning();
  }
}

/**
 * Cancel PIN verification for race join
 */
function cancelRaceJoinPinVerify(): void {
  const modal = document.getElementById('admin-pin-modal');
  const pinInput = document.getElementById('admin-pin-verify-input') as HTMLInputElement;

  closeModal(modal);
  if (pinInput) pinInput.value = '';

  if (pinVerifyResolver) {
    pinVerifyResolver(false);
    pinVerifyResolver = null;
  }
  pinVerifyForChiefJudge = false; // Reset flag
}

/**
 * Open race management modal and load race list
 */
function openRaceManagementModal(): void {
  const modal = document.getElementById('race-management-modal');
  if (modal) {
    modal.classList.add('show');
    loadRaceList();
  }
}

/**
 * Load and display race list from admin API
 */
async function loadRaceList(): Promise<void> {
  const listContainer = document.getElementById('race-list');
  const loadingEl = document.getElementById('race-list-loading');
  const emptyEl = document.getElementById('race-list-empty');
  const lang = store.getState().currentLang;

  if (!listContainer) return;

  // Show loading and set ARIA busy state
  listContainer.setAttribute('aria-busy', 'true');
  if (loadingEl) loadingEl.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  // Remove existing race items
  listContainer.querySelectorAll('.race-item').forEach(item => item.remove());

  try {
    const response = await fetchWithTimeout(ADMIN_API_BASE, {
      headers: getAdminAuthHeaders()
    }, 10000); // 10 second timeout for race list
    if (!response.ok) {
      if (response.status === 401) {
        // API auth failed - server PIN mismatch (should not happen in production)
        const modal = document.getElementById('race-management-modal');
        closeModal(modal);
        showToast(t('authError', lang), 'error');
        console.error('API auth failed - check ADMIN_PIN env variable matches SERVER_API_PIN');
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const races: RaceInfo[] = data.races || [];

    // Hide loading and clear ARIA busy state
    listContainer.setAttribute('aria-busy', 'false');
    if (loadingEl) loadingEl.style.display = 'none';

    if (races.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    // Render race items
    races.forEach(race => {
      const raceItem = createRaceItem(race, lang);
      listContainer.appendChild(raceItem);
    });

  } catch (error) {
    logError('Admin', 'loadRaceList', error, 'loadError');
    listContainer.setAttribute('aria-busy', 'false');
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

/**
 * Create a race item element
 */
function createRaceItem(race: RaceInfo, lang: Language): HTMLElement {
  const item = document.createElement('div');
  item.className = 'race-item';
  item.setAttribute('data-race-id', race.raceId);

  const info = document.createElement('div');
  info.className = 'race-info';

  const raceIdEl = document.createElement('span');
  raceIdEl.className = 'race-id';
  raceIdEl.textContent = race.raceId.toUpperCase();

  const meta = document.createElement('span');
  meta.className = 'race-meta';
  const entriesText = race.entryCount === 1 ? t('entry', lang) : t('entries', lang);
  const devicesText = race.deviceCount === 1 ? t('device', lang) : t('devices', lang);
  meta.textContent = `${race.entryCount} ${entriesText}, ${race.deviceCount} ${devicesText}`;

  info.appendChild(raceIdEl);
  info.appendChild(meta);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'race-delete-btn danger';
  deleteBtn.textContent = t('delete', lang);
  deleteBtn.addEventListener('click', () => promptDeleteRace(race.raceId));

  item.appendChild(info);
  item.appendChild(deleteBtn);

  return item;
}

/**
 * Prompt to delete a race
 */
function promptDeleteRace(raceId: string): void {
  const lang = store.getState().currentLang;
  pendingRaceDelete = raceId;

  const modal = document.getElementById('delete-race-confirm-modal');
  const textEl = document.getElementById('delete-race-confirm-text');

  if (textEl) {
    textEl.textContent = `${t('confirmDeleteRaceText', lang)} "${raceId.toUpperCase()}"?`;
  }

  if (modal) {
    modal.classList.add('show');
  }
}

/**
 * Handle confirm delete race
 */
async function handleConfirmDeleteRace(): Promise<void> {
  if (!pendingRaceDelete) return;

  const raceId = pendingRaceDelete;
  const lang = store.getState().currentLang;

  // Close confirmation modal
  const confirmModal = document.getElementById('delete-race-confirm-modal');
  closeModal(confirmModal);

  try {
    const response = await fetchWithTimeout(`${ADMIN_API_BASE}?raceId=${encodeURIComponent(raceId)}`, {
      method: 'DELETE',
      headers: getAdminAuthHeaders()
    }, 10000); // 10 second timeout for delete

    if (!response.ok) {
      if (response.status === 401) {
        // API auth failed - server PIN mismatch (should not happen in production)
        const modal = document.getElementById('race-management-modal');
        closeModal(modal);
        showToast(t('authError', lang), 'error');
        console.error('API auth failed - check ADMIN_PIN env variable matches SERVER_API_PIN');
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      showToast(`${t('raceDeletedSuccess', lang)} ${raceId.toUpperCase()}`, 'success');
      feedbackDelete();
      // Refresh the list
      loadRaceList();
    } else {
      throw new Error(result.error || t('unknownError', lang));
    }
  } catch (error) {
    logError('Admin', 'deleteRace', error, 'deleteError');
  } finally {
    pendingRaceDelete = null;
  }
}

/**
 * Check if there's a pending PIN verification and resolve it with false
 * Used by closeAllModals cleanup
 */
export function cleanupPinVerification(): boolean {
  if (pinVerifyResolver) {
    pinVerifyResolver(false);
    pinVerifyResolver = null;
    pinVerifyForChiefJudge = false;
    return true; // Indicates cleanup was needed
  }
  return false;
}

/**
 * Check if there's an active PIN verification modal
 */
export function hasPendingPinVerification(): boolean {
  return pinVerifyResolver !== null;
}
