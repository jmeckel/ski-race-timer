/**
 * Race Management Module - Barrel Export & Initialization
 * Re-exports all public APIs and provides the main init function
 */

import { ListenerManager } from '../../utils/listenerManager';
import {
  cancelRaceJoinPinVerify,
  handleRaceJoinPinVerify,
  hasPendingPinVerification,
  initPinManagement,
} from './pinManagement';
import { handleAdminPinVerify, initRaceAdmin } from './raceAdmin';
import { initRaceDialogs } from './raceDialogs';

// Module-level listener manager for lifecycle cleanup
const listeners = new ListenerManager();

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
    listeners.add(adminPinVerifyBtn, 'click', () => {
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
    listeners.add(adminPinVerifyInput, 'keydown', ((e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (hasPendingPinVerification()) {
          handleRaceJoinPinVerify();
        } else {
          handleAdminPinVerify();
        }
      }
    }) as EventListener);
  }

  // Admin PIN modal cancel - handle race join cancellation
  const adminPinModal = document.getElementById('admin-pin-modal');
  if (adminPinModal) {
    listeners.add(adminPinModal, 'click', (e) => {
      if (e.target === adminPinModal && hasPendingPinVerification()) {
        cancelRaceJoinPinVerify();
      }
    });
  }
}
