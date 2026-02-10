/**
 * Race Management Module - Barrel Export & Initialization
 * Re-exports all public APIs and provides the main init function
 */

import {
  cancelRaceJoinPinVerify,
  handleRaceJoinPinVerify,
  hasPendingPinVerification,
  initPinManagement,
} from './pinManagement';
import { handleAdminPinVerify, initRaceAdmin } from './raceAdmin';
import { initRaceDialogs } from './raceDialogs';

// PIN Management
export {
  authenticateWithPin,
  cleanupPinVerification,
  hasPendingPinVerification,
  isAuthenticated,
  updatePinStatusDisplay,
  verifyPinForChiefJudge,
  verifyPinForRaceJoin,
} from './pinManagement';

// Race Administration
export { handleAdminPinVerify } from './raceAdmin';

// Race Dialogs & Events
export {
  handleAuthExpired,
  handleRaceDeleted,
  showPhotoSyncWarningModal,
  showRaceChangeDialog,
} from './raceDialogs';

/**
 * Initialize race management - coordinates all sub-module initialization
 */
export function initRaceManagement(): void {
  // Initialize sub-modules
  initPinManagement();
  initRaceAdmin();
  initRaceDialogs();

  // Admin PIN modal verify button - routes between race join and admin flows
  const adminPinVerifyBtn = document.getElementById('admin-pin-verify-btn');
  if (adminPinVerifyBtn) {
    adminPinVerifyBtn.addEventListener('click', () => {
      if (hasPendingPinVerification()) {
        handleRaceJoinPinVerify();
      } else {
        handleAdminPinVerify();
      }
    });
  }

  // Admin PIN modal input - verify on Enter
  const adminPinVerifyInput = document.getElementById(
    'admin-pin-verify-input',
  ) as HTMLInputElement;
  if (adminPinVerifyInput) {
    adminPinVerifyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (hasPendingPinVerification()) {
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
      if (e.target === adminPinModal && hasPendingPinVerification()) {
        cancelRaceJoinPinVerify();
      }
    });
  }
}
