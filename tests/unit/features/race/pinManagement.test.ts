/**
 * Unit Tests for PIN Management Module
 * Tests: isAuthenticated, authenticateWithPin, updatePinStatusDisplay,
 *        verifyPinForRaceJoin, verifyPinForChiefJudge, handleRaceJoinPinVerify,
 *        cancelRaceJoinPinVerify, cleanupPinVerification, hasPendingPinVerification,
 *        initPinManagement
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

const mockExchangePinForToken = vi.fn(() => Promise.resolve({ success: true }));
const mockHasAuthToken = vi.fn(() => false);
const mockClearAuthToken = vi.fn();
const mockGetAuthHeaders = vi.fn(() => ({ Authorization: 'Bearer token' }));

vi.mock('../../../../src/services/auth', () => ({
  clearAuthToken: (...args: unknown[]) => mockClearAuthToken(...args),
  exchangePinForToken: (...args: unknown[]) => mockExchangePinForToken(...args),
  getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
  hasAuthToken: (...args: unknown[]) => mockHasAuthToken(...args),
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
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
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

describe('PIN Management Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
    });
  });

  afterEach(() => {
    // Clean up any pending verifications
    cleanupPinVerification();
    container.remove();
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
    it('should call exchangePinForToken', async () => {
      await authenticateWithPin('1234');
      expect(mockExchangePinForToken).toHaveBeenCalledWith('1234', undefined);
    });

    it('should pass role when specified', async () => {
      await authenticateWithPin('1234', 'chiefJudge');
      expect(mockExchangePinForToken).toHaveBeenCalledWith(
        '1234',
        'chiefJudge',
      );
    });

    it('should return success result', async () => {
      mockExchangePinForToken.mockResolvedValue({ success: true });
      const result = await authenticateWithPin('1234');
      expect(result.success).toBe(true);
    });

    it('should return failure result', async () => {
      mockExchangePinForToken.mockResolvedValue({
        success: false,
        error: 'Invalid PIN',
      });
      const result = await authenticateWithPin('0000');
      expect(result.success).toBe(false);
    });
  });

  describe('updatePinStatusDisplay', () => {
    it('should show "pin set" when authenticated', () => {
      mockHasAuthToken.mockReturnValue(true);

      const statusEl = document.createElement('div');
      statusEl.id = 'admin-pin-status';
      const btnTextEl = document.createElement('span');
      btnTextEl.id = 'change-pin-btn-text';
      container.appendChild(statusEl);
      container.appendChild(btnTextEl);

      updatePinStatusDisplay();

      expect(statusEl.textContent).toBe('pinSet');
      expect(btnTextEl.textContent).toBe('changePin');
    });

    it('should show "pin not set" when not authenticated', () => {
      mockHasAuthToken.mockReturnValue(false);

      const statusEl = document.createElement('div');
      statusEl.id = 'admin-pin-status';
      const btnTextEl = document.createElement('span');
      btnTextEl.id = 'change-pin-btn-text';
      container.appendChild(statusEl);
      container.appendChild(btnTextEl);

      updatePinStatusDisplay();

      expect(statusEl.textContent).toBe('pinNotSet');
      expect(btnTextEl.textContent).toBe('setPin');
    });

    it('should handle missing elements', () => {
      expect(() => updatePinStatusDisplay()).not.toThrow();
    });
  });

  describe('verifyPinForRaceJoin', () => {
    it('should resolve true immediately when already authenticated', async () => {
      mockHasAuthToken.mockReturnValue(true);
      const result = await verifyPinForRaceJoin('en');
      expect(result).toBe(true);
      expect(openModal).not.toHaveBeenCalled();
    });

    it('should open modal and set up verification when not authenticated', () => {
      mockHasAuthToken.mockReturnValue(false);

      const modal = document.createElement('div');
      modal.id = 'admin-pin-modal';
      const pinInput = document.createElement('input');
      pinInput.id = 'admin-pin-verify-input';
      const errorEl = document.createElement('div');
      errorEl.id = 'admin-pin-error';
      container.appendChild(modal);
      container.appendChild(pinInput);
      container.appendChild(errorEl);

      // Start verification (don't await - it waits for user input)
      const promise = verifyPinForRaceJoin('en');

      expect(openModal).toHaveBeenCalledWith(modal);
      expect(hasPendingPinVerification()).toBe(true);

      // Clean up
      cleanupPinVerification();
      return promise; // Will resolve with false from cleanup
    });

    it('should resolve false when modal not found', async () => {
      mockHasAuthToken.mockReturnValue(false);
      const result = await verifyPinForRaceJoin('en');
      expect(result).toBe(false);
    });
  });

  describe('verifyPinForChiefJudge', () => {
    it('should open modal for chief judge verification', () => {
      const modal = document.createElement('div');
      modal.id = 'admin-pin-modal';
      const pinInput = document.createElement('input');
      pinInput.id = 'admin-pin-verify-input';
      const errorEl = document.createElement('div');
      errorEl.id = 'admin-pin-error';
      const titleEl = document.createElement('div');
      titleEl.id = 'admin-pin-modal-title';
      const textEl = document.createElement('div');
      textEl.id = 'admin-pin-modal-text';
      container.appendChild(modal);
      container.appendChild(pinInput);
      container.appendChild(errorEl);
      container.appendChild(titleEl);
      container.appendChild(textEl);

      const promise = verifyPinForChiefJudge('en');

      expect(openModal).toHaveBeenCalledWith(modal);
      expect(titleEl.textContent).toBe('enterChiefJudgePin');

      // Clean up
      cleanupPinVerification();
      return promise;
    });

    it('should resolve false when modal not found', async () => {
      const result = await verifyPinForChiefJudge('en');
      expect(result).toBe(false);
    });
  });

  describe('handleRaceJoinPinVerify', () => {
    it('should return early when no pending verification', async () => {
      await handleRaceJoinPinVerify();
      // Should not throw
    });

    it('should verify PIN and close modal on success', async () => {
      mockHasAuthToken.mockReturnValue(false);
      mockExchangePinForToken.mockResolvedValue({ success: true });

      const modal = document.createElement('div');
      modal.id = 'admin-pin-modal';
      const pinInput = document.createElement('input');
      pinInput.id = 'admin-pin-verify-input';
      pinInput.value = '1234';
      const errorEl = document.createElement('div');
      errorEl.id = 'admin-pin-error';
      container.appendChild(modal);
      container.appendChild(pinInput);
      container.appendChild(errorEl);

      let resolvedValue: boolean | undefined;
      const promise = verifyPinForRaceJoin('en').then((v) => {
        resolvedValue = v;
      });

      await handleRaceJoinPinVerify();
      await promise;

      expect(resolvedValue).toBe(true);
      expect(closeModal).toHaveBeenCalledWith(modal);
    });

    it('should show error on PIN failure', async () => {
      mockHasAuthToken.mockReturnValue(false);
      mockExchangePinForToken.mockResolvedValue({ success: false });

      const modal = document.createElement('div');
      modal.id = 'admin-pin-modal';
      const pinInput = document.createElement('input');
      pinInput.id = 'admin-pin-verify-input';
      pinInput.value = '0000';
      const errorEl = document.createElement('div');
      errorEl.id = 'admin-pin-error';
      errorEl.style.display = 'none';
      container.appendChild(modal);
      container.appendChild(pinInput);
      container.appendChild(errorEl);

      const promise = verifyPinForRaceJoin('en');

      await handleRaceJoinPinVerify();

      expect(errorEl.style.display).toBe('block');
      expect(hasPendingPinVerification()).toBe(true);

      // Clean up
      cleanupPinVerification();
      await promise;
    });
  });

  describe('cancelRaceJoinPinVerify', () => {
    it('should close modal and resolve false', async () => {
      mockHasAuthToken.mockReturnValue(false);

      const modal = document.createElement('div');
      modal.id = 'admin-pin-modal';
      const pinInput = document.createElement('input');
      pinInput.id = 'admin-pin-verify-input';
      container.appendChild(modal);
      container.appendChild(pinInput);

      let resolvedValue: boolean | undefined;
      const promise = verifyPinForRaceJoin('en').then((v) => {
        resolvedValue = v;
      });

      cancelRaceJoinPinVerify();
      await promise;

      expect(resolvedValue).toBe(false);
      expect(closeModal).toHaveBeenCalled();
    });

    it('should handle no pending verification', () => {
      expect(() => cancelRaceJoinPinVerify()).not.toThrow();
    });
  });

  describe('cleanupPinVerification', () => {
    it('should return false when no pending verification', () => {
      expect(cleanupPinVerification()).toBe(false);
    });

    it('should return true and resolve false when pending', async () => {
      mockHasAuthToken.mockReturnValue(false);

      const modal = document.createElement('div');
      modal.id = 'admin-pin-modal';
      const pinInput = document.createElement('input');
      pinInput.id = 'admin-pin-verify-input';
      container.appendChild(modal);
      container.appendChild(pinInput);

      const promise = verifyPinForRaceJoin('en');
      const result = cleanupPinVerification();

      expect(result).toBe(true);
      expect(await promise).toBe(false);
    });
  });

  describe('hasPendingPinVerification', () => {
    it('should return false initially', () => {
      expect(hasPendingPinVerification()).toBe(false);
    });
  });

  describe('initPinManagement', () => {
    it('should not throw', () => {
      expect(() => initPinManagement()).not.toThrow();
    });
  });
});
