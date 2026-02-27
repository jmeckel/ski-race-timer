/**
 * Extended coverage tests for PIN Management Module
 * Tests: handleChangePinClick, handleSavePin, verifyPinForRaceJoin, verifyPinForChiefJudge
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../../src/services', () => ({
  feedbackSuccess: vi.fn(),
  feedbackWarning: vi.fn(),
}));

const mockExchangePinForToken = vi.fn();
const mockHasAuthToken = vi.fn(() => false);
const mockClearAuthToken = vi.fn();
const mockGetAuthHeaders = vi.fn(() => ({ Authorization: 'Bearer tok' }));

vi.mock('../../../../src/services/auth', () => ({
  exchangePinForToken: (...args: unknown[]) => mockExchangePinForToken(...args),
  hasAuthToken: () => mockHasAuthToken(),
  clearAuthToken: () => mockClearAuthToken(),
  getAuthHeaders: () => mockGetAuthHeaders(),
}));

const mockGetState = vi.fn();

vi.mock('../../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
  },
}));

vi.mock('../../../../src/utils', () => ({
  logWarning: vi.fn(),
  makeNumericInput: vi.fn(),
}));

vi.mock('../../../../src/utils/listenerManager', () => {
  const handlers = new Map<string, Function>();
  return {
    ListenerManager: vi.fn().mockImplementation(() => ({
      add: vi.fn((el: HTMLElement, event: string, handler: Function) => {
        // Store handler by element id + event for retrieval in tests
        const key = `${el.id}:${event}`;
        handlers.set(key, handler);
      }),
      removeAll: vi.fn(),
    })),
    _handlers: handlers,
  };
});

vi.mock('../../../../src/features/modals', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

import { showToast } from '../../../../src/components';
import { closeModal, openModal } from '../../../../src/features/modals';
import {
  authenticateWithPin,
  cancelRaceJoinPinVerify,
  cleanupPinVerification,
  handleRaceJoinPinVerify,
  hasPendingPinVerification,
  initPinManagement,
  isAuthenticated,
  updatePinStatusDisplay,
  verifyPinForChiefJudge,
  verifyPinForRaceJoin,
} from '../../../../src/features/race/pinManagement';
import { feedbackSuccess, feedbackWarning } from '../../../../src/services';

describe('PIN Management — extended coverage', () => {
  let container: HTMLDivElement;

  function setupPinDOM(): void {
    // PIN status display
    const statusEl = document.createElement('span');
    statusEl.id = 'admin-pin-status';
    container.appendChild(statusEl);
    const btnTextEl = document.createElement('span');
    btnTextEl.id = 'change-pin-btn-text';
    container.appendChild(btnTextEl);

    // Change PIN modal
    const changePinModal = document.createElement('div');
    changePinModal.id = 'change-pin-modal';
    container.appendChild(changePinModal);
    const changePinTitle = document.createElement('h2');
    changePinTitle.id = 'change-pin-modal-title';
    container.appendChild(changePinTitle);
    const currentPinRow = document.createElement('div');
    currentPinRow.id = 'current-pin-row';
    container.appendChild(currentPinRow);

    // PIN inputs
    for (const id of [
      'current-pin-input',
      'new-pin-input',
      'confirm-pin-input',
    ]) {
      const input = document.createElement('input');
      input.id = id;
      container.appendChild(input);
    }

    // Save PIN button
    const saveBtn = document.createElement('button');
    saveBtn.id = 'save-pin-btn';
    saveBtn.textContent = 'Save';
    container.appendChild(saveBtn);

    // Error elements
    for (const id of [
      'current-pin-error',
      'pin-mismatch-error',
      'pin-format-error',
    ]) {
      const el = document.createElement('div');
      el.id = id;
      el.style.display = 'none';
      container.appendChild(el);
    }

    // Change PIN button for initPinManagement
    const changePinBtn = document.createElement('button');
    changePinBtn.id = 'change-pin-btn';
    container.appendChild(changePinBtn);

    // Admin PIN modal (for race join verification)
    const adminPinModal = document.createElement('div');
    adminPinModal.id = 'admin-pin-modal';
    container.appendChild(adminPinModal);
    const adminPinInput = document.createElement('input');
    adminPinInput.id = 'admin-pin-verify-input';
    container.appendChild(adminPinInput);
    const adminPinError = document.createElement('div');
    adminPinError.id = 'admin-pin-error';
    container.appendChild(adminPinError);
    const adminPinTitle = document.createElement('h2');
    adminPinTitle.id = 'admin-pin-modal-title';
    container.appendChild(adminPinTitle);
    const adminPinText = document.createElement('p');
    adminPinText.id = 'admin-pin-modal-text';
    container.appendChild(adminPinText);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    mockGetState.mockReturnValue({ currentLang: 'en' });
    mockHasAuthToken.mockReturnValue(false);
    mockExchangePinForToken.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    container.remove();
    // Clean up any pending pin verifications
    cleanupPinVerification();
  });

  describe('isAuthenticated', () => {
    it('should return false when no token', () => {
      mockHasAuthToken.mockReturnValue(false);
      expect(isAuthenticated()).toBe(false);
    });

    it('should return true when token exists', () => {
      mockHasAuthToken.mockReturnValue(true);
      expect(isAuthenticated()).toBe(true);
    });
  });

  describe('authenticateWithPin', () => {
    it('should delegate to exchangePinForToken', async () => {
      mockExchangePinForToken.mockResolvedValue({ success: true });
      const result = await authenticateWithPin('1234', 'timer');
      expect(mockExchangePinForToken).toHaveBeenCalledWith('1234', 'timer');
      expect(result.success).toBe(true);
    });
  });

  describe('updatePinStatusDisplay', () => {
    it('should show pinSet when authenticated', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(true);
      updatePinStatusDisplay();
      expect(document.getElementById('admin-pin-status')!.textContent).toBe(
        'pinSet',
      );
      expect(document.getElementById('change-pin-btn-text')!.textContent).toBe(
        'changePin',
      );
    });

    it('should show pinNotSet when not authenticated', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(false);
      updatePinStatusDisplay();
      expect(document.getElementById('admin-pin-status')!.textContent).toBe(
        'pinNotSet',
      );
      expect(document.getElementById('change-pin-btn-text')!.textContent).toBe(
        'setPin',
      );
    });
  });

  describe('verifyPinForRaceJoin', () => {
    it('should resolve true immediately when already authenticated', async () => {
      mockHasAuthToken.mockReturnValue(true);
      const result = await verifyPinForRaceJoin('en');
      expect(result).toBe(true);
      expect(openModal).not.toHaveBeenCalled();
    });

    it('should open modal when not authenticated', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(false);
      // Don't await — the promise pends until verify/cancel
      const promise = verifyPinForRaceJoin('en');
      expect(openModal).toHaveBeenCalled();
      expect(hasPendingPinVerification()).toBe(true);
      // Clean up
      cancelRaceJoinPinVerify();
      return promise; // resolves false via cancel
    });

    it('should resolve false when modal elements missing', async () => {
      mockHasAuthToken.mockReturnValue(false);
      // No DOM setup — modal elements missing
      const result = await verifyPinForRaceJoin('en');
      expect(result).toBe(false);
    });
  });

  describe('verifyPinForChiefJudge', () => {
    it('should always open modal (even when authenticated)', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(true);
      const promise = verifyPinForChiefJudge('en');
      expect(openModal).toHaveBeenCalled();
      cancelRaceJoinPinVerify(); // uses same cleanup
      return promise;
    });

    it('should set chief judge modal text', () => {
      setupPinDOM();
      const promise = verifyPinForChiefJudge('en');
      expect(
        document.getElementById('admin-pin-modal-title')!.textContent,
      ).toBe('enterChiefJudgePin');
      cancelRaceJoinPinVerify();
      return promise;
    });
  });

  describe('handleRaceJoinPinVerify', () => {
    it('should resolve true on successful auth', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({ success: true });

      let resolved: boolean | undefined;
      const promise = verifyPinForRaceJoin('en');
      promise.then((v) => {
        resolved = v;
      });

      // Simulate entering PIN
      (
        document.getElementById('admin-pin-verify-input') as HTMLInputElement
      ).value = '1234';
      await handleRaceJoinPinVerify();

      expect(resolved).toBe(true);
      expect(closeModal).toHaveBeenCalled();
    });

    it('should show error on failed auth', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({ success: false });

      const promise = verifyPinForRaceJoin('en');

      (
        document.getElementById('admin-pin-verify-input') as HTMLInputElement
      ).value = '0000';
      await handleRaceJoinPinVerify();

      expect(document.getElementById('admin-pin-error')!.style.display).toBe(
        'block',
      );
      expect(feedbackWarning).toHaveBeenCalled();

      // Cleanup
      cancelRaceJoinPinVerify();
      await promise;
    });

    it('should use chiefJudge role for chief judge verification', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({ success: true });

      const promise = verifyPinForChiefJudge('en');

      (
        document.getElementById('admin-pin-verify-input') as HTMLInputElement
      ).value = '5678';
      await handleRaceJoinPinVerify();

      expect(mockExchangePinForToken).toHaveBeenCalledWith(
        '5678',
        'chiefJudge',
      );
      await promise;
    });
  });

  describe('cancelRaceJoinPinVerify', () => {
    it('should resolve pending verification with false', async () => {
      setupPinDOM();

      let resolved: boolean | undefined;
      const promise = verifyPinForRaceJoin('en');
      promise.then((v) => {
        resolved = v;
      });

      cancelRaceJoinPinVerify();
      await promise;

      expect(resolved).toBe(false);
      expect(hasPendingPinVerification()).toBe(false);
    });
  });

  describe('cleanupPinVerification', () => {
    it('should return true when cleanup was needed', () => {
      setupPinDOM();
      verifyPinForRaceJoin('en'); // starts pending verification
      expect(cleanupPinVerification()).toBe(true);
    });

    it('should return false when no pending verification', () => {
      expect(cleanupPinVerification()).toBe(false);
    });
  });

  describe('initPinManagement', () => {
    it('should not throw with full DOM', () => {
      setupPinDOM();
      expect(() => initPinManagement()).not.toThrow();
    });

    it('should update pin status display', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(true);
      initPinManagement();
      expect(document.getElementById('admin-pin-status')!.textContent).toBe(
        'pinSet',
      );
    });
  });
});
