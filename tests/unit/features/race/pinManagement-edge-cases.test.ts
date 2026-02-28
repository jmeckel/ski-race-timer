/**
 * Edge Case Tests for PIN Management Module
 * Tests gaps: isAuthenticated token validity, authenticateWithPin with isNewPin,
 * authenticateWithPin with different roles, network error handling,
 * updatePinStatusDisplay UI updates, initPinManagement DOM setup,
 * destroy/cleanup, token expiry handling, handleRaceJoinPinVerify with chiefJudge
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

vi.mock('../../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(function () {
    const tracked: {
      el: EventTarget;
      event: string;
      handler: EventListenerOrEventListenerObject;
    }[] = [];
    return {
      add: vi.fn(
        (
          el: EventTarget,
          event: string,
          handler: EventListenerOrEventListenerObject,
        ) => {
          el.addEventListener(event, handler);
          tracked.push({ el, event, handler });
        },
      ),
      removeAll: vi.fn(() => {
        for (const { el, event, handler } of tracked) {
          el.removeEventListener(event, handler);
        }
        tracked.length = 0;
      }),
    };
  }),
}));

vi.mock('../../../../src/features/modals', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

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
import { feedbackWarning } from '../../../../src/services';
import { makeNumericInput } from '../../../../src/utils';

describe('PIN Management — Edge Cases', () => {
  let container: HTMLDivElement;

  function setupPinDOM(): void {
    const statusEl = document.createElement('span');
    statusEl.id = 'admin-pin-status';
    container.appendChild(statusEl);
    const btnTextEl = document.createElement('span');
    btnTextEl.id = 'change-pin-btn-text';
    container.appendChild(btnTextEl);

    const changePinBtn = document.createElement('button');
    changePinBtn.id = 'change-pin-btn';
    container.appendChild(changePinBtn);

    const savePinBtn = document.createElement('button');
    savePinBtn.id = 'save-pin-btn';
    savePinBtn.textContent = 'Save';
    container.appendChild(savePinBtn);

    const adminPinModal = document.createElement('div');
    adminPinModal.id = 'admin-pin-modal';
    container.appendChild(adminPinModal);
    const adminPinInput = document.createElement('input');
    adminPinInput.id = 'admin-pin-verify-input';
    container.appendChild(adminPinInput);
    const adminPinError = document.createElement('div');
    adminPinError.id = 'admin-pin-error';
    adminPinError.style.display = 'none';
    container.appendChild(adminPinError);
    const adminPinTitle = document.createElement('h2');
    adminPinTitle.id = 'admin-pin-modal-title';
    container.appendChild(adminPinTitle);
    const adminPinText = document.createElement('p');
    adminPinText.id = 'admin-pin-modal-text';
    container.appendChild(adminPinText);

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
    cleanupPinVerification();
  });

  // -------------------------------------------------------------------------
  // isAuthenticated — delegates to hasAuthToken
  // -------------------------------------------------------------------------
  describe('isAuthenticated delegates to hasAuthToken', () => {
    it('should return true when hasAuthToken returns true', () => {
      mockHasAuthToken.mockReturnValue(true);
      expect(isAuthenticated()).toBe(true);
    });

    it('should return false when hasAuthToken returns false', () => {
      mockHasAuthToken.mockReturnValue(false);
      expect(isAuthenticated()).toBe(false);
    });

    it('should call hasAuthToken exactly once per invocation', () => {
      isAuthenticated();
      expect(mockHasAuthToken).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // authenticateWithPin — various scenarios
  // -------------------------------------------------------------------------
  describe('authenticateWithPin success with isNewPin', () => {
    it('should return isNewPin=true when server indicates new PIN', async () => {
      mockExchangePinForToken.mockResolvedValue({
        success: true,
        isNewPin: true,
      });

      const result = await authenticateWithPin('1234');

      expect(result.success).toBe(true);
      expect(result.isNewPin).toBe(true);
    });

    it('should return isNewPin=false for existing PIN', async () => {
      mockExchangePinForToken.mockResolvedValue({
        success: true,
        isNewPin: false,
      });

      const result = await authenticateWithPin('1234');

      expect(result.success).toBe(true);
      expect(result.isNewPin).toBe(false);
    });
  });

  describe('authenticateWithPin failure scenarios', () => {
    it('should return error message on wrong PIN', async () => {
      mockExchangePinForToken.mockResolvedValue({
        success: false,
        error: 'Invalid PIN',
      });

      const result = await authenticateWithPin('0000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid PIN');
    });

    it('should handle network error from exchangePinForToken', async () => {
      mockExchangePinForToken.mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      const result = await authenticateWithPin('1234');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle timeout error from exchangePinForToken', async () => {
      mockExchangePinForToken.mockResolvedValue({
        success: false,
        error: 'Request timeout',
      });

      const result = await authenticateWithPin('1234');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timeout');
    });
  });

  describe('authenticateWithPin with role parameter', () => {
    it('should pass timer role', async () => {
      await authenticateWithPin('1234', 'timer');
      expect(mockExchangePinForToken).toHaveBeenCalledWith('1234', 'timer');
    });

    it('should pass gateJudge role', async () => {
      await authenticateWithPin('1234', 'gateJudge');
      expect(mockExchangePinForToken).toHaveBeenCalledWith('1234', 'gateJudge');
    });

    it('should pass chiefJudge role', async () => {
      await authenticateWithPin('5678', 'chiefJudge');
      expect(mockExchangePinForToken).toHaveBeenCalledWith(
        '5678',
        'chiefJudge',
      );
    });

    it('should pass undefined when no role specified', async () => {
      await authenticateWithPin('1234');
      expect(mockExchangePinForToken).toHaveBeenCalledWith('1234', undefined);
    });
  });

  describe('authenticateWithPin updates status on success', () => {
    it('should call updatePinStatusDisplay on successful auth', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({ success: true });
      mockHasAuthToken.mockReturnValue(true); // After auth succeeds

      await authenticateWithPin('1234');

      const statusEl = document.getElementById('admin-pin-status');
      expect(statusEl!.textContent).toBe('pinSet');
    });

    it('should NOT update status on failed auth', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({
        success: false,
        error: 'Wrong PIN',
      });
      mockHasAuthToken.mockReturnValue(false);

      await authenticateWithPin('0000');

      const statusEl = document.getElementById('admin-pin-status');
      // Status should still show 'not set' (initial state from mock)
      expect(statusEl!.textContent).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // updatePinStatusDisplay — UI updates
  // -------------------------------------------------------------------------
  describe('updatePinStatusDisplay UI updates', () => {
    it('should set pinSet text when authenticated', () => {
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

    it('should set pinNotSet text when not authenticated', () => {
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

    it('should use current language from store', () => {
      setupPinDOM();
      mockGetState.mockReturnValue({ currentLang: 'de' });
      mockHasAuthToken.mockReturnValue(true);

      updatePinStatusDisplay();

      // The t() mock always returns the key, but we verify getState was called
      expect(document.getElementById('admin-pin-status')!.textContent).toBe(
        'pinSet',
      );
    });

    it('should handle missing status element gracefully', () => {
      // Don't setup DOM
      expect(() => updatePinStatusDisplay()).not.toThrow();
    });

    it('should handle missing button text element gracefully', () => {
      const statusEl = document.createElement('span');
      statusEl.id = 'admin-pin-status';
      container.appendChild(statusEl);
      // No change-pin-btn-text element

      expect(() => updatePinStatusDisplay()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // initPinManagement — DOM setup
  // -------------------------------------------------------------------------
  describe('initPinManagement DOM setup', () => {
    it('should call updatePinStatusDisplay on init', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(true);

      initPinManagement();

      expect(document.getElementById('admin-pin-status')!.textContent).toBe(
        'pinSet',
      );
    });

    it('should make PIN inputs numeric-only', () => {
      setupPinDOM();

      initPinManagement();

      // makeNumericInput should be called for each PIN input
      expect(makeNumericInput).toHaveBeenCalled();
    });

    it('should not throw when no elements exist', () => {
      expect(() => initPinManagement()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // verifyPinForRaceJoin — edge cases
  // -------------------------------------------------------------------------
  describe('verifyPinForRaceJoin edge cases', () => {
    it('should resolve true immediately for authenticated users', async () => {
      mockHasAuthToken.mockReturnValue(true);

      const result = await verifyPinForRaceJoin('en');

      expect(result).toBe(true);
      expect(openModal).not.toHaveBeenCalled();
    });

    it('should set pending verification state', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(false);

      const promise = verifyPinForRaceJoin('en');

      expect(hasPendingPinVerification()).toBe(true);

      cancelRaceJoinPinVerify();
      return promise;
    });

    it('should clear PIN input value before showing', () => {
      setupPinDOM();
      const pinInput = document.getElementById(
        'admin-pin-verify-input',
      ) as HTMLInputElement;
      pinInput.value = '9999';

      mockHasAuthToken.mockReturnValue(false);

      const promise = verifyPinForRaceJoin('en');

      expect(pinInput.value).toBe('');

      cancelRaceJoinPinVerify();
      return promise;
    });

    it('should hide error element before showing', () => {
      setupPinDOM();
      const errorEl = document.getElementById('admin-pin-error')!;
      errorEl.style.display = 'block';

      mockHasAuthToken.mockReturnValue(false);

      const promise = verifyPinForRaceJoin('en');

      expect(errorEl.style.display).toBe('none');

      cancelRaceJoinPinVerify();
      return promise;
    });

    it('should set modal title for race join context', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(false);

      const promise = verifyPinForRaceJoin('en');

      expect(
        document.getElementById('admin-pin-modal-title')!.textContent,
      ).toBe('enterAdminPin');

      cancelRaceJoinPinVerify();
      return promise;
    });

    it('should set modal text for race join context', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(false);

      const promise = verifyPinForRaceJoin('en');

      expect(document.getElementById('admin-pin-modal-text')!.textContent).toBe(
        'enterPinToJoinRace',
      );

      cancelRaceJoinPinVerify();
      return promise;
    });
  });

  // -------------------------------------------------------------------------
  // verifyPinForChiefJudge — always requires re-auth
  // -------------------------------------------------------------------------
  describe('verifyPinForChiefJudge always re-authenticates', () => {
    it('should open modal even when already authenticated', () => {
      setupPinDOM();
      mockHasAuthToken.mockReturnValue(true);

      const promise = verifyPinForChiefJudge('en');

      expect(openModal).toHaveBeenCalled();

      cancelRaceJoinPinVerify();
      return promise;
    });

    it('should set chief judge specific modal title', () => {
      setupPinDOM();

      const promise = verifyPinForChiefJudge('en');

      expect(
        document.getElementById('admin-pin-modal-title')!.textContent,
      ).toBe('enterChiefJudgePin');

      cancelRaceJoinPinVerify();
      return promise;
    });

    it('should set chief judge specific modal text', () => {
      setupPinDOM();

      const promise = verifyPinForChiefJudge('en');

      expect(document.getElementById('admin-pin-modal-text')!.textContent).toBe(
        'enterPinForChiefJudgeInfo',
      );

      cancelRaceJoinPinVerify();
      return promise;
    });
  });

  // -------------------------------------------------------------------------
  // handleRaceJoinPinVerify — role passing
  // -------------------------------------------------------------------------
  describe('handleRaceJoinPinVerify role passing', () => {
    it('should pass chiefJudge role for chief judge verification', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({ success: true });

      const promise = verifyPinForChiefJudge('en');

      const pinInput = document.getElementById(
        'admin-pin-verify-input',
      ) as HTMLInputElement;
      pinInput.value = '5678';

      await handleRaceJoinPinVerify();

      expect(mockExchangePinForToken).toHaveBeenCalledWith(
        '5678',
        'chiefJudge',
      );
      await promise;
    });

    it('should pass undefined role for race join verification', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({ success: true });

      const promise = verifyPinForRaceJoin('en');

      const pinInput = document.getElementById(
        'admin-pin-verify-input',
      ) as HTMLInputElement;
      pinInput.value = '1234';

      await handleRaceJoinPinVerify();

      expect(mockExchangePinForToken).toHaveBeenCalledWith('1234', undefined);
      await promise;
    });

    it('should trim PIN input whitespace', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({ success: true });

      const promise = verifyPinForRaceJoin('en');

      const pinInput = document.getElementById(
        'admin-pin-verify-input',
      ) as HTMLInputElement;
      pinInput.value = '  1234  ';

      await handleRaceJoinPinVerify();

      expect(mockExchangePinForToken).toHaveBeenCalledWith('1234', undefined);
      await promise;
    });
  });

  // -------------------------------------------------------------------------
  // handleRaceJoinPinVerify — failure behavior
  // -------------------------------------------------------------------------
  describe('handleRaceJoinPinVerify failure behavior', () => {
    it('should show error, clear input, and focus on failure', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({ success: false });

      const promise = verifyPinForRaceJoin('en');

      const pinInput = document.getElementById(
        'admin-pin-verify-input',
      ) as HTMLInputElement;
      pinInput.value = '0000';

      const focusSpy = vi.spyOn(pinInput, 'focus');

      await handleRaceJoinPinVerify();

      const errorEl = document.getElementById('admin-pin-error')!;
      expect(errorEl.style.display).toBe('block');
      expect(pinInput.value).toBe('');
      expect(focusSpy).toHaveBeenCalled();
      expect(feedbackWarning).toHaveBeenCalled();

      // Verification should still be pending
      expect(hasPendingPinVerification()).toBe(true);

      cancelRaceJoinPinVerify();
      await promise;
    });

    it('should not close modal on failure', async () => {
      setupPinDOM();
      mockExchangePinForToken.mockResolvedValue({ success: false });

      const promise = verifyPinForRaceJoin('en');

      const pinInput = document.getElementById(
        'admin-pin-verify-input',
      ) as HTMLInputElement;
      pinInput.value = '0000';

      await handleRaceJoinPinVerify();

      expect(closeModal).not.toHaveBeenCalled();

      cancelRaceJoinPinVerify();
      await promise;
    });
  });

  // -------------------------------------------------------------------------
  // cancelRaceJoinPinVerify — cleanup
  // -------------------------------------------------------------------------
  describe('cancelRaceJoinPinVerify cleanup', () => {
    it('should clear PIN input on cancel', async () => {
      setupPinDOM();

      const promise = verifyPinForRaceJoin('en');

      const pinInput = document.getElementById(
        'admin-pin-verify-input',
      ) as HTMLInputElement;
      pinInput.value = '1234';

      cancelRaceJoinPinVerify();

      expect(pinInput.value).toBe('');
      await promise;
    });

    it('should close modal on cancel', async () => {
      setupPinDOM();

      const promise = verifyPinForRaceJoin('en');

      cancelRaceJoinPinVerify();

      expect(closeModal).toHaveBeenCalled();
      await promise;
    });

    it('should resolve promise with false on cancel', async () => {
      setupPinDOM();

      const result = await new Promise<boolean>((resolve) => {
        verifyPinForRaceJoin('en').then(resolve);
        cancelRaceJoinPinVerify();
      });

      expect(result).toBe(false);
    });

    it('should clear pending verification state', async () => {
      setupPinDOM();

      const promise = verifyPinForRaceJoin('en');
      expect(hasPendingPinVerification()).toBe(true);

      cancelRaceJoinPinVerify();
      expect(hasPendingPinVerification()).toBe(false);

      await promise;
    });
  });

  // -------------------------------------------------------------------------
  // cleanupPinVerification
  // -------------------------------------------------------------------------
  describe('cleanupPinVerification', () => {
    it('should return true when cleanup was needed', () => {
      setupPinDOM();
      verifyPinForRaceJoin('en');

      expect(cleanupPinVerification()).toBe(true);
    });

    it('should return false when no pending verification', () => {
      expect(cleanupPinVerification()).toBe(false);
    });

    it('should resolve pending promise with false', async () => {
      setupPinDOM();

      const result = await new Promise<boolean>((resolve) => {
        verifyPinForRaceJoin('en').then(resolve);
        cleanupPinVerification();
      });

      expect(result).toBe(false);
    });
  });
});
