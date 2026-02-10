/**
 * PIN Management Module
 * Handles PIN authentication, verification flows, and PIN change UI
 */

import { showToast } from '../../components';
import { t } from '../../i18n/translations';
import { feedbackSuccess, feedbackWarning } from '../../services';
import {
  clearAuthToken,
  exchangePinForToken,
  getAuthHeaders,
  hasAuthToken,
} from '../../services/auth';
import { store } from '../../store';
import type { Language } from '../../types';
import { logWarning, makeNumericInput } from '../../utils';
import { ListenerManager } from '../../utils/listenerManager';
import { logger } from '../../utils/logger';
import { closeModal, openModal } from '../modals';

// Module-level listener manager for lifecycle cleanup
const listeners = new ListenerManager();

// PIN verification context - consolidates resolver and type into single object
interface PinVerificationContext {
  type: 'raceJoin' | 'chiefJudge';
  resolve: (verified: boolean) => void;
}
let pinVerification: PinVerificationContext | null = null;

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
export async function authenticateWithPin(
  pin: string,
  role?: 'timer' | 'gateJudge' | 'chiefJudge',
): Promise<{ success: boolean; error?: string; isNewPin?: boolean }> {
  const result = await exchangePinForToken(pin, role);
  if (result.success) {
    updatePinStatusDisplay();
  }
  return result;
}

/**
 * Initialize admin PIN state
 * No longer auto-authenticates with a default PIN.
 * Users must set their own PIN during setup or when enabling sync.
 */
async function initializeAdminPin(): Promise<void> {
  // If we already have a valid token, nothing to do
  if (hasAuthToken()) {
    return;
  }
  // No default PIN - user must authenticate explicitly when needed
}

/**
 * Validate PIN format: exactly 4 digits
 */
function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
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
    statusEl.textContent = authenticated
      ? t('pinSet', lang)
      : t('pinNotSet', lang);
  }
  if (btnTextEl) {
    btnTextEl.textContent = authenticated
      ? t('changePin', lang)
      : t('setPin', lang);
  }
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
  const currentPinInput = document.getElementById(
    'current-pin-input',
  ) as HTMLInputElement;
  const newPinInput = document.getElementById(
    'new-pin-input',
  ) as HTMLInputElement;
  const confirmPinInput = document.getElementById(
    'confirm-pin-input',
  ) as HTMLInputElement;

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

  openModal(modal);

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
  const errorIds = [
    'current-pin-error',
    'pin-mismatch-error',
    'pin-format-error',
  ];
  errorIds.forEach((id) => {
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
  const currentPinInput = document.getElementById(
    'current-pin-input',
  ) as HTMLInputElement;
  const newPinInput = document.getElementById(
    'new-pin-input',
  ) as HTMLInputElement;
  const confirmPinInput = document.getElementById(
    'confirm-pin-input',
  ) as HTMLInputElement;
  const savePinBtn = document.getElementById(
    'save-pin-btn',
  ) as HTMLButtonElement;
  const currentPinError = document.getElementById('current-pin-error');
  const pinMismatchError = document.getElementById('pin-mismatch-error');
  const pinFormatError = document.getElementById('pin-format-error');

  hideAllPinErrors();

  const currentPin = currentPinInput?.value || '';
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

  // If already authenticated (PIN exists), change PIN via secure endpoint
  if (authenticated) {
    // Validate current PIN format
    if (!isValidPin(currentPin)) {
      if (currentPinError) currentPinError.style.display = 'block';
      if (currentPinInput) {
        currentPinInput.focus();
      }
      feedbackWarning();
      return;
    }

    // Show loading state
    const originalBtnText = savePinBtn?.textContent || '';
    if (savePinBtn) {
      savePinBtn.disabled = true;
      savePinBtn.textContent = t('saving', lang);
    }

    try {
      // Server verifies current PIN and sets new PIN (no hash exposure)
      const response = await fetch('/api/v1/admin/pin', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPin, newPin }),
      });

      if (response.status === 401) {
        // Current PIN was incorrect
        if (currentPinError) currentPinError.style.display = 'block';
        if (currentPinInput) {
          currentPinInput.value = '';
          currentPinInput.focus();
        }
        feedbackWarning();
        return;
      }

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
    } finally {
      // Restore button state
      if (savePinBtn) {
        savePinBtn.disabled = false;
        savePinBtn.textContent = originalBtnText;
      }
    }
  } else {
    // No PIN set yet - use auth/token to set initial PIN
    // Show loading state
    const originalBtnText = savePinBtn?.textContent || '';
    if (savePinBtn) {
      savePinBtn.disabled = true;
      savePinBtn.textContent = t('saving', lang);
    }

    try {
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
    } finally {
      // Restore button state
      if (savePinBtn) {
        savePinBtn.disabled = false;
        savePinBtn.textContent = originalBtnText;
      }
    }
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
    const pinInput = document.getElementById(
      'admin-pin-verify-input',
    ) as HTMLInputElement;
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

    // Store verification context
    pinVerification = { type: 'raceJoin', resolve };

    openModal(modal);
    setTimeout(() => pinInput.focus(), 100);
  });
}

/**
 * Verify PIN for entering Chief Judge mode
 * Uses SEPARATE Chief Judge PIN (not the regular race PIN)
 * Always requires re-authentication to get a token with chiefJudge role
 */
export function verifyPinForChiefJudge(lang: Language): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById('admin-pin-modal');
    const titleEl = document.getElementById('admin-pin-modal-title');
    const textEl = document.getElementById('admin-pin-modal-text');
    const pinInput = document.getElementById(
      'admin-pin-verify-input',
    ) as HTMLInputElement;
    const errorEl = document.getElementById('admin-pin-error');

    if (!modal || !pinInput) {
      resolve(false);
      return;
    }

    // Update modal text for Chief Judge context - use separate PIN
    if (titleEl) titleEl.textContent = t('enterChiefJudgePin', lang);
    if (textEl) textEl.textContent = t('enterPinForChiefJudgeInfo', lang);
    if (errorEl) errorEl.style.display = 'none';
    pinInput.value = '';

    // Store verification context with chiefJudge type
    pinVerification = { type: 'chiefJudge', resolve };

    openModal(modal);
    setTimeout(() => pinInput.focus(), 100);
  });
}

/**
 * Handle PIN verification for race join (called by verify button)
 */
export async function handleRaceJoinPinVerify(): Promise<void> {
  const pinInput = document.getElementById(
    'admin-pin-verify-input',
  ) as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const modal = document.getElementById('admin-pin-modal');

  if (!pinInput || !modal || !pinVerification) return;

  const enteredPin = pinInput.value.trim();

  // Authenticate via JWT token exchange
  // Use chiefJudge role if this is for Chief Judge mode verification
  const role = pinVerification.type === 'chiefJudge' ? 'chiefJudge' : undefined;
  const result = await authenticateWithPin(enteredPin, role);

  if (result.success) {
    // PIN correct
    closeModal(modal);
    pinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
    pinVerification.resolve(true);
    pinVerification = null;
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
export function cancelRaceJoinPinVerify(): void {
  const modal = document.getElementById('admin-pin-modal');
  const pinInput = document.getElementById(
    'admin-pin-verify-input',
  ) as HTMLInputElement;

  closeModal(modal);
  if (pinInput) pinInput.value = '';

  if (pinVerification) {
    pinVerification.resolve(false);
    pinVerification = null;
  }
}

/**
 * Check if there's a pending PIN verification and resolve it with false
 * Used by closeAllModals cleanup
 */
export function cleanupPinVerification(): boolean {
  if (pinVerification) {
    pinVerification.resolve(false);
    pinVerification = null;
    return true; // Indicates cleanup was needed
  }
  return false;
}

/**
 * Check if there's an active PIN verification modal
 */
export function hasPendingPinVerification(): boolean {
  return pinVerification !== null;
}

/**
 * Initialize PIN management handlers
 */
export function initPinManagement(): void {
  // Initialize admin PIN (sync from cloud or set default) - fire and forget
  initializeAdminPin()
    .then(() => {
      // Update PIN status display after sync completes
      updatePinStatusDisplay();
    })
    .catch((error) => {
      logger.error('Failed to initialize admin PIN:', error);
    });

  // Update PIN status display immediately (will be updated again after sync)
  updatePinStatusDisplay();

  // Change PIN button
  const changePinBtn = document.getElementById('change-pin-btn');
  if (changePinBtn) {
    listeners.add(changePinBtn, 'click', handleChangePinClick);
  }

  // Save PIN button
  const savePinBtn = document.getElementById('save-pin-btn');
  if (savePinBtn) {
    listeners.add(savePinBtn, 'click', handleSavePin);
  }

  // Filter numeric input for all PIN fields
  const pinInputs = [
    'admin-pin-verify-input',
    'current-pin-input',
    'new-pin-input',
    'confirm-pin-input',
  ];
  pinInputs.forEach((id) => {
    const input = document.getElementById(id) as HTMLInputElement;
    if (input) makeNumericInput(input);
  });
}
